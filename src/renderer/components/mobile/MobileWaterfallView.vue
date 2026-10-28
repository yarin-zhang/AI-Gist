<!--
  提示词首页的双列显示（V5-M-List）：两列卡片，按估算高度贪心分配到较矮的一列。
  有附图的提示词以第一张图作封面；没有图的显示正文摘录，变量标成变量名。
-->
<template>
  <div class="m-wf-grid">
    <div v-for="(column, columnIndex) in columns" :key="columnIndex" class="m-wf-col">
      <button v-for="item in column" :key="item.prompt.id" type="button" class="m-wf" @click="emit('view', item.prompt)">
        <img v-if="coverOf(item.prompt)" :src="coverOf(item.prompt)!" loading="lazy" alt="" />
        <span class="m-wf-b" :class="{ 'waterfall__text-body': !coverOf(item.prompt) }">
          <span class="m-wf-t">{{ promptDisplayTitle(item.prompt, t('promptLibrary.untitled'), 40) }}</span>
          <span v-if="!coverOf(item.prompt) && item.excerpt.length" class="m-wf-x">
            <template v-for="(segment, index) in item.excerpt" :key="index">
              <span v-if="segment.variable" class="m-var m-var--name">{{ segment.text }}</span>
              <template v-else>{{ segment.text }}</template>
            </template>
          </span>
          <span class="m-wf-meta">
            <span class="waterfall__dot" :style="{ background: categoryColor(categoryOf(item.prompt)) }" aria-hidden="true" />
            <span class="waterfall__category">{{ categoryOf(item.prompt)?.name || t('promptLibrary.uncategorized') }}</span>
            <ion-icon v-if="item.prompt.isFavorite" :icon="star" class="waterfall__star" role="img"
              :aria-label="t('promptLibrary.favorited')" />
            <span v-if="item.variableCount" class="waterfall__vars" role="img"
              :aria-label="t('promptLibrary.variableCount', { count: item.variableCount })">{{ `{ } ${item.variableCount}` }}</span>
          </span>
        </span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { IonIcon } from '@ionic/vue'
import { star } from 'ionicons/icons'
import type { Prompt, Category } from '@shared/types'
import type { PromptWithRelations } from '@shared/types/database'
import { useI18n } from '~/composables/useI18n'
import { getActivePromptVariables, parsePromptTemplate } from '~/lib/utils/prompt-template'
import { categoryColor, plainTemplateText, promptDisplayTitle, promptSnippet } from './prompt/prompt-meta'
import { usePromptCovers } from './prompt/usePromptCovers'

interface ExcerptSegment {
  text: string
  variable?: boolean
}

interface WaterfallItem {
  prompt: Prompt
  excerpt: ExcerptSegment[]
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
const { coverOf } = usePromptCovers(() => props.prompts)

const categoryById = computed(() => new Map(props.categories.map(category => [category.id, category])))
const categoryOf = (prompt: Prompt) => (prompt.categoryId ? categoryById.value.get(prompt.categoryId) : undefined)

// 摘录：有描述用描述；否则取正文（第一行已经当标题的从第二行起），普通模板里的变量单独标出
const excerptOf = (prompt: Prompt): ExcerptSegment[] => {
  if (prompt.description?.trim()) return [{ text: prompt.description.trim() }]
  const snippet = promptSnippet(prompt)
  if (!snippet) return []
  if (prompt.isJinjaTemplate) return [{ text: plainTemplateText(snippet) }]
  return parsePromptTemplate(snippet).segments.map(segment => (
    segment.kind === 'text' ? { text: segment.text } : { text: segment.name, variable: true }
  ))
}

// 估算卡片高度（用于贪心分配列）：封面图约 230，摘录 13px 字号一行约 14 个汉字，最多 6 行
const estimateHeight = (item: WaterfallItem): number => {
  if (item.prompt.imageBlobs?.length) return 290
  const length = item.excerpt.reduce((sum, segment) => sum + segment.text.length, 0)
  return 64 + Math.min(6, Math.ceil(length / 14)) * 23
}

const columns = computed<[WaterfallItem[], WaterfallItem[]]>(() => {
  const left: WaterfallItem[] = []
  const right: WaterfallItem[] = []
  let leftHeight = 0
  let rightHeight = 0

  for (const prompt of props.prompts) {
    const item: WaterfallItem = {
      prompt,
      excerpt: excerptOf(prompt),
      variableCount: getActivePromptVariables(prompt as PromptWithRelations).length,
    }
    const height = estimateHeight(item)
    if (leftHeight <= rightHeight) {
      left.push(item)
      leftHeight += height
    } else {
      right.push(item)
      rightHeight += height
    }
  }

  return [left, right]
})
</script>

<style scoped>
/* 没有封面图的卡片，标题离上边缘多留一点 */
.waterfall__text-body {
  padding-top: 12px;
}

.waterfall__dot {
  width: 8px;
  height: 8px;
  flex: none;
  border-radius: 2px;
}

.waterfall__category {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.waterfall__star {
  flex: none;
  color: var(--accent-favorite);
  font-size: 14px;
}

.waterfall__vars {
  flex: none;
  color: var(--variable-text);
  font-family: var(--font-family-mono);
  font-size: 11px;
  font-weight: 500;
}
</style>
