/**
 * 手机端同步 manifest 的条件读取 (#487)
 *
 * 原生 HTTP（iOS 的 CapacitorHttp、Android 的 OkHttp 插件）转发到真实的本地 WebDAV 服务，
 * 按服务器实际收到的请求断言：没变时只发一次条件请求、不下载正文；变了照常下载；
 * 本机刚写完再检查不下载；服务器不认条件请求时退回 PROPFIND；读到备份副本、配置改了时不用缓存。
 */

import http from 'http'
import fsp from 'fs/promises'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TestWebDAVServer, type WebDAVServerOptions } from '../helpers/webdav-server'

const mockPreferences: Record<string, string> = {}
const nativeMocks = vi.hoisted(() => ({
  platform: 'ios',
  httpRequest: vi.fn(),
  webDavPropfind: vi.fn(),
  webDavRequest: vi.fn()
}))

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(({ key }: { key: string }) => Promise.resolve({ value: mockPreferences[key] ?? null })),
    set: vi.fn(({ key, value }: { key: string; value: string }) => {
      mockPreferences[key] = value
      return Promise.resolve()
    })
  }
}))

vi.mock('@capacitor/filesystem', () => ({
  Filesystem: {},
  Directory: { Documents: 'DOCUMENTS', Library: 'LIBRARY' },
  Encoding: { UTF8: 'utf8' }
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => nativeMocks.platform },
  CapacitorHttp: { request: nativeMocks.httpRequest },
  registerPlugin: vi.fn(() => ({}))
}))

vi.mock('@renderer/capacitor-bridge/webdav-native', () => ({
  default: { propfind: nativeMocks.webDavPropfind, request: nativeMocks.webDavRequest }
}))

import { MobileCloudBackupService } from '~/lib/services/mobile-cloud-backup.service'
import { createCloudSyncSnapshot } from '@shared/cloud-sync-engine'
import {
  createEmptyCloudSyncManifest,
  getCloudSyncManifestRevision,
  type CloudSyncManifest
} from '@shared/cloud-sync-manifest'

const MANIFEST_PATH = '/AI-Gist-Backup/sync-manifest.json'

let server: TestWebDAVServer | null = null

function manifestAt(revision: string, title: string): CloudSyncManifest {
  return {
    ...createEmptyCloudSyncManifest('2026-10-29T00:00:00.000Z'),
    latestSnapshot: createCloudSyncSnapshot({
      prompts: [{ id: 1, uuid: 'prompt-1', title, updatedAt: '2026-10-29T00:00:00.000Z' }]
    }, 'device-a', revision)
  }
}

function sendHttp(input: {
  url: string
  method: string
  headers: Record<string, string>
  body?: Buffer
}): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const url = new URL(input.url)
    const headers = { ...input.headers }
    if (input.body) headers['Content-Length'] = String(input.body.length)
    const request = http.request({
      hostname: url.hostname,
      port: Number(url.port),
      path: url.pathname + url.search,
      method: input.method,
      headers
    }, response => {
      const chunks: Buffer[] = []
      response.on('data', (chunk: Buffer) => chunks.push(chunk))
      response.on('end', () => resolve({
        status: response.statusCode ?? 0,
        headers: response.headers,
        body: Buffer.concat(chunks)
      }))
    })
    request.on('error', reject)
    if (input.body) request.write(input.body)
    request.end()
  })
}

function basicAuth(username = '', password = ''): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
}

/** iOS：CapacitorHttp 原样转发；JSON 正文按 CapacitorHttp 的习惯解析好再交回 */
function installIOSProxy() {
  nativeMocks.httpRequest.mockImplementation(async (options: any) => {
    const response = await sendHttp({
      url: options.url,
      method: options.method,
      headers: options.headers ?? {},
      body: options.data === undefined
        ? undefined
        : Buffer.from(options.data, options.dataType === 'file' ? 'base64' : 'utf-8')
    })
    const text = response.body.toString('utf-8')
    let data: unknown = text
    try {
      data = text ? JSON.parse(text) : ''
    } catch {
      // 非 JSON 正文原样交回
    }
    return { status: response.status, headers: response.headers, data }
  })
}

/** Android：OkHttp 插件的 request / propfind 转发 */
function installAndroidProxy() {
  nativeMocks.webDavRequest.mockImplementation(async (options: any) => {
    const response = await sendHttp({
      url: options.url,
      method: options.method,
      headers: {
        ...(options.headers ?? {}),
        Authorization: basicAuth(options.username, options.password),
        ...(options.contentType ? { 'Content-Type': options.contentType } : {})
      },
      body: options.bodyBase64 !== undefined
        ? Buffer.from(options.bodyBase64, 'base64')
        : options.body !== undefined ? Buffer.from(options.body, 'utf-8') : undefined
    })
    return {
      status: response.status,
      headers: response.headers,
      body: response.body.toString(options.responseType === 'base64' ? 'base64' : 'utf-8')
    }
  })
  nativeMocks.webDavPropfind.mockImplementation(async (options: any) => {
    const response = await sendHttp({
      url: options.url,
      method: 'PROPFIND',
      headers: {
        Depth: String(options.depth ?? 1),
        'Content-Type': 'application/xml; charset=utf-8',
        Authorization: basicAuth(options.username, options.password)
      },
      body: Buffer.from('<?xml version="1.0"?><D:propfind xmlns:D="DAV:"><D:prop><D:getetag/><D:resourcetype/></D:prop></D:propfind>')
    })
    return { status: response.status, body: response.body.toString('utf-8') }
  })
}

async function setupStorage(options: WebDAVServerOptions = {}) {
  server = new TestWebDAVServer({ port: 0, ...options })
  await server.start()
  const config = {
    id: 'mobile-storage',
    name: 'WebDAV',
    type: 'webdav' as const,
    enabled: true,
    url: `${server.baseUrl}/`,
    username: 'testuser',
    password: 'testpass',
    createdAt: '2026-10-29T00:00:00.000Z',
    updatedAt: '2026-10-29T00:00:00.000Z'
  }
  mockPreferences.cloud_backup_configs = JSON.stringify([config])
  return config
}

/** 每台设备一个独立的服务实例（单例只给应用本身用） */
function createDevice(): MobileCloudBackupService {
  return new (MobileCloudBackupService as any)()
}

function manifestRequests() {
  return server!.requests.filter(request => request.path === MANIFEST_PATH)
}

function clearRequests() {
  server!.requests.length = 0
}

describe.each(['ios', 'android'])('mobile sync manifest conditional read on %s (#487)', platform => {
  beforeEach(() => {
    Object.keys(mockPreferences).forEach(key => delete mockPreferences[key])
    vi.clearAllMocks()
    nativeMocks.platform = platform
    installIOSProxy()
    installAndroidProxy()
  })

  afterEach(async () => {
    await server?.stop()
    server = null
  })

  it('sends one conditional GET and downloads nothing when the cloud has not changed', async () => {
    const config = await setupStorage()
    const device = createDevice()
    expect(await device.saveCloudSyncManifest(config.id, manifestAt('rev-1', 'First'))).toMatchObject({ success: true })

    const reader = createDevice()
    const first = await reader.getCloudSyncManifest(config.id)
    expect(getCloudSyncManifestRevision(first)).toBe('rev-1')
    expect(reader.canCheckSyncManifestCheaply(config.id)).toBe(true)

    clearRequests()
    const second = await reader.getCloudSyncManifest(config.id)
    expect(second).toEqual(first)
    expect(manifestRequests()).toEqual([
      expect.objectContaining({ method: 'GET', status: 304, bodyBytes: 0, ifNoneMatch: expect.any(String) })
    ])
  })

  it('downloads the new manifest when another device changed it, then caches that one', async () => {
    const config = await setupStorage()
    const device = createDevice()
    const otherDevice = createDevice()
    await device.saveCloudSyncManifest(config.id, manifestAt('rev-1', 'First'))
    await device.getCloudSyncManifest(config.id)

    expect(await otherDevice.saveCloudSyncManifest(config.id, manifestAt('rev-2', 'Edited elsewhere'), {
      expectedRevision: 'rev-1'
    })).toMatchObject({ success: true })

    clearRequests()
    const changed = await device.getCloudSyncManifest(config.id)
    expect(getCloudSyncManifestRevision(changed)).toBe('rev-2')
    expect(manifestRequests()).toEqual([
      expect.objectContaining({ method: 'GET', status: 200, ifNoneMatch: expect.any(String) })
    ])

    clearRequests()
    expect(getCloudSyncManifestRevision(await device.getCloudSyncManifest(config.id))).toBe('rev-2')
    expect(manifestRequests()).toEqual([expect.objectContaining({ method: 'GET', status: 304, bodyBytes: 0 })])
  })

  it('does not download its own upload again, before or after writing', async () => {
    const config = await setupStorage()
    const device = createDevice()
    await device.saveCloudSyncManifest(config.id, manifestAt('rev-1', 'First'))
    await device.getCloudSyncManifest(config.id)

    // 写入前核对 revision 也是条件读取：云端没变就不下载
    clearRequests()
    expect(await device.saveCloudSyncManifest(config.id, manifestAt('rev-2', 'Second edit'), {
      expectedRevision: 'rev-1'
    })).toMatchObject({ success: true })
    expect(manifestRequests().filter(request => request.method === 'GET')).toEqual([
      expect.objectContaining({ status: 304, bodyBytes: 0 })
    ])

    // PUT 响应里的 ETag 连同刚写的内容一起缓存：下一次检查不下载
    clearRequests()
    const afterUpload = await device.getCloudSyncManifest(config.id)
    expect(afterUpload.latestSnapshot?.data.prompts[0]).toMatchObject({ title: 'Second edit' })
    expect(manifestRequests()).toEqual([expect.objectContaining({ method: 'GET', status: 304, bodyBytes: 0 })])
  })

  it('still refuses a stale write when the cloud changed after the cached read', async () => {
    const config = await setupStorage()
    const device = createDevice()
    const otherDevice = createDevice()
    await device.saveCloudSyncManifest(config.id, manifestAt('rev-1', 'First'))
    await device.getCloudSyncManifest(config.id)
    await otherDevice.saveCloudSyncManifest(config.id, manifestAt('rev-other', 'Elsewhere'), { expectedRevision: 'rev-1' })

    expect(await device.saveCloudSyncManifest(config.id, manifestAt('rev-2', 'Stale'), { expectedRevision: 'rev-1' }))
      .toMatchObject({ success: false, conflict: true })
    expect(getCloudSyncManifestRevision(await createDevice().getCloudSyncManifest(config.id))).toBe('rev-other')
  })

  it('falls back to comparing the PROPFIND ETag when the server ignores If-None-Match', async () => {
    const config = await setupStorage({ conditionalGet: false })
    const device = createDevice()
    const otherDevice = createDevice()
    await device.saveCloudSyncManifest(config.id, manifestAt('rev-1', 'First'))

    clearRequests()
    await device.getCloudSyncManifest(config.id)
    expect(manifestRequests()).toEqual([
      expect.objectContaining({ method: 'GET', status: 200, ifNoneMatch: expect.any(String) })
    ])

    clearRequests()
    expect(getCloudSyncManifestRevision(await device.getCloudSyncManifest(config.id))).toBe('rev-1')
    expect(manifestRequests().map(request => request.method)).toEqual(['PROPFIND'])

    await otherDevice.saveCloudSyncManifest(config.id, manifestAt('rev-2', 'Edited elsewhere'), { expectedRevision: 'rev-1' })
    clearRequests()
    expect(getCloudSyncManifestRevision(await device.getCloudSyncManifest(config.id))).toBe('rev-2')
    expect(manifestRequests().map(request => `${request.method} ${request.status}`)).toEqual(['PROPFIND 207', 'GET 200'])

    clearRequests()
    expect(getCloudSyncManifestRevision(await device.getCloudSyncManifest(config.id))).toBe('rev-2')
    expect(manifestRequests().map(request => request.method)).toEqual(['PROPFIND'])
  })

  it('stops using the cache after falling back to the backup copy or when the config changes', async () => {
    const config = await setupStorage()
    const device = createDevice()
    await device.saveCloudSyncManifest(config.id, manifestAt('rev-1', 'First'))
    await device.getCloudSyncManifest(config.id)

    await fsp.writeFile(path.join(server!.rootDir, 'AI-Gist-Backup', 'sync-manifest.json'), '{"broken":')
    expect(getCloudSyncManifestRevision(await device.getCloudSyncManifest(config.id))).toBe('rev-1')
    expect(device.canCheckSyncManifestCheaply(config.id)).toBe(false)
    clearRequests()
    await device.getCloudSyncManifest(config.id)
    expect(manifestRequests().filter(request => request.method === 'GET')[0].ifNoneMatch).toBeUndefined()

    await device.saveCloudSyncManifest(config.id, manifestAt('rev-2', 'Repaired'))
    expect(device.canCheckSyncManifestCheaply(config.id)).toBe(true)
    expect(await device.updateStorageConfig(config.id, { name: 'renamed' })).toMatchObject({ success: true })
    expect(device.canCheckSyncManifestCheaply(config.id)).toBe(false)
    clearRequests()
    await device.getCloudSyncManifest(config.id)
    expect(manifestRequests().filter(request => request.method === 'GET')[0].ifNoneMatch).toBeUndefined()
  })
})
