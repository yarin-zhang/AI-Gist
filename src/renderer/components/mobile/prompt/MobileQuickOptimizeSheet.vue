<!--
  编辑页「快速优化」的结果面板：把当前正文代入所选优化动作的模板，交给首选模型改写，
  流式显示改写结果，由用户决定采纳还是放弃；采纳前不会动正文。
-->
<template>
  <ion-modal class="m-sheet-modal" :is-open="open" :breakpoints="[0, 0.92]" :initial-breakpoint="0.92"
    :handle="false" :expand-to-scroll="false" @didPresent="run" @didDismiss="handleDismiss">
    <div class="m-sheet optimize-sheet" role="dialog" :aria-label="config?.name || t('promptAI.suggestion')">
      <div class="m-grab" aria-hidden="true" />
      <header class="optimize-sheet__head">
        <button type="button" class="m-btn optimize-sheet__side" @click="emit('close')">{{ t('promptAI.discard') }}</button>
        <h2 class="optimize-sheet__title">{{ config?.name || t('promptAI.suggestion') }}</h2>
        <button type="button" class="m-save" :disabled="running || !proposed.trim()" @click="adopt">
          {{ t('promptAI.adopt') }}
        </button>
      </header>

      <ion-content class="optimize-sheet__content">
        <div class="m-body optimize-sheet__body">
          <p class="optimize-sheet__meta">
            <ion-icon :icon="sparklesOutline" aria-hidden="true" />
            <span>{{ modelLabel }}</span>
          </p>
          <div class="m-card optimize-sheet__card" aria-live="polite">
            <p v-if="running && !proposed" class="optimize-sheet__status">
              <ion-spinner name="dots" />
              {{ t('promptAI.generatingSuggestion') }}
            </p>
            <MobileAIErrorNote v-else-if="error" :error="error" />
            <p v-else-if="stopped && !proposed" class="optimize-sheet__status">{{ t('promptManagement.optimizationStopped') }}</p>
            <MobilePromptBody v-if="proposed" :content="proposed" />
          </div>
          <p v-if="config?.description" class="m-note">
            <ion-icon :icon="informationCircleOutline" aria-hidden="true" />
            <span>{{ config.description }}</span>
          </p>
        </div>
      </ion-content>

      <footer class="optimize-sheet__foot">
        <button v-if="running" type="button" class="m-cta m-cta-2" @click="stop">
          <ion-icon :icon="stopCircleOutline" aria-hidden="true" />
          {{ t('promptAI.stop') }}
        </button>
        <button v-else type="button" class="m-cta m-cta-2" @click="run">
          <ion-icon :icon="refreshOutline" aria-hidden="true" />
          {{ t('promptAI.regenerate') }}
        </button>
      </footer>
    </div>
  </ion-modal>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { IonContent, IonIcon, IonModal, IonSpinner } from '@ionic/vue'
import { informationCircleOutline, refreshOutline, sparklesOutline, stopCircleOutline } from 'ionicons/icons'
import type { QuickOptimizationConfig } from '@shared/types/ai'
import { useI18n } from '~/composables/useI18n'
import MobilePromptBody from './MobilePromptBody.vue'
import MobileAIErrorNote from './MobileAIErrorNote.vue'
import { describeMobileAIError, isAbortError, runMobileChat, type MobileAIErrorView, type MobileModelOption } from './mobile-ai'

const props = defineProps<{
  open: boolean
  config: QuickOptimizationConfig | null
  /** 当前正文 */
  content: string
  model: MobileModelOption | null
}>()

const emit = defineEmits<{ close: []; adopt: [proposed: string, label: string] }>()

const { t } = useI18n()

const proposed = ref('')
const error = ref<MobileAIErrorView | null>(null)
const running = ref(false)
const stopped = ref(false)
let controller: AbortController | null = null

const modelLabel = computed(() => props.model?.model || t('aiGenerator.selectModel'))

const run = async () => {
  const config = props.config
  const model = props.model
  if (!config || !model || running.value) return
  controller = new AbortController()
  running.value = true
  stopped.value = false
  error.value = null
  proposed.value = ''
  try {
    // 与桌面端一致：模板里的 {{content}} 换成当前正文（用函数替换，正文里的 $ 不会被当成特殊符号）
    const result = await runMobileChat({
      config: model.config,
      model: model.model,
      messages: [{ role: 'user', content: config.prompt.replace('{{content}}', () => props.content) }],
      onPartial: text => { proposed.value = text },
      signal: controller.signal,
    })
    proposed.value = (result || proposed.value).trim()
    if (!proposed.value) error.value = { kind: 'generic', summary: t('promptAI.emptySuggestion'), detail: '' }
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

const adopt = () => {
  if (!props.config || !proposed.value.trim()) return
  emit('adopt', proposed.value.trim(), props.config.name)
}

const handleDismiss = () => {
  stop()
  proposed.value = ''
  error.value = null
  stopped.value = false
  emit('close')
}
</script>

<style scoped>
.optimize-sheet {
  height: 100%;
}

.optimize-sheet__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 12px 4px;
}

.optimize-sheet__side {
  min-width: 64px;
  color: var(--content-secondary);
}

.optimize-sheet__title {
  flex: 1;
  margin: 0;
  overflow: hidden;
  color: var(--content-primary);
  font-size: var(--m-font-body);
  font-weight: 600;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.optimize-sheet__content {
  --background: var(--surface-primary);
  flex: 1;
}

.optimize-sheet__body {
  gap: 12px;
  padding-top: 12px;
}

.optimize-sheet__meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  padding: 0 6px;
  color: var(--content-tertiary);
  font-size: var(--m-font-caption);
}

/* 面板本身就是白底，结果卡片改用细描边区分 */
.optimize-sheet__card {
  min-height: 160px;
  padding: 16px 18px;
  box-shadow: inset 0 0 0 1px var(--border-default);
}

.optimize-sheet__status {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  color: var(--content-tertiary);
  font-size: var(--m-font-sub);
}

.optimize-sheet__foot {
  padding: 8px var(--m-gutter) calc(env(safe-area-inset-bottom, 0px) + 16px);
  background: var(--surface-primary);
}
</style>
