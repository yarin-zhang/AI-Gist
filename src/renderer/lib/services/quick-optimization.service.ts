/**
 * 快速优化提示词配置数据服务
 * 提供快速优化提示词配置相关的数据库操作功能
 */

import { BaseDatabaseService } from './base-database.service';
import { QuickOptimizationConfig, CreateQuickOptimizationConfig, UpdateQuickOptimizationConfig } from '@shared/types/ai';
import { generateUUID } from '../utils/uuid';

/**
 * 快速优化提示词配置数据服务类
 * 继承基础数据库服务，提供快速优化提示词配置特定的数据操作方法
 */
export class QuickOptimizationService extends BaseDatabaseService {
  private static instance: QuickOptimizationService;

  /**
   * 获取快速优化提示词配置服务单例实例
   * @returns QuickOptimizationService 快速优化提示词配置服务实例
   */
  static getInstance(): QuickOptimizationService {
    if (!QuickOptimizationService.instance) {
      QuickOptimizationService.instance = new QuickOptimizationService();
    }
    return QuickOptimizationService.instance;
  }

  /**
   * 创建新的快速优化提示词配置
   * @param data CreateQuickOptimizationConfig 快速优化提示词配置创建数据
   * @returns Promise<QuickOptimizationConfig> 创建成功的快速优化提示词配置记录
   */
  async createQuickOptimizationConfig(data: CreateQuickOptimizationConfig): Promise<QuickOptimizationConfig> {
    // 数据验证和清理
    const validatedData = {
      name: String(data.name || '').trim(),
      description: data.description ? String(data.description).trim() : undefined,
      prompt: String(data.prompt || '').trim(),
      enabled: Boolean(data.enabled ?? true),
      sortOrder: Number(data.sortOrder ?? 0)
    };

    // 验证必填字段
    if (!validatedData.name) {
      throw new Error('配置名称不能为空');
    }
    if (!validatedData.prompt) {
      throw new Error('提示词模板不能为空');
    }

    const configWithUUID = {
      ...validatedData,
      uuid: generateUUID(),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    console.log('创建快速优化配置:', configWithUUID);
    return this.add<QuickOptimizationConfig>('quick_optimization_configs', configWithUUID);
  }

  /**
   * 获取所有快速优化提示词配置
   * @returns Promise<QuickOptimizationConfig[]> 所有快速优化提示词配置记录的数组
   */
  async getAllQuickOptimizationConfigs(): Promise<QuickOptimizationConfig[]> {
    return this.getAll<QuickOptimizationConfig>('quick_optimization_configs');
  }

  /**
   * 获取已启用的快速优化提示词配置
   * @returns Promise<QuickOptimizationConfig[]> 已启用的快速优化提示词配置列表
   */
  async getEnabledQuickOptimizationConfigs(): Promise<QuickOptimizationConfig[]> {
    const allConfigs = await this.getAllQuickOptimizationConfigs();
    return allConfigs
      .filter(config => config.enabled === true)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  /**
   * 根据ID获取快速优化提示词配置
   * @param id number 快速优化提示词配置的唯一标识符
   * @returns Promise<QuickOptimizationConfig | null> 快速优化提示词配置记录，如果不存在则返回null
   */
  async getQuickOptimizationConfigById(id: number): Promise<QuickOptimizationConfig | null> {
    return this.getById<QuickOptimizationConfig>('quick_optimization_configs', id);
  }

  /**
   * 根据UUID获取快速优化提示词配置
   * @param uuid string 快速优化提示词配置的UUID
   * @returns Promise<QuickOptimizationConfig | null> 快速优化提示词配置记录，如果不存在则返回null
   */
  async getQuickOptimizationConfigByUUID(uuid: string): Promise<QuickOptimizationConfig | null> {
    return this.getByUUID<QuickOptimizationConfig>('quick_optimization_configs', uuid);
  }

  /**
   * 更新快速优化提示词配置信息
   * @param id number 快速优化提示词配置ID
   * @param data UpdateQuickOptimizationConfig 要更新的快速优化提示词配置数据
   * @returns Promise<QuickOptimizationConfig> 更新后的完整快速优化提示词配置记录
   */
  async updateQuickOptimizationConfig(id: number, data: UpdateQuickOptimizationConfig): Promise<QuickOptimizationConfig> {
    return this.update<QuickOptimizationConfig>('quick_optimization_configs', id, {
      ...data,
      updatedAt: new Date()
    });
  }

  /**
   * 根据UUID更新快速优化提示词配置信息
   * @param uuid string 快速优化提示词配置的UUID
   * @param data UpdateQuickOptimizationConfig 要更新的快速优化提示词配置数据
   * @returns Promise<QuickOptimizationConfig | null> 更新后的完整快速优化提示词配置记录，如果不存在则返回null
   */
  async updateQuickOptimizationConfigByUUID(uuid: string, data: UpdateQuickOptimizationConfig): Promise<QuickOptimizationConfig | null> {
    return this.updateByUUID<QuickOptimizationConfig>('quick_optimization_configs', uuid, {
      ...data,
      updatedAt: new Date()
    });
  }

  /**
   * 删除快速优化提示词配置
   * @param id number 快速优化提示词配置ID
   * @returns Promise<void> 删除完成
   */
  async deleteQuickOptimizationConfig(id: number): Promise<void> {
    return this.delete('quick_optimization_configs', id);
  }

  /**
   * 根据UUID删除快速优化提示词配置
   * @param uuid string 快速优化提示词配置的UUID
   * @returns Promise<void> 删除完成
   */
  async deleteQuickOptimizationConfigByUUID(uuid: string): Promise<void> {
    await this.deleteByUUID('quick_optimization_configs', uuid);
  }

  /**
   * 切换快速优化提示词配置启用状态
   * @param id number 快速优化提示词配置ID
   * @param enabled boolean 是否启用
   * @returns Promise<QuickOptimizationConfig> 更新后的快速优化提示词配置记录
   */
  async toggleQuickOptimizationConfig(id: number, enabled: boolean): Promise<QuickOptimizationConfig> {
    return this.updateQuickOptimizationConfig(id, { enabled });
  }

  /**
   * 重新排序快速优化提示词配置
   * @param configs Array<{id: number, sortOrder: number}> 配置ID和排序顺序的数组
   * @returns Promise<void> 排序完成
   */
  async reorderQuickOptimizationConfigs(configs: {id: number, sortOrder: number}[]): Promise<void> {
    const updates = configs.map(config => 
      this.updateQuickOptimizationConfig(config.id, { sortOrder: config.sortOrder })
    );
    await Promise.all(updates);
  }

  /**
   * 初始化默认的快速优化提示词配置
   * @returns Promise<void> 初始化完成
   */
  async initializeDefaultConfigs(): Promise<void> {
    const existingConfigs = await this.getAllQuickOptimizationConfigs();
    
    // 如果已经有配置，不重复初始化
    if (existingConfigs.length > 0) {
      return;
    }

    const defaultConfigs: CreateQuickOptimizationConfig[] = [
      {
        name: '更简短',
        description: '将提示词优化得更加简短和精炼，保留核心要求，去除冗余内容',
        prompt: '请将以下提示词优化得更加简短和精炼，保留核心要求，去除冗余内容：\n\n{{content}}',
        enabled: true,
        sortOrder: 1
      },
      {
        name: '更丰富',
        description: '将提示词优化得略微丰富和详细一些，添加更多具体的要求和细节',
        prompt: '请将以下提示词优化得略微丰富和详细一些，添加更多具体的要求和细节，但不要过于复杂：\n\n{{content}}',
        enabled: true,
        sortOrder: 2
      },
      {
        name: '更通用',
        description: '将提示词优化得更加通用，适用于更广泛的场景和用途',
        prompt: '请将以下提示词优化得更加通用，适用于更广泛的场景和用途，但不要过于复杂：\n\n{{content}}',
        enabled: true,
        sortOrder: 3
      },
      {
        name: '提取变量',
        description: '分析提示词，将其中可以变化的部分提取为变量',
        prompt: '请分析以下提示词，将其中可以变化的、最有价值的 3~5 个部分提取为变量，使用 {{变量名}} 的格式标记：\n\n{{content}}',
        enabled: true,
        sortOrder: 4
      },
      {
        name: '更专业',
        description: '将提示词优化得更加专业和正式，适合商业或学术场景',
        prompt: '请将以下提示词优化得更加专业和正式，适合商业或学术场景使用：\n\n{{content}}',
        enabled: false,
        sortOrder: 5
      }
    ];

    for (const config of defaultConfigs) {
      await this.createQuickOptimizationConfig(config);
    }
  }

  /**
   * 获取快速优化提示词配置统计信息
   * @returns Promise<快速优化提示词配置统计信息> 包含总数量、启用数量等统计信息
   */
  async getQuickOptimizationConfigStats(): Promise<{
    totalConfigs: number;
    enabledConfigs: number;
    recentConfigs: QuickOptimizationConfig[];
  }> {
    const allConfigs = await this.getAllQuickOptimizationConfigs();
    const enabledConfigs = allConfigs.filter(config => config.enabled);

    // 最近的配置
    const recentConfigs = allConfigs
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 5);

    return {
      totalConfigs: allConfigs.length,
      enabledConfigs: enabledConfigs.length,
      recentConfigs
    };
  }
} 