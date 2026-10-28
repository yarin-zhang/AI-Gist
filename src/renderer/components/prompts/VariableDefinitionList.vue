<template>
  <div ref="rootRef" class="definitions">
    <div v-if="!variables.length" class="definitions__empty">{{ t('promptPage.noVariablesYet') }}</div>

    <template v-for="group in groups" :key="group.key">
      <span v-if="group.title && group.items.length" class="ui-overline definitions__group">{{ group.title }}</span>
      <template v-for="variable in group.items" :key="variable.name">
        <div v-if="variable.name === expandedName" class="definition-card">
          <div class="definition-card__head">
            <input v-model="nameDraft" class="definition-card__name" :aria-label="t('promptPage.variableName')"
              @blur="commitName" @keydown.enter="handleEnterKey($event, commitName)" @keydown.esc="revertName" />
            <NButton quaternary size="tiny" class="definition-card__collapse" :aria-label="t('promptPage.collapse')"
              @click="emit('update:expandedName', '')">
              <template #icon><NIcon :size="14"><ChevronUp /></NIcon></template>
            </NButton>
          </div>
          <span v-if="nameErrorText" class="err-msg">{{ nameErrorText }}</span>

          <div class="definition-card__field">
            <span class="definition-card__label">{{ t('promptPage.variableType') }}</span>
            <NSelect v-if="jinja" :value="String(variable.type)" :options="jinjaTypeOptions" size="small"
              @update:value="value => patch(variable, { type: value })" />
            <!-- 五个类型放得下（中文）时用分段；英文、日语、意大利语在面板里会被截成省略号，改用下拉 -->
            <UiSegmented v-else-if="typeFits" fill :model-value="normalizedType(variable)" :options="typeOptions"
              :label="t('promptPage.variableType')" @update:model-value="value => setType(variable, value)" />
            <NSelect v-else class="definition-card__type-select" size="small" :value="normalizedType(variable)"
              :options="typeOptions" :input-props="{ 'aria-label': t('promptPage.variableType') }"
              @update:value="value => setType(variable, value)" />
          </div>

          <div v-if="normalizedType(variable) === 'select' && !jinja" class="definition-card__field">
            <span class="definition-card__label">{{ t('promptPage.options') }}</span>
            <div class="definition-card__options">
              <!-- 选项是用户数据：太长时省略，悬停看全文 -->
              <span v-for="(option, index) in variable.options || []" :key="`${option}-${index}`" class="ui-tag ui-tag--line"
                :title="option">
                <span class="ui-tag__text">{{ option }}</span>
                <button type="button" class="definition-card__remove-option" :aria-label="t('promptPage.removeOption', { option })"
                  @click="removeOption(variable, index)">
                  <NIcon :size="12"><X /></NIcon>
                </button>
              </span>
              <!-- 回车加一项后输入框留着，可以接着输入下一项；Esc 或点别处结束 -->
              <input v-if="addingOption" ref="optionInputRef" v-model="optionDraft" class="definition-card__option-input"
                :placeholder="t('promptPage.optionPlaceholder')" :aria-label="t('promptPage.addOption')"
                @keydown.enter="handleEnterKey($event, () => commitOption(variable, true))"
                @keydown.esc="handleEscapeKey($event, cancelOption)" @blur="commitOption(variable)" />
              <NButton v-else ref="addOptionButtonRef" quaternary size="tiny" @click="startAddingOption">
                <template #icon><NIcon :size="12"><Plus /></NIcon></template>
                {{ t('promptPage.option') }}
              </NButton>
            </div>
          </div>

          <div class="definition-card__grid">
            <div class="definition-card__field">
              <span class="definition-card__label">{{ t('promptPage.defaultValue') }}</span>
              <NSelect v-if="normalizedType(variable) === 'select'" size="small" clearable
                :value="variable.defaultValue || null" :placeholder="t('promptPage.none')"
                :options="(variable.options || []).filter(Boolean).map(option => ({ label: option, value: option }))"
                @update:value="value => patch(variable, { defaultValue: value || '' })" />
              <NSelect v-else-if="normalizedType(variable) === 'boolean'" size="small" clearable
                :value="variable.defaultValue || null" :placeholder="t('promptPage.none')"
                :options="[{ label: t('promptPage.yes'), value: 'true' }, { label: t('promptPage.no'), value: 'false' }]"
                @update:value="value => patch(variable, { defaultValue: value || '' })" />
              <!-- 数字类型只收数字：输入框不接受字母，失焦时还原成上一次有效的值 -->
              <NInputNumber v-else-if="normalizedType(variable) === 'number'" size="small" clearable :show-button="false"
                :value="numberDefault(variable)" :placeholder="t('promptPage.none')"
                @update:value="value => patch(variable, { defaultValue: value === null ? '' : String(value) })" />
              <NInput v-else size="small" :value="variable.defaultValue || ''" :placeholder="t('promptPage.none')"
                @update:value="value => patch(variable, { defaultValue: value })" />
            </div>
            <!-- 开关总有一个值（是或否），「必填」对它没有意义 -->
            <div v-if="normalizedType(variable) !== 'boolean' || jinja" class="definition-card__field">
              <span class="definition-card__label">{{ t('promptPage.required') }}</span>
              <div class="definition-card__switch">
                <NSwitch :value="variable.required" :aria-label="t('promptPage.required')"
                  @update:value="value => patch(variable, { required: value })" />
              </div>
            </div>
          </div>

          <div class="definition-card__field">
            <label class="definition-card__label" :for="`variable-description-${variable.name}`">{{ t('promptPage.description') }}</label>
            <NInput size="small" :value="variable.description || ''" :placeholder="t('promptPage.variableDescriptionPlaceholder')"
              :input-props="{ id: `variable-description-${variable.name}` }"
              @update:value="value => patch(variable, { description: value })" />
          </div>

          <!-- 按钮只写动作，后果写在旁边能换行的说明里（普通变量的说明在面板底部的提示里），英文、意大利语下不会伸出卡片 -->
          <div class="definition-card__delete">
            <NButton quaternary size="tiny" type="error" @click="emit('remove', variable.name)">
              {{ jinja ? t('promptPage.removeJinjaVariable') : t('promptPage.removeVariable') }}
            </NButton>
            <span v-if="jinja" class="definition-card__delete-note">{{ t('promptPage.removeJinjaVariableNote') }}</span>
          </div>
        </div>

        <button v-else type="button" class="definition-row" :class="{ 'definition-row--unused': group.key === 'unused' }"
          @click="emit('update:expandedName', variable.name)">
          <span class="definition-row__text">
            <span class="ui-mono definition-row__name">{{ variable.name }}</span>
            <span class="definition-row__meta">{{ summary(variable, group.key === 'unused') }}</span>
          </span>
          <NIcon :size="14" class="definition-row__chevron"><ChevronDown /></NIcon>
        </button>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { NButton, NIcon, NInput, NInputNumber, NSelect, NSwitch } from 'naive-ui'
import { ChevronDown, ChevronUp, Plus, X } from '@vicons/tabler'
import UiSegmented from '@/components/ui/UiSegmented.vue'
import {
  normalizeVariableType, validateVariableName, type CanonicalPromptVariableType, type EditablePromptVariable,
} from '@/lib/utils/prompt-template'
import { handleEnterKey } from '@/lib/utils/ime'
import { handleEscapeKey } from '@/lib/utils/escape-layers'

const props = withDefaults(defineProps<{
  variables: EditablePromptVariable[]
  unused?: EditablePromptVariable[]
  occurrences?: Record<string, number>
  expandedName?: string
  jinja?: boolean
}>(), {
  unused: () => [],
  occurrences: () => ({}),
  expandedName: '',
  jinja: false,
})

const emit = defineEmits<{
  'update:expandedName': [name: string]
  update: [previousName: string, variable: EditablePromptVariable]
  remove: [name: string]
}>()

const { t, locale } = useI18n()
const rootRef = ref<HTMLElement>()
// 类型分段里有选项被截成省略号时为 false，改用下拉
const typeFits = ref(true)
const nameDraft = ref('')
const nameError = ref<string | null>(null)
const addingOption = ref(false)
const optionDraft = ref('')
const optionInputRef = ref<HTMLInputElement[]>()
const addOptionButtonRef = ref<InstanceType<typeof NButton>[]>()

const allVariables = computed(() => [...props.variables, ...props.unused])
const expanded = computed(() => allVariables.value.find(variable => variable.name === props.expandedName))
const groups = computed(() => [
  { key: 'active', title: '', items: props.variables },
  { key: 'unused', title: t('promptPage.unusedVariables'), items: props.unused },
])

// 只在换了展开的变量（或改了名）时重置；改类型、加选项会换掉变量对象，不能因此收起正在输入的选项框
watch(() => expanded.value?.name, name => {
  nameDraft.value = name || ''
  nameError.value = null
  addingOption.value = false
}, { immediate: true })

const typeOptions = computed(() => [
  { value: 'text' as CanonicalPromptVariableType, label: t('promptPage.typeText') },
  { value: 'textarea' as CanonicalPromptVariableType, label: t('promptPage.typeTextarea') },
  { value: 'select' as CanonicalPromptVariableType, label: t('promptPage.typeSelect') },
  { value: 'number' as CanonicalPromptVariableType, label: t('promptPage.typeNumber') },
  { value: 'boolean' as CanonicalPromptVariableType, label: t('promptPage.typeBoolean') },
])
const jinjaTypeOptions = ['str', 'int', 'float', 'bool', 'list', 'dict'].map(value => ({ label: value, value }))

// 按分段排一次，量出有没有选项被截断；面板收起（窄宽度浮层没打开）时量不到宽度，等展开后再量
const checkTypeFit = async () => {
  await nextTick()
  const segmented = rootRef.value?.querySelector<HTMLElement>('.definition-card .ui-seg')
  if (!segmented?.clientWidth) return
  typeFits.value = !Array.from(segmented.querySelectorAll<HTMLElement>('.ui-seg__label'))
    .some(label => label.scrollWidth > label.clientWidth + 1)
}

// 换语言或面板宽度变了：先换回分段再量
const remeasureTypeFit = () => {
  typeFits.value = true
  void checkTypeFit()
}

// 宽度和语言没变时，量过一次放不下就一直用下拉，展开别的变量不用再量
watch(() => props.expandedName, () => { if (typeFits.value) void checkTypeFit() })
watch(locale, remeasureTypeFit)

let resizeObserver: ResizeObserver | null = null
let observedWidth = 0
onMounted(() => {
  void checkTypeFit()
  if (!rootRef.value || typeof ResizeObserver === 'undefined') return
  resizeObserver = new ResizeObserver(([entry]) => {
    const width = Math.round(entry.contentRect.width)
    if (width === observedWidth) return
    observedWidth = width
    remeasureTypeFit()
  })
  resizeObserver.observe(rootRef.value)
})
onBeforeUnmount(() => resizeObserver?.disconnect())

const normalizedType = (variable: EditablePromptVariable) => normalizeVariableType(String(variable.type))

const nameErrorText = computed(() => {
  if (nameError.value === 'required') return t('promptEditor.variableNameRequired')
  if (nameError.value === 'invalid') return t('promptEditor.variableNameInvalid')
  if (nameError.value === 'duplicate') return t('promptEditor.variableNameDuplicate')
  return ''
})

const typeLabel = (variable: EditablePromptVariable) => (
  props.jinja ? String(variable.type) : typeOptions.value.find(option => option.value === normalizedType(variable))?.label
)

const isBoolean = (variable: EditablePromptVariable) => !props.jinja && normalizedType(variable) === 'boolean'

// 开关的默认值存的是 true / false，显示成「是 / 否」
const defaultLabel = (variable: EditablePromptVariable) => {
  if (!isBoolean(variable)) return variable.defaultValue
  if (variable.defaultValue === 'true') return t('promptPage.yes')
  return variable.defaultValue === 'false' ? t('promptPage.no') : ''
}

const numberDefault = (variable: EditablePromptVariable) => {
  if (!variable.defaultValue) return null
  const value = Number(variable.defaultValue)
  return Number.isFinite(value) ? value : null
}

const summary = (variable: EditablePromptVariable, unused: boolean) => {
  const parts = [typeLabel(variable)]
  if (variable.required && !isBoolean(variable)) parts.push(t('promptPage.required'))
  const defaultValue = defaultLabel(variable)
  if (defaultValue) parts.push(t('promptPage.defaultIs', { value: defaultValue }))
  if (unused) parts.push(t('promptPage.notInBody'))
  else if ((props.occurrences[variable.name] || 0) > 1) parts.push(t('promptPage.occurrences', { count: props.occurrences[variable.name] }))
  return parts.filter(Boolean).join(' · ')
}

const patch = (variable: EditablePromptVariable, changes: Partial<EditablePromptVariable>) => {
  emit('update', variable.name, { ...variable, ...changes })
}

const setType = (variable: EditablePromptVariable, type: CanonicalPromptVariableType) => {
  const next: EditablePromptVariable = { ...variable, type }
  if (type !== 'select') next.options = []
  // 开关总有值，不需要「必填」
  if (type === 'boolean') next.required = false
  // 默认值和新类型对不上时清掉，避免开关类型带着「部门负责人」这样的默认值
  if (type === 'boolean' && !['true', 'false'].includes(next.defaultValue || '')) next.defaultValue = ''
  if (type === 'number' && next.defaultValue && !Number.isFinite(Number(next.defaultValue))) next.defaultValue = ''
  if (type === 'select' && next.defaultValue && !(next.options || []).includes(next.defaultValue)) next.defaultValue = ''
  emit('update', variable.name, next)
}

const commitName = () => {
  const variable = expanded.value
  if (!variable) return
  const nextName = nameDraft.value.trim()
  nameError.value = validateVariableName(nextName, allVariables.value, variable.name)
  if (nameError.value || nextName === variable.name) return
  emit('update', variable.name, { ...variable, name: nextName })
  emit('update:expandedName', nextName)
}

// Esc：名称改过（或正报错）时恢复原名并用掉这次 Esc；没改过就不拦，让 Esc 继续收起外层
const revertName = (event: KeyboardEvent) => {
  const variable = expanded.value
  if (!variable || (nameDraft.value === variable.name && !nameError.value)) return
  handleEscapeKey(event, () => {
    nameDraft.value = variable.name
    nameError.value = null
  })
}

// Esc 放弃这次输入：先清空草稿，输入框卸载时触发的 blur 就不会把半截文字加成选项
const cancelOption = () => {
  optionDraft.value = ''
  addingOption.value = false
  void nextTick(() => focusAddOption())
}

const focusAddOption = () => (addOptionButtonRef.value?.[0]?.$el as HTMLElement | undefined)?.focus()

const startAddingOption = async () => {
  addingOption.value = true
  optionDraft.value = ''
  await nextTick()
  optionInputRef.value?.[0]?.focus()
}

/**
 * 加一个选项。回车（keepOpen）时输入框留着、焦点还在里面，接着输入下一项；
 * 点别处（blur）时加上手里这一项并结束。重复或空的不加。
 */
const commitOption = (variable: EditablePromptVariable, keepOpen = false) => {
  const option = optionDraft.value.trim()
  optionDraft.value = ''
  if (!keepOpen) addingOption.value = false
  else if (!option) {
    // 空着回车表示加完了：收起输入框，焦点回到「+ 选项」
    addingOption.value = false
    void nextTick(() => focusAddOption())
    return
  }
  if (!option || (variable.options || []).includes(option)) return
  patch(variable, { options: [...(variable.options || []).filter(Boolean), option] })
}

const removeOption = (variable: EditablePromptVariable, index: number) => {
  const options = (variable.options || []).filter((_, itemIndex) => itemIndex !== index)
  patch(variable, {
    options,
    defaultValue: options.includes(variable.defaultValue || '') ? variable.defaultValue : '',
  })
}
</script>

<style scoped>
.definitions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.definitions__empty {
  padding: 24px 0;
  color: var(--content-tertiary);
  font-size: var(--font-size-sm);
  text-align: center;
}

.definitions__group {
  margin-top: 8px;
}

.definition-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-panel);
  background: var(--surface-primary);
  color: var(--content-primary);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.definition-row:hover {
  border-color: var(--border-strong);
  background: var(--surface-secondary);
}

.definition-row:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.definition-row--unused {
  opacity: 0.75;
}

.definition-row__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.definition-row__name {
  font-size: var(--font-size-sm);
}

.definition-row__meta {
  color: var(--content-tertiary);
  font-size: var(--font-size-xs);
}

.definition-row__chevron {
  color: var(--content-tertiary);
}

.definition-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-panel);
  background: var(--surface-primary);
}

.definition-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.definition-card__name {
  width: 160px;
  padding: 0 0 2px;
  border: 0;
  border-bottom: 1px dashed var(--border-strong);
  outline: none;
  background: transparent;
  color: var(--content-primary);
  font-family: var(--font-family-mono);
  font-size: var(--font-size-sm);
}

.definition-card__name:focus {
  border-bottom-color: var(--accent-primary);
}

.definition-card__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.definition-card__label {
  color: var(--content-primary);
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
}

.definition-card__options {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}

.definition-card__remove-option {
  display: inline-flex;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--content-tertiary);
  cursor: pointer;
}

.definition-card__remove-option:hover {
  color: var(--content-primary);
}

.definition-card__option-input {
  width: 96px;
  height: 22px;
  padding: 0 6px;
  border: 1px solid var(--accent-brand);
  border-radius: var(--radius-tag);
  outline: none;
  background: var(--surface-primary);
  color: var(--content-primary);
  font: inherit;
  font-size: var(--font-size-xs);
}

.definition-card__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.definition-card__switch {
  display: flex;
  align-items: center;
  height: var(--control-height-sm);
}

.definition-card__delete {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  min-width: 0;
}

.definition-card__delete-note {
  color: var(--content-tertiary);
  font-size: var(--font-size-xs);
}

.err-msg {
  color: var(--accent-error);
  font-size: var(--font-size-xs);
}
</style>
