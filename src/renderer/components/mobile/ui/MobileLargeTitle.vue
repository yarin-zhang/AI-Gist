<template>
  <div class="m-top">
    <div class="m-large-title">
      <h1 class="m-title">{{ title }}</h1>
      <span v-if="subtitle" class="m-subtitle">{{ subtitle }}</span>
    </div>
    <div v-if="$slots.default" class="m-large-title__actions"><slot /></div>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  title: string
  subtitle?: string
}>(), {
  subtitle: ''
})
</script>

<style scoped>
.m-large-title {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.m-large-title__actions {
  display: flex;
  flex: none;
  gap: 8px;
}
</style>
