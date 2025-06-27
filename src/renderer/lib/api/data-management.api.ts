/**
 * 数据管理 API
 * 直接使用 Electron API，不再依赖 IPC 工具类
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
   * 创建备份
   */
  static async createBackup(description?: string) {
    if (!this.isElectronAvailable()) {
      throw new Error('Electron API not available');
    }
    return await window.electronAPI.data.createBackup(description);
  }

  /**
   * 获取备份列表
   */
  static async getBackupList() {
    if (!this.isElectronAvailable()) {
      throw new Error('Electron API not available');
    }
    return await window.electronAPI.data.getBackupList();
  }

  /**
   * 恢复备份
   */
  static async restoreBackup(backupId: string) {
    if (!this.isElectronAvailable()) {
      throw new Error('Electron API not available');
    }
    return await window.electronAPI.data.restoreBackup(backupId);
  }

  /**
   * 恢复备份（替换模式）
   */
  static async restoreBackupWithReplace(backupId: string) {
    if (!this.isElectronAvailable()) {
      throw new Error('Electron API not available');
    }
    return await window.electronAPI.data.restoreBackupWithReplace(backupId);
  }

  /**
   * 删除备份
   */
  static async deleteBackup(backupId: string) {
    if (!this.isElectronAvailable()) {
      throw new Error('Electron API not available');
    }
    await window.electronAPI.data.deleteBackup(backupId);
  }

  /**
   * 导出数据
   */
  static async exportData(options: any, exportPath?: string) {
    if (!this.isElectronAvailable()) {
      throw new Error('Electron API not available');
    }
    return await window.electronAPI.data.export(options, exportPath);
  }

  /**
   * 导入数据
   */
  static async importData(filePath: string, options: any) {
    if (!this.isElectronAvailable()) {
      throw new Error('Electron API not available');
    }
    return await window.electronAPI.data.import(filePath, options);
  }

  /**
   * 选择导入文件
   */
  static async selectImportFile(format: string) {
    if (!this.isElectronAvailable()) {
      throw new Error('Electron API not available');
    }
    return await window.electronAPI.data.selectImportFile(format);
  }

  /**
   * 选择导出路径
   */
  static async selectExportPath(defaultName: string) {
    if (!this.isElectronAvailable()) {
      throw new Error('Electron API not available');
    }
    return await window.electronAPI.data.selectExportPath(defaultName);
  }

  /**
   * 导出选中的数据
   */
  static async exportSelectedData(options: any, exportPath?: string) {
    if (!this.isElectronAvailable()) {
      throw new Error('Electron API not available');
    }
    return await window.electronAPI.data.exportSelected(options, exportPath);
  }

  /**
   * 导出完整备份
   */
  static async exportFullBackup() {
    if (!this.isElectronAvailable()) {
      throw new Error('Electron API not available');
    }
    return await window.electronAPI.data.exportFullBackup();
  }

  /**
   * 导入完整备份
   */
  static async importFullBackup() {
    if (!this.isElectronAvailable()) {
      throw new Error('Electron API not available');
    }
    return await window.electronAPI.data.importFullBackup();
  }

  /**
   * 获取数据统计信息
   */
  static async getDataStats() {
    if (!this.isElectronAvailable()) {
      throw new Error('Electron API not available');
    }
    return await window.electronAPI.data.getStats();
  }

  /**
   * 获取备份目录
   */
  static async getBackupDirectory() {
    if (!this.isElectronAvailable()) {
      throw new Error('Electron API not available');
    }
    return await window.electronAPI.data.getBackupDirectory();
  }
}
