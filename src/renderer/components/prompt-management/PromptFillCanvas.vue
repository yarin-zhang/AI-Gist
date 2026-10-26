<template>
  <div class="prompt-fill-canvas" :class="{ compact }">
    <div v-if="showToolbar" class="fill-toolbar ui-toolbar">
      <div class="fill-view-switch" role="group" :aria-label="t('promptFill.viewMode')">
        <NButton size="small" :type="viewMode === 'fill' ? 'primary' : 'default'"
          :secondary="viewMode === 'fill'" :quaternary="viewMode !== 'fill'"
          :disabled="variables.length === 0" @click="viewMode = 'fill'">
          <template #icon><NIcon size="16"><Forms /></NIcon></template>
          {{ t('promptFill.fill') }}
        </NButton>
        <NButton size="small" :type="viewMode === 'result' ? 'primary' : 'default'"
          :secondary="viewMode === 'result'" :quaternary="viewMode !== 'result'" @click="viewMode = 'result'">
          <template #icon><NIcon size="16"><FileText /></NIcon></template>
          {{ t('promptFill.result') }}
        </NButton>
      </div>
      <NText v-if="variables.length" depth="3" class="fill-progress">
        {{ t('promptFill.progress', { filled: filledCount, total: variables.length }) }}
      </NText>
    </div>

    <NAlert v-if="rendered.error" type="error" class="render-alert" :title="t('promptWorkspace.renderFailed')">
      {{ rendered.error }}
    </NAlert>

    <div ref="canvasBody" class="fill-canvas-body">
      <template v-if="viewMode === 'fill' && variables.length">
        <template v-if="prompt.isJinjaTemplate">
          <section class="jinja-variable-shelf" :aria-label="t('promptWorkspace.fillVariables')">
            <div class="shelf-heading">
              <div>
                <NText strong>{{ t('promptWorkspace.fillVariables') }}</NText>
                <NText depth="3" class="shelf-description">
                  {{ t('promptWorkspace.fillVariablesHint', { count: variables.length }) }}
                </NText>
              </div>
            </div>
            <div class="jinja-field-grid">
              <PromptVariableField v-for="variable in variables" :key="variable.name"
                :variable="variable" :model-value="values[variable.name]" :compact="compact"
                :error="showError(variable.name)" @update:model-value="updateValue(variable.name, $event)"
                @blur="markTouched(variable.name)" />
            </div>
          </section>
          <section class="jinja-live-result">
            <NText depth="3" class="result-label">{{ t('promptFill.liveResult') }}</NText>
            <pre>{{ rendered.content }}</pre>
          </section>
        </template>

        <div v-else class="inline-prompt-document">
          <template v-for="(segment, index) in parsed.segments" :key="`${segment.start}-${index}`">
            <span v-if="segment.kind === 'text'">{{ segment.text }}</span>
            <PromptVariableField v-else-if="variableByName.get(segment.name)" :variable="variableByName.get(segment.name)!"
              :model-value="values[segment.name]" inline :compact="compact"
              :first-occurrence="segment.firstOccurrence" :multiline="multilineStarts.has(segment.start)"
              :error="showError(segment.name)"
              @update:model-value="updateValue(segment.name, $event)" @blur="markTouched(segment.name)" />
            <span v-else>{{ segment.raw }}</span>
          </template>
        </div>
      </template>

      <div v-else class="final-prompt-result">
        <pre><template v-for="(segment, index) in resultSegments" :key="index"><template
          v-if="segment.kind === 'text'">{{ segment.text }}</template><button v-else type="button"
          class="unfilled-placeholder" :class="{ required: segment.required }" :data-unfilled-variable="segment.name"
          :title="t('promptFill.unfilledHint', { name: segment.name })"
          :aria-label="t('promptFill.unfilledHint', { name: segment.name })"
          @click="focusVariable(segment.name)">{{ segment.raw }}</button></template></pre>
      </div>
    </div>

    <div v-if="$slots.footer" class="fill-canvas-footer">
      <slot name="footer" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { NAlert, NButton, NIcon, NText } from 'naive-ui'
import { FileText, Forms } from '@vicons/tabler'
import type { PromptWithRelations } from '@shared/types/database'
import {
  buildPromptResultSegments, findMultilineVariableStarts, getActivePromptVariables, getMissingPromptVariables,
  getUnfilledPromptVariables,
  parsePromptTemplate, renderPrompt,
} from '@/lib/utils/prompt-template'
import PromptVariableField from './PromptVariableField.vue'

const props = withDefaults(defineProps<{
  prompt: PromptWithRelations
  values: Record<string, any>
  compact?: boolean
  showToolbar?: boolean
}>(), {
  compact: false,
  showToolbar: true,
})

const emit = defineEmits<{
  'update:values': [values: Record<string, any>]
  'update:view': [view: 'fill' | 'result']
}>()

const { t } = useI18n()
const canvasBody = ref<HTMLElement>()
const touched = ref(new Set<string>())
const viewMode = ref<'fill' | 'result'>('fill')
const variables = computed(() => getActivePromptVariables(props.prompt))
const parsed = computed(() => parsePromptTemplate(props.prompt.content || ''))
const multilineStarts = computed(() => findMultilineVariableStarts(props.prompt.content || '', parsed.value.segments))
const variableByName = computed(() => new Map(variables.value.map(variable => [variable.name, variable])))
const missing = computed(() => getMissingPromptVariables(variables.value, props.values))
const rendered = computed(() => renderPrompt(props.prompt, props.values, variables.value))
const unfilled = computed(() => getUnfilledPromptVariables(variables.value, props.values).map(variable => variable.name))
const filledCount = computed(() => variables.value.length - unfilled.value.length)
const resultSegments = computed(() => buildPromptResultSegments(props.prompt, props.values, variables.value))

watch(() => props.prompt.id, () => {
  touched.value = new Set()
  viewMode.value = variables.value.length ? 'fill' : 'result'
}, { immediate: true })

watch(viewMode, value => emit('update:view', value))

const updateValue = (name: string, value: any) => emit('update:values', { ...props.values, [name]: value })

const markTouched = (name: string) => {
  if (touched.value.has(name)) return
  touched.value = new Set([...touched.value, name])
}

const showError = (name: string) => touched.value.has(name) && missing.value.includes(name)

const focusVariable = async (name: string) => {
  viewMode.value = 'fill'
  await nextTick()
  const fields = Array.from(canvasBody.value?.querySelectorAll<HTMLElement>('[data-variable-field]') || [])
  const field = fields.find(item => item.dataset.variableField === name && item.dataset.firstOccurrence === 'true')
    || fields.find(item => item.dataset.variableField === name)
  if (!field) return
  field.scrollIntoView({ block: 'center', behavior: 'smooth' })
  const target = field.querySelector<HTMLElement>('input, textarea, button, [tabindex="0"]')
  target?.focus()
}

const validateAndFocus = async () => {
  if (!missing.value.length && !rendered.value.error) return true
  touched.value = new Set([...touched.value, ...missing.value])
  if (missing.value[0]) await focusVariable(missing.value[0])
  return false
}

const resetValidation = () => { touched.value = new Set() }

defineExpose({
  validateAndFocus,
  focusVariable,
  resetValidation,
  setView: (view: 'fill' | 'result') => { viewMode.value = view },
  renderedContent: computed(() => rendered.value.content),
  renderError: computed(() => rendered.value.error || ''),
  missingVariables: missing,
  unfilledVariables: unfilled,
})
</script>

<style scoped>
.prompt-fill-canvas { box-sizing: border-box; min-height: 0; height: 100%; display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--border-default); border-radius: var(--radius-panel); background: var(--surface-primary); }
.fill-toolbar { min-height: 46px; padding: 6px var(--compact-padding); display: flex; align-items: center; justify-content: space-between; gap: var(--compact-padding); border: 0; border-bottom: 1px solid var(--border-default); border-radius: 0; }
.fill-view-switch { display: flex; align-items: center; gap: 4px; }
.fill-progress { font-size: 12px; font-variant-numeric: tabular-nums; }
.render-alert { margin: var(--compact-padding) var(--content-padding) 0; }
.fill-canvas-body { flex: 1; min-height: 0; overflow: auto; padding: var(--content-padding); user-select: text; -webkit-user-select: text; }
.inline-prompt-document { width: 100%; color: var(--content-primary); font-size: 14px; line-height: var(--line-height-relaxed); white-space: pre-wrap; overflow-wrap: anywhere; }
.final-prompt-result { width: 100%; }
.final-prompt-result pre, .jinja-live-result pre { margin: 0; color: var(--content-primary); font: inherit; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 14px; line-height: var(--line-height-relaxed); white-space: pre-wrap; overflow-wrap: anywhere; }
/* Unfilled variables keep their {{name}} source in the result so a gap is visible before copying. */
.unfilled-placeholder { display: inline; margin: 0; padding: 0 3px; border: 1px solid color-mix(in srgb, var(--accent-warning) 45%, var(--border-default)); border-radius: var(--radius-control); background: color-mix(in srgb, var(--accent-warning) 14%, var(--surface-primary)); color: var(--content-primary); font: inherit; line-height: inherit; cursor: pointer; -webkit-box-decoration-break: clone; box-decoration-break: clone; }
.unfilled-placeholder.required { border-color: color-mix(in srgb, var(--accent-error) 45%, var(--border-default)); background: color-mix(in srgb, var(--accent-error) 12%, var(--surface-primary)); }
.unfilled-placeholder:hover { background: color-mix(in srgb, var(--accent-warning) 24%, var(--surface-primary)); }
.unfilled-placeholder.required:hover { background: color-mix(in srgb, var(--accent-error) 20%, var(--surface-primary)); }
.unfilled-placeholder:focus-visible { outline: 2px solid var(--accent-primary); outline-offset: 1px; }
.jinja-variable-shelf { width: 100%; margin: 0 0 var(--section-gap); padding: var(--content-padding); border: 1px solid var(--border-default); border-radius: var(--radius-panel); background: var(--surface-secondary); }
.shelf-description { display: block; margin-top: 2px; font-size: 13px; }
.jinja-field-grid { margin-top: var(--content-padding); display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--content-padding); }
.jinja-live-result { width: 100%; padding: var(--content-padding) 0 0; border-top: 1px solid var(--border-default); }
.result-label { display: block; margin-bottom: var(--compact-padding); font-size: 12px; font-weight: var(--font-weight-medium); }
.fill-canvas-footer { flex: 0 0 auto; min-height: 52px; padding: 8px var(--content-padding); border-top: 1px solid var(--border-default); background: var(--surface-secondary); }
.prompt-fill-canvas.compact .fill-canvas-body { padding: var(--content-padding); }
.prompt-fill-canvas.compact .inline-prompt-document { font-size: 14px; line-height: 2; }
.prompt-fill-canvas.compact .jinja-field-grid { grid-template-columns: 1fr; }
@media (max-width: 720px) {
  .jinja-field-grid { grid-template-columns: 1fr; }
  .fill-progress { display: none; }
}
</style>
