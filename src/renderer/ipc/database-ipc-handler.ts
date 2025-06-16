/**
 * 数据库 IPC 处理器
 * 负责将数据库操作暴露给主进程
 * 使用依赖注入来解耦具体的数据库实现
 */

import type { DatabaseServiceManager } from '../../shared/types/database.types';

export class DatabaseIpcHandler {
  private static instance: DatabaseIpcHandler;
  private isInitialized = false;
  private databaseManager: DatabaseServiceManager | null = null;

  private constructor() {}

  static getInstance(): DatabaseIpcHandler {
    if (!DatabaseIpcHandler.instance) {
      DatabaseIpcHandler.instance = new DatabaseIpcHandler();
    }
    return DatabaseIpcHandler.instance;
  }

  /**
   * 初始化处理器
   * @param databaseManager 数据库服务管理器
   */
  async initialize(databaseManager: DatabaseServiceManager): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // 确保数据库服务已初始化
      await databaseManager.waitForInitialization();
      
      // 保存数据库管理器引用
      this.databaseManager = databaseManager;
      
      // 将方法暴露到 window 对象
      this.exposeToWindow();
      this.isInitialized = true;
      
      console.log('数据库 IPC 处理器已初始化');
    } catch (error) {
      console.error('初始化数据库 IPC 处理器失败:', error);
      throw error;
    }
  }

  /**
   * 将数据库操作方法暴露到 window 对象
   */
  private exposeToWindow(): void {
    if (!this.databaseManager) {
      throw new Error('数据库管理器未初始化');
    }

    // 扩展现有的 databaseAPI
    (window as any).databaseAPI = {
      ...((window as any).databaseAPI || {}),
      
      // 直接暴露数据库管理器（用于向后兼容）
      databaseServiceManager: this.databaseManager,
      
      // 数据导出方法
      exportAllData: async () => {
        return await this.databaseManager!.exportAllData();
      },
      
      // 数据导入方法
      importData: async (data: any) => {
        return await this.databaseManager!.importData(data);
      },
      
      // 数据备份方法
      backupData: async () => {
        return await this.databaseManager!.backupData();
      },
      
      // 数据恢复方法
      restoreData: async (backupData: any) => {
        return await this.databaseManager!.restoreData(backupData);
      },
      
      // 健康检查方法
      getHealthStatus: async () => {
        return await this.databaseManager!.getHealthStatus();
      }
    };
  }

  /**
   * 获取数据库管理器实例
   */
  getDatabaseManager(): DatabaseServiceManager | null {
    return this.databaseManager;
  }

  /**
   * 检查是否已初始化
   */
  isReady(): boolean {
    return this.isInitialized && this.databaseManager !== null;
  }
}
