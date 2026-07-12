import { describe, expect, it } from 'vitest';
import type { PromptWithRelations } from '../../src/shared/types/database';
import {
  createDefaultVariableValues,
  getRuntimeVariables,
  hasMissingRequiredValues,
  renderPromptContent,
} from '../../src/renderer/lib/utils/prompt-runtime';

function prompt(overrides: Partial<PromptWithRelations>): PromptWithRelations {
  return {
    id: 1,
    uuid: 'prompt-1',
    title: 'Test',
    content: '',
    tags: [],
    isFavorite: false,
    useCount: 0,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('prompt shortcut runtime', () => {
  it('renders regular variables with whitespace-tolerant placeholders', () => {
    const source = prompt({
      content: 'Hello {{ name }}, topic: {{topic}}',
      variables: [
        { uuid: 'v1', promptId: 1, name: 'name', type: 'text', required: true, defaultValue: 'Ada', createdAt: new Date(), updatedAt: new Date() },
        { uuid: 'v2', promptId: 1, name: 'topic', type: 'text', required: true, defaultValue: 'AI', createdAt: new Date(), updatedAt: new Date() },
      ],
    });
    const values = createDefaultVariableValues(source);
    expect(renderPromptContent(source, values)).toBe('Hello Ada, topic: AI');
    expect(hasMissingRequiredValues(source, values)).toBe(false);
  });

  it('extracts and renders Jinja variables when no stored variables exist', () => {
    const source = prompt({ content: 'Summarize {{ subject }} in {{ count }} points.', isJinjaTemplate: true });
    expect(getRuntimeVariables(source).map(variable => variable.name)).toEqual(['subject', 'count']);
    expect(hasMissingRequiredValues(source, { subject: 'shortcuts', count: '' })).toBe(true);
    expect(renderPromptContent(source, { subject: 'shortcuts', count: 3 })).toBe('Summarize shortcuts in 3 points.');
  });
});
