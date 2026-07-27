import { describe, expect, it, vi } from 'vitest'
import {
  AutomaticBackupService,
  createAutomaticBackupSemanticChecksum,
  DEFAULT_AUTO_BACKUP_INTERVAL_MINUTES,
  DEFAULT_AUTO_BACKUP_RETENTION,
  normalizeAutomaticBackupInterval,
  normalizeAutomaticBackupRetention
} from '~/lib/services/automatic-backup.service'

function createService(overrides: {
  createResult?: 'created' | 'unchanged'
  createError?: Error
  deletedCount?: number
} = {}) {
  const settings = {
    getBooleanValue: vi.fn().mockResolvedValue(true),
    setBooleanValue: vi.fn().mockResolvedValue({}),
    getNumberValue: vi.fn().mockImplementation(async (_key: string, fallback: number) => fallback),
    setNumberValue: vi.fn().mockResolvedValue({})
  }
  const backup = {
    id: 'local-automatic-1',
    name: 'backup-2026-07-11-local',
    description: 'Automatic local backup',
    createdAt: '2026-07-11T01:00:00.000Z',
    size: 10,
    backupType: 'automatic' as const
  }
  const backupService = {
    list: vi.fn().mockResolvedValue([backup]),
    create: overrides.createError
      ? vi.fn().mockRejectedValue(overrides.createError)
      : vi.fn().mockResolvedValue({
          action: overrides.createResult || 'created',
          backup,
          deletedCount: overrides.deletedCount || 0
        }),
    pruneAutomatic: vi.fn().mockResolvedValue(overrides.deletedCount || 0)
  }
  const service = new AutomaticBackupService({ settings, backupService })
  return { service, settings, backupService, backup }
}

describe('automatic backup settings', () => {
  it('normalizes local backup intervals to the supported one-hour to seven-day range', () => {
    expect(normalizeAutomaticBackupInterval(Number.NaN)).toBe(DEFAULT_AUTO_BACKUP_INTERVAL_MINUTES)
    expect(normalizeAutomaticBackupInterval(5)).toBe(60)
    expect(normalizeAutomaticBackupInterval(360)).toBe(360)
    expect(normalizeAutomaticBackupInterval(20_000)).toBe(10_080)
  })

  it('normalizes automatic local retention without allowing unlimited deletion', () => {
    expect(normalizeAutomaticBackupRetention(Number.NaN)).toBe(DEFAULT_AUTO_BACKUP_RETENTION)
    expect(normalizeAutomaticBackupRetention(0)).toBe(1)
    expect(normalizeAutomaticBackupRetention(20)).toBe(20)
    expect(normalizeAutomaticBackupRetention(500)).toBe(100)
  })

  it('runs automatic backups through the local repository only', async () => {
    const { service, backupService } = createService({ deletedCount: 2 })

    await service.runNow('interval')

    expect(backupService.create).toHaveBeenCalledTimes(1)
    expect(backupService.create).toHaveBeenCalledWith({
      description: expect.stringContaining('自动本地备份'),
      backupType: 'automatic',
      trigger: 'interval',
      retention: DEFAULT_AUTO_BACKUP_RETENTION
    })
    expect(service.getStatus()).toMatchObject({
      status: 'success',
      lastRunAction: 'created',
      deletedCount: 2
    })
  })

  it('reports an unchanged local backup without creating a remote version', async () => {
    const { service, backupService, backup } = createService({ createResult: 'unchanged' })

    await service.runNow('interval')

    expect(backupService.create).toHaveBeenCalledTimes(1)
    expect(service.getStatus()).toMatchObject({
      status: 'success',
      lastRunAction: 'unchanged',
      lastBackupAt: backup.createdAt
    })
  })

  it('records local repository failures without requiring any cloud configuration', async () => {
    const { service } = createService({ createError: new Error('local disk full') })

    await service.runNow('interval')

    expect(service.getStatus()).toMatchObject({
      status: 'error',
      error: 'local disk full'
    })
  })

  it('lowering retention immediately prunes automatic backups in the local repository', async () => {
    const { service, settings, backupService } = createService({ deletedCount: 15 })

    const result = await service.setRetention(5)

    expect(settings.setNumberValue).toHaveBeenCalledWith(
      'cloud.backup.auto.retention',
      5,
      expect.stringContaining('本机')
    )
    expect(backupService.pruneAutomatic).toHaveBeenCalledWith(5)
    expect(result).toEqual({ retention: 5, deletedCount: 15, deferredCount: 0, warnings: [] })
  })

  it('uses semantic checksums that ignore regenerated local numeric ids', () => {
    const emptyCollections = {
      promptVariables: [], promptHistories: [], aiConfigs: [], quickOptimizationConfigs: [],
      aiHistory: [], settings: [], syncTombstones: []
    }
    const first = {
      ...emptyCollections,
      categories: [{ id: 1, uuid: 'category-a', name: 'A' }],
      prompts: [{ id: 2, uuid: 'prompt-a', categoryId: 1, title: 'Prompt' }]
    }
    const second = {
      ...emptyCollections,
      categories: [{ id: 101, uuid: 'category-a', name: 'A' }],
      prompts: [{ id: 202, uuid: 'prompt-a', categoryId: 101, title: 'Prompt' }]
    }

    expect(createAutomaticBackupSemanticChecksum(first)).toBe(
      createAutomaticBackupSemanticChecksum(second)
    )
  })
})
