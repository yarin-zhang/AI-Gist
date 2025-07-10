/**
 * 数据管理 API
 * 适配简化后的主进程，只保留基础文件操作
 */

/**
 * 数据管理 API 类
 */
export class DataManagementAPI {
  /**
   * 检查 Electron API 是否可用
   */
  private static isElectronAvailable(): boolean {
    return typeof window !== 'undefined' && !!window.electronAPI;
  }

  /**
   * 获取备份列表
   */
  static async getBackupList() {
    if (!this.isElectronAvailable()) {
      throw new Error('Electron API not available');
    }
    return await window.electronAPI.invoke('data:get-backup-list');
  }

  /**
   * 创建备份（需要传入数据）
   */
  static async createBackup(description?: string, data?: any) {
    if (!this.isElectronAvailable()) {
      throw new Error('Electron API not available');
    }
    return await window.electronAPI.invoke('data:create-backup', { description, data });
  }

  /**
   * 读取备份数据
   */
  static async readBackup(backupId: string) {
    if (!this.isElectronAvailable()) {
      throw new Error('Electron API not available');
    }
    return await window.electronAPI.invoke('data:read-backup', { backupId });
  }

  /**
   * 删除备份
   */
  static async deleteBackup(backupId: string) {
    if (!this.isElectronAvailable()) {
      throw new Error('Electron API not available');
    }
    return await window.electronAPI.invoke('data:delete-backup', { backupId });
  }

  /**
   * 选择导入文件
   */
  static async selectImportFile(format: string) {
    if (!this.isElectronAvailable()) {
      throw new Error('Electron API not available');
    }
    return await window.electronAPI.invoke('data:select-import-file', { format });
  }

  /**
   * 选择导出路径
   */
  static async selectExportPath(defaultName: string) {
    if (!this.isElectronAvailable()) {
      throw new Error('Electron API not available');
    }
    return await window.electronAPI.invoke('data:select-export-path', { defaultName });
  }

  /**
   * 获取数据统计信息
   */
  static async getDataStats() {
    if (!this.isElectronAvailable()) {
      throw new Error('Electron API not available');
    }
    return await window.electronAPI.invoke('data:get-stats');
  }

  /**
   * 获取备份目录
   */
  static async getBackupDirectory() {
    if (!this.isElectronAvailable()) {
      throw new Error('Electron API not available');
    }
    return await window.electronAPI.invoke('data:get-backup-directory');
  }

  /**
   * 读取文件内容
   */
  static async readFile(filePath: string) {
    if (!this.isElectronAvailable()) {
      throw new Error('Electron API not available');
    }
    return await window.electronAPI.invoke('fs:read-file', { filePath });
  }

  /**
   * 写入文件内容
   */
  static async writeFile(filePath: string, content: string) {
    if (!this.isElectronAvailable()) {
      throw new Error('Electron API not available');
    }
    return await window.electronAPI.invoke('fs:write-file', { filePath, content });
  }

  /**
   * 恢复备份（替换所有数据）
   */
  static async restoreBackupWithReplace(backupId: string) {
    if (!this.isElectronAvailable()) {
      throw new Error('Electron API not available');
    }
    
    try {
      console.log('开始恢复备份:', backupId);
      
      // 1. 读取备份数据
      const backup = await this.readBackup(backupId);
      console.log('读取备份数据成功:', backup);
      
      if (!backup || !backup.data) {
        throw new Error('备份数据无效');
      }

      // 2. 通过渲染进程恢复数据
      console.log('开始调用 data:import-data');
      const result = await window.electronAPI.invoke('data:import-data', {
        data: backup.data,
        options: {
          format: 'json',
          overwrite: true,
          mergeStrategy: 'replace'
        }
      });
      console.log('data:import-data 调用结果:', result);

      return {
        success: true,
        message: '备份恢复成功',
        backup: backup
      };
    } catch (error) {
      console.error('恢复备份失败:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : '备份恢复失败',
        error: error
      };
    }
  }
}
