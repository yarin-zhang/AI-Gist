/**
 * 桌面端同步 manifest 的条件读取 (#487)
 *
 * 用真实的本地 WebDAV 服务，按服务器实际收到的请求断言：云端没变时只发一次条件请求、不下载正文；
 * 变了照常下载并更新缓存；本机刚写完再检查不下载；服务器不认条件请求时退回 PROPFIND 比对 ETag；
 * ETag 缺失、读到备份副本、存储配置被修改 / 删除时都不用缓存。
 */

// @vitest-environment node

import fsp from 'fs/promises'
import path from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TestWebDAVServer, type WebDAVServerOptions } from '../helpers/webdav-server'
import type { WebDAVConfig } from '../../src/shared/types/cloud-backup'
import { createCloudSyncSnapshot } from '../../src/shared/cloud-sync-engine'
import {
  createEmptyCloudSyncManifest,
  getCloudSyncManifestRevision,
  type CloudSyncManifest
} from '../../src/shared/cloud-sync-manifest'

const electronMock = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => any>()
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: any[]) => any) => {
      electronMock.handlers.set(channel, handler)
    }
  },
  BrowserWindow: {
    getAllWindows: () => []
  }
}))

import { CloudBackupManager } from '../../src/main/cloud/cloud-backup-manager'
import { WebDAVProvider } from '../../src/main/cloud/webdav-provider'

const MANIFEST_PATH = '/AI-Gist-Backup/sync-manifest.json'
const BACKUP_PATH = '/AI-Gist-Backup/sync-manifest.backup.json'

let server: TestWebDAVServer | null = null
let config: WebDAVConfig
let storageDir = ''

function manifestAt(revision: string, title: string): CloudSyncManifest {
  return {
    ...createEmptyCloudSyncManifest('2026-10-29T00:00:00.000Z'),
    latestSnapshot: createCloudSyncSnapshot({
      prompts: [{ id: 1, uuid: 'prompt-1', title, updatedAt: '2026-10-29T00:00:00.000Z' }]
    }, 'device-a', revision)
  }
}

async function startServer(options: WebDAVServerOptions = {}): Promise<TestWebDAVServer> {
  server = new TestWebDAVServer({ port: 0, ...options })
  await server.start()
  storageDir = Math.random().toString(36).slice(2)
  config = {
    id: `storage-${storageDir}`,
    name: 'test',
    type: 'webdav',
    enabled: true,
    url: `${server.baseUrl}/${storageDir}/`,
    username: 'testuser',
    password: 'testpass',
    createdAt: '2026-10-29T00:00:00.000Z',
    updatedAt: '2026-10-29T00:00:00.000Z'
  }
  const setup = new WebDAVProvider({ ...config, url: `${server.baseUrl}/` })
  await setup.createDirectory(`/${storageDir}`)
  return server
}

/** 一台设备：一个 CloudBackupManager，配置只在内存里，不读写用户目录下的配置文件 */
function createDevice(deviceConfig: () => WebDAVConfig = () => config) {
  const manager = new CloudBackupManager({} as any)
  const internal = manager as any
  internal.loadConfigs = async () => {
    internal.storageConfigs.clear()
    internal.storageConfigs.set(deviceConfig().id, deviceConfig())
  }
  internal.saveConfigs = async () => undefined
  internal.testAndSaveConfig = async (updated: WebDAVConfig) => {
    internal.storageConfigs.set(updated.id, updated)
  }
  // 每个 manager 构造时都会重新注册 IPC，这里取走属于这台设备的处理函数
  const handlers = new Map(electronMock.handlers)

  return {
    read: async (): Promise<{ manifest: CloudSyncManifest; cheapCheckAvailable: boolean }> => {
      const result = await handlers.get('cloud:get-sync-manifest')!(null, deviceConfig().id)
      expect(result).toMatchObject({ success: true })
      return result
    },
    save: (manifest: CloudSyncManifest, expectedRevision: string | null) =>
      handlers.get('cloud:save-sync-manifest')!(null, deviceConfig().id, manifest, { expectedRevision }),
    updateConfig: (changes: Partial<WebDAVConfig>) =>
      handlers.get('cloud:update-storage-config')!(null, deviceConfig().id, changes),
    deleteConfig: () => handlers.get('cloud:delete-storage-config')!(null, deviceConfig().id)
  }
}

/** 只看 manifest 主文件 / 备份副本相关的请求 */
function manifestRequests() {
  return server!.requests
    .filter(request => request.path.endsWith(MANIFEST_PATH) || request.path.endsWith(BACKUP_PATH))
    .map(request => ({
      ...request,
      path: request.path.slice(`/${storageDir}`.length)
    }))
}

function clearRequests() {
  server!.requests.length = 0
}

describe('desktop sync manifest conditional read (#487)', () => {
  afterEach(async () => {
    await server?.stop()
    server = null
  })

  it('sends one conditional GET and downloads nothing when the cloud has not changed', async () => {
    await startServer()
    const writer = createDevice()
    await writer.read()
    await writer.save(manifestAt('rev-1', 'First'), null)

    const device = createDevice()
    const first = await device.read()
    expect(getCloudSyncManifestRevision(first.manifest)).toBe('rev-1')
    expect(first.cheapCheckAvailable).toBe(true)

    clearRequests()
    const second = await device.read()

    expect(second.manifest).toEqual(first.manifest)
    expect(second.cheapCheckAvailable).toBe(true)
    expect(manifestRequests()).toEqual([
      expect.objectContaining({ method: 'GET', path: MANIFEST_PATH, status: 304, bodyBytes: 0, ifNoneMatch: expect.any(String) })
    ])
  })

  it('downloads the new manifest when another device changed it, then caches that one', async () => {
    await startServer()
    const device = createDevice()
    const otherDevice = createDevice()
    await device.read()
    await device.save(manifestAt('rev-1', 'First'), null)
    await device.read()

    await otherDevice.read()
    expect(await otherDevice.save(manifestAt('rev-2', 'Edited elsewhere'), 'rev-1')).toMatchObject({ success: true })

    clearRequests()
    const changed = await device.read()
    expect(getCloudSyncManifestRevision(changed.manifest)).toBe('rev-2')
    expect(changed.manifest.latestSnapshot?.data.prompts[0]).toMatchObject({ title: 'Edited elsewhere' })
    expect(manifestRequests()).toEqual([
      expect.objectContaining({ method: 'GET', path: MANIFEST_PATH, status: 200, ifNoneMatch: expect.any(String) })
    ])
    expect(manifestRequests()[0].bodyBytes).toBeGreaterThan(0)

    clearRequests()
    const unchanged = await device.read()
    expect(getCloudSyncManifestRevision(unchanged.manifest)).toBe('rev-2')
    expect(manifestRequests()).toEqual([
      expect.objectContaining({ method: 'GET', status: 304, bodyBytes: 0 })
    ])

    // 新缓存的 ETag 也能继续用来条件写，不必先读一遍
    clearRequests()
    expect(await device.save(manifestAt('rev-3', 'Third'), 'rev-2')).toMatchObject({ success: true })
    expect(manifestRequests().filter(request => request.method === 'GET')).toEqual([])
  })

  it('does not download its own upload again on the next check', async () => {
    await startServer()
    const device = createDevice()
    await device.read()
    await device.save(manifestAt('rev-1', 'First'), null)

    clearRequests()
    const afterFirstUpload = await device.read()
    expect(getCloudSyncManifestRevision(afterFirstUpload.manifest)).toBe('rev-1')
    expect(manifestRequests()).toEqual([
      expect.objectContaining({ method: 'GET', status: 304, bodyBytes: 0 })
    ])

    // 用记下的 ETag 直接条件写，再检查一次也不下载
    await device.save(manifestAt('rev-2', 'Second edit'), 'rev-1')
    clearRequests()
    const afterSecondUpload = await device.read()
    expect(getCloudSyncManifestRevision(afterSecondUpload.manifest)).toBe('rev-2')
    expect(afterSecondUpload.manifest.latestSnapshot?.data.prompts[0]).toMatchObject({ title: 'Second edit' })
    expect(manifestRequests()).toEqual([
      expect.objectContaining({ method: 'GET', status: 304, bodyBytes: 0 })
    ])
  })

  it('falls back to comparing the PROPFIND ETag when the server ignores If-None-Match', async () => {
    await startServer({ conditionalGet: false })
    const device = createDevice()
    const otherDevice = createDevice()
    await device.read()
    await device.save(manifestAt('rev-1', 'First'), null)

    // 第一次条件读取被服务器忽略：照常拿到内容，同时记下这台服务器不认 If-None-Match
    clearRequests()
    expect(getCloudSyncManifestRevision((await device.read()).manifest)).toBe('rev-1')
    expect(manifestRequests()).toEqual([
      expect.objectContaining({ method: 'GET', status: 200, ifNoneMatch: expect.any(String) })
    ])

    // 之后没变时只发 PROPFIND，不 GET
    clearRequests()
    const unchanged = await device.read()
    expect(getCloudSyncManifestRevision(unchanged.manifest)).toBe('rev-1')
    expect(unchanged.cheapCheckAvailable).toBe(true)
    expect(manifestRequests().map(request => request.method)).toEqual(['PROPFIND'])

    // 变了：PROPFIND 比对不上，再整份 GET
    await otherDevice.read()
    await otherDevice.save(manifestAt('rev-2', 'Edited elsewhere'), 'rev-1')
    clearRequests()
    const changed = await device.read()
    expect(getCloudSyncManifestRevision(changed.manifest)).toBe('rev-2')
    expect(manifestRequests().map(request => `${request.method} ${request.status}`)).toEqual(['PROPFIND 207', 'GET 200'])

    clearRequests()
    expect(getCloudSyncManifestRevision((await device.read()).manifest)).toBe('rev-2')
    expect(manifestRequests().map(request => request.method)).toEqual(['PROPFIND'])
  })

  it('always downloads in full when the server has no ETags at all', async () => {
    await startServer({ etagFormat: 'none' })
    const device = createDevice()
    await device.read()
    await device.save(manifestAt('rev-1', 'First'), null)

    for (let index = 0; index < 2; index += 1) {
      clearRequests()
      const result = await device.read()
      expect(getCloudSyncManifestRevision(result.manifest)).toBe('rev-1')
      expect(result.cheapCheckAvailable).toBe(false)
      const gets = manifestRequests().filter(request => request.method === 'GET')
      expect(gets).toEqual([expect.objectContaining({ status: 200 })])
      expect(gets[0].ifNoneMatch).toBeUndefined()
      expect(gets[0].bodyBytes).toBeGreaterThan(0)
    }
  })

  it('stops using the cache after falling back to the backup copy', async () => {
    const webdav = await startServer()
    const device = createDevice()
    await device.read()
    await device.save(manifestAt('rev-1', 'First'), null)
    await device.read()

    // 主文件被写坏：读到的是备份副本
    const primaryFile = path.join(webdav.rootDir, storageDir, 'AI-Gist-Backup', 'sync-manifest.json')
    await fsp.writeFile(primaryFile, '{"broken":')
    const fromBackup = await device.read()
    expect(getCloudSyncManifestRevision(fromBackup.manifest)).toBe('rev-1')
    expect(fromBackup.cheapCheckAvailable).toBe(false)

    // 之后不再拿旧 ETag 做条件读取，也不会把缓存当成主文件的内容
    clearRequests()
    await expect(device.read()).resolves.toMatchObject({ manifest: expect.any(Object) })
    const primaryGets = manifestRequests().filter(request => request.method === 'GET' && request.path === MANIFEST_PATH)
    expect(primaryGets).toHaveLength(1)
    expect(primaryGets[0].ifNoneMatch).toBeUndefined()
  })

  it('stops using the cache when the storage points somewhere else or its config is edited or deleted', async () => {
    await startServer()
    let currentConfig = config
    const device = createDevice(() => currentConfig)
    await device.read()
    await device.save(manifestAt('rev-1', 'First'), null)

    // 配置文件里地址变了（没经过「编辑存储」）：指向另一个目录，缓存不能用
    const otherDir = `${storageDir}-moved`
    await new WebDAVProvider({ ...config, url: `${server!.baseUrl}/` }).createDirectory(`/${otherDir}`)
    currentConfig = { ...config, url: `${server!.baseUrl}/${otherDir}/` }
    clearRequests()
    const moved = await device.read()
    expect(getCloudSyncManifestRevision(moved.manifest)).toBeNull()
    expect(server!.requests.filter(request => request.method === 'GET').every(request => !request.ifNoneMatch)).toBe(true)

    // 回到原来的地址：重新整份读一次，之后才又能条件读取
    currentConfig = config
    clearRequests()
    await device.read()
    expect(manifestRequests().filter(request => request.method === 'GET')[0].ifNoneMatch).toBeUndefined()
    clearRequests()
    await device.read()
    expect(manifestRequests()).toEqual([expect.objectContaining({ method: 'GET', status: 304 })])

    // 编辑存储配置后缓存作废
    expect(await device.updateConfig({ name: 'renamed' })).toMatchObject({ success: true })
    clearRequests()
    await device.read()
    expect(manifestRequests().filter(request => request.method === 'GET')[0].ifNoneMatch).toBeUndefined()

    // 删除存储配置后缓存作废（重新添加同一个 id 时不会沿用）
    await device.read()
    expect(await device.deleteConfig()).toMatchObject({ success: true })
    clearRequests()
    await device.read()
    expect(manifestRequests().filter(request => request.method === 'GET')[0].ifNoneMatch).toBeUndefined()
  })
})
