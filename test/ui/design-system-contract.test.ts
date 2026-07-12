import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const rendererRoot = resolve(root, 'src/renderer');
const desktopExtensions = new Set(['.vue', '.scss', '.css', '.ts']);

const collectFiles = (directory: string): string[] => readdirSync(directory, { withFileTypes: true })
  .flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectFiles(path);
    return desktopExtensions.has(extname(entry.name)) ? [path] : [];
  });

const desktopFiles = collectFiles(rendererRoot).filter(path => (
  !path.includes('/pages/mobile/')
  && !path.includes('/components/mobile/')
  && !path.endsWith('/assets/styles/mobile.css')
));

describe('desktop design-system contract', () => {
  it('keeps the AI design prompt discoverable for future agents', () => {
    const promptPath = resolve(root, 'docs/AI_UI_DESIGN_PROMPT.md');
    const agentsPath = resolve(root, 'AGENTS.md');
    expect(existsSync(promptPath)).toBe(true);
    expect(existsSync(agentsPath)).toBe(true);
    expect(readFileSync(agentsPath, 'utf8')).toContain('docs/AI_UI_DESIGN_PROMPT.md');
    expect(readFileSync(promptPath, 'utf8')).toContain('tinted surfaces with restrained boundary borders');
  });

  it('uses the canonical desktop typography and component radii', () => {
    const tokens = JSON.parse(readFileSync(resolve(rendererRoot, 'design-tokens.json'), 'utf8'));
    expect(tokens.typography.fontSizes.base).toBe('14px');
    expect(tokens.typography.fontSizes.xs).toBe('12px');
    expect(tokens.component.controlRadius).toBe('6px');
    expect(tokens.component.panelRadius).toBe('8px');
    expect(tokens.component.modalRadius).toBe('10px');
    expect(tokens.component.menuIconSize).toBe('16px');
    expect(tokens.component.pagePadding).toBe('20px');
    expect(tokens.component.contentPadding).toBe('16px');
  });

  it('does not revive deprecated desktop theme variables', () => {
    const deprecated = /--app-|var\(--(?:border-color|text-color|code-color)/;
    const offenders = desktopFiles
      .filter(path => deprecated.test(readFileSync(path, 'utf8')))
      .map(path => relative(root, path));
    expect(offenders).toEqual([]);
  });

  it('keeps structural Naive UI cards bordered', () => {
    const borderlessCard = /<(?:NCard|n-card)\b[^>]*:?bordered=["']false["']/;
    const offenders = desktopFiles
      .filter(path => path.endsWith('.vue') && borderlessCard.test(readFileSync(path, 'utf8')))
      .map(path => relative(root, path));
    expect(offenders).toEqual([]);
  });

  it('does not use numeric persistent shadows inside desktop Vue components', () => {
    const numericShadow = /box-shadow:\s*(?!none\b|var\()[^;}]*(?:rgba?|#|\d+px)/;
    const offenders = desktopFiles
      .filter(path => path.endsWith('.vue') && numericShadow.test(readFileSync(path, 'utf8')))
      .map(path => relative(root, path));
    expect(offenders).toEqual([]);
  });

  it('removes the obsolete duplicate prompt detail implementation', () => {
    expect(existsSync(resolve(rendererRoot, 'components/prompt-management/PromptDetailModal.vue'))).toBe(false);
  });

  it('keeps selection styling borderless in the shared design contract', () => {
    const prompt = readFileSync(resolve(root, 'docs/AI_UI_DESIGN_PROMPT.md'), 'utf8');
    expect(prompt).toContain('They do not gain a selection border');
  });

  it('preserves Naive UI menu rendering and native input editing semantics', () => {
    const mainPage = readFileSync(resolve(rendererRoot, 'pages/MainPage.vue'), 'utf8');
    const settingsPage = readFileSync(resolve(rendererRoot, 'pages/SettingsPage.vue'), 'utf8');
    const globalStyles = readFileSync(resolve(rendererRoot, 'assets/styles/global.css'), 'utf8');

    expect(mainPage).not.toMatch(/n-menu-item-content(?:--selected)?[^}]*background/s);
    expect(settingsPage).not.toMatch(/n-menu-item-content(?:--selected)?[^}]*background/s);
    expect(globalStyles).toMatch(/body\s*\{[^}]*-webkit-user-select:\s*none[^}]*user-select:\s*none/s);
    expect(globalStyles).toContain('[contenteditable="true"]');
    expect(globalStyles).toContain('.n-input__input-el');
    expect(globalStyles).toContain('.n-input__textarea-el');
    expect(globalStyles).toContain('user-select: text');
    expect(globalStyles).not.toContain('-webkit-app-region: no-drag');
  });

  it('uses a focus-trap-compatible root for every raw Naive UI modal', () => {
    const rawModal = /<(NModal|n-modal)\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/\1>/g;
    const allowedRoot = /^\s*<(?:div|NCard|n-card)\b/;
    const offenders: string[] = [];

    for (const path of desktopFiles.filter(file => file.endsWith('.vue'))) {
      const source = readFileSync(path, 'utf8');
      for (const match of source.matchAll(rawModal)) {
        const [, , attributes, content] = match;
        if (/\bpreset\s*=/.test(attributes)) continue;
        const contentWithoutComments = content.replace(/^\s*<!--[\s\S]*?-->/, '');
        if (!allowedRoot.test(contentWithoutComments)) offenders.push(relative(root, path));
      }
    }

    expect([...new Set(offenders)]).toEqual([]);
  });
});
