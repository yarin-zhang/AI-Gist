<template>
  <span
    class="ui-dot"
    :class="tone === 'neutral' ? '' : `ui-dot--${tone}`"
    :role="label ? 'img' : undefined"
    :aria-label="label || undefined"
    :aria-hidden="label ? undefined : 'true'"
  />
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  tone?: 'neutral' | 'success' | 'warning' | 'error'
  /** 单独出现、没有旁边文字说明时，给读屏一个名字 */
  label?: string
}>(), {
  tone: 'neutral',
  label: ''
})
</script>
