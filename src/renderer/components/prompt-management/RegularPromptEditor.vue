<template>
  <div ref="editorWorkspace" class="regular-editor-workspace" :class="{ compact: compactInspector }">
    <div class="editor-primary-column">
      <StructuredPromptEditor ref="structuredEditorRef" :content="content" :variables="localVariables"
        :selected-variable="selectedVariable" :readonly="isStreaming"
        :show-variables-button="compactInspector"
        :placeholder="t('promptManagement.contentPlaceholder')" @update:content="handleContentUpdate"
        @select-variable="selectVariable" @request-add-variable="addVariable"
        @request-open-variables="showInspectorDrawer = true" />

      <div class="editor-secondary-toolbar ui-toolbar">
        <div class="optimization-summary">
          <NIcon size="16"><Stars /></NIcon>
          <div>
            <NText>{{ t('promptManagement.quickOptimization') }}</NText>
            <NText v-if="isStreaming" depth="3" class="streaming-status">
              {{ t('promptManagement.generating') }} · {{ streamStats.charCount }} {{ t('promptManagement.characters') }}
            </NText>
          </div>
        </div>
        <NFlex size="small">
          <NButton v-if="isStreaming" size="small" type="error" secondary @click="$emit('stop-optimization')">
            {{ t('promptManagement.stopGeneration') }}
          </NButton>
          <NButton v-else size="small" :disabled="!content.trim() || optimizing !== null"
            @click="showOptimization = !showOptimization">
            <template #icon><NIcon size="16"><Wand /></NIcon></template>
            {{ t('promptEditor.aiOptimize') }}
          </NButton>
          <NTooltip>
            <template #trigger>
              <NButton size="small" quaternary @click="$emit('open-quick-optimization-config')">
                <template #icon><NIcon size="16"><Settings /></NIcon></template>
              </NButton>
            </template>
            {{ t('promptEditor.configureOptimization') }}
          </NTooltip>
        </NFlex>
      </div>

      <NCard v-if="showOptimization && !isStreaming" size="small" class="optimization-panel">
        <div class="optimization-grid">
          <AIModelSelector ref="modelSelectorRef" v-model:modelKey="selectedModelKey"
            :placeholder="t('promptManagement.aiModelPlaceholder')" :disabled="optimizing !== null" />
          <NFlex size="small" wrap>
            <NButton v-for="config in quickOptimizationConfigs" :key="config.id" size="small"
              :loading="optimizing === config.name" :disabled="!content.trim() || optimizing !== null"
              @click="$emit('optimize-prompt', config.id)">
              {{ config.name }}
            </NButton>
            <NButton size="small" :disabled="!content.trim() || optimizing !== null"
              @click="showManualInput = !showManualInput">
              {{ t('promptManagement.manualAdjustment') }}
            </NButton>
          </NFlex>
        </div>
        <div v-if="showManualInput" class="manual-adjustment">
          <NInput v-model:value="manualInstruction" type="textarea" :rows="3" maxlength="500" show-count
            :placeholder="t('promptManagement.manualAdjustmentPlaceholder')" />
          <NFlex justify="end" size="small">
            <NButton size="small" @click="cancelManualAdjustment">{{ t('common.cancel') }}</NButton>
            <NButton size="small" type="primary" :loading="optimizing === 'manual'"
              :disabled="!manualInstruction.trim()" @click="applyManualAdjustment">
              {{ t('promptManagement.confirmAdjustment') }}
            </NButton>
          </NFlex>
        </div>
      </NCard>
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
import {
  NButton, NCard, NDrawer, NDrawerContent, NFlex, NIcon, NInput, NText, NTooltip,
  useMessage,
} from 'naive-ui'
import { Settings, Stars, Wand } from '@vicons/tabler'
import AIModelSelector from '@/components/common/AIModelSelector.vue'
import type { EditablePromptVariable } from '@/lib/utils/prompt-template'
import {
  createVariable, parsePromptTemplate, reconcilePromptVariables, removeVariableOccurrences,
  replaceVariableName,
} from '@/lib/utils/prompt-template'
import StructuredPromptEditor from './StructuredPromptEditor.vue'
import VariableInspector from './VariableInspector.vue'

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
const message = useMessage()
const editorWorkspace = ref<HTMLElement>()
const structuredEditorRef = ref<InstanceType<typeof StructuredPromptEditor>>()
const modelSelectorRef = ref<any>()
const selectedModelKey = ref('')
const selectedVariable = ref('')
const showOptimization = ref(false)
const showManualInput = ref(false)
const manualInstruction = ref('')
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

const cancelManualAdjustment = () => {
  showManualInput.value = false
  manualInstruction.value = ''
}

const applyManualAdjustment = () => {
  const instruction = manualInstruction.value.trim()
  if (!instruction) {
    message.warning(t('promptManagement.enterAdjustmentInstruction'))
    return
  }
  emit('manual-adjustment', instruction)
  cancelManualAdjustment()
}

defineExpose({
  modelSelectorRef,
  selectedModelKey,
  focus: () => structuredEditorRef.value?.focus(),
  insertVariable: (name: string) => structuredEditorRef.value?.insertVariable(name),
})
</script>

<style scoped>
.regular-editor-workspace { position: relative; box-sizing: border-box; width: 100%; height: 100%; min-height: 0; padding-bottom: 8px; display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: var(--section-gap); background: var(--surface-primary); }
.editor-primary-column { min-width: 0; min-height: 0; display: flex; flex-direction: column; gap: var(--compact-padding); }
.editor-primary-column > :first-child { flex: 1; min-height: 220px; }
.editor-secondary-toolbar { flex: 0 0 46px; min-height: 46px; padding: 6px var(--compact-padding); display: flex; align-items: center; justify-content: space-between; gap: var(--compact-padding); }
.optimization-summary { display: flex; align-items: center; gap: 8px; min-width: 0; }
.optimization-summary > :deep(.n-icon) { color: var(--accent-primary); }
.streaming-status { display: block; font-size: 12px; }
.optimization-panel { flex: 0 0 auto; border: 1px solid var(--border-default); background: var(--surface-secondary); }
.optimization-grid { display: grid; grid-template-columns: minmax(220px, 1fr) auto; align-items: center; gap: var(--compact-padding); }
.manual-adjustment { margin-top: var(--compact-padding); padding-top: var(--compact-padding); display: flex; flex-direction: column; gap: var(--compact-padding); border-top: 1px solid var(--border-default); }
.regular-editor-workspace.compact { grid-template-columns: minmax(0, 1fr); }
@media (max-width: 720px) {
  .optimization-grid { grid-template-columns: 1fr; }
  .optimization-summary > div { display: none; }
}
</style>
