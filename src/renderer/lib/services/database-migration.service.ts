/**
 * 数据库迁移服务
 * 处理数据库结构变更和数据迁移
 */

import { BaseDatabaseService } from './base-database.service';
import { generateUUID } from '../utils/uuid';

/**
 * 数据库迁移服务类
 * 提供数据库升级和数据迁移功能
 */
export class DatabaseMigrationService extends BaseDatabaseService {
  private static instance: DatabaseMigrationService;

  /**
   * 获取数据库迁移服务单例实例
   * @returns DatabaseMigrationService 数据库迁移服务实例
   */
  static getInstance(): DatabaseMigrationService {
    if (!DatabaseMigrationService.instance) {
      DatabaseMigrationService.instance = new DatabaseMigrationService();
    }
    return DatabaseMigrationService.instance;
  }

  /**
   * 执行数据库迁移到UUID版本
   * 为所有需要同步的记录添加UUID字段
   * @returns Promise<{ success: boolean; message: string; details: any }> 迁移结果
   */
  async migrateToUUID(): Promise<{ success: boolean; message: string; details: any }> {
    try {
      console.log('开始执行UUID迁移...');
      
      // 确保数据库已初始化
      await this.waitForInitialization();
      
      // 执行迁移
      const migrationResults = await this.migrateAllRecordsToUUID();
      
      // 统计结果
      const totalUpdated = Object.values(migrationResults).reduce((sum, count) => {
        return sum + (count > 0 ? count : 0);
      }, 0);
      
      const failedTables = Object.entries(migrationResults)
        .filter(([_, count]) => count === -1)
        .map(([tableName, _]) => tableName);
      
      if (failedTables.length > 0) {
        return {
          success: false,
          message: `部分表迁移失败: ${failedTables.join(', ')}`,
          details: migrationResults
        };
      }
      
      console.log('UUID迁移完成', migrationResults);
      
      return {
        success: true,
        message: `成功为 ${totalUpdated} 条记录添加了UUID`,
        details: migrationResults
      };
      
    } catch (error) {
      console.error('UUID迁移失败:', error);
      return {
        success: false,
        message: `迁移失败: ${error instanceof Error ? error.message : '未知错误'}`,
        details: null
      };
    }
  }

  /**
   * 检查是否需要UUID迁移
   * 通过抽样检查确定是否需要进行UUID迁移
   * @returns Promise<{ needsMigration: boolean; details: any }> 检查结果
   */
  async checkUUIDMigrationNeeded(): Promise<{ needsMigration: boolean; details: any }> {
    try {
      await this.waitForInitialization();
      
      const syncTables = [
        'categories',
        'prompts', 
        'promptVariables',
        'promptHistories',
        'ai_configs',
        'ai_generation_history'
      ];
      
      const checkResults: { [tableName: string]: { total: number; withoutUUID: number } } = {};
      let needsMigration = false;
      
      for (const tableName of syncTables) {
        try {
          if (await this.checkObjectStoreExists(tableName)) {
            const records = await this.getAll(tableName);
            const withoutUUID = records.filter((record: any) => !record.uuid).length;
            
            checkResults[tableName] = {
              total: records.length,
              withoutUUID
            };
            
            if (withoutUUID > 0) {
              needsMigration = true;
            }
          } else {
            checkResults[tableName] = { total: 0, withoutUUID: 0 };
          }
        } catch (error) {
          console.warn(`检查表 ${tableName} 时出错:`, error);
          checkResults[tableName] = { total: -1, withoutUUID: -1 };
        }
      }
      
      return {
        needsMigration,
        details: checkResults
      };
      
    } catch (error) {
      console.error('检查UUID迁移需求时出错:', error);
      return {
        needsMigration: false,
        details: { error: error instanceof Error ? error.message : '未知错误' }
      };
    }
  }

  /**
   * 修复缺失的UUID索引
   * 在数据库升级后确保所有表都有UUID索引
   * @returns Promise<{ success: boolean; message: string }> 修复结果
   */
  async repairUUIDIndexes(): Promise<{ success: boolean; message: string }> {
    try {
      console.log('开始修复UUID索引...');
      
      // 这个操作需要在数据库升级时完成，因为无法在运行时修改索引
      // 我们只能检查索引是否存在并记录问题
      
      await this.waitForInitialization();
      
      const syncTables = [
        'categories',
        'prompts', 
        'promptVariables',
        'promptHistories',
        'ai_configs',
        'ai_generation_history'
      ];
      
      const missingIndexes: string[] = [];
      
      for (const tableName of syncTables) {
        if (await this.checkObjectStoreExists(tableName)) {
          // 检查UUID索引是否存在
          const hasUUIDIndex = await this.checkIndexExists(tableName, 'uuid');
          if (!hasUUIDIndex) {
            missingIndexes.push(tableName);
          }
        }
      }
      
      if (missingIndexes.length > 0) {
        return {
          success: false,
          message: `以下表缺少UUID索引，需要重新初始化数据库: ${missingIndexes.join(', ')}`
        };
      }
      
      return {
        success: true,
        message: '所有UUID索引都存在'
      };
      
    } catch (error) {
      console.error('修复UUID索引时出错:', error);
      return {
        success: false,
        message: `修复失败: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }

  /**
   * 检查索引是否存在
   * @param storeName 对象存储名称
   * @param indexName 索引名称
   * @returns Promise<boolean> 索引是否存在
   */
  private async checkIndexExists(storeName: string, indexName: string): Promise<boolean> {
    try {
      if (!this.db) throw new Error('Database not initialized');
      
      const transaction = this.db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);
      
      return Array.from(store.indexNames).includes(indexName);
    } catch (error) {
      console.warn(`检查索引 ${storeName}.${indexName} 时出错:`, error);
      return false;
    }
  }

  /**
   * 执行完整的UUID迁移和修复流程
   * @returns Promise<{ success: boolean; message: string; details: any }> 流程执行结果
   */
  async executeFullUUIDMigration(): Promise<{ success: boolean; message: string; details: any }> {
    try {
      console.log('开始执行完整的UUID迁移流程...');
      
      // 1. 检查是否需要迁移
      const migrationCheck = await this.checkUUIDMigrationNeeded();
      console.log('迁移需求检查结果:', migrationCheck);
      
      if (!migrationCheck.needsMigration) {
        return {
          success: true,
          message: '无需进行UUID迁移，所有记录都已有UUID',
          details: migrationCheck.details
        };
      }
      
      // 2. 执行数据迁移
      const migrationResult = await this.migrateToUUID();
      if (!migrationResult.success) {
        return migrationResult;
      }
      
      // 3. 检查索引状态
      const indexCheck = await this.repairUUIDIndexes();
      
      return {
        success: migrationResult.success && indexCheck.success,
        message: `UUID迁移完成。${migrationResult.message}。${indexCheck.message}`,
        details: {
          migration: migrationResult.details,
          indexCheck: indexCheck.success
        }
      };
      
    } catch (error) {
      console.error('执行完整UUID迁移流程时出错:', error);
      return {
        success: false,
        message: `迁移流程失败: ${error instanceof Error ? error.message : '未知错误'}`,
        details: null
      };
    }
  }
}

// 导出单例实例
export const databaseMigrationService = DatabaseMigrationService.getInstance();
