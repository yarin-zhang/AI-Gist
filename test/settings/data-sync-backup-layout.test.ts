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
    expect(source).toContain("splitTargetSection(props.targetSection).section || 'cloud-backup'");
    expectInOrder(source, [
      "label: t('settings.sections.cloudBackup')",
      "label: t('settings.sections.dataManagement')",
    ]);
    expect(source).toContain('<DataSyncSettings');
    expect(source).toContain('@navigate-section="handleMenuSelect"');
  });

  it('uses the V5 232px navigation with four groups and a compact selector', () => {
    const source = readWorkspaceFile('src/renderer/pages/SettingsPage.vue');
    const nav = readWorkspaceFile('src/renderer/components/settings/SettingsNav.vue');
    expect(source).toContain('<SettingsNav class="settings-page__nav" :groups="navGroups"');
    expectInOrder(source, [
      "label: t('settings.groups.data')",
      "label: t('settings.groups.preferences')",
      "label: t('settings.groups.system')",
      "label: t('settings.groups.other')",
    ]);
    expect(source).toContain("items: pick('cloud-backup', 'data-management')");
    expect(source).toContain("items: pick('general', 'startup-behavior', 'close-behavior', 'shortcuts')");
    expect(source).toContain("items: pick('network-proxy', 'cli-bridge')");
    expect(source).toContain('class="settings-page__compact"');
    expect(source).toContain(':options="compactMenuOptions"');
    expect(nav).toMatch(/\.settings-nav\s*\{[^}]*width:\s*var\(--nav-width\)/s);
    expect(nav).toMatch(/\.settings-nav__item\.is-active\s*\{[^}]*background:\s*var\(--accent-soft\)[^}]*color:\s*var\(--accent-soft-text\)/s);
  });

  it('keeps platform capabilities in charge of which sections appear', () => {
    const source = readWorkspaceFile('src/renderer/pages/SettingsPage.vue');
    expect(source).toContain('<template v-if="activeSettingKey === \'general\'">');
    expectInOrder(source, ['<AppearanceSettings', '<LanguageSettings />']);
    expect(source).toContain('visible: capabilities.startup');
    expect(source).toContain('visible: capabilities.tray');
    expect(source).toContain('visible: capabilities.globalShortcuts');
    expect(source).toContain('visible: capabilities.systemProxy');
    expect(source).toContain('visible: capabilities.cliBridge');
  });

  it('lays settings content out at reading width with its own scroll area', () => {
    const source = readWorkspaceFile('src/renderer/pages/SettingsPage.vue');
    const style = source.slice(source.indexOf('<style scoped>'));
    expect(source).toContain('<NScrollbar class="settings-page__scroll" trigger="hover">');
    expect(style).toMatch(/\.settings-page\s*\{[^}]*height:\s*100%;[^}]*overflow:\s*hidden;/s);
    expect(style).toMatch(/\.settings-content\s*\{[^}]*max-width:\s*var\(--reading-width\)/s);
    expect(source).toContain('<UiPageHeader v-if="showPageHeader"');
  });

  it('builds simple preference sections from panels and setting rows', () => {
    const language = readWorkspaceFile('src/renderer/components/settings/LanguageSettings.vue');
    const closeBehavior = readWorkspaceFile('src/renderer/components/settings/CloseBehaviorSettings.vue');
    const startup = readWorkspaceFile('src/renderer/components/settings/StartupBehaviorSettings.vue');
    const appearance = readWorkspaceFile('src/renderer/components/settings/AppearanceSettings.vue');

    expect(language).toContain('<UiSettingRow');
    expect(closeBehavior).toContain('<UiChoiceCards');
    expect(closeBehavior).not.toContain("t('closeBehavior.currentSetting')");
    expect(startup).toContain('<NSwitch');
    expect(appearance).toContain('class="theme-cards" role="radiogroup"');
  });

  it('keeps the sync page focused on status, storage and advanced sync settings', () => {
    const source = readWorkspaceFile('src/renderer/components/settings/DataSyncSettings.vue');
    expect(source).toContain('class="ui-panel sync-status"');
    expect(source).toContain("t('dataSync.storageConfiguration')");
    expect(source).toContain("t('dataSync.advancedSettings')");
    expect(source).not.toContain('automaticBackupService');
    expect(source).not.toContain('getCloudBackupList');
    expect(source).not.toContain('createCloudBackup');
    expect(source).not.toContain('restoreCloudBackup');
    expect(source).not.toContain('deleteCloudBackup');
  });

  it('keeps destructive storage actions behind the more menu with confirmation', () => {
    const source = readWorkspaceFile('src/renderer/components/settings/DataSyncSettings.vue');
    expectInOrder(source, [
      '@click="testSavedConnection(config)"',
      '@click="editConfig(config)"',
      ':options="storageActionOptions(config)"',
    ]);
    expect(source).toContain("@select=\"key => handleStorageAction(key, config)\"");
    expect(source).toContain(":aria-label=\"t('dataSync.storageActions')\"");
    expect(source).toContain('const handleStorageAction = (key: string, config: CloudStorageConfig) => {');
    expect(source).toContain("if (key !== 'delete') return;");
    // 删除存储只是断开连接：标题带存储名，正文说明本机和云端数据都不会被删 (#446)
    expect(source).toMatch(/dialog\.warning\(\{[\s\S]*?title:\s*t\('dataSync\.deleteConfigTitle', \{ name: config\.name \}\)[\s\S]*?content:\s*t\('dataSync\.confirmDeleteConfig'\)/);
    expect(source).toContain('onPositiveClick: () => deleteConfig(config.id),');

    const modalStart = source.indexOf('<UiModal :show="showConfigModal"');
    const modal = source.slice(modalStart, source.indexOf('</UiModal>', modalStart));
    expectInOrder(modal.slice(modal.indexOf('<template #footer>')), [
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

  it('shows local backup first and switches to each cloud storage with a segment', () => {
    const source = readWorkspaceFile('src/renderer/components/settings/DataManagementSettings.vue');
    expectInOrder(source, [
      "{ value: 'local', label: t('dataBackup.localLocation') }",
      '...storageConfigs.value.map(config => ({',
    ]);
    expect(source).toContain('<CloudBackupLocationPane v-else-if="activeStorage" ref="cloudPaneRef" :config="activeStorage" />');
    expect(source).toContain("t('dataBackup.automaticBackupTitle')");
    expect(source).toContain('<NSelect v-model:value="autoBackupIntervalSelection"');
    expect(source).toContain('AUTOMATIC_BACKUP_INTERVAL_PRESETS');
    expect(source).toContain('autoBackupIntervalSelection === CUSTOM_AUTO_BACKUP_INTERVAL');
    expect(source).toContain("t('dataBackup.automaticBackupLifecycleDescription')");

    const cloudPane = readWorkspaceFile('src/renderer/components/settings/CloudBackupLocationPane.vue');
    expect(cloudPane).toContain('defineExpose({ loading, createCloudBackup, refreshCloudBackupList })');
    expect(cloudPane).toContain("backupType: 'manual'");
    expect(cloudPane).toContain("trigger: 'manual'");
    expect(cloudPane).not.toContain('automaticBackupService');
  });

  it('renders retryable cloud errors as a scheduled warning while preserving error details', () => {
    const source = readWorkspaceFile('src/renderer/components/settings/DataSyncSettings.vue');
    expect(source).toContain("case 'retryScheduled': return t('dataSync.statusRetryScheduled');");
    expect(source).toContain("t('dataSync.statusRetryScheduled')");
    expect(source).toContain('syncStatus.value.nextSyncAt');
    expect(source).toContain('@click="showCurrentSyncError"');
    // The 'warning' color for a scheduled retry is asserted against the real
    // resolveDataSyncAlertType() logic in test/data-sync-status.test.ts, not by
    // grepping this file -- see that suite for the behavioral coverage.
  });

  it('derives the status title and banner color from the same shared resolver instead of two separate branch chains', () => {
    const source = readWorkspaceFile('src/renderer/components/settings/DataSyncSettings.vue');

    // The item-4 review finding was that statusTitle and statusAlertType used to be two
    // independently maintained if/else chains that could (and did) disagree about
    // whether pendingChanges matters. Pin the wiring so both are forced through the
    // same resolveDataSyncStatusKind() result and neither one re-inlines its own
    // pendingChanges/status branching.
    // #425: the card and the status-bar indicator must also build that input the same way,
    // so both go through createDataSyncStatusInput() instead of mapping the service status
    // by hand (they used to disagree about pendingChanges after the first sync).
    expect(source).toContain('const dataSyncStatusKind = computed<DataSyncStatusKind>(() => resolveDataSyncStatusKind(createDataSyncStatusInput(syncStatus.value, {');
    expect(source).toContain('hasStorageConfigs: hasEnabledStorage.value,');
    expect(source).not.toMatch(/status\s*===\s*'scheduled'\s*&&\s*syncStatus\.value\.pendingChanges/);
    const indicator = readWorkspaceFile('src/renderer/components/common/CloudSyncStatusIndicator.vue');
    expect(indicator).toContain('resolveDataSyncStatusKind(createDataSyncStatusInput(status.value, {');
    const util = readWorkspaceFile('src/renderer/lib/utils/data-sync-status.ts');
    // pendingChanges must be passed through unconditionally -- not gated behind a
    // `status === 'scheduled' &&` check, which is exactly the asymmetry that caused the reported bug.
    expect(util).toMatch(/pendingChanges:\s*!!snapshot\.pendingChanges,/);

    const statusAlertTypeStart = source.indexOf('const statusAlertType = computed');
    const statusAlertTypeEnd = source.indexOf(');', statusAlertTypeStart);
    expect(source.slice(statusAlertTypeStart, statusAlertTypeEnd)).toContain(
      'resolveDataSyncAlertType(dataSyncStatusKind.value, syncStatusDiagnosis.value.canAutoRetry)',
    );

    const statusTitleStart = source.indexOf('const statusTitle = computed');
    const statusTitleEnd = source.indexOf('});', statusTitleStart);
    const statusTitleBody = source.slice(statusTitleStart, statusTitleEnd);
    expect(statusTitleBody).toContain('switch (dataSyncStatusKind.value)');
    // statusTitle must not keep its own copy of the pendingChanges/status decision tree.
    expect(statusTitleBody).not.toContain('syncStatus.value.pendingChanges');
  });

  it('formats sync timestamps with the localized friendly date shared with the backup list (#464)', () => {
    const source = readWorkspaceFile('src/renderer/components/settings/DataSyncSettings.vue');
    expect(source).toContain("import { formatFriendlyDate } from '@/lib/utils/date';");
    expect(source).toContain('formatFriendlyDate(value, locale.value, { withTime: true })');
    expect(source).toContain("t('dataSync.lastSyncAt', { time: formatSyncTime(syncStatus.value.lastSyncAt) })");
    expect(source).toContain('time: formatSyncTime(syncStatus.value.nextSyncAt!)');
    expect(source).not.toContain('formatDateTime(');
    expect(source).not.toContain('toLocaleString()');

    const indicator = readWorkspaceFile('src/renderer/components/common/CloudSyncStatusIndicator.vue');
    expect(indicator).toContain("import { formatFriendlyDate, formatRelativeTime } from '~/lib/utils/date';");
    expect(indicator).not.toContain('formatDateTime(');
    expect(indicator).not.toContain('Intl.DateTimeFormat');
  });

  it('only mentions the retry once and keeps diagnostics folded (#464)', () => {
    const source = readWorkspaceFile('src/renderer/components/settings/DataSyncSettings.vue');
    const retryStart = source.indexOf("case 'retryScheduled': return t('dataSync.statusRetryScheduledDescription'");
    // 说明里本来就写着「会自动重试」，状态卡片只取原因（标题），不再把说明和重试时间拼在一起
    expect(source.slice(retryStart, retryStart + 200)).toContain('error: syncStatusDiagnosis.value.title');
    expect(source).toMatch(/<details class="sync-error__tech">\s*<summary>\{\{ t\('dataSync\.technicalDetails'\) \}\}<\/summary>/);

    const indicator = readWorkspaceFile('src/renderer/components/common/CloudSyncStatusIndicator.vue');
    expect(indicator).toContain("case 'retryScheduled': return 'retrying';");
    expect(indicator).toContain("t('dataSync.indicatorShortRetrying')");
    expect(indicator).toMatch(/<details class="cloud-sync-tech">[\s\S]*?<pre class="cloud-sync-raw-error">/);

    // 检查间隔超出范围时就地说明，不靠 NInputNumber 的 min / max 悄悄改值
    const intervalStart = source.indexOf('class="sync-interval"');
    expect(source.slice(intervalStart, intervalStart + 600)).not.toContain(':min="MIN_CLOUD_SYNC_INTERVAL_MINUTES"');
    expect(source).toContain("t('dataSync.syncIntervalTooShort', { min: MIN_CLOUD_SYNC_INTERVAL_MINUTES })");
    expect(source).toContain('syncIntervalError.value = checked.error;');

    for (const locale of ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'it-IT']) {
      const messages = JSON.parse(readWorkspaceFile(`src/renderer/i18n/locales/${locale}.json`));
      const template: string = messages.dataSync.statusRetryScheduledDescription;
      expect(template, locale).not.toMatch(/[。.]\s*[；;]|[；;]\s*$/);
      expect(messages.dataSync.syncIntervalDescription, locale).toContain('{min}');
      expect(messages.dataSync.syncIntervalDescription, locale).toContain('{hours}');
    }
  });

  it('routes the cloud sync status indicator strings through i18n', () => {
    const indicator = readWorkspaceFile('src/renderer/components/common/CloudSyncStatusIndicator.vue');
    expect(indicator).toContain("import { useI18n } from 'vue-i18n';");
    expect(indicator).toContain("const { t, locale } = useI18n();");
    expect(indicator).toContain("t('dataSync.indicatorSyncNormal')");
    expect(indicator).toContain("t('dataSync.indicatorIdle')");
    expect(indicator).toContain("t('dataSync.indicatorWaitingNextSync')");
    // No bare Chinese/Japanese literal strings should remain in the script logic that
    // previously hardcoded the tooltip and aria-label text regardless of app language.
    expect(indicator).not.toMatch(/return '[^']*[一-鿿][^']*'/);
  });

  it('uses the new visible section names in every supported locale', () => {
    const expected = {
      'zh-CN': ['数据同步', '数据备份', '通用设置'],
      'zh-TW': ['資料同步', '資料備份', '一般設定'],
      'en-US': ['Data sync', 'Data backup', 'General settings'],
      'ja-JP': ['データ同期', 'データバックアップ', '一般設定'],
      'it-IT': ['Sincronizzazione dati', 'Backup dei dati', 'Impostazioni generali'],
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
