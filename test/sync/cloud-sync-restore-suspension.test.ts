import { describe, expect, it, vi } from 'vitest'
import { CloudSyncService } from '~/lib/services/cloud-sync.service'
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
    const createLocalBackup = vi.fn().mockResolvedValue({
      action: 'created',
      backup: {
        id: 'local-safety-backup',
        name: 'local-safety-backup',
        description: 'Local safety backup',
        createdAt: '2026-01-01T00:00:00.000Z',
        size: 10
      },
      deletedCount: 0
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
      },
      localBackupService: { create: createLocalBackup }
    })
    await service.suspendEnabledStoragesAfterRestore({ source: 'local-file' })

    const result = await service.publishRestoredDataToCloud(config.id)

    expect(result).toMatchObject({ success: true, action: 'uploaded', uploadedRemote: true })
    expect(createLocalBackup).toHaveBeenCalledWith(expect.objectContaining({
      trigger: 'pre-restore-cloud-overwrite',
      data: remoteData
    }))
    expect(manifest.latestSnapshot?.data.syncTombstones).toEqual(expect.arrayContaining([
      expect.objectContaining({ collectionName: 'prompts', recordKey: 'uuid:remote-prompt' })
    ]))
    expect(replaceAllData).toHaveBeenCalled()
    expect(service.getRestoreSuspensions()).toEqual([])
    expect(service.getStatus()).toMatchObject({
      status: 'success',
      storageId: config.id,
      lastResult: { success: true, action: 'uploaded' },
      error: undefined
    })
  })

  it('tells status listeners a restore is waiting for a choice, even after a restart, until it is resolved', async () => {
    const storage = new MemoryStorage()
    const remoteData = {
      categories: [], prompts: [], promptVariables: [], promptHistories: [], aiConfigs: [],
      quickOptimizationConfigs: [], aiHistory: [], settings: [], syncTombstones: []
    }
    let manifest = { ...createEmptyCloudSyncManifest(), latestSnapshot: createCloudSyncSnapshot(remoteData, 'remote-device') }
    const deps = {
      storage,
      createDeviceId: () => 'desktop-device',
      configClient: { getStorageConfigs: vi.fn().mockResolvedValue([config]) },
      cloudClient: {
        getCloudSyncManifest: vi.fn().mockImplementation(async () => manifest),
        saveCloudSyncManifest: vi.fn().mockImplementation(async (_storageId, nextManifest) => {
          manifest = nextManifest
          return { success: true }
        })
      },
      database: {
        exportAllDataForSync: vi.fn().mockResolvedValue({ success: true, data: remoteData }),
        replaceAllData: vi.fn().mockResolvedValue({ success: true, atomic: true, message: 'ok' })
      },
      localBackupService: { create: vi.fn().mockResolvedValue({ action: 'created', deletedCount: 0 }) }
    }
    const service = new CloudSyncService(deps)
    const seen: (boolean | undefined)[] = []
    service.onStatusChange(status => seen.push(status.restoreDecisionPending))

    await service.suspendEnabledStoragesAfterRestore({ source: 'local-file' })
    expect(service.getStatus().restoreDecisionPending).toBe(true)
    // 桌面端恢复云端备份后会重新载入页面：状态 paused 没了，等选择这件事还在
    expect(new CloudSyncService(deps).getStatus()).toMatchObject({ status: 'idle', restoreDecisionPending: true })

    await service.publishRestoredDataToCloud(config.id)
    expect(service.getStatus().restoreDecisionPending).toBe(false)
    expect(seen.at(-1)).toBe(false)
  })

  it('keeps waiting when merging after a restore fails, and the status says so', async () => {
    const storage = new MemoryStorage()
    const service = new CloudSyncService({
      storage,
      configClient: { getStorageConfigs: vi.fn().mockResolvedValue([config]) },
      cloudClient: {
        getCloudSyncManifest: vi.fn().mockRejectedValue(new Error('getaddrinfo ENOTFOUND dav.example.com')),
        saveCloudSyncManifest: vi.fn()
      },
      database: {
        exportAllDataForSync: vi.fn().mockResolvedValue({ success: true, data: {} }),
        replaceAllData: vi.fn()
      }
    })
    await service.suspendEnabledStoragesAfterRestore({ source: 'local-file' })

    const result = await service.resumeRestoreWithMerge(config.id)

    expect(result.success).toBe(false)
    expect(service.getPendingRestoreDecisions()).toEqual([expect.objectContaining({ storageId: config.id })])
    expect(service.getStatus().restoreDecisionPending).toBe(true)
  })

  it('only waits on storages that still exist and are enabled', async () => {
    const storage = new MemoryStorage()
    const other = { ...config, id: 'storage-b', name: 'NAS' }
    const service = new CloudSyncService({
      storage,
      configClient: { getStorageConfigs: vi.fn().mockResolvedValue([config, other]) },
      cloudClient: { getCloudSyncManifest: vi.fn(), saveCloudSyncManifest: vi.fn() },
      database: { exportAllDataForSync: vi.fn(), replaceAllData: vi.fn() }
    })
    await service.suspendEnabledStoragesAfterRestore({ source: 'cloud-backup' })
    expect(service.getPendingRestoreDecisions().map(item => item.storageId)).toEqual([config.id, other.id])

    // 停用的存储不同步，先不用选；重新启用后还要选
    await service.refreshStorageAvailability([{ ...config, enabled: false }, other])
    expect(service.getPendingRestoreDecisions().map(item => item.storageId)).toEqual([other.id])
    await service.refreshStorageAvailability([config, other])
    expect(service.getPendingRestoreDecisions().map(item => item.storageId)).toEqual([config.id, other.id])

    // 删掉的存储不再等选择，重启后也不会回来
    await service.refreshStorageAvailability([other])
    expect(service.getRestoreSuspensions().map(item => item.storageId)).toEqual([other.id])
    const restarted = new CloudSyncService({
      storage,
      configClient: { getStorageConfigs: vi.fn().mockResolvedValue([other]) },
      cloudClient: { getCloudSyncManifest: vi.fn(), saveCloudSyncManifest: vi.fn() },
      database: { exportAllDataForSync: vi.fn(), replaceAllData: vi.fn() }
    })
    expect(restarted.getRestoreSuspensions().map(item => item.storageId)).toEqual([other.id])
  })
})
