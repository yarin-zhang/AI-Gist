import type { 
  CloudStorageConfig, 
  WebDAVConfig, 
  ICloudConfig, 
  CloudBackupInfo 
} from '@shared/types/cloud-backup';

export class CloudBackupAPI {
  private static isElectronAvailable(): boolean {
    return typeof window !== 'undefined' && !!window.electronAPI && !!window.electronAPI.cloud;
  }

  /**
   * 检测 iCloud 可用性
   */
  static async checkICloudAvailability(): Promise<{
    available: boolean;
    reason?: string;
  }> {
    if (!this.isElectronAvailable()) {
      throw new Error('Electron API not available');
    }
    return await window.electronAPI.cloud.checkICloudAvailability();
  }

  /**
   * 获取存储配置列表
   */
  static async getStorageConfigs(): Promise<CloudStorageConfig[]> {
    if (!this.isElectronAvailable()) {
      throw new Error('Electron API not available');
    }
    return await window.electronAPI.cloud.getStorageConfigs();
  }

  /**
   * 添加存储配置
   */
  static async addStorageConfig(config: Omit<CloudStorageConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<{
    success: boolean;
    config?: CloudStorageConfig;
    error?: string;
  }> {
    if (!this.isElectronAvailable()) {
      throw new Error('Electron API not available');
    }
    return await window.electronAPI.cloud.addStorageConfig(config);
  }

  /**
   * 更新存储配置
   */
  static async updateStorageConfig(id: string, config: Partial<CloudStorageConfig>): Promise<{
    success: boolean;
    config?: CloudStorageConfig;
    error?: string;
  }> {
    if (!this.isElectronAvailable()) {
      throw new Error('Electron API not available');
    }
    return await window.electronAPI.cloud.updateStorageConfig(id, config);
  }

  /**
   * 删除存储配置
   */
  static async deleteStorageConfig(id: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    if (!this.isElectronAvailable()) {
      throw new Error('Electron API not available');
    }
    return await window.electronAPI.cloud.deleteStorageConfig(id);
  }

  /**
   * 测试存储连接
   */
  static async testStorageConnection(config: CloudStorageConfig): Promise<{
    success: boolean;
    error?: string;
  }> {
    if (!this.isElectronAvailable()) {
      throw new Error('Electron API not available');
    }
    return await window.electronAPI.cloud.testStorageConnection(config);
  }

  /**
   * 获取云端备份列表
   */
  static async getCloudBackupList(storageId: string): Promise<CloudBackupInfo[]> {
    if (!this.isElectronAvailable()) {
      throw new Error('Electron API not available');
    }
    return await window.electronAPI.cloud.getBackupList(storageId);
  }

  /**
   * 创建云端备份
   */
  static async createCloudBackup(storageId: string, description?: string): Promise<{
    success: boolean;
    message: string;
    backupInfo?: CloudBackupInfo;
    error?: string;
  }> {
    if (!this.isElectronAvailable()) {
      throw new Error('Electron API not available');
    }
    return await window.electronAPI.cloud.createBackup(storageId, description);
  }

  /**
   * 从云端恢复备份
   */
  static async restoreCloudBackup(storageId: string, backupId: string): Promise<{
    success: boolean;
    message: string;
    backupInfo?: CloudBackupInfo;
    error?: string;
  }> {
    if (!this.isElectronAvailable()) {
      throw new Error('Electron API not available');
    }
    return await window.electronAPI.cloud.restoreBackup(storageId, backupId);
  }

  /**
   * 删除云端备份
   */
  static async deleteCloudBackup(storageId: string, backupId: string): Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }> {
    if (!this.isElectronAvailable()) {
      throw new Error('Electron API not available');
    }
    return await window.electronAPI.cloud.deleteBackup(storageId, backupId);
  }
} 