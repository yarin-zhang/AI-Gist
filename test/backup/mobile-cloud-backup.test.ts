/**
 * MobileCloudBackupService 测试
 * 覆盖：WebDAV 连接/备份/恢复、桌面备份→移动恢复、移动备份→桌面恢复
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { testDataGenerators } from '../helpers/test-utils'

// ---- mock Capacitor ----

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
  }
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

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'ios' },
  CapacitorHttp: { request: vi.fn() },
}))

import { MobileCloudBackupService } from '~/lib/services/mobile-cloud-backup.service'
import { Filesystem } from '@capacitor/filesystem'
import { Preferences } from '@capacitor/preferences'
import { CapacitorHttp, Capacitor } from '@capacitor/core'

const mockCapacitorHttp = CapacitorHttp as unknown as { request: ReturnType<typeof vi.fn> }

// ---- 测试数据 ----

const webdavConfig = {
  id: 'cfg-1',
  name: 'My WebDAV',
  type: 'webdav' as const,
  enabled: true,
  url: 'https://dav.example.com/backup/', // 末尾有斜杠，测试 normalizeBaseUrl
  username: 'user',
  password: 'pass',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

const mockExportData = {
  categories: [testDataGenerators.createMockCategory({ id: 1 })],
  prompts: [testDataGenerators.createMockPrompt({ id: 1, categoryId: 1 })],
  aiConfigs: [testDataGenerators.createMockAIConfig({ id: 1 })],
  aiHistory: [],
  settings: [{ key: 'theme', value: 'dark', type: 'string', description: '' }],
}

// 桌面端备份文件格式（包含 .data 包装）
function makeDesktopBackupFile(id = 'backup-id-001') {
  return {
    id,
    name: `backup-2026-03-12-${id.substring(0, 8)}`,
    description: '桌面端云端备份',
    createdAt: new Date().toISOString(),
    data: mockExportData,
  }
}

// 移动端备份文件格式（与桌面端相同结构）
function makeMobileBackupFile(id = 'mobile-id-001') {
  return makeDesktopBackupFile(id)
}

// WebDAV PROPFIND XML 响应
function makePropfindXml(files: { name: string; path: string }[]) {
  const responses = files.map(f => `
    <d:response>
      <d:href>${f.path}</d:href>
      <d:propstat>
        <d:prop>
          <d:resourcetype></d:resourcetype>
          <d:getcontentlength>1024</d:getcontentlength>
          <d:getlastmodified>Thu, 12 Mar 2026 00:00:00 GMT</d:getlastmodified>
        </d:prop>
        <d:status>HTTP/1.1 200 OK</d:status>
      </d:propstat>
    </d:response>`).join('')

  return `<?xml version="1.0"?>
    <d:multistatus xmlns:d="DAV:">
      <d:response>
        <d:href>/backup/</d:href>
        <d:propstat>
          <d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop>
          <d:status>HTTP/1.1 200 OK</d:status>
        </d:propstat>
      </d:response>
      ${responses}
    </d:multistatus>`
}

// ---- helpers ----

async function saveConfig(service: MobileCloudBackupService, config = webdavConfig) {
  await Preferences.set({ key: 'cloud_backup_configs', value: JSON.stringify([config]) })
}

describe('MobileCloudBackupService', () => {
  let service: MobileCloudBackupService

  beforeEach(() => {
    ;(MobileCloudBackupService as any).instance = undefined
    service = MobileCloudBackupService.getInstance()
    Object.keys(mockPreferences).forEach(k => delete mockPreferences[k])
    vi.clearAllMocks()
  })

  // ---- 配置管理 ----

  describe('存储配置管理', () => {
    it('添加 WebDAV 配置', async () => {
      const result = await service.addStorageConfig({
        name: 'Test DAV',
        type: 'webdav',
        enabled: true,
        url: 'https://dav.example.com',
        username: 'u',
        password: 'p',
      } as any)

      expect(result.success).toBe(true)
      expect(result.config?.id).toBeDefined()

      const configs = await service.getStorageConfigs()
      expect(configs).toHaveLength(1)
      expect(configs[0].name).toBe('Test DAV')
    })

    it('删除配置', async () => {
      await saveConfig(service)
      const result = await service.deleteStorageConfig('cfg-1')

      expect(result.success).toBe(true)
      const configs = await service.getStorageConfigs()
      expect(configs).toHaveLength(0)
    })

    it('更新配置', async () => {
      await saveConfig(service)
      const result = await service.updateStorageConfig('cfg-1', { name: 'Updated' })

      expect(result.success).toBe(true)
      const configs = await service.getStorageConfigs()
      expect(configs[0].name).toBe('Updated')
    })
  })

  // ---- WebDAV 连接测试 ----

  describe('WebDAV 连接', () => {
    it('连接成功（207 响应）', async () => {
      mockCapacitorHttp.request.mockResolvedValue({ status: 207, data: '' })
      await saveConfig(service)

      const result = await service.testStorageConnection(webdavConfig)
      expect(result.success).toBe(true)
    })

    it('认证失败（401 响应）', async () => {
      mockCapacitorHttp.request.mockResolvedValue({ status: 401, data: '' })
      await saveConfig(service)

      const result = await service.testStorageConnection(webdavConfig)
      expect(result.success).toBe(false)
    })

    it('URL 末尾斜杠被正确处理（不产生双斜杠）', async () => {
      mockCapacitorHttp.request.mockResolvedValue({ status: 207, data: '' })
      await saveConfig(service)

      await service.testStorageConnection(webdavConfig)

      const calledUrl = mockCapacitorHttp.request.mock.calls[0][0].url
      // 协议头 https:// 之后不应有双斜杠
      expect(calledUrl.replace(/^https?:\/\//, '')).not.toContain('//')
      expect(calledUrl).toBe('https://dav.example.com/backup')
    })
  })

  // ---- WebDAV 备份列表 ----

  describe('getCloudBackupList (WebDAV)', () => {
    it('正确解析备份文件列表', async () => {
      await saveConfig(service)

      const backupFile = makeDesktopBackupFile('abc12345')
      const xml = makePropfindXml([{ name: 'backup-abc12345.json', path: '/backup/backup-abc12345.json' }])

      mockCapacitorHttp.request
        .mockResolvedValueOnce({ status: 207, data: xml })           // PROPFIND
        .mockResolvedValueOnce({ status: 200, data: backupFile })    // GET file

      const backups = await service.getCloudBackupList('cfg-1')

      expect(backups).toHaveLength(1)
      expect(backups[0].id).toBe('abc12345')
      expect(backups[0].name).toContain('backup-')
    })

    it('目录不存在（404）时返回空列表', async () => {
      await saveConfig(service)
      mockCapacitorHttp.request.mockResolvedValue({ status: 404, data: '' })

      const backups = await service.getCloudBackupList('cfg-1')
      expect(backups).toEqual([])
    })

    it('文件 URL 不含双斜杠', async () => {
      await saveConfig(service)

      const backupFile = makeDesktopBackupFile('abc12345')
      const xml = makePropfindXml([{ name: 'backup-abc12345.json', path: '/backup/backup-abc12345.json' }])

      mockCapacitorHttp.request
        .mockResolvedValueOnce({ status: 207, data: xml })
        .mockResolvedValueOnce({ status: 200, data: backupFile })

      await service.getCloudBackupList('cfg-1')

      // 第二次调用是 GET 文件，协议头之后不应有双斜杠
      const getUrl = mockCapacitorHttp.request.mock.calls[1][0].url
      expect(getUrl.replace(/^https?:\/\//, '')).not.toContain('//')
    })
  })

  // ---- WebDAV 创建备份 ----

  describe('createCloudBackup (WebDAV)', () => {
    it('成功上传备份文件', async () => {
      await saveConfig(service)
      mockCapacitorHttp.request.mockResolvedValue({ status: 201, data: '' })

      const result = await service.createCloudBackup('cfg-1', mockExportData, '测试备份')

      expect(result.success).toBe(true)
      expect(result.backupInfo?.storageId).toBe('cfg-1')

      const putCall = mockCapacitorHttp.request.mock.calls[0][0]
      expect(putCall.method).toBe('PUT')
      expect(putCall.url.replace(/^https?:\/\//, '')).not.toContain('//')
    })

    it('上传失败（401）时返回错误', async () => {
      await saveConfig(service)
      mockCapacitorHttp.request.mockResolvedValue({ status: 401, data: '' })

      const result = await service.createCloudBackup('cfg-1', mockExportData)
      expect(result.success).toBe(false)
      expect(result.error).toContain('认证')
    })

    it('存储配置不存在时返回错误', async () => {
      const result = await service.createCloudBackup('nonexistent', mockExportData)
      expect(result.success).toBe(false)
    })
  })

  // ---- 场景1：桌面备份 → 移动恢复 ----

  describe('场景：桌面备份 → 移动端恢复', () => {
    it('能正确解析桌面端备份文件格式并返回 data', async () => {
      await saveConfig(service)

      const desktopBackup = makeDesktopBackupFile('desktop-001')
      const xml = makePropfindXml([{ name: 'backup-desktop-001.json', path: '/backup/backup-desktop-001.json' }])

      mockCapacitorHttp.request
        .mockResolvedValueOnce({ status: 207, data: xml })           // list: PROPFIND
        .mockResolvedValueOnce({ status: 200, data: desktopBackup }) // list: GET metadata
        .mockResolvedValueOnce({ status: 200, data: desktopBackup }) // restore: download

      const result = await service.restoreCloudBackup('cfg-1', 'desktop-001')

      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.data.categories).toHaveLength(1)
      expect(result.data.prompts).toHaveLength(1)
    })

    it('桌面备份的 data 字段被正确解包（不是 { data: { data: ... } }）', async () => {
      await saveConfig(service)

      const desktopBackup = makeDesktopBackupFile('desktop-002')
      const xml = makePropfindXml([{ name: 'backup-desktop-002.json', path: '/backup/backup-desktop-002.json' }])

      mockCapacitorHttp.request
        .mockResolvedValueOnce({ status: 207, data: xml })
        .mockResolvedValueOnce({ status: 200, data: desktopBackup })
        .mockResolvedValueOnce({ status: 200, data: desktopBackup })

      const result = await service.restoreCloudBackup('cfg-1', 'desktop-002')

      // result.data 应该是 { categories, prompts, ... }，不应该有嵌套的 .data
      expect(result.data?.data).toBeUndefined()
      expect(result.data?.categories).toBeDefined()
    })
  })

  // ---- 场景2：移动备份 → 移动恢复 ----

  describe('场景：移动备份 → 移动端恢复', () => {
    it('完整的备份-恢复流程', async () => {
      await saveConfig(service)

      // 备份（iOS 平台：只需 PUT，无 manifest 更新）
      mockCapacitorHttp.request.mockResolvedValueOnce({ status: 201, data: '' })
      const backupResult = await service.createCloudBackup('cfg-1', mockExportData, '移动端备份')
      expect(backupResult.success).toBe(true)

      const backupId = backupResult.backupInfo!.id
      const mobileBackup = makeMobileBackupFile(backupId)
      const xml = makePropfindXml([{ name: `backup-${backupId}.json`, path: `/backup/backup-${backupId}.json` }])

      // 恢复
      mockCapacitorHttp.request
        .mockResolvedValueOnce({ status: 207, data: xml })
        .mockResolvedValueOnce({ status: 200, data: mobileBackup })
        .mockResolvedValueOnce({ status: 200, data: mobileBackup })

      const restoreResult = await service.restoreCloudBackup('cfg-1', backupId)

      expect(restoreResult.success).toBe(true)
      expect(restoreResult.data?.categories).toHaveLength(1)
    })
  })

  // ---- WebDAV 删除备份 ----

  describe('deleteCloudBackup (WebDAV)', () => {
    it('成功删除备份文件', async () => {
      await saveConfig(service)

      const backupFile = makeDesktopBackupFile('del-001')
      const xml = makePropfindXml([{ name: 'backup-del-001.json', path: '/backup/backup-del-001.json' }])

      mockCapacitorHttp.request
        .mockResolvedValueOnce({ status: 207, data: xml })
        .mockResolvedValueOnce({ status: 200, data: backupFile })
        .mockResolvedValueOnce({ status: 204, data: '' }) // DELETE

      const result = await service.deleteCloudBackup('cfg-1', 'del-001')
      expect(result.success).toBe(true)

      const deleteCall = mockCapacitorHttp.request.mock.calls[2][0]
      expect(deleteCall.method).toBe('DELETE')
    })
  })

  // ---- parseWebDAVResponse ----

  describe('parseWebDAVResponse', () => {
    it('正确解析标准 WebDAV XML', () => {
      const xml = makePropfindXml([
        { name: 'backup-aaa.json', path: '/backup/backup-aaa.json' },
        { name: 'backup-bbb.json', path: '/backup/backup-bbb.json' },
      ])

      const files = (service as any).parseWebDAVResponse(xml, 'https://dav.example.com/backup')

      expect(files).toHaveLength(2)
      expect(files[0].name).toBe('backup-aaa.json')
      expect(files[1].name).toBe('backup-bbb.json')
    })

    it('过滤掉目录条目', () => {
      const xml = `<?xml version="1.0"?>
        <d:multistatus xmlns:d="DAV:">
          <d:response>
            <d:href>/backup/</d:href>
            <d:propstat>
              <d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop>
              <d:status>HTTP/1.1 200 OK</d:status>
            </d:propstat>
          </d:response>
          <d:response>
            <d:href>/backup/backup-ccc.json</d:href>
            <d:propstat>
              <d:prop>
                <d:resourcetype></d:resourcetype>
                <d:getcontentlength>512</d:getcontentlength>
                <d:getlastmodified>Thu, 12 Mar 2026 00:00:00 GMT</d:getlastmodified>
              </d:prop>
              <d:status>HTTP/1.1 200 OK</d:status>
            </d:propstat>
          </d:response>
        </d:multistatus>`

      const files = (service as any).parseWebDAVResponse(xml, 'https://dav.example.com/backup')

      expect(files).toHaveLength(1)
      expect(files[0].name).toBe('backup-ccc.json')
    })

    it('URL 编码的路径被正确解码', () => {
      const xml = makePropfindXml([
        { name: 'backup%20test.json', path: '/backup/backup%20test.json' }
      ])

      const files = (service as any).parseWebDAVResponse(xml, 'https://dav.example.com/backup')

      expect(files[0].name).toBe('backup test.json')
    })
  })

  // ---- normalizeBaseUrl ----

  describe('normalizeBaseUrl', () => {
    it('去掉末尾单斜杠', () => {
      const result = (service as any).normalizeBaseUrl('https://example.com/dav/')
      expect(result).toBe('https://example.com/dav')
    })

    it('去掉末尾多个斜杠', () => {
      const result = (service as any).normalizeBaseUrl('https://example.com/dav///')
      expect(result).toBe('https://example.com/dav')
    })

    it('没有末尾斜杠时不变', () => {
      const result = (service as any).normalizeBaseUrl('https://example.com/dav')
      expect(result).toBe('https://example.com/dav')
    })
  })
})

// ================================================================
// Android 平台测试（manifest 方案）
// ================================================================

describe('MobileCloudBackupService — Android 平台', () => {
  let service: MobileCloudBackupService

  beforeEach(() => {
    ;(MobileCloudBackupService as any).instance = undefined
    service = MobileCloudBackupService.getInstance()
    Object.keys(mockPreferences).forEach(k => delete mockPreferences[k])
    vi.clearAllMocks()
    // 切换到 Android 平台
    vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('android')
  })

  // ---- 获取备份列表 ----

  describe('getCloudBackupList（Android manifest 方案）', () => {
    it('从 manifest 获取备份列表', async () => {
      await saveConfig(service)

      const backupInfo = {
        id: 'android-001',
        name: 'backup-2026-03-15-android001',
        description: 'Android 备份',
        createdAt: new Date().toISOString(),
        size: 1024,
        cloudPath: '/backup-android-001.json',
        storageId: 'cfg-1',
      }

      mockCapacitorHttp.request
        .mockResolvedValueOnce({ status: 200, data: { backups: [backupInfo] } }) // GET manifest

      const backups = await service.getCloudBackupList('cfg-1')

      expect(backups).toHaveLength(1)
      expect(backups[0].id).toBe('android-001')
      // 只发起 1 次请求（GET manifest），不使用 PROPFIND
      expect(mockCapacitorHttp.request).toHaveBeenCalledTimes(1)
      expect(mockCapacitorHttp.request.mock.calls[0][0].method).toBe('GET')
    })

    it('manifest 不存在（404）时返回空列表', async () => {
      await saveConfig(service)
      mockCapacitorHttp.request.mockResolvedValue({ status: 404, data: '' })

      const backups = await service.getCloudBackupList('cfg-1')
      expect(backups).toEqual([])
    })

    it('manifest 按创建时间倒序排列', async () => {
      await saveConfig(service)

      const older = {
        id: 'b1', name: 'backup-1', description: '', storageId: 'cfg-1', size: 0, cloudPath: '/b1.json',
        createdAt: new Date(Date.now() - 10000).toISOString(),
      }
      const newer = {
        id: 'b2', name: 'backup-2', description: '', storageId: 'cfg-1', size: 0, cloudPath: '/b2.json',
        createdAt: new Date().toISOString(),
      }

      // manifest 里旧的在前
      mockCapacitorHttp.request
        .mockResolvedValueOnce({ status: 200, data: { backups: [older, newer] } })

      const backups = await service.getCloudBackupList('cfg-1')
      expect(backups[0].id).toBe('b2') // 新的在前
      expect(backups[1].id).toBe('b1')
    })
  })

  // ---- 创建备份 ----

  describe('createCloudBackup（Android manifest 方案）', () => {
    it('上传备份文件并更新 manifest', async () => {
      await saveConfig(service)

      mockCapacitorHttp.request
        .mockResolvedValueOnce({ status: 201, data: '' })  // PUT backup file
        .mockResolvedValueOnce({ status: 404, data: '' })  // GET manifest（首次，空）
        .mockResolvedValueOnce({ status: 201, data: '' })  // PUT manifest

      const result = await service.createCloudBackup('cfg-1', mockExportData, 'Android 测试备份')

      expect(result.success).toBe(true)
      expect(result.backupInfo?.storageId).toBe('cfg-1')

      // 验证 3 次请求：PUT 文件、GET manifest、PUT manifest
      expect(mockCapacitorHttp.request).toHaveBeenCalledTimes(3)
      expect(mockCapacitorHttp.request.mock.calls[0][0].method).toBe('PUT')  // 备份文件
      expect(mockCapacitorHttp.request.mock.calls[1][0].method).toBe('GET')  // 读 manifest
      expect(mockCapacitorHttp.request.mock.calls[2][0].method).toBe('PUT')  // 写 manifest
    })

    it('manifest PUT 的 URL 包含 backup-manifest.json', async () => {
      await saveConfig(service)

      mockCapacitorHttp.request
        .mockResolvedValueOnce({ status: 201, data: '' })
        .mockResolvedValueOnce({ status: 404, data: '' })
        .mockResolvedValueOnce({ status: 201, data: '' })

      await service.createCloudBackup('cfg-1', mockExportData)

      const manifestPutUrl: string = mockCapacitorHttp.request.mock.calls[2][0].url
      expect(manifestPutUrl).toContain('backup-manifest.json')
      expect(manifestPutUrl.replace(/^https?:\/\//, '')).not.toContain('//')
    })

    it('已有 manifest 时追加新条目', async () => {
      await saveConfig(service)

      const existing = {
        id: 'existing-1', name: 'backup-existing', description: '', storageId: 'cfg-1',
        size: 100, cloudPath: '/backup-existing.json', createdAt: new Date().toISOString(),
      }

      mockCapacitorHttp.request
        .mockResolvedValueOnce({ status: 201, data: '' })                              // PUT backup file
        .mockResolvedValueOnce({ status: 200, data: { backups: [existing] } })         // GET manifest
        .mockResolvedValueOnce({ status: 201, data: '' })                              // PUT manifest

      const result = await service.createCloudBackup('cfg-1', mockExportData, '新备份')
      expect(result.success).toBe(true)

      // 验证写入的 manifest 包含旧条目 + 新条目（共 2 条）
      const putManifestBody = JSON.parse(mockCapacitorHttp.request.mock.calls[2][0].data)
      expect(putManifestBody.backups).toHaveLength(2)
      expect(putManifestBody.backups[0].id).toBe('existing-1')
    })
  })

  // ---- 恢复备份 ----

  describe('restoreCloudBackup（Android manifest 方案）', () => {
    it('通过 manifest 找到备份并下载', async () => {
      await saveConfig(service)

      const backupFile = makeDesktopBackupFile('android-restore-001')
      const backupInfo = {
        id: 'android-restore-001',
        name: backupFile.name,
        description: backupFile.description,
        createdAt: backupFile.createdAt,
        size: 1024,
        cloudPath: '/backup-android-restore-001.json',
        storageId: 'cfg-1',
      }

      mockCapacitorHttp.request
        .mockResolvedValueOnce({ status: 200, data: { backups: [backupInfo] } }) // GET manifest
        .mockResolvedValueOnce({ status: 200, data: backupFile })                 // GET backup file

      const result = await service.restoreCloudBackup('cfg-1', 'android-restore-001')

      expect(result.success).toBe(true)
      expect(result.data?.categories).toHaveLength(1)
      expect(result.data?.prompts).toHaveLength(1)
      // 共 2 次请求：GET manifest + GET 备份文件
      expect(mockCapacitorHttp.request).toHaveBeenCalledTimes(2)
    })

    it('manifest 中不存在该备份 ID 时返回失败', async () => {
      await saveConfig(service)

      mockCapacitorHttp.request
        .mockResolvedValueOnce({ status: 200, data: { backups: [] } }) // GET manifest（空）

      const result = await service.restoreCloudBackup('cfg-1', 'nonexistent-id')
      expect(result.success).toBe(false)
    })

    it('data 字段不嵌套（不是 { data: { data: ... } }）', async () => {
      await saveConfig(service)

      const backupFile = makeDesktopBackupFile('android-restore-002')
      const backupInfo = {
        id: 'android-restore-002', name: backupFile.name, description: '',
        createdAt: backupFile.createdAt, size: 0,
        cloudPath: '/backup-android-restore-002.json', storageId: 'cfg-1',
      }

      mockCapacitorHttp.request
        .mockResolvedValueOnce({ status: 200, data: { backups: [backupInfo] } })
        .mockResolvedValueOnce({ status: 200, data: backupFile })

      const result = await service.restoreCloudBackup('cfg-1', 'android-restore-002')

      expect(result.data?.data).toBeUndefined()
      expect(result.data?.categories).toBeDefined()
    })
  })

  // ---- 删除备份 ----

  describe('deleteCloudBackup（Android manifest 方案）', () => {
    it('删除备份文件并从 manifest 移除条目', async () => {
      await saveConfig(service)

      const backupInfo = {
        id: 'android-del-001', name: 'backup-android-del-001', description: '',
        createdAt: new Date().toISOString(), size: 1024,
        cloudPath: '/backup-android-del-001.json', storageId: 'cfg-1',
      }

      mockCapacitorHttp.request
        .mockResolvedValueOnce({ status: 200, data: { backups: [backupInfo] } }) // GET manifest（列表）
        .mockResolvedValueOnce({ status: 204, data: '' })                         // DELETE 备份文件
        .mockResolvedValueOnce({ status: 200, data: { backups: [backupInfo] } }) // GET manifest（更新前读取）
        .mockResolvedValueOnce({ status: 201, data: '' })                         // PUT manifest

      const result = await service.deleteCloudBackup('cfg-1', 'android-del-001')
      expect(result.success).toBe(true)

      // 验证 DELETE 请求
      const deleteCall = mockCapacitorHttp.request.mock.calls[1][0]
      expect(deleteCall.method).toBe('DELETE')

      // 验证更新后的 manifest 不含已删除条目
      const putManifestBody = JSON.parse(mockCapacitorHttp.request.mock.calls[3][0].data)
      expect(putManifestBody.backups).toHaveLength(0)
    })

    it('备份不存在时返回失败', async () => {
      await saveConfig(service)

      mockCapacitorHttp.request
        .mockResolvedValueOnce({ status: 200, data: { backups: [] } }) // GET manifest（空）

      const result = await service.deleteCloudBackup('cfg-1', 'nonexistent-id')
      expect(result.success).toBe(false)
    })
  })

  // ---- 端到端 ----

  describe('Android 端到端：备份 → 恢复 → 删除', () => {
    it('完整流程', async () => {
      await saveConfig(service)

      // 1. 创建备份
      mockCapacitorHttp.request
        .mockResolvedValueOnce({ status: 201, data: '' })  // PUT backup file
        .mockResolvedValueOnce({ status: 404, data: '' })  // GET manifest（首次空）
        .mockResolvedValueOnce({ status: 201, data: '' })  // PUT manifest

      const createResult = await service.createCloudBackup('cfg-1', mockExportData, 'Android 端到端')
      expect(createResult.success).toBe(true)
      const backupId = createResult.backupInfo!.id
      const savedInfo = createResult.backupInfo!

      // 2. 恢复
      const backupFile = makeMobileBackupFile(backupId)
      mockCapacitorHttp.request
        .mockResolvedValueOnce({ status: 200, data: { backups: [savedInfo] } }) // GET manifest
        .mockResolvedValueOnce({ status: 200, data: backupFile })                // GET backup file

      const restoreResult = await service.restoreCloudBackup('cfg-1', backupId)
      expect(restoreResult.success).toBe(true)
      expect(restoreResult.data?.categories).toHaveLength(1)

      // 3. 删除
      mockCapacitorHttp.request
        .mockResolvedValueOnce({ status: 200, data: { backups: [savedInfo] } }) // GET manifest（列表）
        .mockResolvedValueOnce({ status: 204, data: '' })                        // DELETE
        .mockResolvedValueOnce({ status: 200, data: { backups: [savedInfo] } }) // GET manifest（更新前）
        .mockResolvedValueOnce({ status: 201, data: '' })                        // PUT manifest

      const deleteResult = await service.deleteCloudBackup('cfg-1', backupId)
      expect(deleteResult.success).toBe(true)
    })
  })
})
