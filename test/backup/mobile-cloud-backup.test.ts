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
import { CapacitorHttp } from '@capacitor/core'

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
