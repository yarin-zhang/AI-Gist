/**
 * 应用设置API客户端
 * 提供应用设置相关的API调用接口
 */

import { AppSettingsService } from '../services/app-settings.service';
import { AppSettings } from '../types/database';

/**
 * 应用设置API客户端类
 * 封装应用设置服务，提供统一的API调用接口
 */
export class AppSettingsApiClient {
  private appSettingsService: AppSettingsService;

  constructor() {
    this.appSettingsService = AppSettingsService.getInstance();
  }

  /**
   * 应用设置相关的API接口
   */
  appSettings = {
    /**
     * 创建设置
     */
    create: {
      /**
       * 创建新的应用设置
       * @param input 设置创建数据
       * @returns Promise<AppSettings> 创建的设置记录
       */
      mutate: async (input: Omit<AppSettings, 'id' | 'createdAt' | 'updatedAt'>): Promise<AppSettings> => {
        return this.appSettingsService.createSetting(input);
      }
    },

    /**
     * 获取所有设置
     */
    getAll: {
      /**
       * 获取所有应用设置
       * @returns Promise<AppSettings[]> 设置列表
       */
      query: async (): Promise<AppSettings[]> => {
        return this.appSettingsService.getAllSettings();
      }
    },

    /**
     * 根据键名查询设置
     */
    getByKey: {
      /**
       * 根据键名获取设置信息
       * @param key 设置键名
       * @returns Promise<AppSettings | null> 设置信息
       */
      query: async (key: string): Promise<AppSettings | null> => {
        return this.appSettingsService.getSettingByKey(key);
      }
    },

    /**
     * 更新设置
     */
    updateByKey: {
      /**
       * 根据键名更新设置，如果不存在则创建
       * @param input 设置更新数据
       * @returns Promise<AppSettings> 更新或创建后的设置记录
       */
      mutate: async (input: { 
        key: string; 
        value: string; 
        type?: 'string' | 'number' | 'boolean' | 'json';
        description?: string;
      }): Promise<AppSettings> => {
        const { key, value, type = 'string', description } = input;
        return this.appSettingsService.updateSettingByKey(key, value, type, description);
      }
    },

    /**
     * 删除设置
     */
    delete: {
      /**
       * 根据键名删除设置
       * @param key 设置键名
       * @returns Promise<{ key: string; deleted: boolean }> 删除结果
       */
      mutate: async (key: string): Promise<{ key: string; deleted: boolean }> => {
        const deleted = await this.appSettingsService.deleteSetting(key);
        return { key, deleted };
      }
    },

    /**
     * 检查设置是否存在
     */
    checkExists: {
      /**
       * 检查设置键名是否已存在
       * @param key 设置键名
       * @returns Promise<boolean> 是否已存在
       */
      query: async (key: string): Promise<boolean> => {
        return this.appSettingsService.isSettingExists(key);
      }
    },

    /**
     * 批量获取设置
     */
    getBatch: {
      /**
       * 批量获取多个设置的值
       * @param keys 设置键名数组
       * @returns Promise<Record<string, string>> 键值对对象
       */
      query: async (keys: string[]): Promise<Record<string, string>> => {
        return this.appSettingsService.getBatchSettings(keys);
      }
    },

    /**
     * 批量设置
     */
    setBatch: {
      /**
       * 批量更新多个设置
       * @param input 批量设置数据
       * @returns Promise<{ success: number; failed: number }> 操作结果统计
       */
      mutate: async (input: Record<string, {
        value: string;
        type?: 'string' | 'number' | 'boolean' | 'json';
        description?: string;
      }>): Promise<{ success: number; failed: number }> => {
        return this.appSettingsService.setBatchSettings(input);
      }
    },

    /**
     * 搜索设置
     */
    search: {
      /**
       * 搜索设置
       * @param query 搜索关键词
       * @returns Promise<AppSettings[]> 匹配的设置列表
       */
      query: async (query: string): Promise<AppSettings[]> => {
        return this.appSettingsService.searchSettings(query);
      }
    },

    /**
     * 按类型获取设置
     */
    getByType: {
      /**
       * 获取按类型分组的设置
       * @returns Promise<Record<string, AppSettings[]>> 按类型分组的设置
       */
      query: async (): Promise<Record<string, AppSettings[]>> => {
        return this.appSettingsService.getSettingsByType();
      }
    },

    /**
     * 导出设置
     */
    export: {
      /**
       * 导出所有设置为JSON格式
       * @returns Promise<Record<string, any>> 导出的设置数据
       */
      query: async (): Promise<Record<string, any>> => {
        return this.appSettingsService.exportSettings();
      }
    },

    /**
     * 导入设置
     */
    import: {
      /**
       * 从JSON数据导入设置
       * @param input 导入参数
       * @returns Promise<{ imported: number; skipped: number; failed: number }> 导入结果统计
       */
      mutate: async (input: { 
        settingsData: Record<string, any>; 
        overwrite?: boolean 
      }): Promise<{ imported: number; skipped: number; failed: number }> => {
        const { settingsData, overwrite = false } = input;
        return this.appSettingsService.importSettings(settingsData, overwrite);
      }
    },

    /**
     * 重置设置
     */
    reset: {
      /**
       * 重置设置为默认值（删除设置）
       * @param key 设置键名
       * @returns Promise<{ key: string; reset: boolean }> 重置结果
       */
      mutate: async (key: string): Promise<{ key: string; reset: boolean }> => {
        const reset = await this.appSettingsService.resetSetting(key);
        return { key, reset };
      }
    },

    /**
     * 清空所有设置
     */
    clearAll: {
      /**
       * 清空所有设置
       * @returns Promise<{ deletedCount: number }> 清空结果
       */
      mutate: async (): Promise<{ deletedCount: number }> => {
        const deletedCount = await this.appSettingsService.clearAllSettings();
        return { deletedCount };
      }
    },

    /**
     * 获取统计信息
     */
    getStats: {
      /**
       * 获取设置统计数据
       * @returns Promise<设置统计信息> 统计信息
       */
      query: async (): Promise<{
        totalSettings: number;
        typeDistribution: Record<string, number>;
        recentSettings: AppSettings[];
      }> => {
        return this.appSettingsService.getSettingsStats();
      }
    }
  };

  /**
   * 类型化的设置值操作接口
   */
  values = {
    /**
     * 字符串类型设置值操作
     */
    string: {
      /**
       * 获取字符串设置值
       */
      get: {
        query: async (input: { key: string; defaultValue?: string }): Promise<string> => {
          const { key, defaultValue = '' } = input;
          return this.appSettingsService.getStringValue(key, defaultValue);
        }
      },
      /**
       * 设置字符串值
       */
      set: {
        mutate: async (input: { key: string; value: string; description?: string }): Promise<AppSettings> => {
          const { key, value, description } = input;
          return this.appSettingsService.setStringValue(key, value, description);
        }
      }
    },

    /**
     * 数字类型设置值操作
     */
    number: {
      /**
       * 获取数字设置值
       */
      get: {
        query: async (input: { key: string; defaultValue?: number }): Promise<number> => {
          const { key, defaultValue = 0 } = input;
          return this.appSettingsService.getNumberValue(key, defaultValue);
        }
      },
      /**
       * 设置数字值
       */
      set: {
        mutate: async (input: { key: string; value: number; description?: string }): Promise<AppSettings> => {
          const { key, value, description } = input;
          return this.appSettingsService.setNumberValue(key, value, description);
        }
      }
    },

    /**
     * 布尔类型设置值操作
     */
    boolean: {
      /**
       * 获取布尔设置值
       */
      get: {
        query: async (input: { key: string; defaultValue?: boolean }): Promise<boolean> => {
          const { key, defaultValue = false } = input;
          return this.appSettingsService.getBooleanValue(key, defaultValue);
        }
      },
      /**
       * 设置布尔值
       */
      set: {
        mutate: async (input: { key: string; value: boolean; description?: string }): Promise<AppSettings> => {
          const { key, value, description } = input;
          return this.appSettingsService.setBooleanValue(key, value, description);
        }
      }
    },

    /**
     * JSON类型设置值操作
     */
    json: {
      /**
       * 获取JSON设置值
       */
      get: {
        query: async <T = any>(input: { key: string; defaultValue?: T }): Promise<T> => {
          const { key, defaultValue = {} as T } = input;
          return this.appSettingsService.getJsonValue(key, defaultValue);
        }
      },
      /**
       * 设置JSON值
       */
      set: {
        mutate: async (input: { key: string; value: any; description?: string }): Promise<AppSettings> => {
          const { key, value, description } = input;
          return this.appSettingsService.setJsonValue(key, value, description);
        }
      }
    }
  };
}

/**
 * 创建应用设置API客户端实例的工厂函数
 * @returns AppSettingsApiClient 应用设置API客户端实例
 */
export function createAppSettingsApiClient(): AppSettingsApiClient {
  return new AppSettingsApiClient();
}
