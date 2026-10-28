<!--
  提示词列表的瀑布流显示方式：两列卡片，按估算高度贪心分配到较矮的一列。
  有附图的提示词以第一张图作封面。
-->
<template>
  <div class="waterfall">
    <div v-for="(column, columnIndex) in [leftColumn, rightColumn]" :key="columnIndex" class="waterfall__column">
      <button v-for="item in column" :key="item.prompt.id" type="button" class="m-card waterfall__card"
        @click="emit('view', item.prompt)">
        <img v-if="item.imageUrl" :src="item.imageUrl" class="waterfall__image" loading="lazy" alt="" />
        <span class="waterfall__content">
          <span class="waterfall__title-row">
            <span class="waterfall__title">{{ promptDisplayTitle(item.prompt, t('promptLibrary.untitled'), 40) }}</span>
            <ion-icon v-if="item.prompt.isFavorite" :icon="star" class="waterfall__star"
              :aria-label="t('promptLibrary.favorited')" />
          </span>
          <span v-if="promptSnippet(item.prompt)" class="waterfall__desc">{{ promptSnippet(item.prompt) }}</span>
          <span class="waterfall__meta">
            <span v-if="item.variableCount" class="m-pill m-pill-var">{{ t('promptLibrary.variableCount', { count: item.variableCount }) }}</span>
            <span class="waterfall__category">
              <span class="waterfall__dot" :style="{ background: categoryColor(categoryOf(item.prompt)) }" aria-hidden="true" />
              {{ categoryOf(item.prompt)?.name || t('promptLibrary.uncategorized') }}
            </span>
          </span>
        </span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, watch } from 'vue'
import { IonIcon } from '@ionic/vue'
import { star } from 'ionicons/icons'
import type { Prompt, Category } from '@shared/types'
import type { PromptWithRelations } from '@shared/types/database'
import { useI18n } from '~/composables/useI18n'
import { getActivePromptVariables } from '~/lib/utils/prompt-template'
import { categoryColor, promptDisplayTitle, promptSnippet } from './prompt/prompt-meta'

interface WaterfallItem {
  prompt: Prompt
  imageUrl: string | null
  variableCount: number
}

const props = defineProps<{
  prompts: Prompt[]
  categories: Category[]
}>()

const emit = defineEmits<{
  view: [prompt: Prompt]
}>()

const { t } = useI18n()

// 生成的 object URL，列表变化或卸载时统一回收
const objectUrls: string[] = []

const categoryById = computed(() => new Map(props.categories.map(category => [category.id, category])))
const categoryOf = (prompt: Prompt) => (prompt.categoryId ? categoryById.value.get(prompt.categoryId) : undefined)

const buildImageUrl = (prompt: Prompt): string | null => {
  const blob = prompt.imageBlobs?.find(item => item instanceof Blob && item.size > 0)
  if (!blob) return null
  const url = URL.createObjectURL(blob)
  objectUrls.push(url)
  return url
}

// 估算卡片高度（用于贪心分配列）
const estimateHeight = (prompt: Prompt): number => {
  let height = 96
  if (prompt.imageBlobs?.length) height += 160
  if (promptSnippet(prompt)) height += 40
  return height
}

const columns = computed<{ left: WaterfallItem[]; right: WaterfallItem[] }>(() => {
  const left: WaterfallItem[] = []
  const right: WaterfallItem[] = []
  let leftHeight = 0
  let rightHeight = 0

  for (const prompt of props.prompts) {
    const item: WaterfallItem = {
      prompt,
      imageUrl: buildImageUrl(prompt),
      variableCount: getActivePromptVariables(prompt as PromptWithRelations).length,
    }
    const height = estimateHeight(prompt)
    if (leftHeight <= rightHeight) {
      left.push(item)
      leftHeight += height
    } else {
      right.push(item)
      rightHeight += height
    }
  }

  return { left, right }
})

const leftColumn = computed(() => columns.value.left)
const rightColumn = computed(() => columns.value.right)

const revokeAll = () => {
  objectUrls.forEach(url => URL.revokeObjectURL(url))
  objectUrls.length = 0
}

// prompts 变化时先回收旧 URL，computed 随后重建
watch(() => props.prompts, revokeAll, { flush: 'pre' })

onUnmounted(revokeAll)
</script>

<style scoped>
.waterfall {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.waterfall__column {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.waterfall__card {
  overflow: hidden;
  width: 100%;
  padding: 0;
  border: 0;
  font: inherit;
  text-align: left;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.waterfall__card:active {
  opacity: 0.75;
}

.waterfall__image {
  display: block;
  width: 100%;
  max-height: 240px;
  object-fit: cover;
  background: var(--surface-secondary);
}

.waterfall__content {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
}

.waterfall__title-row {
  display: flex;
  align-items: flex-start;
  gap: 6px;
}

.waterfall__title {
  display: -webkit-box;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--content-primary);
  font-size: var(--m-font-body);
  font-weight: 600;
  line-height: 1.35;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.waterfall__star {
  flex: none;
  margin-top: 2px;
  color: var(--accent-favorite);
  font-size: 16px;
}

.waterfall__desc {
  display: -webkit-box;
  overflow: hidden;
  color: var(--content-secondary);
  font-size: var(--m-font-sub);
  line-height: 1.45;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.waterfall__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
}

.waterfall__category {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  overflow: hidden;
  color: var(--content-tertiary);
  font-size: var(--m-font-caption);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.waterfall__dot {
  width: 8px;
  height: 8px;
  flex: none;
  border-radius: 2px;
}
</style>
