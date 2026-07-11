import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest'
import {
  createBackupPayload,
  parseBackupPayload
} from '@shared/backup-integrity'
import { DatabaseServiceManager } from '~/lib/services/database-manager.service'
import { WebCloudBackupService } from '~/lib/services/web-cloud-backup.service'

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
})
