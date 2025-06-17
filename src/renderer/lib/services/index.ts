/**
 * 数据库服务总汇编
 * 统一导出所有数据库服务实例和类型定义，不写任何独立函数
 */

// 导入所有服务类
import { BaseDatabaseService } from './base-database.service';
import { CategoryService } from './category.service';
import { PromptService } from './prompt.service';
import { AIConfigService } from './ai-config.service';
import { AIGenerationHistoryService } from './ai-generation-history.service';
import { AppSettingsService } from './app-settings.service';
import { DatabaseServiceManager } from './database-manager.service';

// 导出所有服务类
export { BaseDatabaseService } from './base-database.service';
export { CategoryService } from './category.service';
export { PromptService } from './prompt.service';
export { AIConfigService } from './ai-config.service';
export { AIGenerationHistoryService } from './ai-generation-history.service';
export { AppSettingsService } from './app-settings.service';
export { DatabaseServiceManager } from './database-manager.service';

// 创建并导出统一的数据库服务管理器实例
export const databaseService = DatabaseServiceManager.getInstance();

// 为了向后兼容，也导出为databaseServiceManager
export const databaseServiceManager = DatabaseServiceManager.getInstance();

// 导出初始化函数
export const initDatabase = async (): Promise<void> => {
  await databaseService.initialize();
};

// 为了向后兼容，也导出传统的服务实例
export const categoryService = CategoryService.getInstance();
export const promptService = PromptService.getInstance();
export const aiConfigService = AIConfigService.getInstance();
export const aiGenerationHistoryService = AIGenerationHistoryService.getInstance();
export const appSettingsService = AppSettingsService.getInstance();
