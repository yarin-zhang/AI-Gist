/**
 * Cloud sync robustness E2E tests.
 *
 * These scenarios use the real local WebDAV test server and the desktop
 * WebDAV provider path, then inject narrowly-scoped failures around it.
 */

// @vitest-environment node

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { TestWebDAVServer } from '../helpers/webdav-server'
import { CloudSyncService } from '~/lib/services/cloud-sync.service'
import { WebDAVProvider } from '../../src/main/cloud/webdav-provider'
import type { CloudSyncDataSet, CloudSyncSnapshot } from '@shared/cloud-sync-engine'
import {
  createCloudSyncDataChecksum,
  createCloudSyncSemanticChecksum,
  createCloudSyncSnapshot
} from '@shared/cloud-sync-engine'
import type {
  CloudSyncManifest,
  CloudSyncManifestSaveOptions,
  CloudSyncManifestSaveResult
} from '@shared/cloud-sync-manifest'
import {
  assertValidCloudSyncManifest,
  createCloudSyncManifestRevisionConflictError,
  createEmptyCloudSyncManifest,
  doesCloudSyncManifestMatchExpectedRevision,
  getCloudSyncManifestRevision,
  readCloudSyncManifestWithFallback
} from '@shared/cloud-sync-manifest'
import {
  getCloudSyncManifestBackupPath,
  getCloudSyncManifestPath,
  getCloudSyncSnapshotPath,
  getCloudSyncSnapshotRevisionFromFileName,
  getCloudSyncSnapshotsDirectoryPath
} from '@shared/cloud-backup-paths'
import type { CloudSyncRemoteSnapshotInfo } from '@shared/cloud-sync-snapshots'
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

class MutableSyncDatabase {
  data: CloudSyncDataSet
  readonly exportAllDataForSync = vi.fn()
  readonly replaceAllData = vi.fn()

  constructor(data: CloudSyncDataSet) {
    this.data = cloneData(data)
    this.exportAllDataForSync.mockImplementation(async () => ({
      success: true,
      message: 'ok',
      data: cloneData(this.data)
    }))
    this.replaceAllData.mockImplementation(async (nextData: CloudSyncDataSet) => {
      this.data = cloneData(nextData)
      return {
        success: true,
        message: 'ok'
      }
    })
  }
}

interface TestCloudClientHooks {
  saveCloudSyncManifest?: (
    context: {
      storageId: string
      manifest: CloudSyncManifest
      options: CloudSyncManifestSaveOptions
    },
    saveNormally: () => Promise<CloudSyncManifestSaveResult>
  ) => Promise<CloudSyncManifestSaveResult>
  afterPrimaryManifestWrite?: (context: {
    storageId: string
    manifest: CloudSyncManifest
    options: CloudSyncManifestSaveOptions
  }) => Promise<void> | void
  getCloudSyncManifest?: (
    storageId: string,
    readNormally: () => Promise<CloudSyncManifest>
  ) => Promise<CloudSyncManifest>
  readCloudSyncSnapshot?: (
    context: {
      storageId: string
      snapshot: CloudSyncRemoteSnapshotInfo | string
    },
    readNormally: () => Promise<CloudSyncSnapshot>
  ) => Promise<CloudSyncSnapshot>
}

const USERNAME = 'testuser'
const PASSWORD = 'testpass'
const PORT = 18767
const INITIAL_IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lZ2nNwAAAABJRU5ErkJggg=='
const UPDATED_IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAADUlEQVR42mP8z8BQDwAFgwJ/lZ2nNwAAAABJRU5ErkJggg=='

let server: TestWebDAVServer

describe('Cloud sync robustness E2E over WebDAV', () => {
  beforeAll(async () => {
    server = new TestWebDAVServer({ port: PORT, username: USERNAME, password: PASSWORD })
    await server.start()
  })

  afterAll(async () => {
    await server.stop()
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('长时间离线后同步能合并两端不同记录变更，不丢任一端数据', async () => {
    const storageId = 'robust-offline-merge'
    const client = createWebDAVSyncClient(storageId)
    const initialData = createDataSet({
      promptTitle: 'Initial prompt',
      categoryName: 'Initial category',
      settingValue: 'dark'
    })
    const deviceADatabase = new MutableSyncDatabase(initialData)
    const deviceAStorage = new MemoryStorage()
    const deviceA = createSyncService(client, deviceADatabase, deviceAStorage, 'device-a')

    const firstSync = await deviceA.syncNow(storageId, {
      deviceName: 'Laptop A',
      platform: 'electron',
      reason: 'manual'
    })
    expect(firstSync).toMatchObject({ success: true, action: 'uploaded' })

    const deviceBDatabase = new MutableSyncDatabase(emptyDataSet())
    const deviceB = createSyncService(client, deviceBDatabase, new MemoryStorage(), 'device-b')
    const deviceBDownload = await deviceB.syncNow(storageId, {
      deviceName: 'Desktop B',
      platform: 'electron',
      reason: 'manual'
    })
    expect(deviceBDownload).toMatchObject({ success: true, action: 'downloaded' })

    deviceADatabase.data = mutateDataSet(deviceADatabase.data, data => {
      data.categories![0].name = 'Offline category from A'
      data.categories![0].updatedAt = '2026-06-13T10:00:00.000Z'
    })
    deviceBDatabase.data = mutateDataSet(deviceBDatabase.data, data => {
      data.prompts![0].title = 'Remote prompt from B'
      data.prompts![0].updatedAt = '2026-06-13T10:05:00.000Z'
      data.settings = [{ key: 'theme', value: 'light', type: 'string', updatedAt: '2026-06-13T10:05:00.000Z' }]
    })

    const deviceBUpload = await deviceB.syncNow(storageId, {
      deviceName: 'Desktop B',
      platform: 'electron',
      reason: 'manual'
    })
    expect(deviceBUpload).toMatchObject({ success: true, action: 'uploaded' })

    const deviceAMerge = await deviceA.syncNow(storageId, {
      deviceName: 'Laptop A',
      platform: 'electron',
      reason: 'manual'
    })
    expect(deviceAMerge, JSON.stringify(deviceAMerge, null, 2)).toMatchObject({ success: true, action: 'merged' })
    expect(deviceADatabase.replaceAllData).toHaveBeenCalledTimes(1)

    const manifest = await client.getCloudSyncManifest(storageId)
    expect(manifest.latestSnapshot?.data.categories).toEqual(expect.arrayContaining([
      expect.objectContaining({ uuid: 'cat-main', name: 'Offline category from A' })
    ]))
    expect(manifest.latestSnapshot?.data.prompts).toEqual(expect.arrayContaining([
      expect.objectContaining({ uuid: 'prompt-main', title: 'Remote prompt from B' })
    ]))
    expect(manifest.latestSnapshot?.data.settings).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'theme', value: 'light' })
    ]))
    expect(manifest.latestSnapshot?.dataChecksum).toBe(
      createCloudSyncDataChecksum(manifest.latestSnapshot!.data)
    )
  })

  it('多端编辑同一记录时自动按更新时间解决冲突并记录冲突审计', async () => {
    const storageId = 'robust-same-record-conflict'
    const client = createWebDAVSyncClient(storageId)
    const initialData = createDataSet({ promptTitle: 'Base prompt' })
    const deviceADatabase = new MutableSyncDatabase(initialData)
    const deviceAStorage = new MemoryStorage()
    const deviceA = createSyncService(client, deviceADatabase, deviceAStorage, 'device-a')
    expect((await deviceA.syncNow(storageId, { platform: 'electron' })).success).toBe(true)

    const deviceBDatabase = new MutableSyncDatabase(emptyDataSet())
    const deviceB = createSyncService(client, deviceBDatabase, new MemoryStorage(), 'device-b')
    expect((await deviceB.syncNow(storageId, { platform: 'electron' })).action).toBe('downloaded')

    deviceADatabase.data = mutateDataSet(deviceADatabase.data, data => {
      data.prompts![0].title = 'Older local edit from A'
      data.prompts![0].updatedAt = '2026-06-13T10:00:00.000Z'
    })
    deviceBDatabase.data = mutateDataSet(deviceBDatabase.data, data => {
      data.prompts![0].title = 'Newer remote edit from B'
      data.prompts![0].updatedAt = '2026-06-13T10:30:00.000Z'
    })
    expect((await deviceB.syncNow(storageId, { platform: 'electron' })).action).toBe('uploaded')

    const result = await deviceA.syncNow(storageId, {
      platform: 'electron',
      reason: 'manual'
    })

    expect(result.success, JSON.stringify(result, null, 2)).toBe(true)
    expect(result.conflicts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        collection: 'prompts',
        key: 'uuid:prompt-main',
        reason: 'both_modified',
        resolution: 'take-newer'
      })
    ]))
    expect(deviceADatabase.data.prompts).toEqual(expect.arrayContaining([
      expect.objectContaining({ uuid: 'prompt-main', title: 'Newer remote edit from B' })
    ]))
    expect(deviceAStorage.getItem('ai_gist_cloud_sync_conflict_log')).toContain('prompt-main')
  })

  it('图片提示词冲突时保留图片数据但冲突元数据只记录轻量摘要', async () => {
    const storageId = 'robust-image-conflict-metadata'
    const largeImage = `data:image/png;base64,${'x'.repeat(5000)}`
    const client = createWebDAVSyncClient(storageId)
    const initialData = mutateDataSet(createDataSet({
      promptTitle: 'Image conflict base',
      promptUpdatedAt: '2026-06-13T16:00:00.000Z'
    }), data => {
      data.prompts![0].imageBlobs = [largeImage]
    })
    const deviceAStorage = new MemoryStorage()
    const deviceADatabase = new MutableSyncDatabase(initialData)
    const deviceA = createSyncService(client, deviceADatabase, deviceAStorage, 'device-a')
    expect(await deviceA.syncNow(storageId, {
      deviceName: 'Laptop A',
      platform: 'electron',
      reason: 'manual'
    })).toMatchObject({ success: true, action: 'uploaded' })

    const deviceBDatabase = new MutableSyncDatabase(emptyDataSet())
    const deviceB = createSyncService(client, deviceBDatabase, new MemoryStorage(), 'device-b')
    expect(await deviceB.syncNow(storageId, {
      deviceName: 'Phone B',
      platform: 'ios',
      reason: 'manual'
    })).toMatchObject({ success: true, action: 'downloaded' })

    deviceADatabase.data = mutateDataSet(deviceADatabase.data, data => {
      data.prompts![0].title = 'Local image prompt wins'
      data.prompts![0].updatedAt = '2026-06-13T16:20:00.000Z'
    })
    deviceBDatabase.data = mutateDataSet(deviceBDatabase.data, data => {
      data.prompts![0].title = 'Remote image prompt loses'
      data.prompts![0].updatedAt = '2026-06-13T16:10:00.000Z'
    })

    expect(await deviceB.syncNow(storageId, {
      deviceName: 'Phone B',
      platform: 'ios',
      reason: 'manual'
    })).toMatchObject({ success: true, action: 'uploaded' })

    const result = await deviceA.syncNow(storageId, {
      deviceName: 'Laptop A',
      platform: 'electron',
      reason: 'manual'
    })

    expect(result, JSON.stringify(result, null, 2)).toMatchObject({
      success: true,
      action: 'uploaded',
      uploadedRemote: true,
      conflicts: [
        expect.objectContaining({
          collection: 'prompts',
          key: 'uuid:prompt-main',
          reason: 'both_modified',
          resolution: 'take-newer'
        })
      ]
    })

    const conflictLog = deviceA.getConflictLog(storageId)
    expect(conflictLog[0].conflicts[0].local.imageBlobs).toEqual({
      omitted: true,
      type: 'imageBlobs',
      itemCount: 1
    })
    expect(conflictLog[0].conflicts[0].remote.imageBlobs).toEqual({
      omitted: true,
      type: 'imageBlobs',
      itemCount: 1
    })
    expect(JSON.stringify(conflictLog)).not.toContain(largeImage)

    const manifest = await client.getCloudSyncManifest(storageId)
    expect(manifest.latestSnapshot?.data.prompts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uuid: 'prompt-main',
        title: 'Local image prompt wins',
        imageBlobs: [largeImage]
      })
    ]))
    expect(manifest.conflicts?.[0].local.imageBlobs).toEqual({
      omitted: true,
      type: 'imageBlobs',
      itemCount: 1
    })
    expect(manifest.conflicts?.[0].remote.imageBlobs).toEqual({
      omitted: true,
      type: 'imageBlobs',
      itemCount: 1
    })
    expect(JSON.stringify(manifest.conflicts)).not.toContain(largeImage)
    expect(manifest.latestSnapshot?.dataChecksum)
      .toBe(createCloudSyncDataChecksum(manifest.latestSnapshot!.data))
  })

  it('多端编辑同一提示词不同字段时会自动字段级合并且不记录冲突', async () => {
    const storageId = 'robust-same-record-field-merge'
    const client = createWebDAVSyncClient(storageId)
    const initialData = createDataSet({
      promptTitle: 'Field merge base',
      promptUpdatedAt: '2026-06-13T16:00:00.000Z'
    })
    const deviceAStorage = new MemoryStorage()
    const deviceADatabase = new MutableSyncDatabase(initialData)
    const deviceA = createSyncService(client, deviceADatabase, deviceAStorage, 'device-a')
    expect(await deviceA.syncNow(storageId, {
      deviceName: 'Laptop A',
      platform: 'electron',
      reason: 'manual'
    })).toMatchObject({ success: true, action: 'uploaded' })

    const deviceBDatabase = new MutableSyncDatabase(emptyDataSet())
    const deviceB = createSyncService(client, deviceBDatabase, new MemoryStorage(), 'device-b')
    expect(await deviceB.syncNow(storageId, {
      deviceName: 'Phone B',
      platform: 'ios',
      reason: 'manual'
    })).toMatchObject({ success: true, action: 'downloaded' })

    deviceADatabase.data = mutateDataSet(deviceADatabase.data, data => {
      data.prompts![0].title = 'Field merge local title'
      data.prompts![0].tags = ['base', 'local']
      data.prompts![0].updatedAt = '2026-06-13T16:05:00.000Z'
    })
    deviceBDatabase.data = mutateDataSet(deviceBDatabase.data, data => {
      data.prompts![0].content = 'Remote content update for {{topic}}'
      data.prompts![0].useCount = 9
      data.prompts![0].tags = ['base', 'remote']
      data.prompts![0].updatedAt = '2026-06-13T16:10:00.000Z'
    })

    expect(await deviceB.syncNow(storageId, {
      deviceName: 'Phone B',
      platform: 'ios',
      reason: 'manual'
    })).toMatchObject({ success: true, action: 'uploaded' })

    const merged = await deviceA.syncNow(storageId, {
      deviceName: 'Laptop A',
      platform: 'electron',
      reason: 'manual'
    })

    expect(merged, JSON.stringify(merged, null, 2)).toMatchObject({
      success: true,
      action: 'merged',
      uploadedRemote: true,
      appliedLocal: true,
      conflicts: []
    })
    expect(deviceAStorage.getItem('ai_gist_cloud_sync_conflict_log')).toBeNull()
    expect(deviceADatabase.data.prompts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uuid: 'prompt-main',
        title: 'Field merge local title',
        content: 'Remote content update for {{topic}}',
        useCount: 9,
        tags: ['base', 'local', 'remote'],
        updatedAt: '2026-06-13T16:10:00.000Z'
      })
    ]))

    const manifest = await client.getCloudSyncManifest(storageId)
    expect(manifest.latestSnapshot?.data.prompts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uuid: 'prompt-main',
        title: 'Field merge local title',
        content: 'Remote content update for {{topic}}',
        useCount: 9,
        tags: ['base', 'local', 'remote'],
        updatedAt: '2026-06-13T16:10:00.000Z'
      })
    ]))
    expect(manifest.latestSnapshot?.dataChecksum)
      .toBe(createCloudSyncDataChecksum(manifest.latestSnapshot!.data))
  })

  it('真实创建含图片和历史的数据后跨端更新不会丢失元数据', async () => {
    const storageId = 'robust-real-create-then-update'
    const client = createWebDAVSyncClient(storageId)
    const deviceADatabase = new MutableSyncDatabase(createRealisticDataSet())
    const deviceAStorage = new MemoryStorage()
    const deviceA = createSyncService(client, deviceADatabase, deviceAStorage, 'device-a')

    const createUpload = await deviceA.syncNow(storageId, {
      deviceName: 'Laptop A',
      platform: 'electron',
      reason: 'manual'
    })
    expect(createUpload).toMatchObject({ success: true, action: 'uploaded' })

    const deviceBDatabase = new MutableSyncDatabase(emptyDataSet())
    const deviceB = createSyncService(client, deviceBDatabase, new MemoryStorage(), 'device-b')
    const firstDownload = await deviceB.syncNow(storageId, {
      deviceName: 'Phone B',
      platform: 'ios',
      reason: 'manual'
    })
    expect(firstDownload).toMatchObject({ success: true, action: 'downloaded' })
    expect(deviceBDatabase.data.prompts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uuid: 'real-prompt-launch',
        imageBlobs: [INITIAL_IMAGE]
      })
    ]))
    expect(deviceBDatabase.data.promptHistories).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uuid: 'real-history-initial',
        imageBlobs: [INITIAL_IMAGE]
      })
    ]))

    deviceBDatabase.data = mutateDataSet(deviceBDatabase.data, data => {
      data.categories![0].name = '真实项目资料-移动端更新'
      data.categories![0].updatedAt = '2026-06-13T14:00:00.000Z'
      data.prompts![0].title = '发布计划提示词 - 移动端更新'
      data.prompts![0].content = '请用 {{tone}} 语气生成移动端更新版发布计划'
      data.prompts![0].tags = ['release', 'mobile', 'updated']
      data.prompts![0].imageBlobs = [INITIAL_IMAGE, UPDATED_IMAGE]
      data.prompts![0].updatedAt = '2026-06-13T14:00:00.000Z'
      data.promptVariables![0].defaultValue = 'precise'
      data.promptVariables![0].updatedAt = '2026-06-13T14:00:00.000Z'
      data.promptHistories!.push({
        id: 42,
        uuid: 'real-history-mobile-update',
        promptId: 31,
        promptUuid: 'real-prompt-launch',
        title: '发布计划提示词 - 移动端更新',
        content: '移动端更新后再次生成发布计划',
        result: 'Updated launch plan from mobile',
        version: 2,
        imageBlobs: [UPDATED_IMAGE],
        createdAt: '2026-06-13T14:01:00.000Z',
        updatedAt: '2026-06-13T14:01:00.000Z'
      })
      data.aiHistory!.push({
        id: 51,
        uuid: 'real-ai-history-mobile-update',
        promptUuid: 'real-prompt-launch',
        input: '生成移动端更新发布计划',
        output: '移动端更新后的发布计划结果',
        provider: 'openai',
        model: 'gpt-4.1',
        createdAt: '2026-06-13T14:02:00.000Z',
        updatedAt: '2026-06-13T14:02:00.000Z'
      })
      data.settings = [
        { key: 'theme', value: 'light', type: 'string', updatedAt: '2026-06-13T14:00:00.000Z' },
        { key: 'cloud.sync.intervalMinutes', value: 5, type: 'number', updatedAt: '2026-06-13T14:00:00.000Z' }
      ]
      data.quickOptimizationConfigs![0].prompt = '请更精确地优化：{{content}}'
      data.quickOptimizationConfigs![0].updatedAt = '2026-06-13T14:00:00.000Z'
    })

    const updateUpload = await deviceB.syncNow(storageId, {
      deviceName: 'Phone B',
      platform: 'ios',
      reason: 'manual'
    })
    expect(updateUpload).toMatchObject({ success: true, action: 'uploaded' })

    const backToA = await deviceA.syncNow(storageId, {
      deviceName: 'Laptop A',
      platform: 'electron',
      reason: 'manual'
    })
    expect(backToA.success, JSON.stringify(backToA, null, 2)).toBe(true)
    expect(backToA.error).toBeUndefined()
    expect(deviceADatabase.data.categories).toEqual(expect.arrayContaining([
      expect.objectContaining({ uuid: 'real-category-product', name: '真实项目资料-移动端更新' })
    ]))
    expect(deviceADatabase.data.prompts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uuid: 'real-prompt-launch',
        title: '发布计划提示词 - 移动端更新',
        imageBlobs: [INITIAL_IMAGE, UPDATED_IMAGE]
      })
    ]))
    expect(deviceADatabase.data.promptVariables).toEqual(expect.arrayContaining([
      expect.objectContaining({ uuid: 'real-variable-tone', defaultValue: 'precise' })
    ]))
    expect(deviceADatabase.data.promptHistories).toEqual(expect.arrayContaining([
      expect.objectContaining({ uuid: 'real-history-initial', imageBlobs: [INITIAL_IMAGE] }),
      expect.objectContaining({ uuid: 'real-history-mobile-update', imageBlobs: [UPDATED_IMAGE] })
    ]))
    expect(deviceADatabase.data.aiHistory).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uuid: 'real-ai-history-mobile-update',
        output: '移动端更新后的发布计划结果'
      })
    ]))
    expect(deviceADatabase.data.settings).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'theme', value: 'light' }),
      expect.objectContaining({ key: 'cloud.sync.intervalMinutes', value: 5 })
    ]))
    expect(deviceADatabase.data.quickOptimizationConfigs).toEqual(expect.arrayContaining([
      expect.objectContaining({ uuid: 'quick-real-cleanup', prompt: '请更精确地优化：{{content}}' })
    ]))

    const manifest = await client.getCloudSyncManifest(storageId)
    expect(manifest.latestSnapshot?.dataChecksum)
      .toBe(createCloudSyncDataChecksum(manifest.latestSnapshot!.data))
    const finalNoop = await deviceA.syncNow(storageId, {
      deviceName: 'Laptop A',
      platform: 'electron',
      reason: 'manual'
    })
    expect(finalNoop).toMatchObject({ success: true, action: 'noop' })
  })

  it('多端离线同时新增生成历史时会合并两边历史和 AI 记录', async () => {
    const storageId = 'robust-parallel-offline-history-generations'
    const client = createWebDAVSyncClient(storageId)
    const deviceADatabase = new MutableSyncDatabase(createRealisticDataSet())
    const deviceA = createSyncService(client, deviceADatabase, new MemoryStorage(), 'device-a')

    const firstUpload = await deviceA.syncNow(storageId, {
      deviceName: 'Laptop A',
      platform: 'electron',
      reason: 'manual'
    })
    expect(firstUpload).toMatchObject({ success: true, action: 'uploaded' })

    const deviceBDatabase = new MutableSyncDatabase(emptyDataSet())
    const deviceB = createSyncService(client, deviceBDatabase, new MemoryStorage(), 'device-b')
    expect(await deviceB.syncNow(storageId, {
      deviceName: 'Phone B',
      platform: 'ios',
      reason: 'manual'
    })).toMatchObject({ success: true, action: 'downloaded' })

    deviceADatabase.data = mutateDataSet(deviceADatabase.data, data => {
      data.promptHistories!.push({
        id: 81,
        uuid: 'real-history-offline-laptop-a',
        promptId: 31,
        promptUuid: 'real-prompt-launch',
        title: '发布计划提示词 - Laptop A 离线生成',
        content: 'Laptop A 离线生成发布计划',
        result: 'Offline generation from Laptop A',
        version: 2,
        imageBlobs: [INITIAL_IMAGE],
        createdAt: '2026-06-13T14:10:00.000Z',
        updatedAt: '2026-06-13T14:10:00.000Z'
      })
      data.aiHistory!.push({
        id: 91,
        uuid: 'real-ai-history-offline-laptop-a',
        promptUuid: 'real-prompt-launch',
        input: 'Laptop A 离线生成发布计划',
        output: 'Offline generation from Laptop A',
        provider: 'openai',
        model: 'gpt-4.1',
        createdAt: '2026-06-13T14:11:00.000Z',
        updatedAt: '2026-06-13T14:11:00.000Z'
      })
    })
    deviceBDatabase.data = mutateDataSet(deviceBDatabase.data, data => {
      data.promptHistories!.push({
        id: 82,
        uuid: 'real-history-offline-phone-b',
        promptId: 31,
        promptUuid: 'real-prompt-launch',
        title: '发布计划提示词 - Phone B 离线生成',
        content: 'Phone B 离线生成发布计划',
        result: 'Offline generation from Phone B',
        version: 2,
        imageBlobs: [UPDATED_IMAGE],
        createdAt: '2026-06-13T14:12:00.000Z',
        updatedAt: '2026-06-13T14:12:00.000Z'
      })
      data.aiHistory!.push({
        id: 92,
        uuid: 'real-ai-history-offline-phone-b',
        promptUuid: 'real-prompt-launch',
        input: 'Phone B 离线生成发布计划',
        output: 'Offline generation from Phone B',
        provider: 'openai',
        model: 'gpt-4.1',
        createdAt: '2026-06-13T14:13:00.000Z',
        updatedAt: '2026-06-13T14:13:00.000Z'
      })
    })

    expect(await deviceB.syncNow(storageId, {
      deviceName: 'Phone B',
      platform: 'ios',
      reason: 'manual'
    })).toMatchObject({ success: true, action: 'uploaded' })

    const merged = await deviceA.syncNow(storageId, {
      deviceName: 'Laptop A',
      platform: 'electron',
      reason: 'manual'
    })
    expect(merged, JSON.stringify(merged, null, 2)).toMatchObject({
      success: true,
      action: 'merged',
      appliedLocal: true,
      uploadedRemote: true,
      conflicts: []
    })
    expect(deviceADatabase.data.promptHistories).toEqual(expect.arrayContaining([
      expect.objectContaining({ uuid: 'real-history-initial', imageBlobs: [INITIAL_IMAGE] }),
      expect.objectContaining({ uuid: 'real-history-offline-laptop-a', imageBlobs: [INITIAL_IMAGE] }),
      expect.objectContaining({ uuid: 'real-history-offline-phone-b', imageBlobs: [UPDATED_IMAGE] })
    ]))
    expect(deviceADatabase.data.aiHistory).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uuid: 'real-ai-history-initial',
        output: '初始发布计划结果'
      }),
      expect.objectContaining({
        uuid: 'real-ai-history-offline-laptop-a',
        output: 'Offline generation from Laptop A'
      }),
      expect.objectContaining({
        uuid: 'real-ai-history-offline-phone-b',
        output: 'Offline generation from Phone B'
      })
    ]))

    const manifest = await client.getCloudSyncManifest(storageId)
    expect(manifest.latestSnapshot?.data.promptHistories).toEqual(expect.arrayContaining([
      expect.objectContaining({ uuid: 'real-history-initial', imageBlobs: [INITIAL_IMAGE] }),
      expect.objectContaining({ uuid: 'real-history-offline-laptop-a', imageBlobs: [INITIAL_IMAGE] }),
      expect.objectContaining({ uuid: 'real-history-offline-phone-b', imageBlobs: [UPDATED_IMAGE] })
    ]))
    expect(manifest.latestSnapshot?.data.aiHistory).toEqual(expect.arrayContaining([
      expect.objectContaining({ uuid: 'real-ai-history-initial' }),
      expect.objectContaining({ uuid: 'real-ai-history-offline-laptop-a' }),
      expect.objectContaining({ uuid: 'real-ai-history-offline-phone-b' })
    ]))
    expect(manifest.latestSnapshot?.dataChecksum)
      .toBe(createCloudSyncDataChecksum(manifest.latestSnapshot!.data))

    const deviceCDatabase = new MutableSyncDatabase(emptyDataSet())
    const deviceC = createSyncService(client, deviceCDatabase, new MemoryStorage(), 'device-c')
    expect(await deviceC.syncNow(storageId, {
      deviceName: 'Desktop C',
      platform: 'electron',
      reason: 'manual'
    })).toMatchObject({ success: true, action: 'downloaded' })
    expect(deviceCDatabase.data.promptHistories).toEqual(expect.arrayContaining([
      expect.objectContaining({ uuid: 'real-history-initial', imageBlobs: [INITIAL_IMAGE] }),
      expect.objectContaining({ uuid: 'real-history-offline-laptop-a', imageBlobs: [INITIAL_IMAGE] }),
      expect.objectContaining({ uuid: 'real-history-offline-phone-b', imageBlobs: [UPDATED_IMAGE] })
    ]))
    expect(deviceCDatabase.data.aiHistory).toEqual(expect.arrayContaining([
      expect.objectContaining({ uuid: 'real-ai-history-initial' }),
      expect.objectContaining({ uuid: 'real-ai-history-offline-laptop-a' }),
      expect.objectContaining({ uuid: 'real-ai-history-offline-phone-b' })
    ]))

    const snapshotsBeforeRepeatedClick = await client.listCloudSyncSnapshots(storageId)
    const finalNoop = await deviceA.syncNow(storageId, {
      deviceName: 'Laptop A',
      platform: 'electron',
      reason: 'manual'
    })
    expect(finalNoop).toMatchObject({ success: true, action: 'noop' })
    expect(await client.listCloudSyncSnapshots(storageId)).toHaveLength(snapshotsBeforeRepeatedClick.length)
  })

  it('一端离线更新变量配置另一端生成历史时会同时保留变量和历史', async () => {
    const storageId = 'robust-variable-update-vs-history-create'
    const client = createWebDAVSyncClient(storageId)
    const deviceADatabase = new MutableSyncDatabase(createRealisticDataSet())
    const deviceA = createSyncService(client, deviceADatabase, new MemoryStorage(), 'device-a')

    const firstUpload = await deviceA.syncNow(storageId, {
      deviceName: 'Laptop A',
      platform: 'electron',
      reason: 'manual'
    })
    expect(firstUpload).toMatchObject({ success: true, action: 'uploaded' })

    const deviceBDatabase = new MutableSyncDatabase(emptyDataSet())
    const deviceB = createSyncService(client, deviceBDatabase, new MemoryStorage(), 'device-b')
    expect(await deviceB.syncNow(storageId, {
      deviceName: 'Phone B',
      platform: 'ios',
      reason: 'manual'
    })).toMatchObject({ success: true, action: 'downloaded' })

    deviceADatabase.data = mutateDataSet(deviceADatabase.data, data => {
      data.promptVariables![0].defaultValue = 'precise'
      data.promptVariables![0].options = ['friendly', 'precise', 'executive']
      data.promptVariables![0].required = false
      data.promptVariables![0].updatedAt = '2026-06-13T14:20:00.000Z'
      data.settings = [{
        key: 'generation.defaultTone',
        value: 'precise',
        type: 'string',
        updatedAt: '2026-06-13T14:20:00.000Z'
      }]
    })
    deviceBDatabase.data = mutateDataSet(deviceBDatabase.data, data => {
      data.promptHistories!.push({
        id: 83,
        uuid: 'real-history-phone-generated-while-variable-edited',
        promptId: 31,
        promptUuid: 'real-prompt-launch',
        title: '发布计划提示词 - Phone B 继续生成',
        content: 'Phone B 用旧变量配置继续生成',
        result: 'Phone B generation should survive variable edit',
        version: 2,
        imageBlobs: [UPDATED_IMAGE],
        createdAt: '2026-06-13T14:21:00.000Z',
        updatedAt: '2026-06-13T14:21:00.000Z'
      })
      data.aiHistory!.push({
        id: 93,
        uuid: 'real-ai-history-phone-generated-while-variable-edited',
        promptUuid: 'real-prompt-launch',
        input: 'Phone B 用旧变量配置继续生成',
        output: 'Phone B generation should survive variable edit',
        provider: 'openai',
        model: 'gpt-4.1',
        createdAt: '2026-06-13T14:22:00.000Z',
        updatedAt: '2026-06-13T14:22:00.000Z'
      })
    })

    const remoteHistoryUpload = await deviceB.syncNow(storageId, {
      deviceName: 'Phone B',
      platform: 'ios',
      reason: 'manual'
    })
    expect(remoteHistoryUpload).toMatchObject({ success: true, action: 'uploaded' })

    const merged = await deviceA.syncNow(storageId, {
      deviceName: 'Laptop A',
      platform: 'electron',
      reason: 'manual'
    })
    expect(merged, JSON.stringify(merged, null, 2)).toMatchObject({
      success: true,
      action: 'merged',
      appliedLocal: true,
      uploadedRemote: true,
      conflicts: []
    })
    expect(deviceADatabase.data.promptVariables).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uuid: 'real-variable-tone',
        promptUuid: 'real-prompt-launch',
        defaultValue: 'precise',
        options: ['friendly', 'precise', 'executive'],
        required: false
      })
    ]))
    expect(deviceADatabase.data.promptHistories).toEqual(expect.arrayContaining([
      expect.objectContaining({ uuid: 'real-history-initial', imageBlobs: [INITIAL_IMAGE] }),
      expect.objectContaining({
        uuid: 'real-history-phone-generated-while-variable-edited',
        promptUuid: 'real-prompt-launch',
        imageBlobs: [UPDATED_IMAGE]
      })
    ]))
    expect(deviceADatabase.data.aiHistory).toEqual(expect.arrayContaining([
      expect.objectContaining({ uuid: 'real-ai-history-initial' }),
      expect.objectContaining({
        uuid: 'real-ai-history-phone-generated-while-variable-edited',
        output: 'Phone B generation should survive variable edit'
      })
    ]))
    expect(deviceADatabase.data.settings).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'generation.defaultTone', value: 'precise' })
    ]))

    const manifest = await client.getCloudSyncManifest(storageId)
    expect(manifest.latestSnapshot?.data.promptVariables).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uuid: 'real-variable-tone',
        promptUuid: 'real-prompt-launch',
        defaultValue: 'precise',
        options: ['friendly', 'precise', 'executive'],
        required: false
      })
    ]))
    expect(manifest.latestSnapshot?.data.promptHistories).toEqual(expect.arrayContaining([
      expect.objectContaining({ uuid: 'real-history-initial', imageBlobs: [INITIAL_IMAGE] }),
      expect.objectContaining({
        uuid: 'real-history-phone-generated-while-variable-edited',
        promptUuid: 'real-prompt-launch',
        imageBlobs: [UPDATED_IMAGE]
      })
    ]))
    expect(manifest.latestSnapshot?.data.aiHistory).toEqual(expect.arrayContaining([
      expect.objectContaining({ uuid: 'real-ai-history-initial' }),
      expect.objectContaining({ uuid: 'real-ai-history-phone-generated-while-variable-edited' })
    ]))
    expect(manifest.latestSnapshot?.dataChecksum)
      .toBe(createCloudSyncDataChecksum(manifest.latestSnapshot!.data))

    const deviceCDatabase = new MutableSyncDatabase(emptyDataSet())
    const deviceC = createSyncService(client, deviceCDatabase, new MemoryStorage(), 'device-c')
    expect(await deviceC.syncNow(storageId, {
      deviceName: 'Desktop C',
      platform: 'electron',
      reason: 'manual'
    })).toMatchObject({ success: true, action: 'downloaded' })
    expect(deviceCDatabase.data.promptVariables).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uuid: 'real-variable-tone',
        defaultValue: 'precise',
        options: ['friendly', 'precise', 'executive']
      })
    ]))
    expect(deviceCDatabase.data.promptHistories).toEqual(expect.arrayContaining([
      expect.objectContaining({ uuid: 'real-history-phone-generated-while-variable-edited' })
    ]))

    const snapshotsBeforeRepeatedClick = await client.listCloudSyncSnapshots(storageId)
    const repeatedClick = await deviceA.syncNow(storageId, {
      deviceName: 'Laptop A',
      platform: 'electron',
      reason: 'manual'
    })
    expect(repeatedClick).toMatchObject({ success: true, action: 'noop' })
    expect(await client.listCloudSyncSnapshots(storageId)).toHaveLength(snapshotsBeforeRepeatedClick.length)
  })

  it('新设备离线先创建数据后首次连接云端会合并两边且不丢图片历史', async () => {
    const storageId = 'robust-new-device-offline-create-first-sync'
    const client = createWebDAVSyncClient(storageId)
    const cloudData = createRealisticDataSet()
    const deviceADatabase = new MutableSyncDatabase(cloudData)
    const deviceA = createSyncService(client, deviceADatabase, new MemoryStorage(), 'device-a')

    const cloudUpload = await deviceA.syncNow(storageId, {
      deviceName: 'Laptop A',
      platform: 'electron',
      reason: 'manual'
    })
    expect(cloudUpload).toMatchObject({ success: true, action: 'uploaded' })

    const offlineData = createOfflineNewDeviceData()
    const newDeviceDatabase = new MutableSyncDatabase(offlineData)
    const newDevice = createSyncService(client, newDeviceDatabase, new MemoryStorage(), 'device-new-offline')

    const firstSync = await newDevice.syncNow(storageId, {
      deviceName: 'Phone Offline First',
      platform: 'ios',
      reason: 'manual'
    })

    expect(firstSync, JSON.stringify(firstSync, null, 2)).toMatchObject({
      success: true,
      action: 'merged',
      appliedLocal: true,
      uploadedRemote: true,
      conflicts: []
    })
    expect(newDeviceDatabase.data.prompts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uuid: 'real-prompt-launch',
        title: '发布计划提示词',
        imageBlobs: [INITIAL_IMAGE]
      }),
      expect.objectContaining({
        uuid: 'offline-prompt-roadmap',
        title: '离线新建设计评审提示词',
        imageBlobs: [UPDATED_IMAGE]
      })
    ]))
    expect(newDeviceDatabase.data.promptVariables).toEqual(expect.arrayContaining([
      expect.objectContaining({ uuid: 'real-variable-tone', promptUuid: 'real-prompt-launch' }),
      expect.objectContaining({ uuid: 'offline-variable-scope', promptUuid: 'offline-prompt-roadmap' })
    ]))
    expect(newDeviceDatabase.data.promptHistories).toEqual(expect.arrayContaining([
      expect.objectContaining({ uuid: 'real-history-initial', imageBlobs: [INITIAL_IMAGE] }),
      expect.objectContaining({ uuid: 'offline-history-draft', imageBlobs: [UPDATED_IMAGE] })
    ]))
    expect(newDeviceDatabase.data.aiHistory).toEqual(expect.arrayContaining([
      expect.objectContaining({ uuid: 'real-ai-history-initial' }),
      expect.objectContaining({ uuid: 'offline-ai-history-draft' })
    ]))
    expect(newDeviceDatabase.data.settings).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'theme', value: 'dark' }),
      expect.objectContaining({ key: 'offline.review.mode', value: 'strict' })
    ]))

    const manifest = await client.getCloudSyncManifest(storageId)
    expect(manifest.latestSnapshot?.data.prompts).toEqual(expect.arrayContaining([
      expect.objectContaining({ uuid: 'real-prompt-launch', imageBlobs: [INITIAL_IMAGE] }),
      expect.objectContaining({ uuid: 'offline-prompt-roadmap', imageBlobs: [UPDATED_IMAGE] })
    ]))
    expect(manifest.latestSnapshot?.data.promptHistories).toEqual(expect.arrayContaining([
      expect.objectContaining({ uuid: 'real-history-initial', imageBlobs: [INITIAL_IMAGE] }),
      expect.objectContaining({ uuid: 'offline-history-draft', imageBlobs: [UPDATED_IMAGE] })
    ]))
    expect(manifest.latestSnapshot?.dataChecksum)
      .toBe(createCloudSyncDataChecksum(manifest.latestSnapshot!.data))

    const deviceC = createSyncService(
      client,
      new MutableSyncDatabase(emptyDataSet()),
      new MemoryStorage(),
      'device-c'
    )
    const thirdDeviceDownload = await deviceC.syncNow(storageId, {
      deviceName: 'Desktop C',
      platform: 'electron',
      reason: 'manual'
    })
    expect(thirdDeviceDownload).toMatchObject({ success: true, action: 'downloaded' })

    const snapshotsBeforeRepeatedClicks = await client.listCloudSyncSnapshots(storageId)
    const secondClick = await newDevice.syncNow(storageId, {
      deviceName: 'Phone Offline First',
      platform: 'ios',
      reason: 'manual'
    })
    const thirdClick = await newDevice.syncNow(storageId, {
      deviceName: 'Phone Offline First',
      platform: 'ios',
      reason: 'manual'
    })
    expect(secondClick).toMatchObject({ success: true, action: 'noop' })
    expect(thirdClick).toMatchObject({ success: true, action: 'noop' })
    expect(await client.listCloudSyncSnapshots(storageId)).toHaveLength(snapshotsBeforeRepeatedClicks.length)
  })

  it('删除提示词后会通过 tombstone 跨端删除变量和历史且不会复活', async () => {
    const storageId = 'robust-delete-propagates-tombstones'
    const client = createWebDAVSyncClient(storageId)
    const deviceADatabase = new MutableSyncDatabase(createRealisticDataSet())
    const deviceA = createSyncService(client, deviceADatabase, new MemoryStorage(), 'device-a')

    const firstUpload = await deviceA.syncNow(storageId, {
      deviceName: 'Laptop A',
      platform: 'electron',
      reason: 'manual'
    })
    expect(firstUpload).toMatchObject({ success: true, action: 'uploaded' })

    const deviceBDatabase = new MutableSyncDatabase(emptyDataSet())
    const deviceB = createSyncService(client, deviceBDatabase, new MemoryStorage(), 'device-b')
    expect(await deviceB.syncNow(storageId, {
      deviceName: 'Phone B',
      platform: 'ios',
      reason: 'manual'
    })).toMatchObject({ success: true, action: 'downloaded' })
    expect(deviceBDatabase.data.prompts).toHaveLength(1)
    expect(deviceBDatabase.data.promptVariables).toHaveLength(1)
    expect(deviceBDatabase.data.promptHistories).toHaveLength(1)

    deviceADatabase.data = mutateDataSet(deviceADatabase.data, data => {
      const deletedAt = '2026-06-13T15:00:00.000Z'
      data.prompts = []
      data.promptVariables = []
      data.promptHistories = []
      data.syncTombstones = [
        createTombstone('prompts', 'real-prompt-launch', deletedAt),
        createTombstone('promptVariables', 'real-variable-tone', deletedAt),
        createTombstone('promptHistories', 'real-history-initial', deletedAt)
      ]
    })

    const deleteUpload = await deviceA.syncNow(storageId, {
      deviceName: 'Laptop A',
      platform: 'electron',
      reason: 'manual'
    })
    expect(deleteUpload, JSON.stringify(deleteUpload, null, 2))
      .toMatchObject({ success: true, action: 'uploaded', appliedLocal: false, uploadedRemote: true })

    const deleteDownload = await deviceB.syncNow(storageId, {
      deviceName: 'Phone B',
      platform: 'ios',
      reason: 'manual'
    })
    expect(deleteDownload, JSON.stringify(deleteDownload, null, 2))
      .toMatchObject({ success: true, action: 'downloaded' })
    expect(deviceBDatabase.data.prompts).toEqual([])
    expect(deviceBDatabase.data.promptVariables).toEqual([])
    expect(deviceBDatabase.data.promptHistories).toEqual([])
    expect(deviceBDatabase.data.syncTombstones).toEqual(expect.arrayContaining([
      expect.objectContaining({ collectionName: 'prompts', recordUuid: 'real-prompt-launch' }),
      expect.objectContaining({ collectionName: 'promptVariables', recordUuid: 'real-variable-tone' }),
      expect.objectContaining({ collectionName: 'promptHistories', recordUuid: 'real-history-initial' })
    ]))

    const retry = await deviceB.syncNow(storageId, {
      deviceName: 'Phone B',
      platform: 'ios',
      reason: 'manual'
    })
    expect(retry).toMatchObject({ success: true, action: 'noop' })
  })

  it('旧 tombstone 遇到另一端较新的更新时不会误删用户新内容', async () => {
    const storageId = 'robust-older-delete-newer-update'
    const client = createWebDAVSyncClient(storageId)
    const deviceADatabase = new MutableSyncDatabase(createDataSet({
      promptTitle: 'Delete conflict base',
      promptUpdatedAt: '2026-06-13T15:00:00.000Z'
    }))
    const deviceAStorage = new MemoryStorage()
    const deviceA = createSyncService(client, deviceADatabase, deviceAStorage, 'device-a')
    expect(await deviceA.syncNow(storageId, {
      deviceName: 'Laptop A',
      platform: 'electron',
      reason: 'manual'
    })).toMatchObject({ success: true, action: 'uploaded' })

    const deviceBDatabase = new MutableSyncDatabase(emptyDataSet())
    const deviceB = createSyncService(client, deviceBDatabase, new MemoryStorage(), 'device-b')
    expect(await deviceB.syncNow(storageId, {
      deviceName: 'Desktop B',
      platform: 'electron',
      reason: 'manual'
    })).toMatchObject({ success: true, action: 'downloaded' })

    deviceADatabase.data = mutateDataSet(deviceADatabase.data, data => {
      data.prompts = []
      data.syncTombstones = [
        createTombstone('prompts', 'prompt-main', '2026-06-13T15:05:00.000Z')
      ]
    })
    deviceBDatabase.data = mutateDataSet(deviceBDatabase.data, data => {
      data.prompts![0].title = 'Newer edit should survive delete'
      data.prompts![0].updatedAt = '2026-06-13T15:10:00.000Z'
    })

    const deleteUpload = await deviceA.syncNow(storageId, {
      deviceName: 'Laptop A',
      platform: 'electron',
      reason: 'manual'
    })
    expect(deleteUpload, JSON.stringify(deleteUpload, null, 2))
      .toMatchObject({ success: true, action: 'merged', appliedLocal: true, uploadedRemote: true })

    const conflictResult = await deviceB.syncNow(storageId, {
      deviceName: 'Desktop B',
      platform: 'electron',
      reason: 'manual'
    })
    expect(conflictResult.success, JSON.stringify(conflictResult, null, 2)).toBe(true)
    expect(conflictResult.action).toBe('merged')
    expect(conflictResult.uploadedRemote).toBe(true)
    expect(conflictResult.conflicts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        collection: 'prompts',
        key: 'uuid:prompt-main',
        reason: 'delete_vs_update',
        resolution: 'keep-local'
      })
    ]))

    const manifest = await client.getCloudSyncManifest(storageId)
    expect(manifest.latestSnapshot?.data.prompts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uuid: 'prompt-main',
        title: 'Newer edit should survive delete'
      })
    ]))
    expect(manifest.latestSnapshot?.dataChecksum)
      .toBe(createCloudSyncDataChecksum(manifest.latestSnapshot!.data))

    const deviceCDatabase = new MutableSyncDatabase(emptyDataSet())
    const deviceC = createSyncService(client, deviceCDatabase, new MemoryStorage(), 'device-c')
    const cDownload = await deviceC.syncNow(storageId, {
      deviceName: 'Tablet C',
      platform: 'web',
      reason: 'manual'
    })
    expect(cDownload).toMatchObject({ success: true, action: 'downloaded' })
    expect(deviceCDatabase.data.prompts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uuid: 'prompt-main',
        title: 'Newer edit should survive delete'
      })
    ]))
  })

  it('删除空分类遇到另一端离线新增提示词时会保留分类关系', async () => {
    const storageId = 'robust-category-delete-vs-offline-prompt-create'
    const client = createWebDAVSyncClient(storageId)
    const baseData = emptyDataSet()
    baseData.categories = [{
      id: 301,
      uuid: 'category-offline-work',
      name: '离线工作分类',
      isActive: true,
      sortOrder: 1,
      createdAt: '2026-06-13T15:00:00.000Z',
      updatedAt: '2026-06-13T15:00:00.000Z'
    }]
    const deviceADatabase = new MutableSyncDatabase(baseData)
    const deviceA = createSyncService(client, deviceADatabase, new MemoryStorage(), 'device-a')

    const firstUpload = await deviceA.syncNow(storageId, {
      deviceName: 'Laptop A',
      platform: 'electron',
      reason: 'manual'
    })
    expect(firstUpload).toMatchObject({ success: true, action: 'uploaded' })

    const deviceBDatabase = new MutableSyncDatabase(emptyDataSet())
    const deviceB = createSyncService(client, deviceBDatabase, new MemoryStorage(), 'device-b')
    expect(await deviceB.syncNow(storageId, {
      deviceName: 'Phone B',
      platform: 'ios',
      reason: 'manual'
    })).toMatchObject({ success: true, action: 'downloaded' })

    deviceADatabase.data = mutateDataSet(deviceADatabase.data, data => {
      const deletedCategory = data.categories![0]
      data.categories = []
      data.syncTombstones = [
        createTombstoneFromRecord('categories', deletedCategory, '2026-06-13T15:05:00.000Z')
      ]
    })
    deviceBDatabase.data = mutateDataSet(deviceBDatabase.data, data => {
      data.prompts = [{
        id: 401,
        uuid: 'prompt-created-in-offline-category',
        title: '离线分类里的新提示词',
        content: '请围绕 {{topic}} 输出计划',
        categoryId: 301,
        categoryUuid: 'category-offline-work',
        tags: ['offline', 'category'],
        isFavorite: true,
        useCount: 1,
        isActive: true,
        imageBlobs: [INITIAL_IMAGE],
        createdAt: '2026-06-13T15:10:00.000Z',
        updatedAt: '2026-06-13T15:10:00.000Z'
      }]
      data.promptVariables = [{
        id: 402,
        uuid: 'variable-created-in-offline-category',
        promptId: 401,
        promptUuid: 'prompt-created-in-offline-category',
        name: 'topic',
        type: 'text',
        defaultValue: 'sync safety',
        required: true,
        sortOrder: 1,
        createdAt: '2026-06-13T15:10:00.000Z',
        updatedAt: '2026-06-13T15:10:00.000Z'
      }]
      data.promptHistories = [{
        id: 403,
        uuid: 'history-created-in-offline-category',
        promptId: 401,
        promptUuid: 'prompt-created-in-offline-category',
        categoryId: 301,
        categoryUuid: 'category-offline-work',
        title: '离线分类里的新提示词',
        content: '离线生成分类内提示词',
        result: 'Offline category prompt result',
        version: 1,
        imageBlobs: [INITIAL_IMAGE],
        createdAt: '2026-06-13T15:11:00.000Z',
        updatedAt: '2026-06-13T15:11:00.000Z'
      }]
    })

    expect(await deviceA.syncNow(storageId, {
      deviceName: 'Laptop A',
      platform: 'electron',
      reason: 'manual'
    })).toMatchObject({ success: true, action: 'uploaded' })

    const merged = await deviceB.syncNow(storageId, {
      deviceName: 'Phone B',
      platform: 'ios',
      reason: 'manual'
    })
    expect(merged, JSON.stringify(merged, null, 2)).toMatchObject({
      success: true,
      action: 'merged',
      uploadedRemote: true
    })
    expect(deviceBDatabase.data.categories).toEqual(expect.arrayContaining([
      expect.objectContaining({ uuid: 'category-offline-work', name: '离线工作分类' })
    ]))
    expect(deviceBDatabase.data.prompts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uuid: 'prompt-created-in-offline-category',
        categoryUuid: 'category-offline-work',
        imageBlobs: [INITIAL_IMAGE]
      })
    ]))
    expect(deviceBDatabase.data.promptVariables).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uuid: 'variable-created-in-offline-category',
        promptUuid: 'prompt-created-in-offline-category'
      })
    ]))
    expect(deviceBDatabase.data.promptHistories).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uuid: 'history-created-in-offline-category',
        categoryUuid: 'category-offline-work',
        imageBlobs: [INITIAL_IMAGE]
      })
    ]))

    const manifest = await client.getCloudSyncManifest(storageId)
    expect(manifest.latestSnapshot?.data.categories).toEqual(expect.arrayContaining([
      expect.objectContaining({ uuid: 'category-offline-work', name: '离线工作分类' })
    ]))
    expect(manifest.latestSnapshot?.data.prompts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uuid: 'prompt-created-in-offline-category',
        categoryUuid: 'category-offline-work'
      })
    ]))
    expect(manifest.latestSnapshot?.data.promptHistories).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uuid: 'history-created-in-offline-category',
        categoryUuid: 'category-offline-work',
        imageBlobs: [INITIAL_IMAGE]
      })
    ]))
    expect(manifest.latestSnapshot?.dataChecksum)
      .toBe(createCloudSyncDataChecksum(manifest.latestSnapshot!.data))

    const deviceCDatabase = new MutableSyncDatabase(emptyDataSet())
    const deviceC = createSyncService(client, deviceCDatabase, new MemoryStorage(), 'device-c')
    expect(await deviceC.syncNow(storageId, {
      deviceName: 'Desktop C',
      platform: 'electron',
      reason: 'manual'
    })).toMatchObject({ success: true, action: 'downloaded' })
    expect(deviceCDatabase.data.categories).toEqual(expect.arrayContaining([
      expect.objectContaining({ uuid: 'category-offline-work' })
    ]))
    expect(deviceCDatabase.data.prompts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uuid: 'prompt-created-in-offline-category',
        categoryUuid: 'category-offline-work'
      })
    ]))
  })

  it('删除提示词遇到另一端较新生成历史时会保留提示词元数据和新历史', async () => {
    const storageId = 'robust-delete-vs-newer-generated-history'
    const client = createWebDAVSyncClient(storageId)
    const deviceADatabase = new MutableSyncDatabase(createRealisticDataSet())
    const deviceA = createSyncService(client, deviceADatabase, new MemoryStorage(), 'device-a')
    expect(await deviceA.syncNow(storageId, {
      deviceName: 'Laptop A',
      platform: 'electron',
      reason: 'manual'
    })).toMatchObject({ success: true, action: 'uploaded' })

    const deviceBDatabase = new MutableSyncDatabase(emptyDataSet())
    const deviceB = createSyncService(client, deviceBDatabase, new MemoryStorage(), 'device-b')
    expect(await deviceB.syncNow(storageId, {
      deviceName: 'Phone B',
      platform: 'ios',
      reason: 'manual'
    })).toMatchObject({ success: true, action: 'downloaded' })

    const deletedAt = '2026-06-13T15:05:00.000Z'
    deviceADatabase.data = mutateDataSet(deviceADatabase.data, data => {
      const deletedPrompt = data.prompts![0]
      const deletedVariable = data.promptVariables![0]
      const deletedHistory = data.promptHistories![0]
      data.prompts = []
      data.promptVariables = []
      data.promptHistories = []
      data.syncTombstones = [
        createTombstoneFromRecord('prompts', deletedPrompt, deletedAt),
        createTombstoneFromRecord('promptVariables', deletedVariable, deletedAt),
        createTombstoneFromRecord('promptHistories', deletedHistory, deletedAt)
      ]
    })
    deviceBDatabase.data = mutateDataSet(deviceBDatabase.data, data => {
      data.prompts![0].title = '删除冲突后保留的新生成提示词'
      data.prompts![0].useCount = 4
      data.prompts![0].updatedAt = '2026-06-13T15:10:00.000Z'
      data.promptHistories!.push({
        id: 84,
        uuid: 'real-history-after-delete-conflict',
        promptId: 31,
        promptUuid: 'real-prompt-launch',
        title: '删除冲突后的新生成历史',
        content: '另一端删除期间继续生成',
        result: 'New generation should survive older delete',
        version: 2,
        imageBlobs: [UPDATED_IMAGE],
        createdAt: '2026-06-13T15:11:00.000Z',
        updatedAt: '2026-06-13T15:11:00.000Z'
      })
      data.aiHistory!.push({
        id: 94,
        uuid: 'real-ai-history-after-delete-conflict',
        promptUuid: 'real-prompt-launch',
        input: '另一端删除期间继续生成',
        output: 'New generation should survive older delete',
        provider: 'openai',
        model: 'gpt-4.1',
        createdAt: '2026-06-13T15:12:00.000Z',
        updatedAt: '2026-06-13T15:12:00.000Z'
      })
    })

    expect(await deviceA.syncNow(storageId, {
      deviceName: 'Laptop A',
      platform: 'electron',
      reason: 'manual'
    })).toMatchObject({ success: true, action: 'uploaded' })

    const merged = await deviceB.syncNow(storageId, {
      deviceName: 'Phone B',
      platform: 'ios',
      reason: 'manual'
    })
    expect(merged, JSON.stringify(merged, null, 2)).toMatchObject({
      success: true,
      action: 'merged',
      uploadedRemote: true,
      appliedLocal: true
    })
    expect(merged.conflicts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        collection: 'prompts',
        key: 'uuid:real-prompt-launch',
        reason: 'delete_vs_update',
        resolution: 'keep-local'
      })
    ]))

    expect(deviceBDatabase.data.prompts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uuid: 'real-prompt-launch',
        title: '删除冲突后保留的新生成提示词',
        imageBlobs: [INITIAL_IMAGE]
      })
    ]))
    expect(deviceBDatabase.data.promptVariables).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uuid: 'real-variable-tone',
        promptUuid: 'real-prompt-launch',
        defaultValue: 'friendly'
      })
    ]))
    expect(deviceBDatabase.data.promptHistories).toEqual(expect.arrayContaining([
      expect.objectContaining({ uuid: 'real-history-initial', imageBlobs: [INITIAL_IMAGE] }),
      expect.objectContaining({ uuid: 'real-history-after-delete-conflict', imageBlobs: [UPDATED_IMAGE] })
    ]))
    expect(deviceBDatabase.data.aiHistory).toEqual(expect.arrayContaining([
      expect.objectContaining({ uuid: 'real-ai-history-initial' }),
      expect.objectContaining({
        uuid: 'real-ai-history-after-delete-conflict',
        output: 'New generation should survive older delete'
      })
    ]))

    const manifest = await client.getCloudSyncManifest(storageId)
    expect(manifest.latestSnapshot?.data.prompts).toEqual(expect.arrayContaining([
      expect.objectContaining({ uuid: 'real-prompt-launch', title: '删除冲突后保留的新生成提示词' })
    ]))
    expect(manifest.latestSnapshot?.data.promptVariables).toEqual(expect.arrayContaining([
      expect.objectContaining({ uuid: 'real-variable-tone', promptUuid: 'real-prompt-launch' })
    ]))
    expect(manifest.latestSnapshot?.data.promptHistories).toEqual(expect.arrayContaining([
      expect.objectContaining({ uuid: 'real-history-initial', imageBlobs: [INITIAL_IMAGE] }),
      expect.objectContaining({ uuid: 'real-history-after-delete-conflict', imageBlobs: [UPDATED_IMAGE] })
    ]))
    expect(manifest.latestSnapshot?.data.aiHistory).toEqual(expect.arrayContaining([
      expect.objectContaining({ uuid: 'real-ai-history-initial' }),
      expect.objectContaining({ uuid: 'real-ai-history-after-delete-conflict' })
    ]))
    expect(manifest.latestSnapshot?.dataChecksum)
      .toBe(createCloudSyncDataChecksum(manifest.latestSnapshot!.data))

    const deviceCDatabase = new MutableSyncDatabase(emptyDataSet())
    const deviceC = createSyncService(client, deviceCDatabase, new MemoryStorage(), 'device-c')
    expect(await deviceC.syncNow(storageId, {
      deviceName: 'Desktop C',
      platform: 'electron',
      reason: 'manual'
    })).toMatchObject({ success: true, action: 'downloaded' })
    expect(deviceCDatabase.data.promptVariables).toEqual(expect.arrayContaining([
      expect.objectContaining({ uuid: 'real-variable-tone', promptUuid: 'real-prompt-launch' })
    ]))
    expect(deviceCDatabase.data.promptHistories).toEqual(expect.arrayContaining([
      expect.objectContaining({ uuid: 'real-history-initial' }),
      expect.objectContaining({ uuid: 'real-history-after-delete-conflict' })
    ]))
  })

  it('新设备只有本地数字 ID 重建时不会误上传新 revision 或打断引用关系', async () => {
    const storageId = 'robust-reinstall-regenerated-local-ids'
    const client = createWebDAVSyncClient(storageId)
    const remoteData = createRealisticDataSet()
    const deviceADatabase = new MutableSyncDatabase(remoteData)
    const deviceA = createSyncService(client, deviceADatabase, new MemoryStorage(), 'device-a')

    const firstUpload = await deviceA.syncNow(storageId, {
      deviceName: 'Laptop A',
      platform: 'electron',
      reason: 'manual'
    })
    expect(firstUpload).toMatchObject({ success: true, action: 'uploaded' })
    const manifestBeforeReinstall = await client.getCloudSyncManifest(storageId)
    const snapshotsBeforeReinstall = await client.listCloudSyncSnapshots(storageId)

    const regeneratedLocalData = regenerateLocalNumericIds(remoteData, 5000)
    expect(createCloudSyncDataChecksum(regeneratedLocalData))
      .not.toBe(createCloudSyncDataChecksum(remoteData))

    const newInstallDatabase = new MutableSyncDatabase(regeneratedLocalData)
    const newInstall = createSyncService(client, newInstallDatabase, new MemoryStorage(), 'device-new-install')
    const result = await newInstall.syncNow(storageId, {
      deviceName: 'Fresh Install',
      platform: 'web',
      reason: 'manual'
    })

    expect(result, JSON.stringify(result, null, 2)).toMatchObject({
      success: true,
      action: 'noop',
      uploadedRemote: false,
      appliedLocal: false
    })
    const manifestAfterReinstall = await client.getCloudSyncManifest(storageId)
    const snapshotsAfterReinstall = await client.listCloudSyncSnapshots(storageId)
    expect(manifestAfterReinstall.latestSnapshot?.revision)
      .toBe(manifestBeforeReinstall.latestSnapshot?.revision)
    expect(snapshotsAfterReinstall).toHaveLength(snapshotsBeforeReinstall.length)
    expect(newInstallDatabase.replaceAllData).not.toHaveBeenCalled()
    expect(newInstallDatabase.data.prompts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uuid: 'real-prompt-launch',
        id: 5031,
        categoryId: 5011,
        categoryUuid: 'real-category-product'
      })
    ]))
    expect(newInstallDatabase.data.promptVariables).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uuid: 'real-variable-tone',
        id: 5041,
        promptId: 5031,
        promptUuid: 'real-prompt-launch'
      })
    ]))
    expect(newInstallDatabase.data.promptHistories).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uuid: 'real-history-initial',
        id: 5041,
        promptId: 5031,
        promptUuid: 'real-prompt-launch'
      })
    ]))
  })

  it('旧版云端缺少 relation UUID 时重装设备不会误上传或打断历史引用', async () => {
    const storageId = 'robust-legacy-relation-uuid-missing'
    const client = createWebDAVSyncClient(storageId)
    const legacyRemoteData = stripRelationUuids(createRealisticDataSet())
    const legacyDeviceDatabase = new MutableSyncDatabase(legacyRemoteData)
    const legacyDevice = createSyncService(client, legacyDeviceDatabase, new MemoryStorage(), 'legacy-device')

    const firstUpload = await legacyDevice.syncNow(storageId, {
      deviceName: 'Legacy Desktop',
      platform: 'electron',
      reason: 'manual'
    })
    expect(firstUpload).toMatchObject({ success: true, action: 'uploaded' })
    const manifestBeforeReinstall = await client.getCloudSyncManifest(storageId)
    const snapshotsBeforeReinstall = await client.listCloudSyncSnapshots(storageId)
    expect(manifestBeforeReinstall.latestSnapshot?.data.prompts?.[0]).not.toHaveProperty('categoryUuid')
    expect(manifestBeforeReinstall.latestSnapshot?.data.promptVariables?.[0]).not.toHaveProperty('promptUuid')
    expect(manifestBeforeReinstall.latestSnapshot?.data.promptHistories?.[0]).not.toHaveProperty('promptUuid')

    const regeneratedLocalData = regenerateLocalNumericIds(createRealisticDataSet(), 7000)
    expect(createCloudSyncSemanticChecksum(regeneratedLocalData))
      .toBe(createCloudSyncSemanticChecksum(legacyRemoteData))
    const newInstallDatabase = new MutableSyncDatabase(regeneratedLocalData)
    const newInstall = createSyncService(client, newInstallDatabase, new MemoryStorage(), 'new-install-from-legacy')

    const result = await newInstall.syncNow(storageId, {
      deviceName: 'Fresh Install From Legacy Cloud',
      platform: 'web',
      reason: 'manual'
    })

    expect(result, JSON.stringify(result, null, 2)).toMatchObject({
      success: true,
      action: 'noop',
      uploadedRemote: false,
      appliedLocal: false
    })
    const manifestAfterReinstall = await client.getCloudSyncManifest(storageId)
    const snapshotsAfterReinstall = await client.listCloudSyncSnapshots(storageId)
    expect(manifestAfterReinstall.latestSnapshot?.revision)
      .toBe(manifestBeforeReinstall.latestSnapshot?.revision)
    expect(snapshotsAfterReinstall).toHaveLength(snapshotsBeforeReinstall.length)
    expect(newInstallDatabase.replaceAllData).not.toHaveBeenCalled()
    expect(newInstallDatabase.data.prompts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uuid: 'real-prompt-launch',
        id: 7031,
        categoryId: 7011,
        categoryUuid: 'real-category-product'
      })
    ]))
    expect(newInstallDatabase.data.promptVariables).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uuid: 'real-variable-tone',
        id: 7041,
        promptId: 7031,
        promptUuid: 'real-prompt-launch'
      })
    ]))
    expect(newInstallDatabase.data.promptHistories).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uuid: 'real-history-initial',
        id: 7041,
        promptId: 7031,
        promptUuid: 'real-prompt-launch',
        imageBlobs: [INITIAL_IMAGE]
      })
    ]))
  })

  it('本地 baseSnapshot 损坏时会忽略旧状态并保留本机与云端更新', async () => {
    const storageId = 'robust-corrupt-local-base-snapshot'
    const client = createWebDAVSyncClient(storageId)
    const baseData = createRealisticDataSet()
    const deviceAStorage = new MemoryStorage()
    const deviceADatabase = new MutableSyncDatabase(baseData)
    const deviceA = createSyncService(client, deviceADatabase, deviceAStorage, 'device-a')

    const firstUpload = await deviceA.syncNow(storageId, {
      deviceName: 'Laptop A',
      platform: 'electron',
      reason: 'manual'
    })
    expect(firstUpload).toMatchObject({ success: true, action: 'uploaded' })

    const corruptBaseSnapshot = createCloudSyncSnapshot(baseData, 'device-a', firstUpload.remoteRevision)
    corruptBaseSnapshot.data.prompts![0].title = '损坏 baseSnapshot 里的旧标题'
    deviceAStorage.setItem(`ai_gist_cloud_sync_state:${storageId}`, JSON.stringify({
      storageId,
      deviceId: 'device-a',
      lastSyncAt: '2026-06-13T13:10:00.000Z',
      lastKnownRevision: firstUpload.remoteRevision,
      baseSnapshot: corruptBaseSnapshot
    }))

    const deviceBDatabase = new MutableSyncDatabase(emptyDataSet())
    const deviceB = createSyncService(client, deviceBDatabase, new MemoryStorage(), 'device-b')
    expect(await deviceB.syncNow(storageId, {
      deviceName: 'Desktop B',
      platform: 'electron',
      reason: 'manual'
    })).toMatchObject({ success: true, action: 'downloaded' })

    deviceBDatabase.data = mutateDataSet(deviceBDatabase.data, data => {
      data.prompts![0].title = '云端在本地状态损坏后更新'
      data.prompts![0].imageBlobs = [INITIAL_IMAGE, UPDATED_IMAGE]
      data.prompts![0].updatedAt = '2026-06-13T13:40:00.000Z'
      data.promptHistories!.push({
        id: 88,
        uuid: 'real-history-after-local-state-corruption',
        promptId: 31,
        promptUuid: 'real-prompt-launch',
        title: '云端在本地状态损坏后更新',
        content: '本地同步状态损坏后云端继续生成',
        result: 'Remote edit after local state corruption',
        version: 2,
        imageBlobs: [UPDATED_IMAGE],
        createdAt: '2026-06-13T13:41:00.000Z',
        updatedAt: '2026-06-13T13:41:00.000Z'
      })
      data.settings = [{
        key: 'theme',
        value: 'remote-light-after-corruption',
        type: 'string',
        updatedAt: '2026-06-13T13:42:00.000Z'
      }]
    })
    expect(await deviceB.syncNow(storageId, {
      deviceName: 'Desktop B',
      platform: 'electron',
      reason: 'manual'
    })).toMatchObject({ success: true, action: 'uploaded' })

    deviceADatabase.data = mutateDataSet(deviceADatabase.data, data => {
      data.categories![0].name = '本机状态损坏后分类更新'
      data.categories![0].updatedAt = '2026-06-13T13:45:00.000Z'
      data.quickOptimizationConfigs![0].prompt = '本机状态损坏后优化：{{content}}'
      data.quickOptimizationConfigs![0].updatedAt = '2026-06-13T13:45:00.000Z'
    })

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      const result = await deviceA.syncNow(storageId, {
        deviceName: 'Laptop A',
        platform: 'electron',
        reason: 'manual'
      })

      expect(result, JSON.stringify(result, null, 2)).toMatchObject({
        success: true,
        action: 'merged',
        appliedLocal: true,
        uploadedRemote: true
      })
      expect(result.error).toBeUndefined()
      expect(warnSpy).toHaveBeenCalledWith(
        '本地同步状态已损坏，忽略本地 baseSnapshot:',
        'snapshot data checksum mismatch'
      )
    } finally {
      warnSpy.mockRestore()
    }

    expect(deviceADatabase.data.categories).toEqual(expect.arrayContaining([
      expect.objectContaining({ uuid: 'real-category-product', name: '本机状态损坏后分类更新' })
    ]))
    expect(deviceADatabase.data.prompts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uuid: 'real-prompt-launch',
        title: '云端在本地状态损坏后更新',
        imageBlobs: [INITIAL_IMAGE, UPDATED_IMAGE]
      })
    ]))
    expect(deviceADatabase.data.promptHistories).toEqual(expect.arrayContaining([
      expect.objectContaining({ uuid: 'real-history-initial', imageBlobs: [INITIAL_IMAGE] }),
      expect.objectContaining({ uuid: 'real-history-after-local-state-corruption', imageBlobs: [UPDATED_IMAGE] })
    ]))
    expect(deviceADatabase.data.quickOptimizationConfigs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uuid: 'quick-real-cleanup',
        prompt: '本机状态损坏后优化：{{content}}'
      })
    ]))
    expect(deviceADatabase.data.settings).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'theme', value: 'remote-light-after-corruption' })
    ]))

    const manifest = await client.getCloudSyncManifest(storageId)
    expect(manifest.latestSnapshot?.data.categories).toEqual(expect.arrayContaining([
      expect.objectContaining({ uuid: 'real-category-product', name: '本机状态损坏后分类更新' })
    ]))
    expect(manifest.latestSnapshot?.data.prompts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uuid: 'real-prompt-launch',
        title: '云端在本地状态损坏后更新',
        imageBlobs: [INITIAL_IMAGE, UPDATED_IMAGE]
      })
    ]))
    expect(manifest.latestSnapshot?.data.promptHistories).toEqual(expect.arrayContaining([
      expect.objectContaining({ uuid: 'real-history-initial', imageBlobs: [INITIAL_IMAGE] }),
      expect.objectContaining({ uuid: 'real-history-after-local-state-corruption', imageBlobs: [UPDATED_IMAGE] })
    ]))
    expect(manifest.latestSnapshot?.data.quickOptimizationConfigs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uuid: 'quick-real-cleanup',
        prompt: '本机状态损坏后优化：{{content}}'
      })
    ]))
    expect(manifest.latestSnapshot?.dataChecksum)
      .toBe(createCloudSyncDataChecksum(manifest.latestSnapshot!.data))

    const retryClick = await deviceA.syncNow(storageId, {
      deviceName: 'Laptop A',
      platform: 'electron',
      reason: 'manual'
    })
    expect(retryClick).toMatchObject({ success: true, action: 'noop' })
  })

  it('本机导出缺少历史表时不会上传部分数据覆盖云端', async () => {
    const storageId = 'robust-local-partial-export-rejected'
    const client = createWebDAVSyncClient(storageId)
    const completeData = createRealisticDataSet()
    const deviceADatabase = new MutableSyncDatabase(completeData)
    const deviceA = createSyncService(client, deviceADatabase, new MemoryStorage(), 'device-a')

    const firstUpload = await deviceA.syncNow(storageId, {
      deviceName: 'Laptop A',
      platform: 'electron',
      reason: 'manual'
    })
    expect(firstUpload).toMatchObject({ success: true, action: 'uploaded' })
    const manifestBeforePartialExport = await client.getCloudSyncManifest(storageId)
    const snapshotsBeforePartialExport = await client.listCloudSyncSnapshots(storageId)
    expect(manifestBeforePartialExport.latestSnapshot?.data.promptHistories)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ uuid: 'real-history-initial' })
      ]))

    const partialData = cloneData(completeData) as any
    delete partialData.promptHistories
    const brokenDeviceDatabase = new MutableSyncDatabase(emptyDataSet())
    brokenDeviceDatabase.data = partialData
    const brokenDevice = createSyncService(client, brokenDeviceDatabase, new MemoryStorage(), 'device-broken')

    const result = await brokenDevice.syncNow(storageId, {
      deviceName: 'Broken Export Device',
      platform: 'web',
      reason: 'manual'
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('本机同步数据导出不完整')
    expect(result.error).toContain('snapshot data missing collection promptHistories')
    expect(brokenDeviceDatabase.replaceAllData).not.toHaveBeenCalled()

    const manifestAfterPartialExport = await client.getCloudSyncManifest(storageId)
    const snapshotsAfterPartialExport = await client.listCloudSyncSnapshots(storageId)
    expect(manifestAfterPartialExport.latestSnapshot?.revision)
      .toBe(manifestBeforePartialExport.latestSnapshot?.revision)
    expect(snapshotsAfterPartialExport).toHaveLength(snapshotsBeforePartialExport.length)
    expect(manifestAfterPartialExport.latestSnapshot?.data.promptHistories)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ uuid: 'real-history-initial' })
      ]))
  })

  it('本机导出出现重复记录键时不会上传脏数据覆盖云端', async () => {
    const storageId = 'robust-local-duplicate-export-rejected'
    const client = createWebDAVSyncClient(storageId)
    const completeData = createRealisticDataSet()
    const deviceADatabase = new MutableSyncDatabase(completeData)
    const deviceA = createSyncService(client, deviceADatabase, new MemoryStorage(), 'device-a')

    const firstUpload = await deviceA.syncNow(storageId, {
      deviceName: 'Laptop A',
      platform: 'electron',
      reason: 'manual'
    })
    expect(firstUpload).toMatchObject({ success: true, action: 'uploaded' })
    const manifestBeforeDuplicateExport = await client.getCloudSyncManifest(storageId)
    const snapshotsBeforeDuplicateExport = await client.listCloudSyncSnapshots(storageId)
    expect(manifestBeforeDuplicateExport.latestSnapshot?.data.prompts)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({
          uuid: 'real-prompt-launch',
          title: '发布计划提示词',
          imageBlobs: [INITIAL_IMAGE]
        })
      ]))

    const duplicateData = mutateDataSet(completeData, data => {
      data.prompts!.push({
        ...data.prompts![0],
        id: 999,
        title: '重复 UUID 的脏数据不应覆盖云端',
        imageBlobs: [UPDATED_IMAGE],
        updatedAt: '2026-06-13T15:30:00.000Z'
      })
    })
    const brokenDeviceDatabase = new MutableSyncDatabase(duplicateData)
    const brokenDevice = createSyncService(client, brokenDeviceDatabase, new MemoryStorage(), 'device-broken')

    const result = await brokenDevice.syncNow(storageId, {
      deviceName: 'Broken Duplicate Export Device',
      platform: 'web',
      reason: 'manual'
    })

    expect(result.success).toBe(false)
    expect(result.error).toContain('本机同步数据导出不完整')
    expect(result.error).toContain('snapshot data prompts has duplicate record key uuid:real-prompt-launch')
    expect(brokenDeviceDatabase.replaceAllData).not.toHaveBeenCalled()

    const manifestAfterDuplicateExport = await client.getCloudSyncManifest(storageId)
    const snapshotsAfterDuplicateExport = await client.listCloudSyncSnapshots(storageId)
    expect(manifestAfterDuplicateExport.latestSnapshot?.revision)
      .toBe(manifestBeforeDuplicateExport.latestSnapshot?.revision)
    expect(snapshotsAfterDuplicateExport).toHaveLength(snapshotsBeforeDuplicateExport.length)
    expect(manifestAfterDuplicateExport.latestSnapshot?.data.prompts)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({
          uuid: 'real-prompt-launch',
          title: '发布计划提示词',
          imageBlobs: [INITIAL_IMAGE]
        })
      ]))
  })

  it('保存 manifest 前另一端抢先更新时会自动重读并合并后成功', async () => {
    const storageId = 'robust-remote-changes-during-save'
    const baseClient = createWebDAVSyncClient(storageId)
    const initialData = createDataSet({ promptTitle: 'Base prompt' })
    const deviceADatabase = new MutableSyncDatabase(initialData)
    const deviceBDatabase = new MutableSyncDatabase(emptyDataSet())
    const deviceB = createSyncService(baseClient, deviceBDatabase, new MemoryStorage(), 'device-b')
    const deviceAStorage = new MemoryStorage()

    const deviceAInitial = createSyncService(baseClient, deviceADatabase, deviceAStorage, 'device-a')
    expect((await deviceAInitial.syncNow(storageId, { platform: 'electron' })).success).toBe(true)
    expect((await deviceB.syncNow(storageId, { platform: 'electron' })).action).toBe('downloaded')

    deviceADatabase.data = mutateDataSet(deviceADatabase.data, data => {
      data.categories![0].name = 'A local category'
      data.categories![0].updatedAt = '2026-06-13T11:00:00.000Z'
    })
    deviceBDatabase.data = mutateDataSet(deviceBDatabase.data, data => {
      data.prompts![0].title = 'B remote prompt'
      data.prompts![0].updatedAt = '2026-06-13T11:01:00.000Z'
    })

    let injectedRemoteChange = false
    const racingClient = createWebDAVSyncClient(storageId, {
      saveCloudSyncManifest: async (_context, saveNormally) => {
        if (!injectedRemoteChange) {
          injectedRemoteChange = true
          const remoteResult = await deviceB.syncNow(storageId, {
            deviceName: 'Desktop B',
            platform: 'electron',
            reason: 'manual'
          })
          expect(remoteResult).toMatchObject({ success: true, action: 'uploaded' })
        }

        return saveNormally()
      }
    })
    const racingDeviceA = createSyncService(racingClient, deviceADatabase, deviceAStorage, 'device-a')

    const result = await racingDeviceA.syncNow(storageId, {
      deviceName: 'Laptop A',
      platform: 'electron',
      reason: 'manual'
    })

    expect(result.success, JSON.stringify(result, null, 2)).toBe(true)
    expect(result.action).toBe('merged')
    expect(result.error).toBeUndefined()

    const manifest = await baseClient.getCloudSyncManifest(storageId)
    expect(manifest.latestSnapshot?.data.categories).toEqual(expect.arrayContaining([
      expect.objectContaining({ uuid: 'cat-main', name: 'A local category' })
    ]))
    expect(manifest.latestSnapshot?.data.prompts).toEqual(expect.arrayContaining([
      expect.objectContaining({ uuid: 'prompt-main', title: 'B remote prompt' })
    ]))
  })

  it('本机已应用合并数据后云端又更新时会继续自动重试并收敛', async () => {
    const storageId = 'robust-remote-changes-after-local-apply'
    const baseClient = createWebDAVSyncClient(storageId)
    const initialData = createDataSet({ promptTitle: 'Apply conflict base', settingValue: 'base-dark' })
    const deviceAStorage = new MemoryStorage()
    const deviceADatabase = new MutableSyncDatabase(initialData)
    const deviceAInitial = createSyncService(baseClient, deviceADatabase, deviceAStorage, 'device-a')
    expect(await deviceAInitial.syncNow(storageId, {
      deviceName: 'Laptop A',
      platform: 'electron',
      reason: 'manual'
    })).toMatchObject({ success: true, action: 'uploaded' })

    const deviceBDatabase = new MutableSyncDatabase(emptyDataSet())
    const deviceB = createSyncService(baseClient, deviceBDatabase, new MemoryStorage(), 'device-b')
    expect(await deviceB.syncNow(storageId, {
      deviceName: 'Desktop B',
      platform: 'electron',
      reason: 'manual'
    })).toMatchObject({ success: true, action: 'downloaded' })

    const deviceCDatabase = new MutableSyncDatabase(emptyDataSet())
    const deviceC = createSyncService(baseClient, deviceCDatabase, new MemoryStorage(), 'device-c')
    expect(await deviceC.syncNow(storageId, {
      deviceName: 'Tablet C',
      platform: 'web',
      reason: 'manual'
    })).toMatchObject({ success: true, action: 'downloaded' })

    deviceBDatabase.data = mutateDataSet(deviceBDatabase.data, data => {
      data.prompts![0].title = 'B remote prompt before A upload'
      data.prompts![0].updatedAt = '2026-06-13T11:10:00.000Z'
    })
    expect(await deviceB.syncNow(storageId, {
      deviceName: 'Desktop B',
      platform: 'electron',
      reason: 'manual'
    })).toMatchObject({ success: true, action: 'uploaded' })

    deviceADatabase.data = mutateDataSet(deviceADatabase.data, data => {
      data.categories![0].name = 'A category applied before upload conflict'
      data.categories![0].updatedAt = '2026-06-13T11:11:00.000Z'
    })
    deviceCDatabase.data = mutateDataSet(deviceCDatabase.data, data => {
      data.settings = [{
        key: 'theme',
        value: 'remote-c-light',
        type: 'string',
        updatedAt: '2026-06-13T11:12:00.000Z'
      }]
    })

    let injectedRemoteChange = false
    const racingClient = createWebDAVSyncClient(storageId, {
      saveCloudSyncManifest: async (_context, saveNormally) => {
        if (!injectedRemoteChange) {
          injectedRemoteChange = true
          expect(deviceADatabase.data.prompts).toEqual(expect.arrayContaining([
            expect.objectContaining({
              uuid: 'prompt-main',
              title: 'B remote prompt before A upload'
            })
          ]))
          expect(deviceADatabase.data.categories).toEqual(expect.arrayContaining([
            expect.objectContaining({
              uuid: 'cat-main',
              name: 'A category applied before upload conflict'
            })
          ]))

          const remoteResult = await deviceC.syncNow(storageId, {
            deviceName: 'Tablet C',
            platform: 'web',
            reason: 'manual'
          })
          expect(remoteResult, JSON.stringify(remoteResult, null, 2))
            .toMatchObject({ success: true, action: 'merged' })
        }

        return saveNormally()
      }
    })
    const racingDeviceA = createSyncService(racingClient, deviceADatabase, deviceAStorage, 'device-a')

    const result = await racingDeviceA.syncNow(storageId, {
      deviceName: 'Laptop A',
      platform: 'electron',
      reason: 'manual'
    })

    expect(result, JSON.stringify(result, null, 2)).toMatchObject({
      success: true,
      action: 'merged',
      appliedLocal: true,
      uploadedRemote: true
    })
    expect(result.error).toBeUndefined()
    expect(injectedRemoteChange).toBe(true)
    expect(deviceADatabase.replaceAllData).toHaveBeenCalledTimes(2)

    expect(deviceADatabase.data.categories).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uuid: 'cat-main',
        name: 'A category applied before upload conflict'
      })
    ]))
    expect(deviceADatabase.data.prompts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uuid: 'prompt-main',
        title: 'B remote prompt before A upload'
      })
    ]))
    expect(deviceADatabase.data.settings).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'theme', value: 'remote-c-light' })
    ]))

    const manifest = await baseClient.getCloudSyncManifest(storageId)
    expect(manifest.latestSnapshot?.data.categories).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uuid: 'cat-main',
        name: 'A category applied before upload conflict'
      })
    ]))
    expect(manifest.latestSnapshot?.data.prompts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uuid: 'prompt-main',
        title: 'B remote prompt before A upload'
      })
    ]))
    expect(manifest.latestSnapshot?.data.settings).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'theme', value: 'remote-c-light' })
    ]))
    expect(manifest.latestSnapshot?.dataChecksum)
      .toBe(createCloudSyncDataChecksum(manifest.latestSnapshot!.data))

    const retryClick = await racingDeviceA.syncNow(storageId, {
      deviceName: 'Laptop A',
      platform: 'electron',
      reason: 'manual'
    })
    expect(retryClick).toMatchObject({ success: true, action: 'noop' })
  })

  it('同步到一半只写入 snapshot 时，下次启动能从快照文件恢复 manifest', async () => {
    const storageId = 'robust-half-written-sync'
    let failManifestWrite = true
    const failingClient = createWebDAVSyncClient(storageId, {
      saveCloudSyncManifest: async (_context, saveNormally) => {
        if (failManifestWrite) {
          failManifestWrite = false
          return { success: false, error: 'HTTP 500 while saving manifest' }
        }

        return saveNormally()
      }
    })
    const data = createDataSet({ promptTitle: 'Half written prompt' })
    const firstDatabase = new MutableSyncDatabase(data)
    const firstDevice = createSyncService(failingClient, firstDatabase, new MemoryStorage(), 'device-half')

    const failed = await firstDevice.syncNow(storageId, {
      deviceName: 'Half Device',
      platform: 'electron',
      reason: 'manual'
    })
    expect(failed.success).toBe(false)
    expect(failed.error).toContain('HTTP 500')

    const normalClient = createWebDAVSyncClient(storageId)
    expect(await normalClient.listCloudSyncSnapshots(storageId)).toHaveLength(1)
    expect((await normalClient.getCloudSyncManifest(storageId)).latestSnapshot).toBeUndefined()

    const restartedDevice = createSyncService(
      normalClient,
      new MutableSyncDatabase(data),
      new MemoryStorage(),
      'device-half'
    )
    const recovered = await restartedDevice.syncNow(storageId, {
      deviceName: 'Half Device Restarted',
      platform: 'electron',
      reason: 'manual'
    })
    expect(recovered.success).toBe(true)
    expect(recovered.error).toBeUndefined()

    const manifest = await normalClient.getCloudSyncManifest(storageId)
    expect(manifest.latestSnapshot?.data.prompts).toEqual(expect.arrayContaining([
      expect.objectContaining({ uuid: 'prompt-main', title: 'Half written prompt' })
    ]))
  })

  it('服务端保存 snapshot 失败时不会写 manifest 或本地状态，恢复后可完整重试', async () => {
    const storageId = 'robust-snapshot-save-fails-before-manifest'
    const client = createWebDAVSyncClient(storageId)
    const database = new MutableSyncDatabase(createRealisticDataSet())
    const storage = new MemoryStorage()
    const service = createSyncService(client, database, storage, 'device-snapshot-fail')
    const saveSnapshotSpy = vi.spyOn(client, 'saveCloudSyncSnapshot')
      .mockResolvedValueOnce({
        success: false,
        error: 'HTTP 507 simulated WebDAV snapshot write failure'
      })

    const failed = await service.syncNow(storageId, {
      deviceName: 'Laptop Snapshot Fail',
      platform: 'electron',
      reason: 'manual'
    })

    expect(failed.success).toBe(false)
    expect(failed.error).toContain('HTTP 507')
    expect(await client.listCloudSyncSnapshots(storageId)).toHaveLength(0)
    expect((await client.getCloudSyncManifest(storageId)).latestSnapshot).toBeUndefined()
    expect(storage.getItem(`ai_gist_cloud_sync_state:${storageId}`)).toBeNull()
    expect(database.replaceAllData).not.toHaveBeenCalled()

    saveSnapshotSpy.mockRestore()
    const retried = await service.syncNow(storageId, {
      deviceName: 'Laptop Snapshot Fail',
      platform: 'electron',
      reason: 'manual'
    })

    expect(retried, JSON.stringify(retried, null, 2)).toMatchObject({
      success: true,
      action: 'uploaded',
      uploadedRemote: true,
      appliedLocal: false
    })
    const manifest = await client.getCloudSyncManifest(storageId)
    expect(manifest.latestSnapshot?.revision).toBe(retried.remoteRevision)
    expect(manifest.latestSnapshot?.data.prompts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uuid: 'real-prompt-launch',
        imageBlobs: [INITIAL_IMAGE]
      })
    ]))
    expect(manifest.latestSnapshot?.data.promptHistories).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uuid: 'real-history-initial',
        imageBlobs: [INITIAL_IMAGE]
      })
    ]))
    expect(storage.getItem(`ai_gist_cloud_sync_state:${storageId}`))
      .toContain(retried.remoteRevision)
    expect(await client.listCloudSyncSnapshots(storageId)).toHaveLength(1)

    const repeatedClick = await service.syncNow(storageId, {
      deviceName: 'Laptop Snapshot Fail',
      platform: 'electron',
      reason: 'manual'
    })
    expect(repeatedClick).toMatchObject({ success: true, action: 'noop' })
    expect(await client.listCloudSyncSnapshots(storageId)).toHaveLength(1)
  })

  it('云端已上传但本地同步状态未保存时，下次启动只补状态不会重复上传', async () => {
    const storageId = 'robust-uploaded-state-lost-before-close'
    const client = createWebDAVSyncClient(storageId)
    const database = new MutableSyncDatabase(createRealisticDataSet())
    const storage = new MemoryStorage()
    let failLocalStateSave = true
    const storageSetSpy = vi.spyOn(storage, 'setItem')
      .mockImplementation((key: string, value: string) => {
        if (failLocalStateSave && key.startsWith('ai_gist_cloud_sync_state:')) {
          throw new Error('simulated app close before local sync state persisted')
        }

        MemoryStorage.prototype.setItem.call(storage, key, value)
      })
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const firstDevice = createSyncService(client, database, storage, 'device-state-lost')

    try {
      const uploaded = await firstDevice.syncNow(storageId, {
        deviceName: 'Laptop State Lost',
        platform: 'electron',
        reason: 'manual'
      })

      expect(uploaded, JSON.stringify(uploaded, null, 2)).toMatchObject({
        success: true,
        action: 'uploaded',
        uploadedRemote: true,
        appliedLocal: false
      })
      expect(storage.getItem(`ai_gist_cloud_sync_state:${storageId}`)).toBeNull()
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('完整本地同步基线保存失败')
      )
    } finally {
      warnSpy.mockRestore()
    }

    const manifestAfterUpload = await client.getCloudSyncManifest(storageId)
    const snapshotsAfterUpload = await client.listCloudSyncSnapshots(storageId)
    expect(snapshotsAfterUpload).toHaveLength(1)
    expect(manifestAfterUpload.latestSnapshot?.data.prompts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uuid: 'real-prompt-launch',
        title: '发布计划提示词',
        imageBlobs: [INITIAL_IMAGE]
      })
    ]))

    failLocalStateSave = false
    const restartedDevice = createSyncService(client, database, storage, 'device-state-lost')
    const recovered = await restartedDevice.syncNow(storageId, {
      deviceName: 'Laptop State Lost Restarted',
      platform: 'electron',
      reason: 'manual'
    })

    expect(recovered, JSON.stringify(recovered, null, 2)).toMatchObject({
      success: true,
      action: 'noop',
      uploadedRemote: false,
      appliedLocal: false
    })
    expect(database.replaceAllData).not.toHaveBeenCalled()
    expect(storage.getItem(`ai_gist_cloud_sync_state:${storageId}`))
      .toContain(manifestAfterUpload.latestSnapshot?.revision)
    expect(await client.listCloudSyncSnapshots(storageId)).toHaveLength(snapshotsAfterUpload.length)

    const repeatedClick = await restartedDevice.syncNow(storageId, {
      deviceName: 'Laptop State Lost Restarted',
      platform: 'electron',
      reason: 'manual'
    })
    expect(repeatedClick).toMatchObject({ success: true, action: 'noop' })
    expect(await client.listCloudSyncSnapshots(storageId)).toHaveLength(snapshotsAfterUpload.length)

    storageSetSpy.mockRestore()
  })

  it('主 manifest 损坏但备份可用时会从备份继续同步并修复主文件', async () => {
    const storageId = 'robust-primary-manifest-corrupt-backup-valid'
    const client = createWebDAVSyncClient(storageId)
    const deviceADatabase = new MutableSyncDatabase(createRealisticDataSet())
    const deviceA = createSyncService(client, deviceADatabase, new MemoryStorage(), 'device-a')

    const firstUpload = await deviceA.syncNow(storageId, {
      deviceName: 'Laptop A',
      platform: 'electron',
      reason: 'manual'
    })
    expect(firstUpload).toMatchObject({ success: true, action: 'uploaded' })
    const manifestBeforeCorruption = await client.getCloudSyncManifest(storageId)
    await corruptRemoteFile(storageId, getCloudSyncManifestPath(), '{"kind":')

    const deviceBDatabase = new MutableSyncDatabase(emptyDataSet())
    const deviceB = createSyncService(client, deviceBDatabase, new MemoryStorage(), 'device-b')
    const fallbackDownload = await deviceB.syncNow(storageId, {
      deviceName: 'Desktop B',
      platform: 'electron',
      reason: 'manual'
    })

    expect(fallbackDownload, JSON.stringify(fallbackDownload, null, 2))
      .toMatchObject({ success: true, action: 'downloaded' })
    expect(fallbackDownload.remoteRevision)
      .toBe(manifestBeforeCorruption.latestSnapshot?.revision)
    expect(deviceBDatabase.data.prompts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uuid: 'real-prompt-launch',
        title: '发布计划提示词',
        imageBlobs: [INITIAL_IMAGE]
      })
    ]))
    expect(deviceBDatabase.data.promptHistories).toEqual(expect.arrayContaining([
      expect.objectContaining({ uuid: 'real-history-initial', imageBlobs: [INITIAL_IMAGE] })
    ]))
    expect(deviceBDatabase.data.settings).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'theme', value: 'dark' })
    ]))

    deviceBDatabase.data = mutateDataSet(deviceBDatabase.data, data => {
      data.prompts![0].title = '备份 manifest 恢复后的桌面端更新'
      data.prompts![0].imageBlobs = [INITIAL_IMAGE, UPDATED_IMAGE]
      data.prompts![0].updatedAt = '2026-06-13T23:20:00.000Z'
      data.promptHistories!.push({
        id: 73,
        uuid: 'real-history-after-backup-manifest-recovery',
        promptId: 31,
        promptUuid: 'real-prompt-launch',
        title: '备份 manifest 恢复后的桌面端更新',
        content: '主 manifest 损坏后继续生成',
        result: 'Recovered from backup manifest',
        version: 2,
        imageBlobs: [UPDATED_IMAGE],
        createdAt: '2026-06-13T23:21:00.000Z',
        updatedAt: '2026-06-13T23:21:00.000Z'
      })
      data.settings = [{
        key: 'theme',
        value: 'backup-recovered-light',
        type: 'string',
        updatedAt: '2026-06-13T23:22:00.000Z'
      }]
    })
    const recoveredUpload = await deviceB.syncNow(storageId, {
      deviceName: 'Desktop B',
      platform: 'electron',
      reason: 'manual'
    })

    expect(recoveredUpload, JSON.stringify(recoveredUpload, null, 2))
      .toMatchObject({ success: true, action: 'uploaded' })
    const primaryManifest = await readRemoteManifestFile(storageId, getCloudSyncManifestPath())
    expect(primaryManifest.latestSnapshot?.revision).toBe(recoveredUpload.remoteRevision)
    expect(primaryManifest.latestSnapshot?.data.prompts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uuid: 'real-prompt-launch',
        title: '备份 manifest 恢复后的桌面端更新',
        imageBlobs: [INITIAL_IMAGE, UPDATED_IMAGE]
      })
    ]))
    expect(primaryManifest.latestSnapshot?.data.promptHistories).toEqual(expect.arrayContaining([
      expect.objectContaining({ uuid: 'real-history-initial', imageBlobs: [INITIAL_IMAGE] }),
      expect.objectContaining({
        uuid: 'real-history-after-backup-manifest-recovery',
        imageBlobs: [UPDATED_IMAGE]
      })
    ]))
    expect(primaryManifest.latestSnapshot?.data.settings).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'theme', value: 'backup-recovered-light' })
    ]))
    expect(primaryManifest.latestSnapshot?.dataChecksum)
      .toBe(createCloudSyncDataChecksum(primaryManifest.latestSnapshot!.data))

    const finalNoop = await deviceB.syncNow(storageId, {
      deviceName: 'Desktop B',
      platform: 'electron',
      reason: 'manual'
    })
    expect(finalNoop).toMatchObject({ success: true, action: 'noop' })
  })

  it('主 manifest 可读但落后备份时会选择较新备份并修复主文件', async () => {
    const storageId = 'robust-primary-manifest-stale-backup-newer'
    const client = createWebDAVSyncClient(storageId)
    const deviceADatabase = new MutableSyncDatabase(createRealisticDataSet())
    const deviceA = createSyncService(client, deviceADatabase, new MemoryStorage(), 'device-a')

    const firstUpload = await deviceA.syncNow(storageId, {
      deviceName: 'Laptop A',
      platform: 'electron',
      reason: 'manual'
    })
    expect(firstUpload).toMatchObject({ success: true, action: 'uploaded' })
    const stalePrimaryManifest = await client.getCloudSyncManifest(storageId)

    await new Promise(resolve => setTimeout(resolve, 20))
    deviceADatabase.data = mutateDataSet(deviceADatabase.data, data => {
      data.prompts![0].title = '较新备份 manifest 中的标题'
      data.prompts![0].imageBlobs = [INITIAL_IMAGE, UPDATED_IMAGE]
      data.prompts![0].updatedAt = '2026-06-13T23:30:00.000Z'
      data.promptHistories!.push({
        id: 74,
        uuid: 'real-history-newer-backup-manifest',
        promptId: 31,
        promptUuid: 'real-prompt-launch',
        title: '较新备份 manifest 中的标题',
        content: 'primary manifest 回滚后 backup 仍然较新',
        result: 'Newer data from backup manifest',
        version: 2,
        imageBlobs: [UPDATED_IMAGE],
        createdAt: '2026-06-13T23:31:00.000Z',
        updatedAt: '2026-06-13T23:31:00.000Z'
      })
      data.settings = [{
        key: 'theme',
        value: 'backup-newer-theme',
        type: 'string',
        updatedAt: '2026-06-13T23:32:00.000Z'
      }]
    })
    const newerUpload = await deviceA.syncNow(storageId, {
      deviceName: 'Laptop A',
      platform: 'electron',
      reason: 'manual'
    })
    expect(newerUpload).toMatchObject({ success: true, action: 'uploaded' })
    const newerBackupManifest = await client.getCloudSyncManifest(storageId)
    expect(newerBackupManifest.latestSnapshot?.revision).toBe(newerUpload.remoteRevision)

    await corruptRemoteFile(
      storageId,
      getCloudSyncManifestPath(),
      JSON.stringify(assertValidCloudSyncManifest(stalePrimaryManifest), null, 2)
    )
    expect((await readRemoteManifestFile(storageId, getCloudSyncManifestPath())).latestSnapshot?.revision)
      .toBe(firstUpload.remoteRevision)

    const deviceBDatabase = new MutableSyncDatabase(emptyDataSet())
    const deviceB = createSyncService(client, deviceBDatabase, new MemoryStorage(), 'device-b')
    const download = await deviceB.syncNow(storageId, {
      deviceName: 'Desktop B',
      platform: 'electron',
      reason: 'manual'
    })

    expect(download, JSON.stringify(download, null, 2))
      .toMatchObject({ success: true, action: 'downloaded' })
    expect(download.remoteRevision).toBe(newerUpload.remoteRevision)
    expect(deviceBDatabase.data.prompts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uuid: 'real-prompt-launch',
        title: '较新备份 manifest 中的标题',
        imageBlobs: [INITIAL_IMAGE, UPDATED_IMAGE]
      })
    ]))
    expect(deviceBDatabase.data.promptHistories).toEqual(expect.arrayContaining([
      expect.objectContaining({ uuid: 'real-history-initial', imageBlobs: [INITIAL_IMAGE] }),
      expect.objectContaining({
        uuid: 'real-history-newer-backup-manifest',
        imageBlobs: [UPDATED_IMAGE]
      })
    ]))
    expect(deviceBDatabase.data.settings).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'theme', value: 'backup-newer-theme' })
    ]))

    deviceBDatabase.data = mutateDataSet(deviceBDatabase.data, data => {
      data.categories![0].name = '读取较新备份后的后续分类更新'
      data.categories![0].updatedAt = '2026-06-13T23:33:00.000Z'
    })
    const repairedUpload = await deviceB.syncNow(storageId, {
      deviceName: 'Desktop B',
      platform: 'electron',
      reason: 'manual'
    })
    expect(repairedUpload, JSON.stringify(repairedUpload, null, 2))
      .toMatchObject({ success: true, action: 'uploaded' })

    const repairedPrimaryManifest = await readRemoteManifestFile(storageId, getCloudSyncManifestPath())
    expect(repairedPrimaryManifest.latestSnapshot?.revision).toBe(repairedUpload.remoteRevision)
    expect(repairedPrimaryManifest.latestSnapshot?.data.categories).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uuid: 'real-category-product',
        name: '读取较新备份后的后续分类更新'
      })
    ]))
    expect(repairedPrimaryManifest.latestSnapshot?.data.prompts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uuid: 'real-prompt-launch',
        title: '较新备份 manifest 中的标题',
        imageBlobs: [INITIAL_IMAGE, UPDATED_IMAGE]
      })
    ]))
    expect(repairedPrimaryManifest.latestSnapshot?.dataChecksum)
      .toBe(createCloudSyncDataChecksum(repairedPrimaryManifest.latestSnapshot!.data))

    const finalNoop = await deviceB.syncNow(storageId, {
      deviceName: 'Desktop B',
      platform: 'electron',
      reason: 'manual'
    })
    expect(finalNoop).toMatchObject({ success: true, action: 'noop' })
  })

  it('manifest 可读时不会把残留的孤立快照误提升为云端最新数据', async () => {
    const storageId = 'robust-readable-manifest-ignores-loose-snapshot'
    const client = createWebDAVSyncClient(storageId)
    const trustedData = createRealisticDataSet()
    const deviceADatabase = new MutableSyncDatabase(trustedData)
    const deviceA = createSyncService(client, deviceADatabase, new MemoryStorage(), 'device-a')

    const firstUpload = await deviceA.syncNow(storageId, {
      deviceName: 'Laptop A',
      platform: 'electron',
      reason: 'manual'
    })
    expect(firstUpload).toMatchObject({ success: true, action: 'uploaded' })
    const manifestBeforeLooseSnapshot = await client.getCloudSyncManifest(storageId)
    expect(manifestBeforeLooseSnapshot.latestSnapshot?.data.prompts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uuid: 'real-prompt-launch',
        title: '发布计划提示词',
        imageBlobs: [INITIAL_IMAGE]
      })
    ]))

    const dangerousLooseData = mutateDataSet(trustedData, data => {
      data.prompts![0].title = '孤立快照里的过期标题不应生效'
      data.prompts![0].imageBlobs = []
      data.prompts![0].updatedAt = '2026-06-13T23:00:00.000Z'
      data.promptHistories = []
      data.settings = [{
        key: 'theme',
        value: 'stale-from-loose-snapshot',
        type: 'string',
        updatedAt: '2026-06-13T23:00:00.000Z'
      }]
    })
    const looseSnapshot = {
      ...createCloudSyncSnapshot(dangerousLooseData, 'abandoned-device', 'loose-snapshot-should-not-win'),
      createdAt: '2026-06-13T23:00:00.000Z'
    }
    expect(await client.saveCloudSyncSnapshot(storageId, looseSnapshot))
      .toMatchObject({ success: true })
    expect(await client.listCloudSyncSnapshots(storageId)).toHaveLength(2)

    const deviceBDatabase = new MutableSyncDatabase(emptyDataSet())
    const deviceB = createSyncService(client, deviceBDatabase, new MemoryStorage(), 'device-b')
    const download = await deviceB.syncNow(storageId, {
      deviceName: 'Desktop B',
      platform: 'electron',
      reason: 'manual'
    })

    expect(download, JSON.stringify(download, null, 2))
      .toMatchObject({ success: true, action: 'downloaded' })
    expect(deviceBDatabase.data.prompts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uuid: 'real-prompt-launch',
        title: '发布计划提示词',
        imageBlobs: [INITIAL_IMAGE]
      })
    ]))
    expect(deviceBDatabase.data.promptHistories).toEqual(expect.arrayContaining([
      expect.objectContaining({ uuid: 'real-history-initial', imageBlobs: [INITIAL_IMAGE] })
    ]))
    expect(deviceBDatabase.data.settings).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'theme', value: 'dark' })
    ]))

    const manifestAfterDownload = await client.getCloudSyncManifest(storageId)
    expect(manifestAfterDownload.latestSnapshot?.revision)
      .toBe(manifestBeforeLooseSnapshot.latestSnapshot?.revision)
    expect(manifestAfterDownload.latestSnapshot?.revision)
      .not.toBe('loose-snapshot-should-not-win')
    expect(manifestAfterDownload.latestSnapshot?.data.promptHistories).toEqual(expect.arrayContaining([
      expect.objectContaining({ uuid: 'real-history-initial', imageBlobs: [INITIAL_IMAGE] })
    ]))

    deviceBDatabase.data = mutateDataSet(deviceBDatabase.data, data => {
      data.prompts![0].title = '可信 manifest 基础上的后续编辑'
      data.prompts![0].updatedAt = '2026-06-13T23:05:00.000Z'
      data.promptHistories!.push({
        id: 86,
        uuid: 'real-history-after-loose-snapshot',
        promptId: 31,
        promptUuid: 'real-prompt-launch',
        title: '可信 manifest 基础上的后续编辑',
        content: '孤立快照未污染后继续生成',
        result: 'Follow-up from trusted manifest',
        version: 2,
        imageBlobs: [UPDATED_IMAGE],
        createdAt: '2026-06-13T23:06:00.000Z',
        updatedAt: '2026-06-13T23:06:00.000Z'
      })
    })
    const uploadAfterLooseSnapshot = await deviceB.syncNow(storageId, {
      deviceName: 'Desktop B',
      platform: 'electron',
      reason: 'manual'
    })
    expect(uploadAfterLooseSnapshot, JSON.stringify(uploadAfterLooseSnapshot, null, 2))
      .toMatchObject({ success: true, action: 'uploaded' })

    const finalManifest = await client.getCloudSyncManifest(storageId)
    expect(finalManifest.latestSnapshot?.revision)
      .toBe(uploadAfterLooseSnapshot.remoteRevision)
    expect(finalManifest.latestSnapshot?.data.prompts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uuid: 'real-prompt-launch',
        title: '可信 manifest 基础上的后续编辑',
        imageBlobs: [INITIAL_IMAGE]
      })
    ]))
    expect(finalManifest.latestSnapshot?.data.promptHistories).toEqual(expect.arrayContaining([
      expect.objectContaining({ uuid: 'real-history-initial', imageBlobs: [INITIAL_IMAGE] }),
      expect.objectContaining({ uuid: 'real-history-after-loose-snapshot', imageBlobs: [UPDATED_IMAGE] })
    ]))
    expect(finalManifest.latestSnapshot?.dataChecksum)
      .toBe(createCloudSyncDataChecksum(finalManifest.latestSnapshot!.data))
  })

  it('manifest 内联快照损坏但同 revision 快照文件完整时会自动修复并下载正确数据', async () => {
    const storageId = 'robust-inline-manifest-drift-repaired-from-snapshot'
    const client = createWebDAVSyncClient(storageId)
    const deviceADatabase = new MutableSyncDatabase(createRealisticDataSet())
    const deviceA = createSyncService(client, deviceADatabase, new MemoryStorage(), 'device-a')

    const firstUpload = await deviceA.syncNow(storageId, {
      deviceName: 'Laptop A',
      platform: 'electron',
      reason: 'manual'
    })
    expect(firstUpload).toMatchObject({ success: true, action: 'uploaded' })
    const manifestBeforeDrift = await client.getCloudSyncManifest(storageId)
    expect(manifestBeforeDrift.latestSnapshot?.revision).toBe(firstUpload.remoteRevision)
    expect(await client.listCloudSyncSnapshots(storageId)).toHaveLength(1)

    const driftedData = mutateDataSet(manifestBeforeDrift.latestSnapshot!.data, data => {
      data.prompts![0].title = 'manifest 内联副本里的错误标题不应生效'
      data.prompts![0].imageBlobs = []
      data.promptHistories = []
      data.aiHistory = []
      data.settings = [{
        key: 'theme',
        value: 'corrupted-inline',
        type: 'string',
        updatedAt: '2026-06-13T23:20:00.000Z'
      }]
    })
    const driftedSnapshot = {
      ...manifestBeforeDrift.latestSnapshot!,
      data: driftedData,
      dataChecksum: createCloudSyncDataChecksum(driftedData)
    }
    const driftedManifest = assertValidCloudSyncManifest({
      ...manifestBeforeDrift,
      updatedAt: '2026-06-13T23:20:00.000Z',
      latestSnapshot: driftedSnapshot
    })
    const driftedManifestContent = JSON.stringify(driftedManifest, null, 2)
    await corruptRemoteFile(storageId, getCloudSyncManifestPath(), driftedManifestContent)
    await corruptRemoteFile(storageId, getCloudSyncManifestBackupPath(), driftedManifestContent)

    const manifestAfterDrift = await client.getCloudSyncManifest(storageId)
    expect(manifestAfterDrift.latestSnapshot?.revision).toBe(firstUpload.remoteRevision)
    expect(manifestAfterDrift.latestSnapshot?.data.prompts).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: 'manifest 内联副本里的错误标题不应生效', imageBlobs: [] })
    ]))

    const deviceBDatabase = new MutableSyncDatabase(emptyDataSet())
    const deviceB = createSyncService(client, deviceBDatabase, new MemoryStorage(), 'device-b')
    const download = await deviceB.syncNow(storageId, {
      deviceName: 'Desktop B',
      platform: 'electron',
      reason: 'manual'
    })

    expect(download, JSON.stringify(download, null, 2))
      .toMatchObject({ success: true, action: 'downloaded' })
    expect(deviceBDatabase.data.prompts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uuid: 'real-prompt-launch',
        title: '发布计划提示词',
        imageBlobs: [INITIAL_IMAGE]
      })
    ]))
    expect(deviceBDatabase.data.promptHistories).toEqual(expect.arrayContaining([
      expect.objectContaining({ uuid: 'real-history-initial', imageBlobs: [INITIAL_IMAGE] })
    ]))
    expect(deviceBDatabase.data.aiHistory).toEqual(expect.arrayContaining([
      expect.objectContaining({ uuid: 'real-ai-history-initial' })
    ]))
    expect(deviceBDatabase.data.settings).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'theme', value: 'dark' })
    ]))

    const repairedManifest = await client.getCloudSyncManifest(storageId)
    expect(repairedManifest.latestSnapshot?.revision).toBe(firstUpload.remoteRevision)
    expect(repairedManifest.latestSnapshot?.data.prompts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uuid: 'real-prompt-launch',
        title: '发布计划提示词',
        imageBlobs: [INITIAL_IMAGE]
      })
    ]))
    expect(repairedManifest.latestSnapshot?.data.promptHistories).toEqual(expect.arrayContaining([
      expect.objectContaining({ uuid: 'real-history-initial', imageBlobs: [INITIAL_IMAGE] })
    ]))
    expect(repairedManifest.latestSnapshot?.dataChecksum)
      .toBe(createCloudSyncDataChecksum(repairedManifest.latestSnapshot!.data))

    deviceBDatabase.data = mutateDataSet(deviceBDatabase.data, data => {
      data.prompts![0].title = '内联副本修复后的继续编辑'
      data.prompts![0].updatedAt = '2026-06-13T23:25:00.000Z'
      data.promptHistories!.push({
        id: 87,
        uuid: 'real-history-after-inline-repair',
        promptId: 31,
        promptUuid: 'real-prompt-launch',
        title: '内联副本修复后的继续编辑',
        content: '修复 manifest 内联副本后继续生成',
        result: 'Inline repair follow-up',
        version: 2,
        imageBlobs: [UPDATED_IMAGE],
        createdAt: '2026-06-13T23:26:00.000Z',
        updatedAt: '2026-06-13T23:26:00.000Z'
      })
    })
    const uploadAfterRepair = await deviceB.syncNow(storageId, {
      deviceName: 'Desktop B',
      platform: 'electron',
      reason: 'manual'
    })
    expect(uploadAfterRepair, JSON.stringify(uploadAfterRepair, null, 2))
      .toMatchObject({ success: true, action: 'uploaded' })

    const finalManifest = await client.getCloudSyncManifest(storageId)
    expect(finalManifest.latestSnapshot?.revision).toBe(uploadAfterRepair.remoteRevision)
    expect(finalManifest.latestSnapshot?.data.prompts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uuid: 'real-prompt-launch',
        title: '内联副本修复后的继续编辑',
        imageBlobs: [INITIAL_IMAGE]
      })
    ]))
    expect(finalManifest.latestSnapshot?.data.promptHistories).toEqual(expect.arrayContaining([
      expect.objectContaining({ uuid: 'real-history-initial', imageBlobs: [INITIAL_IMAGE] }),
      expect.objectContaining({ uuid: 'real-history-after-inline-repair', imageBlobs: [UPDATED_IMAGE] })
    ]))
    expect(finalManifest.latestSnapshot?.dataChecksum)
      .toBe(createCloudSyncDataChecksum(finalManifest.latestSnapshot!.data))
  })

  it('大量数据并发连续点击同步时只生成必要快照且不会反复报错', async () => {
    const storageId = 'robust-large-concurrent-clicks'
    const client = createWebDAVSyncClient(storageId)
    const largeData = createLargeDataSet(600)
    const database = new MutableSyncDatabase(largeData)
    const service = createSyncService(client, database, new MemoryStorage(), 'device-large')

    const concurrentResults = await Promise.all([
      service.syncNow(storageId, { platform: 'electron', reason: 'manual' }),
      service.syncNow(storageId, { platform: 'electron', reason: 'manual' }),
      service.syncNow(storageId, { platform: 'electron', reason: 'manual' }),
      service.syncNow(storageId, { platform: 'electron', reason: 'manual' })
    ])
    expect(concurrentResults.every(result => result.success)).toBe(true)
    expect(new Set(concurrentResults.map(result => result.remoteRevision))).toHaveLength(1)

    const second = await service.syncNow(storageId, { platform: 'electron', reason: 'manual' })
    const third = await service.syncNow(storageId, { platform: 'electron', reason: 'manual' })
    expect(second).toMatchObject({ success: true, action: 'noop' })
    expect(third).toMatchObject({ success: true, action: 'noop' })

    const snapshots = await client.listCloudSyncSnapshots(storageId)
    expect(snapshots).toHaveLength(1)
    const manifest = await client.getCloudSyncManifest(storageId)
    expect(manifest.latestSnapshot?.data.prompts).toHaveLength(600)
    expect(manifest.latestSnapshot?.data.promptVariables).toHaveLength(600)
    expect(manifest.latestSnapshot?.data.promptHistories).toHaveLength(600)
  })

  it('断网或服务端临时错误后再次手动同步能成功且不会改写本地数据', async () => {
    const storageId = 'robust-offline-then-retry'
    let offline = true
    const client = createWebDAVSyncClient(storageId, {
      getCloudSyncManifest: async () => {
        if (offline) {
          throw new Error('ECONNRESET simulated offline')
        }

        return createWebDAVSyncClient(storageId).getCloudSyncManifest(storageId)
      }
    })
    const database = new MutableSyncDatabase(createDataSet({ promptTitle: 'Offline retry prompt' }))
    const service = createSyncService(client, database, new MemoryStorage(), 'device-offline')

    const failed = await service.syncNow(storageId, {
      platform: 'electron',
      reason: 'manual'
    })
    expect(failed.success).toBe(false)
    expect(failed.error).toContain('ECONNRESET')
    expect(database.replaceAllData).not.toHaveBeenCalled()

    offline = false
    const retried = await service.syncNow(storageId, {
      platform: 'electron',
      reason: 'manual'
    })
    expect(retried).toMatchObject({ success: true, action: 'uploaded' })
    expect(retried.error).toBeUndefined()
  })

  it('WebDAV 写入后短暂读到旧状态时会等待一致而不是报错', async () => {
    const storageId = 'robust-read-after-write-stale-webdav'
    const staleManifest = createEmptyCloudSyncManifest('2026-06-13T12:30:00.000Z')
    let staleReadsRemaining = 0
    let staleManifestReads = 0
    let staleSnapshotReads = 0
    let submittedRevision: string | undefined
    const client = createWebDAVSyncClient(storageId, {
      saveCloudSyncManifest: async (context, saveNormally) => {
        const result = await saveNormally()
        if (result.success && context.manifest.latestSnapshot?.revision) {
          submittedRevision = context.manifest.latestSnapshot.revision
          staleReadsRemaining = 2
        }

        return result
      },
      readCloudSyncSnapshot: async (context, readNormally) => {
        const revision = typeof context.snapshot === 'string'
          ? context.snapshot
          : context.snapshot.revision
        if (submittedRevision && revision === submittedRevision && staleReadsRemaining > 0) {
          staleSnapshotReads += 1
          throw new Error('simulated WebDAV eventual consistency snapshot 404')
        }

        return readNormally()
      },
      getCloudSyncManifest: async (_targetStorageId, readNormally) => {
        if (staleReadsRemaining > 0) {
          staleReadsRemaining -= 1
          staleManifestReads += 1
          return staleManifest
        }

        return readNormally()
      }
    })
    const database = new MutableSyncDatabase(createRealisticDataSet())
    const service = createSyncService(client, database, new MemoryStorage(), 'device-stale-read')

    const result = await service.syncNow(storageId, {
      deviceName: 'Laptop Stale Read',
      platform: 'electron',
      reason: 'manual'
    })

    expect(result, JSON.stringify(result, null, 2)).toMatchObject({
      success: true,
      action: 'uploaded',
      uploadedRemote: true
    })
    expect(result.error).toBeUndefined()
    expect(staleManifestReads).toBe(2)
    expect(staleSnapshotReads).toBe(2)

    const manifest = await createWebDAVSyncClient(storageId).getCloudSyncManifest(storageId)
    expect(manifest.latestSnapshot?.revision).toBe(result.remoteRevision)
    expect(manifest.latestSnapshot?.data.prompts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uuid: 'real-prompt-launch',
        imageBlobs: [INITIAL_IMAGE]
      })
    ]))
    expect(manifest.latestSnapshot?.data.promptHistories).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uuid: 'real-history-initial',
        imageBlobs: [INITIAL_IMAGE]
      })
    ]))
    expect(manifest.latestSnapshot?.dataChecksum)
      .toBe(createCloudSyncDataChecksum(manifest.latestSnapshot!.data))

    const retryClick = await service.syncNow(storageId, {
      deviceName: 'Laptop Stale Read',
      platform: 'electron',
      reason: 'manual'
    })
    expect(retryClick).toMatchObject({ success: true, action: 'noop' })
  })

  it('主 manifest 已发布但备份写失败时会自证成功并支持真实更新同步', async () => {
    const storageId = 'robust-primary-manifest-written-backup-fails'
    let failBackupOnce = true
    let primaryManifestWrites = 0
    const client = createWebDAVSyncClient(storageId, {
      afterPrimaryManifestWrite: () => {
        primaryManifestWrites += 1
        if (failBackupOnce) {
          failBackupOnce = false
          throw new Error('HTTP 507 while saving backup manifest')
        }
      }
    })
    const storage = new MemoryStorage()
    const database = new MutableSyncDatabase(createRealisticDataSet())
    const service = createSyncService(client, database, storage, 'device-partial-manifest')

    const firstUpload = await service.syncNow(storageId, {
      deviceName: 'MacBook Primary Manifest',
      platform: 'electron',
      reason: 'manual'
    })
    expect(firstUpload, JSON.stringify(firstUpload, null, 2)).toMatchObject({
      success: true,
      action: 'uploaded',
      uploadedRemote: true
    })
    expect(firstUpload.error).toBeUndefined()
    expect(primaryManifestWrites).toBe(1)
    expect(storage.getItem(`ai_gist_cloud_sync_state:${storageId}`))
      .toContain(firstUpload.remoteRevision)

    const firstManifest = await createWebDAVSyncClient(storageId).getCloudSyncManifest(storageId)
    expect(firstManifest.latestSnapshot?.revision).toBe(firstUpload.remoteRevision)
    expect(firstManifest.latestSnapshot?.data.prompts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uuid: 'real-prompt-launch',
        title: '发布计划提示词',
        imageBlobs: [INITIAL_IMAGE]
      })
    ]))
    expect(firstManifest.latestSnapshot?.data.promptHistories).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uuid: 'real-history-initial',
        imageBlobs: [INITIAL_IMAGE]
      })
    ]))

    database.data = mutateDataSet(database.data, data => {
      data.prompts![0].title = '发布计划提示词 - 第二版'
      data.prompts![0].tags = ['release', 'webdav', 'updated']
      data.prompts![0].imageBlobs = [INITIAL_IMAGE, UPDATED_IMAGE]
      data.prompts![0].useCount = 4
      data.prompts![0].updatedAt = '2026-06-13T15:10:00.000Z'
      data.promptHistories!.push({
        id: 88,
        uuid: 'real-history-after-partial-manifest',
        promptId: 31,
        promptUuid: 'real-prompt-launch',
        title: '发布计划提示词 - 第二版',
        content: '第二次生成发布计划',
        result: 'Updated launch plan',
        version: 2,
        imageBlobs: [UPDATED_IMAGE],
        createdAt: '2026-06-13T15:11:00.000Z',
        updatedAt: '2026-06-13T15:11:00.000Z'
      })
      data.aiHistory!.push({
        id: 89,
        uuid: 'real-ai-history-after-partial-manifest',
        promptUuid: 'real-prompt-launch',
        input: '生成第二版发布计划',
        output: '第二版发布计划结果',
        provider: 'openai',
        model: 'gpt-4.1',
        createdAt: '2026-06-13T15:12:00.000Z',
        updatedAt: '2026-06-13T15:12:00.000Z'
      })
      data.settings = [
        ...data.settings!.filter(setting => setting.key !== 'theme'),
        {
          key: 'theme',
          value: 'system',
          type: 'string',
          updatedAt: '2026-06-13T15:13:00.000Z'
        }
      ]
    })

    const secondUpload = await service.syncNow(storageId, {
      deviceName: 'MacBook Primary Manifest',
      platform: 'electron',
      reason: 'manual'
    })
    expect(secondUpload, JSON.stringify(secondUpload, null, 2)).toMatchObject({
      success: true,
      action: 'uploaded',
      uploadedRemote: true
    })
    expect(secondUpload.error).toBeUndefined()
    expect(secondUpload.remoteRevision).not.toBe(firstUpload.remoteRevision)
    expect(primaryManifestWrites).toBe(2)

    const repeatedClick = await service.syncNow(storageId, {
      deviceName: 'MacBook Primary Manifest',
      platform: 'electron',
      reason: 'manual'
    })
    expect(repeatedClick).toMatchObject({ success: true, action: 'noop' })
    expect(repeatedClick.error).toBeUndefined()

    const finalManifest = await createWebDAVSyncClient(storageId).getCloudSyncManifest(storageId)
    expect(finalManifest.latestSnapshot?.revision).toBe(secondUpload.remoteRevision)
    expect(finalManifest.latestSnapshot?.data.prompts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uuid: 'real-prompt-launch',
        title: '发布计划提示词 - 第二版',
        imageBlobs: [INITIAL_IMAGE, UPDATED_IMAGE]
      })
    ]))
    expect(finalManifest.latestSnapshot?.data.promptHistories).toEqual(expect.arrayContaining([
      expect.objectContaining({ uuid: 'real-history-initial', imageBlobs: [INITIAL_IMAGE] }),
      expect.objectContaining({ uuid: 'real-history-after-partial-manifest', imageBlobs: [UPDATED_IMAGE] })
    ]))
    expect(finalManifest.latestSnapshot?.data.aiHistory).toEqual(expect.arrayContaining([
      expect.objectContaining({ uuid: 'real-ai-history-initial' }),
      expect.objectContaining({ uuid: 'real-ai-history-after-partial-manifest' })
    ]))
    expect(finalManifest.latestSnapshot?.data.settings).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'theme', value: 'system' })
    ]))
    expect(finalManifest.latestSnapshot?.dataChecksum)
      .toBe(createCloudSyncDataChecksum(finalManifest.latestSnapshot!.data))

    const snapshots = await client.listCloudSyncSnapshots(storageId)
    expect(snapshots).toHaveLength(2)

    const newDeviceDatabase = new MutableSyncDatabase(emptyDataSet())
    const newDevice = createSyncService(
      createWebDAVSyncClient(storageId),
      newDeviceDatabase,
      new MemoryStorage(),
      'device-after-partial-manifest'
    )
    const downloaded = await newDevice.syncNow(storageId, {
      deviceName: 'iPhone New Device',
      platform: 'ios',
      reason: 'manual'
    })
    expect(downloaded, JSON.stringify(downloaded, null, 2)).toMatchObject({
      success: true,
      action: 'downloaded',
      appliedLocal: true
    })
    expect(newDeviceDatabase.data.prompts).toEqual(finalManifest.latestSnapshot?.data.prompts)
    expect(newDeviceDatabase.data.promptHistories).toEqual(finalManifest.latestSnapshot?.data.promptHistories)
    expect(newDeviceDatabase.data.aiHistory).toEqual(finalManifest.latestSnapshot?.data.aiHistory)
  })

  it('服务端误报 manifest 保存成功但指针未发布时会立即补写并继续更新', async () => {
    const storageId = 'robust-manifest-success-without-pointer'
    let skipFirstManifestWrite = true
    let manifestSaveAttempts = 0
    const client = createWebDAVSyncClient(storageId, {
      saveCloudSyncManifest: async (_context, saveNormally) => {
        manifestSaveAttempts += 1
        if (skipFirstManifestWrite) {
          skipFirstManifestWrite = false
          return { success: true }
        }

        return saveNormally()
      }
    })
    const storage = new MemoryStorage()
    const database = new MutableSyncDatabase(createRealisticDataSet())
    const service = createSyncService(client, database, storage, 'device-pointer-retry')

    const firstUpload = await service.syncNow(storageId, {
      deviceName: 'MacBook Pointer Retry',
      platform: 'electron',
      reason: 'manual'
    })
    expect(firstUpload, JSON.stringify(firstUpload, null, 2)).toMatchObject({
      success: true,
      action: 'uploaded',
      uploadedRemote: true
    })
    expect(firstUpload.error).toBeUndefined()
    expect(manifestSaveAttempts).toBe(2)
    expect(storage.getItem(`ai_gist_cloud_sync_state:${storageId}`))
      .toContain(firstUpload.remoteRevision)

    const firstManifest = await createWebDAVSyncClient(storageId).getCloudSyncManifest(storageId)
    expect(firstManifest.latestSnapshot?.revision).toBe(firstUpload.remoteRevision)
    expect(firstManifest.latestSnapshot?.data.prompts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uuid: 'real-prompt-launch',
        title: '发布计划提示词',
        imageBlobs: [INITIAL_IMAGE]
      })
    ]))
    expect(firstManifest.latestSnapshot?.data.promptHistories).toEqual(expect.arrayContaining([
      expect.objectContaining({ uuid: 'real-history-initial', imageBlobs: [INITIAL_IMAGE] })
    ]))

    database.data = mutateDataSet(database.data, data => {
      data.prompts![0].title = '发布计划提示词 - 指针补写后更新'
      data.prompts![0].imageBlobs = [INITIAL_IMAGE, UPDATED_IMAGE]
      data.prompts![0].updatedAt = '2026-06-13T16:10:00.000Z'
      data.promptHistories!.push({
        id: 90,
        uuid: 'real-history-after-pointer-retry',
        promptId: 31,
        promptUuid: 'real-prompt-launch',
        title: '发布计划提示词 - 指针补写后更新',
        content: '指针补写后的真实更新',
        result: 'Pointer retry follow-up',
        version: 2,
        imageBlobs: [UPDATED_IMAGE],
        createdAt: '2026-06-13T16:11:00.000Z',
        updatedAt: '2026-06-13T16:11:00.000Z'
      })
    })

    const secondUpload = await service.syncNow(storageId, {
      deviceName: 'MacBook Pointer Retry',
      platform: 'electron',
      reason: 'manual'
    })
    expect(secondUpload, JSON.stringify(secondUpload, null, 2)).toMatchObject({
      success: true,
      action: 'uploaded',
      uploadedRemote: true
    })
    expect(secondUpload.error).toBeUndefined()
    expect(secondUpload.remoteRevision).not.toBe(firstUpload.remoteRevision)

    const repeatedClick = await service.syncNow(storageId, {
      deviceName: 'MacBook Pointer Retry',
      platform: 'electron',
      reason: 'manual'
    })
    expect(repeatedClick).toMatchObject({ success: true, action: 'noop' })
    expect(repeatedClick.error).toBeUndefined()

    const finalManifest = await createWebDAVSyncClient(storageId).getCloudSyncManifest(storageId)
    expect(finalManifest.latestSnapshot?.revision).toBe(secondUpload.remoteRevision)
    expect(finalManifest.latestSnapshot?.data.prompts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uuid: 'real-prompt-launch',
        title: '发布计划提示词 - 指针补写后更新',
        imageBlobs: [INITIAL_IMAGE, UPDATED_IMAGE]
      })
    ]))
    expect(finalManifest.latestSnapshot?.data.promptHistories).toEqual(expect.arrayContaining([
      expect.objectContaining({ uuid: 'real-history-initial', imageBlobs: [INITIAL_IMAGE] }),
      expect.objectContaining({ uuid: 'real-history-after-pointer-retry', imageBlobs: [UPDATED_IMAGE] })
    ]))
    expect(finalManifest.latestSnapshot?.dataChecksum)
      .toBe(createCloudSyncDataChecksum(finalManifest.latestSnapshot!.data))

    const snapshots = await client.listCloudSyncSnapshots(storageId)
    expect(snapshots).toHaveLength(2)
  })

  it('应用远端数据中途失败时会回滚本机数据，下次同步能继续完整下载', async () => {
    const storageId = 'robust-local-apply-rollback'
    const client = createWebDAVSyncClient(storageId)
    const baseData = createDataSet({ promptTitle: 'Rollback base prompt' })
    const deviceADatabase = new MutableSyncDatabase(baseData)
    const deviceAStorage = new MemoryStorage()
    const deviceA = createSyncService(client, deviceADatabase, deviceAStorage, 'device-a')

    const firstSync = await deviceA.syncNow(storageId, {
      deviceName: 'Laptop A',
      platform: 'electron',
      reason: 'manual'
    })
    expect(firstSync).toMatchObject({ success: true, action: 'uploaded' })
    const localBeforeFailedDownload = cloneData(deviceADatabase.data)

    const deviceBDatabase = new MutableSyncDatabase(emptyDataSet())
    const deviceB = createSyncService(client, deviceBDatabase, new MemoryStorage(), 'device-b')
    expect((await deviceB.syncNow(storageId, { platform: 'electron' })).action).toBe('downloaded')

    deviceBDatabase.data = mutateDataSet(deviceBDatabase.data, data => {
      data.prompts![0].title = 'Rollback remote prompt from B'
      data.prompts![0].updatedAt = '2026-06-13T12:00:00.000Z'
      data.promptVariables![0].defaultValue = 'remote value'
      data.promptVariables![0].updatedAt = '2026-06-13T12:00:00.000Z'
      data.promptHistories!.push({
        id: 31,
        uuid: 'history-remote-v2',
        promptId: 10,
        promptUuid: 'prompt-main',
        title: 'Rollback remote prompt from B',
        content: 'Remote v2 history',
        version: 2,
        updatedAt: '2026-06-13T12:00:00.000Z'
      })
      data.settings = [{
        key: 'theme',
        value: 'remote-light',
        type: 'string',
        updatedAt: '2026-06-13T12:00:00.000Z'
      }]
    })
    const bUpload = await deviceB.syncNow(storageId, {
      deviceName: 'Desktop B',
      platform: 'electron',
      reason: 'manual'
    })
    expect(bUpload).toMatchObject({ success: true, action: 'uploaded' })
    const remoteRevisionBeforeFailedDownload = (await client.getCloudSyncManifest(storageId)).latestSnapshot?.revision

    let replaceCalls = 0
    deviceADatabase.replaceAllData.mockImplementation(async (nextData: CloudSyncDataSet) => {
      replaceCalls += 1
      if (replaceCalls === 1) {
        deviceADatabase.data = mutateDataSet(nextData, data => {
          data.promptHistories = []
        })
        return {
          success: false,
          message: 'partial IndexedDB restore failed',
          error: 'partial IndexedDB restore failed'
        }
      }

      deviceADatabase.data = cloneData(nextData)
      return {
        success: true,
        message: 'ok'
      }
    })

    const failedDownload = await deviceA.syncNow(storageId, {
      deviceName: 'Laptop A',
      platform: 'electron',
      reason: 'manual'
    })
    expect(failedDownload.success).toBe(false)
    expect(failedDownload.error).toContain('partial IndexedDB restore failed')
    expect(failedDownload.appliedLocal).toBe(false)
    expect(replaceCalls).toBe(2)
    expect(deviceADatabase.data).toEqual(localBeforeFailedDownload)
    expect((await client.getCloudSyncManifest(storageId)).latestSnapshot?.revision)
      .toBe(remoteRevisionBeforeFailedDownload)
    expect(deviceAStorage.getItem('ai_gist_cloud_sync_state:robust-local-apply-rollback'))
      .toContain(firstSync.remoteRevision)

    deviceADatabase.replaceAllData.mockImplementation(async (nextData: CloudSyncDataSet) => {
      deviceADatabase.data = cloneData(nextData)
      return {
        success: true,
        message: 'ok'
      }
    })

    const retriedDownload = await deviceA.syncNow(storageId, {
      deviceName: 'Laptop A',
      platform: 'electron',
      reason: 'manual',
      forceRetry: true
    })
    expect(retriedDownload, JSON.stringify(retriedDownload, null, 2))
      .toMatchObject({ success: true, action: 'downloaded' })
    expect(deviceADatabase.data.prompts).toEqual(expect.arrayContaining([
      expect.objectContaining({ uuid: 'prompt-main', title: 'Rollback remote prompt from B' })
    ]))
    expect(deviceADatabase.data.promptVariables).toEqual(expect.arrayContaining([
      expect.objectContaining({ uuid: 'var-main', defaultValue: 'remote value' })
    ]))
    expect(deviceADatabase.data.promptHistories).toEqual(expect.arrayContaining([
      expect.objectContaining({ uuid: 'history-main' }),
      expect.objectContaining({ uuid: 'history-remote-v2', promptUuid: 'prompt-main' })
    ]))
    expect(deviceADatabase.data.settings).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'theme', value: 'remote-light' })
    ]))
  })

  it('自动同步遇到临时服务端错误后会自动重试并成功上传', async () => {
    const storageId = 'robust-auto-retry-after-server-error'
    let firstRead = true
    const client = createWebDAVSyncClient(storageId, {
      getCloudSyncManifest: async () => {
        if (firstRead) {
          firstRead = false
          throw new Error('HTTP 503 simulated transient manifest read failure')
        }

        return createWebDAVSyncClient(storageId).getCloudSyncManifest(storageId)
      }
    })
    const database = new MutableSyncDatabase(createDataSet({
      promptTitle: 'Auto retry prompt',
      settingValue: 'auto'
    }))
    const storage = new MemoryStorage()
    const service = createSyncService(client, database, storage, 'device-auto-retry')

    service.startAutoSync({
      enabled: true,
      storageIds: [storageId],
      debounceMs: 0,
      retryMs: 10,
      pollIntervalMs: 0,
      startupDelayMs: 0,
      syncOnStart: false
    })

    try {
      service.scheduleSync('local-change', { storageId, delayMs: 0 })

      await waitForCondition(() => {
        const status = service.getStatus()
        return status.status === 'error' &&
          status.pending &&
          status.failureCount === 1 &&
          status.error?.includes('HTTP 503')
      })

      await waitForCondition(() => {
        const status = service.getStatus()
        return status.status === 'success' &&
          !status.pending &&
          status.lastResult?.success === true &&
          status.lastResult.action === 'uploaded'
      })

      const manifest = await createWebDAVSyncClient(storageId).getCloudSyncManifest(storageId)
      expect(manifest.latestSnapshot?.deviceId).toBe('device-auto-retry')
      expect(manifest.latestSnapshot?.data.prompts).toEqual(expect.arrayContaining([
        expect.objectContaining({ uuid: 'prompt-main', title: 'Auto retry prompt' })
      ]))
      expect(service.getStatus().failureCount).toBe(0)
      expect(service.getStatus().error).toBeUndefined()
    } finally {
      service.stopAutoSync()
    }
  })

  it('自动同步运行中本机继续编辑时会在结束后补跑并上传最新数据', async () => {
    const storageId = 'robust-auto-sync-local-change-during-running-sync'
    let blockFirstManifestSave = true
    let manifestSaveAttempts = 0
    let releaseFirstManifestSave!: () => void
    let notifyFirstManifestSaveStarted!: () => void
    const firstManifestSaveStarted = new Promise<void>(resolve => {
      notifyFirstManifestSaveStarted = resolve
    })
    const releaseFirstManifestSavePromise = new Promise<void>(resolve => {
      releaseFirstManifestSave = resolve
    })
    const client = createWebDAVSyncClient(storageId, {
      saveCloudSyncManifest: async (_context, saveNormally) => {
        manifestSaveAttempts += 1
        const result = await saveNormally()
        if (blockFirstManifestSave) {
          blockFirstManifestSave = false
          notifyFirstManifestSaveStarted()
          await releaseFirstManifestSavePromise
        }

        return result
      }
    })
    const database = new MutableSyncDatabase(createDataSet({
      promptTitle: 'Auto sync initial prompt',
      settingValue: 'initial-auto'
    }))
    const service = createSyncService(client, database, new MemoryStorage(), 'device-auto-running-change')

    service.startAutoSync({
      enabled: true,
      storageIds: [storageId],
      debounceMs: 0,
      retryMs: 0,
      pollIntervalMs: 0,
      startupDelayMs: 0,
      syncOnStart: false
    })

    try {
      service.scheduleSync('local-change', { storageId, delayMs: 0 })
      await firstManifestSaveStarted

      database.data = mutateDataSet(database.data, data => {
        data.prompts![0].title = 'Auto sync edit made during running sync'
        data.prompts![0].imageBlobs = [UPDATED_IMAGE]
        data.prompts![0].updatedAt = '2026-06-13T17:10:00.000Z'
        data.promptHistories!.push({
          id: 404,
          uuid: 'history-auto-edit-during-running-sync',
          promptId: 10,
          promptUuid: 'prompt-main',
          title: 'Auto sync edit made during running sync',
          content: '自动同步运行时继续编辑',
          result: 'Second auto sync should upload this',
          version: 2,
          imageBlobs: [UPDATED_IMAGE],
          createdAt: '2026-06-13T17:11:00.000Z',
          updatedAt: '2026-06-13T17:11:00.000Z'
        })
        data.settings = [{
          key: 'theme',
          value: 'auto-edited-during-running-sync',
          type: 'string',
          updatedAt: '2026-06-13T17:12:00.000Z'
        }]
      })
      service.scheduleSync('local-change', { storageId, delayMs: 0 })
      await new Promise(resolve => setTimeout(resolve, 20))
      expect(manifestSaveAttempts).toBe(1)

      releaseFirstManifestSave()
      await waitForCondition(() =>
        manifestSaveAttempts >= 2 &&
        service.getStatus().status === 'success' &&
        service.getStatus().lastResult?.success === true
      )

      const manifest = await createWebDAVSyncClient(storageId).getCloudSyncManifest(storageId)
      expect(manifest.latestSnapshot?.deviceId).toBe('device-auto-running-change')
      expect(manifest.latestSnapshot?.data.prompts).toEqual(expect.arrayContaining([
        expect.objectContaining({
          uuid: 'prompt-main',
          title: 'Auto sync edit made during running sync',
          imageBlobs: [UPDATED_IMAGE]
        })
      ]))
      expect(manifest.latestSnapshot?.data.promptHistories).toEqual(expect.arrayContaining([
        expect.objectContaining({
          uuid: 'history-auto-edit-during-running-sync',
          imageBlobs: [UPDATED_IMAGE]
        })
      ]))
      expect(manifest.latestSnapshot?.data.settings).toEqual(expect.arrayContaining([
        expect.objectContaining({
          key: 'theme',
          value: 'auto-edited-during-running-sync'
        })
      ]))
      expect(manifest.latestSnapshot?.dataChecksum)
        .toBe(createCloudSyncDataChecksum(manifest.latestSnapshot!.data))

      const repeated = await service.syncNow(storageId, {
        deviceName: 'Auto Running Change',
        platform: 'electron',
        reason: 'manual'
      })
      expect(repeated).toMatchObject({ success: true, action: 'noop' })
    } finally {
      service.stopAutoSync()
    }
  })

  it('远端快照文件局部损坏时仍能使用 manifest 内联快照继续同步', async () => {
    const storageId = 'robust-corrupt-snapshot-file-uses-manifest'
    const client = createWebDAVSyncClient(storageId)
    const deviceADatabase = new MutableSyncDatabase(createDataSet({
      promptTitle: 'Snapshot file corruption base'
    }))
    const deviceAStorage = new MemoryStorage()
    const deviceA = createSyncService(client, deviceADatabase, deviceAStorage, 'device-a')

    const initial = await deviceA.syncNow(storageId, {
      deviceName: 'Laptop A',
      platform: 'electron',
      reason: 'manual'
    })
    expect(initial).toMatchObject({ success: true, action: 'uploaded' })

    const manifestBeforeCorruption = await client.getCloudSyncManifest(storageId)
    expect(manifestBeforeCorruption.latestSnapshot?.revision).toBe(initial.remoteRevision)
    await corruptRemoteFile(storageId, getCloudSyncSnapshotPath(initial.remoteRevision!), '{"kind":')

    const deviceBDatabase = new MutableSyncDatabase(emptyDataSet())
    const deviceB = createSyncService(client, deviceBDatabase, new MemoryStorage(), 'device-b')
    const download = await deviceB.syncNow(storageId, {
      deviceName: 'Desktop B',
      platform: 'electron',
      reason: 'manual'
    })
    expect(download, JSON.stringify(download, null, 2))
      .toMatchObject({ success: true, action: 'downloaded' })
    expect(deviceBDatabase.data.prompts).toEqual(expect.arrayContaining([
      expect.objectContaining({ uuid: 'prompt-main', title: 'Snapshot file corruption base' })
    ]))

    deviceBDatabase.data = mutateDataSet(deviceBDatabase.data, data => {
      data.prompts![0].title = 'Snapshot file corruption recovered'
      data.prompts![0].updatedAt = '2026-06-13T13:00:00.000Z'
    })
    const uploaded = await deviceB.syncNow(storageId, {
      deviceName: 'Desktop B',
      platform: 'electron',
      reason: 'manual'
    })
    expect(uploaded, JSON.stringify(uploaded, null, 2))
      .toMatchObject({ success: true, action: 'uploaded' })

    const manifest = await client.getCloudSyncManifest(storageId)
    expect(manifest.latestSnapshot?.revision).toBe(uploaded.remoteRevision)
    expect(manifest.latestSnapshot?.data.prompts).toEqual(expect.arrayContaining([
      expect.objectContaining({ uuid: 'prompt-main', title: 'Snapshot file corruption recovered' })
    ]))
    expect(manifest.latestSnapshot?.dataChecksum)
      .toBe(createCloudSyncDataChecksum(manifest.latestSnapshot!.data))
  })
})

function createSyncService(
  cloudClient: ReturnType<typeof createWebDAVSyncClient>,
  database: MutableSyncDatabase,
  storage: MemoryStorage,
  deviceId: string
): CloudSyncService {
  return new CloudSyncService({
    cloudClient,
    database,
    storage,
    createDeviceId: () => deviceId
  })
}

function createWebDAVSyncClient(
  storageId: string,
  hooks: TestCloudClientHooks = {}
) {
  const provider = new WebDAVProvider({
    id: storageId,
    name: `WebDAV ${storageId}`,
    type: 'webdav',
    enabled: true,
    url: `${server.baseUrl}/${storageId}`,
    username: USERNAME,
    password: PASSWORD,
    createdAt: '2026-06-13T00:00:00.000Z',
    updatedAt: '2026-06-13T00:00:00.000Z'
  })
  const formatError = (error: unknown) => error instanceof Error ? error.message : String(error)
  const isNotFoundError = (error: unknown) => /404|not\s*found|does not exist|ENOENT|不存在|未找到/i
    .test(formatError(error))
  const isRevisionConflictError = (error: unknown) => /Precondition|412|if-match|if-none-match|已存在，取消覆盖|已被其他设备更新/i
    .test(formatError(error))

  const readManifestFile = async (cloudPath: string) => {
    const data = await provider.readFile(cloudPath)
    return assertValidCloudSyncManifest(JSON.parse(Buffer.from(data).toString('utf-8')))
  }

  const readManifest = async () => readCloudSyncManifestWithFallback({
    readPrimary: () => readManifestFile(getCloudSyncManifestPath()),
    readBackup: () => readManifestFile(getCloudSyncManifestBackupPath()),
    isNotFoundError,
    describeError: formatError
  })

  const readSnapshot = async (snapshot: CloudSyncRemoteSnapshotInfo | string) => {
    const snapshotPath = typeof snapshot === 'string'
      ? getCloudSyncSnapshotPath(snapshot)
      : snapshot.path || getCloudSyncSnapshotPath(snapshot.revision)
    const data = await provider.readFile(snapshotPath)
    return assertValidCloudSyncSnapshotFile(JSON.parse(Buffer.from(data).toString('utf-8')))
  }

  const client = {
    async getCloudSyncManifest(targetStorageId: string) {
      const readNormally = () => readManifest()
      if (hooks.getCloudSyncManifest) {
        return hooks.getCloudSyncManifest(targetStorageId, readNormally)
      }

      return readNormally()
    },

    async saveCloudSyncManifest(
      targetStorageId: string,
      manifest: CloudSyncManifest,
      options: CloudSyncManifestSaveOptions = {}
    ) {
      const saveNormally = async (): Promise<CloudSyncManifestSaveResult> => {
        try {
          await provider.initializeDirectories()
          const currentManifest = await readManifest()
          if (!doesCloudSyncManifestMatchExpectedRevision(currentManifest, options.expectedRevision)) {
            throw createCloudSyncManifestRevisionConflictError(
              options.expectedRevision,
              getCloudSyncManifestRevision(currentManifest)
            )
          }

          const primaryInfo = await provider.getFileInfo(getCloudSyncManifestPath())
          const content = Buffer.from(JSON.stringify(assertValidCloudSyncManifest(manifest), null, 2), 'utf-8')
          await provider.writeFile(getCloudSyncManifestPath(), content, {
            ifMatch: primaryInfo?.etag,
            ifNoneMatch: !primaryInfo && !currentManifest.latestSnapshot
          })
          await hooks.afterPrimaryManifestWrite?.({
            storageId: targetStorageId,
            manifest,
            options
          })
          await provider.writeFile(getCloudSyncManifestBackupPath(), content)
          return { success: true }
        } catch (error) {
          return {
            success: false,
            conflict: isRevisionConflictError(error),
            error: formatError(error),
            currentRevision: isRevisionConflictError(error)
              ? getCloudSyncManifestRevision(await readManifest().catch(() => createEmptyCloudSyncManifest()))
              : undefined
          }
        }
      }

      if (hooks.saveCloudSyncManifest) {
        return hooks.saveCloudSyncManifest({
          storageId: targetStorageId,
          manifest,
          options
        }, saveNormally)
      }

      return saveNormally()
    },

    async listCloudSyncSnapshots(_targetStorageId: string) {
      try {
        const files = await provider.listFiles(getCloudSyncSnapshotsDirectoryPath())
        return files
          .filter(file => !file.isDirectory)
          .map(file => {
            const revision = getCloudSyncSnapshotRevisionFromFileName(file.name)
            return revision
              ? {
                  revision,
                  path: getCloudSyncSnapshotPath(revision),
                  modifiedAt: file.modifiedAt,
                  size: file.size
                }
              : null
          })
          .filter((snapshot): snapshot is CloudSyncRemoteSnapshotInfo => !!snapshot)
      } catch (error) {
        if (isNotFoundError(error)) {
          return []
        }
        throw error
      }
    },

    async readCloudSyncSnapshot(targetStorageId: string, snapshot: CloudSyncRemoteSnapshotInfo | string) {
      const readNormally = () => readSnapshot(snapshot)
      if (hooks.readCloudSyncSnapshot) {
        return hooks.readCloudSyncSnapshot({
          storageId: targetStorageId,
          snapshot
        }, readNormally)
      }

      return readNormally()
    },

    async saveCloudSyncSnapshot(_targetStorageId: string, snapshot: CloudSyncSnapshot) {
      try {
        await provider.initializeDirectories()
        const normalizedSnapshot = assertValidCloudSyncSnapshotFile(snapshot)
        const content = Buffer.from(
          JSON.stringify(createCloudSyncSnapshotFile(normalizedSnapshot), null, 2),
          'utf-8'
        )
        const snapshotPath = getCloudSyncSnapshotPath(normalizedSnapshot.revision)
        try {
          await provider.writeFile(snapshotPath, content, { ifNoneMatch: true })
          return { success: true }
        } catch (error) {
          if (!isRevisionConflictError(error)) {
            throw error
          }

          const existingSnapshot = await readSnapshot(normalizedSnapshot.revision)
          if (
            existingSnapshot.revision === normalizedSnapshot.revision &&
            existingSnapshot.dataChecksum === normalizedSnapshot.dataChecksum &&
            JSON.stringify(existingSnapshot.data) === JSON.stringify(normalizedSnapshot.data)
          ) {
            return { success: true }
          }

          throw new Error(`云同步快照 ${normalizedSnapshot.revision} 已存在但内容不一致`)
        }
      } catch (error) {
        return { success: false, error: formatError(error) }
      }
    }
  }

  return client
}

function createDataSet(input: {
  promptTitle?: string
  categoryName?: string
  settingValue?: string
  promptUpdatedAt?: string
} = {}): CloudSyncDataSet {
  const updatedAt = input.promptUpdatedAt || '2026-06-13T09:00:00.000Z'
  return {
    categories: [{
      id: 1,
      uuid: 'cat-main',
      name: input.categoryName || 'Main category',
      isActive: true,
      sortOrder: 1,
      updatedAt
    }],
    prompts: [{
      id: 10,
      uuid: 'prompt-main',
      title: input.promptTitle || 'Main prompt',
      content: 'Write a summary for {{topic}}',
      categoryId: 1,
      tags: ['sync', 'robustness'],
      isFavorite: false,
      useCount: 1,
      isActive: true,
      updatedAt
    }],
    promptVariables: [{
      id: 20,
      uuid: 'var-main',
      promptId: 10,
      name: 'topic',
      type: 'text',
      defaultValue: 'sync',
      required: true,
      sortOrder: 1,
      updatedAt
    }],
    promptHistories: [{
      id: 30,
      uuid: 'history-main',
      promptId: 10,
      promptUuid: 'prompt-main',
      title: input.promptTitle || 'Main prompt',
      content: 'Write a summary for {{topic}}',
      version: 1,
      updatedAt
    }],
    aiConfigs: [],
    quickOptimizationConfigs: [],
    aiHistory: [],
    settings: [{ key: 'theme', value: input.settingValue || 'dark', type: 'string', updatedAt }],
    syncTombstones: []
  }
}

function createRealisticDataSet(): CloudSyncDataSet {
  return {
    categories: [{
      id: 11,
      uuid: 'real-category-product',
      name: '真实项目资料',
      isActive: true,
      sortOrder: 1,
      createdAt: '2026-06-13T13:00:00.000Z',
      updatedAt: '2026-06-13T13:00:00.000Z'
    }],
    prompts: [{
      id: 31,
      uuid: 'real-prompt-launch',
      title: '发布计划提示词',
      content: '请用 {{tone}} 语气生成发布计划',
      categoryId: 11,
      categoryUuid: 'real-category-product',
      tags: ['release', 'webdav', 'initial'],
      isFavorite: true,
      useCount: 3,
      isActive: true,
      imageBlobs: [INITIAL_IMAGE],
      createdAt: '2026-06-13T13:00:00.000Z',
      updatedAt: '2026-06-13T13:00:00.000Z'
    }],
    promptVariables: [{
      id: 41,
      uuid: 'real-variable-tone',
      promptId: 31,
      promptUuid: 'real-prompt-launch',
      name: 'tone',
      type: 'select',
      defaultValue: 'friendly',
      options: ['friendly', 'precise'],
      required: true,
      sortOrder: 1,
      createdAt: '2026-06-13T13:00:00.000Z',
      updatedAt: '2026-06-13T13:00:00.000Z'
    }],
    promptHistories: [{
      id: 41,
      uuid: 'real-history-initial',
      promptId: 31,
      promptUuid: 'real-prompt-launch',
      title: '发布计划提示词',
      content: '第一次生成发布计划',
      result: 'Initial launch plan',
      version: 1,
      imageBlobs: [INITIAL_IMAGE],
      createdAt: '2026-06-13T13:01:00.000Z',
      updatedAt: '2026-06-13T13:01:00.000Z'
    }],
    aiConfigs: [{
      id: 51,
      uuid: 'ai-config-openai-real',
      name: 'OpenAI Real',
      provider: 'openai',
      model: 'gpt-4.1',
      baseUrl: 'https://api.openai.com/v1',
      isDefault: true,
      enabled: true,
      createdAt: '2026-06-13T13:00:00.000Z',
      updatedAt: '2026-06-13T13:00:00.000Z'
    }],
    quickOptimizationConfigs: [{
      id: 61,
      uuid: 'quick-real-cleanup',
      name: '更清晰',
      description: '优化表达',
      prompt: '请优化：{{content}}',
      enabled: true,
      sortOrder: 1,
      createdAt: '2026-06-13T13:00:00.000Z',
      updatedAt: '2026-06-13T13:00:00.000Z'
    }],
    aiHistory: [{
      id: 71,
      uuid: 'real-ai-history-initial',
      promptUuid: 'real-prompt-launch',
      input: '生成发布计划',
      output: '初始发布计划结果',
      provider: 'openai',
      model: 'gpt-4.1',
      createdAt: '2026-06-13T13:02:00.000Z',
      updatedAt: '2026-06-13T13:02:00.000Z'
    }],
    settings: [{
      key: 'theme',
      value: 'dark',
      type: 'string',
      updatedAt: '2026-06-13T13:00:00.000Z'
    }],
    syncTombstones: []
  }
}

function createOfflineNewDeviceData(): CloudSyncDataSet {
  return {
    categories: [{
      id: 211,
      uuid: 'offline-category-design',
      name: '离线设计资料',
      isActive: true,
      sortOrder: 1,
      createdAt: '2026-06-13T14:30:00.000Z',
      updatedAt: '2026-06-13T14:30:00.000Z'
    }],
    prompts: [{
      id: 231,
      uuid: 'offline-prompt-roadmap',
      title: '离线新建设计评审提示词',
      content: '请围绕 {{scope}} 生成设计评审清单',
      categoryId: 211,
      categoryUuid: 'offline-category-design',
      tags: ['offline', 'design'],
      isFavorite: false,
      useCount: 1,
      isActive: true,
      imageBlobs: [UPDATED_IMAGE],
      createdAt: '2026-06-13T14:30:00.000Z',
      updatedAt: '2026-06-13T14:30:00.000Z'
    }],
    promptVariables: [{
      id: 241,
      uuid: 'offline-variable-scope',
      promptId: 231,
      promptUuid: 'offline-prompt-roadmap',
      name: 'scope',
      type: 'text',
      defaultValue: 'mobile sync',
      required: true,
      sortOrder: 1,
      createdAt: '2026-06-13T14:30:00.000Z',
      updatedAt: '2026-06-13T14:30:00.000Z'
    }],
    promptHistories: [{
      id: 242,
      uuid: 'offline-history-draft',
      promptId: 231,
      promptUuid: 'offline-prompt-roadmap',
      title: '离线新建设计评审提示词',
      content: '离线第一次生成设计评审清单',
      result: 'Offline design review checklist',
      version: 1,
      imageBlobs: [UPDATED_IMAGE],
      createdAt: '2026-06-13T14:31:00.000Z',
      updatedAt: '2026-06-13T14:31:00.000Z'
    }],
    aiConfigs: [],
    quickOptimizationConfigs: [{
      id: 261,
      uuid: 'offline-quick-tighten',
      name: '压缩表达',
      description: '离线优化',
      prompt: '请压缩：{{content}}',
      enabled: true,
      sortOrder: 1,
      createdAt: '2026-06-13T14:30:00.000Z',
      updatedAt: '2026-06-13T14:30:00.000Z'
    }],
    aiHistory: [{
      id: 271,
      uuid: 'offline-ai-history-draft',
      promptUuid: 'offline-prompt-roadmap',
      input: '生成离线设计评审清单',
      output: '离线设计评审结果',
      provider: 'openai',
      model: 'gpt-4.1',
      createdAt: '2026-06-13T14:32:00.000Z',
      updatedAt: '2026-06-13T14:32:00.000Z'
    }],
    settings: [{
      key: 'offline.review.mode',
      value: 'strict',
      type: 'string',
      updatedAt: '2026-06-13T14:30:00.000Z'
    }],
    syncTombstones: []
  }
}

function createLargeDataSet(count: number): CloudSyncDataSet {
  const data = emptyDataSet()
  data.categories = [
    { id: 1, uuid: 'cat-large', name: 'Large category', isActive: true, updatedAt: '2026-06-13T09:00:00.000Z' }
  ]
  data.prompts = Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    uuid: `prompt-large-${index}`,
    title: `Large prompt ${index}`,
    content: `Content ${index} with {{topic_${index}}}`,
    categoryId: 1,
    tags: ['large', `batch-${Math.floor(index / 50)}`],
    isFavorite: index % 7 === 0,
    useCount: index,
    isActive: true,
    updatedAt: '2026-06-13T09:00:00.000Z'
  }))
  data.promptVariables = Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    uuid: `var-large-${index}`,
    promptId: index + 1,
    name: `topic_${index}`,
    type: 'text',
    defaultValue: `Topic ${index}`,
    required: index % 2 === 0,
    sortOrder: index,
    updatedAt: '2026-06-13T09:00:00.000Z'
  }))
  data.promptHistories = Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    uuid: `history-large-${index}`,
    promptId: index + 1,
    promptUuid: `prompt-large-${index}`,
    title: `Large prompt ${index}`,
    content: `Previous content ${index}`,
    version: 1,
    updatedAt: '2026-06-13T09:00:00.000Z'
  }))
  data.settings = [{ key: 'theme', value: 'dark', type: 'string', updatedAt: '2026-06-13T09:00:00.000Z' }]
  return data
}

function emptyDataSet(): CloudSyncDataSet {
  return {
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
}

function mutateDataSet(data: CloudSyncDataSet, mutate: (data: CloudSyncDataSet) => void): CloudSyncDataSet {
  const nextData = cloneData(data)
  mutate(nextData)
  return nextData
}

function createTombstone(collectionName: string, uuid: string, deletedAt: string) {
  return {
    storeName: collectionName,
    collectionName,
    recordKey: `uuid:${uuid}`,
    recordUuid: uuid,
    deletedAt,
    recordSnapshot: { uuid }
  }
}

function createTombstoneFromRecord(collectionName: string, record: any, deletedAt: string) {
  const recordKey = record?.uuid ? `uuid:${record.uuid}` : `id:${record.id}`
  return {
    storeName: collectionName,
    collectionName,
    recordKey,
    recordUuid: record?.uuid,
    deletedAt,
    recordSnapshot: cloneData(record)
  }
}

function regenerateLocalNumericIds(data: CloudSyncDataSet, offset: number): CloudSyncDataSet {
  const nextData = cloneData(data)
  const categoryIdByUuid = new Map<string, number>()
  const promptIdByUuid = new Map<string, number>()

  nextData.categories = (nextData.categories || []).map(category => {
    const nextId = Number(category.id || 0) + offset
    categoryIdByUuid.set(category.uuid, nextId)
    return { ...category, id: nextId }
  })

  nextData.prompts = (nextData.prompts || []).map(prompt => {
    const nextId = Number(prompt.id || 0) + offset
    promptIdByUuid.set(prompt.uuid, nextId)
    return {
      ...prompt,
      id: nextId,
      categoryId: prompt.categoryUuid
        ? categoryIdByUuid.get(prompt.categoryUuid)
        : Number(prompt.categoryId || 0) + offset
    }
  })

  nextData.promptVariables = (nextData.promptVariables || []).map(variable => ({
    ...variable,
    id: Number(variable.id || 0) + offset,
    promptId: variable.promptUuid
      ? promptIdByUuid.get(variable.promptUuid)
      : Number(variable.promptId || 0) + offset
  }))

  nextData.promptHistories = (nextData.promptHistories || []).map(history => ({
    ...history,
    id: Number(history.id || 0) + offset,
    promptId: history.promptUuid
      ? promptIdByUuid.get(history.promptUuid)
      : Number(history.promptId || 0) + offset,
    categoryId: history.categoryUuid
      ? categoryIdByUuid.get(history.categoryUuid)
      : history.categoryId
  }))

  nextData.settings = (nextData.settings || []).map(setting => ({
    ...setting,
    id: setting.id === undefined ? undefined : Number(setting.id || 0) + offset
  }))

  return nextData
}

function stripRelationUuids(data: CloudSyncDataSet): CloudSyncDataSet {
  const nextData = cloneData(data)
  for (const prompt of nextData.prompts || []) {
    delete prompt.categoryUuid
  }
  for (const variable of nextData.promptVariables || []) {
    delete variable.promptUuid
  }
  for (const history of nextData.promptHistories || []) {
    delete history.promptUuid
    delete history.categoryUuid
  }
  return nextData
}

function cloneData<T>(data: T): T {
  return JSON.parse(JSON.stringify(data))
}

async function waitForCondition(
  predicate: () => boolean,
  timeoutMs = 1000,
  intervalMs = 10
): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (predicate()) {
      return
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs))
  }
  throw new Error('Timed out waiting for condition')
}

async function corruptRemoteFile(storageId: string, cloudPath: string, content: string): Promise<void> {
  const provider = new WebDAVProvider({
    id: `${storageId}-corruptor`,
    name: `WebDAV corruptor ${storageId}`,
    type: 'webdav',
    enabled: true,
    url: `${server.baseUrl}/${storageId}`,
    username: USERNAME,
    password: PASSWORD,
    createdAt: '2026-06-13T00:00:00.000Z',
    updatedAt: '2026-06-13T00:00:00.000Z'
  })
  await provider.writeFile(cloudPath, Buffer.from(content, 'utf-8'))
}

async function readRemoteManifestFile(storageId: string, cloudPath: string): Promise<CloudSyncManifest> {
  const provider = new WebDAVProvider({
    id: `${storageId}-reader`,
    name: `WebDAV reader ${storageId}`,
    type: 'webdav',
    enabled: true,
    url: `${server.baseUrl}/${storageId}`,
    username: USERNAME,
    password: PASSWORD,
    createdAt: '2026-06-13T00:00:00.000Z',
    updatedAt: '2026-06-13T00:00:00.000Z'
  })
  const data = await provider.readFile(cloudPath)
  return assertValidCloudSyncManifest(JSON.parse(Buffer.from(data).toString('utf-8')))
}
