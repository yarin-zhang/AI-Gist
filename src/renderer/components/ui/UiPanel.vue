<template>
  <section class="ui-panel">
    <header v-if="title || $slots.header || $slots.actions" class="ui-panel__header">
      <slot name="header">
        <div class="ui-panel-heading">
          <h2 class="ui-title-section">{{ title }}</h2>
          <span v-if="description" class="ui-panel-description">{{ description }}</span>
        </div>
      </slot>
      <div v-if="$slots.actions" class="ui-panel-actions">
        <slot name="actions" />
      </div>
    </header>
    <div v-if="$slots.default" :class="bodyClass">
      <slot />
    </div>
    <footer v-if="$slots.footer" class="ui-panel__footer">
      <slot name="footer" />
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  title?: string
  description?: string
  /** padded：16px 内边距；rows：只留左右边距，放设置行；flush：不加内边距，放表格等 */
  body?: 'padded' | 'rows' | 'flush'
}>(), {
  title: '',
  description: '',
  body: 'padded'
})

const bodyClass = computed(() => ({
  padded: 'ui-panel__body',
  rows: 'ui-panel__rows',
  flush: 'ui-panel-flush'
}[props.body]))
</script>

<style scoped>
.ui-panel-heading {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.ui-panel-description {
  font-size: var(--font-size-xs);
  color: var(--content-tertiary);
}

.ui-panel-actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: 4px;
}

.ui-panel-flush {
  overflow: hidden;
  border-radius: 0 0 var(--radius-panel) var(--radius-panel);
}
</style>
