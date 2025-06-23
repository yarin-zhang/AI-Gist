/**
 * AI生成历史API客户端
 * 提供AI生成历史相关的API调用接口
 */

import { AIGenerationHistoryService } from '../services/ai-generation-history.service';
import { AIGenerationHistory } from '@shared/types/ai';
import { 
  AIGenerationHistoryOptions, 
  AIGenerationHistoryStats, 
  PaginatedResult 
} from '@shared/types/database';

/**
 * AI生成历史API客户端类
 * 封装AI生成历史服务，提供统一的API调用接口
 */
export class AIGenerationHistoryApiClient {
  private aiGenerationHistoryService: AIGenerationHistoryService;

  constructor() {
    this.aiGenerationHistoryService = AIGenerationHistoryService.getInstance();
  }

  /**
   * AI生成历史相关的API接口
   */
  aiGenerationHistory = {
    /**
     * 创建AI生成历史记录
     */
    create: {
      /**
       * 创建新的AI生成历史记录
       * @param input 历史记录创建数据
       * @returns Promise<AIGenerationHistory> 创建的历史记录
       */
      mutate: async (input: Omit<AIGenerationHistory, 'id' | 'createdAt'>): Promise<AIGenerationHistory> => {
        return this.aiGenerationHistoryService.createAIGenerationHistory(input);
      }
    },

    /**
     * 查询所有AI生成历史记录
     */
    getAll: {
      /**
       * 获取所有AI生成历史记录
       * @returns Promise<AIGenerationHistory[]> 历史记录列表
       */
      query: async (): Promise<AIGenerationHistory[]> => {
        return this.aiGenerationHistoryService.getAllAIGenerationHistory();
      }
    },

    /**
     * 根据ID查询历史记录
     */
    getById: {
      /**
       * 根据ID获取历史记录信息
       * @param id 历史记录ID
       * @returns Promise<AIGenerationHistory | null> 历史记录信息
       */
      query: async (id: number): Promise<AIGenerationHistory | null> => {
        return this.aiGenerationHistoryService.getAIGenerationHistoryById(id);
      }
    },

    /**
     * 根据业务历史ID查询记录
     */
    getByHistoryId: {
      /**
       * 根据业务历史ID获取历史记录信息
       * @param historyId 业务历史ID
       * @returns Promise<AIGenerationHistory | null> 历史记录信息
       */
      query: async (historyId: string): Promise<AIGenerationHistory | null> => {
        return this.aiGenerationHistoryService.getAIGenerationHistoryByHistoryId(historyId);
      }
    },

    /**
     * 根据配置ID查询历史记录
     */
    getByConfigId: {
      /**
       * 根据AI配置ID获取历史记录列表
       * @param configId AI配置ID
       * @returns Promise<AIGenerationHistory[]> 历史记录列表
       */
      query: async (configId: string): Promise<AIGenerationHistory[]> => {
        return this.aiGenerationHistoryService.getAIGenerationHistoryByConfigId(configId);
      }
    },

    /**
     * 根据状态查询历史记录
     */
    getByStatus: {
      /**
       * 根据生成状态获取历史记录列表
       * @param status 生成状态
       * @returns Promise<AIGenerationHistory[]> 历史记录列表
       */
      query: async (status: 'success' | 'error'): Promise<AIGenerationHistory[]> => {
        return this.aiGenerationHistoryService.getAIGenerationHistoryByStatus(status);
      }
    },

    /**
     * 分页查询历史记录
     */
    getPaginated: {
      /**
       * 分页获取AI生成历史记录
       * @param options 查询选项
       * @returns Promise<PaginatedResult<AIGenerationHistory>> 分页查询结果
       */
      query: async (options?: AIGenerationHistoryOptions): Promise<PaginatedResult<AIGenerationHistory>> => {
        return this.aiGenerationHistoryService.getAIGenerationHistoryPaginated(options);
      }
    },

    /**
     * 获取最近的历史记录
     */
    getRecent: {
      /**
       * 获取最近的AI生成历史记录
       * @param limit 返回记录数量
       * @returns Promise<AIGenerationHistory[]> 最近的历史记录列表
       */
      query: async (limit: number = 10): Promise<AIGenerationHistory[]> => {
        return this.aiGenerationHistoryService.getRecentAIGenerationHistory(limit);
      }
    },

    /**
     * 获取成功的历史记录
     */
    getSuccessful: {
      /**
       * 获取所有成功的历史记录
       * @returns Promise<AIGenerationHistory[]> 成功的历史记录列表
       */
      query: async (): Promise<AIGenerationHistory[]> => {
        return this.aiGenerationHistoryService.getSuccessfulGenerationHistory();
      }
    },

    /**
     * 获取失败的历史记录
     */
    getFailed: {
      /**
       * 获取所有失败的历史记录
       * @returns Promise<AIGenerationHistory[]> 失败的历史记录列表
       */
      query: async (): Promise<AIGenerationHistory[]> => {
        return this.aiGenerationHistoryService.getFailedGenerationHistory();
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
        await this.aiGenerationHistoryService.deleteAIGenerationHistory(id);
        return { id };
      }
    },

    /**
     * 根据业务历史ID删除记录
     */
    deleteByHistoryId: {
      /**
       * 根据业务历史ID删除历史记录
       * @param historyId 业务历史ID
       * @returns Promise<{ historyId: string; deleted: boolean }> 删除结果
       */
      mutate: async (historyId: string): Promise<{ historyId: string; deleted: boolean }> => {
        const deleted = await this.aiGenerationHistoryService.deleteAIGenerationHistoryByHistoryId(historyId);
        return { historyId, deleted };
      }
    },

    /**
     * 根据配置ID删除所有历史记录
     */
    deleteByConfigId: {
      /**
       * 根据AI配置ID删除所有历史记录
       * @param configId AI配置ID
       * @returns Promise<{ configId: string; deletedCount: number }> 删除结果
       */
      mutate: async (configId: string): Promise<{ configId: string; deletedCount: number }> => {
        const deletedCount = await this.aiGenerationHistoryService.deleteAIGenerationHistoryByConfigId(configId);
        return { configId, deletedCount };
      }
    },

    /**
     * 清空所有历史记录
     */
    clear: {
      /**
       * 清空所有AI生成历史记录
       * @returns Promise<{ deletedCount: number }> 删除结果
       */
      mutate: async (): Promise<{ deletedCount: number }> => {
        const deletedCount = await this.aiGenerationHistoryService.clearAIGenerationHistory();
        return { deletedCount };
      }
    },

    /**
     * 批量删除历史记录
     */
    batchDelete: {
      /**
       * 批量删除历史记录
       * @param ids 历史记录ID数组
       * @returns Promise<{ success: number; failed: number }> 删除结果统计
       */
      mutate: async (ids: number[]): Promise<{ success: number; failed: number }> => {
        return this.aiGenerationHistoryService.batchDeleteHistory(ids);
      }
    },

    /**
     * 搜索历史记录
     */
    search: {
      /**
       * 搜索AI生成历史记录
       * @param query 搜索关键词
       * @returns Promise<AIGenerationHistory[]> 匹配的历史记录列表
       */
      query: async (query: string): Promise<AIGenerationHistory[]> => {
        return this.aiGenerationHistoryService.searchAIGenerationHistory(query);
      }
    },

    /**
     * 获取统计信息
     */
    getStats: {
      /**
       * 获取AI生成历史统计数据
       * @returns Promise<AIGenerationHistoryStats> 统计信息
       */
      query: async (): Promise<AIGenerationHistoryStats> => {
        return this.aiGenerationHistoryService.getAIGenerationHistoryStats();
      }
    },

    /**
     * 获取配置的生成统计
     */
    getConfigStats: {
      /**
       * 获取指定配置的生成统计信息
       * @param configId AI配置ID
       * @returns Promise<配置统计信息> 配置统计信息
       */
      query: async (configId: string): Promise<{
        total: number;
        success: number;
        error: number;
        recentHistory: AIGenerationHistory[];
      }> => {
        return this.aiGenerationHistoryService.getConfigGenerationStats(configId);
      }
    },

    /**
     * 获取按日期分组的统计
     */
    getStatsByDate: {
      /**
       * 获取按日期分组的历史统计信息
       * @param days 统计天数
       * @returns Promise<Record<string, { total: number; success: number; error: number }>> 按日期分组的统计
       */
      query: async (days: number = 30): Promise<Record<string, { 
        total: number; 
        success: number; 
        error: number 
      }>> => {
        return this.aiGenerationHistoryService.getHistoryStatsByDate(days);
      }
    },

    /**
     * 获取最常用的模型
     */
    getMostUsedModels: {
      /**
       * 获取使用频率最高的模型
       * @param limit 返回模型数量
       * @returns Promise<Array<{ model: string; count: number }>> 模型使用统计
       */
      query: async (limit: number = 10): Promise<Array<{ model: string; count: number }>> => {
        return this.aiGenerationHistoryService.getMostUsedModels(limit);
      }
    },

    /**
     * 根据提示词ID获取调试历史记录
     */
    getDebugHistoryByPromptId: {
      /**
       * 根据提示词ID获取调试历史记录
       * @param promptId 提示词ID
       * @returns Promise<AIGenerationHistory[]> 调试历史记录列表
       */
      query: async (promptId: number): Promise<AIGenerationHistory[]> => {
        return this.aiGenerationHistoryService.getDebugHistoryByPromptId(promptId);
      }
    }
  };
}

/**
 * 创建AI生成历史API客户端实例的工厂函数
 * @returns AIGenerationHistoryApiClient AI生成历史API客户端实例
 */
export function createAIGenerationHistoryApiClient(): AIGenerationHistoryApiClient {
  return new AIGenerationHistoryApiClient();
}
