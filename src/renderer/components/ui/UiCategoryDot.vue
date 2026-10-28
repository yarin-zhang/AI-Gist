<template>
  <span class="ui-cat-dot" :style="color ? { background: color } : undefined" aria-hidden="true" />
</template>

<script setup lang="ts">
defineProps<{
  /** 分类保存的颜色；为空时显示灰色 */
  color?: string | null
}>()
</script>
