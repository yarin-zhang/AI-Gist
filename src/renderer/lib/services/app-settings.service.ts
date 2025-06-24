/**
 * 应用设置数据服务
 * 提供应用设置相关的数据库操作功能
 */

import { BaseDatabaseService } from './base-database.service';
import { AppSettings } from '@shared/types/database';

/**
 * 应用设置数据服务类
 * 继承基础数据库服务，提供应用设置特定的数据操作方法
 * 包含设置的CRUD操作、类型转换、批量操作等功能
 */
export class AppSettingsService extends BaseDatabaseService {
  private static instance: AppSettingsService;

  /**
   * 获取应用设置服务单例实例
   * @returns AppSettingsService 应用设置服务实例
   */
  static getInstance(): AppSettingsService {
    if (!AppSettingsService.instance) {
      AppSettingsService.instance = new AppSettingsService();
    }
    return AppSettingsService.instance;
  }

  /**
   * 创建新的应用设置
   * 向数据库中添加新的设置记录
   * @param data Omit<AppSettings, 'id' | 'createdAt' | 'updatedAt'> 设置数据（不包含自动生成的字段）
   * @returns Promise<AppSettings> 创建成功的设置记录（包含生成的ID和时间戳）
   */
  async createSetting(data: Omit<AppSettings, 'id'>): Promise<AppSettings> {
    return this.add<AppSettings>('settings', data);
  }

  /**
   * 根据键名获取设置
   * 通过设置键名查询特定设置的值
   * @param key string 设置键名
   * @returns Promise<AppSettings | null> 设置记录，如果不存在则返回null
   */
  async getSettingByKey(key: string): Promise<AppSettings | null> {
    const settings = await this.getByIndex<AppSettings>('settings', 'key', key);
    return settings.length > 0 ? settings[0] : null;
  }

  /**
   * 获取所有设置
   * 查询数据库中的所有设置记录
   * @returns Promise<AppSettings[]> 所有设置记录的数组
   */
  async getAllSettings(): Promise<AppSettings[]> {
    return this.getAll<AppSettings>('settings');
  }

  /**
   * 根据键名更新设置
   * 更新指定键名的设置值，如果设置不存在则创建新设置
   * @param key string 设置键名
   * @param value string 设置值
   * @param type 'string' | 'number' | 'boolean' | 'object' | 'array' 值类型，默认为'string'
   * @param description string 设置描述
   * @returns Promise<AppSettings> 更新或创建后的设置记录
   */
  async updateSettingByKey(
    key: string, 
    value: string, 
    type: 'string' | 'number' | 'boolean' | 'object' | 'array' = 'string',
    description?: string
  ): Promise<AppSettings> {
    const existingSetting = await this.getSettingByKey(key);
    
    if (existingSetting && existingSetting.id) {
      return this.update<AppSettings>('settings', existingSetting.id, {
        value,
        type,
        description,
        updatedAt: new Date()
      });
    } else {
      // 创建新设置
      return this.createSetting({
        key,
        value,
        type,
        description,
        isSystem: false,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }
  }

  /**
   * 删除设置
   * 根据键名删除指定设置
   * @param key string 设置键名
   * @returns Promise<boolean> 删除是否成功
   */
  async deleteSetting(key: string): Promise<boolean> {
    const setting = await this.getSettingByKey(key);
    if (!setting || !setting.id) {
      return false;
    }
    await this.delete('settings', setting.id);
    return true;
  }

  /**
   * 获取字符串类型设置值
   * 获取指定键名的字符串设置值
   * @param key string 设置键名
   * @param defaultValue string 默认值
   * @returns Promise<string> 设置值或默认值
   */
  async getStringValue(key: string, defaultValue: string = ''): Promise<string> {
    const setting = await this.getSettingByKey(key);
    if (!setting || setting.type !== 'string') {
      return defaultValue;
    }
    return setting.value || defaultValue;
  }

  /**
   * 设置字符串类型设置值
   * 设置指定键名的字符串值
   * @param key string 设置键名
   * @param value string 设置值
   * @param description string 设置描述
   * @returns Promise<AppSettings> 更新后的设置记录
   */
  async setStringValue(key: string, value: string, description?: string): Promise<AppSettings> {
    return this.updateSettingByKey(key, value, 'string', description);
  }

  /**
   * 获取数字类型设置值
   * 获取指定键名的数字设置值
   * @param key string 设置键名
   * @param defaultValue number 默认值
   * @returns Promise<number> 设置值或默认值
   */
  async getNumberValue(key: string, defaultValue: number = 0): Promise<number> {
    const setting = await this.getSettingByKey(key);
    if (!setting || setting.type !== 'number') {
      return defaultValue;
    }
    const numValue = parseFloat(setting.value);
    return isNaN(numValue) ? defaultValue : numValue;
  }

  /**
   * 设置数字类型设置值
   * 设置指定键名的数字值
   * @param key string 设置键名
   * @param value number 设置值
   * @param description string 设置描述
   * @returns Promise<AppSettings> 更新后的设置记录
   */
  async setNumberValue(key: string, value: number, description?: string): Promise<AppSettings> {
    return this.updateSettingByKey(key, value.toString(), 'number', description);
  }

  /**
   * 获取布尔类型设置值
   * 获取指定键名的布尔设置值
   * @param key string 设置键名
   * @param defaultValue boolean 默认值
   * @returns Promise<boolean> 设置值或默认值
   */
  async getBooleanValue(key: string, defaultValue: boolean = false): Promise<boolean> {
    const setting = await this.getSettingByKey(key);
    if (!setting || setting.type !== 'boolean') {
      return defaultValue;
    }
    return setting.value === 'true';
  }

  /**
   * 设置布尔类型设置值
   * 设置指定键名的布尔值
   * @param key string 设置键名
   * @param value boolean 设置值
   * @param description string 设置描述
   * @returns Promise<AppSettings> 更新后的设置记录
   */
  async setBooleanValue(key: string, value: boolean, description?: string): Promise<AppSettings> {
    return this.updateSettingByKey(key, value.toString(), 'boolean', description);
  }

  /**
   * 获取JSON类型设置值
   * 获取指定键名的JSON对象设置值
   * @param key string 设置键名
   * @param defaultValue T 默认值
   * @returns Promise<T> 解析后的JSON对象或默认值
   */
  async getJsonValue<T = any>(key: string, defaultValue: T = {} as T): Promise<T> {
    const setting = await this.getSettingByKey(key);
    if (!setting || setting.type !== 'object') {
      return defaultValue;
    }
    
    try {
      return JSON.parse(setting.value) as T;
    } catch (error) {
      console.error(`Failed to parse JSON setting ${key}:`, error);
      return defaultValue;
    }
  }

  /**
   * 设置JSON类型设置值
   * 设置指定键名的JSON对象值
   * @param key string 设置键名
   * @param value any 要序列化的对象
   * @param description string 设置描述
   * @returns Promise<AppSettings> 更新后的设置记录
   */
  async setJsonValue(key: string, value: any, description?: string): Promise<AppSettings> {
    const jsonString = JSON.stringify(value);
    return this.updateSettingByKey(key, jsonString, 'object', description);
  }

  /**
   * 检查设置键名是否存在
   * 验证指定键名的设置是否已存在
   * @param key string 要检查的设置键名
   * @returns Promise<boolean> 如果键名已存在返回true，否则返回false
   */
  async isSettingExists(key: string): Promise<boolean> {
    const setting = await this.getSettingByKey(key);
    return setting !== null;
  }

  /**
   * 批量获取设置值
   * 一次性获取多个设置的值
   * @param keys string[] 设置键名数组
   * @returns Promise<Record<string, string>> 键值对对象
   */
  async getBatchSettings(keys: string[]): Promise<Record<string, string>> {
    const result: Record<string, string> = {};
    
    for (const key of keys) {
      const setting = await this.getSettingByKey(key);
      result[key] = setting?.value || '';
    }
    
    return result;
  }

  /**
   * 批量设置值
   * 一次性更新多个设置的值
   * @param settings Record<string, { value: string; type?: 'string' | 'number' | 'boolean' | 'object' | 'array'; description?: string }> 设置数据
   * @returns Promise<{ success: number; failed: number }> 操作结果统计
   */
  async setBatchSettings(settings: Record<string, {
    value: string;
    type?: 'string' | 'number' | 'boolean' | 'object' | 'array';
    description?: string;
  }>): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    for (const [key, { value, type = 'string', description }] of Object.entries(settings)) {
      try {
        await this.updateSettingByKey(key, value, type, description);
        success++;
      } catch (error) {
        console.error(`Failed to update setting ${key}:`, error);
        failed++;
      }
    }

    return { success, failed };
  }

  /**
   * 获取按类型分组的设置
   * 返回按设置类型分组的设置列表
   * @returns Promise<Record<string, AppSettings[]>> 按类型分组的设置
   */
  async getSettingsByType(): Promise<Record<string, AppSettings[]>> {
    const allSettings = await this.getAllSettings();
    const groupedSettings: Record<string, AppSettings[]> = {};

    allSettings.forEach(setting => {
      if (!groupedSettings[setting.type]) {
        groupedSettings[setting.type] = [];
      }
      groupedSettings[setting.type].push(setting);
    });

    return groupedSettings;
  }

  /**
   * 搜索设置
   * 通过键名或描述进行模糊匹配搜索
   * @param query string 搜索关键词
   * @returns Promise<AppSettings[]> 匹配的设置列表
   */
  async searchSettings(query: string): Promise<AppSettings[]> {
    const allSettings = await this.getAllSettings();
    const searchQuery = query.toLowerCase();
    
    return allSettings.filter(setting => 
      setting.key.toLowerCase().includes(searchQuery) ||
      (setting.description && setting.description.toLowerCase().includes(searchQuery))
    );
  }

  /**
   * 导出所有设置
   * 导出所有设置为JSON格式，用于备份
   * @returns Promise<Record<string, any>> 所有设置的JSON对象
   */
  async exportSettings(): Promise<Record<string, any>> {
    const allSettings = await this.getAllSettings();
    const exportData: Record<string, any> = {};

    allSettings.forEach(setting => {
      let value: any = setting.value;
      
      // 根据类型转换值
      switch (setting.type) {
        case 'number':
          value = parseFloat(setting.value);
          if (isNaN(value)) value = setting.value;
          break;
        case 'boolean':
          value = setting.value === 'true';
          break;
        case 'object':
          try {
            value = JSON.parse(setting.value);
          } catch {
            value = setting.value;
          }
          break;
        default:
          value = setting.value;
      }

      exportData[setting.key] = {
        value,
        type: setting.type,
        description: setting.description,
        createdAt: setting.createdAt,
        updatedAt: setting.updatedAt
      };
    });

    return exportData;
  }

  /**
   * 导入设置
   * 从JSON数据批量导入设置
   * @param settingsData Record<string, any> 设置数据
   * @param overwrite boolean 是否覆盖已存在的设置
   * @returns Promise<{ imported: number; skipped: number; failed: number }> 导入结果统计
   */
  async importSettings(
    settingsData: Record<string, any>, 
    overwrite: boolean = false
  ): Promise<{ imported: number; skipped: number; failed: number }> {
    let imported = 0;
    let skipped = 0;
    let failed = 0;

    for (const [key, data] of Object.entries(settingsData)) {
      try {
        const exists = await this.isSettingExists(key);
        
        if (exists && !overwrite) {
          skipped++;
          continue;
        }

        let value: string;
        const type = data.type || 'string';
        
        // 根据类型转换值为字符串
        switch (type) {
          case 'object':
            value = typeof data.value === 'string' ? data.value : JSON.stringify(data.value);
            break;
          default:
            value = String(data.value);
        }

        await this.updateSettingByKey(key, value, type, data.description);
        imported++;
      } catch (error) {
        console.error(`Failed to import setting ${key}:`, error);
        failed++;
      }
    }

    return { imported, skipped, failed };
  }

  /**
   * 重置设置为默认值
   * 将指定设置重置为默认值（删除设置）
   * @param key string 设置键名
   * @returns Promise<boolean> 重置是否成功
   */
  async resetSetting(key: string): Promise<boolean> {
    return this.deleteSetting(key);
  }

  /**
   * 清空所有设置
   * 删除数据库中的所有设置记录
   * @returns Promise<number> 删除的设置数量
   */
  async clearAllSettings(): Promise<number> {
    const allSettings = await this.getAllSettings();
    let deletedCount = 0;

    for (const setting of allSettings) {
      if (setting.id) {
        await this.delete('settings', setting.id);
        deletedCount++;
      }
    }

    return deletedCount;
  }

  /**
   * 获取设置统计信息
   * 返回设置相关的统计数据
   * @returns Promise<设置统计信息> 包含总数量、类型分布等统计信息
   */
  async getSettingsStats(): Promise<{
    totalSettings: number;
    typeDistribution: Record<string, number>;
    recentSettings: AppSettings[];
  }> {
    const allSettings = await this.getAllSettings();

    // 类型分布统计
    const typeDistribution: Record<string, number> = {};
    allSettings.forEach(setting => {
      typeDistribution[setting.type] = (typeDistribution[setting.type] || 0) + 1;
    });

    // 最近的设置
    const recentSettings = allSettings
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 5);

    return {
      totalSettings: allSettings.length,
      typeDistribution,
      recentSettings
    };
  }
}
