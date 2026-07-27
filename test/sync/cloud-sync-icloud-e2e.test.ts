/**
 * Cloud sync robustness E2E tests for the desktop iCloud Drive provider.
 *
 * The test fakes only the user home directory and writes through the real
 * ICloudProvider local-file path, so manifest/snapshot bytes, ETags, and
 * repeated sync behavior are exercised together.
 */

// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fsp from 'fs/promises'
import path from 'path'
import { CloudSyncService } from '~/lib/services/cloud-sync.service'
import { ICloudProvider } from '../../src/main/cloud/icloud-provider'
import type { CloudSyncDataSet, CloudSyncSnapshot } from '@shared/cloud-sync-engine'
import {
  createCloudSyncDataChecksum,
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

const mockOs = vi.hoisted(() => ({
  homeDir: ''
}))

vi.mock('os', async () => {
  const actual = await vi.importActual<any>('os')
  return {
    ...actual,
    default: {
      ...actual.default,
      platform: () => 'darwin',
      homedir: () => mockOs.homeDir
    },
    platform: () => 'darwin',
    homedir: () => mockOs.homeDir
  }
})

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

interface TestICloudClientHooks {
  saveCloudSyncManifest?: (
    context: {
      storageId: string
      manifest: CloudSyncManifest
      options: CloudSyncManifestSaveOptions
    },
    saveNormally: () => Promise<CloudSyncManifestSaveResult>
  ) => Promise<CloudSyncManifestSaveResult>
}

const INITIAL_IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lZ2nNwAAAABJRU5ErkJggg=='
const UPDATED_IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAADUlEQVR42mP8z8BQDwAFgwJ/lZ2nNwAAAABJRU5ErkJggg=='

let tempHome: string

describe('Cloud sync robustness E2E over iCloud Drive local provider', () => {
  beforeEach(async () => {
    tempHome = await fsp.mkdtemp(path.join(process.env.TMPDIR || '/tmp', 'ai-gist-icloud-sync-'))
    mockOs.homeDir = tempHome
    await fsp.mkdir(getFakeICloudRoot(), { recursive: true })
    vi.clearAllMocks()
  })

  afterEach(async () => {
    await fsp.rm(tempHome, { recursive: true, force: true })
  })

  it('iCloud Drive 真实创建含图片和历史的数据后跨端更新不会丢失元数据', async () => {
    const storageId = 'icloud-real-create-then-update'
    const client = createICloudSyncClient(storageId)
    const deviceADatabase = new MutableSyncDatabase(createRealisticDataSet())
    const deviceA = createSyncService(client, deviceADatabase, new MemoryStorage(), 'icloud-device-a')

    const createUpload = await deviceA.syncNow(storageId, {
      deviceName: 'MacBook A',
      platform: 'electron',
      reason: 'manual'
    })
    expect(createUpload).toMatchObject({ success: true, action: 'uploaded' })

    const deviceBDatabase = new MutableSyncDatabase(emptyDataSet())
    const deviceB = createSyncService(client, deviceBDatabase, new MemoryStorage(), 'icloud-device-b')
    const firstDownload = await deviceB.syncNow(storageId, {
      deviceName: 'iPhone B',
      platform: 'ios',
      reason: 'manual'
    })
    expect(firstDownload).toMatchObject({ success: true, action: 'downloaded' })
    expect(deviceBDatabase.data.prompts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uuid: 'icloud-prompt-launch',
        imageBlobs: [INITIAL_IMAGE]
      })
    ]))
    expect(deviceBDatabase.data.promptHistories).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uuid: 'icloud-history-initial',
        promptUuid: 'icloud-prompt-launch',
        imageBlobs: [INITIAL_IMAGE]
      })
    ]))

    deviceBDatabase.data = mutateDataSet(deviceBDatabase.data, data => {
      data.categories![0].name = 'iCloud 项目资料-移动端更新'
      data.categories![0].updatedAt = '2026-06-13T18:00:00.000Z'
      data.prompts![0].title = 'iCloud 发布计划提示词 - 移动端更新'
      data.prompts![0].content = '请用 {{tone}} 语气生成 iCloud 移动端更新版发布计划'
      data.prompts![0].tags = ['release', 'icloud', 'mobile', 'updated']
      data.prompts![0].imageBlobs = [INITIAL_IMAGE, UPDATED_IMAGE]
      data.prompts![0].updatedAt = '2026-06-13T18:00:00.000Z'
      data.promptVariables![0].defaultValue = 'precise'
      data.promptVariables![0].updatedAt = '2026-06-13T18:00:00.000Z'
      data.promptHistories!.push({
        id: 142,
        uuid: 'icloud-history-mobile-update',
        promptId: 131,
        promptUuid: 'icloud-prompt-launch',
        title: 'iCloud 发布计划提示词 - 移动端更新',
        content: '移动端更新后再次生成 iCloud 发布计划',
        result: 'Updated iCloud launch plan from mobile',
        version: 2,
        imageBlobs: [UPDATED_IMAGE],
        createdAt: '2026-06-13T18:01:00.000Z',
        updatedAt: '2026-06-13T18:01:00.000Z'
      })
      data.aiHistory!.push({
        id: 151,
        uuid: 'icloud-ai-history-mobile-update',
        promptUuid: 'icloud-prompt-launch',
        input: '生成 iCloud 移动端更新发布计划',
        output: 'iCloud 移动端更新后的发布计划结果',
        provider: 'openai',
        model: 'gpt-4.1',
        createdAt: '2026-06-13T18:02:00.000Z',
        updatedAt: '2026-06-13T18:02:00.000Z'
      })
      data.settings = [
        { key: 'theme', value: 'light', type: 'string', updatedAt: '2026-06-13T18:00:00.000Z' },
        { key: 'cloud.sync.intervalMinutes', value: 5, type: 'number', updatedAt: '2026-06-13T18:00:00.000Z' }
      ]
      data.quickOptimizationConfigs![0].prompt = '请更精确地优化 iCloud 内容：{{content}}'
      data.quickOptimizationConfigs![0].updatedAt = '2026-06-13T18:00:00.000Z'
    })

    const updateUpload = await deviceB.syncNow(storageId, {
      deviceName: 'iPhone B',
      platform: 'ios',
      reason: 'manual'
    })
    expect(updateUpload).toMatchObject({ success: true, action: 'uploaded' })

    const backToA = await deviceA.syncNow(storageId, {
      deviceName: 'MacBook A',
      platform: 'electron',
      reason: 'manual'
    })
    expect(backToA, JSON.stringify(backToA, null, 2))
      .toMatchObject({ success: true, action: 'downloaded' })
    expect(backToA.error).toBeUndefined()
    expect(deviceADatabase.data.categories).toEqual(expect.arrayContaining([
      expect.objectContaining({ uuid: 'icloud-category-product', name: 'iCloud 项目资料-移动端更新' })
    ]))
    expect(deviceADatabase.data.prompts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uuid: 'icloud-prompt-launch',
        title: 'iCloud 发布计划提示词 - 移动端更新',
        imageBlobs: [INITIAL_IMAGE, UPDATED_IMAGE]
      })
    ]))
    expect(deviceADatabase.data.promptVariables).toEqual(expect.arrayContaining([
      expect.objectContaining({ uuid: 'icloud-variable-tone', defaultValue: 'precise' })
    ]))
    expect(deviceADatabase.data.promptHistories).toEqual(expect.arrayContaining([
      expect.objectContaining({ uuid: 'icloud-history-initial', imageBlobs: [INITIAL_IMAGE] }),
      expect.objectContaining({ uuid: 'icloud-history-mobile-update', imageBlobs: [UPDATED_IMAGE] })
    ]))
    expect(deviceADatabase.data.aiHistory).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uuid: 'icloud-ai-history-mobile-update',
        output: 'iCloud 移动端更新后的发布计划结果'
      })
    ]))
    expect(deviceADatabase.data.settings).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'theme', value: 'light' }),
      expect.objectContaining({ key: 'cloud.sync.intervalMinutes', value: 5 })
    ]))
    expect(deviceADatabase.data.quickOptimizationConfigs).toEqual(expect.arrayContaining([
      expect.objectContaining({ uuid: 'icloud-quick-cleanup', prompt: '请更精确地优化 iCloud 内容：{{content}}' })
    ]))

    const secondClick = await deviceA.syncNow(storageId, {
      deviceName: 'MacBook A',
      platform: 'electron',
      reason: 'manual'
    })
    const thirdClick = await deviceA.syncNow(storageId, {
      deviceName: 'MacBook A',
      platform: 'electron',
      reason: 'manual'
    })
    expect(secondClick).toMatchObject({ success: true, action: 'noop' })
    expect(thirdClick).toMatchObject({ success: true, action: 'noop' })

    const manifest = await client.getCloudSyncManifest(storageId)
    expect(manifest.latestSnapshot?.dataChecksum)
      .toBe(createCloudSyncDataChecksum(manifest.latestSnapshot!.data))
    expect(manifest.latestSnapshot?.data.prompts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uuid: 'icloud-prompt-launch',
        imageBlobs: [INITIAL_IMAGE, UPDATED_IMAGE]
      })
    ]))
    expect(manifest.latestSnapshot?.data.promptHistories).toEqual(expect.arrayContaining([
      expect.objectContaining({ uuid: 'icloud-history-mobile-update', imageBlobs: [UPDATED_IMAGE] })
    ]))
    expect(await client.listCloudSyncSnapshots(storageId)).toHaveLength(0)

    const manifestFile = JSON.parse(
      await fsp.readFile(getFakeICloudFilePath(storageId, getCloudSyncManifestPath()), 'utf-8')
    )
    expect(manifestFile.latestSnapshot.data.prompts[0].imageBlobs).toEqual([INITIAL_IMAGE, UPDATED_IMAGE])
    expect(manifestFile.latestSnapshot.dataChecksum)
      .toBe(createCloudSyncDataChecksum(manifestFile.latestSnapshot.data))
  })

  it('iCloud Drive manifest 写入中断时不会留下新 snapshot，重启后可重新发布当前状态', async () => {
    const storageId = 'icloud-half-written-snapshot-before-manifest'
    let failManifestWrite = true
    const interruptedClient = createICloudSyncClient(storageId, {
      saveCloudSyncManifest: async (_context, saveNormally) => {
        if (failManifestWrite) {
          failManifestWrite = false
          return {
            success: false,
            error: 'simulated app close before iCloud manifest pointer was saved'
          }
        }

        return saveNormally()
      }
    })
    const data = createRealisticDataSet()
    const interruptedDevice = createSyncService(
      interruptedClient,
      new MutableSyncDatabase(data),
      new MemoryStorage(),
      'icloud-device-interrupted'
    )

    const failed = await interruptedDevice.syncNow(storageId, {
      deviceName: 'MacBook Interrupted',
      platform: 'electron',
      reason: 'manual'
    })
    expect(failed.success).toBe(false)
    expect(failed.error).toContain('iCloud manifest pointer')

    const normalClient = createICloudSyncClient(storageId)
    expect(await normalClient.listCloudSyncSnapshots(storageId)).toHaveLength(0)
    expect((await normalClient.getCloudSyncManifest(storageId)).latestSnapshot).toBeUndefined()

    const restartedDevice = createSyncService(
      normalClient,
      new MutableSyncDatabase(data),
      new MemoryStorage(),
      'icloud-device-interrupted'
    )
    const recovered = await restartedDevice.syncNow(storageId, {
      deviceName: 'MacBook Interrupted Restarted',
      platform: 'electron',
      reason: 'manual'
    })
    expect(recovered, JSON.stringify(recovered, null, 2)).toMatchObject({
      success: true,
      action: 'uploaded',
      uploadedRemote: true,
      appliedLocal: false
    })
    expect(recovered.error).toBeUndefined()

    const manifest = await normalClient.getCloudSyncManifest(storageId)
    expect(manifest.latestSnapshot?.deviceId).toBe('icloud-device-interrupted')
    expect(manifest.latestSnapshot?.dataChecksum)
      .toBe(createCloudSyncDataChecksum(manifest.latestSnapshot!.data))
    expect(manifest.latestSnapshot?.data.prompts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uuid: 'icloud-prompt-launch',
        title: 'iCloud 发布计划提示词',
        imageBlobs: [INITIAL_IMAGE]
      })
    ]))
    expect(manifest.latestSnapshot?.data.promptHistories).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uuid: 'icloud-history-initial',
        promptUuid: 'icloud-prompt-launch',
        imageBlobs: [INITIAL_IMAGE]
      })
    ]))
    expect(await normalClient.listCloudSyncSnapshots(storageId)).toHaveLength(0)

    const repeatedClick = await restartedDevice.syncNow(storageId, {
      deviceName: 'MacBook Interrupted Restarted',
      platform: 'electron',
      reason: 'manual'
    })
    expect(repeatedClick).toMatchObject({ success: true, action: 'noop' })
    expect(await normalClient.listCloudSyncSnapshots(storageId)).toHaveLength(0)
  })

  it('iCloud Drive manifest 可读时不会把残留孤立 snapshot 当作最新数据', async () => {
    const storageId = 'icloud-readable-manifest-ignores-loose-snapshot'
    const client = createICloudSyncClient(storageId)
    const deviceADatabase = new MutableSyncDatabase(createRealisticDataSet())
    const deviceA = createSyncService(client, deviceADatabase, new MemoryStorage(), 'icloud-device-a')

    const uploaded = await deviceA.syncNow(storageId, {
      deviceName: 'MacBook A',
      platform: 'electron',
      reason: 'manual'
    })
    expect(uploaded).toMatchObject({ success: true, action: 'uploaded' })

    const manifestBeforeLooseSnapshot = await client.getCloudSyncManifest(storageId)
    expect(manifestBeforeLooseSnapshot.latestSnapshot?.data.prompts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uuid: 'icloud-prompt-launch',
        title: 'iCloud 发布计划提示词',
        imageBlobs: [INITIAL_IMAGE]
      })
    ]))

    const looseData = mutateDataSet(manifestBeforeLooseSnapshot.latestSnapshot!.data, data => {
      data.prompts![0].title = 'iCloud 孤立快照里的过期标题不应生效'
      data.prompts![0].imageBlobs = []
      data.prompts![0].updatedAt = '2026-06-13T19:30:00.000Z'
      data.settings = [{
        key: 'theme',
        value: 'stale-from-icloud-loose-snapshot',
        type: 'string',
        updatedAt: '2026-06-13T19:30:00.000Z'
      }]
    })
    const looseSnapshot = {
      ...createCloudSyncSnapshot(looseData, 'icloud-abandoned-device', 'icloud-loose-snapshot-should-not-win'),
      createdAt: '2026-06-13T19:30:00.000Z'
    }
    const looseSnapshotPath = getFakeICloudFilePath(storageId, getCloudSyncSnapshotPath(looseSnapshot.revision))
    await fsp.mkdir(path.dirname(looseSnapshotPath), { recursive: true })
    await fsp.writeFile(
      looseSnapshotPath,
      JSON.stringify(createCloudSyncSnapshotFile(looseSnapshot), null, 2),
      'utf-8'
    )

    const deviceBDatabase = new MutableSyncDatabase(emptyDataSet())
    const deviceB = createSyncService(client, deviceBDatabase, new MemoryStorage(), 'icloud-device-b')
    const downloaded = await deviceB.syncNow(storageId, {
      deviceName: 'MacBook B',
      platform: 'electron',
      reason: 'manual'
    })
    expect(downloaded).toMatchObject({ success: true, action: 'downloaded' })
    expect(deviceBDatabase.data.prompts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uuid: 'icloud-prompt-launch',
        title: 'iCloud 发布计划提示词',
        imageBlobs: [INITIAL_IMAGE]
      })
    ]))
    expect(deviceBDatabase.data.settings).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'theme', value: 'dark' })
    ]))
    expect(deviceBDatabase.data.settings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'theme', value: 'stale-from-icloud-loose-snapshot' })
    ]))

    const manifestAfterDownload = await client.getCloudSyncManifest(storageId)
    expect(manifestAfterDownload.latestSnapshot?.revision)
      .toBe(manifestBeforeLooseSnapshot.latestSnapshot?.revision)
    expect(manifestAfterDownload.latestSnapshot?.revision)
      .not.toBe('icloud-loose-snapshot-should-not-win')

    deviceBDatabase.data = mutateDataSet(deviceBDatabase.data, data => {
      data.prompts![0].title = 'iCloud 可信 manifest 基础上的后续编辑'
      data.prompts![0].imageBlobs = [INITIAL_IMAGE, UPDATED_IMAGE]
      data.prompts![0].updatedAt = '2026-06-13T19:40:00.000Z'
      data.promptHistories!.push({
        id: 188,
        uuid: 'icloud-history-after-loose-snapshot',
        promptId: 131,
        promptUuid: 'icloud-prompt-launch',
        title: 'iCloud 可信 manifest 基础上的后续编辑',
        content: '孤立快照未污染后继续生成',
        result: 'Follow-up from trusted iCloud manifest',
        version: 2,
        imageBlobs: [UPDATED_IMAGE],
        createdAt: '2026-06-13T19:41:00.000Z',
        updatedAt: '2026-06-13T19:41:00.000Z'
      })
      data.settings = [{
        key: 'theme',
        value: 'trusted-after-icloud-loose-snapshot',
        type: 'string',
        updatedAt: '2026-06-13T19:40:00.000Z'
      }]
    })

    const followUpUpload = await deviceB.syncNow(storageId, {
      deviceName: 'MacBook B',
      platform: 'electron',
      reason: 'manual'
    })
    expect(followUpUpload, JSON.stringify(followUpUpload, null, 2))
      .toMatchObject({ success: true, action: 'uploaded' })

    const finalManifest = await client.getCloudSyncManifest(storageId)
    expect(finalManifest.latestSnapshot?.revision).toBe(followUpUpload.remoteRevision)
    expect(finalManifest.latestSnapshot?.revision).not.toBe('icloud-loose-snapshot-should-not-win')
    expect(finalManifest.latestSnapshot?.data.prompts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uuid: 'icloud-prompt-launch',
        title: 'iCloud 可信 manifest 基础上的后续编辑',
        imageBlobs: [INITIAL_IMAGE, UPDATED_IMAGE]
      })
    ]))
    expect(finalManifest.latestSnapshot?.data.promptHistories).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uuid: 'icloud-history-after-loose-snapshot',
        imageBlobs: [UPDATED_IMAGE]
      })
    ]))
    expect(finalManifest.latestSnapshot?.data.settings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'theme',
        value: 'trusted-after-icloud-loose-snapshot'
      })
    ]))
    expect(finalManifest.latestSnapshot?.dataChecksum)
      .toBe(createCloudSyncDataChecksum(finalManifest.latestSnapshot!.data))
    expect(await client.listCloudSyncSnapshots(storageId)).toHaveLength(1)
  })
})

function createSyncService(
  cloudClient: ReturnType<typeof createICloudSyncClient>,
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

function createICloudSyncClient(storageId: string, hooks: TestICloudClientHooks = {}) {
  const provider = new ICloudProvider({
    id: storageId,
    name: `iCloud ${storageId}`,
    type: 'icloud',
    enabled: true,
    path: getICloudConfigPath(storageId),
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

  return {
    async getCloudSyncManifest(_targetStorageId: string) {
      return readManifest()
    },

    async saveCloudSyncManifest(
      _targetStorageId: string,
      manifest: CloudSyncManifest,
      options: CloudSyncManifestSaveOptions = {}
    ): Promise<CloudSyncManifestSaveResult> {
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
          storageId: _targetStorageId,
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

    async readCloudSyncSnapshot(_targetStorageId: string, snapshot: CloudSyncRemoteSnapshotInfo | string) {
      return readSnapshot(snapshot)
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
}

function createRealisticDataSet(): CloudSyncDataSet {
  return {
    categories: [{
      id: 111,
      uuid: 'icloud-category-product',
      name: 'iCloud 项目资料',
      isActive: true,
      sortOrder: 1,
      createdAt: '2026-06-13T17:00:00.000Z',
      updatedAt: '2026-06-13T17:00:00.000Z'
    }],
    prompts: [{
      id: 131,
      uuid: 'icloud-prompt-launch',
      title: 'iCloud 发布计划提示词',
      content: '请用 {{tone}} 语气生成 iCloud 发布计划',
      categoryId: 111,
      categoryUuid: 'icloud-category-product',
      tags: ['release', 'icloud', 'initial'],
      isFavorite: true,
      useCount: 3,
      isActive: true,
      imageBlobs: [INITIAL_IMAGE],
      createdAt: '2026-06-13T17:00:00.000Z',
      updatedAt: '2026-06-13T17:00:00.000Z'
    }],
    promptVariables: [{
      id: 141,
      uuid: 'icloud-variable-tone',
      promptId: 131,
      promptUuid: 'icloud-prompt-launch',
      name: 'tone',
      type: 'select',
      defaultValue: 'friendly',
      options: ['friendly', 'precise'],
      required: true,
      sortOrder: 1,
      createdAt: '2026-06-13T17:00:00.000Z',
      updatedAt: '2026-06-13T17:00:00.000Z'
    }],
    promptHistories: [{
      id: 141,
      uuid: 'icloud-history-initial',
      promptId: 131,
      promptUuid: 'icloud-prompt-launch',
      title: 'iCloud 发布计划提示词',
      content: '第一次生成 iCloud 发布计划',
      result: 'Initial iCloud launch plan',
      version: 1,
      imageBlobs: [INITIAL_IMAGE],
      createdAt: '2026-06-13T17:01:00.000Z',
      updatedAt: '2026-06-13T17:01:00.000Z'
    }],
    aiConfigs: [{
      id: 151,
      uuid: 'icloud-ai-config-openai',
      name: 'OpenAI iCloud',
      provider: 'openai',
      model: 'gpt-4.1',
      baseUrl: 'https://api.openai.com/v1',
      isDefault: true,
      enabled: true,
      createdAt: '2026-06-13T17:00:00.000Z',
      updatedAt: '2026-06-13T17:00:00.000Z'
    }],
    quickOptimizationConfigs: [{
      id: 161,
      uuid: 'icloud-quick-cleanup',
      name: '更清晰',
      description: '优化 iCloud 内容表达',
      prompt: '请优化 iCloud 内容：{{content}}',
      enabled: true,
      sortOrder: 1,
      createdAt: '2026-06-13T17:00:00.000Z',
      updatedAt: '2026-06-13T17:00:00.000Z'
    }],
    aiHistory: [{
      id: 171,
      uuid: 'icloud-ai-history-initial',
      promptUuid: 'icloud-prompt-launch',
      input: '生成 iCloud 发布计划',
      output: '初始 iCloud 发布计划结果',
      provider: 'openai',
      model: 'gpt-4.1',
      createdAt: '2026-06-13T17:02:00.000Z',
      updatedAt: '2026-06-13T17:02:00.000Z'
    }],
    settings: [{
      key: 'theme',
      value: 'dark',
      type: 'string',
      updatedAt: '2026-06-13T17:00:00.000Z'
    }],
    syncTombstones: []
  }
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

function cloneData<T>(data: T): T {
  return JSON.parse(JSON.stringify(data))
}

function getFakeICloudRoot(): string {
  return path.join(tempHome, 'Library/Mobile Documents/com~apple~CloudDocs')
}

function getICloudConfigPath(storageId: string): string {
  return path.join('AI-Gist-iCloud-E2E', storageId)
}

function getFakeICloudFilePath(storageId: string, cloudPath: string): string {
  return path.join(getFakeICloudRoot(), getICloudConfigPath(storageId), cloudPath)
}
