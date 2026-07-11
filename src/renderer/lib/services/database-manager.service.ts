/**
 * 数据库管理器服务
 * 提供数据库的高级管理功能，包括健康检查、修复、数据导入导出等
 */

import type { 
  ExportResult as DataExportResult, 
  ImportResult as DataImportResult,
  DataOperationErrorCode,
  DataOperationFailure,
  DataOperationPhase
} from '@shared/types/data-management';
import { BaseDatabaseService } from './base-database.service';
import { CategoryService } from './category.service';
import { PromptService } from './prompt.service';
import { AIConfigService } from './ai-config.service';
import { AIGenerationHistoryService } from './ai-generation-history.service';
import { AppSettingsService } from './app-settings.service';
import { QuickOptimizationService } from './quick-optimization.service';
import { generateUUID } from '../utils/uuid';
import { emitDataChange } from './data-change-events';
import { unwrapBackupData } from '@shared/backup-integrity';
import { reconcileCloudSyncDataContract } from '@shared/cloud-sync-contract';
import { dataOperationLock } from './data-operation-lock';

const SYNCABLE_DATA_STORES = [
  'categories',
  'prompts',
  'promptVariables',
  'promptHistories',
  'ai_configs',
  'quick_optimization_configs',
  'ai_generation_history',
  'settings',
  'syncTombstones'
];

const RESTORABLE_DATA_FIELDS = [
  'categories',
  'prompts',
  'promptVariables',
  'promptHistories',
  'aiConfigs',
  'quickOptimizationConfigs',
  'aiHistory',
  'settings',
  'syncTombstones'
];

const DATABASE_DEBUG_STORAGE_KEY = 'ai-gist.debug.database';

const RESTORE_STORE_BY_COLLECTION: Record<string, string> = {
  categories: 'categories',
  prompts: 'prompts',
  promptVariables: 'promptVariables',
  promptHistories: 'promptHistories',
  aiConfigs: 'ai_configs',
  quickOptimizationConfigs: 'quick_optimization_configs',
  aiHistory: 'ai_generation_history',
  settings: 'settings',
  syncTombstones: 'syncTombstones'
};

interface PreparedRestoreRecord {
  collection: string;
  storeName: string;
  recordKey: string;
  businessKey?: string;
  value: any;
}

interface PreparedRestorePlan {
  operationId: string;
  records: PreparedRestoreRecord[];
  details: Record<string, number>;
}

class StructuredDataOperationError extends Error {
  readonly failure: DataOperationFailure;

  constructor(failure: DataOperationFailure) {
    super(failure.message);
    this.name = 'StructuredDataOperationError';
    this.failure = failure;
  }
}

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
  public readonly quickOptimization: QuickOptimizationService;

  private constructor() {
    // 初始化所有服务实例
    this.category = CategoryService.getInstance();
    this.prompt = PromptService.getInstance();
    this.aiConfig = AIConfigService.getInstance();
    this.aiGenerationHistory = AIGenerationHistoryService.getInstance();
    this.appSettings = AppSettingsService.getInstance();
    this.quickOptimization = QuickOptimizationService.getInstance();
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

  private debugLog(...args: unknown[]): void {
    if (!this.isDebugLoggingEnabled()) {
      return;
    }
    console.debug(...args);
  }

  private debugWarn(...args: unknown[]): void {
    if (!this.isDebugLoggingEnabled()) {
      return;
    }
    console.warn(...args);
  }

  private debugError(...args: unknown[]): void {
    if (!this.isDebugLoggingEnabled()) {
      return;
    }
    console.error(...args);
  }

  private isDebugLoggingEnabled(): boolean {
    try {
      return typeof localStorage !== 'undefined' &&
        localStorage.getItem(DATABASE_DEBUG_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  }

  /**
   * 获取数据库健康状态
   * 检查所有关键表是否存在
   * @returns Promise<{ healthy: boolean; missingStores: string[] }> 健康状态信息
   */
  async getHealthStatus(): Promise<{ healthy: boolean; missingStores: string[] }> {
    const missingStores: string[] = [];

    for (const storeName of SYNCABLE_DATA_STORES) {
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
      this.debugLog('DatabaseServiceManager: 开始修复数据库...');
      
      // 使用基础服务的修复功能
      const repairResult = await this.category.repairDatabase();
      
      if (repairResult.success) {
        this.debugLog('DatabaseServiceManager: 数据库修复成功');
        
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
      this.debugError('DatabaseServiceManager: 数据库修复失败:', error);
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
      this.debugLog('正在检查数据库健康状态...');
      
      const healthStatus = await this.getHealthStatus();
      
      if (healthStatus.healthy) {
        return {
          healthy: true,
          repaired: false,
          message: '数据库状态良好，无需修复'
        };
      }
      
      this.debugLog('检测到数据库问题，缺失的对象存储:', healthStatus.missingStores);
      
      // 首先尝试普通修复
      this.debugLog('尝试修复数据库...');
      const repairResult = await this.repairDatabase();
      
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
      this.debugError('检查和修复数据库过程中出错:', error);
      return {
        healthy: false,
        repaired: false,
        message: `操作失败: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }
  
  /**
   * Blob 转 base64 data URL
   */
  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  }

  /**
   * base64 data URL 转 Blob
   */
  private async base64ToBlob(dataUrl: string): Promise<Blob> {
    const response = await fetch(dataUrl)
    return response.blob()
  }

  /**
   * 序列化记录中的 imageBlobs（Blob[] → base64 string[]）
   */
  private async serializeImageBlobs(records: any[]): Promise<any[]> {
    return Promise.all(records.map(async (record) => {
      if (!record.imageBlobs?.length) return record
      if (!Array.isArray(record.imageBlobs)) {
        throw new Error('图片数据格式无效，无法创建完整备份')
      }

      const serialized = await Promise.all(record.imageBlobs.map((item: any, index: number) => {
        if (item instanceof Blob) {
          return this.blobToBase64(item)
        }
        if (typeof item === 'string' && item.startsWith('data:')) {
          return item
        }
        throw new Error(`图片数据格式无效，无法创建完整备份（第 ${index + 1} 张）`)
      }))
      return { ...record, imageBlobs: serialized }
    }))
  }

  /**
   * 反序列化记录中的 imageBlobs（base64 string[] → Blob[]）
   */
  private async deserializeImageBlobs(recordData: any): Promise<any> {
    if (!recordData.imageBlobs?.length) return recordData
    if (!Array.isArray(recordData.imageBlobs)) {
      throw new Error('图片数据格式无效，无法恢复完整数据')
    }

    const blobs = (await Promise.all(
      recordData.imageBlobs.map(async (item: any, index: number) => {
        if (typeof item === 'string' && item.startsWith('data:')) {
          return this.base64ToBlob(item)
        }
        if (item instanceof Blob) {
          return item
        }
        throw new Error(`图片数据格式无效，无法恢复完整数据（第 ${index + 1} 张）`)
      })
    ))
    return { ...recordData, imageBlobs: blobs }
  }

  /**
   * 导出所有数据
   */
  async exportAllData(): Promise<DataExportResult> {
    try {
      this.debugLog('渲染进程: 开始导出数据库数据...');
      
      // 首先检查数据库健康状态
      this.debugLog('正在检查数据库健康状态...');
      const healthStatus = await this.getHealthStatus();
      
      if (!healthStatus.healthy) {
        this.debugWarn('检测到数据库异常，缺失的对象存储:', healthStatus.missingStores);
        
        // 尝试修复数据库
        this.debugLog('正在尝试修复数据库...');
        const repairResult = await this.repairDatabase();
        
        if (!repairResult.success) {
          throw new Error(`数据库修复失败: ${repairResult.message}`);
        }
        
        this.debugLog('数据库修复成功，继续导出数据...');
      }
      
      const consistentSnapshot = await this.tryReadConsistentExportSnapshot();
      let categories: any[];
      let prompts: any[];
      let promptVariables: any[];
      let promptHistories: any[];
      let aiConfigs: any[];
      let quickOptimizationConfigs: any[];
      let aiHistory: any[];
      let settings: any[];

      if (consistentSnapshot) {
        ({
          categories,
          prompts,
          promptVariables,
          promptHistories,
          aiConfigs,
          quickOptimizationConfigs,
          aiHistory,
          settings
        } = consistentSnapshot);
      } else {
        // Compatibility path for tests and legacy/incomplete databases. A
        // healthy production database always uses the single transaction path.
        const results = await Promise.allSettled([
          this.category.getBasicCategories(),
          this.prompt.getAllPromptsForTags(),
          this.prompt.getAllPromptVariables(),
          this.prompt.getAllPromptHistories(),
          this.aiConfig.getAllAIConfigs(),
          this.quickOptimization.getAllQuickOptimizationConfigs(),
          this.aiGenerationHistory.getAllAIGenerationHistory(),
          this.appSettings.getAllSettings()
        ]);
        const tableNames = ['categories', 'prompts', 'promptVariables', 'promptHistories', 'aiConfigs', 'quickOptimizationConfigs', 'aiHistory', 'settings'];
        const failedTables = results
          .map((result, index) => result.status === 'rejected'
            ? { tableName: tableNames[index], reason: result.reason }
            : null)
          .filter((failure): failure is { tableName: string; reason: unknown } => !!failure);

        if (failedTables.length > 0) {
          throw new Error(`读取数据表失败: ${failedTables.map(failure => failure.tableName).join(', ')}`);
        }

        [
          categories,
          prompts,
          promptVariables,
          promptHistories,
          aiConfigs,
          quickOptimizationConfigs,
          aiHistory,
          settings
        ] = results.map(result => result.status === 'fulfilled' ? (result.value || []) : []);
      }
      
      const exportData = this.attachRelationUUIDsToExportData({
        categories: categories as any[],
        prompts: prompts as any[],
        promptVariables: promptVariables as any[],
        promptHistories: promptHistories as any[],
        aiConfigs: aiConfigs as any[],
        quickOptimizationConfigs: quickOptimizationConfigs as any[],
        aiHistory: aiHistory as any[],
        settings: settings as any[]
      });
      
      this.debugLog('渲染进程: 数据导出完成', {
        分类数: exportData.categories.length,
        提示词数: exportData.prompts.length,
        提示词变量数: exportData.promptVariables.length,
        提示词历史数: exportData.promptHistories.length,
        AI配置数: exportData.aiConfigs.length,
        快速优化配置数: exportData.quickOptimizationConfigs.length,
        AI历史数: exportData.aiHistory.length,
        设置数: exportData.settings.length
      });
      
      return {
        success: true,
        message: '数据导出成功',
        data: exportData,
        recordCount: Object.values(exportData).reduce<number>(
          (sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0),
          0
        ),
        size: JSON.stringify(exportData).length
      };
      
    } catch (error) {
      this.debugError('渲染进程: 导出数据库数据失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        message: '数据导出失败'
      };
    }
  }

  /**
   * 导出所有数据（备份专用，包含图片 base64 序列化）
   * 移动端备份时使用此方法，确保 imageBlobs 能正确序列化为 JSON
   */
  async exportAllDataForBackup(): Promise<DataExportResult> {
    return dataOperationLock.runExclusive(() => this.exportAllDataForBackupUnlocked());
  }

  private async exportAllDataForBackupUnlocked(): Promise<DataExportResult> {
    try {
      const result = await this.exportAllData();
      if (!result.success || !result.data) return result;
      return {
        ...result,
        data: {
          ...result.data,
          prompts: await this.serializeImageBlobs(result.data.prompts),
          promptHistories: await this.serializeImageBlobs(result.data.promptHistories || [])
        }
      };
    } catch (error) {
      this.debugError('导出备份数据失败:', error);
      return {
        success: false,
        message: '备份数据导出失败',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private attachRelationUUIDsToExportData(data: any): any {
    const categoriesById = new Map<string, any>(
      (data.categories || [])
        .filter((category: any) => category?.id !== undefined && category?.id !== null)
        .map((category: any) => [String(category.id), category])
    );
    const promptsById = new Map<string, any>(
      (data.prompts || [])
        .filter((prompt: any) => prompt?.id !== undefined && prompt?.id !== null)
        .map((prompt: any) => [String(prompt.id), prompt])
    );

    return {
      ...data,
      prompts: (data.prompts || []).map((prompt: any) => {
        const category = prompt.category || categoriesById.get(String(prompt.categoryId));
        return category?.uuid && !prompt.categoryUuid
          ? { ...prompt, categoryUuid: category.uuid }
          : prompt;
      }),
      promptVariables: (data.promptVariables || []).map((variable: any) => {
        const prompt = promptsById.get(String(variable.promptId));
        return prompt?.uuid && !variable.promptUuid
          ? { ...variable, promptUuid: prompt.uuid }
          : variable;
      }),
      promptHistories: (data.promptHistories || []).map((history: any) => {
        const prompt = promptsById.get(String(history.promptId));
        const category = categoriesById.get(String(history.categoryId));
        return {
          ...history,
          ...(prompt?.uuid && !history.promptUuid ? { promptUuid: prompt.uuid } : {}),
          ...(category?.uuid && !history.categoryUuid ? { categoryUuid: category.uuid } : {})
        };
      })
    };
  }

  private resolveRestoredPromptId(
    record: any,
    idMapping: Record<string, number>,
    uuidMapping: Record<string, number>,
    restoredIds: Set<number>
  ): number | undefined {
    if (record.promptId !== undefined) {
      const mappedId = idMapping[`prompt_${record.promptId}`];
      if (mappedId !== undefined) {
        return mappedId;
      }
    }

    if (record.promptUuid && uuidMapping[record.promptUuid] !== undefined) {
      return uuidMapping[record.promptUuid];
    }

    if (record.promptId !== undefined) {
      const numericId = Number(record.promptId);
      if (restoredIds.has(numericId)) {
        return numericId;
      }
    }

    if (restoredIds.size === 1) {
      return [...restoredIds][0];
    }

    return undefined;
  }

  private resolveRestoredCategoryId(
    record: any,
    idMapping: Record<string, number>,
    uuidMapping: Record<string, number>,
    restoredIds: Set<number>
  ): number | undefined {
    if (record.categoryId !== undefined && record.categoryId !== null) {
      const mappedId = idMapping[`category_${record.categoryId}`];
      if (mappedId !== undefined) {
        return mappedId;
      }
    }

    if (record.categoryUuid && uuidMapping[record.categoryUuid] !== undefined) {
      return uuidMapping[record.categoryUuid];
    }

    if (record.categoryId !== undefined && record.categoryId !== null) {
      const numericId = Number(record.categoryId);
      if (restoredIds.has(numericId)) {
        return numericId;
      }
    }

    return undefined;
  }

  /**
   * 导出云同步快照数据。
   * 与普通备份相比，同步快照额外包含删除标记，避免多端硬删除丢失。
   */
  async exportAllDataForSync(): Promise<DataExportResult> {
    return dataOperationLock.runExclusive(() => this.exportAllDataForSyncUnlocked());
  }

  private async exportAllDataForSyncUnlocked(): Promise<DataExportResult> {
    try {
      await this.ensureStableSyncUUIDs();
    } catch (error) {
      return {
        success: false,
        message: '同步数据导出失败',
        error: `同步记录 UUID 迁移失败: ${error instanceof Error ? error.message : String(error)}`
      };
    }

    const result = await this.exportAllDataForBackupUnlocked();
    if (!result.success || !result.data) return result;

    let syncTombstones: any[] = [];
    try {
      syncTombstones = await this.category.getSyncTombstones();
    } catch (error) {
      this.debugWarn('获取同步删除标记失败:', error);
      return {
        success: false,
        message: '同步数据导出失败',
        error: `读取同步删除标记失败: ${error instanceof Error ? error.message : String(error)}`
      };
    }

    return {
      ...result,
      data: {
        ...result.data,
        syncTombstones
      }
    };
  }

  private async ensureStableSyncUUIDs(): Promise<void> {
    const migrationResult = await this.category.migrateAllRecordsToUUID();
    const failedStores = Object.entries(migrationResult)
      .filter(([, updatedCount]) => updatedCount < 0)
      .map(([storeName]) => storeName);

    if (failedStores.length > 0) {
      throw new Error(failedStores.join(', '));
    }
  }

  /**
   * 导入数据
   */
  async importData(data: any): Promise<DataImportResult> {
    try {
      this.debugLog('渲染进程: 开始导入数据库数据...');
      data = unwrapBackupData(data);
      
      if (!data || typeof data !== 'object') {
        throw new Error('导入数据格式无效');
      }
      
      // 确保导入数据具有完整的UUID
      data = this.ensureUUIDsInImportData(data);
      const hasStandalonePromptVariables = Array.isArray(data.promptVariables);
      
      const details: Record<string, number> = {};
      let totalErrors = 0;
      
      // ID映射表：旧ID -> 新ID
      const idMapping: Record<string, number> = {};
      const categoryUuidMapping: Record<string, number> = {};
      const promptUuidMapping: Record<string, number> = {};
      const restoredCategoryIds = new Set<number>();
      const restoredPromptIds = new Set<number>();
      
      // 导入分类数据
      if (data.categories && data.categories.length > 0) {
        this.debugLog(`导入分类数据: ${data.categories.length} 条`);
        for (const category of data.categories) {
          const oldId = category.id;
          const { id, ...categoryDataWithoutId } = category;
          
          try {
            const newCategory = await this.addRestoredRecord('categories', categoryDataWithoutId);
            // 记录ID映射：旧ID -> 新ID
            if (oldId !== undefined) {
              idMapping[`category_${oldId}`] = newCategory.id!;
              this.debugLog(`分类ID映射: ${oldId} -> ${newCategory.id}`);
            }
            if (newCategory.id !== undefined) {
              restoredCategoryIds.add(newCategory.id);
              if (category.uuid) {
                categoryUuidMapping[category.uuid] = newCategory.id;
              }
            }
          } catch (err) {
            this.debugWarn('导入分类数据失败:', category.id, err);
            totalErrors++;
          }
        }
      }
      
      // 导入提示词数据（需要处理分类ID映射）
      if (data.prompts && data.prompts.length > 0) {
        this.debugLog(`导入提示词数据: ${data.prompts.length} 条`);
        for (const prompt of data.prompts) {
          const oldPromptId = prompt.id;
          const promptDataWithoutId = { ...prompt };
          delete promptDataWithoutId.id;
          delete promptDataWithoutId.category;
          if (hasStandalonePromptVariables) {
            delete promptDataWithoutId.variables;
          }
          
          // 处理分类ID映射
          if (promptDataWithoutId.categoryId !== undefined || promptDataWithoutId.categoryUuid) {
            const oldCategoryId = promptDataWithoutId.categoryId;
            const newCategoryId = this.resolveRestoredCategoryId(
              promptDataWithoutId,
              idMapping,
              categoryUuidMapping,
              restoredCategoryIds
            );

            if (newCategoryId !== undefined) {
              promptDataWithoutId.categoryId = newCategoryId;
              this.debugLog(`提示词分类ID映射: ${oldCategoryId} -> ${newCategoryId}`);
            } else {
              this.debugWarn(`未找到分类ID映射: ${oldCategoryId}，将提示词设为未分类`);
              promptDataWithoutId.categoryId = undefined;
            }
          }

          try {
            const promptToCreate = await this.deserializeImageBlobs(promptDataWithoutId);
            const newPrompt = await this.addRestoredRecord('prompts', promptToCreate);

            // 记录提示词ID映射：旧ID -> 新ID
            if (oldPromptId !== undefined) {
              idMapping[`prompt_${oldPromptId}`] = newPrompt.id!;
              this.debugLog(`提示词ID映射: ${oldPromptId} -> ${newPrompt.id}`);
            }
            if (newPrompt.id !== undefined) {
              restoredPromptIds.add(newPrompt.id);
              if (prompt.uuid) {
                promptUuidMapping[prompt.uuid] = newPrompt.id;
              }
            }
          } catch (err) {
            this.debugWarn('导入提示词数据失败:', prompt.id, err);
            totalErrors++;
          }
        }
      }

      // 导入提示词变量数据（需要处理提示词 ID 映射）
      if (data.promptVariables && data.promptVariables.length > 0) {
        this.debugLog(`导入提示词变量数据: ${data.promptVariables.length} 条`);
        for (const variable of data.promptVariables) {
          const variableDataWithoutId = { ...variable };
          delete variableDataWithoutId.id;

          if (variableDataWithoutId.promptId !== undefined || variableDataWithoutId.promptUuid) {
            const newPromptId = this.resolveRestoredPromptId(
              variableDataWithoutId,
              idMapping,
              promptUuidMapping,
              restoredPromptIds
            );
            if (newPromptId !== undefined) {
              variableDataWithoutId.promptId = newPromptId;
            } else {
              this.debugWarn(`未找到提示词变量的提示词ID映射: ${variableDataWithoutId.promptId}`);
              totalErrors++;
              continue;
            }
          }

          try {
            await this.addRestoredRecord('promptVariables', variableDataWithoutId);
          } catch (err) {
            this.debugWarn('导入提示词变量数据失败:', variable.id, err);
            totalErrors++;
          }
        }
      }

      // 导入提示词历史数据（需要处理提示词 ID 映射）
      if (data.promptHistories && data.promptHistories.length > 0) {
        this.debugLog(`导入提示词历史数据: ${data.promptHistories.length} 条`);
        for (const history of data.promptHistories) {
          const { id, ...historyDataWithoutId } = history;

          if (historyDataWithoutId.promptId !== undefined || historyDataWithoutId.promptUuid) {
            const newPromptId = this.resolveRestoredPromptId(
              historyDataWithoutId,
              idMapping,
              promptUuidMapping,
              restoredPromptIds
            );
            if (newPromptId !== undefined) {
              historyDataWithoutId.promptId = newPromptId;
            } else {
              this.debugWarn(`未找到提示词历史的提示词ID映射: ${historyDataWithoutId.promptId}`);
              totalErrors++;
              continue;
            }
          }

          if (historyDataWithoutId.categoryId !== undefined || historyDataWithoutId.categoryUuid) {
            const newCategoryId = this.resolveRestoredCategoryId(
              historyDataWithoutId,
              idMapping,
              categoryUuidMapping,
              restoredCategoryIds
            );
            if (newCategoryId !== undefined) {
              historyDataWithoutId.categoryId = newCategoryId;
            } else {
              delete historyDataWithoutId.categoryId;
            }
          }

          try {
            const historyToCreate = await this.deserializeImageBlobs(historyDataWithoutId);
            await this.addRestoredRecord('promptHistories', historyToCreate);
          } catch (err) {
            this.debugWarn('导入提示词历史数据失败:', history.id, err);
            totalErrors++;
          }
        }
      }
      
      // 导入AI配置数据
      if (data.aiConfigs && data.aiConfigs.length > 0) {
        this.debugLog(`导入AI配置数据: ${data.aiConfigs.length} 条`);
        for (const config of data.aiConfigs) {
          const { id, ...configDataWithoutId } = config;
          try {
            await this.addRestoredRecord('ai_configs', configDataWithoutId);
          } catch (err) {
            this.debugWarn('导入AI配置数据失败:', config.id, err);
            totalErrors++;
          }
        }
      }

      // 导入快速优化配置数据
      if (data.quickOptimizationConfigs && data.quickOptimizationConfigs.length > 0) {
        this.debugLog(`导入快速优化配置数据: ${data.quickOptimizationConfigs.length} 条`);
        for (const config of data.quickOptimizationConfigs) {
          const configDataWithoutId = { ...config };
          delete configDataWithoutId.id;
          try {
            await this.addRestoredRecord('quick_optimization_configs', configDataWithoutId);
          } catch (err) {
            this.debugWarn('导入快速优化配置数据失败:', config.id, err);
            totalErrors++;
          }
        }
      }
      
      // 导入AI历史数据
      if (data.aiHistory && data.aiHistory.length > 0) {
        this.debugLog(`导入AI历史数据: ${data.aiHistory.length} 条`);
        for (const history of data.aiHistory) {
          const { id, ...historyDataWithoutId } = history;
          try {
            await this.addRestoredRecord('ai_generation_history', historyDataWithoutId);
          } catch (err) {
            this.debugWarn('导入AI历史数据失败:', history.id, err);
            totalErrors++;
          }
        }
      }
      
      // 导入设置数据
      if (data.settings && data.settings.length > 0) {
        this.debugLog(`导入设置数据: ${data.settings.length} 条`);
        for (const setting of data.settings) {
          const settingDataWithoutId = { ...setting };
          delete settingDataWithoutId.id;
          try {
            await this.addRestoredRecord('settings', settingDataWithoutId);
          } catch (err) {
            this.debugWarn('导入设置数据失败:', setting.key, err);
            totalErrors++;
          }
        }
      }
      
      // 统计导入结果
      details.categories = (data.categories?.length || 0);
      details.prompts = (data.prompts?.length || 0);
      details.promptVariables = (data.promptVariables?.length || 0);
      details.promptHistories = (data.promptHistories?.length || 0);
      details.aiConfigs = (data.aiConfigs?.length || 0);
      details.quickOptimizationConfigs = (data.quickOptimizationConfigs?.length || 0);
      details.aiHistory = (data.aiHistory?.length || 0);
      details.settings = (data.settings?.length || 0);
      
      const totalImported = Object.values(details).reduce((sum, count) => sum + count, 0);
      
      this.debugLog('渲染进程: 数据导入完成', details);
      this.debugLog('ID映射表:', idMapping);

      const hasErrors = totalErrors > 0;
      
      return {
        success: !hasErrors,
        message: hasErrors
          ? `数据导入未完全完成，共处理 ${totalImported} 条记录，失败 ${totalErrors} 条`
          : `数据导入成功，共导入 ${totalImported} 条记录`,
        error: hasErrors ? `导入过程中有 ${totalErrors} 条记录失败` : undefined,
        totalImported,
        totalErrors,
        details,
        imported: {
          categories: details.categories,
          prompts: details.prompts,
          settings: details.settings,
          history: details.aiHistory + details.promptHistories,
          aiConfigs: details.aiConfigs
        }
      };
      
    } catch (error) {
      this.debugError('渲染进程: 导入数据库数据失败:', error);
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
    return await this.exportAllDataForBackup();
  }
  
  /**
   * 恢复数据
   */
  async restoreData(backupData: any, options: { skipClean?: boolean } = {}): Promise<DataImportResult> {
    return dataOperationLock.runExclusive(() =>
      options.skipClean
        ? this.restoreDataUnlocked(backupData, options)
        : this.replaceAllDataUnlocked(backupData)
    );
  }

  private async restoreDataUnlocked(backupData: any, options: { skipClean?: boolean } = {}): Promise<DataImportResult> {
    try {
      this.debugLog('渲染进程: 开始恢复数据...');
      backupData = unwrapBackupData(backupData);
      
      if (!backupData || typeof backupData !== 'object') {
        throw new Error('恢复数据格式无效');
      }

      this.assertRestorableDataShape(backupData);
      
      // 确保导入数据具有完整的UUID
      backupData = this.ensureUUIDsInImportData(backupData);
      const hasStandalonePromptVariables = Array.isArray(backupData.promptVariables);
      
      // 清空现有数据表（如果支持的话）
      if (!options.skipClean && this.forceCleanAllTables) {
        this.debugLog('清空现有数据表...');
        await this.forceCleanAllTables();
      }
      
      const details: Record<string, number> = {};
      const restorePromises: Promise<void>[] = [];
      let totalErrors = 0;
      
      // ID映射表：旧ID -> 新ID
      const idMapping: Record<string, number> = {};
      const categoryUuidMapping: Record<string, number> = {};
      const promptUuidMapping: Record<string, number> = {};
      const restoredCategoryIds = new Set<number>();
      const restoredPromptIds = new Set<number>();
      
      // 恢复分类数据
      if (backupData.categories && backupData.categories.length > 0) {
        this.debugLog(`恢复分类数据: ${backupData.categories.length} 条`);
        for (const category of backupData.categories) {
          const oldId = category.id;
          const { id, ...categoryDataWithoutId } = category;
          
          try {
            const newCategory = await this.addRestoredRecord('categories', categoryDataWithoutId);
            // 记录ID映射：旧ID -> 新ID
            if (oldId !== undefined) {
              idMapping[`category_${oldId}`] = newCategory.id!;
              this.debugLog(`分类ID映射: ${oldId} -> ${newCategory.id}`);
            }
            if (newCategory.id !== undefined) {
              restoredCategoryIds.add(newCategory.id);
              if (category.uuid) {
                categoryUuidMapping[category.uuid] = newCategory.id;
              }
            }
          } catch (err) {
            this.debugWarn('恢复分类数据失败:', category.id, err);
            totalErrors++;
          }
        }
      }
      
      // 恢复提示词数据（需要处理分类ID映射）
      if (backupData.prompts && backupData.prompts.length > 0) {
        this.debugLog(`恢复提示词数据: ${backupData.prompts.length} 条`);
        for (const prompt of backupData.prompts) {
          const oldPromptId = prompt.id;
          const promptDataWithoutId = { ...prompt };
          delete promptDataWithoutId.id;
          delete promptDataWithoutId.category;
          if (hasStandalonePromptVariables) {
            delete promptDataWithoutId.variables;
          }
          
          // 处理分类ID映射
          if (promptDataWithoutId.categoryId !== undefined || promptDataWithoutId.categoryUuid) {
            const oldCategoryId = promptDataWithoutId.categoryId;
            const newCategoryId = this.resolveRestoredCategoryId(
              promptDataWithoutId,
              idMapping,
              categoryUuidMapping,
              restoredCategoryIds
            );

            if (newCategoryId !== undefined) {
              promptDataWithoutId.categoryId = newCategoryId;
              this.debugLog(`提示词分类ID映射: ${oldCategoryId} -> ${newCategoryId}`);
            } else {
              this.debugWarn(`未找到分类ID映射: ${oldCategoryId}，将提示词设为未分类`);
              promptDataWithoutId.categoryId = undefined;
            }
          }

          try {
            const promptToCreate = await this.deserializeImageBlobs(promptDataWithoutId);
            const newPrompt = await this.addRestoredRecord('prompts', promptToCreate);

            // 记录提示词ID映射：旧ID -> 新ID
            if (oldPromptId !== undefined) {
              idMapping[`prompt_${oldPromptId}`] = newPrompt.id!;
              this.debugLog(`提示词ID映射: ${oldPromptId} -> ${newPrompt.id}`);
            }
            if (newPrompt.id !== undefined) {
              restoredPromptIds.add(newPrompt.id);
              if (prompt.uuid) {
                promptUuidMapping[prompt.uuid] = newPrompt.id;
              }
            }
          } catch (err) {
            this.debugWarn('恢复提示词数据失败:', prompt.id, err);
            totalErrors++;
          }
        }
      }

      // 恢复提示词变量数据（需要处理提示词 ID 映射）
      if (backupData.promptVariables && backupData.promptVariables.length > 0) {
        this.debugLog(`恢复提示词变量数据: ${backupData.promptVariables.length} 条`);
        for (const variable of backupData.promptVariables) {
          const variableDataWithoutId = { ...variable };
          delete variableDataWithoutId.id;

          if (variableDataWithoutId.promptId !== undefined || variableDataWithoutId.promptUuid) {
            const newPromptId = this.resolveRestoredPromptId(
              variableDataWithoutId,
              idMapping,
              promptUuidMapping,
              restoredPromptIds
            );
            if (newPromptId !== undefined) {
              variableDataWithoutId.promptId = newPromptId;
            } else {
              this.debugWarn(`未找到提示词变量的提示词ID映射: ${variableDataWithoutId.promptId}`);
              totalErrors++;
              continue;
            }
          }

          try {
            await this.addRestoredRecord('promptVariables', variableDataWithoutId);
          } catch (err) {
            this.debugWarn('恢复提示词变量数据失败:', variable.id, err);
            totalErrors++;
          }
        }
      }

      // 恢复提示词历史数据（需要处理提示词 ID 映射）
      if (backupData.promptHistories && backupData.promptHistories.length > 0) {
        this.debugLog(`恢复提示词历史数据: ${backupData.promptHistories.length} 条`);
        for (const history of backupData.promptHistories) {
          const { id, ...historyDataWithoutId } = history;

          if (historyDataWithoutId.promptId !== undefined || historyDataWithoutId.promptUuid) {
            const newPromptId = this.resolveRestoredPromptId(
              historyDataWithoutId,
              idMapping,
              promptUuidMapping,
              restoredPromptIds
            );
            if (newPromptId !== undefined) {
              historyDataWithoutId.promptId = newPromptId;
            } else {
              this.debugWarn(`未找到提示词历史的提示词ID映射: ${historyDataWithoutId.promptId}`);
              totalErrors++;
              continue;
            }
          }

          if (historyDataWithoutId.categoryId !== undefined || historyDataWithoutId.categoryUuid) {
            const newCategoryId = this.resolveRestoredCategoryId(
              historyDataWithoutId,
              idMapping,
              categoryUuidMapping,
              restoredCategoryIds
            );
            if (newCategoryId !== undefined) {
              historyDataWithoutId.categoryId = newCategoryId;
            } else {
              delete historyDataWithoutId.categoryId;
            }
          }

          try {
            const historyToCreate = await this.deserializeImageBlobs(historyDataWithoutId);
            await this.addRestoredRecord('promptHistories', historyToCreate);
          } catch (err) {
            this.debugWarn('恢复提示词历史数据失败:', history.id, err);
            totalErrors++;
          }
        }
      }
      
      // 恢复AI配置数据
      if (backupData.aiConfigs && backupData.aiConfigs.length > 0) {
        this.debugLog(`恢复AI配置数据: ${backupData.aiConfigs.length} 条`);
        for (const config of backupData.aiConfigs) {
          const { id, ...configDataWithoutId } = config;
          try {
            await this.addRestoredRecord('ai_configs', configDataWithoutId);
          } catch (err) {
            this.debugWarn('恢复AI配置数据失败:', config.id, err);
            totalErrors++;
          }
        }
      }

      // 恢复快速优化配置数据
      if (backupData.quickOptimizationConfigs && backupData.quickOptimizationConfigs.length > 0) {
        this.debugLog(`恢复快速优化配置数据: ${backupData.quickOptimizationConfigs.length} 条`);
        for (const config of backupData.quickOptimizationConfigs) {
          const configDataWithoutId = { ...config };
          delete configDataWithoutId.id;
          try {
            await this.addRestoredRecord('quick_optimization_configs', configDataWithoutId);
          } catch (err) {
            this.debugWarn('恢复快速优化配置数据失败:', config.id, err);
            totalErrors++;
          }
        }
      }
      
      // 恢复AI历史数据
      if (backupData.aiHistory && backupData.aiHistory.length > 0) {
        this.debugLog(`恢复AI历史数据: ${backupData.aiHistory.length} 条`);
        for (const history of backupData.aiHistory) {
          const { id, ...historyDataWithoutId } = history;
          try {
            await this.addRestoredRecord('ai_generation_history', historyDataWithoutId);
          } catch (err) {
            this.debugWarn('恢复AI历史数据失败:', history.id, err);
            totalErrors++;
          }
        }
      }
      
      // 恢复设置数据
      if (backupData.settings && backupData.settings.length > 0) {
        this.debugLog(`恢复设置数据: ${backupData.settings.length} 条`);
        for (const setting of backupData.settings) {
          const settingDataWithoutId = { ...setting };
          delete settingDataWithoutId.id;
          try {
            await this.addRestoredRecord('settings', settingDataWithoutId);
          } catch (err) {
            this.debugWarn('恢复设置数据失败:', setting.key, err);
            totalErrors++;
          }
        }
      }

      const restoredTombstones = await this.restoreSyncTombstones(backupData.syncTombstones || []);
      
      // 统计恢复结果
      details.categories = (backupData.categories?.length || 0);
      details.prompts = (backupData.prompts?.length || 0);
      details.promptVariables = (backupData.promptVariables?.length || 0);
      details.promptHistories = (backupData.promptHistories?.length || 0);
      details.aiConfigs = (backupData.aiConfigs?.length || 0);
      details.quickOptimizationConfigs = (backupData.quickOptimizationConfigs?.length || 0);
      details.aiHistory = (backupData.aiHistory?.length || 0);
      details.settings = (backupData.settings?.length || 0);
      if (restoredTombstones > 0) {
        details.syncTombstones = restoredTombstones;
      }
      
      const totalRestored = Object.values(details).reduce((sum, count) => sum + count, 0);
      const success = totalErrors === 0;
      
      this.debugLog(`渲染进程: 数据恢复完成，总计恢复记录数: ${totalRestored}, 错误数: ${totalErrors}`);
      this.debugLog('ID映射表:', idMapping);
      
      return {
        success,
        message: success
          ? `数据恢复成功，共恢复 ${totalRestored} 条记录`
          : `数据恢复失败，共恢复 ${totalRestored} 条记录，失败 ${totalErrors} 条`,
        error: success ? undefined : `恢复过程中有 ${totalErrors} 条记录失败`,
        totalImported: totalRestored,
        totalErrors,
        details,
        imported: {
          categories: details.categories,
          prompts: details.prompts,
          settings: details.settings,
          history: details.aiHistory + details.promptHistories,
          aiConfigs: details.aiConfigs
        }
      };
      
    } catch (error) {
      this.debugError('渲染进程: 恢复数据失败:', error);
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
    return dataOperationLock.runExclusive(() => this.replaceAllDataUnlocked(backupData));
  }

  private async replaceAllDataUnlocked(backupData: any): Promise<DataImportResult> {
    const operationId = generateUUID();
    try {
      this.debugLog('渲染进程: 开始完全替换数据...');
      const dataToRestore = unwrapBackupData(backupData);
      this.assertRestorableDataShape(dataToRestore);

      const normalizedData = this.ensureUUIDsInImportData(this.cloneRestoreInput(dataToRestore));
      const contractResult = reconcileCloudSyncDataContract(normalizedData);
      if (!contractResult.valid) {
        const firstIssue = contractResult.issues[0];
        throw this.createStructuredFailure({
          phase: 'prepare',
          code: 'RELATION_UNRESOLVED',
          collection: firstIssue?.collection,
          recordKey: firstIssue?.recordIdentity,
          businessKey: firstIssue?.referenceUuid || firstIssue?.referenceId,
          message: firstIssue
            ? `${firstIssue.collection} ${firstIssue.recordIdentity} 的 ${firstIssue.relation} 关系无法安全解析`
            : '恢复数据关系无法安全解析',
          retryable: false
        });
      }
      const plan = await this.prepareAtomicRestorePlan(contractResult.data, operationId);
      await this.commitAtomicRestorePlan(plan);

      const totalSucceeded = plan.records.length;
      return {
        success: true,
        atomic: true,
        operationId,
        phase: 'commit',
        retryable: false,
        message: `数据恢复成功，共恢复 ${totalSucceeded} 条记录`,
        totalImported: totalSucceeded,
        totalAttempted: totalSucceeded,
        totalSucceeded,
        totalErrors: 0,
        totalQuarantined: 0,
        warnings: contractResult.merges.length > 0
          ? [`已自动归并 ${contractResult.merges.length} 组业务唯一键冲突`]
          : undefined,
        details: plan.details,
        imported: {
          categories: plan.details.categories || 0,
          prompts: plan.details.prompts || 0,
          settings: plan.details.settings || 0,
          history: (plan.details.aiHistory || 0) + (plan.details.promptHistories || 0),
          aiConfigs: plan.details.aiConfigs || 0
        }
      };
    } catch (error) {
      this.debugError('渲染进程: 完全替换数据失败:', error);
      const failure = this.toDataOperationFailure(error);
      return {
        success: false,
        atomic: true,
        operationId,
        phase: failure.phase,
        retryable: failure.retryable,
        errorCode: failure.code,
        error: failure.message,
        message: '数据替换失败',
        totalImported: 0,
        totalAttempted: 0,
        totalSucceeded: 0,
        totalErrors: 1,
        totalQuarantined: 0,
        failures: [failure],
        errors: [failure.message]
      };
    }
  }

  private cloneRestoreInput<T>(value: T): T {
    if (typeof structuredClone === 'function') {
      return structuredClone(value);
    }
    return JSON.parse(JSON.stringify(value)) as T;
  }

  private async prepareAtomicRestorePlan(data: any, operationId: string): Promise<PreparedRestorePlan> {
    const categories = this.sortRestoreRecords(data.categories || [], 'categories');
    const prompts = this.sortRestoreRecords(data.prompts || [], 'prompts');
    const promptVariables = this.sortRestoreRecords(data.promptVariables || [], 'promptVariables');
    const promptHistories = this.sortRestoreRecords(data.promptHistories || [], 'promptHistories');
    const aiConfigs = this.sortRestoreRecords(data.aiConfigs || [], 'aiConfigs');
    const quickOptimizationConfigs = this.sortRestoreRecords(
      data.quickOptimizationConfigs || [],
      'quickOptimizationConfigs'
    );
    const aiHistory = this.sortRestoreRecords(data.aiHistory || [], 'aiHistory');
    const settings = this.sortRestoreRecords(data.settings || [], 'settings');
    const syncTombstones = this.sortRestoreRecords(data.syncTombstones || [], 'syncTombstones');

    this.assertUniqueRestoreValues(categories, 'categories', 'name', 'categories.name');
    this.assertUniqueRestoreValues(categories, 'categories', 'uuid', 'categories.uuid');
    this.assertUniqueRestoreValues(prompts, 'prompts', 'uuid', 'prompts.uuid');
    this.assertUniqueRestoreValues(promptVariables, 'promptVariables', 'uuid', 'promptVariables.uuid');
    this.assertUniqueRestoreValues(promptHistories, 'promptHistories', 'uuid', 'promptHistories.uuid');
    this.assertUniqueRestoreValues(aiConfigs, 'aiConfigs', 'uuid', 'ai_configs.uuid');
    this.assertUniqueRestoreValues(aiConfigs, 'aiConfigs', 'configId', 'ai_configs.configId');
    this.assertUniqueRestoreValues(
      quickOptimizationConfigs,
      'quickOptimizationConfigs',
      'uuid',
      'quick_optimization_configs.uuid'
    );
    this.assertUniqueRestoreValues(aiHistory, 'aiHistory', 'uuid', 'ai_generation_history.uuid');
    this.assertUniqueRestoreValues(aiHistory, 'aiHistory', 'historyId', 'ai_generation_history.historyId');
    this.assertUniqueRestoreValues(settings, 'settings', 'key', 'settings.key');

    const categoryIdByUuid = new Map<string, number>();
    const categoryIdsBySourceId = this.createSourceIdMap(categories);
    categories.forEach((category: any, index: number) => {
      const newId = index + 1;
      if (category.uuid) categoryIdByUuid.set(String(category.uuid), newId);
    });

    const promptIdByUuid = new Map<string, number>();
    const promptIdsBySourceId = this.createSourceIdMap(prompts);
    prompts.forEach((prompt: any, index: number) => {
      const newId = index + 1;
      if (prompt.uuid) promptIdByUuid.set(String(prompt.uuid), newId);
    });

    const records: PreparedRestoreRecord[] = [];

    for (const [index, category] of categories.entries()) {
      const value = { ...category, id: index + 1 };
      if (category.parentUuid || category.parentId !== undefined) {
        const parentId = this.resolvePreparedRelationId(
          category.parentUuid,
          category.parentId,
          categoryIdByUuid,
          categoryIdsBySourceId,
          'categories',
          this.getRestoreRecordKey('categories', category),
          'parent category'
        );
        if (parentId !== undefined) value.parentId = parentId;
        else delete value.parentId;
      }
      records.push(this.createPreparedRecord('categories', value));
    }

    const hasStandalonePromptVariables = Array.isArray(data.promptVariables);
    for (const [index, prompt] of prompts.entries()) {
      const value = { ...prompt, id: index + 1 };
      delete value.category;
      if (hasStandalonePromptVariables) delete value.variables;
      if (prompt.categoryUuid || prompt.categoryId !== undefined) {
        const categoryId = this.resolvePreparedRelationId(
          prompt.categoryUuid,
          prompt.categoryId,
          categoryIdByUuid,
          categoryIdsBySourceId,
          'prompts',
          this.getRestoreRecordKey('prompts', prompt),
          'category',
          true
        );
        if (categoryId !== undefined) value.categoryId = categoryId;
        else delete value.categoryId;
      }
      records.push(this.createPreparedRecord('prompts', await this.deserializeImageBlobs(value)));
    }

    for (const [index, variable] of promptVariables.entries()) {
      const promptId = this.resolvePreparedRelationId(
        variable.promptUuid,
        variable.promptId,
        promptIdByUuid,
        promptIdsBySourceId,
        'promptVariables',
        this.getRestoreRecordKey('promptVariables', variable),
        'prompt'
      );
      records.push(this.createPreparedRecord('promptVariables', {
        ...variable,
        id: index + 1,
        promptId
      }));
    }

    for (const [index, history] of promptHistories.entries()) {
      const promptId = this.resolvePreparedRelationId(
        history.promptUuid,
        history.promptId,
        promptIdByUuid,
        promptIdsBySourceId,
        'promptHistories',
        this.getRestoreRecordKey('promptHistories', history),
        'prompt'
      );
      const value: any = { ...history, id: index + 1, promptId };
      if (history.categoryUuid || history.categoryId !== undefined) {
        const categoryId = this.resolvePreparedRelationId(
          history.categoryUuid,
          history.categoryId,
          categoryIdByUuid,
          categoryIdsBySourceId,
          'promptHistories',
          this.getRestoreRecordKey('promptHistories', history),
          'category',
          true
        );
        if (categoryId !== undefined) value.categoryId = categoryId;
        else delete value.categoryId;
      }
      records.push(this.createPreparedRecord('promptHistories', await this.deserializeImageBlobs(value)));
    }

    aiConfigs.forEach((record: any, index: number) =>
      records.push(this.createPreparedRecord('aiConfigs', { ...record, id: index + 1 }))
    );
    quickOptimizationConfigs.forEach((record: any, index: number) =>
      records.push(this.createPreparedRecord('quickOptimizationConfigs', { ...record, id: index + 1 }))
    );
    aiHistory.forEach((record: any, index: number) =>
      records.push(this.createPreparedRecord('aiHistory', { ...record, id: index + 1 }))
    );
    settings.forEach((record: any, index: number) =>
      records.push(this.createPreparedRecord('settings', { ...record, id: index + 1 }))
    );

    for (const [index, tombstone] of syncTombstones.entries()) {
      if (!isRestorableSyncTombstone(tombstone)) {
        throw this.createStructuredFailure({
          phase: 'validate',
          code: 'INVALID_DATA',
          collection: 'syncTombstones',
          recordKey: `index:${index}`,
          message: `同步删除标记格式无效: syncTombstones[${index}]`,
          retryable: false
        });
      }
      records.push(this.createPreparedRecord('syncTombstones', {
        ...tombstone,
        id: index + 1,
        deletedAt: tombstone.deletedAt ? new Date(tombstone.deletedAt) : new Date()
      }));
    }

    const details: Record<string, number> = {};
    for (const collection of RESTORABLE_DATA_FIELDS) {
      details[collection] = records.filter(record => record.collection === collection).length;
    }

    return { operationId, records, details };
  }

  private async commitAtomicRestorePlan(plan: PreparedRestorePlan): Promise<void> {
    const db = await this.getDatabase();
    if (!db) {
      throw this.createStructuredFailure({
        phase: 'prepare',
        code: 'DATABASE_UNAVAILABLE',
        message: '无法获取数据库连接',
        retryable: true
      });
    }

    const missingStores = SYNCABLE_DATA_STORES.filter(storeName => !db.objectStoreNames.contains(storeName));
    if (missingStores.length > 0) {
      throw this.createStructuredFailure({
        phase: 'prepare',
        code: 'DATABASE_UNAVAILABLE',
        message: `数据库缺少恢复所需的数据表: ${missingStores.join(', ')}`,
        retryable: false
      });
    }

    const transactionStores = [
      ...SYNCABLE_DATA_STORES,
      ...(db.objectStoreNames.contains('syncMetadata') ? ['syncMetadata'] : [])
    ];
    let transaction: IDBTransaction;
    try {
      transaction = db.transaction(transactionStores, 'readwrite');
    } catch (error) {
      throw this.createStructuredFailure(this.createDatabaseFailure('prepare', error));
    }

    let firstFailure: DataOperationFailure | null = null;
    const completion = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => {
        reject(new StructuredDataOperationError(
          firstFailure || this.createDatabaseFailure('commit', transaction.error)
        ));
      };
      transaction.onabort = () => {
        reject(new StructuredDataOperationError(
          firstFailure || this.createDatabaseFailure('commit', transaction.error)
        ));
      };
    });

    const clearRequests = transactionStores.map(storeName => {
      const request = transaction.objectStore(storeName).clear();
      return this.waitForRestoreRequest(request, {
        phase: 'clear',
        code: 'TRANSACTION_ABORTED',
        storeName,
        message: `清空数据表 ${storeName} 失败`,
        retryable: true
      }, failure => { firstFailure ||= failure; });
    });

    try {
      await Promise.all(clearRequests);
      await Promise.all(plan.records.map(record => {
        const request = transaction.objectStore(record.storeName).put(record.value);
        return this.waitForRestoreRequest(request, {
          phase: 'write',
          code: 'UNKNOWN_DATABASE_ERROR',
          collection: record.collection,
          storeName: record.storeName,
          recordKey: record.recordKey,
          businessKey: record.businessKey,
          message: `写入 ${record.collection} 记录失败`,
          retryable: false
        }, failure => { firstFailure ||= failure; });
      }));
      await completion;
    } catch (error) {
      try { transaction.abort(); } catch { /* transaction already finishing */ }
      await completion.catch(() => undefined);
      throw error;
    }

    for (const storeName of SYNCABLE_DATA_STORES) {
      emitDataChange({ storeName, action: 'clear' });
    }
  }

  private waitForRestoreRequest(
    request: IDBRequest,
    context: Omit<DataOperationFailure, 'errorName'>,
    onFailure: (failure: DataOperationFailure) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve();
      request.onerror = () => {
        const failure = this.createDatabaseFailure(context.phase, request.error, context);
        onFailure(failure);
        reject(new StructuredDataOperationError(failure));
      };
    });
  }

  private sortRestoreRecords(records: any[], collection: string): any[] {
    return [...records].sort((left, right) =>
      this.getRestoreRecordKey(collection, left).localeCompare(this.getRestoreRecordKey(collection, right))
    );
  }

  private createSourceIdMap(records: any[]): Map<string, number | null> {
    const result = new Map<string, number | null>();
    records.forEach((record, index) => {
      if (record?.id === undefined || record?.id === null) return;
      const key = String(record.id);
      result.set(key, result.has(key) ? null : index + 1);
    });
    return result;
  }

  private resolvePreparedRelationId(
    relationUuid: unknown,
    sourceId: unknown,
    idByUuid: Map<string, number>,
    idBySourceId: Map<string, number | null>,
    collection: string,
    recordKey: string,
    relationName: string,
    optional = false
  ): number | undefined {
    if (typeof relationUuid === 'string' && relationUuid) {
      const resolved = idByUuid.get(relationUuid);
      if (resolved !== undefined) return resolved;
      if (!optional) {
        throw this.createStructuredFailure({
          phase: 'prepare',
          code: 'RELATION_UNRESOLVED',
          collection,
          recordKey,
          businessKey: relationUuid,
          message: `${collection} ${recordKey} 无法解析 ${relationName} UUID ${relationUuid}`,
          retryable: false
        });
      }
      return undefined;
    }

    if (sourceId !== undefined && sourceId !== null) {
      const resolved = idBySourceId.get(String(sourceId));
      if (typeof resolved === 'number') return resolved;
      if (!optional) {
        throw this.createStructuredFailure({
          phase: 'prepare',
          code: 'RELATION_UNRESOLVED',
          collection,
          recordKey,
          businessKey: String(sourceId),
          message: `${collection} ${recordKey} 无法唯一解析 ${relationName} ID ${String(sourceId)}`,
          retryable: false
        });
      }
    }

    return undefined;
  }

  private assertUniqueRestoreValues(
    records: any[],
    collection: string,
    field: string,
    constraint: string
  ): void {
    const seen = new Map<string, string>();
    for (const record of records) {
      const value = record?.[field];
      if (value === undefined || value === null || value === '') continue;
      const normalized = String(value);
      const recordKey = this.getRestoreRecordKey(collection, record);
      const previous = seen.get(normalized);
      if (previous) {
        throw this.createStructuredFailure({
          phase: 'validate',
          code: 'UNIQUE_CONSTRAINT',
          collection,
          recordKey,
          businessKey: normalized,
          constraint,
          message: `${collection} 存在重复唯一键 ${constraint}: ${normalized}（${previous}, ${recordKey}）`,
          retryable: false
        });
      }
      seen.set(normalized, recordKey);
    }
  }

  private createPreparedRecord(collection: string, value: any): PreparedRestoreRecord {
    return {
      collection,
      storeName: RESTORE_STORE_BY_COLLECTION[collection],
      recordKey: this.getRestoreRecordKey(collection, value),
      businessKey: this.getRestoreBusinessKey(collection, value),
      value
    };
  }

  private getRestoreRecordKey(collection: string, record: any): string {
    const identityFields: Record<string, string[]> = {
      categories: ['uuid', 'name', 'id'],
      prompts: ['uuid', 'id'],
      promptVariables: ['uuid', 'id'],
      promptHistories: ['uuid', 'id'],
      aiConfigs: ['configId', 'uuid', 'id'],
      quickOptimizationConfigs: ['uuid', 'id'],
      aiHistory: ['historyId', 'uuid', 'id'],
      settings: ['key', 'id'],
      syncTombstones: ['recordKey', 'recordUuid', 'id']
    };
    for (const field of identityFields[collection] || ['uuid', 'key', 'id']) {
      const value = record?.[field];
      if (value !== undefined && value !== null && value !== '') return `${field}:${String(value)}`;
    }
    return `indexless:${collection}`;
  }

  private getRestoreBusinessKey(collection: string, record: any): string | undefined {
    if (collection === 'categories') return record?.name ? `name:${String(record.name)}` : undefined;
    if (collection === 'aiConfigs') return record?.configId ? `configId:${String(record.configId)}` : undefined;
    if (collection === 'aiHistory') return record?.historyId ? `historyId:${String(record.historyId)}` : undefined;
    if (collection === 'settings') return record?.key ? `key:${String(record.key)}` : undefined;
    return undefined;
  }

  private createStructuredFailure(failure: DataOperationFailure): StructuredDataOperationError {
    return new StructuredDataOperationError(failure);
  }

  private createDatabaseFailure(
    phase: DataOperationPhase,
    error: unknown,
    context: Partial<DataOperationFailure> = {}
  ): DataOperationFailure {
    const errorName = error instanceof DOMException
      ? error.name
      : error instanceof Error
        ? error.name
        : undefined;
    let code: DataOperationErrorCode = context.code || 'UNKNOWN_DATABASE_ERROR';
    let retryable = context.retryable ?? false;
    if (errorName === 'ConstraintError') code = 'UNIQUE_CONSTRAINT';
    if (errorName === 'QuotaExceededError') {
      code = 'QUOTA_EXCEEDED';
      retryable = false;
    }
    if (errorName === 'AbortError') {
      code = 'TRANSACTION_ABORTED';
      retryable = true;
    }
    const rawMessage = error instanceof Error ? error.message : error ? String(error) : '';
    return {
      phase,
      code,
      collection: context.collection,
      storeName: context.storeName,
      recordKey: context.recordKey,
      businessKey: context.businessKey,
      constraint: context.constraint,
      errorName,
      message: [context.message, rawMessage].filter(Boolean).join(': ') || '数据库操作失败',
      retryable
    };
  }

  private toDataOperationFailure(error: unknown): DataOperationFailure {
    if (error instanceof StructuredDataOperationError) return error.failure;
    if (error instanceof Error && /图片数据格式无效/.test(error.message)) {
      return {
        phase: 'prepare',
        code: 'SERIALIZATION_FAILED',
        errorName: error.name,
        message: error.message,
        retryable: false
      };
    }
    if (error instanceof Error && /恢复数据格式无效|备份数据校验失败/.test(error.message)) {
      return {
        phase: 'validate',
        code: 'INVALID_DATA',
        errorName: error.name,
        message: error.message,
        retryable: false
      };
    }
    return this.createDatabaseFailure('prepare', error);
  }
  
  /**
   * 强制清空所有数据表（公开方法）
   */
  async forceCleanAllTables(): Promise<void> {
    try {
      this.debugLog('开始清空所有数据表...');
      
      const db = await this.getDatabase();
      if (!db) {
        throw new Error('无法获取数据库连接');
      }
      
      for (const tableName of SYNCABLE_DATA_STORES) {
        if (db.objectStoreNames.contains(tableName)) {
          const transaction = db.transaction([tableName], 'readwrite');
          const store = transaction.objectStore(tableName);
          await new Promise<void>((resolve, reject) => {
            let clearSucceeded = false;

            transaction.oncomplete = () => {
              if (clearSucceeded) {
                this.debugLog(`清空表 ${tableName} 成功`);
                emitDataChange({
                  storeName: tableName,
                  action: 'clear'
                });
              }
              resolve();
            };
            transaction.onerror = () => reject(transaction.error || new Error(`清空表 ${tableName} 事务失败`));
            transaction.onabort = () => reject(transaction.error || new Error(`清空表 ${tableName} 事务中止`));

            const clearRequest = store.clear();
            clearRequest.onsuccess = () => {
              clearSucceeded = true;
            };
            clearRequest.onerror = () => reject(clearRequest.error);
          });
        }
      }
      
      this.debugLog('所有数据表清空完成');
    } catch (error) {
      this.debugError('清空数据表失败:', error);
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
      this.debugError('获取数据库连接失败:', error);
      return null;
    }
  }

  private async tryReadConsistentExportSnapshot(): Promise<{
    categories: any[];
    prompts: any[];
    promptVariables: any[];
    promptHistories: any[];
    aiConfigs: any[];
    quickOptimizationConfigs: any[];
    aiHistory: any[];
    settings: any[];
  } | null> {
    const db = await this.getDatabase();
    const stores = [
      'categories',
      'prompts',
      'promptVariables',
      'promptHistories',
      'ai_configs',
      'quick_optimization_configs',
      'ai_generation_history',
      'settings'
    ];
    if (!db || stores.some(storeName => !db.objectStoreNames.contains(storeName))) return null;

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(stores, 'readonly');
      const values = new Map<string, any[]>();
      let settled = false;

      const rejectOnce = (error: unknown) => {
        if (settled) return;
        settled = true;
        reject(error instanceof Error ? error : new Error(String(error || '一致性导出失败')));
      };

      for (const storeName of stores) {
        const request = transaction.objectStore(storeName).getAll();
        request.onsuccess = () => values.set(storeName, request.result || []);
        request.onerror = () => rejectOnce(request.error || new Error(`读取数据表失败: ${storeName}`));
      }

      transaction.onerror = () => rejectOnce(transaction.error || new Error('一致性导出事务失败'));
      transaction.onabort = () => rejectOnce(transaction.error || new Error('一致性导出事务中止'));
      transaction.oncomplete = () => {
        if (settled) return;
        settled = true;
        const categories = values.get('categories') || [];
        const promptVariables = values.get('promptVariables') || [];
        const rawPrompts = values.get('prompts') || [];
        const prompts = rawPrompts.map(prompt => ({
          ...prompt,
          category: categories.find(category => category.id === prompt.categoryId),
          variables: promptVariables.filter(variable => variable.promptId === prompt.id)
        }));
        resolve({
          categories,
          prompts,
          promptVariables,
          promptHistories: values.get('promptHistories') || [],
          aiConfigs: values.get('ai_configs') || [],
          quickOptimizationConfigs: values.get('quick_optimization_configs') || [],
          aiHistory: values.get('ai_generation_history') || [],
          settings: values.get('settings') || []
        });
      };
    });
  }

  async getLocalSyncMetadata<T = any>(key: string): Promise<T | null> {
    const db = await this.getDatabase();
    if (!db || !db.objectStoreNames.contains('syncMetadata')) return null;
    return new Promise<T | null>((resolve, reject) => {
      const transaction = db.transaction(['syncMetadata'], 'readonly');
      const request = transaction.objectStore('syncMetadata').get(key);
      request.onsuccess = () => resolve(request.result?.value as T || null);
      request.onerror = () => reject(request.error || new Error('读取本地同步元数据失败'));
    });
  }

  async setLocalSyncMetadata<T = any>(key: string, value: T): Promise<void> {
    const db = await this.getDatabase();
    if (!db || !db.objectStoreNames.contains('syncMetadata')) {
      throw new Error('数据库缺少 syncMetadata 表');
    }
    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(['syncMetadata'], 'readwrite');
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('保存本地同步元数据失败'));
      transaction.onabort = () => reject(transaction.error || new Error('保存本地同步元数据事务中止'));
      transaction.objectStore('syncMetadata').put({ key, value, updatedAt: new Date().toISOString() });
    });
  }

  async removeLocalSyncMetadata(key: string): Promise<void> {
    const db = await this.getDatabase();
    if (!db || !db.objectStoreNames.contains('syncMetadata')) return;
    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(['syncMetadata'], 'readwrite');
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('删除本地同步元数据失败'));
      transaction.onabort = () => reject(transaction.error || new Error('删除本地同步元数据事务中止'));
      transaction.objectStore('syncMetadata').delete(key);
    });
  }

  private async addRestoredRecord<T extends { id?: number } = any>(
    storeName: string,
    data: Omit<T, 'id'> & { id?: number }
  ): Promise<T> {
    const db = await this.getDatabase();
    if (!db) {
      throw new Error('无法获取数据库连接');
    }

    const recordToRestore = { ...(data as any) };
    delete recordToRestore.id;

    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.add(recordToRestore);

      request.onsuccess = () => {
        const restoredRecord = {
          ...recordToRestore,
          id: request.result as number
        } as T;
        emitDataChange({
          storeName: storeName as any,
          action: 'create',
          id: request.result
        });
        resolve(restoredRecord);
      };
      request.onerror = () => reject(request.error);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error(`恢复 ${storeName} 事务中止`));
    });
  }

  private assertRestorableDataShape(data: any): void {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('恢复数据格式无效');
    }

    const presentFields = RESTORABLE_DATA_FIELDS.filter(field => field in data);
    if (presentFields.length === 0) {
      throw new Error('恢复数据格式无效：缺少可恢复的数据表');
    }

    const invalidFields = presentFields.filter(field =>
      data[field] !== undefined && !Array.isArray(data[field])
    );
    if (invalidFields.length > 0) {
      throw new Error(`恢复数据格式无效：${invalidFields.join(', ')} 必须是数组`);
    }

    this.assertRestorableImageBlobShape(data.prompts, 'prompts');
    this.assertRestorableImageBlobShape(data.promptHistories, 'promptHistories');
  }

  private assertRestorableImageBlobShape(records: any[] | undefined, collectionName: string): void {
    if (!Array.isArray(records)) {
      return;
    }

    records.forEach((record, recordIndex) => {
      if (!record?.imageBlobs?.length) {
        return;
      }

      if (!Array.isArray(record.imageBlobs)) {
        throw new Error(`图片数据格式无效，无法恢复完整数据（${collectionName}[${recordIndex}].imageBlobs 必须是数组）`);
      }

      record.imageBlobs.forEach((item: any, imageIndex: number) => {
        const isBlobItem = typeof Blob !== 'undefined' && item instanceof Blob;
        const isDataUrl = typeof item === 'string' && item.startsWith('data:');
        if (!isBlobItem && !isDataUrl) {
          throw new Error(
            `图片数据格式无效，无法恢复完整数据（${collectionName}[${recordIndex}].imageBlobs[${imageIndex}]）`
          );
        }
      });
    });
  }

  private async restoreSyncTombstones(syncTombstones: any[]): Promise<number> {
    if (!Array.isArray(syncTombstones) || syncTombstones.length === 0) {
      return 0;
    }

    const invalidTombstones = syncTombstones
      .filter(tombstone => !isRestorableSyncTombstone(tombstone));
    if (invalidTombstones.length > 0) {
      throw new Error(`同步删除标记格式无效: ${invalidTombstones.length} 条`);
    }

    const db = await this.getDatabase();
    if (!db || !db.objectStoreNames.contains('syncTombstones')) {
      throw new Error('无法恢复同步删除标记：数据库缺少 syncTombstones 表');
    }

    const validTombstones = syncTombstones
      .map(tombstone => {
        const dataWithoutId = { ...tombstone };
        delete dataWithoutId.id;
        return {
          ...dataWithoutId,
          deletedAt: tombstone.deletedAt ? new Date(tombstone.deletedAt) : new Date()
        };
      });

    if (validTombstones.length === 0) {
      return 0;
    }

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['syncTombstones'], 'readwrite');
      const store = transaction.objectStore('syncTombstones');
      let restoredCount = 0;

      transaction.oncomplete = () => resolve(restoredCount);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);

      for (const tombstone of validTombstones) {
        const request = store.add(tombstone);
        request.onsuccess = () => {
          restoredCount++;
        };
        request.onerror = () => {
          reject(request.error || new Error('恢复同步删除标记失败'));
        };
      }
    });
  }

  /**
   * 获取数据库统计信息
   * 返回各表的记录数量等统计信息
   */
  async getDataStats(): Promise<{
    categories: number;
    prompts: number;
    promptHistories: number;
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
        promptHistories,
        aiConfigs,
        aiHistory,
        settings
      ] = await Promise.all([
        this.category.getBasicCategories(),
        this.prompt.getAllPromptsForTags(),
        this.prompt.getAllPromptHistories(),
        this.aiConfig.getAllAIConfigs(),
        this.aiGenerationHistory.getAllAIGenerationHistory(),
        this.appSettings.getAllSettings()
      ]);

      // 估算总大小（简单估算）
      const totalSize = JSON.stringify({
        categories,
        prompts,
        promptHistories,
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
        promptHistories: promptHistories.length,
        aiConfigs: aiConfigs.length,
        aiHistory: aiHistory.length,
        settings: settings.length,
        totalSize,
        lastBackupTime
      };
    } catch (error) {
      this.debugError('获取数据统计失败:', error);
      throw error;
    }
  }

  /**
   * 获取数据统计信息
   */
  async getDataStatistics(): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      this.debugLog('开始获取数据统计信息...');
      
      const [
        categories,
        prompts,
        promptHistories,
        aiConfigs,
        aiHistory,
        settings
      ] = await Promise.all([
        this.category.getBasicCategories(),
        this.prompt.getAllPromptsForTags(),
        this.prompt.getAllPromptHistories(),
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
        config.apiKey || config.baseURL
      ).length;

      const stats = {
        categories: categories.length,
        prompts: prompts.length,
        aiConfigs: aiConfigs.length,
        history: promptHistories.length,
        settings: settings.length,
        totalRecords: categories.length + prompts.length + aiConfigs.length + 
                     promptHistories.length + aiHistory.length + settings.length,
        sensitiveData: {
          prompts: sensitivePrompts,
          aiConfigs: sensitiveAIConfigs,
          total: sensitivePrompts + sensitiveAIConfigs
        }
      };

      this.debugLog('数据统计获取成功:', stats);
      return { success: true, data: stats };
    } catch (error) {
      this.debugError('获取数据统计失败:', error);
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
        promptHistories: stats.promptHistories,
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
    const syncableTypes = ['categories', 'prompts', 'promptVariables', 'promptHistories', 'aiConfigs', 'quickOptimizationConfigs', 'aiHistory', 'aiGenerationHistory'];
    
    for (const type of syncableTypes) {
      if (data[type] && Array.isArray(data[type])) {
        data[type] = data[type].map((item: any) => {
          if (!item.uuid) {
            this.debugLog(`为导入的 ${type} 数据补全 UUID: ${item.id || item.name || '未知条目'}`);
            item.uuid = generateUUID();
          }
          return item;
        });
      }
    }
    
    return data;
  }

  /**
   * 同步导入数据 - 使用 upsert 逻辑（更新已存在的，创建不存在的）
   * 专门用于 WebDAV 等同步场景
   */
  async syncImportData(data: any): Promise<DataImportResult> {
    try {
      this.debugLog('渲染进程: 开始同步导入数据...');
      
      if (!data || typeof data !== 'object') {
        throw new Error('同步导入数据格式无效');
      }

      const details: Record<string, number> = {
        categories: 0,
        prompts: 0,
        aiConfigs: 0,
        aiHistory: 0,
        settings: 0,
      };
      
      // 使用 Promise.allSettled 来处理所有导入操作，即使部分失败也能继续
      const allPromises: Promise<any>[] = [];

      // 同步导入分类
      if (data.categories && Array.isArray(data.categories)) {
        for (const category of data.categories) {
          if (category && category.id) {
            allPromises.push(this.category.upsertCategory(category.id, category).then(() => details.categories++));
          }
        }
      }
      
      // 同步导入提示词
      if (data.prompts && Array.isArray(data.prompts)) {
        for (const prompt of data.prompts) {
          if (prompt && prompt.id) {
            allPromises.push(this.prompt.upsertPrompt(prompt.id, prompt).then(() => details.prompts++));
          }
        }
      }
      
      // 同步导入AI配置
      if (data.aiConfigs && Array.isArray(data.aiConfigs)) {
        for (const config of data.aiConfigs) {
          if (config && config.id) {
             allPromises.push(this.aiConfig.upsertAIConfig(config.id, config).then(() => details.aiConfigs++));
          }
        }
      }
      
      // 同步导入设置
      if (data.settings && Array.isArray(data.settings)) {
        for (const setting of data.settings) {
          if (setting && setting.key) {
            allPromises.push(this.appSettings.updateSettingByKey(setting.key, setting.value, setting.type).then(() => details.settings++));
          }
        }
      }

      // 等待所有 upsert 操作完成
      const results = await Promise.allSettled(allPromises);
      const errors = results
        .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
        .map(result => result.reason instanceof Error ? result.reason.message : String(result.reason));

      errors.forEach(error => this.debugWarn('同步导入项目失败:', error));
      
      this.debugLog('渲染进程: 同步导入完成:', details);
      const totalImported = Object.values(details).reduce((sum, count) => sum + count, 0);
      const totalErrors = errors.length;
      
      return {
        success: totalErrors === 0,
        message: totalErrors === 0
          ? `同步导入成功，共处理 ${totalImported} 条记录`
          : `同步导入未完全完成，共处理 ${totalImported} 条记录，失败 ${totalErrors} 条`,
        error: totalErrors > 0 ? `同步导入过程中有 ${totalErrors} 条记录失败` : undefined,
        totalImported,
        totalErrors,
        details,
        errors: errors.length > 0 ? errors : undefined,
      };
      
    } catch (error) {
      this.debugError('渲染进程: 同步导入数据库数据失败:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        message: '同步导入失败',
      };
    }
  }
}

function isRestorableSyncTombstone(tombstone: any): boolean {
  return !!tombstone &&
    typeof tombstone.collectionName === 'string' &&
    tombstone.collectionName.length > 0 &&
    typeof tombstone.recordKey === 'string' &&
    tombstone.recordKey.length > 0;
}
