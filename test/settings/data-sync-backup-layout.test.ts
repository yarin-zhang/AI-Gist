import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readWorkspaceFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const expectInOrder = (source: string, snippets: string[]) => {
  let cursor = -1;
  for (const snippet of snippets) {
    const next = source.indexOf(snippet, cursor + 1);
    expect(next, `Expected ${JSON.stringify(snippet)} after offset ${cursor}`).toBeGreaterThan(cursor);
    cursor = next;
  }
};

describe('settings sync and backup information architecture', () => {
  it('makes data sync the first and default settings section', () => {
    const source = readWorkspaceFile('src/renderer/pages/SettingsPage.vue');
    expect(source).toContain("normalizeSettingKey(props.targetSection) || 'cloud-backup'");
    expectInOrder(source, [
      "label: t('settings.sections.cloudBackup')",
      "label: t('settings.sections.dataManagement')",
    ]);
    expect(source).toContain('<DataSyncSettings');
    expect(source).toContain('@navigate-section="handleMenuSelect"');
  });

  it('uses concise grouped navigation and a compact narrow-window selector', () => {
    const source = readWorkspaceFile('src/renderer/pages/SettingsPage.vue');
    expectInOrder(source, [
      'class="settings-command-bar"',
      "{{ t('settings.title') }}",
      'class="settings-workspace"',
      'class="settings-navigation"',
      '<NMenu',
    ]);
    expectInOrder(source, [
      "label: t('settings.groups.data')",
      "label: t('settings.groups.preferences')",
      "label: t('settings.groups.system')",
      "label: t('settings.groups.other')",
    ]);
    expect(source).toContain('class="settings-compact-navigation"');
    expect(source).toContain(':options="compactMenuOptions"');
    expect(source).toContain(':root-indent="8"');
    expect(source).toContain(':indent="16"');
    expect(source).toContain("{{ t('settings.subtitle') }}");
    expect(source).not.toContain("{{ t('settings.autoSave') }}");
    expect(source).not.toContain("t('settings.resetToDefault')");
    expect(source).not.toContain('const resetSettings');
    expect(source).not.toContain('<NAlert :show-icon="false">');
  });

  it('combines appearance and language under general settings and keeps native features in the system group', () => {
    const source = readWorkspaceFile('src/renderer/pages/SettingsPage.vue');

    expect(source).toContain('<template v-if="activeSettingKey === \'general\'">');
    expectInOrder(source, [
      '<AppearanceSettings',
      '<LanguageSettings />',
    ]);
    expectInOrder(source, [
      "label: t('settings.sections.general')",
      "label: t('settings.sections.startup')",
      "label: t('settings.sections.close')",
      "label: t('settings.sections.shortcuts')",
      "label: t('settings.sections.networkProxy')",
    ]);
    expect(source).toContain("children: pick('general')");
    expect(source).toContain("children: pick('startup-behavior', 'close-behavior', 'shortcuts', 'network-proxy')");
    expect(source).toContain('visible: capabilities.startup');
    expect(source).toContain('visible: capabilities.tray');
    expect(source).toContain('visible: capabilities.globalShortcuts');
    expect(source).toContain('visible: capabilities.systemProxy');
  });

  it('gives the settings navigation and content independent scroll areas', () => {
    const source = readWorkspaceFile('src/renderer/pages/SettingsPage.vue');
    const style = source.slice(source.indexOf('<style scoped>'));

    expect(style).toMatch(/\.settings-page\s*\{[^}]*height:\s*calc\(100vh - 24px\);[^}]*overflow:\s*hidden;/s);
    expect(style).toMatch(/\.settings-command-bar\s*\{[^}]*flex:\s*0 0 60px/s);
    expect(style).toMatch(/\.settings-workspace\s*\{[^}]*height:\s*0;[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;/s);
    expect(source).toContain('<NScrollbar class="settings-navigation-scrollbar" trigger="hover">');
    expect(style).toMatch(/\.settings-navigation\s*\{[^}]*overflow:\s*hidden;/s);
    expect(style).toMatch(/\.settings-navigation-scrollbar\s*\{[^}]*height:\s*100%;/s);
    expect(style).toMatch(/\.settings-detail\s*\{[^}]*overflow:\s*hidden;/s);
    expect(style).toMatch(/\.settings-section-header\s*\{[^}]*flex:\s*0 0 auto/s);
    expect(source).toContain('<NScrollbar class="settings-content-scrollbar" trigger="hover">');
    expect(style).toMatch(/\.settings-content-scrollbar\s*\{[^}]*height:\s*0;[^}]*min-height:\s*0;/s);
    expect(style).not.toContain('position: sticky');
    expect(source).not.toContain('handleNavigationScroll');
    expect(source).not.toContain('isNavigationScrolling');
  });

  it('removes duplicate summaries from simple preference panels', () => {
    const language = readWorkspaceFile('src/renderer/components/settings/LanguageSettings.vue');
    const closeBehavior = readWorkspaceFile('src/renderer/components/settings/CloseBehaviorSettings.vue');
    const startup = readWorkspaceFile('src/renderer/components/settings/StartupBehaviorSettings.vue');

    expect(language).not.toContain("t('language.description')");
    expect(closeBehavior).not.toContain("t('closeBehavior.currentSetting')");
    expect(startup).toContain('<NSwitch');
  });

  it('keeps the sync page focused on status, storage, and collapsed advanced sync settings', () => {
    const source = readWorkspaceFile('src/renderer/components/settings/DataSyncSettings.vue');
    expect(source).toContain("t('dataSync.storageConfiguration')");
    expect(source).toContain('<NCollapse>');
    expect(source).toContain("t('dataSync.advancedSettings')");
    expect(source).not.toContain('automaticBackupService');
    expect(source).not.toContain('getCloudBackupList');
    expect(source).not.toContain('createCloudBackup');
    expect(source).not.toContain('restoreCloudBackup');
    expect(source).not.toContain('deleteCloudBackup');
  });

  it('keeps storage card and form actions in the required order', () => {
    const source = readWorkspaceFile('src/renderer/components/settings/DataSyncSettings.vue');
    const cardActionStart = source.indexOf('<template #action>');
    const cardActions = source.slice(cardActionStart, source.indexOf('</NCard>', cardActionStart));
    expectInOrder(cardActions, [
      '@click="editConfig(config)"',
      '@click="testSavedConnection(config)"',
      '@click="syncCloudData(config.id)"',
      '@positive-click="deleteConfig(config.id)"',
    ]);

    const modalFooter = source.slice(source.indexOf('<NFlex justify="space-between" align="center">', source.indexOf('<NModal')));
    expectInOrder(modalFooter, [
      '@click="showConfigModal = false"',
      '@click="testDraftConnection"',
      '@click="saveConfig"',
    ]);
  });

  it('routes saved and draft connection tests through the same normalized test function', () => {
    const source = readWorkspaceFile('src/renderer/components/settings/DataSyncSettings.vue');
    expect(source).toContain('await testConnection(toStorageConfig())');
    expect(source).toContain('await testConnection(config)');
    expect(source).toContain('normalizeCloudStorageConfigForConnectionTest(config)');
  });

  it('shows local backup first and creates a lazy cloud tab for every storage configuration', () => {
    const source = readWorkspaceFile('src/renderer/components/settings/DataManagementSettings.vue');
    expectInOrder(source, [
      '<NTabPane name="local"',
      '<NTabPane v-for="config in storageConfigs"',
    ]);
    expect(source).toContain('display-directive="show:lazy"');
    expect(source).toContain('<CloudBackupLocationPane :config="config" />');
    expect(source).toContain("t('dataBackup.automaticBackupSettings')");

    const cloudPane = readWorkspaceFile('src/renderer/components/settings/CloudBackupLocationPane.vue');
    expect(cloudPane).not.toContain('createCloudBackup');
    expect(cloudPane).not.toContain("t('dataBackup.createCloudBackup')");
  });

  it('uses the new visible section names in every supported locale', () => {
    const expected = {
      'zh-CN': ['数据同步', '数据备份', '通用设置'],
      'zh-TW': ['資料同步', '資料備份', '一般設定'],
      'en-US': ['Data Sync', 'Data Backup', 'General Settings'],
      'ja-JP': ['データ同期', 'データバックアップ', '一般設定'],
    } as const;

    for (const [locale, [syncName, backupName, generalName]] of Object.entries(expected)) {
      const messages = JSON.parse(readWorkspaceFile(`src/renderer/i18n/locales/${locale}.json`));
      expect(messages.settings.sections.cloudBackup).toBe(syncName);
      expect(messages.settings.sections.dataManagement).toBe(backupName);
      expect(messages.settings.sections.general).toBe(generalName);
      expect(messages.dataSync.title).toBe(syncName);
      expect(messages.dataBackup.title).toBe(backupName);
      expect(messages.settings.groups.data).toBeTruthy();
      expect(messages.settings.groups.preferences).toBeTruthy();
      expect(messages.settings.groups.system).toBeTruthy();
      expect(messages.settings.groups.other).toBeTruthy();
    }
  });
});
