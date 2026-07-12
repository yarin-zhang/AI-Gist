<template>
  <div ref="editorWorkspace" class="regular-editor-workspace" :class="{ compact: compactInspector }">
    <div class="editor-primary-column">
      <StructuredPromptEditor ref="structuredEditorRef" :content="content" :variables="localVariables"
        :selected-variable="selectedVariable" :readonly="isStreaming"
        :show-variables-button="compactInspector"
        :placeholder="t('promptManagement.contentPlaceholder')" @update:content="handleContentUpdate"
        @select-variable="selectVariable" @request-add-variable="addVariable"
        @request-open-variables="showInspectorDrawer = true" />

      <QuickOptimizationActions ref="quickOptimizationRef" :content="content"
        :quick-optimization-configs="quickOptimizationConfigs" :optimizing="optimizing"
        :is-streaming="isStreaming" :stream-stats="streamStats"
        @optimize-prompt="$emit('optimize-prompt', $event)"
        @stop-optimization="$emit('stop-optimization')"
        @open-quick-optimization-config="$emit('open-quick-optimization-config')"
        @manual-adjustment="$emit('manual-adjustment', $event)" />
    </div>

    <VariableInspector v-if="!compactInspector" :variables="localVariables" :active-names="parsed.variableNames"
      :occurrences="occurrenceCounts" :selected-variable="selectedVariable" :readonly="isStreaming"
      @select="selectVariable" @request-add="addVariable" @request-insert="insertExistingVariable"
      @request-remove="removeVariable" @update-variable="updateVariable" />

    <NDrawer v-model:show="showInspectorDrawer" :width="360" placement="right">
      <NDrawerContent :title="t('promptEditor.variables')" closable body-content-style="padding: 0; overflow: hidden;">
        <VariableInspector :variables="localVariables" :active-names="parsed.variableNames"
          :occurrences="occurrenceCounts" :selected-variable="selectedVariable" :readonly="isStreaming"
          @select="selectVariable" @request-add="addVariable" @request-insert="insertExistingVariable"
          @request-remove="removeVariable" @update-variable="updateVariable" />
      </NDrawerContent>
    </NDrawer>

  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { NDrawer, NDrawerContent } from 'naive-ui'
import type { EditablePromptVariable } from '@/lib/utils/prompt-template'
import {
  createVariable, parsePromptTemplate, reconcilePromptVariables, removeVariableOccurrences,
  replaceVariableName,
} from '@/lib/utils/prompt-template'
import StructuredPromptEditor from './StructuredPromptEditor.vue'
import VariableInspector from './VariableInspector.vue'
import QuickOptimizationActions from './QuickOptimizationActions.vue'

interface Props {
  content: string
  variables: EditablePromptVariable[]
  quickOptimizationConfigs: any[]
  optimizing: string | null
  isStreaming: boolean
  streamStats: { charCount?: number }
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'update:content', value: string): void
  (e: 'update:variables', value: EditablePromptVariable[], source?: 'auto' | 'user'): void
  (e: 'optimize-prompt', configId: number): void
  (e: 'stop-optimization'): void
  (e: 'open-quick-optimization-config'): void
  (e: 'manual-adjustment', instruction: string): void
}>()

const { t } = useI18n()
const editorWorkspace = ref<HTMLElement>()
const structuredEditorRef = ref<InstanceType<typeof StructuredPromptEditor>>()
const quickOptimizationRef = ref<InstanceType<typeof QuickOptimizationActions>>()
const selectedVariable = ref('')
const compactInspector = ref(false)
const showInspectorDrawer = ref(false)
let resizeObserver: ResizeObserver | null = null
let variableCache = new Map<string, EditablePromptVariable>()

const parsed = computed(() => parsePromptTemplate(props.content))
const localVariables = computed(() => reconcilePromptVariables(props.content, [
  ...props.variables,
  ...Array.from(variableCache.values()).filter(cached => !props.variables.some(variable => variable.name === cached.name)),
]).all)
const occurrenceCounts = computed(() => Object.fromEntries(
  Array.from(parsed.value.occurrences.entries()).map(([name, occurrences]) => [name, occurrences.length])
))

watch(() => props.variables, variables => {
  variables.forEach(variable => variableCache.set(variable.name, { ...variable, options: [...(variable.options || [])] }))
}, { deep: true, immediate: true })

watch(() => props.content, () => {
  const reconciled = reconcilePromptVariables(props.content, localVariables.value)
  reconciled.all.forEach(variable => variableCache.set(variable.name, variable))
  emit('update:variables', reconciled.all, 'auto')
  if (selectedVariable.value && !reconciled.all.some(variable => variable.name === selectedVariable.value)) {
    selectedVariable.value = reconciled.active[0]?.name || reconciled.unused[0]?.name || ''
  }
})

onMounted(() => {
  if (!editorWorkspace.value) return
  resizeObserver = new ResizeObserver(entries => {
    compactInspector.value = (entries[0]?.contentRect.width || 0) < 860
  })
  resizeObserver.observe(editorWorkspace.value)
})

onBeforeUnmount(() => resizeObserver?.disconnect())

const handleContentUpdate = (content: string) => emit('update:content', content)

const generateUniqueVariableName = () => {
  const names = new Set(localVariables.value.map(variable => variable.name))
  let index = 1
  while (names.has(t('promptEditor.defaultVariableName', { index }))) index += 1
  return t('promptEditor.defaultVariableName', { index })
}

const addVariable = () => {
  const name = generateUniqueVariableName()
  const next = createVariable(name)
  variableCache.set(name, next)
  emit('update:variables', [...localVariables.value, next], 'user')
  selectedVariable.value = name
  nextTick(() => structuredEditorRef.value?.insertVariable(name))
}

const selectVariable = (name: string) => {
  selectedVariable.value = name
  if (compactInspector.value) showInspectorDrawer.value = true
}

const insertExistingVariable = (name: string) => {
  structuredEditorRef.value?.insertVariable(name)
  showInspectorDrawer.value = false
}

const updateVariable = ({ previousName, variable }: { previousName: string; variable: EditablePromptVariable }) => {
  const nextVariables = localVariables.value.map(item => item.name === previousName ? variable : item)
  variableCache.delete(previousName)
  variableCache.set(variable.name, variable)
  if (variable.name !== previousName) {
    emit('update:content', replaceVariableName(props.content, previousName, variable.name))
    selectedVariable.value = variable.name
  }
  emit('update:variables', nextVariables, 'user')
}

const removeVariable = (name: string) => {
  variableCache.delete(name)
  emit('update:variables', localVariables.value.filter(variable => variable.name !== name), 'user')
  if (parsed.value.occurrences.has(name)) emit('update:content', removeVariableOccurrences(props.content, name))
  const remaining = localVariables.value.filter(variable => variable.name !== name)
  selectedVariable.value = remaining[0]?.name || ''
}

defineExpose({
  get modelSelectorRef() {
    return quickOptimizationRef.value?.modelSelectorRef
  },
  get selectedModelKey() {
    return quickOptimizationRef.value?.selectedModelKey
  },
  focus: () => structuredEditorRef.value?.focus(),
  insertVariable: (name: string) => structuredEditorRef.value?.insertVariable(name),
})
</script>

<style scoped>
.regular-editor-workspace { position: relative; box-sizing: border-box; width: 100%; height: 100%; min-height: 0; padding-bottom: var(--content-padding); display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: var(--section-gap); background: var(--surface-primary); }
.editor-primary-column { min-width: 0; min-height: 0; display: flex; flex-direction: column; gap: var(--compact-padding); }
.editor-primary-column > :first-child { flex: 1; min-height: 220px; }
.regular-editor-workspace.compact { grid-template-columns: minmax(0, 1fr); }
</style>
