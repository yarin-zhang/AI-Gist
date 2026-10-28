<!--
  编辑页的「变量设置」：先列出正文里的变量（和保留下来的未使用变量），点进去改名称、类型、
  选项、默认值、必填和说明，与桌面端变量定义面板支持的内容一致。改动立即写回编辑表单。
-->
<template>
  <ion-modal :is-open="open" @didDismiss="handleDismiss">
    <MobileNavBar :title="current ? current.name : t('promptManagement.detailModal.variableSettings')"
      :leading="current ? 'none' : 'close'" solid @leading="emit('close')">
      <template v-if="current" #start>
        <button type="button" class="m-btn-c" :aria-label="t('common.back')" @click="back">
          <ion-icon :icon="chevronBack" />
        </button>
      </template>
      <template #end>
        <button type="button" class="m-save" @click="current ? back() : emit('close')">{{ t('mobilePrompt.done') }}</button>
      </template>
    </MobileNavBar>

    <ion-content class="m-page-content">
      <!-- 变量列表 -->
      <div v-if="!current" class="m-body">
        <p class="m-desc">{{ jinja ? t('mobilePrompt.variableSettingsJinjaHint') : t('promptPage.definitionsHelp') }}</p>

        <section v-if="variables.length" class="m-section">
          <div class="m-group ic">
            <button v-for="variable in variables" :key="variable.name" type="button" class="m-row" @click="select(variable.name)">
              <span class="m-tile" :class="`m-tile--${toneOf(variable)}`" aria-hidden="true"><ion-icon :icon="iconOf(variable)" /></span>
              <span class="two">
                <span class="variable-name">{{ variable.name }}</span>
                <span class="sub">{{ summary(variable, false) }}</span>
              </span>
              <span class="end"><ion-icon :icon="chevronForward" class="chev" aria-hidden="true" /></span>
            </button>
          </div>
        </section>
        <p v-else class="m-note">
          <ion-icon :icon="informationCircleOutline" aria-hidden="true" />
          <span>{{ t('mobilePrompt.noVariablesHint') }}</span>
        </p>

        <section v-if="unused.length" class="m-section">
          <span class="m-gt">{{ t('promptPage.unusedVariables') }}</span>
          <div class="m-group ic">
            <button v-for="variable in unused" :key="variable.name" type="button" class="m-row" @click="select(variable.name)">
              <span class="m-tile m-tile--grey" aria-hidden="true"><ion-icon :icon="iconOf(variable)" /></span>
              <span class="two">
                <span class="variable-name">{{ variable.name }}</span>
                <span class="sub">{{ summary(variable, true) }}</span>
              </span>
              <span class="end"><ion-icon :icon="chevronForward" class="chev" aria-hidden="true" /></span>
            </button>
          </div>
        </section>
      </div>

      <!-- 单个变量的设置 -->
      <div v-else class="m-body">
        <section class="m-section">
          <span class="m-gt">{{ t('promptPage.variableName') }}</span>
          <div class="m-group">
            <label class="m-field">
              <input v-model="nameDraft" class="variable-name" :aria-label="t('promptPage.variableName')"
                enterkeyhint="done" autocapitalize="off" autocomplete="off" @blur="commitName"
                @keydown.enter.prevent="($event.target as HTMLInputElement).blur()" />
            </label>
          </div>
          <p v-if="nameErrorText" class="m-note field-error" role="alert">{{ nameErrorText }}</p>
        </section>

        <section class="m-section">
          <span class="m-gt">{{ t('promptPage.variableType') }}</span>
          <div class="m-group ic" role="radiogroup" :aria-label="t('promptPage.variableType')">
            <button v-for="option in typeOptions" :key="option.value" type="button" class="m-row" role="radio"
              :aria-checked="currentType === option.value" @click="setType(option.value)">
              <span class="m-tile" :class="`m-tile--${option.tone}`" aria-hidden="true"><ion-icon :icon="option.icon" /></span>
              <span class="title">{{ option.label }}</span>
              <span class="end">
                <ion-icon v-if="currentType === option.value" :icon="checkmark" class="check" aria-hidden="true" />
              </span>
            </button>
          </div>
        </section>

        <section v-if="!jinja && currentType === 'select'" class="m-section">
          <span class="m-gt">{{ t('promptPage.options') }}</span>
          <div class="m-group">
            <div v-for="(option, index) in current.options || []" :key="`${option}-${index}`" class="m-row m-row--static">
              <span class="title">{{ option }}</span>
              <span class="end">
                <button type="button" class="icon-button" :aria-label="t('promptPage.removeOption', { option })"
                  @click="removeOption(index)">
                  <ion-icon :icon="removeCircle" />
                </button>
              </span>
            </div>
            <div class="m-row m-row--static">
              <input v-model="optionDraft" class="option-input" :placeholder="t('promptPage.addOption')"
                :aria-label="t('promptPage.addOption')" enterkeyhint="done" @keydown.enter.prevent="addOption" />
              <span class="end">
                <button type="button" class="icon-button icon-button--add" :disabled="!optionDraft.trim()"
                  :aria-label="t('promptPage.addOption')" @click="addOption">
                  <ion-icon :icon="addCircle" />
                </button>
              </span>
            </div>
          </div>
          <p v-if="!(current.options || []).length" class="m-note field-error">{{ t('promptEditor.selectNeedsOption') }}</p>
        </section>

        <section class="m-section">
          <span class="m-gt">{{ t('promptPage.defaultValue') }}</span>
          <div v-if="!jinja && currentType === 'select'" class="default-chips" role="radiogroup" :aria-label="t('promptPage.defaultValue')">
            <button type="button" class="m-chip" role="radio" :class="{ on: !current.defaultValue }"
              :aria-checked="!current.defaultValue" @click="patch({ defaultValue: '' })">{{ t('promptPage.none') }}</button>
            <button v-for="option in (current.options || []).filter(Boolean)" :key="option" type="button" class="m-chip"
              role="radio" :class="{ on: current.defaultValue === option }" :aria-checked="current.defaultValue === option"
              @click="patch({ defaultValue: option })">{{ option }}</button>
          </div>
          <div v-else-if="!jinja && currentType === 'boolean'" class="m-seg" role="radiogroup" :aria-label="t('promptPage.defaultValue')">
            <button v-for="option in booleanDefaults" :key="option.value" type="button" role="radio"
              :class="{ on: (current.defaultValue || '') === option.value }" :aria-checked="(current.defaultValue || '') === option.value"
              @click="patch({ defaultValue: option.value })">{{ option.label }}</button>
          </div>
          <div v-else class="m-group">
            <label class="m-field">
              <textarea v-if="currentType === 'textarea'" :value="current.defaultValue || ''" rows="3"
                :placeholder="t('promptPage.none')" :aria-label="t('promptPage.defaultValue')"
                @input="patch({ defaultValue: ($event.target as HTMLTextAreaElement).value })"></textarea>
              <input v-else :value="current.defaultValue || ''" :placeholder="t('promptPage.none')"
                :inputmode="currentType === 'number' ? 'decimal' : undefined" :aria-label="t('promptPage.defaultValue')"
                @input="patch({ defaultValue: ($event.target as HTMLInputElement).value })" />
            </label>
          </div>
        </section>

        <div class="m-group">
          <div class="m-row m-row--static">
            <span class="title">{{ t('promptPage.required') }}</span>
            <span class="end">
              <ion-toggle :checked="current.required" :aria-label="t('promptPage.required')"
                @ionChange="patch({ required: $event.detail.checked })" />
            </span>
          </div>
        </div>

        <section class="m-section">
          <span class="m-gt">{{ t('promptPage.description') }}</span>
          <div class="m-group">
            <label class="m-field">
              <textarea :value="current.description || ''" rows="2" :placeholder="t('promptEditor.descriptionHint')"
                :aria-label="t('promptPage.description')"
                @input="patch({ description: ($event.target as HTMLTextAreaElement).value })"></textarea>
            </label>
          </div>
        </section>

        <button type="button" class="m-danger" @click="confirmRemove">
          {{ jinja ? t('promptPage.deleteJinjaVariable') : t('promptPage.deleteVariable') }}
        </button>
      </div>
    </ion-content>
  </ion-modal>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { IonContent, IonIcon, IonModal, IonToggle, alertController } from '@ionic/vue'
import {
  addCircle,
  calculatorOutline,
  checkmark,
  chevronBack,
  chevronForward,
  documentTextOutline,
  informationCircleOutline,
  listOutline,
  removeCircle,
  textOutline,
  toggleOutline,
  codeSlashOutline
} from 'ionicons/icons'
import { useI18n } from '~/composables/useI18n'
import MobileNavBar from '~/components/mobile/ui/MobileNavBar.vue'
import type { MobileTileTone } from '~/components/mobile/ui/types'
import {
  normalizeVariableType,
  validateVariableName,
  type EditablePromptVariable,
} from '~/lib/utils/prompt-template'

const props = withDefaults(defineProps<{
  open: boolean
  variables: EditablePromptVariable[]
  unused?: EditablePromptVariable[]
  occurrences?: Record<string, number>
  jinja?: boolean
}>(), {
  unused: () => [],
  occurrences: () => ({}),
  jinja: false,
})

const emit = defineEmits<{
  close: []
  update: [previousName: string, variable: EditablePromptVariable]
  remove: [name: string]
}>()

const { t } = useI18n()

const selectedName = ref('')
const nameDraft = ref('')
const nameError = ref<string | null>(null)
const optionDraft = ref('')

const allVariables = computed(() => [...props.variables, ...props.unused])
const current = computed(() => allVariables.value.find(variable => variable.name === selectedName.value) || null)
const currentType = computed(() => (current.value ? typeKey(current.value) : ''))

const JINJA_TYPES = ['str', 'int', 'float', 'bool', 'list', 'dict']

const typeKey = (variable: EditablePromptVariable) => (
  props.jinja ? String(variable.type || 'str') : normalizeVariableType(String(variable.type))
)

const regularTypes = computed(() => [
  { value: 'text', label: t('promptPage.typeText'), icon: textOutline, tone: 'blue' as MobileTileTone },
  { value: 'textarea', label: t('promptPage.typeTextarea'), icon: documentTextOutline, tone: 'teal' as MobileTileTone },
  { value: 'select', label: t('promptPage.typeSelect'), icon: listOutline, tone: 'violet' as MobileTileTone },
  { value: 'number', label: t('promptPage.typeNumber'), icon: calculatorOutline, tone: 'orange' as MobileTileTone },
  { value: 'boolean', label: t('promptPage.typeBoolean'), icon: toggleOutline, tone: 'green' as MobileTileTone },
])

const typeOptions = computed(() => (
  props.jinja
    ? JINJA_TYPES.map(value => ({ value, label: value, icon: codeSlashOutline, tone: 'grey' as MobileTileTone }))
    : regularTypes.value
))

const typeMeta = (variable: EditablePromptVariable) => typeOptions.value.find(option => option.value === typeKey(variable))
const iconOf = (variable: EditablePromptVariable) => typeMeta(variable)?.icon || textOutline
const toneOf = (variable: EditablePromptVariable): MobileTileTone => typeMeta(variable)?.tone || 'blue'

const booleanDefaults = computed(() => [
  { value: '', label: t('promptPage.none') },
  { value: 'true', label: t('promptPage.yes') },
  { value: 'false', label: t('promptPage.no') },
])

const summary = (variable: EditablePromptVariable, unused: boolean) => {
  const parts = [typeMeta(variable)?.label]
  if (variable.required) parts.push(t('promptPage.required'))
  if (variable.defaultValue) parts.push(t('promptPage.defaultIs', { value: variable.defaultValue }))
  if (unused) parts.push(t('promptPage.notInBody'))
  else if ((props.occurrences[variable.name] || 0) > 1) parts.push(t('promptPage.occurrences', { count: props.occurrences[variable.name] }))
  return parts.filter(Boolean).join(' · ')
}

const nameErrorText = computed(() => {
  if (nameError.value === 'required') return t('promptEditor.variableNameRequired')
  if (nameError.value === 'invalid') return t('promptEditor.variableNameInvalid')
  if (nameError.value === 'duplicate') return t('promptEditor.variableNameDuplicate')
  return ''
})

const select = (name: string) => {
  selectedName.value = name
  nameDraft.value = name
  nameError.value = null
  optionDraft.value = ''
}

const back = () => {
  commitName()
  if (nameError.value) return
  selectedName.value = ''
}

const patch = (changes: Partial<EditablePromptVariable>) => {
  if (!current.value) return
  emit('update', current.value.name, { ...current.value, ...changes })
}

const commitName = () => {
  const variable = current.value
  if (!variable) return
  const nextName = nameDraft.value.trim()
  nameError.value = validateVariableName(nextName, allVariables.value, variable.name)
  if (nameError.value || nextName === variable.name) return
  emit('update', variable.name, { ...variable, name: nextName })
  selectedName.value = nextName
}

// 换类型时清掉和新类型对不上的默认值，避免开关类型带着「部门负责人」这样的默认值
const setType = (type: string) => {
  const variable = current.value
  if (!variable) return
  const next: EditablePromptVariable = { ...variable, type }
  if (!props.jinja) {
    if (type !== 'select') next.options = []
    if (type === 'boolean' && !['true', 'false'].includes(next.defaultValue || '')) next.defaultValue = ''
    if (type === 'number' && next.defaultValue && !Number.isFinite(Number(next.defaultValue))) next.defaultValue = ''
    if (type === 'select' && next.defaultValue && !(next.options || []).includes(next.defaultValue)) next.defaultValue = ''
  }
  emit('update', variable.name, next)
}

const addOption = () => {
  const variable = current.value
  const option = optionDraft.value.trim()
  if (!variable || !option) return
  optionDraft.value = ''
  if ((variable.options || []).includes(option)) return
  patch({ options: [...(variable.options || []), option] })
}

const removeOption = (index: number) => {
  const variable = current.value
  if (!variable) return
  const removed = variable.options?.[index]
  patch({
    options: (variable.options || []).filter((_, itemIndex) => itemIndex !== index),
    defaultValue: variable.defaultValue === removed ? '' : variable.defaultValue,
  })
}

const confirmRemove = async () => {
  const variable = current.value
  if (!variable) return
  const alert = await alertController.create({
    header: variable.name,
    message: props.jinja ? t('promptPage.deleteJinjaVariable') : t('promptPage.deleteVariable'),
    buttons: [
      { text: t('common.cancel'), role: 'cancel' },
      {
        text: t('common.delete'),
        role: 'destructive',
        handler: () => {
          emit('remove', variable.name)
          selectedName.value = ''
        },
      },
    ],
  })
  await alert.present()
}

const handleDismiss = () => {
  commitName()
  selectedName.value = ''
  nameError.value = null
  emit('close')
}
</script>

<style scoped>
.variable-name {
  font-family: var(--font-family-mono);
}

.m-row .variable-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.check {
  color: var(--accent-primary);
  font-size: 20px;
}

.field-error {
  padding-top: 8px;
  color: var(--accent-error);
}

.icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  margin-right: -12px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--accent-error);
  font-size: 22px;
  cursor: pointer;
}

.icon-button--add {
  color: var(--accent-success);
}

.icon-button:disabled {
  color: var(--content-muted);
}

.option-input {
  flex: 1;
  min-width: 0;
  padding: 0;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--content-primary);
  font: inherit;
  font-size: var(--m-font-body);
}

.option-input::placeholder {
  color: var(--content-muted);
}

.default-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
