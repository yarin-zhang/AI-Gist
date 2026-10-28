import { readFileSync } from 'node:fs';
import { createApp, defineComponent, h, nextTick } from 'vue';
import { NConfigProvider } from 'naive-ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../src/renderer/i18n';
import { getThemeOverrides } from '../../src/renderer/theme';

vi.mock('../../src/renderer/components/prompts/ModelPicker.vue', () => ({
  default: defineComponent({ name: 'ModelPickerStub', setup: () => () => h('button', { class: 'model-picker-stub' }) }),
}));

const readRendererFile = (path: string) => readFileSync(`src/renderer/${path}`, 'utf8');

describe('prompt modal close button (#404)', () => {
  it('lets the mask request a close that still goes through the unsaved-changes check', () => {
    const modal = readRendererFile('components/prompt-management/PromptWorkspaceModal.vue');
    const page = readRendererFile('pages/PromptsPage.vue');
    // 遮罩不直接关弹窗，而是和 Esc、× 一样交给外层的 handleCloseWorkspaceModal
    expect(modal).toContain(':mask-closable="false"');
    expect(modal).toContain('@mask-click="$emit(\'request-close\')"');
    expect(page).toContain('<PromptWorkspaceModal :show="showWorkspaceModal" @request-close="handleCloseWorkspaceModal" @esc="handleWorkspaceModalEsc">');
    expect(page).toMatch(/const handleCloseWorkspaceModal = async \(\) => \{[\s\S]*?if \(!\(await confirmDiscardChanges\(\)\)\) return/);
  });

  it('keeps the close button outside the scrolling document, pinned to the top-right corner', () => {
    const page = readRendererFile('components/prompts/PromptPage.vue');
    const header = readRendererFile('components/prompts/PromptHeader.vue');
    const scrollStart = page.indexOf('<div class="prompt-page__scroll">');
    const asideEnd = page.indexOf('</aside>');
    const close = page.indexOf('class="prompt-page__close"');
    expect(close).toBeGreaterThan(asideEnd);
    expect(asideEnd).toBeGreaterThan(scrollStart);
    expect(page).toMatch(/\.prompt-page__close \{[^}]*position: absolute;[^}]*top: 6px;[^}]*right: 8px;/);
    // 页头里不再放关闭按钮，否则它会跟着正文滚走
    expect(header).not.toContain("emit('close')");
  });

  it('clips instead of hiding overflow so focused controls cannot scroll the page sideways (#406)', () => {
    const page = readRendererFile('pages/PromptsPage.vue');
    const modal = readRendererFile('components/prompt-management/PromptWorkspaceModal.vue');
    expect(page).toMatch(/\.prompts-page \{[^}]*overflow: clip;/);
    expect(page).toMatch(/\.prompts-page__browse \{[^}]*overflow: clip;/);
    expect(modal).toMatch(/\.prompt-workspace-modal \{[^}]*overflow: clip;/);
  });

  it('keeps the tabs at full width and lets the actions and model picker shrink (#406)', () => {
    const page = readRendererFile('components/prompts/PromptPage.vue');
    const picker = readRendererFile('components/prompts/ModelPicker.vue');
    expect(page).toMatch(/\.prompt-page__tablist \{[^}]*flex: none;/);
    expect(picker).toMatch(/\.model-picker \{[^}]*flex: 0 1 auto;[^}]*min-width: 0;/);
    expect(picker).toMatch(/\.model-picker__label \{[^}]*text-overflow: ellipsis;/);
  });
});

describe('side panel tab actions (#406)', () => {
  let app: ReturnType<typeof createApp> | undefined;
  let container: HTMLDivElement | undefined;
  let available = 300;
  const observers: (() => void)[] = [];
  const originals = {
    clientWidth: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth'),
    offsetWidth: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth'),
    ResizeObserver: globalThis.ResizeObserver,
  };

  beforeEach(() => {
    available = 300;
    observers.length = 0;
    // jsdom 没有布局：操作区宽度由测试控制，文字按钮按字数估宽，图标按钮 22px
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get() { return this.classList.contains('side-actions') ? available : 0; },
    });
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
      configurable: true,
      get() {
        if (!this.classList.contains('side-actions__button')) return 0;
        return this.classList.contains('is-icon') ? 22 : this.textContent.trim().length * 12 + 16;
      },
    });
    // 只记下回调，由测试在改宽度后手动触发
    globalThis.ResizeObserver = class {
      constructor(callback: () => void) { observers.push(callback); }
      observe = vi.fn();
      disconnect = vi.fn();
    } as unknown as typeof ResizeObserver;
  });

  afterEach(() => {
    app?.unmount();
    container?.remove();
    app = undefined;
    container = undefined;
    if (originals.clientWidth) Object.defineProperty(HTMLElement.prototype, 'clientWidth', originals.clientWidth);
    if (originals.offsetWidth) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', originals.offsetWidth);
    globalThis.ResizeObserver = originals.ResizeObserver;
  });

  const mount = async () => {
    const { default: PromptSideActions } = await import('../../src/renderer/components/prompts/PromptSideActions.vue');
    container = document.createElement('div');
    document.body.appendChild(container);
    app = createApp(defineComponent({
      setup: () => () => h(NConfigProvider, { themeOverrides: getThemeOverrides('light') }, {
        default: () => h(PromptSideActions, { kind: 'fill', showUsage: true, canClear: true }),
      }),
    }));
    app.use(i18n);
    i18n.global.locale.value = 'zh-CN';
    app.mount(container);
    await nextTick();
    return container;
  };

  const resize = async (width: number) => {
    available = width;
    observers.forEach(callback => callback());
    await nextTick();
    await nextTick();
  };

  const buttons = (root: HTMLElement) => [...root.querySelectorAll<HTMLButtonElement>('.side-actions__button')];

  it('shows text buttons when they fit and switches to labelled icon buttons when they do not', async () => {
    const root = await mount();
    await resize(300);
    expect(buttons(root).map(button => button.textContent?.trim())).toEqual(['使用记录', '清空填写值']);
    expect(buttons(root).every(button => !button.getAttribute('aria-label'))).toBe(true);

    await resize(60);
    expect(buttons(root).map(button => button.getAttribute('aria-label'))).toEqual(['使用记录', '清空填写值']);
    expect(buttons(root).every(button => button.classList.contains('is-icon'))).toBe(true);

    await resize(300);
    expect(buttons(root).map(button => button.textContent?.trim())).toEqual(['使用记录', '清空填写值']);
  });

  it('waits for a hidden panel to get a width before deciding', async () => {
    const root = await mount();
    await resize(0);
    expect(buttons(root).some(button => button.classList.contains('is-icon'))).toBe(false);
    await resize(60);
    expect(buttons(root).every(button => button.classList.contains('is-icon'))).toBe(true);
  });
});
