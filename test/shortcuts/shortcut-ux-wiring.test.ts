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
});
