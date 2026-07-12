import type { PromptVariable, PromptWithRelations } from '@shared/types';
import { jinjaService } from './jinja.service';

export interface RuntimePromptVariable extends Partial<PromptVariable> {
  name: string;
  type: PromptVariable['type'];
  required: boolean;
}

export function getRuntimeVariables(prompt: PromptWithRelations): RuntimePromptVariable[] {
  if (prompt.variables?.length) {
    return prompt.variables.map(variable => ({ ...variable }));
  }
  if (!prompt.isJinjaTemplate) return [];
  return jinjaService.extractVariables(prompt.content || '').map(name => ({
    name,
    type: 'text',
    required: true,
    defaultValue: '',
  }));
}

export function createDefaultVariableValues(prompt: PromptWithRelations): Record<string, any> {
  return Object.fromEntries(getRuntimeVariables(prompt).map(variable => [
    variable.name,
    variable.type === 'boolean' || variable.type === 'bool'
      ? variable.defaultValue === 'true'
      : variable.defaultValue ?? '',
  ]));
}

export function renderPromptContent(prompt: PromptWithRelations, values: Record<string, any>): string {
  if (prompt.isJinjaTemplate) return jinjaService.render(prompt.content || '', values);
  let content = prompt.content || '';
  for (const [name, value] of Object.entries(values)) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    content = content.replace(new RegExp(`{{\\s*${escaped}\\s*}}`, 'g'), String(value ?? ''));
  }
  return content;
}

export function hasMissingRequiredValues(prompt: PromptWithRelations, values: Record<string, any>): boolean {
  return getRuntimeVariables(prompt).some(variable => {
    if (!variable.required) return false;
    const value = values[variable.name];
    return value === undefined || value === null || String(value).trim() === '';
  });
}
