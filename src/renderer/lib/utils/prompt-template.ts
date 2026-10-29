import type { PromptVariable, PromptWithRelations } from '@shared/types/database'
import { jinjaService } from './jinja.service'

export type CanonicalPromptVariableType = 'text' | 'textarea' | 'select' | 'number' | 'boolean'

export interface EditablePromptVariable {
  id?: number
  uuid?: string
  promptId?: number
  name: string
  type: PromptVariable['type'] | string
  defaultValue?: string
  options?: string[]
  required: boolean
  placeholder?: string
  description?: string
  validation?: PromptVariable['validation']
  sortOrder?: number
}

export interface PromptTextSegment {
  kind: 'text'
  text: string
  start: number
  end: number
}

export interface PromptVariableSegment {
  kind: 'variable'
  raw: string
  name: string
  /** 写成 `{{名称:默认值}}` 时冒号后面的默认值；没写冒号时为 undefined */
  defaultValue?: string
  /** 名称和默认值之间用的冒号（半角或全角），改名时原样保留 */
  defaultSeparator?: string
  start: number
  end: number
  occurrence: number
  firstOccurrence: boolean
}

export type PromptTemplateSegment = PromptTextSegment | PromptVariableSegment

export interface PromptTemplateDiagnostic {
  kind: 'unclosed-variable'
  start: number
  end: number
  message: string
}

export interface ParsedPromptTemplate {
  segments: PromptTemplateSegment[]
  variableNames: string[]
  occurrences: Map<string, PromptVariableSegment[]>
  /** 每个变量在正文里写的第一个非空默认值（`{{名称:默认值}}`） */
  inlineDefaults: Map<string, string>
  diagnostics: PromptTemplateDiagnostic[]
}

export interface ReconciledPromptVariables {
  active: EditablePromptVariable[]
  unused: EditablePromptVariable[]
  all: EditablePromptVariable[]
}

const PLACEHOLDER_PATTERN = /\{\{\s*([^{}\r\n]+?)\s*\}\}/g
const DEFAULT_SEPARATOR_PATTERN = /[:：]/

/**
 * 占位符里的文字拆成变量名和默认值：`{{主分支:main}}` 是变量「主分支」、默认值「main」，
 * 只按第一个冒号拆（默认值里可以再有冒号，例如 `{{时间:9:00}}`），半角、全角冒号都算。
 * 冒号前面是空的（`{{:x}}`）不算默认值写法，整段仍是变量名。
 */
function splitPlaceholder(inner: string): { name: string; defaultValue?: string; defaultSeparator?: string } {
  const match = DEFAULT_SEPARATOR_PATTERN.exec(inner)
  if (!match) return { name: inner }
  const name = inner.slice(0, match.index).trim()
  if (!name) return { name: inner }
  return { name, defaultValue: inner.slice(match.index + 1).trim(), defaultSeparator: match[0] }
}

export function parsePromptTemplate(content = ''): ParsedPromptTemplate {
  const segments: PromptTemplateSegment[] = []
  const occurrences = new Map<string, PromptVariableSegment[]>()
  const inlineDefaults = new Map<string, string>()
  const variableNames: string[] = []
  let cursor = 0
  let match: RegExpExecArray | null

  PLACEHOLDER_PATTERN.lastIndex = 0
  while ((match = PLACEHOLDER_PATTERN.exec(content))) {
    const start = match.index
    const end = start + match[0].length
    const { name, defaultValue, defaultSeparator } = splitPlaceholder(match[1].trim())
    if (!name) continue

    if (start > cursor) {
      segments.push({ kind: 'text', text: content.slice(cursor, start), start: cursor, end: start })
    }

    const nameOccurrences = occurrences.get(name) || []
    const segment: PromptVariableSegment = {
      kind: 'variable',
      raw: match[0],
      name,
      ...(defaultSeparator ? { defaultValue, defaultSeparator } : {}),
      start,
      end,
      occurrence: nameOccurrences.length,
      firstOccurrence: nameOccurrences.length === 0,
    }
    nameOccurrences.push(segment)
    occurrences.set(name, nameOccurrences)
    if (segment.firstOccurrence) variableNames.push(name)
    if (defaultValue && !inlineDefaults.has(name)) inlineDefaults.set(name, defaultValue)
    segments.push(segment)
    cursor = end
  }

  if (cursor < content.length || segments.length === 0) {
    segments.push({ kind: 'text', text: content.slice(cursor), start: cursor, end: content.length })
  }

  return {
    segments,
    variableNames,
    occurrences,
    inlineDefaults,
    diagnostics: findUnclosedVariables(content, segments),
  }
}

function findUnclosedVariables(
  content: string,
  segments: PromptTemplateSegment[]
): PromptTemplateDiagnostic[] {
  const occupied = segments
    .filter((segment): segment is PromptVariableSegment => segment.kind === 'variable')
    .map(segment => [segment.start, segment.end] as const)
  const diagnostics: PromptTemplateDiagnostic[] = []
  let offset = content.indexOf('{{')

  while (offset >= 0) {
    const insideValidPlaceholder = occupied.some(([start, end]) => offset >= start && offset < end)
    if (!insideValidPlaceholder) {
      const lineEnd = content.indexOf('\n', offset)
      diagnostics.push({
        kind: 'unclosed-variable',
        start: offset,
        end: lineEnd >= 0 ? lineEnd : content.length,
        message: 'Unclosed variable placeholder',
      })
    }
    offset = content.indexOf('{{', offset + 2)
  }

  return diagnostics
}

/**
 * 找出光标（或选区端点）正落在 `{{` 与 `}}` 之间的变量占位符。
 * 编辑器对这个占位符保留源码形态，避免输入或输入法组合过程中被替换成变量块。
 * 端点恰好在占位符边界上不算“正在编辑”。
 */
export function findEditingVariableSegment(
  segments: PromptTemplateSegment[],
  positions: number[],
): PromptVariableSegment | null {
  for (const segment of segments) {
    if (segment.kind !== 'variable') continue
    if (positions.some(position => position > segment.start && position < segment.end)) return segment
  }
  return null
}

const FENCE_LINE_PATTERN = /^[ \t]*(```|~~~)/

/**
 * Placeholders that sit on a line of their own, or inside a fenced code block, usually stand
 * for multi-line content (a diff, a log, a code snippet). Returns the start offsets of those
 * occurrences so the fill view can give them a multi-line field instead of a single-line one,
 * which would silently turn every newline into a space.
 */
export function findMultilineVariableStarts(
  content: string,
  segments: PromptTemplateSegment[] = parsePromptTemplate(content).segments,
): Set<number> {
  const starts = new Set<number>()
  const fencedLines: [number, number][] = []
  let fenceStart: number | null = null
  let lineStart = 0
  while (lineStart <= content.length) {
    const newline = content.indexOf('\n', lineStart)
    const lineEnd = newline >= 0 ? newline : content.length
    if (FENCE_LINE_PATTERN.test(content.slice(lineStart, lineEnd))) {
      if (fenceStart === null) fenceStart = lineEnd
      else {
        fencedLines.push([fenceStart, lineStart])
        fenceStart = null
      }
    }
    if (newline < 0) break
    lineStart = newline + 1
  }
  // An unterminated fence runs to the end of the document, as Markdown renders it.
  if (fenceStart !== null) fencedLines.push([fenceStart, content.length])

  for (const segment of segments) {
    if (segment.kind !== 'variable') continue
    const before = content.slice(content.lastIndexOf('\n', segment.start - 1) + 1, segment.start)
    const afterEnd = content.indexOf('\n', segment.end)
    const after = content.slice(segment.end, afterEnd >= 0 ? afterEnd : content.length)
    const ownLine = !before.trim() && !after.trim()
    const fenced = fencedLines.some(([start, end]) => segment.start > start && segment.start < end)
    if (ownLine || fenced) starts.add(segment.start)
  }
  return starts
}

/** Names of variables with at least one occurrence that calls for multi-line input. */
export function findMultilineVariableNames(content: string): Set<string> {
  const { segments } = parsePromptTemplate(content)
  const starts = findMultilineVariableStarts(content, segments)
  return new Set(segments
    .filter((segment): segment is PromptVariableSegment => segment.kind === 'variable' && starts.has(segment.start))
    .map(segment => segment.name))
}

export const hasLineBreak = (value: unknown) => typeof value === 'string' && /[\r\n]/.test(value)

export function normalizeVariableType(type: string): CanonicalPromptVariableType {
  if (type === 'textarea') return 'textarea'
  if (type === 'select') return 'select'
  if (['number', 'int', 'float'].includes(type)) return 'number'
  if (['boolean', 'bool'].includes(type)) return 'boolean'
  return 'text'
}

export function createVariable(name: string): EditablePromptVariable {
  return {
    name,
    type: 'text',
    options: [],
    defaultValue: '',
    required: true,
    placeholder: '',
    description: '',
  }
}

// A variable whose properties differ from createVariable() carries user intent and
// must survive being removed from the text; a bare name does not.
export function isVariableConfigured(variable: EditablePromptVariable): boolean {
  return variable.type !== 'text'
    || variable.required === false
    || Boolean(variable.defaultValue)
    || Boolean(variable.placeholder)
    || Boolean(variable.description)
    || Boolean(variable.options?.length)
    || Boolean(variable.validation && Object.values(variable.validation).some(value => value !== undefined && value !== ''))
}

export interface ReconcileOptions {
  /** Decides whether a variable no longer referenced by the text stays as "unused". Defaults to keeping all. */
  retainUnused?: (variable: EditablePromptVariable) => boolean
}

export function reconcilePromptVariables(
  content: string,
  variables: EditablePromptVariable[] = [],
  options: ReconcileOptions = {}
): ReconciledPromptVariables {
  return reconcileParsedVariables(parsePromptTemplate(content), variables, options)
}

function reconcileParsedVariables(
  parsed: ParsedPromptTemplate,
  variables: EditablePromptVariable[] = [],
  { retainUnused = () => true }: ReconcileOptions = {}
): ReconciledPromptVariables {
  const existing = new Map(variables.filter(variable => variable.name).map(variable => [variable.name, variable]))
  const active = parsed.variableNames.map(name => cloneVariable(existing.get(name) || createVariable(name)))
  const activeNames = new Set(parsed.variableNames)
  const unused = Array.from(existing.values())
    .filter(variable => !activeNames.has(variable.name) && retainUnused(variable))
    .map(cloneVariable)

  return { active, unused, all: [...active, ...unused] }
}

export function validateVariableName(name: string, variables: EditablePromptVariable[], currentName?: string): string | null {
  const normalized = name.trim()
  if (!normalized) return 'required'
  // 冒号用来在正文里写默认值（`{{名称:默认值}}`），不能出现在名称里
  if (/[{}:：\r\n]/.test(normalized)) return 'invalid'
  if (variables.some(variable => variable.name !== currentName && variable.name === normalized)) return 'duplicate'
  return null
}

/** 改名时保留正文里写的默认值：`{{旧名:main}}` 变成 `{{新名:main}}` */
export function replaceVariableName(content: string, previousName: string, nextName: string): string {
  return parsePromptTemplate(content).segments.map(segment => {
    if (segment.kind !== 'variable' || segment.name !== previousName) return content.slice(segment.start, segment.end)
    return segment.defaultSeparator
      ? `{{${nextName}${segment.defaultSeparator}${segment.defaultValue}}}`
      : `{{${nextName}}}`
  }).join('')
}

export function removeVariableOccurrences(content: string, name: string): string {
  return parsePromptTemplate(content).segments
    .filter(segment => segment.kind !== 'variable' || segment.name !== name)
    .map(segment => content.slice(segment.start, segment.end))
    .join('')
}

/**
 * 删除变量定义时，正文里的 `{{name}}` 变回普通文字 name，句子不会缺一块；
 * 写了默认值的（`{{name:默认值}}`）换成默认值，读起来和填好时一样
 */
export function unwrapVariableOccurrences(content: string, name: string): string {
  return parsePromptTemplate(content).segments
    .map(segment => {
      if (segment.kind !== 'variable' || segment.name !== name) return content.slice(segment.start, segment.end)
      return segment.defaultValue || name
    })
    .join('')
}

export function getActivePromptVariables(prompt: PromptWithRelations): EditablePromptVariable[] {
  if (prompt.isJinjaTemplate) {
    if (prompt.variables?.length) return prompt.variables.map(cloneVariable)
    return jinjaService.extractVariables(prompt.content || '').map(createVariable)
  }

  // 变量设置里没填默认值的，用正文里 `{{名称:默认值}}` 写的默认值兜底。只在使用时补上，
  // 不写回变量设置，以后改了正文里的默认值也不会被旧值盖住
  const parsed = parsePromptTemplate(prompt.content || '')
  return reconcileParsedVariables(parsed, prompt.variables || []).active.map(variable => {
    const inline = parsed.inlineDefaults.get(variable.name)
    return inline && isEmptyPromptValue(variable.defaultValue) ? { ...variable, defaultValue: inline } : variable
  })
}

/**
 * 填写值的初始状态：没有值的字段填上默认值。上次填写时留空、或点了「清空填写值」的字段，
 * 有默认值时同样换成默认值，不会空着被当成未填的必填项
 */
export function createPromptDraft(
  variables: EditablePromptVariable[],
  current: Record<string, any> = {}
): Record<string, any> {
  const next = { ...current }
  variables.forEach(variable => {
    const isBoolean = normalizeVariableType(variable.type) === 'boolean'
    if (next[variable.name] !== undefined && (isBoolean || !isEmptyPromptValue(next[variable.name]) || isEmptyPromptValue(variable.defaultValue))) return
    next[variable.name] = isBoolean
      ? variable.defaultValue === 'true'
      : variable.defaultValue ?? ''
  })
  return next
}

/**
 * 变量的默认值（或类型）改了以后同步填写值：还空着、或者仍是旧默认值的字段换成新默认值，
 * 用户自己填过的值不动。没有需要更新的字段时返回 null。
 */
export function applyChangedDefaults(
  previous: EditablePromptVariable[],
  next: EditablePromptVariable[],
  values: Record<string, any>
): Record<string, any> | null {
  const before = new Map(previous.map(variable => [variable.name, variable]))
  const result = { ...values }
  let changed = false
  next.forEach(variable => {
    const old = before.get(variable.name)
    if (!old) return
    const oldDefault = createPromptDraft([old])[variable.name]
    const newDefault = createPromptDraft([variable])[variable.name]
    const current = values[variable.name]
    if (oldDefault === newDefault || current === newDefault) return
    if (!isEmptyPromptValue(current) && String(current) !== String(oldDefault)) return
    result[variable.name] = newDefault
    changed = true
  })
  return changed ? result : null
}

export function isEmptyPromptValue(value: any): boolean {
  return value === undefined || value === null || (typeof value === 'string' && !value.trim())
}

export function getMissingPromptVariables(
  variables: EditablePromptVariable[],
  values: Record<string, any>
): string[] {
  // 字段空着但有默认值的，渲染时用默认值，不算未填
  return variables
    .filter(variable => variable.required && isEmptyPromptValue(values[variable.name]) && isEmptyPromptValue(variable.defaultValue))
    .map(variable => variable.name)
}

/** 实际写进结果的值：填写值为空时用默认值 */
function renderVariableValue(variable: EditablePromptVariable | undefined, value: any): string {
  return String(isEmptyPromptValue(value) ? variable?.defaultValue ?? '' : value)
}

/** 渲染后会变成空白的变量（值和默认值都为空），按模板中首次出现的顺序返回。 */
export function getUnfilledPromptVariables(
  variables: EditablePromptVariable[],
  values: Record<string, any>
): EditablePromptVariable[] {
  return variables.filter(variable => !renderVariableValue(variable, values[variable.name]).trim())
}

export type PromptResultSegment =
  | { kind: 'text'; text: string }
  | { kind: 'unfilled'; name: string; raw: string; required: boolean }

/**
 * 「最终结果」的展示分段：已填写的变量直接替换成值，未填写的保留为占位分段，
 * 让界面能把它们标出来，而不是像 renderPrompt 那样替换成空字符串。
 * Jinja 模板由模板引擎整体渲染，没有可对应的占位位置，因此只返回整段文本。
 */
export function buildPromptResultSegments(
  prompt: PromptWithRelations,
  values: Record<string, any>,
  variables = getActivePromptVariables(prompt)
): PromptResultSegment[] {
  const rendered = renderPrompt(prompt, values, variables)
  if (prompt.isJinjaTemplate || rendered.error) return [{ kind: 'text', text: rendered.content }]

  const content = prompt.content || ''
  const variableByName = new Map(variables.map(variable => [variable.name, variable]))
  const segments: PromptResultSegment[] = []
  const pushText = (text: string) => {
    if (!text) return
    const last = segments[segments.length - 1]
    if (last?.kind === 'text') last.text += text
    else segments.push({ kind: 'text', text })
  }

  parsePromptTemplate(content).segments.forEach(segment => {
    const variable = segment.kind === 'variable' ? variableByName.get(segment.name) : undefined
    if (segment.kind === 'text' || !variable) {
      pushText(content.slice(segment.start, segment.end))
      return
    }
    const value = renderVariableValue(variable, values[segment.name])
    if (value.trim()) pushText(value)
    else segments.push({ kind: 'unfilled', name: segment.name, raw: segment.raw, required: variable.required })
  })
  return segments
}

/**
 * Jinja 模板里 list / dict 类型的变量在界面上按文本填写，渲染前换成真正的数组 / 对象，
 * 否则 `{% for item in items %}` 会把字符串逐字符展开。
 * list：可以填 JSON 数组，否则按行拆分（每行一项，去掉首尾空白和空行）；
 * dict：只接受 JSON 对象，解析不了时保持原文。
 */
export function parseJinjaVariableValue(type: string, value: any): any {
  if (typeof value !== 'string') return value
  const text = value.trim()
  if (type === 'list') {
    if (text.startsWith('[')) {
      try {
        const parsed = JSON.parse(text)
        if (Array.isArray(parsed)) return parsed
      } catch {
        // 不是合法的 JSON 数组，按行拆分
      }
    }
    return text ? text.split(/\r?\n/).map(line => line.trim()).filter(Boolean) : []
  }
  if (type === 'dict' && text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
    } catch {
      // 解析失败时保持原文
    }
  }
  return value
}

function buildJinjaContext(values: Record<string, any>, variables: EditablePromptVariable[]): Record<string, any> {
  const context = { ...values }
  variables.forEach(variable => {
    // 和普通模板一致：填写值为空时用默认值
    if (isEmptyPromptValue(context[variable.name]) && !isEmptyPromptValue(variable.defaultValue)) {
      context[variable.name] = variable.defaultValue
    }
    const type = String(variable.type)
    if ((type === 'list' || type === 'dict') && variable.name in context) {
      context[variable.name] = parseJinjaVariableValue(type, context[variable.name])
    }
  })
  return context
}

export function renderPrompt(
  prompt: PromptWithRelations,
  values: Record<string, any>,
  variables = getActivePromptVariables(prompt)
): { content: string; error?: string } {
  try {
    if (prompt.isJinjaTemplate) return { content: jinjaService.render(prompt.content || '', buildJinjaContext(values, variables)) }

    const variableNames = new Set(variables.map(variable => variable.name))
    const content = parsePromptTemplate(prompt.content || '').segments.map(segment => {
      if (segment.kind === 'text' || !variableNames.has(segment.name)) {
        return (prompt.content || '').slice(segment.start, segment.end)
      }
      return renderVariableValue(variables.find(item => item.name === segment.name), values[segment.name])
    }).join('')
    return { content }
  } catch (error) {
    return {
      content: prompt.content || '',
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

type Translate = (key: string, named?: Record<string, unknown>) => string

/** Nunjucks 报错里的位置「[Line 3, Column 4]」，行号从 1 开始；缺了结尾、写到文件末尾这类报错没有位置 */
export function readTemplateErrorLine(error: string | undefined): number | null {
  const line = Number(error?.match(/\[Line (\d+)(?:, Column \d+)?\]/i)?.[1])
  return line > 0 ? line : null
}

/**
 * 模板渲染失败时给用户看的一句话：第几行出了问题、该检查什么。
 * Nunjucks 的原始报错（unexpected token、parseIf…）用户看不懂，只在控制台里留着。
 */
export function describeTemplateError(error: string | undefined, t: Translate): string {
  const line = readTemplateErrorLine(error)
  return line ? t('promptWorkspace.renderFailedAtLine', { line }) : t('promptWorkspace.renderFailed')
}

export const isNumberPromptVariable = (type: string) => normalizeVariableType(type) === 'number'
export const isBooleanPromptVariable = (type: string) => normalizeVariableType(type) === 'boolean'

function cloneVariable<T extends EditablePromptVariable>(variable: T): T {
  return {
    ...variable,
    options: variable.options ? [...variable.options] : undefined,
    validation: variable.validation ? { ...variable.validation } : undefined,
  }
}
