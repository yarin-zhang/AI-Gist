/**
 * 提示词API客户端
 * 提供提示词相关的API调用接口
 */

import { PromptService } from '../services/prompt.service';
import { 
  Prompt, 
  PromptWithRelations, 
  PromptVariable, 
  PromptHistory,
  PromptFilters, 
  PaginatedResult, 
  PromptFillResult 
} from '@shared/types/database';

/**
 * 提示词API客户端类
 * 封装提示词服务，提供统一的API调用接口
 */
export class PromptApiClient {
  private promptService: PromptService;

  constructor() {
    this.promptService = PromptService.getInstance();
  }

  /**
   * 提示词相关的API接口
   */
  prompts = {
    /**
     * 创建提示词
     */
    create: {
      /**
       * 创建新提示词，支持同时创建变量
       * @param input 提示词创建数据
       * @returns Promise<PromptWithRelations> 创建的提示词记录（包含关联数据）
       */
      mutate: async (input: Omit<Prompt, 'id' | 'createdAt' | 'updatedAt'> & { 
        variables?: Omit<PromptVariable, 'id' | 'promptId' | 'createdAt' | 'updatedAt'>[] 
      }): Promise<PromptWithRelations> => {
        return this.promptService.createPrompt(input);
      }
    },

    /**
     * 查询所有提示词（支持过滤和分页）
     */
    getAll: {
      /**
       * 获取提示词列表，支持过滤和分页
       * @param filters 过滤条件
       * @returns Promise<PaginatedResult<PromptWithRelations>> 分页查询结果
       */
      query: async (filters?: PromptFilters): Promise<PaginatedResult<PromptWithRelations>> => {
        return this.promptService.getAllPrompts(filters);
      }
    },

    /**
     * 获取所有提示词（用于标签分析）
     */
    getAllForTags: {
      /**
       * 获取所有提示词，用于标签相关功能
       * @returns Promise<PromptWithRelations[]> 提示词列表（包含关联数据）
       */
      query: async (): Promise<PromptWithRelations[]> => {
        return this.promptService.getAllPromptsForTags();
      }
    },

    /**
     * 获取提示词统计信息
     */
    getStatistics: {
      /**
       * 获取提示词统计信息，包括总数、分类统计、热门标签等
       * @returns Promise<{totalCount: number, categoryStats: Array, popularTags: Array}> 统计信息
       */
      query: async (): Promise<{
        totalCount: number,
        categoryStats: {id: string | null, name: string, count: number}[],
        popularTags: {name: string, count: number}[]
      }> => {
        return this.promptService.getPromptStatistics();
      }
    },

    /**
     * 根据ID查询提示词
     */
    getById: {
      /**
       * 根据ID获取提示词信息
       * @param id 提示词ID
       * @returns Promise<PromptWithRelations | null> 提示词信息（包含关联数据）
       */
      query: async (id: number): Promise<PromptWithRelations | null> => {
        return this.promptService.getPromptById(id);
      }
    },

    /**
     * 更新提示词
     */
    update: {
      /**
       * 更新提示词信息，支持同时更新变量
       * @param input 更新数据，包含id和要更新的字段
       * @returns Promise<PromptWithRelations> 更新后的提示词记录
       */
      mutate: async (input: { 
        id: number; 
        data: Partial<Omit<Prompt, 'id' | 'createdAt' | 'updatedAt'>> & { 
          variables?: Omit<PromptVariable, 'id' | 'promptId' | 'createdAt' | 'updatedAt'>[] 
        }
      }): Promise<PromptWithRelations> => {
        const { id, data } = input;
        return this.promptService.updatePrompt(id, data);
      }
    },

    /**
     * 删除提示词
     */
    delete: {
      /**
       * 删除提示词及其关联数据
       * @param id 提示词ID
       * @returns Promise<{ id: number }> 删除的提示词ID
       */
      mutate: async (id: number): Promise<{ id: number }> => {
        await this.promptService.deletePrompt(id);
        return { id };
      }
    },

    /**
     * 批量删除提示词
     */
    batchDelete: {
      /**
       * 批量删除多个提示词及其关联数据
       * @param ids 提示词ID数组
       * @returns Promise<{ success: number; failed: number }> 删除结果统计
       */
      mutate: async (ids: number[]): Promise<{ success: number; failed: number }> => {
        return this.promptService.batchDeletePrompts(ids);
      }
    },

    /**
     * 增加使用次数
     */
    incrementUseCount: {
      /**
       * 增加提示词使用次数
       * @param id 提示词ID
       * @returns Promise<Prompt> 更新后的提示词记录
       */
      mutate: async (id: number): Promise<Prompt> => {
        return this.promptService.incrementPromptUseCount(id);
      }
    },

    /**
     * 减少使用次数
     */
    decrementUseCount: {
      /**
       * 减少提示词使用次数
       * @param id 提示词ID
       * @returns Promise<Prompt> 更新后的提示词记录
       */
      mutate: async (id: number): Promise<Prompt> => {
        return this.promptService.decrementPromptUseCount(id);
      }
    },

    /**
     * 填充变量
     */
    fillVariables: {
      /**
       * 填充提示词变量并返回结果
       * @param input 变量填充数据
       * @returns Promise<PromptFillResult> 变量填充结果
       */
      mutate: async (input: { 
        promptId: number; 
        variables: Record<string, string> 
      }): Promise<PromptFillResult> => {
        const { promptId, variables } = input;
        return this.promptService.fillPromptVariables(promptId, variables);
      }
    },

    /**
     * 获取收藏的提示词
     */
    getFavorites: {
      /**
       * 获取所有收藏的提示词
       * @returns Promise<PaginatedResult<PromptWithRelations>> 收藏的提示词列表
       */
      query: async (): Promise<PaginatedResult<PromptWithRelations>> => {
        return this.promptService.getFavoritePrompts();
      }
    },

    /**
     * 切换收藏状态
     */
    toggleFavorite: {
      /**
       * 切换提示词收藏状态
       * @param id 提示词ID
       * @returns Promise<PromptWithRelations> 更新后的提示词记录
       */
      mutate: async (id: number): Promise<PromptWithRelations> => {
        return this.promptService.togglePromptFavorite(id);
      }
    },

    /**
     * 获取统计信息
     */
    getStats: {
      /**
       * 获取提示词统计数据
       * @returns Promise<提示词统计信息> 统计信息
       */
      query: async (): Promise<{
        totalPrompts: number;
        favoritePrompts: number;
        totalUseCount: number;
        categoryDistribution: Record<string, number>;
        tagDistribution: Record<string, number>;
        recentPrompts: PromptWithRelations[];
      }> => {
        return this.promptService.getPromptStats();
      }
    }
  };

  /**
   * 提示词变量相关的API接口
   */
  promptVariables = {
    /**
     * 创建变量
     */
    create: {
      /**
       * 创建提示词变量
       * @param input 变量创建数据
       * @returns Promise<PromptVariable> 创建的变量记录
       */
      mutate: async (input: Omit<PromptVariable, 'id' | 'createdAt' | 'updatedAt'>): Promise<PromptVariable> => {
        return this.promptService.createPromptVariable(input);
      }
    },

    /**
     * 根据提示词ID获取变量
     */
    getByPromptId: {
      /**
       * 获取指定提示词的所有变量
       * @param promptId 提示词ID
       * @returns Promise<PromptVariable[]> 变量列表
       */
      query: async (promptId: number): Promise<PromptVariable[]> => {
        return this.promptService.getPromptVariablesByPromptId(promptId);
      }
    },

    /**
     * 删除变量
     */
    delete: {
      /**
       * 删除提示词变量
       * @param id 变量ID
       * @returns Promise<{ id: number }> 删除的变量ID
       */
      mutate: async (id: number): Promise<{ id: number }> => {
        await this.promptService.deletePromptVariable(id);
        return { id };
      }
    }
  };

  /**
   * 提示词历史记录相关的API接口
   */
  promptHistories = {
    /**
     * 检查历史记录表是否存在
     */
    checkExists: {
      /**
       * 检查历史记录表是否存在
       * @returns Promise<boolean> 表是否存在
       */
      query: async (): Promise<boolean> => {
        return this.promptService.checkObjectStoreExists('promptHistories');
      }
    },

    /**
     * 创建历史记录
     */
    create: {
      /**
       * 创建提示词历史记录
       * @param input 历史记录创建数据
       * @returns Promise<PromptHistory> 创建的历史记录
       */
      mutate: async (input: Omit<PromptHistory, 'id'>): Promise<PromptHistory> => {
        return this.promptService.createPromptHistory(input);
      }
    },

    /**
     * 根据提示词ID获取历史记录
     */
    getByPromptId: {
      /**
       * 获取指定提示词的所有历史记录
       * @param promptId 提示词ID
       * @returns Promise<PromptHistory[]> 历史记录列表
       */
      query: async (promptId: number): Promise<PromptHistory[]> => {
        return this.promptService.getPromptHistoryByPromptId(promptId);
      }
    },

    /**
     * 根据ID获取历史记录
     */
    getById: {
      /**
       * 根据ID获取历史记录
       * @param id 历史记录ID
       * @returns Promise<PromptHistory | null> 历史记录
       */
      query: async (id: number): Promise<PromptHistory | null> => {
        return this.promptService.getPromptHistoryById(id);
      }
    },

    /**
     * 删除历史记录
     */
    delete: {
      /**
       * 删除历史记录
       * @param id 历史记录ID
       * @returns Promise<{ id: number }> 删除的历史记录ID
       */
      mutate: async (id: number): Promise<{ id: number }> => {
        await this.promptService.deletePromptHistory(id);
        return { id };
      }
    },

    /**
     * 根据提示词ID删除所有历史记录
     */
    deleteByPromptId: {
      /**
       * 删除指定提示词的所有历史记录
       * @param promptId 提示词ID
       * @returns Promise<number> 删除的记录数量
       */
      mutate: async (promptId: number): Promise<number> => {
        return this.promptService.deletePromptHistoriesByPromptId(promptId);
      }
    },

    /**
     * 获取最新版本号
     */
    getLatestVersion: {
      /**
       * 获取指定提示词的最新版本号
       * @param promptId 提示词ID
       * @returns Promise<number> 最新版本号
       */
      query: async (promptId: number): Promise<number> => {
        return this.promptService.getLatestPromptHistoryVersion(promptId);
      }
    },

    /**
     * 更新历史记录
     */
    update: {
      /**
       * 更新历史记录信息
       * @param input 更新数据，包含id和要更新的字段
       * @returns Promise<PromptHistory> 更新后的历史记录
       */
      mutate: async (input: { 
        id: number; 
        data: Partial<Omit<PromptHistory, 'id' | 'uuid' | 'promptId' | 'version' | 'createdAt'>>
      }): Promise<PromptHistory> => {
        const { id, data } = input;
        return this.promptService.updatePromptHistory(id, data);
      }
    }
  };
}

/**
 * 创建提示词API客户端实例的工厂函数
 * @returns PromptApiClient 提示词API客户端实例
 */
export function createPromptApiClient(): PromptApiClient {
  return new PromptApiClient();
}
