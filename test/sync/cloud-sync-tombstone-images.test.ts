/**
 * 手机上删掉带图片的提示词后，同步一直「云端的同步文件一直在变」（REMOTE_CHANGED）。
 *
 * 删除标记里存着原记录的副本，图片还是 Blob：算校验和时按「类型 + 大小」算，写成 JSON 却变成 {}。
 * 云端文件和自己的校验和对不上，读到的设备都当成损坏去修，再当成有改动去写，重试几次后放弃。
 * 这里的云端按 JSON 文本存取，和真实的 WebDAV 一样。
 */
import { describe, expect, it, vi } from 'vitest'
import { CloudSyncService } from '~/lib/services/cloud-sync.service'
import {
  createCloudSyncSnapshot,
  stripTombstoneSnapshotImages,
  validateCloudSyncSnapshot
} from '@shared/cloud-sync-engine'
import { assertValidCloudSyncManifest, createEmptyCloudSyncManifest, type CloudSyncManifest } from '@shared/cloud-sync-manifest'

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
const T0 = '2026-10-29T00:00:00.000Z'

class MemoryStorage {
  private values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
  removeItem(key: string) { this.values.delete(key) }
}

/** 云端只存 JSON 文本：Blob 写进去就是 {}；读的时候和手机、桌面一样先过 assertValidCloudSyncManifest */
function createJsonCloud(initial: CloudSyncManifest) {
  let text = JSON.stringify(initial)
  const writes: CloudSyncManifest[] = []
  return {
    writes,
    read: () => JSON.parse(text) as CloudSyncManifest,
    client: {
      getCloudSyncManifest: vi.fn(async () => assertValidCloudSyncManifest(JSON.parse(text))),
      saveCloudSyncManifest: vi.fn(async (_id: string, next: CloudSyncManifest) => {
        text = JSON.stringify(next)
        writes.push(JSON.parse(text))
        return { success: true }
      })
    }
  }
}

/** 手机：本机数据库里删除标记的副本带着真的图片 Blob */
function createPhone(cloud: ReturnType<typeof createJsonCloud>, local: any) {
  let data = local
  const service = new CloudSyncService({
    cloudClient: cloud.client as any,
    database: {
      exportAllDataForSync: async () => ({ success: true, message: 'ok', data }),
      replaceAllData: async (next: any) => { data = next; return { success: true, message: 'ok' } }
    } as any,
    storage: new MemoryStorage(),
    createDeviceId: () => 'iphone',
    conflictMode: 'ask'
  })
  return service
}

const prompt = (uuid: string, title: string) => ({ id: 1, uuid, title, content: `${title} 正文`, createdAt: T0, updatedAt: T0 })
const imageTombstone = () => ({
  id: 1,
  storeName: 'prompts',
  collectionName: 'prompts',
  recordKey: 'uuid:with-image',
  recordUuid: 'with-image',
  deletedAt: '2026-10-29T01:00:00.000Z',
  recordSnapshot: {
    id: 2,
    uuid: 'with-image',
    title: '把这张图片转换为一组极简 Logo 网格',
    imageBlobs: [new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' })]
  }
})

describe('删除标记里的图片', () => {
  it('手机删掉带图片的提示词后同步：一次成功，云端文件通过自己的校验，再同步没有东西要上传', async () => {
    const cloudData = { ...EMPTY, prompts: [prompt('keep', '留着的')] }
    const cloud = createJsonCloud({ ...createEmptyCloudSyncManifest(T0), latestSnapshot: createCloudSyncSnapshot(cloudData, 'desktop', 'rev-1') })
    const phone = createPhone(cloud, { ...EMPTY, prompts: [prompt('keep', '留着的')], syncTombstones: [imageTombstone()] })

    const first = await phone.syncNow('cfg', { reason: 'manual', forceRetry: true })
    expect(first).toMatchObject({ success: true, action: 'uploaded' })
    for (const written of cloud.writes) {
      expect(validateCloudSyncSnapshot(written.latestSnapshot)).toEqual({ valid: true })
    }
    const tombstone = cloud.read().latestSnapshot!.data.syncTombstones!.find((t: any) => t.recordUuid === 'with-image')
    expect(tombstone.recordSnapshot).toEqual({ id: 2, uuid: 'with-image', title: '把这张图片转换为一组极简 Logo 网格' })

    const writesBefore = cloud.writes.length
    for (let i = 0; i < 3; i++) {
      expect(await phone.syncNow('cfg', { reason: 'manual', forceRetry: true })).toMatchObject({ success: true, action: 'noop' })
    }
    expect(cloud.writes.length).toBe(writesBefore)
  })

  it('云端旧文件里删除标记的图片已经变成 {}、校验和对不上：修好一次后不再反复写', async () => {
    // 3.1.4 及以前的手机写出的文件：副本里的图片是 {}，校验和是按 Blob 算的
    const broken = createCloudSyncSnapshot({ ...EMPTY, prompts: [prompt('keep', '留着的')] }, 'iphone-old', 'rev-broken')
    broken.data.syncTombstones = [{ ...imageTombstone(), recordSnapshot: { ...imageTombstone().recordSnapshot, imageBlobs: [{}] } }]
    expect(validateCloudSyncSnapshot(JSON.parse(JSON.stringify(broken))).valid).toBe(false)
    const cloud = createJsonCloud({ ...createEmptyCloudSyncManifest(T0), latestSnapshot: broken })
    const phone = createPhone(cloud, { ...EMPTY, prompts: [prompt('keep', '留着的')], syncTombstones: [imageTombstone()] })

    const first = await phone.syncNow('cfg', { reason: 'manual', forceRetry: true })
    expect(first.success).toBe(true)
    expect(validateCloudSyncSnapshot(cloud.read().latestSnapshot).valid).toBe(true)

    const writesBefore = cloud.writes.length
    for (let i = 0; i < 3; i++) {
      expect(await phone.syncNow('cfg', { reason: 'manual', forceRetry: true })).toMatchObject({ success: true, action: 'noop' })
    }
    expect(cloud.writes.length).toBe(writesBefore)
  })

  it('去掉副本里的图片字段，其余字段不动', () => {
    const tombstone = imageTombstone()
    expect(stripTombstoneSnapshotImages(tombstone).recordSnapshot).toEqual({ id: 2, uuid: 'with-image', title: '把这张图片转换为一组极简 Logo 网格' })
    expect(stripTombstoneSnapshotImages({ recordKey: 'uuid:x', deletedAt: T0 })).toEqual({ recordKey: 'uuid:x', deletedAt: T0 })
  })
})
