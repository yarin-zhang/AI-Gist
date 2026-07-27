import { AppSettingsService } from './app-settings.service';
import {
  localBackupService,
  createLocalBackupSemanticChecksum,
  type LocalBackupInfo
} from './local-backup.service';
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

const AUTO_BACKUP_STARTUP_DELAY_MS = 30_000;

export type AutomaticBackupTrigger = 'startup' | 'interval' | 'manual';
export type AutomaticBackupLifecycleStatus = 'idle' | 'scheduled' | 'backing-up' | 'success' | 'error';

export interface AutomaticBackupStatus {
  status: AutomaticBackupLifecycleStatus;
  enabled: boolean;
  updatedAt: string;
  lastBackupAt?: string;
  nextBackupAt?: string;
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

type AutomaticBackupListener = (status: AutomaticBackupStatus) => void;

export interface AutomaticBackupServiceDeps {
  settings?: Pick<AppSettingsService, 'getBooleanValue' | 'setBooleanValue' | 'getNumberValue' | 'setNumberValue'>;
  backupService?: {
    list(): Promise<LocalBackupInfo[]>;
    create(options: {
      description: string;
      backupType: 'automatic';
      trigger: AutomaticBackupTrigger;
      retention: number;
    }): Promise<{
      action: 'created' | 'unchanged';
      backup: LocalBackupInfo;
      deletedCount: number;
    }>;
    pruneAutomatic(retention: number): Promise<number>;
  };
}

export class AutomaticBackupService {
  private static instance: AutomaticBackupService;
  private readonly settings: NonNullable<AutomaticBackupServiceDeps['settings']>;
  private readonly backupService: NonNullable<AutomaticBackupServiceDeps['backupService']>;
  private readonly listeners = new Set<AutomaticBackupListener>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running: Promise<void> | null = null;
  private intervalMinutes = DEFAULT_AUTO_BACKUP_INTERVAL_MINUTES;
  private retention = DEFAULT_AUTO_BACKUP_RETENTION;
  private status: AutomaticBackupStatus = {
    status: 'idle',
    enabled: false,
    updatedAt: new Date().toISOString()
  };

  constructor(deps: AutomaticBackupServiceDeps = {}) {
    this.settings = deps.settings || AppSettingsService.getInstance();
    this.backupService = deps.backupService || localBackupService;
  }

  static getInstance(): AutomaticBackupService {
    if (!AutomaticBackupService.instance) {
      AutomaticBackupService.instance = new AutomaticBackupService();
    }
    return AutomaticBackupService.instance;
  }

  async startFromSettings(): Promise<void> {
    const [enabled, intervalMinutes, retention, backups] = await Promise.all([
      this.getEnabled(),
      this.getIntervalMinutes(),
      this.getRetention(),
      this.backupService.list()
    ]);
    this.intervalMinutes = intervalMinutes;
    this.retention = retention;
    this.stopTimer();
    this.updateStatus({
      enabled,
      lastBackupAt: backups.find(backup => backup.backupType === 'automatic')?.createdAt
    });
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
    await this.settings.setBooleanValue(AUTO_BACKUP_ENABLED_SETTING_KEY, enabled, '是否创建自动本地备份');
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
    await this.settings.setNumberValue(AUTO_BACKUP_INTERVAL_SETTING_KEY, value, '自动本地备份间隔（分钟）');
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
    await this.settings.setNumberValue(AUTO_BACKUP_RETENTION_SETTING_KEY, value, '本机保留的自动备份数量');
    this.retention = value;
    return this.applyRetentionNow();
  }

  async applyRetentionNow(): Promise<AutomaticBackupRetentionUpdateResult> {
    try {
      const deletedCount = await this.backupService.pruneAutomatic(this.retention);
      this.updateStatus({
        status: 'success',
        error: undefined,
        lastRunAction: 'maintenance',
        deletedCount,
        deferredCount: 0
      });
      return { retention: this.retention, deletedCount, deferredCount: 0, warnings: [] };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.updateStatus({ status: 'error', error: message, lastRunAction: 'maintenance' });
      return { retention: this.retention, deletedCount: 0, deferredCount: 0, warnings: [message] };
    }
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
      const result = await this.backupService.create({
        description: `自动本地备份 - ${new Date().toLocaleString()}`,
        backupType: 'automatic',
        trigger,
        retention: this.retention
      });
      this.updateStatus({
        status: 'success',
        lastBackupAt: result.backup.createdAt,
        error: undefined,
        lastRunAction: result.action,
        deletedCount: result.deletedCount,
        deferredCount: 0
      });
    } catch (error) {
      this.updateStatus({
        status: 'error',
        error: error instanceof Error ? error.message : String(error)
      });
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
}

export function createAutomaticBackupSemanticChecksum(data: any): string {
  return createLocalBackupSemanticChecksum(data);
}

export function normalizeAutomaticBackupInterval(minutes: number): number {
  if (!Number.isFinite(minutes)) return DEFAULT_AUTO_BACKUP_INTERVAL_MINUTES;
  return Math.min(MAX_AUTO_BACKUP_INTERVAL_MINUTES, Math.max(MIN_AUTO_BACKUP_INTERVAL_MINUTES, Math.round(minutes)));
}

export const automaticBackupService = AutomaticBackupService.getInstance();
