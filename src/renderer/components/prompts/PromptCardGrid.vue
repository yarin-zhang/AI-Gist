<template>
  <div class="card-grid-wrap">
    <div v-if="!prompts.length" class="card-grid__empty">
      <UiEmptyState :title="t('promptLibrary.noResults')" :description="scopeHint || t('promptBrowse.noResultsHint')">
        <template #icon><NIcon :size="18"><Search /></NIcon></template>
        <!-- 只看「最近 / 收藏」时搜不到，给一个到全部里找的入口，免得以为提示词不见了 -->
        <template v-if="scopeHint" #actions>
          <NButton @click="filters.scope = 'all'">{{ t('promptBrowse.searchAll') }}</NButton>
        </template>
      </UiEmptyState>
    </div>
    <div v-else class="card-grid">
      <article v-for="prompt in visible" :key="prompt.id" class="prompt-card" tabindex="0" role="button"
        :aria-label="prompt.title" @click="emit('open', prompt)" @keydown.enter.prevent="emit('open', prompt)">
        <div class="prompt-card__head">
          <div class="prompt-card__titles">
            <span class="prompt-card__title">{{ prompt.title }}</span>
            <span v-if="prompt.description" class="prompt-card__description">{{ prompt.description }}</span>
          </div>
          <NIcon v-if="prompt.isFavorite" :size="14" class="prompt-card__star" :aria-label="t('promptLibrary.favorited')"><Star /></NIcon>
          <NDropdown trigger="click" placement="bottom-end" :options="menu(prompt, Boolean(shortcuts[prompt.uuid]))"
            @select="key => emit('action', key as PromptMenuAction, prompt)">
            <NButton quaternary size="tiny" class="prompt-card__more" :aria-label="t('promptBrowse.actionsFor', { title: prompt.title })"
              @click.stop>
              <template #icon><NIcon :size="14"><Dots /></NIcon></template>
            </NButton>
          </NDropdown>
        </div>
        <div class="prompt-card__snippet"><PromptSnippet :content="prompt.content" /></div>
        <div class="prompt-card__foot">
          <span class="prompt-card__taxonomy">
            <span class="ui-tag prompt-card__category" :title="categoryName(prompt)">
              <UiCategoryDot :color="category(prompt)?.color" /><span class="ui-tag__text">{{ categoryName(prompt) }}</span>
            </span>
            <UiKbd v-if="shortcuts[prompt.uuid]">{{ shortcuts[prompt.uuid] }}</UiKbd>
          </span>
          <span class="prompt-card__uses">{{ t('promptPage.usedTimes', { count: prompt.useCount || 0 }) }}</span>
        </div>
      </article>
    </div>
    <div v-if="visible.length < prompts.length" class="card-grid__more">
      <NButton quaternary size="small" @click="limit += PAGE_SIZE">{{ t('promptBrowse.loadMore') }}</NButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { NButton, NDropdown, NIcon } from 'naive-ui'
import { Dots, Search, Star } from '@vicons/tabler'
import type { Category, PromptWithRelations } from '@shared/types/database'
import UiCategoryDot from '@/components/ui/UiCategoryDot.vue'
import UiEmptyState from '@/components/ui/UiEmptyState.vue'
import UiKbd from '@/components/ui/UiKbd.vue'
import { usePromptLibraryFilters } from '@/composables/prompt/usePromptLibraryFilters'
import { usePromptMenu, type PromptMenuAction } from '@/composables/prompt/usePromptMenu'
import PromptSnippet from './PromptSnippet.vue'

const PAGE_SIZE = 60

const props = defineProps<{
  prompts: PromptWithRelations[]
  categories: Category[]
  /** 提示词 uuid → 显示用的快捷键 */
  shortcuts: Record<string, string>
  canSetShortcut: boolean
}>()

const emit = defineEmits<{
  open: [prompt: PromptWithRelations]
  action: [action: PromptMenuAction, prompt: PromptWithRelations]
}>()

const { t } = useI18n()
const { filters } = usePromptLibraryFilters()
const menu = usePromptMenu(props.canSetShortcut, () => props.categories)
const limit = ref(PAGE_SIZE)
const visible = computed(() => props.prompts.slice(0, limit.value))
const categoryById = computed(() => new Map(props.categories.map(item => [item.id, item])))
const category = (prompt: PromptWithRelations) => (prompt.categoryId ? categoryById.value.get(prompt.categoryId) : undefined)
const categoryName = (prompt: PromptWithRelations) => category(prompt)?.name || t('promptLibrary.uncategorized')

const scopeHint = computed(() => (filters.scope === 'all' ? '' : t('promptBrowse.noResultsInScope', {
  scope: t(filters.scope === 'recent' ? 'promptLibrary.scopeRecent' : 'promptLibrary.scopeFavorites'),
})))

// 只在搜索、范围、分类、标签或排序变了时收回到第一页；删除、移动一张卡片时保留已经加载的数量，看的位置不会跳走
watch(() => JSON.stringify([filters.query, filters.scope, filters.categoryId, filters.tags, filters.sortBy, filters.sortOrder]), () => {
  limit.value = PAGE_SIZE
})
</script>

<style scoped>
.card-grid-wrap {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 20px var(--page-padding-list);
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(280px, 100%), 1fr));
  gap: 16px;
}

.card-grid__empty {
  display: flex;
  justify-content: center;
  padding-top: 60px;
}

.card-grid__more {
  display: flex;
  justify-content: center;
  padding-top: 16px;
}

.prompt-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  padding: 14px 16px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-panel);
  background: var(--surface-primary);
  cursor: pointer;
}

.prompt-card:hover {
  border-color: var(--border-strong);
  background: var(--surface-secondary);
}

.prompt-card:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.prompt-card__head {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.prompt-card__titles {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.prompt-card__title {
  overflow: hidden;
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.prompt-card__description {
  overflow: hidden;
  color: var(--content-tertiary);
  font-size: var(--font-size-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.prompt-card__star {
  flex: none;
  margin-top: 3px;
  color: var(--accent-favorite);
}

.prompt-card__star :deep(svg) {
  fill: currentColor;
}

.prompt-card__more {
  width: 22px;
  margin: -2px -6px 0 0;
  padding: 0;
  opacity: 0;
}

.prompt-card:hover .prompt-card__more,
.prompt-card:focus-within .prompt-card__more {
  opacity: 1;
}

.prompt-card__snippet {
  padding: 8px 10px;
  border-radius: var(--radius-control);
  background: var(--surface-secondary);
}

.prompt-card:hover .prompt-card__snippet {
  background: var(--surface-primary);
}

.prompt-card__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

/* 分类名太长时在这里省略，「使用 N 次」始终完整显示 */
.prompt-card__taxonomy {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.prompt-card__uses {
  flex: none;
  color: var(--content-tertiary);
  font-size: var(--font-size-xs);
}
</style>
