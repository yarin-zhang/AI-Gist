<template>
  <div class="waterfall-container">
    <div class="waterfall-column">
      <div
        v-for="item in leftColumn"
        :key="item.prompt.id"
        class="waterfall-card"
        @click="$emit('view', item.prompt)"
      >
        <div v-if="item.imageUrl" class="card-image-wrapper">
          <img :src="item.imageUrl" class="card-image" loading="lazy" />
        </div>
        <div class="card-content">
          <p class="card-title">{{ item.prompt.title || getFirstLine(item.prompt.content) }}</p>
          <p v-if="item.prompt.description" class="card-desc">{{ item.prompt.description }}</p>
          <div v-if="getTagList(item.prompt).length" class="card-tags">
            <span
              v-for="tag in getTagList(item.prompt).slice(0, 2)"
              :key="tag"
              class="card-tag"
            >{{ tag }}</span>
          </div>
          <div class="card-footer">
            <span v-if="item.prompt.categoryId" class="card-category">
              {{ getCategoryName(item.prompt.categoryId) }}
            </span>
            <ion-icon
              v-if="item.prompt.isFavorite"
              :icon="heart"
              class="card-favorite"
            ></ion-icon>
          </div>
        </div>
      </div>
    </div>

    <div class="waterfall-column">
      <div
        v-for="item in rightColumn"
        :key="item.prompt.id"
        class="waterfall-card"
        @click="$emit('view', item.prompt)"
      >
        <div v-if="item.imageUrl" class="card-image-wrapper">
          <img :src="item.imageUrl" class="card-image" loading="lazy" />
        </div>
        <div class="card-content">
          <p class="card-title">{{ item.prompt.title || getFirstLine(item.prompt.content) }}</p>
          <p v-if="item.prompt.description" class="card-desc">{{ item.prompt.description }}</p>
          <div v-if="getTagList(item.prompt).length" class="card-tags">
            <span
              v-for="tag in getTagList(item.prompt).slice(0, 2)"
              :key="tag"
              class="card-tag"
            >{{ tag }}</span>
          </div>
          <div class="card-footer">
            <span v-if="item.prompt.categoryId" class="card-category">
              {{ getCategoryName(item.prompt.categoryId) }}
            </span>
            <ion-icon
              v-if="item.prompt.isFavorite"
              :icon="heart"
              class="card-favorite"
            ></ion-icon>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, watch } from 'vue'
import { IonIcon } from '@ionic/vue'
import { heart } from 'ionicons/icons'
import type { Prompt, Category } from '@shared/types'

interface WaterfallItem {
  prompt: Prompt
  imageUrl: string | null
}

const props = defineProps<{
  prompts: Prompt[]
  categories: Category[]
}>()

defineEmits<{
  view: [prompt: Prompt]
}>()

// 生成的 object URLs，用于后续清理
const objectUrls: string[] = []

const getCategoryName = (categoryId: number | undefined) => {
  if (!categoryId) return ''
  return props.categories.find(c => c.id === categoryId)?.name || ''
}

const getFirstLine = (content: string | undefined) => {
  if (!content) return ''
  const line = content.split('\n')[0].trim()
  return line.length > 40 ? line.substring(0, 40) + '…' : line
}

const getTagList = (prompt: Prompt): string[] => {
  if (!prompt.tags) return []
  if (Array.isArray(prompt.tags)) return prompt.tags
  return prompt.tags.split(',').map(t => t.trim()).filter(Boolean)
}

const buildImageUrl = (prompt: Prompt): string | null => {
  if (!prompt.imageBlobs?.length) return null
  const url = URL.createObjectURL(prompt.imageBlobs[0])
  objectUrls.push(url)
  return url
}

// 估算 card 高度（用于贪心列分配）
const estimateHeight = (prompt: Prompt): number => {
  let h = 72 // title + footer base
  if (prompt.imageBlobs?.length) h += 160
  if (prompt.description) h += 36
  if (getTagList(prompt).length) h += 26
  return h
}

// 贪心分配：将 prompt 分配到更短的列
const columns = computed<{ left: WaterfallItem[]; right: WaterfallItem[] }>(() => {
  const left: WaterfallItem[] = []
  const right: WaterfallItem[] = []
  let leftH = 0
  let rightH = 0

  for (const prompt of props.prompts) {
    const imageUrl = buildImageUrl(prompt)
    const item: WaterfallItem = { prompt, imageUrl }
    const h = estimateHeight(prompt)
    if (leftH <= rightH) {
      left.push(item)
      leftH += h
    } else {
      right.push(item)
      rightH += h
    }
  }

  return { left, right }
})

const leftColumn = computed(() => columns.value.left)
const rightColumn = computed(() => columns.value.right)

// 当 prompts 变化时，清理旧 URL 并重新生成（computed 会重建）
watch(
  () => props.prompts,
  () => {
    revokeAll()
  },
  { flush: 'pre' }
)

const revokeAll = () => {
  objectUrls.forEach(url => URL.revokeObjectURL(url))
  objectUrls.length = 0
}

onUnmounted(() => {
  revokeAll()
})
</script>

<style scoped>
.waterfall-container {
  display: flex;
  gap: 8px;
  padding: 8px;
  align-items: flex-start;
}

.waterfall-column {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.waterfall-card {
  background: var(--ion-card-background, var(--ion-item-background, #fff));
  border-radius: 10px;
  overflow: hidden;
  /* iOS native separator color: rgba(60,60,67,0.29) */
  border: 1px solid rgba(60, 60, 67, 0.15);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: opacity 0.15s;
}

/* 暗色模式下不显示边框（使用 .ion-palette-dark 兼容 Android） */
:global(.ion-palette-dark) .waterfall-card {
  border: none;
}

.waterfall-card:active {
  opacity: 0.7;
}

.card-image-wrapper {
  width: 100%;
  line-height: 0;
}

.card-image {
  width: 100%;
  height: auto;
  display: block;
  object-fit: cover;
}

.card-content {
  padding: 8px 10px 10px;
}

.card-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--ion-text-color, #222);
  margin: 0 0 4px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.4;
}

.card-desc {
  font-size: 12px;
  color: var(--ion-color-medium, #888);
  margin: 0 0 6px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.3;
}

.card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 6px;
}

.card-tag {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 10px;
  background: var(--ion-color-light, #f4f5f8);
  color: var(--ion-color-medium, #888);
  white-space: nowrap;
}

.card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 18px;
}

.card-category {
  font-size: 11px;
  color: var(--ion-color-primary, #3880ff);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: calc(100% - 20px);
}

.card-favorite {
  font-size: 14px;
  color: var(--ion-color-danger, #eb445a);
  flex-shrink: 0;
}
</style>
