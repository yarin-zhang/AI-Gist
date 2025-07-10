/**
 * AI生成历史数据服务
 * 提供AI生成历史记录相关的数据库操作功能
 */

import { BaseDatabaseService } from './base-database.service';
import { AIGenerationHistory } from '@shared/types/ai';
import { AIGenerationHistoryOptions, AIGenerationHistoryStats, PaginatedResult } from '@shared/types/database';
import { generateUUID } from '../utils/uuid';

/**
 * AI生成历史数据服务类
 * 继承基础数据库服务，提供AI生成历史特定的数据操作方法
 * 包含历史记录的CRUD操作、分页查询、统计分析等功能
 */
export class AIGenerationHistoryService extends BaseDatabaseService {
  private static instance: AIGenerationHistoryService;

  /**
   * 获取AI生成历史服务单例实例
   * @returns AIGenerationHistoryService AI生成历史服务实例
   */
  static getInstance(): AIGenerationHistoryService {
    if (!AIGenerationHistoryService.instance) {
      AIGenerationHistoryService.instance = new AIGenerationHistoryService();
    }
    return AIGenerationHistoryService.instance;
  }

  /**
   * 创建新的AI生成历史记录
   * 向数据库中添加新的AI生成历史记录
   * @param data Omit<AIGenerationHistory, 'id' | 'uuid' | 'createdAt'> 历史记录数据（不包含自动生成的字段）
   * @returns Promise<AIGenerationHistory> 创建成功的历史记录（包含生成的ID、UUID和时间戳）
   */
  async createAIGenerationHistory(data: Omit<AIGenerationHistory, 'id' | 'uuid' | 'createdAt'>): Promise<AIGenerationHistory> {
    const historyData = {
      ...data,
      uuid: generateUUID(),
      createdAt: new Date(),
    };
    return this.add<AIGenerationHistory>('ai_generation_history', historyData);
  }

  /**
   * 获取所有AI生成历史记录
   * 查询数据库中的所有AI生成历史记录，按创建时间降序排列
   * @returns Promise<AIGenerationHistory[]> 所有历史记录的数组
   */
  async getAllAIGenerationHistory(): Promise<AIGenerationHistory[]> {
    const histories = await this.getAll<AIGenerationHistory>('ai_generation_history');
    // 按创建时间降序排列
    return histories.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /**
   * 根据ID获取AI生成历史记录
   * 通过记录ID查询特定历史记录的详细信息
   * @param id number 历史记录的唯一标识符
   * @returns Promise<AIGenerationHistory | null> 历史记录，如果不存在则返回null
   */
  async getAIGenerationHistoryById(id: number): Promise<AIGenerationHistory | null> {
    return this.getById<AIGenerationHistory>('ai_generation_history', id);
  }

  /**
   * 根据业务历史ID获取记录
   * 通过业务层面的历史ID查询历史记录信息
   * @param historyId string 业务历史ID
   * @returns Promise<AIGenerationHistory | null> 历史记录，如果不存在则返回null
   */
  async getAIGenerationHistoryByHistoryId(historyId: string): Promise<AIGenerationHistory | null> {
    const histories = await this.getByIndex<AIGenerationHistory>('ai_generation_history', 'historyId', historyId);
    return histories.length > 0 ? histories[0] : null;
  }

  /**
   * 根据配置ID获取历史记录
   * 查询指定AI配置的所有生成历史记录
   * @param configId string AI配置ID
   * @returns Promise<AIGenerationHistory[]> 该配置的所有历史记录列表，按创建时间降序排列
   */
  async getAIGenerationHistoryByConfigId(configId: string): Promise<AIGenerationHistory[]> {
    const histories = await this.getByIndex<AIGenerationHistory>('ai_generation_history', 'configId', configId);
    // 按创建时间降序排列
    return histories.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /**
   * 根据状态获取历史记录
   * 查询指定状态的所有历史记录
   * @param status 'success' | 'error' 生成状态
   * @returns Promise<AIGenerationHistory[]> 指定状态的历史记录列表，按创建时间降序排列
   */
  async getAIGenerationHistoryByStatus(status: 'success' | 'error'): Promise<AIGenerationHistory[]> {
    const histories = await this.getByIndex<AIGenerationHistory>('ai_generation_history', 'status', status);
    // 按创建时间降序排列
    return histories.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /**
   * 分页获取AI生成历史记录
   * 支持按配置ID、状态过滤的分页查询
   * @param options AIGenerationHistoryOptions 查询选项
   * @returns Promise<PaginatedResult<AIGenerationHistory>> 分页查询结果
   */
  async getAIGenerationHistoryPaginated(options?: AIGenerationHistoryOptions): Promise<PaginatedResult<AIGenerationHistory>> {
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
      page: options?.page || 1,
      pageSize: options?.limit || histories.length,
      totalPages: Math.ceil(total / (options?.limit || histories.length)),
      hasNextPage: hasMore,
      hasPrevPage: (options?.page || 1) > 1
    };
  }

  /**
   * 删除AI生成历史记录
   * 从数据库中永久删除指定历史记录
   * @param id number 要删除的历史记录ID
   * @returns Promise<void> 删除完成的Promise
   */
  async deleteAIGenerationHistory(id: number): Promise<void> {
    return this.delete('ai_generation_history', id);
  }

  /**
   * 根据业务历史ID删除记录
   * 通过业务历史ID删除历史记录
   * @param historyId string 业务历史ID
   * @returns Promise<boolean> 删除是否成功
   */
  async deleteAIGenerationHistoryByHistoryId(historyId: string): Promise<boolean> {
    const history = await this.getAIGenerationHistoryByHistoryId(historyId);
    if (!history || !history.id) {
      return false;
    }
    await this.deleteAIGenerationHistory(history.id);
    return true;
  }

  /**
   * 根据配置ID删除所有历史记录
   * 删除指定AI配置的所有生成历史记录
   * @param configId string AI配置ID
   * @returns Promise<number> 删除的记录数量
   */
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

  /**
   * 清空所有AI生成历史记录
   * 删除数据库中的所有AI生成历史记录
   * @returns Promise<number> 删除的记录总数
   */
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

  /**
   * 获取AI生成历史统计信息
   * 返回历史记录相关的统计数据，包括总数、成功/失败数量、按配置分组的统计等
   * @returns Promise<AIGenerationHistoryStats> 历史记录统计信息
   */
  async getAIGenerationHistoryStats(): Promise<AIGenerationHistoryStats> {
    const histories = await this.getAllAIGenerationHistory();
    // 统计字段初始化
    let successful = 0;
    let failed = 0;
    let pending = 0;
    const totalByConfig: Record<string, number> = {};
    const configUsage: Record<string, number> = {};

    histories.forEach(history => {
      // 统计总体状态
      if (history.status === 'success') {
        successful++;
      } else if (history.status === 'error') {
        failed++;
      } else if (history.status === 'pending') {
        pending++;
      }
      // 按配置ID统计
      if (history.configId) {
        totalByConfig[history.configId] = (totalByConfig[history.configId] || 0) + 1;
        configUsage[history.configId] = (configUsage[history.configId] || 0) + 1;
      }
    });

    // 统计最常用配置
    const mostUsedConfigs = Object.entries(configUsage)
      .map(([configId, count]) => ({ configId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      total: histories.length,
      successful,
      failed,
      pending,
      totalByConfig,
      mostUsedConfigs
    };
  }

  /**
   * 获取最近的AI生成历史记录
   * 查询最近的几条历史记录
   * @param limit number 返回的记录数量，默认为10
   * @returns Promise<AIGenerationHistory[]> 最近的历史记录列表
   */
  async getRecentAIGenerationHistory(limit = 10): Promise<AIGenerationHistory[]> {
    const histories = await this.getAllAIGenerationHistory();
    return histories.slice(0, limit);
  }

  /**
   * 获取成功的AI生成历史记录
   * 查询所有成功状态的历史记录
   * @returns Promise<AIGenerationHistory[]> 成功的历史记录列表
   */
  async getSuccessfulGenerationHistory(): Promise<AIGenerationHistory[]> {
    return this.getAIGenerationHistoryByStatus('success');
  }

  /**
   * 获取失败的AI生成历史记录
   * 查询所有失败状态的历史记录
   * @returns Promise<AIGenerationHistory[]> 失败的历史记录列表
   */
  async getFailedGenerationHistory(): Promise<AIGenerationHistory[]> {
    return this.getAIGenerationHistoryByStatus('error');
  }

  /**
   * 搜索AI生成历史记录
   * 通过主题或生成内容进行模糊匹配搜索
   * @param query string 搜索关键词
   * @returns Promise<AIGenerationHistory[]> 匹配的历史记录列表
   */
  async searchAIGenerationHistory(query: string): Promise<AIGenerationHistory[]> {
    const allHistories = await this.getAllAIGenerationHistory();
    const searchQuery = query.toLowerCase();
    
    return allHistories.filter(history => 
      history.topic.toLowerCase().includes(searchQuery) ||
      history.generatedPrompt.toLowerCase().includes(searchQuery) ||
      (history.customPrompt && history.customPrompt.toLowerCase().includes(searchQuery))
    );
  }

  /**
   * 获取配置的生成统计
   * 返回指定配置的生成统计信息
   * @param configId string AI配置ID
   * @returns Promise<{ total: number; success: number; error: number; recentHistory: AIGenerationHistory[] }> 配置统计信息
   */
  async getConfigGenerationStats(configId: string): Promise<{
    total: number;
    success: number;
    error: number;
    recentHistory: AIGenerationHistory[];
  }> {
    const histories = await this.getAIGenerationHistoryByConfigId(configId);
    const successCount = histories.filter(h => h.status === 'success').length;
    const errorCount = histories.filter(h => h.status === 'error').length;
    
    return {
      total: histories.length,
      success: successCount,
      error: errorCount,
      recentHistory: histories.slice(0, 5)
    };
  }

  /**
   * 获取按日期分组的历史统计
   * 返回按日期分组的生成历史统计信息
   * @param days number 统计的天数，默认为30天
   * @returns Promise<Record<string, { total: number; success: number; error: number }>> 按日期分组的统计
   */
  async getHistoryStatsByDate(days = 30): Promise<Record<string, { total: number; success: number; error: number }>> {
    const histories = await this.getAllAIGenerationHistory();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const recentHistories = histories.filter(h => new Date(h.createdAt) >= cutoffDate);
    const statsByDate: Record<string, { total: number; success: number; error: number }> = {};

    recentHistories.forEach(history => {
      const dateKey = new Date(history.createdAt).toISOString().split('T')[0];
      
      if (!statsByDate[dateKey]) {
        statsByDate[dateKey] = { total: 0, success: 0, error: 0 };
      }
      
      statsByDate[dateKey].total++;
      if (history.status === 'success') {
        statsByDate[dateKey].success++;
      } else if (history.status === 'error') {
        statsByDate[dateKey].error++;
      }
    });

    return statsByDate;
  }

  /**
   * 获取使用频率最高的模型
   * 统计历史记录中使用频率最高的模型
   * @param limit number 返回的模型数量，默认为10
   * @returns Promise<Array<{ model: string; count: number }>> 模型使用统计
   */
  async getMostUsedModels(limit = 10): Promise<{ model: string; count: number }[]> {
    const histories = await this.getAllAIGenerationHistory();
    const modelStats: Record<string, number> = {};

    histories.forEach(history => {
      modelStats[history.model] = (modelStats[history.model] || 0) + 1;
    });

    return Object.entries(modelStats)
      .map(([model, count]) => ({ model, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  /**
   * 批量删除历史记录
   * 批量删除多条历史记录
   * @param ids number[] 要删除的历史记录ID数组
   * @returns Promise<{ success: number; failed: number }> 删除结果统计
   */
  async batchDeleteHistory(ids: number[]): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    for (const id of ids) {
      try {
        await this.deleteAIGenerationHistory(id);
        success++;
      } catch (error) {
        console.error(`Failed to delete history ${id}:`, error);
        failed++;
      }
    }

    return { success, failed };
  }

  /**
   * 根据UUID获取AI生成历史记录
   * 通过UUID查询特定历史记录的详细信息
   * @param uuid string 历史记录的UUID
   * @returns Promise<AIGenerationHistory | null> 历史记录，如果不存在则返回null
   */
  async getAIGenerationHistoryByUUID(uuid: string): Promise<AIGenerationHistory | null> {
    return this.getByUUID<AIGenerationHistory>('ai_generation_history', uuid);
  }

  /**
   * 根据UUID更新AI生成历史记录
   * 通过UUID更新指定历史记录的信息
   * @param uuid string 历史记录UUID
   * @param data 更新数据
   * @returns Promise<AIGenerationHistory | null> 更新后的历史记录
   */
  async updateAIGenerationHistoryByUUID(uuid: string, data: Partial<Omit<AIGenerationHistory, 'id' | 'uuid' | 'createdAt'>>): Promise<AIGenerationHistory | null> {
    return this.updateByUUID<AIGenerationHistory>('ai_generation_history', uuid, data);
  }

  /**
   * 根据UUID删除AI生成历史记录
   * 通过UUID删除指定历史记录
   * @param uuid string 要删除的历史记录UUID
   * @returns Promise<boolean> 删除是否成功
   */
  async deleteAIGenerationHistoryByUUID(uuid: string): Promise<boolean> {
    return this.deleteByUUID('ai_generation_history', uuid);
  }

  /**
   * 检查历史记录UUID是否已存在
   * 验证UUID的唯一性
   * @param uuid string 要检查的UUID
   * @returns Promise<boolean> 如果UUID已存在返回true，否则返回false
   */
  async isHistoryUUIDExists(uuid: string): Promise<boolean> {
    const history = await this.getByUUID<AIGenerationHistory>('ai_generation_history', uuid);
    return history !== null;
  }

  /**
   * 根据提示词ID获取调试历史记录
   * 查询指定提示词的所有调试历史记录
   * @param promptId number 提示词ID
   * @returns Promise<AIGenerationHistory[]> 该提示词的调试历史记录列表，按创建时间降序排列
   */
  async getDebugHistoryByPromptId(promptId: number): Promise<AIGenerationHistory[]> {
    const allHistories = await this.getAll<AIGenerationHistory>('ai_generation_history');
    
    // 过滤出与指定提示词相关的调试记录
    const debugHistories = allHistories.filter(record => {
      // 检查是否是调试记录（包含debugResult或debugStatus字段）
      const isDebugRecord = record.debugResult || record.debugStatus;
      
      // 检查是否与指定提示词相关（通过topic或generatedPrompt内容匹配）
      const isRelatedToPrompt = record.topic.includes(`提示词调试`) || 
                                record.topic.includes(`调试`) ||
                                record.historyId?.startsWith('debug_');
      
      return isDebugRecord && isRelatedToPrompt;
    });
    
    // 按创建时间降序排列
    return debugHistories.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
}
