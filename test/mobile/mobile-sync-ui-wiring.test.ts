import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

const SETTINGS_HOME = 'src/renderer/pages/mobile/MobileSettingsPage.vue'
const DATA_SYNC = 'src/renderer/pages/mobile/settings/MobileDataSyncPage.vue'
const STORAGE_CONFIG = 'src/renderer/pages/mobile/settings/MobileStorageConfigPage.vue'
const DATA_BACKUP = 'src/renderer/pages/mobile/settings/MobileDataBackupPage.vue'
const LOCAL_BACKUP = 'src/renderer/pages/mobile/settings/MobileLocalBackupPage.vue'
const CLOUD_BACKUP = 'src/renderer/pages/mobile/settings/MobileCloudBackupPage.vue'
const GENERAL = 'src/renderer/pages/mobile/settings/MobileGeneralSettingsPage.vue'
const ABOUT = 'src/renderer/pages/mobile/MobileAboutPage.vue'
const SHARED = 'src/renderer/pages/mobile/settings/shared.ts'
const SETTINGS_PAGES = [SETTINGS_HOME, DATA_SYNC, STORAGE_CONFIG, DATA_BACKUP, LOCAL_BACKUP, CLOUD_BACKUP]
const ALL_SETTINGS_PAGES = [...SETTINGS_PAGES, GENERAL, ABOUT]

describe('mobile sync and restore UI wiring', () => {
  it('normalizes prompt tags before rendering tag pills', () => {
    const source = read('src/renderer/pages/mobile/MobilePromptDetailPage.vue')
    expect(source).toContain('const promptTags = computed(() => getTagsArray(prompt.value?.tags))')
    expect(source).toContain('<span v-for="tag in promptTags" :key="tag" class="m-pill">#{{ tag }}</span>')
  })

  it('refreshes visible prompt data from database change events after a remote apply', () => {
    const source = read('src/renderer/pages/mobile/MobilePromptPage.vue')
    expect(source).toContain("onDataChange(['prompts', 'categories', 'ai_configs'], scheduleRealtimeRefresh)")
    expect(source).toContain('runRealtimeRefresh(false)')
  })

  it('does not rely on a full page reload after local or cloud restore', () => {
    for (const page of SETTINGS_PAGES) {
      expect(read(page), page).not.toContain('window.location.reload()')
    }
    expect(read(DATA_SYNC)).toContain('publishRestoredDataToCloud')
    expect(read(DATA_SYNC)).toContain('resumeRestoreWithMerge')
  })

  it('keeps automatic backups local while allowing explicit manual cloud backups', () => {
    const cloudBackup = read(CLOUD_BACKUP)
    const localBackup = read(LOCAL_BACKUP)

    expect(cloudBackup).not.toContain('automaticBackupService')
    expect(cloudBackup).toContain('CloudBackupAPI.createCloudBackup(')
    expect(cloudBackup).toContain("t('dataBackup.createCloudBackup')")
    expect(cloudBackup).toContain("backupType: 'manual'")
    expect(cloudBackup).toContain("trigger: 'manual'")

    expect(localBackup).toContain('automaticBackupService')
    expect(localBackup).toContain("t('dataBackup.automaticBackupDescription')")
    expect(localBackup).toContain('AUTOMATIC_BACKUP_INTERVAL_PRESETS')
    expect(localBackup).toContain('localBackupService.create(')
  })

  it('ignores stale local backup list responses after a newer refresh', () => {
    const source = read(LOCAL_BACKUP)
    expect(source).toContain('let latestBackupLoad = 0')
    expect(source).toContain('const requestId = ++latestBackupLoad')
    expect(source).toContain('if (requestId === latestBackupLoad) backups.value = nextBackups')
  })

  it('keeps the settings home a pure navigation list', () => {
    const home = read(SETTINGS_HOME)

    // 首页只负责跳转，任何写入型设置都必须留在二级页面里
    expect(home).not.toContain('automaticBackupService')
    expect(home).not.toContain('localBackupService')
    expect(home).not.toContain('setAutoSync')
    expect(home).not.toContain('<ion-toggle')
    expect(home).toContain("'/mobile/settings/data-sync'")
    expect(home).toContain("'/mobile/settings/data-backup'")
    expect(home).toContain("'/mobile/settings/general'")
    expect(home).toContain("'/mobile/about'")
    // 备份摘要只读，走 shared.ts 里的只读汇总
    expect(home).toContain('loadLocalBackupSummary()')
    // Tab 根页面要给浮动导航留出底部空间
    expect(home).toContain('m-body m-body--tabbed')
    expect(home).toContain('<MobileLargeTitle')
  })

  it('derives the mobile sync status card from the desktop status rules', () => {
    const shared = read(SHARED)
    const home = read(SETTINGS_HOME)
    const sync = read(DATA_SYNC)

    // 标题和颜色与桌面端共用同一套判断，移动端只在前面加「未配置」和「恢复后暂停」
    expect(shared).toContain('resolveDataSyncStatusKind({')
    expect(shared).toContain('resolveDataSyncAlertType(kind, diagnosis.canAutoRetry)')
    expect(shared).toContain("hasPendingConflict: status.status === 'conflict'")
    expect(shared).toContain("if (input.storageCount === 0)")
    expect(shared).toContain("view('restorePaused', 'warning'")
    expect(shared).toContain("case 'conflict':")
    for (const page of [home, sync]) {
      expect(page).toContain('describeSyncStatus({')
      expect(page).toContain('restoreSuspensionCount:')
    }
  })

  it('routes pending sync conflicts to the conflict sheet instead of an error', () => {
    const home = read(SETTINGS_HOME)
    const sync = read(DATA_SYNC)

    expect(home).toContain("syncView.kind === 'conflict'")
    expect(home).toContain('requestConflictSheet()')
    expect(sync).toContain("syncView.kind === 'conflict'")
    expect(sync).toContain('const openConflictSheet = () =>')
    expect(sync).toContain("result.action === 'conflict-pending'")
    expect(sync).toContain('consumeConflictSheetRequest()')
  })

  it('keeps manual sync, error diagnosis and retry on the data sync page', () => {
    const sync = read(DATA_SYNC)
    expect(sync).toContain('cloudSyncService.syncNow(storageId, {')
    // #416：「立即同步」和「重试」都是用户亲手点的，和桌面端一样总是真正重新连接，不返回缓存的失败
    expect(sync).toMatch(/reason: 'manual',\s*forceRetry: true/)
    expect(sync).not.toMatch(/forceRetry = false|forceRetry\s*\}/)
    expect(sync).toContain('presentSyncErrorDetails(result, { storageId, onRetry: retry, quietWhenRecoverable: true })')
    expect(sync).toContain("t('dataSync.viewErrorDetails')")
    // 恢复后覆盖云端是破坏性操作，必须先确认
    expect(sync).toContain('confirmRestoreOverwrite')
    expect(sync).toContain("message: t('cloudBackup.overwriteCloudWarning')")
    expect(sync).toContain('cloudSyncService.setAutoSyncIntervalMinutes(value)')
  })

  it('offers only WebDAV storage on mobile', () => {
    const storage = read(STORAGE_CONFIG)
    // 移动端没有 iCloud 的跨设备同步能力，不出现存储类型切换
    expect(storage).not.toContain('m-seg')
    expect(storage).not.toContain('iCloud Drive')
    expect(storage).toContain("type: 'webdav' as const")
    expect(storage).toContain("message: t('dataSync.confirmDeleteConfig')")
    expect(storage).toContain('CloudBackupAPI.testStorageConnection(')
  })

  it('confirms every restore and delete before touching backups', () => {
    const local = read(LOCAL_BACKUP)
    const cloud = read(CLOUD_BACKUP)

    for (const source of [local, cloud]) {
      expect(source).toContain('<ion-item-sliding')
      expect(source).toMatch(/const restoreBackup = async[\s\S]*?await confirmAction\(\{[\s\S]*?destructive: true/)
      expect(source).toMatch(/const deleteBackup = async[\s\S]*?await confirmAction\(\{[\s\S]*?destructive: true/)
      expect(source).toContain('withLoading(')
    }
    // 左滑之外，点按版本也能恢复或删除
    expect(local).toContain('openBackupActions(backup)')
    // 恢复后引导用户处理暂停的云端同步
    expect(local).toContain('cloudSyncService.getRestoreSuspensions().length > 0')
    expect(cloud).toContain('cloudSyncService.getRestoreSuspensions().length > 0')
  })

  it('routes every settings entry to a dedicated detail page', () => {
    const router = read('src/renderer/router/mobile.ts')

    expect(router).toContain("path: '/mobile/settings/general'")
    expect(router).toContain("path: '/mobile/settings/data-sync'")
    expect(router).toContain("path: '/mobile/settings/data-sync/storage/:id'")
    expect(router).toContain("path: '/mobile/settings/data-backup'")
    expect(router).toContain("path: '/mobile/settings/data-backup/local'")
    expect(router).toContain("path: '/mobile/settings/data-backup/cloud/:storageId'")
    // 旧深链必须继续可用，否则历史入口和恢复引导会 404
    expect(router).toContain("redirect: '/mobile/settings/data-sync'")
  })

  it('reads and writes cloud storage only through the platform-dispatching API', () => {
    for (const page of SETTINGS_PAGES) {
      const source = read(page)
      // 直接引用某个平台的实现会让 Web 壳和移动壳写进不同的存储，
      // 配置能保存却同步不了。
      expect(source, page).not.toContain('mobile-cloud-backup.service')
      expect(source, page).not.toContain('web-cloud-backup.service')
    }
    expect(read(STORAGE_CONFIG)).toContain('CloudBackupAPI.addStorageConfig(')
    expect(read(STORAGE_CONFIG)).toContain('CloudBackupAPI.updateStorageConfig(')
    expect(read(STORAGE_CONFIG)).toContain('CloudBackupAPI.deleteStorageConfig(')
    expect(read(DATA_SYNC)).toContain('CloudBackupAPI.getStorageConfigs()')
    expect(read(CLOUD_BACKUP)).toContain('CloudBackupAPI.getCloudBackupList(')
  })

  it('keeps mobile settings copy translatable', () => {
    const cjk = /[一-鿿]/
    for (const page of ALL_SETTINGS_PAGES) {
      const template = read(page).split('<script setup')[0]
      const withoutComments = template.replace(/<!--[\s\S]*?-->/g, '')
      expect(withoutComments, `${page} template contains untranslated copy`).not.toMatch(cjk)
    }
  })
})
