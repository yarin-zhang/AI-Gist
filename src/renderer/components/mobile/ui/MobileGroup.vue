<template>
  <section class="m-section">
    <div v-if="title || $slots.action" class="m-gt">
      <span>{{ title }}</span>
      <slot name="action" />
    </div>
    <div class="m-group" :class="{ ic: icons }">
      <slot />
    </div>
    <p v-if="footer" class="m-note m-group__footer">{{ footer }}</p>
  </section>
</template>

<script setup lang="ts">
withDefaults(defineProps<{
  title?: string
  /** 行首带图标方块时，分隔线从图标右侧开始 */
  icons?: boolean
  footer?: string
}>(), {
  title: '',
  icons: true,
  footer: ''
})
</script>

<style scoped>
.m-group__footer {
  padding-top: 8px;
}
</style>
