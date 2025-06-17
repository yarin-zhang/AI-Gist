/**
 * IndexedDB 数据库服务主入口
 * 汇总所有数据库相关的服务和类型定义
 */

// 导出所有类型定义
export * from '../../shared/types/database';

// 导出所有服务类和服务管理器
export * from './services';

// 为了保持向后兼容，导出传统的数据库服务实例
export { databaseService, initDatabase } from './services';

// 数据库服务管理器，提供数据导入导出等高级功能
export class DatabaseManager {
  private static instance: DatabaseManager;

  private constructor() {}

  static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  /**
   * 导出所有数据
   */
  async exportAllData(): Promise<any> {
    const { databaseService } = await import('./services');
    
    return await databaseService.exportAllData();
  }

  /**
   * 导入数据
   */
  async importData(data: any): Promise<void> {
    const { databaseService } = await import('./services');
    
    await databaseService.importData(data);
  }

  /**
   * 备份数据
   */
  async backupData(): Promise<any> {
    const data = await this.exportAllData();
    return {
      timestamp: new Date().toISOString(),
      version: '1.0',
      data
    };
  }

  /**
   * 恢复数据
   */
  async restoreData(backupData: any): Promise<void> {
    if (backupData.data) {
      await this.importData(backupData.data);
    }
  }

  /**
   * 获取数据库健康状态
   */
  async getHealthStatus(): Promise<any> {
    const { databaseService } = await import('./services');
    
    try {
      const stats = await databaseService.getDataStats();
      
      return {
        status: 'healthy',
        stats,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * 等待数据库初始化完成
   */
  async waitForInitialization(): Promise<void> {
    const { databaseService } = await import('./services');
    await databaseService.waitForInitialization();
  }
}

// 导出单例实例
export const databaseManager = DatabaseManager.getInstance();

// 向后兼容：将数据库管理器暴露到 window 对象
if (typeof window !== 'undefined') {
  (window as any).databaseAPI = {
    ...((window as any).databaseAPI || {}),
    databaseServiceManager: databaseManager,
    exportAllData: () => databaseManager.exportAllData(),
    importData: (data: any) => databaseManager.importData(data),
    backupData: () => databaseManager.backupData(),
    restoreData: (backupData: any) => databaseManager.restoreData(backupData),
    getHealthStatus: () => databaseManager.getHealthStatus(),
    getStats: async () => {
      const { databaseService } = await import('./services');
      return await databaseService.getDataStats();
    }
  };
}

/**
 * 创建数据库 API
 * @returns 数据库 API 对象
 */
export function createDatabaseAPI() {
  const databaseManager = new DatabaseManager();
  
  return {
    databaseServiceManager: databaseManager.serviceManager,
    exportAllData: () => databaseManager.serviceManager.exportAllData(),
    restoreData: (backupData: any) => databaseManager.serviceManager.restoreData(backupData),
    replaceAllData: (backupData: any) => databaseManager.serviceManager.replaceAllData(backupData),
    importDataObject: (data: any) => databaseManager.serviceManager.importData(data),
    getDataStatistics: () => databaseManager.serviceManager.getDataStatistics(),
    checkAndRepairDatabase: () => databaseManager.serviceManager.checkAndRepairDatabase(),
    backupData: () => databaseManager.backupData(),
    getHealthStatus: () => databaseManager.getHealthStatus()
  };
}
