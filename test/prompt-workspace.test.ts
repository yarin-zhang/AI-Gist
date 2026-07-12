import { describe, expect, it } from 'vitest'
import type { PromptWithRelations, PromptVariable } from '../src/shared/types/database'
import {
  createWorkspaceDraft,
  deriveWorkspaceVariables,
  getMissingRequiredVariables,
  renderWorkspacePrompt,
} from '../src/renderer/lib/utils/prompt-workspace'

const variable = (name: string, overrides: Partial<PromptVariable> = {}): PromptVariable => ({
  uuid: `variable-${name}`,
  promptId: 1,
  name,
  type: 'text',
  required: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

const prompt = (overrides: Partial<PromptWithRelations> = {}): PromptWithRelations => ({
  id: 1,
  uuid: 'prompt-1',
  title: 'Test prompt',
  content: 'Hello {{ name }}',
  tags: [],
  variables: [variable('name')],
  isFavorite: false,
  useCount: 0,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

describe('prompt workspace rendering', () => {
  it('fills regular prompt variables while allowing whitespace in placeholders', () => {
    expect(renderWorkspacePrompt(prompt(), { name: 'Codex' }).content).toBe('Hello Codex')
  })

  it('preserves current values and supplies configured defaults', () => {
    const variables = [
      variable('name', { defaultValue: 'Guest' }),
      variable('enabled', { type: 'boolean', defaultValue: 'true' }),
    ]

    expect(createWorkspaceDraft(variables, { name: 'Yarin' })).toEqual({
      name: 'Yarin',
      enabled: true,
    })
  })

  it('reports only missing required values', () => {
    const variables = [variable('required'), variable('optional', { required: false })]
    expect(getMissingRequiredVariables(variables, { optional: '' })).toEqual(['required'])
  })

  it('derives and renders Jinja variables when no schema was saved', () => {
    const jinjaPrompt = prompt({
      content: '{% if enabled %}Hello {{ name }}{% endif %}',
      variables: [],
      isJinjaTemplate: true,
    })

    expect(deriveWorkspaceVariables(jinjaPrompt).map(item => item.name)).toEqual(['enabled', 'name'])
    expect(renderWorkspacePrompt(jinjaPrompt, { enabled: true, name: 'Codex' }).content).toBe('Hello Codex')
  })
})
