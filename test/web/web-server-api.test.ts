/**
 * @vitest-environment node
 */

import http from 'http'
import fsp from 'fs/promises'
import path from 'path'
import type { AddressInfo } from 'net'
import { afterEach, describe, expect, it } from 'vitest'
import { TestWebDAVServer } from '../helpers/webdav-server'
import {
  createCloudSyncDataChecksum,
  createCloudSyncSnapshot,
  type CloudSyncDataSet
} from '@shared/cloud-sync-engine'
import { createBackupPayload } from '@shared/backup-integrity'
import {
  getCloudSyncSnapshotPath,
  getCloudSyncV2DirectoryPath,
  getCloudSyncV2ManifestPath
} from '@shared/cloud-backup-paths'

const webServerModule = await import('../../scripts/web-server.js')
const createWebRequestHandler = (
  webServerModule.createWebRequestHandler ||
  webServerModule.default.createWebRequestHandler
) as typeof webServerModule.createWebRequestHandler

describe('web server API handler', () => {
  let server: http.Server | null = null
  let webdavServer: TestWebDAVServer | null = null

  afterEach(async () => {
    if (!server) {
      if (webdavServer) {
        await webdavServer.stop()
        webdavServer = null
      }
      return
    }

    await new Promise<void>(resolve => server!.close(() => resolve()))
    server = null
    if (webdavServer) {
      await webdavServer.stop()
      webdavServer = null
    }
  })

  it('serves WebDAV proxy capabilities through the reusable Vite middleware handler', async () => {
    server = http.createServer(createWebRequestHandler({ serveStaticFiles: false }))
    await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', () => resolve()))
    const address = server.address() as AddressInfo

    const response = await fetch(`http://127.0.0.1:${address.port}/api/capabilities`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: '{}'
    })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toMatchObject({
      success: true,
      data: {
        webBackend: true,
        webdavProxy: true
      }
    })
  })

  it('proxies the full WebDAV cloud sync manifest and snapshot API without 404s', async () => {
    webdavServer = new TestWebDAVServer({
      port: 18768,
      username: 'testuser',
      password: 'testpass'
    })
    await webdavServer.start()
    server = http.createServer(createWebRequestHandler({ serveStaticFiles: false }))
    await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', () => resolve()))
    const address = server.address() as AddressInfo
    const apiBaseUrl = `http://127.0.0.1:${address.port}`
    const config = {
      id: 'web-proxy-sync-e2e',
      name: 'Web Proxy WebDAV',
      type: 'webdav',
      url: `${webdavServer.baseUrl}/web-proxy-sync-e2e`,
      username: 'testuser',
      password: 'testpass',
      createdAt: '2026-06-13T20:00:00.000Z',
      updatedAt: '2026-06-13T20:00:00.000Z'
    }
    const data = createWebSyncDataSet()
    const snapshot = createCloudSyncSnapshot(data, 'web-device-a', 'web-proxy-rev-1')
    const manifest = {
      kind: 'ai-gist-cloud-sync-manifest',
      schemaVersion: 1,
      updatedAt: '2026-06-13T20:01:00.000Z',
      latestSnapshot: snapshot,
      baseSnapshot: snapshot,
      devices: {
        'web-device-a': {
          deviceId: 'web-device-a',
          deviceName: 'Web Browser A',
          platform: 'web',
          lastSyncAt: '2026-06-13T20:01:00.000Z',
          lastKnownRevision: snapshot.revision
        }
      },
      conflicts: []
    }
    const backupPayload = createBackupPayload({
      id: 'web-proxy-backup-1',
      name: 'backup-web-proxy-backup-1',
      createdAt: '2026-06-13T20:00:00.000Z',
      data,
      backupType: 'automatic',
      dataChecksum: createCloudSyncDataChecksum(data)
    })

    const writtenBackup = await postApi(apiBaseUrl, '/api/cloud/webdav/write-backup', {
      config,
      fileName: 'backup-web-proxy-backup-1.json',
      backupData: backupPayload
    })
    expect(writtenBackup).toMatchObject({
      status: 200,
      payload: {
        success: true,
        data: {
          id: backupPayload.id,
          checksum: backupPayload.checksum,
          cloudPath: '/AI-Gist-Backup/backup-web-proxy-backup-1.json'
        }
      }
    })

    const emptyManifest = await postApi(apiBaseUrl, '/api/cloud/webdav/get-sync-manifest', { config })
    expect(emptyManifest.status).toBe(200)
    expect(emptyManifest.payload).toMatchObject({
      success: true,
      data: {
        kind: 'ai-gist-cloud-sync-manifest',
        schemaVersion: 1
      }
    })
    expect(emptyManifest.payload.data.latestSnapshot).toBeUndefined()

    const savedSnapshot = await postApi(apiBaseUrl, '/api/cloud/webdav/save-sync-snapshot', {
      config,
      snapshot
    })
    expect(savedSnapshot.status).toBe(200)
    expect(savedSnapshot.payload).toMatchObject({ success: true, data: { ok: true } })

    const listedSnapshots = await postApi(apiBaseUrl, '/api/cloud/webdav/list-sync-snapshots', { config })
    expect(listedSnapshots.status).toBe(200)
    expect(listedSnapshots.payload.data).toEqual([expect.objectContaining({
      revision: snapshot.revision,
      path: getCloudSyncSnapshotPath(snapshot.revision)
    })])

    const loadedSnapshot = await postApi(apiBaseUrl, '/api/cloud/webdav/read-sync-snapshot', {
      config,
      snapshot: snapshot.revision
    })
    expect(loadedSnapshot.status).toBe(200)
    expect(loadedSnapshot.payload.data).toMatchObject({
      revision: snapshot.revision,
      dataChecksum: createCloudSyncDataChecksum(data)
    })
    expect(loadedSnapshot.payload.data.data.prompts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uuid: 'web-prompt-main',
        title: 'Web 端代理同步提示词',
        imageBlobs: [WEB_IMAGE]
      })
    ]))
    expect(loadedSnapshot.payload.data.data.promptHistories).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uuid: 'web-history-main',
        promptUuid: 'web-prompt-main',
        imageBlobs: [WEB_IMAGE]
      })
    ]))

    const savedManifest = await postApi(apiBaseUrl, '/api/cloud/webdav/save-sync-manifest', {
      config,
      manifest,
      options: { expectedRevision: null }
    })
    expect(savedManifest.status).toBe(200)
    expect(savedManifest.payload).toMatchObject({ success: true, data: { ok: true } })

    const loadedManifest = await postApi(apiBaseUrl, '/api/cloud/webdav/get-sync-manifest', { config })
    expect(loadedManifest.status).toBe(200)
    expect(loadedManifest.payload.data.latestSnapshot).toMatchObject({
      revision: snapshot.revision,
      dataChecksum: createCloudSyncDataChecksum(data)
    })
    expect(loadedManifest.payload.data.latestSnapshot.data.prompts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uuid: 'web-prompt-main',
        imageBlobs: [WEB_IMAGE]
      })
    ]))
    expect(loadedManifest.payload.data.latestSnapshot.data.promptHistories).toEqual(expect.arrayContaining([
      expect.objectContaining({
        uuid: 'web-history-main',
        imageBlobs: [WEB_IMAGE]
      })
    ]))

    const manifestFile = JSON.parse(await fsp.readFile(
      path.join(webdavServer.rootDir, 'web-proxy-sync-e2e', 'AI-Gist-Backup', 'sync-manifest.json'),
      'utf-8'
    ))
    const backupManifestFile = JSON.parse(await fsp.readFile(
      path.join(webdavServer.rootDir, 'web-proxy-sync-e2e', 'AI-Gist-Backup', 'sync-manifest.backup.json'),
      'utf-8'
    ))
    const snapshotFile = JSON.parse(await fsp.readFile(
      path.join(webdavServer.rootDir, 'web-proxy-sync-e2e', getCloudSyncSnapshotPath(snapshot.revision)),
      'utf-8'
    ))
    expect(manifestFile.latestSnapshot.revision).toBe(snapshot.revision)
    expect(backupManifestFile.latestSnapshot.revision).toBe(snapshot.revision)
    expect(snapshotFile.kind).toBe('ai-gist-cloud-sync-snapshot')
    expect(snapshotFile.snapshot.data.prompts[0].imageBlobs).toEqual([WEB_IMAGE])

    const deletedSnapshot = await postApi(apiBaseUrl, '/api/cloud/webdav/delete-sync-snapshot', {
      config,
      snapshot: snapshot.revision
    })
    const deletedSnapshotAgain = await postApi(apiBaseUrl, '/api/cloud/webdav/delete-sync-snapshot', {
      config,
      snapshot: snapshot.revision
    })
    const snapshotsAfterDelete = await postApi(apiBaseUrl, '/api/cloud/webdav/list-sync-snapshots', { config })
    expect(deletedSnapshot).toMatchObject({ status: 200, payload: { success: true } })
    expect(deletedSnapshotAgain).toMatchObject({ status: 200, payload: { success: true } })
    expect(snapshotsAfterDelete.payload.data).toEqual([])

    const rejectedDelete = await postApi(apiBaseUrl, '/api/cloud/webdav/delete-backup', {
      config,
      cloudPath: '/outside/backup-escape.json'
    })
    expect(rejectedDelete.status).toBe(500)
    expect(rejectedDelete.payload.error).toContain('命名空间')

    const deletedBackup = await postApi(apiBaseUrl, '/api/cloud/webdav/delete-backup', {
      config,
      cloudPath: writtenBackup.payload.data.cloudPath
    })
    const deletedBackupAgain = await postApi(apiBaseUrl, '/api/cloud/webdav/delete-backup', {
      config,
      cloudPath: writtenBackup.payload.data.cloudPath
    })
    expect(deletedBackup).toMatchObject({ status: 200, payload: { success: true } })
    expect(deletedBackupAgain).toMatchObject({ status: 200, payload: { success: true } })
  })

  it('uses the newer backup manifest in the WebDAV proxy before accepting writes', async () => {
    webdavServer = new TestWebDAVServer({
      port: 18769,
      username: 'testuser',
      password: 'testpass'
    })
    await webdavServer.start()
    server = http.createServer(createWebRequestHandler({ serveStaticFiles: false }))
    await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', () => resolve()))
    const address = server.address() as AddressInfo
    const apiBaseUrl = `http://127.0.0.1:${address.port}`
    const storageDir = path.join(webdavServer.rootDir, 'web-proxy-newer-backup')
    const backupDir = path.join(storageDir, 'AI-Gist-Backup')
    const config = {
      id: 'web-proxy-newer-backup',
      name: 'Web Proxy Newer Backup',
      type: 'webdav',
      url: `${webdavServer.baseUrl}/web-proxy-newer-backup`,
      username: 'testuser',
      password: 'testpass',
      createdAt: '2026-06-13T21:00:00.000Z',
      updatedAt: '2026-06-13T21:00:00.000Z'
    }
    const oldData = createWebSyncDataSet({
      promptTitle: 'Web 端主 manifest 旧标题',
      settingValue: 'old-primary'
    })
    const newerData = createWebSyncDataSet({
      promptTitle: 'Web 端备份 manifest 较新标题',
      settingValue: 'newer-backup'
    })
    const stalePrimarySnapshot = {
      ...createCloudSyncSnapshot(oldData, 'web-device-a', 'web-proxy-primary-old'),
      createdAt: '2026-06-13T20:50:00.000Z'
    }
    const newerBackupSnapshot = {
      ...createCloudSyncSnapshot(newerData, 'web-device-b', 'web-proxy-backup-newer'),
      createdAt: '2026-06-13T21:10:00.000Z'
    }
    const stalePrimaryManifest = createWebManifest(stalePrimarySnapshot, {
      updatedAt: '2026-06-13T21:00:00.000Z',
      deviceId: 'web-device-a'
    })
    const newerBackupManifest = createWebManifest(newerBackupSnapshot, {
      updatedAt: '2026-06-13T20:55:00.000Z',
      deviceId: 'web-device-b'
    })

    await fsp.mkdir(backupDir, { recursive: true })
    await fsp.writeFile(
      path.join(backupDir, 'sync-manifest.json'),
      JSON.stringify(stalePrimaryManifest, null, 2),
      'utf-8'
    )
    await fsp.writeFile(
      path.join(backupDir, 'sync-manifest.backup.json'),
      JSON.stringify(newerBackupManifest, null, 2),
      'utf-8'
    )

    const loadedManifest = await postApi(apiBaseUrl, '/api/cloud/webdav/get-sync-manifest', { config })
    expect(loadedManifest.status).toBe(200)
    expect(loadedManifest.payload.data.latestSnapshot).toMatchObject({
      revision: newerBackupSnapshot.revision,
      dataChecksum: createCloudSyncDataChecksum(newerData)
    })
    expect(loadedManifest.payload.data.latestSnapshot.data.prompts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        title: 'Web 端备份 manifest 较新标题'
      })
    ]))
    expect(loadedManifest.payload.data.latestSnapshot.data.settings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'theme',
        value: 'newer-backup'
      })
    ]))

    const attemptedOverwrite = await postApi(apiBaseUrl, '/api/cloud/webdav/save-sync-manifest', {
      config,
      manifest: createWebManifest(
        createCloudSyncSnapshot(createWebSyncDataSet({
          promptTitle: '错误覆盖旧主 manifest',
          settingValue: 'bad-overwrite'
        }), 'web-device-a', 'web-proxy-bad-overwrite'),
        {
          updatedAt: '2026-06-13T21:11:00.000Z',
          deviceId: 'web-device-a'
        }
      ),
      options: { expectedRevision: stalePrimarySnapshot.revision }
    })
    expect(attemptedOverwrite.status).toBe(500)
    expect(attemptedOverwrite.payload).toMatchObject({
      success: false
    })
    expect(attemptedOverwrite.payload.error).toContain('web-proxy-backup-newer')

    const primaryAfterRejectedWrite = JSON.parse(await fsp.readFile(
      path.join(backupDir, 'sync-manifest.json'),
      'utf-8'
    ))
    const backupAfterRejectedWrite = JSON.parse(await fsp.readFile(
      path.join(backupDir, 'sync-manifest.backup.json'),
      'utf-8'
    ))
    expect(primaryAfterRejectedWrite.latestSnapshot.revision).toBe(stalePrimarySnapshot.revision)
    expect(backupAfterRejectedWrite.latestSnapshot.revision).toBe(newerBackupSnapshot.revision)
  })

  it('provides a namespace-restricted binary sync-v2 transport with CAS semantics', async () => {
    webdavServer = new TestWebDAVServer({
      port: 18770,
      username: 'testuser',
      password: 'testpass'
    })
    await webdavServer.start()
    server = http.createServer(createWebRequestHandler({ serveStaticFiles: false }))
    await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', () => resolve()))
    const address = server.address() as AddressInfo
    const apiBaseUrl = `http://127.0.0.1:${address.port}`
    const config = {
      id: 'web-proxy-sync-v2',
      name: 'Web Proxy sync-v2',
      type: 'webdav',
      url: `${webdavServer.baseUrl}/web-proxy-sync-v2`,
      username: 'testuser',
      password: 'testpass',
      createdAt: '2026-07-11T00:00:00.000Z',
      updatedAt: '2026-07-11T00:00:00.000Z'
    }
    const objectPath = getCloudSyncV2ManifestPath().replace(/^\/+/, '')
    const firstBytes = Buffer.from([0, 1, 2, 127, 128, 254, 255, 10, 13])

    const firstWrite = await postApi(apiBaseUrl, '/api/cloud/webdav/sync-v2/write', {
      config,
      path: objectPath,
      dataBase64: firstBytes.toString('base64'),
      ifNoneMatch: '*'
    })
    expect(firstWrite).toMatchObject({
      status: 200,
      payload: { success: true, data: { status: 'written' } }
    })
    const firstEtag = firstWrite.payload.data.etag as string
    expect(firstEtag).toBeTruthy()

    const stat = await postApi(apiBaseUrl, '/api/cloud/webdav/sync-v2/stat', { config, path: objectPath })
    expect(stat.payload.data).toMatchObject({
      path: getCloudSyncV2ManifestPath(),
      etag: firstEtag,
      byteLength: firstBytes.byteLength,
      isDirectory: false
    })

    const read = await postApi(apiBaseUrl, '/api/cloud/webdav/sync-v2/read', { config, path: objectPath })
    expect(Buffer.from(read.payload.data.dataBase64, 'base64')).toEqual(firstBytes)
    expect(read.payload.data.etag).toBe(firstEtag)

    const rejectedCreate = await postApi(apiBaseUrl, '/api/cloud/webdav/sync-v2/write', {
      config,
      path: objectPath,
      dataBase64: Buffer.from('must-not-win').toString('base64'),
      ifNoneMatch: '*'
    })
    expect(rejectedCreate.payload.data).toMatchObject({
      status: 'precondition_failed',
      etag: firstEtag
    })

    const rejectedReplace = await postApi(apiBaseUrl, '/api/cloud/webdav/sync-v2/write', {
      config,
      path: objectPath,
      dataBase64: Buffer.from('wrong-etag').toString('base64'),
      ifMatch: '"wrong-etag"'
    })
    expect(rejectedReplace.payload.data.status).toBe('precondition_failed')

    const nextBytes = Buffer.from('replacement-with-a-different-length\0\xff', 'latin1')
    const replaced = await postApi(apiBaseUrl, '/api/cloud/webdav/sync-v2/write', {
      config,
      path: objectPath,
      dataBase64: nextBytes.toString('base64'),
      ifMatch: firstEtag
    })
    expect(replaced.payload.data.status).toBe('written')
    expect(replaced.payload.data.etag).not.toBe(firstEtag)

    const listed = await postApi(apiBaseUrl, '/api/cloud/webdav/sync-v2/list', {
      config,
      prefix: getCloudSyncV2DirectoryPath().replace(/^\/+/, '')
    })
    expect(listed.payload.data).toEqual([expect.objectContaining({
      path: getCloudSyncV2ManifestPath(),
      byteLength: nextBytes.byteLength
    })])

    for (const unsafePath of [
      '/AI-Gist-Backup/sync-v2/manifest.json',
      'AI-Gist-Backup/sync-v2/../sync-manifest.json',
      'AI-Gist-Backup/sync-v2/%2e%2e/sync-manifest.json',
      'AI-Gist-Backup/other/manifest.json',
      'C:\\AI-Gist-Backup\\sync-v2\\manifest.json'
    ]) {
      const response = await postApi(apiBaseUrl, '/api/cloud/webdav/sync-v2/read', {
        config,
        path: unsafePath
      })
      expect(response.status).toBe(500)
      expect(response.payload.success).toBe(false)
    }

    const deleted = await postApi(apiBaseUrl, '/api/cloud/webdav/sync-v2/delete', { config, path: objectPath })
    expect(deleted.payload).toMatchObject({ success: true, data: { ok: true } })
    const missing = await postApi(apiBaseUrl, '/api/cloud/webdav/sync-v2/read', { config, path: objectPath })
    expect(missing.payload).toMatchObject({ success: true, data: null })

    await expect(fsp.stat(path.join(
      webdavServer.rootDir,
      'web-proxy-sync-v2',
      'AI-Gist-Backup',
      'sync-manifest.json'
    ))).rejects.toThrow()
  })
})

const WEB_IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAADUlEQVR42mP8z8BQDwAFgwJ/lZ2nNwAAAABJRU5ErkJggg=='

async function postApi(apiBaseUrl: string, pathname: string, body: unknown) {
  const response = await fetch(`${apiBaseUrl}${pathname}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })
  return {
    status: response.status,
    payload: await response.json()
  }
}

function createWebManifest(
  snapshot: ReturnType<typeof createCloudSyncSnapshot>,
  options: { updatedAt: string; deviceId: string }
) {
  return {
    kind: 'ai-gist-cloud-sync-manifest',
    schemaVersion: 1,
    updatedAt: options.updatedAt,
    latestSnapshot: snapshot,
    baseSnapshot: snapshot,
    devices: {
      [options.deviceId]: {
        deviceId: options.deviceId,
        deviceName: 'Web Browser',
        platform: 'web',
        lastSyncAt: options.updatedAt,
        lastKnownRevision: snapshot.revision
      }
    },
    conflicts: []
  }
}

function createWebSyncDataSet(input: {
  promptTitle?: string
  settingValue?: string
} = {}): CloudSyncDataSet {
  return {
    categories: [{
      id: 1,
      uuid: 'web-category-main',
      name: 'Web 端代理同步分类',
      isActive: true,
      sortOrder: 1,
      createdAt: '2026-06-13T20:00:00.000Z',
      updatedAt: '2026-06-13T20:00:00.000Z'
    }],
    prompts: [{
      id: 10,
      uuid: 'web-prompt-main',
      title: input.promptTitle || 'Web 端代理同步提示词',
      content: '请用 {{topic}} 生成网页端同步验证内容',
      categoryId: 1,
      categoryUuid: 'web-category-main',
      tags: ['web', 'webdav', 'proxy'],
      isFavorite: true,
      useCount: 2,
      isActive: true,
      imageBlobs: [WEB_IMAGE],
      createdAt: '2026-06-13T20:00:00.000Z',
      updatedAt: '2026-06-13T20:00:00.000Z'
    }],
    promptVariables: [{
      id: 20,
      uuid: 'web-variable-topic',
      promptId: 10,
      promptUuid: 'web-prompt-main',
      name: 'topic',
      type: 'text',
      defaultValue: 'cloud sync',
      required: true,
      sortOrder: 1,
      createdAt: '2026-06-13T20:00:00.000Z',
      updatedAt: '2026-06-13T20:00:00.000Z'
    }],
    promptHistories: [{
      id: 30,
      uuid: 'web-history-main',
      promptId: 10,
      promptUuid: 'web-prompt-main',
      title: 'Web 端代理同步提示词',
      content: '网页端第一次同步历史',
      result: 'Web proxy generated result',
      version: 1,
      imageBlobs: [WEB_IMAGE],
      createdAt: '2026-06-13T20:01:00.000Z',
      updatedAt: '2026-06-13T20:01:00.000Z'
    }],
    aiConfigs: [],
    quickOptimizationConfigs: [],
    aiHistory: [{
      id: 40,
      uuid: 'web-ai-history-main',
      promptUuid: 'web-prompt-main',
      input: '网页端生成',
      output: '网页端代理同步结果',
      provider: 'openai',
      model: 'gpt-4.1',
      createdAt: '2026-06-13T20:02:00.000Z',
      updatedAt: '2026-06-13T20:02:00.000Z'
    }],
    settings: [{
      key: 'theme',
      value: input.settingValue || 'dark',
      type: 'string',
      updatedAt: '2026-06-13T20:00:00.000Z'
    }],
    syncTombstones: []
  }
}
