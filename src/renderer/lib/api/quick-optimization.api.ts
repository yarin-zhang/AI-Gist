/**
 * 快速优化提示词配置API客户端
 * 提供快速优化提示词配置相关的API调用接口
 */

import { QuickOptimizationService } from '../services/quick-optimization.service';
import { QuickOptimizationConfig, CreateQuickOptimizationConfig, UpdateQuickOptimizationConfig } from '@shared/types/ai';

/**
 * 快速优化提示词配置API客户端类
 * 封装快速优化提示词配置服务，提供统一的API调用接口
 */
export class QuickOptimizationApiClient {
  private quickOptimizationService: QuickOptimizationService;

  constructor() {
    this.quickOptimizationService = QuickOptimizationService.getInstance();
  }

  /**
   * 快速优化提示词配置相关的API接口
   */
  quickOptimizationConfigs = {
    /**
     * 创建快速优化提示词配置
     */
    create: {
      /**
       * 创建新的快速优化提示词配置
       * @param input 快速优化提示词配置创建数据
       * @returns Promise<QuickOptimizationConfig> 创建的快速优化提示词配置记录
       */
      mutate: async (input: CreateQuickOptimizationConfig): Promise<QuickOptimizationConfig> => {
        return this.quickOptimizationService.createQuickOptimizationConfig(input);
      }
    },

    /**
     * 查询所有快速优化提示词配置
     */
    getAll: {
      /**
       * 获取所有快速优化提示词配置列表
       * @returns Promise<QuickOptimizationConfig[]> 快速优化提示词配置列表
       */
      query: async (): Promise<QuickOptimizationConfig[]> => {
        return this.quickOptimizationService.getAllQuickOptimizationConfigs();
      }
    },

    /**
     * 获取已启用的快速优化提示词配置
     */
    getEnabled: {
      /**
       * 获取所有已启用的快速优化提示词配置
       * @returns Promise<QuickOptimizationConfig[]> 已启用的快速优化提示词配置列表
       */
      query: async (): Promise<QuickOptimizationConfig[]> => {
        return this.quickOptimizationService.getEnabledQuickOptimizationConfigs();
      }
    },

    /**
     * 根据ID查询快速优化提示词配置
     */
    getById: {
      /**
       * 根据ID获取快速优化提示词配置信息
       * @param id 快速优化提示词配置ID
       * @returns Promise<QuickOptimizationConfig | null> 快速优化提示词配置信息
       */
      query: async (id: number): Promise<QuickOptimizationConfig | null> => {
        return this.quickOptimizationService.getQuickOptimizationConfigById(id);
      }
    },

    /**
     * 根据UUID查询快速优化提示词配置
     */
    getByUUID: {
      /**
       * 根据UUID获取快速优化提示词配置信息
       * @param uuid 快速优化提示词配置UUID
       * @returns Promise<QuickOptimizationConfig | null> 快速优化提示词配置信息
       */
      query: async (uuid: string): Promise<QuickOptimizationConfig | null> => {
        return this.quickOptimizationService.getQuickOptimizationConfigByUUID(uuid);
      }
    },

    /**
     * 更新快速优化提示词配置
     */
    update: {
      /**
       * 更新快速优化提示词配置信息
       * @param input 更新参数
       * @returns Promise<QuickOptimizationConfig> 更新后的快速优化提示词配置记录
       */
      mutate: async (input: { id: number; data: UpdateQuickOptimizationConfig }): Promise<QuickOptimizationConfig> => {
        return this.quickOptimizationService.updateQuickOptimizationConfig(input.id, input.data);
      }
    },

    /**
     * 根据UUID更新快速优化提示词配置
     */
    updateByUUID: {
      /**
       * 根据UUID更新快速优化提示词配置信息
       * @param input 更新参数
       * @returns Promise<QuickOptimizationConfig | null> 更新后的快速优化提示词配置记录
       */
      mutate: async (input: { uuid: string; data: UpdateQuickOptimizationConfig }): Promise<QuickOptimizationConfig | null> => {
        return this.quickOptimizationService.updateQuickOptimizationConfigByUUID(input.uuid, input.data);
      }
    },

    /**
     * 删除快速优化提示词配置
     */
    delete: {
      /**
       * 删除快速优化提示词配置
       * @param id 快速优化提示词配置ID
       * @returns Promise<void> 删除完成
       */
      mutate: async (id: number): Promise<void> => {
        return this.quickOptimizationService.deleteQuickOptimizationConfig(id);
      }
    },

    /**
     * 根据UUID删除快速优化提示词配置
     */
    deleteByUUID: {
      /**
       * 根据UUID删除快速优化提示词配置
       * @param uuid 快速优化提示词配置UUID
       * @returns Promise<void> 删除完成
       */
      mutate: async (uuid: string): Promise<void> => {
        return this.quickOptimizationService.deleteQuickOptimizationConfigByUUID(uuid);
      }
    },

    /**
     * 切换快速优化提示词配置启用状态
     */
    toggle: {
      /**
       * 切换快速优化提示词配置启用状态
       * @param input 切换参数
       * @returns Promise<QuickOptimizationConfig> 更新后的快速优化提示词配置记录
       */
      mutate: async (input: { id: number; enabled: boolean }): Promise<QuickOptimizationConfig> => {
        return this.quickOptimizationService.toggleQuickOptimizationConfig(input.id, input.enabled);
      }
    },

    /**
     * 重新排序快速优化提示词配置
     */
    reorder: {
      /**
       * 重新排序快速优化提示词配置
       * @param configs 配置ID和排序顺序的数组
       * @returns Promise<void> 排序完成
       */
      mutate: async (configs: {id: number, sortOrder: number}[]): Promise<void> => {
        return this.quickOptimizationService.reorderQuickOptimizationConfigs(configs);
      }
    },

    /**
     * 初始化默认配置
     */
    initializeDefaults: {
      /**
       * 初始化默认的快速优化提示词配置
       * @returns Promise<void> 初始化完成
       */
      mutate: async (): Promise<void> => {
        return this.quickOptimizationService.initializeDefaultConfigs();
      }
    },

    /**
     * 获取统计信息
     */
    getStats: {
      /**
       * 获取快速优化提示词配置统计信息
       * @returns Promise<快速优化提示词配置统计信息> 统计信息
       */
      query: async (): Promise<{
        totalConfigs: number;
        enabledConfigs: number;
        recentConfigs: QuickOptimizationConfig[];
      }> => {
        return this.quickOptimizationService.getQuickOptimizationConfigStats();
      }
    }
  };
}

/**
 * 创建快速优化提示词配置API客户端实例
 * @returns QuickOptimizationApiClient 快速优化提示词配置API客户端实例
 */
export function createQuickOptimizationApiClient(): QuickOptimizationApiClient {
  return new QuickOptimizationApiClient();
} 