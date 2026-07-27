import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

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
    const cloudPage = read('src/renderer/pages/mobile/MobileCloudBackupPage.vue')
    const settingsPage = read('src/renderer/pages/mobile/MobileSettingsPage.vue')
    expect(cloudPage).not.toContain('window.location.reload()')
    expect(settingsPage).not.toContain('window.location.reload()')
    expect(cloudPage).toContain('publishRestoredDataToCloud')
    expect(cloudPage).toContain('resumeRestoreWithMerge')
  })

  it('keeps automatic backups local while allowing explicit manual cloud backups', () => {
    const cloudPage = read('src/renderer/pages/mobile/MobileCloudBackupPage.vue')
    const settingsPage = read('src/renderer/pages/mobile/MobileSettingsPage.vue')

    expect(cloudPage).not.toContain('automaticBackupService')
    expect(cloudPage).toContain('CloudBackupAPI.createCloudBackup(')
    expect(cloudPage).toContain("t('cloudBackup.createCloudBackup')")
    expect(cloudPage).toContain("backupType: 'manual'")
    expect(cloudPage).toContain("trigger: 'manual'")
    expect(settingsPage).toContain('automaticBackupService')
    expect(settingsPage).toContain("t('dataBackup.automaticBackupDescription')")
    expect(settingsPage).toContain('<ion-select-option v-for="option in autoBackupIntervalOptions"')
    expect(settingsPage).toContain('CUSTOM_AUTO_BACKUP_INTERVAL')
    expect(settingsPage).toContain("t('dataBackup.automaticBackupLifecycleDescription')")
    expect(settingsPage).toContain('@click="runAutoBackupNow"')
  })
})
