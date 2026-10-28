<template>
    <UiModal :show="show" width="var(--overlay-width-workspace)" height="640px" flush :title="t('quickOptimization.title')"
        :subtitle="t('quickOptimization.subtitle')" :close-label="t('common.close')" @close="requestClose">
        <div class="optimization-workspace">
            <aside class="optimization-library" :aria-label="t('quickOptimization.workspace.libraryTitle')">
                <div class="library-summary">
                    <span class="library-summary__title">
                        {{ t('quickOptimization.workspace.libraryTitle') }}
                        <span class="library-summary__count">{{ t('quickOptimization.workspace.enabledSummary', { enabled: enabledCount, total: configs.length }) }}</span>
                    </span>
                    <NButton quaternary size="tiny" @click="createDraft">
                        <template #icon><NIcon :size="12"><Plus /></NIcon></template>
                        {{ t('quickOptimization.workspace.add') }}
                    </NButton>
                </div>

                <div v-if="loading" class="library-state"><NSpin :size="16" /></div>
                <div v-else-if="loadError" class="library-state">
                    <span>{{ t('quickOptimization.workspace.loadFailed') }}</span>
                    <NButton size="tiny" @click="loadConfigs">{{ t('common.retry') }}</NButton>
                </div>
                <!-- 空状态只给两条路：用默认动作，或者用上面的「添加」自己写 -->
                <div v-else-if="configs.length === 0 && !creating" class="library-state">
                    <span class="library-state__hint">{{ t('quickOptimization.workspace.emptyHint') }}</span>
                    <NButton size="small" type="primary" :loading="initializing" @click="initializeDefaults">{{ t('quickOptimization.useDefaults') }}</NButton>
                </div>
                <NScrollbar v-else class="optimization-list">
                    <div v-for="config in configs" :key="config.id" class="optimization-item"
                        :class="{ active: !creating && selectedConfig?.id === config.id }">
                        <button type="button" class="optimization-select" @click="selectConfig(config)">
                            <span class="optimization-copy">
                                <strong :class="{ 'is-disabled': !config.enabled }">{{ config.name }}</strong>
                                <small>{{ config.description || t('quickOptimization.workspace.noDescription') }}</small>
                            </span>
                        </button>
                        <NSwitch size="small" :value="config.enabled" :disabled="!config.enabled && enabledCount >= 5"
                            :loading="togglingId === config.id" :aria-label="t('quickOptimization.workspace.enableNamed', { name: config.name })"
                            @update:value="value => toggleConfig(config, value)" />
                    </div>
                </NScrollbar>

                <p v-if="configs.length" class="ui-help library-help">{{ t('quickOptimization.workspace.limitHelp') }}</p>
                <NButton v-if="configs.length" quaternary size="tiny" class="library-example" :disabled="loading || saving" @click="createExampleDraft">
                    {{ t('quickOptimization.workspace.addExample') }}
                </NButton>
            </aside>

            <section v-if="selectedConfig || creating" class="optimization-editor">
                <div class="editor-header">
                    <span class="editor-subtitle">{{ creating ? t('quickOptimization.workspace.createDescription') : t('quickOptimization.workspace.editDescription') }}</span>
                    <span v-if="selectedConfig && !creating" class="editor-order">
                        <NButton quaternary size="tiny" :disabled="selectedIndex <= 0" @click="moveSelected(-1)">
                            <template #icon><NIcon :size="12"><ArrowUp /></NIcon></template>
                            {{ t('quickOptimization.workspace.moveUp') }}
                        </NButton>
                        <NButton quaternary size="tiny" :disabled="selectedIndex < 0 || selectedIndex >= configs.length - 1" @click="moveSelected(1)">
                            <template #icon><NIcon :size="12"><ArrowDown /></NIcon></template>
                            {{ t('quickOptimization.workspace.moveDown') }}
                        </NButton>
                    </span>
                </div>

                <NForm ref="formRef" :model="draft" :rules="formRules" label-placement="top" class="optimization-form">
                    <div class="form-grid">
                        <NFormItem :label="t('quickOptimization.configName')" path="name">
                            <NInput v-model:value="draft.name" :placeholder="t('quickOptimization.configNamePlaceholder')" />
                        </NFormItem>
                        <NFormItem :label="t('quickOptimization.enabledStatus')" path="enabled">
                            <div class="switch-field">
                                <NSwitch v-model:value="draft.enabled" :disabled="!draft.enabled && enabledCount >= 5 && !selectedConfig?.enabled" />
                                <span>{{ draft.enabled ? t('quickOptimization.enabled') : t('quickOptimization.disabled') }}</span>
                            </div>
                        </NFormItem>
                    </div>
                    <NFormItem :label="t('quickOptimization.description')" path="description">
                        <NInput v-model:value="draft.description" type="textarea" :autosize="{ minRows: 2, maxRows: 8 }"
                            :placeholder="t('quickOptimization.descriptionPlaceholder')" />
                    </NFormItem>
                    <NFormItem path="prompt" class="template-item">
                        <template #label>
                            <span class="template-label">
                                {{ t('quickOptimization.promptTemplate') }}
                                <NButton size="tiny" @mousedown.prevent @click="insertContentVariable">
                                    {{ t('quickOptimization.workspace.insert') }}<span class="ui-var ui-var--name template-token">{{ contentToken }}</span>
                                </NButton>
                            </span>
                        </template>
                        <NInput ref="templateInputRef" v-model:value="draft.prompt" type="textarea" class="template-input"
                            :autosize="{ minRows: 12, maxRows: 28 }" :placeholder="t('quickOptimization.promptTemplatePlaceholder')"
                            @click="rememberTemplateCursor" @keyup="rememberTemplateCursor" @select="rememberTemplateCursor" />
                    </NFormItem>
                    <p class="ui-help">{{ t('quickOptimization.workspace.templateHelp') }}</p>
                </NForm>
            </section>
            <section v-else class="optimization-editor optimization-editor--empty">
                <span>{{ t('quickOptimization.workspace.selectConfig') }}</span>
            </section>
        </div>

        <template #footer-start>
            <NButton v-if="selectedConfig && !creating" quaternary type="error" @click="deleteSelected">{{ t('common.delete') }}</NButton>
        </template>
        <template #footer>
            <NButton @click="requestClose">{{ t('common.close') }}</NButton>
            <NButton type="primary" :loading="saving" :disabled="!(selectedConfig || creating) || !dirty" @click="saveDraft">
                {{ t('common.save') }}
            </NButton>
        </template>
    </UiModal>
</template>

<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
    NButton, NForm, NFormItem, NIcon, NInput, NScrollbar, NSpin, NSwitch, useDialog, useMessage,
} from 'naive-ui'
import { ArrowDown, ArrowUp, Plus } from '@vicons/tabler'
import type { CreateQuickOptimizationConfig, QuickOptimizationConfig, UpdateQuickOptimizationConfig } from '@shared/types/ai'
import UiModal from '@/components/ui/UiModal.vue'
import { api } from '@/lib/api'

interface Props { show: boolean }
const props = defineProps<Props>()
const emit = defineEmits<{
    'update:show': [value: boolean]
    'configs-updated': []
}>()

const { t } = useI18n()
const message = useMessage()
const dialog = useDialog()

const configs = ref<QuickOptimizationConfig[]>([])
const loading = ref(false)
const loadError = ref('')
const initializing = ref(false)
const saving = ref(false)
const togglingId = ref<number | null>(null)
const selectedId = ref<number | null>(null)
const creating = ref(false)
const formRef = ref<any>()
const templateInputRef = ref<any>()
const snapshot = ref('')
const templateSelection = reactive({ start: 0, end: 0 })
const contentToken = '{{content}}'

const draft = reactive({
    name: '',
    description: '',
    prompt: '',
    enabled: true,
})

const selectedConfig = computed(() => configs.value.find(config => config.id === selectedId.value) || null)
const selectedIndex = computed(() => configs.value.findIndex(config => config.id === selectedId.value))
const enabledCount = computed(() => configs.value.filter(config => config.enabled).length)
const serializeDraft = () => JSON.stringify({ ...draft })
const dirty = computed(() => Boolean((selectedConfig.value || creating.value) && serializeDraft() !== snapshot.value))

const formRules = computed(() => ({
    name: [{ required: true, message: t('quickOptimization.workspace.nameRequired'), trigger: 'blur' }],
    prompt: [{ required: true, message: t('quickOptimization.workspace.templateRequired'), trigger: 'blur' }],
}))

const applyDraft = (config?: QuickOptimizationConfig) => {
    draft.name = config?.name || ''
    draft.description = config?.description || ''
    draft.prompt = config?.prompt || ''
    draft.enabled = config?.enabled ?? true
    templateSelection.start = draft.prompt.length
    templateSelection.end = draft.prompt.length
    snapshot.value = serializeDraft()
}

const loadConfigs = async () => {
    loading.value = true
    loadError.value = ''
    try {
        configs.value = (await api.quickOptimizationConfigs.getAll.query())
            .sort((a, b) => Number(a.sortOrder) - Number(b.sortOrder))
        const selected = configs.value.find(config => config.id === selectedId.value) || configs.value[0]
        selectedId.value = selected?.id || null
        creating.value = false
        applyDraft(selected)
    } catch (error) {
        console.error(error)
        loadError.value = (error as Error).message
    } finally { loading.value = false }
}

const confirmDiscard = () => new Promise<boolean>(resolve => {
    if (!dirty.value) { resolve(true); return }
    let settled = false
    const finish = (value: boolean) => { if (!settled) { settled = true; resolve(value) } }
    dialog.warning({
        title: t('quickOptimization.workspace.unsavedChanges'), content: t('quickOptimization.workspace.unsavedMessage'),
        positiveText: t('quickOptimization.workspace.discardChanges'), negativeText: t('quickOptimization.workspace.continueEditing'),
        maskClosable: false, onPositiveClick: () => finish(true), onNegativeClick: () => finish(false), onClose: () => finish(false),
    })
})

const selectConfig = async (config: QuickOptimizationConfig) => {
    if (!creating.value && config.id === selectedId.value) return
    if (!(await confirmDiscard())) return
    creating.value = false
    selectedId.value = config.id || null
    applyDraft(config)
}

const createDraft = async () => {
    if (!(await confirmDiscard())) return
    creating.value = true
    selectedId.value = null
    applyDraft()
}

const createExampleDraft = async () => {
    if (!(await confirmDiscard())) return
    creating.value = true
    selectedId.value = null
    applyDraft()
    draft.name = t('quickOptimization.workspace.exampleName')
    draft.description = t('quickOptimization.workspace.exampleDescription')
    draft.prompt = t('quickOptimization.workspace.examplePrompt')
    draft.enabled = enabledCount.value < 5
    templateSelection.start = draft.prompt.length
    templateSelection.end = draft.prompt.length
}

const getTemplateTextarea = () => {
    const textareaRef = templateInputRef.value?.textareaElRef
    return textareaRef?.value || textareaRef
}

const rememberTemplateCursor = (event: Event) => {
    const target = event.target as HTMLTextAreaElement
    if (typeof target?.selectionStart !== 'number') return
    templateSelection.start = target.selectionStart
    templateSelection.end = target.selectionEnd
}

const insertContentVariable = () => {
    const token = '{{content}}'
    const start = Math.min(templateSelection.start, draft.prompt.length)
    const end = Math.min(Math.max(templateSelection.end, start), draft.prompt.length)
    draft.prompt = `${draft.prompt.slice(0, start)}${token}${draft.prompt.slice(end)}`
    const cursor = start + token.length
    templateSelection.start = cursor
    templateSelection.end = cursor
    nextTick(() => {
        const textarea = getTemplateTextarea()
        templateInputRef.value?.focus?.()
        textarea?.setSelectionRange?.(cursor, cursor)
    })
}

const saveDraft = async () => {
    try { await formRef.value?.validate() } catch { return }
    if (draft.enabled && !selectedConfig.value?.enabled && enabledCount.value >= 5) {
        message.warning(t('quickOptimization.workspace.limitReached'))
        return
    }
    saving.value = true
    try {
        const data = { name: draft.name.trim(), description: draft.description.trim() || undefined, prompt: draft.prompt, enabled: draft.enabled }
        let savedConfig: QuickOptimizationConfig | null = null
        const wasCreating = creating.value
        if (creating.value) {
            savedConfig = await api.quickOptimizationConfigs.create.mutate({ ...data, sortOrder: configs.value.length + 1 } as CreateQuickOptimizationConfig)
        } else if (selectedConfig.value?.id) {
            savedConfig = await api.quickOptimizationConfigs.update.mutate({ id: selectedConfig.value.id, data: data as UpdateQuickOptimizationConfig })
        }
        if (savedConfig?.id) selectedId.value = savedConfig.id
        await loadConfigs()
        emit('configs-updated')
        message.success(t(wasCreating ? 'quickOptimization.workspace.created' : 'quickOptimization.workspace.saved', { name: data.name }))
    } catch (error) { message.error(t('quickOptimization.workspace.saveFailed', { error: (error as Error).message })) }
    finally { saving.value = false }
}

const toggleConfig = async (config: QuickOptimizationConfig, enabled: boolean) => {
    if (!config.id) return
    if (!(await confirmDiscard())) return
    if (enabled && enabledCount.value >= 5) { message.warning(t('quickOptimization.workspace.limitReached')); return }
    togglingId.value = config.id
    try {
        await api.quickOptimizationConfigs.toggle.mutate({ id: config.id, enabled })
        await loadConfigs()
        emit('configs-updated')
    } catch (error) { message.error(t('quickOptimization.workspace.operationFailed')) }
    finally { togglingId.value = null }
}

const moveSelected = async (direction: -1 | 1) => {
    if (!(await confirmDiscard())) return
    const index = selectedIndex.value
    const targetIndex = index + direction
    if (index < 0 || targetIndex < 0 || targetIndex >= configs.value.length) return
    const current = configs.value[index]
    const target = configs.value[targetIndex]
    if (!current.id || !target.id) return
    try {
        await Promise.all([
            api.quickOptimizationConfigs.update.mutate({ id: current.id, data: { sortOrder: target.sortOrder } }),
            api.quickOptimizationConfigs.update.mutate({ id: target.id, data: { sortOrder: current.sortOrder } }),
        ])
        selectedId.value = current.id
        await loadConfigs()
        selectedId.value = current.id
        applyDraft(configs.value.find(config => config.id === current.id))
        emit('configs-updated')
    } catch (error) { message.error(t('quickOptimization.workspace.operationFailed')) }
}

const deleteSelected = () => {
    const config = selectedConfig.value
    if (!config?.id) return
    dialog.error({
        title: t('quickOptimization.workspace.deleteTitle'), content: t('quickOptimization.workspace.deleteConfirm', { name: config.name }),
        positiveText: t('common.delete'), negativeText: t('common.cancel'),
        onPositiveClick: async () => {
            try {
                await api.quickOptimizationConfigs.delete.mutate(config.id!)
                selectedId.value = null
                await loadConfigs()
                emit('configs-updated')
                message.success(t('quickOptimization.workspace.deleted', { name: config.name }))
            } catch (error) { message.error(t('quickOptimization.workspace.operationFailed')) }
        },
    })
}

const initializeDefaults = async () => {
    initializing.value = true
    try {
        const count = await api.quickOptimizationConfigs.initializeDefaults.mutate()
        await loadConfigs()
        emit('configs-updated')
        if (count) message.success(t('quickOptimization.workspace.defaultsAdded', { count }, count))
    } catch (error) { message.error(t('quickOptimization.workspace.operationFailed')) }
    finally { initializing.value = false }
}

const requestClose = async () => {
    if (!(await confirmDiscard())) return
    emit('update:show', false)
}

watch(() => props.show, show => { if (show) loadConfigs() })
</script>

<style scoped>
.optimization-workspace {
    display: flex;
    flex: 1;
    min-height: 0;
    overflow: hidden;
    background: var(--surface-primary);
}

.optimization-library {
    display: flex;
    flex: none;
    flex-direction: column;
    gap: 2px;
    width: 300px;
    min-height: 0;
    padding: 12px 8px;
    border-right: 1px solid var(--border-default);
    background: var(--surface-secondary);
}

.library-summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 6px 8px 8px;
}

.library-summary__title {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
}

.library-summary__count {
    margin-left: 4px;
    color: var(--content-tertiary);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-normal);
}

.library-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 24px 8px;
    color: var(--content-tertiary);
    font-size: var(--font-size-sm);
}

.library-state__hint {
    max-width: 240px;
    text-align: center;
}

.optimization-list {
    flex: 1;
    min-height: 0;
}

.optimization-item {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 48px;
    padding: 0 10px 0 0;
    border-radius: var(--radius-control);
}

.optimization-item:hover {
    background: var(--surface-tertiary);
}

.optimization-item.active {
    background: var(--accent-soft);
}

.optimization-item.active .optimization-copy strong:not(.is-disabled) {
    color: var(--accent-soft-text);
}

.optimization-select {
    display: flex;
    flex: 1;
    min-width: 0;
    padding: 6px 10px;
    border: 0;
    border-radius: var(--radius-control);
    background: transparent;
    color: var(--content-primary);
    font: inherit;
    text-align: left;
    cursor: pointer;
}

.optimization-select:focus-visible {
    outline: 2px solid var(--accent-primary);
    outline-offset: -2px;
}

.optimization-copy {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
}

.optimization-copy strong, .optimization-copy small {
    white-space: normal;
    overflow-wrap: anywhere;
}

.optimization-copy strong {
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-normal);
}

.optimization-item.active .optimization-copy strong {
    font-weight: var(--font-weight-medium);
}

.optimization-copy strong.is-disabled {
    color: var(--content-tertiary);
}

.optimization-copy small {
    color: var(--content-tertiary);
    font-size: var(--font-size-xs);
}

.library-help {
    padding: 8px 8px 0;
}

.library-example {
    align-self: flex-start;
    margin: 4px 0 0 2px;
}

.optimization-editor {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 16px;
    min-width: 0;
    padding: 20px 24px;
    overflow: auto;
}

.optimization-editor--empty {
    align-items: center;
    justify-content: center;
    color: var(--content-tertiary);
    font-size: var(--font-size-sm);
}

.editor-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
}

.editor-subtitle {
    color: var(--content-secondary);
    font-size: var(--font-size-sm);
}

.editor-order {
    display: flex;
    gap: 4px;
}

.form-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 120px;
    gap: 12px;
}

.switch-field {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--content-secondary);
    font-size: var(--font-size-sm);
}

.template-label {
    display: inline-flex;
    align-items: center;
    gap: 8px;
}

.template-token {
    margin-left: 4px;
    font-size: var(--font-size-xs);
    line-height: 1.5;
}

.template-input :deep(textarea) {
    font-family: var(--font-family-mono);
    font-size: var(--font-size-sm);
}
</style>
