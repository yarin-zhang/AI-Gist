import type { PromptVariable, PromptWithRelations } from '@shared/types';
import {
  createPromptDraft,
  getActivePromptVariables,
  getMissingPromptVariables,
  renderPrompt,
} from './prompt-template';

export interface RuntimePromptVariable extends Partial<PromptVariable> {
  name: string;
  type: PromptVariable['type'];
  required: boolean;
}

export function getRuntimeVariables(prompt: PromptWithRelations): RuntimePromptVariable[] {
  return getActivePromptVariables(prompt).map(variable => ({
    ...variable,
    type: variable.type as PromptVariable['type'],
  }));
}

export function createDefaultVariableValues(prompt: PromptWithRelations): Record<string, any> {
  return createPromptDraft(getRuntimeVariables(prompt));
}

export function renderPromptContent(prompt: PromptWithRelations, values: Record<string, any>): string {
  const rendered = renderPrompt(prompt, values, getRuntimeVariables(prompt));
  if (rendered.error) throw new Error(rendered.error);
  return rendered.content;
}

export function hasMissingRequiredValues(prompt: PromptWithRelations, values: Record<string, any>): boolean {
  return getMissingPromptVariables(getRuntimeVariables(prompt), values).length > 0;
}
