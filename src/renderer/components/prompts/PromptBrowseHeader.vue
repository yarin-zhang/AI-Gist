<template>
  <div class="browse-header">
    <header class="browse-header__top">
      <div class="browse-header__title">
        <h1 class="ui-title-section">{{ t('promptLibrary.title') }}</h1>
        <!-- 有搜索或筛选时显示「命中 / 总数」，和表格底部的计数一致 -->
        <span class="browse-header__count" :title="countTitle">{{ matchedCount === total ? total : `${matchedCount} / ${total}` }}</span>
      </div>
      <UiSegmented :model-value="view" :options="viewOptions" :label="t('promptLibrary.viewMenu')"
        @update:model-value="value => emit('change-view', value)" />
      <span class="browse-header__spacer" />
      <NButton quaternary class="browse-header__collapsible" @click="emit('manage-categories')">
        <template #icon><NIcon :size="16"><Folders /></NIcon></template>
        <span class="browse-header__label">{{ t('promptLibrary.manageCategories') }}</span>
      </NButton>
      <NButton type="primary" class="browse-header__collapsible" @click="emit('create')">
        <template #icon><NIcon :size="16"><Plus /></NIcon></template>
        <span class="browse-header__label">{{ t('promptBrowse.create') }}</span>
      </NButton>
    </header>

    <div class="browse-header__filters">
      <NInput v-model:value="filters.query" clearable class="browse-header__search" :placeholder="t('promptLibrary.searchPlaceholder')"
        :input-props="{ 'aria-label': t('promptLibrary.search') }">
        <template #prefix><NIcon :size="14"><Search /></NIcon></template>
      </NInput>
      <UiSegmented v-model="filters.scope" :label="t('promptLibrary.scope')" :options="scopeOptions" />

      <NPopover trigger="click" placement="bottom-start" :show-arrow="false" class="browse-filter-popover"
        :show="filterOpen" @update:show="value => (filterOpen = value)">
        <template #trigger>
          <NButton ref="filterButtonRef" :aria-expanded="filterOpen">
            <template #icon><NIcon :size="16"><Filter /></NIcon></template>
            {{ t('promptBrowse.filter') }}
            <UiCount v-if="activeCount" class="browse-header__filter-count" tone="primary" :value="activeCount" />
          </NButton>
        </template>
        <div class="browse-filter">
          <span class="ui-overline">{{ t('promptBrowse.categories') }}</span>
          <div class="browse-filter__options">
            <button v-for="option in categoryChoices" :key="String(option.value)" type="button" class="browse-filter__chip"
              :class="{ 'is-active': filters.categoryId === option.value }" :title="option.label" @click="filters.categoryId = option.value">
              <UiCategoryDot v-if="option.value !== null" :color="option.color" /><span class="browse-filter__text">{{ option.label }}</span>
            </button>
          </div>
          <template v-if="tags.length">
            <span class="ui-overline">{{ t('promptBrowse.tags') }}</span>
            <span class="ui-help browse-filter__help">{{ t('promptBrowse.tagsMatchAll') }}</span>
            <div class="browse-filter__options">
              <button v-for="tag in tags" :key="tag.name" type="button" class="browse-filter__chip"
                :class="{ 'is-active': filters.tags.includes(tag.name) }" :title="`#${tag.name}`" @click="toggleTag(tag.name)">
                <span class="browse-filter__text">#{{ tag.name }}</span><span class="browse-filter__count">{{ tag.count }}</span>
              </button>
            </div>
          </template>
          <NButton v-if="activeCount" quaternary size="tiny" class="browse-filter__clear" @click="clearFilters">
            {{ t('promptLibrary.clearFilters') }}
          </NButton>
        </div>
      </NPopover>

      <span v-if="activeCategoryLabel" class="ui-tag ui-tag--line browse-header__chip"
        :title="t('promptLibrary.categoryFilter', { name: activeCategoryLabel })">
        <span class="ui-tag__text">{{ t('promptLibrary.categoryFilter', { name: activeCategoryLabel }) }}</span>
        <button type="button" class="browse-header__remove" :aria-label="t('promptBrowse.removeFilter')" @click="filters.categoryId = null">
          <NIcon :size="12"><X /></NIcon>
        </button>
      </span>
      <span v-for="tag in filters.tags" :key="tag" class="ui-tag ui-tag--line browse-header__chip" :title="t('promptBrowse.tagFilter', { name: tag })">
        <span class="ui-tag__text">{{ t('promptBrowse.tagFilter', { name: tag }) }}</span>
        <button type="button" class="browse-header__remove" :aria-label="t('promptBrowse.removeFilter')" @click="toggleTag(tag)">
          <NIcon :size="12"><X /></NIcon>
        </button>
      </span>
      <!-- 排序按钮靠右；窄窗口折到第二行时也靠右，不会孤零零地落在左边 -->
      <!-- 「最近」固定按更新时间排列：按钮如实显示，并用提示说明为什么不能改；禁用的按钮收不到鼠标事件，提示挂在外层 -->
      <NTooltip v-if="sortLocked" :show-arrow="false" placement="bottom-end">
        <template #trigger>
          <span class="browse-header__sort-locked browse-header__sort" role="button" aria-disabled="true" tabindex="0" :aria-label="`${sortButtonLabel} · ${sortDirectionLabel} · ${recentSortHint}`">
            <NButton quaternary disabled tabindex="-1">
              <template #icon><NIcon :size="16"><SortDescending /></NIcon></template>
              {{ sortButtonLabel }}
            </NButton>
          </span>
        </template>
        {{ recentSortHint }}
      </NTooltip>
      <NDropdown v-else trigger="click" placement="bottom-end" :options="sortOptions" @select="handleSortSelect">
        <NButton quaternary class="browse-header__sort" :aria-label="`${sortButtonLabel} · ${sortDirectionLabel}`">
          <template #icon><NIcon :size="16"><component :is="filters.sortOrder === 'asc' ? SortAscending : SortDescending" /></NIcon></template>
          {{ sortButtonLabel }}
          <NIcon :size="14" class="browse-header__chevron"><ChevronDown /></NIcon>
        </NButton>
      </NDropdown>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, h, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { NButton, NDropdown, NIcon, NInput, NPopover, NTooltip, type DropdownOption } from 'naive-ui'
import {
  Check, ChevronDown, Filter, Folder, Folders, LayoutCards, LayoutSidebarRight, Plus, Search, SortAscending, SortDescending, Table, X,
} from '@vicons/tabler'
import type { Category as PromptCategory, PromptWithRelations } from '@shared/types/database'
import UiCategoryDot from '@/components/ui/UiCategoryDot.vue'
import UiCount from '@/components/ui/UiCount.vue'
import UiSegmented from '@/components/ui/UiSegmented.vue'
import { usePromptLibraryFilters } from '@/composables/prompt/usePromptLibraryFilters'
import { collectPromptTags, countActiveFilters, filterPromptLibrary, type PromptCategoryFilter } from '@/lib/utils/prompt-library'
import { isEscapeConsumed } from '@/lib/utils/escape-layers'
import { PROMPT_LIBRARY_SORT_FIELDS, type PromptLibrarySortBy, type PromptLibrarySortOrder } from '@/lib/utils/prompt-library-sort'
import type { PromptDisplayMode } from './types'

const props = defineProps<{
  view: PromptDisplayMode
  /** 提示词总数（未筛选） */
  total: number
  prompts: PromptWithRelations[]
  categories: PromptCategory[]
}>()

const emit = defineEmits<{
  'change-view': [mode: PromptDisplayMode]
  'manage-categories': []
  create: []
}>()

const { t } = useI18n()
const { filters, toggleTag, sortByField } = usePromptLibraryFilters()

const viewOptions = computed(() => [
  { value: 'workspace' as PromptDisplayMode, label: t('promptLibrary.viewWorkspace'), icon: LayoutSidebarRight },
  { value: 'grid' as PromptDisplayMode, label: t('promptLibrary.viewCards'), icon: LayoutCards },
  { value: 'table' as PromptDisplayMode, label: t('promptLibrary.viewTable'), icon: Table },
  { value: 'tree' as PromptDisplayMode, label: t('promptLibrary.viewFolders'), icon: Folder },
])

const scopeOptions = computed(() => [
  { value: 'all' as const, label: t('promptLibrary.scopeAll') },
  { value: 'recent' as const, label: t('promptLibrary.scopeRecent') },
  { value: 'favorites' as const, label: t('promptLibrary.scopeFavorites') },
])

const categoryChoices = computed<Array<{ value: PromptCategoryFilter; label: string; color?: string | null }>>(() => [
  { value: null, label: t('promptLibrary.allCategories') },
  ...props.categories.map(category => ({ value: category.id!, label: category.name, color: category.color })),
  { value: 'none', label: t('promptLibrary.uncategorized'), color: null },
])

const tags = computed(() => collectPromptTags(props.prompts).slice(0, 30))
const matchedCount = computed(() => filterPromptLibrary(props.prompts, filters).length)
const countTitle = computed(() => (matchedCount.value === props.total
  ? t('promptBrowse.totalCount', { count: props.total }, props.total)
  : t('promptBrowse.filteredCount', { total: props.total, count: matchedCount.value })))

// ---------- 筛选气泡：Esc 收起，焦点回到「筛选」按钮 ----------
const filterOpen = ref(false)
const filterButtonRef = ref<InstanceType<typeof NButton>>()
const closeFilterOnEscape = (event: KeyboardEvent) => {
  if (event.key !== 'Escape' || isEscapeConsumed(event)) return
  event.preventDefault()
  filterOpen.value = false
  ;(filterButtonRef.value?.$el as HTMLElement | undefined)?.focus()
}
watch(filterOpen, open => {
  if (open) document.addEventListener('keydown', closeFilterOnEscape)
  else document.removeEventListener('keydown', closeFilterOnEscape)
})
onBeforeUnmount(() => document.removeEventListener('keydown', closeFilterOnEscape))
const activeCount = computed(() => countActiveFilters(filters))
const activeCategoryLabel = computed(() => {
  if (filters.categoryId === null) return ''
  if (filters.categoryId === 'none') return t('promptLibrary.uncategorized')
  return props.categories.find(category => category.id === filters.categoryId)?.name || ''
})

// ---------- 排序 ----------
const sortLocked = computed(() => filters.scope === 'recent')
const effectiveSortBy = computed<PromptLibrarySortBy>(() => (sortLocked.value ? 'updated' : filters.sortBy))
const effectiveSortOrder = computed<PromptLibrarySortOrder>(() => (sortLocked.value ? 'desc' : filters.sortOrder))

const sortFieldLabel = (field: PromptLibrarySortBy) => t(`promptBrowse.sortField.${field}`)
/** 方向的说法跟着字段走：时间说新旧，使用次数说多少，标题说字母顺序 */
const directionLabel = (field: PromptLibrarySortBy, order: PromptLibrarySortOrder) => {
  if (field === 'title') return t(order === 'asc' ? 'promptBrowse.sortDirection.az' : 'promptBrowse.sortDirection.za')
  if (field === 'usage') return t(order === 'asc' ? 'promptBrowse.sortDirection.least' : 'promptBrowse.sortDirection.most')
  return t(order === 'asc' ? 'promptBrowse.sortDirection.oldest' : 'promptBrowse.sortDirection.newest')
}

const sortButtonLabel = computed(() => t('promptBrowse.sortButton', { field: sortFieldLabel(effectiveSortBy.value) }))
const sortDirectionLabel = computed(() => directionLabel(effectiveSortBy.value, effectiveSortOrder.value))
const recentSortHint = computed(() => t('promptBrowse.recentSortHint', {
  recent: t('promptLibrary.scopeRecent'),
  all: t('promptLibrary.scopeAll'),
  favorites: t('promptLibrary.scopeFavorites'),
}))

// 当前字段和方向前面打勾；没打勾的选项留出同样的图标位，文字仍然对齐
const checkIcon = (checked: boolean) => (checked ? () => h(NIcon, { size: 16 }, { default: () => h(Check) }) : undefined)
const sortOptions = computed<DropdownOption[]>(() => [
  ...PROMPT_LIBRARY_SORT_FIELDS.map(field => ({
    key: `field:${field}`,
    label: sortFieldLabel(field),
    icon: checkIcon(filters.sortBy === field),
  })),
  { type: 'divider', key: 'divider' },
  ...(['desc', 'asc'] as PromptLibrarySortOrder[]).map(order => ({
    key: `order:${order}`,
    label: directionLabel(filters.sortBy, order),
    icon: checkIcon(filters.sortOrder === order),
  })),
])

const handleSortSelect = (key: string | number) => {
  const [kind, value] = String(key).split(':')
  if (kind === 'field' && value !== filters.sortBy) sortByField(value as PromptLibrarySortBy)
  else if (kind === 'order') filters.sortOrder = value as PromptLibrarySortOrder
}

const clearFilters = () => {
  filters.categoryId = null
  filters.tags = []
}
</script>

<style scoped>
.browse-header {
  display: flex;
  flex: none;
  flex-direction: column;
}

.browse-header__top {
  display: flex;
  align-items: center;
  gap: 16px;
  min-height: var(--page-header-height);
  padding: 0 var(--page-padding-list);
  border-bottom: 1px solid var(--border-default);
}

.browse-header__title {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.browse-header__count,
.browse-filter__count {
  color: var(--content-tertiary);
  font-size: var(--font-size-xs);
}

.browse-header__spacer {
  flex: 1;
}

.browse-header__filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  min-height: 52px;
  padding: 8px var(--page-padding-list);
  border-bottom: 1px solid var(--border-default);
}

/* 窄窗口下搜索框先变窄，筛选行尽量不折成两行 */
.browse-header__search {
  width: clamp(272px, 30vw, 320px);
  max-width: 100%;
}

.browse-header__filter-count {
  margin-left: 6px;
}

/* 筛选标签里是用户起的分类名、标签名，太长时省略，悬停看全名 */
.browse-header__chip {
  max-width: 240px;
}

.browse-header__remove {
  display: inline-flex;
  padding: 0;
  border: 0;
  border-radius: 3px;
  background: transparent;
  color: var(--content-tertiary);
  cursor: pointer;
}

.browse-header__remove:hover {
  color: var(--content-primary);
}

/* 标签本身裁剪溢出，外扩的焦点环会被切掉，改成在按钮内部标出 */
.browse-header__remove:focus-visible {
  outline: none;
  background: var(--surface-tertiary);
  color: var(--content-primary);
}

.browse-header__sort {
  margin-left: auto;
}

.browse-header__sort-locked {
  display: inline-flex;
  border-radius: var(--radius-control);
}

.browse-header__sort-locked:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.browse-header__chevron {
  margin-left: 4px;
}

.browse-filter {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 320px;
  padding: 4px;
}

.browse-filter__options {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.browse-filter__chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  height: 26px;
  padding: 0 10px;
  border: 1px solid var(--border-default);
  border-radius: 13px;
  background: var(--surface-primary);
  color: var(--content-secondary);
  font: inherit;
  font-size: var(--font-size-sm);
  cursor: pointer;
}

.browse-filter__chip:hover {
  border-color: var(--border-strong);
  color: var(--content-primary);
}

.browse-filter__chip > * {
  flex: none;
}

.browse-filter__chip > .browse-filter__text {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.browse-filter__chip.is-active {
  border-color: var(--accent-soft-border);
  background: var(--accent-soft);
  color: var(--accent-soft-text);
}

.browse-filter__help {
  margin-top: -4px;
}

.browse-filter__clear {
  align-self: flex-start;
}

@media (max-width: 1100px) {
  .browse-header__label {
    display: none;
  }

  .browse-header__collapsible {
    width: 28px;
    padding: 0;
  }
}
</style>
