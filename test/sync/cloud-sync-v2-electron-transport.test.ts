// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  CloudFileInfo,
  CloudFileWriteOptions,
  CloudFileWriteResult,
  CloudStorageProvider,
  WebDAVConfig
} from '../../src/shared/types/cloud-backup'
import {
  getCloudSyncV2DirectoryPath,
  getCloudSyncV2ManifestPath
} from '../../src/shared/cloud-backup-paths'

const electronMock = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => any>()
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: any[]) => any) => {
      electronMock.handlers.set(channel, handler)
    }
  },
  BrowserWindow: {
    getAllWindows: () => []
  }
}))

import { CloudBackupManager } from '../../src/main/cloud/cloud-backup-manager'

describe('Electron cloud sync v2 object transport', () => {
  let provider: MemoryProvider
  let manager: CloudBackupManager
  let providerCreations: number

  beforeEach(() => {
    electronMock.handlers.clear()
    provider = new MemoryProvider()
    providerCreations = 0
    manager = new CloudBackupManager({} as any)

    const config: WebDAVConfig = {
      id: 'storage-1',
      name: 'test',
      type: 'webdav',
      enabled: true,
      url: 'https://dav.example.test/remote.php/dav/files/user/AI-Gist-Backup',
      username: 'user',
      password: 'secret',
      createdAt: '2026-07-12T00:00:00.000Z',
      updatedAt: '2026-07-12T00:00:00.000Z'
    }

    const internal = manager as any
    internal.loadConfigs = async () => undefined
    internal.getStorageConfig = (storageId: string) => {
      if (storageId !== config.id) throw new Error('missing config')
      return config
    }
    internal.createProvider = () => {
      providerCreations += 1
      return provider
    }
  })

  it('registers the four restricted IPC operations', () => {
    expect([...electronMock.handlers.keys()]).toEqual(expect.arrayContaining([
      'cloud:read-sync-v2-object',
      'cloud:write-sync-v2-object',
      'cloud:list-sync-v2-objects',
      'cloud:delete-sync-v2-object'
    ]))
  })

  it('round-trips arbitrary binary bytes without UTF-8 conversion', async () => {
    const bytes = Uint8Array.from([0, 255, 1, 128, 13, 10, 0, 42])
    const internal = manager as any

    const written = await internal.writeCloudSyncV2Object(
      'storage-1',
      getCloudSyncV2ManifestPath(),
      bytes,
      { ifAbsent: true }
    )
    const stored = await internal.readCloudSyncV2Object('storage-1', getCloudSyncV2ManifestPath())

    expect(written).toEqual({ status: 'written', etag: 'etag-1' })
    expect([...stored.data]).toEqual([...bytes])
    expect(stored.etag).toBe('etag-1')
    expect(provider.lastWrittenPath).toBe('/sync-v2/manifest.json')
  })

  it('maps create-only and ETag conditions to provider precondition results', async () => {
    const internal = manager as any
    const objectPath = getCloudSyncV2ManifestPath()
    await internal.writeCloudSyncV2Object('storage-1', objectPath, Uint8Array.of(1))

    await expect(internal.writeCloudSyncV2Object(
      'storage-1', objectPath, Uint8Array.of(2), { ifAbsent: true }
    )).resolves.toEqual({ status: 'precondition_failed', etag: 'etag-1' })

    await expect(internal.writeCloudSyncV2Object(
      'storage-1', objectPath, Uint8Array.of(3), { expectedEtag: 'stale-etag' }
    )).resolves.toEqual({ status: 'precondition_failed', etag: 'etag-1' })

    await expect(internal.writeCloudSyncV2Object(
      'storage-1', objectPath, Uint8Array.of(4), { expectedEtag: 'etag-1' }
    )).resolves.toEqual({ status: 'written', etag: 'etag-2' })
  })

  it('refuses desktop iCloud conditional writes because its CAS is not atomic', async () => {
    const internal = manager as any
    internal.getStorageConfig = () => ({
      id: 'storage-1', name: 'iCloud', type: 'icloud', enabled: true,
      path: 'AI-Gist-Backup', createdAt: '2026-07-12T00:00:00.000Z', updatedAt: '2026-07-12T00:00:00.000Z'
    })

    await expect(internal.writeCloudSyncV2Object(
      'storage-1', getCloudSyncV2ManifestPath(), Uint8Array.of(1), { ifAbsent: true }
    )).resolves.toEqual({ status: 'precondition_failed' })
    expect(provider.lastWrittenPath).toBeUndefined()
  })

  it('recursively lists canonical paths with byte lengths and ETags, then deletes idempotently', async () => {
    const internal = manager as any
    const root = getCloudSyncV2DirectoryPath()
    const commit = `${root}/commits/commit~3Aabc.json`
    const blob = `${root}/blobs/blob~3Axyz.bin`
    await internal.writeCloudSyncV2Object('storage-1', commit, Uint8Array.of(1, 2, 3))
    await internal.writeCloudSyncV2Object('storage-1', blob, Uint8Array.of(0, 255))

    await expect(internal.listCloudSyncV2Objects('storage-1', root)).resolves.toEqual([
      { path: blob, etag: 'etag-2', byteLength: 2 },
      { path: commit, etag: 'etag-1', byteLength: 3 }
    ])
    await expect(internal.listCloudSyncV2Objects('storage-1', `${root}/commits/commit~3A`)).resolves.toEqual([
      { path: commit, etag: 'etag-1', byteLength: 3 }
    ])

    await internal.deleteCloudSyncV2Object('storage-1', commit)
    await internal.deleteCloudSyncV2Object('storage-1', commit)
    await expect(internal.readCloudSyncV2Object('storage-1', commit)).resolves.toBeNull()
  })

  it.each([
    '/AI-Gist-Backup/sync-v2/../sync-manifest.json',
    '/AI-Gist-Backup/sync-v2/%2e%2e/sync-manifest.json',
    '/AI-Gist-Backup/sync-v2/%252e%252e/sync-manifest.json',
    '/AI-Gist-Backup/sync-v2\\..\\sync-manifest.json',
    '/AI-Gist-Backup/sync-v2//manifest.json',
    '/AI-Gist-Backup/sync-v20/manifest.json',
    '/AI-Gist-Backup/sync-manifest.json',
    'AI-Gist-Backup/sync-v2/manifest.json'
  ])('rejects namespace and traversal path %s before provider access', async attackPath => {
    const internal = manager as any

    await expect(internal.readCloudSyncV2Object('storage-1', attackPath)).rejects.toThrow()
    await expect(internal.writeCloudSyncV2Object('storage-1', attackPath, Uint8Array.of(1))).rejects.toThrow()
    await expect(internal.listCloudSyncV2Objects('storage-1', attackPath)).rejects.toThrow()
    await expect(internal.deleteCloudSyncV2Object('storage-1', attackPath)).rejects.toThrow()
    expect(providerCreations).toBe(0)
  })

  it('does not permit writing or deleting the v2 namespace root', async () => {
    const internal = manager as any
    const root = getCloudSyncV2DirectoryPath()

    await expect(internal.writeCloudSyncV2Object('storage-1', root, Uint8Array.of(1))).rejects.toThrow()
    await expect(internal.deleteCloudSyncV2Object('storage-1', root)).rejects.toThrow()
    expect(providerCreations).toBe(0)
  })
})

class MemoryProvider implements CloudStorageProvider {
  private objects = new Map<string, { data: Buffer; etag: string }>()
  private etagCounter = 0
  lastWrittenPath?: string

  async testConnection(): Promise<boolean> { return true }
  createDirectory(): Promise<void> { return Promise.resolve() }

  async readFile(objectPath: string): Promise<Buffer> {
    const object = this.objects.get(objectPath)
    if (!object) throw new Error('404 not found')
    return Buffer.from(object.data)
  }

  async writeFile(
    objectPath: string,
    data: Uint8Array,
    options: CloudFileWriteOptions = {}
  ): Promise<CloudFileWriteResult> {
    const current = this.objects.get(objectPath)
    if (options.ifNoneMatch && current) throw new Error('412 Precondition Failed: if-none-match')
    if (options.ifMatch && current?.etag !== options.ifMatch) throw new Error('412 Precondition Failed: if-match')
    const etag = `etag-${++this.etagCounter}`
    this.objects.set(objectPath, { data: Buffer.from(data), etag })
    this.lastWrittenPath = objectPath
    return { etag }
  }

  async deleteFile(objectPath: string): Promise<void> {
    if (!this.objects.delete(objectPath)) throw new Error('404 not found')
  }

  async getFileInfo(objectPath: string): Promise<CloudFileInfo | null> {
    const object = this.objects.get(objectPath)
    if (object) {
      return this.fileInfo(objectPath, object.data.length, false, object.etag)
    }
    const directoryPrefix = `${objectPath.replace(/\/+$/, '')}/`
    if ([...this.objects.keys()].some(key => key.startsWith(directoryPrefix))) {
      return this.fileInfo(objectPath, 0, true)
    }
    return null
  }

  async listFiles(directoryPath = '/'): Promise<CloudFileInfo[]> {
    const prefix = `${directoryPath.replace(/\/+$/, '')}/`
    const children = new Map<string, CloudFileInfo>()
    for (const [objectPath, object] of this.objects) {
      if (!objectPath.startsWith(prefix)) continue
      const relative = objectPath.slice(prefix.length)
      const name = relative.split('/')[0]
      if (!name || children.has(name)) continue
      const childPath = `${prefix}${name}`
      const isDirectory = relative.includes('/')
      children.set(name, this.fileInfo(
        childPath,
        isDirectory ? 0 : object.data.length,
        isDirectory,
        isDirectory ? undefined : object.etag
      ))
    }
    if (children.size === 0 && !await this.getFileInfo(directoryPath)) throw new Error('404 not found')
    return [...children.values()]
  }

  private fileInfo(
    objectPath: string,
    size: number,
    isDirectory: boolean,
    etag?: string
  ): CloudFileInfo {
    return {
      name: objectPath.split('/').pop() || '',
      path: objectPath,
      size,
      isDirectory,
      modifiedAt: '2026-07-12T00:00:00.000Z',
      etag
    }
  }
}
