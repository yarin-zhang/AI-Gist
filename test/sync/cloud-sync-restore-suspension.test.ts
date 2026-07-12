import { describe, expect, it, vi } from 'vitest'
import { CloudSyncService } from '~/lib/services/cloud-sync.service'
import { CloudBackupAPI } from '~/lib/api/cloud-backup.api'
import { createEmptyCloudSyncManifest } from '@shared/cloud-sync-manifest'
import { createCloudSyncSnapshot } from '@shared/cloud-sync-engine'

class MemoryStorage implements Storage {
  private values = new Map<string, string>()
  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) || null }
  key(index: number) { return [...this.values.keys()][index] || null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, value) }
}

const config = {
  id: 'storage-a',
  name: 'WebDAV',
  type: 'webdav' as const,
  enabled: true,
  url: 'https://dav.example.com',
  username: 'user',
  password: 'pass',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
}

describe('CloudSyncService restore suspensions', () => {
  it('persists restore suspension and blocks manual or automatic sync until resolved', async () => {
    const storage = new MemoryStorage()
    const getManifest = vi.fn()
    const deps = {
      storage,
      configClient: { getStorageConfigs: vi.fn().mockResolvedValue([config]) },
      cloudClient: {
        getCloudSyncManifest: getManifest,
        saveCloudSyncManifest: vi.fn()
      },
      database: {
        exportAllDataForSync: vi.fn(),
        replaceAllData: vi.fn()
      }
    }
    const service = new CloudSyncService(deps)

    await service.suspendEnabledStoragesAfterRestore({ source: 'cloud-backup', backupId: 'backup-1' })
    const blocked = await service.syncNow(config.id, { reason: 'manual' })

    expect(blocked).toMatchObject({
      success: false,
      errorCode: 'RESTORE_DECISION_REQUIRED'
    })
    expect(getManifest).not.toHaveBeenCalled()

    const restoredService = new CloudSyncService(deps)
    expect(restoredService.getRestoreSuspensions()).toEqual([
      expect.objectContaining({ storageId: config.id, backupId: 'backup-1', source: 'cloud-backup' })
    ])
  })

  it('creates a safety backup and publishes tombstones when restored data overwrites cloud', async () => {
    const storage = new MemoryStorage()
    const emptyData = {
      categories: [], prompts: [], promptVariables: [], promptHistories: [], aiConfigs: [],
      quickOptimizationConfigs: [], aiHistory: [], settings: [], syncTombstones: []
    }
    const remoteData = {
      ...emptyData,
      prompts: [{ id: 1, uuid: 'remote-prompt', title: 'Remote prompt', updatedAt: '2026-01-01T00:00:00.000Z' }]
    }
    let manifest = {
      ...createEmptyCloudSyncManifest(),
      latestSnapshot: createCloudSyncSnapshot(remoteData, 'remote-device')
    }
    const replaceAllData = vi.fn().mockResolvedValue({ success: true, atomic: true, message: 'ok' })
    const saveManifest = vi.fn().mockImplementation(async (_storageId, nextManifest) => {
      manifest = nextManifest
      return { success: true }
    })
    vi.spyOn(CloudBackupAPI, 'createCloudBackup').mockResolvedValue({
      success: true,
      message: 'safety backup created'
    })
    const service = new CloudSyncService({
      storage,
      createDeviceId: () => 'mobile-device',
      configClient: { getStorageConfigs: vi.fn().mockResolvedValue([config]) },
      cloudClient: {
        getCloudSyncManifest: vi.fn().mockImplementation(async () => manifest),
        saveCloudSyncManifest: saveManifest
      },
      database: {
        exportAllDataForSync: vi.fn().mockResolvedValue({ success: true, data: emptyData }),
        replaceAllData
      }
    })
    await service.suspendEnabledStoragesAfterRestore({ source: 'local-file' })

    const result = await service.publishRestoredDataToCloud(config.id)

    expect(result).toMatchObject({ success: true, action: 'uploaded', uploadedRemote: true })
    expect(CloudBackupAPI.createCloudBackup).toHaveBeenCalledWith(config.id, expect.objectContaining({
      trigger: 'pre-restore-cloud-overwrite',
      data: remoteData
    }))
    expect(manifest.latestSnapshot?.data.syncTombstones).toEqual(expect.arrayContaining([
      expect.objectContaining({ collectionName: 'prompts', recordKey: 'uuid:remote-prompt' })
    ]))
    expect(replaceAllData).toHaveBeenCalled()
    expect(service.getRestoreSuspensions()).toEqual([])
  })
})
