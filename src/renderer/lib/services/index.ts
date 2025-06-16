/**
 * 数据库服务总汇编
 * 统一导出所有数据库服务实例和类型定义
 */

// 导入所有服务类
import { BaseDatabaseService } from './base-database.service';
import { UserService } from './user.service';
import { PostService } from './post.service';
import { CategoryService } from './category.service';
import { PromptService } from './prompt.service';
import { AIConfigService } from './ai-config.service';
import { AIGenerationHistoryService } from './ai-generation-history.service';
import { AppSettingsService } from './app-settings.service';

// 导出所有类型定义
export * from '../types/database';

// 导出基础服务类
export { BaseDatabaseService };

// 导出各个服务类
export { 
  UserService,
  PostService,
  CategoryService,
  PromptService,
  AIConfigService,
  AIGenerationHistoryService,
  AppSettingsService
};

/**
 * 统一的数据库服务管理类
 * 提供对所有数据库服务的统一访问接口
 */
export class DatabaseServiceManager {
  private static instance: DatabaseServiceManager;
  
  // 各个服务实例
  public readonly user: UserService;
  public readonly post: PostService;
  public readonly category: CategoryService;
  public readonly prompt: PromptService;
  public readonly aiConfig: AIConfigService;
  public readonly aiGenerationHistory: AIGenerationHistoryService;
  public readonly appSettings: AppSettingsService;

  private constructor() {
    // 初始化所有服务实例
    this.user = UserService.getInstance();
    this.post = PostService.getInstance();
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
    await this.user.initialize();
  }

  /**
   * 等待所有数据库服务初始化完成
   * @returns Promise<void> 初始化完成的Promise
   */
  async waitForInitialization(): Promise<void> {
    await this.user.waitForInitialization();
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
    this.user.close();
  }

  /**
   * 获取数据库健康状态
   * 检查所有关键表是否存在
   * @returns Promise<{ healthy: boolean; missingStores: string[] }> 健康状态信息
   */
  async getHealthStatus(): Promise<{ healthy: boolean; missingStores: string[] }> {
    const requiredStores = [
      'users',
      'posts',
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
      const exists = await this.user.checkObjectStoreExists(storeName);
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
      const repairResult = await this.user.repairDatabase();
      
      if (repairResult.success) {
        console.log('DatabaseServiceManager: 数据库修复成功');
        
        // 重新检查健康状态
        const healthStatus = await this.getHealthStatus();
        
        if (healthStatus.healthy) {
          return {
            success: true,
            message: '数据库修复成功，所有对象存储已正常'
          };
        } else {
          return {
            success: false,
            message: `数据库修复部分成功，仍缺失: ${healthStatus.missingStores.join(', ')}`
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
          message: '数据库状态正常'
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
          message: `数据库已修复，已创建缺失的对象存储: ${healthStatus.missingStores.join(', ')}`
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
}

// 创建并导出单例实例
export const databaseServiceManager = DatabaseServiceManager.getInstance();

// 为了保持向后兼容，导出传统的数据库服务实例
export const databaseService = databaseServiceManager;

// 导出初始化函数
export const initDatabase = () => databaseServiceManager.initialize();
