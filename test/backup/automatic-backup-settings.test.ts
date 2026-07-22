import { describe, expect, it, vi } from 'vitest'
import {
  AutomaticBackupService,
  createAutomaticBackupSemanticChecksum,
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

function createService(overrides: {
  failStorageId?: string
  automaticBackupCount?: number
  data?: any
  retention?: number
} = {}) {
  const automaticBackups = Array.from({ length: overrides.automaticBackupCount ?? 22 }, (_, index) => ({
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
  const deleteCloudBackup = vi.fn(async (storageId: string, target: string | { id: string }) => {
    const backupId = typeof target === 'string' ? target : target.id
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
    getNumberValue: vi.fn().mockImplementation(async (key: string, fallback: number) =>
      key === 'cloud.backup.auto.retention' && overrides.retention !== undefined
        ? overrides.retention
        : fallback
    ),
    setNumberValue: vi.fn().mockResolvedValue({})
  }
  const database = {
    exportAllDataForBackup: vi.fn().mockResolvedValue({
      success: true,
      message: 'ok',
      data: overrides.data || { prompts: [{ id: 1, title: 'Protected' }], settings: [] }
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
    expect(deleteCloudBackup).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'manual-keep' })
    )
    expect(deleteCloudBackup).toHaveBeenCalledWith(
      'storage-a',
      expect.objectContaining({ id: 'automatic-20' })
    )
    expect(deleteCloudBackup).toHaveBeenCalledWith(
      'storage-b',
      expect.objectContaining({ id: 'automatic-21' })
    )
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

  it('compares only with the newest automatic backup so rolling back data creates a new latest version', async () => {
    const rolledBackData = { prompts: [{ id: 1, title: 'Version A' }], settings: [] }
    const newerData = { prompts: [{ id: 1, title: 'Version B' }], settings: [] }
    const { service, createCloudBackup, remoteBackups } = createService({
      automaticBackupCount: 0,
      data: rolledBackData
    })

    for (const config of configs) {
      remoteBackups[config.id] = [
        {
          id: `newer-${config.id}`,
          name: `newer-${config.id}`,
          createdAt: '2026-07-11T02:00:00.000Z',
          size: 10,
          storageId: config.id,
          backupType: 'automatic',
          dataChecksum: createAutomaticBackupSemanticChecksum(newerData)
        },
        {
          id: `older-${config.id}`,
          name: `older-${config.id}`,
          createdAt: '2026-07-11T01:00:00.000Z',
          size: 10,
          storageId: config.id,
          backupType: 'automatic',
          dataChecksum: createAutomaticBackupSemanticChecksum(rolledBackData)
        }
      ]
    }

    await service.runNow('interval')

    expect(createCloudBackup).toHaveBeenCalledTimes(2)
    expect(service.getStatus()).toMatchObject({ status: 'success', lastRunAction: 'created' })
  })

  it('rotates hundreds of automatic versions in one listing pass per storage and never deletes manual backups', async () => {
    const data = { prompts: [{ id: 1, title: 'Current' }], settings: [] }
    const { service, cloudClient, createCloudBackup, deleteCloudBackup, remoteBackups } = createService({
      automaticBackupCount: 300,
      data,
      retention: 20
    })
    const checksum = createAutomaticBackupSemanticChecksum(data)
    for (const config of configs) {
      remoteBackups[config.id][0].dataChecksum = checksum
    }

    await service.runNow('interval')

    expect(createCloudBackup).not.toHaveBeenCalled()
    expect(cloudClient.getCloudBackupList).toHaveBeenCalledTimes(2)
    expect(deleteCloudBackup).toHaveBeenCalledTimes(560)
    for (const config of configs) {
      expect(remoteBackups[config.id].filter(backup => backup.backupType === 'automatic')).toHaveLength(20)
      expect(remoteBackups[config.id]).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'manual-keep', backupType: 'manual' })
      ]))
    }
  })

  it('lowering retention immediately and independently cleans automatic backups and sync recovery snapshots', async () => {
    const { service, cloudClient, remoteBackups } = createService({ automaticBackupCount: 30 })
    const snapshots: Record<string, any[]> = Object.fromEntries(configs.map(config => [
      config.id,
      Array.from({ length: 30 }, (_, index) => ({
        revision: `snapshot-${index}`,
        path: `/AI-Gist-Backup/sync/snapshots/snapshot-${index}.json`,
        modifiedAt: new Date(Date.UTC(2026, 5, 1, 0, 0, 30 - index)).toISOString()
      }))
    ]))
    Object.assign(cloudClient, {
      getCloudSyncManifest: vi.fn(async () => ({
        latestSnapshot: { revision: 'snapshot-0' }
      })),
      listCloudSyncSnapshots: vi.fn(async (storageId: string) => snapshots[storageId]),
      deleteCloudSyncSnapshot: vi.fn(async (storageId: string, target: any) => {
        const revision = typeof target === 'string' ? target : target.revision
        snapshots[storageId] = snapshots[storageId].filter(snapshot => snapshot.revision !== revision)
        return { success: true }
      })
    })

    const result = await service.setRetention(5)

    expect(result).toMatchObject({ retention: 5, deletedCount: 100, deferredCount: 0, warnings: [] })
    for (const config of configs) {
      expect(remoteBackups[config.id].filter(backup => backup.backupType === 'automatic')).toHaveLength(5)
      expect(remoteBackups[config.id].some(backup => backup.id === 'manual-keep')).toBe(true)
      expect(snapshots[config.id]).toHaveLength(5)
      expect(snapshots[config.id].some(snapshot => snapshot.revision === 'snapshot-0')).toBe(true)
    }
  })
})
