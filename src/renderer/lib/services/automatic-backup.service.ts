import type {
  CloudBackupCreateOptions,
  CloudBackupDeleteTarget,
  CloudBackupInfo,
  CloudStorageConfig
} from '@shared/types/cloud-backup';
import type { ExportResult } from '@shared/types/data-management';
import { createBackupDataChecksum } from '@shared/backup-integrity';
import { createCloudSyncSemanticChecksum, type CloudSyncDataSet } from '@shared/cloud-sync-engine';
import type { CloudSyncManifest } from '@shared/cloud-sync-manifest';
import type { CloudSyncRemoteSnapshotInfo } from '@shared/cloud-sync-snapshots';
import { planCloudRetention } from '@shared/cloud-retention';
import { PlatformDetector } from '@shared/platform';
import { CloudBackupAPI } from '../api/cloud-backup.api';
import { AppSettingsService } from './app-settings.service';
import { DatabaseServiceManager } from './database-manager.service';
import {
  AUTO_BACKUP_RETENTION_SETTING_KEY,
  DEFAULT_AUTO_BACKUP_RETENTION,
  normalizeAutomaticBackupRetention
} from './cloud-retention-settings';

export {
  AUTO_BACKUP_RETENTION_SETTING_KEY,
  DEFAULT_AUTO_BACKUP_RETENTION,
  MIN_AUTO_BACKUP_RETENTION,
  MAX_AUTO_BACKUP_RETENTION,
  normalizeAutomaticBackupRetention
} from './cloud-retention-settings';

export const AUTO_BACKUP_ENABLED_SETTING_KEY = 'cloud.backup.auto.enabled';
export const AUTO_BACKUP_INTERVAL_SETTING_KEY = 'cloud.backup.auto.intervalMinutes';
export const DEFAULT_AUTO_BACKUP_INTERVAL_MINUTES = 360;
export const MIN_AUTO_BACKUP_INTERVAL_MINUTES = 60;
export const MAX_AUTO_BACKUP_INTERVAL_MINUTES = 10080;

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
  lastRunAction?: 'created' | 'unchanged' | 'maintenance';
  deletedCount?: number;
  deferredCount?: number;
}

export interface AutomaticBackupRetentionUpdateResult {
  retention: number;
  deletedCount: number;
  deferredCount: number;
  warnings: string[];
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
    deleteCloudBackup(storageId: string, backup: CloudBackupDeleteTarget): Promise<{
      success: boolean;
      message?: string;
      error?: string;
    }>;
    getCloudSyncManifest?(storageId: string): Promise<CloudSyncManifest>;
    listCloudSyncSnapshots?(storageId: string): Promise<CloudSyncRemoteSnapshotInfo[]>;
    deleteCloudSyncSnapshot?(storageId: string, snapshot: CloudSyncRemoteSnapshotInfo | string): Promise<{
      success: boolean;
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
      deleteCloudBackup: (storageId, backup) => CloudBackupAPI.deleteCloudBackup(storageId, backup),
      getCloudSyncManifest: storageId => CloudBackupAPI.getCloudSyncManifest(storageId),
      listCloudSyncSnapshots: storageId => CloudBackupAPI.listCloudSyncSnapshots(storageId),
      deleteCloudSyncSnapshot: (storageId, snapshot) => CloudBackupAPI.deleteCloudSyncSnapshot(storageId, snapshot)
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

  async setRetention(retention: number): Promise<AutomaticBackupRetentionUpdateResult> {
    const value = normalizeAutomaticBackupRetention(retention);
    await this.settings.setNumberValue(AUTO_BACKUP_RETENTION_SETTING_KEY, value, '每个存储保留的自动恢复快照数量');
    this.retention = value;
    return this.applyRetentionNow();
  }

  async applyRetentionNow(): Promise<AutomaticBackupRetentionUpdateResult> {
    const configs = (await this.cloudClient.getStorageConfigs()).filter(config => config.enabled);
    let deletedCount = 0;
    let deferredCount = 0;
    const warnings: string[] = [];

    for (const config of configs) {
      try {
        const result = await this.pruneAutomaticBackups(config);
        deletedCount += result.deletedCount;
        deferredCount += result.deferredCount;
      } catch (error) {
        warnings.push(`${config.name} 自动备份: ${this.formatError(error)}`);
      }

      try {
        const result = await this.pruneSyncSnapshots(config);
        deletedCount += result.deletedCount;
        deferredCount += result.deferredCount;
      } catch (error) {
        warnings.push(`${config.name} 同步快照: ${this.formatError(error)}`);
      }
    }

    this.updateStatus({
      status: warnings.length > 0 ? 'error' : 'success',
      error: warnings.length > 0 ? warnings.join('；') : undefined,
      lastRunAction: 'maintenance',
      deletedCount,
      deferredCount
    });
    return { retention: this.retention, deletedCount, deferredCount, warnings };
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
      const semanticChecksum = createAutomaticBackupSemanticChecksum(exportResult.data);
      let lastBackupAt = this.status.lastBackupAt;
      const failures: string[] = [];
      let createdCount = 0;
      let deletedCount = 0;
      let deferredCount = 0;

      for (const config of configs) {
        try {
          const previous = this.storageState[config.id];
          let remoteBackups = await this.cloudClient.getCloudBackupList(config.id);
          const latestAutomaticBackup = this.getNewestAutomaticBackup(remoteBackups);
          const latestMatches = this.doesBackupMatchCurrentData(
            latestAutomaticBackup,
            checksum,
            semanticChecksum
          );
          if (!latestMatches) {
            const result = await this.cloudClient.createCloudBackup(config.id, {
              description: `自动恢复快照 - ${new Date().toLocaleString()}`,
              data: exportResult.data,
              backupType: 'automatic',
              trigger,
              deviceId: this.resolveDeviceId(),
              dataChecksum: semanticChecksum
            });
            if (!result.success) throw new Error(result.error || result.message);
            if (!result.backupInfo) throw new Error('云端未返回已创建备份的信息');

            lastBackupAt = result.backupInfo?.createdAt || new Date().toISOString();
            this.storageState[config.id] = { checksum: semanticChecksum, lastBackupAt };
            this.writeStorageState();
            remoteBackups = [result.backupInfo, ...remoteBackups.filter(backup => backup.id !== result.backupInfo!.id)];
            createdCount += 1;
          } else if (previous?.checksum !== semanticChecksum) {
            this.storageState[config.id] = {
              checksum: semanticChecksum,
              lastBackupAt: latestAutomaticBackup?.createdAt || previous?.lastBackupAt
            };
            this.writeStorageState();
          }
          const pruneResult = await this.pruneAutomaticBackups(config, remoteBackups);
          deletedCount += pruneResult.deletedCount;
          deferredCount += pruneResult.deferredCount;
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
        error: undefined,
        lastRunAction: createdCount > 0 ? 'created' : 'unchanged',
        deletedCount,
        deferredCount
      });
    } catch (error) {
      this.updateStatus({
        status: 'error',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  private async pruneAutomaticBackups(
    config: CloudStorageConfig,
    remoteBackups?: CloudBackupInfo[]
  ): Promise<{ deletedCount: number; deferredCount: number }> {
    const backups = (remoteBackups || await this.cloudClient.getCloudBackupList(config.id))
      .filter(backup => backup.backupType === 'automatic');
    const plan = planCloudRetention(
      backups.map(backup => ({
        ...backup,
        key: backup.id
      })),
      this.retention
    );
    for (const backup of plan.deleted) {
      const result = await this.cloudClient.deleteCloudBackup(config.id, backup);
      if (!result.success) {
        throw new Error(result.error || result.message || `删除旧自动快照失败: ${backup.name}`);
      }
    }
    return { deletedCount: plan.deleted.length, deferredCount: plan.deferred.length };
  }

  private async pruneSyncSnapshots(
    config: CloudStorageConfig
  ): Promise<{ deletedCount: number; deferredCount: number }> {
    if (!this.cloudClient.getCloudSyncManifest ||
        !this.cloudClient.listCloudSyncSnapshots ||
        !this.cloudClient.deleteCloudSyncSnapshot) {
      return { deletedCount: 0, deferredCount: 0 };
    }

    const [manifest, snapshots] = await Promise.all([
      this.cloudClient.getCloudSyncManifest(config.id),
      this.cloudClient.listCloudSyncSnapshots(config.id)
    ]);
    const protectedRevision = manifest.latestSnapshot?.revision;
    const plan = planCloudRetention(
      snapshots.map(snapshot => ({
        ...snapshot,
        key: snapshot.revision,
        protected: snapshot.revision === protectedRevision
      })),
      this.retention
    );
    for (const snapshot of plan.deleted) {
      const result = await this.cloudClient.deleteCloudSyncSnapshot(config.id, snapshot);
      if (!result.success) {
        throw new Error(result.error || `删除旧同步快照失败: ${snapshot.revision}`);
      }
    }
    return { deletedCount: plan.deleted.length, deferredCount: plan.deferred.length };
  }

  private getNewestAutomaticBackup(backups: CloudBackupInfo[]): CloudBackupInfo | undefined {
    return planCloudRetention(
      backups
        .filter(backup => backup.backupType === 'automatic')
        .map(backup => ({ ...backup, key: backup.id })),
      1,
      { deletionGraceMs: Number.MAX_SAFE_INTEGER }
    ).retained[0];
  }

  private doesBackupMatchCurrentData(
    backup: CloudBackupInfo | undefined,
    rawChecksum: string,
    semanticChecksum: string
  ): boolean {
    return !!backup && (
      backup.dataChecksum === semanticChecksum ||
      backup.dataChecksum === rawChecksum ||
      backup.checksum === rawChecksum
    );
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

  private formatError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}

export function createAutomaticBackupSemanticChecksum(data: any): string {
  try {
    return `semantic-v1:${createCloudSyncSemanticChecksum({
      ...(data as CloudSyncDataSet),
      syncTombstones: []
    })}`;
  } catch {
    return `raw-v1:${createBackupDataChecksum(data)}`;
  }
}

export function normalizeAutomaticBackupInterval(minutes: number): number {
  if (!Number.isFinite(minutes)) return DEFAULT_AUTO_BACKUP_INTERVAL_MINUTES;
  return Math.min(MAX_AUTO_BACKUP_INTERVAL_MINUTES, Math.max(MIN_AUTO_BACKUP_INTERVAL_MINUTES, Math.round(minutes)));
}

export const automaticBackupService = AutomaticBackupService.getInstance();
