<template>
  <div ref="editorWorkspace" class="jinja-editor-workspace" :class="{ compact: compactInspector }">
    <div class="jinja-primary-column">
      <StructuredPromptEditor ref="structuredEditorRef" :content="content" :variables="jinjaVariables"
        :selected-variable="selectedJinjaVariable" :readonly="isStreaming" source-only
        :variable-count="jinjaActiveNames.length"
        :show-variables-button="compactInspector" :placeholder="t('promptManagement.jinjaTemplatePlaceholder')"
        @update:content="$emit('update:content', $event)" @select-variable="selectVariable"
        @request-add-variable="addJinjaVariable" @request-open-variables="showInspectorDrawer = true">
        <template #toolbar-prefix>
          <div class="template-status" :class="{ invalid: !templateValidation.isValid }">
            <NIcon size="16">
              <CircleCheck v-if="templateValidation.isValid" />
              <AlertCircle v-else />
            </NIcon>
            <NText depth="3" class="template-status-detail">
              {{ templateValidation.isValid
                ? t('promptManagement.templateValidMessage')
                : templateValidation.error || t('promptManagement.templateInvalid') }}
            </NText>
          </div>
        </template>
        <template #toolbar-extra>
          <NTooltip>
            <template #trigger>
              <NButton size="small" quaternary :disabled="!content.trim()" @click="openPreview">
                <template #icon><NIcon size="16"><Eye /></NIcon></template>
                <span class="toolbar-label">{{ t('promptManagement.preview') }}</span>
              </NButton>
            </template>
            {{ t('promptManagement.jinjaTemplatePreview') }}
          </NTooltip>
          <NTooltip>
            <template #trigger>
              <NButton size="small" quaternary @click="showSyntaxHelp = true">
                <template #icon><NIcon size="16"><Help /></NIcon></template>
                <span class="toolbar-label">{{ t('promptManagement.jinjaSyntaxHelp') }}</span>
              </NButton>
            </template>
            {{ t('promptManagement.jinjaSupportTooltip') }}
          </NTooltip>
        </template>
      </StructuredPromptEditor>

      <QuickOptimizationActions ref="quickOptimizationRef" :content="content"
        :quick-optimization-configs="quickOptimizationConfigs" :optimizing="optimizing"
        :is-streaming="isStreaming" :stream-stats="streamStats"
        @optimize-prompt="$emit('optimize-prompt', $event)"
        @stop-optimization="$emit('stop-optimization')"
        @open-quick-optimization-config="$emit('open-quick-optimization-config')"
        @manual-adjustment="$emit('manual-adjustment', $event)" />
    </div>

    <VariableInspector v-if="!compactInspector" :variables="jinjaVariables" :active-names="jinjaActiveNames"
      :occurrences="jinjaOccurrenceCounts" :selected-variable="selectedJinjaVariable" jinja
      :readonly="isStreaming || optimizing !== null" @select="selectVariable"
      @request-add="addJinjaVariable" @request-insert="insertVariableToTemplate"
      @request-remove="removeJinjaVariableByName" @update-variable="updateJinjaVariable" />

    <NDrawer v-model:show="showInspectorDrawer" :width="360" placement="right">
      <NDrawerContent :title="t('promptEditor.variables')" closable body-content-style="padding: 0; overflow: hidden;">
        <VariableInspector :variables="jinjaVariables" :active-names="jinjaActiveNames"
          :occurrences="jinjaOccurrenceCounts" :selected-variable="selectedJinjaVariable" jinja
          :readonly="isStreaming || optimizing !== null" @select="selectVariable"
          @request-add="addJinjaVariable" @request-insert="insertVariableToTemplate"
          @request-remove="removeJinjaVariableByName" @update-variable="updateJinjaVariable" />
      </NDrawerContent>
    </NDrawer>

    <NDrawer v-model:show="showTemplatePreview" :width="640" placement="right">
      <NDrawerContent :title="t('promptManagement.jinjaTemplatePreview')" closable
        body-content-style="padding: 16px; overflow: hidden;">
        <div class="preview-canvas">
          <PromptFillCanvas :prompt="previewPrompt" :values="previewVariableValues" compact
            @update:values="previewVariableValues = $event" />
        </div>
      </NDrawerContent>
    </NDrawer>

    <NDrawer v-model:show="showSyntaxHelp" :width="520" placement="right">
      <NDrawerContent :title="t('promptManagement.jinjaSyntaxHelp')" closable>
        <NFlex vertical size="medium">
          <NText depth="3">{{ t('promptManagement.jinjaSyntaxHelpDesc') }}</NText>
          <NCard v-for="(examples, category) in syntaxHelp" :key="category" size="small" class="syntax-card">
            <template #header>
              <NText strong>{{ syntaxCategoryLabel(category) }}</NText>
            </template>
            <div class="syntax-list">
              <button v-for="example in examples" :key="example.code" type="button" class="syntax-example"
                @click="copySyntaxCode(example.code)">
                <code>{{ example.code }}</code>
                <NIcon size="16"><Copy /></NIcon>
              </button>
            </div>
          </NCard>
          <NButton secondary @click="openJinjaWebsite">
            {{ t('promptManagement.jinjaSupportLearnMore') }}
          </NButton>
        </NFlex>
      </NDrawerContent>
    </NDrawer>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  NButton, NCard, NDrawer, NDrawerContent, NFlex, NIcon, NText, NTooltip,
  useMessage,
} from 'naive-ui'
import { AlertCircle, CircleCheck, Copy, Eye, Help } from '@vicons/tabler'
import type { PromptVariable, PromptWithRelations } from '@shared/types/database'
import type { EditablePromptVariable } from '@/lib/utils/prompt-template'
import { createPromptDraft } from '@/lib/utils/prompt-template'
import { jinjaService } from '@/lib/utils/jinja.service'
import PromptFillCanvas from './PromptFillCanvas.vue'
import QuickOptimizationActions from './QuickOptimizationActions.vue'
import StructuredPromptEditor from './StructuredPromptEditor.vue'
import VariableInspector from './VariableInspector.vue'

type JinjaVariable = EditablePromptVariable

interface Props {
  content: string
  contentHeight: number
  quickOptimizationConfigs: any[]
  optimizing: string | null
  isStreaming: boolean
  streamStats: { charCount?: number }
  variables?: JinjaVariable[]
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:content', value: string): void
  (e: 'update:variables', variables: JinjaVariable[], source?: 'auto' | 'user'): void
  (e: 'optimize-prompt', configId: number): void
  (e: 'stop-optimization'): void
  (e: 'open-quick-optimization-config'): void
  (e: 'manual-adjustment', instruction: string): void
}>()

const { t } = useI18n()
const message = useMessage()
const editorWorkspace = ref<HTMLElement>()
const structuredEditorRef = ref<InstanceType<typeof StructuredPromptEditor>>()
const quickOptimizationRef = ref<InstanceType<typeof QuickOptimizationActions>>()
const selectedJinjaVariable = ref('')
const jinjaVariables = ref<JinjaVariable[]>([])
const compactInspector = ref(false)
const showInspectorDrawer = ref(false)
const showSyntaxHelp = ref(false)
const showTemplatePreview = ref(false)
const previewVariableValues = ref<Record<string, any>>({})
const templateValidation = ref<{ isValid: boolean; error?: string }>({ isValid: true })
let resizeObserver: ResizeObserver | null = null
let validationTimer: number | null = null
let syncingFromProps = false

const cloneVariables = (variables: JinjaVariable[]) => variables.map(variable => ({
  ...variable,
  options: variable.options ? [...variable.options] : undefined,
  validation: variable.validation ? { ...variable.validation } : undefined,
}))

const variableSignature = (variables: JinjaVariable[]) => JSON.stringify(variables.map(variable => ({
  name: variable.name,
  type: variable.type,
  options: variable.options || [],
  defaultValue: variable.defaultValue || '',
  required: variable.required !== false,
  placeholder: variable.placeholder || '',
  description: variable.description || '',
})))

const jinjaActiveNames = computed(() => {
  try { return jinjaService.extractVariables(props.content) }
  catch { return [] }
})

const jinjaOccurrenceCounts = computed(() => Object.fromEntries(
  jinjaActiveNames.value.map(name => [
    name,
    Math.max(1, (props.content.match(new RegExp(`\\b${escapeRegExp(name)}\\b`, 'g')) || []).length),
  ])
))

const syntaxHelp = computed(() => jinjaService.getSyntaxHelp())

const previewPrompt = computed<PromptWithRelations>(() => ({
  id: 0,
  uuid: 'jinja-preview',
  title: t('promptManagement.jinjaTemplatePreview'),
  content: props.content,
  description: '',
  tags: [],
  variables: jinjaVariables.value.map((variable, index): PromptVariable => ({
    ...variable,
    uuid: variable.uuid || `jinja-preview-${index}`,
    promptId: 0,
    type: variable.type as PromptVariable['type'],
    createdAt: new Date(),
    updatedAt: new Date(),
  })),
  isFavorite: false,
  useCount: 0,
  isActive: true,
  isJinjaTemplate: true,
  createdAt: new Date(),
  updatedAt: new Date(),
}))

const initializeJinjaVariables = () => {
  syncingFromProps = true
  const provided = props.variables?.length ? props.variables : jinjaActiveNames.value.map(name => ({
    name,
    type: 'str',
    required: true,
  }))
  jinjaVariables.value = cloneVariables(provided)
  selectedJinjaVariable.value = jinjaVariables.value[0]?.name || ''
  nextTick(() => { syncingFromProps = false })
}

const validateTemplate = (content: string) => {
  if (!content.trim()) {
    templateValidation.value = { isValid: true }
    return
  }
  templateValidation.value = jinjaService.validateTemplate(content)
}

const scheduleValidation = (content: string) => {
  if (validationTimer !== null) window.clearTimeout(validationTimer)
  validationTimer = window.setTimeout(() => {
    validateTemplate(content)
    validationTimer = null
  }, 250)
}

const syncExtractedVariables = () => {
  const existingNames = new Set(jinjaVariables.value.map(variable => variable.name))
  const additions = jinjaActiveNames.value
    .filter(name => !existingNames.has(name))
    .map(name => ({ name, type: 'str', required: true }))
  if (!additions.length) return
  jinjaVariables.value = [...jinjaVariables.value, ...additions]
  emitVariables('auto')
}

watch(() => props.content, content => {
  scheduleValidation(content)
  syncExtractedVariables()
})

watch(() => props.variables, variables => {
  if (syncingFromProps || !variables) return
  if (variableSignature(variables) === variableSignature(jinjaVariables.value)) return
  jinjaVariables.value = cloneVariables(variables)
  if (!jinjaVariables.value.some(variable => variable.name === selectedJinjaVariable.value)) {
    selectedJinjaVariable.value = jinjaVariables.value[0]?.name || ''
  }
}, { deep: true })

onMounted(() => {
  initializeJinjaVariables()
  validateTemplate(props.content)
  if (!editorWorkspace.value) return
  resizeObserver = new ResizeObserver(entries => {
    compactInspector.value = (entries[0]?.contentRect.width || 0) < 860
  })
  resizeObserver.observe(editorWorkspace.value)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  if (validationTimer !== null) window.clearTimeout(validationTimer)
})

const emitVariables = (source: 'auto' | 'user' = 'user') => {
  emit('update:variables', cloneVariables(jinjaVariables.value), source)
}

const selectVariable = (name: string) => {
  selectedJinjaVariable.value = name
  if (compactInspector.value) showInspectorDrawer.value = true
}

const addJinjaVariable = () => {
  const names = new Set(jinjaVariables.value.map(variable => variable.name))
  let index = 1
  while (names.has(`variable${index}`)) index += 1
  const variable: JinjaVariable = { name: `variable${index}`, type: 'str', required: true }
  jinjaVariables.value = [...jinjaVariables.value, variable]
  selectedJinjaVariable.value = variable.name
  emitVariables()
  nextTick(() => structuredEditorRef.value?.insertVariable(variable.name))
}

const insertVariableToTemplate = (name: string) => {
  structuredEditorRef.value?.insertVariable(name)
  showInspectorDrawer.value = false
}

const removeJinjaVariableByName = (name: string) => {
  jinjaVariables.value = jinjaVariables.value.filter(variable => variable.name !== name)
  selectedJinjaVariable.value = jinjaVariables.value[0]?.name || ''
  emitVariables()
}

const updateJinjaVariable = ({ previousName, variable }: { previousName: string; variable: EditablePromptVariable }) => {
  jinjaVariables.value = jinjaVariables.value.map(item => item.name === previousName ? variable : item)
  if (previousName !== variable.name) {
    const tagPattern = /({[{%][\s\S]*?[}%]})/g
    const namePattern = new RegExp(`\\b${escapeRegExp(previousName)}\\b`, 'g')
    emit('update:content', props.content.replace(tagPattern, tag => tag.replace(namePattern, variable.name)))
    selectedJinjaVariable.value = variable.name
  }
  emitVariables()
}

const openPreview = () => {
  previewVariableValues.value = createPromptDraft(jinjaVariables.value, {})
  showTemplatePreview.value = true
}

const copySyntaxCode = async (code: string) => {
  await navigator.clipboard.writeText(code)
  message.success(t('promptManagement.jinjaSyntaxCopySuccess'))
}

const syntaxCategoryLabel = (category: string) => t(
  `promptManagement.jinja${category.charAt(0).toUpperCase()}${category.slice(1)}`
)

const openJinjaWebsite = () => {
  const url = 'https://jinja.palletsprojects.com/en/stable/'
  if ((window as any).electronAPI?.shell?.openExternal) (window as any).electronAPI.shell.openExternal(url)
  else window.open(url, '_blank')
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

defineExpose({
  get modelSelectorRef() {
    return quickOptimizationRef.value?.modelSelectorRef
  },
  get selectedModelKey() {
    return quickOptimizationRef.value?.selectedModelKey
  },
  jinjaVariables,
  initializeJinjaVariables,
})
</script>

<style scoped>
.jinja-editor-workspace { box-sizing: border-box; position: relative; width: 100%; height: 100%; min-height: 0; padding-bottom: 8px; display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: var(--section-gap); background: var(--surface-primary); }
.jinja-primary-column { min-width: 0; min-height: 0; display: flex; flex-direction: column; gap: var(--compact-padding); }
.jinja-primary-column > :first-child { flex: 1; min-height: 220px; }
.template-status { min-width: 0; display: flex; align-items: center; gap: 8px; }
.template-status > :deep(.n-icon) { flex: 0 0 auto; color: var(--accent-success); }
.template-status.invalid > :deep(.n-icon) { color: var(--accent-error); }
.template-status-detail { display: block; max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
.jinja-editor-workspace.compact { grid-template-columns: minmax(0, 1fr); }
.preview-canvas { height: calc(100vh - 96px); min-height: 320px; }
.syntax-card { border: 1px solid var(--border-default); background: var(--surface-primary); }
.syntax-list { display: flex; flex-direction: column; gap: 6px; }
.syntax-example { width: 100%; min-height: 36px; padding: 7px 8px; display: flex; align-items: center; justify-content: space-between; gap: 8px; border: 0; border-radius: var(--radius-control); color: var(--content-primary); background: var(--surface-secondary); font: inherit; text-align: left; cursor: pointer; }
.syntax-example:hover { background: var(--surface-tertiary); }
.syntax-example:focus-visible { outline: 2px solid var(--interactive-focus); outline-offset: 1px; }
.syntax-example code { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 12px; }
.syntax-example :deep(.n-icon) { flex: 0 0 auto; color: var(--content-secondary); }
@media (max-width: 720px) {
  .template-status-detail, .toolbar-label { display: none; }
}
</style>
