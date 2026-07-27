import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest'
import {
  createBackupPayload,
  parseBackupPayload
} from '@shared/backup-integrity'
import { DatabaseServiceManager } from '~/lib/services/database-manager.service'
import { WebCloudBackupService } from '~/lib/services/web-cloud-backup.service'
import { getCloudSyncV2DirectoryPath, getCloudSyncV2ManifestPath } from '@shared/cloud-backup-paths'

const webdavConfig = {
  id: 'web-cfg',
  name: 'WebDAV',
  type: 'webdav' as const,
  enabled: true,
  url: 'http://127.0.0.1:18766/webdav',
  username: 'user',
  password: 'pass',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z'
}

const backupData = {
  categories: [{ id: 1, uuid: 'cat-web', name: 'Web 分类' }],
  prompts: [{ id: 10, uuid: 'prompt-web', title: 'Web 提示词', categoryId: 1 }],
  promptVariables: [],
  promptHistories: [],
  aiConfigs: [],
  quickOptimizationConfigs: [],
  aiHistory: [],
  settings: []
}

function saveWebDAVConfig() {
  localStorage.setItem('ai-gist:web:cloud-storage-configs', JSON.stringify([webdavConfig]))
}

function apiResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ success: status >= 200 && status < 300, data }), {
    status,
    headers: {
      'Content-Type': 'application/json'
    }
  })
}

describe('WebCloudBackupService', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('reports a missing Web backend proxy instead of surfacing a generic 404', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('Not Found', {
      status: 404,
      headers: {
        'Content-Type': 'text/plain'
      }
    }))

    const service = WebCloudBackupService.getInstance()
    const result = await service.testStorageConnection(webdavConfig)

    expect(result.success).toBe(false)
    expect(result.error).toContain('Web 端 WebDAV 代理未启用')
  })

  it('creates WebDAV backups with the shared checksum payload format', async () => {
    saveWebDAVConfig()
    vi.spyOn(DatabaseServiceManager.prototype, 'exportAllDataForBackup').mockResolvedValue({
      success: true,
      message: 'ok',
      data: backupData
    } as any)

    let requestBody: any
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body))
      return apiResponse({
        id: requestBody.backupData.id,
        name: requestBody.backupData.name,
        createdAt: requestBody.backupData.createdAt,
        cloudPath: `/AI-Gist-Backup/${requestBody.fileName}`,
        storageId: webdavConfig.id,
        checksum: requestBody.backupData.checksum
      })
    })

    const service = WebCloudBackupService.getInstance()
    const result = await service.createCloudBackup(webdavConfig.id, 'Web 标准备份')

    expect(result.success).toBe(true)
    expect(requestBody.fileName).toMatch(/^backup-.+\.json$/)
    expect(requestBody.backupData.name).not.toMatch(/\.json$/)
    expect(requestBody.backupData.schemaVersion).toBe(1)
    expect(requestBody.backupData.checksum).toMatch(/^fnv1a32:/)
    expect(parseBackupPayload(requestBody.backupData).data).toEqual(backupData)
    expect(result.backupInfo?.checksum).toBe(requestBody.backupData.checksum)
  })

  it('uploads the exact pre-exported automatic snapshot without exporting a second time', async () => {
    saveWebDAVConfig()
    const exportSpy = vi.spyOn(DatabaseServiceManager.prototype, 'exportAllDataForBackup')
    let requestBody: any
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body))
      return apiResponse({
        id: requestBody.backupData.id,
        name: requestBody.backupData.name,
        createdAt: requestBody.backupData.createdAt,
        cloudPath: `/AI-Gist-Backup/${requestBody.fileName}`,
        storageId: webdavConfig.id,
        checksum: requestBody.backupData.checksum
      })
    })

    const service = WebCloudBackupService.getInstance()
    const result = await service.createCloudBackup(webdavConfig.id, {
      description: '自动恢复快照',
      data: backupData,
      backupType: 'automatic',
      dataChecksum: 'same-export-checksum'
    })

    expect(result.success).toBe(true)
    expect(exportSpy).not.toHaveBeenCalled()
    expect(requestBody.backupData.data).toEqual(backupData)
    expect(requestBody.backupData).toMatchObject({
      backupType: 'automatic',
      dataChecksum: 'same-export-checksum'
    })
  })

  it('restores WebDAV backups only after validating the shared checksum payload', async () => {
    saveWebDAVConfig()
    const payload = createBackupPayload({
      id: 'web-backup-1',
      name: 'backup-2026-06-13-web',
      createdAt: '2026-06-13T00:00:00.000Z',
      data: backupData
    })
    const replaceSpy = vi.spyOn(DatabaseServiceManager.prototype, 'replaceAllData').mockResolvedValue({
      success: true,
      message: 'restored'
    } as any)

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const path = String(input)
      if (path.endsWith('/api/cloud/webdav/list-backups')) {
        return apiResponse([{
          id: payload.id,
          name: payload.name,
          createdAt: payload.createdAt,
          cloudPath: '/AI-Gist-Backup/backup-web-backup-1.json',
          storageId: webdavConfig.id,
          checksum: payload.checksum
        }])
      }

      if (path.endsWith('/api/cloud/webdav/read-backup')) {
        return apiResponse(payload)
      }

      return apiResponse({})
    })

    const service = WebCloudBackupService.getInstance()
    const result = await service.restoreCloudBackup(webdavConfig.id, payload.id)

    expect(result.success).toBe(true)
    expect(replaceSpy).toHaveBeenCalledWith(backupData)
  })

  it('rejects corrupted WebDAV backup payloads before replacing local data', async () => {
    saveWebDAVConfig()
    const payload = createBackupPayload({
      id: 'web-backup-bad',
      name: 'backup-2026-06-13-bad',
      createdAt: '2026-06-13T00:00:00.000Z',
      data: {
        ...backupData,
        prompts: [...backupData.prompts]
      }
    })
    payload.data.prompts.push({ id: 11, uuid: 'prompt-corrupt', title: '损坏数据', categoryId: 1 })
    const replaceSpy = vi.spyOn(DatabaseServiceManager.prototype, 'replaceAllData').mockResolvedValue({
      success: true,
      message: 'restored'
    } as any)

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
      const path = String(input)
      if (path.endsWith('/api/cloud/webdav/list-backups')) {
        return apiResponse([{
          id: payload.id,
          name: payload.name,
          createdAt: payload.createdAt,
          cloudPath: '/AI-Gist-Backup/backup-web-backup-bad.json',
          storageId: webdavConfig.id,
          checksum: payload.checksum
        }])
      }

      if (path.endsWith('/api/cloud/webdav/read-backup')) {
        return apiResponse(payload)
      }

      return apiResponse({})
    })

    const service = WebCloudBackupService.getInstance()
    const result = await service.restoreCloudBackup(webdavConfig.id, payload.id)

    expect(result.success).toBe(false)
    expect(result.error).toContain('备份数据校验失败')
    expect(replaceSpy).not.toHaveBeenCalled()
  })

  it('deletes listed backup references directly without re-listing and rejects out-of-namespace paths', async () => {
    saveWebDAVConfig()
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(apiResponse({ ok: true }))
    const service = WebCloudBackupService.getInstance()

    const deleted = await service.deleteCloudBackup(webdavConfig.id, {
      id: 'backup-direct',
      name: 'backup-direct',
      cloudPath: '/AI-Gist-Backup/backup-backup-direct.json'
    })
    const rejected = await service.deleteCloudBackup(webdavConfig.id, {
      id: 'escape',
      name: 'escape',
      cloudPath: '/other/backup-escape.json'
    })

    expect(deleted.success).toBe(true)
    expect(rejected.success).toBe(false)
    expect(rejected.error).toContain('命名空间')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(String(fetchSpy.mock.calls[0][0])).toContain('/api/cloud/webdav/delete-backup')
    expect(JSON.parse(String(fetchSpy.mock.calls[0][1]?.body))).toMatchObject({
      cloudPath: '/AI-Gist-Backup/backup-backup-direct.json'
    })
  })

  it('exposes direct sync snapshot deletion to the Web backend', async () => {
    saveWebDAVConfig()
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(apiResponse({ ok: true }))
    const service = WebCloudBackupService.getInstance()

    const result = await service.deleteCloudSyncSnapshot(webdavConfig.id, 'revision/direct')

    expect(result.success).toBe(true)
    expect(String(fetchSpy.mock.calls[0][0])).toContain('/api/cloud/webdav/delete-sync-snapshot')
    expect(JSON.parse(String(fetchSpy.mock.calls[0][1]?.body))).toMatchObject({ snapshot: 'revision/direct' })
  })

  it('exposes a binary-safe sync-v2 repository adapter with conditional writes', async () => {
    saveWebDAVConfig()
    let stored: { dataBase64: string; etag: string } | null = null
    let version = 0
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const pathname = String(input)
      const body = JSON.parse(String(init?.body))
      expect(body.path || body.prefix).not.toMatch(/^\//)

      if (pathname.endsWith('/sync-v2/write')) {
        if ((body.ifNoneMatch === '*' && stored) ||
            (body.ifMatch !== undefined && stored?.etag !== body.ifMatch)) {
          return apiResponse({ status: 'precondition_failed', etag: stored?.etag })
        }
        stored = { dataBase64: body.dataBase64, etag: `"web-etag-${++version}"` }
        return apiResponse({ status: 'written', etag: stored.etag })
      }
      if (pathname.endsWith('/sync-v2/read')) {
        return apiResponse(stored ? {
          path: getCloudSyncV2ManifestPath(),
          dataBase64: stored.dataBase64,
          etag: stored.etag,
          byteLength: Buffer.from(stored.dataBase64, 'base64').byteLength
        } : null)
      }
      if (pathname.endsWith('/sync-v2/list')) {
        return apiResponse(stored ? [{
          path: getCloudSyncV2ManifestPath(),
          etag: stored.etag,
          byteLength: Buffer.from(stored.dataBase64, 'base64').byteLength
        }] : [])
      }
      if (pathname.endsWith('/sync-v2/delete')) {
        stored = null
        return apiResponse({ ok: true })
      }
      return apiResponse(null)
    })

    const service = WebCloudBackupService.getInstance()
    const adapter = service.createCloudSyncV2ObjectStorageAdapter(webdavConfig.id)
    const path = getCloudSyncV2ManifestPath()
    const bytes = new Uint8Array([0, 1, 127, 128, 254, 255])
    const created = await adapter.write(path, bytes, { ifAbsent: true })
    expect(created.status).toBe('written')
    expect(await adapter.read(path)).toEqual({ data: bytes, etag: '"web-etag-1"' })

    expect(await adapter.write(path, new Uint8Array([9]), { ifAbsent: true })).toEqual({
      status: 'precondition_failed',
      etag: '"web-etag-1"'
    })
    expect(await adapter.write(path, new Uint8Array([8, 7]), { expectedEtag: '"web-etag-1"' }))
      .toEqual({ status: 'written', etag: '"web-etag-2"' })
    expect(await adapter.list(getCloudSyncV2DirectoryPath())).toEqual([{
      path,
      etag: '"web-etag-2"',
      byteLength: 2
    }])

    await adapter.delete(path)
    expect(await adapter.read(path)).toBeNull()
    await expect(adapter.read('/AI-Gist-Backup/sync-v2/%2e%2e/secret'))
      .rejects.toThrow('sync-v2 对象路径无效')
    expect(fetchSpy).toHaveBeenCalled()
  })
})
