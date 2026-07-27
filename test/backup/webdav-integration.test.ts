/**
 * WebDAV 集成测试
 * 使用内置 Node.js HTTP 服务器（TestWebDAVServer）进行真实 HTTP 通信测试
 * 覆盖：连接验证、文件读写删除、目录操作、备份/恢复完整流程
 * 适用平台：iOS / Android（MobileCloudBackupService）、桌面端（WebDAVProvider）
 */

// @vitest-environment node

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { JSDOM } from 'jsdom'
import fsp from 'fs/promises'
import path from 'path'
import type { AddressInfo } from 'net'
import { TestWebDAVServer } from '../helpers/webdav-server'
import { asyncTestHelpers, testDataGenerators } from '../helpers/test-utils'

// ---- Node.js 环境下 DOMParser polyfill（由 jsdom 提供）----
if (typeof DOMParser === 'undefined') {
  (global as any).DOMParser = class {
    parseFromString(str: string, type: string) {
      return new JSDOM(str, { contentType: type }).window.document
    }
  }
}

// ---- mock Capacitor（移动端路径需要） ----

const mockPreferences: Record<string, string> = {}

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(({ key }: { key: string }) =>
      Promise.resolve({ value: mockPreferences[key] ?? null })
    ),
    set: vi.fn(({ key, value }: { key: string; value: string }) => {
      mockPreferences[key] = value
      return Promise.resolve()
    }),
  },
}))

vi.mock('@capacitor/filesystem', () => ({
  Filesystem: {
    readdir: vi.fn(),
    stat: vi.fn(),
    mkdir: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn(),
    writeFile: vi.fn().mockResolvedValue(undefined),
    deleteFile: vi.fn().mockResolvedValue(undefined),
  },
  Directory: { Documents: 'DOCUMENTS', Library: 'LIBRARY' },
  Encoding: { UTF8: 'utf8' },
}))

// WebDav 原生插件 mock（Android 路径用它执行 PROPFIND）
// 在测试环境中将 propfind 代理到真实 HTTP 服务器
const mockWebDavPropfind = vi.hoisted(() => vi.fn())
const mockWebDavRequest = vi.hoisted(() => vi.fn())
vi.mock('@renderer/capacitor-bridge/webdav-native', () => ({
  default: { propfind: mockWebDavPropfind, request: mockWebDavRequest },
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'ios' },
  CapacitorHttp: { request: vi.fn() },
}))

import { MobileCloudBackupService } from '~/lib/services/mobile-cloud-backup.service'
import { WebCloudBackupService } from '~/lib/services/web-cloud-backup.service'
import { DatabaseServiceManager } from '~/lib/services/database-manager.service'
import { WebDAVProvider } from '../../src/main/cloud/webdav-provider'
import { CloudSyncService } from '~/lib/services/cloud-sync.service'
import { CapacitorHttp } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import {
  assertValidCloudSyncManifest,
  createCloudSyncManifestRevisionConflictError,
  createEmptyCloudSyncManifest,
  doesCloudSyncManifestMatchExpectedRevision,
  getCloudSyncManifestRevision,
  readCloudSyncManifestWithFallback
} from '@shared/cloud-sync-manifest'
import { createCloudSyncDataChecksum, createCloudSyncSnapshot } from '@shared/cloud-sync-engine'
import {
  getCloudSyncManifestBackupPath,
  getCloudSyncManifestPath,
  getCloudSyncSnapshotPath,
  getCloudSyncSnapshotRevisionFromFileName,
  getCloudSyncSnapshotsDirectoryPath
} from '@shared/cloud-backup-paths'
import {
  assertValidCloudSyncSnapshotFile,
  createCloudSyncSnapshotFile
} from '@shared/cloud-sync-snapshots'
import { parseBackupPayload } from '@shared/backup-integrity'

const mockHttp = CapacitorHttp as unknown as { request: ReturnType<typeof vi.fn> }

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

function createDesktopWebDAVSyncClient(config: any) {
  const provider = new WebDAVProvider(config)
  const formatError = (error: unknown) => error instanceof Error ? error.message : String(error)
  const isNotFoundError = (error: unknown) => /404|not\s*found|does not exist|ENOENT|不存在|未找到/i
    .test(formatError(error))
  const isRevisionConflictError = (error: unknown) => /Precondition|412|if-match|if-none-match|已存在，取消覆盖/i
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

  const readSnapshot = async (snapshot: any) => {
    const snapshotPath = typeof snapshot === 'string'
      ? getCloudSyncSnapshotPath(snapshot)
      : snapshot.path || getCloudSyncSnapshotPath(snapshot.revision)
    const data = await provider.readFile(snapshotPath)
    return assertValidCloudSyncSnapshotFile(JSON.parse(Buffer.from(data).toString('utf-8')))
  }

  return {
    async getCloudSyncManifest(_storageId?: string) {
      return readManifest()
    },

    async saveCloudSyncManifest(_storageId: string, manifest: any, options: any = {}) {
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
          error: formatError(error)
        }
      }
    },

    async listCloudSyncSnapshots(_storageId?: string) {
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
          .filter(Boolean)
      } catch (error) {
        if (isNotFoundError(error)) {
          return []
        }
        throw error
      }
    },

    async readCloudSyncSnapshot(_storageId: string, snapshot: any) {
      return readSnapshot(snapshot)
    },

    async saveCloudSyncSnapshot(_storageId: string, snapshot: any) {
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

async function createWebBackendCloudSyncClient(config: any) {
  const { default: http } = await import('http')
  const webServerModule = await import('../../scripts/web-server.js')
  const createWebRequestHandler = webServerModule.createWebRequestHandler ||
    webServerModule.default.createWebRequestHandler
  const apiServer = http.createServer(createWebRequestHandler({ serveStaticFiles: false }))
  await new Promise<void>(resolve => apiServer.listen(0, '127.0.0.1', () => resolve()))
  const address = apiServer.address() as AddressInfo
  const baseUrl = `http://127.0.0.1:${address.port}`
  const originalFetch = globalThis.fetch.bind(globalThis)
  const hadLocalStorage = Object.prototype.hasOwnProperty.call(globalThis, 'localStorage')
  const previousLocalStorage = (globalThis as any).localStorage
  const previousFetch = globalThis.fetch
  const storage = new MemoryStorage()
  storage.setItem('ai-gist:web:cloud-storage-configs', JSON.stringify([config]))

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: storage
  })
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' && input.startsWith('/')
        ? `${baseUrl}${input}`
        : input
      return originalFetch(url, init)
    }
  })
  ;(WebCloudBackupService as any).instance = undefined

  return {
    client: WebCloudBackupService.getInstance(),
    async close() {
      await new Promise<void>(resolve => apiServer.close(() => resolve()))
      ;(WebCloudBackupService as any).instance = undefined
      Object.defineProperty(globalThis, 'fetch', {
        configurable: true,
        value: previousFetch
      })
      if (hadLocalStorage) {
        Object.defineProperty(globalThis, 'localStorage', {
          configurable: true,
          value: previousLocalStorage
        })
      } else {
        delete (globalThis as any).localStorage
      }
    }
  }
}

function simulateImportedLocalData(data: any, idBase: number): any {
  const categoryIdMap = new Map<number, number>()
  const promptIdMap = new Map<number, number>()

  const categories = (data.categories || []).map((category: any, index: number) => {
    const nextId = idBase + index + 1
    if (typeof category.id === 'number') {
      categoryIdMap.set(category.id, nextId)
    }
    return { ...category, id: nextId }
  })

  const prompts = (data.prompts || []).map((prompt: any, index: number) => {
    const nextId = idBase + 100 + index + 1
    if (typeof prompt.id === 'number') {
      promptIdMap.set(prompt.id, nextId)
    }
    const nextCategoryId = typeof prompt.categoryId === 'number'
      ? categoryIdMap.get(prompt.categoryId)
      : undefined
    return {
      ...prompt,
      id: nextId,
      categoryId: nextCategoryId ?? prompt.categoryId,
      category: prompt.category
        ? {
            ...prompt.category,
            id: typeof prompt.category.id === 'number'
              ? categoryIdMap.get(prompt.category.id) ?? prompt.category.id
              : prompt.category.id
          }
        : prompt.category,
      variables: Array.isArray(prompt.variables)
        ? prompt.variables.map((variable: any, variableIndex: number) => ({
            ...variable,
            id: idBase + 400 + index * 100 + variableIndex + 1,
            promptId: nextId
          }))
        : prompt.variables
    }
  })

  const promptVariables = (data.promptVariables || []).map((variable: any, index: number) => ({
    ...variable,
    id: idBase + 500 + index + 1,
    promptId: typeof variable.promptId === 'number'
      ? promptIdMap.get(variable.promptId) ?? variable.promptId
      : variable.promptId
  }))

  const promptHistories = (data.promptHistories || []).map((history: any, index: number) => ({
    ...history,
    id: idBase + 700 + index + 1,
    promptId: typeof history.promptId === 'number'
      ? promptIdMap.get(history.promptId) ?? history.promptId
      : history.promptId
  }))

  return {
    ...data,
    categories,
    prompts,
    promptVariables,
    promptHistories
  }
}

// ---- 服务器配置 ----

const PORT     = 18766
const USERNAME = 'testuser'
const PASSWORD = 'testpass'

let server: TestWebDAVServer

// ---- 测试数据 ----

const mockExportData = {
  categories: [testDataGenerators.createMockCategory({ id: 1 })],
  prompts:    [testDataGenerators.createMockPrompt({ id: 1, categoryId: 1 })],
  promptVariables: [{
    id: 1,
    uuid: 'prompt-variable-1',
    promptId: 1,
    name: 'tone',
    type: 'text',
    defaultValue: 'friendly',
    required: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }],
  promptHistories: [],
  aiConfigs:  [testDataGenerators.createMockAIConfig({ id: 1 })],
  quickOptimizationConfigs: [{
    id: 1,
    uuid: 'quick-optimization-1',
    name: '更清晰',
    description: '优化表达',
    prompt: '请优化：{{content}}',
    enabled: true,
    sortOrder: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }],
  aiHistory:  [],
  settings:   [{ key: 'theme', value: 'dark', type: 'string', description: '' }],
  syncTombstones: [],
}

function createRealisticBackupData(version: 'initial' | 'updated') {
  const initialImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lZ2nNwAAAABJRU5ErkJggg=='
  const updatedImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAADUlEQVR42mP8z8BQDwAFgwJ/lZ2nNwAAAABJRU5ErkJggg=='
  const updated = version === 'updated'
  const baseTime = updated ? '2026-06-13T10:20:00.000Z' : '2026-06-13T10:00:00.000Z'
  const category = {
    ...testDataGenerators.createMockCategory({
      id: 11,
      uuid: 'real-category-product',
      name: updated ? '真实项目资料-更新' : '真实项目资料'
    }),
    updatedAt: baseTime
  }
  const variable = {
    id: 21,
    uuid: 'real-variable-tone',
    promptId: 31,
    name: 'tone',
    type: 'select',
    defaultValue: updated ? 'precise' : 'friendly',
    options: ['friendly', 'precise'],
    required: true,
    createdAt: '2026-06-13T09:00:00.000Z',
    updatedAt: baseTime
  }
  const prompt = {
    ...testDataGenerators.createMockPrompt({
      id: 31,
      uuid: 'real-prompt-launch',
      categoryId: 11,
      title: updated ? '发布计划提示词 - 更新版' : '发布计划提示词'
    }),
    content: updated ? '请用 {{tone}} 语气生成更新版发布计划' : '请用 {{tone}} 语气生成发布计划',
    category,
    variables: [variable],
    tags: ['release', 'webdav', updated ? 'updated' : 'initial'],
    imageBlobs: updated ? [initialImage, updatedImage] : [initialImage],
    createdAt: '2026-06-13T09:00:00.000Z',
    updatedAt: baseTime
  }
  const histories = [
    {
      id: 41,
      uuid: 'real-history-initial',
      promptId: 31,
      promptUuid: 'real-prompt-launch',
      content: '第一次生成发布计划',
      result: 'Initial launch plan',
      imageBlobs: [initialImage],
      createdAt: '2026-06-13T10:01:00.000Z',
      updatedAt: '2026-06-13T10:01:00.000Z'
    }
  ]

  if (updated) {
    histories.push({
      id: 42,
      uuid: 'real-history-updated',
      promptId: 31,
      promptUuid: 'real-prompt-launch',
      content: '更新后再次生成发布计划',
      result: 'Updated launch plan',
      imageBlobs: [updatedImage],
      createdAt: '2026-06-13T10:21:00.000Z',
      updatedAt: '2026-06-13T10:21:00.000Z'
    })
  }

  return {
    categories: [category],
    prompts: [prompt],
    promptVariables: [variable],
    promptHistories: histories,
    aiConfigs: [
      {
        ...testDataGenerators.createMockAIConfig({ id: 51 }),
        uuid: 'real-ai-config',
        name: updated ? 'Claude Sonnet 更新' : 'Claude Sonnet',
        updatedAt: baseTime
      }
    ],
    quickOptimizationConfigs: [{
      id: 61,
      uuid: 'real-quick-optimization',
      name: '压缩摘要',
      description: '保留关键信息',
      prompt: updated ? '请压缩并保留风险：{{content}}' : '请压缩：{{content}}',
      enabled: true,
      sortOrder: 1,
      createdAt: '2026-06-13T09:00:00.000Z',
      updatedAt: baseTime
    }],
    aiHistory: [{
      id: 71,
      uuid: 'real-ai-history',
      promptUuid: 'real-prompt-launch',
      input: updated ? '更新版输入' : '初始输入',
      output: updated ? '更新版输出' : '初始输出',
      createdAt: baseTime,
      updatedAt: baseTime
    }],
    settings: [
      { key: 'theme', value: updated ? 'light' : 'dark', type: 'string', description: 'theme setting' },
      { key: 'cloud.sync.intervalMinutes', value: updated ? 5 : 15, type: 'number', description: 'sync interval' }
    ],
    syncTombstones: []
  }
}

function makeBackupPayload(id = 'test-id-001') {
  return {
    id,
    name: `backup-2026-03-15-${id.substring(0, 8)}`,
    description: '集成测试备份',
    createdAt: new Date().toISOString(),
    data: mockExportData,
  }
}

// ---- 辅助：将 CapacitorHttp 请求转发到真实服务器 ----
// MobileCloudBackupService 通过 CapacitorHttp 发请求，我们把它代理到本地服务器

// ---- 将 WebDav 原生插件 propfind 代理到真实服务器（Android 路径使用原生插件）----
function setupWebDavNativeProxy() {
  mockWebDavPropfind.mockImplementation(async (opts: {
    url: string
    username?: string
    password?: string
    depth?: number
  }) => {
    const { default: http } = await import('http')
    const { URL } = await import('url')

    return new Promise<{ status: number; body: string }>((resolve, reject) => {
      const parsed = new URL(opts.url)
      const auth   = opts.username
        ? 'Basic ' + Buffer.from(`${opts.username}:${opts.password ?? ''}`).toString('base64')
        : undefined

      const headers: Record<string, string> = {
        'Depth':        String(opts.depth ?? 1),
        'Content-Type': 'application/xml; charset=utf-8',
      }
      if (auth) headers['Authorization'] = auth

      const propfindBody = Buffer.from(
        '<?xml version="1.0" encoding="utf-8"?>' +
        '<D:propfind xmlns:D="DAV:"><D:prop>' +
        '<D:displayname/><D:getcontentlength/><D:getlastmodified/><D:resourcetype/>' +
        '</D:prop></D:propfind>',
        'utf-8'
      )
      headers['Content-Length'] = String(propfindBody.length)

      const req = http.request({
        hostname: parsed.hostname,
        port:     Number(parsed.port) || 80,
        path:     parsed.pathname + parsed.search,
        method:   'PROPFIND',
        headers,
      }, res => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => resolve({
          status: res.statusCode ?? 0,
          body:   Buffer.concat(chunks).toString('utf-8'),
        }))
      })

      req.on('error', reject)
      req.write(propfindBody)
      req.end()
    })
  })
}

function setupWebDavRequestProxy() {
  mockWebDavRequest.mockImplementation(async (opts: {
    url: string
    method: string
    username?: string
    password?: string
    body?: string
    contentType?: string
  }) => {
    const { default: http } = await import('http')
    const { URL } = await import('url')

    return new Promise<{ status: number; body: string }>((resolve, reject) => {
      const parsed = new URL(opts.url)
      const auth = opts.username
        ? 'Basic ' + Buffer.from(`${opts.username}:${opts.password ?? ''}`).toString('base64')
        : undefined

      const headers: Record<string, string> = {}
      if (auth) headers['Authorization'] = auth
      if (opts.contentType) headers['Content-Type'] = opts.contentType

      let bodyBuf: Buffer | undefined
      if (opts.body !== undefined) {
        bodyBuf = Buffer.from(opts.body, 'utf-8')
        headers['Content-Length'] = String(bodyBuf.length)
      }

      const req = http.request({
        hostname: parsed.hostname,
        port: Number(parsed.port) || 80,
        path: parsed.pathname + parsed.search,
        method: opts.method,
        headers,
      }, res => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => resolve({
          status: res.statusCode ?? 0,
          body: Buffer.concat(chunks).toString('utf-8'),
        }))
      })

      req.on('error', reject)
      if (bodyBuf) req.write(bodyBuf)
      req.end()
    })
  })
}

function setupHttpProxy() {  mockHttp.request.mockImplementation(async (opts: any) => {
    const { default: http } = await import('http')
    const { URL } = await import('url')

    return new Promise<any>((resolve, reject) => {
      const url    = new URL(opts.url)
      const method = (opts.method ?? 'GET').toUpperCase()

      const headers: Record<string, string> = {
        ...(opts.headers ?? {}),
      }

      let bodyBuf: Buffer | undefined
      if (opts.data !== undefined) {
        const raw = typeof opts.data === 'string' ? opts.data : JSON.stringify(opts.data)
        bodyBuf = Buffer.from(raw, 'utf-8')
        headers['Content-Length'] = String(bodyBuf.length)
      }

      const reqOpts: http.RequestOptions = {
        hostname: url.hostname,
        port:     Number(url.port) || 80,
        path:     url.pathname + url.search,
        method,
        headers,
      }

      const req = http.request(reqOpts, res => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf-8')
          let data: any = raw
          try {
            data = JSON.parse(raw)
          } catch {
            // Keep plain text responses as-is.
          }
          resolve({ status: res.statusCode ?? 0, data })
        })
      })

      req.on('error', reject)
      if (bodyBuf) req.write(bodyBuf)
      req.end()
    })
  })
}

async function saveConfig(service: MobileCloudBackupService) {
  await Preferences.set({
    key: 'cloud_backup_configs',
    value: JSON.stringify([{
      id: 'cfg-real',
      name: 'Real WebDAV',
      type: 'webdav',
      enabled: true,
      url: server.baseUrl,
      username: USERNAME,
      password: PASSWORD,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }]),
  })
}

// ================================================================
// 测试套件
// ================================================================

describe('WebDAV 集成测试（真实 HTTP 服务器）', () => {
  beforeAll(async () => {
    server = new TestWebDAVServer({ port: PORT, username: USERNAME, password: PASSWORD })
    await server.start()
  })

  afterAll(async () => {
    await server.stop()
  })

  beforeEach(() => {
    ;(MobileCloudBackupService as any).instance = undefined
    Object.keys(mockPreferences).forEach(k => delete mockPreferences[k])
    vi.clearAllMocks()
    setupHttpProxy()
    setupWebDavNativeProxy()
    setupWebDavRequestProxy()
  })

  // ----------------------------------------------------------------
  // 1. 服务器基础连通性
  // ----------------------------------------------------------------

  describe('服务器基础连通性', () => {
    it('OPTIONS 请求返回 DAV 头', async () => {
      const { default: http } = await import('http')
      await new Promise<void>((resolve, reject) => {
        const req = http.request(
          { hostname: '127.0.0.1', port: PORT, path: '/', method: 'OPTIONS',
            headers: { Authorization: 'Basic ' + Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64') } },
          res => {
            expect(res.statusCode).toBe(200)
            expect(res.headers['dav']).toContain('1')
            resolve()
          }
        )
        req.on('error', reject)
        req.end()
      })
    })

    it('无认证时返回 401', async () => {
      const { default: http } = await import('http')
      await new Promise<void>((resolve, reject) => {
        const req = http.request(
          { hostname: '127.0.0.1', port: PORT, path: '/', method: 'OPTIONS' },
          res => { expect(res.statusCode).toBe(401); resolve() }
        )
        req.on('error', reject)
        req.end()
      })
    })

    it('错误密码返回 401', async () => {
      const { default: http } = await import('http')
      await new Promise<void>((resolve, reject) => {
        const req = http.request(
          { hostname: '127.0.0.1', port: PORT, path: '/', method: 'OPTIONS',
            headers: { Authorization: 'Basic ' + Buffer.from('testuser:wrongpass').toString('base64') } },
          res => { expect(res.statusCode).toBe(401); resolve() }
        )
        req.on('error', reject)
        req.end()
      })
    })
  })

  // ----------------------------------------------------------------
  // 2. WebDAVProvider — 桌面端真实协议路径
  // ----------------------------------------------------------------

  describe('WebDAVProvider（桌面端）', () => {
    it('正确凭据连接会执行真实写入、读取和删除校验', async () => {
      const provider = new WebDAVProvider({
        id: 'desktop-cfg',
        name: 'Desktop WebDAV',
        type: 'webdav',
        enabled: true,
        url: server.baseUrl,
        username: USERNAME,
        password: PASSWORD,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })

      await expect(provider.testConnection()).resolves.toBe(true)

      const files = await provider.listFiles('/AI-Gist-Backup')
      expect(files.some(file => file.name.startsWith('.ai-gist-webdav-test-'))).toBe(false)
    })

    it('错误凭据连接失败', async () => {
      const provider = new WebDAVProvider({
        id: 'desktop-bad',
        name: 'Bad Desktop WebDAV',
        type: 'webdav',
        enabled: true,
        url: server.baseUrl,
        username: USERNAME,
        password: 'wrongpass',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })

      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      await expect(provider.testConnection()).resolves.toBe(false)
      expect(errorSpy).not.toHaveBeenCalled()
      errorSpy.mockRestore()
    })

    it('按 WebDAV 协议创建目录、上传、列出、读取和删除备份文件', async () => {
      const provider = new WebDAVProvider({
        id: 'desktop-flow',
        name: 'Desktop Flow WebDAV',
        type: 'webdav',
        enabled: true,
        url: server.baseUrl,
        username: USERNAME,
        password: PASSWORD,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })

      await provider.initializeDirectories()

      const filePath = '/AI-Gist-Backup/backup-desktop-provider.json'
      const payload = Buffer.from(JSON.stringify(makeBackupPayload('desktop-provider-001')), 'utf-8')

      await provider.writeFile(filePath, payload)

      const files = await provider.listFiles('/AI-Gist-Backup')
      expect(files.some(file => file.path.endsWith('/AI-Gist-Backup/backup-desktop-provider.json'))).toBe(true)

      const remoteData = await provider.readFile(filePath)
      expect(JSON.parse(remoteData.toString('utf-8')).id).toBe('desktop-provider-001')

      await provider.deleteFile(filePath)
      const filesAfterDelete = await provider.listFiles('/AI-Gist-Backup')
      expect(filesAfterDelete.some(file => file.name === 'backup-desktop-provider.json')).toBe(false)
    })

    it('URL 已指向 AI-Gist-Backup 时不会重复追加备份目录', async () => {
      const providerForRoot = new WebDAVProvider({
        id: 'desktop-root',
        name: 'Desktop Root WebDAV',
        type: 'webdav',
        enabled: true,
        url: server.baseUrl,
        username: USERNAME,
        password: PASSWORD,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      await providerForRoot.createDirectory('/AI-Gist-Backup')

      const provider = new WebDAVProvider({
        id: 'desktop-subdir',
        name: 'Desktop Subdir WebDAV',
        type: 'webdav',
        enabled: true,
        url: `${server.baseUrl}/AI-Gist-Backup`,
        username: USERNAME,
        password: PASSWORD,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })

      expect(provider.getDefaultBackupDirectory()).toBe('')

      const payload = Buffer.from(JSON.stringify(makeBackupPayload('desktop-subdir-001')), 'utf-8')
      await provider.writeFile('/backup-desktop-subdir.json', payload)

      const files = await provider.listFiles('/')
      expect(files.some(file => file.name === 'backup-desktop-subdir.json')).toBe(true)

      const remoteData = await provider.readFile('/backup-desktop-subdir.json')
      expect(JSON.parse(remoteData.toString('utf-8')).id).toBe('desktop-subdir-001')

      await provider.deleteFile('/backup-desktop-subdir.json')
    })

    it('请求长期无响应时会取消底层 WebDAV 请求并返回明确超时错误', async () => {
      const provider = new WebDAVProvider({
        id: 'desktop-timeout',
        name: 'Desktop Timeout WebDAV',
        type: 'webdav',
        enabled: true,
        url: server.baseUrl,
        username: USERNAME,
        password: PASSWORD,
        requestTimeoutMs: 5,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })

      const abortSpy = vi.fn()
      const getFileContents = vi.fn((_path: string, options: { signal: AbortSignal }) => (
        new Promise<Buffer>((_resolve, reject) => {
          options.signal.addEventListener('abort', () => {
            abortSpy()
            const error = new Error('The operation was aborted')
            error.name = 'AbortError'
            reject(error)
          })
        })
      ))

      ;(provider as any).client = { getFileContents }
      ;(provider as any).clientReady = Promise.resolve()

      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      await expect(provider.readFile('/slow.json')).rejects.toThrow('读取文件超时（5 毫秒）')
      expect(getFileContents).toHaveBeenCalledWith('/slow.json', expect.objectContaining({
        format: 'binary',
        signal: expect.any(AbortSignal),
      }))
      expect(abortSpy).toHaveBeenCalledTimes(1)
      expect(errorSpy).not.toHaveBeenCalled()
      errorSpy.mockRestore()
    })
  })

  // ----------------------------------------------------------------
  // 3. MobileCloudBackupService — 连接测试
  // ----------------------------------------------------------------

  describe('WebDAV 连接测试（移动端）', () => {
    it('正确凭据连接成功', async () => {
      const service = MobileCloudBackupService.getInstance()
      await saveConfig(service)

      const configs = await service.getStorageConfigs()
      const result  = await service.testStorageConnection(configs[0])
      expect(result.success).toBe(true)
    })

    it('WebDAV 连接请求带连接和读取超时', async () => {
      const service = MobileCloudBackupService.getInstance()
      await saveConfig(service)

      const configs = await service.getStorageConfigs()
      const result = await service.testStorageConnection(configs[0])

      expect(result.success).toBe(true)
      expect(mockHttp.request.mock.calls[0][0]).toEqual(expect.objectContaining({
        method: 'OPTIONS',
        connectTimeout: 30_000,
        readTimeout: 30_000,
      }))
    })

    it('错误密码连接失败', async () => {
      const service = MobileCloudBackupService.getInstance()
      await Preferences.set({
        key: 'cloud_backup_configs',
        value: JSON.stringify([{
          id: 'cfg-bad',
          name: 'Bad Auth',
          type: 'webdav',
          enabled: true,
          url: server.baseUrl,
          username: USERNAME,
          password: 'wrongpass',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }]),
      })

      const configs = await service.getStorageConfigs()
      const result  = await service.testStorageConnection(configs[0])
      expect(result.success).toBe(false)
    })

    it('URL 末尾斜杠被正确规范化', async () => {
      const service = MobileCloudBackupService.getInstance()
      await Preferences.set({
        key: 'cloud_backup_configs',
        value: JSON.stringify([{
          id: 'cfg-slash',
          name: 'Trailing Slash',
          type: 'webdav',
          enabled: true,
          url: server.baseUrl + '/',   // 末尾有斜杠
          username: USERNAME,
          password: PASSWORD,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }]),
      })

      const configs = await service.getStorageConfigs()
      const result  = await service.testStorageConnection(configs[0])
      expect(result.success).toBe(true)

      // 确认实际请求 URL 不含双斜杠
      const calledUrl: string = mockHttp.request.mock.calls[0][0].url
      expect(calledUrl.replace(/^https?:\/\//, '')).not.toContain('//')
    })
  })

  // ----------------------------------------------------------------
  // 3. 创建备份（PUT）
  // ----------------------------------------------------------------

  describe('createCloudBackup', () => {
    it('成功上传备份文件', async () => {
      const service = MobileCloudBackupService.getInstance()
      await saveConfig(service)

      const result = await service.createCloudBackup('cfg-real', mockExportData, '集成测试')
      expect(result.success).toBe(true)
      expect(result.backupInfo?.storageId).toBe('cfg-real')
      expect(result.backupInfo?.id).toBeDefined()

      // 验证 PUT 请求确实发出
      const putCall = mockHttp.request.mock.calls.find((c: any[]) => c[0].method === 'PUT')
      expect(putCall).toBeDefined()
      expect(putCall![0].url.replace(/^https?:\/\//, '')).not.toContain('//')
    })

    it('配置不存在时返回错误', async () => {
      const service = MobileCloudBackupService.getInstance()
      const result  = await service.createCloudBackup('nonexistent', mockExportData)
      expect(result.success).toBe(false)
    })
  })

  // ----------------------------------------------------------------
  // 4. 获取备份列表（PROPFIND + GET）
  // ----------------------------------------------------------------

  describe('getCloudBackupList', () => {
    it('上传后能列出备份文件', async () => {
      const service = MobileCloudBackupService.getInstance()
      await saveConfig(service)

      // 先上传一个备份
      const createResult = await service.createCloudBackup('cfg-real', mockExportData, '列表测试')
      expect(createResult.success).toBe(true)

      // 再列出
      const backups = await service.getCloudBackupList('cfg-real')
      expect(backups.length).toBeGreaterThanOrEqual(1)
      expect(backups[0].id).toBeDefined()
      expect(backups[0].storageId).toBe('cfg-real')
    })

    it('空目录返回空列表', async () => {
      // 使用一个全新的子路径（服务器根目录下的空子目录）
      const { default: http } = await import('http')
      const emptyPath = '/empty-dir-' + Date.now()

      // MKCOL 创建空目录
      await new Promise<void>((resolve, reject) => {
        const req = http.request(
          { hostname: '127.0.0.1', port: PORT, path: emptyPath, method: 'MKCOL',
            headers: { Authorization: 'Basic ' + Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64') } },
          res => { resolve() }
        )
        req.on('error', reject)
        req.end()
      })

      const service = MobileCloudBackupService.getInstance()
      await Preferences.set({
        key: 'cloud_backup_configs',
        value: JSON.stringify([{
          id: 'cfg-empty',
          name: 'Empty Dir',
          type: 'webdav',
          enabled: true,
          url: server.baseUrl + emptyPath,
          username: USERNAME,
          password: PASSWORD,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }]),
      })

      const backups = await service.getCloudBackupList('cfg-empty')
      expect(backups).toEqual([])
    })
  })

  // ----------------------------------------------------------------
  // 5. 云同步 manifest（PUT + GET）
  // ----------------------------------------------------------------

  describe('cloud sync manifest', () => {
    it('保存后能从本地 WebDAV 服务读取同一份 manifest', async () => {
      const service = MobileCloudBackupService.getInstance()
      await saveConfig(service)

      const manifest = {
        ...createEmptyCloudSyncManifest('2026-03-15T00:00:00.000Z'),
        latestSnapshot: {
          schemaVersion: 1 as const,
          deviceId: 'ios-device',
          revision: 'rev-1',
          createdAt: '2026-03-15T00:00:00.000Z',
          data: mockExportData
        }
      }

      const saveResult = await service.saveCloudSyncManifest('cfg-real', manifest)
      expect(saveResult.success).toBe(true)

      const loaded = await service.getCloudSyncManifest('cfg-real')
      expect(loaded.kind).toBe('ai-gist-cloud-sync-manifest')
      expect(loaded.latestSnapshot?.revision).toBe('rev-1')
      expect(loaded.latestSnapshot?.data.prompts).toHaveLength(1)
    })

    it('主 manifest 损坏时能从备份副本恢复读取', async () => {
      const service = MobileCloudBackupService.getInstance()
      await saveConfig(service)

      const manifest = {
        ...createEmptyCloudSyncManifest('2026-03-15T00:00:00.000Z'),
        latestSnapshot: {
          schemaVersion: 1 as const,
          deviceId: 'ios-device',
          revision: 'rev-backup',
          createdAt: '2026-03-15T00:00:00.000Z',
          data: mockExportData
        }
      }

      const saveResult = await service.saveCloudSyncManifest('cfg-real', manifest)
      expect(saveResult.success).toBe(true)
      await fsp.writeFile(
        path.join(server.rootDir, 'AI-Gist-Backup', 'sync-manifest.json'),
        '{"kind":',
        'utf-8'
      )

      const loaded = await service.getCloudSyncManifest('cfg-real')

      expect(loaded.latestSnapshot?.revision).toBe('rev-backup')
      expect(loaded.latestSnapshot?.data.promptVariables).toHaveLength(1)
    })

    it('主 manifest 缺失时能从备份副本恢复读取', async () => {
      const service = MobileCloudBackupService.getInstance()
      await saveConfig(service)

      const manifest = {
        ...createEmptyCloudSyncManifest('2026-03-15T00:00:00.000Z'),
        latestSnapshot: {
          schemaVersion: 1 as const,
          deviceId: 'ios-device',
          revision: 'rev-backup-only',
          createdAt: '2026-03-15T00:00:00.000Z',
          data: mockExportData
        }
      }

      const saveResult = await service.saveCloudSyncManifest('cfg-real', manifest)
      expect(saveResult.success).toBe(true)
      await fsp.unlink(path.join(server.rootDir, 'AI-Gist-Backup', 'sync-manifest.json'))

      const loaded = await service.getCloudSyncManifest('cfg-real')

      expect(loaded.latestSnapshot?.revision).toBe('rev-backup-only')
      expect(loaded.latestSnapshot?.data.quickOptimizationConfigs).toHaveLength(1)
    })

    it('manifest checksum 漂移时会自动修复可读快照', async () => {
      const service = MobileCloudBackupService.getInstance()
      await saveConfig(service)

      const snapshot = createCloudSyncSnapshot(mockExportData, 'ios-device', 'rev-checksum-drift')
      const brokenManifest = {
        ...createEmptyCloudSyncManifest('2026-03-15T00:00:00.000Z'),
        latestSnapshot: {
          ...snapshot,
          dataChecksum: 'fnv1a32:00000000'
        },
        baseSnapshot: {
          ...snapshot,
          dataChecksum: 'fnv1a32:00000000'
        }
      }

      expect((await service.saveCloudSyncManifest('cfg-real', {
        ...createEmptyCloudSyncManifest('2026-03-15T00:00:00.000Z'),
        latestSnapshot: snapshot,
        baseSnapshot: snapshot
      })).success).toBe(true)

      const brokenContent = JSON.stringify(brokenManifest, null, 2)
      await fsp.writeFile(path.join(server.rootDir, 'AI-Gist-Backup', 'sync-manifest.json'), brokenContent, 'utf-8')
      await fsp.writeFile(path.join(server.rootDir, 'AI-Gist-Backup', 'sync-manifest.backup.json'), brokenContent, 'utf-8')

      const loaded = await service.getCloudSyncManifest('cfg-real')

      expect(loaded.latestSnapshot?.revision).toBe('rev-checksum-drift')
      expect(loaded.latestSnapshot?.dataChecksum).toBe(
        createCloudSyncDataChecksum(loaded.latestSnapshot!.data)
      )
      expect(loaded.baseSnapshot?.dataChecksum).toBe(
        createCloudSyncDataChecksum(loaded.baseSnapshot!.data)
      )
    })

    it('保存 manifest 时 expectedRevision 不匹配会拒绝覆盖云端新版本', async () => {
      const service = MobileCloudBackupService.getInstance()
      await saveConfig(service)

      const manifestA = {
        ...createEmptyCloudSyncManifest('2026-03-15T00:00:00.000Z'),
        latestSnapshot: {
          schemaVersion: 1 as const,
          deviceId: 'device-a',
          revision: 'rev-a',
          createdAt: '2026-03-15T00:00:00.000Z',
          data: mockExportData
        }
      }
      const manifestB = {
        ...createEmptyCloudSyncManifest('2026-03-15T00:01:00.000Z'),
        latestSnapshot: {
          schemaVersion: 1 as const,
          deviceId: 'device-b',
          revision: 'rev-b',
          createdAt: '2026-03-15T00:01:00.000Z',
          data: {
            ...mockExportData,
            prompts: [
              { ...mockExportData.prompts[0], title: 'Device B edit' }
            ]
          }
        }
      }
      const manifestC = {
        ...createEmptyCloudSyncManifest('2026-03-15T00:02:00.000Z'),
        latestSnapshot: {
          schemaVersion: 1 as const,
          deviceId: 'device-c',
          revision: 'rev-c',
          createdAt: '2026-03-15T00:02:00.000Z',
          data: mockExportData
        }
      }

      expect((await service.saveCloudSyncManifest('cfg-real', manifestA)).success).toBe(true)
      expect((await service.saveCloudSyncManifest('cfg-real', manifestB, {
        expectedRevision: 'rev-a'
      })).success).toBe(true)

      const staleSave = await service.saveCloudSyncManifest('cfg-real', manifestC, {
        expectedRevision: 'rev-a'
      })
      expect(staleSave).toMatchObject({
        success: false,
        conflict: true,
        currentRevision: 'rev-b'
      })

      const loaded = await service.getCloudSyncManifest('cfg-real')
      expect(loaded.latestSnapshot?.revision).toBe('rev-b')
      expect(loaded.latestSnapshot?.data.prompts[0].title).toBe('Device B edit')
    })
  })

  // ----------------------------------------------------------------
  // 6. 云同步协调器（本地 WebDAV，设备 A 上传 → 设备 B 拉取）
  // ----------------------------------------------------------------

  describe('cloud sync coordinator', () => {
    it('连续手动同步 JSON 化数据时不会出现 checksum mismatch', async () => {
      const storageId = 'cfg-json-stable'
      const service = MobileCloudBackupService.getInstance()
      await Preferences.set({
        key: 'cloud_backup_configs',
        value: JSON.stringify([{
          id: storageId,
          name: 'JSON Stable Sync WebDAV',
          type: 'webdav',
          enabled: true,
          url: `${server.baseUrl}/json-stable-${Date.now()}`,
          username: USERNAME,
          password: PASSWORD,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }]),
      })

      const syncData = {
        ...mockExportData,
        prompts: [
          {
            ...mockExportData.prompts[0],
            optional: undefined,
            nested: {
              keep: 'value',
              drop: undefined
            },
            values: [undefined, 'kept']
          }
        ],
        promptHistories: [],
        syncTombstones: []
      }
      const database = {
        exportAllDataForSync: vi.fn().mockResolvedValue({
          success: true,
          message: 'ok',
          data: syncData
        }),
        replaceAllData: vi.fn().mockResolvedValue({
          success: true,
          message: 'ok'
        })
      }
      const device = new CloudSyncService({
        cloudClient: service,
        database,
        storage: new MemoryStorage(),
        createDeviceId: () => 'json-stable-device'
      })

      const firstSync = await device.syncNow(storageId, {
        deviceName: 'JSON Stable Device',
        platform: 'ios',
        reason: 'manual'
      })
      const secondSync = await device.syncNow(storageId, {
        deviceName: 'JSON Stable Device',
        platform: 'ios',
        reason: 'manual'
      })
      const thirdSync = await device.syncNow(storageId, {
        deviceName: 'JSON Stable Device',
        platform: 'ios',
        reason: 'manual'
      })

      expect(firstSync.success).toBe(true)
      expect(firstSync.error).toBeUndefined()
      expect(firstSync.action).toBe('uploaded')
      expect(secondSync.success).toBe(true)
      expect(secondSync.error).toBeUndefined()
      expect(secondSync.action).toBe('noop')
      expect(thirdSync.success).toBe(true)
      expect(thirdSync.error).toBeUndefined()
      expect(thirdSync.action).toBe('noop')

      const manifest = await service.getCloudSyncManifest(storageId)
      expect(manifest.latestSnapshot?.data.prompts?.[0]).not.toHaveProperty('optional')
      expect(manifest.latestSnapshot?.data.prompts?.[0].nested).not.toHaveProperty('drop')
      expect(manifest.latestSnapshot?.data.prompts?.[0].values).toEqual([null, 'kept'])
      expect(manifest.latestSnapshot?.dataChecksum).toBe(
        createCloudSyncDataChecksum(manifest.latestSnapshot!.data)
      )

      const snapshots = await service.listCloudSyncSnapshots(storageId)
      expect(snapshots).toHaveLength(0)
    })

    it('桌面 WebDAVProvider 连续三次手动同步等价 JSON 数据时不会持续生成新版本', async () => {
      const storageId = 'cfg-desktop-json-stable'
      const cloudClient = createDesktopWebDAVSyncClient({
        id: storageId,
        name: 'Desktop JSON Stable WebDAV',
        type: 'webdav',
        enabled: true,
        url: `${server.baseUrl}/desktop-json-stable-${Date.now()}`,
        username: USERNAME,
        password: PASSWORD,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      const syncData = {
        ...mockExportData,
        prompts: [
          {
            ...mockExportData.prompts[0],
            optional: undefined,
            nested: {
              keep: 'value',
              drop: undefined
            },
            values: [undefined, 'kept']
          }
        ],
        promptHistories: [],
        syncTombstones: []
      }
      const database = {
        exportAllDataForSync: vi.fn().mockResolvedValue({
          success: true,
          message: 'ok',
          data: syncData
        }),
        replaceAllData: vi.fn().mockResolvedValue({
          success: true,
          message: 'ok'
        })
      }
      const desktopDevice = new CloudSyncService({
        cloudClient,
        database,
        storage: new MemoryStorage(),
        createDeviceId: () => 'desktop-json-stable-device'
      })

      const firstSync = await desktopDevice.syncNow(storageId, {
        deviceName: 'Desktop JSON Stable Device',
        platform: 'electron',
        reason: 'manual'
      })
      const secondSync = await desktopDevice.syncNow(storageId, {
        deviceName: 'Desktop JSON Stable Device',
        platform: 'electron',
        reason: 'manual'
      })
      const thirdSync = await desktopDevice.syncNow(storageId, {
        deviceName: 'Desktop JSON Stable Device',
        platform: 'electron',
        reason: 'manual'
      })

      expect(firstSync).toMatchObject({ success: true, action: 'uploaded' })
      expect(secondSync).toMatchObject({ success: true, action: 'noop' })
      expect(thirdSync).toMatchObject({ success: true, action: 'noop' })

      const manifest = await cloudClient.getCloudSyncManifest(storageId)
      const snapshots = await cloudClient.listCloudSyncSnapshots(storageId)
      expect(snapshots).toHaveLength(0)
      expect(manifest.latestSnapshot?.revision).toBe(firstSync.remoteRevision)
      expect(manifest.latestSnapshot?.dataChecksum).toBe(
        createCloudSyncDataChecksum(manifest.latestSnapshot!.data)
      )
    })

    it('移动端、Web 端、桌面端能通过同一 WebDAV 目录轮流同步图片、历史和设置元数据', async () => {
      const storageId = 'cfg-cross-platform-webdav'
      const cloudUrl = `${server.baseUrl}/cross-platform-${Date.now()}`
      const config = {
        id: storageId,
        name: 'Cross Platform WebDAV',
        type: 'webdav',
        enabled: true,
        url: cloudUrl,
        username: USERNAME,
        password: PASSWORD,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      const imageDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lZ2nNwAAAABJRU5ErkJggg=='
      const updatedImageDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAADUlEQVR42mP8z8BQDwAFgwJ/lZ2nNwAAAABJRU5ErkJggg=='
      const mobileData = {
        ...mockExportData,
        prompts: [
          {
            ...mockExportData.prompts[0],
            id: 1,
            uuid: 'cross-platform-prompt',
            title: 'Mobile prompt',
            category: mockExportData.categories[0],
            variables: mockExportData.promptVariables,
            imageBlobs: [imageDataUrl],
            updatedAt: '2026-06-12T00:00:00.000Z'
          }
        ],
        promptHistories: [
          {
            id: 1,
            uuid: 'cross-platform-history',
            promptId: 1,
            promptUuid: 'cross-platform-prompt',
            content: 'Mobile history with image',
            result: 'History result',
            imageBlobs: [imageDataUrl],
            createdAt: '2026-06-12T00:00:00.000Z',
            updatedAt: '2026-06-12T00:00:00.000Z'
          }
        ],
        settings: [
          { key: 'theme', value: 'dark', type: 'string', description: 'theme setting' }
        ],
        syncTombstones: []
      }
      const emptyData = {
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

      const mobileService = MobileCloudBackupService.getInstance()
      await Preferences.set({
        key: 'cloud_backup_configs',
        value: JSON.stringify([config]),
      })
      const mobileDatabase = {
        exportAllDataForSync: vi.fn().mockResolvedValue({
          success: true,
          message: 'ok',
          data: mobileData
        }),
        replaceAllData: vi.fn().mockResolvedValue({
          success: true,
          message: 'ok'
        })
      }
      const mobileDevice = new CloudSyncService({
        cloudClient: mobileService,
        database: mobileDatabase,
        storage: new MemoryStorage(),
        createDeviceId: () => 'mobile-device'
      })

      let webRuntime: Awaited<ReturnType<typeof createWebBackendCloudSyncClient>> | null = null
      try {
        webRuntime = await createWebBackendCloudSyncClient(config)
        let webLocalData: any = emptyData
        const webDatabase = {
          exportAllDataForSync: vi.fn().mockImplementation(async () => ({
            success: true,
            message: 'ok',
            data: webLocalData
          })),
          replaceAllData: vi.fn().mockImplementation(async (data: any) => {
            webLocalData = simulateImportedLocalData(data, 1000)
            return { success: true, message: 'ok' }
          })
        }
        const webDevice = new CloudSyncService({
          cloudClient: webRuntime.client,
          database: webDatabase,
          storage: new MemoryStorage(),
          createDeviceId: () => 'web-device'
        })
        let desktopLocalData: any = emptyData
        const desktopDatabase = {
          exportAllDataForSync: vi.fn().mockImplementation(async () => ({
            success: true,
            message: 'ok',
            data: desktopLocalData
          })),
          replaceAllData: vi.fn().mockImplementation(async (data: any) => {
            desktopLocalData = simulateImportedLocalData(data, 2000)
            return { success: true, message: 'ok' }
          })
        }
        const desktopDevice = new CloudSyncService({
          cloudClient: createDesktopWebDAVSyncClient(config),
          database: desktopDatabase,
          storage: new MemoryStorage(),
          createDeviceId: () => 'desktop-device'
        })

        const mobileUpload = await mobileDevice.syncNow(storageId, {
          deviceName: 'Mobile Device',
          platform: 'ios',
          reason: 'manual'
        })
        expect(mobileUpload).toMatchObject({ success: true, action: 'uploaded' })

        const webDownload = await webDevice.syncNow(storageId, {
          deviceName: 'Web Device',
          platform: 'web',
          reason: 'manual'
        })
        expect(webDownload).toMatchObject({ success: true, action: 'downloaded' })
        expect(webDatabase.replaceAllData).toHaveBeenCalledWith(expect.objectContaining({
          prompts: expect.arrayContaining([
            expect.objectContaining({
              uuid: 'cross-platform-prompt',
              imageBlobs: [imageDataUrl]
            })
          ]),
          promptHistories: expect.arrayContaining([
            expect.objectContaining({
              uuid: 'cross-platform-history',
              imageBlobs: [imageDataUrl]
            })
          ])
        }))
        expect(webLocalData.prompts).toEqual(expect.arrayContaining([
          expect.objectContaining({
            uuid: 'cross-platform-prompt',
            id: 1101,
            categoryId: 1001,
            variables: expect.arrayContaining([
              expect.objectContaining({
                uuid: 'prompt-variable-1',
                promptId: 1101
              })
            ])
          })
        ]))

        const webNoopAfterImport = await webDevice.syncNow(storageId, {
          deviceName: 'Web Device',
          platform: 'web',
          reason: 'manual'
        })
        expect(webNoopAfterImport).toMatchObject({
          success: true,
          action: 'noop',
          uploadedRemote: false
        })

        const webPrompt = webLocalData.prompts.find((prompt: any) => prompt.uuid === 'cross-platform-prompt')
        webLocalData = {
          ...webLocalData,
          prompts: webLocalData.prompts.map((prompt: any) =>
            prompt.uuid === 'cross-platform-prompt'
              ? {
                  ...prompt,
                  title: 'Web edited prompt',
                  imageBlobs: [imageDataUrl, updatedImageDataUrl],
                  updatedAt: '2026-06-12T00:10:00.000Z'
                }
              : prompt
          ),
          promptHistories: [
            ...webLocalData.promptHistories,
            {
              id: 1802,
              uuid: 'cross-platform-history-web-edit',
              promptId: webPrompt?.id,
              promptUuid: 'cross-platform-prompt',
              content: 'Web edited history with image',
              result: 'Web edited result',
              imageBlobs: [updatedImageDataUrl],
              createdAt: '2026-06-12T00:10:00.000Z',
              updatedAt: '2026-06-12T00:10:00.000Z'
            }
          ],
          aiHistory: [
            ...webLocalData.aiHistory,
            {
              id: 1901,
              uuid: 'cross-platform-ai-history-web-edit',
              promptUuid: 'cross-platform-prompt',
              input: 'Web edited input',
              output: 'Web edited output',
              createdAt: '2026-06-12T00:10:00.000Z',
              updatedAt: '2026-06-12T00:10:00.000Z'
            }
          ],
          settings: [
            { key: 'theme', value: 'light', type: 'string', description: 'theme setting updated on web' },
            { key: 'cloud.sync.intervalMinutes', value: 5, type: 'number', description: 'sync interval' }
          ]
        }
        expect(webLocalData.prompts).toEqual(expect.arrayContaining([
          expect.objectContaining({
            uuid: 'cross-platform-prompt',
            title: 'Web edited prompt',
            imageBlobs: [imageDataUrl, updatedImageDataUrl]
          })
        ]))
        expect(webLocalData.promptHistories).toEqual(expect.arrayContaining([
          expect.objectContaining({
            uuid: 'cross-platform-history-web-edit',
            imageBlobs: [updatedImageDataUrl]
          })
        ]))
        const manifestBeforeWebUpload = await webRuntime.client.getCloudSyncManifest(storageId)
        expect(createCloudSyncDataChecksum(webLocalData)).not.toBe(
          createCloudSyncDataChecksum(manifestBeforeWebUpload.latestSnapshot!.data)
        )
        const webUpload = await webDevice.syncNow(storageId, {
          deviceName: 'Web Device',
          platform: 'web',
          reason: 'manual'
        })
        expect(webUpload).toMatchObject({ success: true, action: 'uploaded' })

        const webNoopAfterUpdate = await webDevice.syncNow(storageId, {
          deviceName: 'Web Device',
          platform: 'web',
          reason: 'manual'
        })
        const webThirdClickAfterUpdate = await webDevice.syncNow(storageId, {
          deviceName: 'Web Device',
          platform: 'web',
          reason: 'manual'
        })
        expect(webNoopAfterUpdate).toMatchObject({ success: true, action: 'noop' })
        expect(webThirdClickAfterUpdate).toMatchObject({ success: true, action: 'noop' })

        const remoteSnapshots = await webRuntime.client.listCloudSyncSnapshots(storageId)
        expect(remoteSnapshots).toHaveLength(0)

        const desktopDownload = await desktopDevice.syncNow(storageId, {
          deviceName: 'Desktop Device',
          platform: 'electron',
          reason: 'manual'
        })
        expect(desktopDownload).toMatchObject({ success: true, action: 'downloaded' })
        expect(desktopLocalData.prompts).toEqual(expect.arrayContaining([
          expect.objectContaining({
            uuid: 'cross-platform-prompt',
            title: 'Web edited prompt',
            imageBlobs: [imageDataUrl, updatedImageDataUrl]
          })
        ]))
        expect(desktopLocalData.promptHistories).toEqual(expect.arrayContaining([
          expect.objectContaining({
            uuid: 'cross-platform-history',
            imageBlobs: [imageDataUrl]
          }),
          expect.objectContaining({
            uuid: 'cross-platform-history-web-edit',
            imageBlobs: [updatedImageDataUrl]
          })
        ]))
        expect(desktopLocalData.aiHistory).toEqual(expect.arrayContaining([
          expect.objectContaining({
            uuid: 'cross-platform-ai-history-web-edit',
            output: 'Web edited output'
          })
        ]))
        expect(desktopLocalData.settings).toEqual(expect.arrayContaining([
          expect.objectContaining({ key: 'theme', value: 'light' }),
          expect.objectContaining({ key: 'cloud.sync.intervalMinutes', value: 5 })
        ]))

        const desktopNoopAfterImport = await desktopDevice.syncNow(storageId, {
          deviceName: 'Desktop Device',
          platform: 'electron',
          reason: 'manual'
        })
        const desktopThirdClickAfterImport = await desktopDevice.syncNow(storageId, {
          deviceName: 'Desktop Device',
          platform: 'electron',
          reason: 'manual'
        })
        expect(desktopNoopAfterImport).toMatchObject({ success: true, action: 'noop' })
        expect(desktopThirdClickAfterImport).toMatchObject({ success: true, action: 'noop' })

        const manifest = await mobileService.getCloudSyncManifest(storageId)
        expect(manifest.latestSnapshot?.deviceId).toBe('web-device')
        expect(manifest.latestSnapshot?.dataChecksum).toBe(
          createCloudSyncDataChecksum(manifest.latestSnapshot!.data)
        )
      } finally {
        await webRuntime?.close()
      }
    })

    it('设备 A 上传后，设备 B 作为新设备能从同一 WebDAV manifest 拉取完整数据', async () => {
      const storageId = 'cfg-sync'
      const service = MobileCloudBackupService.getInstance()
      await Preferences.set({
        key: 'cloud_backup_configs',
        value: JSON.stringify([{
          id: storageId,
          name: 'Sync WebDAV',
          type: 'webdav',
          enabled: true,
          url: `${server.baseUrl}/sync-coordinator-${Date.now()}`,
          username: USERNAME,
          password: PASSWORD,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }]),
      })

      const syncData = {
        ...mockExportData,
        promptHistories: [],
        syncTombstones: []
      }
      const deviceADatabase = {
        exportAllDataForSync: vi.fn().mockResolvedValue({
          success: true,
          message: 'ok',
          data: syncData
        }),
        replaceAllData: vi.fn().mockResolvedValue({
          success: true,
          message: 'ok'
        })
      }
      const deviceBDatabase = {
        exportAllDataForSync: vi.fn().mockResolvedValue({
          success: true,
          message: 'ok',
          data: {
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
        }),
        replaceAllData: vi.fn().mockResolvedValue({
          success: true,
          message: 'ok'
        })
      }

      const deviceA = new CloudSyncService({
        cloudClient: service,
        database: deviceADatabase,
        storage: new MemoryStorage(),
        createDeviceId: () => 'device-a'
      })
      const deviceB = new CloudSyncService({
        cloudClient: service,
        database: deviceBDatabase,
        storage: new MemoryStorage(),
        createDeviceId: () => 'device-b'
      })

      const uploadResult = await deviceA.syncNow(storageId, {
        deviceName: 'iPhone A',
        platform: 'ios'
      })
      expect(uploadResult.success).toBe(true)
      expect(uploadResult.action).toBe('uploaded')

      const downloadResult = await deviceB.syncNow(storageId, {
        deviceName: 'iPad B',
        platform: 'ios'
      })
      expect(downloadResult.success).toBe(true)
      expect(downloadResult.action).toBe('downloaded')
      expect(deviceBDatabase.replaceAllData).toHaveBeenCalledWith(expect.objectContaining({
        categories: expect.arrayContaining([expect.objectContaining({ uuid: mockExportData.categories[0].uuid })]),
        prompts: expect.arrayContaining([expect.objectContaining({ uuid: mockExportData.prompts[0].uuid })])
      }))
    })

    it('本机变更事件会自动排队同步并写入同一 WebDAV manifest', async () => {
      const storageId = 'cfg-auto-sync'
      const service = MobileCloudBackupService.getInstance()
      await Preferences.set({
        key: 'cloud_backup_configs',
        value: JSON.stringify([{
          id: storageId,
          name: 'Auto Sync WebDAV',
          type: 'webdav',
          enabled: true,
          url: `${server.baseUrl}/auto-sync-${Date.now()}`,
          username: USERNAME,
          password: PASSWORD,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }]),
      })

      let dataChangeListener: ((change: any) => void) | undefined
      const syncData = {
        ...mockExportData,
        promptHistories: [],
        syncTombstones: []
      }
      const deviceDatabase = {
        exportAllDataForSync: vi.fn().mockResolvedValue({
          success: true,
          message: 'ok',
          data: syncData
        }),
        replaceAllData: vi.fn().mockResolvedValue({
          success: true,
          message: 'ok'
        })
      }
      const autoDevice = new CloudSyncService({
        cloudClient: service,
        database: deviceDatabase,
        storage: new MemoryStorage(),
        createDeviceId: () => 'auto-device',
        subscribeToDataChanges: listener => {
          dataChangeListener = listener
          return () => {
            dataChangeListener = undefined
          }
        }
      })

      try {
        autoDevice.startAutoSync({
          syncOnStart: false,
          debounceMs: 1,
          pollIntervalMs: 0,
          retryMs: 0,
          storageIds: [storageId],
          deviceName: 'Auto Device',
          platform: 'ios'
        })

        dataChangeListener?.({
          storeName: 'prompts',
          action: 'update',
          id: 1,
          timestamp: Date.now(),
          sourceId: 'integration-test'
        })

        await asyncTestHelpers.waitFor(() =>
          autoDevice.getStatus().status === 'success' &&
          deviceDatabase.exportAllDataForSync.mock.calls.length > 0
        )

        const manifest = await service.getCloudSyncManifest(storageId)
        expect(manifest.latestSnapshot?.deviceId).toBe('auto-device')
        expect(manifest.latestSnapshot?.data.prompts).toEqual(
          expect.arrayContaining([expect.objectContaining({ uuid: mockExportData.prompts[0].uuid })])
        )
      } finally {
        autoDevice.stopAutoSync()
      }
    })

    it('两个 WebDAV manifest 副本损坏时会从快照文件恢复远端数据', async () => {
      const storageId = 'cfg-snapshot-recover'
      const service = MobileCloudBackupService.getInstance()
      const remoteBaseUrl = `${server.baseUrl}/snapshot-recover-${Date.now()}`
      await Preferences.set({
        key: 'cloud_backup_configs',
        value: JSON.stringify([{
          id: storageId,
          name: 'Snapshot Recover WebDAV',
          type: 'webdav',
          enabled: true,
          url: remoteBaseUrl,
          username: USERNAME,
          password: PASSWORD,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }]),
      })

      const remoteData = {
        ...mockExportData,
        prompts: [
          { ...mockExportData.prompts[0], title: 'Recovered from snapshot file' }
        ],
        promptHistories: [],
        syncTombstones: []
      }
      const remoteSnapshot = {
        ...createCloudSyncSnapshot(remoteData, 'remote-device', 'rev-webdav-file'),
        createdAt: '2026-03-15T00:00:00.000Z'
      }

      expect((await service.saveCloudSyncSnapshot(storageId, remoteSnapshot)).success).toBe(true)
      const remoteRoot = path.join(server.rootDir, new URL(remoteBaseUrl).pathname)
      await expect(fsp.stat(
        path.join(remoteRoot, 'AI-Gist-Backup', 'sync', 'snapshots', 'rev-webdav-file.json')
      )).resolves.toBeTruthy()

      await fsp.mkdir(path.join(remoteRoot, 'AI-Gist-Backup'), { recursive: true })
      await fsp.writeFile(path.join(remoteRoot, 'AI-Gist-Backup', 'sync-manifest.json'), '{"kind":', 'utf-8')
      await fsp.writeFile(path.join(remoteRoot, 'AI-Gist-Backup', 'sync-manifest.backup.json'), '{"kind":', 'utf-8')

      const deviceDatabase = {
        exportAllDataForSync: vi.fn().mockResolvedValue({
          success: true,
          message: 'ok',
          data: {
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
        }),
        replaceAllData: vi.fn().mockResolvedValue({
          success: true,
          message: 'ok'
        })
      }
      const device = new CloudSyncService({
        cloudClient: service,
        database: deviceDatabase,
        storage: new MemoryStorage(),
        createDeviceId: () => 'recovering-device'
      })

      const result = await device.syncNow(storageId, {
        deviceName: 'Recovering Device',
        platform: 'ios'
      })

      expect(result.success).toBe(true)
      expect(result.remoteRevision).toBe('rev-webdav-file')
      expect(result.action).toBe('downloaded')
      expect(deviceDatabase.replaceAllData).toHaveBeenCalledWith(expect.objectContaining({
        prompts: expect.arrayContaining([expect.objectContaining({ title: 'Recovered from snapshot file' })])
      }))

      const repairedManifest = await service.getCloudSyncManifest(storageId)
      expect(repairedManifest.latestSnapshot?.revision).toBe('rev-webdav-file')
    })

    it('两个 WebDAV manifest 副本损坏时会自动重建并完成同步', async () => {
      const service = MobileCloudBackupService.getInstance()
      await saveConfig(service)
      await fsp.mkdir(path.join(server.rootDir, 'AI-Gist-Backup'), { recursive: true })
      await fsp.writeFile(path.join(server.rootDir, 'AI-Gist-Backup', 'sync-manifest.json'), '{"kind":', 'utf-8')
      await fsp.writeFile(path.join(server.rootDir, 'AI-Gist-Backup', 'sync-manifest.backup.json'), '{"kind":', 'utf-8')

      const syncData = {
        ...mockExportData,
        promptHistories: [],
        syncTombstones: []
      }
      const deviceDatabase = {
        exportAllDataForSync: vi.fn().mockResolvedValue({
          success: true,
          message: 'ok',
          data: syncData
        }),
        replaceAllData: vi.fn().mockResolvedValue({
          success: true,
          message: 'ok'
        })
      }
      const device = new CloudSyncService({
        cloudClient: service,
        database: deviceDatabase,
        storage: new MemoryStorage(),
        createDeviceId: () => 'repair-device'
      })
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

      try {
        const result = await device.syncNow('cfg-real', {
          deviceName: 'Repair Device',
          platform: 'ios'
        })

        expect(result.success).toBe(true)
        expect(result.action).toBe('uploaded')
        expect(deviceDatabase.replaceAllData).not.toHaveBeenCalled()

        const loaded = await service.getCloudSyncManifest('cfg-real')
        expect(loaded.latestSnapshot?.deviceId).toBe('repair-device')
        expect(loaded.latestSnapshot?.data.prompts).toEqual(
          expect.arrayContaining([expect.objectContaining({ uuid: mockExportData.prompts[0].uuid })])
        )
      } finally {
        warnSpy.mockRestore()
      }
    })
  })

  // ----------------------------------------------------------------
  // 7. 恢复备份（GET）
  // ----------------------------------------------------------------

  describe('restoreCloudBackup', () => {
    it('能恢复已上传的备份', async () => {
      const service = MobileCloudBackupService.getInstance()
      await saveConfig(service)

      // 上传
      const createResult = await service.createCloudBackup('cfg-real', mockExportData, '恢复测试')
      expect(createResult.success).toBe(true)
      const backupId = createResult.backupInfo!.id

      // 恢复
      const restoreResult = await service.restoreCloudBackup('cfg-real', backupId)
      expect(restoreResult.success).toBe(true)
      expect(restoreResult.data).toBeDefined()
      expect(restoreResult.data.categories).toHaveLength(1)
      expect(restoreResult.data.prompts).toHaveLength(1)
      expect(restoreResult.data.promptVariables).toHaveLength(1)
      expect(restoreResult.data.quickOptimizationConfigs).toHaveLength(1)
    })

    it('data 字段不嵌套（不是 { data: { data: ... } }）', async () => {
      const service = MobileCloudBackupService.getInstance()
      await saveConfig(service)

      const createResult = await service.createCloudBackup('cfg-real', mockExportData)
      const backupId     = createResult.backupInfo!.id

      const restoreResult = await service.restoreCloudBackup('cfg-real', backupId)
      expect(restoreResult.data?.data).toBeUndefined()
      expect(restoreResult.data?.categories).toBeDefined()
    })

    it('备份 ID 不存在时返回失败', async () => {
      const service = MobileCloudBackupService.getInstance()
      await saveConfig(service)

      const result = await service.restoreCloudBackup('cfg-real', 'nonexistent-id-xyz')
      expect(result.success).toBe(false)
    })
  })

  // ----------------------------------------------------------------
  // 8. Web 后端代理云备份（WebCloudBackupService → web-server → WebDAV）
  // ----------------------------------------------------------------

  describe('Web 后端代理云备份', () => {
    it('Web 端真实数据先备份再更新，两份云端备份可分别恢复且互不污染', async () => {
      const subDir = `web-backup-update-${Date.now()}`
      const config = {
        id: 'cfg-web-backup-update',
        name: 'Web Backup Update WebDAV',
        type: 'webdav',
        enabled: true,
        url: `${server.baseUrl}/${subDir}`,
        username: USERNAME,
        password: PASSWORD,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      const runtime = await createWebBackendCloudSyncClient(config)
      let currentData = createRealisticBackupData('initial')
      const restoredData: any[] = []
      const exportSpy = vi.spyOn(DatabaseServiceManager.prototype, 'exportAllDataForBackup').mockImplementation(async () => ({
        success: true,
        message: 'ok',
        data: currentData
      }) as any)
      const replaceSpy = vi.spyOn(DatabaseServiceManager.prototype, 'replaceAllData').mockImplementation(async (data: any) => {
        restoredData.push(data)
        return { success: true, message: 'restored' } as any
      })

      try {
        const firstCreate = await runtime.client.createCloudBackup(config.id, '第一次真实数据备份')
        expect(firstCreate.success).toBe(true)
        expect(firstCreate.backupInfo?.checksum).toMatch(/^fnv1a32:/)

        const firstBackupPath = path.join(
          server.rootDir,
          subDir,
          'AI-Gist-Backup',
          path.basename(firstCreate.backupInfo!.cloudPath!)
        )
        const firstPayload = parseBackupPayload(JSON.parse(await fsp.readFile(firstBackupPath, 'utf-8')))
        expect(firstPayload.data.prompts).toEqual(expect.arrayContaining([
          expect.objectContaining({
            uuid: 'real-prompt-launch',
            title: '发布计划提示词',
            imageBlobs: expect.arrayContaining([expect.stringContaining('data:image/png;base64')])
          })
        ]))
        expect(firstPayload.data.promptHistories).toHaveLength(1)

        currentData = createRealisticBackupData('updated')
        const secondCreate = await runtime.client.createCloudBackup(config.id, '更新后真实数据备份')
        expect(secondCreate.success).toBe(true)
        expect(secondCreate.backupInfo?.id).not.toBe(firstCreate.backupInfo?.id)
        expect(secondCreate.backupInfo?.checksum).not.toBe(firstCreate.backupInfo?.checksum)

        const backups = await runtime.client.getCloudBackupList(config.id)
        expect(backups.map(backup => backup.id)).toEqual(expect.arrayContaining([
          firstCreate.backupInfo!.id,
          secondCreate.backupInfo!.id
        ]))

        const secondBackupPath = path.join(
          server.rootDir,
          subDir,
          'AI-Gist-Backup',
          path.basename(secondCreate.backupInfo!.cloudPath!)
        )
        const secondPayload = parseBackupPayload(JSON.parse(await fsp.readFile(secondBackupPath, 'utf-8')))
        expect(secondPayload.data.prompts).toEqual(expect.arrayContaining([
          expect.objectContaining({
            uuid: 'real-prompt-launch',
            title: '发布计划提示词 - 更新版',
            imageBlobs: expect.arrayContaining([expect.stringContaining('data:image/png;base64')])
          })
        ]))
        expect(secondPayload.data.promptHistories).toEqual(expect.arrayContaining([
          expect.objectContaining({ uuid: 'real-history-initial' }),
          expect.objectContaining({ uuid: 'real-history-updated' })
        ]))
        expect(secondPayload.data.settings).toEqual(expect.arrayContaining([
          expect.objectContaining({ key: 'theme', value: 'light' }),
          expect.objectContaining({ key: 'cloud.sync.intervalMinutes', value: 5 })
        ]))
        expect(firstPayload.data.prompts[0].title).toBe('发布计划提示词')
        expect(firstPayload.data.promptHistories).toHaveLength(1)

        const restoreFirst = await runtime.client.restoreCloudBackup(config.id, firstCreate.backupInfo!.id)
        const restoreSecond = await runtime.client.restoreCloudBackup(config.id, secondCreate.backupInfo!.id)
        expect(restoreFirst.success).toBe(true)
        expect(restoreSecond.success).toBe(true)
        expect(restoredData[0].prompts[0].title).toBe('发布计划提示词')
        expect(restoredData[0].promptHistories).toHaveLength(1)
        expect(restoredData[1].prompts[0].title).toBe('发布计划提示词 - 更新版')
        expect(restoredData[1].promptHistories).toEqual(expect.arrayContaining([
          expect.objectContaining({ uuid: 'real-history-updated' })
        ]))
        expect(restoredData[1].settings).toEqual(expect.arrayContaining([
          expect.objectContaining({ key: 'theme', value: 'light' })
        ]))

        expect(exportSpy).toHaveBeenCalledTimes(2)
        expect(replaceSpy).toHaveBeenCalledTimes(2)
      } finally {
        exportSpy.mockRestore()
        replaceSpy.mockRestore()
        await runtime.close()
      }
    })

    it('Web 端创建、列出和恢复的备份使用同一 checksum payload，损坏后不会恢复', async () => {
      const subDir = `web-backup-${Date.now()}`
      const config = {
        id: 'cfg-web-backup',
        name: 'Web Backup WebDAV',
        type: 'webdav',
        enabled: true,
        url: `${server.baseUrl}/${subDir}`,
        username: USERNAME,
        password: PASSWORD,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      const runtime = await createWebBackendCloudSyncClient(config)
      const exportSpy = vi.spyOn(DatabaseServiceManager.prototype, 'exportAllDataForBackup').mockResolvedValue({
        success: true,
        message: 'ok',
        data: mockExportData
      } as any)
      const replaceSpy = vi.spyOn(DatabaseServiceManager.prototype, 'replaceAllData').mockResolvedValue({
        success: true,
        message: 'restored'
      } as any)

      try {
        const createResult = await runtime.client.createCloudBackup(config.id, 'Web 后端集成备份')
        expect(createResult.success).toBe(true)
        expect(exportSpy).toHaveBeenCalledTimes(1)
        expect(createResult.backupInfo?.checksum).toMatch(/^fnv1a32:/)
        expect(createResult.backupInfo?.name).not.toMatch(/\.json$/)

        const backupPath = path.join(
          server.rootDir,
          subDir,
          'AI-Gist-Backup',
          path.basename(createResult.backupInfo!.cloudPath!)
        )
        const rawPayload = JSON.parse(await fsp.readFile(backupPath, 'utf-8'))
        const parsedPayload = parseBackupPayload(rawPayload)
        expect(parsedPayload.legacy).toBe(false)
        expect(parsedPayload.data).toEqual(mockExportData)
        expect(rawPayload.schemaVersion).toBe(1)

        const backups = await runtime.client.getCloudBackupList(config.id)
        expect(backups).toEqual(expect.arrayContaining([
          expect.objectContaining({
            id: createResult.backupInfo!.id,
            checksum: rawPayload.checksum
          })
        ]))

        const restoreResult = await runtime.client.restoreCloudBackup(config.id, createResult.backupInfo!.id)
        expect(restoreResult.success).toBe(true)
        expect(replaceSpy).toHaveBeenCalledWith(mockExportData)

        replaceSpy.mockClear()
        rawPayload.data.prompts.push({
          ...mockExportData.prompts[0],
          id: 999,
          uuid: 'corrupted-web-backup'
        })
        await fsp.writeFile(backupPath, JSON.stringify(rawPayload, null, 2), 'utf-8')

        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        try {
          const backupsAfterCorruption = await runtime.client.getCloudBackupList(config.id)
          expect(backupsAfterCorruption.some(backup => backup.id === createResult.backupInfo!.id)).toBe(false)

          const restoreCorrupted = await runtime.client.restoreCloudBackup(config.id, createResult.backupInfo!.id)
          expect(restoreCorrupted.success).toBe(false)
          expect(replaceSpy).not.toHaveBeenCalled()
          expect(warnSpy).toHaveBeenCalled()
        } finally {
          warnSpy.mockRestore()
        }
      } finally {
        exportSpy.mockRestore()
        replaceSpy.mockRestore()
        await runtime.close()
      }
    })
  })

  // ----------------------------------------------------------------
  // 6. 删除备份（DELETE）
  // ----------------------------------------------------------------

  describe('deleteCloudBackup', () => {
    it('成功删除已上传的备份', async () => {
      const service = MobileCloudBackupService.getInstance()
      await saveConfig(service)

      const createResult = await service.createCloudBackup('cfg-real', mockExportData, '删除测试')
      expect(createResult.success).toBe(true)
      const backupId = createResult.backupInfo!.id

      const deleteResult = await service.deleteCloudBackup('cfg-real', backupId)
      expect(deleteResult.success).toBe(true)

      // 删除后列表中不再包含该备份
      const backups = await service.getCloudBackupList('cfg-real')
      const found   = backups.find(b => b.id === backupId)
      expect(found).toBeUndefined()
    })
  })

  // ----------------------------------------------------------------
  // 7. 完整端到端流程
  // ----------------------------------------------------------------

  describe('端到端：备份 → 列表 → 恢复 → 删除', () => {
    it('iOS 完整流程', async () => {
      const service = MobileCloudBackupService.getInstance()
      await saveConfig(service)

      // 1. 备份
      const createResult = await service.createCloudBackup('cfg-real', mockExportData, 'iOS 端到端')
      expect(createResult.success).toBe(true)
      const backupId = createResult.backupInfo!.id

      // 2. 列表中能找到
      const backups = await service.getCloudBackupList('cfg-real')
      expect(backups.some(b => b.id === backupId)).toBe(true)

      // 3. 恢复
      const restoreResult = await service.restoreCloudBackup('cfg-real', backupId)
      expect(restoreResult.success).toBe(true)
      expect(restoreResult.data.categories).toHaveLength(1)
      expect(restoreResult.data.prompts).toHaveLength(1)
      expect(restoreResult.data.promptVariables).toHaveLength(1)
      expect(restoreResult.data.aiConfigs).toHaveLength(1)
      expect(restoreResult.data.quickOptimizationConfigs).toHaveLength(1)

      // 4. 删除
      const deleteResult = await service.deleteCloudBackup('cfg-real', backupId)
      expect(deleteResult.success).toBe(true)

      // 5. 确认已删除
      const backupsAfter = await service.getCloudBackupList('cfg-real')
      expect(backupsAfter.some(b => b.id === backupId)).toBe(false)
    })

    it('Android 完整流程（同 iOS，平台标识不同）', async () => {
      // 切换平台标识
      const { Capacitor } = await import('@capacitor/core')
      vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('android')

      const service = MobileCloudBackupService.getInstance()
      await saveConfig(service)

      const createResult = await service.createCloudBackup('cfg-real', mockExportData, 'Android 端到端')
      expect(createResult.success).toBe(true)

      const backupId      = createResult.backupInfo!.id
      const restoreResult = await service.restoreCloudBackup('cfg-real', backupId)
      expect(restoreResult.success).toBe(true)
      expect(restoreResult.data.categories).toHaveLength(1)
    })

    it('跨平台兼容：iOS 创建备份，Android 通过原生 OkHttp PROPFIND 独立发现并列出', async () => {
      const { default: http } = await import('http')
      const { Capacitor } = await import('@capacitor/core')

      // 使用独立子目录，避免被其他测试写入的文件污染
      const subPath = '/cross-platform-test-' + Date.now()
      await new Promise<void>((resolve, reject) => {
        const req = http.request(
          { hostname: '127.0.0.1', port: PORT, path: subPath, method: 'MKCOL',
            headers: { Authorization: 'Basic ' + Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64') } },
          () => resolve()
        )
        req.on('error', reject)
        req.end()
      })

      const subUrl = server.baseUrl + subPath
      const setCfg = async () => {
        await Preferences.set({
          key: 'cloud_backup_configs',
          value: JSON.stringify([{
            id: 'cfg-cross',
            name: 'Cross Platform Test',
            type: 'webdav',
            enabled: true,
            url: subUrl,
            username: USERNAME,
            password: PASSWORD,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }]),
        })
      }

      // iOS 创建备份
      vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('ios')
      const iosService = MobileCloudBackupService.getInstance()
      await setCfg()

      const createResult = await iosService.createCloudBackup('cfg-cross', mockExportData, 'iOS 跨平台测试')
      expect(createResult.success).toBe(true)
      const backupId = createResult.backupInfo!.id

      // 切换到 Android，Android 使用原生 OkHttp 插件执行 PROPFIND，不依赖 manifest
      // 无需预先写入任何元数据文件，直接从 WebDAV 服务器发现备份
      ;(MobileCloudBackupService as any).instance = undefined
      vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('android')
      const androidService = MobileCloudBackupService.getInstance()
      await setCfg()
      setupWebDavNativeProxy() // 重新设置，因为 vi.clearAllMocks 会清除
      setupWebDavRequestProxy()

      // Android 通过原生 OkHttp PROPFIND 独立发现备份，不依赖任何其他平台预先写入的索引
      const backups = await androidService.getCloudBackupList('cfg-cross')
      expect(backups.some(b => b.id === backupId)).toBe(true)
    })

    it('多次备份后列表按时间倒序排列', async () => {
      const service = MobileCloudBackupService.getInstance()
      await saveConfig(service)

      // 连续创建 3 个备份
      for (let i = 0; i < 3; i++) {
        const r = await service.createCloudBackup('cfg-real', mockExportData, `备份 ${i}`)
        expect(r.success).toBe(true)
        // 确保时间戳不同
        await new Promise(r => setTimeout(r, 10))
      }

      const backups = await service.getCloudBackupList('cfg-real')
      expect(backups.length).toBeGreaterThanOrEqual(3)

      // 验证倒序
      for (let i = 0; i < backups.length - 1; i++) {
        const t1 = new Date(backups[i].createdAt).getTime()
        const t2 = new Date(backups[i + 1].createdAt).getTime()
        expect(t1).toBeGreaterThanOrEqual(t2)
      }
    })
  })

  // ----------------------------------------------------------------
  // 8. 配置管理
  // ----------------------------------------------------------------

  describe('存储配置管理', () => {
    it('添加配置', async () => {
      const service = MobileCloudBackupService.getInstance()
      const result  = await service.addStorageConfig({
        name: 'New Config',
        type: 'webdav',
        enabled: true,
        url: server.baseUrl,
        username: USERNAME,
        password: PASSWORD,
      } as any)

      expect(result.success).toBe(true)
      expect(result.config?.id).toBeDefined()

      const configs = await service.getStorageConfigs()
      expect(configs.some(c => c.name === 'New Config')).toBe(true)
    })

    it('更新配置', async () => {
      const service = MobileCloudBackupService.getInstance()
      await saveConfig(service)

      const result = await service.updateStorageConfig('cfg-real', { name: '已更新' })
      expect(result.success).toBe(true)

      const configs = await service.getStorageConfigs()
      expect(configs[0].name).toBe('已更新')
    })

    it('删除配置', async () => {
      const service = MobileCloudBackupService.getInstance()
      await saveConfig(service)

      const result = await service.deleteStorageConfig('cfg-real')
      expect(result.success).toBe(true)

      const configs = await service.getStorageConfigs()
      expect(configs).toHaveLength(0)
    })
  })
})
