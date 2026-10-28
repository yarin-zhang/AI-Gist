import { readFileSync } from 'node:fs';
import { createApp, defineComponent, h, nextTick, reactive, type Component } from 'vue';
import { NConfigProvider, NDialogProvider, NMessageProvider } from 'naive-ui';
import { afterEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../src/renderer/i18n';
import { getThemeOverrides } from '../../src/renderer/theme';
import { handleEscapeKey, hasOpenFloatingLayer, isEscapeConsumed } from '../../src/renderer/lib/utils/escape-layers';

const createCategory = vi.fn();
vi.mock('../../src/renderer/lib/api', () => ({
  api: { categories: { create: { mutate: (...args: unknown[]) => createCategory(...args) } } },
}));

const readRendererFile = (path: string) => readFileSync(`src/renderer/${path}`, 'utf8');

const escape = (init: KeyboardEventInit = {}) => new KeyboardEvent('keydown', { key: 'Escape', cancelable: true, bubbles: true, ...init });

describe('Esc layers (#420)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  const follower = (html: string) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'v-binder-follower-content';
    wrapper.innerHTML = html;
    document.body.appendChild(wrapper);
  };

  it('treats an open dropdown, select menu or popconfirm as the top layer', () => {
    expect(hasOpenFloatingLayer()).toBe(false);
    follower('<div class="n-dropdown-menu n-popover-shared"></div>');
    expect(hasOpenFloatingLayer()).toBe(true);
  });

  it('ignores tooltips, menus that are fading out and menus hidden with v-show', () => {
    follower('<div class="n-popover n-tooltip"></div>');
    follower('<div class="n-dropdown-menu popover-transition-leave-active popover-transition-leave-to"></div>');
    follower('<div class="n-base-select-menu" style="display: none;"></div>');
    expect(hasOpenFloatingLayer()).toBe(false);
  });

  it('treats an open image preview as the top layer', () => {
    const preview = document.createElement('div');
    preview.className = 'n-image-preview-container';
    document.body.appendChild(preview);
    expect(hasOpenFloatingLayer()).toBe(true);
  });

  it('counts an Esc as used when an inner control prevented it or an IME is composing', () => {
    expect(isEscapeConsumed(escape())).toBe(false);
    const prevented = escape();
    prevented.preventDefault();
    expect(isEscapeConsumed(prevented)).toBe(true);
    expect(isEscapeConsumed(escape({ isComposing: true }))).toBe(true);
    expect(isEscapeConsumed(escape({ keyCode: 229 }))).toBe(true);
  });

  it('lets inline inputs cancel on Esc but leaves IME composition alone', () => {
    const cancel = vi.fn();
    const composing = escape({ isComposing: true });
    handleEscapeKey(composing, cancel);
    expect(cancel).not.toHaveBeenCalled();
    expect(composing.defaultPrevented).toBe(false);

    const plain = escape();
    handleEscapeKey(plain, cancel);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(plain.defaultPrevented).toBe(true);
  });

  it('routes the prompt modal Esc through the page before closing (#419 #420)', () => {
    const modal = readRendererFile('components/prompt-management/PromptWorkspaceModal.vue');
    const page = readRendererFile('pages/PromptsPage.vue');
    const promptPage = readRendererFile('components/prompts/PromptPage.vue');
    // 弹窗在捕获阶段记下按键时有没有打开的下拉，下拉开着或 Esc 已被用掉时不发 esc
    expect(modal).toContain("window.addEventListener('keydown', recordEscape, true)");
    expect(modal).toMatch(/if \(pending && \(pending\.layerOpen \|\| isEscapeConsumed\(pending\.event\)\)\) return/);
    // 外层先让提示词页收起浮层或历史，没有可收起的才走带未保存确认的关闭
    expect(page).toMatch(/const handleWorkspaceModalEsc = \(\) => \{\s*if \(modalPageRef\.value\?\.dismissTopLayer\?\.\(\)\) return\s*void handleCloseWorkspaceModal\(\)/);
    // 页面里的顺序：窄宽度浮层 → 版本历史
    expect(promptPage).toMatch(/const dismissTopLayer = \(\) => \{\s*if \(narrow\.value && sideOverlayOpen\.value\)[\s\S]*?closeSideOverlay\(\)[\s\S]*?closeHistory\(\)/);
  });
});

describe('prompt header inline inputs (#421 #437)', () => {
  let app: ReturnType<typeof createApp> | undefined;
  let container: HTMLDivElement | undefined;

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

  afterEach(() => {
    app?.unmount();
    container?.remove();
    app = undefined;
    container = undefined;
    createCategory.mockReset();
  });

  const createForm = () => reactive({
    title: '', description: '', content: '', categoryId: null as number | null, tags: [] as string[],
    isJinjaTemplate: false, variables: [], imageBlobs: [],
  });

  it('cancels the tag being typed on Esc instead of adding it', async () => {
    const { default: PromptHeader } = await import('../../src/renderer/components/prompts/PromptHeader.vue');
    const form = createForm();
    const root = await mount(PromptHeader, { form, prompt: null, categories: [], editing: true });
    const addTag = [...root.querySelectorAll('button')].find(button => button.textContent?.trim() === '标签')!;
    addTag.click();
    await nextTick();
    const input = root.querySelector<HTMLInputElement>('.prompt-header__tag-input')!;
    input.value = '临时';
    input.dispatchEvent(new Event('input'));
    const event = escape();
    input.dispatchEvent(event);
    // 输入框卸载时浏览器会补发 blur
    input.dispatchEvent(new Event('blur'));
    await nextTick();
    expect(event.defaultPrevented).toBe(true);
    expect(form.tags).toEqual([]);
    expect(root.querySelector('.prompt-header__tag-input')).toBeNull();
  });

  it('offers new and manage entries in the category menu and creates the category inline', async () => {
    const header = readRendererFile('components/prompts/PromptHeader.vue');
    expect(header).toContain("{ key: CREATE_CATEGORY_KEY, label: t('promptPage.newCategory'), icon: menuIcon(Plus) }");
    expect(header).toContain("{ key: MANAGE_CATEGORIES_KEY, label: t('promptLibrary.manageCategories'), icon: menuIcon(Adjustments) }");

    createCategory.mockResolvedValue({ id: 9, uuid: 'c9', name: '会议', color: '#FF006E', isActive: true });
    const { default: PromptHeader } = await import('../../src/renderer/components/prompts/PromptHeader.vue');
    const form = createForm();
    const categories = [{ id: 1, uuid: 'c1', name: 'Traduzione', color: '#3A86FF', isActive: true }];
    const root = await mount(PromptHeader, { form, prompt: null, categories, editing: true });

    const startCreating = async () => {
      root.querySelector<HTMLButtonElement>('.prompt-header__taxonomy .n-button')!.click();
      await nextTick();
      const option = [...document.querySelectorAll<HTMLElement>('.n-dropdown-option')].find(item => item.textContent?.includes('新建分类'))!;
      option.querySelector<HTMLElement>('.n-dropdown-option-body')!.click();
      await nextTick();
      await nextTick();
      return root.querySelector<HTMLInputElement>('.prompt-header__category-input')!;
    };
    const type = (input: HTMLInputElement, value: string) => {
      input.value = value;
      input.dispatchEvent(new Event('input'));
    };

    // Esc 取消：不创建
    let input = await startCreating();
    type(input, '临时');
    input.dispatchEvent(escape());
    input.dispatchEvent(new Event('blur'));
    await nextTick();
    expect(createCategory).not.toHaveBeenCalled();

    // 同名（不分大小写）直接选中已有分类
    input = await startCreating();
    type(input, 'traduzione');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await nextTick();
    expect(createCategory).not.toHaveBeenCalled();
    expect(form.categoryId).toBe(1);

    // 回车创建并选中，颜色用还没被占用的那个
    input = await startCreating();
    type(input, '会议');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(form.categoryId).toBe(9));
    expect(createCategory).toHaveBeenCalledWith(expect.objectContaining({ name: '会议', color: '#FB5607' }));
  });
});

describe('variable definition card (#420 #454)', () => {
  let app: ReturnType<typeof createApp> | undefined;
  let container: HTMLDivElement | undefined;

  afterEach(() => {
    app?.unmount();
    container?.remove();
    app = undefined;
    container = undefined;
  });

  it('cancels a half-typed option on Esc and keeps the delete button short', async () => {
    const { default: VariableDefinitionList } = await import('../../src/renderer/components/prompts/VariableDefinitionList.vue');
    const onUpdate = vi.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    app = createApp(defineComponent({
      setup: () => () => h(NConfigProvider, null, {
        default: () => h(VariableDefinitionList, {
          variables: [{ name: 'tone', type: 'select', options: ['正式'], required: false }],
          expandedName: 'tone',
          onUpdate,
        }),
      }),
    }));
    app.use(i18n);
    i18n.global.locale.value = 'zh-CN';
    app.mount(container);
    await nextTick();

    container.querySelector<HTMLButtonElement>('.definition-card__options .n-button')!.click();
    await nextTick();
    const input = container.querySelector<HTMLInputElement>('.definition-card__option-input')!;
    input.value = '半截';
    input.dispatchEvent(new Event('input'));
    const event = escape();
    input.dispatchEvent(event);
    input.dispatchEvent(new Event('blur'));
    await nextTick();
    expect(event.defaultPrevented).toBe(true);
    expect(onUpdate).not.toHaveBeenCalled();
    expect(container.querySelector('.definition-card__delete')?.textContent?.trim()).toBe('删除变量');
  });

  it('falls back to a select when the type labels would be cut off, and closes the clear confirm on Esc', () => {
    const list = readRendererFile('components/prompts/VariableDefinitionList.vue');
    const actions = readRendererFile('components/prompts/PromptSideActions.vue');
    expect(list).toContain('<UiSegmented v-else-if="typeFits" fill');
    expect(list).toContain('class="definition-card__type-select"');
    expect(list).toMatch(/\.some\(label => label\.scrollWidth > label\.clientWidth \+ 1\)/);
    expect(actions).toContain('<NPopconfirm :show="confirming"');
    expect(actions).toMatch(/const closeConfirmOnEscape = \(event: KeyboardEvent\) => \{[\s\S]*?event\.preventDefault\(\)\s*confirming\.value = false/);
  });
});

describe('prompt shell wiring', () => {
  it('only marks the edited prompt as unsaved, never the previous one while a draft is open (#432)', () => {
    const page = readRendererFile('pages/PromptsPage.vue');
    expect(page).toContain('dirtyPromptId.value = dirty && !creating.value ? selectedPrompt.value?.id ?? null : null');
  });

  it('moves the compact list button into the header and lets ⌘F open the drawer (#434)', () => {
    const page = readRendererFile('pages/PromptsPage.vue');
    const header = readRendererFile('components/prompts/PromptHeader.vue');
    expect(page).not.toContain('prompts-page__library-toggle');
    expect(page).toContain(':show-library-toggle="compact"');
    expect(header).toContain('<NTooltip v-if="showLibraryToggle"');
    expect(page).toMatch(/const handleSearchShortcut = \(event: KeyboardEvent\) => \{\s*if \(!compact\.value \|\| libraryDrawerOpen\.value/);
    expect(page).toContain('@after-enter="handleDrawerEntered"');
  });

  it('keeps the onboarding description and returns from the model wizard (#424)', () => {
    const empty = readRendererFile('components/prompts/PromptEmptyState.vue');
    const page = readRendererFile('pages/PromptsPage.vue');
    const main = readRendererFile('pages/MainPage.vue');
    const promptPage = readRendererFile('components/prompts/PromptPage.vue');
    // 描述放在组件外，切页面回来还在
    expect(empty).toMatch(/<script lang="ts">[\s\S]*const onboardingDraft = ref\(''\)[\s\S]*<\/script>/);
    expect(empty).toContain('const description = onboardingDraft');
    expect(page).toContain('@create-manual="description => handleCreatePrompt(description, false)"');
    expect(page).toContain("emit('navigate-to-ai-config', { returnToPrompts: true })");
    expect(main).toContain('@config-saved="handleModelConfigSaved"');
    // 带过来的描述算草稿的初始状态（#458）：只有它时「放弃」不用确认
    expect(promptPage).toMatch(/else if \(!form\.value\.description\.trim\(\)\) \{\s*form\.value\.description = description\s*[\s\S]*?editor\.markClean\(\)/);
  });

  it('opens the data backup page at the full backup panel (#426)', () => {
    const page = readRendererFile('pages/PromptsPage.vue');
    const settings = readRendererFile('pages/SettingsPage.vue');
    const backup = readRendererFile('components/settings/DataManagementSettings.vue');
    expect(page).toContain("emit('open-settings', 'data-management#full-backup')");
    expect(backup).toContain('data-settings-anchor="full-backup"');
    expect(settings).toContain("const [section, anchor] = (target || '').split('#');");
    expect(settings).toContain('if (anchor) void revealAnchor(anchor);');
  });

  it('names the template switch and says variable settings are cleared too (#446)', () => {
    const page = readRendererFile('components/prompts/PromptPage.vue');
    expect(page).toContain("title: jinja ? t('promptPage.switchToJinjaTitle') : t('promptPage.switchToRegularTitle')");
    expect(page).toContain("positiveText: t('promptPage.clearAndSwitch')");
    const zh = JSON.parse(readFileSync('src/renderer/i18n/locales/zh-CN.json', 'utf8'));
    expect(zh.promptPage.switchTemplateMessage).toContain('变量');
  });

  it('keeps the copy button on the status line (#452)', () => {
    const page = readRendererFile('components/prompts/PromptPage.vue');
    expect(page).toMatch(/\.prompt-page__status \{[^}]*flex: 1 1 0;[^}]*min-width: 80px;[^}]*text-overflow: ellipsis;[^}]*white-space: nowrap;/);
    expect(page).toContain(':title="statusText"');
    expect(page).toMatch(/\.prompt-page__bar-actions \{[^}]*flex: none;[^}]*margin-left: auto;/);
  });
});
