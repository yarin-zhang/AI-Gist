<!--
  移动端使用页底部的变量填写面板（V5-M-Use）：一次只填一个变量，进度条显示已填情况，
  「上一个」「下一个」逐个切换，最后一个变量（或必填项都已填好）时主按钮变为「完成并复制」。

  变量的解析、默认值兜底和必填校验全部复用 `~/lib/utils/prompt-template`，与桌面端
  同一份源码，因此两端对同一个提示词解析出的变量一致；这里只实现触屏交互：
  选项和开关用大号胶囊，文本用原生输入框，变量独占一行或值里带换行时改用多行文本框。
-->
<template>
  <section ref="rootRef" class="m-sheet fill-panel" :aria-label="t('promptWorkspace.fillVariables')">
    <div class="m-grab fill-panel__grab" aria-hidden="true" />

    <div class="fill-progress" role="group" :aria-label="t('promptFill.progress', { filled: filledCount, total: variables.length }, filledCount)">
      <button v-for="(variable, index) in variables" :key="variable.name" type="button" class="fill-progress__step"
        :class="{
          'is-filled': isFilled(variable),
          'is-current': index === currentIndex,
          'has-error': showError(variable.name),
        }"
        :aria-label="variable.name" :aria-current="index === currentIndex ? 'step' : undefined" @click="goTo(index, true)">
        <span class="fill-progress__bar" />
      </button>
    </div>

    <template v-for="variable in currentVariables" :key="variable.name">
      <div class="fill-field">
        <div class="fill-field__head">
          <label class="fill-field__name" :for="inputId">
            {{ variable.name }}<span v-if="variable.required" class="fill-field__required" aria-hidden="true">*</span>
          </label>
          <span class="fill-field__step">{{ t('mobilePrompt.stepOf', { index: currentIndex + 1, total: variables.length }) }}</span>
        </div>

        <div v-if="kindOf(variable) === 'select'" class="fill-field__choices" role="radiogroup" :aria-label="variable.name">
          <button v-for="option in variable.options || []" :key="option" type="button" class="m-chip m-chip-lg" role="radio"
            :class="{ on: modelValue[variable.name] === option }" :aria-checked="modelValue[variable.name] === option"
            @click="choose(variable, option)">
            {{ option }}
          </button>
        </div>

        <div v-else-if="kindOf(variable) === 'boolean'" class="fill-field__choices" role="radiogroup" :aria-label="variable.name">
          <button v-for="option in booleanOptions" :key="option.label" type="button" class="m-chip m-chip-lg" role="radio"
            :class="{ on: modelValue[variable.name] === option.value }" :aria-checked="modelValue[variable.name] === option.value"
            @click="handleChange(variable.name, option.value)">
            {{ option.label }}
          </button>
        </div>

        <textarea v-else-if="kindOf(variable) === 'textarea' || kindOf(variable) === 'list'" :id="inputId"
          class="fill-field__input fill-field__textarea" rows="3" :placeholder="placeholderFor(variable)" :value="stringValue(variable)"
          :aria-invalid="showError(variable.name)" @input="handleTextarea(variable, $event)"
          @blur="markTouched(variable.name)"></textarea>

        <input v-else :id="inputId" class="fill-field__input" type="text" enterkeyhint="next"
          :inputmode="kindOf(variable) === 'number' ? 'decimal' : undefined" :placeholder="placeholderFor(variable)"
          :value="stringValue(variable)" :aria-invalid="showError(variable.name)"
          @input="handleInput(variable, ($event.target as HTMLInputElement).value)" @blur="markTouched(variable.name)"
          @keydown.enter.prevent="handleEnter" @paste="handlePaste(variable, $event)" />

        <!-- 有错误提示时优先显示错误，避免同一字段下堆两行小字 -->
        <p v-if="showError(variable.name)" class="fill-field__error" role="alert">{{ t('promptWorkspace.requiredValue') }}</p>
        <p v-else-if="switchedNames.has(variable.name)" class="fill-field__hint">{{ t('promptFill.switchedToMultiline') }}</p>
        <template v-else>
          <!-- Jinja 的列表变量：每行一项，渲染时按数组传给模板；字典变量填 JSON 对象 -->
          <p v-if="kindOf(variable) === 'list'" class="fill-field__hint">{{ t('promptFill.listHint') }}</p>
          <p v-else-if="variable.type === 'dict'" class="fill-field__hint">{{ t('promptFill.dictHint') }}</p>
          <p v-if="variable.description" class="fill-field__hint">{{ variable.description }}</p>
        </template>
        <p v-if="renderError && isLast" class="fill-field__error" role="alert">
          {{ t('promptWorkspace.renderFailedWithError', { error: renderError }) }}
        </p>
      </div>
    </template>

    <div class="fill-actions">
      <button type="button" class="m-cta m-cta-2 fill-actions__prev" :disabled="currentIndex === 0" @click="goTo(currentIndex - 1, true)">
        {{ t('mobilePrompt.previous') }}
      </button>
      <button v-if="finishing" type="button" class="m-cta" :disabled="copying" @click="emit('copy')">
        <ion-icon :icon="copyOutline" aria-hidden="true" />
        {{ t('mobilePrompt.finishAndCopy') }}
      </button>
      <button v-else type="button" class="m-cta" @click="goTo(currentIndex + 1, true)">
        {{ t('mobilePrompt.next') }}
        <ion-icon :icon="chevronForward" aria-hidden="true" />
      </button>
    </div>

    <button v-if="canRun" type="button" class="fill-run" @click="emit('run')">
      <ion-icon :icon="playCircleOutline" aria-hidden="true" />
      {{ t('promptAI.run') }}
    </button>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { IonIcon } from '@ionic/vue'
import { chevronForward, copyOutline, playCircleOutline } from 'ionicons/icons'
import { useI18n } from '~/composables/useI18n'
import {
  findMultilineVariableNames,
  getMissingPromptVariables,
  hasLineBreak,
  isEmptyPromptValue,
  normalizeVariableType,
  type EditablePromptVariable,
} from '~/lib/utils/prompt-template'

const props = withDefaults(defineProps<{
  variables: EditablePromptVariable[]
  modelValue: Record<string, any>
  // 桌面端复制前的校验契约是“必填变量都已填写 且 模板渲染没有出错”才算通过。
  // 这个 prop 把渲染错误从父组件（使用页）传进来，让本组件的 validateAndFocus()
  // 独立满足同样的契约，不依赖调用方在外部再补一次 rendered.error 检查。
  renderError?: string
  // 提示词正文：变量独占一行或在代码块里时，按多行文本渲染（与桌面端同一规则）。
  content?: string
  /** 当前正在填写的变量序号 */
  active?: number
  /** 有可用模型时显示「先试运行」 */
  canRun?: boolean
  copying?: boolean
}>(), {
  renderError: '',
  content: '',
  active: 0,
  canRun: false,
  copying: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: Record<string, any>]
  'update:active': [index: number]
  copy: []
  run: []
}>()

const { t } = useI18n()
const touched = ref<Set<string>>(new Set())
const switchedNames = ref<Set<string>>(new Set())
const rootRef = ref<HTMLElement | null>(null)

const missing = computed(() => getMissingPromptVariables(props.variables, props.modelValue))
const filledCount = computed(() => props.variables.filter(variable => !isEmptyPromptValue(props.modelValue[variable.name])).length)

const currentIndex = computed(() => Math.min(Math.max(props.active, 0), Math.max(props.variables.length - 1, 0)))
// 用单元素数组渲染当前变量：切换变量时整块重建，原生输入框不会残留上一个变量的状态
const currentVariables = computed(() => {
  const variable = props.variables[currentIndex.value]
  return variable ? [variable] : []
})
const inputId = computed(() => `fill-input-${currentIndex.value}`)
const isLast = computed(() => currentIndex.value >= props.variables.length - 1)
// 最后一个变量，或者必填项都已填好时，主按钮直接「完成并复制」
const finishing = computed(() => isLast.value || missing.value.length === 0)

const booleanOptions = computed(() => [
  { label: t('promptPage.yes'), value: true },
  { label: t('promptPage.no'), value: false },
])

// 单行输入框会把换行吞成空格。文本变量在「位置像多行内容」或「值里已有换行」时
// 改用多行文本框；一旦切过去就保持多行，避免删掉最后一个换行时控件来回切换。
const multilineNames = computed(() => findMultilineVariableNames(props.content || ''))
const expandedNames = ref<Set<string>>(new Set())
watch(() => props.modelValue, values => {
  const added = Object.keys(values).filter(name => hasLineBreak(values[name]) && !expandedNames.value.has(name))
  if (added.length) expandedNames.value = new Set([...expandedNames.value, ...added])
}, { immediate: true, deep: true })

const kindOf = (variable: EditablePromptVariable) => {
  // Jinja 的 list / dict 变量用多行输入：list 每行一项，dict 填 JSON（与桌面端一致）
  if (variable.type === 'list') return 'list'
  if (variable.type === 'dict') return 'textarea'
  const kind = normalizeVariableType(variable.type)
  // 选项类型还没配置选项时退回文本输入
  if (kind === 'select' && !variable.options?.length) return 'text'
  if (kind === 'text' && (multilineNames.value.has(variable.name) || expandedNames.value.has(variable.name))) return 'textarea'
  return kind
}

// 与桌面端的兜底规则保持一致：没有单独配置 placeholder 时，先显示默认值（清空后复制用的就是它），再用变量名兜底。
const placeholderFor = (variable: EditablePromptVariable) => variable.placeholder || variable.defaultValue || variable.name
const stringValue = (variable: EditablePromptVariable) => {
  const value = props.modelValue[variable.name]
  return value === undefined || value === null ? '' : String(value)
}

const isFilled = (variable: EditablePromptVariable) => !isEmptyPromptValue(props.modelValue[variable.name])
const showError = (name: string) => touched.value.has(name) && missing.value.includes(name)

const update = (name: string, value: any) => emit('update:modelValue', { ...props.modelValue, [name]: value })

const NUMBER_PATTERN = /^-?\d+(\.\d+)?$/

const handleInput = (variable: EditablePromptVariable, rawValue: string) => {
  // 数字变量输入到一半（如「1.」）时先按原文保存，避免输入框被改写
  if (kindOf(variable) === 'number' && NUMBER_PATTERN.test(rawValue.trim())) {
    update(variable.name, Number(rawValue.trim()))
    return
  }
  update(variable.name, rawValue)
}

const autoGrow = (element: HTMLTextAreaElement) => {
  element.style.height = 'auto'
  element.style.height = `${element.scrollHeight}px`
}

const handleTextarea = (variable: EditablePromptVariable, event: Event) => {
  const element = event.target as HTMLTextAreaElement
  autoGrow(element)
  update(variable.name, element.value)
}

// 粘贴多行文本时浏览器会先把换行压平再触发 input，所以在 paste 阶段自己插入原文；
// 值里有了换行后字段会切换成多行文本框，再把焦点和光标挪过去。
const handlePaste = async (variable: EditablePromptVariable, event: ClipboardEvent) => {
  const pasted = event.clipboardData?.getData('text/plain') ?? ''
  const input = event.target as HTMLInputElement | null
  if (kindOf(variable) !== 'text' || !(input instanceof HTMLInputElement) || !hasLineBreak(pasted)) return
  event.preventDefault()
  const text = pasted.replace(/\r\n?/g, '\n')
  const start = input.selectionStart ?? input.value.length
  const end = input.selectionEnd ?? start
  const caret = start + text.length
  switchedNames.value = new Set([...switchedNames.value, variable.name])
  update(variable.name, input.value.slice(0, start) + text + input.value.slice(end))
  await nextTick()
  const textarea = rootRef.value?.querySelector('.fill-field textarea') as HTMLTextAreaElement | null | undefined
  if (!textarea) return
  autoGrow(textarea)
  textarea.focus()
  textarea.setSelectionRange(caret, caret)
}

const choose = (variable: EditablePromptVariable, option: string) => {
  // 非必填的选项再点一次可以取消选择
  const next = props.modelValue[variable.name] === option && !variable.required ? '' : option
  handleChange(variable.name, next)
}

const handleChange = (name: string, value: any) => {
  update(name, value)
  markTouched(name)
}

const markTouched = (name: string) => {
  if (touched.value.has(name)) return
  touched.value = new Set([...touched.value, name])
}

const focusCurrent = async () => {
  await nextTick()
  const field = rootRef.value?.querySelector('.fill-field input, .fill-field textarea') as HTMLInputElement | HTMLTextAreaElement | null
  if (field instanceof HTMLTextAreaElement) autoGrow(field)
  field?.focus()
}

/** 切到第 index 个变量；focus 为 true 时顺便聚焦输入框（选项和开关没有输入框） */
const goTo = async (index: number, focus = false) => {
  if (index < 0 || index >= props.variables.length) return
  emit('update:active', index)
  if (focus) await focusCurrent()
}

const handleEnter = () => {
  if (finishing.value) emit('copy')
  else void goTo(currentIndex.value + 1, true)
}

/** 正文里点了某个变量：切过去并聚焦 */
const focusVariable = (name: string) => {
  const index = props.variables.findIndex(variable => variable.name === name)
  if (index >= 0) void goTo(index, true)
}

// 与桌面端复制前调用的 validateAndFocus() 是同一个约定：
// 存在必填但未填写的变量时，标记为已触碰（露出错误提示）、切到第一个
// 未填写的变量并聚焦，返回 false 让调用方（使用页的复制按钮）中止复制。
const validateAndFocus = async (): Promise<boolean> => {
  if (!missing.value.length && !props.renderError) return true
  touched.value = new Set([...touched.value, ...missing.value])
  if (missing.value.length) {
    const index = props.variables.findIndex(variable => variable.name === missing.value[0])
    await goTo(index, true)
  }
  return false
}

const resetValidation = () => {
  touched.value = new Set()
  switchedNames.value = new Set()
}

// 切换变量后，多行文本框按内容撑开高度
watch(currentIndex, async () => {
  await nextTick()
  const textarea = rootRef.value?.querySelector('.fill-field textarea') as HTMLTextAreaElement | null | undefined
  if (textarea) autoGrow(textarea)
})

defineExpose({ validateAndFocus, resetValidation, focusVariable })
</script>

<style scoped>
.fill-panel {
  gap: 16px;
  /* 固定在底部，不在 ion-content 的滚动层里：横屏刘海那一侧、iPhone Duo 的竖条那一侧要单独让开 */
  padding: 10px var(--m-inset-right) calc(env(safe-area-inset-bottom, 0px) + 16px) var(--m-inset-left);
  box-shadow: var(--shadow-floating);
}

.fill-panel__grab {
  margin-top: 0;
}

.fill-progress {
  display: flex;
  gap: 6px;
  margin: -8px 0 -6px;
}

/* 每一段进度条本身只有 4px 高，按钮留出足够的点按区域 */
.fill-progress__step {
  display: flex;
  flex: 1;
  align-items: center;
  height: 20px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.fill-progress__bar {
  width: 100%;
  height: 4px;
  border-radius: 2px;
  background: var(--border-default);
}

.fill-progress__step.is-current .fill-progress__bar {
  background: var(--accent-soft-border);
}

.fill-progress__step.is-filled .fill-progress__bar {
  background: var(--accent-primary);
}

.fill-progress__step.has-error .fill-progress__bar {
  background: var(--accent-error);
}

.fill-field {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.fill-field__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.fill-field__name {
  min-width: 0;
  overflow: hidden;
  color: var(--content-primary);
  font-size: var(--m-font-block);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fill-field__required {
  margin-left: 2px;
  color: var(--accent-error);
}

.fill-field__step {
  flex: none;
  color: var(--content-tertiary);
  font-size: var(--m-font-sub);
  font-variant-numeric: tabular-nums;
}

.fill-field__choices {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.fill-field__input {
  width: 100%;
  min-height: 50px;
  padding: 12px 14px;
  border: 0;
  border-radius: var(--m-radius-cta);
  outline: none;
  background: var(--surface-secondary);
  box-shadow: inset 0 0 0 1px var(--border-default);
  color: var(--content-primary);
  font: inherit;
  font-size: var(--m-font-body);
  -webkit-appearance: none;
  appearance: none;
}

.fill-field__input::placeholder {
  color: var(--content-muted);
}

.fill-field__input:focus {
  background: var(--surface-primary);
  box-shadow: inset 0 0 0 1px var(--accent-primary), var(--focus-ring);
}

.fill-field__input[aria-invalid='true'] {
  box-shadow: inset 0 0 0 1px var(--accent-error);
}

.fill-field__textarea {
  max-height: 32vh;
  line-height: 1.6;
  resize: none;
}

.fill-field__error,
.fill-field__hint {
  margin: -4px 0 0;
  font-size: var(--m-font-caption);
  line-height: 1.5;
}

.fill-field__error {
  color: var(--accent-error);
}

.fill-field__hint {
  color: var(--content-tertiary);
}

.fill-actions {
  display: flex;
  gap: 10px;
}

.fill-actions__prev {
  flex: none;
  width: 104px;
}

.fill-actions__prev:disabled {
  opacity: 0.5;
}

.fill-run {
  display: inline-flex;
  align-items: center;
  align-self: center;
  gap: 6px;
  min-height: 32px;
  margin-top: -6px;
  padding: 0 8px;
  border: 0;
  background: transparent;
  color: var(--accent-primary);
  font: inherit;
  font-size: var(--m-font-sub);
  font-weight: 600;
  cursor: pointer;
}
</style>
