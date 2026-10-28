import { readFileSync } from 'node:fs';
import { createApp, defineComponent, h, nextTick, type Component } from 'vue';
import { NConfigProvider, NDialogProvider, NMessageProvider } from 'naive-ui';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PromptWithRelations } from '@shared/types/database';
import i18n from '../../src/renderer/i18n';
import { getThemeOverrides } from '../../src/renderer/theme';
import { usePromptLibraryFilters } from '../../src/renderer/composables/prompt/usePromptLibraryFilters';

const readRendererFile = (path: string) => readFileSync(`src/renderer/${path}`, 'utf8');

const prompt = (id: number, title: string) => ({
  id, uuid: `p${id}`, title, content: `正文 ${title}`, tags: [], variables: [], isFavorite: false, useCount: 0, isActive: true,
  createdAt: new Date(2026, 0, id), updatedAt: new Date(2026, 0, id),
}) as unknown as PromptWithRelations;

const key = (target: Element, key: string, init: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
};

describe('prompt library keyboard (#463)', () => {
  let app: ReturnType<typeof createApp> | undefined;
  let container: HTMLDivElement | undefined;
  const { filters, clear } = usePromptLibraryFilters();

  const mount = async (component: Component, props: Record<string, unknown>) => {
    container = document.createElement('div');
    document.body.appendChild(container);
    app = createApp(defineComponent({
      setup: () => () => h(NConfigProvider, { themeOverrides: getThemeOverrides('light') }, {
        default: () => h(NMessageProvider, null, {
          default: () => h(NDialogProvider, null, { default: () => h(component, props) }),
        }),
      }),
    }));
    app.use(i18n);
    i18n.global.locale.value = 'zh-CN';
    app.mount(container);
    await nextTick();
    return container;
  };

  // 三条按标题升序：Alpha、Beta（选中）、Gamma
  const mountList = async (onSelect = vi.fn()) => {
    filters.sortBy = 'title';
    filters.sortOrder = 'asc';
    const { default: PromptLibraryList } = await import('../../src/renderer/components/prompts/PromptLibraryList.vue');
    const root = await mount(PromptLibraryList, {
      prompts: [prompt(1, 'Alpha'), prompt(2, 'Beta'), prompt(3, 'Gamma')],
      categories: [],
      selectedId: 2,
      onSelect,
    });
    return {
      root,
      search: root.querySelector<HTMLInputElement>('.library__filters input')!,
      items: () => [...root.querySelectorAll<HTMLElement>('.library-item')],
    };
  };

  afterEach(() => {
    app?.unmount();
    container?.remove();
    app = undefined;
    container = undefined;
    clear();
    filters.scope = 'all';
  });

  it('clears the search on the first Esc without letting it reach the drawer, and leaves the box on the second', async () => {
    const { search } = await mountList();
    const outer = vi.fn();
    window.addEventListener('keydown', outer);
    search.focus();
    filters.query = 'alp';
    await nextTick();

    const first = key(search, 'Escape');
    expect(first.defaultPrevented).toBe(true);
    expect(filters.query).toBe('');
    expect(outer).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(search);

    key(search, 'Escape');
    expect(document.activeElement).not.toBe(search);
    expect(outer).toHaveBeenCalledTimes(1);
    window.removeEventListener('keydown', outer);
  });

  it('moves from the search into the results with ↓ and opens the first result with Enter', async () => {
    const onSelect = vi.fn();
    const { search, items } = await mountList(onSelect);
    search.focus();
    expect(key(search, 'ArrowDown').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(items()[0]);

    filters.query = 'gam';
    await nextTick();
    search.focus();
    key(search, 'Enter');
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ title: 'Gamma' }));
    // 输入法组字时的回车只是上屏
    onSelect.mockClear();
    key(search, 'Enter', { isComposing: true });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('walks the list with ↑↓ / Home / End, returns to the search from the top, and keeps one tab stop', async () => {
    const { search, items } = await mountList();
    const [alpha, beta, gamma] = items();
    // 只有选中的一条在 Tab 顺序里
    expect(items().map(item => item.tabIndex)).toEqual([-1, 0, -1]);

    beta.focus();
    key(beta, 'ArrowDown');
    expect(document.activeElement).toBe(gamma);
    key(gamma, 'ArrowDown');
    expect(document.activeElement).toBe(gamma);
    key(gamma, 'Home');
    expect(document.activeElement).toBe(alpha);
    key(alpha, 'End');
    expect(document.activeElement).toBe(gamma);
    key(gamma, 'ArrowUp');
    key(beta, 'ArrowUp');
    expect(document.activeElement).toBe(alpha);
    key(alpha, 'ArrowUp');
    expect(document.activeElement).toBe(search);
  });
});

describe('new prompt flow (#458)', () => {
  const page = readRendererFile('components/prompts/PromptPage.vue');
  const prompts = readRendererFile('pages/PromptsPage.vue');
  const header = readRendererFile('components/prompts/PromptHeader.vue');

  it('only shows the AI hint after AI filled the header, on its own line', () => {
    expect(page).toContain("const headerHint = computed(() => (isNew.value && headerSuggested.value ? t('promptPage.aiSuggestedHint') : ''))");
    expect(page).toMatch(/const fillSummaryBlanks = async \(\) => \{[\s\S]*?headerSuggested\.value = true[\s\S]*?\n\}/);
    expect(header).toMatch(/\.prompt-header__hint \{\s*flex-basis: 100%;\s*margin-left: 0;/);
  });

  it('focuses the title when a draft opens and names the draft row after it', () => {
    expect(page).toContain('if (isNew.value) void nextTick(focusTitle)');
    expect(page).toContain("draftTitle: computed(() => (isNew.value ? form.value.title.trim() : ''))");
    expect(prompts).toContain("const draftTitle = computed(() => (creating.value ? pageRef.value?.draftTitle ?? '' : ''))");
  });

  it('confirms discarding a draft once, in the workspace and in the modal alike', () => {
    expect(page).toContain('@click="requestDiscardNew"');
    expect(page).toMatch(/const requestDiscardNew = \(\) => \{\s*if \(!editor\.dirty\.value\) \{\s*emit\('discard-new'\)/);
    expect(page).toContain("title: t('promptPage.discardNewTitle')");
    // 弹窗里确认过就直接关，不再走关闭前的未保存确认
    expect(prompts).toContain('@discard-new="closeWorkspaceModal"');
    expect(prompts).toMatch(/const handleCloseWorkspaceModal = async \(\) => \{[\s\S]*?confirmDiscardChanges\(\)[\s\S]*?closeWorkspaceModal\(\)/);
  });

  it('counts category, tag and description changes on a draft as unsaved', () => {
    expect(page).toContain('hasUnsavedChanges: computed(() => editor.dirty.value)');
  });

  it('inherits the current category and favorites scope', () => {
    expect(prompts).toMatch(/createCategoryId\.value = typeof categoryId === 'number' && categories\.value\.some/);
    expect(prompts).toContain("favoriteOnCreate = filters.scope === 'favorites'");
    expect(prompts.match(/:default-category-id="createCategoryId"/g)).toHaveLength(2);
    expect(page).toMatch(/if \(isNew\.value && props\.defaultCategoryId\) \{\s*form\.value\.categoryId = props\.defaultCategoryId\s*editor\.markClean\(\)/);
    expect(prompts).toMatch(/const favoriteCreatedPrompt = async[\s\S]*?api\.prompts\.toggleFavorite\.mutate\(created\.id\)/);
  });
});
