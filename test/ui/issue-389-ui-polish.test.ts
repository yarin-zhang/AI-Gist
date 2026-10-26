import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listBackups = vi.fn();

vi.mock('@renderer/lib/services/local-backup.service', () => ({
  localBackupService: { list: (...args: unknown[]) => listBackups(...args) },
}));
vi.mock('@renderer/composables/useDatabase', () => ({
  useDatabase: () => ({ safeDbOperation: vi.fn() }),
}));
vi.mock('@renderer/lib/api/data-management.api', () => ({ DataManagementAPI: {} }));
vi.mock('@renderer/lib/db', () => ({ databaseService: {} }));

const readWorkspaceFile = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('issue #389 desktop UI polish', () => {
  beforeEach(() => {
    listBackups.mockReset();
    listBackups.mockResolvedValue([]);
  });

  it('shows top messages below the 60px command bar instead of over the view switcher', () => {
    const app = readWorkspaceFile('src/renderer/App.vue');
    expect(app).toContain('<NMessageProvider :container-style="messageContainerStyle">');
    expect(app).toContain("isLauncherSurface ? undefined : { top: 'calc(60px + var(--spacing-md))' }");
  });

  it('renders form validation feedback as plain text without a bordered box', () => {
    const overrides = readWorkspaceFile('src/renderer/assets/scss/overrides/naive-override.scss');
    const feedbackBlock = overrides.slice(overrides.indexOf('.n-form-item-feedback-wrapper'), overrides.indexOf('.n-form-item-blank--error'));
    expect(feedbackBlock).not.toMatch(/border\s*:/);
    expect(feedbackBlock).not.toMatch(/background\s*:/);
    expect(feedbackBlock).not.toMatch(/transform\s*:/);
  });

  it('keeps the local refresh button out of its loading state during silent list loads', async () => {
    const { useDataManagement } = await import('@renderer/composables/useDataManagement');
    const { loading, getBackupList } = useDataManagement();

    let resolveList!: (value: unknown[]) => void;
    listBackups.mockReturnValueOnce(new Promise(resolve => { resolveList = resolve; }));
    const silentLoad = getBackupList();
    expect(loading.value.refreshBackupList).toBeFalsy();
    resolveList([]);
    await silentLoad;
    expect(loading.value.refreshBackupList).toBeFalsy();

    listBackups.mockReturnValueOnce(new Promise(resolve => { resolveList = resolve; }));
    const explicitRefresh = getBackupList({ showLoading: true });
    expect(loading.value.refreshBackupList).toBe(true);
    resolveList([]);
    await explicitRefresh;
    expect(loading.value.refreshBackupList).toBe(false);
  });

  it('only shows the refresh spinners when the user clicks refresh', () => {
    const local = readWorkspaceFile('src/renderer/components/settings/DataManagementSettings.vue');
    expect(local).toContain('await getBackupList({ showLoading: true });');

    const cloud = readWorkspaceFile('src/renderer/components/settings/CloudBackupLocationPane.vue');
    expect(cloud).toContain('<NButton @click="refreshCloudBackupList" :loading="loading.refresh">');
    expect(cloud).toContain('onMounted(loadCloudBackupList);');
    expect(cloud).toContain('void loadCloudBackupList();');
    expect(cloud).not.toContain('await refreshCloudBackupList();');
  });
});
