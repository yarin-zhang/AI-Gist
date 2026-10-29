/**
 * #490：已经单独用过一段时间的设备加入同步。
 * 默认快速优化动作按内置标识归并、第一次加入前先确认、同名分类合并后说明保留了哪一边。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import i18n from '~/i18n'
import { CloudSyncService } from '~/lib/services/cloud-sync.service'
import {
  buildDefaultQuickOptimizationConfigs,
  resolveQuickOptimizationBuiltinKey
} from '~/lib/services/quick-optimization-defaults'
import { createCloudSyncSnapshot } from '@shared/cloud-sync-engine'
import { createEmptyCloudSyncManifest } from '@shared/cloud-sync-manifest'
import {
  CLOUD_SYNC_COLLECTION_CONTRACT,
  describeCloudSyncCategoryMerges,
  reconcileCloudSyncDataContract
} from '@shared/cloud-sync-contract'
import { createCloudSyncJoinPreview } from '@shared/cloud-sync-join-preview'

class MemoryStorage {
  private values = new Map<string, string>()
  getItem(key: string): string | null { return this.values.get(key) ?? null }
  setItem(key: string, value: string): void { this.values.set(key, value) }
  removeItem(key: string): void { this.values.delete(key) }
}

const emptyData = () => ({
  categories: [] as any[],
  prompts: [] as any[],
  promptVariables: [] as any[],
  promptHistories: [] as any[],
  aiConfigs: [] as any[],
  quickOptimizationConfigs: [] as any[],
  aiHistory: [] as any[],
  settings: [] as any[],
  syncTombstones: [] as any[]
})

/** 某台设备在某种界面语言下第一次打开 AI 面板时预置的 5 个默认动作 */
const seededDefaults = (device: string, locale: string, createdAt: string, withBuiltinKey = true) => {
  const previous = i18n.global.locale.value
  i18n.global.locale.value = locale as any
  try {
    return buildDefaultQuickOptimizationConfigs().map((config, index) => {
      const record: any = {
        ...config,
        id: index + 1,
        uuid: `${device}-quick-${index + 1}`,
        createdAt,
        updatedAt: createdAt
      }
      if (!withBuiltinKey) delete record.builtinKey
      return record
    })
  } finally {
    i18n.global.locale.value = previous
  }
}

const prompt = (uuid: string, title: string) => ({
  id: Number(uuid.replace(/\D/g, '')) || 1,
  uuid,
  title,
  content: `${title} content`,
  tags: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z'
})

const category = (uuid: string, name: string, extra: Record<string, unknown> = {}) => ({
  id: Number(uuid.replace(/\D/g, '')) || 1,
  uuid,
  name,
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...extra
})

function createDevice(localData: any, cloud: { manifest: any }, deviceId: string) {
  const storage = new MemoryStorage()
  const database = {
    current: localData,
    exportAllDataForSync: vi.fn(async () => ({ success: true, message: 'ok', data: database.current })),
    replaceAllData: vi.fn(async (next: any) => {
      database.current = next
      return { success: true, message: 'ok' }
    })
  }
  const cloudClient = {
    getCloudSyncManifest: vi.fn(async () => cloud.manifest),
    saveCloudSyncManifest: vi.fn(async (_storageId: string, manifest: any) => {
      cloud.manifest = manifest
      return { success: true }
    })
  }
  const service = new CloudSyncService({
    cloudClient,
    database,
    storage,
    createDeviceId: () => deviceId,
    conflictMode: 'ask'
  })
  return { service, database, cloudClient, storage }
}

const cloudWith = (data: any, deviceId = 'device-a') => ({
  manifest: {
    ...createEmptyCloudSyncManifest('2026-01-01T00:00:00.000Z'),
    latestSnapshot: createCloudSyncSnapshot(data, deviceId, `rev-${deviceId}`)
  }
})

afterEach(() => {
  i18n.global.locale.value = 'zh-CN'
})

describe('默认快速优化动作按内置标识归并 (#490)', () => {
  it('把 builtinKey 声明为快速优化的业务唯一键', () => {
    expect(CLOUD_SYNC_COLLECTION_CONTRACT.quickOptimizationConfigs.businessUniqueFields).toEqual(['builtinKey'])
  })

  it.each([
    ['相同语言', 'zh-CN', 'zh-CN'],
    ['不同语言', 'en-US', 'zh-CN']
  ])('两台设备各自预置的默认动作（%s）同步后只剩一份', async (_label, cloudLocale, joiningLocale) => {
    const cloud = cloudWith({
      ...emptyData(),
      quickOptimizationConfigs: seededDefaults('device-a', cloudLocale, '2026-01-01T00:00:00.000Z')
    })
    const joining = createDevice({
      ...emptyData(),
      quickOptimizationConfigs: seededDefaults('device-c', joiningLocale, '2026-02-01T00:00:00.000Z')
    }, cloud, 'device-c')

    const result = await joining.service.syncNow('cfg-1', { reason: 'manual' })

    expect(result.success).toBe(true)
    expect(result.conflicts).toEqual([])
    const uploaded = cloud.manifest.latestSnapshot.data.quickOptimizationConfigs
    expect(uploaded).toHaveLength(5)
    expect(uploaded.map((item: any) => item.builtinKey).sort())
      .toEqual(['extractVariables', 'general', 'professional', 'richer', 'shorter'])
    // 云端已有的那一份保留下来（uuid 不变），只是去掉了重复
    expect(uploaded.map((item: any) => item.uuid).sort()).toEqual(
      ['device-a-quick-1', 'device-a-quick-2', 'device-a-quick-3', 'device-a-quick-4', 'device-a-quick-5']
    )
    expect(joining.database.current.quickOptimizationConfigs).toHaveLength(5)
    // 默认动作归并是预期行为，不出「业务唯一键冲突」这类提示
    expect(result.warnings || []).toEqual([])
  })

  it('用户改过的默认动作不参与归并', async () => {
    const cloud = cloudWith({
      ...emptyData(),
      quickOptimizationConfigs: seededDefaults('device-a', 'zh-CN', '2026-01-01T00:00:00.000Z')
    })
    const mine = seededDefaults('device-c', 'zh-CN', '2026-02-01T00:00:00.000Z')
    // 改过模板之后，编辑流程会去掉 builtinKey；这里模拟改过但还带着旧版本留下的数据
    delete mine[0].builtinKey
    mine[0].prompt = '我自己的更简短：{{content}}'
    const joining = createDevice({ ...emptyData(), quickOptimizationConfigs: mine }, cloud, 'device-c')

    const result = await joining.service.syncNow('cfg-1', { reason: 'manual' })

    expect(result.success).toBe(true)
    const uploaded = cloud.manifest.latestSnapshot.data.quickOptimizationConfigs
    expect(uploaded).toHaveLength(6)
    expect(uploaded.find((item: any) => item.uuid === 'device-c-quick-1')).toMatchObject({
      name: '更简短',
      prompt: '我自己的更简短：{{content}}'
    })
    expect(uploaded.find((item: any) => item.uuid === 'device-c-quick-1')).not.toHaveProperty('builtinKey')
  })

  it('老数据：没被改过的默认动作在同步时补上 builtinKey 并去重，另一台设备随后同步不弹冲突', async () => {
    // 两台旧版本设备已经同步过，云端和各自的基线里都是 10 个没有 builtinKey 的动作
    const legacy = [
      ...seededDefaults('device-a', 'en-US', '2026-01-01T00:00:00.000Z', false),
      ...seededDefaults('device-c', 'zh-CN', '2026-02-01T00:00:00.000Z', false)
    ].map((item, index) => ({ ...item, id: index + 1 }))
    const legacyData = { ...emptyData(), quickOptimizationConfigs: legacy }
    const legacySnapshot = createCloudSyncSnapshot(legacyData, 'device-a', 'rev-legacy')
    const cloud = {
      manifest: { ...createEmptyCloudSyncManifest('2026-02-01T00:00:00.000Z'), latestSnapshot: legacySnapshot }
    }
    const state = (deviceId: string) => JSON.stringify({
      storageId: 'cfg-1',
      deviceId,
      lastSyncAt: '2026-02-01T00:00:00.000Z',
      lastKnownRevision: 'rev-legacy',
      baseSnapshot: legacySnapshot
    })
    const deviceA = createDevice(structuredClone(legacyData), cloud, 'device-a')
    deviceA.storage.setItem('ai_gist_cloud_sync_state:cfg-1', state('device-a'))
    const deviceC = createDevice(structuredClone(legacyData), cloud, 'device-c')
    deviceC.storage.setItem('ai_gist_cloud_sync_state:cfg-1', state('device-c'))

    const first = await deviceA.service.syncNow('cfg-1', { reason: 'manual' })
    expect(first.success).toBe(true)
    expect(first.conflicts).toEqual([])
    expect(cloud.manifest.latestSnapshot.data.quickOptimizationConfigs).toHaveLength(5)
    expect(cloud.manifest.latestSnapshot.data.quickOptimizationConfigs.every((item: any) => item.builtinKey)).toBe(true)

    const second = await deviceC.service.syncNow('cfg-1', { reason: 'manual' })
    expect(second.success).toBe(true)
    expect(second.action).not.toBe('conflict-pending')
    expect(second.conflicts).toEqual([])
    expect(deviceC.database.current.quickOptimizationConfigs).toHaveLength(5)
  })

  it('合并时只给内容和默认值一致的动作补 builtinKey，并优先保留基线里的那一份', () => {
    const [shorter] = seededDefaults('device-a', 'en-US', '2026-01-01T00:00:00.000Z', false)
    const [shorterZh] = seededDefaults('device-c', 'zh-CN', '2025-01-01T00:00:00.000Z', false)
    const custom = { ...shorter, uuid: 'custom', prompt: 'Make it short: {{content}}' }

    const result = reconcileCloudSyncDataContract(
      { quickOptimizationConfigs: [shorter, shorterZh, custom] },
      { quickOptimizationConfigs: [shorter] },
      { resolveQuickOptimizationBuiltinKey }
    )

    expect(result.data.quickOptimizationConfigs?.map(item => item.uuid).sort()).toEqual(['custom', 'device-a-quick-1'])
    expect(result.data.quickOptimizationConfigs?.find(item => item.uuid === 'device-a-quick-1')?.builtinKey).toBe('shorter')
    expect(result.data.quickOptimizationConfigs?.find(item => item.uuid === 'custom')).not.toHaveProperty('builtinKey')
    expect(result.merges).toEqual([expect.objectContaining({
      collection: 'quickOptimizationConfigs',
      businessKeyField: 'builtinKey',
      canonicalUuid: 'device-a-quick-1'
    })])
  })
})

describe('第一次加入同步前的确认 (#490)', () => {
  const localData = () => ({
    ...emptyData(),
    categories: [category('local-cat-1', '写作'), category('local-cat-2', '生活')],
    prompts: [prompt('local-1', 'A'), prompt('local-2', 'B')],
    quickOptimizationConfigs: seededDefaults('device-c', 'zh-CN', '2026-02-01T00:00:00.000Z')
  })
  const remoteData = () => ({
    ...emptyData(),
    categories: [category('remote-cat-1', '写作'), category('remote-cat-2', '工作')],
    prompts: [prompt('remote-1', 'X'), prompt('remote-2', 'Y'), prompt('remote-3', 'Z')],
    quickOptimizationConfigs: seededDefaults('device-a', 'en-US', '2026-01-01T00:00:00.000Z')
  })

  it('本机和云端各有对方没有的数据时要问，并说明数量和同名分类', () => {
    const preview = createCloudSyncJoinPreview(localData(), remoteData())
    expect(preview).toEqual({
      needsConfirmation: true,
      local: { prompts: 2, categories: 2 },
      remote: { prompts: 3, categories: 2 },
      merged: { prompts: 5, categories: 3 },
      sameNameCategories: ['写作']
    })
  })

  it('本机为空、云端为空或一边的数据另一边都有时不问', () => {
    // 本机只有默认快速优化动作，不算有数据
    const onlyDefaults = { ...emptyData(), quickOptimizationConfigs: localData().quickOptimizationConfigs }
    expect(createCloudSyncJoinPreview(onlyDefaults, remoteData()).needsConfirmation).toBe(false)
    expect(createCloudSyncJoinPreview(localData(), emptyData()).needsConfirmation).toBe(false)
    expect(createCloudSyncJoinPreview(localData(), {}).needsConfirmation).toBe(false)
    // 同一台设备删掉存储后又加回来：本机的数据云端都有
    const remote = remoteData()
    const subset = { ...emptyData(), prompts: [remote.prompts[0]], categories: [remote.categories[0]] }
    expect(createCloudSyncJoinPreview(subset, remote).needsConfirmation).toBe(false)
    expect(createCloudSyncJoinPreview(remote, subset).needsConfirmation).toBe(false)
  })

  it('previewStorageJoin 只读：不改本机也不写云端；已经同步过的存储不再问', async () => {
    const cloud = cloudWith(remoteData())
    const device = createDevice(localData(), cloud, 'device-c')

    const preview = await device.service.previewStorageJoin('cfg-1')
    expect(preview.needsConfirmation).toBe(true)
    expect(preview.merged.prompts).toBe(5)
    expect(device.database.replaceAllData).not.toHaveBeenCalled()
    expect(device.cloudClient.saveCloudSyncManifest).not.toHaveBeenCalled()
    expect(await device.service.hasSyncedWithStorage('cfg-1')).toBe(false)

    await device.service.syncNow('cfg-1', { reason: 'manual' })
    expect(await device.service.hasSyncedWithStorage('cfg-1')).toBe(true)
    expect((await device.service.previewStorageJoin('cfg-1')).needsConfirmation).toBe(false)
  })

  it('云端还没有任何快照时不问', async () => {
    const cloud = { manifest: createEmptyCloudSyncManifest('2026-01-01T00:00:00.000Z') }
    const device = createDevice(localData(), cloud, 'device-c')
    expect((await device.service.previewStorageJoin('cfg-1')).needsConfirmation).toBe(false)
  })
})

describe('同名分类合并后说明保留了哪一边 (#490)', () => {
  it('同步结果带上字段不一样的同名分类，不再只给一条笼统的归并提示', async () => {
    const cloud = cloudWith({
      ...emptyData(),
      categories: [category('remote-cat-1', '写作', {
        description: '写作相关的提示词',
        updatedAt: '2026-01-01T00:00:00.000Z'
      })]
    })
    const device = createDevice({
      ...emptyData(),
      categories: [category('local-cat-1', '写作', {
        description: 'C 机上的写作分类',
        color: 'violet',
        updatedAt: '2026-03-01T00:00:00.000Z'
      })]
    }, cloud, 'device-c')

    const result = await device.service.syncNow('cfg-1', { reason: 'manual' })

    expect(result.success).toBe(true)
    expect(result.categoryMerges).toEqual([
      { name: '写作', keptSide: 'local', differingFields: ['description'] }
    ])
    expect(result.warnings || []).toEqual([])
    expect(cloud.manifest.latestSnapshot.data.categories).toEqual([
      expect.objectContaining({ name: '写作', description: 'C 机上的写作分类', color: 'violet' })
    ])
  })

  it('合并记录里只有字段名和记录标识，不带分类名称等内容', () => {
    const local = { categories: [category('local-cat-1', 'Work', { description: 'mine', updatedAt: '2026-01-01T00:00:00.000Z' })] }
    const remote = { categories: [category('remote-cat-1', 'Work', { description: 'theirs', updatedAt: '2026-02-01T00:00:00.000Z' })] }
    const result = reconcileCloudSyncDataContract({ categories: [...local.categories, ...remote.categories] })

    expect(result.merges).toEqual([expect.objectContaining({
      differingFields: ['description'],
      keptRecordIdentity: 'uuid:remote-cat-1'
    })])
    expect(JSON.stringify(result.merges)).not.toMatch(/Work|mine|theirs/)
    expect(describeCloudSyncCategoryMerges(result.merges, result.data, local, remote)).toEqual([
      { name: 'Work', keptSide: 'remote', differingFields: ['description'] }
    ])
  })

  it('两边字段一样（或只有一边填了）时没有要说明的', () => {
    const local = { categories: [category('local-cat-1', 'Work', { description: 'same' })] }
    const remote = { categories: [category('remote-cat-1', 'Work', { description: 'same', color: 'blue' })] }
    const result = reconcileCloudSyncDataContract({ categories: [...local.categories, ...remote.categories] })

    expect(result.merges).toHaveLength(1)
    expect(result.merges[0].differingFields).toEqual([])
    expect(describeCloudSyncCategoryMerges(result.merges, result.data, local, remote)).toEqual([])
  })
})
