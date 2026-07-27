import { createApp, defineComponent, h, nextTick } from 'vue';
import { darkTheme, NConfigProvider, NTooltip } from 'naive-ui';
import { afterEach, describe, expect, it } from 'vitest';
import tokens from '../../src/renderer/design-tokens.json';
import { getThemeOverrides } from '../../src/renderer/theme';

describe('Naive UI tooltip theme integration', () => {
  let app: ReturnType<typeof createApp> | undefined;
  let container: HTMLDivElement | undefined;

  afterEach(() => {
    app?.unmount();
    container?.remove();
    app = undefined;
    container = undefined;
  });

  it.each(['light', 'dark'] as const)('keeps %s tooltip text readable on its canonical surface', async themeName => {
    const palette = tokens.palette[themeName];
    container = document.createElement('div');
    document.body.appendChild(container);

    app = createApp(defineComponent({
      setup: () => () => h(NConfigProvider, {
        theme: themeName === 'dark' ? darkTheme : null,
        themeOverrides: getThemeOverrides(themeName),
      }, {
        default: () => h(NTooltip, {
          animated: false,
          show: true,
          to: false,
        }, {
          trigger: () => h('button', { type: 'button' }, 'Navigation'),
          default: () => 'AI Prompts',
        }),
      }),
    }));

    app.mount(container);
    await nextTick();
    await nextTick();

    const tooltip = container.querySelector<HTMLElement>('.n-tooltip');
    expect(tooltip).not.toBeNull();
    expect(tooltip!.textContent).toContain('AI Prompts');
    expect(tooltip!.style.getPropertyValue('--n-color')).toBe(palette.surface.primary);
    expect(tooltip!.style.getPropertyValue('--n-text-color')).toBe(palette.content.primary);
    expect(tooltip!.style.getPropertyValue('--n-border-radius')).toBe(tokens.component.panelRadius);
    expect(tooltip!.style.getPropertyValue('--n-box-shadow')).toBe(tokens.elevation.popover);
    expect(tooltip!.querySelector('.n-popover-arrow')).not.toBeNull();
  });
});
