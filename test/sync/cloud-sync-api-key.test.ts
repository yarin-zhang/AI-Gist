/**
 * 模型配置的 API Key 跟着同步和云端备份走：换一台设备同步下来就能直接用，不用再填一遍。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

function createMemoryCloud(initialManifest: any = createEmptyCloudSyncManifest(T0)) {
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
    }
  }
}

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
  return { service, database, cloud }
}

describe('API Key 随同步走', () => {
  it('上传的同步数据带着模型配置的 API Key', async () => {
    const { service, cloud } = createService({
      ...emptyData(),
      aiConfigs: [aiConfig({ apiKey: 'sk-local-123', secretKey: 'secret-local' })]
    })

    const result = await service.syncNow('cfg-1', { reason: 'manual' })

    expect(result).toMatchObject({ success: true, action: 'uploaded' })
    expect(cloud.manifest.latestSnapshot.data.aiConfigs[0]).toMatchObject({
      uuid: 'ai-config-1',
      apiKey: 'sk-local-123',
      secretKey: 'secret-local'
    })
  })

  it('另一台设备上的配置连同 API Key 一起写进本机', async () => {
    const remoteData = { ...emptyData(), aiConfigs: [aiConfig({ apiKey: 'sk-other-device' })] }
    const snapshot = createCloudSyncSnapshot(remoteData, 'device-old', 'rev-old')
    const cloud = createMemoryCloud({ ...createEmptyCloudSyncManifest(T0), latestSnapshot: snapshot })
    const { service, database } = createService(emptyData(), cloud)

    const result = await service.syncNow('cfg-1', { reason: 'manual' })

    expect(result.success).toBe(true)
    expect(database.replaceAllData).toHaveBeenCalledTimes(1)
    const written = (database.replaceAllData.mock.calls[0] as any[])[0]
    expect(written.aiConfigs[0]).toMatchObject({ uuid: 'ai-config-1', apiKey: 'sk-other-device' })
  })

  it('另一台设备换了 API Key，本机同步后也换成新的', async () => {
    const baseData = { ...emptyData(), aiConfigs: [aiConfig({ apiKey: 'sk-old' })] }
    const base = createCloudSyncSnapshot(baseData, 'device-old', 'rev-base')
    const remote = createCloudSyncSnapshot(
      { ...emptyData(), aiConfigs: [aiConfig({ apiKey: 'sk-new', updatedAt: T1 })] },
      'device-old',
      'rev-remote'
    )
    const cloud = createMemoryCloud({ ...createEmptyCloudSyncManifest(T0), latestSnapshot: remote })
    const storage = new MemoryStorage()
    storage.setItem('ai_gist_cloud_sync_state:cfg-1', JSON.stringify({
      storageId: 'cfg-1',
      deviceId: 'device-new',
      lastSyncAt: T0,
      lastKnownRevision: base.revision,
      baseSnapshot: base
    }))
    const { service, database } = createService(baseData, cloud, storage)

    const result = await service.syncNow('cfg-1', { reason: 'manual' })

    expect(result.success).toBe(true)
    expect(result.conflicts).toEqual([])
    const written = (database.replaceAllData.mock.calls[0] as any[])[0]
    expect(written.aiConfigs[0]).toMatchObject({ apiKey: 'sk-new' })
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

describe('本机数据库读写带着 API Key', () => {
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

  it('同步导出带着 API Key', async () => {
    indexedDb.seed('ai_configs', [aiConfig({ apiKey: 'sk-local', secretKey: 'secret-local' })])

    const syncExport = await manager.exportAllDataForSync()

    expect(syncExport.success, JSON.stringify(syncExport)).toBe(true)
    expect(syncExport.data.aiConfigs[0]).toMatchObject({ apiKey: 'sk-local', secretKey: 'secret-local' })
  })

  it('写入同步结果时用收到的 API Key', async () => {
    indexedDb.seed('ai_configs', [aiConfig({ apiKey: 'sk-old' })])

    const result = await manager.replaceAllData({
      ...emptyData(),
      aiConfigs: [aiConfig({ apiKey: 'sk-new', updatedAt: T1 })]
    }, { preserveSyncMetadata: true })

    expect(result).toMatchObject({ success: true })
    expect(indexedDb.snapshot('ai_configs')[0]).toMatchObject({ uuid: 'ai-config-1', apiKey: 'sk-new' })
  })
})

describe('云端备份带着 API Key', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('Web 端云端备份里有模型配置的 API Key，恢复到新设备后能直接用', async () => {
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
    expect(parseBackupPayload(requestBody.backupData).data.aiConfigs[0]).toMatchObject({
      uuid: 'ai-config-1',
      apiKey: 'sk-web-backup'
    })
  })
})
