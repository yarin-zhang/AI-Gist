/**
 * 桌面端渲染进程记下主进程报告的「下次检查能否不整份下载」，自动同步据此放宽焦点检查的节流 (#487)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlatformDetector } from '@shared/platform'
import { CloudBackupAPI } from '~/lib/api/cloud-backup.api'
import { createEmptyCloudSyncManifest } from '@shared/cloud-sync-manifest'

describe('desktop CloudBackupAPI cheap manifest checks (#487)', () => {
  beforeEach(() => {
    vi.spyOn(PlatformDetector, 'isElectron').mockReturnValue(true)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete (window as any).electronAPI
  })

  it('remembers per storage what the main process reported for the last read', async () => {
    const manifest = createEmptyCloudSyncManifest('2026-10-29T00:00:00.000Z')
    const getSyncManifest = vi.fn(async (storageId: string) => ({
      success: true,
      manifest,
      cheapCheckAvailable: storageId === 'cached'
    }))
    ;(window as any).electronAPI = { cloud: { getSyncManifest } }

    expect(CloudBackupAPI.canCheckSyncManifestCheaply('cached')).toBe(false)
    await expect(CloudBackupAPI.getCloudSyncManifest('cached')).resolves.toEqual(manifest)
    await expect(CloudBackupAPI.getCloudSyncManifest('uncached')).resolves.toEqual(manifest)

    expect(CloudBackupAPI.canCheckSyncManifestCheaply('cached')).toBe(true)
    expect(CloudBackupAPI.canCheckSyncManifestCheaply('uncached')).toBe(false)
  })

  it('forgets it when the read fails or an older main process does not report it', async () => {
    const manifest = createEmptyCloudSyncManifest('2026-10-29T00:00:00.000Z')
    const getSyncManifest = vi.fn()
      .mockResolvedValueOnce({ success: true, manifest, cheapCheckAvailable: true })
      .mockResolvedValueOnce({ success: false, error: 'ECONNRESET' })
      .mockResolvedValueOnce({ success: true, manifest, cheapCheckAvailable: true })
      .mockResolvedValueOnce({ success: true, manifest })
    ;(window as any).electronAPI = { cloud: { getSyncManifest } }

    await CloudBackupAPI.getCloudSyncManifest('storage-1')
    expect(CloudBackupAPI.canCheckSyncManifestCheaply('storage-1')).toBe(true)
    await expect(CloudBackupAPI.getCloudSyncManifest('storage-1')).rejects.toThrow('ECONNRESET')
    expect(CloudBackupAPI.canCheckSyncManifestCheaply('storage-1')).toBe(false)

    await CloudBackupAPI.getCloudSyncManifest('storage-1')
    await CloudBackupAPI.getCloudSyncManifest('storage-1')
    expect(CloudBackupAPI.canCheckSyncManifestCheaply('storage-1')).toBe(false)
  })
})
