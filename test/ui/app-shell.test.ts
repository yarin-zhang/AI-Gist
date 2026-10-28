import { createApp, defineComponent, h, nextTick } from 'vue';
import { NConfigProvider } from 'naive-ui';
import { afterEach, describe, expect, it } from 'vitest';
import i18n from '../../src/renderer/i18n';
import AppRail from '../../src/renderer/components/layout/AppRail.vue';
import { getThemeOverrides } from '../../src/renderer/theme';
import { displayAccelerator } from '../../src/renderer/lib/utils/accelerator';

describe('desktop app shell', () => {
  let app: ReturnType<typeof createApp> | undefined;
  let container: HTMLDivElement | undefined;

  const mountRail = async (props: Record<string, unknown>) => {
    container = document.createElement('div');
    document.body.appendChild(container);
    app = createApp(defineComponent({
      setup: () => () => h(NConfigProvider, { themeOverrides: getThemeOverrides('light') }, {
        default: () => h(AppRail, props),
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
  });

  it('marks the current view and navigates from the rail', async () => {
    const views: string[] = [];
    const root = await mountRail({ active: 'models', onNavigate: (view: string) => views.push(view) });
    const current = root.querySelector('[aria-current="page"]');

    expect(current?.getAttribute('aria-label')).toBe('模型');
    expect(current?.classList.contains('is-active')).toBe(true);
    root.querySelector<HTMLButtonElement>('[aria-label="提示词"]')!.click();
    root.querySelector<HTMLButtonElement>('[aria-label="设置"]')!.click();
    expect(views).toEqual(['prompts', 'settings']);
  });

  it('only shows the launcher entry when global shortcuts are available', async () => {
    let root = await mountRail({ active: 'prompts' });
    expect(root.querySelector('[aria-label^="启动器"]')).toBeNull();
    app?.unmount();
    container?.remove();

    root = await mountRail({ active: 'prompts', showLauncher: true, launcherShortcut: '⌥Space' });
    expect(root.querySelector('[aria-label="启动器（⌥Space）"]')).not.toBeNull();
  });

  it('formats accelerators for macOS and other platforms', () => {
    expect(displayAccelerator('Alt+Space', true)).toBe('⌥Space');
    expect(displayAccelerator('CommandOrControl+Shift+G', true)).toBe('⌘⇧G');
    expect(displayAccelerator('CommandOrControl+Shift+G', false)).toBe('Ctrl+Shift+G');
  });
});
