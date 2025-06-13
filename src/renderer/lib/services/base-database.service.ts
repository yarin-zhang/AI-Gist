/**
 * 基础数据库服务类
 * 提供IndexedDB的基础操作和连接管理
 */

/**
 * IndexedDB 基础数据库服务类
 * 负责数据库的初始化、连接管理以及通用的CRUD操作
 */
export class BaseDatabaseService {
  protected db: IDBDatabase | null = null;
  protected readonly dbName = 'AIGistDB';
  protected readonly dbVersion = 5;
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
        const db = (event.target as IDBOpenDBRequest).result;
        this.createObjectStores(db);
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
    // 创建 users 表
    if (!db.objectStoreNames.contains('users')) {
      const userStore = db.createObjectStore('users', { keyPath: 'id', autoIncrement: true });
      userStore.createIndex('email', 'email', { unique: true });
    }

    // 创建 posts 表
    if (!db.objectStoreNames.contains('posts')) {
      const postStore = db.createObjectStore('posts', { keyPath: 'id', autoIncrement: true });
      postStore.createIndex('authorId', 'authorId', { unique: false });
      postStore.createIndex('published', 'published', { unique: false });
    }

    // 创建 categories 表
    if (!db.objectStoreNames.contains('categories')) {
      const categoryStore = db.createObjectStore('categories', { keyPath: 'id', autoIncrement: true });
      categoryStore.createIndex('name', 'name', { unique: true });
    }

    // 创建 prompts 表
    if (!db.objectStoreNames.contains('prompts')) {
      const promptStore = db.createObjectStore('prompts', { keyPath: 'id', autoIncrement: true });
      promptStore.createIndex('categoryId', 'categoryId', { unique: false });
      promptStore.createIndex('isFavorite', 'isFavorite', { unique: false });
      promptStore.createIndex('title', 'title', { unique: false });
      promptStore.createIndex('tags', 'tags', { unique: false });
      promptStore.createIndex('useCount', 'useCount', { unique: false });
      promptStore.createIndex('createdAt', 'createdAt', { unique: false });
      promptStore.createIndex('updatedAt', 'updatedAt', { unique: false });
    }

    // 创建 promptVariables 表
    if (!db.objectStoreNames.contains('promptVariables')) {
      const variableStore = db.createObjectStore('promptVariables', { keyPath: 'id', autoIncrement: true });
      variableStore.createIndex('promptId', 'promptId', { unique: false });
      variableStore.createIndex('name', 'name', { unique: false });
    }

    // 创建 promptHistories 表
    if (!db.objectStoreNames.contains('promptHistories')) {
      const historyStore = db.createObjectStore('promptHistories', { keyPath: 'id', autoIncrement: true });
      historyStore.createIndex('promptId', 'promptId', { unique: false });
      historyStore.createIndex('version', 'version', { unique: false });
    }

    // 创建 ai_configs 表
    if (!db.objectStoreNames.contains('ai_configs')) {
      const configStore = db.createObjectStore('ai_configs', { keyPath: 'id', autoIncrement: true });
      configStore.createIndex('configId', 'configId', { unique: true });
      configStore.createIndex('type', 'type', { unique: false });
      configStore.createIndex('enabled', 'enabled', { unique: false });
      configStore.createIndex('isPreferred', 'isPreferred', { unique: false });
    }

    // 创建 ai_generation_history 表
    if (!db.objectStoreNames.contains('ai_generation_history')) {
      const generationStore = db.createObjectStore('ai_generation_history', { keyPath: 'id', autoIncrement: true });
      generationStore.createIndex('historyId', 'historyId', { unique: true });
      generationStore.createIndex('configId', 'configId', { unique: false });
      generationStore.createIndex('status', 'status', { unique: false });
      generationStore.createIndex('createdAt', 'createdAt', { unique: false });
    }

    // 创建 settings 表
    if (!db.objectStoreNames.contains('settings')) {
      const settingsStore = db.createObjectStore('settings', { keyPath: 'id', autoIncrement: true });
      settingsStore.createIndex('key', 'key', { unique: true });
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
        resolve({
          ...dataWithTimestamps,
          id: request.result as number,
        } as T);
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
}
