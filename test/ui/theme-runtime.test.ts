import { afterEach, describe, expect, it } from 'vitest';
import { applyDocumentTheme, resolveTheme } from '@renderer/theme/runtime';

describe('theme runtime', () => {
  afterEach(() => {
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
});
