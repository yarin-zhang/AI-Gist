<template>
  <div ref="root" class="inline-fill">
    <template v-for="(segment, index) in segments" :key="`${segment.start}-${index}`">
      <template v-if="segment.kind === 'text'">{{ segment.text }}</template>
      <template v-else-if="!byName.get(segment.name)">{{ segment.raw }}</template>

      <!-- 同一个变量再次出现时只显示值，点一下回到第一处填写 -->
      <button v-else-if="!segment.firstOccurrence" type="button" tabindex="-1" class="ui-var"
        :class="{ 'ui-var--missing': isMissing(segment.name) }" @click="focusField(segment.name)">
        <small class="ui-var__label">{{ segment.name }}</small>{{ displayValue(segment.name) }}
      </button>

      <span v-else-if="kindOf(segment) === 'textarea'" class="inline-fill__block"
        :class="{ 'is-missing': isMissing(segment.name) }" :data-variable-field="segment.name">
        <small class="ui-var__label">{{ segment.name }}</small>
        <textarea :value="stringValue(segment.name)" rows="3" :aria-label="segment.name"
          :placeholder="placeholder(segment.name)" @input="update(segment.name, ($event.target as HTMLTextAreaElement).value)" />
      </span>

      <span v-else class="ui-var inline-fill__var"
        :class="{ 'ui-var--missing': isMissing(segment.name), 'inline-fill__var--choices': isChoiceKind(kindOf(segment)) }"
        :data-variable-field="segment.name">
        <small class="ui-var__label">{{ segment.name }}</small>

        <span v-if="isChoiceKind(kindOf(segment))" class="inline-fill__choices" role="radiogroup" :aria-label="segment.name">
          <button v-for="(choice, choiceIndex) in choices(segment)" :key="String(choice.value)" type="button" role="radio"
            class="inline-fill__choice" :class="{ 'is-active': isChosen(segment.name, choice.value) }"
            :aria-checked="isChosen(segment.name, choice.value)"
            :tabindex="rovingIndex(segment) === choiceIndex ? 0 : -1"
            @click="choose(segment, choice.value)" @keydown="moveChoice($event, segment, choiceIndex)">
            {{ choice.label }}
          </button>
        </span>

        <span v-else-if="kindOf(segment) === 'select'" class="inline-fill__select">
          <select :value="stringValue(segment.name)" :aria-label="segment.name"
            @change="update(segment.name, ($event.target as HTMLSelectElement).value)">
            <option value="">{{ placeholder(segment.name) || t('promptPage.selectPlaceholder') }}</option>
            <option v-for="option in options(segment.name)" :key="option" :value="option">{{ option }}</option>
          </select>
          <NIcon :size="12" aria-hidden="true"><ChevronDown /></NIcon>
        </span>

        <span v-else class="inline-fill__sizer" :data-value="stringValue(segment.name) || placeholder(segment.name)">
          <input :value="stringValue(segment.name)" :aria-label="segment.name" :placeholder="placeholder(segment.name)"
            :inputmode="kindOf(segment) === 'number' ? 'decimal' : undefined" spellcheck="false"
            @input="update(segment.name, ($event.target as HTMLInputElement).value)"
            @paste="handlePaste($event, segment.name)" />
        </span>
      </span>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { NIcon } from 'naive-ui'
import { ChevronDown } from '@vicons/tabler'
import type { PromptWithRelations } from '@shared/types/database'
import {
  findMultilineVariableStarts, getActivePromptVariables, hasLineBreak, isEmptyPromptValue, normalizeVariableType,
  parsePromptTemplate, type PromptVariableSegment,
} from '@/lib/utils/prompt-template'

type FieldKind = 'text' | 'number' | 'textarea' | 'choices' | 'boolean' | 'select'
type ChoiceValue = string | boolean

const props = withDefaults(defineProps<{
  prompt: PromptWithRelations
  values: Record<string, any>
  /** 尝试复制后仍未填写的必填项，才标橙色虚线框 */
  revealMissing?: Set<string>
}>(), {
  revealMissing: () => new Set<string>(),
})

const emit = defineEmits<{ 'update:values': [values: Record<string, any>] }>()

const { t } = useI18n()
const root = ref<HTMLElement>()
// 粘贴了多行内容的文本变量换成多行输入框后不再变回单行
const expanded = ref(new Set<string>())

const variables = computed(() => getActivePromptVariables(props.prompt))
const byName = computed(() => new Map(variables.value.map(variable => [variable.name, variable])))
const parsed = computed(() => parsePromptTemplate(props.prompt.content || ''))
const segments = computed(() => parsed.value.segments)
const multilineStarts = computed(() => findMultilineVariableStarts(props.prompt.content || '', parsed.value.segments))

const options = (name: string) => (byName.value.get(name)?.options || []).filter(Boolean)
// 清空的字段复制时用默认值，占位文字里直接显示出来
const placeholder = (name: string) => byName.value.get(name)?.placeholder || byName.value.get(name)?.defaultValue || ''
const stringValue = (name: string) => {
  const value = props.values[name]
  return value === undefined || value === null ? '' : String(value)
}
const displayValue = (name: string) => {
  if (normalizeVariableType(byName.value.get(name)?.type || 'text') === 'boolean') {
    const value = props.values[name]
    return value === true || value === 'true' ? t('promptPage.yes') : t('promptPage.no')
  }
  return stringValue(name) || name
}
const isMissing = (name: string) => props.revealMissing.has(name) && isEmptyPromptValue(props.values[name])
  && isEmptyPromptValue(byName.value.get(name)?.defaultValue)
const isChoiceKind = (kind: FieldKind) => kind === 'choices' || kind === 'boolean'

const kindOf = (segment: PromptVariableSegment): FieldKind => {
  const type = normalizeVariableType(byName.value.get(segment.name)?.type || 'text')
  if (type === 'select' && options(segment.name).length) return options(segment.name).length <= 3 ? 'choices' : 'select'
  if (type === 'boolean') return 'boolean'
  if (type === 'number') return 'number'
  if (type === 'textarea' || expanded.value.has(segment.name) || multilineStarts.value.has(segment.start)
    || hasLineBreak(props.values[segment.name])) return 'textarea'
  return 'text'
}

const choices = (segment: PromptVariableSegment): { value: ChoiceValue; label: string }[] => (
  kindOf(segment) === 'boolean'
    ? [{ value: true, label: t('promptPage.yes') }, { value: false, label: t('promptPage.no') }]
    : options(segment.name).map(option => ({ value: option, label: option }))
)
const isChosen = (name: string, value: ChoiceValue) => (
  typeof value === 'boolean'
    ? (props.values[name] === true || props.values[name] === 'true') === value
    : props.values[name] === value
)
// 一组选项只占一个 Tab 位：选中项可聚焦，没选时第一个可聚焦
const rovingIndex = (segment: PromptVariableSegment) => Math.max(
  choices(segment).findIndex(choice => isChosen(segment.name, choice.value)), 0)

const update = (name: string, value: any) => emit('update:values', { ...props.values, [name]: value })

const choose = (segment: PromptVariableSegment, value: ChoiceValue) => {
  // 选项再点一次取消，开关只能在是 / 否之间切换
  if (typeof value === 'string' && props.values[segment.name] === value) update(segment.name, '')
  else update(segment.name, value)
}

const moveChoice = (event: KeyboardEvent, segment: PromptVariableSegment, index: number) => {
  const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1
    : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0
  if (!step) return
  event.preventDefault()
  event.stopPropagation()
  const list = choices(segment)
  const next = (index + step + list.length) % list.length
  update(segment.name, list[next].value)
  const group = (event.currentTarget as HTMLElement).parentElement
  void nextTick(() => group?.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus())
}

const handlePaste = async (event: ClipboardEvent, name: string) => {
  const pasted = event.clipboardData?.getData('text/plain') ?? ''
  const input = event.target as HTMLInputElement | null
  if (!input || !hasLineBreak(pasted)) return
  // 单行输入框会把换行吞掉，先自己插入，再换成多行输入框
  event.preventDefault()
  const text = pasted.replace(/\r\n?/g, '\n')
  const start = input.selectionStart ?? input.value.length
  const end = input.selectionEnd ?? start
  const caret = start + text.length
  update(name, input.value.slice(0, start) + text + input.value.slice(end))
  expanded.value = new Set([...expanded.value, name])
  await nextTick()
  const textarea = fieldControl(name) as HTMLTextAreaElement | null
  textarea?.focus()
  textarea?.setSelectionRange(caret, caret)
}

const fieldControl = (name: string) => {
  const field = Array.from(root.value?.querySelectorAll<HTMLElement>('[data-variable-field]') || [])
    .find(item => item.dataset.variableField === name)
  return field?.querySelector<HTMLElement>('input, textarea, select, [role="radio"][tabindex="0"]') || null
}

const focusField = (name: string) => {
  const control = fieldControl(name)
  control?.scrollIntoView({ block: 'nearest' })
  control?.focus()
}

const focusFirst = () => {
  const first = variables.value.find(variable => fieldControl(variable.name))
  if (first) focusField(first.name)
  return Boolean(first)
}

defineExpose({ focusField, focusFirst })
</script>

<style scoped>
.inline-fill {
  color: var(--content-primary);
  font-size: var(--font-size-base);
  line-height: 2;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.inline-fill__var {
  max-width: 100%;
  cursor: text;
}

.inline-fill__var:focus-within,
.inline-fill__block:focus-within {
  outline: 1px solid var(--accent-primary);
  outline-offset: -1px;
  box-shadow: var(--focus-ring);
}

/* 选项按钮自己有聚焦框，外层不再叠一圈 */
.inline-fill__var--choices:focus-within {
  outline: none;
  box-shadow: none;
}

.inline-fill__var--choices {
  align-items: center;
  gap: 4px;
  padding: 2px 3px 2px 8px;
  line-height: 1.5;
  cursor: default;
}

.inline-fill__sizer {
  display: inline-grid;
  min-width: 0;
  max-width: 100%;
}

/* 用隐藏的同内容文本撑开宽度，输入框始终和内容一样宽 */
.inline-fill__sizer::after {
  content: attr(data-value) ' ';
  visibility: hidden;
  grid-area: 1 / 1;
  overflow: hidden;
  white-space: pre;
}

.inline-fill__sizer input {
  grid-area: 1 / 1;
  width: 100%;
  min-width: 2ch;
  padding: 0;
  border: 0;
  outline: none;
  background: transparent;
  color: inherit;
  font: inherit;
}

.inline-fill__sizer input::placeholder,
.inline-fill__block textarea::placeholder {
  color: var(--variable-label);
}

.inline-fill__choices {
  display: inline-flex;
  gap: 2px;
}

.inline-fill__choice {
  height: 22px;
  padding: 0 8px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-control);
  background: var(--surface-primary);
  color: var(--content-primary);
  font: inherit;
  font-size: var(--font-size-sm);
  cursor: pointer;
}

.inline-fill__choice:hover {
  border-color: var(--border-strong);
}

.inline-fill__choice.is-active {
  border-color: var(--accent-primary);
  background: var(--accent-primary);
  color: var(--content-inverse, #fff);
}

.inline-fill__choice:focus-visible {
  outline: 2px solid var(--accent-primary);
  outline-offset: 1px;
}

.inline-fill__select {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.inline-fill__select select {
  max-width: 220px;
  padding: 0 2px 0 0;
  border: 0;
  outline: none;
  background: transparent;
  color: inherit;
  font: inherit;
  appearance: none;
  cursor: pointer;
}

.inline-fill__block {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 4px 0;
  padding: 6px 10px;
  border-radius: var(--radius-control);
  background: var(--variable-bg);
  color: var(--variable-text);
  line-height: 1.6;
}

.inline-fill__block.is-missing {
  outline: 1.5px dashed var(--variable-missing);
  outline-offset: -1.5px;
}

.inline-fill__block textarea {
  min-height: 60px;
  padding: 0;
  border: 0;
  outline: none;
  background: transparent;
  color: inherit;
  font: inherit;
  resize: vertical;
}
</style>
