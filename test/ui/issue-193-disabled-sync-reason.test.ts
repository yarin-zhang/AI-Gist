import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('disabled cloud sync action', () => {
  it('explains the disabled state and exposes a direct enable action', () => {
    const page = readFileSync('src/renderer/components/settings/DataSyncSettings.vue', 'utf8')

    expect(page).toContain("t('dataSync.enableToSync')")
    expect(page).toContain('@click="enableStorage(config)"')
    expect(page).toContain('CloudBackupAPI.updateStorageConfig(config.id, { enabled: true })')
    expect(page).toContain("cloudSyncService.scheduleSync('config-enabled'")
  })
})
