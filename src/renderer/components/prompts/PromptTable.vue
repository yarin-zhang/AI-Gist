<template>
  <div class="table-wrap">
    <!-- 面板用 overflow: clip 而不是 hidden：hidden 会让批量栏和表头的 sticky 失效 -->
    <div ref="panelRef" class="ui-panel table-panel" :style="{ '--table-head-top': `${batchHeight}px` }">
      <div v-if="selectedIds.length" ref="batchRef" class="table-panel__batch">
        <span class="table-panel__selected">{{ selectionLabel }}</span>
        <!-- 表头的全选只选已加载的行，没加载的还有时给出选择全部的入口 -->
        <NButton v-if="canSelectAllMatching" text type="primary" size="tiny" @click="selectAllMatching">
          {{ t('promptBrowse.selectAllMatching', { count: prompts.length }, prompts.length) }}
        </NButton>
        <span class="table-panel__spacer" />
        <NDropdown trigger="click" :options="moveOptions" scrollable @select="handleMove">
          <NButton size="tiny">
            <template #icon><NIcon :size="14"><Folder /></NIcon></template>
            {{ t('promptBrowse.moveToCategory') }}
          </NButton>
        </NDropdown>
        <NDropdown trigger="click" :options="exportOptions" @select="format => emit('batch-export', [...selectedIds], format as 'json' | 'csv')">
          <NButton size="tiny">
            <template #icon><NIcon :size="14"><FileExport /></NIcon></template>
            {{ t('promptBrowse.export') }}
          </NButton>
        </NDropdown>
        <NButton size="tiny" type="error" secondary @click="emit('batch-delete', [...selectedIds])">
          <template #icon><NIcon :size="14"><Trash /></NIcon></template>
          {{ t('common.delete') }}
        </NButton>
        <NButton quaternary size="tiny" @click="selectedIds = []">{{ t('promptBrowse.clearSelection') }}</NButton>
      </div>

      <table class="prompt-table">
        <colgroup>
          <col v-for="col in layout.cols" :key="col.key" :style="col.width ? { width: `${col.width}px` } : undefined">
        </colgroup>
        <thead>
          <tr>
            <th class="prompt-table__check">
              <NCheckbox :checked="allChecked" :indeterminate="someChecked" :aria-label="t('promptBrowse.selectAll')"
                @update:checked="toggleAll" />
            </th>
            <th :aria-sort="ariaSort('title')" :title="sortLocked ? recentSortHint : undefined">
              <button type="button" class="prompt-table__sort" :disabled="sortLocked" @click="sortByField('title')">
                <span class="prompt-table__head-text">{{ t('promptManagement.titleLabel') }}</span>
                <NIcon v-if="sortIcon('title')" :size="12"><component :is="sortIcon('title')" /></NIcon>
              </button>
            </th>
            <th v-if="columns.content">{{ t('promptBrowse.content') }}</th>
            <th v-if="columns.category">{{ t('promptBrowse.category') }}</th>
            <th v-if="columns.variables" class="is-number">{{ t('promptBrowse.variables') }}</th>
            <th v-if="columns.shortcut">{{ t('promptBrowse.shortcut') }}</th>
            <th v-if="columns.uses" class="is-number" :aria-sort="ariaSort('usage')" :title="sortLocked ? recentSortHint : undefined">
              <button type="button" class="prompt-table__sort" :disabled="sortLocked" @click="sortByField('usage')">
                <NIcon v-if="sortIcon('usage')" :size="12"><component :is="sortIcon('usage')" /></NIcon>
                <span class="prompt-table__head-text">{{ t('promptBrowse.uses') }}</span>
              </button>
            </th>
            <th v-if="columns.updated" :aria-sort="ariaSort('updated')" :title="sortLocked ? recentSortHint : undefined">
              <button type="button" class="prompt-table__sort" :disabled="sortLocked" @click="sortByField('updated')">
                <span class="prompt-table__head-text">{{ t('promptManagement.updatedLabel') }}</span>
                <NIcon v-if="sortIcon('updated')" :size="12"><component :is="sortIcon('updated')" /></NIcon>
              </button>
            </th>
            <th class="prompt-table__actions"><span class="prompt-table__actions-label">{{ t('promptBrowse.actions') }}</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="prompt in visible" :key="prompt.id" :class="{ 'is-selected': isChecked(prompt) }"
            @click="handleRowClick($event, prompt)">
            <td class="prompt-table__check">
              <NCheckbox :checked="isChecked(prompt)" :aria-label="t('promptBrowse.selectRow', { title: prompt.title })"
                @update:checked="toggle(prompt)" />
            </td>
            <td class="prompt-table__title">
              <span class="prompt-table__title-inner">
                <span class="prompt-table__title-text" :title="prompt.title">{{ prompt.title }}</span>
                <NIcon v-if="prompt.isFavorite" :size="12" class="prompt-table__star"><Star /></NIcon>
              </span>
            </td>
            <td v-if="columns.content" class="prompt-table__content"><PromptSnippet :content="prompt.content" :lines="1" /></td>
            <td v-if="columns.category">
              <span class="ui-tag prompt-table__category" :title="categoryName(prompt)"><UiCategoryDot :color="category(prompt)?.color" />
                <span class="ui-tag__text">{{ categoryName(prompt) }}</span></span>
            </td>
            <td v-if="columns.variables" class="is-number">{{ variableCount(prompt) }}</td>
            <td v-if="columns.shortcut" class="ui-mono prompt-table__shortcut">{{ shortcuts[prompt.uuid] || '—' }}</td>
            <td v-if="columns.uses" class="is-number">{{ prompt.useCount || 0 }}</td>
            <td v-if="columns.updated" class="prompt-table__muted">{{ formatFriendlyDate(prompt.updatedAt, locale, { withTime: false }) }}</td>
            <td class="prompt-table__actions">
              <span class="prompt-table__row-actions">
                <NTooltip :show-arrow="false">
                  <template #trigger>
                    <NButton quaternary size="tiny" class="prompt-table__icon" :aria-label="t('promptBrowse.copyTitle', { title: prompt.title })"
                      @click.stop="emit('action', 'copy', prompt)">
                      <template #icon><NIcon :size="14"><Copy /></NIcon></template>
                    </NButton>
                  </template>
                  {{ t('promptBrowse.copyWithDefaults') }}
                </NTooltip>
                <NDropdown trigger="click" placement="bottom-end" :options="menu(prompt, Boolean(shortcuts[prompt.uuid]))"
                  @select="key => emit('action', key as PromptMenuAction, prompt)">
                  <NButton quaternary size="tiny" class="prompt-table__icon" :aria-label="t('promptBrowse.actionsFor', { title: prompt.title })"
                    @click.stop>
                    <template #icon><NIcon :size="14"><Dots /></NIcon></template>
                  </NButton>
                </NDropdown>
              </span>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="!prompts.length" class="table-panel__empty">
        <span>{{ t('promptLibrary.noResults') }}</span>
        <!-- 只看「最近 / 收藏」时搜不到，给一个到全部里找的入口 -->
        <template v-if="scopeHint">
          <span class="table-panel__empty-hint">{{ scopeHint }}</span>
          <NButton size="small" @click="filters.scope = 'all'">{{ t('promptBrowse.searchAll') }}</NButton>
        </template>
      </div>

      <div class="table-panel__foot">
        <span>{{ prompts.length === total ? t('promptBrowse.totalCount', { count: total }) : t('promptBrowse.filteredCount', { total, count: prompts.length }) }}</span>
        <NButton v-if="visible.length < prompts.length" quaternary size="tiny" @click="limit += PAGE_SIZE">
          {{ t('promptBrowse.loadMore') }}
        </NButton>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, h, onBeforeUnmount, ref, watch, type Component } from 'vue'
import { useI18n } from 'vue-i18n'
import { NButton, NCheckbox, NDropdown, NIcon, NTooltip, type DropdownOption } from 'naive-ui'
import { ArrowDown, ArrowUp, Copy, Dots, FileExport, Folder, Star, Trash } from '@vicons/tabler'
import type { Category, PromptWithRelations } from '@shared/types/database'
import UiCategoryDot from '@/components/ui/UiCategoryDot.vue'
import { useElementWidth } from '@/composables/useElementWidth'
import { usePromptLibraryFilters } from '@/composables/prompt/usePromptLibraryFilters'
import { usePromptMenu, type PromptMenuAction } from '@/composables/prompt/usePromptMenu'
import { formatFriendlyDate } from '@/lib/utils/date'
import type { PromptLibrarySortBy } from '@/lib/utils/prompt-library-sort'
import { getActivePromptVariables } from '@/lib/utils/prompt-template'
import PromptSnippet from './PromptSnippet.vue'

const PAGE_SIZE = 50

const props = defineProps<{
  prompts: PromptWithRelations[]
  total: number
  categories: Category[]
  shortcuts: Record<string, string>
  canSetShortcut: boolean
}>()

const emit = defineEmits<{
  open: [prompt: PromptWithRelations]
  action: [action: PromptMenuAction, prompt: PromptWithRelations]
  'batch-move': [ids: number[], categoryId: number | null]
  'batch-export': [ids: number[], format: 'json' | 'csv']
  'batch-delete': [ids: number[]]
}>()

const { t, locale } = useI18n()
const { filters, sortByField } = usePromptLibraryFilters()
const menu = usePromptMenu(props.canSetShortcut, () => props.categories)
const panelRef = ref<HTMLElement>()
const width = useElementWidth(panelRef)
const limit = ref(PAGE_SIZE)
const selectedIds = ref<number[]>([])

const visible = computed(() => props.prompts.slice(0, limit.value))
const categoryById = computed(() => new Map(props.categories.map(item => [item.id, item])))
const category = (prompt: PromptWithRelations) => (prompt.categoryId ? categoryById.value.get(prompt.categoryId) : undefined)
const categoryName = (prompt: PromptWithRelations) => category(prompt)?.name || t('promptLibrary.uncategorized')
const variableCount = (prompt: PromptWithRelations) => getActivePromptVariables(prompt).length

// ---------- 列宽 ----------
// 表格用固定布局：定宽列按下面的宽度，标题和内容两列分剩下的空间，内容摘要不会再把表格撑宽。
// 放不下时按优先级从低到高收起次要列（内容、快捷键、变量、更新时间、分类、使用次数），
// 勾选、标题和行操作始终保留（#386）。列是按实际宽度算出来的，表格不会横向溢出，行操作总在可视区里。
const COLUMN_WIDTHS = { check: 40, actions: 72, uses: 96, category: 160, updated: 120, variables: 84, shortcut: 120 }
const TITLE_MIN = 180
const TITLE_MAX = 360
const CONTENT_MIN = 240
type OptionalColumn = 'uses' | 'category' | 'updated' | 'variables' | 'shortcut' | 'content'
const COLUMN_PRIORITY: OptionalColumn[] = ['uses', 'category', 'updated', 'variables', 'shortcut', 'content']

const layout = computed(() => {
  const available = width.value || 1400
  const columns: Record<OptionalColumn, boolean> = { uses: false, category: false, updated: false, variables: false, shortcut: false, content: false }
  let used = COLUMN_WIDTHS.check + COLUMN_WIDTHS.actions + TITLE_MIN
  for (const key of COLUMN_PRIORITY) {
    if (key === 'shortcut' && !props.canSetShortcut) continue
    const need = key === 'content' ? CONTENT_MIN : COLUMN_WIDTHS[key]
    if (used + need > available) break
    columns[key] = true
    used += need
  }

  const fixed = (Object.keys(columns) as OptionalColumn[])
    .filter(key => columns[key] && key !== 'content')
    .reduce((sum, key) => sum + COLUMN_WIDTHS[key as Exclude<OptionalColumn, 'content'>], COLUMN_WIDTHS.check + COLUMN_WIDTHS.actions)
  const flexible = available - fixed
  // 有内容列时标题列给一个定宽（约四成），其余给内容；没有内容列时标题列占满剩余
  const title = columns.content
    ? Math.round(Math.min(TITLE_MAX, flexible - CONTENT_MIN, Math.max(TITLE_MIN, flexible * 0.4)))
    : undefined

  const cols: { key: string; width?: number }[] = [
    { key: 'check', width: COLUMN_WIDTHS.check },
    { key: 'title', width: title },
    ...(columns.content ? [{ key: 'content' }] : []),
    ...(['category', 'variables', 'shortcut', 'uses', 'updated'] as const)
      .filter(key => columns[key])
      .map(key => ({ key, width: COLUMN_WIDTHS[key] })),
    { key: 'actions', width: COLUMN_WIDTHS.actions },
  ]
  return { columns, cols }
})
const columns = computed(() => layout.value.columns)

// ---------- 排序 ----------
// 列头和页头的排序按钮是同一个状态；「最近」固定按更新时间从新到旧，列头只显示方向、不能点
const sortLocked = computed(() => filters.scope === 'recent')
const sortIcon = (field: PromptLibrarySortBy): Component | null => {
  const sortBy = sortLocked.value ? 'updated' : filters.sortBy
  if (sortBy !== field) return null
  return !sortLocked.value && filters.sortOrder === 'asc' ? ArrowUp : ArrowDown
}
const ariaSort = (field: PromptLibrarySortBy) => {
  if (!sortIcon(field)) return 'none'
  return sortIcon(field) === ArrowUp ? 'ascending' : 'descending'
}
const recentSortHint = computed(() => t('promptBrowse.recentSortHint', {
  recent: t('promptLibrary.scopeRecent'),
  all: t('promptLibrary.scopeAll'),
  favorites: t('promptLibrary.scopeFavorites'),
}))

const scopeHint = computed(() => (filters.scope === 'all' ? '' : t('promptBrowse.noResultsInScope', {
  scope: t(filters.scope === 'recent' ? 'promptLibrary.scopeRecent' : 'promptLibrary.scopeFavorites'),
})))

// ---------- 选择 ----------
const isChecked = (prompt: PromptWithRelations) => Boolean(prompt.id && selectedIds.value.includes(prompt.id))
const toggle = (prompt: PromptWithRelations) => {
  if (!prompt.id) return
  selectedIds.value = isChecked(prompt) ? selectedIds.value.filter(id => id !== prompt.id) : [...selectedIds.value, prompt.id]
}
const allChecked = computed(() => visible.value.length > 0 && visible.value.every(isChecked))
const someChecked = computed(() => !allChecked.value && visible.value.some(isChecked))
const toggleAll = (checked: boolean) => {
  selectedIds.value = checked ? visible.value.map(prompt => prompt.id!).filter(Boolean) : []
}

const hasUnloaded = computed(() => visible.value.length < props.prompts.length)
const allSelected = computed(() => props.prompts.length > 0 && selectedIds.value.length >= props.prompts.length)
const canSelectAllMatching = computed(() => hasUnloaded.value && allChecked.value && !allSelected.value)
const selectAllMatching = () => {
  selectedIds.value = props.prompts.map(prompt => prompt.id!).filter(Boolean)
}
const selectionLabel = computed(() => {
  const count = selectedIds.value.length
  if (allSelected.value && hasUnloaded.value) return t('promptBrowse.selectedAll', { count }, count)
  if (canSelectAllMatching.value && count === visible.value.length) return t('promptBrowse.selectedLoaded', { count }, count)
  return t('promptLibrary.selectedCount', { count }, count)
})

// 批量栏吸顶，表头吸在批量栏下面：量出批量栏的高度（换行时会变高）
const batchRef = ref<HTMLElement>()
const batchHeight = ref(0)
let batchObserver: ResizeObserver | null = null
watch(batchRef, (element) => {
  batchObserver?.disconnect()
  batchObserver = null
  batchHeight.value = element?.offsetHeight || 0
  if (!element) return
  batchObserver = new ResizeObserver(() => { batchHeight.value = element.offsetHeight })
  batchObserver.observe(element)
}, { flush: 'post' })
onBeforeUnmount(() => batchObserver?.disconnect())

const handleRowClick = (event: MouseEvent, prompt: PromptWithRelations) => {
  if ((event.target as HTMLElement).closest('button, a, input, label, .n-checkbox')) return
  emit('open', prompt)
}

const dot = (color?: string | null) => () => h(UiCategoryDot, { color })
const moveOptions = computed<DropdownOption[]>(() => [
  ...props.categories.map(item => ({ key: item.id!, label: item.name, icon: dot(item.color) })),
  { type: 'divider', key: 'divider' },
  { key: 'none', label: t('promptLibrary.uncategorized'), icon: dot(null) },
])
const exportOptions = computed<DropdownOption[]>(() => [
  { key: 'json', label: t('promptBrowse.exportJson') },
  { key: 'csv', label: t('promptBrowse.exportCsv') },
])

const handleMove = (key: string | number) => {
  emit('batch-move', [...selectedIds.value], key === 'none' ? null : Number(key))
}

// 列表变化后清掉已经不在列表里的选择
watch(() => props.prompts, prompts => {
  const ids = new Set(prompts.map(prompt => prompt.id))
  selectedIds.value = selectedIds.value.filter(id => ids.has(id))
})

defineExpose({ clearSelection: () => { selectedIds.value = [] } })
</script>

<style scoped>
.table-wrap {
  --table-wrap-padding: 20px;
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: var(--table-wrap-padding) var(--page-padding-list);
}

.table-panel {
  overflow: clip;
}

/*
 * 批量栏吸在滚动区顶部，表头吸在它下面（--table-head-top 是批量栏的实际高度）。
 * sticky 的偏移从滚动区的内容边算起，减掉上内边距才能贴住可视区顶边，不留一条漏出行的缝。
 */
.table-panel__batch {
  position: sticky;
  top: calc(-1 * var(--table-wrap-padding));
  z-index: 2;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-default);
  background: var(--surface-tertiary);
}

.table-panel__selected {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
}

.table-panel__spacer {
  flex: 1;
}

.prompt-table {
  width: 100%;
  table-layout: fixed;
  border-collapse: separate;
  border-spacing: 0;
  font-size: var(--font-size-base);
}

.prompt-table th {
  position: sticky;
  top: calc(var(--table-head-top, 0px) - var(--table-wrap-padding));
  z-index: 1;
  height: 36px;
  padding: 0 12px;
  border-bottom: 1px solid var(--border-default);
  background: var(--surface-secondary);
  color: var(--content-secondary);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  text-align: left;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.prompt-table td {
  height: 44px;
  padding: 0 12px;
  overflow: hidden;
  border-bottom: 1px solid var(--border-subtle);
  color: var(--content-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.prompt-table tbody tr {
  cursor: pointer;
}

.prompt-table tbody tr:last-child td {
  border-bottom: 0;
}

.prompt-table tbody tr:hover td {
  background: var(--surface-secondary);
}

.prompt-table tbody tr.is-selected td {
  background: var(--accent-soft);
}

.prompt-table .is-number {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.prompt-table__check {
  width: 40px;
}

.prompt-table__title {
  font-weight: var(--font-weight-medium);
}

.prompt-table__title-inner {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.prompt-table__title-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.prompt-table__star {
  flex: none;
  color: var(--accent-favorite);
}

.prompt-table__star :deep(svg) {
  fill: currentColor;
}

.prompt-table__category {
  vertical-align: middle;
}

.prompt-table__shortcut {
  color: var(--content-secondary);
  font-size: var(--font-size-xs);
}

.prompt-table__muted {
  color: var(--content-tertiary);
  font-size: var(--font-size-sm);
}

.prompt-table__sort {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.prompt-table__sort:hover:not(:disabled) {
  color: var(--content-primary);
}

.prompt-table__sort:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.prompt-table__sort:disabled {
  cursor: default;
}

.prompt-table__sort > * {
  flex: none;
}

.prompt-table__sort > .prompt-table__head-text {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.prompt-table__actions-label {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-normal);
}

.prompt-table__row-actions {
  display: flex;
  gap: 2px;
}

.prompt-table__icon {
  width: 22px;
  padding: 0;
}

.table-panel__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 40px 0;
  color: var(--content-tertiary);
  font-size: var(--font-size-sm);
  text-align: center;
}

.table-panel__empty-hint {
  font-size: var(--font-size-xs);
}

.table-panel__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-top: 1px solid var(--border-default);
  color: var(--content-tertiary);
  font-size: var(--font-size-sm);
}
</style>
