import { describe, expect, it, vi } from 'vitest'
import {
  AutomaticBackupService,
  DEFAULT_AUTO_BACKUP_INTERVAL_MINUTES,
  DEFAULT_AUTO_BACKUP_RETENTION,
  normalizeAutomaticBackupInterval,
  normalizeAutomaticBackupRetention
} from '~/lib/services/automatic-backup.service'

class MemoryStorage {
  private readonly values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) || null }
  setItem(key: string, value: string) { this.values.set(key, value) }
}

const configs = [
  {
    id: 'storage-a',
    name: 'WebDAV A',
    type: 'webdav' as const,
    enabled: true,
    createdAt: '2026-07-11T00:00:00.000Z',
    updatedAt: '2026-07-11T00:00:00.000Z'
  },
  {
    id: 'storage-b',
    name: 'WebDAV B',
    type: 'webdav' as const,
    enabled: true,
    createdAt: '2026-07-11T00:00:00.000Z',
    updatedAt: '2026-07-11T00:00:00.000Z'
  }
]

function createService(overrides: { failStorageId?: string } = {}) {
  const automaticBackups = Array.from({ length: 22 }, (_, index) => ({
    id: `automatic-${index}`,
    name: `automatic-${index}`,
    createdAt: new Date(Date.UTC(2026, 6, 11, 0, 0, 22 - index)).toISOString(),
    size: 10,
    storageId: 'storage-a',
    backupType: 'automatic' as const
  }))
  const manualBackup = {
    id: 'manual-keep',
    name: 'manual-keep',
    createdAt: '2025-01-01T00:00:00.000Z',
    size: 10,
    storageId: 'storage-a',
    backupType: 'manual' as const
  }
  const remoteBackups: Record<string, any[]> = {
    'storage-a': automaticBackups.map(backup => ({ ...backup, storageId: 'storage-a' })).concat(manualBackup),
    'storage-b': automaticBackups.map(backup => ({ ...backup, storageId: 'storage-b' })).concat({ ...manualBackup, storageId: 'storage-b' })
  }
  let createdSequence = 0
  const createCloudBackup = vi.fn(async (storageId: string, options: any) => {
    if (storageId === overrides.failStorageId) {
      return { success: false, message: 'upload failed', error: 'ECONNRESET' }
    }
    const backupInfo = {
      id: `created-${storageId}-${createdSequence++}`,
      name: `created-${storageId}`,
      createdAt: '2026-07-11T01:00:00.000Z',
      size: 10,
      storageId,
      ...options
    }
    remoteBackups[storageId].push(backupInfo)
    return {
      success: true,
      message: 'ok',
      backupInfo
    }
  })
  const deleteCloudBackup = vi.fn(async (storageId: string, backupId: string) => {
    remoteBackups[storageId] = remoteBackups[storageId].filter(backup => backup.id !== backupId)
    return { success: true }
  })
  const cloudClient = {
    getStorageConfigs: vi.fn().mockResolvedValue(configs),
    createCloudBackup,
    getCloudBackupList: vi.fn(async (storageId: string) => remoteBackups[storageId]),
    deleteCloudBackup
  }
  const settings = {
    getBooleanValue: vi.fn().mockResolvedValue(true),
    setBooleanValue: vi.fn().mockResolvedValue({}),
    getNumberValue: vi.fn().mockImplementation(async (key: string, fallback: number) => fallback),
    setNumberValue: vi.fn().mockResolvedValue({})
  }
  const database = {
    exportAllDataForBackup: vi.fn().mockResolvedValue({
      success: true,
      message: 'ok',
      data: { prompts: [{ id: 1, title: 'Protected' }], settings: [] }
    })
  }
  const service = new AutomaticBackupService({
    settings,
    database,
    cloudClient,
    storage: new MemoryStorage(),
    getDeviceId: () => 'device-test'
  })
  return { service, cloudClient, createCloudBackup, deleteCloudBackup, remoteBackups }
}

describe('automatic backup settings', () => {
  it('normalizes snapshot intervals to the supported one-hour to seven-day range', () => {
    expect(normalizeAutomaticBackupInterval(Number.NaN)).toBe(DEFAULT_AUTO_BACKUP_INTERVAL_MINUTES)
    expect(normalizeAutomaticBackupInterval(5)).toBe(60)
    expect(normalizeAutomaticBackupInterval(360)).toBe(360)
    expect(normalizeAutomaticBackupInterval(20_000)).toBe(10_080)
  })

  it('normalizes automatic snapshot retention without allowing unlimited deletion', () => {
    expect(normalizeAutomaticBackupRetention(Number.NaN)).toBe(DEFAULT_AUTO_BACKUP_RETENTION)
    expect(normalizeAutomaticBackupRetention(0)).toBe(1)
    expect(normalizeAutomaticBackupRetention(20)).toBe(20)
    expect(normalizeAutomaticBackupRetention(500)).toBe(100)
  })

  it('creates deduplicated snapshots for every enabled storage and prunes only automatic backups', async () => {
    const { service, createCloudBackup, deleteCloudBackup } = createService()

    await service.runNow('interval')
    await service.runNow('interval')

    expect(createCloudBackup).toHaveBeenCalledTimes(2)
    expect(createCloudBackup).toHaveBeenCalledWith('storage-a', expect.objectContaining({
      backupType: 'automatic',
      trigger: 'interval',
      deviceId: 'device-test'
    }))
    expect(createCloudBackup).toHaveBeenCalledWith('storage-b', expect.objectContaining({
      backupType: 'automatic'
    }))
    expect(deleteCloudBackup).not.toHaveBeenCalledWith(expect.anything(), 'manual-keep')
    expect(deleteCloudBackup).toHaveBeenCalledWith('storage-a', 'automatic-20')
    expect(deleteCloudBackup).toHaveBeenCalledWith('storage-b', 'automatic-21')
  })

  it('continues backing up later storage targets when an earlier storage fails', async () => {
    const { service, createCloudBackup } = createService({ failStorageId: 'storage-a' })

    await service.runNow('interval')

    expect(createCloudBackup).toHaveBeenCalledWith('storage-b', expect.any(Object))
    expect(service.getStatus()).toMatchObject({
      status: 'error',
      error: expect.stringContaining('WebDAV A')
    })
  })

  it('recreates a snapshot when the matching remote automatic backup was deleted', async () => {
    const { service, createCloudBackup, remoteBackups } = createService()

    await service.runNow('interval')
    remoteBackups['storage-a'] = remoteBackups['storage-a'].filter(backup => backup.backupType !== 'automatic')
    await service.runNow('interval')

    expect(createCloudBackup.mock.calls.filter(([storageId]) => storageId === 'storage-a')).toHaveLength(2)
    expect(createCloudBackup.mock.calls.filter(([storageId]) => storageId === 'storage-b')).toHaveLength(1)
  })
})
