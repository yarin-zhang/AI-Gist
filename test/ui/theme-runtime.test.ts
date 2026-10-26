import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyDocumentTheme, resolveTheme } from '@renderer/theme/runtime';

describe('theme runtime', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.className = '';
    document.documentElement.removeAttribute('style');
    document.body.className = '';
    document.body.removeAttribute('style');
  });

  it('resolves explicit and system theme sources', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });

  it('applies the complete mobile dark theme atomically', () => {
    applyDocumentTheme('dark', 'mobile');

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.classList.contains('theme-dark')).toBe(true);
    expect(document.documentElement.classList.contains('ion-palette-dark')).toBe(true);
    expect(document.body.classList.contains('dark')).toBe(true);
    expect(document.documentElement.style.getPropertyValue('--surface-body')).toBe('rgb(15, 17, 21)');
    expect(document.documentElement.style.getPropertyValue('--overlay-backdrop')).toBe('rgba(0, 0, 0, 0.62)');
  });

  it('removes Ionic dark state when applying a desktop light theme', () => {
    applyDocumentTheme('dark', 'mobile');
    applyDocumentTheme('light', 'desktop');

    expect(document.documentElement.classList.contains('light')).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(document.documentElement.classList.contains('ion-palette-dark')).toBe(false);
    expect(document.body.classList.contains('light')).toBe(true);
    expect(document.documentElement.style.getPropertyValue('--surface-primary')).toBe('rgb(255, 255, 255)');
  });

  // 回归测试：Gitea issue #387，切换到浅色主题后设置卡片停在比页面还暗的过渡色。
  it('suspends component transitions until the new theme has been painted', () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback));
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    const html = document.documentElement;

    applyDocumentTheme('light', 'desktop');
    expect(html.classList.contains('theme-switching')).toBe(true);

    frames.shift()?.(0);
    expect(html.classList.contains('theme-switching')).toBe(true);

    frames.shift()?.(16);
    expect(html.classList.contains('theme-switching')).toBe(false);
    expect(html.classList.contains('light')).toBe(true);
  });

  it('disables every transition while the theme-switching class is present', () => {
    const css = readFileSync(resolve(__dirname, '../../src/renderer/assets/styles/global.css'), 'utf8');

    expect(css).toMatch(/html\.theme-switching \*,[\s\S]*?\{\s*transition:\s*none !important;\s*\}/);
  });
});
