<!--
  移动端"挖空"填写表单。

  对应 Gitea issue #87：移动端提示词详情页此前只能原样展示 `{{变量名}}` 占位符
  文字，没有任何交互式填写能力。桌面端已经有一套成熟实现——
  `src/renderer/components/prompt-management/PromptFillCanvas.vue` +
  `PromptVariableField.vue`——按变量类型渲染对应的 Naive UI 控件，并维护
  「已触碰 (touched) + 校验」状态，在用户尝试使用未填完的提示词时定位到第一个
  必填项。

  这个组件是同一套交互在移动端的等价实现：变量的解析、默认值兜底、必填校验
  规则全部直接复用 `~/lib/utils/prompt-template`（与桌面端引用的是同一份源码，
  见 vite.config.mobile.js 的 `@`/`~` 别名都指向 src/renderer），因此不会出现
  两端对同一个提示词解析出不同变量列表的情况；这里只重新实现了触屏交互部分：
  用纵向的 ion-item + ion-input/ion-textarea/ion-select/ion-toggle 列表代替桌面端
  的两列/行内编辑布局，更符合移动端惯例。
-->
<template>
  <ion-list class="variable-fill-list" lines="full">
    <div v-for="variable in variables" :key="variable.name" class="variable-fill-row">
      <ion-item
        :ref="(el: any) => setItemRef(variable.name, el)"
        class="variable-fill-item"
        :class="{ 'has-error': showError(variable.name) }"
      >
        <ion-select
          v-if="kindOf(variable) === 'select'"
          :label="labelFor(variable)"
          label-placement="stacked"
          :placeholder="placeholderFor(variable)"
          interface="action-sheet"
          :value="modelValue[variable.name]"
          @ionChange="handleChange(variable.name, $event.detail.value)"
        >
          <ion-select-option v-for="option in variable.options || []" :key="option" :value="option">
            {{ option }}
          </ion-select-option>
        </ion-select>

        <ion-toggle
          v-else-if="kindOf(variable) === 'boolean'"
          :checked="Boolean(modelValue[variable.name])"
          @ionChange="handleChange(variable.name, $event.detail.checked)"
        >
          {{ labelFor(variable) }}
        </ion-toggle>

        <ion-textarea
          v-else-if="kindOf(variable) === 'textarea'"
          :label="labelFor(variable)"
          label-placement="stacked"
          :placeholder="placeholderFor(variable)"
          :auto-grow="true"
          :rows="3"
          :value="stringValue(variable)"
          @ionInput="update(variable.name, $event.detail.value ?? '')"
          @ionBlur="markTouched(variable.name)"
        ></ion-textarea>

        <ion-input
          v-else
          :label="labelFor(variable)"
          label-placement="stacked"
          :type="kindOf(variable) === 'number' ? 'number' : 'text'"
          :inputmode="kindOf(variable) === 'number' ? 'decimal' : undefined"
          :placeholder="placeholderFor(variable)"
          :value="kindOf(variable) === 'number' ? numberValue(variable) : stringValue(variable)"
          @ionInput="handleInput(variable, $event.detail.value)"
          @ionBlur="markTouched(variable.name)"
        ></ion-input>
      </ion-item>

      <p v-if="showError(variable.name)" class="variable-error" role="alert">
        {{ t('promptWorkspace.requiredValue') }}
      </p>
    </div>
  </ion-list>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { IonInput, IonItem, IonList, IonSelect, IonSelectOption, IonTextarea, IonToggle } from '@ionic/vue'
import { useI18n } from '~/composables/useI18n'
import {
  getMissingPromptVariables,
  isEmptyPromptValue,
  normalizeVariableType,
  type EditablePromptVariable,
} from '~/lib/utils/prompt-template'

const props = defineProps<{
  variables: EditablePromptVariable[]
  modelValue: Record<string, any>
}>()

const emit = defineEmits<{
  'update:modelValue': [value: Record<string, any>]
}>()

const { t } = useI18n()
const touched = ref<Set<string>>(new Set())
const itemElements = new Map<string, HTMLElement>()

const missing = computed(() => getMissingPromptVariables(props.variables, props.modelValue))

const kindOf = (variable: EditablePromptVariable) => normalizeVariableType(variable.type)
const labelFor = (variable: EditablePromptVariable) => (variable.required ? `${variable.name} *` : variable.name)
// 与桌面端 PromptVariableField 的兜底规则保持一致：没有单独配置 placeholder 时，用变量名兜底。
const placeholderFor = (variable: EditablePromptVariable) => variable.placeholder || variable.name
const stringValue = (variable: EditablePromptVariable) => {
  const value = props.modelValue[variable.name]
  return value === undefined || value === null ? '' : String(value)
}
const numberValue = (variable: EditablePromptVariable) => {
  const value = props.modelValue[variable.name]
  if (value === '' || value === undefined || value === null) return ''
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : ''
}

const showError = (name: string) => touched.value.has(name) && missing.value.includes(name)

const update = (name: string, value: any) => emit('update:modelValue', { ...props.modelValue, [name]: value })

const handleInput = (variable: EditablePromptVariable, rawValue: string | number | null | undefined) => {
  if (kindOf(variable) !== 'number') {
    update(variable.name, rawValue ?? '')
    return
  }
  if (rawValue === '' || rawValue === undefined || rawValue === null) {
    update(variable.name, '')
    return
  }
  const parsed = Number(rawValue)
  update(variable.name, Number.isFinite(parsed) ? parsed : '')
}

const handleChange = (name: string, value: any) => {
  update(name, value)
  markTouched(name)
}

const markTouched = (name: string) => {
  if (touched.value.has(name)) return
  touched.value = new Set([...touched.value, name])
}

const setItemRef = (name: string, el: any) => {
  const element = (el && el.$el ? el.$el : el) as HTMLElement | undefined
  if (element) itemElements.set(name, element)
  else itemElements.delete(name)
}

// 与桌面端 copyPrompt() 前调用的 fillCanvasRef.validateAndFocus() 是同一个约定：
// 存在必填但未填写的变量时，标记为已触碰（露出错误提示）、滚动并聚焦到第一个
// 未填写的字段，并返回 false 让调用方（详情页的复制按钮）中止复制。
const validateAndFocus = async (): Promise<boolean> => {
  if (!missing.value.length) return true
  touched.value = new Set([...touched.value, ...missing.value])
  await nextTick()
  const target = itemElements.get(missing.value[0])
  target?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  const input = target?.querySelector('ion-input, ion-textarea, ion-select') as (HTMLElement & { setFocus?: () => Promise<void> }) | null
  if (input?.setFocus) await input.setFocus()
  return false
}

const resetValidation = () => { touched.value = new Set() }

defineExpose({ validateAndFocus, resetValidation })
</script>

<style scoped>
.variable-fill-list {
  background: transparent;
}

.variable-fill-row + .variable-fill-row {
  border-top: 1px solid var(--border-default);
}

.variable-fill-item {
  --background: transparent;
  --border-color: transparent;
  --padding-start: var(--content-padding);
  --inner-padding-end: var(--content-padding);
}

.variable-fill-item.has-error {
  --background: color-mix(in srgb, var(--accent-error) 8%, var(--surface-primary));
  --highlight-color-focused: var(--accent-error);
}

.variable-error {
  margin: 0;
  padding: 0 var(--content-padding) var(--spacing-sm);
  color: var(--accent-error);
  font-size: var(--mobile-font-size-caption);
  background: color-mix(in srgb, var(--accent-error) 8%, var(--surface-primary));
}
</style>
