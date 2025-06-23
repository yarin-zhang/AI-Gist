/**
 * 提示词数据服务
 * 提供提示词相关的数据库操作功能，包括变量管理和历史记录
 */

import { BaseDatabaseService } from './base-database.service';
import { 
  Prompt, 
  PromptWithRelations, 
  PromptVariable, 
  PromptHistory,
  Category, 
  PromptFilters, 
  PaginatedResult, 
  PromptFillResult 
} from '../types/database';
import { generateUUID } from '../utils/uuid';

/**
 * 提示词数据服务类
 * 继承基础数据库服务，提供提示词特定的数据操作方法
 * 包含提示词的CRUD操作、变量管理、历史记录、搜索和统计功能
 */
export class PromptService extends BaseDatabaseService {
  private static instance: PromptService;

  /**
   * 获取提示词服务单例实例
   * @returns PromptService 提示词服务实例
   */
  static getInstance(): PromptService {
    if (!PromptService.instance) {
      PromptService.instance = new PromptService();
    }
    return PromptService.instance;
  }

  /**
   * 创建新提示词
   * 向数据库中添加新的提示词记录，并支持同时创建关联的变量
   * @param data 提示词数据和变量数据
   * @returns Promise<PromptWithRelations> 创建成功的提示词记录（包含关联数据）
   */
  async createPrompt(data: Omit<Prompt, 'id' | 'uuid' | 'createdAt' | 'updatedAt'> & { 
    variables?: Omit<PromptVariable, 'id' | 'uuid' | 'promptId' | 'createdAt' | 'updatedAt'>[] 
  }): Promise<PromptWithRelations> {
    const { variables, ...promptData } = data;
    
    // 创建 prompt，自动生成UUID
    const prompt = await this.add<Prompt>('prompts', {
      ...promptData,
      uuid: generateUUID(),
      isFavorite: promptData.isFavorite || false,
      useCount: promptData.useCount || 0,
    });

    // 创建 variables，每个变量也生成UUID
    let createdVariables: PromptVariable[] = [];
    if (variables && variables.length > 0) {
      for (const variable of variables) {
        const createdVariable = await this.add<PromptVariable>('promptVariables', {
          ...variable,
          uuid: generateUUID(),
          promptId: prompt.id!,
        });
        createdVariables.push(createdVariable);
      }
    }

    // 获取 category
    const category = prompt.categoryId ? await this.getById<Category>('categories', prompt.categoryId) : undefined;

    return {
      ...prompt,
      category: category || undefined,
      variables: createdVariables,
    };
  }

  /**
   * 获取所有提示词（支持过滤和分页）
   * 根据提供的过滤条件查询提示词，支持搜索、分类过滤、标签过滤、收藏过滤等
   * @param filters PromptFilters 查询过滤条件
   * @returns Promise<PaginatedResult<PromptWithRelations>> 分页查询结果
   */
  async getAllPrompts(filters?: PromptFilters): Promise<PaginatedResult<PromptWithRelations>> {
    const prompts = await this.getAll<Prompt>('prompts');
    const categories = await this.getAll<Category>('categories');
    const variables = await this.getAll<PromptVariable>('promptVariables');

    let filteredPrompts = prompts;

    // 应用过滤器
    if (filters) {
      if (filters.categoryId !== undefined) {
        if (filters.categoryId === null) {
          // 查询未分类的提示词
          filteredPrompts = filteredPrompts.filter(prompt => !prompt.categoryId);
        } else {
          // 查询指定分类的提示词
          filteredPrompts = filteredPrompts.filter(prompt => prompt.categoryId === filters.categoryId);
        }
      }

      if (filters.search) {
        const searchQuery = filters.search.toLowerCase();
        filteredPrompts = filteredPrompts.filter(prompt => 
          prompt.title.toLowerCase().includes(searchQuery) ||
          prompt.content.toLowerCase().includes(searchQuery) ||
          (prompt.description && prompt.description.toLowerCase().includes(searchQuery))
        );
      }      if (filters.tags) {
        const searchTags = filters.tags.toLowerCase().split(',').map(tag => tag.trim());
        filteredPrompts = filteredPrompts.filter(prompt => {
          if (!prompt.tags || typeof prompt.tags !== 'string') return false;
          const promptTags = prompt.tags.toLowerCase().split(',').map(tag => tag.trim());
          return searchTags.some(searchTag => 
            promptTags.some(promptTag => promptTag.includes(searchTag))
          );
        });
      }

      if (filters.isFavorite !== undefined) {
        filteredPrompts = filteredPrompts.filter(prompt => prompt.isFavorite === filters.isFavorite);
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
            // 收藏相同时按更新时间排序
            return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
          });
          break;
        case 'title':
          filteredPrompts.sort((a, b) => a.title.localeCompare(b.title));
          break;
        case 'createdAt':
          filteredPrompts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          break;
        case 'updatedAt':
          filteredPrompts.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
          break;
        default:
          // 默认排序逻辑
          filteredPrompts.sort((a, b) => {
            // 收藏的排在前面
            if (a.isFavorite !== b.isFavorite) {
              return b.isFavorite ? 1 : -1;
            }
            // 使用次数多的排在前面
            if (a.useCount !== b.useCount) {
              return b.useCount - a.useCount;
            }
            // 最后按更新时间排序
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
    }    // 计算总数
    const total = filteredPrompts.length;
    
    // 调试信息
    console.log('getAllPrompts debug:', {
      filters,
      totalPrompts: prompts.length,
      filteredPromptsLength: filteredPrompts.length,
      total,
      page: filters?.page,
      limit: filters?.limit
    });

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

  /**
   * 获取所有提示词（用于标签分析）
   * 专门用于标签相关功能的简化查询，包含基本关联数据
   * @returns Promise<PromptWithRelations[]> 包含关联数据的提示词列表
   */
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

  /**
   * 根据ID获取提示词
   * 通过提示词ID查询特定提示词的详细信息，包含关联数据
   * @param id number 提示词的唯一标识符
   * @returns Promise<PromptWithRelations | null> 提示词记录，如果不存在则返回null
   */
  async getPromptById(id: number): Promise<PromptWithRelations | null> {
    const prompt = await this.getById<Prompt>('prompts', id);
    if (!prompt) return null;

    const category = prompt.categoryId ? await this.getById<Category>('categories', prompt.categoryId) : undefined;
    const variables = await this.getByIndex<PromptVariable>('promptVariables', 'promptId', id);

    return {
      ...prompt,
      category: category || undefined,
      variables,
    };
  }

  /**
   * 根据UUID获取提示词
   * 通过提示词UUID查询特定提示词的详细信息，包含关联数据
   * @param uuid string 提示词的UUID
   * @returns Promise<PromptWithRelations | null> 提示词记录，如果不存在则返回null
   */
  async getPromptByUUID(uuid: string): Promise<PromptWithRelations | null> {
    const prompt = await this.getByUUID<Prompt>('prompts', uuid);
    if (!prompt) return null;

    const category = prompt.categoryId ? await this.getById<Category>('categories', prompt.categoryId) : undefined;
    const variables = await this.getByIndex<PromptVariable>('promptVariables', 'promptId', prompt.id!);

    return {
      ...prompt,
      category: category || undefined,
      variables,
    };
  }

  /**
   * 更新提示词
   * 更新指定提示词的信息，支持同时更新关联的变量
   * @param id number 提示词ID
   * @param data 更新数据，包含提示词字段和变量数据
   * @returns Promise<PromptWithRelations> 更新后的完整提示词记录
   */
  async updatePrompt(
    id: number, 
    data: Partial<Omit<Prompt, 'id' | 'createdAt' | 'updatedAt'>> & { 
      variables?: Omit<PromptVariable, 'id' | 'promptId' | 'createdAt' | 'updatedAt'>[] 
    }
  ): Promise<PromptWithRelations> {
    const { variables, ...promptData } = data;
    
    // 更新 prompt
    const updatedPrompt = await this.update<Prompt>('prompts', id, promptData);

    // 处理 variables 更新
    if (variables !== undefined) {
      // 删除现有的 variables
      const existingVariables = await this.getByIndex<PromptVariable>('promptVariables', 'promptId', id);
      for (const variable of existingVariables) {
        if (variable.id) {
          await this.delete('promptVariables', variable.id);
        }
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

  /**
   * 根据UUID更新提示词
   * 通过UUID更新指定提示词的信息，支持同时更新关联的变量
   * @param uuid string 提示词UUID
   * @param data 更新数据，包含提示词字段和变量数据
   * @returns Promise<PromptWithRelations | null> 更新后的完整提示词记录
   */
  async updatePromptByUUID(
    uuid: string, 
    data: Partial<Omit<Prompt, 'id' | 'uuid' | 'createdAt' | 'updatedAt'>> & { 
      variables?: Omit<PromptVariable, 'id' | 'uuid' | 'promptId' | 'createdAt' | 'updatedAt'>[] 
    }
  ): Promise<PromptWithRelations | null> {
    const existingPrompt = await this.getByUUID<Prompt>('prompts', uuid);
    if (!existingPrompt || !existingPrompt.id) return null;

    const { variables, ...promptData } = data;
    
    // 更新 prompt
    const updatedPrompt = await this.update<Prompt>('prompts', existingPrompt.id, promptData);

    // 处理 variables 更新
    if (variables !== undefined) {
      // 删除现有的 variables
      const existingVariables = await this.getByIndex<PromptVariable>('promptVariables', 'promptId', existingPrompt.id);
      for (const variable of existingVariables) {
        if (variable.id) {
          await this.delete('promptVariables', variable.id);
        }
      }

      // 创建新的 variables，每个都生成UUID
      for (const variable of variables) {
        await this.add<PromptVariable>('promptVariables', {
          ...variable,
          uuid: generateUUID(),
          promptId: existingPrompt.id,
        });
      }
    }

    // 返回更新后的完整数据
    return this.getPromptByUUID(uuid);
  }

  /**
   * 删除提示词
   * 从数据库中永久删除指定提示词及其关联的变量和历史记录
   * @param id number 要删除的提示词ID
   * @returns Promise<void> 删除完成的Promise
   */
  async deletePrompt(id: number): Promise<void> {
    // 先删除关联的 variables
    const variables = await this.getByIndex<PromptVariable>('promptVariables', 'promptId', id);
    for (const variable of variables) {
      if (variable.id) {
        await this.delete('promptVariables', variable.id);
      }
    }
    
    // 删除关联的历史记录
    await this.deletePromptHistoriesByPromptId(id);
    
    // 删除 prompt
    await this.delete('prompts', id);
  }

  /**
   * 根据UUID删除提示词
   * 通过UUID删除指定提示词及其关联的变量和历史记录
   * @param uuid string 要删除的提示词UUID
   * @returns Promise<boolean> 删除是否成功
   */
  async deletePromptByUUID(uuid: string): Promise<boolean> {
    const prompt = await this.getByUUID<Prompt>('prompts', uuid);
    if (!prompt || !prompt.id) return false;

    // 先删除关联的 variables
    const variables = await this.getByIndex<PromptVariable>('promptVariables', 'promptId', prompt.id);
    for (const variable of variables) {
      if (variable.id) {
        await this.delete('promptVariables', variable.id);
      }
    }
    
    // 删除关联的历史记录
    await this.deletePromptHistoriesByPromptId(prompt.id);
    
    // 删除 prompt
    return this.deleteByUUID('prompts', uuid);
  }

  /**
   * 增加提示词使用次数
   * 当提示词被使用时调用，增加使用统计
   * @param id number 提示词ID
   * @returns Promise<Prompt> 更新后的提示词记录
   */
  async incrementPromptUseCount(id: number): Promise<Prompt> {
    const prompt = await this.getById<Prompt>('prompts', id);
    if (!prompt) {
      throw new Error('Prompt not found');
    }
    
    return this.update<Prompt>('prompts', id, {
      useCount: prompt.useCount + 1,
    });
  }

  /**
   * 减少提示词使用次数
   * 在某些情况下需要减少使用统计时调用
   * @param id number 提示词ID
   * @returns Promise<Prompt> 更新后的提示词记录
   */
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

  /**
   * 获取收藏的提示词
   * 查询所有被标记为收藏的提示词
   * @returns Promise<PaginatedResult<PromptWithRelations>> 收藏的提示词列表
   */
  async getFavoritePrompts(): Promise<PaginatedResult<PromptWithRelations>> {
    return this.getAllPrompts({ isFavorite: true });
  }

  /**
   * 切换提示词收藏状态
   * 切换指定提示词的收藏状态（收藏↔取消收藏）
   * @param id number 提示词ID
   * @returns Promise<PromptWithRelations> 更新后的提示词记录
   */
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

  /**
   * 填充提示词变量
   * 将提示词中的变量占位符替换为实际值，并增加使用次数
   * @param promptId number 提示词ID
   * @param variables Record<string, string> 变量名和值的键值对
   * @returns Promise<PromptFillResult> 变量填充结果
   */
  async fillPromptVariables(promptId: number, variables: Record<string, string>): Promise<PromptFillResult> {
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

  /**
   * 创建提示词变量
   * 为指定提示词添加新的变量定义
   * @param data Omit<PromptVariable, 'id' | 'uuid' | 'createdAt' | 'updatedAt'> 变量数据
   * @returns Promise<PromptVariable> 创建的变量记录
   */
  async createPromptVariable(data: Omit<PromptVariable, 'id' | 'uuid' | 'createdAt' | 'updatedAt'>): Promise<PromptVariable> {
    const variableWithUUID = {
      ...data,
      uuid: generateUUID()
    };
    return this.add<PromptVariable>('promptVariables', variableWithUUID);
  }

  /**
   * 根据提示词ID获取变量
   * 查询指定提示词的所有变量定义
   * @param promptId number 提示词ID
   * @returns Promise<PromptVariable[]> 该提示词的变量列表
   */
  async getPromptVariablesByPromptId(promptId: number): Promise<PromptVariable[]> {
    return this.getByIndex<PromptVariable>('promptVariables', 'promptId', promptId);
  }

  /**
   * 删除提示词变量
   * 删除指定的变量定义
   * @param id number 变量ID
   * @returns Promise<void> 删除完成的Promise
   */
  async deletePromptVariable(id: number): Promise<void> {
    return this.delete('promptVariables', id);
  }

  /**
   * 创建提示词历史记录
   * 在提示词被修改时创建历史版本记录
   * @param history Omit<PromptHistory, 'id' | 'uuid'> 历史记录数据
   * @returns Promise<PromptHistory> 创建的历史记录
   */
  async createPromptHistory(history: Omit<PromptHistory, 'id' | 'uuid'>): Promise<PromptHistory> {
    if (!this.db) throw new Error('Database not initialized');

    const transaction = this.db.transaction(['promptHistories'], 'readwrite');
    const store = transaction.objectStore('promptHistories');
    
    const historyWithUUIDAndTimestamp = {
      ...history,
      uuid: generateUUID(),
      createdAt: new Date()
    };
    
    const request = store.add(historyWithUUIDAndTimestamp);
    
    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        resolve({
          ...historyWithUUIDAndTimestamp,
          id: request.result as number
        });
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 获取提示词的历史记录
   * 查询指定提示词的所有历史版本
   * @param promptId number 提示词ID
   * @returns Promise<PromptHistory[]> 历史记录列表，按版本号排序
   */
  async getPromptHistoryByPromptId(promptId: number): Promise<PromptHistory[]> {
    if (!this.db) throw new Error('Database not initialized');

    const transaction = this.db.transaction(['promptHistories'], 'readonly');
    const store = transaction.objectStore('promptHistories');
    const index = store.index('promptId');
    const request = index.getAll(promptId);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        const histories = request.result as PromptHistory[];
        // 按版本号降序排列
        histories.sort((a, b) => b.version - a.version);
        resolve(histories);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 根据ID获取历史记录
   * 查询特定的历史记录详情
   * @param id number 历史记录ID
   * @returns Promise<PromptHistory | null> 历史记录，如果不存在则返回null
   */
  async getPromptHistoryById(id: number): Promise<PromptHistory | null> {
    if (!this.db) throw new Error('Database not initialized');

    const transaction = this.db.transaction(['promptHistories'], 'readonly');
    const store = transaction.objectStore('promptHistories');
    const request = store.get(id);

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        resolve(request.result as PromptHistory || null);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 删除历史记录
   * 删除指定的历史记录
   * @param id number 历史记录ID
   * @returns Promise<boolean> 删除是否成功
   */
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

  /**
   * 删除提示词的所有历史记录
   * 删除指定提示词的所有历史版本
   * @param promptId number 提示词ID
   * @returns Promise<number> 删除的记录数量
   */
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

  /**
   * 获取提示词的最新历史版本号
   * 查询指定提示词的最大版本号，用于创建新版本时的版本号生成
   * @param promptId number 提示词ID
   * @returns Promise<number> 最新版本号
   */
  async getLatestPromptHistoryVersion(promptId: number): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    const histories = await this.getPromptHistoryByPromptId(promptId);
    return histories.length > 0 ? Math.max(...histories.map(h => h.version)) : 0;
  }

  /**
   * 获取提示词统计信息
   * 返回提示词相关的统计数据
   * @returns Promise<提示词统计信息> 包含总数量、收藏数量、分类分布等统计信息
   */
  async getPromptStats(): Promise<{
    totalPrompts: number;
    favoritePrompts: number;
    totalUseCount: number;
    categoryDistribution: Record<string, number>;
    tagDistribution: Record<string, number>;
    recentPrompts: PromptWithRelations[];
  }> {
    const allPrompts = await this.getAllPromptsForTags();
    const favoriteCount = allPrompts.filter(p => p.isFavorite).length;
    const totalUseCount = allPrompts.reduce((sum, p) => sum + p.useCount, 0);

    // 分类分布统计
    const categoryDistribution: Record<string, number> = {};
    allPrompts.forEach(prompt => {
      const categoryName = prompt.category?.name || '未分类';
      categoryDistribution[categoryName] = (categoryDistribution[categoryName] || 0) + 1;
    });

    // 标签分布统计
    const tagDistribution: Record<string, number> = {};
    allPrompts.forEach(prompt => {
      if (prompt.tags) {
        const tags = prompt.tags.split(',').map(tag => tag.trim());
        tags.forEach(tag => {
          if (tag) {
            tagDistribution[tag] = (tagDistribution[tag] || 0) + 1;
          }
        });
      }
    });

    // 最近的提示词
    const recentPrompts = allPrompts
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 5);

    return {
      totalPrompts: allPrompts.length,
      favoritePrompts: favoriteCount,
      totalUseCount,
      categoryDistribution,
      tagDistribution,
      recentPrompts
    };
  }

  /**
   * 获取提示词统计信息
   * 返回总数、分类统计、热门标签等信息，用于前端显示
   * @returns Promise<{totalCount: number, categoryStats: Array, popularTags: Array}> 统计信息
   */
  async getPromptStatistics(): Promise<{
    totalCount: number,
    categoryStats: Array<{id: string | null, name: string, count: number}>,
    popularTags: Array<{name: string, count: number}>
  }> {
    const prompts = await this.getAll<Prompt>('prompts');
    const categories = await this.getAll<Category>('categories');

    // 计算分类统计
    const categoryStats = [];
    
    // 未分类数量
    const uncategorizedCount = prompts.filter(p => !p.categoryId).length;
    if (uncategorizedCount > 0) {
      categoryStats.push({
        id: null,
        name: '未分类',
        count: uncategorizedCount
      });
    }

    // 各分类数量
    categories.forEach(category => {
      const count = prompts.filter(p => p.categoryId === category.id).length;
      if (count > 0) {
        categoryStats.push({
          id: category.id,
          name: category.name,
          count
        });
      }
    });    // 计算热门标签
    const tagCounts = new Map<string, number>();
    prompts.forEach(prompt => {
      if (prompt.tags && typeof prompt.tags === 'string') {
        const tags = prompt.tags.split(',').map(tag => tag.trim()).filter(tag => tag);
        tags.forEach(tag => {
          tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
        });
      }
    });

    const popularTags = Array.from(tagCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20); // 只返回前20个热门标签

    return {
      totalCount: prompts.length,
      categoryStats,
      popularTags
    };
  }
}
