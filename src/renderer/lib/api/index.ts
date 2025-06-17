/**
 * API客户端总汇编
 * 统一导出所有API客户端实例和工厂函数
 */

// 导入所有API客户端类和工厂函数
import { CategoryApiClient, createCategoryApiClient } from './category.api';
import { PromptApiClient, createPromptApiClient } from './prompt.api';
import { AIConfigApiClient, createAIConfigApiClient } from './ai-config.api';
import { AIGenerationHistoryApiClient, createAIGenerationHistoryApiClient } from './ai-generation-history.api';
import { AppSettingsApiClient, createAppSettingsApiClient } from './app-settings.api';
import { WebDAVAPI } from './webdav.api';
import { DataManagementAPI } from './data-management.api';

// 导出所有API客户端类
export { 
  CategoryApiClient,
  PromptApiClient,
  AIConfigApiClient,
  AIGenerationHistoryApiClient,
  AppSettingsApiClient,
  WebDAVAPI,
  DataManagementAPI
};

// 导出所有工厂函数
export { 
  createCategoryApiClient,
  createPromptApiClient,
  createAIConfigApiClient,
  createAIGenerationHistoryApiClient,
  createAppSettingsApiClient
};

/**
 * 统一的API客户端管理类
 * 提供对所有API客户端的统一访问接口
 */
export class ApiClientManager {
  private static instance: ApiClientManager;
  
  // 各个API客户端实例
  public readonly category: CategoryApiClient;
  public readonly prompt: PromptApiClient;
  public readonly aiConfig: AIConfigApiClient;
  public readonly aiGenerationHistory: AIGenerationHistoryApiClient;
  public readonly appSettings: AppSettingsApiClient;

  private constructor() {
    // 初始化所有API客户端实例
    this.category = createCategoryApiClient();
    this.prompt = createPromptApiClient();
    this.aiConfig = createAIConfigApiClient();
    this.aiGenerationHistory = createAIGenerationHistoryApiClient();
    this.appSettings = createAppSettingsApiClient();
  }

  /**
   * 获取API客户端管理器单例实例
   * @returns ApiClientManager API客户端管理器实例
   */
  static getInstance(): ApiClientManager {
    if (!ApiClientManager.instance) {
      ApiClientManager.instance = new ApiClientManager();
    }
    return ApiClientManager.instance;
  }
}

/**
 * 创建传统风格的API客户端
 * 为了保持向后兼容，创建类似原始api.ts的结构
 */
function createApiClient() {
  const categoryClient = createCategoryApiClient();
  const promptClient = createPromptApiClient();
  const aiConfigClient = createAIConfigApiClient();
  const aiGenerationHistoryClient = createAIGenerationHistoryApiClient();
  const appSettingsClient = createAppSettingsApiClient();

  return {
    // 分类相关API
    categories: categoryClient.categories,

    // 提示词相关API
    prompts: promptClient.prompts,
    promptVariables: promptClient.promptVariables,
    promptHistories: promptClient.promptHistories,

    // AI配置相关API
    aiConfigs: aiConfigClient.aiConfigs,

    // AI生成历史相关API
    aiGenerationHistory: aiGenerationHistoryClient.aiGenerationHistory,

    // 应用设置相关API
    appSettings: appSettingsClient.appSettings,
    settingValues: appSettingsClient.values
  };
}

// 创建并导出单例实例
export const apiClientManager = ApiClientManager.getInstance();

// 为了保持向后兼容，导出传统的API客户端
export const api = createApiClient();

// 类型定义（为了兼容性保留）
export type AppRouter = any;
export type DatabaseClient = typeof api;
