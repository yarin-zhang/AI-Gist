<template>
  <span class="ui-diff-text">
    <template v-for="(segment, index) in segments" :key="index">
      <ins v-if="segment.type === 'insert'" class="ui-diff-insert">{{ segment.value }}</ins>
      <del v-else-if="segment.type === 'delete'" class="ui-diff-delete">{{ segment.value }}</del>
      <template v-else>{{ segment.value }}</template>
    </template>
  </span>
</template>

<script setup lang="ts">
import type { DiffSegment } from './types'

defineProps<{
  segments: DiffSegment[]
}>()
</script>

<style scoped>
.ui-diff-text {
  white-space: pre-wrap;
}
</style>
