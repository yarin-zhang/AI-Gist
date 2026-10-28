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
    expect(readFileSync(promptPath, 'utf8')).toContain('bordered panels on tinted surfaces, with shadows reserved for overlays');
  });

  it('uses the canonical desktop typography and component radii', () => {
    const tokens = JSON.parse(readFileSync(resolve(rendererRoot, 'design-tokens.json'), 'utf8'));
    expect(tokens.typography.fontSizes.base).toBe('14px');
    expect(tokens.typography.fontSizes.xs).toBe('12px');
    expect(tokens.component.controlRadius).toBe('6px');
    expect(tokens.component.panelRadius).toBe('8px');
    expect(tokens.component.modalRadius).toBe('10px');
    expect(tokens.component.menuIconSize).toBe('16px');
    expect(tokens.component.contentPadding).toBe('16px');
    expect(tokens.controlHeights).toEqual({ xs: '22px', sm: '28px', md: '34px', lg: '40px' });
    expect(tokens.layout).toMatchObject({
      railWidth: '52px',
      listWidth: '264px',
      navWidth: '232px',
      sidePanelWidth: '340px',
      statusbarHeight: '26px',
      readingWidth: '760px',
      pagePaddingDocument: '40px',
      pagePaddingDetail: '32px',
      pagePaddingList: '24px',
    });
  });

  it('defines every V5 color role in both themes', () => {
    const tokens = JSON.parse(readFileSync(resolve(rendererRoot, 'design-tokens.json'), 'utf8'));
    const shape = (palette: Record<string, Record<string, string>>) => Object.fromEntries(
      Object.entries(palette).map(([group, values]) => [group, Object.keys(values).sort()]),
    );
    expect(shape(tokens.palette.dark)).toEqual(shape(tokens.palette.light));
    expect(Object.keys(tokens.palette.light.category).sort()).toEqual(
      ['amber', 'blue', 'green', 'grey', 'orange', 'pink', 'teal', 'violet'],
    );
    for (const role of ['soft', 'softBorder', 'softText', 'text', 'brand', 'favorite', 'successBg', 'warningBg', 'errorBg']) {
      expect(tokens.palette.light.accent[role], role).toBeTruthy();
    }
  });

  it('keeps text readable on every structural surface in both themes', () => {
    const tokens = JSON.parse(readFileSync(resolve(rendererRoot, 'design-tokens.json'), 'utf8'));
    const channels = (value: string) => value.match(/\d+/g)!.slice(0, 3).map(Number);
    const luminance = (value: string) => {
      const [r, g, b] = channels(value).map(channel => {
        const unit = channel / 255;
        return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const contrast = (a: string, b: string) => {
      const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (high + 0.05) / (low + 0.05);
    };

    for (const theme of ['light', 'dark'] as const) {
      const { surface, content, accent } = tokens.palette[theme];
      for (const background of [surface.primary, surface.secondary, surface.tertiary]) {
        expect(contrast(content.primary, background), `${theme} primary text`).toBeGreaterThanOrEqual(7);
        expect(contrast(content.secondary, background), `${theme} secondary text`).toBeGreaterThanOrEqual(4.5);
      }
      for (const background of [surface.primary, surface.secondary]) {
        expect(contrast(content.tertiary, background), `${theme} tertiary text`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(accent.text, background), `${theme} accent text`).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrast('rgb(255, 255, 255)', accent.primary), `${theme} primary button`).toBeGreaterThanOrEqual(4.5);
      expect(contrast('rgb(255, 255, 255)', accent.errorSolid), `${theme} danger button`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(accent.error, surface.primary), `${theme} danger text`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('keeps light and dark surfaces on the same semantic luminance ladder', () => {
    const tokens = JSON.parse(readFileSync(resolve(rendererRoot, 'design-tokens.json'), 'utf8'));
    const rgbLuminance = (value: string): number => {
      const [r, g, b] = value.match(/\d+/g)!.slice(0, 3).map(Number).map(channel => {
        const normalized = channel / 255;
        return normalized <= 0.04045
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };

    const light = tokens.palette.light.surface;
    const dark = tokens.palette.dark.surface;
    expect(light.sidebar).toBe(light.secondary);
    expect(dark.sidebar).toBe(dark.secondary);
    expect(rgbLuminance(light.primary)).toBeGreaterThan(rgbLuminance(light.secondary));
    expect(rgbLuminance(light.secondary)).toBeGreaterThan(rgbLuminance(light.body));
    expect(rgbLuminance(light.body)).toBeGreaterThan(rgbLuminance(light.tertiary));
    expect(rgbLuminance(dark.body)).toBeLessThan(rgbLuminance(dark.primary));
    expect(rgbLuminance(dark.primary)).toBeLessThan(rgbLuminance(dark.secondary));
    expect(rgbLuminance(dark.secondary)).toBeLessThan(rgbLuminance(dark.tertiary));
    expect(tokens.palette.light.overlay.backdrop).toBeTruthy();
    expect(tokens.palette.dark.overlay.preview).toBeTruthy();
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

  it('does not use blocking browser dialogs in the desktop renderer', () => {
    const blockingBrowserDialog = /\b(?:window\.)?(?:alert|confirm|prompt)\s*\(/;
    const offenders = desktopFiles
      .filter(path => blockingBrowserDialog.test(readFileSync(path, 'utf8')))
      .map(path => relative(root, path));
    expect(offenders).toEqual([]);
  });

  it('removes the obsolete duplicate prompt detail implementation', () => {
    expect(existsSync(resolve(rendererRoot, 'components/prompt-management/PromptDetailModal.vue'))).toBe(false);
  });

  it('documents the V5 selection rules in the shared design contract', () => {
    const prompt = readFileSync(resolve(root, 'docs/AI_UI_DESIGN_PROMPT.md'), 'utf8');
    expect(prompt).toContain('Navigation items (rail, settings navigation, folder tree, menus) when selected: `--accent-soft` background');
    expect(prompt).toContain('Content items (prompt list rows, table rows, cards) when selected: `--accent-soft` background, text unchanged');
  });

  it('never marks selection with a coloured leading-edge bar or border', () => {
    const prompt = readFileSync(resolve(root, 'docs/AI_UI_DESIGN_PROMPT.md'), 'utf8');
    expect(prompt).toContain('Never mark selection or emphasis with a coloured bar or coloured border on the leading edge');
    const leadingAccent = /--selection-bar|inset\s+\d+px\s+0\s+0\s+(?:0\s+)?var\(--accent-(?:primary|brand)|border-left(?:-color)?:[^;]*var\(--accent-(?:primary|brand)/;
    const offenders = collectFiles(rendererRoot)
      .filter(path => leadingAccent.test(readFileSync(path, 'utf8')))
      .map(path => relative(root, path));
    expect(offenders).toEqual([]);
  });

  it('maps navigation selection to the soft accent in Naive UI overrides', () => {
    const themeSource = readFileSync(resolve(rendererRoot, 'theme/index.ts'), 'utf8');
    expect(themeSource).toMatch(/Menu:\s*\{[\s\S]*?itemColorActive:\s*accent\.soft/);
    expect(themeSource).toMatch(/Menu:\s*\{[\s\S]*?itemTextColorActive:\s*accent\.softText/);
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

  // Gitea #380：上一项的选中底色淡出时，帧被节流就会停在选中色，看起来两项同时选中。
  it('repaints menu selection changes without color transitions', () => {
    const globalStyles = readFileSync(resolve(rendererRoot, 'assets/styles/global.css'), 'utf8');
    const menuRule = (selector: string) => {
      const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return globalStyles.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
    };

    expect(menuRule('.n-menu .n-menu-item .n-menu-item-content::before')).toMatch(/transition:\s*none/);
    for (const part of ['.n-menu-item-content__icon', '.n-menu-item-content-header']) {
      const rule = menuRule(`.n-menu .n-menu-item .n-menu-item-content ${part}`);
      expect(rule).toContain('transition:');
      expect(rule).not.toMatch(/\b(?:background-)?color\b/);
    }
  });

  it('maps desktop and mobile structural surfaces to canonical tokens', () => {
    const themeSource = readFileSync(resolve(rendererRoot, 'theme/index.ts'), 'utf8');
    const mobileStyles = readFileSync(resolve(rendererRoot, 'assets/styles/mobile.css'), 'utf8');
    const mobileFiles = collectFiles(rendererRoot).filter(path => (
      path.includes('/pages/mobile/')
      || path.includes('/components/mobile/')
      || path.endsWith('/pages/MobileMainPage.vue')
    ));
    const mobileSource = mobileFiles.map(path => readFileSync(path, 'utf8')).join('\n');

    expect(themeSource).toMatch(/Card:\s*\{[\s\S]*?color:\s*surface\.primary/);
    expect(themeSource).toMatch(/Layout:\s*\{[\s\S]*?color:\s*surface\.body/);
    expect(mobileStyles).toContain('--ion-background-color: var(--surface-body)');
    expect(mobileStyles).toContain('--ion-item-background: var(--surface-primary)');
    expect(mobileStyles).toContain('--ion-card-background: var(--surface-primary)');
    expect(mobileSource).not.toContain('background: var(--ion-color-light)');
    expect(mobileSource).not.toContain('border: 1px solid var(--ion-color-light-shade)');
  });

  it('does not retain deprecated decorative surface helpers', () => {
    const common = readFileSync(resolve(rendererRoot, 'assets/scss/common.scss'), 'utf8');
    expect(common).not.toContain('.glass-effect');
    expect(common).not.toContain('.text-gradient');
    expect(common).not.toContain('.ui-surface');
    // 装饰性动画样式表已整体移除
    expect(existsSync(resolve(rendererRoot, 'assets/scss/common-animations.scss'))).toBe(false);
    // 原先还会检查 tailwind.css 里的 .card-modern；该文件已随 Tailwind 一并移除，
    // 那批 @apply 辅助类不复存在，断言无对象可查。
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
