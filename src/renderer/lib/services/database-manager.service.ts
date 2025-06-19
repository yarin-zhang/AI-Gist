/**
 * 数据库管理器服务
 * 提供数据库的高级管理功能，包括健康检查、修复、数据导入导出等
 */

import type { 
  DataExportResult, 
  DataImportResult 
} from '../../shared/types/ipc.types';
import { BaseDatabaseService } from './base-database.service';
import { CategoryService } from './category.service';
import { PromptService } from './prompt.service';
import { AIConfigService } from './ai-config.service';
import { AIGenerationHistoryService } from './ai-generation-history.service';
import { AppSettingsService } from './app-settings.service';
import { generateUUID } from '../utils/uuid';

/**
 * 统一的数据库服务管理类
 * 提供对所有数据库服务的统一访问接口和高级管理功能
 */
export class DatabaseServiceManager {
  private static instance: DatabaseServiceManager;
  
  // 各个服务实例
  public readonly category: CategoryService;
  public readonly prompt: PromptService;
  public readonly aiConfig: AIConfigService;
  public readonly aiGenerationHistory: AIGenerationHistoryService;
  public readonly appSettings: AppSettingsService;

  private constructor() {
    // 初始化所有服务实例
    this.category = CategoryService.getInstance();
    this.prompt = PromptService.getInstance();
    this.aiConfig = AIConfigService.getInstance();
    this.aiGenerationHistory = AIGenerationHistoryService.getInstance();
    this.appSettings = AppSettingsService.getInstance();
  }

  /**
   * 获取数据库服务管理器单例实例
   * @returns DatabaseServiceManager 服务管理器实例
   */
  static getInstance(): DatabaseServiceManager {
    if (!DatabaseServiceManager.instance) {
      DatabaseServiceManager.instance = new DatabaseServiceManager();
    }
    return DatabaseServiceManager.instance;
  }

  /**
   * 初始化所有数据库服务
   * 确保所有服务的数据库连接已建立
   * @returns Promise<void> 初始化完成的Promise
   */
  async initialize(): Promise<void> {
    // 只需要初始化一个服务即可，因为它们共享同一个数据库实例
    await this.category.initialize();
  }

  /**
   * 等待所有数据库服务初始化完成
   * @returns Promise<void> 初始化完成的Promise
   */
  async waitForInitialization(): Promise<void> {
    await this.category.waitForInitialization();
  }

  /**
   * 检查数据库是否已初始化
   * @returns Promise<boolean> 数据库初始化状态
   */
  async isInitialized(): Promise<boolean> {
    try {
      await this.waitForInitialization();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 关闭所有数据库连接
   * 释放数据库资源
   */
  close(): void {
    // 只需要关闭一个服务即可，因为它们共享同一个数据库实例
    this.category.close();
  }

  /**
   * 获取数据库健康状态
   * 检查所有关键表是否存在
   * @returns Promise<{ healthy: boolean; missingStores: string[] }> 健康状态信息
   */
  async getHealthStatus(): Promise<{ healthy: boolean; missingStores: string[] }> {
    const requiredStores = [
      'categories',
      'prompts',
      'promptVariables',
      'promptHistories',
      'ai_configs',
      'ai_generation_history',
      'settings'
    ];

    const missingStores: string[] = [];

    for (const storeName of requiredStores) {
      const exists = await this.category.checkObjectStoreExists(storeName);
      if (!exists) {
        missingStores.push(storeName);
      }
    }

    return {
      healthy: missingStores.length === 0,
      missingStores
    };
  }

  /**
   * 修复数据库
   * 当检测到数据库问题时调用此方法进行修复
   * @returns Promise<{ success: boolean; message: string }> 修复结果
   */
  async repairDatabase(): Promise<{ success: boolean; message: string }> {
    try {
      console.log('DatabaseServiceManager: 开始修复数据库...');
      
      // 使用基础服务的修复功能
      const repairResult = await this.category.repairDatabase();
      
      if (repairResult.success) {
        console.log('DatabaseServiceManager: 数据库修复成功');
        
        // 重新检查健康状态
        const healthStatus = await this.getHealthStatus();
        
        if (healthStatus.healthy) {
          return {
            success: true,
            message: '数据库修复成功，所有必需的表已创建完成'
          };
        } else {
          return {
            success: false,
            message: `数据库修复后仍有问题，缺失的表: ${healthStatus.missingStores.join(', ')}`
          };
        }
      } else {
        return repairResult;
      }
    } catch (error) {
      console.error('DatabaseServiceManager: 数据库修复失败:', error);
      return {
        success: false,
        message: `数据库修复失败: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }

  /**
   * 检查并修复数据库
   * 自动检查数据库健康状态，如果有问题则尝试修复
   * @returns Promise<{ healthy: boolean; repaired: boolean; message: string }> 检查和修复结果
   */
  async checkAndRepairDatabase(): Promise<{ 
    healthy: boolean; 
    repaired: boolean; 
    message: string;
    missingStores?: string[];
  }> {
    try {
      console.log('正在检查数据库健康状态...');
      
      const healthStatus = await this.getHealthStatus();
      
      if (healthStatus.healthy) {
        return {
          healthy: true,
          repaired: false,
          message: '数据库状态良好，无需修复'
        };
      }
      
      console.log('检测到数据库问题，缺失的对象存储:', healthStatus.missingStores);
      
      // 首先尝试普通修复
      console.log('尝试修复数据库...');
      let repairResult = await this.repairDatabase();
      
      if (repairResult.success) {
        return {
          healthy: true,
          repaired: true,
          message: '数据库修复成功'
        };
      }
      
      // 如果修复失败，返回失败结果
      return {
        healthy: false,
        repaired: false,
        message: `数据库修复失败: ${repairResult.message}`,
        missingStores: healthStatus.missingStores
      };
    } catch (error) {
      console.error('检查和修复数据库过程中出错:', error);
      return {
        healthy: false,
        repaired: false,
        message: `操作失败: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }
  
  /**
   * 导出所有数据
   */
  async exportAllData(): Promise<DataExportResult> {
    try {
      console.log('渲染进程: 开始导出数据库数据...');
      
      // 首先检查数据库健康状态
      console.log('正在检查数据库健康状态...');
      const healthStatus = await this.getHealthStatus();
      
      if (!healthStatus.healthy) {
        console.warn('检测到数据库异常，缺失的对象存储:', healthStatus.missingStores);
        
        // 尝试修复数据库
        console.log('正在尝试修复数据库...');
        const repairResult = await this.repairDatabase();
        
        if (!repairResult.success) {
          throw new Error(`数据库修复失败: ${repairResult.message}`);
        }
        
        console.log('数据库修复成功，继续导出数据...');
      }
      
      // 安全地获取所有数据
      const results = await Promise.allSettled([
        this.category.getBasicCategories(),
        this.prompt.getAllPromptsForTags(),
        this.aiConfig.getAllAIConfigs(),
        this.aiGenerationHistory.getAllAIGenerationHistory(),
        this.appSettings.getAllSettings()
      ]);
      
      // 处理结果，对失败的操作返回空数组
      const [
        categories,
        prompts,
        aiConfigs,
        aiHistory,
        settings
      ] = results.map((result, index) => {
        if (result.status === 'fulfilled') {
          return result.value || [];
        } else {
          const tableNames = ['categories', 'prompts', 'aiConfigs', 'aiHistory', 'settings'];
          console.warn(`获取 ${tableNames[index]} 数据失败:`, result.reason);
          return [];
        }
      });
      
      const exportData = {
        categories: categories as any[],
        prompts: prompts as any[],
        aiConfigs: aiConfigs as any[],
        aiHistory: aiHistory as any[],
        settings: settings as any[]
      };
      
      console.log('渲染进程: 数据导出完成', {
        分类数: exportData.categories.length,
        提示词数: exportData.prompts.length,
        AI配置数: exportData.aiConfigs.length,
        AI历史数: exportData.aiHistory.length,
        设置数: exportData.settings.length
      });
      
      return {
        success: true,
        data: exportData,
        message: '数据导出成功'
      };
      
    } catch (error) {
      console.error('渲染进程: 导出数据库数据失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        message: '数据导出失败'
      };
    }
  }
  
  /**
   * 导入数据
   */
  async importData(data: any): Promise<DataImportResult> {
    try {
      console.log('渲染进程: 开始导入数据库数据...');
      
      if (!data || typeof data !== 'object') {
        throw new Error('导入数据格式无效');
      }
      
      // 确保导入数据具有完整的UUID
      data = this.ensureUUIDsInImportData(data);
      
      const details: Record<string, number> = {};
      const importPromises: Promise<void>[] = [];
      let totalErrors = 0;
      
      // 导入分类数据
      if (data.categories && data.categories.length > 0) {
        console.log(`导入分类数据: ${data.categories.length} 条`);
        for (const category of data.categories) {
          const { id, ...categoryDataWithoutId } = category;
          importPromises.push(
            this.category.createCategory(categoryDataWithoutId).catch(err => {
              console.warn('导入分类数据失败:', category.id, err.message);
              totalErrors++;
            })
          );
        }
      }
      
      // 导入提示词数据
      if (data.prompts && data.prompts.length > 0) {
        console.log(`导入提示词数据: ${data.prompts.length} 条`);
        for (const prompt of data.prompts) {
          const { id, ...promptDataWithoutId } = prompt;
          importPromises.push(
            this.prompt.createPrompt(promptDataWithoutId).catch(err => {
              console.warn('导入提示词数据失败:', prompt.id, err.message);
              totalErrors++;
            })
          );
        }
      }
      
      // 导入AI配置数据
      if (data.aiConfigs && data.aiConfigs.length > 0) {
        console.log(`导入AI配置数据: ${data.aiConfigs.length} 条`);
        for (const config of data.aiConfigs) {
          const { id, ...configDataWithoutId } = config;
          importPromises.push(
            this.aiConfig.createAIConfig(configDataWithoutId).catch(err => {
              console.warn('导入AI配置数据失败:', config.id, err.message);
              totalErrors++;
            })
          );
        }
      }
      
      // 导入AI历史数据
      if (data.aiHistory && data.aiHistory.length > 0) {
        console.log(`导入AI历史数据: ${data.aiHistory.length} 条`);
        for (const history of data.aiHistory) {
          const { id, ...historyDataWithoutId } = history;
          importPromises.push(
            this.aiGenerationHistory.createAIGenerationHistory(historyDataWithoutId).catch(err => {
              console.warn('导入AI历史数据失败:', history.id, err.message);
              totalErrors++;
            })
          );
        }
      }
      
      // 导入设置数据
      if (data.settings && data.settings.length > 0) {
        console.log(`导入设置数据: ${data.settings.length} 条`);
        for (const setting of data.settings) {
          importPromises.push(
            this.appSettings.updateSettingByKey(setting.key, setting.value, setting.type, setting.description).catch(err => {
              console.warn('导入设置数据失败:', setting.key, err.message);
              totalErrors++;
            })
          );
        }
      }
      
      // 等待所有导入操作完成
      await Promise.all(importPromises);
      
      // 统计导入结果
      details.categories = (data.categories?.length || 0);
      details.prompts = (data.prompts?.length || 0);
      details.aiConfigs = (data.aiConfigs?.length || 0);
      details.aiHistory = (data.aiHistory?.length || 0);
      details.settings = (data.settings?.length || 0);
      
      const totalImported = Object.values(details).reduce((sum, count) => sum + count, 0);
      
      console.log('渲染进程: 数据导入完成', details);
      
      return {
        success: true,
        message: `数据导入成功，共导入 ${totalImported} 条记录${totalErrors > 0 ? `，失败 ${totalErrors} 条` : ''}`,
        details
      };
      
    } catch (error) {
      console.error('渲染进程: 导入数据库数据失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        message: '数据导入失败'
      };
    }
  }
  
  /**
   * 备份数据
   */
  async backupData(): Promise<DataExportResult> {
    // 备份和导出是相同的逻辑
    return await this.exportAllData();
  }
  
  /**
   * 恢复数据
   */
  async restoreData(backupData: any): Promise<DataImportResult> {
    try {
      console.log('渲染进程: 开始恢复数据...');
      
      if (!backupData || typeof backupData !== 'object') {
        throw new Error('恢复数据格式无效');
      }
      
      // 确保导入数据具有完整的UUID
      backupData = this.ensureUUIDsInImportData(backupData);
      
      // 清空现有数据表（如果支持的话）
      if (this.forceCleanAllTables) {
        console.log('清空现有数据表...');
        await this.forceCleanAllTables();
      }
      
      const details: Record<string, number> = {};
      const restorePromises: Promise<void>[] = [];
      let totalErrors = 0;
      
      // 恢复分类数据
      if (backupData.categories && backupData.categories.length > 0) {
        console.log(`恢复分类数据: ${backupData.categories.length} 条`);
        for (const category of backupData.categories) {
          const { id, ...categoryDataWithoutId } = category;
          restorePromises.push(
            this.category.createCategory(categoryDataWithoutId).catch(err => {
              console.warn('恢复分类数据失败:', category.id, err.message);
              totalErrors++;
            })
          );
        }
      }
      
      // 恢复提示词数据
      if (backupData.prompts && backupData.prompts.length > 0) {
        console.log(`恢复提示词数据: ${backupData.prompts.length} 条`);
        for (const prompt of backupData.prompts) {
          const { id, ...promptDataWithoutId } = prompt;
          restorePromises.push(
            this.prompt.createPrompt(promptDataWithoutId).catch(err => {
              console.warn('恢复提示词数据失败:', prompt.id, err.message);
              totalErrors++;
            })
          );
        }
      }
      
      // 恢复AI配置数据
      if (backupData.aiConfigs && backupData.aiConfigs.length > 0) {
        console.log(`恢复AI配置数据: ${backupData.aiConfigs.length} 条`);
        for (const config of backupData.aiConfigs) {
          const { id, ...configDataWithoutId } = config;
          restorePromises.push(
            this.aiConfig.createAIConfig(configDataWithoutId).catch(err => {
              console.warn('恢复AI配置数据失败:', config.id, err.message);
              totalErrors++;
            })
          );
        }
      }
      
      // 恢复AI历史数据
      if (backupData.aiHistory && backupData.aiHistory.length > 0) {
        console.log(`恢复AI历史数据: ${backupData.aiHistory.length} 条`);
        for (const history of backupData.aiHistory) {
          const { id, ...historyDataWithoutId } = history;
          restorePromises.push(
            this.aiGenerationHistory.createAIGenerationHistory(historyDataWithoutId).catch(err => {
              console.warn('恢复AI历史数据失败:', history.id, err.message);
              totalErrors++;
            })
          );
        }
      }
      
      // 恢复设置数据
      if (backupData.settings && backupData.settings.length > 0) {
        console.log(`恢复设置数据: ${backupData.settings.length} 条`);
        for (const setting of backupData.settings) {
          restorePromises.push(
            this.appSettings.updateSettingByKey(setting.key, setting.value, setting.type, setting.description).catch(err => {
              console.warn('恢复设置数据失败:', setting.key, err.message);
              totalErrors++;
            })
          );
        }
      }
      
      // 等待所有恢复操作完成
      await Promise.all(restorePromises);
      
      // 统计恢复结果
      details.categories = (backupData.categories?.length || 0);
      details.prompts = (backupData.prompts?.length || 0);
      details.aiConfigs = (backupData.aiConfigs?.length || 0);
      details.aiHistory = (backupData.aiHistory?.length || 0);
      details.settings = (backupData.settings?.length || 0);
      
      const totalRestored = Object.values(details).reduce((sum, count) => sum + count, 0);
      
      console.log(`渲染进程: 数据恢复完成，总计恢复记录数: ${totalRestored}, 错误数: ${totalErrors}`);
      
      return {
        success: true,
        message: `数据恢复成功，共恢复 ${totalRestored} 条记录${totalErrors > 0 ? `，失败 ${totalErrors} 条` : ''}`,
        details
      };
      
    } catch (error) {
      console.error('渲染进程: 恢复数据失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        message: '数据恢复失败'
      };
    }
  }
  
  /**
   * 完全替换所有数据（先清空，再恢复）
   */
  async replaceAllData(backupData: any): Promise<DataImportResult> {
    try {
      console.log('渲染进程: 开始完全替换数据...');
      
      // 先清空所有数据
      await this.forceCleanAllTables();
      
      // 然后恢复数据
      return await this.restoreData(backupData);
    } catch (error) {
      console.error('渲染进程: 完全替换数据失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        message: '数据替换失败'
      };
    }
  }
  
  /**
   * 强制清空所有数据表（公开方法）
   */
  async forceCleanAllTables(): Promise<void> {
    try {
      console.log('开始清空所有数据表...');
      
      const db = await this.getDatabase();
      if (!db) {
        throw new Error('无法获取数据库连接');
      }
      
      const tableNames = ['categories', 'prompts', 'promptVariables', 'promptHistories', 'ai_configs', 'ai_generation_history', 'settings'];
      
      for (const tableName of tableNames) {
        if (db.objectStoreNames.contains(tableName)) {
          const transaction = db.transaction([tableName], 'readwrite');
          const store = transaction.objectStore(tableName);
          await new Promise<void>((resolve, reject) => {
            const clearRequest = store.clear();
            clearRequest.onsuccess = () => {
              console.log(`清空表 ${tableName} 成功`);
              resolve();
            };
            clearRequest.onerror = () => reject(clearRequest.error);
          });
        }
      }
      
      console.log('所有数据表清空完成');
    } catch (error) {
      console.error('清空数据表失败:', error);
      throw error;
    }
  }
  
  /**
   * 获取数据库连接
   */
  private async getDatabase(): Promise<IDBDatabase | null> {
    try {
      await this.waitForInitialization();
      // 使用基础服务的数据库连接
      return (this.category as any).db;
    } catch (error) {
      console.error('获取数据库连接失败:', error);
      return null;
    }
  }

  /**
   * 获取数据库统计信息
   * 返回各表的记录数量等统计信息
   */
  async getDataStats(): Promise<{
    categories: number;
    prompts: number;
    aiConfigs: number;
    aiHistory: number;
    settings: number;
    totalSize: number;
    lastBackupTime: string | null;
  }> {
    try {
      const [
        categories,
        prompts,
        aiConfigs,
        aiHistory,
        settings
      ] = await Promise.all([
        this.category.getBasicCategories(),
        this.prompt.getAllPromptsForTags(),
        this.aiConfig.getAllAIConfigs(),
        this.aiGenerationHistory.getAllAIGenerationHistory(),
        this.appSettings.getAllSettings()
      ]);

      // 估算总大小（简单估算）
      const totalSize = JSON.stringify({
        categories,
        prompts,
        aiConfigs,
        aiHistory,
        settings
      }).length;

      // 获取最后备份时间（如果存在的话）
      const lastBackupSetting = await this.appSettings.getSettingByKey('last_backup_time');
      const lastBackupTime = lastBackupSetting ? lastBackupSetting.value : null;

      return {
        categories: categories.length,
        prompts: prompts.length,
        aiConfigs: aiConfigs.length,
        aiHistory: aiHistory.length,
        settings: settings.length,
        totalSize,
        lastBackupTime
      };
    } catch (error) {
      console.error('获取数据统计失败:', error);
      throw error;
    }
  }

  /**
   * 获取数据统计信息
   */
  async getDataStatistics(): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      console.log('开始获取数据统计信息...');
      
      const [
        categories,
        prompts,
        aiConfigs,
        aiHistory,
        settings
      ] = await Promise.all([
        this.category.getBasicCategories(),
        this.prompt.getAllPromptsForTags(),
        this.aiConfig.getAllAIConfigs(),
        this.aiGenerationHistory.getAllAIGenerationHistory(),
        this.appSettings.getAllSettings()
      ]);

      // 计算敏感数据
      const sensitivePrompts = prompts.filter(p => 
        p.content?.toLowerCase().includes('api') ||
        p.content?.toLowerCase().includes('key') ||
        p.content?.toLowerCase().includes('token') ||
        p.content?.toLowerCase().includes('password')
      ).length;

      const sensitiveAIConfigs = aiConfigs.filter(config =>
        config.apiKey || config.baseUrl
      ).length;

      const stats = {
        categories: categories.length,
        prompts: prompts.length,
        aiConfigs: aiConfigs.length,
        history: aiHistory.length,
        settings: settings.length,
        totalRecords: categories.length + prompts.length + aiConfigs.length + 
                     aiHistory.length + settings.length,
        sensitiveData: {
          prompts: sensitivePrompts,
          aiConfigs: sensitiveAIConfigs,
          total: sensitivePrompts + sensitiveAIConfigs
        }
      };

      console.log('数据统计获取成功:', stats);
      return { success: true, data: stats };
    } catch (error) {
      console.error('获取数据统计失败:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : '未知错误' 
      };
    }
  }

  /**
   * 获取数据库健康状态的详细信息
   */
  async getDetailedHealthStatus(): Promise<{
    healthy: boolean;
    missingStores: string[];
    storeStats: Record<string, number>;
    version: number;
    needsRepair: boolean;
  }> {
    const healthStatus = await this.getHealthStatus();
    const stats = await this.getDataStats();
    
    return {
      healthy: healthStatus.healthy,
      missingStores: healthStatus.missingStores,
      storeStats: {
        categories: stats.categories,
        prompts: stats.prompts,
        aiConfigs: stats.aiConfigs,
        aiHistory: stats.aiHistory,
        settings: stats.settings
      },
      version: await this.getDatabaseVersion(),
      needsRepair: !healthStatus.healthy
    };
  }

  /**
   * 获取数据库版本号
   */
  private async getDatabaseVersion(): Promise<number> {
    try {
      const db = await this.getDatabase();
      return db?.version || 0;
    } catch {
      return 0;
    }
  }

  /**
   * 确保导入数据中的UUID完整性
   * 为缺失UUID的数据项自动生成UUID
   */
  private ensureUUIDsInImportData(data: any): any {
    if (!data || typeof data !== 'object') {
      return data;
    }

    // 需要UUID的数据类型
    const syncableTypes = ['categories', 'prompts', 'promptVariables', 'promptHistories', 'aiConfigs', 'aiGenerationHistory'];
    
    for (const type of syncableTypes) {
      if (data[type] && Array.isArray(data[type])) {
        data[type] = data[type].map((item: any) => {
          if (!item.uuid) {
            console.log(`为导入的 ${type} 数据补全 UUID: ${item.id || item.name || '未知条目'}`);
            item.uuid = generateUUID();
          }
          return item;
        });
      }
    }
    
    return data;
  }
}
