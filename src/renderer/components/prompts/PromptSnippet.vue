<template>
  <div class="snippet" :class="{ 'snippet--single': lines === 1 }" :style="lines === 1 ? undefined : { '-webkit-line-clamp': String(lines) }"><template v-for="(part, index) in parts" :key="index"
    ><span v-if="part.variable" class="snippet__var">{{ part.text }}</span><template v-else>{{ part.text }}</template></template></div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { parsePromptTemplate } from '@/lib/utils/prompt-template'

const props = withDefaults(defineProps<{
  content: string
  lines?: number
}>(), {
  lines: 3,
})

// 卡片和表格里的正文摘要：变量只显示名字，用变量色标出
const parts = computed(() => parsePromptTemplate(props.content.slice(0, 400)).segments.map(segment => (
  segment.kind === 'variable'
    ? { text: segment.name, variable: true }
    : { text: segment.text.replace(/\s+/g, ' '), variable: false }
)))
</script>

<style scoped>
.snippet {
  display: -webkit-box;
  overflow: hidden;
  color: var(--content-secondary);
  font-size: var(--font-size-sm);
  line-height: 1.7;
  -webkit-box-orient: vertical;
  overflow-wrap: anywhere;
}

/*
 * 单行（表格）不用 line-clamp：不换行的文字让 line-clamp 失效，单元格会按整段文字撑宽。
 * 改成普通块级省略号，宽度完全由所在的列决定。
 */
.snippet--single {
  display: block;
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow-wrap: normal;
}

.snippet__var {
  color: var(--variable-text);
  font-family: var(--font-family-mono);
  font-size: var(--font-size-xs);
}
</style>
