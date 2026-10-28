<template>
  <div ref="root" class="fields">
    <div v-if="!variables.length" class="fields__empty">{{ t('promptPage.noVariables') }}</div>

    <div v-for="variable in variables" :key="variable.name" class="field"
      :class="{ 'field--active': variable.name === activeName && !isMissing(variable), 'field--missing': isMissing(variable) }"
      :data-variable-field="variable.name">
      <div class="field__head">
        <label class="field__label" :for="fieldId(variable)">
          {{ variable.name }}<span v-if="variable.required" class="field__required" aria-hidden="true">*</span>
        </label>
        <span class="field__meta" :class="{ 'field__meta--warning': isMissing(variable) }">{{ metaText(variable) }}</span>
      </div>

      <!-- 选项：三个以内平铺，多了用下拉 -->
      <div v-if="kind(variable) === 'choices'" class="field__choices" role="radiogroup" :aria-label="variable.name">
        <NButton v-for="(option, index) in options(variable)" :key="option" :id="index === 0 ? fieldId(variable) : undefined" size="small"
          :type="values[variable.name] === option ? 'primary' : 'default'" role="radio"
          :aria-checked="values[variable.name] === option"
          @click="update(variable, values[variable.name] === option ? '' : option)" @focus="emit('focus', variable.name)">
          {{ option }}
        </NButton>
      </div>
      <NSelect v-else-if="kind(variable) === 'select'" :value="stringValue(variable) || null" clearable
        :input-props="{ id: fieldId(variable) }"
        :options="options(variable).map(option => ({ label: option, value: option }))"
        :placeholder="variable.placeholder || t('promptPage.selectPlaceholder')"
        @update:value="value => update(variable, value ?? '')" @focus="emit('focus', variable.name)"
        @blur="event => handleBlur(variable, event)" />
      <NInputNumber v-else-if="kind(variable) === 'number'" :value="numberValue(variable)" clearable
        :input-props="{ id: fieldId(variable) }" :placeholder="variable.placeholder || ''"
        @update:value="value => update(variable, value ?? '')" @focus="emit('focus', variable.name)"
        @blur="event => handleBlur(variable, event)" />
      <div v-else-if="kind(variable) === 'boolean'" class="field__switch">
        <NSwitch :value="booleanValue(variable)" :aria-label="variable.name"
          @update:value="value => update(variable, value)" @focus="emit('focus', variable.name)" />
        <span>{{ booleanValue(variable) ? t('promptPage.yes') : t('promptPage.no') }}</span>
      </div>
      <NInput v-else-if="kind(variable) === 'textarea'" type="textarea" :value="stringValue(variable)"
        :autosize="{ minRows: 3, maxRows: 7 }" :input-props="{ id: fieldId(variable) }"
        :class="{ 'field__mono': isJinjaCode(variable) }"
        :placeholder="variable.placeholder || ''" @update:value="value => update(variable, value)"
        @focus="emit('focus', variable.name)" @blur="event => handleBlur(variable, event)" />
      <NInput v-else :value="stringValue(variable)" :input-props="{ id: fieldId(variable), onPaste: (event: ClipboardEvent) => handlePaste(event, variable) }"
        :placeholder="variable.placeholder || ''" @update:value="value => update(variable, value)"
        @focus="emit('focus', variable.name)" @blur="event => handleBlur(variable, event)" />

      <!-- Jinja 的 list / dict 变量：说明怎么填，渲染时换成数组 / 对象（与移动端一致） -->
      <p v-if="isJinjaCode(variable)" class="ui-help">{{ jinjaHint(variable) }}</p>
      <p v-if="variable.description" class="ui-help">{{ variable.description }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { NButton, NInput, NInputNumber, NSelect, NSwitch } from 'naive-ui'
import {
  hasLineBreak, isEmptyPromptValue, normalizeVariableType, type EditablePromptVariable,
} from '@/lib/utils/prompt-template'

const props = withDefaults(defineProps<{
  variables: EditablePromptVariable[]
  values: Record<string, any>
  /** 正文里独占一行或在代码块里的变量，默认给多行输入框 */
  multilineNames?: Set<string>
  /** 值的来源，用来在字段右上角标「上次填写」「默认值」 */
  sources?: Record<string, 'last' | 'default'>
  /** 已经提示过的必填项；未提示前不标红，避免一打开就满屏警告 */
  revealMissing?: Set<string>
  /** 当前在填的变量（点了正文里的变量或聚焦了字段），对应字段高亮 */
  activeName?: string
  jinja?: boolean
}>(), {
  multilineNames: () => new Set<string>(),
  sources: () => ({}),
  revealMissing: () => new Set<string>(),
  activeName: '',
  jinja: false,
})

const emit = defineEmits<{
  'update:values': [values: Record<string, any>]
  focus: [name: string]
  blur: [name: string]
}>()

const { t } = useI18n()
const root = ref<HTMLElement>()
// 粘贴了多行内容或已有多行值的文本变量，换成多行输入框后不再变回单行
const expanded = ref(new Set<string>())

const fieldId = (variable: EditablePromptVariable) => `variable-field-${encodeURIComponent(variable.name)}`
const options = (variable: EditablePromptVariable) => (variable.options || []).filter(Boolean)
const stringValue = (variable: EditablePromptVariable) => {
  const value = props.values[variable.name]
  return value === undefined || value === null ? '' : String(value)
}
const numberValue = (variable: EditablePromptVariable) => {
  const value = props.values[variable.name]
  if (value === '' || value === undefined || value === null) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}
const booleanValue = (variable: EditablePromptVariable) => {
  const value = props.values[variable.name]
  return value === true || value === 'true'
}

const isJinjaCode = (variable: EditablePromptVariable) => props.jinja && ['list', 'dict'].includes(String(variable.type))
// list 每行一项（或 JSON 数组），dict 填 JSON 对象；见 parseJinjaVariableValue
const jinjaHint = (variable: EditablePromptVariable) => (
  String(variable.type) === 'list' ? t('promptFill.listHint') : t('promptFill.dictHint')
)

const kind = (variable: EditablePromptVariable) => {
  const type = normalizeVariableType(String(variable.type))
  if (type === 'select') return options(variable).length <= 3 ? 'choices' : 'select'
  if (type === 'number' || type === 'boolean' || type === 'textarea') return type
  if (isJinjaCode(variable)) return 'textarea'
  if (props.multilineNames.has(variable.name) || expanded.value.has(variable.name) || hasLineBreak(stringValue(variable))) return 'textarea'
  return 'text'
}

const isMissing = (variable: EditablePromptVariable) => (
  variable.required && props.revealMissing.has(variable.name) && isEmptyPromptValue(props.values[variable.name])
)

const metaText = (variable: EditablePromptVariable) => {
  if (isMissing(variable)) return t('promptPage.notFilled')
  const source = props.sources[variable.name]
  if (source === 'last') return t('promptPage.lastUsedValue')
  if (source === 'default') return t('promptPage.defaultValue')
  if (props.jinja) return String(variable.type)
  if (kind(variable) === 'textarea') return t('promptPage.longText')
  return ''
}

const update = (variable: EditablePromptVariable, value: any) => {
  emit('update:values', { ...props.values, [variable.name]: value })
}

// 单行输入框会吞掉换行：粘贴多行内容时先自己插入，再换成多行输入框并把光标放到粘贴内容之后
const handlePaste = async (event: ClipboardEvent, variable: EditablePromptVariable) => {
  const pasted = event.clipboardData?.getData('text/plain') ?? ''
  const input = event.target as HTMLInputElement | null
  if (!input || !hasLineBreak(pasted)) return
  event.preventDefault()
  const text = pasted.replace(/\r\n?/g, '\n')
  const start = input.selectionStart ?? input.value.length
  const end = input.selectionEnd ?? start
  const caret = start + text.length
  update(variable, input.value.slice(0, start) + text + input.value.slice(end))
  expanded.value = new Set([...expanded.value, variable.name])
  await nextTick()
  const textarea = root.value?.querySelector<HTMLTextAreaElement>(`[data-variable-field="${CSS.escape(variable.name)}"] textarea`)
  textarea?.focus()
  textarea?.setSelectionRange(caret, caret)
}

// 点正文里的变量跳到别的字段时，刚离开的字段先不标「还没填」，免得橙色底看起来像跳到了它；复制时仍会标出所有没填的
const handleBlur = (variable: EditablePromptVariable, event?: FocusEvent) => {
  const next = event?.relatedTarget
  if (next instanceof Element && next.closest('.ui-var')) return
  emit('blur', variable.name)
}

// 字段里第一个能聚焦的控件：输入框、选项按钮，以及带 tabindex 的下拉（Naive 选择框的标签区）和开关
const FOCUSABLE = 'input:not([type="hidden"]):not([disabled]), textarea, button, [tabindex]:not([tabindex="-1"])'

/** 点正文里的变量时定位到对应字段：滚到可见处并把焦点放进去，下拉、开关、按钮组也一样 */
const focusField = async (name: string) => {
  await nextTick()
  const field = root.value?.querySelector<HTMLElement>(`[data-variable-field="${CSS.escape(name)}"]`)
  if (!field) return
  field.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  field.querySelector<HTMLElement>(FOCUSABLE)?.focus({ preventScroll: true })
}

defineExpose({ focusField })
</script>

<style scoped>
.fields {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.fields__empty {
  padding: 24px 0;
  color: var(--content-tertiary);
  font-size: var(--font-size-sm);
  text-align: center;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field--missing,
.field--active {
  margin: 0 -12px;
  padding: 12px;
  border-radius: var(--radius-panel);
  background: var(--accent-warning-bg);
}

/* 正在填的字段（和正文里高亮的变量对应） */
.field--active {
  background: var(--accent-soft);
}

.field__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.field__label {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
  color: var(--content-primary);
}

.field__required {
  margin-left: 2px;
  color: var(--accent-error);
}

.field__meta {
  font-size: var(--font-size-xs);
  color: var(--content-tertiary);
}

.field__meta--warning {
  color: var(--accent-warning);
}

.field__choices {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.field__switch {
  display: flex;
  align-items: center;
  gap: 8px;
  height: var(--control-height-sm);
  font-size: var(--font-size-sm);
  color: var(--content-secondary);
}

.field__mono :deep(textarea) {
  font-family: var(--font-family-mono);
  font-size: var(--font-size-sm);
}
</style>
