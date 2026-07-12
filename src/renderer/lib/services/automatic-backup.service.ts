import type {
  CloudBackupCreateOptions,
  CloudBackupInfo,
  CloudStorageConfig
} from '@shared/types/cloud-backup';
import type { ExportResult } from '@shared/types/data-management';
import { createBackupDataChecksum } from '@shared/backup-integrity';
import { PlatformDetector } from '@shared/platform';
import { CloudBackupAPI } from '../api/cloud-backup.api';
import { AppSettingsService } from './app-settings.service';
import { DatabaseServiceManager } from './database-manager.service';

export const AUTO_BACKUP_ENABLED_SETTING_KEY = 'cloud.backup.auto.enabled';
export const AUTO_BACKUP_INTERVAL_SETTING_KEY = 'cloud.backup.auto.intervalMinutes';
export const AUTO_BACKUP_RETENTION_SETTING_KEY = 'cloud.backup.auto.retention';
export const DEFAULT_AUTO_BACKUP_INTERVAL_MINUTES = 360;
export const DEFAULT_AUTO_BACKUP_RETENTION = 20;
export const MIN_AUTO_BACKUP_INTERVAL_MINUTES = 60;
export const MAX_AUTO_BACKUP_INTERVAL_MINUTES = 10080;
export const MIN_AUTO_BACKUP_RETENTION = 1;
export const MAX_AUTO_BACKUP_RETENTION = 100;

const AUTO_BACKUP_STATE_STORAGE_KEY = 'ai_gist_auto_backup_state';
const AUTO_BACKUP_STARTUP_DELAY_MS = 30_000;

export type AutomaticBackupTrigger = 'startup' | 'interval' | 'manual';
export type AutomaticBackupLifecycleStatus = 'idle' | 'scheduled' | 'backing-up' | 'success' | 'error';

export interface AutomaticBackupStatus {
  status: AutomaticBackupLifecycleStatus;
  enabled: boolean;
  updatedAt: string;
  lastBackupAt?: string;
  nextBackupAt?: string;
  storageId?: string;
  error?: string;
}

interface AutomaticBackupStorageState {
  checksum?: string;
  lastBackupAt?: string;
}

type AutomaticBackupListener = (status: AutomaticBackupStatus) => void;

export interface AutomaticBackupServiceDeps {
  settings?: Pick<AppSettingsService, 'getBooleanValue' | 'setBooleanValue' | 'getNumberValue' | 'setNumberValue'>;
  database?: { exportAllDataForBackup(): Promise<ExportResult> };
  cloudClient?: {
    getStorageConfigs(): Promise<CloudStorageConfig[]>;
    createCloudBackup(storageId: string, options: CloudBackupCreateOptions): Promise<{
      success: boolean;
      message: string;
      backupInfo?: CloudBackupInfo;
      error?: string;
    }>;
    getCloudBackupList(storageId: string): Promise<CloudBackupInfo[]>;
    deleteCloudBackup(storageId: string, backupId: string): Promise<{
      success: boolean;
      message?: string;
      error?: string;
    }>;
  };
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
  getDeviceId?: () => string;
}

export class AutomaticBackupService {
  private static instance: AutomaticBackupService;
  private readonly settings: NonNullable<AutomaticBackupServiceDeps['settings']>;
  private readonly database: NonNullable<AutomaticBackupServiceDeps['database']>;
  private readonly cloudClient: NonNullable<AutomaticBackupServiceDeps['cloudClient']>;
  private readonly storage?: Pick<Storage, 'getItem' | 'setItem'>;
  private readonly resolveDeviceId: () => string;
  private readonly listeners = new Set<AutomaticBackupListener>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running: Promise<void> | null = null;
  private intervalMinutes = DEFAULT_AUTO_BACKUP_INTERVAL_MINUTES;
  private retention = DEFAULT_AUTO_BACKUP_RETENTION;
  private storageState: Record<string, AutomaticBackupStorageState>;
  private status: AutomaticBackupStatus = {
    status: 'idle',
    enabled: false,
    updatedAt: new Date().toISOString()
  };

  constructor(deps: AutomaticBackupServiceDeps = {}) {
    this.settings = deps.settings || AppSettingsService.getInstance();
    this.database = deps.database || DatabaseServiceManager.getInstance();
    this.cloudClient = deps.cloudClient || {
      getStorageConfigs: () => CloudBackupAPI.getStorageConfigs(),
      createCloudBackup: (storageId, options) => CloudBackupAPI.createCloudBackup(storageId, options),
      getCloudBackupList: storageId => CloudBackupAPI.getCloudBackupList(storageId),
      deleteCloudBackup: (storageId, backupId) => CloudBackupAPI.deleteCloudBackup(storageId, backupId)
    };
    this.storage = deps.storage || (typeof localStorage !== 'undefined' ? localStorage : undefined);
    this.resolveDeviceId = deps.getDeviceId || (() => this.getDefaultDeviceId());
    this.storageState = this.readStorageState();
  }

  static getInstance(): AutomaticBackupService {
    if (!AutomaticBackupService.instance) {
      AutomaticBackupService.instance = new AutomaticBackupService();
    }
    return AutomaticBackupService.instance;
  }

  async startFromSettings(): Promise<void> {
    const [enabled, intervalMinutes, retention] = await Promise.all([
      this.getEnabled(),
      this.getIntervalMinutes(),
      this.getRetention()
    ]);
    this.intervalMinutes = intervalMinutes;
    this.retention = retention;
    this.stopTimer();
    const lastBackupAt = Object.values(this.storageState)
      .map(state => state.lastBackupAt)
      .filter((value): value is string => !!value)
      .sort()
      .at(-1);
    this.updateStatus({ enabled, lastBackupAt });
    if (enabled) this.schedule('startup', AUTO_BACKUP_STARTUP_DELAY_MS);
  }

  stop(): void {
    this.stopTimer();
    this.updateStatus({ status: 'idle', nextBackupAt: undefined });
  }

  getStatus(): AutomaticBackupStatus {
    return { ...this.status };
  }

  onStatusChange(listener: AutomaticBackupListener): () => void {
    this.listeners.add(listener);
    listener(this.getStatus());
    return () => this.listeners.delete(listener);
  }

  async getEnabled(): Promise<boolean> {
    return this.settings.getBooleanValue(AUTO_BACKUP_ENABLED_SETTING_KEY, true);
  }

  async setEnabled(enabled: boolean): Promise<boolean> {
    await this.settings.setBooleanValue(AUTO_BACKUP_ENABLED_SETTING_KEY, enabled, '是否创建自动恢复快照');
    if (enabled) {
      await this.startFromSettings();
    } else {
      this.stopTimer();
      this.updateStatus({ enabled: false, status: 'idle', nextBackupAt: undefined });
    }
    return enabled;
  }

  async getIntervalMinutes(): Promise<number> {
    const value = await this.settings.getNumberValue(
      AUTO_BACKUP_INTERVAL_SETTING_KEY,
      DEFAULT_AUTO_BACKUP_INTERVAL_MINUTES
    );
    return normalizeAutomaticBackupInterval(value);
  }

  async setIntervalMinutes(minutes: number): Promise<number> {
    const value = normalizeAutomaticBackupInterval(minutes);
    await this.settings.setNumberValue(AUTO_BACKUP_INTERVAL_SETTING_KEY, value, '自动恢复快照间隔（分钟）');
    this.intervalMinutes = value;
    if (this.status.enabled) this.schedule('interval', value * 60_000);
    return value;
  }

  async getRetention(): Promise<number> {
    const value = await this.settings.getNumberValue(AUTO_BACKUP_RETENTION_SETTING_KEY, DEFAULT_AUTO_BACKUP_RETENTION);
    return normalizeAutomaticBackupRetention(value);
  }

  async setRetention(retention: number): Promise<number> {
    const value = normalizeAutomaticBackupRetention(retention);
    await this.settings.setNumberValue(AUTO_BACKUP_RETENTION_SETTING_KEY, value, '每个存储保留的自动恢复快照数量');
    this.retention = value;
    return value;
  }

  async runNow(trigger: AutomaticBackupTrigger = 'manual'): Promise<void> {
    if (this.running) return this.running;
    this.stopTimer();
    this.running = this.performBackup(trigger).finally(() => {
      this.running = null;
      if (this.status.enabled) this.schedule('interval', this.intervalMinutes * 60_000);
    });
    return this.running;
  }

  private schedule(trigger: AutomaticBackupTrigger, delayMs: number): void {
    this.stopTimer();
    const nextBackupAt = new Date(Date.now() + delayMs).toISOString();
    this.updateStatus({ status: 'scheduled', nextBackupAt });
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.runNow(trigger);
    }, delayMs);
  }

  private async performBackup(trigger: AutomaticBackupTrigger): Promise<void> {
    this.updateStatus({ status: 'backing-up', error: undefined, nextBackupAt: undefined });
    try {
      const configs = (await this.cloudClient.getStorageConfigs()).filter(config => config.enabled);
      if (configs.length === 0) {
        this.updateStatus({ status: 'idle' });
        return;
      }

      const exportResult = await this.database.exportAllDataForBackup();
      if (!exportResult.success || !exportResult.data) {
        throw new Error(exportResult.error || exportResult.message || '导出本地数据失败');
      }
      const checksum = createBackupDataChecksum(exportResult.data);
      let lastBackupAt = this.status.lastBackupAt;
      const failures: string[] = [];

      for (const config of configs) {
        try {
          const previous = this.storageState[config.id];
          let remoteBackups = await this.cloudClient.getCloudBackupList(config.id);
          const hasMatchingRemoteSnapshot = remoteBackups.some(backup =>
            backup.backupType === 'automatic' && backup.dataChecksum === checksum
          );
          if (previous?.checksum !== checksum || !hasMatchingRemoteSnapshot) {
            const result = await this.cloudClient.createCloudBackup(config.id, {
              description: `自动恢复快照 - ${new Date().toLocaleString()}`,
              data: exportResult.data,
              backupType: 'automatic',
              trigger,
              deviceId: this.resolveDeviceId(),
              dataChecksum: checksum
            });
            if (!result.success) throw new Error(result.error || result.message);

            lastBackupAt = result.backupInfo?.createdAt || new Date().toISOString();
            this.storageState[config.id] = { checksum, lastBackupAt };
            this.writeStorageState();
            remoteBackups = await this.cloudClient.getCloudBackupList(config.id);
          }
          await this.pruneAutomaticBackups(config, remoteBackups);
        } catch (error) {
          failures.push(`${config.name}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      if (failures.length > 0) {
        throw new Error(failures.join('；'));
      }

      this.updateStatus({
        status: 'success',
        storageId: configs[configs.length - 1]?.id,
        lastBackupAt,
        error: undefined
      });
    } catch (error) {
      this.updateStatus({
        status: 'error',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private async pruneAutomaticBackups(config: CloudStorageConfig, remoteBackups?: CloudBackupInfo[]): Promise<void> {
    const backups = (remoteBackups || await this.cloudClient.getCloudBackupList(config.id))
      .filter(backup => backup.backupType === 'automatic')
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
    for (const backup of backups.slice(this.retention)) {
      const result = await this.cloudClient.deleteCloudBackup(config.id, backup.id);
      if (!result.success) {
        throw new Error(result.error || result.message || `删除旧自动快照失败: ${backup.name}`);
      }
    }
  }

  private updateStatus(patch: Partial<AutomaticBackupStatus>): void {
    this.status = { ...this.status, ...patch, updatedAt: new Date().toISOString() };
    this.listeners.forEach(listener => listener(this.getStatus()));
  }

  private stopTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private readStorageState(): Record<string, AutomaticBackupStorageState> {
    try {
      const raw = this.storage?.getItem(AUTO_BACKUP_STATE_STORAGE_KEY) || null;
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  private writeStorageState(): void {
    try {
      this.storage?.setItem(AUTO_BACKUP_STATE_STORAGE_KEY, JSON.stringify(this.storageState));
    } catch (error) {
      console.warn('保存自动备份状态失败:', error);
    }
  }

  private getDefaultDeviceId(): string {
    try {
      return this.storage?.getItem('ai_gist_cloud_sync_device_id') || PlatformDetector.getPlatform();
    } catch {
      return PlatformDetector.getPlatform();
    }
  }
}

export function normalizeAutomaticBackupInterval(minutes: number): number {
  if (!Number.isFinite(minutes)) return DEFAULT_AUTO_BACKUP_INTERVAL_MINUTES;
  return Math.min(MAX_AUTO_BACKUP_INTERVAL_MINUTES, Math.max(MIN_AUTO_BACKUP_INTERVAL_MINUTES, Math.round(minutes)));
}

export function normalizeAutomaticBackupRetention(retention: number): number {
  if (!Number.isFinite(retention)) return DEFAULT_AUTO_BACKUP_RETENTION;
  return Math.min(MAX_AUTO_BACKUP_RETENTION, Math.max(MIN_AUTO_BACKUP_RETENTION, Math.round(retention)));
}

export const automaticBackupService = AutomaticBackupService.getInstance();
