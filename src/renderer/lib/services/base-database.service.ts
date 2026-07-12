/**
 * 基础数据库服务类
 * 提供IndexedDB的基础操作和连接管理
 */

import { generateUUID } from '../utils/uuid';
import { emitDataChange } from './data-change-events';
import type { SyncTombstone } from '@shared/types/database';
import { getCloudSyncRecordKey } from '@shared/cloud-sync-engine';

const SYNC_TOMBSTONE_STORE = 'syncTombstones';
const LOCAL_SYNC_METADATA_STORE = 'syncMetadata';
const DATABASE_DEBUG_STORAGE_KEY = 'ai-gist.debug.database';

interface DatabaseIndexSchema {
  keyPath: string | string[];
  unique: boolean;
}

interface DatabaseStoreSchema {
  keyPath: string | string[];
  autoIncrement?: boolean;
  indexes: Record<string, DatabaseIndexSchema>;
}

export interface DatabaseSchemaIssue {
  kind: 'missing-store' | 'store-key-path' | 'missing-index' | 'index-key-path' | 'index-unique';
  storeName: string;
  indexName?: string;
  expected: string;
  actual: string;
  repairableDuringUpgrade: boolean;
}

export interface DatabaseHealthStatus {
  healthy: boolean;
  missingStores: string[];
  currentVersion: number;
  needsRepair: boolean;
  schemaIssues: DatabaseSchemaIssue[];
}

const DATABASE_SCHEMA: Record<string, DatabaseStoreSchema> = {
  categories: {
    keyPath: 'id',
    autoIncrement: true,
    indexes: {
      name: { keyPath: 'name', unique: true },
      uuid: { keyPath: 'uuid', unique: true }
    }
  },
  prompts: {
    keyPath: 'id',
    autoIncrement: true,
    indexes: {
      categoryId: { keyPath: 'categoryId', unique: false },
      isFavorite: { keyPath: 'isFavorite', unique: false },
      title: { keyPath: 'title', unique: false },
      tags: { keyPath: 'tags', unique: false },
      useCount: { keyPath: 'useCount', unique: false },
      createdAt: { keyPath: 'createdAt', unique: false },
      updatedAt: { keyPath: 'updatedAt', unique: false },
      uuid: { keyPath: 'uuid', unique: true }
    }
  },
  promptVariables: {
    keyPath: 'id',
    autoIncrement: true,
    indexes: {
      promptId: { keyPath: 'promptId', unique: false },
      name: { keyPath: 'name', unique: false },
      uuid: { keyPath: 'uuid', unique: true }
    }
  },
  promptHistories: {
    keyPath: 'id',
    autoIncrement: true,
    indexes: {
      promptId: { keyPath: 'promptId', unique: false },
      version: { keyPath: 'version', unique: false },
      uuid: { keyPath: 'uuid', unique: true }
    }
  },
  ai_configs: {
    keyPath: 'id',
    autoIncrement: true,
    indexes: {
      configId: { keyPath: 'configId', unique: true },
      type: { keyPath: 'type', unique: false },
      enabled: { keyPath: 'enabled', unique: false },
      isPreferred: { keyPath: 'isPreferred', unique: false },
      uuid: { keyPath: 'uuid', unique: true }
    }
  },
  quick_optimization_configs: {
    keyPath: 'id',
    autoIncrement: true,
    indexes: {
      name: { keyPath: 'name', unique: false },
      enabled: { keyPath: 'enabled', unique: false },
      sortOrder: { keyPath: 'sortOrder', unique: false },
      uuid: { keyPath: 'uuid', unique: true }
    }
  },
  ai_generation_history: {
    keyPath: 'id',
    autoIncrement: true,
    indexes: {
      historyId: { keyPath: 'historyId', unique: true },
      configId: { keyPath: 'configId', unique: false },
      status: { keyPath: 'status', unique: false },
      createdAt: { keyPath: 'createdAt', unique: false },
      uuid: { keyPath: 'uuid', unique: true }
    }
  },
  settings: {
    keyPath: 'id',
    autoIncrement: true,
    indexes: {
      key: { keyPath: 'key', unique: true }
    }
  },
  [SYNC_TOMBSTONE_STORE]: {
    keyPath: 'id',
    autoIncrement: true,
    indexes: {
      storeName: { keyPath: 'storeName', unique: false },
      collectionName: { keyPath: 'collectionName', unique: false },
      recordKey: { keyPath: 'recordKey', unique: false },
      deletedAt: { keyPath: 'deletedAt', unique: false }
    }
  },
  [LOCAL_SYNC_METADATA_STORE]: {
    keyPath: 'key',
    indexes: {}
  }
};

const SYNC_COLLECTION_BY_STORE: Record<string, string> = {
  categories: 'categories',
  prompts: 'prompts',
  promptVariables: 'promptVariables',
  promptHistories: 'promptHistories',
  ai_configs: 'aiConfigs',
  quick_optimization_configs: 'quickOptimizationConfigs',
  ai_generation_history: 'aiHistory',
  settings: 'settings'
};

/**
 * IndexedDB 基础数据库服务类
 * 负责数据库的初始化、连接管理以及通用的CRUD操作
 */
export class BaseDatabaseService {
  protected db: IDBDatabase | null = null;
  protected readonly dbName = 'AIGistDB';
  protected readonly dbVersion = 12; // 增加本地同步元数据存储，避免 localStorage 容量降级
  protected initializationPromise: Promise<void> | null = null;
  protected isInitialized = false;
  private currentDbVersion = 12; // 添加一个可变的版本号变量

  /**
   * 初始化数据库连接
   * 创建或升级数据库结构，设置所有必要的对象存储和索引
   * @returns Promise<void> 初始化完成的Promise
   */
  async initialize(): Promise<void> {
    // 如果已经有初始化 Promise，直接返回
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    // 如果已经初始化完成，直接返回
    if (this.isInitialized && this.db) {
      return Promise.resolve();
    }

    // 创建初始化 Promise
    this.initializationPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.currentDbVersion);
      let settled = false;
      let upgradeFailure: Error | null = null;

      const rejectInitialization = (error: Error) => {
        if (settled) {
          return;
        }
        settled = true;
        this.initializationPromise = null;
        reject(error);
      };

      request.onerror = () => {
        const cause = upgradeFailure?.message || request.error?.message || '未知错误';
        const error = new Error(`[DATABASE_OPEN_FAILED] 无法打开数据库 ${this.dbName} v${this.currentDbVersion}: ${cause}`);
        console.error(error.message, request.error);
        rejectInitialization(error);
      };

      request.onblocked = (event) => {
        const error = new Error(
          `[DATABASE_UPGRADE_BLOCKED] 数据库 ${this.dbName} 从版本 ${event.oldVersion} ` +
          `升级到 ${event.newVersion ?? this.currentDbVersion} 被其他窗口或旧连接阻塞，请关闭其他应用窗口后重试`
        );
        console.error(error.message);
        rejectInitialization(error);
      };

      request.onsuccess = (event) => {
        const openedDb = (event.target as IDBOpenDBRequest).result;
        if (settled) {
          openedDb.close();
          return;
        }

        this.db = openedDb;
        this.db.onversionchange = (versionEvent) => {
          console.warn(
            `[DATABASE_VERSION_CHANGE] 数据库 ${this.dbName} 收到版本变更通知: ` +
            `${versionEvent.oldVersion} -> ${versionEvent.newVersion ?? 'deleted'}，当前连接已安全关闭`
          );
          this.close();
        };
        this.isInitialized = true;
        settled = true;
        console.log('Database initialized successfully');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        console.log('Database upgrade needed');
        const db = (event.target as IDBOpenDBRequest).result;
        const transaction = (event.target as IDBOpenDBRequest).transaction;
        
        console.log(`数据库升级: 从版本 ${event.oldVersion} 到版本 ${event.newVersion}`);
        console.log('现有对象存储:', Array.from(db.objectStoreNames));
        
        try {
          if (!transaction) {
            throw new Error('[DATABASE_UPGRADE_NO_TRANSACTION] 数据库升级事务不存在');
          }

          // 确保创建所有必要的对象存储，并修复既有 store 的索引定义。
          this.createObjectStores(db, transaction, error => {
            if (!upgradeFailure) {
              upgradeFailure = error;
              console.error(error.message);
            }
            try {
              transaction.abort();
            } catch {
              // 事务可能已由 IndexedDB 自动中止。
            }
          });
        } catch (error) {
          upgradeFailure = error instanceof Error ? error : new Error(String(error));
          console.error('数据库 schema 升级失败:', upgradeFailure);
          try {
            transaction?.abort();
          } catch {
            // 事务可能已由 IndexedDB 自动中止。
          }
        }
        
        // 等待事务完成
        if (transaction) {
          transaction.oncomplete = () => {
            console.log('数据库升级事务完成');
            console.log('升级后的对象存储:', Array.from(db.objectStoreNames));
          };
          
          transaction.onerror = () => {
            console.error('数据库升级事务失败:', transaction.error);
          };
        }
      };
    });

    return this.initializationPromise;
  }

  /**
   * 创建所有必要的对象存储和索引
   * 在数据库升级时调用，定义数据库结构
   * @param db IDBDatabase 数据库实例
   */
  private createObjectStores(
    db: IDBDatabase,
    transaction: IDBTransaction,
    failUpgrade: (error: Error) => void
  ): void {
    console.log('开始创建对象存储...');
    for (const [storeName, schema] of Object.entries(DATABASE_SCHEMA)) {
      let store: IDBObjectStore;
      if (!db.objectStoreNames.contains(storeName)) {
        console.log(`创建 ${storeName} 对象存储`);
        store = db.createObjectStore(storeName, {
          keyPath: schema.keyPath,
          autoIncrement: schema.autoIncrement ?? false
        });
      } else {
        store = transaction.objectStore(storeName);
        if (!this.keyPathsEqual(store.keyPath, schema.keyPath)) {
          throw new Error(
            `[DATABASE_STORE_KEY_PATH_MISMATCH] ${storeName} 主键路径错误: ` +
            `期望 ${this.formatKeyPath(schema.keyPath)}，实际 ${this.formatKeyPath(store.keyPath)}；` +
            'IndexedDB 不支持原地修改 store 主键，请通过版本化数据迁移处理'
          );
        }
      }

      for (const [indexName, indexSchema] of Object.entries(schema.indexes)) {
        this.ensureIndexSchema(store, indexName, indexSchema, failUpgrade);
      }
    }

    console.log('对象存储 schema 检查完成，最终对象存储列表:', Array.from(db.objectStoreNames));
  }

  private ensureIndexSchema(
    store: IDBObjectStore,
    indexName: string,
    schema: DatabaseIndexSchema,
    failUpgrade: (error: Error) => void
  ): void {
    const exists = store.indexNames.contains(indexName);
    if (exists) {
      const existing = store.index(indexName);
      if (this.keyPathsEqual(existing.keyPath, schema.keyPath) && existing.unique === schema.unique) {
        return;
      }
    }

    const createIndex = () => {
      if (store.indexNames.contains(indexName)) {
        store.deleteIndex(indexName);
      }
      store.createIndex(indexName, schema.keyPath, { unique: schema.unique });
      console.log(`已修复索引 ${store.name}.${indexName}`);
    };

    if (!schema.unique) {
      createIndex();
      return;
    }

    this.scanForUniqueIndexDuplicates(store, indexName, schema.keyPath, createIndex, failUpgrade);
  }

  private scanForUniqueIndexDuplicates(
    store: IDBObjectStore,
    indexName: string,
    keyPath: string | string[],
    onSafe: () => void,
    onDuplicate: (error: Error) => void
  ): void {
    const seen = new Map<string, IDBValidKey>();
    const request = store.openCursor();

    request.onerror = () => {
      onDuplicate(new Error(
        `[DATABASE_UNIQUE_INDEX_SCAN_FAILED] 检查 ${store.name}.${indexName} 历史重复数据失败: ` +
        `${request.error?.message || '未知错误'}`
      ));
    };

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        onSafe();
        return;
      }

      const indexKey = this.readKeyPath(cursor.value, keyPath);
      if (this.isIndexableKey(indexKey)) {
        const fingerprint = this.serializeIndexedDbKey(indexKey);
        const firstPrimaryKey = seen.get(fingerprint);
        if (firstPrimaryKey !== undefined) {
          onDuplicate(new Error(
            `[DATABASE_UNIQUE_INDEX_DUPLICATE] 无法创建唯一索引 ${store.name}.${indexName}: ` +
            `键 ${this.formatDiagnosticKey(indexKey)} 在主键 ` +
            `${this.formatDiagnosticKey(firstPrimaryKey)} 与 ${this.formatDiagnosticKey(cursor.primaryKey)} 中重复；` +
            '数据保持原状，请先归并重复记录后重试升级'
          ));
          return;
        }
        seen.set(fingerprint, cursor.primaryKey);
      }

      cursor.continue();
    };
  }

  private readKeyPath(value: unknown, keyPath: string | string[]): unknown {
    if (Array.isArray(keyPath)) {
      const values = keyPath.map(path => this.readKeyPath(value, path));
      return values.some(item => item === undefined) ? undefined : values;
    }

    return keyPath.split('.').reduce<unknown>((current, segment) => {
      if (current === null || typeof current !== 'object') {
        return undefined;
      }
      return (current as Record<string, unknown>)[segment];
    }, value);
  }

  private isIndexableKey(value: unknown): value is IDBValidKey {
    if (typeof value === 'string') return true;
    if (typeof value === 'number') return Number.isFinite(value);
    if (value instanceof Date) return Number.isFinite(value.getTime());
    if (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) return true;
    if (ArrayBuffer.isView(value)) return true;
    return Array.isArray(value) && value.length > 0 && value.every(item => this.isIndexableKey(item));
  }

  private serializeIndexedDbKey(value: IDBValidKey): string {
    return JSON.stringify(this.normalizeIndexedDbKey(value));
  }

  private normalizeIndexedDbKey(value: IDBValidKey): unknown {
    if (typeof value === 'string') return ['string', value];
    if (typeof value === 'number') return ['number', Object.is(value, -0) ? 0 : value];
    if (value instanceof Date) return ['date', value.getTime()];
    if (Array.isArray(value)) return ['array', value.map(item => this.normalizeIndexedDbKey(item))];
    const bytes = value instanceof ArrayBuffer
      ? new Uint8Array(value)
      : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    return ['binary', Array.from(bytes)];
  }

  private keyPathsEqual(actual: string | string[] | null, expected: string | string[]): boolean {
    if (typeof actual === 'string' && typeof expected === 'string') {
      return actual === expected;
    }
    return Array.isArray(actual) && Array.isArray(expected) &&
      actual.length === expected.length && actual.every((item, index) => item === expected[index]);
  }

  private formatKeyPath(keyPath: string | string[] | null): string {
    return keyPath === null ? 'null' : JSON.stringify(keyPath);
  }

  private formatDiagnosticKey(key: unknown): string {
    if (key instanceof Date) return key.toISOString();
    if (key instanceof ArrayBuffer || ArrayBuffer.isView(key)) return '<binary-key>';
    const serialized = JSON.stringify(key);
    return serialized && serialized.length > 160 ? `${serialized.slice(0, 157)}...` : (serialized ?? String(key));
  }

  /**
   * 等待数据库初始化完成
   * 确保数据库已经准备好进行操作
   * @returns Promise<void> 初始化完成的Promise
   */
  async waitForInitialization(): Promise<void> {
    if (this.isInitialized && this.db) {
      return Promise.resolve();
    }
    
    if (this.initializationPromise) {
      return this.initializationPromise;
    }
    
    // 如果没有初始化过，启动初始化
    return this.initialize();
  }

  /**
   * 确保数据库已初始化并返回数据库实例
   * 内部方法，用于其他操作前的数据库状态检查
   * @returns Promise<IDBDatabase> 数据库实例
   * @throws Error 如果数据库初始化失败
   */
  protected async ensureDB(): Promise<IDBDatabase> {
    await this.waitForInitialization();
    
    if (!this.db) {
      throw new Error('Database failed to initialize');
    }
    
    return this.db;
  }

  /**
   * 通用的数据添加方法
   * 向指定的对象存储中添加新记录，自动添加时间戳
   * @param storeName string 对象存储名称
   * @param data Omit<T, 'id'> 要添加的数据（不包含id字段）
   * @returns Promise<T> 添加成功后的完整记录（包含生成的id）
   */
  protected async add<T>(storeName: string, data: Omit<T, 'id'>): Promise<T> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      let result: T | undefined;
      let settled = false;
      
      const now = new Date();
      
      // 深度克隆数据以确保可序列化
      const cleanData = this.cleanDataForStorage(data);
      
      const dataWithTimestamps = {
        ...cleanData,
        createdAt: now,
        updatedAt: now,
      };

      const request = store.add(dataWithTimestamps);

      request.onsuccess = () => {
        result = {
          ...dataWithTimestamps,
          id: request.result as number,
        } as T;
      };

      transaction.oncomplete = () => {
        if (settled || !result) return;
        settled = true;
        emitDataChange({
          storeName,
          action: 'create',
          id: request.result
        });
        resolve(result);
      };

      const rejectTransaction = () => {
        if (settled) return;
        settled = true;
        reject(new Error(
          `Failed to add record to ${storeName}: ${request.error?.message || transaction.error?.message || '事务未提交'}`
        ));
      };
      request.onerror = rejectTransaction;
      transaction.onerror = rejectTransaction;
      transaction.onabort = rejectTransaction;
    });
  }

  /**
   * 清理数据以确保可序列化
   * 递归处理对象，确保所有数据都可以存储到IndexedDB中
   * @param data any 需要清理的数据
   * @returns any 清理后的数据
   */
  protected cleanDataForStorage(data: any): any {
    if (data === null || data === undefined) {
      return data;
    }
    
    if (Array.isArray(data)) {
      return data.map(item => this.cleanDataForStorage(item));
    }
    
    if (data instanceof Date) {
      return data;
    }
    
    // 特殊处理Blob对象，确保它们被正确保存
    if (data instanceof Blob) {
      return data;
    }
    
    if (typeof data === 'object') {
      const cleanedObj: any = {};
      for (const [key, value] of Object.entries(data)) {
        // 跳过函数，但保留undefined值以便正确处理空值更新
        if (typeof value !== 'function') {
          cleanedObj[key] = this.cleanDataForStorage(value);
        }
      }
      return cleanedObj;
    }
    
    return data;
  }

  /**
   * 通用的查询所有记录方法
   * 获取指定对象存储中的所有记录
   * @param storeName string 对象存储名称
   * @returns Promise<T[]> 所有记录的数组
   */
  protected async getAll<T>(storeName: string): Promise<T[]> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result as T[]);
      };

      request.onerror = () => {
        reject(new Error(`Failed to get all records from ${storeName}: ${request.error?.message}`));
      };
    });
  }

  /**
   * 通用的根据ID查询记录方法
   * 根据主键查询单条记录
   * @param storeName string 对象存储名称
   * @param id number 记录的主键ID
   * @returns Promise<T | null> 查询到的记录，如果不存在则返回null
   */
  protected async getById<T>(storeName: string, id: number): Promise<T | null> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(id);

      request.onsuccess = () => {
        resolve(request.result as T || null);
      };

      request.onerror = () => {
        reject(new Error(`Failed to get record by id from ${storeName}: ${request.error?.message}`));
      };
    });
  }

  /**
   * 通用的记录更新方法
   * 更新指定ID的记录，自动更新updatedAt时间戳
   * @param storeName string 对象存储名称
   * @param id number 要更新的记录ID
   * @param updates Partial<T> 更新的字段和值
   * @returns Promise<T> 更新后的完整记录
   */
  protected async update<T>(storeName: string, id: number, updates: Partial<T>): Promise<T> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      let result: T | undefined;
      let settled = false;
      
      // 先获取现有数据
      const getRequest = store.get(id);
      
      getRequest.onsuccess = () => {
        const existingData = getRequest.result;
        if (!existingData) {
          settled = true;
          reject(new Error(`Record with id ${id} not found in ${storeName}`));
          try { transaction.abort(); } catch { /* transaction already finishing */ }
          return;
        }

        // 合并更新数据
        const updatedData = {
          ...existingData,
          ...this.cleanDataForStorage(updates),
          updatedAt: new Date(),
        };

        const putRequest = store.put(updatedData);
        
        putRequest.onsuccess = () => {
          result = updatedData as T;
        };

        putRequest.onerror = () => {
          if (!settled) {
            settled = true;
            reject(new Error(`Failed to update record in ${storeName}: ${putRequest.error?.message}`));
          }
        };
      };

      getRequest.onerror = () => {
        if (!settled) {
          settled = true;
          reject(new Error(`Failed to get record for update in ${storeName}: ${getRequest.error?.message}`));
        }
      };

      transaction.oncomplete = () => {
        if (settled || !result) return;
        settled = true;
        emitDataChange({ storeName, action: 'update', id });
        resolve(result);
      };
      const rejectTransaction = () => {
        if (settled) return;
        settled = true;
        reject(new Error(`Failed to update record in ${storeName}: ${transaction.error?.message || '事务未提交'}`));
      };
      transaction.onerror = rejectTransaction;
      transaction.onabort = rejectTransaction;
    });
  }

  /**
   * 通用的记录删除方法
   * 根据ID删除指定记录
   * @param storeName string 对象存储名称
   * @param id number 要删除的记录ID
   * @returns Promise<void> 删除完成的Promise
   */
  protected async delete(storeName: string, id: number): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.getDeleteTransactionStores(db, storeName), 'readwrite');
      const store = transaction.objectStore(storeName);
      const getRequest = store.get(id);
      let deletePrepared = false;
      let settled = false;

      getRequest.onsuccess = () => {
        const existingRecord = getRequest.result;
        const request = store.delete(id);

        request.onsuccess = () => {
          this.writeTombstoneForDeletedRecord(
            transaction,
            storeName,
            existingRecord,
            () => {
              deletePrepared = true;
            },
            error => {
              if (!settled) {
                settled = true;
                reject(error);
              }
            }
          );
        };

        request.onerror = () => {
          if (!settled) {
            settled = true;
            reject(new Error(`Failed to delete record from ${storeName}: ${request.error?.message}`));
          }
        };
      };

      getRequest.onerror = () => {
        if (!settled) {
          settled = true;
          reject(new Error(`Failed to get record for delete from ${storeName}: ${getRequest.error?.message}`));
        }
      };

      transaction.oncomplete = () => {
        if (settled || !deletePrepared) return;
        settled = true;
        emitDataChange({ storeName, action: 'delete', id });
        resolve();
      };
      const rejectTransaction = () => {
        if (settled) return;
        settled = true;
        reject(new Error(`Failed to delete record from ${storeName}: ${transaction.error?.message || '事务未提交'}`));
      };
      transaction.onerror = rejectTransaction;
      transaction.onabort = rejectTransaction;
    });
  }

  /**
   * 根据索引查询数据
   * 使用指定索引查询匹配的所有记录
   * @param storeName string 对象存储名称
   * @param indexName string 索引名称
   * @param value any 要查询的值
   * @returns Promise<T[]> 匹配的记录数组
   */
  protected async getByIndex<T>(storeName: string, indexName: string, value: any): Promise<T[]> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const index = store.index(indexName);
        const request = index.getAll(value);

        request.onsuccess = () => {
          resolve(request.result as T[]);
        };

        request.onerror = () => {
          reject(new Error(`Failed to get records by index ${indexName} from ${storeName}: ${request.error?.message}`));
        };
      } catch (error) {
        reject(new Error(`Index ${indexName} not found in ${storeName}`));
      }
    });
  }

  /**
   * 检查指定的对象存储是否存在
   * 用于检查数据库结构的完整性
   * @param storeName string 对象存储名称
   * @returns Promise<boolean> 是否存在
   */
  async checkObjectStoreExists(storeName: string): Promise<boolean> {
    await this.waitForInitialization();
    
    if (!this.db) {
      return false;
    }
    
    return this.db.objectStoreNames.contains(storeName);
  }

  /**
   * 关闭数据库连接
   * 释放数据库资源，重置初始化状态
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    this.isInitialized = false;
    this.initializationPromise = null;
  }

  /**
   * 检查数据库健康状态。
   * 除 store 是否存在外，还验证每个 store 的 keyPath，以及所有必需索引的 keyPath/unique。
   */
  async checkDatabaseHealth(): Promise<DatabaseHealthStatus> {
    try {
      await this.waitForInitialization();
      
      if (!this.db) {
        return {
          healthy: false,
          missingStores: [],
          currentVersion: 0,
          needsRepair: true,
          schemaIssues: []
        };
      }

      const missingStores: string[] = [];
      const schemaIssues: DatabaseSchemaIssue[] = [];
      const existingStores = Array.from(this.db.objectStoreNames);

      for (const storeName of Object.keys(DATABASE_SCHEMA)) {
        if (!existingStores.includes(storeName)) {
          missingStores.push(storeName);
          schemaIssues.push({
            kind: 'missing-store',
            storeName,
            expected: 'present',
            actual: 'missing',
            repairableDuringUpgrade: true
          });
        }
      }

      const inspectableStores = Object.keys(DATABASE_SCHEMA).filter(storeName => existingStores.includes(storeName));
      if (inspectableStores.length > 0) {
        const transaction = this.db.transaction(inspectableStores, 'readonly');
        for (const storeName of inspectableStores) {
          const store = transaction.objectStore(storeName);
          const storeSchema = DATABASE_SCHEMA[storeName];

          if (!this.keyPathsEqual(store.keyPath, storeSchema.keyPath)) {
            schemaIssues.push({
              kind: 'store-key-path',
              storeName,
              expected: this.formatKeyPath(storeSchema.keyPath),
              actual: this.formatKeyPath(store.keyPath),
              repairableDuringUpgrade: false
            });
          }

          for (const [indexName, indexSchema] of Object.entries(storeSchema.indexes)) {
            if (!store.indexNames.contains(indexName)) {
              schemaIssues.push({
                kind: 'missing-index',
                storeName,
                indexName,
                expected: `${this.formatKeyPath(indexSchema.keyPath)}, unique=${indexSchema.unique}`,
                actual: 'missing',
                repairableDuringUpgrade: true
              });
              continue;
            }

            const index = store.index(indexName);
            if (!this.keyPathsEqual(index.keyPath, indexSchema.keyPath)) {
              schemaIssues.push({
                kind: 'index-key-path',
                storeName,
                indexName,
                expected: this.formatKeyPath(indexSchema.keyPath),
                actual: this.formatKeyPath(index.keyPath),
                repairableDuringUpgrade: true
              });
            }
            if (index.unique !== indexSchema.unique) {
              schemaIssues.push({
                kind: 'index-unique',
                storeName,
                indexName,
                expected: String(indexSchema.unique),
                actual: String(index.unique),
                repairableDuringUpgrade: true
              });
            }
          }
        }
      }

      const healthy = schemaIssues.length === 0;
      const needsRepair = !healthy || this.db.version < this.currentDbVersion;

      console.log('数据库健康检查结果:', {
        healthy,
        missingStores,
        schemaIssues,
        currentVersion: this.db.version,
        expectedVersion: this.currentDbVersion,
        needsRepair,
        existingStores
      });

      return {
        healthy,
        missingStores,
        currentVersion: this.db.version,
        needsRepair,
        schemaIssues
      };
    } catch (error) {
      console.error('数据库健康检查失败:', error);
      return {
        healthy: false,
        missingStores: [],
        currentVersion: 0,
        needsRepair: true,
        schemaIssues: []
      };
    }
  }

  /**
   * 修复数据库。
   * IndexedDB 只允许在版本升级事务中修改 schema；本方法绝不删除数据库。
   * @returns Promise<boolean> 修复是否成功
   */
  async repairDatabase(): Promise<{ success: boolean; message: string }> {
    try {
      console.log('开始修复数据库...');

      // 检查当前健康状态
      const healthStatus = await this.checkDatabaseHealth();
      
      if (healthStatus.healthy && !healthStatus.needsRepair) {
        return {
          success: true,
          message: '数据库状态正常，无需修复'
        };
      }

      console.log('检测到数据库问题:', {
        healthy: healthStatus.healthy,
        missingStores: healthStatus.missingStores,
        currentVersion: healthStatus.currentVersion,
        expectedVersion: this.currentDbVersion,
        needsRepair: healthStatus.needsRepair
      });

      // 低版本数据库可以安全进入当前声明版本的 onupgradeneeded 流程。
      if (healthStatus.currentVersion < this.currentDbVersion) {
        this.close();
        await this.initialize();
      } else {
        const issueSummary = healthStatus.schemaIssues
          .map(issue => `${issue.storeName}${issue.indexName ? `.${issue.indexName}` : ''}:${issue.kind}`)
          .join(', ');
        return {
          success: false,
          message:
            `[DATABASE_SCHEMA_REPAIR_REQUIRES_UPGRADE] 当前数据库已是 v${healthStatus.currentVersion}，` +
            `IndexedDB 无法在不提升版本的情况下修改 schema。未删除任何数据。` +
            `请安装包含下一次数据库版本迁移的应用版本。问题: ${issueSummary || '未知 schema 问题'}`
        };
      }

      // 再次检查健康状态
      const newHealthStatus = await this.checkDatabaseHealth();
      
      if (newHealthStatus.healthy) {
        console.log('数据库 schema 升级成功');
        return {
          success: true,
          message: '数据库 schema 升级成功，数据保持完整'
        };
      } else {
        console.error('数据库修复失败，仍有 schema 问题:', newHealthStatus.schemaIssues);
        return {
          success: false,
          message: `数据库修复失败，仍有 ${newHealthStatus.schemaIssues.length} 个 schema 问题`
        };
      }
    } catch (error) {
      console.error('数据库修复过程中出错:', error);
      return {
        success: false,
        message: `数据库修复失败: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }

  /**
   * 安全执行数据库操作
   * 在操作前检查数据库健康状态，必要时自动修复
   * @param operation 要执行的数据库操作
   * @param requiredStores 操作需要的对象存储列表
   * @returns Promise<T> 操作结果
   */
  protected async safeDbOperation<T>(
    operation: () => Promise<T>, 
    requiredStores: string[] = []
  ): Promise<T> {
    try {
      // 确保数据库已初始化
      await this.waitForInitialization();

      // 如果指定了需要的对象存储，检查它们是否存在
      if (requiredStores.length > 0) {
        const missingStores: string[] = [];
        for (const storeName of requiredStores) {
          const exists = await this.checkObjectStoreExists(storeName);
          if (!exists) {
            missingStores.push(storeName);
          }
        }

        // 如果有缺失的对象存储，尝试修复
        if (missingStores.length > 0) {
          console.warn(`检测到缺失的对象存储: ${missingStores.join(', ')}，正在尝试修复...`);
          
          const repairResult = await this.repairDatabase();
          if (!repairResult.success) {
            throw new Error(`数据库修复失败: ${repairResult.message}`);
          }
        }
      }

      // 执行操作
      return await operation();
    } catch (error) {
      // 如果是对象存储不存在的错误，尝试修复后重试一次
      if (error instanceof Error && 
          error.message.includes('object store') && 
          error.message.includes('not found')) {
        
        console.warn('检测到对象存储错误，尝试修复数据库...');
        const repairResult = await this.repairDatabase();
        
        if (repairResult.success) {
          console.log('数据库修复成功，重试操作...');
          return await operation();
        }
      }
      
      throw error;
    }
  }

  /**
   * 为现有记录添加UUID
   * 数据库升级时调用，为没有UUID的记录生成UUID
   * @param storeName 对象存储名称
   * @returns Promise<number> 添加UUID的记录数量
   */
  async addUUIDsToExistingRecords(storeName: string): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');
    
    this.debugLog(`开始为 ${storeName} 添加UUID...`);
    
    const transaction = this.db.transaction([storeName], 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.getAll();
    
    return new Promise((resolve, reject) => {
      request.onsuccess = async () => {
        const records = request.result;
        let updatedCount = 0;
        
        // 检查是否需要UUID索引
        const needsUUIDIndex = !Array.from(store.indexNames).includes('uuid');
        if (needsUUIDIndex) {
          this.debugLog(`${storeName} 需要创建UUID索引`);
          // 注意：在活动事务中无法创建索引，这需要在数据库升级时完成
        }
        
        for (const record of records) {
          if (!record.uuid) {
            // 生成UUID
            record.uuid = generateUUID();
            
            try {
              const updateRequest = store.put(record);
              await new Promise<void>((resolveUpdate, rejectUpdate) => {
                updateRequest.onsuccess = () => resolveUpdate();
                updateRequest.onerror = () => rejectUpdate(updateRequest.error);
              });
              updatedCount++;
            } catch (error) {
              this.debugLog(`Failed to update record with UUID in ${storeName}:`, error);
            }
          }
        }
        
        this.debugLog(`为 ${storeName} 成功添加了 ${updatedCount} 个UUID`);
        resolve(updatedCount);
      };
      
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 批量为所有需要同步的表添加UUID
   * @returns Promise<{ [storeName: string]: number }> 每个表添加UUID的记录数量
   */
  async migrateAllRecordsToUUID(): Promise<Record<string, number>> {
    const syncStores = [
      'categories',
      'prompts', 
      'promptVariables',
      'promptHistories',
      'ai_configs',
      'quick_optimization_configs',
      'ai_generation_history'
    ];
    
    const results: Record<string, number> = {};
    
    for (const storeName of syncStores) {
      try {
        if (await this.checkObjectStoreExists(storeName)) {
          results[storeName] = await this.addUUIDsToExistingRecords(storeName);
        } else {
          results[storeName] = 0;
        }
      } catch (error) {
        this.debugLog(`Failed to migrate ${storeName} to UUID:`, error);
        results[storeName] = -1; // 表示失败
      }
    }
    
    return results;
  }

  private debugLog(...args: unknown[]): void {
    if (!this.isDebugLoggingEnabled()) {
      return;
    }
    console.debug(...args);
  }

  private isDebugLoggingEnabled(): boolean {
    try {
      return typeof localStorage !== 'undefined' &&
        localStorage.getItem(DATABASE_DEBUG_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  }

  /**
   * 获取同步删除标记。
   * 该数据不会参与普通业务查询，仅供云同步层传播删除使用。
   */
  async getSyncTombstones(): Promise<SyncTombstone[]> {
    return this.getAll<SyncTombstone>(SYNC_TOMBSTONE_STORE);
  }

  /**
   * 根据UUID查找记录
   * @param storeName 对象存储名称
   * @param uuid UUID值
   * @returns Promise<T | null> 找到的记录或null
   */
  async getByUUID<T>(storeName: string, uuid: string): Promise<T | null> {
    if (!this.db) throw new Error('Database not initialized');
    
    const transaction = this.db.transaction([storeName], 'readonly');
    const store = transaction.objectStore(storeName);
    
    try {
      const index = store.index('uuid');
      const request = index.get(uuid);
      
      return new Promise<T | null>((resolve, reject) => {
        request.onsuccess = () => {
          resolve(request.result as T || null);
        };
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      // 如果UUID索引不存在，则遍历所有记录查找
      console.warn(`UUID index not found for ${storeName}, falling back to full scan`);
      const request = store.getAll();
      
      return new Promise<T | null>((resolve, reject) => {
        request.onsuccess = () => {
          const records = request.result as T[];
          const found = records.find((record: any) => record.uuid === uuid);
          resolve(found || null);
        };
        request.onerror = () => reject(request.error);
      });
    }
  }

  /**
   * 根据UUID更新记录
   * @param storeName 对象存储名称
   * @param uuid UUID值
   * @param updates 要更新的字段
   * @returns Promise<T | null> 更新后的记录或null
   */
  async updateByUUID<T>(storeName: string, uuid: string, updates: Partial<T>): Promise<T | null> {
    const record = await this.getByUUID<T>(storeName, uuid);
    if (!record) return null;
    
    return this.update<T>(storeName, (record as any).id, updates);
  }

  /**
   * 根据UUID删除记录
   * @param storeName 对象存储名称
   * @param uuid UUID值
   * @returns Promise<boolean> 是否成功删除
   */
  async deleteByUUID(storeName: string, uuid: string): Promise<boolean> {
    const record = await this.getByUUID(storeName, uuid);
    if (!record) return false;
    
    await this.delete(storeName, (record as any).id);
    return true;
  }

  /**
   * 批量删除操作的基础方法
   * 批量删除多个记录，在所有操作完成后只触发一次同步
   * @param storeName string 对象存储名称
   * @param ids number[] 要删除的记录ID数组
   * @returns Promise<{ success: number; failed: number; errors: string[] }> 批量删除结果
   */
  protected async batchDelete(storeName: string, ids: number[]): Promise<{ success: number; failed: number; errors: string[] }> {
    return this.batchDeleteRecords(storeName, ids, true);
  }

  /**
   * 静默批量删除，仍然记录同步 tombstone，但不发数据变更事件。
   */
  protected async batchDeleteSilently(storeName: string, ids: number[]): Promise<{ success: number; failed: number; errors: string[] }> {
    return this.batchDeleteRecords(storeName, ids, false);
  }

  private async batchDeleteRecords(
    storeName: string,
    ids: number[],
    emitChange: boolean
  ): Promise<{ success: number; failed: number; errors: string[] }> {
    const errors: string[] = [];

    const db = await this.ensureDB();

    const deletedRecords = new Map<number, any>();
    try {
      for (const id of ids) {
        const record = await this.getById<any>(storeName, id);
        if (record) {
          deletedRecords.set(id, record);
        }
      }
    } catch (error) {
      console.warn('获取删除记录时出错:', error);
    }

    return new Promise((resolve) => {
      const transaction = db.transaction(this.getDeleteTransactionStores(db, storeName), 'readwrite');
      const store = transaction.objectStore(storeName);
      const total = ids.length;
      const committedIds = new Set<number>();
      let settled = false;

      if (total === 0) {
        resolve({ success: 0, failed: 0, errors: [] });
        return;
      }

      const resolveOnce = (result: { success: number; failed: number; errors: string[] }) => {
        if (settled) {
          return;
        }
        settled = true;
        resolve(result);
      };

      transaction.oncomplete = () => {
        const committedIdList = ids.filter(id => committedIds.has(id));
        if (emitChange && committedIdList.length > 0) {
          emitDataChange({
            storeName,
            action: 'batch-delete',
            ids: committedIdList
          });
        }

        resolveOnce({
          success: committedIdList.length,
          failed: total - committedIdList.length,
          errors
        });
      };

      const resolveTransactionFailure = () => {
        resolveOnce({
          success: 0,
          failed: total,
          errors: errors.length > 0
            ? errors
            : [`批量删除事务失败: ${transaction.error?.message || '未知错误'}`]
        });
      };

      transaction.onerror = resolveTransactionFailure;
      transaction.onabort = resolveTransactionFailure;

      ids.forEach(id => {
        const request = store.delete(id);
        
        request.onsuccess = () => {
          this.writeTombstoneForDeletedRecord(
            transaction,
            storeName,
            deletedRecords.get(id),
            () => {
              committedIds.add(id);
            },
            error => {
              errors.push(`记录 ${id} 删除标记写入失败: ${error instanceof Error ? error.message : '未知错误'}`);
            }
          );
        };

        request.onerror = () => {
          errors.push(`删除记录 ${id} 失败: ${request.error?.message || '未知错误'}`);
        };
      });
    });
  }

  private getDeleteTransactionStores(db: IDBDatabase, storeName: string): string[] {
    if (storeName !== SYNC_TOMBSTONE_STORE && db.objectStoreNames.contains(SYNC_TOMBSTONE_STORE)) {
      return [storeName, SYNC_TOMBSTONE_STORE];
    }
    return [storeName];
  }

  private writeTombstoneForDeletedRecord(
    transaction: IDBTransaction,
    storeName: string,
    existingRecord: any,
    onSuccess: () => void,
    onError: (error: unknown) => void
  ): void {
    if (!existingRecord || storeName === SYNC_TOMBSTONE_STORE || !Array.from(transaction.objectStoreNames).includes(SYNC_TOMBSTONE_STORE)) {
      onSuccess();
      return;
    }

    try {
      const tombstoneStore = transaction.objectStore(SYNC_TOMBSTONE_STORE);
      const tombstone = this.createSyncTombstone(storeName, existingRecord);
      const request = tombstoneStore.add(tombstone);
      request.onsuccess = () => onSuccess();
      request.onerror = () => onError(new Error(`Failed to write sync tombstone: ${request.error?.message}`));
    } catch (error) {
      onError(error);
    }
  }

  private createSyncTombstone(storeName: string, existingRecord: any): Omit<SyncTombstone, 'id'> {
    const collectionName = SYNC_COLLECTION_BY_STORE[storeName] || storeName;
    const cleanSnapshot = this.cleanDataForStorage(existingRecord);

    return {
      storeName,
      collectionName,
      recordKey: getCloudSyncRecordKey(collectionName, cleanSnapshot),
      recordUuid: cleanSnapshot.uuid,
      deletedAt: new Date(),
      recordSnapshot: cleanSnapshot
    };
  }
}
