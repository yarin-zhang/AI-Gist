/**
 * IndexedDB 数据库服务
 */

// 数据类型定义
export interface User {
  id?: number;
  email: string;
  name?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Post {
  id?: number;
  title: string;
  content?: string;
  published: boolean;
  authorId: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Category {
  id?: number;
  name: string;
  color?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Prompt {
  id?: number;
  title: string;
  content: string;
  description?: string;
  categoryId?: number;
  tags?: string;
  isFavorite: boolean;
  useCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PromptVariable {
  id?: number;
  name: string;
  label: string;
  type: string;
  options?: string;
  defaultValue?: string;
  required: boolean;
  placeholder?: string;
  promptId: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PromptHistory {
  id?: number;
  promptId: number;
  version: number;
  title: string;
  content: string;
  description?: string;
  categoryId?: number;
  tags?: string;
  variables?: string; // JSON 字符串存储变量配置
  changeDescription?: string; // 变更描述
  createdAt: Date;
}

// AI 相关数据类型
export interface AIConfig {
  id?: number;
  configId: string; // 唯一标识符
  name: string;
  type: 'openai' | 'ollama' | 'anthropic' | 'google' | 'azure' | 'lmstudio' | 'deepseek' | 'cohere' | 'mistral';
  baseURL: string;
  apiKey?: string;
  secretKey?: string;
  models: string[]; // 修改为 string[]
  defaultModel?: string;
  customModel?: string;
  enabled: boolean;
  isPreferred?: boolean; // 是否为全局首选配置
  systemPrompt?: string; // 自定义的生成提示词的系统提示词
  createdAt: Date;
  updatedAt: Date;
}

export interface AIGenerationHistory {
  id?: number;
  historyId: string; // 唯一标识符
  configId: string;
  topic: string;
  generatedPrompt: string;
  model: string;
  customPrompt?: string;
  status: 'success' | 'error';
  errorMessage?: string;
  createdAt: Date;
}

// 全局设置接口
export interface AppSettings {
  id?: number;
  key: string;
  value: string;
  type: 'string' | 'number' | 'boolean' | 'json';
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

// 扩展的数据类型（包含关联数据）
export interface PromptWithRelations extends Prompt {
  category?: Category;
  variables?: PromptVariable[];
}

export interface CategoryWithRelations extends Category {
  prompts?: Prompt[];
}

/**
 * IndexedDB 数据库管理类
 */
class DatabaseService {
  private db: IDBDatabase | null = null;
  private readonly dbName = 'AIGistDB';
  private readonly dbVersion = 5; // 升级版本号以添加 settings 表和 isPreferred 字段
  private initializationPromise: Promise<void> | null = null;
  private isInitialized: boolean = false;
  /**
   * 初始化数据库
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

        // 创建 users 表
        if (!db.objectStoreNames.contains('users')) {
          const userStore = db.createObjectStore('users', { keyPath: 'id', autoIncrement: true });
          userStore.createIndex('email', 'email', { unique: true });
        }

        // 创建 posts 表
        if (!db.objectStoreNames.contains('posts')) {
          const postStore = db.createObjectStore('posts', { keyPath: 'id', autoIncrement: true });
          postStore.createIndex('authorId', 'authorId', { unique: false });
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
        }

        // 创建 promptVariables 表（修复表名不一致问题）
        if (!db.objectStoreNames.contains('promptVariables')) {
          const promptVariableStore = db.createObjectStore('promptVariables', { keyPath: 'id', autoIncrement: true });
          promptVariableStore.createIndex('promptId', 'promptId', { unique: false });
        }

        // 创建 promptHistories 表
        if (!db.objectStoreNames.contains('promptHistories')) {
          const promptHistoryStore = db.createObjectStore('promptHistories', { keyPath: 'id', autoIncrement: true });
          promptHistoryStore.createIndex('promptId', 'promptId', { unique: false });
          promptHistoryStore.createIndex('version', 'version', { unique: false });
        }

        // 创建 ai_configs 表
        if (!db.objectStoreNames.contains('ai_configs')) {
          const aiConfigStore = db.createObjectStore('ai_configs', { keyPath: 'id', autoIncrement: true });
          aiConfigStore.createIndex('configId', 'configId', { unique: true });
          aiConfigStore.createIndex('type', 'type', { unique: false });
          aiConfigStore.createIndex('enabled', 'enabled', { unique: false });
          aiConfigStore.createIndex('isPreferred', 'isPreferred', { unique: false });
        }

        // 创建 ai_generation_history 表
        if (!db.objectStoreNames.contains('ai_generation_history')) {
          const aiHistoryStore = db.createObjectStore('ai_generation_history', { keyPath: 'id', autoIncrement: true });
          aiHistoryStore.createIndex('historyId', 'historyId', { unique: true });
          aiHistoryStore.createIndex('configId', 'configId', { unique: false });
          aiHistoryStore.createIndex('status', 'status', { unique: false });
          aiHistoryStore.createIndex('createdAt', 'createdAt', { unique: false });
        }

        // 创建 settings 表
        if (!db.objectStoreNames.contains('settings')) {
          const settingsStore = db.createObjectStore('settings', { keyPath: 'id', autoIncrement: true });
          settingsStore.createIndex('key', 'key', { unique: true });
        }

        console.log('Database schema updated');
      };
    });

    return this.initializationPromise;
  }
  /**
   * 等待数据库初始化完成
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
   * 确保数据库已初始化
   */
  private async ensureDB(): Promise<IDBDatabase> {
    await this.waitForInitialization();
    
    if (!this.db) {
      throw new Error('Database failed to initialize');
    }
    
    return this.db;
  }
  /**
   * 通用的添加方法
   */
  private async add<T>(storeName: string, data: Omit<T, 'id'>): Promise<T> {
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
        resolve({ ...dataWithTimestamps, id: request.result } as T);
      };

      request.onerror = () => {
        console.error('IndexedDB add error:', request.error);
        reject(new Error(`Failed to add to ${storeName}: ${request.error?.message || 'Unknown error'}`));
      };
    });
  }

  /**
   * 清理数据以确保可序列化
   */
  private cleanDataForStorage(data: any): any {
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
        cleanedObj[key] = this.cleanDataForStorage(value);
      }
      return cleanedObj;
    }
    
    return data;
  }
  /**
   * 通用的查询所有方法
   */
  private async getAll<T>(storeName: string): Promise<T[]> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(new Error(`Failed to get all from ${storeName}`));
      };
    });
  }

  /**
   * 通用的根据ID查询方法
   */  private async getById<T>(storeName: string, id: number): Promise<T | null> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(id);

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = () => {
        reject(new Error(`Failed to get by id from ${storeName}`));
      };
    });
  }

  /**
   * 通用的更新方法
   */  private async update<T>(storeName: string, id: number, updates: Partial<T>): Promise<T> {
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

        // 清理更新数据以确保可序列化
        const cleanUpdates = this.cleanDataForStorage(updates);

        const updatedData = {
          ...existingData,
          ...cleanUpdates,
          updatedAt: new Date(),
        };

        const putRequest = store.put(updatedData);
        
        putRequest.onsuccess = () => {
          resolve(updatedData);
        };

        putRequest.onerror = () => {
          console.error('IndexedDB update error:', putRequest.error);
          reject(new Error(`Failed to update in ${storeName}: ${putRequest.error?.message || 'Unknown error'}`));
        };
      };

      getRequest.onerror = () => {
        reject(new Error(`Failed to get record for update in ${storeName}`));
      };
    });
  }

  /**
   * 通用的删除方法
   */  private async delete(storeName: string, id: number): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(id);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(new Error(`Failed to delete from ${storeName}`));
      };
    });
  }

  /**
   * 根据索引查询数据
   */
  private async getByIndex<T>(storeName: string, indexName: string, value: any): Promise<T[]> {    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        
        // 确保索引存在
        if (!store.indexNames.contains(indexName)) {
          console.error(`Index ${indexName} does not exist in store ${storeName}`);
          return resolve([]);
        }
        
        const index = store.index(indexName);
        
        // 对布尔值特殊处理，避免直接传递可能导致的问题
        let request;
        if (typeof value === 'boolean') {
          // 使用游标而不是直接查询
          request = index.openCursor();
          const results: T[] = [];
          
          request.onsuccess = (event) => {
            const cursor = (event.target as IDBRequest).result;
            if (cursor) {
              if (cursor.value[indexName] === value) {
                results.push(cursor.value);
              }
              cursor.continue();
            } else {
              resolve(results);
            }
          };
        } else {
          // 对于非布尔值，使用标准的 getAll
          request = index.getAll(value);
          
          request.onsuccess = () => {
            resolve(request.result);
          };
        }

        request.onerror = (event) => {
          console.error(`Error in getByIndex for ${storeName}.${indexName}:`, event);
          reject(new Error(`Failed to get by index from ${storeName}: ${request.error?.message || 'Unknown error'}`));
        };
      } catch (error) {
        console.error(`Exception in getByIndex for ${storeName}.${indexName}:`, error);
        reject(error);
      }
    });
  }

  // ===== User 相关方法 =====
  async createUser(data: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): Promise<User> {
    return this.add<User>('users', data);
  }

  async getAllUsers(): Promise<User[]> {
    return this.getAll<User>('users');
  }

  async getUserById(id: number): Promise<User | null> {
    return this.getById<User>('users', id);
  }

  async updateUser(id: number, data: Partial<Omit<User, 'id' | 'createdAt' | 'updatedAt'>>): Promise<User> {
    return this.update<User>('users', id, data);
  }

  async deleteUser(id: number): Promise<void> {
    return this.delete('users', id);
  }

  // ===== Post 相关方法 =====
  async createPost(data: Omit<Post, 'id' | 'createdAt' | 'updatedAt'>): Promise<Post> {
    return this.add<Post>('posts', data);
  }

  async getAllPosts(): Promise<Post[]> {
    return this.getAll<Post>('posts');
  }

  async getPostById(id: number): Promise<Post | null> {
    return this.getById<Post>('posts', id);
  }

  async updatePost(id: number, data: Partial<Omit<Post, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Post> {
    return this.update<Post>('posts', id, data);
  }

  async deletePost(id: number): Promise<void> {
    return this.delete('posts', id);
  }

  // ===== Category 相关方法 =====
  async createCategory(data: Omit<Category, 'id' | 'createdAt' | 'updatedAt'>): Promise<Category> {
    return this.add<Category>('categories', data);
  }

  async getAllCategories(): Promise<CategoryWithRelations[]> {
    const categories = await this.getAll<Category>('categories');
    const prompts = await this.getAll<Prompt>('prompts');
    
    return categories.map(category => ({
      ...category,
      prompts: prompts.filter(prompt => prompt.categoryId === category.id)
    }));
  }

  async getCategoryById(id: number): Promise<Category | null> {
    return this.getById<Category>('categories', id);
  }

  async updateCategory(id: number, data: Partial<Omit<Category, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Category> {
    return this.update<Category>('categories', id, data);
  }

  async deleteCategory(id: number): Promise<void> {
    return this.delete('categories', id);
  }

  // ===== Prompt 相关方法 =====
  async createPrompt(data: Omit<Prompt, 'id' | 'createdAt' | 'updatedAt'> & { variables?: Omit<PromptVariable, 'id' | 'promptId' | 'createdAt' | 'updatedAt'>[] }): Promise<PromptWithRelations> {
    const { variables, ...promptData } = data;
    
    // 创建 prompt
    const prompt = await this.add<Prompt>('prompts', {
      ...promptData,
      isFavorite: promptData.isFavorite || false,
      useCount: promptData.useCount || 0,
    });

    // 创建 variables
    let createdVariables: PromptVariable[] = [];
    if (variables && variables.length > 0) {
      for (const variable of variables) {
        const createdVariable = await this.add<PromptVariable>('promptVariables', {
          ...variable,
          promptId: prompt.id!,
        });
        createdVariables.push(createdVariable);
      }
    }

    // 获取 category
    const category = prompt.categoryId ? await this.getCategoryById(prompt.categoryId) : undefined;

    return {
      ...prompt,
      category: category || undefined,
      variables: createdVariables,
    };
  }

  async getAllPrompts(filters?: {
    categoryId?: number | null;
    search?: string;
    tags?: string;
    isFavorite?: boolean;
    page?: number;
    limit?: number;
    sortBy?: string; // 添加排序方式参数
  }): Promise<{ data: PromptWithRelations[]; total: number; hasMore: boolean }> {
    const prompts = await this.getAll<Prompt>('prompts');
    const categories = await this.getAll<Category>('categories');
    const variables = await this.getAll<PromptVariable>('promptVariables');

    let filteredPrompts = prompts;

    // 应用过滤器
    if (filters) {
      if (filters.categoryId !== undefined) {
        if (filters.categoryId === null) {
          filteredPrompts = filteredPrompts.filter(p => !p.categoryId);
        } else {
          filteredPrompts = filteredPrompts.filter(p => p.categoryId === filters.categoryId);
        }
      }

      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        filteredPrompts = filteredPrompts.filter(p => {
          // 搜索标题、描述、内容
          const matchesBasicFields = 
            p.title.toLowerCase().includes(searchLower) ||
            (p.description && p.description.toLowerCase().includes(searchLower)) ||
            p.content.toLowerCase().includes(searchLower);
          
          // 搜索标签 - 添加类型检查
          const matchesTags = p.tags && typeof p.tags === 'string' && 
            p.tags.toLowerCase().split(',')
              .some(tag => tag.trim().includes(searchLower));
          
          return matchesBasicFields || matchesTags;
        });
      }

      if (filters.tags) {
        const tagsLower = filters.tags.toLowerCase();
        filteredPrompts = filteredPrompts.filter(p => 
          p.tags && typeof p.tags === 'string' && p.tags.toLowerCase().includes(tagsLower)
        );
      }

      if (filters.isFavorite !== undefined) {
        filteredPrompts = filteredPrompts.filter(p => p.isFavorite === filters.isFavorite);
      }
    }

    // 根据排序方式进行排序
    if (filters?.sortBy) {
      switch (filters.sortBy) {
        case 'timeDesc': // 最新优先
          filteredPrompts.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
          break;
        case 'timeAsc': // 最早优先
          filteredPrompts.sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());
          break;
        case 'useCount': // 使用次数优先
          filteredPrompts.sort((a, b) => b.useCount - a.useCount);
          break;
        case 'favorite': // 收藏优先
          filteredPrompts.sort((a, b) => {
            if (a.isFavorite !== b.isFavorite) {
              return b.isFavorite ? 1 : -1;
            }
            return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(); // 收藏相同时按更新时间
          });
          break;
        default: // 默认：收藏 > 使用次数 > 更新时间
          filteredPrompts.sort((a, b) => {
            if (a.isFavorite !== b.isFavorite) {
              return b.isFavorite ? 1 : -1;
            }
            if (a.useCount !== b.useCount) {
              return b.useCount - a.useCount;
            }
            return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
          });
      }
    } else {
      // 默认排序：收藏 > 使用次数 > 更新时间
      filteredPrompts.sort((a, b) => {
        if (a.isFavorite !== b.isFavorite) {
          return b.isFavorite ? 1 : -1;
        }
        if (a.useCount !== b.useCount) {
          return b.useCount - a.useCount;
        }
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
    }

    // 计算总数
    const total = filteredPrompts.length;

    // 应用分页
    let paginatedPrompts = filteredPrompts;
    if (filters?.page && filters?.limit) {
      const offset = (filters.page - 1) * filters.limit;
      paginatedPrompts = filteredPrompts.slice(offset, offset + filters.limit);
    }

    // 组装关联数据
    const result = paginatedPrompts.map(prompt => ({
      ...prompt,
      category: categories.find(c => c.id === prompt.categoryId),
      variables: variables.filter(v => v.promptId === prompt.id),
    }));

    // 计算是否还有更多数据
    const hasMore = filters?.page && filters?.limit ? 
      (filters.page * filters.limit) < total : 
      false;

    return {
      data: result,
      total,
      hasMore
    };
  }

  async getAllPromptsForTags(): Promise<PromptWithRelations[]> {
    const prompts = await this.getAll<Prompt>('prompts');
    const categories = await this.getAll<Category>('categories');
    const variables = await this.getAll<PromptVariable>('promptVariables');

    // 组装关联数据
    return prompts.map(prompt => ({
      ...prompt,
      category: categories.find(c => c.id === prompt.categoryId),
      variables: variables.filter(v => v.promptId === prompt.id),
    }));
  }

  async getPromptById(id: number): Promise<PromptWithRelations | null> {
    const prompt = await this.getById<Prompt>('prompts', id);
    if (!prompt) return null;

    const category = prompt.categoryId ? await this.getCategoryById(prompt.categoryId) : undefined;
    const variables = await this.getByIndex<PromptVariable>('promptVariables', 'promptId', id);

    return {
      ...prompt,
      category: category || undefined,
      variables,
    };
  }

  async updatePrompt(
    id: number, 
    data: Partial<Omit<Prompt, 'id' | 'createdAt' | 'updatedAt'>> & { variables?: Omit<PromptVariable, 'id' | 'promptId' | 'createdAt' | 'updatedAt'>[] }
  ): Promise<PromptWithRelations> {
    const { variables, ...promptData } = data;
    
    // 更新 prompt
    const updatedPrompt = await this.update<Prompt>('prompts', id, promptData);

    // 处理 variables 更新
    if (variables !== undefined) {
      // 删除现有的 variables
      const existingVariables = await this.getByIndex<PromptVariable>('promptVariables', 'promptId', id);
      for (const variable of existingVariables) {
        await this.delete('promptVariables', variable.id!);
      }

      // 创建新的 variables
      for (const variable of variables) {
        await this.add<PromptVariable>('promptVariables', {
          ...variable,
          promptId: id,
        });
      }
    }

    // 返回更新后的完整数据
    return this.getPromptById(id) as Promise<PromptWithRelations>;
  }

  async deletePrompt(id: number): Promise<void> {
    // 先删除关联的 variables
    const variables = await this.getByIndex<PromptVariable>('promptVariables', 'promptId', id);
    for (const variable of variables) {
      await this.delete('promptVariables', variable.id!);
    }
    
    // 删除 prompt
    await this.delete('prompts', id);
  }

  async incrementPromptUseCount(id: number): Promise<Prompt> {
    const prompt = await this.getById<Prompt>('prompts', id);
    if (!prompt) {
      throw new Error('Prompt not found');
    }
    
    return this.update<Prompt>('prompts', id, {
      useCount: prompt.useCount + 1,
    });
  }

  async decrementPromptUseCount(id: number): Promise<Prompt> {
    const prompt = await this.getById<Prompt>('prompts', id);
    if (!prompt) {
      throw new Error('Prompt not found');
    }
    
    // 确保useCount不会小于0
    const newUseCount = Math.max(0, prompt.useCount - 1);
    
    return this.update<Prompt>('prompts', id, {
      useCount: newUseCount,
    });
  }

  async getFavoritePrompts(): Promise<PromptWithRelations[]> {
    return this.getAllPrompts({ isFavorite: true });
  }

  async togglePromptFavorite(id: number): Promise<PromptWithRelations> {
    const prompt = await this.getById<Prompt>('prompts', id);
    if (!prompt) {
      throw new Error('Prompt not found');
    }

    await this.update<Prompt>('prompts', id, {
      isFavorite: !prompt.isFavorite,
    });

    return this.getPromptById(id) as Promise<PromptWithRelations>;
  }

  async fillPromptVariables(promptId: number, variables: Record<string, string>) {
    const prompt = await this.getPromptById(promptId);
    if (!prompt) {
      throw new Error('Prompt not found');
    }

    let content = prompt.content;
    
    // 替换变量
    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
      content = content.replace(regex, value);
    });

    // 增加使用次数
    await this.incrementPromptUseCount(promptId);

    return {
      originalContent: prompt.content,
      filledContent: content,
      variables,
      promptVariables: prompt.variables || [],
    };
  }

  // ===== PromptVariable 相关方法 =====
  async createPromptVariable(data: Omit<PromptVariable, 'id' | 'createdAt' | 'updatedAt'>): Promise<PromptVariable> {
    return this.add<PromptVariable>('promptVariables', data);
  }

  async getPromptVariablesByPromptId(promptId: number): Promise<PromptVariable[]> {
    return this.getByIndex<PromptVariable>('promptVariables', 'promptId', promptId);
  }

  async deletePromptVariable(id: number): Promise<void> {
    return this.delete('promptVariables', id);
  }

  // ===== AIConfig 相关方法 =====
  async createAIConfig(data: Omit<AIConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<AIConfig> {
    return this.add<AIConfig>('ai_configs', data);
  }

  async getAllAIConfigs(): Promise<AIConfig[]> {
    return this.getAll<AIConfig>('ai_configs');
  }

  async getEnabledAIConfigs(): Promise<AIConfig[]> {
    // 修改实现方式，先获取所有配置然后在内存中过滤
    // 而不是直接使用索引查询，避免 IndexedDB 对布尔值索引的处理问题
    const allConfigs = await this.getAllAIConfigs();
    return allConfigs.filter(config => config.enabled === true);
  }

  async getAIConfigById(id: number): Promise<AIConfig | null> {
    return this.getById<AIConfig>('ai_configs', id);
  }

  async getAIConfigByConfigId(configId: string): Promise<AIConfig | null> {
    const configs = await this.getByIndex<AIConfig>('ai_configs', 'configId', configId);
    return configs.length > 0 ? configs[0] : null;
  }

  async updateAIConfig(id: number, data: Partial<Omit<AIConfig, 'id' | 'createdAt' | 'updatedAt'>>): Promise<AIConfig> {
    return this.update<AIConfig>('ai_configs', id, data);
  }

  async updateAIConfigByConfigId(configId: string, data: Partial<Omit<AIConfig, 'id' | 'configId' | 'createdAt' | 'updatedAt'>>): Promise<AIConfig | null> {
    const config = await this.getAIConfigByConfigId(configId);
    if (!config || !config.id) {
      return null;
    }
    return this.updateAIConfig(config.id, data);
  }

  async deleteAIConfig(id: number): Promise<void> {
    return this.delete('ai_configs', id);
  }

  async deleteAIConfigByConfigId(configId: string): Promise<boolean> {
    const config = await this.getAIConfigByConfigId(configId);
    if (!config || !config.id) {
      return false;
    }
    await this.deleteAIConfig(config.id);
    return true;
  }

  async getAIConfigsByType(type: 'openai' | 'ollama'): Promise<AIConfig[]> {
    return this.getByIndex<AIConfig>('ai_configs', 'type', type);
  }

  async toggleAIConfigEnabled(id: number): Promise<AIConfig> {
    const config = await this.getById<AIConfig>('ai_configs', id);
    if (!config) {
      throw new Error('AI Config not found');
    }

    return this.update<AIConfig>('ai_configs', id, {
      enabled: !config.enabled,
    });
  }

  // ===== AIGenerationHistory 相关方法 =====
  async createAIGenerationHistory(data: Omit<AIGenerationHistory, 'id' | 'createdAt'>): Promise<AIGenerationHistory> {
    const historyData = {
      ...data,
      createdAt: new Date(),
    };
    return this.add<AIGenerationHistory>('ai_generation_history', historyData);
  }

  async getAllAIGenerationHistory(): Promise<AIGenerationHistory[]> {
    const histories = await this.getAll<AIGenerationHistory>('ai_generation_history');
    // 按创建时间降序排列
    return histories.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getAIGenerationHistoryById(id: number): Promise<AIGenerationHistory | null> {
    return this.getById<AIGenerationHistory>('ai_generation_history', id);
  }

  async getAIGenerationHistoryByHistoryId(historyId: string): Promise<AIGenerationHistory | null> {
    const histories = await this.getByIndex<AIGenerationHistory>('ai_generation_history', 'historyId', historyId);
    return histories.length > 0 ? histories[0] : null;
  }

  async getAIGenerationHistoryByConfigId(configId: string): Promise<AIGenerationHistory[]> {
    const histories = await this.getByIndex<AIGenerationHistory>('ai_generation_history', 'configId', configId);
    // 按创建时间降序排列
    return histories.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getAIGenerationHistoryByStatus(status: 'success' | 'error'): Promise<AIGenerationHistory[]> {
    const histories = await this.getByIndex<AIGenerationHistory>('ai_generation_history', 'status', status);
    // 按创建时间降序排列
    return histories.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async getAIGenerationHistoryPaginated(options?: {
    configId?: string;
    status?: 'success' | 'error';
    page?: number;
    limit?: number;
  }): Promise<{ data: AIGenerationHistory[]; total: number; hasMore: boolean }> {
    let histories = await this.getAll<AIGenerationHistory>('ai_generation_history');

    // 应用过滤器
    if (options?.configId) {
      histories = histories.filter(h => h.configId === options.configId);
    }

    if (options?.status) {
      histories = histories.filter(h => h.status === options.status);
    }

    // 按创建时间降序排列
    histories.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const total = histories.length;

    // 应用分页
    if (options?.page && options?.limit) {
      const offset = (options.page - 1) * options.limit;
      histories = histories.slice(offset, offset + options.limit);
    }

    const hasMore = options?.page && options?.limit ? 
      (options.page * options.limit) < total : 
      false;

    return {
      data: histories,
      total,
      hasMore
    };
  }

  async deleteAIGenerationHistory(id: number): Promise<void> {
    return this.delete('ai_generation_history', id);
  }

  async deleteAIGenerationHistoryByHistoryId(historyId: string): Promise<boolean> {
    const history = await this.getAIGenerationHistoryByHistoryId(historyId);
    if (!history || !history.id) {
      return false;
    }
    await this.deleteAIGenerationHistory(history.id);
    return true;
  }

  async deleteAIGenerationHistoryByConfigId(configId: string): Promise<number> {
    const histories = await this.getAIGenerationHistoryByConfigId(configId);
    let deletedCount = 0;

    for (const history of histories) {
      if (history.id) {
        await this.deleteAIGenerationHistory(history.id);
        deletedCount++;
      }
    }

    return deletedCount;
  }

  async clearAIGenerationHistory(): Promise<number> {
    const histories = await this.getAllAIGenerationHistory();
    let deletedCount = 0;

    for (const history of histories) {
      if (history.id) {
        await this.deleteAIGenerationHistory(history.id);
        deletedCount++;
      }
    }

    return deletedCount;
  }

  // 获取生成历史统计信息
  async getAIGenerationHistoryStats(): Promise<{
    total: number;
    success: number;
    error: number;
    byConfig: Record<string, { total: number; success: number; error: number }>;
  }> {
    const histories = await this.getAllAIGenerationHistory();
    
    const stats = {
      total: histories.length,
      success: 0,
      error: 0,
      byConfig: {} as Record<string, { total: number; success: number; error: number }>
    };

    histories.forEach(history => {
      // 统计总体状态
      if (history.status === 'success') {
        stats.success++;
      } else if (history.status === 'error') {
        stats.error++;
      }

      // 按配置ID统计
      if (!stats.byConfig[history.configId]) {
        stats.byConfig[history.configId] = { total: 0, success: 0, error: 0 };
      }
      
      stats.byConfig[history.configId].total++;
      if (history.status === 'success') {
        stats.byConfig[history.configId].success++;
      } else if (history.status === 'error') {
        stats.byConfig[history.configId].error++;
      }
    });

    return stats;
  }

  // PromptHistory 相关操作
  async createPromptHistory(history: Omit<PromptHistory, 'id'>): Promise<PromptHistory> {
    if (!this.db) throw new Error('Database not initialized');

    const transaction = this.db.transaction(['promptHistories'], 'readwrite');
    const store = transaction.objectStore('promptHistories');
    
    const historyWithTimestamp = {
      ...history,
      createdAt: new Date()
    };
    
    const request = store.add(historyWithTimestamp);
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        resolve({ ...historyWithTimestamp, id: request.result as number });
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getPromptHistoryByPromptId(promptId: number): Promise<PromptHistory[]> {
    if (!this.db) throw new Error('Database not initialized');

    const transaction = this.db.transaction(['promptHistories'], 'readonly');
    const store = transaction.objectStore('promptHistories');
    const index = store.index('promptId');
    const request = index.getAll(promptId);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const histories = request.result.sort((a, b) => 
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        resolve(histories);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getPromptHistoryById(id: number): Promise<PromptHistory | null> {
    if (!this.db) throw new Error('Database not initialized');

    const transaction = this.db.transaction(['promptHistories'], 'readonly');
    const store = transaction.objectStore('promptHistories');
    const request = store.get(id);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        resolve(request.result || null);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async deletePromptHistory(id: number): Promise<boolean> {
    if (!this.db) throw new Error('Database not initialized');

    const transaction = this.db.transaction(['promptHistories'], 'readwrite');
    const store = transaction.objectStore('promptHistories');
    const request = store.delete(id);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }

  async deletePromptHistoriesByPromptId(promptId: number): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    const histories = await this.getPromptHistoryByPromptId(promptId);
    let deletedCount = 0;

    for (const history of histories) {
      if (history.id) {
        await this.deletePromptHistory(history.id);
        deletedCount++;
      }
    }

    return deletedCount;
  }

  async getLatestPromptHistoryVersion(promptId: number): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    const histories = await this.getPromptHistoryByPromptId(promptId);
    return histories.length > 0 ? Math.max(...histories.map(h => h.version)) : 0;
  }

  // ===== Settings 相关方法 =====
  async createSetting(data: Omit<AppSettings, 'id' | 'createdAt' | 'updatedAt'>): Promise<AppSettings> {
    return this.add<AppSettings>('settings', data);
  }

  async getSettingByKey(key: string): Promise<AppSettings | null> {
    const settings = await this.getByIndex<AppSettings>('settings', 'key', key);
    return settings.length > 0 ? settings[0] : null;
  }

  async updateSettingByKey(key: string, value: string): Promise<AppSettings> {
    const existingSetting = await this.getSettingByKey(key);
    
    if (existingSetting && existingSetting.id) {
      return this.update<AppSettings>('settings', existingSetting.id, {
        value,
        updatedAt: new Date()
      });
    } else {
      // 创建新设置
      return this.createSetting({
        key,
        value,
        type: 'string',
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }
  }

  async deleteSetting(key: string): Promise<boolean> {
    const setting = await this.getSettingByKey(key);
    if (!setting || !setting.id) {
      return false;
    }
    await this.delete('settings', setting.id);
    return true;
  }

  // ===== AI Config 首选项管理 =====
  async setPreferredAIConfig(configId: number): Promise<void> {
    // 首先取消所有配置的首选项状态
    const allConfigs = await this.getAllAIConfigs();
    
    for (const config of allConfigs) {
      if (config.id && config.isPreferred) {
        await this.updateAIConfig(config.id, { isPreferred: false });
      }
    }

    // 设置新的首选配置
    const targetConfig = await this.getAIConfigById(configId);
    if (!targetConfig) {
      throw new Error('AI Config not found');
    }

    if (!targetConfig.enabled) {
      throw new Error('Cannot set disabled config as preferred');
    }

    await this.updateAIConfig(configId, { isPreferred: true });
  }

  async getPreferredAIConfig(): Promise<AIConfig | null> {
    const allConfigs = await this.getAllAIConfigs();
    const preferredConfig = allConfigs.find(config => config.isPreferred && config.enabled);
    
    if (preferredConfig) {
      return preferredConfig;
    }

    // 如果没有设置首选项，返回第一个启用的配置
    const enabledConfigs = allConfigs.filter(config => config.enabled);
    return enabledConfigs.length > 0 ? enabledConfigs[0] : null;
  }

  async clearPreferredAIConfig(): Promise<void> {
    const allConfigs = await this.getAllAIConfigs();
    
    for (const config of allConfigs) {
      if (config.id && config.isPreferred) {
        await this.updateAIConfig(config.id, { isPreferred: false });
      }
    }
  }

  /**
   * 检查指定的对象存储是否存在
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
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

// 创建单例实例
export const databaseService = new DatabaseService();

// 导出初始化函数
export const initDatabase = () => databaseService.initialize();
