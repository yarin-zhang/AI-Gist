/**
 * WebDAV 集成测试
 * 使用内置 Node.js HTTP 服务器（TestWebDAVServer）进行真实 HTTP 通信测试
 * 覆盖：连接验证、文件读写删除、目录操作、备份/恢复完整流程
 * 适用平台：iOS / Android（MobileCloudBackupService）、桌面端（WebDAVProvider）
 */

// @vitest-environment node

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest'
import { JSDOM } from 'jsdom'
import { TestWebDAVServer } from '../helpers/webdav-server'
import { testDataGenerators } from '../helpers/test-utils'

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
vi.mock('@renderer/capacitor-bridge/webdav-native', () => ({
  default: { propfind: mockWebDavPropfind, request: vi.fn() },
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'ios' },
  CapacitorHttp: { request: vi.fn() },
}))

import { MobileCloudBackupService } from '~/lib/services/mobile-cloud-backup.service'
import { CapacitorHttp } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'

const mockHttp = CapacitorHttp as unknown as { request: ReturnType<typeof vi.fn> }

// ---- 服务器配置 ----

const PORT     = 18766
const USERNAME = 'testuser'
const PASSWORD = 'testpass'

let server: TestWebDAVServer

// ---- 测试数据 ----

const mockExportData = {
  categories: [testDataGenerators.createMockCategory({ id: 1 })],
  prompts:    [testDataGenerators.createMockPrompt({ id: 1, categoryId: 1 })],
  aiConfigs:  [testDataGenerators.createMockAIConfig({ id: 1 })],
  aiHistory:  [],
  settings:   [{ key: 'theme', value: 'dark', type: 'string', description: '' }],
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
          try { data = JSON.parse(raw) } catch {}
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
  // 2. MobileCloudBackupService — 连接测试
  // ----------------------------------------------------------------

  describe('WebDAV 连接测试（移动端）', () => {
    it('正确凭据连接成功', async () => {
      const service = MobileCloudBackupService.getInstance()
      await saveConfig(service)

      const configs = await service.getStorageConfigs()
      const result  = await service.testStorageConnection(configs[0])
      expect(result.success).toBe(true)
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
  // 5. 恢复备份（GET）
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
      expect(restoreResult.data.aiConfigs).toHaveLength(1)

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
