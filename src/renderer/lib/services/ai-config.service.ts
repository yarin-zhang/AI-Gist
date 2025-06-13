/**
 * AI配置数据服务
 * 提供AI服务配置相关的数据库操作功能
 */

import { BaseDatabaseService } from './base-database.service';
import { AIConfig } from '../types/database';

/**
 * AI配置数据服务类
 * 继承基础数据库服务，提供AI配置特定的数据操作方法
 * 包含配置的CRUD操作、启用状态管理、首选项设置等功能
 */
export class AIConfigService extends BaseDatabaseService {
  private static instance: AIConfigService;

  /**
   * 获取AI配置服务单例实例
   * @returns AIConfigService AI配置服务实例
   */
  static getInstance(): AIConfigService {
    if (!AIConfigService.instance) {
      AIConfigService.instance = new AIConfigService();
    }
    return AIConfigService.instance;
  }

  /**
   * 创建新的AI配置
   * 向数据库中添加新的AI服务配置记录
   * @param data Omit<AIConfig, 'id' | 'createdAt' | 'updatedAt'> AI配置数据（不包含自动生成的字段）
   * @returns Promise<AIConfig> 创建成功的AI配置记录（包含生成的ID和时间戳）
   */
  async createAIConfig(data: Omit<AIConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<AIConfig> {
    return this.add<AIConfig>('ai_configs', data);
  }

  /**
   * 获取所有AI配置
   * 查询数据库中的所有AI配置记录
   * @returns Promise<AIConfig[]> 所有AI配置记录的数组
   */
  async getAllAIConfigs(): Promise<AIConfig[]> {
    return this.getAll<AIConfig>('ai_configs');
  }

  /**
   * 获取已启用的AI配置
   * 查询所有启用状态的AI配置，用于实际的AI服务调用
   * @returns Promise<AIConfig[]> 已启用的AI配置列表
   */
  async getEnabledAIConfigs(): Promise<AIConfig[]> {
    // 获取所有配置然后在内存中过滤，避免 IndexedDB 对布尔值索引的处理问题
    const allConfigs = await this.getAllAIConfigs();
    return allConfigs.filter(config => config.enabled === true);
  }

  /**
   * 根据ID获取AI配置
   * 通过配置ID查询特定AI配置的详细信息
   * @param id number AI配置的唯一标识符
   * @returns Promise<AIConfig | null> AI配置记录，如果不存在则返回null
   */
  async getAIConfigById(id: number): Promise<AIConfig | null> {
    return this.getById<AIConfig>('ai_configs', id);
  }

  /**
   * 根据业务配置ID获取AI配置
   * 通过业务层面的配置ID查询AI配置信息
   * @param configId string 业务配置ID
   * @returns Promise<AIConfig | null> AI配置记录，如果不存在则返回null
   */
  async getAIConfigByConfigId(configId: string): Promise<AIConfig | null> {
    const configs = await this.getByIndex<AIConfig>('ai_configs', 'configId', configId);
    return configs.length > 0 ? configs[0] : null;
  }

  /**
   * 更新AI配置信息
   * 更新指定AI配置的部分或全部信息
   * @param id number AI配置ID
   * @param data Partial<Omit<AIConfig, 'id' | 'createdAt' | 'updatedAt'>> 要更新的AI配置数据
   * @returns Promise<AIConfig> 更新后的完整AI配置记录
   */
  async updateAIConfig(id: number, data: Partial<Omit<AIConfig, 'id' | 'createdAt' | 'updatedAt'>>): Promise<AIConfig> {
    return this.update<AIConfig>('ai_configs', id, data);
  }

  /**
   * 根据业务配置ID更新AI配置
   * 通过业务配置ID更新AI配置信息
   * @param configId string 业务配置ID
   * @param data Partial<Omit<AIConfig, 'id' | 'configId' | 'createdAt' | 'updatedAt'>> 要更新的数据
   * @returns Promise<AIConfig | null> 更新后的AI配置记录，如果不存在则返回null
   */
  async updateAIConfigByConfigId(configId: string, data: Partial<Omit<AIConfig, 'id' | 'configId' | 'createdAt' | 'updatedAt'>>): Promise<AIConfig | null> {
    const config = await this.getAIConfigByConfigId(configId);
    if (!config || !config.id) {
      return null;
    }
    return this.updateAIConfig(config.id, data);
  }

  /**
   * 删除AI配置
   * 从数据库中永久删除指定AI配置
   * @param id number 要删除的AI配置ID
   * @returns Promise<void> 删除完成的Promise
   */
  async deleteAIConfig(id: number): Promise<void> {
    return this.delete('ai_configs', id);
  }

  /**
   * 根据业务配置ID删除AI配置
   * 通过业务配置ID删除AI配置
   * @param configId string 业务配置ID
   * @returns Promise<boolean> 删除是否成功
   */
  async deleteAIConfigByConfigId(configId: string): Promise<boolean> {
    const config = await this.getAIConfigByConfigId(configId);
    if (!config || !config.id) {
      return false;
    }
    await this.deleteAIConfig(config.id);
    return true;
  }

  /**
   * 根据AI服务类型获取配置
   * 查询指定类型的所有AI配置
   * @param type 'openai' | 'ollama' | 'anthropic' | 'google' | 'azure' | 'lmstudio' | 'deepseek' | 'cohere' | 'mistral' AI服务类型
   * @returns Promise<AIConfig[]> 该类型的AI配置列表
   */
  async getAIConfigsByType(type: AIConfig['type']): Promise<AIConfig[]> {
    return this.getByIndex<AIConfig>('ai_configs', 'type', type);
  }

  /**
   * 切换AI配置启用状态
   * 切换指定AI配置的启用状态（启用↔禁用）
   * @param id number AI配置ID
   * @returns Promise<AIConfig> 更新后的AI配置记录
   */
  async toggleAIConfigEnabled(id: number): Promise<AIConfig> {
    const config = await this.getById<AIConfig>('ai_configs', id);
    if (!config) {
      throw new Error('AI Config not found');
    }

    return this.update<AIConfig>('ai_configs', id, {
      enabled: !config.enabled,
    });
  }

  /**
   * 启用AI配置
   * 将指定AI配置设置为启用状态
   * @param id number AI配置ID
   * @returns Promise<AIConfig> 更新后的AI配置记录
   */
  async enableAIConfig(id: number): Promise<AIConfig> {
    return this.updateAIConfig(id, { enabled: true });
  }

  /**
   * 禁用AI配置
   * 将指定AI配置设置为禁用状态
   * @param id number AI配置ID
   * @returns Promise<AIConfig> 更新后的AI配置记录
   */
  async disableAIConfig(id: number): Promise<AIConfig> {
    return this.updateAIConfig(id, { enabled: false });
  }

  /**
   * 设置首选AI配置
   * 将指定配置设为全局首选配置，并取消其他配置的首选状态
   * @param configId number AI配置ID
   * @returns Promise<void> 设置完成的Promise
   * @throws Error 如果配置不存在或未启用
   */
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

  /**
   * 获取首选AI配置
   * 获取当前设置为首选的AI配置，如果没有首选配置则返回第一个启用的配置
   * @returns Promise<AIConfig | null> 首选AI配置，如果没有可用配置则返回null
   */
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

  /**
   * 清除首选AI配置
   * 取消所有配置的首选状态
   * @returns Promise<void> 清除完成的Promise
   */
  async clearPreferredAIConfig(): Promise<void> {
    const allConfigs = await this.getAllAIConfigs();
    
    for (const config of allConfigs) {
      if (config.id && config.isPreferred) {
        await this.updateAIConfig(config.id, { isPreferred: false });
      }
    }
  }

  /**
   * 检查配置ID是否已存在
   * 验证业务配置ID的唯一性
   * @param configId string 要检查的配置ID
   * @param excludeId number 排除的AI配置ID（用于更新时的检查）
   * @returns Promise<boolean> 如果配置ID已存在返回true，否则返回false
   */
  async isConfigIdExists(configId: string, excludeId?: number): Promise<boolean> {
    const config = await this.getAIConfigByConfigId(configId);
    if (!config) return false;
    
    // 如果提供了excludeId，且找到的配置ID与excludeId相同，则不算重复
    if (excludeId && config.id === excludeId) {
      return false;
    }
    
    return true;
  }

  /**
   * 测试AI配置连接
   * 验证AI配置的连接可用性（这里只是数据层面的验证，实际连接测试需要在业务层实现）
   * @param id number AI配置ID
   * @returns Promise<{ valid: boolean; errors: string[] }> 验证结果
   */
  async validateAIConfig(id: number): Promise<{ valid: boolean; errors: string[] }> {
    const config = await this.getAIConfigById(id);
    const errors: string[] = [];

    if (!config) {
      errors.push('配置不存在');
      return { valid: false, errors };
    }

    // 基本字段验证
    if (!config.name?.trim()) {
      errors.push('配置名称不能为空');
    }

    if (!config.baseURL?.trim()) {
      errors.push('API基础URL不能为空');
    }

    if (!config.models || config.models.length === 0) {
      errors.push('至少需要配置一个模型');
    }

    // 根据不同类型进行特定验证
    switch (config.type) {
      case 'openai':
      case 'anthropic':
      case 'deepseek':
        if (!config.apiKey?.trim()) {
          errors.push('API密钥不能为空');
        }
        break;
      case 'azure':
        if (!config.apiKey?.trim()) {
          errors.push('API密钥不能为空');
        }
        if (!config.secretKey?.trim()) {
          errors.push('密钥不能为空');
        }
        break;
      case 'ollama':
      case 'lmstudio':
        // 本地服务一般不需要API密钥
        break;
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 获取AI配置统计信息
   * 返回AI配置相关的统计数据
   * @returns Promise<AI配置统计信息> 包含总数量、启用数量、类型分布等统计信息
   */
  async getAIConfigStats(): Promise<{
    totalConfigs: number;
    enabledConfigs: number;
    preferredConfig: AIConfig | null;
    typeDistribution: Record<string, number>;
    recentConfigs: AIConfig[];
  }> {
    const allConfigs = await this.getAllAIConfigs();
    const enabledConfigs = allConfigs.filter(config => config.enabled);
    const preferredConfig = await this.getPreferredAIConfig();

    // 类型分布统计
    const typeDistribution: Record<string, number> = {};
    allConfigs.forEach(config => {
      typeDistribution[config.type] = (typeDistribution[config.type] || 0) + 1;
    });

    // 最近的配置
    const recentConfigs = allConfigs
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 5);

    return {
      totalConfigs: allConfigs.length,
      enabledConfigs: enabledConfigs.length,
      preferredConfig,
      typeDistribution,
      recentConfigs
    };
  }

  /**
   * 批量启用/禁用配置
   * 批量更改多个配置的启用状态
   * @param configIds number[] 要更改的配置ID数组
   * @param enabled boolean 目标启用状态
   * @returns Promise<{ success: number; failed: number }> 操作结果统计
   */
  async batchUpdateEnabledStatus(configIds: number[], enabled: boolean): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    for (const configId of configIds) {
      try {
        await this.updateAIConfig(configId, { enabled });
        success++;
      } catch (error) {
        console.error(`Failed to update config ${configId}:`, error);
        failed++;
      }
    }

    return { success, failed };
  }

  /**
   * 搜索AI配置
   * 通过配置名称或类型进行模糊匹配搜索
   * @param query string 搜索关键词
   * @returns Promise<AIConfig[]> 匹配的AI配置列表
   */
  async searchAIConfigs(query: string): Promise<AIConfig[]> {
    const allConfigs = await this.getAllAIConfigs();
    const searchQuery = query.toLowerCase();
    
    return allConfigs.filter(config => 
      config.name.toLowerCase().includes(searchQuery) ||
      config.type.toLowerCase().includes(searchQuery) ||
      (config.baseURL && config.baseURL.toLowerCase().includes(searchQuery))
    );
  }
}
