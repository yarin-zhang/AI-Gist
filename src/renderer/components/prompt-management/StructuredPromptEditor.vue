<template>
  <div class="structured-editor" :class="{ 'structured-editor--bare': bare }">
    <div v-if="!bare" class="structured-editor-toolbar ui-toolbar">
      <div class="editor-view-switch" :role="sourceOnly ? undefined : 'group'"
        :aria-label="sourceOnly ? undefined : t('promptEditor.viewMode')">
        <template v-if="!sourceOnly">
          <NButton size="small" :type="visualMode ? 'primary' : 'default'"
            :secondary="visualMode" :quaternary="!visualMode" @click="setVisualMode(true)">
            <template #icon><NIcon size="16"><LayoutCards /></NIcon></template>
            <span class="view-mode-label">{{ t('promptEditor.visual') }}</span>
          </NButton>
          <NButton size="small" :type="!visualMode ? 'primary' : 'default'"
            :secondary="!visualMode" :quaternary="visualMode" @click="setVisualMode(false)">
            <template #icon><NIcon size="16"><Code /></NIcon></template>
            <span class="view-mode-label">{{ t('promptEditor.source') }}</span>
          </NButton>
        </template>
        <slot name="toolbar-prefix" />
      </div>

      <div class="editor-toolbar-actions">
        <slot name="toolbar-extra" />
        <NText v-if="!showVariablesButton" depth="3" class="variable-count">
          {{ t('promptEditor.variableCount', { count: displayedVariableCount }) }}
        </NText>
        <NTooltip v-else>
          <template #trigger>
            <NButton size="small" class="variables-toolbar-button" @click="$emit('request-open-variables')">
              <template #icon><NIcon size="16"><AdjustmentsHorizontal /></NIcon></template>
              <span class="toolbar-button-label">{{ t('promptEditor.variables') }}</span>
              <span class="toolbar-button-count">{{ displayedVariableCount }}</span>
            </NButton>
          </template>
          {{ t('promptEditor.variables') }} · {{ displayedVariableCount }}
        </NTooltip>
        <NDropdown v-if="insertableVariableNames.length" trigger="click" placement="bottom-end"
          :options="insertVariableOptions" :disabled="readonly" @select="handleInsertVariableSelect">
          <NButton size="small" :disabled="readonly" :aria-label="t('promptEditor.insertVariable')"
            @mousedown.prevent>
            <template #icon><NIcon size="16"><Braces /></NIcon></template>
            <span class="toolbar-button-label">{{ t('promptEditor.insertVariable') }}</span>
            <NIcon size="16" class="toolbar-button-chevron"><ChevronDown /></NIcon>
          </NButton>
        </NDropdown>
        <NTooltip v-else>
          <template #trigger>
            <NButton size="small" :disabled="readonly" :aria-label="t('promptEditor.insertVariable')"
              @mousedown.prevent @click="$emit('request-add-variable')">
              <template #icon><NIcon size="16"><Braces /></NIcon></template>
              <span class="toolbar-button-label">{{ t('promptEditor.insertVariable') }}</span>
            </NButton>
          </template>
          {{ t('promptEditor.insertAtCursor') }}
        </NTooltip>
      </div>
    </div>

    <div ref="editorHost" class="structured-editor-host" :class="{ readonly }" />

    <div v-if="diagnosticCount" class="editor-diagnostic" role="status">
      <NIcon size="16"><AlertTriangle /></NIcon>
      <span>{{ t('promptEditor.unclosedVariable', { count: diagnosticCount }) }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, h, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { NButton, NDropdown, NIcon, NText, NTooltip, type DropdownOption } from 'naive-ui'
import {
  AdjustmentsHorizontal, AlertTriangle, Braces, ChevronDown, Code, LayoutCards, Plus,
} from '@vicons/tabler'
import {
  autocompletion, pickedCompletion, type Completion, type CompletionContext, type CompletionResult,
} from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import {
  Compartment, EditorSelection, EditorState, StateEffect, StateField,
} from '@codemirror/state'
import {
  Decoration, EditorView, keymap, placeholder as editorPlaceholder,
  WidgetType, type DecorationSet,
} from '@codemirror/view'
import type { EditablePromptVariable, ParsedPromptTemplate } from '@/lib/utils/prompt-template'
import { findEditingVariableSegment, parsePromptTemplate, validateVariableName } from '@/lib/utils/prompt-template'
import { findCompletionMatch, rankVariableCompletions } from '@/lib/utils/variable-completion'

const props = withDefaults(defineProps<{
  content: string
  variables: EditablePromptVariable[]
  selectedVariable?: string
  readonly?: boolean
  placeholder?: string
  showVariablesButton?: boolean
  sourceOnly?: boolean
  variableCount?: number
  /** 无边框、无工具栏，正文排版与填写视图一致（V5 提示词页的变量名模式） */
  bare?: boolean
}>(), {
  selectedVariable: '',
  readonly: false,
  placeholder: '',
  showVariablesButton: false,
  sourceOnly: false,
  variableCount: undefined,
  bare: false,
})

const emit = defineEmits<{
  'update:content': [value: string]
  'select-variable': [name: string]
  'variable-inserted': [name: string]
  /** 在正文里输入 `{{名字` 后从补全里创建了新变量 */
  'variable-created': [name: string]
  'request-add-variable': []
  'request-open-variables': []
}>()

const { t } = useI18n()
const editorHost = ref<HTMLElement>()
const visualMode = ref(!props.sourceOnly)
const diagnosticCount = ref(parsePromptTemplate(props.content).diagnostics.length)
const displayedVariableCount = computed(() => (
  props.variableCount ?? parsePromptTemplate(props.content).variableNames.length
))
const readonlyCompartment = new Compartment()
let editorView: EditorView | null = null
let pendingContentSync = false

const flushContentSync = (view: EditorView) => {
  if (!pendingContentSync || view.composing || view !== editorView) return
  pendingContentSync = false
  emit('update:content', view.state.doc.toString())
}
// CodeMirror keeps its selection after blur, so side-panel and toolbar inserts reuse it.
// Until the user places a cursor, inserts append to the end instead of the start.
let hasUserCursor = false

const NEW_VARIABLE_KEY = '__new_variable__'
const renderMenuIcon = (icon: typeof Braces) => () => h(NIcon, { size: 16 }, { default: () => h(icon) })
const insertableVariableNames = computed(() => Array.from(new Set(
  props.variables.map(variable => variable.name).filter(Boolean),
)))
const insertVariableOptions = computed<DropdownOption[]>(() => [
  ...insertableVariableNames.value.map(name => ({ key: name, label: name, icon: renderMenuIcon(Braces) })),
  { key: 'divider', type: 'divider' },
  { key: NEW_VARIABLE_KEY, label: t('promptEditor.addVariable'), icon: renderMenuIcon(Plus) },
])

interface DecorationState {
  visual: boolean
  selected: string
  focused: boolean
  parsed: ParsedPromptTemplate
  editingStart: number
  typingStart: number
  decorations: DecorationSet
  atomicRanges: DecorationSet
}

const setDecorationConfig = StateEffect.define<{ visual: boolean; selected: string }>()
const setEditorFocused = StateEffect.define<boolean>()

class VariableWidget extends WidgetType {
  constructor(
    readonly name: string,
    readonly occurrenceCount: number,
    readonly selected: boolean,
  ) { super() }

  eq(other: VariableWidget) {
    return other.name === this.name
      && other.occurrenceCount === this.occurrenceCount
      && other.selected === this.selected
  }

  toDOM() {
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset.variable = this.name
    button.setAttribute('aria-label', t('promptEditor.variableTokenLabel', {
      name: this.name,
      count: this.occurrenceCount,
    }))
    if (props.bare) {
      // 与填写视图的变量标记同一套样式，只显示变量名
      button.className = `ui-var ui-var--name${this.selected ? ' ui-var--active' : ''}`
      button.textContent = this.name
      button.addEventListener('mousedown', event => event.preventDefault())
      button.addEventListener('click', () => emit('select-variable', this.name))
      return button
    }
    button.className = `prompt-variable-token${this.selected ? ' selected' : ''}`

    const braces = document.createElement('span')
    braces.className = 'prompt-variable-token-icon'
    braces.textContent = '{}'
    const label = document.createElement('span')
    label.textContent = this.name
    button.append(braces, label)
    if (this.occurrenceCount > 1) {
      const count = document.createElement('span')
      count.className = 'prompt-variable-token-count'
      count.textContent = String(this.occurrenceCount)
      button.append(count)
    }

    button.addEventListener('mousedown', event => event.preventDefault())
    button.addEventListener('click', () => emit('select-variable', this.name))
    return button
  }

  ignoreEvent() { return false }
}

// 光标所在或输入法正在组合的 `{{…}}` 保持源码形态，光标离开（或编辑器失焦）后再渲染成变量块。
const findEditingStart = (parsed: ParsedPromptTemplate, selection: EditorSelection, focused: boolean) => {
  if (!focused) return -1
  const positions = selection.ranges.flatMap(range => [range.anchor, range.head])
  return findEditingVariableSegment(parsed.segments, positions)?.start ?? -1
}

// 光标还停在未闭合的 `{{` 后面（正在输入变量名）时先不报未闭合，光标离开这一行或编辑器失焦后再提示
const findTypingStart = (parsed: ParsedPromptTemplate, selection: EditorSelection, focused: boolean) => {
  if (!focused) return -1
  const head = selection.main.head
  return parsed.diagnostics.find(diagnostic => head >= diagnostic.start + 2 && head <= diagnostic.end)?.start ?? -1
}

const buildDecorations = (
  parsed: ParsedPromptTemplate, visual: boolean, selected: string, editingStart: number, typingStart = -1,
) => {
  const diagnostics = parsed.diagnostics.filter(diagnostic => diagnostic.start !== typingStart)
  diagnosticCount.value = diagnostics.length
  const ranges: any[] = []
  const atomicRanges: any[] = []

  for (const segment of parsed.segments) {
    if (segment.kind !== 'variable') continue
    const occurrenceCount = parsed.occurrences.get(segment.name)?.length || 1
    const renderAsToken = visual && segment.start !== editingStart
    const decoration = renderAsToken
      ? Decoration.replace({
        widget: new VariableWidget(segment.name, occurrenceCount, selected === segment.name),
      })
      : Decoration.mark({
        class: `prompt-variable-source${selected === segment.name ? ' selected' : ''}`,
        attributes: { 'data-variable': segment.name },
      })
    ranges.push(decoration.range(segment.start, segment.end))
    if (renderAsToken) atomicRanges.push(decoration.range(segment.start, segment.end))
  }

  for (const diagnostic of diagnostics) {
    if (diagnostic.end > diagnostic.start) {
      ranges.push(Decoration.mark({ class: 'prompt-variable-diagnostic' }).range(diagnostic.start, diagnostic.end))
    }
  }

  return {
    decorations: Decoration.set(ranges, true),
    atomicRanges: Decoration.set(atomicRanges, true),
  }
}

const variableDecorations = StateField.define<DecorationState>({
  create(state) {
    const visual = !props.sourceOnly
    const parsed = parsePromptTemplate(state.doc.toString())
    const built = buildDecorations(parsed, visual, props.selectedVariable, -1)
    return { visual, selected: props.selectedVariable, focused: false, parsed, editingStart: -1, typingStart: -1, ...built }
  },
  update(value, transaction) {
    let { visual, selected, focused } = value
    let configChanged = false
    transaction.effects.forEach(effect => {
      if (effect.is(setDecorationConfig)) {
        visual = effect.value.visual
        selected = effect.value.selected
        configChanged = true
      } else if (effect.is(setEditorFocused)) {
        focused = effect.value
      }
    })
    const parsed = transaction.docChanged ? parsePromptTemplate(transaction.state.doc.toString()) : value.parsed
    const editingStart = findEditingStart(parsed, transaction.state.selection, focused)
    const typingStart = findTypingStart(parsed, transaction.state.selection, focused)
    if (!transaction.docChanged && !configChanged && editingStart === value.editingStart && typingStart === value.typingStart) {
      return focused === value.focused ? value : { ...value, focused }
    }
    const built = buildDecorations(parsed, visual, selected, editingStart, typingStart)
    return { visual, selected, focused, parsed, editingStart, typingStart, ...built }
  },
  provide: field => EditorView.decorations.from(field, value => value.decorations),
})

const editorFocusTracker = EditorView.focusChangeEffect.of((_state, focused) => setEditorFocused.of(focused))

const variableAtomicRanges = EditorView.atomicRanges.of(view => view.state.field(variableDecorations).atomicRanges)

// 补全时写入完整的 `{{name}}`；新建的变量通知提示词页切到变量页签并展开它
const applyVariable = (name: string, created: boolean) => (
  view: EditorView, completion: Completion, from: number, to: number,
) => {
  const insert = `{{${name}}}`
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + insert.length },
    annotations: pickedCompletion.of(completion),
    userEvent: 'input.complete',
  })
  if (created) emit('variable-created', name)
}

const completionSource = (context: CompletionContext): CompletionResult | null => {
  const token = context.matchBefore(/\{\{[^{}\n]*$/)
  if (!token) return null
  const typed = token.text.slice(2).trim()
  const existingNames = props.variables.map(variable => variable.name).filter(Boolean)
  // 按已输入的文字筛选排序，完全匹配和前缀匹配排在前面，回车选中的就是第一项
  const matchedNames = rankVariableCompletions(existingNames, typed)
  const options: Completion[] = matchedNames.map(name => ({
    label: name, type: 'variable', apply: applyVariable(name, false), detail: t('promptEditor.existingVariable'),
  }))
  if (typed && !existingNames.includes(typed) && !validateVariableName(typed, props.variables)) {
    const createOption = { label: t('promptEditor.createVariable', { name: typed }), type: 'keyword', apply: applyVariable(typed, true), detail: '↵' }
    // 「创建变量」只在没有匹配的已有变量时排第一
    if (matchedNames.length) options.push(createOption)
    else options.unshift(createOption)
  }
  // 刚输入 `{{` 还没写名字：提示接着输入变量名（有已有变量时排在它们后面）；这一项只是说明，选中后什么都不插入
  if (!typed) {
    options.push({ label: t('promptEditor.typeVariableName'), type: 'text', apply: () => undefined, boost: -99 })
  }
  if (!options.length) return null
  // 光标在 `{{}}` 中间时，把后面已有的 `}}` 一并替换掉，避免补全后变成 `{{name}}}}`
  const to = context.state.sliceDoc(context.pos, context.pos + 2) === '}}' ? context.pos + 2 : context.pos
  return {
    from: token.from,
    to,
    options,
    filter: false,
    getMatch: completion => (completion.type === 'variable' ? findCompletionMatch(completion.label, typed) : []),
  }
}

const editorTheme = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'var(--surface-primary)', color: 'var(--content-primary)' },
  '.cm-scroller': { overflow: 'auto', fontFamily: 'var(--font-family-mono)', lineHeight: '1.7' },
  '.cm-content': { minHeight: '100%', padding: '16px', caretColor: 'var(--accent-primary)', fontSize: '14px' },
  '.cm-line': { padding: '0' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent-primary)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: 'var(--interactive-focus)' },
  '.cm-gutters': { display: 'none' },
  // 补全浮层：跟随设计令牌，覆盖 CodeMirror 默认的白底样式
  '.cm-tooltip': {
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-panel)',
    color: 'var(--content-primary)',
    backgroundColor: 'var(--surface-primary)',
    boxShadow: 'var(--shadow-popover)',
  },
  '.cm-tooltip.cm-tooltip-autocomplete': { overflow: 'hidden' },
  '.cm-tooltip.cm-tooltip-autocomplete > ul': {
    minWidth: '200px',
    maxHeight: '240px',
    padding: '4px',
    fontFamily: 'inherit',
    fontSize: '14px',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li:hover': { backgroundColor: 'var(--interactive-hover)' },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    color: 'var(--content-primary)',
    backgroundColor: 'var(--surface-tertiary)',
    fontWeight: 'var(--font-weight-medium)',
  },
  '.cm-completionMatchedText': { textDecoration: 'none', color: 'var(--accent-primary)' },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li.cm-completion-hint': { color: 'var(--content-tertiary)', fontWeight: 'var(--font-weight-normal)' },
  '.cm-completionDetail': { marginLeft: 'auto', paddingLeft: '12px', fontStyle: 'normal', fontFamily: 'var(--font-family-mono)', fontSize: '12px', color: 'var(--content-tertiary)' },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li': {
    display: 'flex',
    alignItems: 'center',
    padding: '4px 8px',
    borderRadius: 'var(--radius-control)',
    color: 'var(--content-primary)',
    lineHeight: '24px',
  },
})

// 无边框模式：正文用界面字体和 1.8 行高，和填写视图的排版一致
const bareTheme = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'transparent', color: 'var(--content-primary)' },
  '.cm-scroller': { overflow: 'visible', fontFamily: 'var(--font-family-sans)', lineHeight: '1.8' },
  '.cm-content': { minHeight: '120px', padding: '0', caretColor: 'var(--content-primary)', fontSize: '14px' },
})

onMounted(() => {
  if (!editorHost.value) return
  const state = EditorState.create({
    doc: props.content,
    extensions: [
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      EditorView.lineWrapping,
      variableDecorations,
      variableAtomicRanges,
      editorFocusTracker,
      autocompletion({
        override: [completionSource], activateOnTyping: true, icons: false,
        optionClass: completion => (completion.type === 'text' ? 'cm-completion-hint' : ''),
      }),
      readonlyCompartment.of(EditorState.readOnly.of(props.readonly)),
      editorPlaceholder(props.placeholder),
      // 先注册的主题优先级更高：无边框模式的字体和边距要盖过通用主题，两种模式的正文才对得齐
      ...(props.bare ? [bareTheme] : []),
      editorTheme,
      EditorView.updateListener.of(update => {
        if (update.view.hasFocus && (update.selectionSet || update.focusChanged)) hasUserCursor = true
        if (update.docChanged) pendingContentSync = true
        // IME composition puts raw pinyin into the document; sync only the committed text.
        if (!update.view.composing) flushContentSync(update.view)
      }),
      EditorView.domEventHandlers({
        // CodeMirror may apply the committed text without another update, so flush after it settles.
        compositionend: (_event, view) => { setTimeout(() => flushContentSync(view)) },
      }),
    ],
  })
  editorView = new EditorView({ state, parent: editorHost.value })
})

onBeforeUnmount(() => editorView?.destroy())

watch(() => props.content, value => {
  if (!editorView || value === editorView.state.doc.toString()) return
  editorView.dispatch({ changes: { from: 0, to: editorView.state.doc.length, insert: value } })
})

watch(() => props.readonly, value => {
  editorView?.dispatch({ effects: readonlyCompartment.reconfigure(EditorState.readOnly.of(value)) })
})

watch(() => props.selectedVariable, selected => refreshDecorations(selected || ''))

const refreshDecorations = (selected = props.selectedVariable || '') => {
  editorView?.dispatch({ effects: setDecorationConfig.of({ visual: visualMode.value, selected }) })
}

const setVisualMode = (value: boolean) => {
  visualMode.value = props.sourceOnly ? false : value
  refreshDecorations()
  editorView?.focus()
}

const insertVariable = (name: string) => {
  if (!editorView || props.readonly) return
  const { state } = editorView
  const selection = hasUserCursor || editorView.hasFocus
    ? state.selection.main
    : EditorSelection.cursor(state.doc.length)
  const placeholder = `{{${name}}}`
  editorView.dispatch({
    changes: { from: selection.from, to: selection.to, insert: placeholder },
    selection: { anchor: selection.from + placeholder.length },
    scrollIntoView: true,
  })
  emit('variable-inserted', name)
  editorView.focus()
}

const handleInsertVariableSelect = (key: string | number) => {
  if (key === NEW_VARIABLE_KEY) emit('request-add-variable')
  else insertVariable(String(key))
}

const focusVariable = (name: string, occurrence = 0) => {
  if (!editorView) return
  const target = parsePromptTemplate(editorView.state.doc.toString()).occurrences.get(name)?.[occurrence]
  if (!target) return
  editorView.dispatch({
    selection: EditorSelection.cursor(target.start),
    scrollIntoView: true,
  })
  emit('select-variable', name)
  editorView.focus()
}

defineExpose({
  focus: () => editorView?.focus(),
  insertVariable,
  focusVariable,
  getCursorPosition: () => editorView?.state.selection.main.head ?? props.content.length,
  setVisualMode,
})
</script>

<style scoped>
.structured-editor { container: structured-editor / inline-size; box-sizing: border-box; min-height: 0; height: 100%; display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--border-default); border-radius: var(--radius-panel); background: var(--surface-primary); }
.structured-editor-toolbar { min-height: 46px; padding: 6px var(--compact-padding); display: flex; align-items: center; justify-content: space-between; gap: var(--compact-padding); border: 0; border-bottom: 1px solid var(--border-default); border-radius: 0; }
.editor-view-switch, .editor-toolbar-actions { min-width: 0; display: flex; align-items: center; gap: 4px; }
.editor-view-switch { flex: 0 1 auto; }
.editor-toolbar-actions { flex: 0 0 auto; gap: 4px; }
.variable-count { white-space: nowrap; font-size: 12px; font-variant-numeric: tabular-nums; }
.toolbar-button-chevron { margin-left: 2px; color: var(--content-secondary); }
.toolbar-button-count { min-width: 16px; color: var(--content-secondary); font-size: 12px; font-variant-numeric: tabular-nums; text-align: center; }
.structured-editor-host { flex: 1; min-height: 0; overflow: hidden; user-select: text; -webkit-user-select: text; }
.structured-editor-host.readonly { opacity: .78; }
.structured-editor-host :deep(.cm-editor) { height: 100%; }
.structured-editor-host :deep(.cm-placeholder) { color: var(--content-tertiary); }
.structured-editor-host :deep(.prompt-variable-token) { display: inline-flex; align-items: center; gap: 6px; min-height: 26px; margin: 0 2px; padding: 1px 8px; border: 1px solid var(--border-default); border-radius: var(--radius-control); color: var(--content-primary); background: var(--surface-secondary); font: inherit; font-family: inherit; cursor: pointer; vertical-align: baseline; }
.structured-editor-host :deep(.prompt-variable-token:hover) { border-color: var(--border-strong); background: var(--surface-tertiary); }
.structured-editor-host :deep(.prompt-variable-token.selected) { background: var(--surface-tertiary); font-weight: var(--font-weight-medium); }
.structured-editor-host :deep(.prompt-variable-token:focus-visible) { outline: 2px solid var(--interactive-focus); outline-offset: 1px; }
.structured-editor-host :deep(.prompt-variable-token-icon) { color: var(--accent-primary); font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 12px; }
.structured-editor-host :deep(.prompt-variable-token-count) { min-width: 17px; padding: 0 4px; border-radius: var(--radius-control); color: var(--content-secondary); background: var(--surface-tertiary); font-size: 12px; line-height: 17px; text-align: center; }
.structured-editor-host :deep(.prompt-variable-source) { border-radius: 2px; color: var(--accent-primary); background: var(--interactive-focus); }
.structured-editor-host :deep(.prompt-variable-source.selected) { background: var(--interactive-active); font-weight: var(--font-weight-medium); }
.structured-editor-host :deep(.prompt-variable-diagnostic) { text-decoration: underline wavy var(--accent-warning); text-underline-offset: 3px; }
.structured-editor--bare { height: auto; overflow: visible; border: 0; border-radius: 0; background: transparent; }
.structured-editor--bare .structured-editor-host { overflow: visible; }
.structured-editor--bare .structured-editor-host :deep(.ui-var) { margin: 0 1px; vertical-align: baseline; }
.structured-editor--bare .structured-editor-host :deep(.prompt-variable-source) { color: var(--variable-text); background: transparent; font-family: var(--font-family-mono); font-size: 13px; }
.structured-editor--bare .editor-diagnostic { margin-top: 12px; border: 1px solid var(--accent-warning-border); border-radius: var(--radius-control); background: var(--accent-warning-bg); }
.editor-diagnostic { min-height: 32px; padding: 6px var(--compact-padding); display: flex; align-items: center; gap: 6px; border-top: 1px solid var(--border-default); color: var(--accent-warning); background: var(--surface-secondary); font-size: 12px; }
@container structured-editor (max-width: 680px) {
  .variable-count { display: none; }
  .structured-editor-toolbar { padding-inline: 8px; gap: 4px; }
  .editor-view-switch :deep(.n-button__content), .editor-toolbar-actions :deep(.n-button__content) { font-size: 12px; }
}
@container structured-editor (max-width: 620px) {
  .toolbar-button-label { display: none; }
}
@container structured-editor (max-width: 500px) {
  .view-mode-label { display: none; }
}
</style>
