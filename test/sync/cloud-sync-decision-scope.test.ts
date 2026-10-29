/**
 * 同步只在真正需要用户判断时才停下来：同一条提示词或分类在两台设备上都改了同一处内容。
 * 云端新增、只有一边改过、没有基线的两份副本、删除标记、设置、收藏这类状态都自动处理。
 * 用户点了「应用选择」之后，要按用户的选择同步完，过程中能看到进度。
 */
import { describe, expect, it, vi } from 'vitest'
import { CloudSyncService, type CloudSyncProgressPhase } from '~/lib/services/cloud-sync.service'
import { getCloudSyncRecordLabel, mergeCloudSyncData } from '@shared/cloud-sync-engine'
import { createEmptyCloudSyncManifest, type CloudSyncManifest } from '@shared/cloud-sync-manifest'
import { describeSyncProgress } from '~/lib/utils/sync-progress'

const EMPTY = {
  categories: [] as any[],
  prompts: [] as any[],
  promptVariables: [] as any[],
  promptHistories: [] as any[],
  aiConfigs: [] as any[],
  quickOptimizationConfigs: [] as any[],
  aiHistory: [] as any[],
  settings: [] as any[],
  syncTombstones: [] as any[]
}

const T0 = '2026-01-01T00:00:00.000Z'
const T1 = '2026-01-02T00:00:00.000Z'
const T2 = '2026-01-03T00:00:00.000Z'
const prompt = (uuid: string, title: string, updatedAt = T0, extra: Record<string, unknown> = {}) => ({
  id: Number(uuid.replace(/\D/g, '')) || 1,
  uuid,
  title,
  content: `${title} 正文`,
  isFavorite: false,
  createdAt: T0,
  updatedAt,
  ...extra
})
const setting = (key: string, value: unknown, updatedAt = T0) => ({ id: 1, key, value, createdAt: T0, updatedAt })
const tombstone = (uuid: string, deletedAt: string, extra: Record<string, unknown> = {}) => ({
  collectionName: 'prompts',
  storeName: 'prompts',
  recordKey: `uuid:${uuid}`,
  recordUuid: uuid,
  deletedAt,
  ...extra
})
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))

class MemoryStorage {
  private values = new Map<string, string>()
  getItem(key: string): string | null { return this.values.get(key) || null }
  setItem(key: string, value: string): void { this.values.set(key, value) }
  removeItem(key: string): void { this.values.delete(key) }
}

function createCloud() {
  let manifest: CloudSyncManifest = createEmptyCloudSyncManifest(T0)
  let gate: Promise<void> | null = null
  const client = {
    getCloudSyncManifest: vi.fn(async () => {
      if (gate) await gate
      return clone(manifest)
    }),
    saveCloudSyncManifest: vi.fn(async (_storageId: string, next: CloudSyncManifest) => {
      manifest = clone(next)
      return { success: true }
    })
  }
  return {
    client,
    read: () => manifest,
    /** 让下一次读取云端停住，直到调用返回的函数 */
    hold() {
      let release!: () => void
      gate = new Promise(resolve => { release = resolve })
      return () => { gate = null; release() }
    }
  }
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
    // 和应用里一样：遇到需要用户选的冲突就停下来
    conflictMode: 'ask'
  })
  return {
    service,
    get data() { return data },
    set data(next: any) { data = clone(next) },
    editPrompt(uuid: string, patch: Record<string, unknown>) {
      data.prompts = data.prompts.map((item: any) => item.uuid === uuid ? { ...item, ...patch } : item)
    }
  }
}

describe('只在需要用户判断时才停下来', () => {
  it('云端只是新增了 8 条：直接下载，不弹冲突', async () => {
    const cloud = createCloud()
    const initial = { ...EMPTY, prompts: [prompt('p1', '原有的')] }
    const deviceA = createDevice(cloud, 'device-a', initial)
    const deviceB = createDevice(cloud, 'device-b', initial)
    await deviceA.service.syncNow('cfg-1')
    await deviceB.service.syncNow('cfg-1')

    deviceA.data = {
      ...deviceA.data,
      prompts: [...deviceA.data.prompts, ...Array.from({ length: 8 }, (_, index) => prompt(`n${index + 1}`, `新的 ${index + 1}`, T1))]
    }
    await deviceA.service.syncNow('cfg-1')

    const result = await deviceB.service.syncNow('cfg-1')
    expect(result).toMatchObject({ success: true, action: 'downloaded' })
    expect(result.pendingConflict).toBeUndefined()
    expect(deviceB.data.prompts).toHaveLength(9)
  })

  it('没有同步基线时，两边各有一份不同的副本、删除标记和设置：按较新的自动合并', async () => {
    const cloud = createCloud()
    const deviceA = createDevice(cloud, 'device-a', {
      ...EMPTY,
      prompts: [
        prompt('same', '只差修改时间', T2),
        prompt('logo', 'Logo 实体化摄影（云端改过）', T2),
        prompt('old', '本机这份更新', T0)
      ],
      settings: [setting('cloud.sync.intervalMinutes', 15, T0)],
      syncTombstones: [tombstone('gone', T1, { recordSnapshot: { uuid: 'gone', title: '删掉的' } })]
    })
    await deviceA.service.syncNow('cfg-1')

    // B 第一次连这个存储（或者丢了同步记录）：本机已有同一批记录，内容各有不同
    const deviceB = createDevice(cloud, 'device-b', {
      ...EMPTY,
      prompts: [
        prompt('same', '只差修改时间', T0),
        prompt('logo', 'Logo 实体化摄影', T1),
        prompt('old', '本机这份更新（本机改过）', T2)
      ],
      settings: [setting('cloud.sync.intervalMinutes', 30, T2)],
      syncTombstones: [tombstone('gone', T2)]
    })

    const result = await deviceB.service.syncNow('cfg-1')

    expect(result.action).not.toBe('conflict-pending')
    expect(result.success).toBe(true)
    const titles = Object.fromEntries(deviceB.data.prompts.map((item: any) => [item.uuid, item.title]))
    expect(titles).toEqual({
      same: '只差修改时间',
      logo: 'Logo 实体化摄影（云端改过）',
      old: '本机这份更新（本机改过）'
    })
    expect(deviceB.data.settings[0].value).toBe(30)
    expect(deviceB.data.syncTombstones).toHaveLength(1)
    // 只差修改时间的那份不算冲突
    expect(result.conflicts.map(conflict => conflict.key)).not.toContain('uuid:same')
    expect(cloud.read().latestSnapshot?.data.prompts?.map((item: any) => item.title).sort())
      .toEqual(titles ? Object.values(titles).sort() : [])
  })

  it('有基线时，两边都改了设置、删除标记、收藏和使用次数：自动合并，不弹冲突', async () => {
    const cloud = createCloud()
    const initial = {
      ...EMPTY,
      prompts: [prompt('p1', '提示词 01')],
      settings: [setting('cloud.sync.intervalMinutes', 15)],
      syncTombstones: [tombstone('gone', T0)]
    }
    const deviceA = createDevice(cloud, 'device-a', initial)
    const deviceB = createDevice(cloud, 'device-b', initial)
    await deviceA.service.syncNow('cfg-1')
    await deviceB.service.syncNow('cfg-1')

    deviceA.data = {
      ...deviceA.data,
      prompts: [prompt('p1', '提示词 01', T1, { isFavorite: true, useCount: 2 })],
      settings: [setting('cloud.sync.intervalMinutes', 30, T1)],
      syncTombstones: [tombstone('gone', T1)]
    }
    await deviceA.service.syncNow('cfg-1')
    deviceB.data = {
      ...deviceB.data,
      prompts: [prompt('p1', '提示词 01', T2, { isFavorite: false, version: 3, useCount: 1 })],
      settings: [setting('cloud.sync.intervalMinutes', 60, T2)],
      syncTombstones: [tombstone('gone', T2)]
    }

    const result = await deviceB.service.syncNow('cfg-1')

    expect(result.action).not.toBe('conflict-pending')
    expect(result.success).toBe(true)
    expect(deviceB.data.settings[0].value).toBe(60)
    expect(deviceB.data.prompts[0]).toMatchObject({ title: '提示词 01', useCount: 3 })
  })

  it('两边都改了同一条提示词的标题：停下来，只列这一条，名字是标题', async () => {
    const cloud = createCloud()
    const initial = {
      ...EMPTY,
      prompts: [prompt('p1', '提示词 01'), prompt('p2', '提示词 02')],
      settings: [setting('theme', 'light')]
    }
    const deviceA = createDevice(cloud, 'device-a', initial)
    const deviceB = createDevice(cloud, 'device-b', initial)
    await deviceA.service.syncNow('cfg-1')
    await deviceB.service.syncNow('cfg-1')

    deviceA.editPrompt('p1', { title: 'A 改的标题', updatedAt: T1 })
    deviceA.data = { ...deviceA.data, settings: [setting('theme', 'dark', T1)] }
    await deviceA.service.syncNow('cfg-1')
    deviceB.editPrompt('p1', { title: 'B 改的标题', updatedAt: T2 })
    deviceB.data = { ...deviceB.data, settings: [setting('theme', 'auto', T2)] }

    const result = await deviceB.service.syncNow('cfg-1')

    expect(result.action).toBe('conflict-pending')
    expect(result.pendingConflict?.items.map(item => [item.label, item.collection, item.reason]))
      .toEqual([['B 改的标题', 'prompts', 'both_modified']])
  })

  it('「全用本机」只管列出来的冲突，其余的照样取较新的', async () => {
    const cloud = createCloud()
    const initial = { ...EMPTY, prompts: [prompt('p1', '提示词 01')], settings: [setting('theme', 'light')] }
    const deviceA = createDevice(cloud, 'device-a', initial)
    const deviceB = createDevice(cloud, 'device-b', initial)
    await deviceA.service.syncNow('cfg-1')
    await deviceB.service.syncNow('cfg-1')

    deviceB.editPrompt('p1', { title: 'B 改的标题', updatedAt: T1 })
    deviceB.data = { ...deviceB.data, settings: [setting('theme', 'auto', T1)] }
    deviceA.editPrompt('p1', { title: 'A 改的标题', updatedAt: T2 })
    deviceA.data = { ...deviceA.data, settings: [setting('theme', 'dark', T2)] }
    await deviceA.service.syncNow('cfg-1')

    expect((await deviceB.service.syncNow('cfg-1')).action).toBe('conflict-pending')
    const result = await deviceB.service.resolveConflicts('cfg-1', { strategy: 'local' })

    expect(result.success).toBe(true)
    expect(deviceB.data.prompts[0].title).toBe('B 改的标题')
    expect(deviceB.data.settings[0].value).toBe('dark')
  })

  it('点「应用选择」时自动同步正在跑：等它跑完，再按用户的选择同步', async () => {
    const cloud = createCloud()
    const initial = { ...EMPTY, prompts: [prompt('p1', '提示词 01')] }
    const deviceA = createDevice(cloud, 'device-a', initial)
    const deviceB = createDevice(cloud, 'device-b', initial)
    await deviceA.service.syncNow('cfg-1')
    await deviceB.service.syncNow('cfg-1')
    deviceA.editPrompt('p1', { title: 'A 改的标题', updatedAt: T1 })
    await deviceA.service.syncNow('cfg-1')
    deviceB.editPrompt('p1', { title: 'B 改的标题', updatedAt: T2 })
    expect((await deviceB.service.syncNow('cfg-1')).action).toBe('conflict-pending')

    // 弹窗开着的时候，切回应用触发了一次自动同步，读云端还没回来
    const release = cloud.hold()
    const autoSync = deviceB.service.syncNow('cfg-1', { reason: 'focus' })
    const applied = deviceB.service.resolveConflicts('cfg-1', { strategy: 'remote' })
    release()

    expect((await autoSync).action).toBe('conflict-pending')
    const result = await applied
    expect(result).toMatchObject({ success: true })
    expect(result.action).not.toBe('conflict-pending')
    expect(deviceB.data.prompts[0].title).toBe('A 改的标题')
    expect(deviceB.service.getPendingConflict('cfg-1')).toBeUndefined()
  })

  it('同步过程中报告走到了哪一步，结束后清掉', async () => {
    const cloud = createCloud()
    const deviceA = createDevice(cloud, 'device-a', { ...EMPTY, prompts: [prompt('p1', '提示词 01')] })
    await deviceA.service.syncNow('cfg-1')
    const deviceB = createDevice(cloud, 'device-b', { ...EMPTY })
    const phases: (CloudSyncProgressPhase | undefined)[] = []
    deviceB.service.onStatusChange(status => {
      if (phases[phases.length - 1] !== status.syncPhase) phases.push(status.syncPhase)
    })

    const result = await deviceB.service.syncNow('cfg-1')

    expect(result.action).toBe('downloaded')
    expect(phases).toEqual(['export', 'read-remote', 'merge', 'apply-local', undefined])
    expect(deviceB.service.getStatus().syncPhase).toBeUndefined()
    expect(describeSyncProgress('apply-local')).toEqual({ labelKey: 'syncConflict.progress.applyLocal', percent: 67 })
    expect(describeSyncProgress(undefined).labelKey).toBe('syncConflict.progress.export')
  })
})

describe('冲突项的名字', () => {
  it('没有标题的提示词用正文第一行，不显示 uuid', () => {
    expect(getCloudSyncRecordLabel(
      { uuid: '8334365d-76ef-43fc-bd4d-43f7aaaa', title: '', content: '\n  把这张照片变成实体 Logo\n第二行' },
      'uuid:8334365d'
    )).toBe('把这张照片变成实体 Logo')
    expect(getCloudSyncRecordLabel({ uuid: 'x', title: '有标题', content: '正文' }, 'uuid:x')).toBe('有标题')
  })

  it('没有基线时只差修改时间的两份副本不算冲突', () => {
    const local = { ...EMPTY, prompts: [prompt('p1', '一样的', T0)] }
    const remote = { ...EMPTY, prompts: [prompt('p1', '一样的', T2)] }
    const result = mergeCloudSyncData(local, remote, {}, { prefer: 'newer' })
    expect(result.conflicts).toEqual([])
    expect(result.data.prompts?.[0].updatedAt).toBe(T2)
  })
})
