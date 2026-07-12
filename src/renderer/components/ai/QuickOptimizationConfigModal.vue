<template>
    <CommonModal :show="show" :body-padding="0" @update:show="handleModalShowUpdate">
        <template #header>
            <div class="modal-title-row">
                <span class="modal-title-icon"><NIcon size="20"><Settings /></NIcon></span>
                <div>
                    <NText strong class="modal-title">{{ t('quickOptimization.title') }}</NText>
                    <NText depth="3" class="modal-subtitle">{{ t('quickOptimization.subtitle') }}</NText>
                </div>
            </div>
        </template>

        <template #content="{ contentHeight }">
            <div class="optimization-workspace" :style="{ height: `${contentHeight}px` }">
                <aside class="optimization-library">
                    <div class="library-summary">
                        <div>
                            <NText strong>{{ t('quickOptimization.workspace.libraryTitle') }}</NText>
                            <NText depth="3">{{ t('quickOptimization.workspace.enabledSummary', { enabled: enabledCount, total: configs.length }) }}</NText>
                        </div>
                        <NTooltip>
                            <template #trigger>
                                <NButton quaternary circle size="small" :aria-label="t('quickOptimization.addConfig')" @click="createDraft">
                                    <template #icon><NIcon size="16"><Plus /></NIcon></template>
                                </NButton>
                            </template>
                            {{ t('quickOptimization.addConfig') }}
                        </NTooltip>
                    </div>

                    <div v-if="loading" class="library-state"><NSpin size="small" /></div>
                    <NResult v-else-if="loadError" status="error" :title="t('quickOptimization.workspace.loadFailed')"
                        :description="loadError" class="library-state">
                        <template #footer><NButton size="small" @click="loadConfigs">{{ t('common.retry') }}</NButton></template>
                    </NResult>
                    <div v-else-if="configs.length === 0 && !creating" class="library-state">
                        <NEmpty size="small" :description="t('quickOptimization.noConfig')">
                            <template #extra>
                                <NFlex vertical size="small">
                                    <NButton size="small" type="primary" @click="createDraft">{{ t('quickOptimization.addConfig') }}</NButton>
                                    <NButton size="small" :loading="initializing" @click="initializeDefaults">{{ t('quickOptimization.initializeDefaults') }}</NButton>
                                </NFlex>
                            </template>
                        </NEmpty>
                    </div>
                    <NScrollbar v-else class="optimization-list">
                        <div v-for="(config, index) in configs" :key="config.id"
                            class="optimization-item" :class="{ active: !creating && selectedConfig?.id === config.id }">
                            <button type="button" class="optimization-select" @click="selectConfig(config)">
                                <span class="drag-order">{{ index + 1 }}</span>
                                <span class="optimization-copy">
                                    <strong>{{ config.name }}</strong>
                                    <small>{{ config.description || t('quickOptimization.workspace.noDescription') }}</small>
                                </span>
                            </button>
                            <span class="item-controls">
                                <NSwitch size="small" :value="config.enabled" :disabled="!config.enabled && enabledCount >= 5"
                                    :loading="togglingId === config.id" @update:value="value => toggleConfig(config, value)" />
                            </span>
                        </div>
                    </NScrollbar>

                    <div v-if="configs.length" class="library-help">
                        <NText depth="3">{{ t('quickOptimization.workspace.limitHelp') }}</NText>
                    </div>
                </aside>

                <main v-if="selectedConfig || creating" class="optimization-editor">
                    <header class="editor-header">
                        <div>
                            <NText strong class="editor-title">{{ creating ? t('quickOptimization.addConfig') : selectedConfig?.name }}</NText>
                            <NText depth="3" class="editor-subtitle">{{ creating ? t('quickOptimization.workspace.createDescription') : t('quickOptimization.workspace.editDescription') }}</NText>
                        </div>
                        <NFlex v-if="selectedConfig && !creating" size="small">
                            <NTooltip>
                                <template #trigger>
                                    <NButton quaternary circle size="small" :disabled="selectedIndex <= 0" :aria-label="t('quickOptimization.workspace.moveUp')" @click="moveSelected(-1)">
                                        <template #icon><NIcon size="16"><ArrowUp /></NIcon></template>
                                    </NButton>
                                </template>
                                {{ t('quickOptimization.workspace.moveUp') }}
                            </NTooltip>
                            <NTooltip>
                                <template #trigger>
                                    <NButton quaternary circle size="small" :disabled="selectedIndex < 0 || selectedIndex >= configs.length - 1" :aria-label="t('quickOptimization.workspace.moveDown')" @click="moveSelected(1)">
                                        <template #icon><NIcon size="16"><ArrowDown /></NIcon></template>
                                    </NButton>
                                </template>
                                {{ t('quickOptimization.workspace.moveDown') }}
                            </NTooltip>
                            <NTooltip>
                                <template #trigger>
                                    <NButton quaternary circle size="small" type="error" :aria-label="t('common.delete')" @click="deleteSelected">
                                        <template #icon><NIcon size="16"><Trash /></NIcon></template>
                                    </NButton>
                                </template>
                                {{ t('common.delete') }}
                            </NTooltip>
                        </NFlex>
                    </header>

                    <NScrollbar class="editor-scroll">
                        <NForm ref="formRef" :model="draft" :rules="formRules" label-placement="top" class="optimization-form">
                            <section class="form-section ui-surface">
                                <div class="form-grid">
                                    <NFormItem :label="t('quickOptimization.configName')" path="name">
                                        <NInput v-model:value="draft.name" :placeholder="t('quickOptimization.configNamePlaceholder')" />
                                    </NFormItem>
                                    <NFormItem :label="t('quickOptimization.enabledStatus')" path="enabled" class="enabled-field">
                                        <div class="switch-field">
                                            <NSwitch v-model:value="draft.enabled" :disabled="!draft.enabled && enabledCount >= 5 && !selectedConfig?.enabled" />
                                            <NText depth="3">{{ draft.enabled ? t('quickOptimization.enabled') : t('quickOptimization.disabled') }}</NText>
                                        </div>
                                    </NFormItem>
                                    <NFormItem :label="t('quickOptimization.description')" path="description" class="form-span-2">
                                        <NInput v-model:value="draft.description" type="textarea" :autosize="{ minRows: 2, maxRows: 8 }"
                                            :placeholder="t('quickOptimization.descriptionPlaceholder')" />
                                    </NFormItem>
                                </div>
                            </section>

                            <section class="form-section ui-surface">
                                <div class="section-heading">
                                    <div>
                                        <NText strong>{{ t('quickOptimization.promptTemplate') }}</NText>
                                        <NText depth="3">{{ t('quickOptimization.workspace.templateHelp') }}</NText>
                                    </div>
                                    <NTag size="small">{{ t('quickOptimization.workspace.contentVariable') }}</NTag>
                                </div>
                                <NFormItem path="prompt" :show-label="false">
                                    <NInput v-model:value="draft.prompt" type="textarea" :autosize="{ minRows: 12, maxRows: 28 }" show-count
                                        class="template-input" :placeholder="t('quickOptimization.promptTemplatePlaceholder')" />
                                </NFormItem>
                            </section>
                        </NForm>
                    </NScrollbar>
                </main>

                <div v-else class="editor-empty">
                    <NEmpty :description="t('quickOptimization.workspace.selectConfig')">
                        <template #extra><NButton type="primary" size="small" @click="createDraft">{{ t('quickOptimization.addConfig') }}</NButton></template>
                    </NEmpty>
                </div>
            </div>
        </template>

        <template #footer>
            <NFlex justify="space-between" align="center">
                <NText depth="3" class="dirty-indicator">{{ dirty ? t('quickOptimization.workspace.unsavedChanges') : '' }}</NText>
                <NFlex>
                    <NButton @click="requestClose">{{ t('common.close') }}</NButton>
                    <NButton v-if="selectedConfig || creating" type="primary" :loading="saving" @click="saveDraft">
                        {{ creating ? t('common.create') : t('common.save') }}
                    </NButton>
                </NFlex>
            </NFlex>
        </template>
    </CommonModal>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
    NButton, NEmpty, NFlex, NForm, NFormItem, NIcon, NInput, NResult, NScrollbar,
    NSpin, NSwitch, NTag, NText, NTooltip, useDialog, useMessage,
} from 'naive-ui'
import { ArrowDown, ArrowUp, Plus, Settings, Trash } from '@vicons/tabler'
import type { CreateQuickOptimizationConfig, QuickOptimizationConfig, UpdateQuickOptimizationConfig } from '@shared/types/ai'
import CommonModal from '@/components/common/CommonModal.vue'
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
const snapshot = ref('')

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

const saveDraft = async () => {
    try { await formRef.value?.validate() } catch { return }
    if (draft.enabled && !selectedConfig.value?.enabled && enabledCount.value >= 5) {
        message.warning(t('quickOptimization.workspace.limitReached'))
        return
    }
    saving.value = true
    try {
        const data = { name: draft.name.trim(), description: draft.description.trim() || undefined, prompt: draft.prompt, enabled: draft.enabled }
        if (creating.value) {
            await api.quickOptimizationConfigs.create.mutate({ ...data, sortOrder: configs.value.length + 1 } as CreateQuickOptimizationConfig)
        } else if (selectedConfig.value?.id) {
            await api.quickOptimizationConfigs.update.mutate({ id: selectedConfig.value.id, data: data as UpdateQuickOptimizationConfig })
        }
        await loadConfigs()
        emit('configs-updated')
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
        title: t('common.confirm'), content: t('quickOptimization.workspace.deleteConfirm', { name: config.name }),
        positiveText: t('common.delete'), negativeText: t('common.cancel'),
        onPositiveClick: async () => {
            try {
                await api.quickOptimizationConfigs.delete.mutate(config.id!)
                selectedId.value = null
                await loadConfigs()
                emit('configs-updated')
            } catch (error) { message.error(t('quickOptimization.workspace.operationFailed')) }
        },
    })
}

const initializeDefaults = async () => {
    initializing.value = true
    try {
        await api.quickOptimizationConfigs.initializeDefaults.mutate()
        await loadConfigs()
        emit('configs-updated')
    } catch (error) { message.error(t('quickOptimization.workspace.operationFailed')) }
    finally { initializing.value = false }
}

const requestClose = async () => {
    if (!(await confirmDiscard())) return
    emit('update:show', false)
}
const handleModalShowUpdate = (value: boolean) => { if (!value) requestClose() }

watch(() => props.show, show => { if (show) loadConfigs() })
</script>

<style scoped>
.modal-title-row { display: flex; align-items: flex-start; gap: 12px; }
.modal-title-row > div { min-width: 0; }
.modal-title-icon { width: 36px; height: 36px; display: grid; place-items: center; color: var(--content-secondary); border: 1px solid var(--border-default); border-radius: var(--radius-control); background: var(--surface-secondary); }
.modal-title { display: block; font-size: var(--font-size-xl); line-height: var(--line-height-normal); overflow-wrap: anywhere; }
.modal-subtitle, .editor-subtitle, .library-summary .n-text:last-child, .section-heading .n-text:last-child { display: block; margin-top: 3px; font-size: var(--font-size-sm); line-height: var(--line-height-normal); white-space: normal; overflow-wrap: anywhere; }
.optimization-workspace { min-width: 0; min-height: 0; display: grid; grid-template-columns: 320px minmax(0, 1fr); overflow: hidden; background: var(--surface-primary); }
.optimization-library { min-width: 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; border-right: 1px solid var(--border-default); background: var(--surface-primary); }
.library-summary { min-height: 62px; display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; padding: var(--compact-padding); border-bottom: 1px solid var(--border-default); background: var(--surface-secondary); }
.library-summary > div { min-width: 0; }
.optimization-list { flex: 1; min-height: 0; padding: 7px; background: var(--surface-primary); }
.optimization-item { width: 100%; min-height: 60px; box-sizing: border-box; display: flex; align-items: flex-start; gap: 4px; padding: 4px 8px 4px 4px; margin-bottom: 2px; color: var(--content-primary); border-radius: var(--radius-panel); background: transparent; }
.optimization-item:hover { background: var(--interactive-hover); }
.optimization-item.active { background: var(--surface-tertiary); }
.optimization-select { appearance: none; flex: 1; min-width: 0; min-height: 52px; box-sizing: border-box; display: flex; align-items: flex-start; gap: 9px; padding: 4px; color: inherit; border: 0; border-radius: var(--radius-control); outline: none; background: transparent; font: inherit; text-align: left; cursor: pointer; }
.optimization-select:focus-visible { outline: 2px solid var(--accent-primary); outline-offset: -2px; }
.drag-order { width: 24px; height: 24px; margin-top: 1px; display: grid; place-items: center; flex: 0 0 auto; color: var(--content-secondary); border: 1px solid var(--border-default); border-radius: var(--radius-control); background: var(--surface-secondary); font-size: var(--font-size-xs); font-variant-numeric: tabular-nums; }
.optimization-copy { flex: 1; min-width: 0; }
.optimization-copy strong, .optimization-copy small { display: block; white-space: normal; overflow-wrap: anywhere; }
.optimization-copy strong { line-height: var(--line-height-normal); }
.optimization-copy small { margin-top: 4px; color: var(--content-secondary); font-size: var(--font-size-xs); font-weight: normal; line-height: var(--line-height-normal); }
.item-controls { flex: 0 0 auto; margin-top: 8px; }
.library-help { padding: 9px 12px; border-top: 1px solid var(--border-default); background: var(--surface-secondary); font-size: var(--font-size-xs); line-height: var(--line-height-normal); white-space: normal; overflow-wrap: anywhere; }
.library-state { flex: 1; display: grid; place-items: center; padding: 20px; }
.optimization-editor { min-width: 0; min-height: 0; display: flex; flex-direction: column; background: var(--surface-body); }
.editor-header { min-height: 62px; display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 10px var(--content-padding); border-bottom: 1px solid var(--border-default); background: var(--surface-primary); }
.editor-header > div:first-child { min-width: 0; }
.editor-title { display: block; font-size: var(--font-size-lg); line-height: var(--line-height-normal); white-space: normal; overflow-wrap: anywhere; }
.editor-scroll { flex: 1; min-height: 0; }
.optimization-form { max-width: 860px; display: flex; flex-direction: column; gap: var(--section-gap); margin: 0 auto; padding: var(--page-padding); }
.form-section { padding: var(--content-padding); }
.form-grid { display: grid; grid-template-columns: minmax(0, 1fr) 150px; gap: 0 16px; }
.form-span-2 { grid-column: 1 / -1; }
.switch-field { min-height: 34px; display: flex; align-items: center; gap: 9px; }
.section-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.section-heading > div { min-width: 0; }
.section-heading .n-tag { flex: 0 0 auto; }
.template-input :deep(.n-input__textarea-el) { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
.editor-empty { display: grid; place-items: center; background: var(--surface-body); }
.dirty-indicator { min-height: 20px; font-size: var(--font-size-xs); }

@media (max-width: 980px) {
    .optimization-workspace { grid-template-columns: 270px minmax(0, 1fr); }
    .form-grid { grid-template-columns: 1fr; }
    .form-span-2 { grid-column: auto; }
}
</style>
