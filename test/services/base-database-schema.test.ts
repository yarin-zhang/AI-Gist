import { IDBFactory, IDBKeyRange } from 'fake-indexeddb'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BaseDatabaseService } from '~/lib/services/base-database.service'

class InspectableDatabaseService extends BaseDatabaseService {
  get connection(): IDBDatabase | null {
    return this.db
  }
}

function openDatabase(
  version?: number,
  upgrade?: (db: IDBDatabase, transaction: IDBTransaction) => void
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = version === undefined
      ? indexedDB.open('AIGistDB')
      : indexedDB.open('AIGistDB', version)
    request.onupgradeneeded = () => {
      if (request.transaction) {
        upgrade?.(request.result, request.transaction)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function waitForTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

describe('BaseDatabaseService schema health and upgrades', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory()
    globalThis.IDBKeyRange = IDBKeyRange
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  it('creates the complete v12 schema, including exact key paths and unique flags', async () => {
    const service = new InspectableDatabaseService()
    await service.initialize()

    const health = await service.checkDatabaseHealth()

    expect(health).toMatchObject({
      healthy: true,
      currentVersion: 12,
      needsRepair: false,
      missingStores: [],
      schemaIssues: []
    })

    const db = service.connection!
    const transaction = db.transaction(['categories', 'ai_configs', 'syncMetadata'], 'readonly')
    expect(transaction.objectStore('categories').keyPath).toBe('id')
    expect(transaction.objectStore('categories').index('name')).toMatchObject({
      keyPath: 'name',
      unique: true
    })
    expect(transaction.objectStore('ai_configs').index('configId')).toMatchObject({
      keyPath: 'configId',
      unique: true
    })
    expect(transaction.objectStore('syncMetadata').keyPath).toBe('key')
    service.close()
  })

  it('reports store keyPath, index keyPath, and unique mismatches instead of only checking names', async () => {
    const malformed = await openDatabase(12, db => {
      const categories = db.createObjectStore('categories', { keyPath: 'uuid' })
      categories.createIndex('name', 'label', { unique: false })
    })
    malformed.close()

    const service = new InspectableDatabaseService()
    await service.initialize()
    const health = await service.checkDatabaseHealth()

    expect(health.healthy).toBe(false)
    expect(health.missingStores).toContain('prompts')
    expect(health.schemaIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'store-key-path',
        storeName: 'categories',
        expected: '"id"',
        actual: '"uuid"',
        repairableDuringUpgrade: false
      }),
      expect.objectContaining({
        kind: 'index-key-path',
        storeName: 'categories',
        indexName: 'name',
        expected: '"name"',
        actual: '"label"'
      }),
      expect.objectContaining({
        kind: 'index-unique',
        storeName: 'categories',
        indexName: 'name',
        expected: 'true',
        actual: 'false'
      }),
      expect.objectContaining({
        kind: 'missing-index',
        storeName: 'categories',
        indexName: 'uuid'
      })
    ]))
    service.close()
  })

  it('fills missing indexes on existing stores during a real version upgrade', async () => {
    const oldDb = await openDatabase(11, db => {
      db.createObjectStore('categories', { keyPath: 'id', autoIncrement: true })
    })
    const write = oldDb.transaction('categories', 'readwrite')
    write.objectStore('categories').add({
      name: 'Existing category',
      uuid: 'existing-category'
    })
    await waitForTransaction(write)
    oldDb.close()

    const service = new InspectableDatabaseService()
    await service.initialize()

    const categories = service.connection!
      .transaction('categories', 'readonly')
      .objectStore('categories')
    expect(categories.index('name')).toMatchObject({ keyPath: 'name', unique: true })
    expect(categories.index('uuid')).toMatchObject({ keyPath: 'uuid', unique: true })
    expect(await service.checkDatabaseHealth()).toMatchObject({ healthy: true, schemaIssues: [] })
    service.close()
  })

  it('aborts unique-index creation with actionable duplicate diagnostics and preserves all records', async () => {
    const oldDb = await openDatabase(11, db => {
      db.createObjectStore('categories', { keyPath: 'id', autoIncrement: true })
    })
    const write = oldDb.transaction('categories', 'readwrite')
    write.objectStore('categories').add({ id: 1, name: 'Duplicate', uuid: 'category-a' })
    write.objectStore('categories').add({ id: 2, name: 'Duplicate', uuid: 'category-b' })
    await waitForTransaction(write)
    oldDb.close()

    const service = new InspectableDatabaseService()
    await expect(service.initialize()).rejects.toThrow(
      /DATABASE_UNIQUE_INDEX_DUPLICATE.*categories\.name.*主键 1 与 2.*数据保持原状/
    )

    const preservedDb = await openDatabase()
    expect(preservedDb.version).toBe(11)
    const readRequest = preservedDb.transaction('categories', 'readonly').objectStore('categories').getAll()
    const records = await new Promise<any[]>((resolve, reject) => {
      readRequest.onsuccess = () => resolve(readRequest.result)
      readRequest.onerror = () => reject(readRequest.error)
    })
    expect(records).toHaveLength(2)
    preservedDb.close()
  })

  it('never deletes a malformed current-version database during repair', async () => {
    const malformed = await openDatabase(12, db => {
      db.createObjectStore('categories', { keyPath: 'id', autoIncrement: true })
    })
    malformed.close()
    const deleteSpy = vi.spyOn(indexedDB, 'deleteDatabase')

    const service = new InspectableDatabaseService()
    await service.initialize()
    const result = await service.repairDatabase()

    expect(result).toMatchObject({ success: false })
    expect(result.message).toContain('DATABASE_SCHEMA_REPAIR_REQUIRES_UPGRADE')
    expect(result.message).toContain('未删除任何数据')
    expect(deleteSpy).not.toHaveBeenCalled()
    service.close()
  })

  it('returns an actionable error when another connection blocks an upgrade', async () => {
    const blocker = await openDatabase(11, db => {
      db.createObjectStore('categories', { keyPath: 'id', autoIncrement: true })
    })
    const service = new InspectableDatabaseService()

    await expect(service.initialize()).rejects.toThrow(
      /DATABASE_UPGRADE_BLOCKED.*从版本 11 升级到 12.*关闭其他应用窗口/
    )

    blocker.close()
    await new Promise(resolve => setTimeout(resolve, 0))
    service.close()
  })

  it('closes and resets the active connection on versionchange', async () => {
    const service = new InspectableDatabaseService()
    await service.initialize()
    expect(service.connection).not.toBeNull()

    const newerDb = await openDatabase(13)
    expect(service.connection).toBeNull()
    newerDb.close()
  })
})
