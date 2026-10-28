<template>
  <div class="ui-choices" role="radiogroup" :aria-label="label" :style="{ '--choice-columns': columns }">
    <label v-for="option in options" :key="String(option.value)" class="ui-choice"
      :class="{ 'is-selected': option.value === modelValue, 'is-disabled': disabled || option.disabled }">
      <input type="radio" class="ui-choice__radio" :name="name" :value="option.value" :checked="option.value === modelValue"
        :disabled="disabled || option.disabled" @change="emit('update:modelValue', option.value)" />
      <span class="ui-choice__text">
        <span class="ui-choice__title">{{ option.label }}<span v-if="option.badge" class="ui-tag ui-choice__badge">{{ option.badge }}</span></span>
        <span v-if="option.description" class="ui-choice__description">{{ option.description }}</span>
      </span>
    </label>
  </div>
</template>

<script setup lang="ts" generic="T extends string | number">
const props = withDefaults(defineProps<{
  modelValue: T
  options: { value: T; label: string; description?: string; disabled?: boolean; badge?: string }[]
  /** 读屏用的分组名 */
  label: string
  columns?: number
  disabled?: boolean
}>(), {
  columns: 2,
  disabled: false
})

const emit = defineEmits<{
  'update:modelValue': [value: T]
}>()

// 同一页可能有多组单选卡片，name 区分开才不会互相影响
const name = `ui-choice-${props.label}-${Math.random().toString(36).slice(2, 8)}`
</script>

<style scoped>
.ui-choices {
  display: grid;
  grid-template-columns: repeat(var(--choice-columns), minmax(0, 1fr));
  gap: 8px;
}

.ui-choice {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-panel);
  background: var(--surface-primary);
  cursor: pointer;
}

.ui-choice:hover {
  border-color: var(--border-strong);
}

.ui-choice.is-selected {
  border-color: var(--accent-soft-border);
  background: var(--accent-soft);
}

.ui-choice.is-disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.ui-choice:focus-within {
  outline: 2px solid var(--accent-primary);
  outline-offset: 1px;
}

.ui-choice__radio {
  flex: none;
  margin: 3px 0 0;
  accent-color: var(--accent-primary);
}

.ui-choice__radio:focus-visible {
  outline: none;
}

.ui-choice__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.ui-choice__title {
  color: var(--content-primary);
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
}

.ui-choice__badge {
  height: 18px;
  margin-left: 6px;
  padding: 0 6px;
  font-weight: var(--font-weight-normal);
}

.ui-choice__description {
  color: var(--content-tertiary);
  font-size: var(--font-size-xs);
}

@media (max-width: 640px) {
  .ui-choices {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
