<template>
  <div ref="rootRef" class="prompts-page">
    <template v-if="displayMode === 'workspace'">
      <PromptLibraryList v-if="!compact" :prompts="prompts" :categories="categories" :selected-id="selectedPrompt?.id"
        :draft="creating" :draft-title="draftTitle" :dirty-id="dirtyPromptId" :loading="loading"
        @select="handleSelectPrompt" @create="handleCreatePrompt" @change-view="setDisplayMode"
        @manage-categories="showCategoryManagement = true" @batch-delete="handleBatchDelete" />

      <!-- 引导页：「手动编写」把描述预填进 AI 生成输入框；连接模型后回到这里；导入直接定位到完整备份 -->
      <PromptEmptyState v-if="showOnboarding" @create-manual="description => handleCreatePrompt(description, false)"
        @generate="description => handleCreatePrompt(description)"
        @connect-model="emit('navigate-to-ai-config', { returnToPrompts: true })"
        @import-data="emit('open-settings', 'data-management#full-backup')" @enable-sync="emit('open-settings', 'cloud-backup')" />
      <PromptPage v-else-if="creating || selectedPrompt" :key="pageKey" ref="pageRef" :prompt="creating ? null : selectedPrompt"
        :categories="categories" :draft="currentDraft" :tag-suggestions="tagSuggestions"
        :initial-description="creating ? createDescription : ''" :auto-generate="createAutoGenerate"
        :default-category-id="createCategoryId"
        :can-set-shortcut="canSetShortcut" :show-library-toggle="compact"
        :shortcuts-enabled="!showWorkspaceModal" @update:draft="updateCurrentDraft" @saved="handlePromptSaved"
        @updated="handlePromptUpdated" @toggle-favorite="toggleFavorite" @delete="handleDeletePrompt"
        @discard-new="handleDiscardNew" @set-shortcut="openShortcutBinding(selectedPrompt)"
        @open-quick-optimization-config="showQuickOptimizationModal = true" @toggle-library="openLibraryDrawer()"
        @manage-categories="showCategoryManagement = true"
        @navigate-to-ai-config="emit('navigate-to-ai-config')" @dirty-change="handleDirtyChange" />
      <div v-else class="prompts-page__placeholder">
        <UiEmptyState v-if="!loading" :title="t('promptPage.selectPromptTitle')" :description="t('promptPage.selectPromptDescription')">
          <template #icon><NIcon :size="18"><FileText /></NIcon></template>
          <template #actions>
            <NButton v-if="compact" @click="openLibraryDrawer()">{{ t('promptWorkspace.showLibrary') }}</NButton>
            <NButton type="primary" @click="handleCreatePrompt()">{{ t('promptLibrary.create') }}</NButton>
          </template>
        </UiEmptyState>
      </div>

      <!-- 打开列表的按钮在提示词页页头左边（showLibraryToggle），不再浮在底栏上 -->
      <NDrawer v-model:show="libraryDrawerOpen" placement="left" :width="264" @after-enter="handleDrawerEntered">
        <PromptLibraryList ref="drawerLibraryRef" :prompts="prompts" :categories="categories" :selected-id="selectedPrompt?.id"
          :draft="creating" :draft-title="draftTitle" :dirty-id="dirtyPromptId" :loading="loading"
          @select="handleDrawerSelect" @create="handleCreatePrompt" @change-view="setDisplayMode"
          @manage-categories="showCategoryManagement = true" @batch-delete="handleBatchDelete" />
      </NDrawer>
    </template>

    <div v-else class="prompts-page__browse">
      <PromptBrowseHeader :view="displayMode" :total="prompts.length" :prompts="prompts" :categories="categories"
        @change-view="setDisplayMode" @manage-categories="showCategoryManagement = true" @create="handleCreatePrompt()" />
      <PromptCardGrid v-if="displayMode === 'grid'" :prompts="browsePrompts" :categories="categories"
        :shortcuts="shortcutLabels" :can-set-shortcut="canSetShortcut" @open="handleClassicViewPrompt"
        @action="handleBrowseAction" />
      <PromptTable v-else-if="displayMode === 'table'" :prompts="browsePrompts" :total="prompts.length"
        :categories="categories" :shortcuts="shortcutLabels" :can-set-shortcut="canSetShortcut"
        @open="handleClassicViewPrompt" @action="handleBrowseAction" @batch-move="handleBatchMove"
        @batch-export="actions.exportPrompts" @batch-delete="handleBatchDelete" />
      <PromptFolderView v-else :prompts="folderPrompts" :categories="categories" :shortcuts="shortcutLabels"
        :can-set-shortcut="canSetShortcut" :moving-id="movingId" @open="handleClassicViewPrompt" @action="handleBrowseAction"
        @move="handleFolderMove" @manage-categories="showCategoryManagement = true" />
    </div>

    <PromptWorkspaceModal :show="showWorkspaceModal" @request-close="handleCloseWorkspaceModal" @esc="handleWorkspaceModalEsc">
      <PromptPage v-if="showWorkspaceModal" ref="modalPageRef" :key="`modal:${modalPageKey}`"
        :prompt="modalCreating ? null : selectedPrompt" :categories="categories" :draft="currentDraft"
        :tag-suggestions="tagSuggestions" :initial-mode="modalInitialMode" :can-set-shortcut="canSetShortcut" closable
        :default-category-id="createCategoryId"
        @update:draft="updateCurrentDraft" @saved="handleModalSaved" @updated="handlePromptUpdated"
        @toggle-favorite="toggleFavorite" @delete="handleDeletePrompt" @close="handleCloseWorkspaceModal"
        @discard-new="closeWorkspaceModal" @set-shortcut="openShortcutBinding(selectedPrompt)"
        @open-quick-optimization-config="showQuickOptimizationModal = true"
        @manage-categories="showCategoryManagement = true"
        @navigate-to-ai-config="emit('navigate-to-ai-config')" />
    </PromptWorkspaceModal>

    <CategoryManageModal v-model:show="showCategoryManagement" :categories="categories" @updated="handleCategoriesUpdated" />
    <QuickOptimizationConfigModal :show="showQuickOptimizationModal" @update:show="handleQuickOptimizationModalShowUpdate"
      @configs-updated="refreshQuickOptimizationConfigs" />
    <ShortcutBindingModal v-if="canSetShortcut && shortcutPrompt" :show="showShortcutBinding" :prompt-uuid="shortcutPrompt.uuid"
      :prompt-title="shortcutPrompt.title" :existing-binding="shortcutBinding" @close="showShortcutBinding = false"
      @saved="handleShortcutSaved" />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { NButton, NDrawer, NIcon, useDialog, useMessage } from 'naive-ui'
import { FileText } from '@vicons/tabler'
import type { Category, PromptWithRelations } from '@shared/types/database'
import type { PromptShortcutBinding } from '@shared/types'
import { PlatformDetector } from '@shared/platform'
import PromptLibraryList from '@/components/prompts/PromptLibraryList.vue'
import PromptPage from '@/components/prompts/PromptPage.vue'
import PromptEmptyState from '@/components/prompts/PromptEmptyState.vue'
import type { PromptBodyMode, PromptDisplayMode } from '@/components/prompts/types'
import PromptBrowseHeader from '@/components/prompts/PromptBrowseHeader.vue'
import PromptCardGrid from '@/components/prompts/PromptCardGrid.vue'
import PromptFolderView from '@/components/prompts/PromptFolderView.vue'
import PromptTable from '@/components/prompts/PromptTable.vue'
import PromptWorkspaceModal from '@/components/prompt-management/PromptWorkspaceModal.vue'
import CategoryManageModal from '@/components/prompt-management/CategoryManageModal.vue'
import QuickOptimizationConfigModal from '@/components/ai/QuickOptimizationConfigModal.vue'
import ShortcutBindingModal from '@/components/shortcuts/ShortcutBindingModal.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import { api } from '@/lib/api'
import { useDatabase } from '@/composables/useDatabase'
import { useElementWidth } from '@/composables/useElementWidth'
import { onDataChange } from '@/lib/services/data-change-events'
import { collectPromptTags, filterPromptLibrary } from '@/lib/utils/prompt-library'
import { isEmptyPromptValue } from '@/lib/utils/prompt-template'
import { displayAccelerator } from '@/lib/utils/accelerator'
import { usePromptActions } from '@/composables/prompt/usePromptActions'
import { usePromptLibraryFilters } from '@/composables/prompt/usePromptLibraryFilters'
import { parseMoveAction, type PromptMenuAction } from '@/composables/prompt/usePromptMenu'

const emit = defineEmits<{
  /** returnToPrompts：从引导页去连接模型，保存配置后回到提示词页 */
  'navigate-to-ai-config': [options?: { returnToPrompts?: boolean }]
  /** section 可以带 #锚点，定位到设置页里的某个面板，例如 data-management#full-backup */
  'open-settings': [section: string]
}>()

// 列表收进抽屉的宽度：放不下 264 的列表和一张可读的提示词页
const COMPACT_WIDTH = 860
const DISPLAY_MODES: PromptDisplayMode[] = ['workspace', 'grid', 'table', 'tree']

const { t } = useI18n()
const message = useMessage()
const dialog = useDialog()
const { safeDbOperation, waitForDatabase } = useDatabase()
const canSetShortcut = PlatformDetector.getCapabilities().globalShortcuts && Boolean(window.electronAPI?.shortcuts)

const rootRef = ref<HTMLElement>()
const rootWidth = useElementWidth(rootRef)
const compact = computed(() => rootWidth.value > 0 && rootWidth.value < COMPACT_WIDTH)
const libraryDrawerOpen = ref(false)
const drawerLibraryRef = ref<InstanceType<typeof PromptLibraryList>>()
// ⌘F 打开的抽屉：等抽屉展开（焦点陷阱先把焦点放到第一个按钮）之后再聚焦搜索框
let focusSearchWhenOpened = false

const prompts = ref<PromptWithRelations[]>([])
const categories = ref<Category[]>([])
const loading = ref(true)
const selectedPrompt = ref<PromptWithRelations | null>(null)
const creating = ref(false)
const createDescription = ref('')
// 带着描述新建时是否直接开始 AI 生成；引导页的「手动编写」只把描述预填进生成输入框
const createAutoGenerate = ref(true)
// 新建时沿用当前所在的分类和「收藏」范围，保存后新提示词还留在眼前的列表里
const createCategoryId = ref<number | null>(null)
let favoriteOnCreate = false
const createCounter = ref(0)
const dirtyPromptId = ref<number | null>(null)
const promptDrafts = ref<Record<string, Record<string, any>>>({})
const pageRef = ref<InstanceType<typeof PromptPage>>()
const modalPageRef = ref<InstanceType<typeof PromptPage>>()
const { filters } = usePromptLibraryFilters()
const shortcutLabels = ref<Record<string, string>>({})
const movingId = ref<number | null>(null)

const storedMode = localStorage.getItem('prompt_display_mode') as PromptDisplayMode | null
const displayMode = ref<PromptDisplayMode>(storedMode && DISPLAY_MODES.includes(storedMode) ? storedMode : 'workspace')

const showWorkspaceModal = ref(false)
const modalCreating = ref(false)
const modalInitialMode = ref<PromptBodyMode>('fill')
const modalPageKey = ref(0)
const showCategoryManagement = ref(false)
const showQuickOptimizationModal = ref(false)
const showShortcutBinding = ref(false)
const shortcutPrompt = ref<PromptWithRelations | null>(null)
const shortcutBinding = ref<PromptShortcutBinding>()

const pageKey = computed(() => (creating.value ? `new:${createCounter.value}` : `prompt:${selectedPrompt.value?.id ?? 'none'}`))
const showOnboarding = computed(() => !loading.value && !prompts.value.length && !creating.value)
const tagSuggestions = computed(() => collectPromptTags(prompts.value).map(tag => tag.name))
// 列表顶部的草稿行跟着标题输入框实时更新
const draftTitle = computed(() => (creating.value ? pageRef.value?.draftTitle ?? '' : ''))
const draftKey = computed(() => {
  if ((creating.value && !showWorkspaceModal.value) || (showWorkspaceModal.value && modalCreating.value)) return 'new'
  return String(selectedPrompt.value?.id ?? 'none')
})
const currentDraft = computed(() => promptDrafts.value[draftKey.value] || {})

const activePage = () => (showWorkspaceModal.value ? modalPageRef.value : pageRef.value)
const hasUnsavedChanges = () => Boolean(activePage()?.hasUnsavedChanges)

// ---------- 数据 ----------
const loadPrompts = async () => {
  prompts.value = await safeDbOperation(() => api.prompts.getAllForTags.query(), []) || []
}

const loadCategories = async () => {
  categories.value = await safeDbOperation(() => api.categories.getAll.query(), []) || []
}

const restoreSelection = () => {
  const lastId = Number(localStorage.getItem('prompt_workspace_last_id'))
  selectedPrompt.value = prompts.value.find(item => item.id === lastId)
    || [...prompts.value].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0]
    || null
}

// 刷新后换入最新数据；正在编辑且有未保存修改时保留当前对象，避免把编辑内容冲掉
const reconcileSelection = () => {
  const current = selectedPrompt.value
  if (current) {
    const refreshed = prompts.value.find(item => item.id === current.id) || prompts.value.find(item => item.uuid === current.uuid)
    if (refreshed) {
      if (!hasUnsavedChanges()) selectedPrompt.value = refreshed
      return
    }
    if (hasUnsavedChanges()) return
    selectedPrompt.value = null
  }
  if (!creating.value) restoreSelection()
}

let refreshTimer: ReturnType<typeof setTimeout> | null = null
let refreshPending = false
let refreshPromise: Promise<void> | null = null

const runRefresh = (showLoading = false): Promise<void> => {
  refreshPending = true
  if (refreshPromise) return refreshPromise
  refreshPromise = (async () => {
    try {
      do {
        refreshPending = false
        if (showLoading) loading.value = true
        await Promise.all([loadPrompts(), loadCategories()])
        loading.value = false
        reconcileSelection()
        showLoading = false
      } while (refreshPending)
    } finally {
      refreshPromise = null
    }
  })()
  return refreshPromise
}

const scheduleRefresh = () => {
  refreshPending = true
  if (refreshTimer) return
  refreshTimer = setTimeout(() => {
    refreshTimer = null
    void runRefresh(false)
  }, 80)
}

const unsubscribeDataChanges = onDataChange(['prompts', 'categories', 'promptVariables'], scheduleRefresh)

// ---------- 未保存保护 ----------
const confirmDiscardChanges = () => new Promise<boolean>(resolve => {
  // 模板没改过、但 AI 修改建议（或标题描述预览）还没采纳或放弃时也问一声：切走后建议就没了
  const unsaved = hasUnsavedChanges()
  const pendingAI = !unsaved && Boolean(activePage()?.hasPendingAISuggestion)
  if (!unsaved && !pendingAI) {
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
    title: pendingAI ? t('promptAI.pendingSuggestionTitle') : t('promptWorkspace.unsavedChanges'),
    content: pendingAI ? t('promptAI.pendingSuggestionMessage') : t('promptWorkspace.unsavedChangesMessage'),
    positiveText: pendingAI ? t('promptAI.leaveSuggestion') : t('promptWorkspace.discardChanges'),
    negativeText: pendingAI ? t('promptAI.keepReviewing') : t('promptWorkspace.continueEditing'),
    onPositiveClick: () => finish(true),
    onNegativeClick: () => finish(false),
    onClose: () => finish(false),
    maskClosable: false,
  })
})

// ---------- 选择与新建 ----------
const rememberSelection = (prompt: PromptWithRelations | null) => {
  if (prompt?.id) localStorage.setItem('prompt_workspace_last_id', String(prompt.id))
}

const handleSelectPrompt = async (prompt: PromptWithRelations) => {
  if (!creating.value && prompt.id === selectedPrompt.value?.id) return
  if (!(await confirmDiscardChanges())) return
  creating.value = false
  selectedPrompt.value = prompt
  dirtyPromptId.value = null
  rememberSelection(prompt)
}

const handleDrawerSelect = async (prompt: PromptWithRelations) => {
  await handleSelectPrompt(prompt)
  if (selectedPrompt.value?.id === prompt.id) libraryDrawerOpen.value = false
}

/** 新建：工作台里在当前位置开一张草稿；其他显示方式用弹窗，不打断当前视图 */
const handleCreatePrompt = async (description = '', autoGenerate = true) => {
  if (!(await confirmDiscardChanges())) return
  promptDrafts.value = { ...promptDrafts.value, new: {} }
  createDescription.value = description
  createAutoGenerate.value = autoGenerate
  const { categoryId } = filters
  createCategoryId.value = typeof categoryId === 'number' && categories.value.some(category => category.id === categoryId)
    ? categoryId
    : null
  favoriteOnCreate = filters.scope === 'favorites'
  if (displayMode.value === 'workspace') {
    creating.value = true
    createCounter.value += 1
    dirtyPromptId.value = null
    libraryDrawerOpen.value = false
  } else {
    modalCreating.value = true
    modalInitialMode.value = 'edit'
    modalPageKey.value += 1
    showWorkspaceModal.value = true
  }
}

const handleDiscardNew = () => {
  creating.value = false
  createDescription.value = ''
  if (!selectedPrompt.value) restoreSelection()
}

// 新建草稿的未保存状态由列表顶部的草稿行自己标出，不能记到上一个选中的提示词头上
const handleDirtyChange = (dirty: boolean) => {
  dirtyPromptId.value = dirty && !creating.value ? selectedPrompt.value?.id ?? null : null
}

// ---------- 窄宽度下的列表抽屉 ----------
const openLibraryDrawer = (focusSearch = false) => {
  focusSearchWhenOpened = focusSearch
  libraryDrawerOpen.value = true
}

const handleDrawerEntered = () => {
  if (!focusSearchWhenOpened) return
  focusSearchWhenOpened = false
  drawerLibraryRef.value?.focusSearch()
}

// 列表收进抽屉时搜索框不在页面上：⌘F 先打开抽屉再聚焦搜索框。宽屏和抽屉已打开时由列表自己处理
const handleSearchShortcut = (event: KeyboardEvent) => {
  if (!compact.value || libraryDrawerOpen.value || displayMode.value !== 'workspace' || showWorkspaceModal.value) return
  if (!(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey || event.key.toLowerCase() !== 'f') return
  event.preventDefault()
  openLibraryDrawer(true)
}

const setDisplayMode = async (mode: PromptDisplayMode) => {
  if (mode === displayMode.value) return
  if (!(await confirmDiscardChanges())) return
  creating.value = false
  displayMode.value = mode
  localStorage.setItem('prompt_display_mode', mode)
}

// ---------- 卡片 / 表格 / 文件夹里打开 ----------
const openInModal = (prompt: PromptWithRelations, mode: PromptBodyMode) => {
  selectedPrompt.value = prompt
  modalCreating.value = false
  modalInitialMode.value = mode
  modalPageKey.value += 1
  showWorkspaceModal.value = true
  rememberSelection(prompt)
}

const handleClassicViewPrompt = (prompt: PromptWithRelations) => openInModal(prompt, 'fill')
const handleClassicEditPrompt = (prompt: PromptWithRelations) => openInModal(prompt, 'edit')

// 新建草稿的「放弃」由提示词页确认过一次，直接走这里关掉，不再弹关闭前的未保存确认
const closeWorkspaceModal = () => {
  modalPageRef.value?.discardChanges?.()
  showWorkspaceModal.value = false
  modalCreating.value = false
}

const handleCloseWorkspaceModal = async () => {
  if (!showWorkspaceModal.value) return
  if (!(await confirmDiscardChanges())) return
  closeWorkspaceModal()
}

// 弹窗里的 Esc（下拉、气泡已经自己收起的不会传到这里）：先让提示词页收起浮层或版本历史，没有可收起的再关弹窗
const handleWorkspaceModalEsc = () => {
  if (modalPageRef.value?.dismissTopLayer?.()) return
  void handleCloseWorkspaceModal()
}

// ---------- 保存、更新、删除 ----------
const replacePrompt = (updated: PromptWithRelations) => {
  const index = prompts.value.findIndex(prompt => prompt.id === updated.id)
  if (index >= 0) prompts.value[index] = { ...prompts.value[index], ...updated }
  else prompts.value = [updated, ...prompts.value]
}

/** 在「收藏」范围里新建的提示词，保存后直接收藏，不会一保存就从当前列表里消失 */
const favoriteCreatedPrompt = async (created: PromptWithRelations) => {
  if (!favoriteOnCreate) return
  favoriteOnCreate = false
  if (!created.id || created.isFavorite) return
  try {
    handlePromptUpdated(await api.prompts.toggleFavorite.mutate(created.id) as PromptWithRelations)
  } catch (error) {
    console.error(error)
    message.error(t('promptManagement.updateFavoriteFailed'))
  }
}

const handlePromptSaved = async (saved: PromptWithRelations) => {
  const created = creating.value
  await loadPrompts()
  const fresh = prompts.value.find(prompt => prompt.id === saved.id) || saved
  if (created) {
    // 只带上填过的值，空着的字段由提示词页按刚保存的默认值预填
    const filled = Object.entries(promptDrafts.value.new || {}).filter(([, value]) => !isEmptyPromptValue(value))
    promptDrafts.value = { ...promptDrafts.value, [String(fresh.id)]: Object.fromEntries(filled) }
    creating.value = false
  }
  selectedPrompt.value = fresh
  dirtyPromptId.value = null
  rememberSelection(fresh)
  if (created) await favoriteCreatedPrompt(fresh)
}

const handleModalSaved = async (saved: PromptWithRelations) => {
  const wasCreating = modalCreating.value
  await handlePromptSaved(saved)
  if (wasCreating) {
    modalCreating.value = false
    modalInitialMode.value = 'fill'
    if (selectedPrompt.value) await favoriteCreatedPrompt(selectedPrompt.value)
  }
}

const handlePromptUpdated = (updated: PromptWithRelations) => {
  if (!updated?.id) return
  replacePrompt(updated)
  if (selectedPrompt.value?.id === updated.id) selectedPrompt.value = { ...selectedPrompt.value, ...updated }
}

const toggleFavorite = async () => {
  if (!selectedPrompt.value?.id) return
  try {
    const updated = await api.prompts.toggleFavorite.mutate(selectedPrompt.value.id)
    handlePromptUpdated(updated as PromptWithRelations)
  } catch (error) {
    console.error(error)
    message.error(t('promptManagement.saveFailed'))
  }
}

/**
 * 删除前记下被删的提示词在列表里的位置（和列表里看到的顺序、筛选一致），
 * 删除后选中原位置的下一条，后面没有了就选上一条。
 */
const rememberListPosition = (ids: number[]) => {
  const index = browsePrompts.value.findIndex(prompt => prompt.id !== undefined && ids.includes(prompt.id))
  return () => {
    const list = browsePrompts.value
    if (index < 0) return list[0] || prompts.value[0] || null
    return list[Math.min(index, list.length - 1)] || prompts.value[0] || null
  }
}

const handleDeletePrompt = () => {
  const target = selectedPrompt.value
  if (!target?.id) return
  dialog.error({
    title: t('promptPage.deleteTitle', { title: target.title }),
    content: t('promptPage.deleteContent'),
    positiveText: t('common.delete'),
    negativeText: t('common.cancel'),
    onPositiveClick: async () => {
      const nextSelection = rememberListPosition([target.id!])
      await api.prompts.delete.mutate(target.id!)
      const { [String(target.id)]: _removed, ...rest } = promptDrafts.value
      promptDrafts.value = rest
      showWorkspaceModal.value = false
      await loadPrompts()
      selectedPrompt.value = nextSelection()
      rememberSelection(selectedPrompt.value)
      dirtyPromptId.value = null
      message.success(t('promptManagement.deleteSuccess'))
    },
  })
}

const handleBatchDelete = (ids: number[]) => {
  if (!ids.length) return
  dialog.error({
    title: t('promptManagement.batchDeleteTitle', { count: ids.length }, ids.length),
    content: t('promptPage.deleteContent'),
    positiveText: t('common.delete'),
    negativeText: t('common.cancel'),
    onPositiveClick: async () => {
      const nextSelection = rememberListPosition(selectedPrompt.value?.id ? [selectedPrompt.value.id] : ids)
      const result = await api.prompts.batchDelete.mutate(ids)
      await loadPrompts()
      if (selectedPrompt.value?.id && ids.includes(selectedPrompt.value.id)) selectedPrompt.value = nextSelection()
      message.success(t('promptWorkspace.batchDeleteResult', { count: result.success }, result.success))
    },
  })
}

const updateCurrentDraft = (values: Record<string, any>) => {
  promptDrafts.value = { ...promptDrafts.value, [draftKey.value]: values }
}

// ---------- 分类、快速优化、快捷键 ----------
const handleCategoriesUpdated = async () => {
  await Promise.all([loadCategories(), loadPrompts()])
  reconcileSelection()
}

const refreshQuickOptimizationConfigs = () => {
  void activePage()?.refreshQuickOptimizationConfigs?.()
}

const handleQuickOptimizationModalShowUpdate = (show: boolean) => {
  showQuickOptimizationModal.value = show
  if (!show) refreshQuickOptimizationConfigs()
}

const openShortcutBinding = async (prompt: PromptWithRelations | null) => {
  if (!prompt || !canSetShortcut) return
  shortcutPrompt.value = prompt
  try {
    const state = await window.electronAPI.shortcuts.getState()
    shortcutBinding.value = state.preferences.promptBindings.find(binding => binding.promptUUID === prompt.uuid)
  } catch {
    shortcutBinding.value = undefined
  }
  showShortcutBinding.value = true
}

// ---------- 卡片 / 表格 / 文件夹 ----------
const browsePrompts = computed(() => filterPromptLibrary(prompts.value, filters))
// 文件夹视图由左侧文件夹决定分类，其余筛选照常生效
const folderPrompts = computed(() => filterPromptLibrary(prompts.value, { ...filters, categoryId: null }))

const actions = usePromptActions(updated => {
  if (updated?.id) handlePromptUpdated(updated)
  else void loadPrompts()
})

const loadShortcutLabels = async () => {
  if (!canSetShortcut) return
  try {
    const state = await window.electronAPI.shortcuts.getState()
    shortcutLabels.value = Object.fromEntries(state.preferences.promptBindings
      .filter(binding => binding.enabled !== false && binding.accelerator)
      .map(binding => [binding.promptUUID, displayAccelerator(binding.accelerator)]))
  } catch {
    shortcutLabels.value = {}
  }
}

const categoryName = (categoryId: number | null) => (
  categoryId === null ? t('promptLibrary.uncategorized') : categories.value.find(item => item.id === categoryId)?.name || ''
)

const handleBrowseAction = (action: PromptMenuAction, prompt: PromptWithRelations) => {
  if (action === 'open') handleClassicViewPrompt(prompt)
  else if (action === 'edit') handleClassicEditPrompt(prompt)
  else if (action === 'copy') void actions.copyWithDefaults(prompt)
  else if (action === 'copy-raw') void actions.copyRaw(prompt)
  else if (action === 'favorite') void actions.toggleFavorite(prompt)
  else if (action === 'shortcut') void openShortcutBinding(prompt)
  else if (parseMoveAction(action) !== undefined) {
    const categoryId = parseMoveAction(action) ?? null
    void actions.moveToCategory([prompt], categoryId, categoryName(categoryId))
  } else if (action === 'delete') {
    selectedPrompt.value = prompt
    // 下拉菜单关闭后再弹确认框，焦点才能正确回到页面
    window.setTimeout(handleDeletePrompt, 0)
  }
}

const handleBatchMove = async (ids: number[], categoryId: number | null) => {
  const targets = prompts.value.filter(prompt => prompt.id && ids.includes(prompt.id))
  await actions.moveToCategory(targets, categoryId, categoryName(categoryId))
}

const handleFolderMove = async (prompt: PromptWithRelations, categoryId: number | null) => {
  movingId.value = prompt.id ?? null
  try {
    await actions.moveToCategory([prompt], categoryId, categoryName(categoryId))
  } finally {
    movingId.value = null
  }
}

const handleShortcutSaved = () => {
  showShortcutBinding.value = false
  void loadShortcutLabels()
}

// ---------- 对外 ----------
const openPromptByUUID = async (promptUUID: string) => {
  const prompt = await api.prompts.getByUUID.query(promptUUID)
  if (!prompt) return
  if (displayMode.value !== 'workspace') {
    openInModal(prompt, 'fill')
    return
  }
  await handleSelectPrompt(prompt)
}

const handleBeforeUnload = (event: BeforeUnloadEvent) => {
  if (!hasUnsavedChanges()) return
  event.preventDefault()
  event.returnValue = ''
}

defineExpose({
  createPrompt: () => handleCreatePrompt(),
  openPromptByUUID,
  /** 切到别的页面前调用：有未保存的修改时先确认，返回 false 表示留在当前页 */
  confirmLeave: confirmDiscardChanges,
})

onMounted(async () => {
  window.addEventListener('beforeunload', handleBeforeUnload)
  window.addEventListener('keydown', handleSearchShortcut)
  void loadShortcutLabels()
  await waitForDatabase()
  await runRefresh(true)
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
  window.removeEventListener('keydown', handleSearchShortcut)
  unsubscribeDataChanges()
  if (refreshTimer) clearTimeout(refreshTimer)
})

watch(compact, value => { if (!value) libraryDrawerOpen.value = false })
</script>

<style scoped>
.prompts-page {
  position: relative;
  display: flex;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  /* clip 而不是 hidden：hidden 的容器仍能被程序滚动，超出右边的控件获得焦点时整页会被推偏且不复原 */
  overflow: clip;
  background: var(--surface-primary);
}

.prompts-page__placeholder {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
}

.prompts-page__browse {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: clip;
}
</style>
