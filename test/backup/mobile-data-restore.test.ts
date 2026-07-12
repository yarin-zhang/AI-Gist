import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createBackupPayload } from '@shared/backup-integrity'
import { dataRestoreService } from '~/lib/services/data-restore.service'
import { databaseService } from '~/lib/services'
import { cloudSyncService } from '~/lib/services/cloud-sync.service'

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
  })
})
