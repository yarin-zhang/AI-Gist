<template>
  <NCard size="small" class="variable-inspector">
    <template #header>
      <div class="inspector-header">
        <div>
          <NText strong>{{ t('promptEditor.variables') }}</NText>
          <NText depth="3" class="inspector-subtitle">
            {{ t('promptEditor.variableCount', { count: activeVariables.length }) }}
          </NText>
        </div>
        <NButton size="small" :disabled="readonly" @click="$emit('request-add')">
          <template #icon><NIcon size="16"><Plus /></NIcon></template>
          {{ t('promptEditor.addVariable') }}
        </NButton>
      </div>
    </template>

    <div class="inspector-layout">
      <NScrollbar class="variable-directory">
        <div v-if="activeVariables.length" class="variable-group">
          <NText depth="3" class="group-label">{{ t('promptEditor.inUse') }}</NText>
          <button v-for="variable in activeVariables" :key="variable.name" type="button"
            class="variable-directory-item" :class="{ selected: selectedVariable === variable.name }"
            @click="$emit('select', variable.name)">
            <span class="variable-directory-main">
              <NIcon size="16"><Braces /></NIcon>
              <span class="variable-directory-name">{{ variable.name }}</span>
            </span>
            <span class="variable-directory-meta">
              <span>{{ typeLabel(variable.type) }}</span>
              <span v-if="occurrences[variable.name]">×{{ occurrences[variable.name] }}</span>
            </span>
          </button>
        </div>

        <div v-if="unusedVariables.length" class="variable-group unused-group">
          <NText depth="3" class="group-label">{{ t('promptEditor.unused') }}</NText>
          <button v-for="variable in unusedVariables" :key="variable.name" type="button"
            class="variable-directory-item unused" :class="{ selected: selectedVariable === variable.name }"
            @click="$emit('select', variable.name)">
            <span class="variable-directory-main">
              <NIcon size="16"><AlertCircle /></NIcon>
              <span class="variable-directory-name">{{ variable.name }}</span>
            </span>
            <span class="variable-directory-meta">{{ t('promptEditor.notInserted') }}</span>
          </button>
        </div>

        <NEmpty v-if="!variables.length" size="small" :description="t('promptEditor.noVariables')" class="variable-empty">
          <template #extra>
            <NButton size="small" :disabled="readonly" @click="$emit('request-add')">
              {{ t('promptEditor.addFirstVariable') }}
            </NButton>
          </template>
        </NEmpty>
      </NScrollbar>

      <NScrollbar v-if="selected" class="variable-properties">
        <div class="property-heading">
          <div>
            <NText strong class="property-title">{{ selected.name }}</NText>
            <NText depth="3" class="property-subtitle">
              {{ isUnused(selected.name)
                ? t('promptEditor.unusedVariableHint')
                : t('promptEditor.occurrenceCount', { count: occurrences[selected.name] || 1 }) }}
            </NText>
          </div>
          <NFlex size="small">
            <NTooltip v-if="isUnused(selected.name)">
              <template #trigger>
                <NButton size="small" quaternary :disabled="readonly" @click="$emit('request-insert', selected.name)">
                  <template #icon><NIcon size="16"><CursorText /></NIcon></template>
                </NButton>
              </template>
              {{ t('promptEditor.insertAtCursor') }}
            </NTooltip>
            <NPopconfirm :positive-text="t('common.delete')" :negative-text="t('common.cancel')"
              @positive-click="$emit('request-remove', selected.name)">
              <template #trigger>
                <NButton size="small" quaternary type="error" :disabled="readonly"
                  :aria-label="t('promptEditor.deleteVariable')">
                  <template #icon><NIcon size="16"><Trash /></NIcon></template>
                </NButton>
              </template>
              {{ jinja
                ? t('promptEditor.confirmDeleteJinja')
                : isUnused(selected.name)
                ? t('promptEditor.confirmDeleteUnused')
                : t('promptEditor.confirmDeleteVariable', { count: occurrences[selected.name] || 1 }) }}
            </NPopconfirm>
          </NFlex>
        </div>

        <NForm label-placement="top" class="variable-form">
          <NFormItem :label="t('promptManagement.variableName')"
            :validation-status="nameError ? 'error' : undefined" :feedback="nameErrorText">
            <NInput v-model:value="nameDraft" :disabled="readonly" @blur="commitName" @keyup.enter="commitName" />
          </NFormItem>

          <div class="property-row">
            <NFormItem :label="t('promptManagement.variableType')">
              <NSelect :value="selected.type" :options="typeOptions" :disabled="readonly"
                @update:value="updateSelected({ type: $event })" />
            </NFormItem>
            <NFormItem :label="t('promptManagement.variableRequired')" class="required-field">
              <NSwitch :value="selected.required" :disabled="readonly"
                @update:value="updateSelected({ required: $event })" />
            </NFormItem>
          </div>

          <NFormItem :label="t('promptManagement.variableDefault')">
            <NSwitch v-if="normalizedType === 'boolean'" :value="selected.defaultValue === 'true'"
              :disabled="readonly" @update:value="updateSelected({ defaultValue: $event ? 'true' : 'false' })" />
            <NInputNumber v-else-if="normalizedType === 'number'" :value="numberDefault" clearable
              :disabled="readonly" style="width: 100%" @update:value="updateNumberDefault" />
            <NSelect v-else-if="normalizedType === 'select'" :value="selected.defaultValue || null"
              :options="selectOptions" clearable :disabled="readonly"
              @update:value="updateSelected({ defaultValue: $event || '' })" />
            <NInput v-else :value="selected.defaultValue || ''" :disabled="readonly"
              :type="normalizedType === 'textarea' ? 'textarea' : 'text'"
              @update:value="updateSelected({ defaultValue: $event })" />
          </NFormItem>

          <NFormItem v-if="normalizedType === 'select'" :label="t('promptManagement.variableOptions')"
            :validation-status="selectOptions.length ? undefined : 'error'"
            :feedback="selectOptions.length ? undefined : t('promptEditor.selectNeedsOption')">
            <NDynamicInput :value="selected.options || []" :disabled="readonly" :min="1" show-sort-button
              @update:value="updateOptions" />
          </NFormItem>

          <NFormItem :label="t('promptEditor.inputPlaceholder')">
            <NInput :value="selected.placeholder || ''" :disabled="readonly"
              :placeholder="t('promptEditor.inputPlaceholderHint')"
              @update:value="updateSelected({ placeholder: $event })" />
          </NFormItem>

          <NFormItem :label="t('promptEditor.description')">
            <NInput :value="selected.description || ''" type="textarea" :autosize="{ minRows: 2, maxRows: 4 }"
              :disabled="readonly" :placeholder="t('promptEditor.descriptionHint')"
              @update:value="updateSelected({ description: $event })" />
          </NFormItem>
        </NForm>
      </NScrollbar>

      <div v-else-if="variables.length" class="properties-empty">
        <NIcon size="28"><Braces /></NIcon>
        <NText depth="3">{{ t('promptEditor.selectVariableHint') }}</NText>
      </div>
    </div>
  </NCard>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NButton, NCard, NDynamicInput, NEmpty, NFlex, NForm, NFormItem, NIcon, NInput,
  NInputNumber, NPopconfirm, NScrollbar, NSelect, NSwitch, NText, NTooltip,
} from 'naive-ui'
import { AlertCircle, Braces, CursorText, Plus, Trash } from '@vicons/tabler'
import type { EditablePromptVariable } from '@/lib/utils/prompt-template'
import { normalizeVariableType, validateVariableName } from '@/lib/utils/prompt-template'

const props = withDefaults(defineProps<{
  variables: EditablePromptVariable[]
  activeNames: string[]
  occurrences: Record<string, number>
  selectedVariable?: string
  readonly?: boolean
  jinja?: boolean
}>(), {
  selectedVariable: '',
  readonly: false,
  jinja: false,
})

const emit = defineEmits<{
  select: [name: string]
  'request-add': []
  'request-insert': [name: string]
  'request-remove': [name: string]
  'update-variable': [payload: { previousName: string; variable: EditablePromptVariable }]
}>()

const { t } = useI18n()
const nameDraft = ref('')
const nameError = ref<string | null>(null)

const activeNameSet = computed(() => new Set(props.activeNames))
const activeVariables = computed(() => props.variables.filter(variable => activeNameSet.value.has(variable.name)))
const unusedVariables = computed(() => props.variables.filter(variable => !activeNameSet.value.has(variable.name)))
const selected = computed(() => props.variables.find(variable => variable.name === props.selectedVariable))
const normalizedType = computed(() => normalizeVariableType(selected.value?.type || 'text'))
const numberDefault = computed(() => {
  if (!selected.value?.defaultValue) return null
  const value = Number(selected.value.defaultValue)
  return Number.isFinite(value) ? value : null
})
const selectOptions = computed(() => (selected.value?.options || [])
  .map(option => option.trim())
  .filter(Boolean)
  .map(option => ({ label: option, value: option })))

const baseTypeOptions = computed(() => [
  { label: t('promptEditor.typeText'), value: 'text' },
  { label: t('promptEditor.typeTextarea'), value: 'textarea' },
  { label: t('promptEditor.typeSelect'), value: 'select' },
  { label: t('promptEditor.typeNumber'), value: 'number' },
  { label: t('promptEditor.typeBoolean'), value: 'boolean' },
])
const typeOptions = computed(() => props.jinja
  ? [
    { label: `${t('promptEditor.typeText')} (str)`, value: 'str' },
    { label: `${t('promptEditor.typeNumber')} (int)`, value: 'int' },
    { label: `${t('promptEditor.typeNumber')} (float)`, value: 'float' },
    { label: `${t('promptEditor.typeBoolean')} (bool)`, value: 'bool' },
    { label: t('promptEditor.typeList'), value: 'list' },
    { label: t('promptEditor.typeDict'), value: 'dict' },
  ]
  : baseTypeOptions.value)

const nameErrorText = computed(() => {
  if (nameError.value === 'required') return t('promptEditor.variableNameRequired')
  if (nameError.value === 'invalid') return t('promptEditor.variableNameInvalid')
  if (nameError.value === 'duplicate') return t('promptEditor.variableNameDuplicate')
  return undefined
})

watch(selected, value => {
  nameDraft.value = value?.name || ''
  nameError.value = null
}, { immediate: true })

const isUnused = (name: string) => !activeNameSet.value.has(name)
const typeLabel = (type: string) => typeOptions.value.find(option => option.value === type)?.label
  || baseTypeOptions.value.find(option => option.value === normalizeVariableType(type))?.label
  || type

const updateSelected = (patch: Partial<EditablePromptVariable>) => {
  if (!selected.value) return
  const next = { ...selected.value, ...patch }
  if (normalizeVariableType(next.type) !== 'select') next.options = []
  if (normalizeVariableType(next.type) === 'select' && !next.options?.length) next.options = ['', '']
  emit('update-variable', { previousName: selected.value.name, variable: next })
}

const commitName = () => {
  if (!selected.value) return
  const nextName = nameDraft.value.trim()
  nameError.value = validateVariableName(nextName, props.variables, selected.value.name)
  if (nameError.value || nextName === selected.value.name) return
  emit('update-variable', {
    previousName: selected.value.name,
    variable: { ...selected.value, name: nextName },
  })
}

const updateNumberDefault = (value: number | null) => updateSelected({
  defaultValue: value === null ? '' : String(value),
})

const updateOptions = (options: string[]) => {
  const cleaned = options.map(option => option || '')
  const defaultValue = cleaned.includes(selected.value?.defaultValue || '') ? selected.value?.defaultValue : ''
  updateSelected({ options: cleaned, defaultValue })
}
</script>

<style scoped>
.variable-inspector { box-sizing: border-box; height: 100%; min-height: 0; display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--border-default); background: var(--surface-primary); }
.variable-inspector :deep(> .n-card-header) { flex: 0 0 auto; min-height: 52px; padding: 10px var(--content-padding); border-bottom: 1px solid var(--border-default); background: var(--surface-secondary); }
.variable-inspector :deep(> .n-card__content) { flex: 1 1 0; min-height: 0; padding: 0; overflow: hidden; }
.inspector-header, .property-heading { display: flex; align-items: center; justify-content: space-between; gap: var(--compact-padding); }
.inspector-subtitle, .property-subtitle { display: block; margin-top: 2px; font-size: 12px; }
.inspector-layout { height: 100%; min-height: 0; display: grid; grid-template-rows: minmax(150px, 42%) minmax(0, 1fr); }
.variable-directory { min-height: 0; border-bottom: 1px solid var(--border-default); background: var(--surface-secondary); }
.variable-directory :deep(.n-scrollbar-content) { padding: var(--compact-padding); }
.variable-group + .variable-group { margin-top: var(--content-padding); }
.group-label { display: block; margin: 0 4px 6px; font-size: 12px; font-weight: var(--font-weight-medium); text-transform: uppercase; letter-spacing: .04em; }
.variable-directory-item { width: 100%; min-height: 38px; padding: 7px 8px; display: flex; align-items: center; justify-content: space-between; gap: 8px; border: 0; border-radius: var(--radius-control); color: var(--content-primary); background: transparent; font: inherit; text-align: left; cursor: pointer; }
.variable-directory-item:hover { background: var(--interactive-hover); }
.variable-directory-item.selected { background: var(--surface-tertiary); font-weight: var(--font-weight-medium); }
.variable-directory-item:focus-visible { outline: 2px solid var(--interactive-focus); outline-offset: 1px; }
.variable-directory-item.unused { color: var(--content-secondary); }
.variable-directory-main, .variable-directory-meta { display: flex; align-items: center; gap: 6px; min-width: 0; }
.variable-directory-main :deep(.n-icon) { flex: 0 0 auto; color: var(--accent-primary); }
.unused .variable-directory-main :deep(.n-icon) { color: var(--accent-warning); }
.variable-directory-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.variable-directory-meta { flex: 0 0 auto; color: var(--content-secondary); font-size: 12px; font-weight: var(--font-weight-normal); }
.variable-empty { padding: 28px 12px; }
.variable-properties { min-height: 0; background: var(--surface-primary); }
.variable-properties :deep(.n-scrollbar-content) { padding: var(--content-padding); }
.property-heading { margin-bottom: var(--content-padding); }
.property-title { display: block; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.variable-form :deep(.n-form-item) { margin-bottom: 12px; }
.property-row { display: grid; grid-template-columns: minmax(0, 1fr) 72px; gap: var(--compact-padding); }
.required-field :deep(.n-form-item-blank) { align-items: center; }
.properties-empty { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: var(--content-padding); color: var(--content-tertiary); text-align: center; }
</style>
