/**
 * 快速优化提示词配置数据服务
 * 提供快速优化提示词配置相关的数据库操作功能
 */

import { BaseDatabaseService } from './base-database.service';
import { QuickOptimizationConfig, CreateQuickOptimizationConfig, UpdateQuickOptimizationConfig } from '@shared/types/ai';
import { generateUUID } from '../utils/uuid';
import {
  buildDefaultQuickOptimizationConfigs,
  isUnmodifiedBuiltinQuickOptimization
} from './quick-optimization-defaults';

export { buildDefaultQuickOptimizationConfigs } from './quick-optimization-defaults';

/** 本机是否已经预置过默认动作；用户删光后不再自动加回来 */
const DEFAULTS_SEEDED_KEY = 'ai-gist:quick-optimization-defaults-seeded';

/** 用户改了这几项，默认动作就成了用户自己的动作 */
const CONTENT_FIELDS = ['name', 'description', 'prompt'] as const;
const touchesContent = (data: UpdateQuickOptimizationConfig) => CONTENT_FIELDS.some(field => field in data);

const readSeededFlag = (): boolean => {
  try {
    return globalThis.localStorage?.getItem(DEFAULTS_SEEDED_KEY) === '1';
  } catch {
    return false;
  }
};

const writeSeededFlag = () => {
  try {
    globalThis.localStorage?.setItem(DEFAULTS_SEEDED_KEY, '1');
  } catch {
    // 存不了标记时下次还会检查一遍，列表不为空就不会重复添加
  }
};

/**
 * 快速优化提示词配置数据服务类
 * 继承基础数据库服务，提供快速优化提示词配置特定的数据操作方法
 */
export class QuickOptimizationService extends BaseDatabaseService {
  private static instance: QuickOptimizationService;
  private seedingDefaults: Promise<void> | null = null;

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
      sortOrder: Number(data.sortOrder ?? 0),
      ...(data.builtinKey ? { builtinKey: String(data.builtinKey) } : {})
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
   * 从备份数据创建快速优化配置
   * 保留 UUID，避免跨设备同步时同一配置被识别成多条记录。
   */
  async createQuickOptimizationConfigFromBackup(data: Omit<QuickOptimizationConfig, 'id'>): Promise<QuickOptimizationConfig> {
    return this.add<QuickOptimizationConfig>('quick_optimization_configs', {
      ...data,
      uuid: data.uuid || generateUUID()
    });
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
    const existing = touchesContent(data) ? await this.getQuickOptimizationConfigById(id) : null;
    return this.update<QuickOptimizationConfig>('quick_optimization_configs', id, {
      ...data,
      ...this.getBuiltinKeyUpdate(existing, data),
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
    const existing = touchesContent(data) ? await this.getQuickOptimizationConfigByUUID(uuid) : null;
    return this.updateByUUID<QuickOptimizationConfig>('quick_optimization_configs', uuid, {
      ...data,
      ...this.getBuiltinKeyUpdate(existing, data),
      updatedAt: new Date()
    });
  }

  /**
   * 默认动作的名称、说明或模板被改过之后，它就是用户自己的动作：去掉内置标识，
   * 同步时不再和其他设备上的同一个默认动作归并，改动不会被覆盖 (#490)。
   * 只开关或调整顺序不算改过。
   */
  private getBuiltinKeyUpdate(
    existing: QuickOptimizationConfig | null,
    data: UpdateQuickOptimizationConfig
  ): Partial<QuickOptimizationConfig> {
    if (!existing?.builtinKey) return {};
    const next = { ...existing, ...data };
    const contentChanged = CONTENT_FIELDS
      .some(field => field in data && (next[field] || '').trim() !== (existing[field] || '').trim());
    if (!contentChanged || isUnmodifiedBuiltinQuickOptimization(next, existing.builtinKey)) return {};
    return { builtinKey: undefined };
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
   * 初始化默认的快速优化提示词配置（按当前界面语言生成）
   * @returns Promise<number> 新添加的配置数量；已经有配置时不添加，返回 0
   */
  async initializeDefaultConfigs(): Promise<number> {
    const existingConfigs = await this.getAllQuickOptimizationConfigs();
    
    // 如果已经有配置，不重复初始化
    if (existingConfigs.length > 0) {
      return 0;
    }

    const defaultConfigs = buildDefaultQuickOptimizationConfigs();
    for (const config of defaultConfigs) {
      await this.createQuickOptimizationConfig(config);
    }
    return defaultConfigs.length;
  }

  /**
   * 首次使用时预置默认动作：每台设备只做一次，列表里已有配置时只记下标记。
   * 并发调用（AI 面板和弹窗同时加载）共用同一次初始化，避免重复添加。
   * 预置的动作带内置标识，和别的设备各自预置的同一批动作在同步时归并成一份 (#490)；
   * 归并只会删掉重复的那份，列表不会因此变空，所以这个标记不用跟着同步变。
   */
  async ensureDefaultConfigs(): Promise<void> {
    if (readSeededFlag()) return;
    if (!this.seedingDefaults) {
      this.seedingDefaults = this.initializeDefaultConfigs()
        .then(() => writeSeededFlag())
        .finally(() => { this.seedingDefaults = null; });
    }
    return this.seedingDefaults;
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
