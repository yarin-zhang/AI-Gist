import type { PromptVariable, PromptWithRelations } from '@shared/types/database'
import { jinjaService } from './jinja.service'

export function deriveWorkspaceVariables(prompt: PromptWithRelations): PromptVariable[] {
  if (prompt.variables?.length) return prompt.variables
  if (!prompt.isJinjaTemplate) return []

  return jinjaService.extractVariables(prompt.content).map((name, index) => ({
    uuid: `derived-${prompt.id ?? 'draft'}-${index}`,
    promptId: prompt.id || 0,
    name,
    type: 'text',
    required: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  }))
}

export function createWorkspaceDraft(
  variables: PromptVariable[],
  current: Record<string, any> = {}
): Record<string, any> {
  const next = { ...current }
  variables.forEach(variable => {
    if (next[variable.name] !== undefined) return
    if (isBooleanVariable(variable.type)) next[variable.name] = variable.defaultValue === 'true'
    else next[variable.name] = variable.defaultValue ?? ''
  })
  return next
}

export function getMissingRequiredVariables(
  variables: PromptVariable[],
  draft: Record<string, any>
): string[] {
  return variables
    .filter(variable => variable.required && isEmptyWorkspaceValue(draft[variable.name]))
    .map(variable => variable.name)
}

export function renderWorkspacePrompt(
  prompt: PromptWithRelations,
  draft: Record<string, any>,
  variables = deriveWorkspaceVariables(prompt)
): { content: string; error?: string } {
  try {
    if (prompt.isJinjaTemplate) {
      return { content: jinjaService.render(prompt.content, draft) }
    }

    const content = variables.reduce((result, variable) => {
      const value = draft[variable.name] ?? variable.defaultValue ?? ''
      const variableName = escapeRegExp(variable.name)
      return result.replace(new RegExp(`\\{\\{\\s*${variableName}\\s*\\}\\}`, 'g'), String(value))
    }, prompt.content)

    return { content }
  } catch (error) {
    return {
      content: prompt.content,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export const isNumberVariable = (type: string) => ['number', 'int', 'float'].includes(type)
export const isBooleanVariable = (type: string) => ['boolean', 'bool'].includes(type)
export const isEmptyWorkspaceValue = (value: any) =>
  value === undefined || value === null || (typeof value === 'string' && !value.trim())

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
