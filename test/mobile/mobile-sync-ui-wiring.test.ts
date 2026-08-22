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
const SETTINGS_PAGES = [SETTINGS_HOME, DATA_SYNC, STORAGE_CONFIG, DATA_BACKUP, LOCAL_BACKUP, CLOUD_BACKUP]

describe('mobile sync and restore UI wiring', () => {
  it('normalizes prompt tags before rendering list chips', () => {
    const source = read('src/renderer/pages/mobile/MobilePromptPage.vue')
    expect(source).toContain('getTagsArray(prompt.tags).slice(0, 2)')
    expect(source).toContain('getTagsArray(prompt.tags).length - 2')
    expect(source).not.toContain('(prompt.tags || []).slice(0, 2)')
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
    for (const page of SETTINGS_PAGES) {
      const template = read(page).split('<script setup')[0]
      const withoutComments = template.replace(/<!--[\s\S]*?-->/g, '')
      expect(withoutComments, `${page} template contains untranslated copy`).not.toMatch(cjk)
    }
  })
})
