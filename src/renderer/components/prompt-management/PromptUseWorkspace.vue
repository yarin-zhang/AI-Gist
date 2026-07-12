<template>
  <div class="use-workspace">
    <PromptFillCanvas ref="fillCanvasRef" :prompt="prompt" :values="draft"
      @update:values="$emit('update:draft', $event)">
      <template v-if="imageUrls.length" #footer>
        <div class="prompt-attachments">
          <NText depth="3" class="attachments-label">{{ t('promptManagement.images') }}</NText>
          <div class="attachment-list">
            <NImage v-for="(url, index) in imageUrls" :key="url" :src="url"
              width="56" height="56" object-fit="cover" :alt="`${prompt.title} ${index + 1}`" />
          </div>
        </div>
      </template>
    </PromptFillCanvas>

    <footer class="use-action-bar">
      <NFlex size="small">
        <NButton size="small" quaternary @click="clearValues">
          {{ t('promptManagement.detailModal.clear') }}
        </NButton>
        <NButton size="small" quaternary @click="openHistory">
          <template #icon><NIcon size="16"><History /></NIcon></template>
          {{ t('promptWorkspace.useHistory') }}
        </NButton>
      </NFlex>
      <NFlex size="small">
        <NButton secondary size="small" @click="openAIRun">
          <template #icon><NIcon size="16"><Robot /></NIcon></template>
          {{ t('promptWorkspace.runWithAI') }}
        </NButton>
        <NButton type="primary" size="small" @click="copyPrompt">
          <template #icon><NIcon size="16"><Copy /></NIcon></template>
          {{ t('promptWorkspace.copyPrompt') }}
        </NButton>
      </NFlex>
    </footer>

    <NDrawer v-model:show="showAIRun" :width="460" placement="right">
      <NDrawerContent :title="t('promptWorkspace.runWithAI')" closable>
        <NFlex vertical size="large">
          <NText depth="3">{{ t('promptWorkspace.runWithAIHint') }}</NText>
          <AIModelSelector ref="modelSelectorRef" v-model:modelKey="selectedModelKey"
            :placeholder="t('promptManagement.detailModal.selectAIModel')" :disabled="running" />
          <NFlex justify="end" size="small">
            <NButton v-if="running" type="error" secondary @click="stopRun">
              {{ t('promptManagement.detailModal.stop') }}
            </NButton>
            <NButton type="primary" :loading="running" :disabled="!selectedModelKey" @click="runWithAI">
              {{ running ? t('promptWorkspace.running') : t('promptWorkspace.run') }}
            </NButton>
          </NFlex>
          <NAlert v-if="runError" type="error">{{ runError }}</NAlert>
          <div v-if="runResult" class="ai-result ui-surface-muted">
            <div class="ai-result-heading">
              <NText strong>{{ t('promptWorkspace.aiResponse') }}</NText>
              <NButton quaternary size="tiny" @click="copyText(runResult)">
                <template #icon><NIcon size="14"><Copy /></NIcon></template>
                {{ t('common.copy') }}
              </NButton>
            </div>
            <pre>{{ runResult }}</pre>
          </div>
        </NFlex>
      </NDrawerContent>
    </NDrawer>

    <NDrawer :key="`history-${prompt.id || prompt.uuid}`" v-model:show="showHistory" :width="380" placement="right">
      <NDrawerContent :title="`${prompt.title} · ${t('promptWorkspace.useHistory')}`" closable>
        <NEmpty v-if="useHistory.length === 0" :description="t('promptWorkspace.noUseHistory')" />
        <div v-else class="history-list">
          <div v-for="(record, index) in useHistory" :key="`${record.date}-${index}`" class="history-item ui-surface-muted">
            <div class="history-item-heading">
              <NText depth="3">{{ formatDate(record.date) }}</NText>
              <NButton text size="small" @click="restoreHistory(record)">
                {{ t('promptWorkspace.restoreValues') }}
              </NButton>
            </div>
            <div v-if="Object.keys(record.variables || {}).length" class="history-values">
              <NTag v-for="(value, key) in record.variables" :key="key" size="small">
                {{ key }}: {{ value }}
              </NTag>
            </div>
            <p>{{ record.content }}</p>
          </div>
        </div>
      </NDrawerContent>
    </NDrawer>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NAlert, NButton, NDrawer, NDrawerContent, NEmpty, NFlex, NIcon, NImage, NTag, NText,
  useMessage,
} from 'naive-ui'
import { Copy, History, Robot } from '@vicons/tabler'
import type { PromptWithRelations } from '@shared/types/database'
import AIModelSelector from '@/components/common/AIModelSelector.vue'
import { api } from '@/lib/api'
import {
  createWorkspaceDraft, deriveWorkspaceVariables, getMissingRequiredVariables, renderWorkspacePrompt,
} from '@/lib/utils/prompt-workspace'
import { readPromptUsageHistory, recordPromptUsage, type PromptUsageRecord } from '@/lib/utils/prompt-usage'
import PromptFillCanvas from './PromptFillCanvas.vue'

const props = defineProps<{
  prompt: PromptWithRelations
  draft: Record<string, any>
}>()

const emit = defineEmits<{
  'update:draft': [value: Record<string, any>]
  updated: [prompt?: PromptWithRelations]
}>()

const { t } = useI18n()
const message = useMessage()
const fillCanvasRef = ref<InstanceType<typeof PromptFillCanvas>>()
const showHistory = ref(false)
const showAIRun = ref(false)
const useHistory = ref<PromptUsageRecord[]>([])
const selectedModelKey = ref('')
const modelSelectorRef = ref<any>()
const running = ref(false)
const runResult = ref('')
const runError = ref('')
const shouldStop = ref(false)
const imageUrls = ref<string[]>([])
const historyPromptId = ref<number | null>(null)

const variables = computed(() => deriveWorkspaceVariables(props.prompt))
const missingVariables = computed(() => getMissingRequiredVariables(variables.value, props.draft))
const rendered = computed(() => renderWorkspacePrompt(props.prompt, props.draft, variables.value))
const canUse = computed(() => Boolean(rendered.value.content.trim()) && !missingVariables.value.length && !rendered.value.error)

const initializeDraft = () => emit('update:draft', createWorkspaceDraft(variables.value, props.draft))
const loadHistory = () => {
  const promptId = props.prompt.id || null
  historyPromptId.value = promptId
  useHistory.value = promptId ? readPromptUsageHistory(promptId) : []
}
const updateImageUrls = () => {
  imageUrls.value.forEach(URL.revokeObjectURL)
  imageUrls.value = (props.prompt.imageBlobs || []).map(blob => URL.createObjectURL(blob))
}

watch(() => `${props.prompt.id || ''}:${props.prompt.uuid}`, () => {
  showHistory.value = false
  historyPromptId.value = null
  useHistory.value = []
  showAIRun.value = false
  runResult.value = ''
  runError.value = ''
  initializeDraft()
  loadHistory()
  updateImageUrls()
}, { immediate: true })

const openHistory = () => {
  if (historyPromptId.value !== (props.prompt.id || null)) loadHistory()
  else useHistory.value = props.prompt.id ? readPromptUsageHistory(props.prompt.id) : []
  showHistory.value = true
}

const clearValues = () => {
  emit('update:draft', createWorkspaceDraft(variables.value, {}))
  fillCanvasRef.value?.resetValidation()
}

const restoreHistory = (record: PromptUsageRecord) => {
  emit('update:draft', createWorkspaceDraft(variables.value, { ...record.variables }))
  showHistory.value = false
  fillCanvasRef.value?.resetValidation()
  message.success(t('promptWorkspace.valuesRestored'))
}

const validateUse = async () => {
  const valid = await fillCanvasRef.value?.validateAndFocus()
  return valid !== false && canUse.value
}

const copyText = async (text: string) => {
  await navigator.clipboard.writeText(text)
  message.success(t('promptManagement.detailModal.copySuccess'))
}

const copyPrompt = async () => {
  if (!await validateUse() || !props.prompt.id) return
  try {
    await navigator.clipboard.writeText(rendered.value.content)
    const updatedPrompt = await recordPromptUsage({
      promptId: props.prompt.id,
      content: rendered.value.content,
      variables: { ...props.draft },
      incrementUseCount: id => api.prompts.incrementUseCount.mutate(id),
    })
    loadHistory()
    message.success(t('promptWorkspace.copiedAndRecorded'))
    emit('updated', updatedPrompt as PromptWithRelations)
  } catch (error) {
    console.error(error)
    message.error(t('promptManagement.detailModal.copyFailed'))
  }
}

const openAIRun = async () => {
  if (!await validateUse()) return
  showAIRun.value = true
}

const runWithAI = async () => {
  if (!await validateUse()) return
  const selectedConfig = modelSelectorRef.value?.selectedConfig
  const selectedModel = modelSelectorRef.value?.selectedModel
  if (!selectedConfig || !selectedModel) {
    message.warning(t('promptWorkspace.selectModelFirst'))
    return
  }

  running.value = true
  shouldStop.value = false
  runResult.value = ''
  runError.value = ''
  const config = serializeConfig(selectedConfig)
  const request = {
    configId: String(selectedConfig.configId || ''),
    topic: String(rendered.value.content),
    customPrompt: String(rendered.value.content),
    model: String(selectedModel),
  }

  try {
    let result: any
    if ((window as any).electronAPI?.ai?.generatePromptStream) {
      result = await (window as any).electronAPI.ai.generatePromptStream(
        request,
        config,
        (_charCount: number, partialContent?: string) => {
          if (shouldStop.value) return false
          if (partialContent) runResult.value = partialContent
          return true
        }
      )
    } else {
      result = await (window as any).electronAPI?.ai?.generatePrompt(request, config)
    }
    if (result?.generatedPrompt) runResult.value = result.generatedPrompt

    await api.aiGenerationHistory.create.mutate({
      historyId: `use_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      configId: selectedConfig.configId,
      topic: props.prompt.title,
      generatedPrompt: rendered.value.content,
      model: String(selectedModel),
      status: 'success',
      debugResult: runResult.value,
      debugStatus: 'success',
      customPrompt: rendered.value.content,
      uuid: `use_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    })
  } catch (error) {
    if (!shouldStop.value) runError.value = error instanceof Error ? error.message : String(error)
  } finally {
    running.value = false
  }
}

const stopRun = async () => {
  shouldStop.value = true
  try { await (window as any).electronAPI?.ai?.stopGeneration?.() } catch { /* no-op */ }
  running.value = false
}

const serializeConfig = (config: any) => ({
  ...config,
  models: Array.isArray(config.models) ? config.models.map(String) : [],
  createdAt: toISOString(config.createdAt),
  updatedAt: toISOString(config.updatedAt),
})
const toISOString = (value: any) => {
  const date = value ? new Date(value) : new Date()
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString()
}
const formatDate = (value: string) => new Date(value).toLocaleString()

const handleShortcut = (event: KeyboardEvent) => {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    event.preventDefault()
    copyPrompt()
  }
}

onMounted(() => window.addEventListener('keydown', handleShortcut))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleShortcut)
  imageUrls.value.forEach(URL.revokeObjectURL)
})
</script>

<style scoped>
.use-workspace { box-sizing: border-box; height: 100%; min-height: 0; display: flex; flex-direction: column; gap: 0; padding: 8px var(--content-padding) 0; background: var(--surface-primary); }
.use-workspace > :first-child { flex: 1; min-height: 0; }
.prompt-attachments { min-height: 36px; display: flex; align-items: center; gap: var(--compact-padding); }
.attachments-label { flex: 0 0 auto; font-size: 12px; }
.attachment-list { display: flex; gap: 8px; overflow-x: auto; }
.attachment-list :deep(.n-image) { overflow: hidden; border: 1px solid var(--border-default); border-radius: var(--radius-image); }
.use-action-bar { flex: 0 0 58px; height: 58px; margin: var(--content-padding) calc(-1 * var(--content-padding)) 0; padding: 0 14px; display: flex; align-items: center; justify-content: space-between; gap: var(--section-gap); border-top: 1px solid var(--border-default); background: var(--surface-secondary); }
.ai-result { padding: var(--content-padding); }
.ai-result-heading, .history-item-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.ai-result pre { margin: 12px 0 0; font: inherit; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 13px; line-height: var(--line-height-relaxed); white-space: pre-wrap; user-select: text; }
.history-list { display: flex; flex-direction: column; gap: var(--compact-padding); }
.history-item { padding: var(--compact-padding); }
.history-values { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 6px; }
.history-item p { margin: 10px 0 0; color: var(--content-secondary); font-size: 13px; line-height: var(--line-height-normal); white-space: pre-wrap; }
@media (max-width: 720px) {
  .use-action-bar { padding-inline: var(--compact-padding); }
}
</style>
