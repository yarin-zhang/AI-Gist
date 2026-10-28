<template>
  <div class="ai-panel">
    <div v-if="!session.models.hasModels.value && session.models.loaded.value" class="ai-panel__empty">
      <UiEmptyState :title="t('promptAI.noModelTitle')" :description="t('promptAI.noModelDescription')">
        <template #icon><NIcon :size="18"><Stars /></NIcon></template>
        <template #actions>
          <NButton type="primary" @click="emit('connect-model')">{{ t('promptAI.connectModel') }}</NButton>
        </template>
      </UiEmptyState>
    </div>

    <template v-else>
      <NScrollbar ref="scrollRef" class="ai-panel__scroll">
        <div class="ai-panel__messages">
          <p v-if="!session.messages.value.length" class="ai-panel__intro">{{ t('promptAI.intro') }}</p>
          <template v-for="item in session.messages.value" :key="item.id">
            <div v-if="item.role === 'user'" class="ai-bubble">{{ item.text }}</div>
            <div v-else class="ai-card" :class="[`ai-card--${item.kind}`, item.outcome && `ai-card--${outcomeTone(item)}`]">
              <span v-if="item.streaming && !item.text" class="ai-card__progress"><NSpin :size="14" />{{ t('promptAI.thinking') }}</span>
              <div v-else-if="item.text" class="ai-card__text">{{ item.text }}</div>
              <!-- 停止或出错：回答没有跑完，说清楚，给重试 -->
              <div v-if="item.outcome" class="ai-card__status" :role="item.outcome === 'failed' ? 'alert' : 'status'">
                <span class="ai-card__status-line">
                  <NIcon :size="16" class="ai-card__status-icon">
                    <AlertCircle v-if="outcomeTone(item) === 'error'" /><AlertTriangle v-else />
                  </NIcon>
                  <span>{{ outcomeText(item) }}</span>
                </span>
                <AIErrorNotice v-if="item.error" plain :error="item.error" class="ai-card__reason" />
              </div>
              <!-- 改写建议、生成标题失败：按原因说明，最新的一条给重试 -->
              <template v-if="item.kind === 'error'">
                <AIErrorNotice v-if="item.error" plain :error="item.error" class="ai-card__reason" />
                <div v-if="item.retry && item.id === lastMessageId" class="ai-card__actions">
                  <NButton size="tiny" :disabled="busy || !canEdit" @click="retryFailed(item)">{{ t('promptAI.retry') }}</NButton>
                </div>
              </template>
              <div v-if="item.kind === 'run' && !item.streaming && (item.text || item.outcome)" class="ai-card__foot">
                <span class="ai-card__meta">{{ item.text ? answerMeta(item) : '' }}</span>
                <div class="ai-card__actions">
                  <NButton v-if="item.text" quaternary size="tiny" @click="copyAnswer(item)">
                    {{ item.outcome ? t('promptAI.copyPartialAnswer') : t('promptAI.copyAnswer') }}
                  </NButton>
                  <NButton v-if="item.outcome" size="tiny" :disabled="busy || !canEdit" @click="emit('run')">
                    {{ t('promptAI.retry') }}
                  </NButton>
                </div>
              </div>
            </div>
          </template>
        </div>
      </NScrollbar>

      <div class="ai-panel__composer">
        <div class="ai-panel__chips">
          <!-- 和底部栏的「试运行」一样：必填变量没填完时照样能点，点了跳到第一个没填的变量，悬停说明原因 -->
          <NTooltip :show-arrow="false" :disabled="busy || canRun || !canEdit || !runHint">
            <template #trigger>
              <NButton size="tiny" round :disabled="busy || !canEdit" @click="emit('run')">
                <template #icon><NIcon :size="12"><PlayerPlay /></NIcon></template>
                {{ t('promptAI.run') }}
              </NButton>
            </template>
            {{ runHint }}
          </NTooltip>
          <template v-for="config in quickConfigs" :key="config.id">
            <NTooltip v-if="config.description?.trim()" :show-arrow="false">
              <template #trigger>
                <NButton size="tiny" round :disabled="busy || !canEdit" @click="session.optimize(config)">
                  {{ config.name }}
                </NButton>
              </template>
              {{ config.description }}
            </NTooltip>
            <NButton v-else size="tiny" round :disabled="busy || !canEdit" @click="session.optimize(config)">
              {{ config.name }}
            </NButton>
          </template>
          <NButton size="tiny" round :disabled="busy || !canEdit" @click="emit('summarize')">
            {{ t('promptAI.summarize') }}
          </NButton>
          <NTooltip :show-arrow="false">
            <template #trigger>
              <NButton quaternary size="tiny" class="ai-panel__manage" :aria-label="t('promptAI.manageOptimizations')"
                @click="emit('open-optimization-config')">
                <template #icon><NIcon :size="14"><Settings /></NIcon></template>
              </NButton>
            </template>
            {{ t('promptAI.manageOptimizations') }}
          </NTooltip>
        </div>
        <div class="ai-input" :class="{ 'is-disabled': !canEdit }">
          <textarea v-model="instruction" class="ai-input__field" rows="2" :disabled="!canEdit"
            :aria-label="t('promptAI.instructionLabel')" :placeholder="t('promptAI.instructionPlaceholder')"
            @keydown.enter="sendOnEnter" />
          <NButton v-if="busy" type="error" size="small" class="ai-input__send" :aria-label="t('promptAI.stop')"
            @click="session.stop()">
            <template #icon><NIcon :size="14"><PlayerStop /></NIcon></template>
          </NButton>
          <NButton v-else type="primary" size="small" class="ai-input__send" :aria-label="t('promptAI.send')"
            :disabled="!instruction.trim() || !canEdit" @click="send">
            <template #icon><NIcon :size="14"><Send /></NIcon></template>
          </NButton>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { NButton, NIcon, NScrollbar, NSpin, NTooltip, useMessage } from 'naive-ui'
import { AlertCircle, AlertTriangle, PlayerPlay, PlayerStop, Send, Settings, Stars } from '@vicons/tabler'
import type { QuickOptimizationConfig } from '@shared/types/ai'
import AIErrorNotice from '@/components/ai/AIErrorNotice.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import type { AISessionMessage, PromptAISession } from '@/composables/prompt/usePromptAISession'
import { isImeComposing } from '@/lib/utils/ime'

const props = withDefaults(defineProps<{
  session: PromptAISession
  quickConfigs: QuickOptimizationConfig[]
  /** 必填变量都填好了才能试运行 */
  canRun?: boolean
  /** 不能直接试运行时的原因（还有必填变量没填等），悬停「试运行」时显示 */
  runHint?: string
  /** 正文为空时不能改写 */
  canEdit?: boolean
  summarizing?: boolean
}>(), {
  canRun: true,
  runHint: '',
  canEdit: true,
  summarizing: false,
})

const emit = defineEmits<{
  run: []
  summarize: []
  'open-optimization-config': []
  'connect-model': []
}>()

const { t } = useI18n()
const message = useMessage()
const instruction = ref('')
const scrollRef = ref<InstanceType<typeof NScrollbar>>()

const busy = computed(() => props.session.running.value || props.summarizing)
const lastMessageId = computed(() => props.session.messages.value.at(-1)?.id)

const retryFailed = (item: AISessionMessage) => {
  if (item.retry === 'summarize') emit('summarize')
  else void props.session.regenerate()
}

const answerMeta = (item: AISessionMessage) => {
  const seconds = ((item.meta?.durationMs || 0) / 1000).toFixed(1)
  return t('promptAI.answerMeta', { seconds, count: item.text.length }, item.text.length)
}

// 一个字都没收到就出错按失败显示；收到一部分（停止或中途出错）按「没完成」的警告显示
const outcomeTone = (item: AISessionMessage) => (item.outcome === 'failed' && !item.text ? 'error' : 'warning')

const outcomeText = (item: AISessionMessage) => {
  if (item.outcome === 'stopped') return item.text ? t('promptAI.stoppedPartial') : t('promptAI.stoppedEmpty')
  return item.text ? t('promptAI.interruptedPartial') : t('promptAI.runFailed')
}

const send = async () => {
  const text = instruction.value.trim()
  if (!text || busy.value || !props.canEdit) return
  instruction.value = ''
  await props.session.adjust(text)
}

// 回车（含 ⌘↵ / Ctrl+↵）发送，Shift+回车换行；输入法确认候选词的那次回车不发送
const sendOnEnter = (event: KeyboardEvent) => {
  if (isImeComposing(event) || event.shiftKey || event.altKey) return
  event.preventDefault()
  void send()
}

const copyAnswer = async (item: AISessionMessage) => {
  try {
    await navigator.clipboard.writeText(item.text)
    message.success(item.outcome ? t('promptAI.partialAnswerCopied') : t('promptAI.answerCopied'))
  } catch {
    message.error(t('promptManagement.detailModal.copyFailed'))
  }
}

// 新消息或流式内容增长时滚到底部
watch(() => props.session.messages.value.map(item => item.text.length).join(','), async () => {
  await nextTick()
  scrollRef.value?.scrollTo({ top: 1e9, behavior: 'smooth' })
})
</script>

<style scoped>
.ai-panel {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

.ai-panel__empty {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.ai-panel__scroll {
  flex: 1;
  min-height: 0;
}

.ai-panel__messages {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
}

.ai-panel__intro {
  margin: 0;
  color: var(--content-tertiary);
  font-size: var(--font-size-sm);
}

.ai-bubble {
  align-self: flex-end;
  max-width: 85%;
  padding: 6px 12px;
  border-radius: var(--radius-panel);
  background: var(--accent-soft);
  color: var(--content-primary);
  font-size: var(--font-size-base);
  white-space: pre-wrap;
}

.ai-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-panel);
  background: var(--surface-primary);
  font-size: var(--font-size-base);
  line-height: 1.6;
}

.ai-card--error {
  border-color: var(--accent-error-border);
  background: var(--accent-error-bg);
}

.ai-card--warning {
  border-color: var(--accent-warning-border);
}

.ai-card__text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  user-select: text;
}

.ai-card__progress {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--content-secondary);
}

.ai-card__foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 4px 8px;
  padding-top: 6px;
  border-top: 1px solid var(--border-subtle);
  color: var(--content-tertiary);
  font-size: var(--font-size-xs);
}

.ai-card__meta {
  white-space: nowrap;
}

/* 放不下时整组按钮换到下一行靠右，耗时和字数保持一行 */
.ai-card__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 4px;
  margin-left: auto;
}

/* 停止、中途出错：在回答末尾标出没有跑完 */
.ai-card__status {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ai-card--warning .ai-card__status {
  padding: 6px 8px;
  border: 1px solid var(--accent-warning-border);
  border-radius: var(--radius-control);
  background: var(--accent-warning-bg);
}

.ai-card__status-line {
  display: inline-flex;
  align-items: flex-start;
  gap: 6px;
  font-size: var(--font-size-sm);
}

.ai-card__status-icon {
  flex: none;
  margin-top: 2px;
}

.ai-card--warning .ai-card__status-icon {
  color: var(--accent-warning);
}

.ai-card--error .ai-card__status-icon {
  color: var(--accent-error);
}

.ai-card__reason {
  color: var(--content-secondary);
  font-size: var(--font-size-xs);
  overflow-wrap: anywhere;
  user-select: text;
}

.ai-panel__composer {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 16px 16px;
  border-top: 1px solid var(--border-default);
}

.ai-panel__chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.ai-panel__manage {
  width: 22px;
  padding: 0;
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

.ai-input.is-disabled {
  background: var(--surface-secondary);
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
