import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

describe('shortcut-first UX wiring', () => {
  it('uses a launcher surface and prompt-local binding entry points', () => {
    const app = readFileSync('src/renderer/App.vue', 'utf8');
    const list = readFileSync('src/renderer/pages/PromptsPage.vue', 'utf8');
    const settings = readFileSync('src/renderer/components/settings/ShortcutSettings.vue', 'utf8');

    expect(app).toContain('PromptLauncher');
    expect(list).toContain('ShortcutBindingModal');
    expect(settings).toContain("t('shortcuts.promptBindings')");
    expect(settings).not.toContain('selectedPromptId');
  });

  it('links the status-bar launcher entry to the launcher and shortcut settings', () => {
    const statusBar = readFileSync('src/renderer/components/layout/AppStatusBar.vue', 'utf8');
    const launcher = readFileSync('src/renderer/composables/useLauncherShortcut.ts', 'utf8');
    const mainPage = readFileSync('src/renderer/pages/MainPage.vue', 'utf8');

    expect(statusBar).toContain('useLauncherShortcut()');
    expect(statusBar).toContain("emit('open-settings', 'shortcuts')");
    expect(statusBar).toContain("t('shortcuts.launcherStatusHint'");
    expect(launcher).toContain('preferences.commands.launcher');
    expect(launcher).toContain('shortcuts?.openLauncher()');
    expect(mainPage).toContain('@open-launcher="handleOpenLauncher"');
    expect(mainPage).toMatch(/settingsTargetSection\.value\s*=\s*undefined[\s\S]*?await nextTick\(\)[\s\S]*?settingsTargetSection\.value\s*=\s*targetSection/);
  });
});
