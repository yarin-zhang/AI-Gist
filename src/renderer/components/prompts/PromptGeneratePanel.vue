<template>
  <div class="generate-panel">
    <div v-if="!generation.models.hasModels.value && generation.models.loaded.value" class="generate-panel__empty">
      <UiEmptyState :title="t('promptAI.noModelTitle')" :description="t('promptGenerate.noModelDescription')">
        <template #icon><NIcon :size="18"><Stars /></NIcon></template>
        <template #actions>
          <NButton type="primary" @click="emit('connect-model')">{{ t('promptAI.connectModel') }}</NButton>
        </template>
      </UiEmptyState>
    </div>

    <template v-else>
      <NScrollbar class="generate-panel__scroll">
        <div class="generate-panel__body">
          <p v-if="!hasRequest" class="generate-panel__intro">{{ t('promptGenerate.intro') }}</p>
          <div v-if="hasRequest" class="generate-bubble">{{ generation.request.value }}</div>
          <div v-if="hasRequest" class="generate-status" :class="statusTone && `generate-status--${statusTone}`"
            :role="status === 'error' || status === 'interrupted' ? 'alert' : 'status'">
            <template v-if="status === 'generating'">
              <span class="generate-status__line">
                <NSpin :size="14" />
                <span>{{ variableNames.length ? t('promptGenerate.writingWithVariables', { names: quotedNames }) : t('promptGenerate.writing') }}</span>
              </span>
              <div class="generate-status__actions">
                <NButton size="tiny" type="error" secondary @click="generation.stop()">{{ t('promptAI.stop') }}</NButton>
              </div>
            </template>
            <span v-else-if="status === 'success'" class="generate-status__line">
              {{ t('promptGenerate.done', { count: variableNames.length }, variableNames.length) }}
            </span>
            <!-- 失败、停止、中途断开：说明正文现在是什么状态，给撤回和重试 -->
            <template v-else>
              <span class="generate-status__line">
                <NIcon :size="16" class="generate-status__icon"><AlertCircle v-if="statusTone === 'error'" /><AlertTriangle v-else /></NIcon>
                <span>{{ statusText }}</span>
              </span>
              <span v-if="generation.errorMessage.value" class="generate-status__reason">{{ generation.errorMessage.value }}</span>
              <div class="generate-status__actions">
                <NButton v-if="revertable" size="tiny" quaternary @click="emit('revert')">
                  {{ t('promptGenerate.revert') }}
                </NButton>
                <NButton size="tiny" @click="retry">{{ t('promptGenerate.retry') }}</NButton>
              </div>
            </template>
          </div>

          <div v-if="generation.history.value.length" class="generate-history">
            <span class="ui-overline">{{ t('promptGenerate.history') }}</span>
            <button v-for="item in generation.history.value" :key="item.id ?? item.historyId" type="button"
              class="generate-history__item" @click="emit('use-history', item)">
              <span class="generate-history__title">{{ item.topic }}</span>
              <span class="generate-history__meta" :class="{ 'is-error': item.status === 'error' }">
                {{ historyMeta(item) }}
              </span>
            </button>
          </div>
        </div>
      </NScrollbar>

      <div class="generate-panel__composer">
        <div class="generate-panel__examples">
          <span class="generate-panel__try">{{ t('promptGenerate.tryLabel') }}</span>
          <NButton v-for="example in examples" :key="example.label" size="tiny" round @click="description = example.text">
            {{ example.label }}
          </NButton>
        </div>
        <div class="ai-input">
          <textarea v-model="description" class="ai-input__field" rows="2"
            :aria-label="t('promptGenerate.descriptionLabel')" :placeholder="t('promptGenerate.descriptionPlaceholder')"
            @keydown.enter="submitOnEnter" />
          <NButton type="primary" size="small" class="ai-input__send" :aria-label="t('promptGenerate.generate')"
            :disabled="!description.trim() || generation.generating.value" @click="submit">
            <template #icon><NIcon :size="14"><Send /></NIcon></template>
          </NButton>
        </div>
        <NCheckbox :checked="generation.autoSave.value" size="small" @update:checked="generation.setAutoSave">
          {{ t('promptGenerate.autoSave') }}
        </NCheckbox>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { NButton, NCheckbox, NIcon, NScrollbar, NSpin } from 'naive-ui'
import { AlertCircle, AlertTriangle, Send, Stars } from '@vicons/tabler'
import type { AIGenerationHistory } from '@shared/types/ai'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import { formatFriendlyDate } from '@/lib/utils/date'
import type { usePromptGeneration } from '@/composables/prompt/usePromptGeneration'
import { isImeComposing } from '@/lib/utils/ime'

const props = withDefaults(defineProps<{
  generation: ReturnType<typeof usePromptGeneration>
  /** 正文里已识别出的变量 */
  variableNames?: string[]
  /** 外部带进来的描述（空库引导页里输入的） */
  initialDescription?: string
  /** 正文里留着停止或中断后没写完的内容，可以撤回 */
  revertable?: boolean
}>(), {
  variableNames: () => [],
  initialDescription: '',
  revertable: false,
})

const emit = defineEmits<{
  generate: [description: string]
  'use-history': [item: AIGenerationHistory]
  'connect-model': []
  /** 撤回停止或中断后留在正文里的部分内容 */
  revert: []
}>()

const { t, locale } = useI18n()
const description = ref(props.initialDescription)

// 生成状态放在 usePromptGeneration 里，切换页签回来还在；只有真正成功才显示「已生成」
const status = computed(() => props.generation.status.value)
const hasRequest = computed(() => status.value !== 'idle' && Boolean(props.generation.request.value))
const statusTone = computed(() => {
  if (status.value === 'error') return 'error'
  if (status.value === 'stopped' || status.value === 'interrupted') return 'warning'
  return ''
})
const statusText = computed(() => {
  if (status.value === 'error') return t('promptGenerate.failedStatus')
  if (status.value === 'interrupted') return t('promptGenerate.interrupted')
  return props.generation.partial.value ? t('promptGenerate.stoppedPartial') : t('promptGenerate.stopped')
})

const retry = () => {
  const text = props.generation.request.value
  if (text && !props.generation.generating.value) emit('generate', text)
}

const examples = computed(() => [
  { label: t('promptGenerate.exampleReviewLabel'), text: t('promptGenerate.exampleReviewText') },
  { label: t('promptGenerate.exampleRequirementLabel'), text: t('promptGenerate.exampleRequirementText') },
  { label: t('promptGenerate.exampleInterviewLabel'), text: t('promptGenerate.exampleInterviewText') },
])

const quotedNames = computed(() => props.variableNames.map(name => `「${name}」`).join(''))

const historyMeta = (item: AIGenerationHistory) => {
  const status = item.status === 'error' ? t('promptGenerate.failed') : t('promptGenerate.succeeded')
  return `${status} · ${formatFriendlyDate(item.createdAt, locale.value, { withTime: true })}`
}

const submit = () => {
  const text = description.value.trim()
  if (!text || props.generation.generating.value) return
  description.value = ''
  emit('generate', text)
}

// 回车（含 ⌘↵ / Ctrl+↵）生成，Shift+回车换行；输入法确认候选词的那次回车不算
const submitOnEnter = (event: KeyboardEvent) => {
  if (isImeComposing(event) || event.shiftKey || event.altKey) return
  event.preventDefault()
  submit()
}

watch(() => props.initialDescription, value => {
  if (value) description.value = value
})

onMounted(() => {
  void props.generation.loadHistory()
})

defineExpose({ submit, setDescription: (value: string) => { description.value = value } })
</script>

<style scoped>
.generate-panel {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

.generate-panel__empty {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.generate-panel__scroll {
  flex: 1;
  min-height: 0;
}

.generate-panel__body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
}

.generate-panel__intro {
  margin: 0;
  color: var(--content-tertiary);
  font-size: var(--font-size-sm);
}

.generate-bubble {
  align-self: flex-end;
  max-width: 90%;
  padding: 6px 12px;
  border-radius: var(--radius-panel);
  background: var(--accent-soft);
  font-size: var(--font-size-base);
  white-space: pre-wrap;
}

.generate-status {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-panel);
  background: var(--surface-primary);
  font-size: var(--font-size-base);
}

.generate-status:empty {
  display: none;
}

.generate-status__line {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.generate-status__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

/* 失败、停止、中断时按提示条的状态色显示 */
.generate-status--error {
  border-color: var(--accent-error-border);
  background: var(--accent-error-bg);
}

.generate-status--warning {
  border-color: var(--accent-warning-border);
  background: var(--accent-warning-bg);
}

.generate-status--error .generate-status__line,
.generate-status--warning .generate-status__line {
  align-items: flex-start;
}

.generate-status__icon {
  flex: none;
  margin-top: 2px;
}

.generate-status--error .generate-status__icon {
  color: var(--accent-error);
}

.generate-status--warning .generate-status__icon {
  color: var(--accent-warning);
}

.generate-status__reason {
  color: var(--content-secondary);
  font-size: var(--font-size-xs);
  overflow-wrap: anywhere;
}

.generate-history {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 8px;
}

.generate-history__item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  padding: 8px 10px;
  border: 0;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--content-primary);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.generate-history__item:hover {
  background: var(--surface-tertiary);
}

.generate-history__title {
  overflow: hidden;
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.generate-history__meta {
  color: var(--content-tertiary);
  font-size: var(--font-size-xs);
}

.generate-history__meta.is-error {
  color: var(--accent-error);
}

.generate-panel__composer {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 16px 16px;
  border-top: 1px solid var(--border-default);
}

.generate-panel__examples {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.generate-panel__try {
  color: var(--content-tertiary);
  font-size: var(--font-size-xs);
}

.ai-input {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 8px 8px 8px 12px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-panel);
  background: var(--surface-primary);
}

.ai-input:focus-within {
  border-color: var(--accent-brand);
  box-shadow: var(--focus-ring);
}

.ai-input__field {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: none;
  resize: none;
  background: transparent;
  color: var(--content-primary);
  font: inherit;
  font-size: var(--font-size-base);
  line-height: 1.5;
}

.ai-input__field::placeholder {
  color: var(--content-muted);
}

.ai-input__send {
  width: 28px;
  padding: 0;
}
</style>
