<template>
  <div class="ui-empty">
    <div v-if="$slots.icon" class="ui-empty__icon" aria-hidden="true">
      <slot name="icon" />
    </div>
    <span class="ui-empty__title">{{ title }}</span>
    <span v-if="description" class="ui-empty__description">{{ description }}</span>
    <div v-if="$slots.actions" class="ui-empty__actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  title: string
  description?: string
}>(), {
  description: ''
})
</script>
