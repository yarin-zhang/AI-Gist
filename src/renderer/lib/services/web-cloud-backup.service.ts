import type {
  CloudBackupInfo,
  CloudStorageConfig,
  CloudBackupCreateOptions,
  WebDAVConfig
} from '@shared/types/cloud-backup';
import {
  CLOUD_BACKUP_FILE_EXTENSION,
  CLOUD_BACKUP_FILE_PREFIX,
  getCloudBackupFilePath
} from '@shared/cloud-backup-paths';
import {
  createBackupPayload,
  parseBackupPayload
} from '@shared/backup-integrity';
import type {
  CloudSyncManifest,
  CloudSyncManifestSaveOptions,
  CloudSyncManifestSaveResult
} from '@shared/cloud-sync-manifest';
import type { CloudSyncSnapshot } from '@shared/cloud-sync-engine';
import type { CloudSyncRemoteSnapshotInfo } from '@shared/cloud-sync-snapshots';
import {
  assertValidCloudSyncManifest,
  createEmptyCloudSyncManifest
} from '@shared/cloud-sync-manifest';
import {
  assertValidCloudSyncSnapshotFile
} from '@shared/cloud-sync-snapshots';
import { DatabaseServiceManager } from './database-manager.service';

const STORAGE_CONFIGS_KEY = 'ai-gist:web:cloud-storage-configs';
const databaseService = DatabaseServiceManager.getInstance();

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export class WebCloudBackupService {
  private static instance: WebCloudBackupService;

  static getInstance(): WebCloudBackupService {
    if (!WebCloudBackupService.instance) {
      WebCloudBackupService.instance = new WebCloudBackupService();
    }
    return WebCloudBackupService.instance;
  }

  private createId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }

    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  async isICloudAvailable(): Promise<{ available: boolean; reason?: string }> {
    return {
      available: false,
      reason: 'Web 端不支持 iCloud Drive，请使用 WebDAV'
    };
  }

  async getStorageConfigs(): Promise<CloudStorageConfig[]> {
    try {
      const raw = localStorage.getItem(STORAGE_CONFIGS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  async addStorageConfig(config: Omit<CloudStorageConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<{
    success: boolean;
    config?: CloudStorageConfig;
    error?: string;
  }> {
    if (config.type === 'icloud') {
      return { success: false, error: 'Web 端不支持 iCloud Drive，请使用 WebDAV' };
    }

    const configs = await this.getStorageConfigs();
    const now = new Date().toISOString();
    const newConfig = {
      ...config,
      id: this.createId(),
      createdAt: now,
      updatedAt: now
    } as CloudStorageConfig;

    this.saveStorageConfigs([...configs, newConfig]);
    return { success: true, config: newConfig };
  }

  async updateStorageConfig(id: string, updates: Partial<CloudStorageConfig>): Promise<{
    success: boolean;
    config?: CloudStorageConfig;
    error?: string;
  }> {
    const configs = await this.getStorageConfigs();
    const index = configs.findIndex(config => config.id === id);
    if (index === -1) {
      return { success: false, error: '配置不存在' };
    }

    if (updates.type === 'icloud') {
      return { success: false, error: 'Web 端不支持 iCloud Drive，请使用 WebDAV' };
    }

    const nextConfig = {
      ...configs[index],
      ...updates,
      id,
      updatedAt: new Date().toISOString()
    } as CloudStorageConfig;
    configs[index] = nextConfig;
    this.saveStorageConfigs(configs);
    return { success: true, config: nextConfig };
  }

  async deleteStorageConfig(id: string): Promise<{ success: boolean; error?: string }> {
    const configs = await this.getStorageConfigs();
    this.saveStorageConfigs(configs.filter(config => config.id !== id));
    return { success: true };
  }

  async testStorageConnection(config: CloudStorageConfig): Promise<{ success: boolean; error?: string }> {
    if (config.type !== 'webdav') {
      return { success: false, error: 'Web 端仅支持 WebDAV' };
    }

    try {
      await this.request('/api/cloud/webdav/test', { config });
      return { success: true };
    } catch (error) {
      return { success: false, error: this.formatError(error) };
    }
  }

  async getCloudBackupList(storageId: string): Promise<CloudBackupInfo[]> {
    const config = await this.getStorageConfigOrThrow(storageId);
    if (config.type !== 'webdav') {
      return [];
    }

    return this.request<CloudBackupInfo[]>('/api/cloud/webdav/list-backups', { config });
  }

  async createCloudBackup(storageId: string, options?: string | CloudBackupCreateOptions): Promise<{
    success: boolean;
    message: string;
    backupInfo?: CloudBackupInfo;
    error?: string;
  }> {
    try {
      const normalizedOptions = typeof options === 'string' ? { description: options } : options;
      const config = await this.getWebDAVConfig(storageId);
      let backupDataToWrite = normalizedOptions?.data;
      if (!backupDataToWrite) {
        const exportResult = await databaseService.exportAllDataForBackup();
        if (!exportResult.success || !exportResult.data) {
          throw new Error(exportResult.error || exportResult.message || '导出本地数据失败');
        }
        backupDataToWrite = exportResult.data;
      }

      const createdAt = new Date().toISOString();
      const id = this.createId();
      const name = `${CLOUD_BACKUP_FILE_PREFIX}${createdAt.split('T')[0]}-${id.slice(0, 8)}`;
      const fileName = `${CLOUD_BACKUP_FILE_PREFIX}${id}${CLOUD_BACKUP_FILE_EXTENSION}`;
      const backupData = createBackupPayload({
        id,
        name,
        description: normalizedOptions?.description || 'Web 端云端备份',
        createdAt,
        data: backupDataToWrite,
        backupType: normalizedOptions?.backupType,
        trigger: normalizedOptions?.trigger,
        deviceId: normalizedOptions?.deviceId,
        dataChecksum: normalizedOptions?.dataChecksum
      });

      const backupInfo = await this.request<CloudBackupInfo>('/api/cloud/webdav/write-backup', {
        config,
        fileName,
        backupData
      });

      return {
        success: true,
        message: '云端备份创建成功',
        backupInfo
      };
    } catch (error) {
      return {
        success: false,
        message: '云端备份创建失败',
        error: this.formatError(error)
      };
    }
  }

  async restoreCloudBackup(storageId: string, backupId: string): Promise<{
    success: boolean;
    message: string;
    backupInfo?: CloudBackupInfo;
    error?: string;
  }> {
    try {
      const config = await this.getWebDAVConfig(storageId);
      const backupInfo = await this.findBackupInfo(storageId, backupId);
      const backupData = await this.request<any>('/api/cloud/webdav/read-backup', {
        config,
        cloudPath: backupInfo.cloudPath || getCloudBackupFilePath(backupInfo.name)
      });

      if (!backupData.data) {
        throw new Error('备份数据无效');
      }

      const parsedBackup = parseBackupPayload(backupData);
      const importResult = await databaseService.replaceAllData(parsedBackup.data);
      if (!importResult.success) {
        throw new Error(importResult.error || importResult.message || '写入本地数据失败');
      }

      return {
        success: true,
        message: '云端备份恢复成功',
        backupInfo
      };
    } catch (error) {
      return {
        success: false,
        message: '云端备份恢复失败',
        error: this.formatError(error)
      };
    }
  }

  async deleteCloudBackup(storageId: string, backupId: string): Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }> {
    try {
      const config = await this.getWebDAVConfig(storageId);
      const backupInfo = await this.findBackupInfo(storageId, backupId);
      await this.request('/api/cloud/webdav/delete-backup', {
        config,
        cloudPath: backupInfo.cloudPath || getCloudBackupFilePath(backupInfo.name)
      });
      return { success: true, message: '云端备份删除成功' };
    } catch (error) {
      return { success: false, error: this.formatError(error) };
    }
  }

  async getCloudSyncManifest(storageId: string): Promise<CloudSyncManifest> {
    try {
      const config = await this.getWebDAVConfig(storageId);
      const manifest = await this.request<CloudSyncManifest>('/api/cloud/webdav/get-sync-manifest', { config });
      return assertValidCloudSyncManifest(manifest);
    } catch (error) {
      if (this.isNotFoundError(error)) {
        return createEmptyCloudSyncManifest();
      }
      throw error;
    }
  }

  async saveCloudSyncManifest(
    storageId: string,
    manifest: CloudSyncManifest,
    options: CloudSyncManifestSaveOptions = {}
  ): Promise<CloudSyncManifestSaveResult> {
    try {
      const config = await this.getWebDAVConfig(storageId);
      await this.request('/api/cloud/webdav/save-sync-manifest', {
        config,
        manifest: assertValidCloudSyncManifest({
          ...manifest,
          updatedAt: new Date().toISOString()
        }),
        options
      });
      return { success: true };
    } catch (error) {
      if (this.isRevisionConflictError(error)) {
        return {
          success: false,
          conflict: true,
          error: this.formatError(error)
        };
      }
      return { success: false, error: this.formatError(error) };
    }
  }

  async listCloudSyncSnapshots(storageId: string): Promise<CloudSyncRemoteSnapshotInfo[]> {
    const config = await this.getWebDAVConfig(storageId);
    return this.request<CloudSyncRemoteSnapshotInfo[]>('/api/cloud/webdav/list-sync-snapshots', { config });
  }

  async readCloudSyncSnapshot(
    storageId: string,
    snapshot: CloudSyncRemoteSnapshotInfo | string
  ): Promise<CloudSyncSnapshot> {
    const config = await this.getWebDAVConfig(storageId);
    return assertValidCloudSyncSnapshotFile(
      await this.request<CloudSyncSnapshot>('/api/cloud/webdav/read-sync-snapshot', {
        config,
        snapshot
      })
    );
  }

  async saveCloudSyncSnapshot(
    storageId: string,
    snapshot: CloudSyncSnapshot
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const config = await this.getWebDAVConfig(storageId);
      await this.request('/api/cloud/webdav/save-sync-snapshot', {
        config,
        snapshot: assertValidCloudSyncSnapshotFile(snapshot)
      });
      return { success: true };
    } catch (error) {
      return { success: false, error: this.formatError(error) };
    }
  }

  private saveStorageConfigs(configs: CloudStorageConfig[]): void {
    localStorage.setItem(STORAGE_CONFIGS_KEY, JSON.stringify(configs));
  }

  private async getStorageConfigOrThrow(storageId: string): Promise<CloudStorageConfig> {
    const configs = await this.getStorageConfigs();
    const config = configs.find(item => item.id === storageId);
    if (!config) {
      throw new Error('存储配置不存在');
    }
    return config;
  }

  private async getWebDAVConfig(storageId: string): Promise<WebDAVConfig> {
    const config = await this.getStorageConfigOrThrow(storageId);
    if (config.type !== 'webdav') {
      throw new Error('Web 端仅支持 WebDAV');
    }
    return config as WebDAVConfig;
  }

  private async findBackupInfo(storageId: string, backupId: string): Promise<CloudBackupInfo> {
    const backups = await this.getCloudBackupList(storageId);
    const backup = backups.find(item => item.id === backupId);
    if (!backup) {
      throw new Error('备份文件不存在');
    }
    return backup;
  }

  private async request<T = unknown>(path: string, body: any): Promise<T> {
    const response = await fetch(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    let payload: ApiResponse<T> | null = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok || !payload?.success) {
      if (this.isMissingWebBackend(response, payload)) {
        throw new Error(
          'Web 端 WebDAV 代理未启用：请使用 AI-Gist Web 后端启动 Web 版，或使用 yarn dev:web / yarn preview:web / yarn serve:web。'
        );
      }
      throw new Error(payload?.error || `Web 后端请求失败（HTTP ${response.status}）`);
    }

    return payload.data as T;
  }

  private isMissingWebBackend(response: Response, payload: ApiResponse<unknown> | null): boolean {
    if (response.status !== 404) {
      return false;
    }

    const error = payload?.error || '';
    return !payload || /API route not found|Not Found/i.test(error);
  }

  private formatError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private isNotFoundError(error: unknown): boolean {
    const message = this.formatError(error);
    return message.includes('404') || message.includes('not found') || message.includes('不存在');
  }

  private isRevisionConflictError(error: unknown): boolean {
    return /manifest 已被其他设备更新|Precondition|412|If-Match|If-None-Match|已被其他设备更新/i
      .test(this.formatError(error));
  }
}

export const webCloudBackupService = WebCloudBackupService.getInstance();
