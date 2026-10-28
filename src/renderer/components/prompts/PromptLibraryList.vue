<template>
  <aside class="library" :aria-label="t('promptLibrary.label')">
    <div class="library__head">
      <span class="ui-title-section">{{ t('promptLibrary.title') }}</span>
      <span class="library__count">{{ filtered.length }}</span>
      <span class="library__spacer" />
      <NDropdown trigger="click" placement="bottom-end" :options="viewOptions" @select="handleViewSelect">
        <NButton quaternary size="small" class="library__icon-button" :aria-label="t('promptLibrary.viewMenu')">
          <template #icon><NIcon :size="16"><LayoutGrid /></NIcon></template>
        </NButton>
      </NDropdown>
      <NTooltip :show-arrow="false">
        <template #trigger>
          <NButton type="primary" size="small" class="library__icon-button" :aria-label="t('promptLibrary.create')"
            @click="emit('create')">
            <template #icon><NIcon :size="16"><Plus /></NIcon></template>
          </NButton>
        </template>
        {{ t('promptLibrary.create') }}
      </NTooltip>
    </div>

    <div class="library__filters">
      <NInput ref="searchRef" v-model:value="filters.query" clearable :placeholder="t('promptLibrary.searchPlaceholder')"
        :input-props="{ 'aria-label': t('promptLibrary.search') }" @keydown="handleSearchKeydown">
        <template #prefix><NIcon :size="14"><Search /></NIcon></template>
        <template #suffix><UiKbd v-if="!filters.query">{{ searchShortcut }}</UiKbd></template>
      </NInput>
      <UiSegmented v-model="filters.scope" fill :label="t('promptLibrary.scope')" :options="scopeOptions" />
      <NDropdown trigger="click" placement="bottom-start" :options="categoryOptions" @select="handleCategorySelect">
        <NButton quaternary size="tiny" class="library__category-button">
          <UiCategoryDot v-if="activeCategory" :color="activeCategory.color" />
          {{ t('promptLibrary.categoryFilter', { name: categoryLabel }) }}
          <NIcon :size="12"><ChevronDown /></NIcon>
        </NButton>
      </NDropdown>
    </div>

    <div v-if="selectionMode" class="library__selection">
      <span>{{ t('promptLibrary.selectedCount', { count: selectedIds.length }, selectedIds.length) }}</span>
      <span class="library__spacer" />
      <NButton quaternary size="tiny" @click="exitSelection">{{ t('common.cancel') }}</NButton>
      <NButton type="error" size="tiny" :disabled="!selectedIds.length" @click="confirmBatchDelete">
        {{ t('common.delete') }}
      </NButton>
    </div>

    <NScrollbar class="library__scroll">
      <!-- 列表只占一个 Tab 位置（当前选中的一条），条目之间用 ↑↓ 移动 -->
      <div ref="itemsRef" class="library__items" role="listbox" :aria-label="t('promptLibrary.title')" @keydown="handleListKeydown">
        <button v-if="draft" type="button" role="option" aria-selected="true" class="library-item is-active" tabindex="0">
          <span class="library-item__title">
            <span class="library-item__name">{{ draftTitle || t('promptLibrary.untitled') }}</span>
            <UiStatusDot tone="warning" :label="t('promptLibrary.notSaved')" />
          </span>
          <span class="library-item__meta">{{ t('promptLibrary.draftMeta') }}</span>
        </button>

        <button v-for="prompt in filtered" :key="prompt.id" type="button" role="option"
          class="library-item" :class="{ 'is-active': !draft && prompt.id === selectedId, 'is-checked': isChecked(prompt) }"
          :aria-selected="!draft && prompt.id === selectedId" :tabindex="prompt.id === tabStopId ? 0 : -1"
          @click="handleItemClick(prompt)">
          <span class="library-item__title">
            <NCheckbox v-if="selectionMode" :checked="isChecked(prompt)" size="small" class="library-item__check"
              @click.stop="toggleChecked(prompt)" />
            <span class="library-item__name">{{ prompt.title }}</span>
            <UiStatusDot v-if="prompt.id === dirtyId" tone="warning" :label="t('promptLibrary.unsaved')" />
            <span v-else-if="prompt.isJinjaTemplate" class="ui-tag ui-tag--line library-item__tag">Jinja</span>
            <NIcon v-else-if="prompt.isFavorite" :size="12" class="library-item__star" :aria-label="t('promptLibrary.favorited')">
              <Star />
            </NIcon>
          </span>
          <span class="library-item__meta">{{ itemMeta(prompt) }}</span>
        </button>

        <div v-if="!loading && !filtered.length && !draft" class="library__empty">
          <template v-if="prompts.length">
            <span>{{ t('promptLibrary.noResults') }}</span>
            <!-- 只看「最近 / 收藏」时搜不到，给一个到全部里找的入口（和卡片、表格、文件夹视图一致） -->
            <template v-if="scopeHint">
              <span class="library__empty-hint">{{ scopeHint }}</span>
              <NButton size="tiny" @click="filters.scope = 'all'">{{ t('promptBrowse.searchAll') }}</NButton>
            </template>
            <NButton v-if="hasOtherFilters || !scopeHint" quaternary size="tiny" @click="clearAll">
              {{ t('promptLibrary.clearFilters') }}
            </NButton>
          </template>
          <span v-else>{{ t('promptLibrary.emptyHint') }}</span>
        </div>
      </div>
    </NScrollbar>
  </aside>
</template>

<script setup lang="ts">
import { computed, h, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { NButton, NCheckbox, NDropdown, NIcon, NInput, NScrollbar, NTooltip, type DropdownOption } from 'naive-ui'
import { ChevronDown, LayoutGrid, Plus, Search, Star } from '@vicons/tabler'
import type { Category, PromptWithRelations } from '@shared/types/database'
import UiCategoryDot from '@/components/ui/UiCategoryDot.vue'
import UiKbd from '@/components/ui/UiKbd.vue'
import UiSegmented from '@/components/ui/UiSegmented.vue'
import UiStatusDot from '@/components/ui/UiStatusDot.vue'
import { usePromptLibraryFilters } from '@/composables/prompt/usePromptLibraryFilters'
import { filterPromptLibrary } from '@/lib/utils/prompt-library'
import { getActivePromptVariables } from '@/lib/utils/prompt-template'
import { displayShortcutHint } from '@/lib/utils/accelerator'
import { isImeComposing } from '@/lib/utils/ime'
import type { PromptDisplayMode } from './types'

const props = withDefaults(defineProps<{
  prompts: PromptWithRelations[]
  categories: Category[]
  selectedId?: number | null
  /** 正在新建的提示词，列表顶部显示一条「未命名提示词」 */
  draft?: boolean
  draftTitle?: string
  /** 有未保存修改的提示词，标一个橙点 */
  dirtyId?: number | null
  loading?: boolean
}>(), {
  selectedId: null,
  draft: false,
  draftTitle: '',
  dirtyId: null,
  loading: false,
})

const emit = defineEmits<{
  select: [prompt: PromptWithRelations]
  create: []
  'change-view': [mode: PromptDisplayMode]
  'manage-categories': []
  'batch-delete': [ids: number[]]
}>()

const { t } = useI18n()
const { filters, clear } = usePromptLibraryFilters()
const searchRef = ref<InstanceType<typeof NInput>>()
const itemsRef = ref<HTMLElement>()
const selectionMode = ref(false)
const selectedIds = ref<number[]>([])
const searchShortcut = displayShortcutHint('⌘F', 'Ctrl+F')

const matched = computed(() => filterPromptLibrary(props.prompts, filters))
// 正打开的提示词因为自己的改动不再符合筛选（比如在「收藏」里取消收藏）时，先留在原来的位置，
// 换了提示词或改了筛选条件再按筛选走，免得右边还开着、列表里却找不到它
const kept = ref<{ id: number; index: number } | null>(null)
const filterKey = computed(() => JSON.stringify([filters.query, filters.scope, filters.categoryId, filters.tags, filters.sortBy, filters.sortOrder]))
watch([matched, filterKey, () => props.selectedId], ([list, key, selected], [previousList, previousKey, previousSelected]) => {
  if (key !== previousKey || selected !== previousSelected || selected == null) {
    kept.value = null
    return
  }
  const index = previousList.findIndex(prompt => prompt.id === selected)
  if (index >= 0 && !list.some(prompt => prompt.id === selected)) kept.value = { id: selected, index }
})
const filtered = computed(() => {
  const list = matched.value
  const item = kept.value && props.prompts.find(prompt => prompt.id === kept.value!.id)
  if (!item || list.some(prompt => prompt.id === item.id)) return list
  return [...list.slice(0, kept.value!.index), item, ...list.slice(kept.value!.index)]
})
// Tab 进列表时落在哪一条：新建时是草稿行，否则是选中的提示词，它不在结果里时是第一条
const tabStopId = computed(() => {
  if (props.draft) return null
  return filtered.value.some(prompt => prompt.id === props.selectedId) ? props.selectedId : filtered.value[0]?.id ?? null
})
const categoryById = computed(() => new Map(props.categories.map(category => [category.id, category])))
const activeCategory = computed(() => (
  typeof filters.categoryId === 'number' ? categoryById.value.get(filters.categoryId) : undefined
))
const categoryLabel = computed(() => {
  if (filters.categoryId === 'none') return t('promptLibrary.uncategorized')
  return activeCategory.value?.name || t('promptLibrary.allCategories')
})

const scopeHint = computed(() => (filters.scope === 'all' ? '' : t('promptBrowse.noResultsInScope', {
  scope: t(filters.scope === 'recent' ? 'promptLibrary.scopeRecent' : 'promptLibrary.scopeFavorites'),
})))
// 除了范围以外还有搜索词、分类或标签时，「清除筛选」才有额外的意义
const hasOtherFilters = computed(() => Boolean(filters.query.trim()) || filters.categoryId !== null || filters.tags.length > 0)

const scopeOptions = computed(() => [
  { value: 'all' as const, label: t('promptLibrary.scopeAll') },
  { value: 'recent' as const, label: t('promptLibrary.scopeRecent') },
  { value: 'favorites' as const, label: t('promptLibrary.scopeFavorites') },
])

const dot = (color?: string | null) => () => h(UiCategoryDot, { color })
const categoryOptions = computed<DropdownOption[]>(() => [
  { key: 'all', label: t('promptLibrary.allCategories') },
  ...props.categories.map(category => ({ key: `category:${category.id}`, label: category.name, icon: dot(category.color) })),
  { key: 'none', label: t('promptLibrary.uncategorized'), icon: dot(null) },
  { type: 'divider', key: 'divider' },
  { key: 'manage', label: t('promptLibrary.manageCategories') },
])

const viewOptions = computed<DropdownOption[]>(() => [
  { key: 'workspace', label: t('promptLibrary.viewWorkspace') },
  { key: 'grid', label: t('promptLibrary.viewCards') },
  { key: 'table', label: t('promptLibrary.viewTable') },
  { key: 'tree', label: t('promptLibrary.viewFolders') },
  { type: 'divider', key: 'divider' },
  { key: 'select', label: t('promptLibrary.selectMultiple') },
])

const itemMeta = (prompt: PromptWithRelations) => {
  const category = prompt.categoryId ? categoryById.value.get(prompt.categoryId)?.name : ''
  const count = getActivePromptVariables(prompt).length
  const variables = count ? t('promptLibrary.variableCount', { count }, count) : t('promptLibrary.noVariables')
  return [category || t('promptLibrary.uncategorized'), variables].join(' · ')
}

const handleViewSelect = (key: string | number) => {
  if (key === 'select') {
    selectionMode.value = true
    return
  }
  emit('change-view', key as PromptDisplayMode)
}

const handleCategorySelect = (key: string | number) => {
  const value = String(key)
  if (value === 'manage') emit('manage-categories')
  else if (value === 'all') filters.categoryId = null
  else if (value === 'none') filters.categoryId = 'none'
  else filters.categoryId = Number(value.split(':')[1])
}

const isChecked = (prompt: PromptWithRelations) => Boolean(prompt.id && selectedIds.value.includes(prompt.id))

const toggleChecked = (prompt: PromptWithRelations) => {
  if (!prompt.id) return
  selectedIds.value = isChecked(prompt)
    ? selectedIds.value.filter(id => id !== prompt.id)
    : [...selectedIds.value, prompt.id]
}

const handleItemClick = (prompt: PromptWithRelations) => {
  if (selectionMode.value) toggleChecked(prompt)
  else emit('select', prompt)
}

const exitSelection = () => {
  selectionMode.value = false
  selectedIds.value = []
}

const confirmBatchDelete = () => {
  if (!selectedIds.value.length) return
  emit('batch-delete', [...selectedIds.value])
  exitSelection()
}

const clearAll = () => {
  clear()
  filters.scope = 'all'
}

// ---------- 键盘 ----------
const itemButtons = () => Array.from(itemsRef.value?.querySelectorAll<HTMLElement>('.library-item') || [])

const focusItem = (index: number) => {
  const items = itemButtons()
  if (!items.length) return false
  items[Math.max(0, Math.min(index, items.length - 1))].focus()
  return true
}

/** 搜索框：Esc 先清空搜索词，再按一次离开搜索框；↓ 进入结果列表；回车打开第一条结果 */
const handleSearchKeydown = (event: KeyboardEvent) => {
  if (isImeComposing(event)) return
  if (event.key === 'Escape') {
    if (filters.query) {
      // 这次 Esc 只用来清空：外层的列表抽屉、提示词页不跟着收起
      event.preventDefault()
      event.stopPropagation()
      filters.query = ''
    } else {
      searchRef.value?.blur()
    }
  } else if (event.key === 'ArrowDown') {
    if (focusItem(0)) event.preventDefault()
  } else if (event.key === 'Enter' && !selectionMode.value && filtered.value.length) {
    event.preventDefault()
    emit('select', filtered.value[0])
  }
}

/** 列表：↑↓ 在条目之间移动，Home / End 到头尾，第一条上按 ↑ 回到搜索框；回车、空格打开（按钮本身的行为） */
const handleListKeydown = (event: KeyboardEvent) => {
  const items = itemButtons()
  const current = (event.target as HTMLElement).closest<HTMLElement>('.library-item')
  const index = current ? items.indexOf(current) : -1
  if (index < 0) return
  const moves: Record<string, number | undefined> = { ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: items.length - 1 }
  const next = moves[event.key]
  if (next === undefined) return
  event.preventDefault()
  if (next < 0) searchRef.value?.focus()
  else focusItem(next)
}

const handleSearchShortcut = (event: KeyboardEvent) => {
  if ((event.metaKey || event.ctrlKey) && !event.shiftKey && event.key.toLowerCase() === 'f') {
    event.preventDefault()
    searchRef.value?.focus()
  }
}

onMounted(() => window.addEventListener('keydown', handleSearchShortcut))
onBeforeUnmount(() => window.removeEventListener('keydown', handleSearchShortcut))

defineExpose({ focusSearch: () => searchRef.value?.focus() })
</script>

<style scoped>
.library {
  display: flex;
  flex: none;
  flex-direction: column;
  width: var(--list-width);
  min-height: 0;
  border-right: 1px solid var(--border-default);
  background: var(--surface-secondary);
}

.library__head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 14px 12px 10px 16px;
}

.library__count {
  font-size: var(--font-size-xs);
  color: var(--content-tertiary);
}

.library__spacer {
  flex: 1;
}

.library__icon-button {
  width: 28px;
  padding: 0;
}

.library__filters {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0 12px 10px;
}

.library__category-button {
  align-self: flex-start;
  gap: 6px;
  color: var(--content-secondary);
}

.library__category-button :deep(.n-button__content) {
  gap: 6px;
}

.library__selection {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 8px 8px;
  padding: 6px 8px;
  border-radius: var(--radius-control);
  background: var(--surface-tertiary);
  font-size: var(--font-size-sm);
}

.library__scroll {
  flex: 1;
  min-height: 0;
}

.library__items {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 0 8px 12px;
}

.library-item {
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

.library-item:hover {
  background: var(--surface-tertiary);
}

.library-item:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.library-item.is-active,
.library-item.is-checked {
  background: var(--accent-soft);
}

/* 浅色底和悬停底很接近，当前项的标题再换成选中文字色 */
.library-item.is-active .library-item__name {
  color: var(--accent-soft-text);
}

.library-item__title {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
  line-height: 1.4;
}

.library-item__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.library-item__check {
  flex: none;
}

.library-item__tag {
  height: 18px;
  padding: 0 5px;
}

.library-item__star {
  flex: none;
  color: var(--accent-favorite);
}

.library-item__star :deep(svg) {
  fill: currentColor;
}

.library-item__meta {
  overflow: hidden;
  color: var(--content-tertiary);
  font-size: var(--font-size-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.library__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 32px 20px;
  color: var(--content-tertiary);
  font-size: var(--font-size-sm);
  text-align: center;
}

.library__empty-hint {
  font-size: var(--font-size-xs);
}
</style>
