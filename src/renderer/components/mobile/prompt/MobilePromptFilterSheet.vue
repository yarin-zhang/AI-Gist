<!--
  提示词列表的「筛选与排序」底部面板（V5-M-Filter）。
  每项改动立即生效，列表在面板后面同步刷新；底部按钮显示当前结果数并收起面板。
-->
<template>
  <ion-modal class="m-sheet-modal" :is-open="open" :breakpoints="[0, 0.85, 1]" :initial-breakpoint="0.85"
    :handle="false" :expand-to-scroll="false" @didDismiss="emit('close')">
    <div class="m-sheet filter-sheet" role="dialog" :aria-label="t('mobilePrompt.filterTitle')">
      <div class="m-grab" aria-hidden="true" />
      <header class="filter-sheet__head">
        <button type="button" class="m-btn filter-sheet__reset" :disabled="!hasChanges" @click="emit('reset')">
          {{ t('mobilePrompt.reset') }}
        </button>
        <h2 class="filter-sheet__title">{{ t('mobilePrompt.filterTitle') }}</h2>
        <button type="button" class="m-save" @click="emit('close')">{{ t('mobilePrompt.done') }}</button>
      </header>

      <ion-content class="filter-sheet__content">
        <div class="m-body filter-sheet__body">
          <section class="m-section">
            <span class="m-gt">{{ t('promptLibrary.viewMenu') }}</span>
            <div class="m-seg" role="radiogroup" :aria-label="t('promptLibrary.viewMenu')">
              <button type="button" role="radio" :class="{ on: viewMode === 'waterfall' }"
                :aria-checked="viewMode === 'waterfall'" @click="emit('update:viewMode', 'waterfall')">
                {{ t('mobilePrompt.viewWaterfall') }}
              </button>
              <button type="button" role="radio" :class="{ on: viewMode === 'list' }" :aria-checked="viewMode === 'list'"
                @click="emit('update:viewMode', 'list')">{{ t('mobilePrompt.viewList') }}</button>
            </div>
          </section>

          <section class="m-section">
            <span class="m-gt">{{ t('promptWorkspace.sortBy') }}</span>
            <div class="m-group filter-sheet__group" role="radiogroup" :aria-label="t('promptWorkspace.sortBy')">
              <button v-for="option in sortOptions" :key="option.value" type="button" class="m-row" role="radio"
                :aria-checked="sortType === option.value" @click="emit('update:sortType', option.value)">
                <span class="title">{{ option.label }}</span>
                <span class="end">
                  <ion-icon v-if="sortType === option.value" :icon="checkmark" class="filter-sheet__check" aria-hidden="true" />
                </span>
              </button>
            </div>
          </section>

          <section v-if="categories.length" class="m-section">
            <span class="m-gt">{{ t('promptManagement.category') }}</span>
            <div class="filter-sheet__chips" role="radiogroup" :aria-label="t('promptManagement.category')">
              <button type="button" class="m-chip" role="radio" :class="{ on: category === null }"
                :aria-checked="category === null" @click="emit('update:category', null)">
                {{ t('promptLibrary.allCategories') }}
              </button>
              <button v-for="item in categories" :key="item.id" type="button" class="m-chip" role="radio"
                :class="{ on: category === item.id }" :aria-checked="category === item.id"
                @click="emit('update:category', item.id ?? null)">
                <span class="filter-sheet__dot" :style="{ background: category === item.id ? 'currentColor' : categoryColor(item) }" />
                <span class="filter-sheet__label">{{ item.name }}</span>
              </button>
              <button type="button" class="m-chip" role="radio" :class="{ on: category === 'none' }"
                :aria-checked="category === 'none'" @click="emit('update:category', 'none')">
                {{ t('promptLibrary.uncategorized') }}
              </button>
            </div>
          </section>

          <section v-if="tags.length" class="m-section">
            <span class="m-gt">{{ t('promptManagement.tags') }}</span>
            <div class="filter-sheet__chips" role="radiogroup" :aria-label="t('promptManagement.tags')">
              <button type="button" class="m-chip" role="radio" :class="{ on: tag === null }" :aria-checked="tag === null"
                @click="emit('update:tag', null)">
                {{ t('promptLibrary.allCategories') }}
              </button>
              <button v-for="item in tags" :key="item.name" type="button" class="m-chip" role="radio"
                :class="{ on: tag === item.name }" :aria-checked="tag === item.name" @click="emit('update:tag', item.name)">
                <ion-icon :icon="pricetagOutline" aria-hidden="true" />
                <span class="filter-sheet__label">{{ item.name }}</span>
              </button>
            </div>
          </section>

          <div class="m-group filter-sheet__group">
            <div class="m-row m-row--static">
              <span class="m-tile m-tile--amber" aria-hidden="true"><ion-icon :icon="star" /></span>
              <span class="title">{{ t('promptManagement.favoritesOnly') }}</span>
              <span class="end">
                <ion-toggle :checked="favoritesOnly" :aria-label="t('promptManagement.favoritesOnly')"
                  @ionChange="emit('update:favoritesOnly', $event.detail.checked)" />
              </span>
            </div>
          </div>
        </div>
      </ion-content>

      <footer class="filter-sheet__foot">
        <button type="button" class="m-cta" @click="emit('close')">
          {{ t('mobilePrompt.showResults', { count: resultCount }) }}
        </button>
      </footer>
    </div>
  </ion-modal>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { IonContent, IonIcon, IonModal, IonToggle } from '@ionic/vue'
import { checkmark, pricetagOutline, star } from 'ionicons/icons'
import type { Category } from '@shared/types'
import { useI18n } from '~/composables/useI18n'
import { categoryColor, type MobileCategoryFilter, type MobilePromptSort } from './prompt-meta'

defineProps<{
  open: boolean
  viewMode: 'list' | 'waterfall'
  sortType: MobilePromptSort
  categories: Category[]
  category: MobileCategoryFilter
  tags: { name: string; count: number }[]
  tag: string | null
  favoritesOnly: boolean
  resultCount: number
  hasChanges: boolean
}>()

const emit = defineEmits<{
  close: []
  reset: []
  'update:viewMode': [value: 'list' | 'waterfall']
  'update:sortType': [value: MobilePromptSort]
  'update:category': [value: MobileCategoryFilter]
  'update:tag': [value: string | null]
  'update:favoritesOnly': [value: boolean]
}>()

const { t } = useI18n()

const sortOptions = computed<{ value: MobilePromptSort; label: string }[]>(() => [
  { value: 'updatedAt', label: t('promptWorkspace.sortUpdated') },
  { value: 'createdAt', label: t('mobilePrompt.sortNewest') },
  { value: 'useCount', label: t('promptWorkspace.sortUsage') },
  { value: 'title', label: t('promptWorkspace.sortTitle') },
])
</script>

<style scoped>
.filter-sheet {
  height: 100%;
}

.filter-sheet__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 12px 4px;
}

.filter-sheet__reset {
  min-width: 64px;
  color: var(--content-secondary);
}

.filter-sheet__reset:disabled {
  opacity: 0.45;
}

.filter-sheet__title {
  flex: 1;
  margin: 0;
  color: var(--content-primary);
  font-size: var(--m-font-body);
  font-weight: 600;
  text-align: center;
}

.filter-sheet__content {
  --background: var(--surface-primary);
  flex: 1;
}

.filter-sheet__body {
  gap: 22px;
  padding-top: 12px;
}

/* 面板本身就是白底，分组改用细描边区分 */
.filter-sheet__group {
  box-shadow: inset 0 0 0 1px var(--border-default);
}

.filter-sheet__check {
  color: var(--accent-primary);
  font-size: 20px;
}

.filter-sheet__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

/* 名称很长的分类 / 标签不超出面板，末尾省略 */
.filter-sheet__chips .m-chip {
  min-width: 0;
  max-width: 100%;
}

.filter-sheet__chips ion-icon {
  flex: none;
  font-size: 14px;
}

.filter-sheet__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.filter-sheet__dot {
  width: 8px;
  height: 8px;
  flex: none;
  border-radius: 2px;
}

.filter-sheet__foot {
  padding: 8px var(--m-gutter) calc(env(safe-area-inset-bottom, 0px) + 16px);
  background: var(--surface-primary);
}
</style>
