/**
 * 模型配置的 API Key 不随同步 / 云端备份上传，写回本机时保留本机凭据 (#491)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  dataSetContainsCredentials,
  isAIConfigCredentialMissing,
  restoreLocalAIConfigCredentials,
  stripCredentialsFromDataSet
} from '@shared/ai-config-credentials'
import { createCloudSyncSnapshot } from '@shared/cloud-sync-engine'
import { createEmptyCloudSyncManifest } from '@shared/cloud-sync-manifest'
import { parseBackupPayload } from '@shared/backup-integrity'
import { CloudSyncService } from '~/lib/services/cloud-sync.service'
import { DatabaseServiceManager } from '~/lib/services/database-manager.service'
import { WebCloudBackupService } from '~/lib/services/web-cloud-backup.service'
import {
  createTransactionalIndexedDB,
  type StoreDefinition,
  type TransactionalIndexedDB
} from '../helpers/transactional-indexeddb'

const T0 = '2026-07-01T00:00:00.000Z'
const T1 = '2026-07-02T00:00:00.000Z'
const T2 = '2026-07-03T00:00:00.000Z'

class MemoryStorage {
  private values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }
}

function aiConfig(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    uuid: 'ai-config-1',
    configId: 'openai-main',
    name: 'OpenAI',
    type: 'openai',
    baseURL: 'https://api.openai.com/v1',
    models: ['gpt-4o-mini'],
    defaultModel: 'gpt-4o-mini',
    enabled: true,
    createdAt: T0,
    updatedAt: T0,
    ...overrides
  }
}

function emptyData() {
  return {
    categories: [],
    prompts: [],
    promptVariables: [],
    promptHistories: [],
    aiConfigs: [] as any[],
    quickOptimizationConfigs: [],
    aiHistory: [],
    settings: [],
    syncTombstones: [] as any[]
  }
}

function createMemoryCloud(initialManifest = createEmptyCloudSyncManifest(T0)) {
  let manifest: any = initialManifest
  const client = {
    getCloudSyncManifest: vi.fn(async () => manifest),
    saveCloudSyncManifest: vi.fn(async (_storageId: string, nextManifest: any) => {
      manifest = JSON.parse(JSON.stringify(nextManifest))
      return { success: true }
    })
  }
  return {
    client,
    get manifest() {
      return manifest
    },
    set manifest(value: any) {
      manifest = value
    }
  }
}

function remoteManifest(data: any, deviceId = 'device-old', revision = 'rev-old') {
  const snapshot = createCloudSyncSnapshot(data, deviceId, revision)
  return {
    manifest: { ...createEmptyCloudSyncManifest(T0), latestSnapshot: snapshot },
    snapshot
  }
}

function seedLocalBase(storage: MemoryStorage, snapshot: any, deviceId = 'device-new') {
  storage.setItem('ai_gist_cloud_sync_state:cfg-1', JSON.stringify({
    storageId: 'cfg-1',
    deviceId,
    lastSyncAt: T0,
    lastKnownRevision: snapshot.revision,
    baseSnapshot: snapshot
  }))
}

describe('ai-config-credentials 辅助函数', () => {
  it('去掉 aiConfigs 和删除标记副本里的 apiKey / secretKey，不改动传入的数据', () => {
    const data = {
      ...emptyData(),
      aiConfigs: [aiConfig({ apiKey: 'sk-live', secretKey: 'secret-live' })],
      syncTombstones: [{
        collectionName: 'aiConfigs',
        recordKey: 'configId:old',
        deletedAt: T0,
        recordSnapshot: aiConfig({ configId: 'old', apiKey: 'sk-deleted' })
      }]
    }

    const stripped = stripCredentialsFromDataSet(data)

    expect(JSON.stringify(stripped)).not.toContain('sk-')
    expect(JSON.stringify(stripped)).not.toContain('secret-live')
    expect(stripped.aiConfigs[0]).not.toHaveProperty('apiKey')
    expect(stripped.aiConfigs[0]).toMatchObject({ uuid: 'ai-config-1', name: 'OpenAI' })
    expect(data.aiConfigs[0].apiKey).toBe('sk-live')
    expect(dataSetContainsCredentials(data)).toBe(true)
    expect(dataSetContainsCredentials(stripped)).toBe(false)
  })

  it('按 uuid、再按 configId 补回本机凭据；传入记录自带凭据时以它为准', () => {
    const incoming = [
      aiConfig({ uuid: 'same-uuid', configId: 'a' }),
      aiConfig({ uuid: 'other-device-uuid', configId: 'b' }),
      aiConfig({ uuid: 'new-config', configId: 'c' }),
      aiConfig({ uuid: 'restored', configId: 'd', apiKey: 'sk-from-backup' })
    ]
    const local = [
      aiConfig({ uuid: 'same-uuid', configId: 'a', apiKey: 'sk-a', secretKey: 'secret-a' }),
      aiConfig({ uuid: 'local-uuid', configId: 'b', apiKey: 'sk-b' }),
      aiConfig({ uuid: 'restored', configId: 'd', apiKey: 'sk-local-d' })
    ]

    const { records, restored } = restoreLocalAIConfigCredentials(incoming, local)

    expect(restored).toBe(2)
    expect(records[0]).toMatchObject({ apiKey: 'sk-a', secretKey: 'secret-a' })
    expect(records[1]).toMatchObject({ apiKey: 'sk-b' })
    expect(records[2]).not.toHaveProperty('apiKey')
    expect(records[3]).toMatchObject({ apiKey: 'sk-from-backup' })
  })

  it('需要 API Key 的服务商没有填写时算缺少凭据，本地服务不算', () => {
    expect(isAIConfigCredentialMissing({ type: 'openai' })).toBe(true)
    expect(isAIConfigCredentialMissing({ type: 'openai', apiKey: '   ' })).toBe(true)
    expect(isAIConfigCredentialMissing({ type: 'openai', apiKey: 'sk-1' })).toBe(false)
    expect(isAIConfigCredentialMissing({ type: 'ollama' })).toBe(false)
    expect(isAIConfigCredentialMissing({ type: 'lmstudio' })).toBe(false)
  })
})

describe('CloudSyncService 不上传模型配置凭据', () => {
  function createService(localData: any, cloud = createMemoryCloud(), storage = new MemoryStorage()) {
    const database = {
      exportAllDataForSync: vi.fn(async () => ({ success: true, message: 'ok', data: localData })),
      replaceAllData: vi.fn(async () => ({ success: true, message: 'ok' }))
    }
    const service = new CloudSyncService({
      cloudClient: cloud.client,
      database,
      storage,
      createDeviceId: () => 'device-new'
    })
    return { service, database, cloud, storage }
  }

  it('首次上传的 manifest 里没有任何 API Key，即使数据库导出带着凭据', async () => {
    const localData = {
      ...emptyData(),
      aiConfigs: [aiConfig({ apiKey: 'sk-local-123', secretKey: 'secret-local' })],
      syncTombstones: [{
        collectionName: 'aiConfigs',
        recordKey: 'configId:deleted',
        deletedAt: T0,
        recordSnapshot: aiConfig({ uuid: 'deleted', configId: 'deleted', apiKey: 'sk-deleted-456' })
      }]
    }
    const { service, cloud } = createService(localData)

    const result = await service.syncNow('cfg-1', { reason: 'manual' })

    expect(result).toMatchObject({ success: true, action: 'uploaded' })
    const uploaded = JSON.stringify(cloud.manifest)
    expect(uploaded).not.toContain('sk-local-123')
    expect(uploaded).not.toContain('sk-deleted-456')
    expect(uploaded).not.toContain('secret-local')
    expect(uploaded).not.toContain('"apiKey"')
    expect(cloud.manifest.latestSnapshot.data.aiConfigs[0]).toMatchObject({ uuid: 'ai-config-1', name: 'OpenAI' })
  })

  it('旧版本留在云端的明文 API Key 在下一次同步时被不含凭据的快照覆盖，本机数据不动', async () => {
    const oldData = { ...emptyData(), aiConfigs: [aiConfig({ apiKey: 'sk-old-plaintext' })] }
    const { manifest, snapshot } = remoteManifest(oldData)
    const cloud = createMemoryCloud(manifest as any)
    const storage = new MemoryStorage()
    seedLocalBase(storage, snapshot)
    const { service, database } = createService({ ...emptyData(), aiConfigs: [aiConfig()] }, cloud, storage)

    const result = await service.syncNow('cfg-1', { reason: 'manual' })

    expect(result).toMatchObject({ success: true, uploadedRemote: true, appliedLocal: false, conflicts: [] })
    expect(database.replaceAllData).not.toHaveBeenCalled()
    expect(cloud.client.saveCloudSyncManifest).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(cloud.manifest)).not.toContain('sk-old-plaintext')
    expect(cloud.manifest.latestSnapshot.revision).not.toBe('rev-old')
  })

  it('两边只差 API Key 时既不算冲突也不算修改', async () => {
    const base = remoteManifest({ ...emptyData(), aiConfigs: [aiConfig({ apiKey: 'sk-base' })] }, 'device-old', 'rev-base')
    const remote = remoteManifest(
      { ...emptyData(), aiConfigs: [aiConfig({ apiKey: 'sk-remote', updatedAt: T1 })] },
      'device-old',
      'rev-remote'
    )
    const cloud = createMemoryCloud(remote.manifest as any)
    const storage = new MemoryStorage()
    seedLocalBase(storage, base.snapshot)
    const localData = { ...emptyData(), aiConfigs: [aiConfig({ apiKey: 'sk-local', updatedAt: T2 })] }
    const { service, database } = createService(localData, cloud, storage)

    const result = await service.syncNow('cfg-1', { reason: 'manual' })

    expect(result.success).toBe(true)
    expect(result.action).not.toBe('conflict-pending')
    expect(result.conflicts).toEqual([])
    expect(result.summary.conflicts).toBe(0)
    // 本机和云端的配置除了 API Key 完全一致（updatedAt 只是元数据）：本机不需要写入
    expect(database.replaceAllData).not.toHaveBeenCalled()
    expect(JSON.stringify(cloud.manifest)).not.toMatch(/sk-(remote|local|base)/)
  })
})

const STORE_DEFINITIONS: Record<string, StoreDefinition> = {
  categories: { indexes: { name: { keyPath: 'name', unique: true }, uuid: { keyPath: 'uuid', unique: true } } },
  prompts: { indexes: { uuid: { keyPath: 'uuid', unique: true } } },
  promptVariables: { indexes: { uuid: { keyPath: 'uuid', unique: true } } },
  promptHistories: { indexes: { uuid: { keyPath: 'uuid', unique: true } } },
  ai_configs: {
    indexes: {
      configId: { keyPath: 'configId', unique: true },
      uuid: { keyPath: 'uuid', unique: true }
    }
  },
  quick_optimization_configs: { indexes: { uuid: { keyPath: 'uuid', unique: true } } },
  ai_generation_history: {
    indexes: {
      historyId: { keyPath: 'historyId', unique: true },
      uuid: { keyPath: 'uuid', unique: true }
    }
  },
  settings: { indexes: { key: { keyPath: 'key', unique: true } } },
  syncTombstones: { indexes: {} }
}

describe('DatabaseServiceManager 写回本机时保留本机凭据', () => {
  let manager: DatabaseServiceManager
  let indexedDb: TransactionalIndexedDB

  beforeEach(() => {
    ;(DatabaseServiceManager as any).instance = undefined
    manager = DatabaseServiceManager.getInstance()
    indexedDb = createTransactionalIndexedDB(STORE_DEFINITIONS)
    ;(manager.category as any).db = indexedDb.db
    vi.spyOn(manager, 'waitForInitialization').mockResolvedValue(undefined)
    vi.spyOn(manager.category, 'checkObjectStoreExists').mockResolvedValue(true)
    vi.spyOn(manager.category, 'migrateAllRecordsToUUID').mockResolvedValue({} as any)
    vi.spyOn(manager.category, 'getSyncTombstones').mockImplementation(async () => indexedDb.snapshot('syncTombstones'))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    ;(DatabaseServiceManager as any).instance = undefined
  })

  it('同步导出不带 API Key（含删除标记里的副本），备份导出照常保留', async () => {
    indexedDb.seed('ai_configs', [aiConfig({ apiKey: 'sk-local', secretKey: 'secret-local' })])
    indexedDb.seed('syncTombstones', [{
      id: 1,
      storeName: 'ai_configs',
      collectionName: 'aiConfigs',
      recordKey: 'configId:deleted',
      recordUuid: 'deleted',
      deletedAt: T0,
      recordSnapshot: aiConfig({ id: 2, uuid: 'deleted', configId: 'deleted', apiKey: 'sk-deleted' })
    }])

    const syncExport = await manager.exportAllDataForSync()
    const backupExport = await manager.exportAllDataForBackup()

    expect(syncExport.success, JSON.stringify(syncExport)).toBe(true)
    expect(syncExport.data.aiConfigs).toHaveLength(1)
    expect(JSON.stringify(syncExport.data)).not.toMatch(/sk-local|sk-deleted|secret-local/)
    expect(backupExport.data.aiConfigs[0]).toMatchObject({ apiKey: 'sk-local', secretKey: 'secret-local' })
  })

  it('写入不带凭据的配置时，按 uuid 补回本机 API Key，新设备没有的配置保持为空', async () => {
    indexedDb.seed('ai_configs', [aiConfig({ apiKey: 'sk-local', secretKey: 'secret-local' })])

    const result = await manager.replaceAllData({
      ...emptyData(),
      aiConfigs: [
        aiConfig({ name: 'OpenAI（改名）', updatedAt: T1 }),
        aiConfig({ id: 2, uuid: 'ai-config-2', configId: 'deepseek', type: 'deepseek', name: 'DeepSeek' })
      ]
    }, { preserveSyncMetadata: true })

    expect(result).toMatchObject({ success: true })
    const stored = indexedDb.snapshot('ai_configs')
    const byUuid = new Map(stored.map(config => [config.uuid, config]))
    expect(byUuid.get('ai-config-1')).toMatchObject({ name: 'OpenAI（改名）', apiKey: 'sk-local', secretKey: 'secret-local' })
    expect(byUuid.get('ai-config-2')).toMatchObject({ name: 'DeepSeek' })
    expect(byUuid.get('ai-config-2')).not.toHaveProperty('apiKey')
  })

  it('另一台设备用不同 uuid 建了同一个 configId 时，按 configId 补回凭据', async () => {
    indexedDb.seed('ai_configs', [aiConfig({ uuid: 'local-uuid', apiKey: 'sk-local' })])

    const result = await manager.replaceAllData({
      ...emptyData(),
      aiConfigs: [aiConfig({ uuid: 'remote-uuid' })]
    })

    expect(result).toMatchObject({ success: true })
    expect(indexedDb.snapshot('ai_configs')).toEqual([
      expect.objectContaining({ uuid: 'remote-uuid', configId: 'openai-main', apiKey: 'sk-local' })
    ])
  })

  it('恢复带 API Key 的备份时以备份为准；显式关闭时不补本机凭据', async () => {
    indexedDb.seed('ai_configs', [aiConfig({ apiKey: 'sk-local' })])

    await manager.replaceAllData({ ...emptyData(), aiConfigs: [aiConfig({ apiKey: 'sk-from-backup' })] })
    expect(indexedDb.snapshot('ai_configs')[0].apiKey).toBe('sk-from-backup')

    await manager.replaceAllData({ ...emptyData(), aiConfigs: [aiConfig()] }, { preserveLocalCredentials: false })
    expect(indexedDb.snapshot('ai_configs')[0]).not.toHaveProperty('apiKey')
  })

  it('写入失败整体回滚，本机 API Key 不受影响', async () => {
    indexedDb.seed('ai_configs', [aiConfig({ apiKey: 'sk-local' })])
    const before = indexedDb.snapshot('ai_configs')
    indexedDb.injectWriteFailure({
      storeName: 'ai_configs',
      writeNumber: 1,
      error: new DOMException('Injected disk quota failure', 'QuotaExceededError')
    })

    const result = await manager.replaceAllData({ ...emptyData(), aiConfigs: [aiConfig({ name: 'Renamed' })] })

    expect(result.success).toBe(false)
    expect(indexedDb.snapshot('ai_configs')).toEqual(before)
  })

  it('端到端：另一台设备改名并新增配置，同步写回后本机 API Key 仍在，云端始终没有 API Key', async () => {
    indexedDb.seed('ai_configs', [aiConfig({ apiKey: 'sk-this-device' })])
    const cloud = createMemoryCloud()
    const storage = new MemoryStorage()
    const database = {
      exportAllDataForSync: () => manager.exportAllDataForSync(),
      replaceAllData: vi.fn((data: any, options?: any) => manager.replaceAllData(data, options))
    }
    const service = new CloudSyncService({
      cloudClient: cloud.client,
      database,
      storage,
      createDeviceId: () => 'device-this'
    })

    const first = await service.syncNow('cfg-1', { reason: 'manual' })
    expect(first).toMatchObject({ success: true, action: 'uploaded' })
    expect(JSON.stringify(cloud.manifest)).not.toContain('sk-this-device')

    // 另一台设备（新版本，不带凭据）把配置改名，并新增一个配置
    const otherDeviceData = {
      ...emptyData(),
      aiConfigs: [
        { ...cloud.manifest.latestSnapshot.data.aiConfigs[0], name: 'OpenAI（另一台设备改名）', updatedAt: T2 },
        aiConfig({ id: 7, uuid: 'from-other-device', configId: 'deepseek', type: 'deepseek', name: 'DeepSeek', updatedAt: T2 })
      ]
    }
    cloud.manifest = {
      ...cloud.manifest,
      latestSnapshot: createCloudSyncSnapshot(otherDeviceData, 'device-other', 'rev-other')
    }

    const second = await service.syncNow('cfg-1', { reason: 'manual' })

    expect(second).toMatchObject({ success: true, appliedLocal: true, conflicts: [] })
    expect(database.replaceAllData).toHaveBeenCalledTimes(1)
    const stored = new Map(indexedDb.snapshot('ai_configs').map(config => [config.uuid, config]))
    expect(stored.get('ai-config-1')).toMatchObject({ name: 'OpenAI（另一台设备改名）', apiKey: 'sk-this-device' })
    expect(stored.get('from-other-device')).toMatchObject({ name: 'DeepSeek' })
    expect(stored.get('from-other-device')?.apiKey).toBeUndefined()
    expect(isAIConfigCredentialMissing(stored.get('from-other-device'))).toBe(true)
    expect(JSON.stringify(cloud.manifest)).not.toContain('sk-this-device')

    // 再同步一次：本机多出的 API Key 不算改动，不会触发上传
    cloud.client.saveCloudSyncManifest.mockClear()
    const third = await service.syncNow('cfg-1', { reason: 'manual' })
    expect(third).toMatchObject({ success: true, action: 'noop' })
    expect(cloud.client.saveCloudSyncManifest).not.toHaveBeenCalled()
  })
})

describe('云端备份不带 API Key', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('Web 端云端备份上传前去掉模型配置凭据', async () => {
    const webdavConfig = {
      id: 'web-cfg',
      name: 'WebDAV',
      type: 'webdav' as const,
      enabled: true,
      url: 'https://dav.example.test/dav',
      username: 'user',
      password: 'pass',
      createdAt: T0,
      updatedAt: T0
    }
    localStorage.setItem('ai-gist:web:cloud-storage-configs', JSON.stringify([webdavConfig]))
    let requestBody: any
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body))
      return new Response(JSON.stringify({
        success: true,
        data: {
          id: requestBody.backupData.id,
          name: requestBody.backupData.name,
          createdAt: requestBody.backupData.createdAt,
          cloudPath: `/AI-Gist-Backup/${requestBody.fileName}`,
          storageId: webdavConfig.id,
          checksum: requestBody.backupData.checksum
        }
      }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    })

    const result = await WebCloudBackupService.getInstance().createCloudBackup(webdavConfig.id, {
      data: { ...emptyData(), aiConfigs: [aiConfig({ apiKey: 'sk-web-backup' })] }
    })

    expect(result.success).toBe(true)
    expect(JSON.stringify(requestBody.backupData)).not.toContain('sk-web-backup')
    expect(parseBackupPayload(requestBody.backupData).data.aiConfigs[0]).toMatchObject({ uuid: 'ai-config-1' })
  })
})
