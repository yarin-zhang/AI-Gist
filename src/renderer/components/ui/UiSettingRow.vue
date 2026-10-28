<template>
  <div class="ui-row">
    <div class="ui-row__text">
      <span class="ui-row__title">
        <slot name="title">{{ title }}</slot>
      </span>
      <span v-if="description || $slots.description" class="ui-row__description">
        <slot name="description">{{ description }}</slot>
      </span>
    </div>
    <div v-if="$slots.default" class="ui-row__control">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  title?: string
  description?: string
}>(), {
  title: '',
  description: ''
})
</script>
