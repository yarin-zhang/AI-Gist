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
  private readonly dbVersion = 1;

  /**
   * 初始化数据库
   */
  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => {
        reject(new Error('Failed to open database'));
      };

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
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
          postStore.createIndex('authorId', 'authorId');
        }

        // 创建 categories 表
        if (!db.objectStoreNames.contains('categories')) {
          const categoryStore = db.createObjectStore('categories', { keyPath: 'id', autoIncrement: true });
          categoryStore.createIndex('name', 'name', { unique: true });
        }

        // 创建 prompts 表
        if (!db.objectStoreNames.contains('prompts')) {
          const promptStore = db.createObjectStore('prompts', { keyPath: 'id', autoIncrement: true });
          promptStore.createIndex('categoryId', 'categoryId');
          promptStore.createIndex('isFavorite', 'isFavorite');
          promptStore.createIndex('useCount', 'useCount');
          promptStore.createIndex('title', 'title');
        }

        // 创建 promptVariables 表
        if (!db.objectStoreNames.contains('promptVariables')) {
          const variableStore = db.createObjectStore('promptVariables', { keyPath: 'id', autoIncrement: true });
          variableStore.createIndex('promptId', 'promptId');
        }
      };
    });
  }

  /**
   * 确保数据库已初始化
   */
  private ensureDB(): IDBDatabase {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    return this.db;
  }

  /**
   * 通用的添加方法
   */
  private async add<T>(storeName: string, data: Omit<T, 'id'>): Promise<T> {
    const db = this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      
      const now = new Date();
      const dataWithTimestamps = {
        ...data,
        createdAt: now,
        updatedAt: now,
      };

      const request = store.add(dataWithTimestamps);

      request.onsuccess = () => {
        resolve({ ...dataWithTimestamps, id: request.result } as T);
      };

      request.onerror = () => {
        reject(new Error(`Failed to add to ${storeName}`));
      };
    });
  }

  /**
   * 通用的查询所有方法
   */
  private async getAll<T>(storeName: string): Promise<T[]> {
    const db = this.ensureDB();
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
   */
  private async getById<T>(storeName: string, id: number): Promise<T | null> {
    const db = this.ensureDB();
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
   */
  private async update<T>(storeName: string, id: number, updates: Partial<T>): Promise<T> {
    const db = this.ensureDB();
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

        const updatedData = {
          ...existingData,
          ...updates,
          updatedAt: new Date(),
        };

        const putRequest = store.put(updatedData);
        
        putRequest.onsuccess = () => {
          resolve(updatedData);
        };

        putRequest.onerror = () => {
          reject(new Error(`Failed to update in ${storeName}`));
        };
      };

      getRequest.onerror = () => {
        reject(new Error(`Failed to get record for update in ${storeName}`));
      };
    });
  }

  /**
   * 通用的删除方法
   */
  private async delete(storeName: string, id: number): Promise<void> {
    const db = this.ensureDB();
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
  private async getByIndex<T>(storeName: string, indexName: string, value: any): Promise<T[]> {
    const db = this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      const index = store.index(indexName);
      const request = index.getAll(value);

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(new Error(`Failed to get by index from ${storeName}`));
      };
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
  }): Promise<PromptWithRelations[]> {
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
          
          // 搜索标签
          const matchesTags = p.tags && 
            p.tags.toLowerCase().split(',')
              .some(tag => tag.trim().includes(searchLower));
          
          return matchesBasicFields || matchesTags;
        });
      }

      if (filters.tags) {
        const tagsLower = filters.tags.toLowerCase();
        filteredPrompts = filteredPrompts.filter(p => 
          p.tags && p.tags.toLowerCase().includes(tagsLower)
        );
      }

      if (filters.isFavorite !== undefined) {
        filteredPrompts = filteredPrompts.filter(p => p.isFavorite === filters.isFavorite);
      }
    }

    // 排序：收藏 > 使用次数 > 更新时间
    filteredPrompts.sort((a, b) => {
      if (a.isFavorite !== b.isFavorite) {
        return b.isFavorite ? 1 : -1;
      }
      if (a.useCount !== b.useCount) {
        return b.useCount - a.useCount;
      }
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

    // 组装关联数据
    return filteredPrompts.map(prompt => ({
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
