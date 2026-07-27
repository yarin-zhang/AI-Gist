import { describe, expect, it, vi } from 'vitest'
import {
  createCloudSyncDataChecksum,
  createCloudSyncSnapshot
} from '@shared/cloud-sync-engine'
import {
  assertValidCloudSyncManifest,
  createEmptyCloudSyncManifest,
  getCloudSyncManifestRepairMetadata,
  readCloudSyncManifestWithFallback
} from '@shared/cloud-sync-manifest'

const baseData = {
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

describe('cloud sync manifest fallback', () => {
  it('repairs snapshot checksum drift when the snapshot data is still readable', () => {
    const snapshot = createCloudSyncSnapshot(baseData, 'device-a', 'rev-checksum-drift')
    const manifest = {
      ...createEmptyCloudSyncManifest('2026-01-01T00:00:00.000Z'),
      latestSnapshot: {
        ...snapshot,
        dataChecksum: 'fnv1a32:00000000'
      }
    }

    const repaired = assertValidCloudSyncManifest(manifest)

    expect(repaired.latestSnapshot?.dataChecksum).toBe(
      createCloudSyncDataChecksum(repaired.latestSnapshot!.data)
    )
    expect(getCloudSyncManifestRepairMetadata(repaired)).toMatchObject({
      repairedSnapshotFields: ['latestSnapshot']
    })
  })

  it('treats the primary manifest as authoritative without reading a newer backup copy', async () => {
    const primaryManifest = {
      ...createEmptyCloudSyncManifest('2026-01-01T00:00:00.000Z'),
      latestSnapshot: createCloudSyncSnapshot(baseData, 'device-a', 'rev-primary')
    }
    const backupManifest = {
      ...createEmptyCloudSyncManifest('2026-01-02T00:00:00.000Z'),
      latestSnapshot: createCloudSyncSnapshot(baseData, 'device-b', 'rev-backup')
    }
    const readPrimary = vi.fn().mockResolvedValue(primaryManifest)
    const readBackup = vi.fn().mockResolvedValue(backupManifest)

    const manifest = await readCloudSyncManifestWithFallback({
      readPrimary,
      readBackup
    })

    expect(manifest.latestSnapshot?.revision).toBe('rev-primary')
    expect(readPrimary).toHaveBeenCalledTimes(1)
    expect(readBackup).not.toHaveBeenCalled()
  })

  it('uses the backup manifest only when the primary copy cannot be read', async () => {
    const backupManifest = {
      ...createEmptyCloudSyncManifest('2026-01-02T00:00:00.000Z'),
      latestSnapshot: createCloudSyncSnapshot(baseData, 'device-b', 'rev-backup')
    }
    const readBackup = vi.fn().mockResolvedValue(backupManifest)

    const manifest = await readCloudSyncManifestWithFallback({
      readPrimary: vi.fn().mockRejectedValue(new Error('primary is corrupt')),
      readBackup
    })

    expect(manifest.latestSnapshot?.revision).toBe('rev-backup')
    expect(readBackup).toHaveBeenCalledTimes(1)
  })

  it('keeps the primary manifest when backup read fails after a valid primary read', async () => {
    const primaryManifest = {
      ...createEmptyCloudSyncManifest('2026-01-02T00:00:00.000Z'),
      latestSnapshot: createCloudSyncSnapshot(baseData, 'device-a', 'rev-primary')
    }

    const manifest = await readCloudSyncManifestWithFallback({
      readPrimary: vi.fn().mockResolvedValue(primaryManifest),
      readBackup: vi.fn().mockRejectedValue(new Error('backup unavailable'))
    })

    expect(manifest.latestSnapshot?.revision).toBe('rev-primary')
  })

  it('returns an empty manifest only when both primary and backup are missing', async () => {
    const manifest = await readCloudSyncManifestWithFallback({
      readPrimary: vi.fn().mockRejectedValue(new Error('404 Not Found')),
      readBackup: vi.fn().mockRejectedValue(new Error('backup does not exist'))
    })

    expect(manifest.latestSnapshot).toBeUndefined()
    expect(manifest.devices).toEqual({})
  })
})
