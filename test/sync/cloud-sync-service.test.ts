import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  CloudSyncService,
  DEFAULT_CLOUD_SYNC_INTERVAL_MINUTES,
  getCloudSyncErrorDiagnosis,
  getFriendlyCloudSyncError,
  type CloudSyncServiceDeps
} from '~/lib/services/cloud-sync.service'
import { emitDataChange } from '~/lib/services/data-change-events'
import {
  createCloudSyncDataChecksum,
  createCloudSyncSemanticChecksum,
  createCloudSyncSnapshot
} from '@shared/cloud-sync-engine'
import {
  assertValidCloudSyncManifest,
  createEmptyCloudSyncManifest
} from '@shared/cloud-sync-manifest'
import {
  assertValidCloudSyncSnapshotFile,
  createCloudSyncSnapshotFile
} from '@shared/cloud-sync-snapshots'

class MemoryStorage {
  private values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) || null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }
}

const baseData = {
  categories: [{ id: 1, uuid: 'cat-1', name: 'Base', updatedAt: '2026-01-01T00:00:00.000Z' }],
  prompts: [{ id: 1, uuid: 'prompt-1', title: 'Base', updatedAt: '2026-01-01T00:00:00.000Z' }],
  promptVariables: [],
  promptHistories: [],
  aiConfigs: [],
  quickOptimizationConfigs: [],
  aiHistory: [],
  settings: [],
  syncTombstones: []
}

const enabledWebDAVConfig = {
  id: 'cfg-1',
  name: 'WebDAV',
  type: 'webdav' as const,
  enabled: true,
  url: 'http://127.0.0.1/webdav',
  username: 'user',
  password: 'pass',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z'
}

function createService(
  data: any,
  manifest = createEmptyCloudSyncManifest('2026-01-01T00:00:00.000Z'),
  extraDeps: CloudSyncServiceDeps = {}
) {
  const storage = new MemoryStorage()
  let cloudManifest = manifest
  const cloudClient = {
    getCloudSyncManifest: vi.fn().mockImplementation(async () => cloudManifest),
    saveCloudSyncManifest: vi.fn().mockImplementation(async (_storageId: string, nextManifest: any) => {
      cloudManifest = nextManifest
      return { success: true }
    })
  }
  const database = {
    exportAllDataForSync: vi.fn().mockResolvedValue({
      success: true,
      message: 'ok',
      data
    }),
    replaceAllData: vi.fn().mockResolvedValue({
      success: true,
      message: 'ok'
    })
  }
  const service = new CloudSyncService({
    cloudClient,
    database,
    storage,
    createDeviceId: () => 'device-a',
    ...extraDeps
  })

  return {
    service,
    cloudClient,
    database,
    storage
  }
}

describe('CloudSyncService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('uploads a local snapshot when the cloud manifest is empty', async () => {
    const { service, cloudClient, storage } = createService(baseData)

    const result = await service.syncNow('cfg-1', {
      deviceName: 'iPhone',
      platform: 'ios'
    })

    expect(result.success, JSON.stringify(result, null, 2)).toBe(true)
    expect(result.action).toBe('uploaded')
    expect(cloudClient.saveCloudSyncManifest).toHaveBeenCalledTimes(1)
    const savedManifest = cloudClient.saveCloudSyncManifest.mock.calls[0][1]
    expect(savedManifest.latestSnapshot.data.prompts[0].uuid).toBe('prompt-1')
    expect(savedManifest.devices['device-a']).toMatchObject({
      deviceName: 'iPhone',
      platform: 'ios'
    })
    expect(storage.getItem('ai_gist_cloud_sync_state:cfg-1')).toContain(savedManifest.latestSnapshot.revision)
  })

  it('keeps a successful v1 result when an enabled v2 shadow publish fails', async () => {
    const v2Coordinator = {
      mirrorSuccessfulV1Sync: vi.fn().mockResolvedValue({
        status: 'failed',
        warning: '后台完整性验证失败（network）；正式同步结果不受影响'
      }),
      getRolloutState: vi.fn(),
      setRolloutMode: vi.fn()
    }
    const { service } = createService(baseData, undefined, { v2Coordinator: v2Coordinator as any })

    const result = await service.syncNow('cfg-1', { reason: 'manual' })

    expect(result.success).toBe(true)
    expect(result.action).toBe('uploaded')
    expect(result.v2MirrorStatus).toBe('failed')
    expect(result.warnings).toContain('后台完整性验证失败（network）；正式同步结果不受影响')
  })

  it('keeps a successful v1 result when the v2 coordinator itself throws', async () => {
    const v2Coordinator = {
      mirrorSuccessfulV1Sync: vi.fn().mockRejectedValue(new DOMException('quota', 'QuotaExceededError')),
      getRolloutState: vi.fn(),
      setRolloutMode: vi.fn()
    }
    const { service } = createService(baseData, undefined, { v2Coordinator: v2Coordinator as any })

    const result = await service.syncNow('cfg-1', { reason: 'manual' })

    expect(result).toMatchObject({ success: true, action: 'uploaded', v2MirrorStatus: 'failed' })
    expect(result.warnings).toContain('后台完整性验证状态记录失败；正式同步已成功且不受影响')
  })

  it('fails before upload when the local sync export is missing a required collection', async () => {
    const incompleteLocalData = { ...baseData }
    delete (incompleteLocalData as any).promptHistories
    const { service, cloudClient, database } = createService(incompleteLocalData)

    const result = await service.syncNow('cfg-1', { reason: 'manual' })

    expect(result.success).toBe(false)
    expect(result.error).toContain('本机同步数据导出不完整')
    expect(result.error).toContain('snapshot data missing collection promptHistories')
    expect(cloudClient.saveCloudSyncManifest).not.toHaveBeenCalled()
    expect(database.replaceAllData).not.toHaveBeenCalled()
  })

  it('fails before upload when the local sync export contains duplicate record keys', async () => {
    const duplicateLocalData = {
      ...baseData,
      prompts: [
        baseData.prompts[0],
        {
          ...baseData.prompts[0],
          id: 2,
          title: 'Duplicate prompt should never overwrite cloud data'
        }
      ]
    }
    const { service, cloudClient, database } = createService(duplicateLocalData)

    const result = await service.syncNow('cfg-1', { reason: 'manual' })

    expect(result.success).toBe(false)
    expect(result.error).toContain('本机同步数据导出不完整')
    expect(result.error).toContain('snapshot data prompts has duplicate record key uuid:prompt-1')
    expect(cloudClient.saveCloudSyncManifest).not.toHaveBeenCalled()
    expect(database.replaceAllData).not.toHaveBeenCalled()
  })

  it('does not create new revisions on repeated manual sync when local data only differs by JSON shape', async () => {
    const localDataWithJsonDrift = {
      ...baseData,
      prompts: [{
        ...baseData.prompts[0],
        optional: undefined,
        nested: {
          keep: 'value',
          drop: undefined
        },
        values: [undefined, 'kept']
      }]
    }
    const { service, cloudClient } = createService(localDataWithJsonDrift)

    const first = await service.syncNow('cfg-1', { reason: 'manual' })
    const second = await service.syncNow('cfg-1', { reason: 'manual' })
    const third = await service.syncNow('cfg-1', { reason: 'manual' })

    expect(first.success).toBe(true)
    expect(first.action).toBe('uploaded')
    expect(second.success).toBe(true)
    expect(second.action).toBe('noop')
    expect(third.success).toBe(true)
    expect(third.action).toBe('noop')
    expect(cloudClient.saveCloudSyncManifest).toHaveBeenCalledTimes(1)
  })

  it('twelve unchanged polling intervals create no additional snapshot, manifest, or v2 publications', async () => {
    let cloudManifest = createEmptyCloudSyncManifest('2026-01-01T00:00:00.000Z')
    const snapshots = new Map<string, any>()
    const cloudClient = {
      getCloudSyncManifest: vi.fn(async () => cloudManifest),
      saveCloudSyncSnapshot: vi.fn(async (_storageId: string, snapshot: any) => {
        snapshots.set(snapshot.revision, snapshot)
        return { success: true }
      }),
      readCloudSyncSnapshot: vi.fn(async (_storageId: string, target: any) => {
        const revision = typeof target === 'string' ? target : target.revision
        const snapshot = snapshots.get(revision)
        if (!snapshot) throw new Error('snapshot not found')
        return snapshot
      }),
      listCloudSyncSnapshots: vi.fn(async () => [...snapshots.values()].map(snapshot => ({
        revision: snapshot.revision,
        path: `/AI-Gist-Backup/sync/snapshots/${snapshot.revision}.json`,
        modifiedAt: snapshot.createdAt
      }))),
      deleteCloudSyncSnapshot: vi.fn(async (_storageId: string, target: any) => {
        snapshots.delete(typeof target === 'string' ? target : target.revision)
        return { success: true }
      }),
      saveCloudSyncManifest: vi.fn(async (_storageId: string, manifest: any) => {
        cloudManifest = manifest
        return { success: true }
      })
    }
    const v2Coordinator = {
      mirrorSuccessfulV1Sync: vi.fn().mockResolvedValue({ status: 'already-current' }),
      getRolloutState: vi.fn(),
      setRolloutMode: vi.fn()
    }
    const database = {
      exportAllDataForSync: vi.fn().mockResolvedValue({ success: true, message: 'ok', data: baseData }),
      replaceAllData: vi.fn().mockResolvedValue({ success: true, message: 'ok' })
    }
    const service = new CloudSyncService({
      cloudClient,
      database,
      storage: new MemoryStorage(),
      createDeviceId: () => 'device-a',
      v2Coordinator: v2Coordinator as any
    })

    const first = await service.syncNow('cfg-1', { reason: 'interval' })
    expect(first).toMatchObject({ success: true, action: 'uploaded' })
    expect(cloudClient.saveCloudSyncSnapshot).not.toHaveBeenCalled()
    expect(cloudClient.saveCloudSyncManifest).toHaveBeenCalledTimes(1)
    expect(v2Coordinator.mirrorSuccessfulV1Sync).toHaveBeenCalledTimes(1)

    cloudClient.saveCloudSyncSnapshot.mockClear()
    cloudClient.saveCloudSyncManifest.mockClear()
    cloudClient.listCloudSyncSnapshots.mockClear()
    cloudClient.deleteCloudSyncSnapshot.mockClear()
    v2Coordinator.mirrorSuccessfulV1Sync.mockClear()

    const unchangedResults = []
    for (let index = 0; index < 12; index += 1) {
      unchangedResults.push(await service.syncNow('cfg-1', { reason: 'interval' }))
    }

    expect(unchangedResults.every(result => result.success && result.action === 'noop')).toBe(true)
    expect(cloudClient.saveCloudSyncSnapshot).not.toHaveBeenCalled()
    expect(cloudClient.saveCloudSyncManifest).not.toHaveBeenCalled()
    expect(cloudClient.listCloudSyncSnapshots).not.toHaveBeenCalled()
    expect(cloudClient.deleteCloudSyncSnapshot).not.toHaveBeenCalled()
    expect(v2Coordinator.mirrorSuccessfulV1Sync).not.toHaveBeenCalled()
  })

  it('a startup no-op leaves legacy sync snapshots untouched', async () => {
    const currentSnapshot = createCloudSyncSnapshot(baseData, 'device-b', 'snapshot-0')
    const manifest = {
      ...createEmptyCloudSyncManifest('2026-06-01T00:00:00.000Z'),
      latestSnapshot: currentSnapshot,
      baseSnapshot: currentSnapshot
    }
    let snapshots = Array.from({ length: 25 }, (_, index) => ({
      revision: `snapshot-${index}`,
      path: `/AI-Gist-Backup/sync/snapshots/snapshot-${index}.json`,
      modifiedAt: new Date(Date.UTC(2026, 5, 1, 0, 0, 25 - index)).toISOString()
    }))
    const cloudClient = {
      getCloudSyncManifest: vi.fn().mockResolvedValue(manifest),
      saveCloudSyncManifest: vi.fn().mockResolvedValue({ success: true }),
      listCloudSyncSnapshots: vi.fn(async () => snapshots),
      deleteCloudSyncSnapshot: vi.fn(async (_storageId: string, target: any) => {
        const revision = typeof target === 'string' ? target : target.revision
        snapshots = snapshots.filter(snapshot => snapshot.revision !== revision)
        return { success: true }
      })
    }
    const settings = {
      getNumberValue: vi.fn(async (key: string, fallback: number) =>
        key === 'cloud.backup.auto.retention' ? 5 : fallback
      ),
      setNumberValue: vi.fn()
    }
    const { service } = createService(baseData, manifest, { cloudClient, settings })

    const result = await service.syncNow('cfg-1', { reason: 'startup' })

    expect(result).toMatchObject({ success: true, action: 'noop', uploadedRemote: false })
    expect(cloudClient.saveCloudSyncManifest).not.toHaveBeenCalled()
    expect(cloudClient.listCloudSyncSnapshots).not.toHaveBeenCalled()
    expect(cloudClient.deleteCloudSyncSnapshot).not.toHaveBeenCalled()
    expect(snapshots).toHaveLength(25)
    expect(snapshots.some(snapshot => snapshot.revision === currentSnapshot.revision)).toBe(true)
  })

  it('does not perform legacy snapshot retention maintenance during no-op syncs', async () => {
    const currentSnapshot = createCloudSyncSnapshot(baseData, 'device-b', 'snapshot-current')
    const manifest = {
      ...createEmptyCloudSyncManifest('2026-06-01T00:00:00.000Z'),
      latestSnapshot: currentSnapshot,
      baseSnapshot: currentSnapshot
    }
    const snapshots = [
      {
        revision: currentSnapshot.revision,
        path: '/AI-Gist-Backup/sync/snapshots/snapshot-current.json',
        modifiedAt: '2026-06-01T00:00:02.000Z'
      },
      {
        revision: 'snapshot-stale',
        path: '/AI-Gist-Backup/sync/snapshots/snapshot-stale.json',
        modifiedAt: '2026-06-01T00:00:01.000Z'
      }
    ]
    const cloudClient = {
      getCloudSyncManifest: vi.fn().mockResolvedValue(manifest),
      saveCloudSyncManifest: vi.fn().mockResolvedValue({ success: true }),
      listCloudSyncSnapshots: vi.fn().mockResolvedValue(snapshots),
      deleteCloudSyncSnapshot: vi.fn().mockResolvedValue({ success: false, error: 'delete denied' })
    }
    const settings = {
      getNumberValue: vi.fn(async (key: string, fallback: number) =>
        key === 'cloud.backup.auto.retention' ? 1 : fallback
      ),
      setNumberValue: vi.fn()
    }
    const { service } = createService(baseData, manifest, { cloudClient, settings })

    const first = await service.syncNow('cfg-1', { reason: 'startup' })
    const second = await service.syncNow('cfg-1', { reason: 'interval' })

    expect(first).toMatchObject({ success: true, action: 'noop' })
    expect(second).toMatchObject({ success: true, action: 'noop' })
    expect(first.warnings).toBeUndefined()
    expect(cloudClient.listCloudSyncSnapshots).not.toHaveBeenCalled()
    expect(cloudClient.deleteCloudSyncSnapshot).not.toHaveBeenCalled()
    expect(cloudClient.saveCloudSyncManifest).not.toHaveBeenCalled()
  })

  it('does not upload when a new device has only regenerated local numeric ids', async () => {
    const remoteData = {
      categories: [
        { id: 1, uuid: 'cat-real', name: 'Real', updatedAt: '2026-06-12T00:00:00.000Z' }
      ],
      prompts: [
        {
          id: 10,
          uuid: 'prompt-real',
          title: 'Real prompt',
          content: 'Hello {{tone}}',
          categoryId: 1,
          category: { id: 1, uuid: 'cat-real', name: 'Real' },
          variables: [
            { id: 100, uuid: 'var-real', promptId: 10, name: 'tone', updatedAt: '2026-06-12T00:00:00.000Z' }
          ],
          updatedAt: '2026-06-12T00:00:00.000Z'
        }
      ],
      promptVariables: [
        { id: 100, uuid: 'var-real', promptId: 10, name: 'tone', updatedAt: '2026-06-12T00:00:00.000Z' }
      ],
      promptHistories: [
        { id: 1000, uuid: 'history-real', promptId: 10, promptUuid: 'prompt-real', content: 'History' }
      ],
      aiConfigs: [],
      quickOptimizationConfigs: [],
      aiHistory: [],
      settings: [{ id: 1, key: 'theme', value: 'dark', type: 'string' }],
      syncTombstones: []
    }
    const localData = {
      ...remoteData,
      categories: [
        { ...remoteData.categories[0], id: 501 }
      ],
      prompts: [
        {
          ...remoteData.prompts[0],
          id: 601,
          categoryId: 501,
          category: { ...remoteData.prompts[0].category, id: 501 },
          variables: [
            { ...remoteData.prompts[0].variables[0], id: 701, promptId: 601 }
          ]
        }
      ],
      promptVariables: [
        { ...remoteData.promptVariables[0], id: 701, promptId: 601 }
      ],
      promptHistories: [
        { ...remoteData.promptHistories[0], id: 801, promptId: 601 }
      ],
      settings: [{ id: 901, key: 'theme', value: 'dark', type: 'string' }]
    }
    const remoteSnapshot = createCloudSyncSnapshot(remoteData, 'device-a', 'rev-remote')
    const manifest = {
      ...createEmptyCloudSyncManifest('2026-06-12T00:00:00.000Z'),
      latestSnapshot: remoteSnapshot,
      baseSnapshot: remoteSnapshot
    }
    const { service, cloudClient, database } = createService(localData, manifest, {
      createDeviceId: () => 'device-b'
    })

    const result = await service.syncNow('cfg-1', {
      deviceName: 'Web Device',
      platform: 'web',
      reason: 'manual'
    })

    expect(result).toMatchObject({
      success: true,
      action: 'noop',
      uploadedRemote: false,
      appliedLocal: false
    })
    expect(cloudClient.saveCloudSyncManifest).not.toHaveBeenCalled()
    expect(database.replaceAllData).not.toHaveBeenCalled()
  })

  it('publishes changed data only through the current manifest state', async () => {
    const storage = new MemoryStorage()
    let cloudManifest = createEmptyCloudSyncManifest('2026-01-01T00:00:00.000Z')
    const savedSnapshots = new Map<string, any>()
    const callOrder: string[] = []
    const cloudClient = {
      getCloudSyncManifest: vi.fn().mockImplementation(async () => cloudManifest),
      saveCloudSyncSnapshot: vi.fn().mockImplementation(async (_storageId: string, snapshot: any) => {
        callOrder.push('snapshot')
        savedSnapshots.set(snapshot.revision, snapshot)
        return { success: true }
      }),
      readCloudSyncSnapshot: vi.fn().mockImplementation(async (_storageId: string, revision: string) => {
        const snapshot = savedSnapshots.get(revision)
        if (!snapshot) {
          throw new Error('snapshot not found')
        }
        return snapshot
      }),
      listCloudSyncSnapshots: vi.fn().mockResolvedValue([]),
      saveCloudSyncManifest: vi.fn().mockImplementation(async (_storageId: string, manifest: any) => {
        callOrder.push('manifest')
        cloudManifest = manifest
        return { success: true }
      })
    }
    const database = {
      exportAllDataForSync: vi.fn().mockResolvedValue({
        success: true,
        message: 'ok',
        data: baseData
      }),
      replaceAllData: vi.fn().mockResolvedValue({
        success: true,
        message: 'ok'
      })
    }
    const service = new CloudSyncService({
      cloudClient,
      database,
      storage,
      createDeviceId: () => 'device-a'
    })

    const result = await service.syncNow('cfg-1')

    expect(result.success).toBe(true)
    expect(callOrder).toEqual(['manifest'])
    expect(savedSnapshots.size).toBe(0)
    expect(cloudManifest.baseSnapshot).toBeUndefined()
    expect(cloudClient.getCloudSyncManifest).toHaveBeenCalledTimes(3)
  })

  it('keeps checksums stable across real JSON snapshot and manifest round trips', async () => {
    const storage = new MemoryStorage()
    const localData = {
      ...baseData,
      prompts: [
        {
          ...baseData.prompts[0],
          optional: undefined,
          nested: {
            keep: 'value',
            drop: undefined
          },
          values: [undefined, 'kept']
        }
      ]
    }
    let cloudManifest = createEmptyCloudSyncManifest('2026-01-01T00:00:00.000Z')
    const savedSnapshotFiles = new Map<string, any>()
    const cloudClient = {
      getCloudSyncManifest: vi.fn().mockImplementation(async () =>
        assertValidCloudSyncManifest(JSON.parse(JSON.stringify(cloudManifest)))
      ),
      saveCloudSyncSnapshot: vi.fn().mockImplementation(async (_storageId: string, snapshot: any) => {
        savedSnapshotFiles.set(snapshot.revision, JSON.parse(JSON.stringify(createCloudSyncSnapshotFile(snapshot))))
        return { success: true }
      }),
      readCloudSyncSnapshot: vi.fn().mockImplementation(async (_storageId: string, revision: string) => {
        const snapshotFile = savedSnapshotFiles.get(revision)
        if (!snapshotFile) {
          throw new Error('snapshot not found')
        }
        return assertValidCloudSyncSnapshotFile(JSON.parse(JSON.stringify(snapshotFile)))
      }),
      listCloudSyncSnapshots: vi.fn().mockResolvedValue([]),
      saveCloudSyncManifest: vi.fn().mockImplementation(async (_storageId: string, manifest: any) => {
        cloudManifest = assertValidCloudSyncManifest(JSON.parse(JSON.stringify(manifest)))
        return { success: true }
      })
    }
    const database = {
      exportAllDataForSync: vi.fn().mockResolvedValue({
        success: true,
        message: 'ok',
        data: localData
      }),
      replaceAllData: vi.fn().mockResolvedValue({
        success: true,
        message: 'ok'
      })
    }
    const service = new CloudSyncService({
      cloudClient,
      database,
      storage,
      createDeviceId: () => 'device-a'
    })

    const result = await service.syncNow('cfg-1')

    expect(result.success).toBe(true)
    expect(result.error).toBeUndefined()
    expect(cloudManifest.latestSnapshot?.data.prompts?.[0]).not.toHaveProperty('optional')
    expect(cloudManifest.latestSnapshot?.data.prompts?.[0].nested).not.toHaveProperty('drop')
    expect(cloudManifest.latestSnapshot?.data.prompts?.[0].values).toEqual([null, 'kept'])
    expect(cloudManifest.latestSnapshot?.dataChecksum).toBe(
      createCloudSyncDataChecksum(cloudManifest.latestSnapshot!.data)
    )
  })

  it('recovers a corrupt manifest from the newest remote snapshot file', async () => {
    const storage = new MemoryStorage()
    const remoteSnapshot = createCloudSyncSnapshot(baseData, 'device-b', 'rev-from-file')
    const savedSnapshots: any[] = []
    const savedManifests: any[] = []
    let recoveredManifest: any
    const cloudClient = {
      getCloudSyncManifest: vi.fn().mockImplementation(async () => {
        if (recoveredManifest) {
          return recoveredManifest
        }

        throw new Error('读取云同步 manifest 失败，且备份副本不可用: sync-manifest.json snapshot data checksum mismatch')
      }),
      listCloudSyncSnapshots: vi.fn().mockResolvedValue([{
        revision: remoteSnapshot.revision,
        path: '/AI-Gist-Backup/sync/snapshots/rev-from-file.json',
        modifiedAt: '2026-01-02T00:00:00.000Z'
      }]),
      readCloudSyncSnapshot: vi.fn().mockResolvedValue(remoteSnapshot),
      saveCloudSyncSnapshot: vi.fn().mockImplementation(async (_storageId: string, snapshot: any) => {
        savedSnapshots.push(snapshot)
        return { success: true }
      }),
      saveCloudSyncManifest: vi.fn().mockImplementation(async (_storageId: string, manifest: any) => {
        savedManifests.push(manifest)
        recoveredManifest = manifest
        return { success: true }
      })
    }
    const database = {
      exportAllDataForSync: vi.fn().mockResolvedValue({
        success: true,
        message: 'ok',
        data: baseData
      }),
      replaceAllData: vi.fn().mockResolvedValue({
        success: true,
        message: 'ok'
      })
    }
    const service = new CloudSyncService({
      cloudClient,
      database,
      storage,
      createDeviceId: () => 'device-a'
    })

    const result = await service.syncNow('cfg-1')

    expect(result.success).toBe(true)
    expect(result.remoteRevision).toBe('rev-from-file')
    expect(cloudClient.listCloudSyncSnapshots).toHaveBeenCalledTimes(1)
    expect(savedSnapshots).toHaveLength(0)
    expect(savedManifests[0].latestSnapshot.revision).toBe('rev-from-file')
    expect(database.replaceAllData).not.toHaveBeenCalled()
  })

  it('does not promote loose snapshot files over a readable manifest pointer', async () => {
    const oldSnapshot = {
      ...createCloudSyncSnapshot(baseData, 'device-b', 'rev-old'),
      createdAt: '2026-01-01T00:00:00.000Z'
    }
    const newerData = {
      ...baseData,
      prompts: [{ ...baseData.prompts[0], title: 'New file snapshot', updatedAt: '2026-01-02T00:00:00.000Z' }]
    }
    const newerSnapshot = {
      ...createCloudSyncSnapshot(newerData, 'device-b', 'rev-new-file'),
      createdAt: '2026-01-02T00:00:00.000Z'
    }
    let cloudManifest = {
      ...createEmptyCloudSyncManifest('2026-01-01T00:00:00.000Z'),
      latestSnapshot: oldSnapshot,
      baseSnapshot: oldSnapshot
    }
    const savedManifests: any[] = []
    const savedSnapshots: any[] = []
    const cloudClient = {
      getCloudSyncManifest: vi.fn().mockImplementation(async () => cloudManifest),
      listCloudSyncSnapshots: vi.fn().mockResolvedValue([{
        revision: newerSnapshot.revision,
        path: '/AI-Gist-Backup/sync/snapshots/rev-new-file.json',
        modifiedAt: '2026-01-02T00:00:00.000Z'
      }]),
      readCloudSyncSnapshot: vi.fn().mockImplementation(async (_storageId: string, snapshot: any) => {
        const revision = typeof snapshot === 'string' ? snapshot : snapshot.revision
        return savedSnapshots.find(savedSnapshot => savedSnapshot.revision === revision) || newerSnapshot
      }),
      saveCloudSyncSnapshot: vi.fn().mockImplementation(async (_storageId: string, snapshot: any) => {
        savedSnapshots.push(snapshot)
        return { success: true }
      }),
      saveCloudSyncManifest: vi.fn().mockImplementation(async (_storageId: string, manifest: any) => {
        savedManifests.push(manifest)
        cloudManifest = manifest
        return { success: true }
      })
    }
    const database = {
      exportAllDataForSync: vi.fn().mockResolvedValue({
        success: true,
        message: 'ok',
        data: newerData
      }),
      replaceAllData: vi.fn().mockResolvedValue({
        success: true,
        message: 'ok'
      })
    }
    const service = new CloudSyncService({
      cloudClient,
      database,
      storage: new MemoryStorage(),
      createDeviceId: () => 'device-a'
    })

    const result = await service.syncNow('cfg-1')

    expect(result.success, JSON.stringify(result, null, 2)).toBe(true)
    expect(result.action).toBe('uploaded')
    expect(result.remoteRevision).not.toBe('rev-new-file')
    expect(cloudClient.listCloudSyncSnapshots).not.toHaveBeenCalled()
    expect(cloudClient.readCloudSyncSnapshot).not.toHaveBeenCalledWith('cfg-1', 'rev-new-file')
    expect(cloudClient.readCloudSyncSnapshot).not.toHaveBeenCalledWith(
      'cfg-1',
      expect.objectContaining({ revision: 'rev-new-file' })
    )
    expect(savedManifests[0].latestSnapshot.revision).not.toBe('rev-new-file')
    expect(savedManifests[0].latestSnapshot.data.prompts[0].title).toBe('New file snapshot')
    expect(cloudClient.saveCloudSyncSnapshot).not.toHaveBeenCalled()
    expect(database.replaceAllData).not.toHaveBeenCalled()
  })

  it('does not inspect a matching legacy snapshot file when the manifest is readable', async () => {
    const remoteSnapshot = createCloudSyncSnapshot(baseData, 'device-b', 'rev-shared')
    const corruptedData = {
      ...baseData,
      prompts: [
        { ...baseData.prompts[0], title: 'Corrupted inline manifest copy' }
      ],
      promptHistories: []
    }
    const corruptedSnapshot = {
      ...remoteSnapshot,
      data: corruptedData,
      dataChecksum: createCloudSyncDataChecksum(corruptedData),
      contentChecksum: createCloudSyncSemanticChecksum(corruptedData)
    }
    let cloudManifest = {
      ...createEmptyCloudSyncManifest('2026-01-02T00:00:00.000Z'),
      latestSnapshot: corruptedSnapshot,
      baseSnapshot: corruptedSnapshot
    }
    const savedManifests: any[] = []
    const cloudClient = {
      getCloudSyncManifest: vi.fn().mockImplementation(async () => cloudManifest),
      listCloudSyncSnapshots: vi.fn().mockResolvedValue([]),
      readCloudSyncSnapshot: vi.fn().mockImplementation(async (_storageId: string, revision: string) => {
        if (revision !== 'rev-shared') {
          throw new Error('snapshot not found')
        }

        return remoteSnapshot
      }),
      saveCloudSyncSnapshot: vi.fn().mockResolvedValue({ success: true }),
      saveCloudSyncManifest: vi.fn().mockImplementation(async (_storageId: string, manifest: any) => {
        savedManifests.push(manifest)
        cloudManifest = manifest
        return { success: true }
      })
    }
    const database = {
      exportAllDataForSync: vi.fn().mockResolvedValue({
        success: true,
        message: 'ok',
        data: {
          categories: [],
          prompts: [],
          promptVariables: [],
          promptHistories: [],
          aiConfigs: [],
          quickOptimizationConfigs: [],
          aiHistory: [],
          settings: [],
          syncTombstones: []
        }
      }),
      replaceAllData: vi.fn().mockResolvedValue({
        success: true,
        message: 'ok'
      })
    }
    const service = new CloudSyncService({
      cloudClient,
      database,
      storage: new MemoryStorage(),
      createDeviceId: () => 'device-a'
    })

    const result = await service.syncNow('cfg-1')

    expect(result.success).toBe(true)
    expect(result.action).toBe('downloaded')
    expect(cloudClient.listCloudSyncSnapshots).not.toHaveBeenCalled()
    expect(cloudClient.readCloudSyncSnapshot).not.toHaveBeenCalled()
    expect(savedManifests).toHaveLength(0)
    expect(database.replaceAllData).toHaveBeenCalledWith(expect.objectContaining({
      prompts: expect.arrayContaining([expect.objectContaining({ title: 'Corrupted inline manifest copy' })])
    }))
  })

  it('reports a warning when the complete local sync base cannot be stored anywhere', async () => {
    const storage = new MemoryStorage()
    const storageSetSpy = vi.spyOn(storage, 'setItem')
      .mockImplementation((key: string, value: string) => {
        if (
          key === 'ai_gist_cloud_sync_last_auto_attempt_at' ||
          key === 'ai_gist_cloud_sync_device_id' ||
          key.startsWith('ai_gist_cloud_sync_state:')
        ) {
          throw new Error('QuotaExceededError')
        }
        MemoryStorage.prototype.setItem.call(storage, key, value)
      })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { service, cloudClient } = createService(baseData, createEmptyCloudSyncManifest(), { storage })

    try {
      const result = await service.syncNow('cfg-1')

      expect(result.success).toBe(true)
      expect(cloudClient.saveCloudSyncManifest).toHaveBeenCalledTimes(1)
      expect(storageSetSpy).toHaveBeenCalled()
      expect(warnSpy).toHaveBeenCalledWith(
        '保存云同步自动尝试时间失败:',
        expect.any(Error)
      )
      expect(warnSpy).toHaveBeenCalledWith(
        '保存云同步设备 ID 失败:',
        expect.any(Error)
      )
      expect(result.warnings?.[0]).toContain('完整本地同步基线保存失败')
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('retries local sync state save after clearing noncritical sync cache', async () => {
    const storage = new MemoryStorage()
    storage.setItem('ai_gist_cloud_sync_conflict_log', JSON.stringify([{
      id: 'entry-1',
      storageId: 'cfg-1',
      detectedAt: '2026-01-01T00:00:00.000Z',
      conflicts: []
    }]))
    let stateSaveAttempts = 0
    vi.spyOn(storage, 'setItem')
      .mockImplementation((key: string, value: string) => {
        if (key.startsWith('ai_gist_cloud_sync_state:') && stateSaveAttempts === 0) {
          stateSaveAttempts += 1
          throw new Error('QuotaExceededError')
        }
        MemoryStorage.prototype.setItem.call(storage, key, value)
      })
    const removeSpy = vi.spyOn(storage, 'removeItem')
    const { service } = createService(baseData, createEmptyCloudSyncManifest(), { storage })

    const result = await service.syncNow('cfg-1')

    expect(result.success).toBe(true)
    expect(removeSpy).toHaveBeenCalledWith('ai_gist_cloud_sync_conflict_log')
    expect(storage.getItem('ai_gist_cloud_sync_conflict_log')).toBeNull()
    expect(storage.getItem('ai_gist_cloud_sync_state:cfg-1')).toContain(result.remoteRevision)
  })

  it('does not silently downgrade to a revision-only state when the base snapshot exceeds quota', async () => {
    const storage = new MemoryStorage()
    vi.spyOn(storage, 'setItem')
      .mockImplementation((key: string, value: string) => {
        if (key.startsWith('ai_gist_cloud_sync_state:') && value.includes('"baseSnapshot"')) {
          throw new Error('QuotaExceededError')
        }
        MemoryStorage.prototype.setItem.call(storage, key, value)
      })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { service } = createService(baseData, createEmptyCloudSyncManifest(), { storage })

    try {
      const result = await service.syncNow('cfg-1')

      expect(result.success).toBe(true)
      expect(result.warnings?.[0]).toContain('完整本地同步基线保存失败')
      expect(storage.getItem('ai_gist_cloud_sync_state:cfg-1')).toBeNull()
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('stores the complete sync base in IndexedDB metadata instead of localStorage', async () => {
    const storage = new MemoryStorage()
    vi.spyOn(storage, 'setItem').mockImplementation((key: string, value: string) => {
      if (key.startsWith('ai_gist_cloud_sync_state:')) throw new Error('localStorage quota')
      MemoryStorage.prototype.setItem.call(storage, key, value)
    })
    const metadata = new Map<string, any>()
    const database = {
      exportAllDataForSync: vi.fn().mockResolvedValue({ success: true, message: 'ok', data: baseData }),
      replaceAllData: vi.fn().mockResolvedValue({ success: true, atomic: true, message: 'ok' }),
      getLocalSyncMetadata: vi.fn(async (key: string) => metadata.get(key) || null),
      setLocalSyncMetadata: vi.fn(async (key: string, value: any) => { metadata.set(key, value) }),
      removeLocalSyncMetadata: vi.fn(async (key: string) => { metadata.delete(key) })
    }
    const { service } = createService(baseData, createEmptyCloudSyncManifest(), { storage, database })

    const result = await service.syncNow('cfg-1')

    expect(result.success).toBe(true)
    const savedState = metadata.get('ai_gist_cloud_sync_state:cfg-1')
    expect(savedState.baseSnapshot.revision).toBe(result.remoteRevision)
    expect(storage.getItem('ai_gist_cloud_sync_state:cfg-1')).toBeNull()
  })

  it('fails sync when a saved manifest cannot be read back with the same revision', async () => {
    const emptyManifest = createEmptyCloudSyncManifest('2026-01-01T00:00:00.000Z')
    const { service, cloudClient, storage } = createService(baseData, emptyManifest)
    cloudClient.getCloudSyncManifest
      .mockReset()
      .mockResolvedValueOnce(emptyManifest)
      .mockResolvedValueOnce(emptyManifest)
      .mockImplementation(async () => emptyManifest)

    const result = await service.syncNow('cfg-1')

    expect(result.success).toBe(false)
    expect(result.error).toContain('云同步 manifest 保存后校验失败')
    expect(result.error).not.toContain('其他设备')
    expect(cloudClient.saveCloudSyncManifest).toHaveBeenCalledTimes(2)
    expect(storage.getItem('ai_gist_cloud_sync_state:cfg-1')).toBeNull()
  })

  it('retries a falsely successful manifest save until the manifest pointer is published', async () => {
    const emptyManifest = createEmptyCloudSyncManifest('2026-01-01T00:00:00.000Z')
    const { service, cloudClient, storage } = createService(baseData, emptyManifest)
    let cloudManifest: any = emptyManifest
    let saveAttempts = 0
    cloudClient.getCloudSyncManifest.mockImplementation(async () => cloudManifest)
    cloudClient.saveCloudSyncManifest.mockImplementation(async (_storageId: string, manifest: any) => {
      saveAttempts += 1
      if (saveAttempts === 1) {
        return { success: true }
      }

      cloudManifest = manifest
      return { success: true }
    })

    const result = await service.syncNow('cfg-1')

    expect(result.success).toBe(true)
    expect(result.action).toBe('uploaded')
    expect(result.error).toBeUndefined()
    expect(cloudClient.saveCloudSyncManifest).toHaveBeenCalledTimes(2)
    expect(storage.getItem('ai_gist_cloud_sync_state:cfg-1')).toContain(cloudManifest.latestSnapshot.revision)
  })

  it('accepts a reported manifest save failure when the submitted manifest is already readable', async () => {
    const emptyManifest = createEmptyCloudSyncManifest('2026-01-01T00:00:00.000Z')
    const { service, cloudClient, storage } = createService(baseData, emptyManifest)
    let savedManifest: any
    cloudClient.getCloudSyncManifest
      .mockReset()
      .mockResolvedValueOnce(emptyManifest)
      .mockResolvedValueOnce(emptyManifest)
      .mockImplementation(async () => savedManifest || emptyManifest)
    cloudClient.saveCloudSyncManifest.mockImplementation(async (_storageId: string, manifest: any) => {
      savedManifest = manifest
      return {
        success: false,
        error: 'HTTP 507 while saving backup manifest'
      }
    })

    const result = await service.syncNow('cfg-1')

    expect(result.success).toBe(true)
    expect(result.action).toBe('uploaded')
    expect(result.error).toBeUndefined()
    expect(cloudClient.saveCloudSyncManifest).toHaveBeenCalledTimes(1)
    expect(storage.getItem('ai_gist_cloud_sync_state:cfg-1')).toContain(savedManifest.latestSnapshot.revision)
  })

  it('waits out stale read-after-write responses instead of treating them as another device', async () => {
    const emptyManifest = createEmptyCloudSyncManifest('2026-01-01T00:00:00.000Z')
    const { service, cloudClient, storage } = createService(baseData, emptyManifest)
    let savedManifest: any
    cloudClient.getCloudSyncManifest
      .mockReset()
      .mockResolvedValueOnce(emptyManifest)
      .mockResolvedValueOnce(emptyManifest)
      .mockResolvedValueOnce(emptyManifest)
      .mockImplementation(async () => savedManifest)
    cloudClient.saveCloudSyncManifest.mockImplementation(async (_storageId: string, manifest: any) => {
      savedManifest = manifest
      return { success: true }
    })

    const result = await service.syncNow('cfg-1')

    expect(result.success).toBe(true)
    expect(result.error).toBeUndefined()
    expect(cloudClient.saveCloudSyncManifest).toHaveBeenCalledTimes(1)
    expect(storage.getItem('ai_gist_cloud_sync_state:cfg-1')).toContain(savedManifest.latestSnapshot.revision)
  })

  it('does not mention other devices for local read-after-write consistency failures', () => {
    const message = getFriendlyCloudSyncError(
      '云同步 manifest 保存后校验失败：期望 revision rev-new，实际 rev-old'
    )

    expect(message).toContain('自动重试')
    expect(message).not.toContain('其他设备')
  })

  it('keeps raw unstable sync errors in a copyable diagnosis report', () => {
    const rawError = '云同步 manifest 保存后数据校验失败：期望 checksum abc，实际 def'
    const diagnosis = getCloudSyncErrorDiagnosis(rawError, {
      storageId: 'cfg-1',
      reason: 'manual',
      status: 'error',
      failureCount: 2,
      timestamp: '2026-06-12T08:00:00.000Z'
    })

    expect(diagnosis.title).toBe('云端同步状态暂时不一致')
    expect(diagnosis.canAutoRetry).toBe(true)
    expect(diagnosis.canUserFix).toBe(false)
    expect(diagnosis.copyText).toContain(rawError)
    expect(diagnosis.copyText).toContain('存储配置 ID: cfg-1')
    expect(diagnosis.copyText).toContain('连续失败次数: 2')
  })

  it('redacts credentials, prompt content and image bytes from copyable diagnostics', () => {
    const diagnosis = getCloudSyncErrorDiagnosis(
      'request https://alice:super-secret@example.com failed ' +
      'Authorization: Bearer token-value password=hunter2 ' +
      'prompt=private-text data:image/png;base64,AAAAABBBBBCCCCCDDDD',
      { storageId: 'cfg-1', reason: 'manual' }
    )

    expect(diagnosis.copyText).not.toContain('super-secret')
    expect(diagnosis.copyText).not.toContain('token-value')
    expect(diagnosis.copyText).not.toContain('hunter2')
    expect(diagnosis.copyText).not.toContain('private-text')
    expect(diagnosis.copyText).not.toContain('AAAAABBBBB')
    expect(diagnosis.copyText).toContain('已隐藏')
  })

  it.each([
    'prompt=my very secret instruction',
    'x-api-key: sk-production-secret',
    'password is correct horse battery staple',
    "{'content': 'private prompt with spaces'}"
  ])('redacts the entire ambiguous sensitive error: %s', rawError => {
    const diagnosis = getCloudSyncErrorDiagnosis(rawError, { storageId: 'cfg-1' })
    expect(diagnosis.copyText).not.toContain(rawError)
    expect(diagnosis.rawError).toContain('fingerprint=')
  })

  it('classifies WebDAV authentication errors as user-fixable diagnostics', () => {
    const diagnosis = getCloudSyncErrorDiagnosis('401 Unauthorized', {
      storageId: 'webdav-1',
      reason: 'manual'
    })

    expect(diagnosis.title).toBe('云存储认证失败')
    expect(diagnosis.canUserFix).toBe(true)
    expect(diagnosis.canAutoRetry).toBe(false)
    expect(diagnosis.message).toContain('用户名')
    expect(diagnosis.copyText).toContain('401 Unauthorized')
  })

  it('classifies Android WebDAV Failed to connect errors as transient network failures', async () => {
    const { service, cloudClient } = createService(baseData)
    cloudClient.getCloudSyncManifest.mockRejectedValue(new Error(
      '读取云同步 manifest 失败，且备份副本不可用: ' +
      'GET 请求失败: Failed to connect to /198.18.0.1:18765；' +
      '备份副本错误: GET 请求失败: Failed to connect to /198.18.0.1:18765'
    ))

    const result = await service.syncNow('cfg-1', { reason: 'manual', platform: 'android' })
    const diagnosis = getCloudSyncErrorDiagnosis(result, {
      storageId: 'cfg-1',
      reason: 'manual',
      platform: 'android'
    })

    expect(result).toMatchObject({
      success: false,
      errorCode: 'REMOTE_NETWORK',
      diagnostic: {
        phase: 'read-remote',
        retryClass: 'transient'
      }
    })
    expect(diagnosis.title).toBe('无法连接到云存储')
    expect(diagnosis.canAutoRetry).toBe(true)
    expect(diagnosis.copyText).toContain('错误代码: REMOTE_NETWORK')
    expect(diagnosis.copyText).toContain('重试类型: transient')
  })

  it('fails sync when a saved manifest reads back the same revision with different data', async () => {
    const emptyManifest = createEmptyCloudSyncManifest('2026-01-01T00:00:00.000Z')
    const { service, cloudClient, storage } = createService(baseData, emptyManifest)
    let corruptedSavedManifest: any = emptyManifest

    cloudClient.getCloudSyncManifest
      .mockReset()
      .mockResolvedValueOnce(emptyManifest)
      .mockResolvedValueOnce(emptyManifest)
      .mockImplementation(async () => corruptedSavedManifest)
    cloudClient.saveCloudSyncManifest.mockImplementation(async (_storageId: string, manifest: any) => {
      const corruptedData = {
        ...manifest.latestSnapshot.data,
        prompts: [
          { ...manifest.latestSnapshot.data.prompts[0], title: 'Corrupted cloud copy' }
        ]
      }
      corruptedSavedManifest = {
        ...manifest,
        latestSnapshot: {
          ...manifest.latestSnapshot,
          data: corruptedData,
          dataChecksum: createCloudSyncDataChecksum(corruptedData)
        }
      }
      return { success: true }
    })

    const result = await service.syncNow('cfg-1')

    expect(result.success).toBe(false)
    expect(result.error).toContain('云同步 manifest 保存后数据校验失败')
    expect(storage.getItem('ai_gist_cloud_sync_state:cfg-1')).toBeNull()
  })

  it('repairs remote snapshot checksum drift before merging', async () => {
    const remoteSnapshot = createCloudSyncSnapshot(baseData, 'device-b', 'rev-remote')
    remoteSnapshot.data.prompts![0].title = 'Tampered remote data'
    const manifest = {
      ...createEmptyCloudSyncManifest('2026-01-02T00:00:00.000Z'),
      latestSnapshot: remoteSnapshot,
      baseSnapshot: remoteSnapshot
    }
    let cloudManifest = manifest
    const cloudClient = {
      getCloudSyncManifest: vi.fn().mockImplementation(async () => assertValidCloudSyncManifest(cloudManifest)),
      saveCloudSyncManifest: vi.fn().mockImplementation(async (_storageId: string, nextManifest: any) => {
        cloudManifest = nextManifest
        return { success: true }
      })
    }
    const database = {
      exportAllDataForSync: vi.fn().mockResolvedValue({
        success: true,
        message: 'ok',
        data: remoteSnapshot.data
      }),
      replaceAllData: vi.fn().mockResolvedValue({
        success: true,
        message: 'ok'
      })
    }
    const storage = new MemoryStorage()
    const service = new CloudSyncService({
      cloudClient,
      database,
      storage,
      createDeviceId: () => 'device-a'
    })

    const result = await service.syncNow('cfg-1')

    expect(result.success).toBe(true)
    expect(result.error).toBeUndefined()
    expect(database.replaceAllData).not.toHaveBeenCalled()
    expect(cloudClient.saveCloudSyncManifest).toHaveBeenCalledTimes(1)
    const savedManifest = cloudClient.saveCloudSyncManifest.mock.calls[0][1]
    expect(savedManifest.latestSnapshot.dataChecksum).toBe(
      createCloudSyncDataChecksum(savedManifest.latestSnapshot.data)
    )
    expect(storage.getItem('ai_gist_cloud_sync_state:cfg-1')).toContain('rev-remote')
  })

  it('rebuilds the cloud manifest from local data when both cloud copies are unreadable', async () => {
    let cloudManifest: any = null
    const cloudClient = {
      getCloudSyncManifest: vi.fn().mockImplementation(async () => {
        if (!cloudManifest) {
          throw new Error('读取云同步 manifest 失败: 云同步 manifest 内容无效: Unexpected token')
        }
        return cloudManifest
      }),
      saveCloudSyncManifest: vi.fn().mockImplementation(async (_storageId: string, nextManifest: any) => {
        cloudManifest = nextManifest
        return { success: true }
      })
    }
    const database = {
      exportAllDataForSync: vi.fn().mockResolvedValue({
        success: true,
        message: 'ok',
        data: baseData
      }),
      replaceAllData: vi.fn().mockResolvedValue({
        success: true,
        message: 'ok'
      })
    }
    const storage = new MemoryStorage()
    const service = new CloudSyncService({
      cloudClient,
      database,
      storage,
      createDeviceId: () => 'device-a'
    })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    try {
      const result = await service.syncNow('cfg-1')

      expect(result.success).toBe(true)
      expect(result.action).toBe('uploaded')
      expect(cloudClient.saveCloudSyncManifest).toHaveBeenCalledTimes(1)
      expect(cloudManifest.latestSnapshot.data.prompts).toEqual(baseData.prompts)
      expect(database.replaceAllData).not.toHaveBeenCalled()
      expect(storage.getItem('ai_gist_cloud_sync_state:cfg-1')).toContain(cloudManifest.latestSnapshot.revision)
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('downloads and applies remote changes when local data matches the previous base', async () => {
    const baseSnapshot = createCloudSyncSnapshot(baseData, 'device-a', 'rev-base')
    const remoteData = {
      ...baseData,
      prompts: [{ id: 9, uuid: 'prompt-1', title: 'Remote edit', updatedAt: '2026-01-02T00:00:00.000Z' }]
    }
    const remoteSnapshot = createCloudSyncSnapshot(remoteData, 'device-b', 'rev-remote')
    const manifest = {
      ...createEmptyCloudSyncManifest('2026-01-02T00:00:00.000Z'),
      latestSnapshot: remoteSnapshot,
      baseSnapshot
    }
    const { service, cloudClient, database, storage } = createService(baseData, manifest)
    storage.setItem('ai_gist_cloud_sync_state:cfg-1', JSON.stringify({
      storageId: 'cfg-1',
      deviceId: 'device-a',
      lastSyncAt: '2026-01-01T00:00:00.000Z',
      lastKnownRevision: 'rev-base',
      baseSnapshot
    }))

    const result = await service.syncNow('cfg-1')

    expect(result.success).toBe(true)
    expect(result.action).toBe('downloaded')
    expect(database.replaceAllData).toHaveBeenCalledWith(expect.objectContaining({
      prompts: [expect.objectContaining({ title: 'Remote edit' })]
    }))
    expect(cloudClient.saveCloudSyncManifest).not.toHaveBeenCalled()
    expect(storage.getItem('ai_gist_cloud_sync_state:cfg-1')).toContain('rev-remote')
  })

  it('treats a device without local sync state as a new device and pulls remote data', async () => {
    const emptyLocalData = {
      categories: [],
      prompts: [],
      promptVariables: [],
      promptHistories: [],
      aiConfigs: [],
      quickOptimizationConfigs: [],
      aiHistory: [],
      settings: [],
      syncTombstones: []
    }
    const remoteSnapshot = createCloudSyncSnapshot(baseData, 'device-b', 'rev-remote')
    const manifest = {
      ...createEmptyCloudSyncManifest('2026-01-02T00:00:00.000Z'),
      latestSnapshot: remoteSnapshot,
      baseSnapshot: remoteSnapshot
    }
    const { service, cloudClient, database } = createService(emptyLocalData, manifest)

    const result = await service.syncNow('cfg-1')

    expect(result.success).toBe(true)
    expect(result.action).toBe('downloaded')
    expect(database.replaceAllData).toHaveBeenCalledWith(expect.objectContaining({
      prompts: [expect.objectContaining({ uuid: 'prompt-1' })]
    }))
    expect(cloudClient.saveCloudSyncManifest).not.toHaveBeenCalled()
  })

  it('uploads a merged snapshot that preserves tombstones over stale remote records', async () => {
    const tombstone = {
      collectionName: 'prompts',
      recordKey: 'uuid:prompt-1',
      recordUuid: 'prompt-1',
      deletedAt: '2026-01-03T00:00:00.000Z'
    }
    const localData = {
      ...baseData,
      prompts: [],
      syncTombstones: [tombstone]
    }
    const remoteData = {
      ...baseData,
      prompts: [{ id: 9, uuid: 'prompt-1', title: 'Stale remote', updatedAt: '2026-01-02T00:00:00.000Z' }]
    }
    const remoteSnapshot = createCloudSyncSnapshot(remoteData, 'device-b', 'rev-remote')
    const manifest = {
      ...createEmptyCloudSyncManifest('2026-01-02T00:00:00.000Z'),
      latestSnapshot: remoteSnapshot,
      baseSnapshot: remoteSnapshot
    }
    const { service, cloudClient, database } = createService(localData, manifest)

    const result = await service.syncNow('cfg-1')

    expect(result.success).toBe(true)
    expect(result.action).toBe('uploaded')
    expect(database.replaceAllData).not.toHaveBeenCalled()
    const savedManifest = cloudClient.saveCloudSyncManifest.mock.calls[0][1]
    expect(savedManifest.latestSnapshot.data.prompts).toEqual([])
    expect(savedManifest.latestSnapshot.data.syncTombstones).toHaveLength(1)
  })

  it('rechecks the remote revision before upload and retries against newer cloud data', async () => {
    const baseSnapshot = createCloudSyncSnapshot(baseData, 'device-a', 'rev-base')
    const localData = {
      ...baseData,
      prompts: [{ id: 1, uuid: 'prompt-1', title: 'Local edit', updatedAt: '2026-01-03T00:00:00.000Z' }]
    }
    const remoteDataWrittenByOtherDevice = {
      ...baseData,
      categories: [
        ...baseData.categories,
        { id: 2, uuid: 'cat-2', name: 'Remote category', updatedAt: '2026-01-02T00:00:00.000Z' }
      ]
    }
    const initialManifest = {
      ...createEmptyCloudSyncManifest('2026-01-01T00:00:00.000Z'),
      latestSnapshot: baseSnapshot,
      baseSnapshot
    }
    const changedManifest = {
      ...createEmptyCloudSyncManifest('2026-01-02T00:00:00.000Z'),
      latestSnapshot: createCloudSyncSnapshot(remoteDataWrittenByOtherDevice, 'device-b', 'rev-remote-newer'),
      baseSnapshot
    }
    const { service, cloudClient, database, storage } = createService(localData, initialManifest)
    storage.setItem('ai_gist_cloud_sync_state:cfg-1', JSON.stringify({
      storageId: 'cfg-1',
      deviceId: 'device-a',
      lastSyncAt: '2026-01-01T00:00:00.000Z',
      lastKnownRevision: 'rev-base',
      baseSnapshot
    }))
    cloudClient.getCloudSyncManifest
      .mockReset()
      .mockResolvedValueOnce(initialManifest)
      .mockResolvedValueOnce(changedManifest)
      .mockResolvedValueOnce(changedManifest)
      .mockResolvedValueOnce(changedManifest)
      .mockImplementation(async () => cloudClient.saveCloudSyncManifest.mock.calls[0]?.[1] || changedManifest)

    const result = await service.syncNow('cfg-1')

    expect(result.success).toBe(true)
    expect(cloudClient.saveCloudSyncManifest).toHaveBeenCalledTimes(1)
    expect(database.replaceAllData).toHaveBeenCalledWith(expect.objectContaining({
      categories: expect.arrayContaining([expect.objectContaining({ uuid: 'cat-2' })]),
      prompts: expect.arrayContaining([expect.objectContaining({ title: 'Local edit' })])
    }))
    const savedManifest = cloudClient.saveCloudSyncManifest.mock.calls[0][1]
    expect(savedManifest.latestSnapshot.data.categories).toEqual(
      expect.arrayContaining([expect.objectContaining({ uuid: 'cat-2' })])
    )
    expect(savedManifest.latestSnapshot.data.prompts).toEqual(
      expect.arrayContaining([expect.objectContaining({ title: 'Local edit' })])
    )
  })

  it('continues uploading when the remote revision changes but remote data is unchanged', async () => {
    const localData = {
      ...baseData,
      prompts: [{ id: 1, uuid: 'prompt-1', title: 'Local edit', updatedAt: '2026-01-03T00:00:00.000Z' }]
    }
    const remoteSnapshot = createCloudSyncSnapshot(baseData, 'device-b', 'rev-remote-a')
    const sameDataNewRevisionSnapshot = createCloudSyncSnapshot(baseData, 'device-b', 'rev-remote-b')
    const initialManifest = {
      ...createEmptyCloudSyncManifest('2026-01-02T00:00:00.000Z'),
      latestSnapshot: remoteSnapshot,
      baseSnapshot: remoteSnapshot
    }
    const sameDataManifest = {
      ...createEmptyCloudSyncManifest('2026-01-02T00:01:00.000Z'),
      latestSnapshot: sameDataNewRevisionSnapshot,
      baseSnapshot: sameDataNewRevisionSnapshot
    }
    const { service, cloudClient, database } = createService(localData, initialManifest)
    let savedManifest: any
    cloudClient.getCloudSyncManifest
      .mockReset()
      .mockResolvedValueOnce(initialManifest)
      .mockResolvedValueOnce(sameDataManifest)
      .mockImplementation(async () => savedManifest)
    cloudClient.saveCloudSyncManifest.mockImplementation(async (_storageId: string, manifest: any) => {
      savedManifest = manifest
      return { success: true }
    })

    const result = await service.syncNow('cfg-1')

    expect(result.success).toBe(true)
    expect(result.error).toBeUndefined()
    expect(cloudClient.saveCloudSyncManifest).toHaveBeenCalledTimes(1)
    expect(database.replaceAllData).not.toHaveBeenCalled()
    expect(savedManifest.latestSnapshot.data.prompts).toEqual([
      expect.objectContaining({ title: 'Local edit' })
    ])
  })

  it('retries when the cloud rejects a manifest save because another device wrote first', async () => {
    const localData = {
      ...baseData,
      prompts: [{ id: 1, uuid: 'prompt-1', title: 'Local edit', updatedAt: '2026-01-03T00:00:00.000Z' }]
    }
    const remoteDataWrittenByOtherDevice = {
      ...baseData,
      categories: [
        ...baseData.categories,
        { id: 2, uuid: 'cat-2', name: 'Remote category', updatedAt: '2026-01-02T00:00:00.000Z' }
      ]
    }
    const emptyManifest = createEmptyCloudSyncManifest('2026-01-01T00:00:00.000Z')
    const changedManifest = {
      ...createEmptyCloudSyncManifest('2026-01-02T00:00:00.000Z'),
      latestSnapshot: createCloudSyncSnapshot(remoteDataWrittenByOtherDevice, 'device-b', 'rev-remote-newer')
    }
    const { service, cloudClient, database } = createService(localData, emptyManifest)
    let cloudManifest: any = emptyManifest
    let saveAttempts = 0
    cloudClient.getCloudSyncManifest.mockImplementation(async () => cloudManifest)
    cloudClient.saveCloudSyncManifest.mockImplementation(async (_storageId: string, manifest: any) => {
      saveAttempts += 1
      if (saveAttempts === 1) {
        cloudManifest = changedManifest
        return {
          success: false,
          conflict: true,
          error: '云同步 manifest 已被其他设备更新'
        }
      }

      cloudManifest = manifest
      return { success: true }
    })

    const result = await service.syncNow('cfg-1')

    expect(result.success).toBe(true)
    expect(cloudClient.saveCloudSyncManifest).toHaveBeenCalledTimes(2)
    expect(database.replaceAllData).toHaveBeenCalledWith(expect.objectContaining({
      categories: expect.arrayContaining([expect.objectContaining({ uuid: 'cat-2' })]),
      prompts: expect.arrayContaining([expect.objectContaining({ title: 'Local edit' })])
    }))
    expect(cloudManifest.latestSnapshot.data.categories).toEqual(
      expect.arrayContaining([expect.objectContaining({ uuid: 'cat-2' })])
    )
    expect(cloudManifest.latestSnapshot.data.prompts).toEqual(
      expect.arrayContaining([expect.objectContaining({ title: 'Local edit' })])
    )
  })

  it('does not upload a merged snapshot when applying merged data locally fails', async () => {
    const baseSnapshot = createCloudSyncSnapshot(baseData, 'device-a', 'rev-base')
    const localData = {
      ...baseData,
      prompts: [{ id: 1, uuid: 'prompt-1', title: 'Local edit', updatedAt: '2026-01-03T00:00:00.000Z' }]
    }
    const remoteData = {
      ...baseData,
      categories: [
        ...baseData.categories,
        { id: 2, uuid: 'cat-2', name: 'Remote category', updatedAt: '2026-01-02T00:00:00.000Z' }
      ]
    }
    const remoteSnapshot = createCloudSyncSnapshot(remoteData, 'device-b', 'rev-remote')
    const manifest = {
      ...createEmptyCloudSyncManifest('2026-01-02T00:00:00.000Z'),
      latestSnapshot: remoteSnapshot,
      baseSnapshot
    }
    const { service, cloudClient, database, storage } = createService(localData, manifest)
    storage.setItem('ai_gist_cloud_sync_state:cfg-1', JSON.stringify({
      storageId: 'cfg-1',
      deviceId: 'device-a',
      lastSyncAt: '2026-01-01T00:00:00.000Z',
      lastKnownRevision: 'rev-base',
      baseSnapshot
    }))
    database.replaceAllData.mockResolvedValueOnce({
      success: false,
      message: 'write failed',
      error: 'IndexedDB write failed'
    }).mockResolvedValueOnce({
      success: true,
      message: 'rollback ok'
    })

    const result = await service.syncNow('cfg-1')

    expect(result.success).toBe(false)
    expect(result.error).toContain('IndexedDB write failed')
    expect(database.replaceAllData).toHaveBeenNthCalledWith(1, expect.objectContaining({
      categories: expect.arrayContaining([expect.objectContaining({ uuid: 'cat-2' })]),
      prompts: expect.arrayContaining([expect.objectContaining({ title: 'Local edit' })])
    }))
    expect(database.replaceAllData).toHaveBeenNthCalledWith(2, expect.objectContaining({
      categories: expect.arrayContaining([expect.objectContaining({ uuid: 'cat-1' })]),
      prompts: expect.arrayContaining([expect.objectContaining({ title: 'Local edit' })])
    }))
    expect(cloudClient.saveCloudSyncManifest).not.toHaveBeenCalled()
    expect(storage.getItem('ai_gist_cloud_sync_state:cfg-1')).toContain('rev-base')
  })

  it('repairs business-unique collisions before publishing a merged snapshot', async () => {
    const baseSnapshot = createCloudSyncSnapshot(baseData, 'device-a', 'rev-base')
    const remoteSnapshot = createCloudSyncSnapshot({
      ...baseData,
      categories: [
        baseData.categories[0],
        {
          id: 99,
          uuid: 'cat-other-device',
          name: 'Base',
          description: 'Created independently on another device',
          createdAt: '2026-01-02T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z'
        }
      ]
    }, 'device-b', 'rev-remote')
    const manifest = {
      ...createEmptyCloudSyncManifest('2026-01-02T00:00:00.000Z'),
      latestSnapshot: remoteSnapshot,
      baseSnapshot
    }
    const { service, cloudClient, database, storage } = createService(baseData, manifest)
    storage.setItem('ai_gist_cloud_sync_state:cfg-1', JSON.stringify({
      storageId: 'cfg-1',
      deviceId: 'device-a',
      lastSyncAt: '2026-01-01T00:00:00.000Z',
      lastKnownRevision: 'rev-base',
      baseSnapshot
    }))

    const result = await service.syncNow('cfg-1', { reason: 'manual' })

    expect(result.success).toBe(true)
    expect(result.businessKeyMerges).toHaveLength(1)
    expect(result.warnings?.[0]).toContain('自动归并 1 组')
    expect(database.replaceAllData).toHaveBeenCalledTimes(1)
    expect(database.replaceAllData).toHaveBeenCalledWith(expect.objectContaining({
      categories: [expect.objectContaining({ uuid: 'cat-1', name: 'Base' })]
    }))
    const savedManifest = cloudClient.saveCloudSyncManifest.mock.calls.at(-1)?.[1]
    expect(savedManifest.latestSnapshot.data.categories).toHaveLength(1)
    expect(savedManifest.latestSnapshot.data.categories[0]).toMatchObject({
      uuid: 'cat-1',
      name: 'Base',
      description: 'Created independently on another device'
    })
  })

  it('automatically keeps orphaned prompts as uncategorized instead of blocking sync', async () => {
    const baseSnapshot = createCloudSyncSnapshot(baseData, 'device-a', 'rev-base')
    const orphanedPrompts = Array.from({ length: 6 }, (_, index) => ({
      id: index + 10,
      uuid: `orphan-prompt-${index + 1}`,
      title: `Orphan ${index + 1}`,
      categoryId: 999,
      updatedAt: '2026-07-11T00:00:00.000Z'
    }))
    const remoteSnapshot = createCloudSyncSnapshot({
      ...baseData,
      prompts: orphanedPrompts
    }, 'device-b', 'rev-orphaned')
    const manifest = {
      ...createEmptyCloudSyncManifest('2026-07-11T00:00:00.000Z'),
      latestSnapshot: remoteSnapshot,
      baseSnapshot
    }
    const { service, database, storage } = createService(baseData, manifest)
    storage.setItem('ai_gist_cloud_sync_state:cfg-1', JSON.stringify({
      storageId: 'cfg-1',
      deviceId: 'device-a',
      lastSyncAt: '2026-01-01T00:00:00.000Z',
      lastKnownRevision: 'rev-base',
      baseSnapshot
    }))

    const result = await service.syncNow('cfg-1', { reason: 'manual' })

    expect(result.success).toBe(true)
    expect(result.relationRepairs).toHaveLength(6)
    expect(result.warnings).toContain('已自动修复 6 条失效的可选关联；相关提示词已保留为未分类')
    const restored = database.replaceAllData.mock.calls[0][0]
    expect(restored.prompts).toHaveLength(6)
    expect(restored.prompts.every(
      (prompt: any) => prompt.categoryId === undefined && prompt.categoryUuid === undefined
    )).toBe(true)
  })

  it('does not rollback or repeat an identical deterministic atomic apply failure', async () => {
    const baseSnapshot = createCloudSyncSnapshot(baseData, 'device-a', 'rev-base')
    const remoteSnapshot = createCloudSyncSnapshot({
      ...baseData,
      prompts: [{ ...baseData.prompts[0], title: 'Remote edit', updatedAt: '2026-01-03T00:00:00.000Z' }]
    }, 'device-b', 'rev-remote')
    const manifest = {
      ...createEmptyCloudSyncManifest('2026-01-03T00:00:00.000Z'),
      latestSnapshot: remoteSnapshot,
      baseSnapshot
    }
    const { service, database, storage } = createService(baseData, manifest)
    storage.setItem('ai_gist_cloud_sync_state:cfg-1', JSON.stringify({
      storageId: 'cfg-1',
      deviceId: 'device-a',
      lastSyncAt: '2026-01-01T00:00:00.000Z',
      lastKnownRevision: 'rev-base',
      baseSnapshot
    }))
    database.replaceAllData.mockResolvedValue({
      success: false,
      atomic: true,
      message: '数据替换失败',
      error: '写入 prompts 记录失败: quota',
      errorCode: 'QUOTA_EXCEEDED',
      retryable: false,
      failures: [{
        phase: 'write',
        code: 'QUOTA_EXCEEDED',
        collection: 'prompts',
        storeName: 'prompts',
        recordKey: 'uuid:prompt-1',
        businessKey: 'prompt=secret instruction',
        errorName: 'QuotaExceededError',
        message: 'password is secret-password',
        retryable: false
      }]
    })

    const first = await service.syncNow('cfg-1', { reason: 'manual' })
    const second = await service.syncNow('cfg-1', { reason: 'manual' })

    expect(first).toMatchObject({
      success: false,
      errorCode: 'LOCAL_APPLY_QUOTA',
      diagnostic: {
        phase: 'apply-local',
        retryClass: 'user-action',
        failures: [expect.objectContaining({ recordKey: 'uuid:prompt-1' })]
      }
    })
    expect(second.diagnostic?.fingerprint).toBe(first.diagnostic?.fingerprint)
    expect(database.replaceAllData).toHaveBeenCalledTimes(1)
    const diagnosis = getCloudSyncErrorDiagnosis(first, { storageId: 'cfg-1', reason: 'manual' })
    expect(diagnosis.title).toBe('本地存储空间不足')
    expect(diagnosis.copyText).toContain('错误代码: LOCAL_APPLY_QUOTA')
    expect(diagnosis.copyText).toContain('recordKey=uuid:prompt-1')
    expect(JSON.stringify(first.diagnostic)).not.toContain('secret-password')
    expect(JSON.stringify(first.diagnostic)).not.toContain('secret instruction')
  })

  it('restarts the merge instead of overwriting an edit made after local export', async () => {
    const baseSnapshot = createCloudSyncSnapshot(baseData, 'device-a', 'rev-base')
    const remoteSnapshot = createCloudSyncSnapshot({
      ...baseData,
      categories: [
        ...baseData.categories,
        { id: 2, uuid: 'cat-remote', name: 'Remote category', updatedAt: '2026-01-02T00:00:00.000Z' }
      ]
    }, 'device-b', 'rev-remote')
    let manifest: any = {
      ...createEmptyCloudSyncManifest('2026-01-02T00:00:00.000Z'),
      latestSnapshot: remoteSnapshot,
      baseSnapshot
    }
    let currentData: any = baseData
    let listener: ((change: any) => void) | undefined
    let releaseManifest!: () => void
    let notifyManifestStarted!: () => void
    const manifestStarted = new Promise<void>(resolve => { notifyManifestStarted = resolve })
    const manifestGate = new Promise<void>(resolve => { releaseManifest = resolve })
    let manifestReads = 0
    const cloudClient = {
      getCloudSyncManifest: vi.fn(async () => {
        manifestReads += 1
        if (manifestReads === 1) {
          notifyManifestStarted()
          await manifestGate
        }
        return manifest
      }),
      saveCloudSyncManifest: vi.fn(async (_storageId: string, nextManifest: any) => {
        manifest = nextManifest
        return { success: true }
      })
    }
    const database = {
      exportAllDataForSync: vi.fn(async () => ({ success: true, message: 'ok', data: currentData })),
      replaceAllData: vi.fn(async () => ({ success: true, atomic: true, message: 'ok' }))
    }
    const storage = new MemoryStorage()
    storage.setItem('ai_gist_cloud_sync_state:cfg-1', JSON.stringify({
      storageId: 'cfg-1',
      deviceId: 'device-a',
      lastSyncAt: '2026-01-01T00:00:00.000Z',
      lastKnownRevision: 'rev-base',
      baseSnapshot
    }))
    const service = new CloudSyncService({
      cloudClient,
      database,
      storage,
      createDeviceId: () => 'device-a',
      subscribeToDataChanges: nextListener => {
        listener = nextListener
        return () => undefined
      }
    })
    service.startAutoSync({ syncOnStart: false, retryMs: 0, pollIntervalMs: 0 })

    const syncing = service.syncNow('cfg-1', { reason: 'manual' })
    await manifestStarted
    currentData = {
      ...baseData,
      prompts: [{
        ...baseData.prompts[0],
        title: 'Local edit made during sync',
        updatedAt: '2026-01-03T00:00:00.000Z'
      }]
    }
    listener?.({ storeName: 'prompts', action: 'update', id: 1, timestamp: Date.now(), sourceId: 'test' })
    releaseManifest()

    const result = await syncing

    expect(result.success).toBe(true)
    expect(database.exportAllDataForSync).toHaveBeenCalledTimes(2)
    expect(database.replaceAllData).toHaveBeenCalledTimes(1)
    expect(database.replaceAllData).toHaveBeenCalledWith(expect.objectContaining({
      prompts: [expect.objectContaining({ title: 'Local edit made during sync' })],
      categories: expect.arrayContaining([expect.objectContaining({ uuid: 'cat-remote' })])
    }))
    service.stopAutoSync()
  })

  it('ignores corrupted local base snapshots before merging', async () => {
    const localData = {
      ...baseData,
      prompts: [{ id: 1, uuid: 'prompt-1', title: 'Local edit', updatedAt: '2026-01-03T00:00:00.000Z' }]
    }
    const remoteData = {
      ...baseData,
      prompts: [{ id: 9, uuid: 'prompt-1', title: 'Remote edit', updatedAt: '2026-01-02T00:00:00.000Z' }]
    }
    const remoteSnapshot = createCloudSyncSnapshot(remoteData, 'device-b', 'rev-remote')
    const manifest = {
      ...createEmptyCloudSyncManifest('2026-01-02T00:00:00.000Z'),
      latestSnapshot: remoteSnapshot,
      baseSnapshot: remoteSnapshot
    }
    const { service, cloudClient, database, storage } = createService(localData, manifest)
    const corruptBaseSnapshot = createCloudSyncSnapshot(baseData, 'device-a', 'rev-base')
    corruptBaseSnapshot.data = localData
    storage.setItem('ai_gist_cloud_sync_state:cfg-1', JSON.stringify({
      storageId: 'cfg-1',
      deviceId: 'device-a',
      lastSyncAt: '2026-01-01T00:00:00.000Z',
      lastKnownRevision: 'rev-base',
      baseSnapshot: corruptBaseSnapshot
    }))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    try {
      const result = await service.syncNow('cfg-1')

      expect(result.success).toBe(true)
      expect(result.action).toBe('uploaded')
      expect(database.replaceAllData).not.toHaveBeenCalled()
      const savedManifest = cloudClient.saveCloudSyncManifest.mock.calls[0][1]
      expect(savedManifest.latestSnapshot.data.prompts).toEqual([
        expect.objectContaining({ title: 'Local edit' })
      ])
      expect(warnSpy).toHaveBeenCalledWith(
        '本地同步状态已损坏，忽略本地 baseSnapshot:',
        'snapshot data checksum mismatch'
      )
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('ignores local sync state when its revision does not match the base snapshot', async () => {
    const baseSnapshot = createCloudSyncSnapshot(baseData, 'device-a', 'rev-base')
    const localData = {
      ...baseData,
      prompts: []
    }
    const remoteSnapshot = createCloudSyncSnapshot(baseData, 'device-b', 'rev-remote')
    const manifest = {
      ...createEmptyCloudSyncManifest('2026-01-02T00:00:00.000Z'),
      latestSnapshot: remoteSnapshot,
      baseSnapshot: remoteSnapshot
    }
    const { service, cloudClient, database, storage } = createService(localData, manifest)
    storage.setItem('ai_gist_cloud_sync_state:cfg-1', JSON.stringify({
      storageId: 'cfg-1',
      deviceId: 'device-a',
      lastSyncAt: '2026-01-01T00:00:00.000Z',
      lastKnownRevision: 'different-rev',
      baseSnapshot
    }))
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    try {
      const result = await service.syncNow('cfg-1')

      expect(result.success).toBe(true)
      expect(result.action).toBe('downloaded')
      expect(cloudClient.saveCloudSyncManifest).not.toHaveBeenCalled()
      expect(database.replaceAllData).toHaveBeenCalledWith(expect.objectContaining({
        prompts: [expect.objectContaining({ uuid: 'prompt-1' })]
      }))
      expect(warnSpy).toHaveBeenCalledWith(
        '本地同步状态 revision 不一致，忽略本地 baseSnapshot:',
        'different-rev',
        'rev-base'
      )
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('persists an audit log when conflicts are automatically resolved', async () => {
    const baseSnapshot = createCloudSyncSnapshot(baseData, 'device-a', 'rev-base')
    const localData = {
      ...baseData,
      prompts: [{ id: 1, uuid: 'prompt-1', title: 'Local edit', updatedAt: '2026-01-03T00:00:00.000Z' }]
    }
    const remoteData = {
      ...baseData,
      prompts: [{ id: 9, uuid: 'prompt-1', title: 'Remote edit', updatedAt: '2026-01-02T00:00:00.000Z' }]
    }
    const remoteSnapshot = createCloudSyncSnapshot(remoteData, 'device-b', 'rev-remote')
    const manifest = {
      ...createEmptyCloudSyncManifest('2026-01-02T00:00:00.000Z'),
      latestSnapshot: remoteSnapshot,
      baseSnapshot
    }
    const { service, storage } = createService(localData, manifest)
    storage.setItem('ai_gist_cloud_sync_state:cfg-1', JSON.stringify({
      storageId: 'cfg-1',
      deviceId: 'device-a',
      lastSyncAt: '2026-01-01T00:00:00.000Z',
      lastKnownRevision: 'rev-base',
      baseSnapshot
    }))

    const result = await service.syncNow('cfg-1')

    expect(result.success).toBe(true)
    expect(result.conflicts).toHaveLength(1)

    const conflictLog = service.getConflictLog('cfg-1')
    expect(conflictLog).toHaveLength(1)
    expect(conflictLog[0]).toMatchObject({
      storageId: 'cfg-1',
      localRevision: 'rev-base',
      remoteRevision: 'rev-remote'
    })
    expect(conflictLog[0].resolvedRevision).toBe(result.remoteRevision)
    expect(conflictLog[0].conflicts[0]).toMatchObject({
      collection: 'prompts',
      key: 'uuid:prompt-1',
      reason: 'both_modified',
      resolution: 'take-newer'
    })
    expect(service.getStatus().conflictLogCount).toBe(1)

    service.clearConflictLog('cfg-1')
    expect(service.getConflictLog('cfg-1')).toEqual([])
    expect(service.getStatus().conflictLogCount).toBe(0)
  })

  it('keeps conflict audit logs lightweight by omitting image payloads', async () => {
    const baseSnapshot = createCloudSyncSnapshot(baseData, 'device-a', 'rev-base')
    const largeImage = `data:image/png;base64,${'x'.repeat(5000)}`
    const localData = {
      ...baseData,
      prompts: [{
        id: 1,
        uuid: 'prompt-1',
        title: 'Local edit',
        updatedAt: '2026-01-03T00:00:00.000Z',
        imageBlobs: [largeImage]
      }]
    }
    const remoteData = {
      ...baseData,
      prompts: [{
        id: 9,
        uuid: 'prompt-1',
        title: 'Remote edit',
        updatedAt: '2026-01-02T00:00:00.000Z',
        imageBlobs: [largeImage]
      }]
    }
    const remoteSnapshot = createCloudSyncSnapshot(remoteData, 'device-b', 'rev-remote')
    const manifest = {
      ...createEmptyCloudSyncManifest('2026-01-02T00:00:00.000Z'),
      latestSnapshot: remoteSnapshot,
      baseSnapshot
    }
    const { service, cloudClient, storage } = createService(localData, manifest)
    storage.setItem('ai_gist_cloud_sync_state:cfg-1', JSON.stringify({
      storageId: 'cfg-1',
      deviceId: 'device-a',
      lastSyncAt: '2026-01-01T00:00:00.000Z',
      lastKnownRevision: 'rev-base',
      baseSnapshot
    }))

    const result = await service.syncNow('cfg-1')

    expect(result.success).toBe(true)
    const conflictLog = service.getConflictLog('cfg-1')
    expect(conflictLog[0].conflicts[0].local.imageBlobs).toEqual({
      omitted: true,
      type: 'imageBlobs',
      itemCount: 1
    })
    expect(JSON.stringify(conflictLog)).not.toContain(largeImage)

    const savedManifest = cloudClient.saveCloudSyncManifest.mock.calls[0][1]
    expect(savedManifest.conflicts[0].local.imageBlobs).toEqual({
      omitted: true,
      type: 'imageBlobs',
      itemCount: 1
    })
    expect(JSON.stringify(savedManifest.conflicts)).not.toContain(largeImage)
  })

  it('does not fail sync when conflict audit log storage is unavailable', async () => {
    const baseSnapshot = createCloudSyncSnapshot(baseData, 'device-a', 'rev-base')
    const localData = {
      ...baseData,
      prompts: [{ id: 1, uuid: 'prompt-1', title: 'Local edit', updatedAt: '2026-01-03T00:00:00.000Z' }]
    }
    const remoteData = {
      ...baseData,
      prompts: [{ id: 9, uuid: 'prompt-1', title: 'Remote edit', updatedAt: '2026-01-02T00:00:00.000Z' }]
    }
    const remoteSnapshot = createCloudSyncSnapshot(remoteData, 'device-b', 'rev-remote')
    const manifest = {
      ...createEmptyCloudSyncManifest('2026-01-02T00:00:00.000Z'),
      latestSnapshot: remoteSnapshot,
      baseSnapshot
    }
    const storage = new MemoryStorage()
    const storageSetSpy = vi.spyOn(storage, 'setItem')
      .mockImplementation((key: string, value: string) => {
        if (key === 'ai_gist_cloud_sync_conflict_log') {
          throw new Error('QuotaExceededError')
        }
        MemoryStorage.prototype.setItem.call(storage, key, value)
      })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { service } = createService(localData, manifest, { storage })
    storage.setItem('ai_gist_cloud_sync_state:cfg-1', JSON.stringify({
      storageId: 'cfg-1',
      deviceId: 'device-a',
      lastSyncAt: '2026-01-01T00:00:00.000Z',
      lastKnownRevision: 'rev-base',
      baseSnapshot
    }))

    try {
      const result = await service.syncNow('cfg-1')

      expect(result.success).toBe(true)
      expect(result.conflicts).toHaveLength(1)
      expect(warnSpy).toHaveBeenCalledWith(
        '同步冲突审计记录保存失败:',
        expect.any(Error)
      )
      expect(storageSetSpy).toHaveBeenCalled()
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('does not throw when clearing conflict audit log storage is unavailable', async () => {
    const storage = new MemoryStorage()
    storage.setItem('ai_gist_cloud_sync_conflict_log', JSON.stringify([{
      id: 'entry-1',
      storageId: 'cfg-1',
      detectedAt: '2026-01-01T00:00:00.000Z',
      conflicts: []
    }]))
    const removeSpy = vi.spyOn(storage, 'removeItem')
      .mockImplementation(() => {
        throw new Error('QuotaExceededError')
      })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { service } = createService(baseData, createEmptyCloudSyncManifest(), { storage })

    try {
      expect(() => service.clearConflictLog()).not.toThrow()
      expect(removeSpy).toHaveBeenCalledWith('ai_gist_cloud_sync_conflict_log')
      expect(warnSpy).toHaveBeenCalledWith(
        '清空同步冲突审计记录失败:',
        expect.any(Error)
      )
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('automatically syncs enabled storage after local data changes', async () => {
    vi.useFakeTimers()
    let dataChangeListener: ((change: any) => void) | undefined
    const { service, cloudClient } = createService(baseData, createEmptyCloudSyncManifest(), {
      configClient: {
        getStorageConfigs: vi.fn().mockResolvedValue([enabledWebDAVConfig])
      },
      subscribeToDataChanges: listener => {
        dataChangeListener = listener
        return vi.fn()
      }
    })

    service.startAutoSync({
      syncOnStart: false,
      debounceMs: 25,
      pollIntervalMs: 0,
      retryMs: 0
    })
    dataChangeListener?.({
      storeName: 'prompts',
      action: 'update',
      id: 1,
      timestamp: Date.now(),
      sourceId: 'test'
    })

    expect(service.getStatus().status).toBe('scheduled')

    await vi.advanceTimersByTimeAsync(25)

    expect(cloudClient.saveCloudSyncManifest).toHaveBeenCalledTimes(1)
    expect(service.getStatus()).toMatchObject({
      status: 'success',
      pending: false,
      storageId: 'cfg-1'
    })

    service.stopAutoSync()
  })

  it('automatically syncs quick optimization config changes through the default event bus', async () => {
    vi.useFakeTimers()
    const { service, cloudClient } = createService(baseData, createEmptyCloudSyncManifest(), {
      configClient: {
        getStorageConfigs: vi.fn().mockResolvedValue([enabledWebDAVConfig])
      }
    })

    service.startAutoSync({
      syncOnStart: false,
      debounceMs: 25,
      pollIntervalMs: 0,
      retryMs: 0
    })
    emitDataChange({
      storeName: 'quick_optimization_configs',
      action: 'update',
      id: 1
    })

    expect(service.getStatus().status).toBe('scheduled')

    await vi.advanceTimersByTimeAsync(25)

    expect(cloudClient.saveCloudSyncManifest).toHaveBeenCalledTimes(1)

    service.stopAutoSync()
  })

  it('uses a 15 minute remote polling interval by default', async () => {
    vi.useFakeTimers()
    const { service, cloudClient } = createService(baseData, createEmptyCloudSyncManifest(), {
      configClient: {
        getStorageConfigs: vi.fn().mockResolvedValue([enabledWebDAVConfig])
      }
    })

    service.startAutoSync({
      syncOnStart: false,
      retryMs: 0
    })

    await vi.advanceTimersByTimeAsync(30_000)
    expect(cloudClient.saveCloudSyncManifest).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(DEFAULT_CLOUD_SYNC_INTERVAL_MINUTES * 60 * 1000 - 30_000)
    expect(cloudClient.saveCloudSyncManifest).toHaveBeenCalledTimes(1)

    service.stopAutoSync()
  })

  it('syncs local changes after debounce without waiting for the remote polling interval', async () => {
    vi.useFakeTimers()
    let dataChangeListener: ((change: any) => void) | undefined
    const { service, cloudClient, database } = createService(baseData, createEmptyCloudSyncManifest(), {
      configClient: {
        getStorageConfigs: vi.fn().mockResolvedValue([enabledWebDAVConfig])
      },
      subscribeToDataChanges: listener => {
        dataChangeListener = listener
        return vi.fn()
      }
    })

    service.startAutoSync({
      syncOnStart: false,
      debounceMs: 25,
      retryMs: 0
    })
    await service.syncNow('cfg-1')
    cloudClient.saveCloudSyncManifest.mockClear()
    database.exportAllDataForSync.mockResolvedValue({
      success: true,
      message: 'ok',
      data: {
        ...baseData,
        prompts: [{ id: 1, uuid: 'prompt-1', title: 'Local throttled edit', updatedAt: '2026-01-03T00:00:00.000Z' }]
      }
    })

    dataChangeListener?.({
      storeName: 'prompts',
      action: 'update',
      id: 1,
      timestamp: Date.now(),
      sourceId: 'test'
    })

    await vi.advanceTimersByTimeAsync(25)
    expect(cloudClient.saveCloudSyncManifest).toHaveBeenCalledTimes(1)
    expect(service.getStatus()).toMatchObject({
      status: 'success',
      pending: false
    })

    service.stopAutoSync()
  })

  it('coalesces a pending automatic sync into a successful manual sync for the only enabled storage', async () => {
    vi.useFakeTimers()
    let dataChangeListener: ((change: any) => void) | undefined
    let cloudManifest: any = createEmptyCloudSyncManifest('2026-01-01T00:00:00.000Z')
    let releaseSave!: () => void
    let notifySaveStarted!: () => void
    const saveStarted = new Promise<void>(resolve => {
      notifySaveStarted = resolve
    })
    const releaseSavePromise = new Promise<void>(resolve => {
      releaseSave = resolve
    })
    const { service, cloudClient } = createService(baseData, cloudManifest, {
      configClient: {
        getStorageConfigs: vi.fn().mockResolvedValue([enabledWebDAVConfig])
      },
      subscribeToDataChanges: listener => {
        dataChangeListener = listener
        return vi.fn()
      }
    })
    cloudClient.getCloudSyncManifest.mockImplementation(async () => cloudManifest)
    cloudClient.saveCloudSyncManifest.mockImplementation(async (_storageId: string, manifest: any) => {
      cloudManifest = manifest
      notifySaveStarted()
      await releaseSavePromise
      return { success: true }
    })

    service.startAutoSync({
      syncOnStart: false,
      debounceMs: 25,
      pollIntervalMs: 0,
      retryMs: 0
    })
    dataChangeListener?.({
      storeName: 'prompts',
      action: 'update',
      id: 1,
      timestamp: Date.now(),
      sourceId: 'test'
    })

    const manualSync = service.syncNow('cfg-1', { reason: 'manual' })
    await saveStarted
    await vi.advanceTimersByTimeAsync(25)
    releaseSave()
    const result = await manualSync
    await vi.runOnlyPendingTimersAsync()

    expect(result.success).toBe(true)
    expect(cloudClient.saveCloudSyncManifest).toHaveBeenCalledTimes(1)
    expect(service.hasPendingChanges()).toBe(false)
    expect(service.getStatus()).toMatchObject({ status: 'success', pending: false })

    service.stopAutoSync()
  })

  it('keeps the pending automatic sync when a manual sync covers only one of multiple enabled storages', async () => {
    vi.useFakeTimers()
    let dataChangeListener: ((change: any) => void) | undefined
    const secondConfig = {
      ...enabledWebDAVConfig,
      id: 'cfg-2',
      name: 'Second WebDAV'
    }
    const manifests: Record<string, any> = {
      'cfg-1': createEmptyCloudSyncManifest('2026-01-01T00:00:00.000Z'),
      'cfg-2': createEmptyCloudSyncManifest('2026-01-01T00:00:00.000Z')
    }
    const { service, cloudClient } = createService(baseData, manifests['cfg-1'], {
      configClient: {
        getStorageConfigs: vi.fn().mockResolvedValue([enabledWebDAVConfig, secondConfig])
      },
      subscribeToDataChanges: listener => {
        dataChangeListener = listener
        return vi.fn()
      }
    })
    cloudClient.getCloudSyncManifest.mockImplementation(async (storageId: string) => manifests[storageId])
    cloudClient.saveCloudSyncManifest.mockImplementation(async (storageId: string, manifest: any) => {
      manifests[storageId] = manifest
      return { success: true }
    })

    service.startAutoSync({
      syncOnStart: false,
      debounceMs: 25,
      pollIntervalMs: 0,
      retryMs: 0
    })
    dataChangeListener?.({
      storeName: 'prompts',
      action: 'update',
      id: 1,
      timestamp: Date.now(),
      sourceId: 'test'
    })

    const manualResult = await service.syncNow('cfg-1', { reason: 'manual' })
    expect(manualResult.success).toBe(true)
    expect(service.hasPendingChanges()).toBe(true)

    await vi.advanceTimersByTimeAsync(25)

    expect(cloudClient.saveCloudSyncManifest.mock.calls.map(call => call[0])).toEqual(['cfg-1', 'cfg-2'])
    expect(service.hasPendingChanges()).toBe(false)
    expect(service.getStatus()).toMatchObject({ status: 'success', pending: false })

    service.stopAutoSync()
  })

  it('queues an automatic local-change sync when local data changes during a running sync', async () => {
    vi.useFakeTimers()
    const initialData = {
      ...baseData,
      prompts: [{ ...baseData.prompts[0], title: 'Before running sync' }]
    }
    const editedData = {
      ...baseData,
      prompts: [{ ...baseData.prompts[0], title: 'Edited during running sync', updatedAt: '2026-01-03T00:00:00.000Z' }]
    }
    let currentData = initialData
    let cloudManifest: any = createEmptyCloudSyncManifest('2026-01-01T00:00:00.000Z')
    let releaseFirstSave!: () => void
    let notifyFirstSaveStarted!: () => void
    const firstSaveStarted = new Promise<void>(resolve => {
      notifyFirstSaveStarted = resolve
    })
    const releaseFirstSavePromise = new Promise<void>(resolve => {
      releaseFirstSave = resolve
    })
    let saveAttempts = 0
    const { service, cloudClient, database } = createService(initialData, cloudManifest, {
      configClient: {
        getStorageConfigs: vi.fn().mockResolvedValue([enabledWebDAVConfig])
      }
    })
    database.exportAllDataForSync.mockImplementation(async () => ({
      success: true,
      message: 'ok',
      data: currentData
    }))
    cloudClient.getCloudSyncManifest.mockImplementation(async () => cloudManifest)
    cloudClient.saveCloudSyncManifest.mockImplementation(async (_storageId: string, manifest: any) => {
      saveAttempts += 1
      cloudManifest = manifest
      if (saveAttempts === 1) {
        notifyFirstSaveStarted()
        await releaseFirstSavePromise
      }

      return { success: true }
    })

    service.startAutoSync({
      syncOnStart: false,
      debounceMs: 0,
      pollIntervalMs: 0,
      retryMs: 0,
      storageIds: ['cfg-1']
    })

    const firstSync = service.syncNow('cfg-1', { reason: 'local-change' })
    await firstSaveStarted
    currentData = editedData
    const queuedSync = service.syncNow('cfg-1', { reason: 'local-change' })
    expect(saveAttempts).toBe(1)

    releaseFirstSave()
    await firstSync
    await queuedSync
    await vi.runOnlyPendingTimersAsync()
    await vi.runOnlyPendingTimersAsync()

    expect(saveAttempts).toBe(2)
    expect(cloudClient.saveCloudSyncManifest.mock.calls[1][1].latestSnapshot.data.prompts)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ title: 'Edited during running sync' })
      ]))

    service.stopAutoSync()
  })

  it('drops a queued automatic local-change sync when auto sync is stopped', async () => {
    vi.useFakeTimers()
    let currentData = {
      ...baseData,
      prompts: [{ ...baseData.prompts[0], title: 'Before stopped auto sync' }]
    }
    let cloudManifest: any = createEmptyCloudSyncManifest('2026-01-01T00:00:00.000Z')
    let releaseFirstSave!: () => void
    let notifyFirstSaveStarted!: () => void
    const firstSaveStarted = new Promise<void>(resolve => {
      notifyFirstSaveStarted = resolve
    })
    const releaseFirstSavePromise = new Promise<void>(resolve => {
      releaseFirstSave = resolve
    })
    let saveAttempts = 0
    const { service, cloudClient, database } = createService(currentData, cloudManifest, {
      configClient: {
        getStorageConfigs: vi.fn().mockResolvedValue([enabledWebDAVConfig])
      }
    })
    database.exportAllDataForSync.mockImplementation(async () => ({
      success: true,
      message: 'ok',
      data: currentData
    }))
    cloudClient.getCloudSyncManifest.mockImplementation(async () => cloudManifest)
    cloudClient.saveCloudSyncManifest.mockImplementation(async (_storageId: string, manifest: any) => {
      saveAttempts += 1
      cloudManifest = manifest
      if (saveAttempts === 1) {
        notifyFirstSaveStarted()
        await releaseFirstSavePromise
      }

      return { success: true }
    })

    service.startAutoSync({
      syncOnStart: false,
      debounceMs: 0,
      pollIntervalMs: 0,
      retryMs: 0,
      storageIds: ['cfg-1']
    })

    const firstSync = service.syncNow('cfg-1', { reason: 'local-change' })
    await firstSaveStarted
    currentData = {
      ...baseData,
      prompts: [{ ...baseData.prompts[0], title: 'Edited after auto sync stopped' }]
    }
    const queuedSync = service.syncNow('cfg-1', { reason: 'local-change' })
    service.stopAutoSync()

    releaseFirstSave()
    await firstSync
    await queuedSync
    await vi.runOnlyPendingTimersAsync()

    expect(saveAttempts).toBe(1)
  })

  it('backs off automatic retries after a transient cloud read failure', async () => {
    vi.useFakeTimers()
    let dataChangeListener: ((change: any) => void) | undefined
    const { service, cloudClient } = createService(baseData, createEmptyCloudSyncManifest(), {
      configClient: {
        getStorageConfigs: vi.fn().mockResolvedValue([enabledWebDAVConfig])
      },
      subscribeToDataChanges: listener => {
        dataChangeListener = listener
        return vi.fn()
      }
    })
    cloudClient.getCloudSyncManifest.mockRejectedValue(new Error('ECONNRESET'))

    service.startAutoSync({
      syncOnStart: false,
      debounceMs: 25
    })
    dataChangeListener?.({
      storeName: 'prompts',
      action: 'update',
      id: 1,
      timestamp: Date.now(),
      sourceId: 'test'
    })

    await vi.advanceTimersByTimeAsync(25)
    expect(cloudClient.getCloudSyncManifest).toHaveBeenCalledTimes(1)
    expect(service.getStatus()).toMatchObject({
      status: 'error',
      pending: true,
      failureCount: 1
    })

    await vi.advanceTimersByTimeAsync(30_000)
    expect(cloudClient.getCloudSyncManifest).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(DEFAULT_CLOUD_SYNC_INTERVAL_MINUTES * 60 * 1000 - 30_000)
    expect(cloudClient.getCloudSyncManifest).toHaveBeenCalledTimes(2)

    service.stopAutoSync()
  })

  it('keeps retry status when focus triggers during retry backoff', async () => {
    vi.useFakeTimers()
    let dataChangeListener: ((change: any) => void) | undefined
    const { service, cloudClient } = createService(baseData, createEmptyCloudSyncManifest(), {
      configClient: {
        getStorageConfigs: vi.fn().mockResolvedValue([enabledWebDAVConfig])
      },
      subscribeToDataChanges: listener => {
        dataChangeListener = listener
        return vi.fn()
      }
    })
    cloudClient.getCloudSyncManifest.mockRejectedValue(new Error('ECONNRESET'))

    service.startAutoSync({
      syncOnStart: false,
      debounceMs: 25
    })
    dataChangeListener?.({
      storeName: 'prompts',
      action: 'update',
      id: 1,
      timestamp: Date.now(),
      sourceId: 'test'
    })

    await vi.advanceTimersByTimeAsync(25)
    const retryStatus = service.getStatus()

    service.scheduleSync('focus', { delayMs: 0 })
    await vi.advanceTimersByTimeAsync(0)

    expect(cloudClient.getCloudSyncManifest).toHaveBeenCalledTimes(1)
    expect(service.getStatus()).toMatchObject({
      status: 'error',
      pending: true,
      reason: 'local-change',
      failureCount: 1
    })
    expect(service.getStatus().nextSyncAt).toBe(retryStatus.nextSyncAt)

    service.stopAutoSync()
  })

  it('retries immediately when browser comes online during retry backoff', async () => {
    vi.useFakeTimers()
    let dataChangeListener: ((change: any) => void) | undefined
    const { service, cloudClient } = createService(baseData, createEmptyCloudSyncManifest(), {
      configClient: {
        getStorageConfigs: vi.fn().mockResolvedValue([enabledWebDAVConfig])
      },
      subscribeToDataChanges: listener => {
        dataChangeListener = listener
        return vi.fn()
      }
    })
    cloudClient.getCloudSyncManifest.mockRejectedValueOnce(new Error('ECONNRESET'))

    service.startAutoSync({
      syncOnStart: false,
      debounceMs: 25,
      pollIntervalMs: 0,
      retryMs: 60_000
    })
    dataChangeListener?.({
      storeName: 'prompts',
      action: 'update',
      id: 1,
      timestamp: Date.now(),
      sourceId: 'test'
    })

    await vi.advanceTimersByTimeAsync(25)
    expect(service.getStatus()).toMatchObject({
      status: 'error',
      pending: true,
      failureCount: 1
    })
    const callsAfterFailure = cloudClient.getCloudSyncManifest.mock.calls.length

    service.scheduleSync('online', { delayMs: 0 })
    await vi.advanceTimersByTimeAsync(0)

    expect(cloudClient.getCloudSyncManifest.mock.calls.length).toBeGreaterThan(callsAfterFailure)
    expect(service.getStatus()).toMatchObject({
      status: 'success',
      pending: false,
      failureCount: 0
    })

    const callsAfterOnlineRecovery = cloudClient.getCloudSyncManifest.mock.calls.length
    await vi.advanceTimersByTimeAsync(60_000)
    expect(cloudClient.getCloudSyncManifest).toHaveBeenCalledTimes(callsAfterOnlineRecovery)

    service.stopAutoSync()
  })

  it('clears pending automatic retry after a manual sync succeeds', async () => {
    vi.useFakeTimers()
    let dataChangeListener: ((change: any) => void) | undefined
    const { service, cloudClient } = createService(baseData, createEmptyCloudSyncManifest(), {
      configClient: {
        getStorageConfigs: vi.fn().mockResolvedValue([enabledWebDAVConfig])
      },
      subscribeToDataChanges: listener => {
        dataChangeListener = listener
        return vi.fn()
      }
    })
    cloudClient.getCloudSyncManifest.mockRejectedValueOnce(new Error('ECONNRESET'))

    service.startAutoSync({
      syncOnStart: false,
      debounceMs: 25,
      pollIntervalMs: 0,
      retryMs: 1000
    })
    dataChangeListener?.({
      storeName: 'prompts',
      action: 'update',
      id: 1,
      timestamp: Date.now(),
      sourceId: 'test'
    })

    await vi.advanceTimersByTimeAsync(25)
    expect(service.getStatus()).toMatchObject({
      status: 'error',
      pending: true,
      failureCount: 1
    })

    const manualResult = await service.syncNow('cfg-1', { reason: 'manual' })
    expect(manualResult.success).toBe(true)
    const callsAfterManualSync = cloudClient.getCloudSyncManifest.mock.calls.length

    await vi.advanceTimersByTimeAsync(1000)

    expect(cloudClient.getCloudSyncManifest).toHaveBeenCalledTimes(callsAfterManualSync)
    expect(service.getStatus()).toMatchObject({
      status: 'success',
      pending: false
    })

    service.stopAutoSync()
  })

  it('surfaces storage config failures and retries instead of going idle', async () => {
    vi.useFakeTimers()
    let dataChangeListener: ((change: any) => void) | undefined
    const getStorageConfigs = vi.fn().mockRejectedValue(new Error('settings unavailable'))
    const { service, cloudClient } = createService(baseData, createEmptyCloudSyncManifest(), {
      configClient: {
        getStorageConfigs
      },
      subscribeToDataChanges: listener => {
        dataChangeListener = listener
        return vi.fn()
      }
    })

    service.startAutoSync({
      syncOnStart: false,
      debounceMs: 25
    })
    dataChangeListener?.({
      storeName: 'prompts',
      action: 'update',
      id: 1,
      timestamp: Date.now(),
      sourceId: 'test'
    })

    await vi.advanceTimersByTimeAsync(25)
    expect(getStorageConfigs).toHaveBeenCalledTimes(1)
    expect(cloudClient.getCloudSyncManifest).not.toHaveBeenCalled()
    expect(service.getStatus()).toMatchObject({
      status: 'error',
      pending: true,
      failureCount: 1
    })
    expect(service.getStatus().error).toContain('获取自动同步存储配置失败')

    await vi.advanceTimersByTimeAsync(DEFAULT_CLOUD_SYNC_INTERVAL_MINUTES * 60 * 1000)
    expect(getStorageConfigs).toHaveBeenCalledTimes(2)

    service.stopAutoSync()
  })

  it('retries only the storage that failed during automatic sync', async () => {
    vi.useFakeTimers()
    let dataChangeListener: ((change: any) => void) | undefined
    const secondConfig = {
      ...enabledWebDAVConfig,
      id: 'cfg-2',
      name: 'Second WebDAV'
    }
    const manifests: Record<string, any> = {
      'cfg-2': createEmptyCloudSyncManifest('2026-01-01T00:00:00.000Z')
    }
    const manifestReads: string[] = []
    const { service, cloudClient } = createService(baseData, createEmptyCloudSyncManifest(), {
      configClient: {
        getStorageConfigs: vi.fn().mockResolvedValue([enabledWebDAVConfig, secondConfig])
      },
      subscribeToDataChanges: listener => {
        dataChangeListener = listener
        return vi.fn()
      }
    })
    cloudClient.getCloudSyncManifest.mockImplementation(async (storageId: string) => {
      manifestReads.push(storageId)
      if (storageId === 'cfg-1') {
        throw new Error('ECONNRESET')
      }
      return manifests[storageId] || createEmptyCloudSyncManifest('2026-01-01T00:00:00.000Z')
    })
    cloudClient.saveCloudSyncManifest.mockImplementation(async (storageId: string, manifest: any) => {
      manifests[storageId] = manifest
      return { success: true }
    })

    service.startAutoSync({
      syncOnStart: false,
      debounceMs: 25
    })
    dataChangeListener?.({
      storeName: 'prompts',
      action: 'update',
      id: 1,
      timestamp: Date.now(),
      sourceId: 'test'
    })

    await vi.advanceTimersByTimeAsync(25)
    expect(manifestReads).toContain('cfg-1')
    expect(manifestReads).toContain('cfg-2')
    const cfg2ReadsAfterFirstRun = manifestReads.filter(storageId => storageId === 'cfg-2').length
    expect(service.getStatus()).toMatchObject({
      status: 'error',
      pending: true,
      storageId: 'cfg-1'
    })

    await vi.advanceTimersByTimeAsync(DEFAULT_CLOUD_SYNC_INTERVAL_MINUTES * 60 * 1000)

    expect(manifestReads.filter(storageId => storageId === 'cfg-1').length).toBeGreaterThan(1)
    expect(manifestReads.filter(storageId => storageId === 'cfg-2')).toHaveLength(cfg2ReadsAfterFirstRun)

    service.stopAutoSync()
  })

  it('syncs every enabled storage after edits made during a single-storage retry', async () => {
    vi.useFakeTimers()
    let dataChangeListener: ((change: any) => void) | undefined
    let currentData = baseData
    let firstStorageReadAttempts = 0
    const secondConfig = { ...enabledWebDAVConfig, id: 'cfg-2', name: 'Second WebDAV' }
    const manifests: Record<string, any> = {
      'cfg-1': createEmptyCloudSyncManifest('2026-01-01T00:00:00.000Z'),
      'cfg-2': createEmptyCloudSyncManifest('2026-01-01T00:00:00.000Z')
    }
    const reads: string[] = []
    const { service, cloudClient, database } = createService(baseData, manifests['cfg-1'], {
      configClient: {
        getStorageConfigs: vi.fn().mockResolvedValue([enabledWebDAVConfig, secondConfig])
      },
      subscribeToDataChanges: listener => {
        dataChangeListener = listener
        return vi.fn()
      }
    })
    database.exportAllDataForSync.mockImplementation(async () => ({ success: true, message: 'ok', data: currentData }))
    cloudClient.getCloudSyncManifest.mockImplementation(async (storageId: string) => {
      reads.push(storageId)
      if (storageId === 'cfg-1' && firstStorageReadAttempts++ === 0) throw new Error('ECONNRESET')
      return manifests[storageId]
    })
    cloudClient.saveCloudSyncManifest.mockImplementation(async (storageId: string, manifest: any) => {
      manifests[storageId] = manifest
      return { success: true }
    })

    service.startAutoSync({
      syncOnStart: false,
      debounceMs: 0,
      pollIntervalMs: 0,
      retryMs: 50
    })
    dataChangeListener?.({ storeName: 'prompts', action: 'update', id: 1, timestamp: Date.now(), sourceId: 'test' })
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(0)
    expect(service.getStatus()).toMatchObject({ status: 'error', storageId: 'cfg-1' })
    const secondReadsBeforeEdit = reads.filter(storageId => storageId === 'cfg-2').length

    currentData = {
      ...baseData,
      prompts: [{ ...baseData.prompts[0], title: 'Edited during retry', updatedAt: '2026-07-11T00:00:00.000Z' }]
    }
    dataChangeListener?.({ storeName: 'prompts', action: 'update', id: 1, timestamp: Date.now(), sourceId: 'test' })

    await vi.advanceTimersByTimeAsync(50)
    await vi.runOnlyPendingTimersAsync()

    expect(reads.filter(storageId => storageId === 'cfg-2').length).toBeGreaterThan(secondReadsBeforeEdit)
    expect(manifests['cfg-2'].latestSnapshot.data.prompts).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: 'Edited during retry' })
    ]))
    expect(service.hasPendingChanges()).toBe(false)
    service.stopAutoSync()
  })

  it('does not schedule another upload from data changes emitted while applying remote data', async () => {
    vi.useFakeTimers()
    let dataChangeListener: ((change: any) => void) | undefined
    const emptyLocalData = {
      categories: [],
      prompts: [],
      promptVariables: [],
      promptHistories: [],
      aiConfigs: [],
      quickOptimizationConfigs: [],
      aiHistory: [],
      settings: [],
      syncTombstones: []
    }
    const remoteSnapshot = createCloudSyncSnapshot(baseData, 'device-b', 'rev-remote')
    const manifest = {
      ...createEmptyCloudSyncManifest('2026-01-02T00:00:00.000Z'),
      latestSnapshot: remoteSnapshot,
      baseSnapshot: remoteSnapshot
    }
    const { service, database } = createService(emptyLocalData, manifest, {
      configClient: {
        getStorageConfigs: vi.fn().mockResolvedValue([enabledWebDAVConfig])
      },
      subscribeToDataChanges: listener => {
        dataChangeListener = listener
        return vi.fn()
      }
    })
    database.replaceAllData.mockImplementation(async () => {
      dataChangeListener?.({
        storeName: 'prompts',
        action: 'create',
        id: 1,
        timestamp: Date.now(),
        sourceId: 'test'
      })
      return {
        success: true,
        message: 'ok'
      }
    })

    service.startAutoSync({
      syncOnStart: false,
      debounceMs: 25,
      pollIntervalMs: 0,
      retryMs: 0
    })

    const result = await service.syncNow('cfg-1')
    expect(result.success).toBe(true)
    expect(result.action).toBe('downloaded')

    await vi.advanceTimersByTimeAsync(25)

    expect(database.exportAllDataForSync).toHaveBeenCalledTimes(1)
    expect(service.getStatus()).toMatchObject({
      status: 'success',
      pending: false
    })

    service.stopAutoSync()
  })

  it('persists pending local changes and clears them after an explicit flush succeeds', async () => {
    let dataChangeListener: ((change: any) => void) | undefined
    const { service, storage } = createService(baseData, createEmptyCloudSyncManifest(), {
      configClient: {
        getStorageConfigs: vi.fn().mockResolvedValue([enabledWebDAVConfig])
      },
      subscribeToDataChanges: listener => {
        dataChangeListener = listener
        return vi.fn()
      }
    })

    service.startAutoSync({ syncOnStart: false, pollIntervalMs: 0, retryMs: 0 })
    dataChangeListener?.({
      storeName: 'prompts',
      action: 'update',
      id: 1,
      timestamp: Date.now(),
      sourceId: 'test'
    })

    expect(service.hasPendingChanges()).toBe(true)
    expect(storage.getItem('ai_gist_cloud_sync_pending_change')).toContain('changedAt')

    const result = await service.flushPendingSync({ reason: 'shutdown', timeoutMs: 1000 })

    expect(result).toMatchObject({ success: true, skipped: false, timedOut: false })
    expect(service.hasPendingChanges()).toBe(false)
    expect(storage.getItem('ai_gist_cloud_sync_pending_change')).toBeNull()
    service.stopAutoSync()
  })

  it('attempts every enabled storage during a lifecycle flush even when one fails', async () => {
    let dataChangeListener: ((change: any) => void) | undefined
    const secondConfig = { ...enabledWebDAVConfig, id: 'cfg-2', name: 'Second WebDAV' }
    const { service, cloudClient } = createService(baseData, createEmptyCloudSyncManifest(), {
      configClient: {
        getStorageConfigs: vi.fn().mockResolvedValue([enabledWebDAVConfig, secondConfig])
      },
      subscribeToDataChanges: listener => {
        dataChangeListener = listener
        return vi.fn()
      }
    })
    let secondManifest = createEmptyCloudSyncManifest('2026-01-01T00:00:00.000Z')
    cloudClient.getCloudSyncManifest.mockImplementation(async (storageId: string) => {
      if (storageId === 'cfg-1') throw new Error('ECONNRESET')
      return secondManifest
    })
    cloudClient.saveCloudSyncManifest.mockImplementation(async (storageId: string, manifest: any) => {
      if (storageId === 'cfg-2') secondManifest = manifest
      return { success: true }
    })
    service.startAutoSync({ syncOnStart: false, pollIntervalMs: 0, retryMs: 0 })
    dataChangeListener?.({ storeName: 'prompts', action: 'update', id: 1, timestamp: Date.now(), sourceId: 'test' })

    const result = await service.flushPendingSync({ reason: 'shutdown', timeoutMs: 1000 })

    expect(result).toMatchObject({ success: false, skipped: false, timedOut: false })
    expect(cloudClient.getCloudSyncManifest.mock.calls.some(([storageId]) => storageId === 'cfg-2')).toBe(true)
    expect(service.hasPendingChanges()).toBe(true)
    service.stopAutoSync()
  })

  it('waits for an active multi-storage scheduled run before performing an exit flush', async () => {
    vi.useFakeTimers()
    let dataChangeListener: ((change: any) => void) | undefined
    let releaseFirstRead!: () => void
    let notifyFirstRead!: () => void
    const firstReadStarted = new Promise<void>(resolve => { notifyFirstRead = resolve })
    const firstReadGate = new Promise<void>(resolve => { releaseFirstRead = resolve })
    const secondConfig = { ...enabledWebDAVConfig, id: 'cfg-2', name: 'Second WebDAV' }
    const manifests: Record<string, any> = {
      'cfg-1': createEmptyCloudSyncManifest('2026-01-01T00:00:00.000Z'),
      'cfg-2': createEmptyCloudSyncManifest('2026-01-01T00:00:00.000Z')
    }
    const { service, cloudClient } = createService(baseData, manifests['cfg-1'], {
      configClient: {
        getStorageConfigs: vi.fn().mockResolvedValue([enabledWebDAVConfig, secondConfig])
      },
      subscribeToDataChanges: listener => {
        dataChangeListener = listener
        return vi.fn()
      }
    })
    let firstRead = true
    cloudClient.getCloudSyncManifest.mockImplementation(async (storageId: string) => {
      if (storageId === 'cfg-1' && firstRead) {
        firstRead = false
        notifyFirstRead()
        await firstReadGate
      }
      return manifests[storageId]
    })
    cloudClient.saveCloudSyncManifest.mockImplementation(async (storageId: string, manifest: any) => {
      manifests[storageId] = manifest
      return { success: true }
    })
    service.startAutoSync({ syncOnStart: false, debounceMs: 0, pollIntervalMs: 0, retryMs: 0 })
    dataChangeListener?.({ storeName: 'prompts', action: 'update', id: 1, timestamp: Date.now(), sourceId: 'test' })
    await vi.advanceTimersByTimeAsync(0)
    await firstReadStarted

    const flush = service.flushPendingSync({ reason: 'shutdown', timeoutMs: 1000 })
    releaseFirstRead()
    const result = await flush

    expect(result).toMatchObject({ success: true, skipped: true, timedOut: false })
    expect(cloudClient.saveCloudSyncManifest.mock.calls.filter(([storageId]) => storageId === 'cfg-1')).toHaveLength(1)
    expect(cloudClient.saveCloudSyncManifest.mock.calls.filter(([storageId]) => storageId === 'cfg-2')).toHaveLength(1)
    expect(service.hasPendingChanges()).toBe(false)
    service.stopAutoSync()
  })

  it('retries every failed storage and clears the covered dirty version after recovery', async () => {
    vi.useFakeTimers()
    let dataChangeListener: ((change: any) => void) | undefined
    const attempts: Record<string, number> = { 'cfg-1': 0, 'cfg-2': 0 }
    const secondConfig = { ...enabledWebDAVConfig, id: 'cfg-2', name: 'Second WebDAV' }
    const manifests: Record<string, any> = {
      'cfg-1': createEmptyCloudSyncManifest('2026-01-01T00:00:00.000Z'),
      'cfg-2': createEmptyCloudSyncManifest('2026-01-01T00:00:00.000Z')
    }
    const { service, cloudClient } = createService(baseData, manifests['cfg-1'], {
      configClient: {
        getStorageConfigs: vi.fn().mockResolvedValue([enabledWebDAVConfig, secondConfig])
      },
      subscribeToDataChanges: listener => {
        dataChangeListener = listener
        return vi.fn()
      }
    })
    cloudClient.getCloudSyncManifest.mockImplementation(async (storageId: string) => {
      attempts[storageId] += 1
      if (attempts[storageId] === 1) throw new Error(`temporary ${storageId}`)
      return manifests[storageId]
    })
    cloudClient.saveCloudSyncManifest.mockImplementation(async (storageId: string, manifest: any) => {
      manifests[storageId] = manifest
      return { success: true }
    })
    service.startAutoSync({ syncOnStart: false, debounceMs: 0, pollIntervalMs: 0, retryMs: 50 })
    dataChangeListener?.({ storeName: 'prompts', action: 'update', id: 1, timestamp: Date.now(), sourceId: 'test' })
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(0)

    await vi.advanceTimersByTimeAsync(50)

    expect(attempts['cfg-1']).toBeGreaterThan(1)
    expect(attempts['cfg-2']).toBeGreaterThan(1)
    expect(service.hasPendingChanges()).toBe(false)
    service.stopAutoSync()
  })

  it('keeps the pending marker and can resume syncing after a lifecycle flush times out', async () => {
    vi.useFakeTimers()
    let dataChangeListener: ((change: any) => void) | undefined
    const { service, cloudClient, database, storage } = createService(baseData, createEmptyCloudSyncManifest(), {
      configClient: {
        getStorageConfigs: vi.fn().mockResolvedValue([enabledWebDAVConfig])
      },
      subscribeToDataChanges: listener => {
        dataChangeListener = listener
        return vi.fn()
      }
    })
    let releaseOldRead!: () => void
    const oldReadGate = new Promise<void>(resolve => { releaseOldRead = resolve })
    let firstRead = true
    let recoveredManifest: any = createEmptyCloudSyncManifest('2026-01-01T00:00:00.000Z')
    cloudClient.getCloudSyncManifest.mockImplementation(async () => {
      if (firstRead) {
        firstRead = false
        await oldReadGate
      }
      return recoveredManifest
    })
    service.startAutoSync({ syncOnStart: false, pollIntervalMs: 0, retryMs: 0 })
    dataChangeListener?.({
      storeName: 'prompts',
      action: 'update',
      id: 1,
      timestamp: Date.now(),
      sourceId: 'test'
    })

    const flush = service.flushPendingSync({ reason: 'shutdown', timeoutMs: 250 })
    await vi.advanceTimersByTimeAsync(250)
    const result = await flush

    expect(result).toMatchObject({ success: false, timedOut: true })
    expect(service.hasPendingChanges()).toBe(true)
    expect(storage.getItem('ai_gist_cloud_sync_pending_change')).not.toBeNull()

    database.exportAllDataForSync.mockResolvedValue({
      success: true,
      message: 'ok',
      data: {
        ...baseData,
        prompts: [{ ...baseData.prompts[0], title: 'New data after timeout', updatedAt: '2026-07-11T00:00:00.000Z' }]
      }
    })
    cloudClient.saveCloudSyncManifest.mockImplementation(async (_storageId: string, manifest: any) => {
      recoveredManifest = manifest
      return { success: true }
    })
    service.scheduleSync('resume', { delayMs: 0 })
    await vi.advanceTimersByTimeAsync(0)

    expect(service.getStatus()).toMatchObject({ status: 'success', pending: false })
    expect(service.hasPendingChanges()).toBe(false)
    expect(recoveredManifest.latestSnapshot.data.prompts).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: 'New data after timeout' })
    ]))

    releaseOldRead()
    await Promise.resolve()
    await Promise.resolve()
    await vi.runOnlyPendingTimersAsync()

    expect(recoveredManifest.latestSnapshot.data.prompts).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: 'New data after timeout' })
    ]))
    service.stopAutoSync()
  })

  it('reconciles a superseded manifest write that completes after timeout recovery', async () => {
    vi.useFakeTimers()
    let dataChangeListener: ((change: any) => void) | undefined
    let currentData: any = baseData
    let remoteManifest: any = createEmptyCloudSyncManifest('2026-01-01T00:00:00.000Z')
    let releaseOldSave!: () => void
    const oldSaveGate = new Promise<void>(resolve => { releaseOldSave = resolve })
    let saveAttempts = 0
    const secondConfigClient = {
      getStorageConfigs: vi.fn().mockResolvedValue([enabledWebDAVConfig])
    }
    const { service, cloudClient, database } = createService(baseData, remoteManifest, {
      configClient: secondConfigClient,
      subscribeToDataChanges: listener => {
        dataChangeListener = listener
        return vi.fn()
      }
    })
    database.exportAllDataForSync.mockImplementation(async () => ({ success: true, message: 'ok', data: currentData }))
    cloudClient.getCloudSyncManifest.mockImplementation(async () => remoteManifest)
    cloudClient.saveCloudSyncManifest.mockImplementation(async (_storageId: string, manifest: any, options?: any) => {
      saveAttempts += 1
      if (saveAttempts === 1) await oldSaveGate
      const currentRevision = remoteManifest.latestSnapshot?.revision || null
      if (options?.expectedRevision !== undefined && options.expectedRevision !== currentRevision) {
        return { success: false, conflict: true, error: 'manifest changed' }
      }
      remoteManifest = manifest
      return { success: true }
    })
    service.startAutoSync({ syncOnStart: false, pollIntervalMs: 0, retryMs: 0 })
    dataChangeListener?.({ storeName: 'prompts', action: 'update', id: 1, timestamp: Date.now(), sourceId: 'test' })

    const flush = service.flushPendingSync({ reason: 'shutdown', timeoutMs: 250 })
    await vi.advanceTimersByTimeAsync(250)
    expect(await flush).toMatchObject({ timedOut: true })

    currentData = {
      ...baseData,
      prompts: [{ ...baseData.prompts[0], title: 'Newest data', updatedAt: '2026-07-11T00:00:00.000Z' }]
    }
    service.scheduleSync('resume', { delayMs: 0 })
    await vi.advanceTimersByTimeAsync(0)
    expect(remoteManifest.latestSnapshot.data.prompts).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: 'Newest data' })
    ]))

    releaseOldSave()
    for (let index = 0; index < 12; index += 1) await Promise.resolve()
    expect(service.getStatus()).toMatchObject({ status: 'scheduled', reason: 'retry' })
    await vi.runOnlyPendingTimersAsync()

    expect(remoteManifest.latestSnapshot.data.prompts).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: 'Newest data' })
    ]))
    expect(saveAttempts).toBeGreaterThanOrEqual(2)
    service.stopAutoSync()
  })
})
