import { afterEach, describe, expect, it } from 'vitest';
import type { PromptWithRelations } from '@shared/types/database';
import { diffText, summarizePromptChange, tokenizeForDiff } from '@renderer/lib/utils/text-diff';
import {
  collectPromptTags,
  countActiveFilters,
  createDefaultLibraryFilters,
  filterPromptLibrary,
} from '@renderer/lib/utils/prompt-library';
import {
  createEditorForm,
  findDuplicateTitle,
  generateAutoTitle,
  serializeVariablesForSave,
  snapshotEditorForm,
} from '@renderer/lib/utils/prompt-editor';
import { countPromptUsageToday, getLastUsedValues } from '@renderer/lib/utils/prompt-usage';

const prompt = (overrides: Partial<PromptWithRelations>): PromptWithRelations => ({
  uuid: `p-${overrides.id}`,
  title: '',
  content: '',
  tags: [],
  isFavorite: false,
  useCount: 0,
  isActive: true,
  createdAt: new Date('2026-10-01T00:00:00Z'),
  updatedAt: new Date('2026-10-01T00:00:00Z'),
  ...overrides,
} as PromptWithRelations);

describe('text diff', () => {
  it('keeps variable placeholders as whole tokens', () => {
    expect(tokenizeForDiff('用 {{语气}} 写')).toContain('{{语气}}');
  });

  it('marks inserted and deleted words for Chinese text', () => {
    const segments = diffText('每部分尽量简短', '每部分不超过 5 条');
    expect(segments.some(segment => segment.type === 'delete' && segment.value.includes('简短'))).toBe(true);
    expect(segments.some(segment => segment.type === 'insert' && segment.value.includes('5'))).toBe(true);
    expect(segments.filter(segment => segment.type !== 'insert').map(segment => segment.value).join('')).toBe('每部分尽量简短');
    expect(segments.filter(segment => segment.type !== 'delete').map(segment => segment.value).join('')).toBe('每部分不超过 5 条');
  });

  it('summarizes line and variable changes between versions', () => {
    const summary = summarizePromptChange('请为 {{项目}} 写周报\n尽量简短', '请为 {{项目}} 写周报，读者是 {{受众}}\n每部分不超过 5 条\n加上风险');
    expect(summary.addedLines).toBe(3);
    expect(summary.removedLines).toBe(2);
    expect(summary.addedVariables).toEqual(['受众']);
    expect(summary.removedVariables).toEqual([]);
  });
});

describe('prompt library filters', () => {
  const prompts = [
    prompt({ id: 1, title: '周报生成器', tags: ['周报', '职场'], categoryId: 1, isFavorite: true, useCount: 48, createdAt: new Date('2026-10-01'), updatedAt: new Date('2026-10-24') }),
    prompt({ id: 2, title: '代码审查助手', tags: ['编程'], categoryId: 2, useCount: 36, createdAt: new Date('2026-10-05'), updatedAt: new Date('2026-10-20') }),
    prompt({ id: 3, title: '会议纪要整理', content: '主题 {{会议主题}}', tags: 'mtg', createdAt: new Date('2026-10-10'), updatedAt: new Date('2026-10-02'), variables: [{ name: '会议主题' } as never] }),
  ];

  it('sorts by creation time by default and filters by scope', () => {
    const filters = createDefaultLibraryFilters();
    expect(filterPromptLibrary(prompts, filters).map(item => item.id)).toEqual([3, 2, 1]);
    expect(filterPromptLibrary(prompts, { ...filters, scope: 'favorites' }).map(item => item.id)).toEqual([1]);
    expect(filterPromptLibrary(prompts, { ...filters, scope: 'recent', sortBy: 'title' }).map(item => item.id)).toEqual([1, 2, 3]);
  });

  it('searches and filters the whole library before taking the most recent prompts', () => {
    // 14 条按更新时间从新到旧排列，只有最旧的一条标题含 Weekly，不在最近 12 条里
    const many = Array.from({ length: 14 }, (_, index) => prompt({
      id: 100 + index,
      title: index === 13 ? 'Weekly report' : `Prompt ${index}`,
      categoryId: index >= 12 ? 9 : 1,
      updatedAt: new Date(Date.UTC(2026, 9, 27 - index)),
    }));
    const filters = { ...createDefaultLibraryFilters(), scope: 'recent' as const };
    expect(filterPromptLibrary(many, filters)).toHaveLength(12);
    expect(filterPromptLibrary(many, { ...filters, query: 'weekly' }).map(item => item.id)).toEqual([113]);
    expect(filterPromptLibrary(many, { ...filters, categoryId: 9 }).map(item => item.id)).toEqual([112, 113]);
  });

  it('applies the chosen sort direction outside the recent scope', () => {
    const filters = createDefaultLibraryFilters();
    expect(filterPromptLibrary(prompts, { ...filters, sortOrder: 'asc' }).map(item => item.id)).toEqual([1, 2, 3]);
    expect(filterPromptLibrary(prompts, { ...filters, sortBy: 'usage', sortOrder: 'desc' }).map(item => item.id)).toEqual([1, 2, 3]);
    expect(filterPromptLibrary(prompts, { ...filters, sortBy: 'usage', sortOrder: 'asc' }).map(item => item.id)).toEqual([3, 2, 1]);
    expect(filterPromptLibrary(prompts, { ...filters, scope: 'recent', sortBy: 'created', sortOrder: 'asc' }).map(item => item.id)).toEqual([1, 2, 3]);
  });

  it('filters by category, uncategorized and tags', () => {
    const filters = createDefaultLibraryFilters();
    expect(filterPromptLibrary(prompts, { ...filters, categoryId: 2 }).map(item => item.id)).toEqual([2]);
    expect(filterPromptLibrary(prompts, { ...filters, categoryId: 'none' }).map(item => item.id)).toEqual([3]);
    expect(filterPromptLibrary(prompts, { ...filters, tags: ['周报', '职场'] }).map(item => item.id)).toEqual([1]);
    expect(countActiveFilters({ ...filters, categoryId: 1, tags: ['周报'] })).toBe(2);
  });

  it('searches titles, content, tags and variable names', () => {
    const filters = createDefaultLibraryFilters();
    expect(filterPromptLibrary(prompts, { ...filters, query: '会议主题' }).map(item => item.id)).toEqual([3]);
    expect(filterPromptLibrary(prompts, { ...filters, query: '职场' }).map(item => item.id)).toEqual([1]);
    expect(collectPromptTags(prompts)[0]).toEqual({ name: 'mtg', count: 1 });
  });
});

describe('prompt editor helpers', () => {
  it('normalizes stored prompts into an editable form', () => {
    const form = createEditorForm(prompt({
      id: 9,
      title: 'SQL',
      tags: 'a, b',
      variables: [{ name: '语气', type: 'select', options: '正式,简洁' as never, required: false } as never],
    }));
    expect(form.tags).toEqual(['a', 'b']);
    expect(form.variables[0]).toMatchObject({ name: '语气', type: 'select', options: ['正式', '简洁'], required: false });
  });

  it('ignores variable-only changes when snapshotting without variables', () => {
    const form = createEditorForm(prompt({ id: 1, content: 'x' }));
    const withVariable = { ...form, variables: [{ name: 'v', type: 'text', required: true }] };
    expect(snapshotEditorForm(withVariable, false)).toBe(snapshotEditorForm(form, false));
    expect(snapshotEditorForm(withVariable)).not.toBe(snapshotEditorForm(form));
  });

  it('derives titles and finds duplicates without renaming them (#436)', () => {
    expect(generateAutoTitle('第一行内容\n第二行', '未命名')).toBe('第一行内容');
    expect(generateAutoTitle('', '未命名')).toBe('未命名');
    // 变量语法去掉，只留变量名；第一行没字就往下找
    expect(generateAutoTitle('\n请审查 {{ language }} 代码', '未命名')).toBe('请审查 language 代码');
    expect(generateAutoTitle('a'.repeat(40), '未命名')).toBe(`${'a'.repeat(30)}…`);
    expect(findDuplicateTitle('周报', [{ id: 1, title: '周报' }], 1)).toBeUndefined();
    expect(findDuplicateTitle('周报', [{ id: 1, title: '周报' }], 2)).toEqual({ id: 1, title: '周报' });
    expect(findDuplicateTitle(' 周报 ', [{ id: 1, title: '周报 ' }])).toEqual({ id: 1, title: '周报 ' });
    expect(findDuplicateTitle('周报', [{ id: 1, title: '周报（2）' }])).toBeUndefined();
  });

  it('keeps options only for select variables when saving', () => {
    const form = createEditorForm();
    form.variables = [
      { name: '语气', type: 'select', options: ['正式', ' '], required: true },
      { name: '项目', type: 'text', options: ['ignored'], required: true },
      { name: '', type: 'text', required: true },
    ];
    expect(serializeVariablesForSave(form)).toEqual([
      expect.objectContaining({ name: '语气', options: ['正式'] }),
      expect.objectContaining({ name: '项目', options: undefined }),
    ]);
  });
});

describe('prompt usage helpers', () => {
  afterEach(() => localStorage.clear());

  it('returns the last used values and counts today\'s copies', () => {
    const now = new Date(2026, 9, 27, 12);
    localStorage.setItem('prompt_history_1', JSON.stringify([
      { date: new Date(2026, 9, 27, 10).toISOString(), content: 'a', variables: { 项目: 'AI Gist 2.2' } },
      { date: new Date(2026, 9, 20, 10).toISOString(), content: 'b', variables: { 项目: 'AI Gist 2.1' } },
    ]));
    localStorage.setItem('prompt_history_2', JSON.stringify([
      { date: new Date(2026, 9, 27, 8).toISOString(), content: 'c', variables: {} },
    ]));
    localStorage.setItem('unrelated', '[]');

    expect(getLastUsedValues(1)).toEqual({ 项目: 'AI Gist 2.2' });
    expect(getLastUsedValues(3)).toEqual({});
    expect(countPromptUsageToday(now)).toBe(2);
  });
});
