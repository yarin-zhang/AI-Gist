<template>
  <span class="prompt-variable-field" :class="[`type-${normalizedType}`, { inline, error, compact }]"
    :data-variable-field="variable.name" :data-first-occurrence="firstOccurrence ? 'true' : 'false'">
    <span v-if="!inline || normalizedType === 'textarea'" class="field-label">
      <span>{{ variable.name }}</span>
      <span v-if="variable.required" class="required-mark" aria-hidden="true">*</span>
      <NTooltip v-if="variable.description">
        <template #trigger><NIcon size="14" class="field-help"><InfoCircle /></NIcon></template>
        {{ variable.description }}
      </NTooltip>
    </span>

    <NSelect v-if="normalizedType === 'select'" size="small" :value="modelValue" :options="options" clearable
      :placeholder="placeholder" :status="error ? 'error' : undefined" :consistent-menu-width="false"
      :input-props="inputProps" @update:value="$emit('update:modelValue', $event)" @blur="$emit('blur')" />
    <NInputNumber v-else-if="normalizedType === 'number'" size="small" :value="numberValue" clearable
      :placeholder="placeholder" :status="error ? 'error' : undefined" :input-props="inputProps"
      @update:value="$emit('update:modelValue', $event)" @blur="$emit('blur')" />
    <span v-else-if="normalizedType === 'boolean'" class="boolean-field">
      <NSwitch size="small" :value="Boolean(modelValue)" :input-props="inputProps"
        @update:value="$emit('update:modelValue', $event)" />
      <span v-if="inline" class="boolean-label">{{ variable.name }}</span>
    </span>
    <NInput v-else size="small" :value="stringValue" :type="normalizedType === 'textarea' ? 'textarea' : 'text'"
      :autosize="normalizedType === 'textarea' ? { minRows: compact ? 2 : 3, maxRows: 7 } : undefined"
      :placeholder="placeholder" :status="error ? 'error' : undefined" :input-props="inputProps"
      @update:value="$emit('update:modelValue', $event)" @blur="$emit('blur')" />

    <span v-if="error" class="field-error" role="alert">{{ t('promptWorkspace.requiredValue') }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { NIcon, NInput, NInputNumber, NSelect, NSwitch, NTooltip } from 'naive-ui'
import { InfoCircle } from '@vicons/tabler'
import type { EditablePromptVariable } from '@/lib/utils/prompt-template'
import { normalizeVariableType } from '@/lib/utils/prompt-template'

const props = withDefaults(defineProps<{
  variable: EditablePromptVariable
  modelValue: any
  inline?: boolean
  error?: boolean
  firstOccurrence?: boolean
  compact?: boolean
}>(), {
  inline: false,
  error: false,
  firstOccurrence: true,
  compact: false,
})

defineEmits<{
  'update:modelValue': [value: any]
  blur: []
}>()

const { t } = useI18n()
const normalizedType = computed(() => normalizeVariableType(props.variable.type))
const placeholder = computed(() => props.variable.placeholder || props.variable.name)
const stringValue = computed(() => props.modelValue === undefined || props.modelValue === null ? '' : String(props.modelValue))
const numberValue = computed(() => {
  if (props.modelValue === '' || props.modelValue === undefined || props.modelValue === null) return null
  const value = Number(props.modelValue)
  return Number.isFinite(value) ? value : null
})
const options = computed(() => (props.variable.options || []).filter(Boolean).map(option => ({ label: option, value: option })))
const inputProps = computed(() => ({
  'aria-label': props.variable.name,
  tabindex: props.firstOccurrence ? 0 : -1,
}))
</script>

<style scoped>
.prompt-variable-field { position: relative; display: flex; flex-direction: column; gap: 5px; min-width: 0; vertical-align: baseline; }
.prompt-variable-field.inline { display: inline-flex; min-width: 112px; max-width: min(320px, 100%); margin: 2px 4px; vertical-align: middle; }
.prompt-variable-field.inline.type-number { width: 128px; }
.prompt-variable-field.inline.type-select { min-width: 150px; width: auto; }
.prompt-variable-field.inline.type-boolean { min-width: 0; }
.prompt-variable-field.type-text.inline :deep(.n-input) { width: clamp(120px, 20vw, 280px); }
.prompt-variable-field.type-textarea { width: 100%; margin: 10px 0; padding: var(--compact-padding); border: 1px solid var(--border-default); border-radius: var(--radius-panel); background: var(--surface-secondary); }
.prompt-variable-field.error.type-textarea { border-color: var(--accent-error); }
.field-label { display: flex; align-items: center; gap: 4px; color: var(--content-secondary); font-size: 13px; font-weight: var(--font-weight-medium); }
.required-mark { color: var(--accent-error); }
.field-help { color: var(--content-tertiary); cursor: help; }
.boolean-field { min-height: 34px; display: inline-flex; align-items: center; gap: 7px; }
.boolean-label { color: var(--content-secondary); font-size: 13px; }
.field-error { color: var(--accent-error); font-size: 12px; line-height: 1.3; }
.prompt-variable-field.inline .field-error { position: absolute; top: calc(100% + 2px); left: 0; z-index: 1; padding: 2px 5px; border: 1px solid var(--border-default); border-radius: var(--radius-control); background: var(--surface-primary); box-shadow: var(--shadow-popover); white-space: nowrap; }
.prompt-variable-field.compact.inline { min-width: 100px; }
.prompt-variable-field :deep(.n-input) {
  --n-color: var(--surface-primary) !important;
  --n-color-focus: var(--surface-primary) !important;
  --n-color-disabled: var(--surface-secondary) !important;
  --n-border: 1px solid var(--border-default) !important;
}
.prompt-variable-field :deep(.n-base-selection) {
  --n-color: var(--surface-primary) !important;
  --n-color-active: var(--surface-primary) !important;
  --n-color-disabled: var(--surface-secondary) !important;
  --n-border: 1px solid var(--border-default) !important;
}
.prompt-variable-field.type-textarea :deep(.n-input) {
  --n-color: var(--surface-secondary) !important;
  --n-color-focus: var(--surface-secondary) !important;
}
</style>
