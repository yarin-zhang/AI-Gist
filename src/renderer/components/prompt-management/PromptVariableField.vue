<template>
  <NTooltip trigger="hover" placement="bottom" :disabled="!(inline && error)" content-style="max-width: 220px">
    <template #trigger>
      <span class="prompt-variable-field" :class="[`type-${normalizedType}`, { inline, error, compact }]"
        :style="fieldStyle"
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

        <!-- Non-inline (grid) fields have their own row, so the message can sit in normal flow.
             Inline fields sit inside running text: a visible message would cover whatever follows,
             so it becomes an on-hover tooltip (trigger above) and stays available to screen readers here. -->
        <span v-if="error && !inline" class="field-error" role="alert">{{ t('promptWorkspace.requiredValue') }}</span>
        <span v-else-if="error && inline" class="sr-only" role="alert">{{ t('promptWorkspace.requiredValue') }}</span>
      </span>
    </template>
    {{ t('promptWorkspace.requiredValue') }}
  </NTooltip>
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

// Inline text fields size themselves to their content instead of a fixed/viewport-relative width.
// Full-width glyphs (CJK, fullwidth punctuation, etc.) render close to twice as wide as the `ch`
// unit's reference digit, so they count as two width units to keep the box wide enough to show
// the whole value without clipping it.
const isWideChar = (codePoint: number) => (
  (codePoint >= 0x1100 && codePoint <= 0x115f)
  || (codePoint >= 0x2e80 && codePoint <= 0xa4cf)
  || (codePoint >= 0xac00 && codePoint <= 0xd7a3)
  || (codePoint >= 0xf900 && codePoint <= 0xfaff)
  || (codePoint >= 0xfe30 && codePoint <= 0xfe4f)
  || (codePoint >= 0xff00 && codePoint <= 0xff60)
  || (codePoint >= 0xffe0 && codePoint <= 0xffe6)
  || (codePoint >= 0x20000 && codePoint <= 0x3fffd)
)
const measureWidthUnits = (text: string) => {
  let units = 0
  for (const char of text) units += isWideChar(char.codePointAt(0) ?? 0) ? 2 : 1
  return units
}

const FIELD_MARGIN_CH = 10 // ~5 characters of breathing room on each side of the content
const FIELD_MIN_CH = 10
const FIELD_MAX_CH = 56 // caps growth so a long default/value can't stretch the line awkwardly
// Base the width on the variable's default value when present, falling back to the placeholder
// (which itself falls back to the variable name), then grow it if the user types past that.
const baseReferenceText = computed(() => props.variable.defaultValue || placeholder.value || props.variable.name || '')
const inlineFieldWidthCh = computed(() => {
  const contentUnits = Math.max(measureWidthUnits(baseReferenceText.value), measureWidthUnits(stringValue.value))
  return Math.min(Math.max(contentUnits + FIELD_MARGIN_CH, FIELD_MIN_CH), FIELD_MAX_CH)
})
const fieldStyle = computed(() => (
  props.inline && normalizedType.value === 'text'
    ? { '--field-ch': String(inlineFieldWidthCh.value) }
    : undefined
))
</script>

<style scoped>
.prompt-variable-field { position: relative; display: flex; flex-direction: column; gap: 5px; min-width: 0; vertical-align: baseline; }
.prompt-variable-field.inline { display: inline-flex; max-width: 100%; margin: 2px 4px; vertical-align: middle; }
.prompt-variable-field.inline.type-number { width: 128px; }
.prompt-variable-field.inline.type-select { min-width: 150px; width: auto; }
.prompt-variable-field.inline.type-boolean { min-width: 0; }
/* Width tracks content: --field-ch is set from the variable's default value/placeholder length
   (falling back to the variable name), widened live as the user types past it, and capped so a
   long value can't stretch the surrounding line awkwardly. */
.prompt-variable-field.type-text.inline { width: auto; max-width: 100%; }
/* The upper clamp bound uses vw rather than % because this field's own width is auto (shrink to
   fit), so a plain percentage here has no well-defined containing block to resolve against and
   would silently fall back to the browser's default input width. */
.prompt-variable-field.type-text.inline :deep(.n-input) { width: clamp(64px, calc(var(--field-ch, 22) * 1ch), 92vw); }
.prompt-variable-field.type-textarea { width: 100%; margin: 10px 0; padding: var(--compact-padding); border-radius: var(--radius-panel); background: var(--surface-secondary); }
.field-label { display: flex; align-items: center; gap: 4px; color: var(--content-secondary); font-size: 13px; font-weight: var(--font-weight-medium); }
.required-mark { color: var(--accent-error); }
.field-help { color: var(--content-tertiary); cursor: help; }
.boolean-field { min-height: 34px; display: inline-flex; align-items: center; gap: 7px; }
.boolean-label { color: var(--content-secondary); font-size: 13px; }
.field-error { color: var(--accent-error); font-size: 12px; line-height: 1.3; }
/* Kept off-screen (not display:none) so screen readers still announce the alert; the input's own
   error-status border is the persistent visual cue, and the wrapping NTooltip surfaces the same
   text on hover without covering the text that follows in the sentence. */
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; }
.prompt-variable-field.compact.inline { min-width: 100px; }
.prompt-variable-field.compact.inline.type-text { min-width: 0; }
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
