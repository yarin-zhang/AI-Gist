/**
 * 网页端同步 manifest 的条件读取 (#487)
 *
 * 浏览器（WebCloudBackupService）→ Web 后端（scripts/web-server.js）→ 真实的本地 WebDAV 服务。
 * 浏览器把上次拿到的 ETag 交给后端，后端带 If-None-Match 读主文件；没变时只回「没变」，
 * 不再把整份 manifest 传给浏览器。旧版后端直接返回 manifest 时照常可用。
 */

// @vitest-environment node

import http from 'http'
import fsp from 'fs/promises'
import path from 'path'
import type { AddressInfo } from 'net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TestWebDAVServer, type WebDAVServerOptions } from '../helpers/webdav-server'
import { WebCloudBackupService } from '~/lib/services/web-cloud-backup.service'
import { createCloudSyncSnapshot } from '@shared/cloud-sync-engine'
import {
  createEmptyCloudSyncManifest,
  getCloudSyncManifestRevision,
  type CloudSyncManifest
} from '@shared/cloud-sync-manifest'

const MANIFEST_PATH = '/AI-Gist-Backup/sync-manifest.json'

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
  clear(): void {
    this.values.clear()
  }
}

function manifestAt(revision: string, title: string): CloudSyncManifest {
  return {
    ...createEmptyCloudSyncManifest('2026-10-29T00:00:00.000Z'),
    latestSnapshot: createCloudSyncSnapshot({
      prompts: [{ id: 1, uuid: 'prompt-1', title, updatedAt: '2026-10-29T00:00:00.000Z' }]
    }, 'device-a', revision)
  }
}

const cleanups: (() => Promise<void> | void)[] = []
let webdav: TestWebDAVServer

/** 起 WebDAV 服务和 Web 后端，浏览器的相对路径请求转发给后端；记下后端每次 get-sync-manifest 回给浏览器的字节数 */
async function setup(options: WebDAVServerOptions = {}, overrideApi?: (path: string, body: any) => unknown) {
  webdav = new TestWebDAVServer({ port: 0, ...options })
  await webdav.start()
  cleanups.push(() => webdav.stop())

  const webServerModule: any = await import('../../scripts/web-server.js')
  const createWebRequestHandler = webServerModule.createWebRequestHandler ||
    webServerModule.default.createWebRequestHandler
  const apiServer = http.createServer(createWebRequestHandler({ serveStaticFiles: false }))
  await new Promise<void>(resolve => apiServer.listen(0, '127.0.0.1', () => resolve()))
  cleanups.push(() => new Promise<void>(resolve => apiServer.close(() => resolve())))
  const apiBaseUrl = `http://127.0.0.1:${(apiServer.address() as AddressInfo).port}`

  const config = {
    id: 'web-storage',
    name: 'WebDAV',
    type: 'webdav' as const,
    enabled: true,
    url: webdav.baseUrl,
    username: 'testuser',
    password: 'testpass',
    createdAt: '2026-10-29T00:00:00.000Z',
    updatedAt: '2026-10-29T00:00:00.000Z'
  }
  const storage = new MemoryStorage()
  storage.setItem('ai-gist:web:cloud-storage-configs', JSON.stringify([config]))
  const manifestResponseBytes: number[] = []
  const originalFetch = globalThis.fetch
  const hadLocalStorage = Object.prototype.hasOwnProperty.call(globalThis, 'localStorage')
  const previousLocalStorage = (globalThis as any).localStorage
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage })
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: async (input: RequestInfo | URL, init?: RequestInit) => {
      if (typeof input === 'string' && overrideApi) {
        const data = overrideApi(input, JSON.parse(String(init?.body || '{}')))
        if (data !== undefined) {
          return new Response(JSON.stringify({ success: true, data }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          })
        }
      }
      const url = typeof input === 'string' && input.startsWith('/') ? `${apiBaseUrl}${input}` : input
      const response = await originalFetch(url, init)
      if (typeof input === 'string' && input.endsWith('/get-sync-manifest')) {
        const text = await response.clone().text()
        manifestResponseBytes.push(Buffer.byteLength(text))
      }
      return response
    }
  })
  cleanups.push(() => {
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: originalFetch })
    if (hadLocalStorage) {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: previousLocalStorage })
    } else {
      delete (globalThis as any).localStorage
    }
  })

  return {
    config,
    manifestResponseBytes,
    createBrowser: () => new (WebCloudBackupService as any)() as WebCloudBackupService
  }
}

function manifestRequests() {
  return webdav.requests.filter(request => request.path === MANIFEST_PATH)
}

describe('web sync manifest conditional read (#487)', () => {
  afterEach(async () => {
    while (cleanups.length > 0) {
      await cleanups.pop()!()
    }
  })

  it('only tells the browser "not modified" when the cloud has not changed', async () => {
    const { config, manifestResponseBytes, createBrowser } = await setup()
    const browser = createBrowser()
    expect(await browser.saveCloudSyncManifest(config.id, manifestAt('rev-1', 'First'))).toMatchObject({ success: true })

    const first = await browser.getCloudSyncManifest(config.id)
    expect(getCloudSyncManifestRevision(first)).toBe('rev-1')
    expect(browser.canCheckSyncManifestCheaply(config.id)).toBe(true)

    webdav.requests.length = 0
    manifestResponseBytes.length = 0
    const second = await browser.getCloudSyncManifest(config.id)
    expect(second).toEqual(first)
    expect(manifestRequests()).toEqual([
      expect.objectContaining({ method: 'GET', status: 304, bodyBytes: 0, ifNoneMatch: expect.any(String) })
    ])
    // 后端回给浏览器的只有「没变」和 ETag
    expect(manifestResponseBytes).toHaveLength(1)
    expect(manifestResponseBytes[0]).toBeLessThan(200)
  })

  it('downloads the new manifest when it changed, then caches that one', async () => {
    const { config, createBrowser } = await setup()
    const browser = createBrowser()
    const otherBrowser = createBrowser()
    await browser.saveCloudSyncManifest(config.id, manifestAt('rev-1', 'First'))
    await browser.getCloudSyncManifest(config.id)
    await otherBrowser.saveCloudSyncManifest(config.id, manifestAt('rev-2', 'Edited elsewhere'), { expectedRevision: 'rev-1' })

    webdav.requests.length = 0
    const changed = await browser.getCloudSyncManifest(config.id)
    expect(getCloudSyncManifestRevision(changed)).toBe('rev-2')
    expect(manifestRequests()).toEqual([
      expect.objectContaining({ method: 'GET', status: 200, ifNoneMatch: expect.any(String) })
    ])

    webdav.requests.length = 0
    expect(getCloudSyncManifestRevision(await browser.getCloudSyncManifest(config.id))).toBe('rev-2')
    expect(manifestRequests()).toEqual([expect.objectContaining({ method: 'GET', status: 304 })])
  })

  it('still spares the browser the download when the WebDAV server ignores If-None-Match', async () => {
    const { config, manifestResponseBytes, createBrowser } = await setup({ conditionalGet: false })
    const browser = createBrowser()
    await browser.saveCloudSyncManifest(config.id, manifestAt('rev-1', 'First'))
    await browser.getCloudSyncManifest(config.id)

    webdav.requests.length = 0
    manifestResponseBytes.length = 0
    expect(getCloudSyncManifestRevision(await browser.getCloudSyncManifest(config.id))).toBe('rev-1')
    // 后端和 WebDAV 之间仍是整份 GET，但回给浏览器的只有「没变」
    expect(manifestRequests()).toEqual([expect.objectContaining({ method: 'GET', status: 200 })])
    expect(manifestResponseBytes[0]).toBeLessThan(200)
  })

  it('drops the cache when only the backup copy could be read', async () => {
    const { config, createBrowser } = await setup()
    const browser = createBrowser()
    await browser.saveCloudSyncManifest(config.id, manifestAt('rev-1', 'First'))
    await browser.getCloudSyncManifest(config.id)
    expect(browser.canCheckSyncManifestCheaply(config.id)).toBe(true)

    // 后端读主文件失败时会打一条「尝试读取备份副本」的警告，这里是预期的
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    cleanups.push(() => warn.mockRestore())
    await fsp.writeFile(path.join(webdav.rootDir, 'AI-Gist-Backup', 'sync-manifest.json'), '{"broken":')
    expect(getCloudSyncManifestRevision(await browser.getCloudSyncManifest(config.id))).toBe('rev-1')
    expect(browser.canCheckSyncManifestCheaply(config.id)).toBe(false)

    webdav.requests.length = 0
    await browser.getCloudSyncManifest(config.id)
    expect(manifestRequests().filter(request => request.method === 'GET')[0].ifNoneMatch).toBeUndefined()
  })

  it('keeps working against an older Web backend that returns the manifest directly', async () => {
    const legacyManifest = manifestAt('rev-legacy', 'Legacy backend')
    const requests: any[] = []
    const { config, createBrowser } = await setup({}, (apiPath, body) => {
      if (!apiPath.endsWith('/get-sync-manifest')) return undefined
      requests.push(body)
      return legacyManifest
    })
    const browser = createBrowser()

    expect(getCloudSyncManifestRevision(await browser.getCloudSyncManifest(config.id))).toBe('rev-legacy')
    expect(await browser.getCloudSyncManifest(config.id)).toEqual(legacyManifest)
    expect(browser.canCheckSyncManifestCheaply(config.id)).toBe(false)
    expect(requests.every(body => body.ifNoneMatch === undefined)).toBe(true)
  })
})
