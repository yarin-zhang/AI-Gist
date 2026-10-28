<template>
  <header class="ui-page-header">
    <slot name="leading" />
    <div class="ui-page-header__text">
      <h1 class="ui-title-page">{{ title }}</h1>
      <p v-if="description" class="ui-page-header__description">{{ description }}</p>
    </div>
    <div v-if="$slots.actions" class="ui-page-header__actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  title: string
  description?: string
}>(), {
  description: ''
})
</script>

<style scoped>
.ui-page-header {
  display: flex;
  align-items: flex-end;
  gap: 16px;
}

.ui-page-header__text {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.ui-page-header__description {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--content-secondary);
}

.ui-page-header__actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
}
</style>
