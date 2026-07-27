import { describe, expect, it, vi } from 'vitest'
import { createBackupPayload, type BackupPayload } from '@shared/backup-integrity'
import {
  LocalBackupService,
  createLocalBackupSemanticChecksum,
  type LocalBackupInfo,
  type LocalBackupRepository
} from '~/lib/services/local-backup.service'

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

class MemoryBackupRepository implements LocalBackupRepository {
  backups: LocalBackupInfo[] = []
  write = vi.fn(async (payload: BackupPayload): Promise<LocalBackupInfo> => {
    const backup: LocalBackupInfo = {
      id: payload.id,
      name: payload.name,
      description: payload.description || '',
      createdAt: payload.createdAt,
      size: JSON.stringify(payload).length,
      backupType: payload.backupType,
      trigger: payload.trigger,
      dataChecksum: payload.dataChecksum,
      payload
    }
    this.backups.push(backup)
    return backup
  })
  delete = vi.fn(async (backup: LocalBackupInfo) => {
    this.backups = this.backups.filter(item => item.id !== backup.id)
  })
  async list() { return [...this.backups] }
}

function createService(repository = new MemoryBackupRepository()) {
  let id = 0
  let timestamp = Date.parse('2026-07-11T00:00:00.000Z')
  const service = new LocalBackupService({
    repository,
    database: {
      exportAllDataForBackup: vi.fn().mockResolvedValue({ success: true, data: emptyData })
    },
    createId: () => `local-${++id}`,
    now: () => new Date(timestamp += 1_000)
  })
  return { service, repository }
}

describe('LocalBackupService', () => {
  it('deduplicates semantic content while ignoring regenerated local numeric ids', async () => {
    const { service, repository } = createService()
    const first = {
      ...emptyData,
      categories: [{ id: 1, uuid: 'category-a', name: 'A' }],
      prompts: [{ id: 2, uuid: 'prompt-a', categoryId: 1, title: 'Prompt' }]
    }
    const regeneratedIds = {
      ...emptyData,
      categories: [{ id: 101, uuid: 'category-a', name: 'A' }],
      prompts: [{ id: 202, uuid: 'prompt-a', categoryId: 101, title: 'Prompt' }]
    }

    const created = await service.create({ data: first, backupType: 'automatic' })
    const unchanged = await service.create({ data: regeneratedIds, backupType: 'automatic' })

    expect(created.action).toBe('created')
    expect(unchanged.action).toBe('unchanged')
    expect(repository.write).toHaveBeenCalledTimes(1)
  })

  it('requires an exact semantic signature even when a stored checksum claims a match', async () => {
    const { service, repository } = createService()
    const storedData = { ...emptyData, prompts: [{ id: 1, uuid: 'prompt-a', title: 'Old' }] }
    const currentData = { ...emptyData, prompts: [{ id: 1, uuid: 'prompt-a', title: 'Current' }] }
    const payload = createBackupPayload({
      id: 'forged-checksum',
      name: 'backup-forged',
      description: 'Existing backup',
      createdAt: '2026-07-11T00:00:00.000Z',
      data: storedData,
      backupType: 'automatic',
      dataChecksum: createLocalBackupSemanticChecksum(currentData)
    })
    repository.backups.push({
      id: payload.id,
      name: payload.name,
      description: payload.description || '',
      createdAt: payload.createdAt,
      size: 10,
      backupType: payload.backupType,
      dataChecksum: payload.dataChecksum,
      payload
    })

    const result = await service.create({ data: currentData, backupType: 'automatic' })

    expect(result.action).toBe('created')
    expect(repository.write).toHaveBeenCalledTimes(1)
  })

  it('creates a new latest backup when data rolls back to an older version', async () => {
    const { service, repository } = createService()
    const versionA = { ...emptyData, prompts: [{ id: 1, uuid: 'prompt-a', title: 'A' }] }
    const versionB = { ...emptyData, prompts: [{ id: 1, uuid: 'prompt-a', title: 'B' }] }

    await service.create({ data: versionA, backupType: 'automatic' })
    await service.create({ data: versionB, backupType: 'automatic' })
    const rollback = await service.create({ data: versionA, backupType: 'automatic' })

    expect(rollback.action).toBe('created')
    expect(repository.write).toHaveBeenCalledTimes(3)
  })

  it('retention deletes only old automatic backups and preserves manual backups', async () => {
    const { service, repository } = createService()
    for (const [index, backupType] of ['automatic', 'manual', 'automatic', 'automatic'].entries()) {
      const data = { ...emptyData, prompts: [{ id: index, uuid: `prompt-${index}`, title: String(index) }] }
      await service.create({ data, backupType: backupType as 'automatic' | 'manual' })
    }

    const deletedCount = await service.pruneAutomatic(2)
    const remaining = await service.list()

    expect(deletedCount).toBe(1)
    expect(remaining.filter(backup => backup.backupType === 'automatic')).toHaveLength(2)
    expect(remaining.filter(backup => backup.backupType === 'manual')).toHaveLength(1)
  })

  it('ignores an invalid retention value instead of deleting every automatic backup', async () => {
    const { service, repository } = createService()
    await service.create({ data: emptyData, backupType: 'automatic' })

    expect(await service.pruneAutomatic(Number.NaN)).toBe(0)
    expect(repository.delete).not.toHaveBeenCalled()
    expect(await service.list()).toHaveLength(1)
  })

  it('does not prune existing backups when writing the new backup fails', async () => {
    const repository = new MemoryBackupRepository()
    repository.write.mockRejectedValueOnce(new Error('disk full'))
    repository.backups.push({
      id: 'existing',
      name: 'existing',
      description: 'Existing',
      createdAt: '2026-07-11T00:00:00.000Z',
      size: 10,
      backupType: 'automatic',
      payload: createBackupPayload({
        id: 'existing',
        name: 'existing',
        createdAt: '2026-07-11T00:00:00.000Z',
        data: emptyData,
        backupType: 'automatic'
      })
    })
    const { service } = createService(repository)

    await expect(service.create({
      data: { ...emptyData, prompts: [{ id: 1, uuid: 'new', title: 'New' }] },
      backupType: 'automatic',
      retention: 1
    })).rejects.toThrow('disk full')

    expect(repository.delete).not.toHaveBeenCalled()
    expect(repository.backups.map(backup => backup.id)).toEqual(['existing'])
  })
})
