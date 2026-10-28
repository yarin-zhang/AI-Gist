import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PlatformDetector } from '@shared/platform'
import { CloudBackupAPI } from '~/lib/api/cloud-backup.api'
import { cloudSyncService } from '~/lib/services/cloud-sync.service'
import { localBackupService } from '~/lib/services/local-backup.service'

describe('desktop cloud backup restore coordination', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(PlatformDetector, 'isElectron').mockReturnValue(true)

    vi.spyOn(localBackupService, 'createSafetyBackup').mockResolvedValue({
      action: 'created',
      backup: { id: 'safety', name: 'safety', createdAt: new Date().toISOString(), size: 1 } as any,
      deletedCount: 0
    })
  })

  it('suspends automatic sync after the desktop database was restored', async () => {
    const restoreBackup = vi.fn().mockResolvedValue({
      success: true,
      message: 'restored'
    })
    ;(window as any).electronAPI = { cloud: { restoreBackup } }
    const suspend = vi.spyOn(cloudSyncService, 'suspendEnabledStoragesAfterRestore')
      .mockResolvedValue([])

    const result = await CloudBackupAPI.restoreCloudBackup('storage-1', 'backup-1')

    expect(result.success).toBe(true)
    expect(restoreBackup).toHaveBeenCalledWith('storage-1', 'backup-1')
    expect(suspend).toHaveBeenCalledWith({
      source: 'cloud-backup',
      backupId: 'backup-1'
    })
  })

  it('does not suspend sync when the desktop restore failed', async () => {
    ;(window as any).electronAPI = {
      cloud: {
        restoreBackup: vi.fn().mockResolvedValue({ success: false, message: 'failed' })
      }
    }
    const suspend = vi.spyOn(cloudSyncService, 'suspendEnabledStoragesAfterRestore')
      .mockResolvedValue([])

    const result = await CloudBackupAPI.restoreCloudBackup('storage-1', 'backup-1')

    expect(result.success).toBe(false)
    expect(suspend).not.toHaveBeenCalled()
  })

  it('backs up current data first and does not restore when that backup fails', async () => {
    vi.spyOn(localBackupService, 'createSafetyBackup').mockRejectedValue(new Error('disk full'))
    const restoreBackup = vi.fn()
    ;(window as any).electronAPI = { cloud: { restoreBackup } }

    const result = await CloudBackupAPI.restoreCloudBackup('storage-1', 'backup-1')

    expect(result.success).toBe(false)
    expect(result.error).toContain('disk full')
    expect(restoreBackup).not.toHaveBeenCalled()
  })
})
