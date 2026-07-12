import type { PromptVariable, PromptWithRelations } from '@shared/types/database'
import {
  createPromptDraft,
  getActivePromptVariables,
  getMissingPromptVariables,
  isBooleanPromptVariable,
  isEmptyPromptValue,
  isNumberPromptVariable,
  renderPrompt,
} from './prompt-template'

export function deriveWorkspaceVariables(prompt: PromptWithRelations): PromptVariable[] {
  return getActivePromptVariables(prompt).map((variable, index) => ({
    ...variable,
    uuid: variable.uuid || `derived-${prompt.id ?? 'draft'}-${index}`,
    promptId: variable.promptId ?? prompt.id ?? 0,
    type: variable.type as PromptVariable['type'],
    createdAt: new Date(),
    updatedAt: new Date(),
  }))
}

export function createWorkspaceDraft(
  variables: PromptVariable[],
  current: Record<string, any> = {}
): Record<string, any> {
  return createPromptDraft(variables, current)
}

export function getMissingRequiredVariables(
  variables: PromptVariable[],
  draft: Record<string, any>
): string[] {
  return getMissingPromptVariables(variables, draft)
}

export function renderWorkspacePrompt(
  prompt: PromptWithRelations,
  draft: Record<string, any>,
  variables = deriveWorkspaceVariables(prompt)
): { content: string; error?: string } {
  return renderPrompt(prompt, draft, variables)
}

export const isNumberVariable = isNumberPromptVariable
export const isBooleanVariable = isBooleanPromptVariable
export const isEmptyWorkspaceValue = isEmptyPromptValue
