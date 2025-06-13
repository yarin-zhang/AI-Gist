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
   * 获取数据库统计信息
   * 返回所有表的记录数量统计
   * @returns Promise<Record<string, number>> 各表的记录数量
   */
  async getDatabaseStats(): Promise<Record<string, number>> {
    const stats: Record<string, number> = {};

    try {
      const [
        users,
        posts,
        categories,
        prompts,
        aiConfigs,
        aiHistory,
        settings
      ] = await Promise.all([
        this.user.getAllUsers(),
        this.post.getAllPosts(),
        this.category.getBasicCategories(),
        this.prompt.getAllPromptsForTags(),
        this.aiConfig.getAllAIConfigs(),
        this.aiGenerationHistory.getAllAIGenerationHistory(),
        this.appSettings.getAllSettings()
      ]);

      stats.users = users.length;
      stats.posts = posts.length;
      stats.categories = categories.length;
      stats.prompts = prompts.length;
      stats.aiConfigs = aiConfigs.length;
      stats.aiHistory = aiHistory.length;
      stats.settings = settings.length;
    } catch (error) {
      console.error('Failed to get database stats:', error);
    }

    return stats;
  }
}

// 创建并导出单例实例
export const databaseServiceManager = DatabaseServiceManager.getInstance();

// 为了保持向后兼容，导出传统的数据库服务实例
export const databaseService = databaseServiceManager;

// 导出初始化函数
export const initDatabase = () => databaseServiceManager.initialize();
