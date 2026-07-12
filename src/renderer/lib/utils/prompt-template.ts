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
  diagnostics: PromptTemplateDiagnostic[]
}

export interface ReconciledPromptVariables {
  active: EditablePromptVariable[]
  unused: EditablePromptVariable[]
  all: EditablePromptVariable[]
}

const PLACEHOLDER_PATTERN = /\{\{\s*([^{}\r\n]+?)\s*\}\}/g

export function parsePromptTemplate(content = ''): ParsedPromptTemplate {
  const segments: PromptTemplateSegment[] = []
  const occurrences = new Map<string, PromptVariableSegment[]>()
  const variableNames: string[] = []
  let cursor = 0
  let match: RegExpExecArray | null

  PLACEHOLDER_PATTERN.lastIndex = 0
  while ((match = PLACEHOLDER_PATTERN.exec(content))) {
    const start = match.index
    const end = start + match[0].length
    const name = match[1].trim()
    if (!name) continue

    if (start > cursor) {
      segments.push({ kind: 'text', text: content.slice(cursor, start), start: cursor, end: start })
    }

    const nameOccurrences = occurrences.get(name) || []
    const segment: PromptVariableSegment = {
      kind: 'variable',
      raw: match[0],
      name,
      start,
      end,
      occurrence: nameOccurrences.length,
      firstOccurrence: nameOccurrences.length === 0,
    }
    nameOccurrences.push(segment)
    occurrences.set(name, nameOccurrences)
    if (segment.firstOccurrence) variableNames.push(name)
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

export function reconcilePromptVariables(
  content: string,
  variables: EditablePromptVariable[] = []
): ReconciledPromptVariables {
  const parsed = parsePromptTemplate(content)
  const existing = new Map(variables.filter(variable => variable.name).map(variable => [variable.name, variable]))
  const active = parsed.variableNames.map(name => cloneVariable(existing.get(name) || createVariable(name)))
  const activeNames = new Set(parsed.variableNames)
  const unused = variables
    .filter(variable => variable.name && !activeNames.has(variable.name))
    .map(cloneVariable)

  return { active, unused, all: [...active, ...unused] }
}

export function validateVariableName(name: string, variables: EditablePromptVariable[], currentName?: string): string | null {
  const normalized = name.trim()
  if (!normalized) return 'required'
  if (/[{}\r\n]/.test(normalized)) return 'invalid'
  if (variables.some(variable => variable.name !== currentName && variable.name === normalized)) return 'duplicate'
  return null
}

export function replaceVariableName(content: string, previousName: string, nextName: string): string {
  return parsePromptTemplate(content).segments.map(segment => (
    segment.kind === 'variable' && segment.name === previousName
      ? `{{${nextName}}}`
      : content.slice(segment.start, segment.end)
  )).join('')
}

export function removeVariableOccurrences(content: string, name: string): string {
  return parsePromptTemplate(content).segments
    .filter(segment => segment.kind !== 'variable' || segment.name !== name)
    .map(segment => content.slice(segment.start, segment.end))
    .join('')
}

export function getActivePromptVariables(prompt: PromptWithRelations): EditablePromptVariable[] {
  if (prompt.isJinjaTemplate) {
    if (prompt.variables?.length) return prompt.variables.map(cloneVariable)
    return jinjaService.extractVariables(prompt.content || '').map(createVariable)
  }

  return reconcilePromptVariables(prompt.content || '', prompt.variables || []).active
}

export function createPromptDraft(
  variables: EditablePromptVariable[],
  current: Record<string, any> = {}
): Record<string, any> {
  const next = { ...current }
  variables.forEach(variable => {
    if (next[variable.name] !== undefined) return
    next[variable.name] = normalizeVariableType(variable.type) === 'boolean'
      ? variable.defaultValue === 'true'
      : variable.defaultValue ?? ''
  })
  return next
}

export function isEmptyPromptValue(value: any): boolean {
  return value === undefined || value === null || (typeof value === 'string' && !value.trim())
}

export function getMissingPromptVariables(
  variables: EditablePromptVariable[],
  values: Record<string, any>
): string[] {
  return variables
    .filter(variable => variable.required && isEmptyPromptValue(values[variable.name]))
    .map(variable => variable.name)
}

export function renderPrompt(
  prompt: PromptWithRelations,
  values: Record<string, any>,
  variables = getActivePromptVariables(prompt)
): { content: string; error?: string } {
  try {
    if (prompt.isJinjaTemplate) return { content: jinjaService.render(prompt.content || '', values) }

    const variableNames = new Set(variables.map(variable => variable.name))
    const content = parsePromptTemplate(prompt.content || '').segments.map(segment => {
      if (segment.kind === 'text' || !variableNames.has(segment.name)) {
        return (prompt.content || '').slice(segment.start, segment.end)
      }
      const variable = variables.find(item => item.name === segment.name)
      return String(values[segment.name] ?? variable?.defaultValue ?? '')
    }).join('')
    return { content }
  } catch (error) {
    return {
      content: prompt.content || '',
      error: error instanceof Error ? error.message : String(error),
    }
  }
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
