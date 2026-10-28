import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createBackupPayload } from '@shared/backup-integrity'
import { dataRestoreService } from '~/lib/services/data-restore.service'
import { databaseService } from '~/lib/services'
import { cloudSyncService } from '~/lib/services/cloud-sync.service'
import { localBackupService } from '~/lib/services/local-backup.service'

const data = {
  categories: [{ id: 1, uuid: 'category-1', name: 'General' }],
  prompts: [],
  promptVariables: [],
  promptHistories: [],
  aiConfigs: [],
  quickOptimizationConfigs: [],
  aiHistory: [],
  settings: [],
  syncTombstones: []
}

describe('DataRestoreService', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('rejects a corrupted backup before mutating IndexedDB', async () => {
    const payload = createBackupPayload({
      id: 'backup-1',
      name: 'backup-1',
      createdAt: new Date().toISOString(),
      data
    })
    payload.data.categories[0].name = 'Tampered'
    const replace = vi.spyOn(databaseService, 'replaceAllData')

    const result = await dataRestoreService.restore(payload, { source: 'local-file' })

    expect(result).toMatchObject({ success: false, phase: 'validate', errorCode: 'INVALID_DATA' })
    expect(replace).not.toHaveBeenCalled()
  })

  it('atomically restores valid data and suspends every enabled cloud storage', async () => {
    const safetyBackup = vi.spyOn(localBackupService, 'createSafetyBackup').mockResolvedValue({
      action: 'created',
      backup: { id: 'safety', name: 'safety', createdAt: new Date().toISOString(), size: 1 } as any,
      deletedCount: 0
    })
    vi.spyOn(databaseService, 'replaceAllData').mockResolvedValue({
      success: true,
      atomic: true,
      message: 'ok'
    })
    const suspend = vi.spyOn(cloudSyncService, 'suspendEnabledStoragesAfterRestore').mockResolvedValue([{
      storageId: 'storage-a',
      restoredAt: new Date().toISOString(),
      source: 'local-file'
    }])

    const result = await dataRestoreService.restore(data, { source: 'local-file' })

    expect(result).toMatchObject({
      success: true,
      atomic: true,
      preview: { categories: 1, total: 1 }
    })
    expect(suspend).toHaveBeenCalledWith({ source: 'local-file' })
    expect(safetyBackup).toHaveBeenCalledWith('restore')
  })

  it('backs up the current data first and cancels the restore when that backup fails', async () => {
    vi.spyOn(localBackupService, 'createSafetyBackup').mockRejectedValue(new Error('disk full'))
    const replace = vi.spyOn(databaseService, 'replaceAllData')
    const suspend = vi.spyOn(cloudSyncService, 'suspendEnabledStoragesAfterRestore')

    const result = await dataRestoreService.restore(data, { source: 'local-file' })

    expect(result).toMatchObject({ success: false, phase: 'prepare', retryable: true, error: 'disk full' })
    expect(replace).not.toHaveBeenCalled()
    expect(suspend).not.toHaveBeenCalled()
  })
})
