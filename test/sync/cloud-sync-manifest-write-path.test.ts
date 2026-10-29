/**
 * 桌面端同步 manifest 的读写请求数 (#486)
 *
 * 用真实的本地 WebDAV 服务，记录主进程实际发出的每个 HTTP 请求。
 */

// @vitest-environment node

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { TestWebDAVServer } from '../helpers/webdav-server'
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

const CLIENT_METHODS: [string, string][] = [
  ['getFileContents', 'GET'],
  ['putFileContents', 'PUT'],
  ['stat', 'PROPFIND'],
  ['getDirectoryContents', 'PROPFIND'],
  ['createDirectory', 'MKCOL']
]

let server: TestWebDAVServer
let config: WebDAVConfig

function manifestAt(revision: string, title: string): CloudSyncManifest {
  return {
    ...createEmptyCloudSyncManifest('2026-10-29T00:00:00.000Z'),
    latestSnapshot: createCloudSyncSnapshot({
      prompts: [{ id: 1, uuid: 'prompt-1', title, updatedAt: '2026-10-29T00:00:00.000Z' }]
    }, 'device-a', revision)
  }
}

/** 一台设备：一个 CloudBackupManager，记下它发出的每个请求 */
function createDevice(options: { readEtag?: (etag?: string) => string | undefined } = {}) {
  const manager = new CloudBackupManager({} as any)
  const requests: string[] = []
  const internal = manager as any
  internal.loadConfigs = async () => undefined
  internal.getStorageConfig = () => config
  internal.createProvider = () => {
    const provider = new WebDAVProvider(config) as any
    provider.clientReady = provider.clientReady.then(() => {
      for (const [method, verb] of CLIENT_METHODS) {
        const original = provider.client[method].bind(provider.client)
        provider.client[method] = (...args: any[]) => {
          requests.push(`${verb} ${args[0]}`)
          return original(...args)
        }
      }
    })
    if (options.readEtag) {
      const readFileWithInfo = provider.readFileWithInfo.bind(provider)
      provider.readFileWithInfo = async (path: string) => {
        const result = await readFileWithInfo(path)
        return { ...result, etag: options.readEtag!(result.etag) }
      }
    }
    return provider
  }
  const save = electronMock.handlers.get('cloud:save-sync-manifest')!

  return {
    requests,
    read: (): Promise<CloudSyncManifest> => internal.readCloudSyncManifest(config.id),
    save: (manifest: CloudSyncManifest, expectedRevision: string | null) =>
      save(null, config.id, manifest, { expectedRevision })
  }
}

async function readCloudRevision(): Promise<string | null> {
  const provider = new WebDAVProvider(config)
  const data = await provider.readFile('/AI-Gist-Backup/sync-manifest.json')
  return getCloudSyncManifestRevision(JSON.parse(data.toString('utf-8')))
}

describe('desktop sync manifest write path (#486)', () => {
  beforeAll(async () => {
    server = new TestWebDAVServer({ port: 0 })
    await server.start()
  })

  afterAll(async () => {
    await server.stop()
  })

  beforeEach(async () => {
    config = {
      id: `storage-${Math.random().toString(36).slice(2)}`,
      name: 'test',
      type: 'webdav',
      enabled: true,
      url: `${server.baseUrl}/${Math.random().toString(36).slice(2)}/`,
      username: 'testuser',
      password: 'testpass',
      createdAt: '2026-10-29T00:00:00.000Z',
      updatedAt: '2026-10-29T00:00:00.000Z'
    }
    // 每个用例一个独立的 WebDAV 子目录
    const setup = new WebDAVProvider({ ...config, url: `${server.baseUrl}/` })
    await setup.createDirectory(new URL(config.url).pathname)
  })

  it('uploads a change with one GET, one conditional PUT, one PROPFIND and one backup PUT', async () => {
    const device = createDevice()
    await device.read()
    expect(await device.save(manifestAt('rev-1', 'First'), null)).toMatchObject({ success: true, verified: true })

    device.requests.length = 0
    const remote = await device.read()
    const result = await device.save(manifestAt('rev-2', 'Second edit'), getCloudSyncManifestRevision(remote))

    expect(result).toEqual({ success: true, verified: true })
    expect(device.requests).toEqual([
      'GET /AI-Gist-Backup/sync-manifest.json',
      'PUT /AI-Gist-Backup/sync-manifest.json',
      'PROPFIND /AI-Gist-Backup/sync-manifest.json',
      'PUT /AI-Gist-Backup/sync-manifest.backup.json'
    ])
    expect(await readCloudRevision()).toBe('rev-2')
  })

  it('does not check the sync directory when uploading right after the first read of an app run', async () => {
    const firstRun = createDevice()
    await firstRun.read()
    await firstRun.save(manifestAt('rev-1', 'First'), null)

    // 重新启动应用：新的 manager，先读一次再上传
    const nextRun = createDevice()
    await nextRun.read()
    nextRun.requests.length = 0
    expect(await nextRun.save(manifestAt('rev-2', 'Second edit'), 'rev-1')).toMatchObject({ success: true })

    expect(nextRun.requests).toEqual([
      'PUT /AI-Gist-Backup/sync-manifest.json',
      'PROPFIND /AI-Gist-Backup/sync-manifest.json',
      'PUT /AI-Gist-Backup/sync-manifest.backup.json'
    ])
  })

  it('keeps uploading with the ETag it wrote last, without reading again in between', async () => {
    const device = createDevice()
    await device.read()
    await device.save(manifestAt('rev-1', 'First'), null)

    device.requests.length = 0
    await device.save(manifestAt('rev-2', 'Second edit'), 'rev-1')

    expect(device.requests.filter(request => request.startsWith('GET'))).toEqual([])
    expect(await readCloudRevision()).toBe('rev-2')
  })

  it('refuses to overwrite a manifest another device wrote after this device read it', async () => {
    const device = createDevice()
    const otherDevice = createDevice()
    await device.read()
    await device.save(manifestAt('rev-1', 'First'), null)
    await device.read()

    await otherDevice.read()
    expect(await otherDevice.save(manifestAt('rev-other', 'Written by the other device'), 'rev-1'))
      .toMatchObject({ success: true })

    const result = await device.save(manifestAt('rev-2', 'Stale edit'), 'rev-1')

    expect(result).toMatchObject({ success: false, conflict: true, currentRevision: 'rev-other' })
    expect(await readCloudRevision()).toBe('rev-other')
  })

  it('falls back once when the server rejects the ETag from GET, then stops wasting uploads on it', async () => {
    // GET 头里的 ETag 写法和 PROPFIND 不一样（去掉了引号），服务器按字面比较 If-Match 会拒绝
    const device = createDevice({ readEtag: etag => etag?.replace(/"/g, '') })
    await device.read()
    await device.save(manifestAt('rev-1', 'First'), null)
    await device.read()

    device.requests.length = 0
    expect(await device.save(manifestAt('rev-2', 'Second edit'), 'rev-1')).toMatchObject({ success: true })
    expect(device.requests.filter(request => request.startsWith('PUT'))).toHaveLength(3)

    await device.read()
    device.requests.length = 0
    expect(await device.save(manifestAt('rev-3', 'Third edit'), 'rev-2')).toMatchObject({ success: true })
    expect(device.requests.filter(request => request.startsWith('PUT'))).toHaveLength(2)
    expect(await readCloudRevision()).toBe('rev-3')
  })
})
