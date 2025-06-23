/**
 * 基础数据库服务类
 * 提供IndexedDB的基础操作和连接管理
 */

import { generateUUID } from '../utils/uuid';
import { autoSyncManager } from '../utils/auto-sync-manager';

/**
 * IndexedDB 基础数据库服务类
 * 负责数据库的初始化、连接管理以及通用的CRUD操作
 */
export class BaseDatabaseService {
  protected db: IDBDatabase | null = null;
  protected readonly dbName = 'AIGistDB';
  protected readonly dbVersion = 6; // 增加版本号以支持UUID索引
  protected initializationPromise: Promise<void> | null = null;
  protected isInitialized: boolean = false;

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
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => {
        console.error('Failed to open database:', request.error);
        this.initializationPromise = null; // 重置，允许重试
        reject(new Error('Failed to open database'));
      };

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        this.isInitialized = true;
        console.log('Database initialized successfully');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        console.log('Database upgrade needed');
        const db = (event.target as IDBOpenDBRequest).result;
        const transaction = (event.target as IDBOpenDBRequest).transaction;
        
        console.log(`数据库升级: 从版本 ${event.oldVersion} 到版本 ${event.newVersion}`);
        console.log('现有对象存储:', Array.from(db.objectStoreNames));
        
        // 确保创建所有必要的对象存储
        this.createObjectStores(db);
        
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
  private createObjectStores(db: IDBDatabase): void {
    console.log('开始创建对象存储...');
    
    try {
      // 创建 categories 表
      if (!db.objectStoreNames.contains('categories')) {
        console.log('创建 categories 对象存储');
        const categoryStore = db.createObjectStore('categories', { keyPath: 'id', autoIncrement: true });
        categoryStore.createIndex('name', 'name', { unique: true });
        categoryStore.createIndex('uuid', 'uuid', { unique: true }); // UUID索引
      } else {
        console.log('categories 对象存储已存在');
      }

      // 创建 prompts 表
      if (!db.objectStoreNames.contains('prompts')) {
        console.log('创建 prompts 对象存储');
        const promptStore = db.createObjectStore('prompts', { keyPath: 'id', autoIncrement: true });
        promptStore.createIndex('categoryId', 'categoryId', { unique: false });
        promptStore.createIndex('isFavorite', 'isFavorite', { unique: false });
        promptStore.createIndex('title', 'title', { unique: false });
        promptStore.createIndex('tags', 'tags', { unique: false });
        promptStore.createIndex('useCount', 'useCount', { unique: false });
        promptStore.createIndex('createdAt', 'createdAt', { unique: false });
        promptStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        promptStore.createIndex('uuid', 'uuid', { unique: true }); // UUID索引
      } else {
        console.log('prompts 对象存储已存在');
      }

      // 创建 promptVariables 表
      if (!db.objectStoreNames.contains('promptVariables')) {
        console.log('创建 promptVariables 对象存储');
        const variableStore = db.createObjectStore('promptVariables', { keyPath: 'id', autoIncrement: true });
        variableStore.createIndex('promptId', 'promptId', { unique: false });
        variableStore.createIndex('name', 'name', { unique: false });
        variableStore.createIndex('uuid', 'uuid', { unique: true }); // UUID索引
      } else {
        console.log('promptVariables 对象存储已存在');
      }

      // 创建 promptHistories 表
      if (!db.objectStoreNames.contains('promptHistories')) {
        console.log('创建 promptHistories 对象存储');
        const historyStore = db.createObjectStore('promptHistories', { keyPath: 'id', autoIncrement: true });
        historyStore.createIndex('promptId', 'promptId', { unique: false });
        historyStore.createIndex('version', 'version', { unique: false });
        historyStore.createIndex('uuid', 'uuid', { unique: true }); // UUID索引
      } else {
        console.log('promptHistories 对象存储已存在');
      }

      // 创建 ai_configs 表
      if (!db.objectStoreNames.contains('ai_configs')) {
        console.log('创建 ai_configs 对象存储');
        const configStore = db.createObjectStore('ai_configs', { keyPath: 'id', autoIncrement: true });
        configStore.createIndex('configId', 'configId', { unique: true });
        configStore.createIndex('type', 'type', { unique: false });
        configStore.createIndex('enabled', 'enabled', { unique: false });
        configStore.createIndex('isPreferred', 'isPreferred', { unique: false });
        configStore.createIndex('uuid', 'uuid', { unique: true }); // UUID索引
      } else {
        console.log('ai_configs 对象存储已存在');
      }

      // 创建 ai_generation_history 表
      if (!db.objectStoreNames.contains('ai_generation_history')) {
        console.log('创建 ai_generation_history 对象存储');
        const generationStore = db.createObjectStore('ai_generation_history', { keyPath: 'id', autoIncrement: true });
        generationStore.createIndex('historyId', 'historyId', { unique: true });
        generationStore.createIndex('configId', 'configId', { unique: false });
        generationStore.createIndex('status', 'status', { unique: false });
        generationStore.createIndex('createdAt', 'createdAt', { unique: false });
        generationStore.createIndex('uuid', 'uuid', { unique: true }); // UUID索引
      } else {
        console.log('ai_generation_history 对象存储已存在');
      }

      // 创建 settings 表
      if (!db.objectStoreNames.contains('settings')) {
        console.log('创建 settings 对象存储');
        const settingsStore = db.createObjectStore('settings', { keyPath: 'id', autoIncrement: true });
        settingsStore.createIndex('key', 'key', { unique: true });
      } else {
        console.log('settings 对象存储已存在');
      }
      
      console.log('对象存储创建完成，最终对象存储列表:', Array.from(db.objectStoreNames));
      
      // 为现有的对象存储添加缺失的UUID索引
      this.upgradeExistingStoresIndexes(db);
    } catch (error) {
      console.error('创建对象存储时出错:', error);
      throw error;
    }
  }

  /**
   * 升级现有对象存储的索引
   * 为已存在的对象存储添加缺失的UUID索引
   * @param db IDBDatabase 数据库实例
   */
  private upgradeExistingStoresIndexes(db: IDBDatabase): void {
    console.log('开始升级现有对象存储的索引...');
    
    try {
      const storeIndexMapping = {
        'categories': ['uuid'],
        'prompts': ['uuid'],
        'promptVariables': ['uuid'],
        'promptHistories': ['uuid'],
        'ai_configs': ['uuid'],
        'ai_generation_history': ['uuid']
      };
      
      // 获取当前事务
      const transaction = db.transaction ? db.transaction : null;
      
      for (const [storeName, requiredIndexes] of Object.entries(storeIndexMapping)) {
        if (db.objectStoreNames.contains(storeName)) {
          try {
            // 只有在有活动事务时才能修改索引
            if (transaction) {
              const store = transaction.objectStore(storeName);
              
              for (const indexName of requiredIndexes) {
                if (!Array.from(store.indexNames).includes(indexName)) {
                  console.log(`为 ${storeName} 添加 ${indexName} 索引`);
                  try {
                    store.createIndex(indexName, indexName, { unique: true });
                  } catch (indexError) {
                    console.warn(`添加索引 ${storeName}.${indexName} 失败:`, indexError);
                  }
                } else {
                  console.log(`索引 ${storeName}.${indexName} 已存在`);
                }
              }
            }
          } catch (storeError) {
            console.warn(`升级存储 ${storeName} 索引时出错:`, storeError);
          }
        }
      }
      
      console.log('索引升级完成');
    } catch (error) {
      console.error('升级索引时出错:', error);
    }
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
        const result = {
          ...dataWithTimestamps,
          id: request.result as number,
        } as T;
        
        // 触发自动同步
        this.triggerAutoSyncAfterChange('add', storeName);
        
        resolve(result);
      };

      request.onerror = () => {
        reject(new Error(`Failed to add record to ${storeName}: ${request.error?.message}`));
      };
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
    
    if (typeof data === 'object') {
      const cleanedObj: any = {};
      for (const [key, value] of Object.entries(data)) {
        // 跳过函数和undefined值
        if (typeof value !== 'function' && value !== undefined) {
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
      
      // 先获取现有数据
      const getRequest = store.get(id);
      
      getRequest.onsuccess = () => {
        const existingData = getRequest.result;
        if (!existingData) {
          reject(new Error(`Record with id ${id} not found in ${storeName}`));
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
          // 触发自动同步
          this.triggerAutoSyncAfterChange('update', storeName);
          
          resolve(updatedData as T);
        };

        putRequest.onerror = () => {
          reject(new Error(`Failed to update record in ${storeName}: ${putRequest.error?.message}`));
        };
      };

      getRequest.onerror = () => {
        reject(new Error(`Failed to get record for update in ${storeName}: ${getRequest.error?.message}`));
      };
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
      const transaction = db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(id);

      request.onsuccess = () => {
        // 触发自动同步
        this.triggerAutoSyncAfterChange('delete', storeName);
        
        resolve();
      };

      request.onerror = () => {
        reject(new Error(`Failed to delete record from ${storeName}: ${request.error?.message}`));
      };
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
   * 检查数据库健康状态
   * 验证所有必需的对象存储是否存在
   * @returns Promise<{ healthy: boolean; missingStores: string[]; currentVersion: number }> 健康状态信息
   */
  async checkDatabaseHealth(): Promise<{ 
    healthy: boolean; 
    missingStores: string[]; 
    currentVersion: number;
    needsRepair: boolean;
  }> {
    try {
      await this.waitForInitialization();
      
      if (!this.db) {
        return {
          healthy: false,
          missingStores: [],
          currentVersion: 0,
          needsRepair: true
        };
      }

      const requiredStores = [
        'categories',
        'prompts',
        'promptVariables',
        'promptHistories',
        'ai_configs',
        'ai_generation_history',
        'settings'
      ];

      const missingStores: string[] = [];
      const existingStores = Array.from(this.db.objectStoreNames);

      for (const storeName of requiredStores) {
        if (!existingStores.includes(storeName)) {
          missingStores.push(storeName);
        }
      }

      const healthy = missingStores.length === 0;
      const needsRepair = !healthy || this.db.version < this.dbVersion;

      console.log('数据库健康检查结果:', {
        healthy,
        missingStores,
        currentVersion: this.db.version,
        expectedVersion: this.dbVersion,
        needsRepair,
        existingStores
      });

      return {
        healthy,
        missingStores,
        currentVersion: this.db.version,
        needsRepair
      };
    } catch (error) {
      console.error('数据库健康检查失败:', error);
      return {
        healthy: false,
        missingStores: [],
        currentVersion: 0,
        needsRepair: true
      };
    }
  }

  /**
   * 修复数据库
   * 通过删除并重新创建数据库来修复缺失的对象存储
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
        expectedVersion: this.dbVersion,
        needsRepair: healthStatus.needsRepair
      });

      // 关闭当前连接
      this.close();

      // 如果缺失关键表，需要完全重建数据库
      if (healthStatus.missingStores.length > 0) {
        console.log('准备删除并重建数据库...');
        
        // 删除现有数据库
        await this.deleteDatabase();
        
        // 重新创建数据库
        console.log('重新创建数据库...');
        await this.initialize();
      } else {
        // 如果只是版本问题，尝试版本升级
        console.log('尝试通过版本升级修复...');
        
        // 强制升级到更高版本
        this.dbVersion = this.dbVersion + 1;
        await this.initialize();
        
        // 恢复原版本号
        this.dbVersion = this.dbVersion - 1;
      }

      // 再次检查健康状态
      const newHealthStatus = await this.checkDatabaseHealth();
      
      if (newHealthStatus.healthy) {
        console.log('数据库修复成功');
        return {
          success: true,
          message: `数据库修复成功，已创建 ${healthStatus.missingStores.length} 个缺失的对象存储`
        };
      } else {
        console.error('数据库修复失败，仍有缺失的对象存储:', newHealthStatus.missingStores);
        return {
          success: false,
          message: `数据库修复失败，仍缺失: ${newHealthStatus.missingStores.join(', ')}`
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
   * 删除数据库
   * 彻底删除IndexedDB数据库
   * @returns Promise<void>
   */
  private async deleteDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`准备删除数据库: ${this.dbName}`);
      
      const deleteRequest = indexedDB.deleteDatabase(this.dbName);
      
      deleteRequest.onsuccess = () => {
        console.log(`数据库 ${this.dbName} 已删除`);
        resolve();
      };
      
      deleteRequest.onerror = () => {
        console.error('删除数据库失败:', deleteRequest.error);
        reject(new Error(`删除数据库失败: ${deleteRequest.error?.message || '未知错误'}`));
      };
      
      deleteRequest.onblocked = () => {
        console.warn('删除数据库被阻塞，可能有其他连接正在使用');
        // 等待一段时间后重试
        setTimeout(() => {
          reject(new Error('删除数据库被阻塞，请关闭所有应用窗口后重试'));
        }, 5000);
      };
    });
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
    
    console.log(`开始为 ${storeName} 添加UUID...`);
    
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
          console.log(`${storeName} 需要创建UUID索引`);
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
              console.error(`Failed to update record with UUID in ${storeName}:`, error);
            }
          }
        }
        
        console.log(`为 ${storeName} 成功添加了 ${updatedCount} 个UUID`);
        resolve(updatedCount);
      };
      
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 批量为所有需要同步的表添加UUID
   * @returns Promise<{ [storeName: string]: number }> 每个表添加UUID的记录数量
   */
  async migrateAllRecordsToUUID(): Promise<{ [storeName: string]: number }> {
    const syncStores = [
      'categories',
      'prompts', 
      'promptVariables',
      'promptHistories',
      'ai_configs',
      'ai_generation_history'
    ];
    
    const results: { [storeName: string]: number } = {};
    
    for (const storeName of syncStores) {
      try {
        if (await this.checkObjectStoreExists(storeName)) {
          results[storeName] = await this.addUUIDsToExistingRecords(storeName);
        } else {
          results[storeName] = 0;
        }
      } catch (error) {
        console.error(`Failed to migrate ${storeName} to UUID:`, error);
        results[storeName] = -1; // 表示失败
      }
    }
    
    return results;
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
    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    const db = await this.ensureDB();

    // 首先获取要删除的记录的UUID（用于WebDAV同步）
    const deletedUuids: string[] = [];
    try {
      for (const id of ids) {
        const record = await this.getById<any>(storeName, id);
        if (record && record.uuid) {
          deletedUuids.push(record.uuid);
        }
      }
    } catch (error) {
      console.warn('获取删除记录的UUID时出错:', error);
    }

    // 使用事务进行批量操作
    return new Promise((resolve) => {
      const transaction = db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      
      let completed = 0;
      const total = ids.length;

      if (total === 0) {
        resolve({ success: 0, failed: 0, errors: [] });
        return;
      }

      // 批量删除所有记录
      ids.forEach(id => {
        const request = store.delete(id);
        
        request.onsuccess = () => {
          success++;
          completed++;
          
          if (completed === total) {
            // 所有操作完成后，只触发一次同步，并传递删除的UUID
            if (success > 0) {
              this.triggerAutoSyncAfterChange('batch_delete', storeName, { deletedUuids });
            }
            resolve({ success, failed, errors });
          }
        };

        request.onerror = () => {
          failed++;
          errors.push(`删除记录 ${id} 失败: ${request.error?.message || '未知错误'}`);
          completed++;
          
          if (completed === total) {
            // 所有操作完成后，只触发一次同步（如果有成功的）
            if (success > 0) {
              this.triggerAutoSyncAfterChange('batch_delete', storeName, { deletedUuids });
            }
            resolve({ success, failed, errors });
          }
        };
      });
    });
  }

  /**
   * 在数据变更后触发自动同步
   * @param operation 操作类型
   * @param storeName 对象存储名称
   * @param metadata 元数据，包含删除的UUID等信息
   */
  protected triggerAutoSyncAfterChange(operation: 'add' | 'update' | 'delete' | 'batch_delete', storeName: string, metadata?: any) {
    try {
      // 异步触发，不阻塞数据库操作
      setTimeout(async () => {
        // 如果是批量删除操作，使用专门的批量删除同步方法
        if (operation === 'batch_delete' && metadata?.deletedUuids?.length > 0) {
          console.log(`批量删除操作: 触发同步，包含 ${metadata.deletedUuids.length} 个删除的UUID`);
          // 直接使用批量删除的同步方法，传递删除的UUID
          autoSyncManager.triggerAutoSyncAfterBatchDelete(
            metadata.deletedUuids, 
            `批量删除 ${storeName} 数据后自动同步`
          );
        } else {
          // 普通操作使用常规同步
          autoSyncManager.triggerAutoSync(`数据变更: ${operation} in ${storeName}`);
        }
      }, 0);
    } catch (error) {
      // 自动同步失败不应该影响数据操作
      console.warn('触发自动同步失败:', error);
    }
  }
}
