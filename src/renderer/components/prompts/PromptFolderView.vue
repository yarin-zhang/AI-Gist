<template>
  <div class="folder-view">
    <nav class="folder-nav" :aria-label="t('promptBrowse.folders')">
      <span class="ui-overline folder-nav__label">{{ t('promptBrowse.location') }}</span>
      <!-- 「全部提示词」不是分类，不接受拖放：不调用 preventDefault，浏览器会显示禁止光标，松手也不会移动 -->
      <button type="button" class="folder-item" :class="dropClass(null, 'all')" @click="filters.categoryId = null">
        <NIcon :size="16" class="folder-item__icon"><List /></NIcon>
        <span class="folder-item__name">{{ t('promptBrowse.allPrompts') }}</span>
        <span class="folder-item__count">{{ prompts.length }}</span>
      </button>
      <div class="folder-nav__section">
        <span class="ui-overline">{{ t('promptBrowse.categories') }}</span>
        <NTooltip :show-arrow="false">
          <template #trigger>
            <NButton quaternary size="tiny" class="folder-nav__manage" :aria-label="t('promptLibrary.manageCategories')"
              @click="emit('manage-categories')">
              <template #icon><NIcon :size="14"><Settings /></NIcon></template>
            </NButton>
          </template>
          {{ t('promptLibrary.manageCategories') }}
        </NTooltip>
      </div>
      <!-- 拖动经过时「松开即可移到这里」放在行右侧的气泡里，不占分类名的位置 -->
      <NTooltip v-for="category in categories" :key="category.id" trigger="manual" placement="right" :show-arrow="false"
        :show="dropTarget === `category:${category.id}`">
        <template #trigger>
          <button type="button" class="folder-item"
            :class="dropClass(category.id!, `category:${category.id}`)" :title="category.name" @click="filters.categoryId = category.id!"
            @dragover.prevent="markDrop(`category:${category.id}`)" @dragleave="clearDrop(`category:${category.id}`)"
            @drop.prevent="drop(category.id!)">
            <UiCategoryDot :color="category.color" />
            <span class="folder-item__name">{{ category.name }}</span>
            <span class="folder-item__count">{{ countFor(category.id!) }}</span>
          </button>
        </template>
        {{ t('promptBrowse.dropHere') }}
      </NTooltip>
      <NTooltip trigger="manual" placement="right" :show-arrow="false" :show="dropTarget === 'none'">
        <template #trigger>
          <button type="button" class="folder-item" :class="dropClass('none', 'none')" @click="filters.categoryId = 'none'"
            @dragover.prevent="markDrop('none')" @dragleave="clearDrop('none')" @drop.prevent="drop(null)">
            <UiCategoryDot :color="null" />
            <span class="folder-item__name">{{ t('promptLibrary.uncategorized') }}</span>
            <span class="folder-item__count">{{ countFor('none') }}</span>
          </button>
        </template>
        {{ t('promptBrowse.dropHere') }}
      </NTooltip>
    </nav>

    <section class="folder-main">
      <div class="folder-main__head">
        <nav class="folder-breadcrumb" :aria-label="t('promptBrowse.path')">
          <button v-if="filters.categoryId !== null" type="button" class="folder-breadcrumb__link" @click="filters.categoryId = null">
            {{ t('promptBrowse.allPrompts') }}
          </button>
          <NIcon v-if="filters.categoryId !== null" :size="14" class="folder-breadcrumb__sep"><ChevronRight /></NIcon>
          <span class="folder-breadcrumb__current" :title="currentLabel">{{ currentLabel }}</span>
          <span class="folder-breadcrumb__count">· {{ t('promptBrowse.itemCount', { count: visiblePrompts.length }) }}</span>
        </nav>
        <span class="folder-main__hint">{{ t('promptBrowse.dragHint') }}</span>
      </div>

      <div v-if="!visiblePrompts.length" class="folder-main__empty">
        <span>{{ t('promptLibrary.noResults') }}</span>
        <template v-if="scopeHint">
          <span class="folder-main__empty-hint">{{ scopeHint }}</span>
          <NButton size="small" @click="filters.scope = 'all'">{{ t('promptBrowse.searchAll') }}</NButton>
        </template>
      </div>
      <div v-else class="folder-grid">
        <!-- 单击整张卡片打开（和卡片视图一致）；拖动不会触发 click，两者不冲突。键盘用户 Tab 到标题按钮打开 -->
        <div v-for="prompt in visiblePrompts" :key="prompt.id" class="folder-tile"
          :class="{ 'is-dragging': draggingId === prompt.id, 'is-moving': movingId === prompt.id }" draggable="true"
          @dragstart="startDrag($event, prompt)" @dragend="endDrag" @click="emit('open', prompt)">
          <div class="folder-tile__snippet"><PromptSnippet :content="prompt.content" /></div>
          <div class="folder-tile__title-row">
            <button type="button" class="folder-tile__title" @click.stop="emit('open', prompt)">{{ prompt.title }}</button>
            <NDropdown trigger="click" placement="bottom-end" :options="menu(prompt, Boolean(shortcuts[prompt.uuid]))"
              @select="key => emit('action', key as PromptMenuAction, prompt)">
              <NButton quaternary size="tiny" class="folder-tile__more" :aria-label="t('promptBrowse.actionsFor', { title: prompt.title })"
                @click.stop>
                <template #icon><NIcon :size="14"><Dots /></NIcon></template>
              </NButton>
            </NDropdown>
          </div>
          <span class="folder-tile__meta">{{ tileMeta(prompt) }}</span>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { NButton, NDropdown, NIcon, NTooltip } from 'naive-ui'
import { ChevronRight, Dots, List, Settings } from '@vicons/tabler'
import type { Category, PromptWithRelations } from '@shared/types/database'
import UiCategoryDot from '@/components/ui/UiCategoryDot.vue'
import { usePromptLibraryFilters } from '@/composables/prompt/usePromptLibraryFilters'
import { usePromptMenu, type PromptMenuAction } from '@/composables/prompt/usePromptMenu'
import { getActivePromptVariables } from '@/lib/utils/prompt-template'
import PromptSnippet from './PromptSnippet.vue'

const props = defineProps<{
  /** 已按搜索、范围和标签筛过、但没按分类筛的提示词；分类由左侧文件夹决定 */
  prompts: PromptWithRelations[]
  categories: Category[]
  shortcuts: Record<string, string>
  canSetShortcut: boolean
  movingId?: number | null
}>()

const emit = defineEmits<{
  open: [prompt: PromptWithRelations]
  action: [action: PromptMenuAction, prompt: PromptWithRelations]
  move: [prompt: PromptWithRelations, categoryId: number | null]
  'manage-categories': []
}>()

const { t } = useI18n()
const { filters } = usePromptLibraryFilters()
const menu = usePromptMenu(props.canSetShortcut, () => props.categories)
const draggingId = ref<number | null>(null)
const dropTarget = ref<string | null>(null)

const countFor = (categoryId: number | 'none') => props.prompts.filter(prompt => (
  categoryId === 'none' ? !prompt.categoryId : prompt.categoryId === categoryId
)).length

const visiblePrompts = computed(() => {
  if (filters.categoryId === null) return props.prompts
  return props.prompts.filter(prompt => (
    filters.categoryId === 'none' ? !prompt.categoryId : prompt.categoryId === filters.categoryId
  ))
})

const currentLabel = computed(() => {
  if (filters.categoryId === null) return t('promptBrowse.allPrompts')
  if (filters.categoryId === 'none') return t('promptLibrary.uncategorized')
  return props.categories.find(category => category.id === filters.categoryId)?.name || ''
})

// 只看「最近 / 收藏」时没有结果，提示范围并给出到全部里找的入口
const scopeHint = computed(() => (filters.scope === 'all' ? '' : t('promptBrowse.noResultsInScope', {
  scope: t(filters.scope === 'recent' ? 'promptLibrary.scopeRecent' : 'promptLibrary.scopeFavorites'),
})))

const tileMeta = (prompt: PromptWithRelations) => {
  const count = getActivePromptVariables(prompt).length
  return [
    count ? t('promptLibrary.variableCount', { count }) : t('promptLibrary.noVariables'),
    t('promptPage.usedTimes', { count: prompt.useCount || 0 }),
  ].join(' · ')
}

const dropClass = (value: number | 'none' | null, key: string) => ({
  'is-active': filters.categoryId === value,
  'is-drop-target': dropTarget.value === key,
})

const startDrag = (event: DragEvent, prompt: PromptWithRelations) => {
  draggingId.value = prompt.id ?? null
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(prompt.id))
  }
}

const endDrag = () => {
  draggingId.value = null
  dropTarget.value = null
}

const markDrop = (key: string) => {
  if (draggingId.value !== null) dropTarget.value = key
}

const clearDrop = (key: string) => {
  if (dropTarget.value === key) dropTarget.value = null
}

const drop = (categoryId: number | null) => {
  const prompt = props.prompts.find(item => item.id === draggingId.value)
  endDrag()
  if (prompt) emit('move', prompt, categoryId)
}
</script>

<style scoped>
.folder-view {
  display: flex;
  flex: 1;
  min-height: 0;
}

.folder-nav {
  display: flex;
  flex: none;
  flex-direction: column;
  gap: 2px;
  width: var(--nav-width);
  padding: 12px 8px;
  overflow: auto;
  border-right: 1px solid var(--border-default);
  background: var(--surface-secondary);
}

.folder-nav__label {
  padding: 4px 8px 6px;
}

.folder-nav__section {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 4px 4px 8px;
}

.folder-nav__manage {
  width: 22px;
  padding: 0;
}

.folder-item {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  height: 30px;
  padding: 0 8px;
  border: 0;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--content-primary);
  font: inherit;
  font-size: var(--font-size-base);
  text-align: left;
  cursor: pointer;
}

.folder-item:hover {
  background: var(--surface-tertiary);
}

.folder-item:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.folder-item.is-active {
  background: var(--accent-soft);
  color: var(--accent-soft-text);
  font-weight: var(--font-weight-medium);
}

.folder-item.is-drop-target {
  background: var(--accent-soft);
  outline: 1px solid var(--accent-primary);
  outline-offset: -1px;
}

.folder-item__icon {
  color: var(--content-tertiary);
}

.folder-item__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.folder-item__count {
  margin-left: auto;
  color: var(--content-tertiary);
  font-size: var(--font-size-xs);
  font-variant-numeric: tabular-nums;
}

.folder-main {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
  padding: 16px var(--page-padding-list);
  overflow: auto;
}

.folder-main__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.folder-breadcrumb {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: 100%;
  font-size: var(--font-size-base);
}

.folder-breadcrumb > * {
  flex: none;
}

.folder-breadcrumb__link {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--content-tertiary);
  font: inherit;
  cursor: pointer;
}

.folder-breadcrumb__link:hover {
  color: var(--content-primary);
}

.folder-breadcrumb__sep {
  color: var(--content-muted);
}

/* 分类名太长时省略，前后的「全部提示词」和数量保持完整 */
.folder-breadcrumb > .folder-breadcrumb__current {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  font-weight: var(--font-weight-medium);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.folder-breadcrumb__count,
.folder-main__hint {
  color: var(--content-tertiary);
  font-size: var(--font-size-xs);
}

.folder-main__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 40px 0;
  color: var(--content-tertiary);
  font-size: var(--font-size-sm);
  text-align: center;
}

.folder-main__empty-hint {
  font-size: var(--font-size-xs);
}

.folder-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(220px, 100%), 1fr));
  gap: 12px;
}

.folder-tile {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-panel);
  background: var(--surface-primary);
  cursor: pointer;
}

.folder-tile:hover {
  border-color: var(--border-strong);
  background: var(--surface-secondary);
}

.folder-tile:active {
  cursor: grabbing;
}

.folder-tile.is-dragging,
.folder-tile.is-moving {
  opacity: 0.5;
}

.folder-tile__snippet {
  padding: 8px 10px;
  border-radius: var(--radius-control);
  background: var(--surface-secondary);
}

.folder-tile__title-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.folder-tile__title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--content-primary);
  font: inherit;
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

.folder-tile__title:hover {
  color: var(--accent-text);
}

.folder-tile__more {
  width: 22px;
  padding: 0;
}

.folder-tile__meta {
  color: var(--content-tertiary);
  font-size: var(--font-size-xs);
}
</style>
