/**
 * 数据库服务接口定义
 * 用于解耦 IPC 处理器和具体的数据库实现
 */

export interface DatabaseService {
  // 健康检查
  getHealthStatus(): Promise<{
    healthy: boolean;
    missingStores?: string[];
  }>;
  
  // 数据导出
  exportAllData(): Promise<{
    success: boolean;
    data?: any;
    error?: string;
    message?: string;
  }>;
  
  // 数据导入
  importData(data: any): Promise<{
    success: boolean;
    message?: string;
    error?: string;
    details?: Record<string, number>;
  }>;
  
  // 数据备份
  backupData(): Promise<{
    success: boolean;
    data?: any;
    message?: string;
    error?: string;
  }>;
  
  // 数据恢复
  restoreData(backupData: any): Promise<{
    success: boolean;
    message?: string;
    error?: string;
    details?: Record<string, number>;
  }>;
}

// 具体的服务接口
export interface UserService {
  getAllUsers(): Promise<any[]>;
  createUser(userData: any): Promise<any>;
  repairDatabase(): Promise<{ success: boolean; message?: string; }>;
}

export interface PostService {
  getAllPosts(): Promise<any[]>;
  createPost(postData: any): Promise<any>;
}

export interface CategoryService {
  getBasicCategories(): Promise<any[]>;
  createCategory(categoryData: any): Promise<any>;
}

export interface PromptService {
  getAllPromptsForTags(): Promise<any[]>;
  createPrompt(promptData: any): Promise<any>;
}

export interface AIConfigService {
  getAllAIConfigs(): Promise<any[]>;
  createAIConfig(configData: any): Promise<any>;
}

export interface AIGenerationHistoryService {
  getAllAIGenerationHistory(): Promise<any[]>;
  createAIGenerationHistory(historyData: any): Promise<any>;
}

export interface AppSettingsService {
  getAllSettings(): Promise<any[]>;
  setSetting(key: string, value: any): Promise<any>;
}

// 数据库服务管理器接口
export interface DatabaseServiceManager {
  user: UserService;
  post: PostService;
  category: CategoryService;
  prompt: PromptService;
  aiConfig: AIConfigService;
  aiGenerationHistory: AIGenerationHistoryService;
  appSettings: AppSettingsService;
  
  waitForInitialization(): Promise<void>;
  getHealthStatus(): Promise<{ healthy: boolean; missingStores?: string[]; }>;
  
  // 清空数据表方法
  clearAllTables?(): Promise<void>;
}
