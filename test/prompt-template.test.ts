import { describe, expect, it } from 'vitest'
import type { PromptWithRelations } from '../src/shared/types/database'
import {
  createPromptDraft,
  getActivePromptVariables,
  getMissingPromptVariables,
  normalizeVariableType,
  parsePromptTemplate,
  reconcilePromptVariables,
  removeVariableOccurrences,
  renderPrompt,
  replaceVariableName,
} from '../src/renderer/lib/utils/prompt-template'

const prompt = (overrides: Partial<PromptWithRelations> = {}): PromptWithRelations => ({
  id: 1,
  uuid: 'prompt-1',
  title: 'Template',
  content: 'Hello {{name}}',
  tags: [],
  variables: [],
  isFavorite: false,
  useCount: 0,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

describe('prompt template core', () => {
  it('parses Unicode, whitespace and repeated placeholders in document order', () => {
    const parsed = parsePromptTemplate('请让 {{ 角色 }} 向 {{name}} 介绍 {{角色}}。')
    expect(parsed.variableNames).toEqual(['角色', 'name'])
    expect(parsed.occurrences.get('角色')).toHaveLength(2)
    expect(parsed.segments.filter(segment => segment.kind === 'variable')).toMatchObject([
      { name: '角色', occurrence: 0, firstOccurrence: true },
      { name: 'name', occurrence: 0, firstOccurrence: true },
      { name: '角色', occurrence: 1, firstOccurrence: false },
    ])
  })

  it('reports unclosed placeholders without changing their text', () => {
    const content = 'Hello {{name\nNext line'
    const parsed = parsePromptTemplate(content)
    expect(parsed.diagnostics).toHaveLength(1)
    expect(parsed.segments).toEqual([{ kind: 'text', text: content, start: 0, end: content.length }])
  })

  it('reconciles active variables while retaining unused configurations', () => {
    const reconciled = reconcilePromptVariables('Hello {{name}} and {{topic}}', [
      { name: 'name', type: 'textarea', required: false, description: 'Name hint' },
      { name: 'old', type: 'select', required: true, options: ['A'] },
    ])
    expect(reconciled.active).toMatchObject([
      { name: 'name', type: 'textarea', required: false, description: 'Name hint' },
      { name: 'topic', type: 'text', required: true },
    ])
    expect(reconciled.unused).toMatchObject([{ name: 'old' }])
  })

  it('renames and removes every occurrence atomically', () => {
    const content = '{{ name }} greets {{name}} and {{other}}'
    expect(replaceVariableName(content, 'name', '角色')).toBe('{{角色}} greets {{角色}} and {{other}}')
    expect(removeVariableOccurrences(content, 'name')).toBe(' greets  and {{other}}')
  })

  it('normalizes legacy types and creates typed defaults', () => {
    expect(normalizeVariableType('int')).toBe('number')
    expect(normalizeVariableType('bool')).toBe('boolean')
    expect(createPromptDraft([
      { name: 'count', type: 'number', required: true, defaultValue: '0' },
      { name: 'enabled', type: 'boolean', required: true, defaultValue: 'true' },
    ])).toEqual({ count: '0', enabled: true })
  })

  it('treats zero and false as filled required values', () => {
    const variables = [
      { name: 'count', type: 'number', required: true },
      { name: 'enabled', type: 'boolean', required: true },
      { name: 'subject', type: 'text', required: true },
    ]
    expect(getMissingPromptVariables(variables, { count: 0, enabled: false, subject: '' })).toEqual(['subject'])
  })

  it('derives only referenced variables for regular prompts and renders repeated values', () => {
    const source = prompt({
      content: '{{name}} / {{ name }}',
      variables: [
        { uuid: 'v1', promptId: 1, name: 'name', type: 'text', required: true, createdAt: new Date(), updatedAt: new Date() },
        { uuid: 'v2', promptId: 1, name: 'unused', type: 'text', required: true, createdAt: new Date(), updatedAt: new Date() },
      ],
    })
    expect(getActivePromptVariables(source).map(variable => variable.name)).toEqual(['name'])
    expect(renderPrompt(source, { name: 'Ada' }).content).toBe('Ada / Ada')
  })
})
