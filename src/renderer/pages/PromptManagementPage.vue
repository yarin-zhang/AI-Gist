<template>
    <div class="prompt-management-page">
        <header class="prompt-command-bar">
            <div class="page-identity">
                <span class="page-identity-icon"><NIcon size="18"><Stars /></NIcon></span>
                <div>
                    <NText strong class="page-title">{{ t('promptManagement.title') }}</NText>
                    <NText depth="3" class="page-subtitle">{{ t('promptManagement.subtitle') }}</NText>
                </div>
            </div>

            <nav class="view-switcher" :aria-label="t('promptWorkspace.viewSwitcher')">
                <button v-for="view in viewOptions" :key="view.key" type="button"
                    class="view-switcher-item" :class="{ active: displayMode === view.key }"
                    @click="setDisplayMode(view.key)">
                    <NIcon size="16"><component :is="view.icon" /></NIcon>
                    <span>{{ view.label }}</span>
                </button>
            </nav>

            <div class="page-actions">
                <NButton type="primary" size="small" @click="handleCreatePrompt">
                    <template #icon><NIcon size="16"><Plus /></NIcon></template>
                    <span class="action-label">{{ t('promptManagement.createPrompt') }}</span>
                </NButton>
            </div>
        </header>

        <div class="prompt-page-content">
            <template v-if="displayMode === 'workspace'">
                <NSplit v-model:size="libraryPaneSize" direction="horizontal" min="220px" max="420px"
                    :resize-trigger-size="1" class="workspace-shell-split">
                    <template #1>
                        <PromptLibrarySidebar :prompts="prompts" :categories="categories"
                            :selected-id="selectedPrompt?.id" :loading="loading" @select="handleSelectPrompt"
                            @manage-categories="showCategoryManagement = true" @batch-delete="handleBatchDelete" />
                    </template>

                    <template #resize-trigger>
                        <div class="workspace-resize-line" />
                    </template>

                    <template #2>
                        <PromptWorkspace ref="workspaceRef" :prompt="selectedPrompt" :categories="categories"
                            :mode="workspaceMode" :draft="selectedDraft" @request-mode="handleRequestMode"
                            @update:draft="updateSelectedDraft" @updated="handlePromptUpdated" @saved="handlePromptSaved"
                            @toggle-favorite="toggleFavorite" @delete="handleDeletePrompt" @create="handleCreatePrompt"
                            @cancel-edit="handleCancelNewPrompt"
                            @open-quick-optimization-config="showQuickOptimizationModal = true" />
                    </template>
                </NSplit>
            </template>

            <div v-else class="legacy-view-surface">
                <PromptList ref="promptListRef" :forced-view-mode="displayMode" hide-view-switcher
                    @view="handleClassicViewPrompt" @edit="handleClassicEditPrompt"
                    @refresh="handleListRefresh" @manage-categories="showCategoryManagement = true"
                    @view-mode-change="handleLegacyViewModeChange" />
            </div>
        </div>

        <PromptWorkspaceModal ref="modalWorkspaceRef" :show="showWorkspaceModal" :prompt="selectedPrompt"
            :categories="categories" :mode="workspaceMode" :draft="selectedDraft"
            @request-close="handleCloseWorkspaceModal" @request-mode="handleRequestMode"
            @update:draft="updateSelectedDraft" @updated="handlePromptUpdated" @saved="handlePromptSaved"
            @toggle-favorite="toggleFavorite" @delete="handleDeletePrompt" @create="handleCreatePrompt"
            @cancel-edit="handleCloseWorkspaceModal"
            @open-quick-optimization-config="showQuickOptimizationModal = true" />

        <PromptCreationModal ref="creationModalRef" :show="showCreationModal" :categories="categories"
            @request-close="handleCloseCreationModal" @saved="handleCreatedPromptSaved"
            @navigate-to-ai-config="handleNavigateToAIConfig"
            @open-quick-optimization-config="showQuickOptimizationModal = true" />

        <CategoryManageModal v-model:show="showCategoryManagement" :categories="categories"
            @updated="handleCategoriesUpdated" />

        <QuickOptimizationConfigModal :show="showQuickOptimizationModal"
            @update:show="showQuickOptimizationModal = $event"
            @configs-updated="handleQuickOptimizationConfigsUpdated" />

    </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { NButton, NIcon, NSplit, NText, useDialog, useMessage } from 'naive-ui'
import { Folder, GridDots, LayoutSidebarRight, List, Plus, Stars } from '@vicons/tabler'
import type { Category, PromptWithRelations } from '@shared/types/database'
import PromptLibrarySidebar from '@/components/prompt-management/PromptLibrarySidebar.vue'
import PromptWorkspace, { type PromptWorkspaceMode } from '@/components/prompt-management/PromptWorkspace.vue'
import PromptWorkspaceModal from '@/components/prompt-management/PromptWorkspaceModal.vue'
import PromptCreationModal from '@/components/prompt-management/PromptCreationModal.vue'
import CategoryManageModal from '@/components/prompt-management/CategoryManageModal.vue'
import QuickOptimizationConfigModal from '@/components/ai/QuickOptimizationConfigModal.vue'
import PromptList from '@/components/prompt-management/PromptList.vue'
import { api } from '@/lib/api'
import { useDatabase } from '@/composables/useDatabase'

const emit = defineEmits<{
    'navigate-to-ai-config': []
}>()

const { t } = useI18n()
const message = useMessage()
const dialog = useDialog()
const { safeDbOperation, waitForDatabase } = useDatabase()

const prompts = ref<PromptWithRelations[]>([])
const categories = ref<Category[]>([])
const selectedPrompt = ref<PromptWithRelations | null>(null)
const workspaceMode = ref<PromptWorkspaceMode>('use')
const loading = ref(true)
const storedLibraryPaneSize = localStorage.getItem('prompt_library_pane_size')
const libraryPaneSize = ref(storedLibraryPaneSize && /^\d+(\.\d+)?px$/.test(storedLibraryPaneSize)
    ? storedLibraryPaneSize
    : '268px')
const showCategoryManagement = ref(false)
const showQuickOptimizationModal = ref(false)
const showWorkspaceModal = ref(false)
const showCreationModal = ref(false)
const workspaceRef = ref<any>()
const modalWorkspaceRef = ref<any>()
const creationModalRef = ref<any>()
const promptListRef = ref<any>()
const promptDrafts = ref<Record<number, Record<string, any>>>({})
type PromptDisplayMode = 'workspace' | 'grid' | 'table' | 'tree'
const storedDisplayMode = localStorage.getItem('prompt_display_mode') as PromptDisplayMode | null
const displayMode = ref<PromptDisplayMode>(storedDisplayMode || 'workspace')

const viewOptions = computed(() => [
    { key: 'workspace' as const, label: t('promptWorkspace.workspaceView'), icon: LayoutSidebarRight },
    { key: 'grid' as const, label: t('promptWorkspace.gridView'), icon: GridDots },
    { key: 'table' as const, label: t('promptWorkspace.tableView'), icon: List },
    { key: 'tree' as const, label: t('promptWorkspace.folderView'), icon: Folder },
])

const selectedDraft = computed(() => {
    const id = selectedPrompt.value?.id
    return id ? promptDrafts.value[id] || {} : {}
})

const activeWorkspaceRef = () => {
    if (showCreationModal.value) return creationModalRef.value
    return showWorkspaceModal.value ? modalWorkspaceRef.value : workspaceRef.value
}
const hasUnsavedChanges = () => Boolean(activeWorkspaceRef()?.hasUnsavedChanges)

const loadPrompts = async () => {
    const result = await safeDbOperation(() => api.prompts.getAllForTags.query(), [])
    prompts.value = result || []
}

const loadCategories = async () => {
    const result = await safeDbOperation(() => api.categories.getAll.query(), [])
    categories.value = result || []
}

const loadWorkspaceData = async () => {
    loading.value = true
    await Promise.all([loadPrompts(), loadCategories()])
    loading.value = false
}

const restoreSelection = () => {
    const lastId = Number(localStorage.getItem('prompt_workspace_last_id'))
    const prompt = prompts.value.find(item => item.id === lastId)
        || [...prompts.value].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0]
    if (prompt) {
        selectedPrompt.value = prompt
        workspaceMode.value = 'use'
    }
}

const confirmDiscardChanges = () => new Promise<boolean>((resolve) => {
    if (!hasUnsavedChanges()) {
        resolve(true)
        return
    }
    let settled = false
    const finish = (value: boolean) => {
        if (settled) return
        settled = true
        resolve(value)
    }
    dialog.warning({
        title: t('promptWorkspace.unsavedChanges'),
        content: t('promptWorkspace.unsavedChangesMessage'),
        positiveText: t('promptWorkspace.discardChanges'),
        negativeText: t('promptWorkspace.continueEditing'),
        onPositiveClick: () => finish(true),
        onNegativeClick: () => finish(false),
        onClose: () => finish(false),
        maskClosable: false,
    })
})

const handleSelectPrompt = async (prompt: PromptWithRelations) => {
    if (prompt.id === selectedPrompt.value?.id) return
    if (!(await confirmDiscardChanges())) return
    selectedPrompt.value = prompt
    workspaceMode.value = 'use'
    if (prompt.id) localStorage.setItem('prompt_workspace_last_id', String(prompt.id))
}

const setDisplayMode = async (mode: PromptDisplayMode) => {
    if (mode === displayMode.value) return
    if (displayMode.value === 'workspace' && workspaceMode.value === 'edit') {
        if (!(await confirmDiscardChanges())) return
        workspaceRef.value?.discardChanges?.()
        workspaceMode.value = 'use'
    }
    displayMode.value = mode
    localStorage.setItem('prompt_display_mode', mode)
}

const handleClassicViewPrompt = async (prompt: PromptWithRelations) => {
    selectedPrompt.value = prompt
    workspaceMode.value = 'use'
    showWorkspaceModal.value = true
    if (prompt.id) localStorage.setItem('prompt_workspace_last_id', String(prompt.id))
}

const handleClassicEditPrompt = async (prompt: PromptWithRelations) => {
    selectedPrompt.value = prompt
    workspaceMode.value = 'edit'
    showWorkspaceModal.value = true
}

const handleCloseWorkspaceModal = async () => {
    if (!showWorkspaceModal.value) return
    if (!(await confirmDiscardChanges())) return
    modalWorkspaceRef.value?.discardChanges?.()
    showWorkspaceModal.value = false
    workspaceMode.value = 'use'
    promptListRef.value?.loadPrompts?.()
}

const handleLegacyViewModeChange = (mode: 'grid' | 'table' | 'tree') => {
    if (displayMode.value !== 'workspace') {
        displayMode.value = mode
        localStorage.setItem('prompt_display_mode', mode)
    }
}

const handleRequestMode = async (mode: PromptWorkspaceMode) => {
    if (mode === workspaceMode.value) return
    if (workspaceMode.value === 'edit') {
        if (!(await confirmDiscardChanges())) return
        activeWorkspaceRef()?.discardChanges?.()
    }
    if (mode === 'use' && !selectedPrompt.value?.id) return
    workspaceMode.value = mode
}

const handleCreatePrompt = async () => {
    if (!(await confirmDiscardChanges())) return
    activeWorkspaceRef()?.discardChanges?.()
    showWorkspaceModal.value = false
    workspaceMode.value = 'use'
    showCreationModal.value = true
}

const handleCloseCreationModal = async () => {
    if (!showCreationModal.value) return
    if (!(await confirmDiscardChanges())) return
    creationModalRef.value?.discardChanges?.()
    showCreationModal.value = false
}

const handleCreatedPromptSaved = async (savedPrompt?: PromptWithRelations) => {
    showCreationModal.value = false
    await handlePromptSaved(savedPrompt)
}

const handleCancelNewPrompt = async () => {
    if (!(await confirmDiscardChanges())) return
    selectedPrompt.value = null
    workspaceMode.value = 'use'
}

const handlePromptSaved = async (savedPrompt?: PromptWithRelations) => {
    await loadPrompts()
    const savedId = savedPrompt?.id
    selectedPrompt.value = prompts.value.find(prompt => prompt.id === savedId)
        || prompts.value.find(prompt => prompt.uuid === savedPrompt?.uuid)
        || selectedPrompt.value
    workspaceMode.value = selectedPrompt.value?.id ? 'use' : 'edit'
    if (selectedPrompt.value?.id) localStorage.setItem('prompt_workspace_last_id', String(selectedPrompt.value.id))
    promptListRef.value?.loadPrompts?.()
}

const handlePromptUpdated = (updated?: PromptWithRelations) => {
    if (!selectedPrompt.value) return
    const useCount = updated?.useCount ?? selectedPrompt.value.useCount
    selectedPrompt.value = { ...selectedPrompt.value, ...updated, useCount }
    const index = prompts.value.findIndex(prompt => prompt.id === selectedPrompt.value?.id)
    if (index >= 0) prompts.value[index] = { ...prompts.value[index], ...selectedPrompt.value }
}

const toggleFavorite = async () => {
    if (!selectedPrompt.value?.id) return
    try {
        const updated = await api.prompts.toggleFavorite.mutate(selectedPrompt.value.id)
        handlePromptUpdated(updated)
    } catch (error) {
        console.error(error)
        message.error(t('promptManagement.saveFailed'))
    }
}

const handleDeletePrompt = () => {
    if (!selectedPrompt.value?.id) return
    const deletingPrompt = selectedPrompt.value
    dialog.error({
        title: t('common.confirm'),
        content: t('promptManagement.confirmDeletePrompt', { title: deletingPrompt.title }),
        positiveText: t('common.delete'),
        negativeText: t('common.cancel'),
        onPositiveClick: async () => {
            await api.prompts.delete.mutate(deletingPrompt.id!)
            delete promptDrafts.value[deletingPrompt.id!]
            await loadPrompts()
            selectedPrompt.value = prompts.value[0] || null
            workspaceMode.value = selectedPrompt.value ? 'use' : 'use'
            showWorkspaceModal.value = false
            promptListRef.value?.loadPrompts?.()
            message.success(t('promptManagement.deleteSuccess'))
        },
    })
}

const handleBatchDelete = (ids: number[]) => {
    if (!ids.length) return
    dialog.error({
        title: t('common.confirm'),
        content: t('promptManagement.confirmBatchDelete', { count: ids.length }),
        positiveText: t('common.delete'),
        negativeText: t('common.cancel'),
        onPositiveClick: async () => {
            const result = await api.prompts.batchDelete.mutate(ids)
            ids.forEach(id => delete promptDrafts.value[id])
            await loadPrompts()
            if (selectedPrompt.value?.id && ids.includes(selectedPrompt.value.id)) {
                selectedPrompt.value = prompts.value[0] || null
                workspaceMode.value = 'use'
            }
            message.success(t('promptWorkspace.batchDeleteResult', { count: result.success }))
        },
    })
}

const updateSelectedDraft = (value: Record<string, any>) => {
    const id = selectedPrompt.value?.id
    if (!id) return
    promptDrafts.value = { ...promptDrafts.value, [id]: value }
}

const handleCategoriesUpdated = async () => {
    await Promise.all([loadCategories(), loadPrompts()])
    if (selectedPrompt.value?.id) {
        selectedPrompt.value = prompts.value.find(prompt => prompt.id === selectedPrompt.value?.id) || selectedPrompt.value
    }
}

const handleQuickOptimizationConfigsUpdated = () => {
    activeWorkspaceRef()?.refreshQuickOptimizationConfigs?.()
}

const handleListRefresh = async () => {
    await loadPrompts()
}

const handleNavigateToAIConfig = () => emit('navigate-to-ai-config')

const openPromptByUUID = async (promptUUID: string) => {
    const prompt = await api.prompts.getByUUID.query(promptUUID)
    if (prompt) {
        displayMode.value = 'workspace'
        localStorage.setItem('prompt_display_mode', 'workspace')
        await handleSelectPrompt(prompt)
    }
}

const handleBeforeUnload = (event: BeforeUnloadEvent) => {
    if (!hasUnsavedChanges()) return
    event.preventDefault()
    event.returnValue = ''
}

defineExpose({
    createPrompt: handleCreatePrompt,
    openPromptByUUID,
})

onMounted(async () => {
    window.addEventListener('beforeunload', handleBeforeUnload)
    await waitForDatabase()
    await loadWorkspaceData()
    restoreSelection()
})

onBeforeUnmount(() => window.removeEventListener('beforeunload', handleBeforeUnload))

watch(libraryPaneSize, size => localStorage.setItem('prompt_library_pane_size', String(size)))
</script>

<style scoped>
.prompt-management-page {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: calc(100vh - 24px);
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: var(--surface-body);
}

.prompt-command-bar {
    flex: 0 0 60px;
    min-height: 60px;
    display: grid;
    grid-template-columns: minmax(220px, 1fr) auto minmax(300px, 1fr);
    align-items: center;
    gap: var(--section-gap);
    padding: 0 var(--page-padding);
    border-bottom: 1px solid var(--border-default);
    background: var(--surface-primary);
}

.page-identity, .page-actions { display: flex; align-items: center; }
.page-identity { gap: 10px; min-width: 0; }
.page-identity-icon { width: 32px; height: 32px; flex: 0 0 32px; display: grid; place-items: center; border-radius: var(--radius-panel); color: var(--accent-primary); background: var(--surface-secondary); }
.page-title { display: block; font-size: var(--font-size-lg); line-height: 1.25; }
.page-subtitle { display: block; max-width: 320px; margin-top: 1px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--font-size-xs); }
.page-actions { justify-content: flex-end; gap: 8px; }
.view-switcher { display: flex; align-items: center; gap: 2px; padding: 3px; border: 1px solid var(--border-default); border-radius: var(--radius-panel); background: var(--surface-secondary); }
.view-switcher-item { height: 32px; display: flex; align-items: center; gap: 6px; padding: 0 11px; border: 0; border-radius: var(--radius-control); color: var(--content-secondary); background: transparent; cursor: pointer; font: inherit; font-size: var(--font-size-base); }
.view-switcher-item:hover { color: var(--content-primary); background: var(--interactive-hover); }
.view-switcher-item.active { color: var(--content-primary); background: var(--surface-primary); font-weight: var(--font-weight-medium); }
.prompt-page-content { flex: 1; min-height: 0; display: flex; overflow: hidden; }
.workspace-shell-split { flex: 1; min-width: 0; min-height: 0; }
.workspace-shell-split :deep(.n-split__resize-trigger-wrapper) { position: relative; z-index: 2; overflow: visible; background: transparent; }
.workspace-shell-split :deep(.n-split__resize-trigger-wrapper)::before { content: ''; position: absolute; inset: 0 -4px; cursor: col-resize; }
.workspace-resize-line { width: 1px; height: 100%; background: var(--border-default); transition: background-color .12s ease; }
.workspace-shell-split :deep(.n-split__resize-trigger-wrapper:hover) .workspace-resize-line { background: var(--border-strong); }
.legacy-view-surface { flex: 1; min-width: 0; min-height: 0; display: flex; overflow: hidden; padding: var(--page-padding); }

@media (max-width: 1120px) {
    .prompt-command-bar { grid-template-columns: auto 1fr auto; gap: 12px; }
    .page-subtitle, .view-switcher-item span, .page-actions .action-label { display: none; }
    .view-switcher-item { width: 32px; justify-content: center; padding: 0; }
}
</style>
