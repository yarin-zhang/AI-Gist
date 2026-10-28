<template>
  <span class="ui-count" :class="{ 'ui-count--primary': tone === 'primary' }">{{ value }}</span>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  value: number | string
  tone?: 'neutral' | 'primary'
}>(), {
  tone: 'neutral'
})
</script>
