import type { 
  CloudStorageConfig, 
  WebDAVConfig, 
  ICloudConfig, 
  CloudBackupInfo,
  CloudBackupCreateOptions
} from '@shared/types/cloud-backup';
import type {
  CloudSyncManifest,
  CloudSyncManifestSaveOptions,
  CloudSyncManifestSaveResult
} from '@shared/cloud-sync-manifest';
import type {
  CloudSyncRemoteSnapshotInfo
} from '@shared/cloud-sync-snapshots';
import type {
  CloudSyncSnapshot
} from '@shared/cloud-sync-engine';
import type {
  CloudSyncV2ObjectStorageAdapter,
  CloudSyncV2ObjectWriteOptions,
  CloudSyncV2ObjectWriteResult,
  CloudSyncV2StoredObject,
  CloudSyncV2StoredObjectInfo
} from '@shared/cloud-sync-v2-repository';
import { PlatformDetector } from '@shared/platform';
import { mobileCloudBackupService } from '../services/mobile-cloud-backup.service';
import { webCloudBackupService } from '../services/web-cloud-backup.service';
import { DatabaseServiceManager } from '../services/database-manager.service';

const getCloudBackupClient = () => {
  if (PlatformDetector.isElectron()) {
    return null;
  }

  if (PlatformDetector.isWeb()) {
    return webCloudBackupService;
  }

  return mobileCloudBackupService;
};

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
    const client = getCloudBackupClient();
    if (client) {
      return await client.isICloudAvailable();
    }

    if (!this.isElectronAvailable()) {
      throw new Error('Electron API not available');
    }
    return await window.electronAPI.cloud.checkICloudAvailability();
  }

  /**
   * 获取存储配置列表
   */
  static async getStorageConfigs(): Promise<CloudStorageConfig[]> {
    const client = getCloudBackupClient();
    if (client) {
      return await client.getStorageConfigs();
    }

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
    const client = getCloudBackupClient();
    if (client) {
      return await client.addStorageConfig(config);
    }

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
    const client = getCloudBackupClient();
    if (client) {
      return await client.updateStorageConfig(id, config);
    }

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
    const client = getCloudBackupClient();
    if (client) {
      return await client.deleteStorageConfig(id);
    }

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
    const client = getCloudBackupClient();
    if (client) {
      return await client.testStorageConnection(config);
    }

    if (!this.isElectronAvailable()) {
      throw new Error('Electron API not available');
    }
    return await window.electronAPI.cloud.testStorageConnection(config);
  }

  /**
   * 获取云端备份列表
   */
  static async getCloudBackupList(storageId: string): Promise<CloudBackupInfo[]> {
    const client = getCloudBackupClient();
    if (client) {
      return await client.getCloudBackupList(storageId);
    }

    if (!this.isElectronAvailable()) {
      throw new Error('Electron API not available');
    }
    return await window.electronAPI.cloud.getBackupList(storageId);
  }

  /**
   * 创建云端备份
   */
  static async createCloudBackup(
    storageId: string,
    options?: string | CloudBackupCreateOptions
  ): Promise<{
    success: boolean;
    message: string;
    backupInfo?: CloudBackupInfo;
    error?: string;
  }> {
    const normalizedOptions = typeof options === 'string' ? { description: options } : options;
    if (PlatformDetector.isWeb()) {
      return await webCloudBackupService.createCloudBackup(storageId, normalizedOptions);
    }

    if (PlatformDetector.isMobile()) {
      let backupData = normalizedOptions?.data;
      if (!backupData) {
        const exportResult = await DatabaseServiceManager.getInstance().exportAllDataForBackup();
        if (!exportResult.success || !exportResult.data) {
          return {
            success: false,
            message: '云端备份创建失败',
            error: exportResult.error || exportResult.message || '导出本地数据失败'
          };
        }
        backupData = exportResult.data;
      }
      return await mobileCloudBackupService.createCloudBackup(storageId, backupData, normalizedOptions);
    }

    if (!this.isElectronAvailable()) {
      throw new Error('Electron API not available');
    }
    return await window.electronAPI.cloud.createBackup(storageId, normalizedOptions);
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
    const client = getCloudBackupClient();
    if (client) {
      return await client.restoreCloudBackup(storageId, backupId);
    }

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
    const client = getCloudBackupClient();
    if (client) {
      return await client.deleteCloudBackup(storageId, backupId);
    }

    if (!this.isElectronAvailable()) {
      throw new Error('Electron API not available');
    }
    return await window.electronAPI.cloud.deleteBackup(storageId, backupId);
  }

  /**
   * 获取云同步 manifest
   */
  static async getCloudSyncManifest(storageId: string): Promise<CloudSyncManifest> {
    const client = getCloudBackupClient();
    if (client) {
      return await client.getCloudSyncManifest(storageId);
    }

    if (!this.isElectronAvailable()) {
      throw new Error('Electron API not available');
    }
    const response = await window.electronAPI.cloud.getSyncManifest(storageId);
    if (response && typeof response === 'object' && 'success' in response) {
      if (response.success && response.manifest) {
        return response.manifest;
      }
      throw new Error(('error' in response && response.error) || '读取云同步 manifest 失败');
    }
    return response;
  }

  /**
   * 保存云同步 manifest
   */
  static async saveCloudSyncManifest(
    storageId: string,
    manifest: CloudSyncManifest,
    options?: CloudSyncManifestSaveOptions
  ): Promise<CloudSyncManifestSaveResult> {
    const client = getCloudBackupClient();
    if (client) {
      return await client.saveCloudSyncManifest(storageId, manifest, options);
    }

    if (!this.isElectronAvailable()) {
      throw new Error('Electron API not available');
    }
    return await window.electronAPI.cloud.saveSyncManifest(storageId, manifest, options);
  }

  static async listCloudSyncSnapshots(storageId: string): Promise<CloudSyncRemoteSnapshotInfo[]> {
    const client = getCloudBackupClient();
    if (client && typeof (client as any).listCloudSyncSnapshots === 'function') {
      return await (client as any).listCloudSyncSnapshots(storageId);
    }

    if (!this.isElectronAvailable()) {
      return [];
    }

    const response = await window.electronAPI.cloud.listSyncSnapshots(storageId);
    if (response.success) {
      return response.snapshots;
    }
    throw new Error(response.error || '列出云同步快照失败');
  }

  static async readCloudSyncSnapshot(
    storageId: string,
    snapshot: CloudSyncRemoteSnapshotInfo | string
  ): Promise<CloudSyncSnapshot> {
    const client = getCloudBackupClient();
    if (client && typeof (client as any).readCloudSyncSnapshot === 'function') {
      return await (client as any).readCloudSyncSnapshot(storageId, snapshot);
    }

    if (!this.isElectronAvailable()) {
      throw new Error('Electron API not available');
    }

    const response = await window.electronAPI.cloud.readSyncSnapshot(storageId, snapshot);
    if (response.success) {
      return response.snapshot;
    }
    throw new Error(response.error || '读取云同步快照失败');
  }

  static async saveCloudSyncSnapshot(
    storageId: string,
    snapshot: CloudSyncSnapshot
  ): Promise<{ success: boolean; error?: string }> {
    const client = getCloudBackupClient();
    if (client && typeof (client as any).saveCloudSyncSnapshot === 'function') {
      return await (client as any).saveCloudSyncSnapshot(storageId, snapshot);
    }

    if (!this.isElectronAvailable()) {
      return { success: false, error: 'Electron API not available' };
    }

    return await window.electronAPI.cloud.saveSyncSnapshot(storageId, snapshot);
  }

  static async readCloudSyncV2Object(
    storageId: string,
    path: string
  ): Promise<CloudSyncV2StoredObject | null> {
    this.assertElectronCloudSyncV2Available();
    return await window.electronAPI.cloud.readCloudSyncV2Object(storageId, path);
  }

  static async writeCloudSyncV2Object(
    storageId: string,
    path: string,
    data: Uint8Array,
    options?: CloudSyncV2ObjectWriteOptions
  ): Promise<CloudSyncV2ObjectWriteResult> {
    this.assertElectronCloudSyncV2Available();
    return await window.electronAPI.cloud.writeCloudSyncV2Object(storageId, path, data, options);
  }

  static async listCloudSyncV2Objects(
    storageId: string,
    prefix: string
  ): Promise<CloudSyncV2StoredObjectInfo[]> {
    this.assertElectronCloudSyncV2Available();
    return await window.electronAPI.cloud.listCloudSyncV2Objects(storageId, prefix);
  }

  static async deleteCloudSyncV2Object(storageId: string, path: string): Promise<void> {
    this.assertElectronCloudSyncV2Available();
    await window.electronAPI.cloud.deleteCloudSyncV2Object(storageId, path);
  }

  static createCloudSyncV2ObjectStorageAdapter(storageId: string): CloudSyncV2ObjectStorageAdapter {
    return {
      read: path => this.readCloudSyncV2Object(storageId, path),
      write: (path, data, options) => this.writeCloudSyncV2Object(storageId, path, data, options),
      list: prefix => this.listCloudSyncV2Objects(storageId, prefix),
      delete: path => this.deleteCloudSyncV2Object(storageId, path)
    };
  }

  private static assertElectronCloudSyncV2Available(): void {
    if (!PlatformDetector.isElectron() || !this.isElectronAvailable()) {
      throw new Error('Electron cloud sync v2 API not available');
    }
  }
}
