<!--
  使用页的「先试运行看看效果」：把填好的提示词原样发给选中的模型，流式显示回答。
  不改动提示词本身；每次运行与桌面端一样记一条 use_ 开头的生成记录。
-->
<template>
  <ion-modal class="m-sheet-modal" :is-open="open" :breakpoints="[0, 0.92]" :initial-breakpoint="0.92"
    :handle="false" :expand-to-scroll="false" @didPresent="handlePresent" @didDismiss="handleDismiss">
    <div class="m-sheet run-sheet" role="dialog" :aria-label="t('promptAI.run')">
      <div class="m-grab" aria-hidden="true" />
      <header class="run-sheet__head">
        <button type="button" class="m-btn run-sheet__side" @click="emit('close')">{{ t('common.close') }}</button>
        <h2 class="run-sheet__title">{{ t('promptAI.run') }}</h2>
        <button type="button" class="m-save" :disabled="!answer || running" @click="copyAnswer">
          {{ t('common.copy') }}
        </button>
      </header>

      <ion-content class="run-sheet__content">
        <div class="m-body run-sheet__body">
          <template v-if="!models.loading.value && !models.configs.value.length">
            <p class="m-desc">{{ t('promptAI.noModelDescription') }}</p>
            <button type="button" class="m-cta" @click="emit('connect')">
              <ion-icon :icon="addCircleOutline" aria-hidden="true" />
              {{ t('promptAI.connectModel') }}
            </button>
          </template>

          <template v-else>
            <div class="run-sheet__toolbar">
              <button type="button" class="m-chip run-sheet__model" :disabled="running" @click="showModels = true">
                <ion-icon :icon="sparklesOutline" aria-hidden="true" />
                <span class="run-sheet__model-name">{{ models.selectedLabel.value || t('aiGenerator.selectModel') }}</span>
                <ion-icon :icon="chevronDown" aria-hidden="true" />
              </button>
              <span v-if="meta" class="run-sheet__meta">{{ meta }}</span>
            </div>

            <div class="m-card run-sheet__answer" aria-live="polite">
              <p v-if="running && !answer" class="run-sheet__thinking">
                <ion-spinner name="dots" />
                {{ t('promptAI.thinking') }}
              </p>
              <MobileAIErrorNote v-else-if="error" :error="error" />
              <p v-else-if="stopped && !answer" class="run-sheet__thinking">{{ t('aiGenerator.stopped') }}</p>
              <div v-if="answer" class="run-sheet__text">{{ answer }}</div>
            </div>
            <p class="m-note">
              <ion-icon :icon="informationCircleOutline" aria-hidden="true" />
              <span>{{ t('promptWorkspace.runWithAIHint') }}</span>
            </p>
          </template>
        </div>
      </ion-content>

      <footer v-if="models.configs.value.length" class="run-sheet__foot">
        <button v-if="running" type="button" class="m-cta m-cta-2" @click="stop">
          <ion-icon :icon="stopCircleOutline" aria-hidden="true" />
          {{ t('promptAI.stop') }}
        </button>
        <button v-else type="button" class="m-cta" :disabled="!models.selected.value" @click="run">
          <ion-icon :icon="refreshOutline" aria-hidden="true" />
          {{ answer || error ? t('promptAI.regenerate') : t('promptAI.run') }}
        </button>
      </footer>
    </div>
  </ion-modal>

  <MobileModelSheet :open="showModels" :configs="models.configs.value" :selected-key="models.selectedKey.value"
    @select="selectModel" @close="showModels = false" />
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { IonContent, IonIcon, IonModal, IonSpinner } from '@ionic/vue'
import {
  addCircleOutline,
  chevronDown,
  informationCircleOutline,
  refreshOutline,
  sparklesOutline,
  stopCircleOutline
} from 'ionicons/icons'
import { useI18n } from '~/composables/useI18n'
import { api } from '~/lib/api'
import { presentMobileToast } from '~/lib/utils/mobile-toast'
import MobileModelSheet from './MobileModelSheet.vue'
import MobileAIErrorNote from './MobileAIErrorNote.vue'
import { describeMobileAIError, isAbortError, runMobileChat, type MobileAIErrorView } from './mobile-ai'
import { useMobileModels } from './useMobileModels'

const props = defineProps<{
  open: boolean
  /** 按当前填写值渲染好的提示词 */
  prompt: string
  /** 记录里显示的主题，一般是提示词标题 */
  topic: string
}>()

const emit = defineEmits<{ close: []; connect: [] }>()

const { t } = useI18n()
const models = useMobileModels()

const showModels = ref(false)
const answer = ref('')
const error = ref<MobileAIErrorView | null>(null)
const running = ref(false)
const stopped = ref(false)
const durationMs = ref(0)
let controller: AbortController | null = null

const meta = computed(() => {
  if (running.value || !answer.value || !durationMs.value) return ''
  return t('promptAI.answerMeta', { seconds: (durationMs.value / 1000).toFixed(1), count: answer.value.length })
})

const run = async () => {
  const selected = models.selected.value
  const prompt = props.prompt.trim()
  if (!selected || !prompt || running.value) return
  controller = new AbortController()
  running.value = true
  stopped.value = false
  error.value = null
  answer.value = ''
  durationMs.value = 0
  const started = Date.now()
  try {
    const result = await runMobileChat({
      config: selected.config,
      model: selected.model,
      messages: [{ role: 'user', content: prompt }],
      onPartial: text => { answer.value = text },
      signal: controller.signal,
    })
    answer.value = result || answer.value
    durationMs.value = Date.now() - started
    void api.aiGenerationHistory.create.mutate({
      historyId: `use_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      configId: selected.config.configId,
      topic: props.topic,
      generatedPrompt: prompt,
      model: selected.model,
      status: 'success',
      debugResult: answer.value,
      debugStatus: 'success',
      customPrompt: prompt,
      uuid: `use_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    } as never).catch(() => undefined)
  } catch (reason) {
    if (isAbortError(reason)) stopped.value = true
    else error.value = describeMobileAIError(reason, t)
  } finally {
    running.value = false
    controller = null
  }
}

const stop = () => {
  controller?.abort()
}

const selectModel = (key: string) => {
  models.select(key)
  showModels.value = false
}

const copyAnswer = async () => {
  try {
    await navigator.clipboard.writeText(answer.value)
    await presentMobileToast(t('promptAI.answerCopied'), 'success')
  } catch {
    await presentMobileToast(t('promptManagement.copyFailed'), 'danger')
  }
}

// 每次打开都按当前填写值重新跑一次
const handlePresent = async () => {
  try {
    await models.load()
  } catch {
    error.value = { kind: 'generic', summary: t('aiConfig.loadFailed'), detail: '' }
    return
  }
  if (models.selected.value) void run()
}

const handleDismiss = () => {
  stop()
  answer.value = ''
  error.value = null
  stopped.value = false
  emit('close')
}
</script>

<style scoped>
.run-sheet {
  height: 100%;
}

.run-sheet__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 12px 4px;
}

.run-sheet__side {
  min-width: 64px;
  color: var(--content-secondary);
}

.run-sheet__title {
  flex: 1;
  margin: 0;
  color: var(--content-primary);
  font-size: var(--m-font-body);
  font-weight: 600;
  text-align: center;
}

.run-sheet__content {
  --background: var(--surface-primary);
  flex: 1;
}

.run-sheet__body {
  gap: 14px;
  padding-top: 12px;
}

.run-sheet__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.run-sheet__model {
  min-width: 0;
  max-width: 70%;
  background: var(--surface-tertiary);
  box-shadow: none;
}

/* 胶囊变窄时只省略文字，图标保持原大小 */
.run-sheet__model ion-icon {
  flex: none;
}

.run-sheet__model-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.run-sheet__meta {
  color: var(--content-tertiary);
  font-size: var(--m-font-caption);
  white-space: nowrap;
}

/* 面板本身就是白底，回答卡片改用细描边区分 */
.run-sheet__answer {
  gap: 8px;
  min-height: 160px;
  padding: 16px 18px;
  box-shadow: inset 0 0 0 1px var(--border-default);
}

.run-sheet__thinking {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  color: var(--content-tertiary);
  font-size: var(--m-font-sub);
}

.run-sheet__text {
  color: var(--content-primary);
  font-size: var(--m-font-body);
  line-height: 1.7;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  user-select: text;
}

.run-sheet__foot {
  padding: 8px var(--m-gutter) calc(env(safe-area-inset-bottom, 0px) + 16px);
  background: var(--surface-primary);
}
</style>
