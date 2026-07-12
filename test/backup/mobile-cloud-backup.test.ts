/**
 * MobileCloudBackupService 测试
 * 覆盖：WebDAV 连接/备份/恢复、桌面备份→移动恢复、移动备份→桌面恢复
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { testDataGenerators } from '../helpers/test-utils'

// ---- mock Capacitor ----

const mockPreferences: Record<string, string> = {}
const mockWebDavPropfind = vi.hoisted(() => vi.fn())
const mockWebDavRequest = vi.hoisted(() => vi.fn())

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
  registerPlugin: vi.fn(() => ({
    propfind: vi.fn(),
    request: vi.fn(),
  })),
}))

vi.mock('@renderer/capacitor-bridge/webdav-native', () => ({
  default: {
    propfind: mockWebDavPropfind,
    request: mockWebDavRequest,
  },
}))

import { MobileCloudBackupService } from '~/lib/services/mobile-cloud-backup.service'
import { Filesystem } from '@capacitor/filesystem'
import { Preferences } from '@capacitor/preferences'
import { CapacitorHttp, Capacitor } from '@capacitor/core'
import { createEmptyCloudSyncManifest } from '@shared/cloud-sync-manifest'
import {
  getCloudSyncSnapshotFileName,
  getCloudSyncV2ArtifactPath,
  getCloudSyncV2DirectoryPath,
  getCloudSyncV2ManifestPath
} from '@shared/cloud-backup-paths'
import {
  createCloudSyncDataChecksum,
  createCloudSyncSnapshot
} from '@shared/cloud-sync-engine'

const mockCapacitorHttp = CapacitorHttp as unknown as { request: ReturnType<typeof vi.fn> }

function mockSuccessfulWebDAVProbe() {
  let probeBody = ''
  let probeUrl = ''
  mockCapacitorHttp.request.mockImplementation(async (request: any) => {
    if (request.method === 'OPTIONS') return { status: 200, data: '', headers: {} }
    if (request.method === 'MKCOL') return { status: 201, data: '', headers: {} }
    if (request.method === 'PUT') {
      if (probeBody && request.headers?.['If-None-Match'] === '*') {
        return { status: 412, data: '', headers: { etag: '"probe"' } }
      }
      probeBody = request.data
      probeUrl = request.url
      return { status: 201, data: '', headers: { etag: '"probe"' } }
    }
    if (request.method === 'GET') return { status: 200, data: probeBody, headers: { etag: '"probe"' } }
    if (request.method === 'PROPFIND') {
      const name = probeUrl.split('/').pop()
      return { status: 207, data: makePropfindXml([{ name, path: new URL(probeUrl).pathname }]), headers: {} }
    }
    if (request.method === 'DELETE') return { status: 204, data: '', headers: {} }
    return { status: 500, data: '', headers: {} }
  })
}

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
  promptVariables: [],
  promptHistories: [],
  aiConfigs: [testDataGenerators.createMockAIConfig({ id: 1 })],
  quickOptimizationConfigs: [],
  aiHistory: [],
  settings: [{ key: 'theme', value: 'dark', type: 'string', description: '' }],
  syncTombstones: [],
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

function installICloudMemoryFilesystem() {
  const files = new Map<string, string>()
  const directories = new Set<string>([''])
  const addParentDirectories = (filePath: string) => {
    const parts = filePath.split('/').filter(Boolean)
    parts.pop()
    let current = ''
    for (const part of parts) {
      current = current ? `${current}/${part}` : part
      directories.add(current)
    }
  }

  ;(Filesystem.readdir as any).mockImplementation(async ({ path }: { path: string }) => {
    const normalizedPath = (path || '').replace(/\/+$/, '')
    if (normalizedPath === '') {
      return { files: [] }
    }

    if (!directories.has(normalizedPath)) {
      throw new Error('File does not exist')
    }

    const prefix = `${normalizedPath}/`
    const childFiles = [...files.keys()]
      .filter(filePath => filePath.startsWith(prefix))
      .map(filePath => filePath.slice(prefix.length))
      .filter(name => name && !name.includes('/'))
    const childDirectories = [...directories]
      .filter(directoryPath => directoryPath.startsWith(prefix))
      .map(directoryPath => directoryPath.slice(prefix.length))
      .filter(name => name && !name.includes('/'))

    return {
      files: [
        ...childDirectories.map(name => ({ name, type: 'directory', size: 0 })),
        ...childFiles.map(name => ({
          name,
          type: 'file',
          size: files.get(`${prefix}${name}`)?.length || 0
        }))
      ]
    }
  })
  ;(Filesystem.stat as any).mockImplementation(async ({ path }: { path: string }) => {
    const normalizedPath = (path || '').replace(/\/+$/, '')
    if (directories.has(normalizedPath) || files.has(normalizedPath)) {
      return {
        type: files.has(normalizedPath) ? 'file' : 'directory',
        size: files.get(normalizedPath)?.length || 0
      }
    }
    throw new Error('File does not exist')
  })
  ;(Filesystem.mkdir as any).mockImplementation(async ({ path }: { path: string }) => {
    directories.add((path || '').replace(/\/+$/, ''))
  })
  ;(Filesystem.readFile as any).mockImplementation(async ({ path }: { path: string }) => {
    const data = files.get(path)
    if (data === undefined) {
      throw new Error('File does not exist')
    }
    return { data }
  })
  ;(Filesystem.writeFile as any).mockImplementation(async ({ path, data }: { path: string; data: string }) => {
    addParentDirectories(path)
    files.set(path, data)
  })
  ;(Filesystem.deleteFile as any).mockImplementation(async ({ path }: { path: string }) => {
    if (!files.delete(path)) {
      throw new Error('File does not exist')
    }
  })

  return files
}

describe('MobileCloudBackupService', () => {
  let service: MobileCloudBackupService

  beforeEach(() => {
    ;(MobileCloudBackupService as any).instance = undefined
    service = MobileCloudBackupService.getInstance()
    Object.keys(mockPreferences).forEach(k => delete mockPreferences[k])
    vi.clearAllMocks()
    mockWebDavPropfind.mockResolvedValue({ status: 404, body: '' })
    mockWebDavRequest.mockResolvedValue({ status: 201, body: '' })
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

    it('配置存储损坏时不静默返回空列表', async () => {
      await Preferences.set({ key: 'cloud_backup_configs', value: '{"broken":' })

      await expect(service.getStorageConfigs()).rejects.toThrow('获取存储配置失败')
    })
  })

  // ---- WebDAV 连接测试 ----

  describe('WebDAV 连接', () => {
    it('连接成功（207 响应）', async () => {
      mockSuccessfulWebDAVProbe()
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
      mockSuccessfulWebDAVProbe()
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
      const xml = makePropfindXml([{ name: 'backup-abc12345.json', path: '/backup/AI-Gist-Backup/backup-abc12345.json' }])

      mockCapacitorHttp.request
        .mockResolvedValueOnce({ status: 207, data: xml })           // PROPFIND
        .mockResolvedValueOnce({ status: 200, data: backupFile })    // GET file
        .mockResolvedValueOnce({ status: 404, data: '' })            // legacy PROPFIND

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
      const xml = makePropfindXml([{ name: 'backup-abc12345.json', path: '/backup/AI-Gist-Backup/backup-abc12345.json' }])

      mockCapacitorHttp.request
        .mockResolvedValueOnce({ status: 207, data: xml })
        .mockResolvedValueOnce({ status: 200, data: backupFile })
        .mockResolvedValueOnce({ status: 404, data: '' })

      await service.getCloudBackupList('cfg-1')

      // 第二次调用是 GET 文件，协议头之后不应有双斜杠
      const getUrl = mockCapacitorHttp.request.mock.calls[1][0].url
      expect(getUrl.replace(/^https?:\/\//, '')).not.toContain('//')
      expect(getUrl).toContain('/AI-Gist-Backup/')
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

      const putCall = mockCapacitorHttp.request.mock.calls.find((call: any[]) => call[0].method === 'PUT')![0]
      expect(putCall.method).toBe('PUT')
      expect(putCall.url.replace(/^https?:\/\//, '')).not.toContain('//')
      expect(putCall.url).toContain('/AI-Gist-Backup/')
    })

    it('上传失败（401）时返回错误', async () => {
      await saveConfig(service)
      mockCapacitorHttp.request.mockResolvedValue({ status: 401, data: '' })

      const result = await service.createCloudBackup('cfg-1', mockExportData)
      expect(result.success).toBe(false)
      expect(result.error).toContain('认证')
    })

    it('上传网络异常时返回错误且不重复写入 console.error', async () => {
      await saveConfig(service)
      mockCapacitorHttp.request.mockRejectedValue(new Error('network down'))
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

      try {
        const result = await service.createCloudBackup('cfg-1', mockExportData)
        expect(result.success).toBe(false)
        expect(result.error).toContain('network down')
        expect(errorSpy).not.toHaveBeenCalled()
      } finally {
        errorSpy.mockRestore()
      }
    })

    it('存储配置不存在时返回错误', async () => {
      const result = await service.createCloudBackup('nonexistent', mockExportData)
      expect(result.success).toBe(false)
    })
  })

  // ---- 云同步 manifest ----

  describe('cloud sync manifest', () => {
    it('WebDAV manifest 不存在时返回空 manifest', async () => {
      await saveConfig(service)
      mockCapacitorHttp.request
        .mockResolvedValueOnce({ status: 404, data: '' })
        .mockResolvedValueOnce({ status: 404, data: '' })

      const manifest = await service.getCloudSyncManifest('cfg-1')

      expect(manifest.schemaVersion).toBe(1)
      expect(manifest.devices).toEqual({})
      expect(manifest.conflicts).toEqual([])
    })

    it('WebDAV manifest 主文件不存在时读取备份副本', async () => {
      await saveConfig(service)
      const backupManifest = {
        ...createEmptyCloudSyncManifest('2026-03-12T00:00:00.000Z'),
        latestSnapshot: {
          schemaVersion: 1 as const,
          deviceId: 'ios-device',
          revision: 'backup-only-rev',
          createdAt: '2026-03-12T00:00:00.000Z',
          data: mockExportData
        }
      }

      mockCapacitorHttp.request
        .mockResolvedValueOnce({ status: 404, data: '' })
        .mockResolvedValueOnce({ status: 200, data: JSON.stringify(backupManifest) })

      const manifest = await service.getCloudSyncManifest('cfg-1')

      expect(manifest.latestSnapshot?.revision).toBe('backup-only-rev')
      const getUrls = mockCapacitorHttp.request.mock.calls
        .map((call: any[]) => call[0])
        .filter((call: any) => call.method === 'GET')
        .map((call: any) => call.url)
      expect(getUrls).toEqual([
        'https://dav.example.com/backup/AI-Gist-Backup/sync-manifest.json',
        'https://dav.example.com/backup/AI-Gist-Backup/sync-manifest.backup.json'
      ])
    })

    it('保存 WebDAV manifest 到统一目录', async () => {
      await saveConfig(service)
      const manifest = createEmptyCloudSyncManifest('2026-03-12T00:00:00.000Z')
      mockCapacitorHttp.request
        .mockResolvedValueOnce({ status: 201, data: '' })
        .mockResolvedValueOnce({ status: 201, data: '' })
        .mockResolvedValueOnce({ status: 201, data: '' })

      const result = await service.saveCloudSyncManifest('cfg-1', manifest)

      expect(result.success).toBe(true)
      const putCalls = mockCapacitorHttp.request.mock.calls
        .map((call: any[]) => call[0])
        .filter((call: any) => call.method === 'PUT')
      expect(putCalls.map((call: any) => call.url)).toEqual([
        'https://dav.example.com/backup/AI-Gist-Backup/sync-manifest.backup.json',
        'https://dav.example.com/backup/AI-Gist-Backup/sync-manifest.json'
      ])
      expect(JSON.parse(putCalls[0].data).kind).toBe('ai-gist-cloud-sync-manifest')
    })

    it('WebDAV manifest 备份副本写入失败时不推进主文件', async () => {
      await saveConfig(service)
      const manifest = createEmptyCloudSyncManifest('2026-03-12T00:00:00.000Z')
      mockCapacitorHttp.request
        .mockResolvedValueOnce({ status: 201, data: '' })
        .mockResolvedValueOnce({ status: 500, data: '' })

      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const result = await service.saveCloudSyncManifest('cfg-1', manifest)

      expect(result.success).toBe(false)
      expect(errorSpy).not.toHaveBeenCalled()
      errorSpy.mockRestore()
      const putCalls = mockCapacitorHttp.request.mock.calls
        .map((call: any[]) => call[0])
        .filter((call: any) => call.method === 'PUT')
      expect(putCalls.map((call: any) => call.url)).toEqual([
        'https://dav.example.com/backup/AI-Gist-Backup/sync-manifest.backup.json'
      ])
    })

    it('WebDAV manifest 快照结构无效时不写入云端文件', async () => {
      await saveConfig(service)
      const invalidData = { ...mockExportData }
      delete (invalidData as any).promptHistories
      const manifest = {
        ...createEmptyCloudSyncManifest('2026-03-12T00:00:00.000Z'),
        latestSnapshot: {
          schemaVersion: 1 as const,
          deviceId: 'ios-device',
          revision: 'bad-rev',
          createdAt: '2026-03-12T00:00:00.000Z',
          data: invalidData
        }
      } as any

      const result = await service.saveCloudSyncManifest('cfg-1', manifest)

      expect(result.success).toBe(false)
      expect(result.error).toContain('snapshot data missing collection promptHistories')
      expect(mockCapacitorHttp.request).not.toHaveBeenCalled()
    })

    it('WebDAV manifest 主文件损坏时读取备份副本', async () => {
      await saveConfig(service)
      const backupManifest = {
        ...createEmptyCloudSyncManifest('2026-03-12T00:00:00.000Z'),
        latestSnapshot: {
          schemaVersion: 1 as const,
          deviceId: 'ios-device',
          revision: 'backup-rev',
          createdAt: '2026-03-12T00:00:00.000Z',
          data: mockExportData
        }
      }

      mockCapacitorHttp.request
        .mockResolvedValueOnce({ status: 200, data: '{"kind":' })
        .mockResolvedValueOnce({ status: 200, data: JSON.stringify(backupManifest) })

      const manifest = await service.getCloudSyncManifest('cfg-1')

      expect(manifest.latestSnapshot?.revision).toBe('backup-rev')
      const getUrls = mockCapacitorHttp.request.mock.calls
        .map((call: any[]) => call[0])
        .filter((call: any) => call.method === 'GET')
        .map((call: any) => call.url)
      expect(getUrls).toEqual([
        'https://dav.example.com/backup/AI-Gist-Backup/sync-manifest.json',
        'https://dav.example.com/backup/AI-Gist-Backup/sync-manifest.backup.json'
      ])
    })

    it('iCloud manifest 使用配置目录下的 sync-manifest.json', async () => {
      await saveConfig(service, {
        ...webdavConfig,
        id: 'cfg-icloud',
        type: 'icloud',
        path: 'AI-Gist-Backup'
      } as any)

      const manifest = createEmptyCloudSyncManifest('2026-03-12T00:00:00.000Z')
      const result = await service.saveCloudSyncManifest('cfg-icloud', manifest)

      expect(result.success).toBe(true)
      expect((Filesystem.writeFile as any).mock.calls.map((call: any[]) => call[0].path)).toEqual([
        'AI-Gist-Backup/sync-manifest.backup.json',
        'AI-Gist-Backup/sync-manifest.json'
      ])
    })

    it('iCloud manifest 主文件不存在时读取备份副本', async () => {
      await saveConfig(service, {
        ...webdavConfig,
        id: 'cfg-icloud',
        type: 'icloud',
        path: 'AI-Gist-Backup'
      } as any)
      const backupManifest = {
        ...createEmptyCloudSyncManifest('2026-03-12T00:00:00.000Z'),
        latestSnapshot: {
          schemaVersion: 1 as const,
          deviceId: 'ios-device',
          revision: 'icloud-backup-rev',
          createdAt: '2026-03-12T00:00:00.000Z',
          data: mockExportData
        }
      }
      ;(Filesystem.readFile as any)
        .mockRejectedValueOnce(new Error('File does not exist'))
        .mockResolvedValueOnce({ data: JSON.stringify(backupManifest) })

      const manifest = await service.getCloudSyncManifest('cfg-icloud')

      expect(manifest.latestSnapshot?.revision).toBe('icloud-backup-rev')
      expect((Filesystem.readFile as any).mock.calls.map((call: any[]) => call[0].path)).toEqual([
        'AI-Gist-Backup/sync-manifest.json',
        'AI-Gist-Backup/sync-manifest.backup.json'
      ])
    })

    it('iCloud 快照文件使用统一包装格式并保留图片和历史元数据', async () => {
      await saveConfig(service, {
        ...webdavConfig,
        id: 'cfg-icloud',
        type: 'icloud',
        path: 'AI-Gist-Backup'
      } as any)
      const files = installICloudMemoryFilesystem()
      const imageDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lZ2nNwAAAABJRU5ErkJggg=='
      const snapshot = createCloudSyncSnapshot({
        ...mockExportData,
        prompts: [
          {
            ...mockExportData.prompts[0],
            uuid: 'icloud-prompt',
            imageBlobs: [imageDataUrl]
          }
        ],
        promptHistories: [
          {
            id: 1,
            uuid: 'icloud-history',
            promptId: 1,
            promptUuid: 'icloud-prompt',
            content: 'history with image',
            imageBlobs: [imageDataUrl],
            createdAt: '2026-06-12T00:00:00.000Z',
            updatedAt: '2026-06-12T00:00:00.000Z'
          }
        ],
        syncTombstones: []
      }, 'ios-device', 'icloud-snapshot-rev')

      const result = await service.saveCloudSyncSnapshot('cfg-icloud', snapshot)

      expect(result.success).toBe(true)
      const snapshotPath = `AI-Gist-Backup/sync/snapshots/${getCloudSyncSnapshotFileName('icloud-snapshot-rev')}`
      const rawSnapshotFile = JSON.parse(files.get(snapshotPath)!)
      expect(rawSnapshotFile.kind).toBe('ai-gist-cloud-sync-snapshot')
      expect(rawSnapshotFile.snapshot.data.prompts[0].imageBlobs).toEqual([imageDataUrl])
      expect(rawSnapshotFile.snapshot.data.promptHistories[0].imageBlobs).toEqual([imageDataUrl])

      const snapshots = await service.listCloudSyncSnapshots('cfg-icloud')
      expect(snapshots).toEqual([{
        revision: 'icloud-snapshot-rev',
        path: snapshotPath
      }])

      const loadedSnapshot = await service.readCloudSyncSnapshot('cfg-icloud', 'icloud-snapshot-rev')
      expect(loadedSnapshot.data.prompts?.[0].imageBlobs).toEqual([imageDataUrl])
      expect(loadedSnapshot.data.promptHistories?.[0].imageBlobs).toEqual([imageDataUrl])
      expect(loadedSnapshot.dataChecksum).toBe(createCloudSyncDataChecksum(loadedSnapshot.data))
    })

    it('iCloud manifest expectedRevision 不匹配时拒绝覆盖已有远端版本', async () => {
      await saveConfig(service, {
        ...webdavConfig,
        id: 'cfg-icloud',
        type: 'icloud',
        path: 'AI-Gist-Backup'
      } as any)
      const files = installICloudMemoryFilesystem()
      const remoteSnapshot = createCloudSyncSnapshot(mockExportData, 'ios-device', 'icloud-remote-rev')
      const remoteManifest = {
        ...createEmptyCloudSyncManifest('2026-06-12T00:00:00.000Z'),
        latestSnapshot: remoteSnapshot,
        baseSnapshot: remoteSnapshot
      }
      files.set('AI-Gist-Backup/sync-manifest.json', JSON.stringify(remoteManifest))
      files.set('AI-Gist-Backup/sync-manifest.backup.json', JSON.stringify(remoteManifest))

      const nextSnapshot = createCloudSyncSnapshot({
        ...mockExportData,
        prompts: [
          { ...mockExportData.prompts[0], title: 'stale overwrite' }
        ]
      }, 'ios-device', 'icloud-next-rev')
      const result = await service.saveCloudSyncManifest('cfg-icloud', {
        ...createEmptyCloudSyncManifest('2026-06-12T00:01:00.000Z'),
        latestSnapshot: nextSnapshot,
        baseSnapshot: nextSnapshot
      }, {
        expectedRevision: 'stale-rev'
      })

      expect(result).toMatchObject({
        success: false,
        conflict: true,
        currentRevision: 'icloud-remote-rev'
      })
      expect(JSON.parse(files.get('AI-Gist-Backup/sync-manifest.json')!).latestSnapshot.revision)
        .toBe('icloud-remote-rev')
    })
  })

  describe('sync-v2 对象存储传输', () => {
    it('WebDAV 保真读取二进制并执行 ETag 条件写入', async () => {
      await saveConfig(service)
      const bytes = new Uint8Array([0, 255, 17, 128])
      mockCapacitorHttp.request.mockResolvedValueOnce({
        status: 200,
        data: btoa(String.fromCharCode(...bytes)),
        headers: { ETag: '"v1"' }
      })
      const path = getCloudSyncV2ArtifactPath('blobs', 'blob:sha256:test')

      const object = await service.readCloudSyncV2Object('cfg-1', path)
      expect([...object!.data]).toEqual([...bytes])
      expect(object?.etag).toBe('"v1"')

      mockCapacitorHttp.request.mockImplementation(async (request: any) =>
        request.method === 'PUT'
          ? { status: 412, headers: { etag: '"winner"' } }
          : { status: 405 }
      )
      const result = await service.writeCloudSyncV2Object(
        'cfg-1',
        getCloudSyncV2ManifestPath(),
        bytes,
        { expectedEtag: 'v1' }
      )
      expect(result).toEqual({ status: 'precondition_failed', etag: '"winner"' })
      const put = mockCapacitorHttp.request.mock.calls.map((call: any[]) => call[0])
        .find((request: any) => request.method === 'PUT')
      expect(put).toMatchObject({
        dataType: 'file',
        data: btoa(String.fromCharCode(...bytes))
      })
      expect(put.headers['If-Match']).toBe('"v1"')
    })

    it('拒绝路径穿越及 sync-v2 命名空间之外的访问', async () => {
      await saveConfig(service)
      const invalid = [
        '/AI-Gist-Backup/sync-v2/../secret',
        '/AI-Gist-Backup/sync-v2/%2e%2e/secret',
        '/AI-Gist-Backup/sync-v2\\secret',
        '/AI-Gist-Backup/sync/manifest.json'
      ]
      for (const path of invalid) {
        await expect(service.readCloudSyncV2Object('cfg-1', path)).rejects.toThrow(/sync-v2/)
        await expect(service.writeCloudSyncV2Object('cfg-1', path, new Uint8Array())).rejects.toThrow(/sync-v2/)
        await expect(service.listCloudSyncV2Objects('cfg-1', path)).rejects.toThrow(/sync-v2/)
        await expect(service.deleteCloudSyncV2Object('cfg-1', path)).rejects.toThrow(/sync-v2/)
      }
      expect(mockCapacitorHttp.request).not.toHaveBeenCalled()
    })

    it('iCloud 支持无条件二进制对象操作和列表', async () => {
      await saveConfig(service, {
        ...webdavConfig,
        id: 'cfg-icloud',
        type: 'icloud',
        path: 'AI-Gist-Backup'
      } as any)
      const files = installICloudMemoryFilesystem()
      const path = getCloudSyncV2ArtifactPath('blobs', 'blob:sha256:mobile')
      const bytes = new Uint8Array([0, 200, 255, 10])

      expect(await service.writeCloudSyncV2Object('cfg-icloud', path, bytes)).toEqual({ status: 'written' })
      expect([...(await service.readCloudSyncV2Object('cfg-icloud', path))!.data]).toEqual([...bytes])
      expect(await service.listCloudSyncV2Objects('cfg-icloud', getCloudSyncV2DirectoryPath()))
        .toEqual([expect.objectContaining({ path })])
      await service.deleteCloudSyncV2Object('cfg-icloud', path)
      expect(files.has('AI-Gist-Backup/sync-v2/blobs/blob~3Asha256~3Amobile.bin')).toBe(false)
    })

    it('iCloud 缺少原子 CAS 时安全拒绝条件写入', async () => {
      await saveConfig(service, {
        ...webdavConfig,
        id: 'cfg-icloud',
        type: 'icloud',
        path: 'AI-Gist-Backup'
      } as any)
      const files = installICloudMemoryFilesystem()
      files.set('AI-Gist-Backup/sync-v2/manifest.json', btoa('old'))

      expect(await service.writeCloudSyncV2Object(
        'cfg-icloud',
        getCloudSyncV2ManifestPath(),
        new Uint8Array([110, 101, 119]),
        { expectedEtag: '"old"' }
      )).toEqual({ status: 'precondition_failed' })
      expect(files.get('AI-Gist-Backup/sync-v2/manifest.json')).toBe(btoa('old'))
      expect(Filesystem.writeFile).not.toHaveBeenCalled()
    })
  })

  // ---- 场景1：桌面备份 → 移动恢复 ----

  describe('场景：桌面备份 → 移动端恢复', () => {
    it('能正确解析桌面端备份文件格式并返回 data', async () => {
      await saveConfig(service)

      const desktopBackup = makeDesktopBackupFile('desktop-001')
      const xml = makePropfindXml([{ name: 'backup-desktop-001.json', path: '/backup/AI-Gist-Backup/backup-desktop-001.json' }])

      mockCapacitorHttp.request
        .mockResolvedValueOnce({ status: 207, data: xml })           // list: PROPFIND
        .mockResolvedValueOnce({ status: 200, data: desktopBackup }) // list: GET metadata
        .mockResolvedValueOnce({ status: 404, data: '' })            // list: legacy PROPFIND
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
      const xml = makePropfindXml([{ name: 'backup-desktop-002.json', path: '/backup/AI-Gist-Backup/backup-desktop-002.json' }])

      mockCapacitorHttp.request
        .mockResolvedValueOnce({ status: 207, data: xml })
        .mockResolvedValueOnce({ status: 200, data: desktopBackup })
        .mockResolvedValueOnce({ status: 404, data: '' })
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

      mockCapacitorHttp.request
        .mockResolvedValueOnce({ status: 201, data: '' }) // MKCOL
        .mockResolvedValueOnce({ status: 201, data: '' }) // PUT
      const backupResult = await service.createCloudBackup('cfg-1', mockExportData, '移动端备份')
      expect(backupResult.success).toBe(true)

      const backupId = backupResult.backupInfo!.id
      const mobileBackup = makeMobileBackupFile(backupId)
      const xml = makePropfindXml([{ name: `backup-${backupId}.json`, path: `/backup/AI-Gist-Backup/backup-${backupId}.json` }])

      // 恢复
      mockCapacitorHttp.request
        .mockResolvedValueOnce({ status: 207, data: xml })
        .mockResolvedValueOnce({ status: 200, data: mobileBackup })
        .mockResolvedValueOnce({ status: 404, data: '' })
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
      const xml = makePropfindXml([{ name: 'backup-del-001.json', path: '/backup/AI-Gist-Backup/backup-del-001.json' }])

      mockCapacitorHttp.request
        .mockResolvedValueOnce({ status: 207, data: xml })
        .mockResolvedValueOnce({ status: 200, data: backupFile })
        .mockResolvedValueOnce({ status: 404, data: '' })
        .mockResolvedValueOnce({ status: 204, data: '' }) // DELETE

      const result = await service.deleteCloudBackup('cfg-1', 'del-001')
      expect(result.success).toBe(true)

      const deleteCall = mockCapacitorHttp.request.mock.calls.find((call: any[]) => call[0].method === 'DELETE')![0]
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
// Android 平台测试（原生 WebDAV 请求）
// ================================================================

describe('MobileCloudBackupService — Android 平台', () => {
  let service: MobileCloudBackupService

  beforeEach(() => {
    ;(MobileCloudBackupService as any).instance = undefined
    service = MobileCloudBackupService.getInstance()
    Object.keys(mockPreferences).forEach(k => delete mockPreferences[k])
    vi.clearAllMocks()
    vi.spyOn(Capacitor, 'getPlatform').mockReturnValue('android')
    mockWebDavPropfind.mockResolvedValue({ status: 404, body: '' })
    mockWebDavRequest.mockResolvedValue({ status: 201, body: '' })
  })

  it('通过原生 PROPFIND 从统一目录获取备份列表', async () => {
    await saveConfig(service)

    const backupFile = makeDesktopBackupFile('android-001')
    const xml = makePropfindXml([
      { name: 'backup-android-001.json', path: '/backup/AI-Gist-Backup/backup-android-001.json' }
    ])

    mockWebDavPropfind
      .mockResolvedValueOnce({ status: 207, body: xml })
      .mockResolvedValueOnce({ status: 404, body: '' })
    mockWebDavRequest.mockResolvedValueOnce({ status: 200, body: JSON.stringify(backupFile), headers: {} })

    const backups = await service.getCloudBackupList('cfg-1')

    expect(backups).toHaveLength(1)
    expect(backups[0].id).toBe('android-001')
    expect(backups[0].cloudPath).toContain('/AI-Gist-Backup/')
    expect(mockWebDavPropfind).toHaveBeenCalled()
  })

  it('PROPFIND 返回 404 时兼容扫描旧根目录', async () => {
    await saveConfig(service)

    const backupFile = makeDesktopBackupFile('legacy-001')
    const legacyXml = makePropfindXml([
      { name: 'backup-legacy-001.json', path: '/backup/backup-legacy-001.json' }
    ])

    mockWebDavPropfind
      .mockResolvedValueOnce({ status: 404, body: '' })
      .mockResolvedValueOnce({ status: 207, body: legacyXml })
    mockWebDavRequest.mockResolvedValueOnce({ status: 200, body: JSON.stringify(backupFile), headers: {} })

    const backups = await service.getCloudBackupList('cfg-1')

    expect(backups).toHaveLength(1)
    expect(backups[0].cloudPath).toBe('/backup-legacy-001.json')
    expect(mockWebDavPropfind).toHaveBeenCalledTimes(2)
  })

  it('创建备份时用原生 MKCOL 建目录，并通过 PUT 写入统一目录', async () => {
    await saveConfig(service)
    mockWebDavRequest
      .mockResolvedValueOnce({ status: 201, body: '', headers: {} })
      .mockResolvedValueOnce({ status: 201, body: '', headers: {} })

    const result = await service.createCloudBackup('cfg-1', mockExportData, 'Android 测试备份')

    expect(result.success).toBe(true)
    expect(mockWebDavRequest.mock.calls[0][0].method).toBe('MKCOL')
    const putCall = mockWebDavRequest.mock.calls.find((call: any[]) => call[0].method === 'PUT')![0]
    expect(putCall.url).toContain('/AI-Gist-Backup/')
    expect(result.backupInfo?.cloudPath).toContain('/AI-Gist-Backup/')
  })

  it('通过原生 PROPFIND 找到备份并下载恢复', async () => {
    await saveConfig(service)

    const backupFile = makeDesktopBackupFile('android-restore-001')
    const xml = makePropfindXml([
      { name: 'backup-android-restore-001.json', path: '/backup/AI-Gist-Backup/backup-android-restore-001.json' }
    ])

    mockWebDavPropfind
      .mockResolvedValueOnce({ status: 207, body: xml })
      .mockResolvedValueOnce({ status: 404, body: '' })
    mockWebDavRequest
      .mockResolvedValueOnce({ status: 200, body: JSON.stringify(backupFile), headers: {} })
      .mockResolvedValueOnce({ status: 200, body: JSON.stringify(backupFile), headers: {} })

    const result = await service.restoreCloudBackup('cfg-1', 'android-restore-001')

    expect(result.success).toBe(true)
    expect(result.data?.categories).toHaveLength(1)
    expect(result.data?.data).toBeUndefined()
  })

  it('删除备份时删除统一目录内的文件', async () => {
    await saveConfig(service)

    const backupFile = makeDesktopBackupFile('android-del-001')
    const xml = makePropfindXml([
      { name: 'backup-android-del-001.json', path: '/backup/AI-Gist-Backup/backup-android-del-001.json' }
    ])

    mockWebDavPropfind
      .mockResolvedValueOnce({ status: 207, body: xml })
      .mockResolvedValueOnce({ status: 404, body: '' })
    mockWebDavRequest
      .mockResolvedValueOnce({ status: 200, body: JSON.stringify(backupFile), headers: {} })
      .mockResolvedValueOnce({ status: 204, body: '', headers: {} })

    const result = await service.deleteCloudBackup('cfg-1', 'android-del-001')

    expect(result.success).toBe(true)
    const deleteCall = mockWebDavRequest.mock.calls.find((call: any[]) => call[0].method === 'DELETE')![0]
    expect(deleteCall.url).toContain('/AI-Gist-Backup/')
  })
})
