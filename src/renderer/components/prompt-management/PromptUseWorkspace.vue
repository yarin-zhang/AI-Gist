<template>
    <div class="use-workspace">
        <div class="use-content" :class="{ 'without-variables': variables.length === 0 }">
            <section v-if="variables.length > 0" class="use-pane variable-pane">
                <div class="pane-heading">
                    <div>
                        <NText strong>{{ t('promptWorkspace.fillVariables') }}</NText>
                        <NText depth="3" class="pane-description">
                            {{ t('promptWorkspace.fillVariablesHint', { count: variables.length }) }}
                        </NText>
                    </div>
                    <NButton size="tiny" quaternary @click="clearValues">
                        {{ t('promptManagement.detailModal.clear') }}
                    </NButton>
                </div>

                <NScrollbar class="pane-scroll">
                    <NForm label-placement="top" class="variable-form">
                        <NFormItem v-for="variable in variables" :key="variable.name"
                            :label="variable.name" :required="variable.required"
                            :validation-status="missingVariables.includes(variable.name) ? 'error' : undefined"
                            :feedback="missingVariables.includes(variable.name) ? t('promptWorkspace.requiredValue') : undefined">
                            <NSelect v-if="variable.type === 'select'" :value="draft[variable.name]"
                                :options="getVariableOptions(variable)" clearable
                                :placeholder="variable.placeholder || t('promptWorkspace.enterValue', { name: variable.name })"
                                @update:value="updateValue(variable.name, $event)" />
                            <NInputNumber v-else-if="isNumberVariable(variable.type)"
                                :value="draft[variable.name]" clearable style="width: 100%"
                                :placeholder="variable.placeholder || t('promptWorkspace.enterValue', { name: variable.name })"
                                @update:value="updateValue(variable.name, $event)" />
                            <NSwitch v-else-if="isBooleanVariable(variable.type)"
                                :value="Boolean(draft[variable.name])"
                                @update:value="updateValue(variable.name, $event)" />
                            <NInput v-else :value="stringValue(draft[variable.name])" type="textarea"
                                :autosize="{ minRows: variable.type === 'textarea' ? 3 : 1, maxRows: 7 }"
                                :placeholder="variable.placeholder || t('promptWorkspace.enterValue', { name: variable.name })"
                                @update:value="updateValue(variable.name, $event)" />
                        </NFormItem>
                    </NForm>
                </NScrollbar>
            </section>

            <section class="use-pane preview-pane">
                <div class="pane-heading">
                    <div>
                        <NFlex align="center" size="small">
                            <NText strong>{{ t('promptWorkspace.finalPrompt') }}</NText>
                            <NTag v-if="prompt.isJinjaTemplate" size="small" type="info">Jinja</NTag>
                        </NFlex>
                        <NText depth="3" class="pane-description">{{ t('promptWorkspace.livePreview') }}</NText>
                    </div>
                    <NButton size="tiny" quaternary @click="showHistory = true">
                        <template #icon><NIcon size="16"><History /></NIcon></template>
                        {{ t('promptWorkspace.useHistory') }}
                    </NButton>
                </div>

                <div v-if="renderError" class="preview-alert">
                    <NAlert type="error" :title="t('promptWorkspace.renderFailed')">{{ renderError }}</NAlert>
                </div>

                <NScrollbar class="pane-scroll preview-scroll">
                    <pre class="prompt-preview">{{ filledContent }}</pre>

                    <div v-if="imageUrls.length" class="prompt-images">
                        <NImage v-for="(url, index) in imageUrls" :key="url" :src="url"
                            width="96" height="96" object-fit="cover" />
                    </div>

                    <div v-if="showAIRun" class="ai-run-panel">
                        <div class="ai-run-header">
                            <div>
                                <NText strong>{{ t('promptWorkspace.runWithAI') }}</NText>
                                <NText depth="3" class="pane-description">{{ t('promptWorkspace.runWithAIHint') }}</NText>
                            </div>
                            <NButton quaternary circle size="tiny" @click="showAIRun = false"><NIcon size="16"><X /></NIcon></NButton>
                        </div>
                        <AIModelSelector ref="modelSelectorRef" v-model:modelKey="selectedModelKey"
                            :placeholder="t('promptManagement.detailModal.selectAIModel')" :disabled="running" />
                        <NFlex justify="end" size="small" class="ai-run-actions">
                            <NButton v-if="running" type="error" secondary @click="stopRun">
                                {{ t('promptManagement.detailModal.stop') }}
                            </NButton>
                            <NButton type="primary" :loading="running" :disabled="!canUse || !selectedModelKey"
                                @click="runWithAI">
                                {{ running ? t('promptWorkspace.running') : t('promptWorkspace.run') }}
                            </NButton>
                        </NFlex>
                        <NAlert v-if="runError" type="error" class="ai-result">{{ runError }}</NAlert>
                        <div v-if="runResult" class="ai-result">
                            <div class="ai-result-heading">
                                <NText strong>{{ t('promptWorkspace.aiResponse') }}</NText>
                                <NButton quaternary size="tiny" @click="copyText(runResult)">
                                    <template #icon><NIcon size="14"><Copy /></NIcon></template>
                                    {{ t('common.copy') }}
                                </NButton>
                            </div>
                            <pre>{{ runResult }}</pre>
                        </div>
                    </div>
                </NScrollbar>
            </section>
        </div>

        <footer class="use-action-bar">
            <NFlex size="small">
                <NButton secondary size="small" :disabled="!canUse" @click="showAIRun = !showAIRun">
                    <template #icon><NIcon size="16"><Robot /></NIcon></template>
                    {{ t('promptWorkspace.runWithAI') }}
                </NButton>
                <NButton type="primary" size="small" :disabled="!canUse" @click="copyPrompt">
                    <template #icon><NIcon size="16"><Copy /></NIcon></template>
                    {{ t('promptWorkspace.copyPrompt') }}
                </NButton>
            </NFlex>
        </footer>

        <NDrawer v-model:show="showHistory" :width="380" placement="right">
            <NDrawerContent :title="t('promptWorkspace.useHistory')" closable>
                <NEmpty v-if="useHistory.length === 0" :description="t('promptWorkspace.noUseHistory')" />
                <div v-else class="history-list">
                    <div v-for="(record, index) in useHistory" :key="`${record.date}-${index}`" class="history-item">
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
    NAlert, NButton, NDrawer, NDrawerContent, NEmpty, NFlex, NForm, NFormItem,
    NIcon, NImage, NInput, NInputNumber, NScrollbar, NSelect, NSwitch, NTag, NText,
    useMessage
} from 'naive-ui'
import { Copy, History, Robot, X } from '@vicons/tabler'
import type { PromptVariable, PromptWithRelations } from '@shared/types/database'
import AIModelSelector from '@/components/common/AIModelSelector.vue'
import { api } from '@/lib/api'
import {
    createWorkspaceDraft, deriveWorkspaceVariables, getMissingRequiredVariables,
    isBooleanVariable, isNumberVariable, renderWorkspacePrompt
} from '@/lib/utils/prompt-workspace'

interface UseRecord {
    date: string
    content: string
    variables: Record<string, any>
}

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
const showHistory = ref(false)
const showAIRun = ref(false)
const useHistory = ref<UseRecord[]>([])
const renderError = ref('')
const selectedModelKey = ref('')
const modelSelectorRef = ref<any>()
const running = ref(false)
const runResult = ref('')
const runError = ref('')
const shouldStop = ref(false)
const imageUrls = ref<string[]>([])

const variables = computed<PromptVariable[]>(() => {
    return deriveWorkspaceVariables(props.prompt)
})

const missingVariables = computed(() => getMissingRequiredVariables(variables.value, props.draft))

const canUse = computed(() => Boolean(filledContent.value.trim()) && missingVariables.value.length === 0 && !renderError.value)

const filledContent = computed(() => {
    const rendered = renderWorkspacePrompt(props.prompt, props.draft, variables.value)
    renderError.value = rendered.error || ''
    return rendered.content
})

const initializeDraft = () => {
    emit('update:draft', createWorkspaceDraft(variables.value, props.draft))
}

const loadHistory = () => {
    try {
        useHistory.value = JSON.parse(localStorage.getItem(`prompt_history_${props.prompt.id}`) || '[]')
            .map((record: any) => ({ ...record, date: record.date || new Date().toISOString() }))
    } catch {
        useHistory.value = []
    }
}

const updateImageUrls = () => {
    imageUrls.value.forEach(URL.revokeObjectURL)
    imageUrls.value = (props.prompt.imageBlobs || []).map(blob => URL.createObjectURL(blob))
}

watch(() => props.prompt.id, () => {
    showAIRun.value = false
    runResult.value = ''
    runError.value = ''
    initializeDraft()
    loadHistory()
    updateImageUrls()
}, { immediate: true })

const updateValue = (name: string, value: any) => emit('update:draft', { ...props.draft, [name]: value })

const clearValues = () => {
    const next: Record<string, any> = {}
    variables.value.forEach(variable => {
        next[variable.name] = isBooleanVariable(variable.type)
            ? variable.defaultValue === 'true'
            : variable.defaultValue ?? ''
    })
    emit('update:draft', next)
}

const restoreHistory = (record: UseRecord) => {
    emit('update:draft', { ...record.variables })
    showHistory.value = false
    message.success(t('promptWorkspace.valuesRestored'))
}

const copyText = async (text: string) => {
    await navigator.clipboard.writeText(text)
    message.success(t('promptManagement.detailModal.copySuccess'))
}

const copyPrompt = async () => {
    if (!canUse.value || !props.prompt.id) return
    try {
        await navigator.clipboard.writeText(filledContent.value)
        const updatedPrompt = await api.prompts.incrementUseCount.mutate(props.prompt.id)
        const record: UseRecord = {
            date: new Date().toISOString(),
            content: filledContent.value,
            variables: { ...props.draft },
        }
        useHistory.value = [record, ...useHistory.value].slice(0, 50)
        localStorage.setItem(`prompt_history_${props.prompt.id}`, JSON.stringify(useHistory.value))
        message.success(t('promptWorkspace.copiedAndRecorded'))
        emit('updated', updatedPrompt as PromptWithRelations)
    } catch (error) {
        console.error(error)
        message.error(t('promptManagement.detailModal.copyFailed'))
    }
}

const runWithAI = async () => {
    if (!canUse.value) return
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
        topic: String(filledContent.value),
        customPrompt: String(filledContent.value),
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
            generatedPrompt: filledContent.value,
            model: String(selectedModel),
            status: 'success',
            debugResult: runResult.value,
            debugStatus: 'success',
            customPrompt: filledContent.value,
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

const getVariableOptions = (variable: PromptVariable) => (variable.options || []).map(option => ({ label: option, value: option }))
const stringValue = (value: any) => value === undefined || value === null ? '' : String(value)
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
.use-workspace { height: 100%; min-height: 0; display: flex; flex-direction: column; background: var(--surface-body); }
.use-content { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(300px, 360px) minmax(440px, 1fr); }
.use-content.without-variables { grid-template-columns: 1fr; }
.use-pane { min-width: 0; min-height: 0; display: flex; flex-direction: column; background: var(--surface-primary); }
.variable-pane { border-right: 1px solid var(--border-default); background: var(--surface-secondary); }
.pane-heading { min-height: 52px; padding: 10px 16px; display: flex; align-items: center; justify-content: space-between; gap: 14px; border-bottom: 1px solid var(--border-default); background: var(--surface-secondary); }
.pane-heading :deep(.n-text--strong) { font-size: 14px; }
.pane-description { display: block; margin-top: 2px; font-size: 12px; }
.pane-scroll { flex: 1; min-height: 0; }
.variable-form { padding: 14px 16px 24px; max-width: 620px; }
.variable-form :deep(.n-form-item) { margin-bottom: 12px; }
.variable-form :deep(.n-form-item-label) { min-height: 22px; padding-bottom: 4px; font-size: 13px; font-weight: 500; }
.variable-form :deep(.n-input), .variable-form :deep(.n-base-selection) { --n-height: 32px !important; }
.preview-scroll { background: var(--surface-primary); }
.prompt-preview { min-height: 260px; margin: 0; padding: var(--page-padding) var(--page-padding) var(--spacing-2xl); white-space: pre-wrap; overflow-wrap: anywhere; font: var(--font-size-base)/1.72 Monaco, Menlo, Consolas, monospace; color: var(--content-primary); tab-size: 2; cursor: text; user-select: text; -webkit-user-select: text; }
.prompt-preview::selection { color: inherit; background: color-mix(in srgb, var(--accent-primary) 24%, transparent); }
.preview-alert { padding: 12px 16px 0; }
.prompt-images { display: flex; gap: 10px; flex-wrap: wrap; padding: 0 22px 22px; }
.use-action-bar { min-height: 58px; flex: 0 0 auto; display: flex; align-items: center; justify-content: flex-end; gap: 16px; padding: 10px 16px; border-top: 1px solid var(--border-default); background: var(--surface-secondary); }
.ai-run-panel { margin: 0; padding: 14px 18px 18px; border-top: 1px solid var(--border-default); background: var(--surface-secondary); }
.ai-run-header, .ai-result-heading, .history-item-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.ai-run-actions { margin-top: 10px; }
.ai-result { margin-top: 14px; }
.ai-result pre { margin-bottom: 0; white-space: pre-wrap; font: 14px/1.65 Monaco, Menlo, Consolas, monospace; }
.history-list { display: flex; flex-direction: column; gap: 12px; }
.history-item { padding: 12px; border: 1px solid var(--border-default); border-radius: var(--radius-panel); background: var(--surface-secondary); }
.history-values { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.history-item p { margin: 10px 0 0; color: var(--content-secondary); white-space: pre-wrap; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }
@media (max-width: 1000px) {
    .use-content { grid-template-columns: 1fr; overflow-y: auto; }
    .use-pane { min-height: 420px; }
    .variable-pane { border-right: 0; border-bottom: 1px solid var(--border-default); }
}
</style>
