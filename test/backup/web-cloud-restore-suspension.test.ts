import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PlatformDetector } from '@shared/platform'
import { CloudBackupAPI } from '~/lib/api/cloud-backup.api'
import { cloudSyncService } from '~/lib/services/cloud-sync.service'
import { webCloudBackupService } from '~/lib/services/web-cloud-backup.service'

describe('web cloud backup restore coordination', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(PlatformDetector, 'isElectron').mockReturnValue(false)
    vi.spyOn(PlatformDetector, 'isWeb').mockReturnValue(true)
    vi.spyOn(PlatformDetector, 'isMobile').mockReturnValue(false)
  })

  // Web 端的实现自己写回本地库，所以很容易漏掉暂停同步这一步；
  // 一旦漏掉，自动同步会在用户做出决定前把刚恢复的数据合并掉。
  it('suspends automatic sync after the web database was restored', async () => {
    const restore = vi.spyOn(webCloudBackupService, 'restoreCloudBackup')
      .mockResolvedValue({ success: true, message: 'restored' })
    const suspend = vi.spyOn(cloudSyncService, 'suspendEnabledStoragesAfterRestore')
      .mockResolvedValue([])

    const result = await CloudBackupAPI.restoreCloudBackup('storage-1', 'backup-1')

    expect(result.success).toBe(true)
    expect(restore).toHaveBeenCalledWith('storage-1', 'backup-1')
    expect(suspend).toHaveBeenCalledWith({
      source: 'cloud-backup',
      backupId: 'backup-1'
    })
  })

  it('does not suspend sync when the web restore failed', async () => {
    vi.spyOn(webCloudBackupService, 'restoreCloudBackup')
      .mockResolvedValue({ success: false, message: 'failed', error: 'boom' })
    const suspend = vi.spyOn(cloudSyncService, 'suspendEnabledStoragesAfterRestore')
      .mockResolvedValue([])

    const result = await CloudBackupAPI.restoreCloudBackup('storage-1', 'backup-1')

    expect(result.success).toBe(false)
    expect(suspend).not.toHaveBeenCalled()
  })
})
