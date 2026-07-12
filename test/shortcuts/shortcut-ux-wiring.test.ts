import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

describe('shortcut-first UX wiring', () => {
  it('uses a launcher surface and prompt-local binding entry points', () => {
    const app = readFileSync('src/renderer/App.vue', 'utf8');
    const list = readFileSync('src/renderer/components/prompt-management/PromptList.vue', 'utf8');
    const settings = readFileSync('src/renderer/components/settings/ShortcutSettings.vue', 'utf8');

    expect(app).toContain('PromptLauncher');
    expect(list).toContain('ShortcutBindingModal');
    expect(settings).toContain("t('shortcuts.promptBindings')");
    expect(settings).not.toContain('selectedPromptId');
  });

  it('links the status-bar launcher indicator to shortcut settings', () => {
    const statusBar = readFileSync('src/renderer/components/common/StatusBar.vue', 'utf8');
    const indicator = readFileSync('src/renderer/components/common/PromptLauncherStatusIndicator.vue', 'utf8');
    const mainPage = readFileSync('src/renderer/pages/MainPage.vue', 'utf8');

    expect(statusBar).toContain('PromptLauncherStatusIndicator');
    expect(statusBar).toContain("handleOpenSettings('shortcuts')");
    expect(indicator).toContain("preferences.commands.launcher");
    expect(indicator).toContain("t('shortcuts.launcherStatusHint'");
    expect(indicator).toContain('shortcuts?.openLauncher()');
    expect(indicator).toContain("emit('activate')");
    expect(indicator).toMatch(/\.prompt-launcher-button\s*\{[^}]*box-sizing:\s*border-box[^}]*padding:\s*0/s);
    expect(indicator).toMatch(/\.prompt-launcher-icon\s*\{[^}]*display:\s*block/s);
    expect(mainPage).toMatch(/settingsTargetSection\.value\s*=\s*undefined[\s\S]*?await nextTick\(\)[\s\S]*?settingsTargetSection\.value\s*=\s*targetSection/);
  });
});
