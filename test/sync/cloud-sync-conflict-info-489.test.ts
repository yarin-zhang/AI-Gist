/**
 * #489：冲突弹窗的信息误导
 * - 删除标记被当成「云端新增」计数；冲突项在新增 / 修改 / 删除里重复计数
 * - 两边时间只到分钟，看不出哪边更新
 * - 一台设备的删除被另一台撤销后，删除方没有任何提示
 * - 云端 manifest 的冲突带完整记录，设备名是整串 User-Agent
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import i18n from '~/i18n'
import {
  CloudSyncService,
  createCloudSyncPendingConflict,
  getCloudSyncRestoredMessage
} from '~/lib/services/cloud-sync.service'
import {
  findCloudSyncRecordsRestoredOverLocalDeletes,
  mergeCloudSyncData
} from '@shared/cloud-sync-engine'
import {
  createEmptyCloudSyncManifest,
  normalizeCloudSyncManifest,
  sanitizeCloudSyncConflictsForMetadata,
  type CloudSyncManifest
} from '@shared/cloud-sync-manifest'
import { getPlatformDeviceName, normalizeDeviceHostName } from '~/lib/utils/device-name'
import { describeConflictVersionTimes } from '~/lib/utils/sync-conflict-versions'

const EMPTY = {
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

const T0 = '2026-01-01T00:00:00.000Z'
const prompt = (uuid: string, title: string, updatedAt = T0, extra: Record<string, unknown> = {}) => ({
  id: Number(uuid.replace(/\D/g, '')) || 1,
  uuid,
  title,
  content: `${title} 正文`,
  createdAt: T0,
  updatedAt,
  ...extra
})
const tombstone = (collectionName: string, uuid: string, deletedAt: string) => ({
  collectionName,
  recordKey: `uuid:${uuid}`,
  recordUuid: uuid,
  deletedAt
})
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))

class MemoryStorage {
  private values = new Map<string, string>()
  getItem(key: string): string | null { return this.values.get(key) || null }
  setItem(key: string, value: string): void { this.values.set(key, value) }
  removeItem(key: string): void { this.values.delete(key) }
}

/** 共用一份内存云端的「设备」：本机数据随 replaceAllData 变化，删除时写删除标记 */
function createCloud() {
  let manifest: CloudSyncManifest = createEmptyCloudSyncManifest(T0)
  const client = {
    getCloudSyncManifest: vi.fn(async () => clone(manifest)),
    saveCloudSyncManifest: vi.fn(async (_storageId: string, next: CloudSyncManifest) => {
      manifest = clone(next)
      return { success: true }
    })
  }
  return { client, read: () => manifest }
}

function createDevice(cloud: ReturnType<typeof createCloud>, deviceId: string, initial: any) {
  let data = clone(initial)
  const service = new CloudSyncService({
    cloudClient: cloud.client,
    database: {
      exportAllDataForSync: async () => ({ success: true, message: 'ok', data: clone(data) }),
      replaceAllData: async (next: any) => {
        data = clone(next)
        return { success: true, message: 'ok' }
      }
    },
    storage: new MemoryStorage(),
    createDeviceId: () => deviceId,
    conflictMode: 'ask'
  })
  return {
    service,
    get data() { return data },
    edit(uuid: string, patch: Record<string, unknown>) {
      data.prompts = data.prompts.map((item: any) => item.uuid === uuid ? { ...item, ...patch } : item)
    },
    remove(uuid: string, deletedAt: string) {
      data.prompts = data.prompts.filter((item: any) => item.uuid !== uuid)
      data.syncTombstones = [...data.syncTombstones, tombstone('prompts', uuid, deletedAt)]
    }
  }
}

describe('merge summary counts (#489)', () => {
  it('does not count a new deletion marker from the cloud as an added record', () => {
    const base = { ...EMPTY, prompts: [prompt('p1', '提示词 01'), prompt('p4', '提示词 04')] }
    const remote = {
      ...EMPTY,
      prompts: [prompt('p1', '提示词 01')],
      syncTombstones: [tombstone('prompts', 'p4', '2026-01-02T00:00:00.000Z')]
    }

    const result = mergeCloudSyncData(clone(base), remote, base)

    expect(result.data.prompts?.map(item => item.uuid)).toEqual(['p1'])
    expect(result.summary).toMatchObject({ added: 0, updated: 0, deleted: 1, conflicts: 0 })
  })

  it('does not count this device’s own pending deletion as a cloud deletion', () => {
    const base = { ...EMPTY, prompts: [prompt('p1', '提示词 01'), prompt('p4', '提示词 04')] }
    const local = {
      ...EMPTY,
      prompts: [prompt('p1', '提示词 01')],
      syncTombstones: [tombstone('prompts', 'p4', '2026-01-02T00:00:00.000Z')]
    }

    const result = mergeCloudSyncData(local, clone(base), base)

    expect(result.data.prompts?.map(item => item.uuid)).toEqual(['p1'])
    expect(result.summary).toMatchObject({ added: 0, updated: 0, deleted: 0, conflicts: 0 })
  })

  it('counts conflicting records only as conflicts, not again as cloud changes', () => {
    const base = { ...EMPTY, prompts: [prompt('p2', '提示词 02'), prompt('p3', '提示词 03')] }
    const local = { ...EMPTY, prompts: [prompt('p2', '本机改的', '2026-01-02T00:00:00.000Z'), prompt('p3', '提示词 03')] }
    const remote = {
      ...EMPTY,
      prompts: [
        prompt('p2', '云端改的', '2026-01-02T00:00:05.000Z'),
        prompt('p3', '只有云端改了', '2026-01-02T00:00:05.000Z'),
        prompt('p5', '云端新建的', '2026-01-02T00:00:05.000Z')
      ]
    }

    const result = mergeCloudSyncData(local, remote, base, { prefer: 'newer' })

    expect(result.conflicts).toHaveLength(1)
    expect(result.summary).toMatchObject({ added: 1, updated: 1, deleted: 0, conflicts: 1 })
  })
})

describe('deleted on one device, kept on the other (#489)', () => {
  afterEach(() => {
    i18n.global.locale.value = 'zh-CN'
  })

  it('reproduces the issue: stats, deletion time in the dialog, and a restored notice on the deleting device', async () => {
    i18n.global.locale.value = 'zh-CN'
    const cloud = createCloud()
    const initial = { ...EMPTY, prompts: [prompt('p2', '提示词 02'), prompt('p4', '提示词 04')] }
    const deviceA = createDevice(cloud, 'device-a', initial)
    const deviceB = createDevice(cloud, 'device-b', initial)

    expect((await deviceA.service.syncNow('cfg-1', { deviceName: 'MacBook A' })).success).toBe(true)
    expect((await deviceB.service.syncNow('cfg-1', { deviceName: 'MacBook B' })).success).toBe(true)

    // 离线时：A 删除「提示词 04」并改「提示词 02」；1.5 秒后 B 给「提示词 04」补说明，也改「提示词 02」
    deviceA.remove('p4', '2026-01-02T00:00:00.000Z')
    deviceA.edit('p2', { title: 'A 改的标题', updatedAt: '2026-01-02T00:00:00.000Z' })
    deviceB.edit('p4', { description: 'B 补的说明', updatedAt: '2026-01-02T00:00:01.500Z' })
    deviceB.edit('p2', { title: 'B 改的标题', updatedAt: '2026-01-02T00:00:01.500Z' })

    expect((await deviceA.service.syncNow('cfg-1', { deviceName: 'MacBook A' })).action).toBe('uploaded')

    const pendingOnB = await deviceB.service.syncNow('cfg-1', { deviceName: 'MacBook B' })
    expect(pendingOnB.action).toBe('conflict-pending')
    const pending = pendingOnB.pendingConflict!
    // 删除标记不再被算成「云端新增 1 条」，两个冲突项也不再重复计入修改 / 删除
    expect(pending.summary).toMatchObject({ added: 0, updated: 0, deleted: 0, conflicts: 2 })
    expect(pending.items).toHaveLength(2)
    const deletedItem = pending.items.find(item => item.key === 'uuid:p4')!
    expect(deletedItem).toMatchObject({
      reason: 'delete_vs_update',
      localDeleted: false,
      remoteDeleted: true,
      localUpdatedAt: '2026-01-02T00:00:01.500Z',
      remoteDeletedAt: '2026-01-02T00:00:00.000Z'
    })

    const resolved = await deviceB.service.resolveConflicts('cfg-1', { strategy: 'smart' }, { deviceName: 'MacBook B' })
    expect(resolved.success).toBe(true)
    expect(resolved.restoredAfterLocalDelete).toBeUndefined()

    // A 再同步：自己删掉的提示词因为 B 的修改更晚而回来了，结果里带出这条记录
    const onDeletingDevice = await deviceA.service.syncNow('cfg-1', { deviceName: 'MacBook A' })
    expect(onDeletingDevice.success).toBe(true)
    expect(deviceA.data.prompts.map((item: any) => item.uuid).sort()).toEqual(['p2', 'p4'])
    expect(onDeletingDevice.restoredAfterLocalDelete).toEqual([
      { collection: 'prompts', key: 'uuid:p4', label: '提示词 04' }
    ])
    expect(deviceA.service.getStatus().lastResult?.restoredAfterLocalDelete).toHaveLength(1)
    expect(getCloudSyncRestoredMessage(onDeletingDevice.restoredAfterLocalDelete))
      .toBe('「提示词 04」在另一台设备上被修改，已恢复')

    // 之后的同步不再重复提醒
    const again = await deviceA.service.syncNow('cfg-1', { deviceName: 'MacBook A' })
    expect(again.restoredAfterLocalDelete).toBeUndefined()

    // 云端 manifest：冲突只留记录键、原因、处理结果和时间；设备名是传进来的名字
    const manifest = cloud.read()
    expect(manifest.devices['device-b'].deviceName).toBe('MacBook B')
    for (const conflict of manifest.conflicts) {
      expect(Object.keys(conflict).sort()).toEqual(expect.arrayContaining(['collection', 'key', 'reason', 'resolution']))
      expect(conflict).not.toHaveProperty('local')
      expect(conflict).not.toHaveProperty('remote')
      expect(conflict).not.toHaveProperty('base')
    }
  })

  it('finds only records this device deleted that came back, and only for user-facing collections', () => {
    const local = {
      ...EMPTY,
      prompts: [prompt('p1', '一直都在')],
      syncTombstones: [
        tombstone('prompts', 'p4', '2026-01-02T00:00:00.000Z'),
        tombstone('promptVariables', 'v4', '2026-01-02T00:00:00.000Z'),
        tombstone('prompts', 'p9', '2026-01-02T00:00:00.000Z')
      ]
    }
    const merged = {
      ...EMPTY,
      prompts: [prompt('p1', '一直都在'), prompt('p4', '提示词 04', '2026-01-02T00:00:01.500Z'), prompt('p6', '另一台新建的')],
      promptVariables: [{ id: 1, uuid: 'v4', promptUuid: 'p4', name: 'tone', updatedAt: '2026-01-02T00:00:01.500Z' }],
      syncTombstones: local.syncTombstones
    }

    expect(findCloudSyncRecordsRestoredOverLocalDeletes(local, merged)).toEqual([
      { collection: 'prompts', key: 'uuid:p4', label: '提示词 04' }
    ])
    expect(findCloudSyncRecordsRestoredOverLocalDeletes({ ...local, syncTombstones: [] }, merged)).toEqual([])
  })

  it('writes the restored notice in every language, naming the first record and counting the rest', () => {
    const one = [{ collection: 'prompts', key: 'uuid:p4', label: '提示词 04' }]
    const three = [...one, { collection: 'prompts', key: 'uuid:p5', label: 'x' }, { collection: 'categories', key: 'uuid:c1', label: 'y' }]

    i18n.global.locale.value = 'zh-CN'
    expect(getCloudSyncRestoredMessage(three)).toBe('「提示词 04」等 3 项在另一台设备上被修改，已恢复')
    i18n.global.locale.value = 'en-US'
    expect(getCloudSyncRestoredMessage(one)).toBe('“提示词 04” was changed on another device and has been restored')
    expect(getCloudSyncRestoredMessage(one.concat(three[1]))).toBe('“提示词 04” and 1 other item were changed on another device and have been restored')
    expect(getCloudSyncRestoredMessage(three)).toBe('“提示词 04” and 2 other items were changed on another device and have been restored')
    i18n.global.locale.value = 'it-IT'
    expect(getCloudSyncRestoredMessage(three)).toContain('altri 2 elementi')
    for (const locale of ['zh-TW', 'ja-JP'] as const) {
      i18n.global.locale.value = locale
      expect(getCloudSyncRestoredMessage(three), locale).toContain('3')
      expect(getCloudSyncRestoredMessage(three), locale).not.toContain('dataSync.')
    }
    expect(getCloudSyncRestoredMessage([])).toBe('')
    expect(getCloudSyncRestoredMessage(undefined)).toBe('')
  })
})

describe('pending conflict summary for the dialog (#489)', () => {
  it('keeps the merge summary that excludes deletion markers and conflicts', () => {
    const base = { ...EMPTY, prompts: [prompt('p2', '提示词 02'), prompt('p4', '提示词 04')] }
    const local = { ...EMPTY, prompts: [prompt('p2', '本机改的', '2026-01-02T00:00:01.000Z'), prompt('p4', '提示词 04')] }
    const remote = {
      ...EMPTY,
      prompts: [prompt('p2', '云端改的', '2026-01-02T00:00:02.000Z')],
      syncTombstones: [tombstone('prompts', 'p4', '2026-01-02T00:00:00.000Z')]
    }
    const merge = mergeCloudSyncData(local, remote, base, { prefer: 'newer' })

    const pending = createCloudSyncPendingConflict('cfg-1', merge, local, remote, '2026-01-02T00:00:03.000Z')

    expect(pending.summary).toMatchObject({ added: 0, updated: 0, deleted: 1, conflicts: 1 })
    expect(pending.items).toEqual([expect.objectContaining({ key: 'uuid:p2', localDeleted: false, remoteDeleted: false })])
  })
})

describe('conflict version times (#489)', () => {
  const now = new Date(2026, 0, 2, 12, 0, 0)
  const at = (seconds: number, minutes = 0) => new Date(2026, 0, 2, 9, minutes, seconds).toISOString()

  it('shows seconds when both sides fall in the same minute and marks the newer side', () => {
    const times = describeConflictVersionTimes({
      localUpdatedAt: at(1),
      remoteUpdatedAt: at(3),
      localDeleted: false,
      remoteDeleted: false
    }, 'zh-CN', now)

    expect(times.local).not.toBe(times.remote)
    expect(times.local).toContain('09:00:01')
    expect(times.remote).toContain('09:00:03')
    expect(times.newer).toBe('remote')
  })

  it('keeps minutes when the minutes differ and still marks the newer side', () => {
    const times = describeConflictVersionTimes({
      localUpdatedAt: at(0, 5),
      remoteUpdatedAt: at(0, 2),
      localDeleted: false,
      remoteDeleted: false
    }, 'zh-CN', now)

    expect(times.local).toContain('09:05')
    expect(times.local).not.toContain('09:05:00')
    expect(times.newer).toBe('local')
  })

  it('uses the deletion time for the deleted side and leaves the day lowercase inside a sentence', () => {
    const times = describeConflictVersionTimes({
      localUpdatedAt: at(2),
      localDeleted: false,
      remoteDeleted: true,
      remoteDeletedAt: at(0)
    }, 'en-US', now)

    expect(times.remote).toMatch(/^today 09:00:00$/)
    expect(times.local).toMatch(/^Today 09:00:02$/)
    expect(times.newer).toBe('local')
  })

  it('does not mark a side when a time is missing or both times are equal', () => {
    expect(describeConflictVersionTimes({ localUpdatedAt: at(1), localDeleted: false, remoteDeleted: true }, 'zh-CN', now).newer)
      .toBeUndefined()
    expect(describeConflictVersionTimes({ localUpdatedAt: at(1), remoteUpdatedAt: at(1), localDeleted: false, remoteDeleted: false }, 'zh-CN', now).newer)
      .toBeUndefined()
  })
})

describe('cloud manifest conflict metadata (#489)', () => {
  const fullRecord = (name: string, updatedAt: string) => ({
    uuid: 'config-1',
    name,
    apiKey: `sk-${name}-secret`,
    systemPrompt: 'x'.repeat(3000),
    updatedAt
  })
  const oldConflict = (index: number) => ({
    collection: 'aiConfigs',
    key: `uuid:config-${index}`,
    reason: 'both_modified',
    resolution: 'take-newer',
    local: fullRecord('local', '2026-01-02T00:00:01.000Z'),
    remote: fullRecord('remote', '2026-01-02T00:00:02.000Z'),
    base: fullRecord('base', T0)
  })

  it('keeps only the record key, reason, resolution and the two update times', () => {
    expect(sanitizeCloudSyncConflictsForMetadata([oldConflict(1)])).toEqual([{
      collection: 'aiConfigs',
      key: 'uuid:config-1',
      reason: 'both_modified',
      resolution: 'take-newer',
      localUpdatedAt: '2026-01-02T00:00:01.000Z',
      remoteUpdatedAt: '2026-01-02T00:00:02.000Z'
    }])
  })

  it('reads an old manifest with full conflict records and slims it down', () => {
    const conflicts = [oldConflict(1), oldConflict(2), oldConflict(3)]
    const manifest = normalizeCloudSyncManifest({ ...createEmptyCloudSyncManifest(T0), conflicts })
    const serialized = JSON.stringify(manifest.conflicts)

    expect(manifest.conflicts).toHaveLength(3)
    expect(serialized).not.toContain('secret')
    expect(serialized.length).toBeLessThan(800)
    expect(JSON.stringify(conflicts).length).toBeGreaterThan(20_000)
    // 已经精简过的再读一遍不变
    expect(normalizeCloudSyncManifest(manifest).conflicts).toEqual(manifest.conflicts)
  })

  it('drops malformed entries instead of failing', () => {
    expect(sanitizeCloudSyncConflictsForMetadata([null, 'x', { collection: 'prompts' }, { ...oldConflict(1), local: 'not a record', remote: { updatedAt: 'bad' } }]))
      .toEqual([{ collection: 'aiConfigs', key: 'uuid:config-1', reason: 'both_modified', resolution: 'take-newer' }])
    expect(sanitizeCloudSyncConflictsForMetadata(undefined)).toEqual([])
  })
})

describe('device names (#489)', () => {
  afterEach(() => {
    i18n.global.locale.value = 'zh-CN'
  })

  const MAC_ELECTRON = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) ai-gist/3.0.0 Chrome/128.0.6613.186 Electron/32.3.3 Safari/537.36'

  it('names a device by platform instead of the user agent', () => {
    i18n.global.locale.value = 'zh-CN'
    expect(getPlatformDeviceName({ platform: 'electron', userAgent: MAC_ELECTRON, maxTouchPoints: 0 })).toBe('Mac 上的 AI Gist')
    expect(getPlatformDeviceName({ platform: 'electron', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', maxTouchPoints: 0 })).toBe('Windows 上的 AI Gist')
    expect(getPlatformDeviceName({ platform: 'ios', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', maxTouchPoints: 5 })).toBe('iPhone 上的 AI Gist')
    expect(getPlatformDeviceName({ platform: 'ios', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 5 })).toBe('iPad 上的 AI Gist')
    expect(getPlatformDeviceName({ platform: 'android', userAgent: 'Mozilla/5.0 (Linux; Android 15)', maxTouchPoints: 5 })).toBe('Android 上的 AI Gist')
    expect(getPlatformDeviceName({ platform: 'web', userAgent: 'Mozilla/5.0 (Macintosh) Version/18.0 Safari/605.1.15', maxTouchPoints: 0 })).toBe('Safari 上的 AI Gist')
    expect(getPlatformDeviceName({ platform: 'web', userAgent: 'jsdom', maxTouchPoints: 0 })).toBe('网页版 AI Gist')
    i18n.global.locale.value = 'en-US'
    expect(getPlatformDeviceName({ platform: 'electron', userAgent: MAC_ELECTRON, maxTouchPoints: 0 })).toBe('AI Gist on Mac')
  })

  it('cleans up host names', () => {
    expect(normalizeDeviceHostName('Yarins-MacBook-Pro.local')).toBe('Yarins-MacBook-Pro')
    expect(normalizeDeviceHostName('  desktop-7f3k.lan ')).toBe('desktop-7f3k')
    expect(normalizeDeviceHostName('')).toBe('')
    expect(normalizeDeviceHostName(undefined)).toBe('')
  })

  it('never writes the user agent into the manifest when no device name is given', async () => {
    const cloud = createCloud()
    const device = createDevice(cloud, 'device-a', { ...EMPTY, prompts: [prompt('p1', '提示词 01')] })

    await device.service.syncNow('cfg-1')

    const name = cloud.read().devices['device-a'].deviceName
    expect(name).toBeTruthy()
    expect(name).not.toContain('Mozilla')
    expect(name).toContain('AI Gist')
  })
})
