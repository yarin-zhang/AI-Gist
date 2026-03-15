/**
 * AI配置API客户端
 * 提供AI配置相关的API调用接口
 */

import { AIConfigService } from '../services/ai-config.service';
import { AIConfig } from '@shared/types/database';

/**
 * AI配置API客户端类
 * 封装AI配置服务，提供统一的API调用接口
 */
export class AIConfigApiClient {
  private aiConfigService: AIConfigService;

  constructor() {
    this.aiConfigService = AIConfigService.getInstance();
  }

  /**
   * AI配置相关的API接口
   */
  aiConfigs = {
    /**
     * 创建AI配置
     */
    create: {
      /**
       * 创建新的AI配置
       * @param input AI配置创建数据
       * @returns Promise<AIConfig> 创建的AI配置记录
       */
      mutate: async (input: Omit<AIConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<AIConfig> => {
        return this.aiConfigService.createAIConfig(input);
      }
    },

    /**
     * 查询所有AI配置
     */
    getAll: {
      /**
       * 获取所有AI配置列表
       * @returns Promise<AIConfig[]> AI配置列表
       */
      query: async (): Promise<AIConfig[]> => {
        return this.aiConfigService.getAllAIConfigs();
      }
    },

    /**
     * 获取已启用的AI配置
     */
    getEnabled: {
      /**
       * 获取所有已启用的AI配置
       * @returns Promise<AIConfig[]> 已启用的AI配置列表
       */
      query: async (): Promise<AIConfig[]> => {
        return this.aiConfigService.getEnabledAIConfigs();
      }
    },

    /**
     * 根据ID查询AI配置
     */
    getById: {
      /**
       * 根据ID获取AI配置信息
       * @param id AI配置ID
       * @returns Promise<AIConfig | null> AI配置信息
       */
      query: async (id: number): Promise<AIConfig | null> => {
        return this.aiConfigService.getAIConfigById(id);
      }
    },

    /**
     * 根据配置ID查询AI配置
     */
    getByConfigId: {
      /**
       * 根据业务配置ID获取AI配置信息
       * @param configId 业务配置ID
       * @returns Promise<AIConfig | null> AI配置信息
       */
      query: async (configId: string): Promise<AIConfig | null> => {
        return this.aiConfigService.getAIConfigByConfigId(configId);
      }
    },

    /**
     * 根据类型查询AI配置
     */
    getByType: {
      /**
       * 根据AI服务类型获取配置列表
       * @param type AI服务类型
       * @returns Promise<AIConfig[]> 该类型的AI配置列表
       */
      query: async (type: AIConfig['type']): Promise<AIConfig[]> => {
        return this.aiConfigService.getAIConfigsByType(type);
      }
    },

    /**
     * 更新AI配置
     */
    update: {
      /**
       * 更新AI配置信息
       * @param input 更新数据，包含id和要更新的字段
       * @returns Promise<AIConfig> 更新后的AI配置记录
       */
      mutate: async (input: { 
        id: number; 
        data: Partial<Omit<AIConfig, 'id' | 'createdAt' | 'updatedAt'>> 
      }): Promise<AIConfig> => {
        const { id, data } = input;
        return this.aiConfigService.updateAIConfig(id, data);
      }
    },

    /**
     * 根据配置ID更新AI配置
     */
    updateByConfigId: {
      /**
       * 根据业务配置ID更新AI配置信息
       * @param input 更新数据，包含configId和要更新的字段
       * @returns Promise<AIConfig | null> 更新后的AI配置记录
       */
      mutate: async (input: { 
        configId: string; 
        data: Partial<Omit<AIConfig, 'id' | 'configId' | 'createdAt' | 'updatedAt'>> 
      }): Promise<AIConfig | null> => {
        const { configId, data } = input;
        return this.aiConfigService.updateAIConfigByConfigId(configId, data);
      }
    },

    /**
     * 删除AI配置
     */
    delete: {
      /**
       * 删除AI配置
       * @param id AI配置ID
       * @returns Promise<{ id: number }> 删除的AI配置ID
       */
      mutate: async (id: number): Promise<{ id: number }> => {
        await this.aiConfigService.deleteAIConfig(id);
        return { id };
      }
    },

    /**
     * 根据配置ID删除AI配置
     */
    deleteByConfigId: {
      /**
       * 根据业务配置ID删除AI配置
       * @param configId 业务配置ID
       * @returns Promise<{ configId: string; deleted: boolean }> 删除结果
       */
      mutate: async (configId: string): Promise<{ configId: string; deleted: boolean }> => {
        const deleted = await this.aiConfigService.deleteAIConfigByConfigId(configId);
        return { configId, deleted };
      }
    },

    /**
     * 切换启用状态
     */
    toggleEnabled: {
      /**
       * 切换AI配置的启用状态
       * @param id AI配置ID
       * @returns Promise<AIConfig> 更新后的AI配置记录
       */
      mutate: async (id: number): Promise<AIConfig> => {
        return this.aiConfigService.toggleAIConfigEnabled(id);
      }
    },

    /**
     * 启用AI配置
     */
    enable: {
      /**
       * 启用AI配置
       * @param id AI配置ID
       * @returns Promise<AIConfig> 更新后的AI配置记录
       */
      mutate: async (id: number): Promise<AIConfig> => {
        return this.aiConfigService.enableAIConfig(id);
      }
    },

    /**
     * 禁用AI配置
     */
    disable: {
      /**
       * 禁用AI配置
       * @param id AI配置ID
       * @returns Promise<AIConfig> 更新后的AI配置记录
       */
      mutate: async (id: number): Promise<AIConfig> => {
        return this.aiConfigService.disableAIConfig(id);
      }
    },

    /**
     * 设置首选配置
     */
    setPreferred: {
      /**
       * 设置首选AI配置
       * @param id AI配置ID
       * @returns Promise<void> 设置完成
       */
      mutate: async (id: number): Promise<void> => {
        return this.aiConfigService.setPreferredAIConfig(id);
      }
    },

    /**
     * 获取首选配置
     */
    getPreferred: {
      /**
       * 获取首选AI配置
       * @returns Promise<AIConfig | null> 首选AI配置
       */
      query: async (): Promise<AIConfig | null> => {
        return this.aiConfigService.getPreferredAIConfig();
      }
    },

    /**
     * 清除首选配置
     */
    clearPreferred: {
      /**
       * 清除首选AI配置设置
       * @returns Promise<void> 清除完成
       */
      mutate: async (): Promise<void> => {
        return this.aiConfigService.clearPreferredAIConfig();
      }
    },

    /**
     * 检查配置ID是否存在
     */
    checkConfigId: {
      /**
       * 检查业务配置ID是否已被使用
       * @param input 检查参数
       * @returns Promise<boolean> 是否已存在
       */
      query: async (input: { configId: string; excludeId?: number }): Promise<boolean> => {
        const { configId, excludeId } = input;
        return this.aiConfigService.isConfigIdExists(configId, excludeId);
      }
    },

    /**
     * 验证AI配置
     */
    validate: {
      /**
       * 验证AI配置的有效性
       * @param id AI配置ID
       * @returns Promise<{ valid: boolean; errors: string[] }> 验证结果
       */
      query: async (id: number): Promise<{ valid: boolean; errors: string[] }> => {
        return this.aiConfigService.validateAIConfig(id);
      }
    },

    /**
     * 搜索AI配置
     */
    search: {
      /**
       * 搜索AI配置
       * @param query 搜索关键词
       * @returns Promise<AIConfig[]> 匹配的AI配置列表
       */
      query: async (query: string): Promise<AIConfig[]> => {
        return this.aiConfigService.searchAIConfigs(query);
      }
    },

    /**
     * 批量更新启用状态
     */
    batchUpdateEnabled: {
      /**
       * 批量更新AI配置的启用状态
       * @param input 批量更新参数
       * @returns Promise<{ success: number; failed: number }> 操作结果统计
       */
      mutate: async (input: { 
        configIds: number[]; 
        enabled: boolean 
      }): Promise<{ success: number; failed: number }> => {
        const { configIds, enabled } = input;
        return this.aiConfigService.batchUpdateEnabledStatus(configIds, enabled);
      }
    },

    /**
     * 获取统计信息
     */
    getStats: {
      /**
       * 获取AI配置统计数据
       * @returns Promise<AI配置统计信息> 统计信息
       */
      query: async (): Promise<{
        totalConfigs: number;
        enabledConfigs: number;
        preferredConfig: AIConfig | null;
        typeDistribution: Record<string, number>;
        recentConfigs: AIConfig[];
      }> => {
        return this.aiConfigService.getAIConfigStats();
      }
    },

    /**
     * 测试AI配置连接
     */
    test: {
      /**
       * 测试AI配置的连接和可用性
       * @param config 测试配置参数
       * @returns Promise<测试结果> 测试结果
       */
      mutate: async (config: {
        type: AIConfig['type'];
        baseURL: string;
        apiKey?: string
      }): Promise<{
        success: boolean;
        error?: string;
        models?: string[]
      }> => {
        try {
          // 检测平台
          const isElectron = typeof window !== 'undefined' && (window as any).electronAPI;

          if (isElectron) {
            // Electron 环境：使用 IPC
            const testConfig: Partial<AIConfig> = {
              type: config.type,
              baseURL: config.baseURL,
              apiKey: config.apiKey,
              name: 'test',
              configId: 'test',
              models: [],
              enabled: true,
              createdAt: new Date(),
              updatedAt: new Date()
            };

            const result = await window.electron.ai.testConfig(testConfig as AIConfig);
            return {
              success: result.success,
              error: result.error,
              models: result.models
            };
          } else {
            // 移动端环境：直接调用 API
            const { testAIConfig } = await import('../services/mobile-ai.service');
            const result = await testAIConfig(config);
            return {
              success: result.success,
              error: result.error,
              models: result.models
            };
          }
        } catch (error) {
          console.error('测试连接失败:', error);
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error)
          };
        }
      }
    },

    /**
     * 智能测试AI配置
     */
    intelligentTest: {
      /**
       * 使用真实提示词测试AI配置
       * @param id AI配置ID
       * @returns Promise<测试结果> 测试结果
       */
      mutate: async (id: number): Promise<{
        success: boolean;
        error?: string;
        response?: string;
        inputPrompt?: string;
      }> => {
        try {
          const config = await this.aiConfigService.getAIConfigById(id);
          if (!config) {
            return {
              success: false,
              error: 'Configuration not found'
            };
          }

          // 检测平台
          const isElectron = typeof window !== 'undefined' && (window as any).electronAPI;

          if (isElectron) {
            // Electron 环境
            const result = await window.electron.ai.intelligentTest(config);
            return {
              success: result.success,
              error: result.error,
              response: result.response,
              inputPrompt: 'Test prompt'
            };
          } else {
            // 移动端环境：使用移动端智能测试
            const { intelligentTestAIConfig } = await import('../services/mobile-ai.service');
            const result = await intelligentTestAIConfig(config);
            return {
              success: result.success,
              error: result.error,
              response: result.response,
              inputPrompt: result.inputPrompt
            };
          }
        } catch (error) {
          console.error('智能测试失败:', error);
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error)
          };
        }
      }
    }
  };
}

/**
 * 创建AI配置API客户端实例的工厂函数
 * @returns AIConfigApiClient AI配置API客户端实例
 */
export function createAIConfigApiClient(): AIConfigApiClient {
  return new AIConfigApiClient();
}
