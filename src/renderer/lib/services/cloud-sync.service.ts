import { PlatformDetector } from '@shared/platform';
import { createStableChecksum } from '@shared/data-checksum';
import type { ExportResult, ImportResult } from '@shared/types/data-management';
import type { CloudStorageConfig } from '@shared/types/cloud-backup';
import type {
  CloudSyncConflict,
  CloudSyncDataSet,
  CloudSyncMergeOptions,
  CloudSyncMergeSummary,
  CloudSyncSnapshot
} from '@shared/cloud-sync-engine';
import {
  applyCloudSyncTombstones,
  createCloudSyncSemanticChecksum,
  createCloudSyncSnapshot,
  mergeCloudSyncData,
  normalizeCloudSyncDataSet,
  validateCloudSyncDataSetShape,
  validateCloudSyncSnapshot
} from '@shared/cloud-sync-engine';
import type {
  CloudSyncManifest,
  CloudSyncManifestSaveOptions,
  CloudSyncManifestSaveResult
} from '@shared/cloud-sync-manifest';
import {
  createEmptyCloudSyncManifest,
  getCloudSyncManifestRepairMetadata,
  getCloudSyncManifestRevision,
  isCloudSyncManifestCorruptionError,
  sanitizeCloudSyncConflictsForMetadata,
  updateCloudSyncManifestDevice
} from '@shared/cloud-sync-manifest';
import type {
  CloudSyncRemoteSnapshotInfo
} from '@shared/cloud-sync-snapshots';
import {
  reconcileCloudSyncDataContract,
  pruneCloudSyncTombstonedPromptChildren,
  type CloudSyncBusinessKeyMerge,
  type CloudSyncContractIssue
} from '@shared/cloud-sync-contract';
import { generateUUID } from '../utils/uuid';
import { CloudBackupAPI } from '../api/cloud-backup.api';
import { DatabaseServiceManager } from './database-manager.service';
import { AppSettingsService } from './app-settings.service';
import { mobileCloudBackupService } from './mobile-cloud-backup.service';
import { webCloudBackupService } from './web-cloud-backup.service';
import type { DataChangeEventPayload, DataStoreName } from './data-change-events';
import { onDataChange } from './data-change-events';
import {
  CloudSyncV2Coordinator,
  type CloudSyncV2RolloutMode,
  type CloudSyncV2RolloutState
} from './cloud-sync-v2-coordinator';
import type { CloudSyncV2ObjectStorageAdapter } from '@shared/cloud-sync-v2-repository';

const DEVICE_ID_STORAGE_KEY = 'ai_gist_cloud_sync_device_id';
const LOCAL_STATE_STORAGE_PREFIX = 'ai_gist_cloud_sync_state';
const LAST_AUTO_ATTEMPT_STORAGE_KEY = 'ai_gist_cloud_sync_last_auto_attempt_at';
const PENDING_CHANGE_STORAGE_KEY = 'ai_gist_cloud_sync_pending_change';
const CONFLICT_LOG_STORAGE_KEY = 'ai_gist_cloud_sync_conflict_log';
const MAX_CONFLICT_LOG_ENTRIES = 50;
export const CLOUD_SYNC_INTERVAL_SETTING_KEY = 'cloud.sync.intervalMinutes';
export const CLOUD_SYNC_ENABLED_SETTING_KEY = 'cloud.sync.enabled';
export const DEFAULT_CLOUD_SYNC_INTERVAL_MINUTES = 15;
export const MIN_CLOUD_SYNC_INTERVAL_MINUTES = 5;
export const MAX_CLOUD_SYNC_INTERVAL_MINUTES = 1440;
const DEFAULT_AUTO_SYNC_DEBOUNCE_MS = 5000;
const DEFAULT_REMOTE_POLL_INTERVAL_MS = DEFAULT_CLOUD_SYNC_INTERVAL_MINUTES * 60 * 1000;
const DEFAULT_AUTO_SYNC_RETRY_MS = DEFAULT_REMOTE_POLL_INTERVAL_MS;
const DEFAULT_STARTUP_SYNC_DELAY_MS = 10000;
const MAX_AUTO_SYNC_RETRY_MS = 60 * 60 * 1000;
const MAX_REMOTE_RECHECK_ATTEMPTS = 3;
const READ_AFTER_WRITE_VERIFY_ATTEMPTS = 4;
const READ_AFTER_WRITE_VERIFY_RETRY_MS = 120;
const MAX_REMOTE_SNAPSHOT_SCAN = 20;
const SYNC_STORE_NAMES: DataStoreName[] = [
  'categories',
  'prompts',
  'promptVariables',
  'promptHistories',
  'ai_configs',
  'quick_optimization_configs',
  'ai_generation_history',
  'settings',
  'syncTombstones'
];

export type CloudSyncAction = 'uploaded' | 'downloaded' | 'merged' | 'noop';
export type CloudSyncRunReason =
  | 'startup'
  | 'local-change'
  | 'manual'
  | 'interval'
  | 'online'
  | 'focus'
  | 'blur'
  | 'shutdown'
  | 'background'
  | 'resume'
  | 'config-change'
  | 'retry';
export type CloudSyncLifecycleStatus = 'idle' | 'scheduled' | 'syncing' | 'success' | 'error';

export interface CloudSyncResult {
  success: boolean;
  action?: CloudSyncAction;
  localRevision?: string;
  remoteRevision?: string;
  appliedLocal: boolean;
  uploadedRemote: boolean;
  conflicts: CloudSyncConflict[];
  summary: CloudSyncMergeSummary;
  error?: string;
  errorCode?: CloudSyncErrorCode;
  diagnostic?: CloudSyncStructuredDiagnostic;
  warnings?: string[];
  businessKeyMerges?: CloudSyncBusinessKeyMerge[];
  v2MirrorStatus?: 'skipped' | 'published' | 'already-current' | 'rebase-required' | 'failed';
}

export type CloudSyncErrorCode =
  | 'LOCAL_EXPORT_FAILED'
  | 'DATA_CONTRACT_INVALID'
  | 'LOCAL_APPLY_FAILED'
  | 'LOCAL_APPLY_QUOTA'
  | 'REMOTE_CHANGED'
  | 'REMOTE_AUTH'
  | 'REMOTE_NETWORK'
  | 'REMOTE_PATH'
  | 'REMOTE_CORRUPT'
  | 'PROTOCOL_INCOMPATIBLE'
  | 'SYNC_CANCELLED'
  | 'UNKNOWN_SYNC_ERROR';

export type CloudSyncRetryClass = 'transient' | 'remote-changed' | 'user-action' | 'deterministic';

export interface CloudSyncStructuredDiagnostic {
  operationId: string;
  code: CloudSyncErrorCode;
  phase: 'export' | 'read-remote' | 'merge' | 'apply-local' | 'write-remote' | 'verify' | 'lifecycle';
  retryClass: CloudSyncRetryClass;
  message: string;
  storageId: string;
  localRevision?: string;
  remoteRevision?: string;
  targetRevision?: string;
  failures?: ImportResult['failures'];
  contractIssues?: CloudSyncContractIssue[];
  fingerprint: string;
}

export interface CloudSyncOptions extends CloudSyncMergeOptions {
  deviceName?: string;
  platform?: string;
  reason?: CloudSyncRunReason;
  /** Explicitly retry an unchanged deterministic failure after the user fixed external conditions. */
  forceRetry?: boolean;
}

export interface CloudSyncCloudClient {
  getCloudSyncManifest(storageId: string): Promise<CloudSyncManifest>;
  saveCloudSyncManifest(
    storageId: string,
    manifest: CloudSyncManifest,
    options?: CloudSyncManifestSaveOptions
  ): Promise<CloudSyncManifestSaveResult>;
  listCloudSyncSnapshots?(storageId: string): Promise<CloudSyncRemoteSnapshotInfo[]>;
  readCloudSyncSnapshot?(
    storageId: string,
    snapshot: CloudSyncRemoteSnapshotInfo | string
  ): Promise<CloudSyncSnapshot>;
  saveCloudSyncSnapshot?(storageId: string, snapshot: CloudSyncSnapshot): Promise<{ success: boolean; error?: string }>;
}

export interface CloudSyncDatabaseClient {
  exportAllDataForSync(): Promise<ExportResult>;
  replaceAllData(data: CloudSyncDataSet): Promise<ImportResult>;
  getLocalSyncMetadata?<T = any>(key: string): Promise<T | null>;
  setLocalSyncMetadata?<T = any>(key: string, value: T): Promise<void>;
  removeLocalSyncMetadata?(key: string): Promise<void>;
}

export interface CloudSyncConfigClient {
  getStorageConfigs(): Promise<CloudStorageConfig[]>;
}

export interface CloudSyncStatus {
  status: CloudSyncLifecycleStatus;
  pending: boolean;
  updatedAt: string;
  storageId?: string;
  reason?: CloudSyncRunReason;
  nextSyncAt?: string;
  lastSyncAt?: string;
  lastAttemptAt?: string;
  failureCount?: number;
  conflictLogCount?: number;
  lastResult?: CloudSyncResult;
  error?: string;
  pendingChanges?: boolean;
  lastLocalChangeAt?: string;
}

export interface CloudSyncFlushResult {
  success: boolean;
  skipped: boolean;
  timedOut: boolean;
  error?: string;
}

export interface CloudSyncErrorDiagnosisContext {
  storageId?: string;
  reason?: CloudSyncRunReason;
  status?: CloudSyncLifecycleStatus;
  failureCount?: number;
  timestamp?: string;
}

export interface CloudSyncErrorDiagnosis {
  title: string;
  message: string;
  rawError: string;
  canAutoRetry: boolean;
  canUserFix: boolean;
  suggestedActions: string[];
  copyText: string;
}

export interface CloudSyncAutoOptions extends CloudSyncOptions {
  enabled?: boolean;
  storageIds?: string[];
  debounceMs?: number;
  retryMs?: number;
  pollIntervalMs?: number;
  startupDelayMs?: number;
  syncOnStart?: boolean;
}

export interface CloudSyncLocalState {
  storageId: string;
  deviceId: string;
  lastSyncAt: string;
  lastKnownRevision?: string;
  baseSnapshot?: CloudSyncSnapshot;
}

export interface CloudSyncConflictLogEntry {
  id: string;
  storageId: string;
  detectedAt: string;
  localRevision?: string;
  remoteRevision?: string;
  resolvedRevision?: string;
  conflicts: CloudSyncConflict[];
}

export interface CloudSyncServiceDeps {
  cloudClient?: CloudSyncCloudClient;
  configClient?: CloudSyncConfigClient;
  database?: CloudSyncDatabaseClient;
  settings?: Pick<AppSettingsService, 'getNumberValue' | 'setNumberValue'> &
    Partial<Pick<AppSettingsService, 'getBooleanValue' | 'setBooleanValue'>>;
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  createDeviceId?: () => string;
  subscribeToDataChanges?: (listener: (change: DataChangeEventPayload) => void) => () => void;
  v2Coordinator?: CloudSyncV2Coordinator;
}

type CloudSyncStatusListener = (status: CloudSyncStatus) => void;

export class CloudSyncService {
  private static instance: CloudSyncService;
  private readonly cloudClient?: CloudSyncCloudClient;
  private readonly configClient?: CloudSyncConfigClient;
  private readonly database: CloudSyncDatabaseClient;
  private readonly settings: Pick<AppSettingsService, 'getNumberValue' | 'setNumberValue'> &
    Partial<Pick<AppSettingsService, 'getBooleanValue' | 'setBooleanValue'>>;
  private readonly storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  private readonly createDeviceId: () => string;
  private readonly subscribeToDataChanges: (listener: (change: DataChangeEventPayload) => void) => () => void;
  private readonly v2Coordinator: CloudSyncV2Coordinator;
  private readonly runningSyncs = new Map<string, Promise<CloudSyncResult>>();
  private readonly syncGenerations = new Map<string, number>();
  private readonly activeScheduledRuns = new Set<Promise<void>>();
  private readonly queuedAutoSyncs = new Map<string, CloudSyncRunReason>();
  private readonly blockedStorageFailures = new Map<string, CloudSyncResult>();
  private readonly deterministicFailureGuards = new Map<string, {
    localChecksum: string;
    remoteRevision?: string;
    result: CloudSyncResult;
  }>();
  private syncAllAfterRetry = false;
  private readonly statusListeners = new Set<CloudSyncStatusListener>();
  private autoSyncOptions: CloudSyncAutoOptions | null = null;
  private activeFlushPromise: Promise<CloudSyncFlushResult> | null = null;
  private flushGeneration = 0;
  private unsubscribeDataChanges: (() => void) | null = null;
  private scheduledTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryStorageIds: string[] | undefined;
  private retryCoveredPendingVersion: number | undefined;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private browserTriggerCleanups: (() => void)[] = [];
  private autoSyncEnabled = true;
  private applyingRemoteDataDepth = 0;
  private failureCount = 0;
  private status: CloudSyncStatus = {
    status: 'idle',
    pending: false,
    updatedAt: new Date().toISOString(),
    pendingChanges: false
  };
  private pendingChangeVersion = 0;
  private lastLocalChangeAt: string | undefined;

  constructor(deps: CloudSyncServiceDeps = {}) {
    this.cloudClient = deps.cloudClient;
    this.configClient = deps.configClient;
    this.database = deps.database || DatabaseServiceManager.getInstance();
    this.settings = deps.settings || AppSettingsService.getInstance();
    this.storage = deps.storage || getBrowserStorage();
    this.createDeviceId = deps.createDeviceId || generateUUID;
    this.subscribeToDataChanges = deps.subscribeToDataChanges || (listener => onDataChange(SYNC_STORE_NAMES, listener));
    this.v2Coordinator = deps.v2Coordinator || new CloudSyncV2Coordinator({
      database: this.database,
      storageFactory: storageId => this.getCloudSyncV2StorageAdapter(storageId)
    });
    this.restorePendingChangeState();
    this.status.conflictLogCount = this.getConflictLog().length;
  }

  static getInstance(): CloudSyncService {
    if (!CloudSyncService.instance) {
      CloudSyncService.instance = new CloudSyncService();
    }
    return CloudSyncService.instance;
  }

  async syncNow(storageId: string, options: CloudSyncOptions = {}): Promise<CloudSyncResult> {
    const running = this.runningSyncs.get(storageId);
    if (running) {
      this.queueAutoSyncAfterRunning(storageId, options.reason || 'manual');
      return running;
    }

    const attemptAt = new Date().toISOString();
    const generation = (this.syncGenerations.get(storageId) || 0) + 1;
    this.syncGenerations.set(storageId, generation);
    this.saveLastAutoAttemptAt(attemptAt);
    this.updateStatus({
      status: 'syncing',
      pending: false,
      storageId,
      reason: options.reason || 'manual',
      lastAttemptAt: attemptAt,
      error: undefined,
      nextSyncAt: undefined
    });

    const syncPromise = this.performSync(storageId, options, 0, generation, generateUUID())
      .then(async result => {
        if (result.success && result.remoteRevision) {
          try {
            const v2Result = await this.v2Coordinator.mirrorSuccessfulV1Sync({
              storageId,
              revision: result.remoteRevision,
              deviceId: this.getOrCreateDeviceId(),
              exportData: () => this.exportLocalData()
            });
            result.v2MirrorStatus = v2Result.status;
            if (v2Result.warning) {
              result.warnings = [...(result.warnings || []), v2Result.warning];
            }
          } catch {
            result.v2MirrorStatus = 'failed';
            result.warnings = [
              ...(result.warnings || []),
              'v2 影子发布状态记录失败；v1 同步已成功且不受影响'
            ];
          }
        }
        if (this.runningSyncs.get(storageId) !== syncPromise) {
          if (this.autoSyncOptions) this.scheduleSync('retry', { delayMs: 0 });
          return result;
        }
        this.updateStatus({
          status: result.success ? 'success' : 'error',
          pending: false,
          storageId,
          reason: options.reason || 'manual',
          lastSyncAt: result.success ? new Date().toISOString() : this.status.lastSyncAt,
          failureCount: result.success ? 0 : this.failureCount,
          lastResult: result,
          error: result.success ? undefined : result.error,
          nextSyncAt: undefined
        });
        if (result.success) {
          this.failureCount = 0;
          this.blockedStorageFailures.delete(storageId);
          this.deterministicFailureGuards.delete(storageId);
          this.clearRetryTimerForStorage(storageId);
        }
        return result;
      })
      .finally(() => {
        if (this.runningSyncs.get(storageId) === syncPromise) {
          this.runningSyncs.delete(storageId);
          setTimeout(() => this.scheduleQueuedAutoSync(storageId), 0);
        }
      });
    this.runningSyncs.set(storageId, syncPromise);
    return syncPromise;
  }

  private queueAutoSyncAfterRunning(storageId: string, reason: CloudSyncRunReason): void {
    if (reason === 'manual') {
      return;
    }

    if (!this.autoSyncOptions) {
      return;
    }

    this.queuedAutoSyncs.set(storageId, reason);
  }

  private scheduleQueuedAutoSync(storageId: string): void {
    const reason = this.queuedAutoSyncs.get(storageId);
    if (!reason) {
      return;
    }

    this.queuedAutoSyncs.delete(storageId);
    if (!this.autoSyncOptions) {
      return;
    }

    this.scheduleSync(reason, {
      storageId,
      delayMs: 0
    });
  }

  startAutoSync(options: CloudSyncAutoOptions = {}): void {
    const enabled = options.enabled !== false;
    this.stopAutoSync();
    this.autoSyncEnabled = enabled;

    if (!enabled) {
      return;
    }

    this.autoSyncOptions = normalizeAutoSyncOptions(options);
    this.unsubscribeDataChanges = this.subscribeToDataChanges(change => this.handleLocalDataChange(change));
    this.attachBrowserTriggers();

    if (this.autoSyncOptions.pollIntervalMs! > 0) {
      this.pollTimer = setInterval(() => {
        void this.startScheduledRun('interval');
      }, this.autoSyncOptions.pollIntervalMs);
    }

    if (this.autoSyncOptions.syncOnStart !== false) {
      this.scheduleSync('startup', {
        delayMs: this.hasPendingChanges()
          ? 0
          : (this.autoSyncOptions.startupDelayMs ?? DEFAULT_STARTUP_SYNC_DELAY_MS)
      });
    }
  }

  async startAutoSyncFromSettings(options: CloudSyncAutoOptions = {}): Promise<void> {
    const enabled = await this.getAutoSyncEnabled();
    const intervalMinutes = await this.getAutoSyncIntervalMinutes();
    const intervalMs = minutesToMs(intervalMinutes);
    this.startAutoSync({
      ...options,
      enabled: options.enabled ?? enabled,
      pollIntervalMs: options.pollIntervalMs ?? intervalMs,
      retryMs: options.retryMs ?? intervalMs
    });
  }

  async getAutoSyncEnabled(): Promise<boolean> {
    try {
      return await this.settings.getBooleanValue?.(CLOUD_SYNC_ENABLED_SETTING_KEY, true) ?? true;
    } catch {
      return true;
    }
  }

  async setAutoSyncEnabled(enabled: boolean): Promise<boolean> {
    await this.settings.setBooleanValue?.(
      CLOUD_SYNC_ENABLED_SETTING_KEY,
      enabled,
      '是否启用云端自动同步'
    );

    this.autoSyncEnabled = enabled;
    if (enabled) {
      await this.startAutoSyncFromSettings(this.autoSyncOptions || {});
    } else {
      this.stopAutoSync();
    }
    return enabled;
  }

  async getAutoSyncIntervalMinutes(): Promise<number> {
    try {
      const storedValue = await this.settings.getNumberValue(
        CLOUD_SYNC_INTERVAL_SETTING_KEY,
        DEFAULT_CLOUD_SYNC_INTERVAL_MINUTES
      );
      return normalizeCloudSyncIntervalMinutes(storedValue);
    } catch {
      return DEFAULT_CLOUD_SYNC_INTERVAL_MINUTES;
    }
  }

  async setAutoSyncIntervalMinutes(minutes: number): Promise<number> {
    const normalizedMinutes = normalizeCloudSyncIntervalMinutes(minutes);
    await this.settings.setNumberValue(
      CLOUD_SYNC_INTERVAL_SETTING_KEY,
      normalizedMinutes,
      '云同步自动检查间隔（分钟）'
    );

    if (this.autoSyncOptions) {
      const intervalMs = minutesToMs(normalizedMinutes);
      this.startAutoSync({
        ...this.autoSyncOptions,
        pollIntervalMs: intervalMs,
        retryMs: intervalMs
      });
    }

    return normalizedMinutes;
  }

  hasPendingChanges(): boolean {
    return this.pendingChangeVersion > 0;
  }

  async flushPendingSync(options: {
    reason?: CloudSyncRunReason;
    timeoutMs?: number;
  } = {}): Promise<CloudSyncFlushResult> {
    if (!this.autoSyncEnabled || !this.hasPendingChanges()) {
      return { success: true, skipped: true, timedOut: false };
    }

    const reason = options.reason || 'shutdown';
    const timeoutMs = Math.max(250, options.timeoutMs ?? 5000);
    let task = this.activeFlushPromise;
    if (!task) {
      const generation = ++this.flushGeneration;
      const created = this.performPendingFlush(reason, generation);
      task = created.finally(() => {
        if (this.activeFlushPromise === task) this.activeFlushPromise = null;
      });
      this.activeFlushPromise = task;
    }
    let timeout: ReturnType<typeof setTimeout> | undefined;

    try {
      const result = await Promise.race([
        task,
        new Promise<CloudSyncFlushResult>(resolve => {
          timeout = setTimeout(() => resolve({
            success: false,
            skipped: false,
            timedOut: true,
            error: `同步未能在 ${timeoutMs}ms 内完成`
          }), timeoutMs);
        })
      ]);
      if (result.timedOut && this.activeFlushPromise === task) {
        this.cancelActiveFlush();
      }
      return result;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  stopAutoSync(): void {
    this.clearScheduledTimer();
    this.clearRetryTimer();
    this.queuedAutoSyncs.clear();
    this.syncAllAfterRetry = false;

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    this.unsubscribeDataChanges?.();
    this.unsubscribeDataChanges = null;

    this.browserTriggerCleanups.forEach(cleanup => cleanup());
    this.browserTriggerCleanups = [];
    this.autoSyncOptions = null;

    this.updateStatus({
      status: 'idle',
      pending: false,
      nextSyncAt: undefined,
      reason: undefined
    });
  }

  scheduleSync(
    reason: CloudSyncRunReason = 'manual',
    options: { storageId?: string; delayMs?: number } = {}
  ): void {
    if (!this.autoSyncOptions) {
      return;
    }

    if (this.retryTimer && reason !== 'retry' && reason !== 'config-change') {
      if (reason !== 'online') {
        if (reason === 'local-change' || reason === 'blur' || reason === 'background') {
          this.syncAllAfterRetry = true;
        }
        return;
      }
      this.clearRetryTimer();
    }

    const delayMs = options.delayMs ?? this.autoSyncOptions.debounceMs ?? DEFAULT_AUTO_SYNC_DEBOUNCE_MS;
    const nextSyncAt = new Date(Date.now() + delayMs).toISOString();

    this.clearScheduledTimer();
    this.updateStatus({
      status: 'scheduled',
      pending: true,
      storageId: options.storageId,
      reason,
      nextSyncAt,
      error: undefined
    });

    this.scheduledTimer = setTimeout(() => {
      this.scheduledTimer = null;
      void this.startScheduledRun(reason, options.storageId);
    }, delayMs);
  }

  getStatus(): CloudSyncStatus {
    return { ...this.status };
  }

  getCloudSyncV2RolloutState(storageId: string): Promise<CloudSyncV2RolloutState> {
    return this.v2Coordinator.getRolloutState(storageId);
  }

  setCloudSyncV2RolloutMode(
    storageId: string,
    mode: CloudSyncV2RolloutMode
  ): Promise<CloudSyncV2RolloutState> {
    return this.v2Coordinator.setRolloutMode(storageId, mode);
  }

  onStatusChange(listener: CloudSyncStatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.getStatus());

    return () => {
      this.statusListeners.delete(listener);
    };
  }

  getConflictLog(storageId?: string): CloudSyncConflictLogEntry[] {
    if (!this.storage) {
      return [];
    }

    try {
      const raw = this.storage.getItem(CONFLICT_LOG_STORAGE_KEY);
      if (!raw) {
        return [];
      }

      const entries = JSON.parse(raw);
      if (!Array.isArray(entries)) {
        return [];
      }

      const normalized = entries
        .map(entry => normalizeConflictLogEntry(entry))
        .filter((entry): entry is CloudSyncConflictLogEntry => !!entry);
      return storageId
        ? normalized.filter(entry => entry.storageId === storageId)
        : normalized;
    } catch {
      return [];
    }
  }

  clearConflictLog(storageId?: string): void {
    if (!this.storage) {
      return;
    }

    try {
      if (!storageId) {
        this.storage.removeItem(CONFLICT_LOG_STORAGE_KEY);
        this.updateStatus({ conflictLogCount: 0 });
        return;
      }

      const remainingEntries = this.getConflictLog()
        .filter(entry => entry.storageId !== storageId)
        .slice(0, MAX_CONFLICT_LOG_ENTRIES);

      if (remainingEntries.length === 0) {
        this.storage.removeItem(CONFLICT_LOG_STORAGE_KEY);
      } else {
        this.storage.setItem(CONFLICT_LOG_STORAGE_KEY, JSON.stringify(remainingEntries));
      }

      this.updateStatus({ conflictLogCount: remainingEntries.length });
    } catch (error) {
      console.warn('清空同步冲突审计记录失败:', error);
    }
  }

  private async performSync(
    storageId: string,
    options: CloudSyncOptions,
    attempt = 0,
    generation = this.syncGenerations.get(storageId) || 0,
    operationId = generateUUID()
  ): Promise<CloudSyncResult> {
    let phase: CloudSyncStructuredDiagnostic['phase'] = 'export';
    let localRevision: string | undefined;
    let remoteRevision: string | undefined;
    let targetRevision: string | undefined;
    let localChecksum: string | undefined;
    try {
      this.assertCurrentSyncGeneration(storageId, generation);
      const deviceId = this.getOrCreateDeviceId();
      const now = new Date().toISOString();
      const localData = await this.exportLocalData();
      localChecksum = createCloudSyncSemanticChecksum(localData);
      const localChangeVersionAtExport = this.pendingChangeVersion;
      this.assertCurrentSyncGeneration(storageId, generation);
      phase = 'read-remote';
      const manifestResult = await this.getManifestOrRecoverCorruption(
        storageId,
        localData,
        deviceId,
        now,
        options,
        generation
      );
      this.assertCurrentSyncGeneration(storageId, generation);
      if (manifestResult.result) {
        return manifestResult.result;
      }

      const manifest = manifestResult.manifest;
      const localState = await this.getLocalState(storageId);
      const remoteSnapshot = manifest.latestSnapshot;
      localRevision = localState?.lastKnownRevision;
      remoteRevision = remoteSnapshot?.revision;
      const guardedFailure = this.deterministicFailureGuards.get(storageId);
      if (
        !options.forceRetry &&
        guardedFailure &&
        guardedFailure.localChecksum === localChecksum &&
        guardedFailure.remoteRevision === remoteRevision
      ) {
        return guardedFailure.result;
      }
      const manifestRepairMetadata = getCloudSyncManifestRepairMetadata(manifest);
      if (remoteSnapshot) {
        this.assertValidRemoteSnapshot(remoteSnapshot);
      }

      if (!remoteSnapshot) {
        const latestManifest = await this.getCloudClient().getCloudSyncManifest(storageId);
        this.assertCurrentSyncGeneration(storageId, generation);
        if (latestManifest.latestSnapshot) {
          return await this.retryWithLatestRemote(storageId, options, attempt, generation);
        }

        const snapshot = createCloudSyncSnapshot(localData, deviceId);
        targetRevision = snapshot.revision;
        try {
          phase = 'write-remote';
          this.assertCurrentSyncGeneration(storageId, generation);
          await this.saveManifest(
            storageId,
            this.buildManifest(latestManifest, snapshot, [], deviceId, now, options),
            getCloudSyncManifestRevision(latestManifest),
            generation
          );
        } catch (error) {
          if (isCloudSyncRemoteChangedError(error)) {
            return await this.retryAfterManifestConflict(
              storageId,
              options,
              attempt,
              snapshot,
              false,
              generation
            );
          }
          throw error;
        }
        this.assertCurrentSyncGeneration(storageId, generation);
        const stateWarning = await this.saveLocalState(storageId, deviceId, snapshot, now);

        return {
          success: true,
          action: 'uploaded',
          localRevision: snapshot.revision,
          remoteRevision: snapshot.revision,
          appliedLocal: false,
          uploadedRemote: true,
          conflicts: [],
          summary: createEmptySummary(),
          warnings: stateWarning ? [stateWarning] : undefined
        };
      }

      const remoteData = applyCloudSyncTombstones(remoteSnapshot.data);
      const baseData = this.getBaseData(localState);
      phase = 'merge';
      const mergeResult = mergeCloudSyncData(localData, remoteData, baseData, {
        prefer: options.prefer || 'newer'
      });
      const mergedWithDeletesApplied = pruneCloudSyncTombstonedPromptChildren(
        applyCloudSyncTombstones(mergeResult.data),
        baseData
      );
      const contractResult = reconcileCloudSyncDataContract(mergedWithDeletesApplied, baseData);
      if (!contractResult.valid) {
        throw new CloudSyncContractError(contractResult.issues);
      }
      const mergedData = contractResult.data;
      const mergedEqualsLocal = dataSetsEqual(localData, mergedData);
      const mergedEqualsRemote = dataSetsEqual(remoteData, mergedData);
      const contractWarnings = contractResult.merges.length > 0
        ? [`已自动归并 ${contractResult.merges.length} 组业务唯一键冲突`]
        : undefined;

      if (mergedEqualsLocal && mergedEqualsRemote) {
        if (manifestRepairMetadata) {
          try {
            this.assertCurrentSyncGeneration(storageId, generation);
            await this.saveManifest(
              storageId,
              this.buildManifest(manifest, remoteSnapshot, mergeResult.conflicts, deviceId, now, options),
              getCloudSyncManifestRevision(manifest),
              generation
            );
          } catch (error) {
            if (isCloudSyncRemoteChangedError(error)) {
              return await this.retryAfterManifestConflict(
                storageId,
                options,
                attempt,
                remoteSnapshot,
                false,
                generation
              );
            }
            throw error;
          }
        }

        this.assertCurrentSyncGeneration(storageId, generation);
        this.recordConflictLog(storageId, mergeResult.conflicts, {
          detectedAt: now,
          localRevision: localState?.lastKnownRevision,
          remoteRevision: remoteSnapshot.revision,
          resolvedRevision: remoteSnapshot.revision
        });
        const stateWarning = await this.saveLocalState(storageId, deviceId, remoteSnapshot, now);
        return {
          success: true,
          action: manifestRepairMetadata ? 'uploaded' : 'noop',
          localRevision: remoteSnapshot.revision,
          remoteRevision: remoteSnapshot.revision,
          appliedLocal: false,
          uploadedRemote: !!manifestRepairMetadata,
          conflicts: mergeResult.conflicts,
          summary: mergeResult.summary,
          warnings: mergeWarnings(contractWarnings, stateWarning),
          businessKeyMerges: contractResult.merges
        };
      }

      let finalSnapshot = remoteSnapshot;
      let latestManifestForUpload: CloudSyncManifest | null = null;
      if (!mergedEqualsRemote) {
        const latestManifest = await this.getCloudClient().getCloudSyncManifest(storageId);
        this.assertCurrentSyncGeneration(storageId, generation);
        if (
          hasRemoteRevisionChanged(remoteSnapshot, latestManifest.latestSnapshot) &&
          hasRemoteDataChanged(remoteData, latestManifest.latestSnapshot)
        ) {
          return await this.retryWithLatestRemote(storageId, options, attempt, generation);
        }

        latestManifestForUpload = latestManifest;
        finalSnapshot = createCloudSyncSnapshot(mergedData, deviceId);
        targetRevision = finalSnapshot.revision;
      } else if (manifestRepairMetadata) {
        latestManifestForUpload = manifest;
      }

      let appliedLocal = false;
      if (!mergedEqualsLocal) {
        if (this.pendingChangeVersion !== localChangeVersionAtExport) {
          return await this.retryAfterLocalChanged(storageId, options, attempt, generation, operationId);
        }
        phase = 'apply-local';
        this.assertCurrentSyncGeneration(storageId, generation);
        await this.replaceLocalDataForSync(mergedData, localData);
        this.assertCurrentSyncGeneration(storageId, generation);
        appliedLocal = true;
      }

      let uploadedRemote = false;
      if (latestManifestForUpload) {
        try {
          phase = 'write-remote';
          this.assertCurrentSyncGeneration(storageId, generation);
          await this.saveManifest(
            storageId,
            this.buildManifest(latestManifestForUpload, finalSnapshot, mergeResult.conflicts, deviceId, now, options),
            getCloudSyncManifestRevision(latestManifestForUpload),
            generation
          );
        } catch (error) {
          if (isCloudSyncRemoteChangedError(error)) {
            return await this.retryAfterManifestConflict(
              storageId,
              options,
              attempt,
              finalSnapshot,
              appliedLocal,
              generation
            );
          }
          throw error;
        }
        uploadedRemote = true;
      }

      this.assertCurrentSyncGeneration(storageId, generation);
      this.recordConflictLog(storageId, mergeResult.conflicts, {
        detectedAt: now,
        localRevision: localState?.lastKnownRevision,
        remoteRevision: remoteSnapshot.revision,
        resolvedRevision: finalSnapshot.revision
      });
      const stateWarning = await this.saveLocalState(storageId, deviceId, finalSnapshot, now);

      return {
        success: true,
        action: getSyncAction(appliedLocal, uploadedRemote),
        localRevision: finalSnapshot.revision,
        remoteRevision: finalSnapshot.revision,
        appliedLocal,
        uploadedRemote,
        conflicts: mergeResult.conflicts,
        summary: mergeResult.summary,
        warnings: mergeWarnings(contractWarnings, stateWarning),
        businessKeyMerges: contractResult.merges
      };
    } catch (error) {
      const diagnostic = createCloudSyncStructuredDiagnostic(error, {
        operationId,
        phase,
        storageId,
        localRevision,
        remoteRevision,
        targetRevision
      });
      const result: CloudSyncResult = {
        success: false,
        appliedLocal: false,
        uploadedRemote: false,
        conflicts: [],
        summary: createEmptySummary(),
        error: diagnostic.message,
        errorCode: diagnostic.code,
        diagnostic
      };
      if (localChecksum && diagnostic.retryClass !== 'transient' && diagnostic.retryClass !== 'remote-changed') {
        this.deterministicFailureGuards.set(storageId, {
          localChecksum,
          remoteRevision,
          result
        });
      }
      return result;
    }
  }

  private async exportLocalData(): Promise<CloudSyncDataSet> {
    const exportResult = await this.database.exportAllDataForSync();
    if (!exportResult.success || !exportResult.data) {
      throw new Error(exportResult.error || exportResult.message || '导出同步数据失败');
    }

    const validation = validateCloudSyncDataSetShape(exportResult.data);
    if (!validation.valid) {
      throw new Error(`本机同步数据导出不完整，已取消本次云同步: ${validation.reason || '未知原因'}`);
    }

    return normalizeCloudSyncDataSet(applyCloudSyncTombstones(exportResult.data));
  }

  private async replaceLocalDataForSync(nextData: CloudSyncDataSet, rollbackData: CloudSyncDataSet): Promise<void> {
    this.applyingRemoteDataDepth++;
    try {
      const importResult = await this.database.replaceAllData(nextData);
      if (!importResult.success) {
        throw new CloudSyncLocalApplyError(importResult);
      }
    } catch (error) {
      if (error instanceof CloudSyncLocalApplyError && error.result.atomic === true) {
        throw error;
      }
      const rollbackError = await this.rollbackLocalDataAfterFailedSync(rollbackData);
      if (rollbackError) {
        const originalMessage = error instanceof Error ? error.message : String(error);
        const rollbackMessage = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
        throw new Error(`同步合并数据写入本地失败，且本机数据回滚失败：${rollbackMessage}；原始错误：${originalMessage}`);
      }
      throw error;
    } finally {
      this.applyingRemoteDataDepth--;
    }
  }

  private async rollbackLocalDataAfterFailedSync(rollbackData: CloudSyncDataSet): Promise<unknown | null> {
    try {
      const rollbackResult = await this.database.replaceAllData(rollbackData);
      if (!rollbackResult.success) {
        return new Error(rollbackResult.error || rollbackResult.message || '同步失败后恢复本机数据失败');
      }
      return null;
    } catch (error) {
      return error;
    }
  }

  private async retryWithLatestRemote(
    storageId: string,
    options: CloudSyncOptions,
    attempt: number,
    generation: number
  ): Promise<CloudSyncResult> {
    if (attempt + 1 >= MAX_REMOTE_RECHECK_ATTEMPTS) {
      throw new Error('云端同步文件状态持续变化，应用会在下个同步周期自动重试');
    }

    return await this.performSync(storageId, options, attempt + 1, generation);
  }

  private async retryAfterLocalChanged(
    storageId: string,
    options: CloudSyncOptions,
    attempt: number,
    generation: number,
    operationId: string
  ): Promise<CloudSyncResult> {
    if (attempt + 1 >= MAX_REMOTE_RECHECK_ATTEMPTS) {
      throw new CloudSyncLocalChangedError('同步期间本机数据持续变化，已保留最新编辑并安排后续同步');
    }
    return await this.performSync(storageId, options, attempt + 1, generation, operationId);
  }

  private async retryAfterManifestConflict(
    storageId: string,
    options: CloudSyncOptions,
    attempt: number,
    submittedSnapshot: CloudSyncSnapshot,
    appliedLocal: boolean,
    generation: number
  ): Promise<CloudSyncResult> {
    const retryResult = await this.retryWithLatestRemote(storageId, options, attempt, generation);
    if (
      retryResult.success &&
      retryResult.remoteRevision === submittedSnapshot.revision
    ) {
      const finalAppliedLocal = appliedLocal || retryResult.appliedLocal;
      return {
        ...retryResult,
        action: getSyncAction(finalAppliedLocal, true),
        localRevision: submittedSnapshot.revision,
        remoteRevision: submittedSnapshot.revision,
        appliedLocal: finalAppliedLocal,
        uploadedRemote: true
      };
    }

    return retryResult;
  }

  private async getManifestOrRecoverCorruption(
    storageId: string,
    localData: CloudSyncDataSet,
    deviceId: string,
    now: string,
    options: CloudSyncOptions,
    generation: number
  ): Promise<{ manifest: CloudSyncManifest; result?: CloudSyncResult }> {
    try {
      const manifest = await this.getCloudClient().getCloudSyncManifest(storageId);
      this.assertCurrentSyncGeneration(storageId, generation);
      return {
        manifest: await this.repairManifestFromSnapshotFiles(storageId, manifest, deviceId, now, options, {
          required: !manifest.latestSnapshot
        }, generation)
      };
    } catch (error) {
      if (!isRecoverableCloudSyncManifestCorruption(error)) {
        throw error;
      }
      this.assertCurrentSyncGeneration(storageId, generation);

      const recoveredManifest = await this.recoverManifestFromSnapshotFiles(
        storageId,
        deviceId,
        now,
        options,
        generation
      );
      this.assertCurrentSyncGeneration(storageId, generation);
      if (recoveredManifest) {
        return { manifest: recoveredManifest };
      }

      const snapshot = createCloudSyncSnapshot(localData, deviceId);
      const rebuiltManifest = this.buildManifest(
        createEmptyCloudSyncManifest(now),
        snapshot,
        [],
        deviceId,
        now,
        options
      );

      this.assertCurrentSyncGeneration(storageId, generation);
      await this.overwriteManifest(storageId, rebuiltManifest, generation);
      this.assertCurrentSyncGeneration(storageId, generation);
      const stateWarning = await this.saveLocalState(storageId, deviceId, snapshot, now);

      return {
        manifest: rebuiltManifest,
        result: {
          success: true,
          action: 'uploaded',
          localRevision: snapshot.revision,
          remoteRevision: snapshot.revision,
          appliedLocal: false,
          uploadedRemote: true,
          conflicts: [],
          summary: createEmptySummary(),
          warnings: stateWarning ? [stateWarning] : undefined
        }
      };
    }
  }

  private async repairManifestFromSnapshotFiles(
    storageId: string,
    manifest: CloudSyncManifest,
    deviceId: string,
    now: string,
    options: CloudSyncOptions,
    readOptions: { required: boolean },
    generation: number
  ): Promise<CloudSyncManifest> {
    const repairedMatchingSnapshotManifest = await this.repairManifestFromMatchingSnapshotFile(
      storageId,
      manifest,
      deviceId,
      now,
      options,
      readOptions,
      generation
    );
    this.assertCurrentSyncGeneration(storageId, generation);
    if (repairedMatchingSnapshotManifest) {
      return repairedMatchingSnapshotManifest;
    }

    if (!readOptions.required && manifest.latestSnapshot) {
      return manifest;
    }

    const newestSnapshot = await this.getNewestRemoteSnapshot(storageId, readOptions);
    this.assertCurrentSyncGeneration(storageId, generation);
    if (!newestSnapshot) {
      return manifest;
    }

    const manifestSnapshot = manifest.latestSnapshot;
    if (
      manifestSnapshot &&
      !isCloudSyncSnapshotNewer(newestSnapshot, manifestSnapshot)
    ) {
      return manifest;
    }

    const repairedManifest = this.buildManifest(
      manifest,
      newestSnapshot,
      manifest.conflicts || [],
      deviceId,
      now,
      options
    );

    try {
      this.assertCurrentSyncGeneration(storageId, generation);
      await this.overwriteManifest(storageId, repairedManifest, generation);
      this.assertCurrentSyncGeneration(storageId, generation);
    } catch (error) {
      if (readOptions.required) {
        throw error;
      }
    }

    return repairedManifest;
  }

  private async repairManifestFromMatchingSnapshotFile(
    storageId: string,
    manifest: CloudSyncManifest,
    deviceId: string,
    now: string,
    options: CloudSyncOptions,
    readOptions: { required: boolean },
    generation: number
  ): Promise<CloudSyncManifest | null> {
    const manifestSnapshot = manifest.latestSnapshot;
    if (!manifestSnapshot) {
      return null;
    }

    const snapshotFile = await this.readSnapshotFileIfSupported(storageId, manifestSnapshot.revision);
    this.assertCurrentSyncGeneration(storageId, generation);
    if (!snapshotFile || snapshotFile.revision !== manifestSnapshot.revision) {
      return null;
    }

    if (
      snapshotFile.dataChecksum === manifestSnapshot.dataChecksum &&
      dataSetsEqual(snapshotFile.data, manifestSnapshot.data)
    ) {
      return null;
    }

    const repairedManifest = this.buildManifest(
      manifest,
      snapshotFile,
      manifest.conflicts || [],
      deviceId,
      now,
      options
    );

    try {
      this.assertCurrentSyncGeneration(storageId, generation);
      await this.overwriteManifest(storageId, repairedManifest, generation);
      this.assertCurrentSyncGeneration(storageId, generation);
    } catch (error) {
      if (readOptions.required) {
        throw error;
      }
    }

    return repairedManifest;
  }

  private async recoverManifestFromSnapshotFiles(
    storageId: string,
    deviceId: string,
    now: string,
    options: CloudSyncOptions,
    generation: number
  ): Promise<CloudSyncManifest | null> {
    const newestSnapshot = await this.getNewestRemoteSnapshot(storageId, { required: true });
    this.assertCurrentSyncGeneration(storageId, generation);
    if (!newestSnapshot) {
      return null;
    }

    const recoveredManifest = this.buildManifest(
      createEmptyCloudSyncManifest(now),
      newestSnapshot,
      [],
      deviceId,
      now,
      options
    );
    this.assertCurrentSyncGeneration(storageId, generation);
    await this.overwriteManifest(storageId, recoveredManifest, generation);
    this.assertCurrentSyncGeneration(storageId, generation);
    return recoveredManifest;
  }

  private async getNewestRemoteSnapshot(
    storageId: string,
    options: { required: boolean }
  ): Promise<CloudSyncSnapshot | null> {
    const cloudClient = this.getCloudClient();
    if (!cloudClient.listCloudSyncSnapshots || !cloudClient.readCloudSyncSnapshot) {
      return null;
    }

    let snapshotInfos: CloudSyncRemoteSnapshotInfo[];
    try {
      snapshotInfos = await cloudClient.listCloudSyncSnapshots(storageId);
    } catch (error) {
      if (options.required) {
        throw error;
      }
      return null;
    }

    let newestSnapshot: CloudSyncSnapshot | null = null;
    const candidates = [...snapshotInfos]
      .sort(compareRemoteSnapshotInfoDescending)
      .slice(0, MAX_REMOTE_SNAPSHOT_SCAN);
    let lastSnapshotError: unknown;

    for (const snapshotInfo of candidates) {
      try {
        const snapshot = await cloudClient.readCloudSyncSnapshot(storageId, snapshotInfo);
        this.assertValidRemoteSnapshot(snapshot);
        if (!newestSnapshot || isCloudSyncSnapshotNewer(snapshot, newestSnapshot)) {
          newestSnapshot = snapshot;
        }
      } catch (error) {
        lastSnapshotError = error;
        if (options.required && snapshotInfos.length === 1) {
          throw error;
        }
      }
    }

    if (options.required && snapshotInfos.length > 0 && !newestSnapshot && lastSnapshotError) {
      throw lastSnapshotError;
    }

    return newestSnapshot;
  }

  private buildManifest(
    manifest: CloudSyncManifest,
    snapshot: CloudSyncSnapshot,
    conflicts: CloudSyncConflict[],
    deviceId: string,
    now: string,
    options: CloudSyncOptions
  ): CloudSyncManifest {
    return updateCloudSyncManifestDevice(
      {
        ...manifest,
        updatedAt: now,
        latestSnapshot: snapshot,
        baseSnapshot: snapshot,
        conflicts: sanitizeCloudSyncConflictsForMetadata(conflicts)
      },
      {
        deviceId,
        deviceName: options.deviceName || getDefaultDeviceName(),
        platform: options.platform || PlatformDetector.getPlatform(),
        lastSyncAt: now,
        lastKnownRevision: snapshot.revision
      }
    );
  }

  private async saveManifest(
    storageId: string,
    manifest: CloudSyncManifest,
    expectedRevision: string | null,
    generation: number
  ): Promise<void> {
    const cloudClient = this.getCloudClient();
    this.assertCurrentSyncGeneration(storageId, generation);
    await this.saveSnapshotFileIfSupported(storageId, manifest.latestSnapshot);
    this.assertCurrentSyncGeneration(storageId, generation);
    const result = await cloudClient.saveCloudSyncManifest(storageId, manifest, {
      expectedRevision
    });
    this.assertCurrentSyncGeneration(storageId, generation);
    await this.confirmManifestSaveResult(
      storageId,
      manifest,
      result,
      '保存云同步 manifest 失败',
      { expectedRevision },
      generation
    );
  }

  private async overwriteManifest(
    storageId: string,
    manifest: CloudSyncManifest,
    generation: number
  ): Promise<void> {
    this.assertCurrentSyncGeneration(storageId, generation);
    await this.saveSnapshotFileIfSupported(storageId, manifest.latestSnapshot);
    this.assertCurrentSyncGeneration(storageId, generation);
    const result = await this.getCloudClient().saveCloudSyncManifest(storageId, manifest);
    this.assertCurrentSyncGeneration(storageId, generation);
    await this.confirmManifestSaveResult(storageId, manifest, result, '重建云同步 manifest 失败', undefined, generation);
  }

  private async confirmManifestSaveResult(
    storageId: string,
    manifest: CloudSyncManifest,
    result: CloudSyncManifestSaveResult,
    fallbackErrorMessage: string,
    retryOptions: CloudSyncManifestSaveOptions | undefined,
    generation: number
  ): Promise<void> {
    this.assertCurrentSyncGeneration(storageId, generation);
    if (!result.success) {
      if (result.conflict || isCloudSyncRevisionConflictMessage(result.error)) {
        throw new CloudSyncRemoteChangedError(result.error || '云端同步文件已被其他设备更新');
      }

      if (await this.isSavedManifestReadable(storageId, manifest, generation)) {
        return;
      }

      throw new Error(result.error || fallbackErrorMessage);
    }

    try {
      await this.verifySavedManifest(storageId, manifest, generation);
    } catch (error) {
      this.assertCurrentSyncGeneration(storageId, generation);
      const retryResult = await this.getCloudClient().saveCloudSyncManifest(storageId, manifest, retryOptions);
      this.assertCurrentSyncGeneration(storageId, generation);
      if (!retryResult.success) {
        if (await this.isSavedManifestReadable(storageId, manifest, generation)) {
          return;
        }

        if (retryResult.conflict || isCloudSyncRevisionConflictMessage(retryResult.error)) {
          throw new CloudSyncRemoteChangedError(retryResult.error || '云端同步文件已被其他设备更新');
        }

        throw new Error(retryResult.error || fallbackErrorMessage);
      }

      try {
        await this.verifySavedManifest(storageId, manifest, generation);
      } catch {
        throw error;
      }
    }
  }

  private async isSavedManifestReadable(
    storageId: string,
    manifest: CloudSyncManifest,
    generation: number
  ): Promise<boolean> {
    if (!manifest.latestSnapshot) {
      return false;
    }

    for (let attempt = 0; attempt < READ_AFTER_WRITE_VERIFY_ATTEMPTS; attempt += 1) {
      if (attempt > 0) {
        await delay(READ_AFTER_WRITE_VERIFY_RETRY_MS * attempt);
        this.assertCurrentSyncGeneration(storageId, generation);
      }

      try {
        await this.verifySavedManifestContentOnce(storageId, manifest);
        this.assertCurrentSyncGeneration(storageId, generation);
        return true;
      } catch {
        // A failed save can still mean the primary manifest reached the server
        // while a backup write or response failed. Keep probing the manifest,
        // but only accept it when its published content fully matches.
      }
    }

    return false;
  }

  private async saveSnapshotFileIfSupported(
    storageId: string,
    snapshot?: CloudSyncSnapshot
  ): Promise<void> {
    if (!snapshot) {
      return;
    }

    const cloudClient = this.getCloudClient();
    if (!cloudClient.saveCloudSyncSnapshot) {
      return;
    }

    const result = await cloudClient.saveCloudSyncSnapshot(storageId, snapshot);
    if (!result.success) {
      throw new Error(result.error || '保存云同步快照失败');
    }
  }

  private async verifySavedManifest(
    storageId: string,
    manifest: CloudSyncManifest,
    generation: number
  ): Promise<void> {
    let lastError: unknown;
    for (let attempt = 0; attempt < READ_AFTER_WRITE_VERIFY_ATTEMPTS; attempt += 1) {
      if (attempt > 0) {
        await delay(READ_AFTER_WRITE_VERIFY_RETRY_MS * attempt);
        this.assertCurrentSyncGeneration(storageId, generation);
      }

      try {
        await this.verifySavedManifestOnce(storageId, manifest);
        this.assertCurrentSyncGeneration(storageId, generation);
        return;
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private async verifySavedManifestOnce(
    storageId: string,
    manifest: CloudSyncManifest
  ): Promise<void> {
    const expectedSnapshot = manifest.latestSnapshot;
    if (!expectedSnapshot) {
      return;
    }

    const savedSnapshotFile = await this.readSnapshotFileIfSupported(storageId, expectedSnapshot.revision);
    if (savedSnapshotFile) {
      this.assertSavedSnapshotMatches(savedSnapshotFile, expectedSnapshot, '云同步快照文件');
    }

    await this.verifySavedManifestContentOnce(storageId, manifest);
  }

  private async verifySavedManifestContentOnce(
    storageId: string,
    manifest: CloudSyncManifest
  ): Promise<void> {
    const expectedSnapshot = manifest.latestSnapshot;
    if (!expectedSnapshot) {
      return;
    }

    const savedManifest = await this.getCloudClient().getCloudSyncManifest(storageId);
    const savedSnapshot = savedManifest.latestSnapshot;
    if (!savedSnapshot) {
      throw new Error(
        `云同步 manifest 保存后校验失败：期望 revision ${expectedSnapshot.revision}，实际 空`
      );
    }

    this.assertSavedSnapshotMatches(savedSnapshot, expectedSnapshot, '云同步 manifest');
  }

  private async readSnapshotFileIfSupported(
    storageId: string,
    revision: string
  ): Promise<CloudSyncSnapshot | null> {
    const cloudClient = this.getCloudClient();
    if (!cloudClient.readCloudSyncSnapshot) {
      return null;
    }

    try {
      return await cloudClient.readCloudSyncSnapshot(storageId, revision);
    } catch {
      return null;
    }
  }

  private assertSavedSnapshotMatches(
    savedSnapshot: CloudSyncSnapshot,
    expectedSnapshot: CloudSyncSnapshot,
    sourceName: string
  ): void {
    this.assertValidSavedSnapshot(savedSnapshot);

    if (savedSnapshot.revision !== expectedSnapshot.revision) {
      throw new Error(
        `${sourceName} 保存后校验失败：期望 revision ${expectedSnapshot.revision}，实际 ${savedSnapshot.revision}`
      );
    }

    if (
      expectedSnapshot.dataChecksum &&
      savedSnapshot.dataChecksum !== expectedSnapshot.dataChecksum
    ) {
      throw new Error(
        `${sourceName} 保存后数据校验失败：期望 checksum ${expectedSnapshot.dataChecksum}，` +
        `实际 ${savedSnapshot.dataChecksum || '空'}`
      );
    }

    if (!dataSetsEqual(savedSnapshot.data, expectedSnapshot.data)) {
      throw new Error(`${sourceName} 保存后数据校验失败：云端快照内容与本地提交不一致`);
    }
  }

  private getBaseData(localState: CloudSyncLocalState | null): CloudSyncDataSet {
    if (localState?.baseSnapshot) {
      return applyCloudSyncTombstones(localState.baseSnapshot.data);
    }

    return {};
  }

  private assertValidRemoteSnapshot(snapshot: CloudSyncSnapshot): void {
    const validation = validateCloudSyncSnapshot(snapshot);
    if (!validation.valid) {
      throw new Error(`云端同步快照无效: ${validation.reason || '未知原因'}`);
    }
  }

  private assertValidSavedSnapshot(snapshot: CloudSyncSnapshot): void {
    const validation = validateCloudSyncSnapshot(snapshot);
    if (!validation.valid) {
      throw new Error(`云同步 manifest 保存后数据校验失败：云端快照无效: ${validation.reason || '未知原因'}`);
    }
  }

  private getCloudSyncV2StorageAdapter(storageId: string): CloudSyncV2ObjectStorageAdapter | null {
    if (PlatformDetector.isElectron()) {
      return CloudBackupAPI.createCloudSyncV2ObjectStorageAdapter(storageId);
    }
    if (PlatformDetector.isWeb()) {
      return webCloudBackupService.createCloudSyncV2ObjectStorageAdapter(storageId);
    }
    const mobileService = mobileCloudBackupService as any;
    return typeof mobileService.createCloudSyncV2ObjectStorageAdapter === 'function'
      ? mobileService.createCloudSyncV2ObjectStorageAdapter(storageId)
      : null;
  }

  private getCloudClient(): CloudSyncCloudClient {
    if (this.cloudClient) {
      return this.cloudClient;
    }

    if (PlatformDetector.isElectron()) {
      return {
        getCloudSyncManifest: storageId => CloudBackupAPI.getCloudSyncManifest(storageId),
        saveCloudSyncManifest: (storageId, manifest, options) =>
          CloudBackupAPI.saveCloudSyncManifest(storageId, manifest, options),
        listCloudSyncSnapshots: storageId => CloudBackupAPI.listCloudSyncSnapshots(storageId),
        readCloudSyncSnapshot: (storageId, snapshot) => CloudBackupAPI.readCloudSyncSnapshot(storageId, snapshot),
        saveCloudSyncSnapshot: (storageId, snapshot) => CloudBackupAPI.saveCloudSyncSnapshot(storageId, snapshot)
      };
    }

    if (PlatformDetector.isWeb()) {
      return {
        getCloudSyncManifest: storageId => webCloudBackupService.getCloudSyncManifest(storageId),
        saveCloudSyncManifest: (storageId, manifest, options) =>
          webCloudBackupService.saveCloudSyncManifest(storageId, manifest, options),
        listCloudSyncSnapshots: storageId => webCloudBackupService.listCloudSyncSnapshots(storageId),
        readCloudSyncSnapshot: (storageId, snapshot) => webCloudBackupService.readCloudSyncSnapshot(storageId, snapshot),
        saveCloudSyncSnapshot: (storageId, snapshot) => webCloudBackupService.saveCloudSyncSnapshot(storageId, snapshot)
      };
    }

    return {
      getCloudSyncManifest: storageId => mobileCloudBackupService.getCloudSyncManifest(storageId),
      saveCloudSyncManifest: (storageId, manifest, options) =>
        mobileCloudBackupService.saveCloudSyncManifest(storageId, manifest, options),
      listCloudSyncSnapshots: storageId => mobileCloudBackupService.listCloudSyncSnapshots(storageId),
      readCloudSyncSnapshot: (storageId, snapshot) => mobileCloudBackupService.readCloudSyncSnapshot(storageId, snapshot),
      saveCloudSyncSnapshot: (storageId, snapshot) => mobileCloudBackupService.saveCloudSyncSnapshot(storageId, snapshot)
    };
  }

  private getConfigClient(): CloudSyncConfigClient {
    if (this.configClient) {
      return this.configClient;
    }

    if (PlatformDetector.isElectron()) {
      return {
        getStorageConfigs: () => CloudBackupAPI.getStorageConfigs()
      };
    }

    if (PlatformDetector.isWeb()) {
      return {
        getStorageConfigs: () => webCloudBackupService.getStorageConfigs()
      };
    }

    return {
      getStorageConfigs: () => mobileCloudBackupService.getStorageConfigs()
    };
  }

  private handleLocalDataChange(change: DataChangeEventPayload): void {
    if (this.applyingRemoteDataDepth > 0) {
      return;
    }

    if (change.action === 'clear' && change.storeName === 'syncTombstones') {
      return;
    }

    this.markPendingChange(change.timestamp);
    this.scheduleSync('local-change');
  }

  private markPendingChange(timestamp = Date.now()): void {
    this.pendingChangeVersion += 1;
    this.lastLocalChangeAt = new Date(timestamp).toISOString();
    this.persistPendingChangeState();
    this.updateStatus({
      pendingChanges: true,
      lastLocalChangeAt: this.lastLocalChangeAt
    });
  }

  private clearPendingChange(expectedVersion: number): void {
    if (this.pendingChangeVersion !== expectedVersion) {
      return;
    }
    this.pendingChangeVersion = 0;
    try {
      this.storage?.removeItem(PENDING_CHANGE_STORAGE_KEY);
    } catch (error) {
      console.warn('清理云同步待处理状态失败:', error);
    }
    this.updateStatus({ pendingChanges: false });
  }

  private restorePendingChangeState(): void {
    try {
      const raw = this.storage?.getItem(PENDING_CHANGE_STORAGE_KEY);
      if (!raw) return;
      const state = JSON.parse(raw) as { version?: number; changedAt?: string };
      this.pendingChangeVersion = Math.max(1, Number(state.version) || 1);
      this.lastLocalChangeAt = state.changedAt;
      this.status.pendingChanges = true;
      this.status.lastLocalChangeAt = state.changedAt;
    } catch (error) {
      console.warn('读取云同步待处理状态失败:', error);
      this.pendingChangeVersion = 1;
      this.status.pendingChanges = true;
    }
  }

  private persistPendingChangeState(): void {
    try {
      this.storage?.setItem(PENDING_CHANGE_STORAGE_KEY, JSON.stringify({
        version: this.pendingChangeVersion,
        changedAt: this.lastLocalChangeAt
      }));
    } catch (error) {
      console.warn('保存云同步待处理状态失败:', error);
    }
  }

  private async performPendingFlush(
    reason: CloudSyncRunReason,
    generation: number
  ): Promise<CloudSyncFlushResult> {
    try {
      this.clearScheduledTimer();
      while (this.activeScheduledRuns.size > 0) {
        await Promise.allSettled(Array.from(this.activeScheduledRuns));
        if (generation !== this.flushGeneration) return this.createCancelledFlushResult();
      }
      if (this.runningSyncs.size > 0) {
        await Promise.allSettled(Array.from(this.runningSyncs.values()));
        if (generation !== this.flushGeneration) return this.createCancelledFlushResult();
      }

      if (!this.hasPendingChanges()) {
        return { success: true, skipped: true, timedOut: false };
      }

      const pendingVersion = this.pendingChangeVersion;
      const storageIds = await this.resolveStorageIds();
      if (storageIds.length === 0) {
        return {
          success: false,
          skipped: false,
          timedOut: false,
          error: '没有已启用的云存储配置'
        };
      }

      const failures: string[] = [];
      for (const storageId of storageIds) {
        if (generation !== this.flushGeneration) return this.createCancelledFlushResult();
        const result = await this.syncNow(storageId, {
          ...this.autoSyncOptions,
          reason
        });
        if (generation !== this.flushGeneration) return this.createCancelledFlushResult();
        if (!result.success) {
          failures.push(`${storageId}: ${result.error || '自动同步失败'}`);
        }
      }

      if (failures.length > 0) {
        return {
          success: false,
          skipped: false,
          timedOut: false,
          error: failures.join('；')
        };
      }

      this.clearPendingChange(pendingVersion);
      return { success: true, skipped: false, timedOut: false };
    } catch (error) {
      return {
        success: false,
        skipped: false,
        timedOut: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private cancelActiveFlush(): void {
    this.flushGeneration += 1;
    this.activeFlushPromise = null;
    this.activeScheduledRuns.clear();
    for (const storageId of this.runningSyncs.keys()) {
      this.syncGenerations.set(storageId, (this.syncGenerations.get(storageId) || 0) + 1);
    }
    this.runningSyncs.clear();
  }

  private assertCurrentSyncGeneration(storageId: string, generation: number): void {
    if (this.syncGenerations.get(storageId) !== generation) {
      throw new Error('同步任务已被更新的生命周期同步取代');
    }
  }

  private createCancelledFlushResult(): CloudSyncFlushResult {
    return {
      success: false,
      skipped: false,
      timedOut: true,
      error: '生命周期同步已超时并释放，待后续恢复同步'
    };
  }

  private async runScheduledSync(
    reason: CloudSyncRunReason,
    storageId?: string,
    storageIdsOverride?: string[]
  ): Promise<void> {
    if (!this.autoSyncOptions) {
      return;
    }

    if (this.retryTimer && reason !== 'retry' && reason !== 'config-change') {
      return;
    }

    const throttleMs = this.getAutoRunThrottleMs(reason);
    if (throttleMs > 0) {
      this.scheduleSync(reason, {
        storageId,
        delayMs: throttleMs
      });
      return;
    }

    if (isBrowserOffline()) {
      this.scheduleRetry(reason, '当前网络不可用，等待恢复后重试', storageId ? [storageId] : undefined);
      return;
    }

    let storageIds: string[];
    try {
      storageIds = storageIdsOverride || await this.resolveStorageIds(storageId);
    } catch (error) {
      this.scheduleRetry(reason, error instanceof Error ? error.message : String(error), storageId ? [storageId] : undefined);
      return;
    }

    if (storageIds.length === 0) {
      this.updateStatus({
        status: 'idle',
        pending: false,
        reason,
        storageId: undefined,
        nextSyncAt: undefined,
        error: undefined
      });
      return;
    }

    const pendingVersion = this.pendingChangeVersion;
    const retryCoveredPendingVersion = reason === 'retry' ? this.retryCoveredPendingVersion : undefined;
    const failures: { storageId: string; result: CloudSyncResult }[] = [];
    let lastResult: CloudSyncResult | undefined;

    for (const targetStorageId of storageIds) {
      const result = await this.syncNow(targetStorageId, {
        ...this.autoSyncOptions,
        reason
      });
      lastResult = result;
      if (!result.success) failures.push({ storageId: targetStorageId, result });
    }

    if (failures.length > 0) {
      const retryableFailures = failures.filter(failure => canAutoRetryCloudSyncResult(failure.result));
      const deterministicFailures = failures.filter(failure => !canAutoRetryCloudSyncResult(failure.result));
      deterministicFailures.forEach(failure => this.blockedStorageFailures.set(failure.storageId, failure.result));

      if (retryableFailures.length > 0) {
        this.scheduleRetry(
          reason,
          failures.map(failure => `${failure.storageId}: ${failure.result.error || '自动同步失败'}`).join('；'),
          retryableFailures.map(failure => failure.storageId),
          retryCoveredPendingVersion ?? (!storageId && !storageIdsOverride && pendingVersion > 0 ? pendingVersion : undefined)
        );
      } else {
        this.clearRetryTimer();
        this.updateStatus({
          status: 'error',
          pending: false,
          storageId: deterministicFailures[0]?.storageId,
          reason,
          lastResult: deterministicFailures[0]?.result,
          error: deterministicFailures
            .map(failure => `${failure.storageId}: ${failure.result.error || '自动同步失败'}`)
            .join('；'),
          nextSyncAt: undefined
        });
      }
      return;
    }

    this.clearRetryTimer();
    this.failureCount = 0;
    if (!storageId && !storageIdsOverride && pendingVersion > 0) {
      this.clearPendingChange(pendingVersion);
    } else if (retryCoveredPendingVersion !== undefined) {
      this.clearPendingChange(retryCoveredPendingVersion);
    }
    if (this.blockedStorageFailures.size > 0) {
      const [blockedStorageId, blockedResult] = this.blockedStorageFailures.entries().next().value as [string, CloudSyncResult];
      this.updateStatus({
        status: 'error',
        pending: false,
        storageId: blockedStorageId,
        reason,
        lastResult: blockedResult,
        error: blockedResult.error,
        nextSyncAt: undefined
      });
      return;
    }

    this.updateStatus({
      status: 'success',
      pending: false,
      storageId: storageIds[storageIds.length - 1],
      reason,
      lastResult,
      lastSyncAt: new Date().toISOString(),
      failureCount: 0,
      error: undefined,
      nextSyncAt: undefined
    });

    if ((storageId || storageIdsOverride) && this.syncAllAfterRetry) {
      this.syncAllAfterRetry = false;
      this.scheduleSync('local-change', { delayMs: 0 });
    }
  }

  private startScheduledRun(
    reason: CloudSyncRunReason,
    storageId?: string,
    storageIdsOverride?: string[]
  ): Promise<void> {
    if (this.activeFlushPromise) {
      return this.activeFlushPromise.then(() => undefined);
    }
    const run = this.runScheduledSync(reason, storageId, storageIdsOverride);
    this.activeScheduledRuns.add(run);
    void run.then(
      () => this.activeScheduledRuns.delete(run),
      () => this.activeScheduledRuns.delete(run)
    );
    return run;
  }

  private async resolveStorageIds(storageId?: string): Promise<string[]> {
    if (storageId) {
      return [storageId];
    }

    if (this.autoSyncOptions?.storageIds?.length) {
      return this.autoSyncOptions.storageIds;
    }

    try {
      const configs = await this.getConfigClient().getStorageConfigs();
      return configs
        .filter(config => config.enabled)
        .map(config => config.id);
    } catch (error) {
      throw new Error(`获取自动同步存储配置失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private scheduleRetry(
    reason: CloudSyncRunReason,
    error: string,
    storageIds?: string[],
    coveredPendingVersion?: number
  ): void {
    if (!this.autoSyncOptions) {
      return;
    }

    const retryMs = this.getNextRetryDelayMs();
    if (retryMs <= 0) {
      this.updateStatus({
        status: 'error',
        pending: false,
        storageId: storageIds?.[0],
        reason,
        error,
        nextSyncAt: undefined
      });
      return;
    }

    const nextSyncAt = new Date(Date.now() + retryMs).toISOString();
    this.clearScheduledTimer();
    this.clearRetryTimer();
    this.failureCount += 1;
    this.retryStorageIds = storageIds;
    this.retryCoveredPendingVersion = coveredPendingVersion;
    this.updateStatus({
      status: 'error',
      pending: true,
      storageId: storageIds?.[0],
      reason,
      error,
      failureCount: this.failureCount,
      nextSyncAt
    });

    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.retryStorageIds = undefined;
      void this.startScheduledRun('retry', undefined, storageIds);
    }, retryMs);
  }

  private attachBrowserTriggers(): void {
    if (typeof window !== 'undefined') {
      const handleOnline = () => this.scheduleSync('online', { delayMs: 0 });
      const handleFocus = () => this.scheduleSync('focus', { delayMs: 0 });
      const handleBlur = () => {
        if (this.hasPendingChanges()) this.scheduleSync('blur', { delayMs: 0 });
      };
      const handlePageHide = () => {
        if (this.hasPendingChanges()) void this.flushPendingSync({ reason: 'background', timeoutMs: 1500 });
      };
      window.addEventListener('online', handleOnline);
      window.addEventListener('focus', handleFocus);
      window.addEventListener('blur', handleBlur);
      window.addEventListener('pagehide', handlePageHide);
      this.browserTriggerCleanups.push(() => window.removeEventListener('online', handleOnline));
      this.browserTriggerCleanups.push(() => window.removeEventListener('focus', handleFocus));
      this.browserTriggerCleanups.push(() => window.removeEventListener('blur', handleBlur));
      this.browserTriggerCleanups.push(() => window.removeEventListener('pagehide', handlePageHide));
    }

    if (typeof document !== 'undefined') {
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          this.scheduleSync('resume', { delayMs: 0 });
        } else if (this.hasPendingChanges()) {
          void this.flushPendingSync({ reason: 'background', timeoutMs: 1500 });
        }
      };
      document.addEventListener('visibilitychange', handleVisibilityChange);
      this.browserTriggerCleanups.push(() => document.removeEventListener('visibilitychange', handleVisibilityChange));
    }
  }

  private clearScheduledTimer(): void {
    if (this.scheduledTimer) {
      clearTimeout(this.scheduledTimer);
      this.scheduledTimer = null;
    }
  }

  private clearRetryTimer(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.retryStorageIds = undefined;
    this.retryCoveredPendingVersion = undefined;
  }

  private clearRetryTimerForStorage(storageId: string): void {
    if (!this.retryTimer) {
      return;
    }

    if (!this.retryStorageIds || (this.retryStorageIds.length === 1 && this.retryStorageIds[0] === storageId)) {
      this.clearRetryTimer();
    }
  }

  private getAutoRunThrottleMs(reason: CloudSyncRunReason): number {
    if (reason === 'config-change' || reason === 'retry' || (reason === 'online' && this.failureCount > 0)) {
      return 0;
    }

    if (reason === 'local-change' || reason === 'blur' || reason === 'background' || reason === 'shutdown') {
      return 0;
    }

    if (this.hasPendingChanges() && (reason === 'resume' || reason === 'focus' || reason === 'online')) {
      return 0;
    }

    const intervalMs = this.autoSyncOptions?.pollIntervalMs ?? DEFAULT_REMOTE_POLL_INTERVAL_MS;
    if (intervalMs <= 0) {
      return 0;
    }

    const lastAttemptTime = this.getLastAutoAttemptTime();
    if (!lastAttemptTime) {
      return 0;
    }

    return Math.max(0, lastAttemptTime + intervalMs - Date.now());
  }

  private getNextRetryDelayMs(): number {
    const baseRetryMs = this.autoSyncOptions?.retryMs ?? DEFAULT_AUTO_SYNC_RETRY_MS;
    if (baseRetryMs <= 0) {
      return 0;
    }

    const multiplier = 2 ** this.failureCount;
    return Math.min(baseRetryMs * multiplier, MAX_AUTO_SYNC_RETRY_MS);
  }

  private getLastAutoAttemptTime(): number | null {
    let rawValue: string | null | undefined;
    try {
      rawValue = this.storage?.getItem(LAST_AUTO_ATTEMPT_STORAGE_KEY);
      if (!rawValue) {
        return null;
      }
    } catch (error) {
      console.warn('读取云同步自动尝试时间失败:', error);
      return null;
    }

    const time = Date.parse(rawValue);
    return Number.isNaN(time) ? null : time;
  }

  private saveLastAutoAttemptAt(isoTime: string): void {
    try {
      this.storage?.setItem(LAST_AUTO_ATTEMPT_STORAGE_KEY, isoTime);
    } catch (error) {
      console.warn('保存云同步自动尝试时间失败:', error);
    }
  }

  private updateStatus(update: Partial<CloudSyncStatus>): void {
    this.status = {
      ...this.status,
      ...update,
      updatedAt: new Date().toISOString()
    };

    const snapshot = this.getStatus();
    this.statusListeners.forEach(listener => {
      try {
        listener(snapshot);
      } catch (error) {
        console.error('云同步状态监听器执行失败:', error);
      }
    });
  }

  private getOrCreateDeviceId(): string {
    try {
      const stored = this.storage?.getItem(DEVICE_ID_STORAGE_KEY);
      if (stored) {
        return stored;
      }
    } catch (error) {
      console.warn('读取云同步设备 ID 失败:', error);
    }

    const deviceId = this.createDeviceId();
    try {
      this.storage?.setItem(DEVICE_ID_STORAGE_KEY, deviceId);
    } catch (error) {
      console.warn('保存云同步设备 ID 失败:', error);
    }
    return deviceId;
  }

  private async getLocalState(storageId: string): Promise<CloudSyncLocalState | null> {
    const metadataKey = this.getLocalStateStorageKey(storageId);
    if (this.database.getLocalSyncMetadata) {
      try {
        const storedState = await this.database.getLocalSyncMetadata<CloudSyncLocalState>(metadataKey);
        const normalizedState = this.normalizeLocalState(storedState, storageId);
        if (normalizedState) return normalizedState;
      } catch (error) {
        console.warn('读取 IndexedDB 云同步状态失败，将尝试兼容存储:', error);
      }
    }

    try {
      const raw = this.storage?.getItem(metadataKey);
      const normalizedState = raw ? this.normalizeLocalState(JSON.parse(raw), storageId) : null;
      if (normalizedState && this.database.setLocalSyncMetadata) {
        try {
          await this.database.setLocalSyncMetadata(metadataKey, normalizedState);
          this.storage?.removeItem(metadataKey);
        } catch (error) {
          console.warn('迁移云同步状态到 IndexedDB 失败:', error);
        }
      }
      return normalizedState;
    } catch {
      return null;
    }
  }

  private normalizeLocalState(value: unknown, storageId: string): CloudSyncLocalState | null {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const state = value as Partial<CloudSyncLocalState>;
    if (
      state.storageId !== storageId ||
      typeof state.deviceId !== 'string' ||
      typeof state.lastSyncAt !== 'string'
    ) {
      return null;
    }

    if (state.baseSnapshot !== undefined) {
      const validation = validateCloudSyncSnapshot(state.baseSnapshot);
      if (!validation.valid) {
        console.warn('本地同步状态已损坏，忽略本地 baseSnapshot:', validation.reason);
        return null;
      }

      if (
        typeof state.lastKnownRevision === 'string' &&
        state.lastKnownRevision !== state.baseSnapshot.revision
      ) {
        console.warn(
          '本地同步状态 revision 不一致，忽略本地 baseSnapshot:',
          state.lastKnownRevision,
          state.baseSnapshot.revision
        );
        return null;
      }
    }

    return {
      storageId: state.storageId,
      deviceId: state.deviceId,
      lastSyncAt: state.lastSyncAt,
      lastKnownRevision: typeof state.lastKnownRevision === 'string' ? state.lastKnownRevision : undefined,
      baseSnapshot: state.baseSnapshot
    };
  }

  private async saveLocalState(
    storageId: string,
    deviceId: string,
    snapshot: CloudSyncSnapshot,
    lastSyncAt: string
  ): Promise<string | undefined> {
    const state: CloudSyncLocalState = {
      storageId,
      deviceId,
      lastSyncAt,
      lastKnownRevision: snapshot.revision,
      baseSnapshot: snapshot
    };
    const metadataKey = this.getLocalStateStorageKey(storageId);
    if (this.database.setLocalSyncMetadata) {
      try {
        await this.database.setLocalSyncMetadata(metadataKey, state);
        try { this.storage?.removeItem(metadataKey); } catch { /* compatibility cache cleanup is noncritical */ }
        return;
      } catch (error) {
        console.warn('保存 IndexedDB 云同步状态失败，将尝试完整兼容存储:', error);
      }
    }

    const serializedState = JSON.stringify(state);
    const firstError = this.trySaveLocalState(storageId, serializedState);
    if (!firstError) {
      return;
    }

    let lastError = firstError;
    if (this.clearNoncriticalSyncStorageForRetry()) {
      const retryError = this.trySaveLocalState(storageId, serializedState);
      if (!retryError) {
        return;
      }
      lastError = retryError;
    }

    const warning = `云端数据已提交，但完整本地同步基线保存失败: ${formatUnknownError(lastError)}`;
    console.warn(warning);
    return warning;
  }

  private trySaveLocalState(storageId: string, serializedState: string): unknown | null {
    try {
      this.storage?.setItem(this.getLocalStateStorageKey(storageId), serializedState);
      return null;
    } catch (error) {
      return error;
    }
  }

  private recordConflictLog(
    storageId: string,
    conflicts: CloudSyncConflict[],
    metadata: {
      detectedAt: string;
      localRevision?: string;
      remoteRevision?: string;
      resolvedRevision?: string;
    }
  ): void {
    if (!this.storage || conflicts.length === 0) {
      return;
    }

    const entry: CloudSyncConflictLogEntry = {
      id: [
        metadata.detectedAt,
        storageId,
        metadata.resolvedRevision || metadata.remoteRevision || 'unknown',
        String(conflicts.length)
      ].join(':'),
      storageId,
      detectedAt: metadata.detectedAt,
      localRevision: metadata.localRevision,
      remoteRevision: metadata.remoteRevision,
      resolvedRevision: metadata.resolvedRevision,
      conflicts: sanitizeCloudSyncConflictsForMetadata(conflicts)
    };

    const entries = [entry, ...this.getConflictLog()]
      .slice(0, MAX_CONFLICT_LOG_ENTRIES);
    try {
      this.storage.setItem(CONFLICT_LOG_STORAGE_KEY, JSON.stringify(entries));
      this.updateStatus({ conflictLogCount: entries.length });
    } catch (error) {
      console.warn('同步冲突审计记录保存失败:', error);
    }
  }

  private getLocalStateStorageKey(storageId: string): string {
    return `${LOCAL_STATE_STORAGE_PREFIX}:${storageId}`;
  }

  private clearNoncriticalSyncStorageForRetry(): boolean {
    if (!this.storage) {
      return false;
    }

    try {
      this.storage.removeItem(CONFLICT_LOG_STORAGE_KEY);
      this.updateStatus({ conflictLogCount: 0 });
      return true;
    } catch (error) {
      console.warn('清理非关键同步缓存失败:', error);
      return false;
    }
  }
}

function normalizeConflictLogEntry(value: unknown): CloudSyncConflictLogEntry | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const entry = value as Partial<CloudSyncConflictLogEntry>;
  if (
    typeof entry.id !== 'string' ||
    typeof entry.storageId !== 'string' ||
    typeof entry.detectedAt !== 'string' ||
    !Array.isArray(entry.conflicts)
  ) {
    return null;
  }

  return {
    id: entry.id,
    storageId: entry.storageId,
    detectedAt: entry.detectedAt,
    localRevision: typeof entry.localRevision === 'string' ? entry.localRevision : undefined,
    remoteRevision: typeof entry.remoteRevision === 'string' ? entry.remoteRevision : undefined,
    resolvedRevision: typeof entry.resolvedRevision === 'string' ? entry.resolvedRevision : undefined,
    conflicts: sanitizeCloudSyncConflictsForMetadata(entry.conflicts)
  };
}

function getBrowserStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | undefined {
  return typeof window !== 'undefined' ? window.localStorage : undefined;
}

function getDefaultDeviceName(): string {
  if (typeof navigator === 'undefined') {
    return 'Unknown Device';
  }
  return navigator.userAgent || 'Unknown Device';
}

function getSyncAction(appliedLocal: boolean, uploadedRemote: boolean): CloudSyncAction {
  if (appliedLocal && uploadedRemote) {
    return 'merged';
  }
  if (appliedLocal) {
    return 'downloaded';
  }
  return uploadedRemote ? 'uploaded' : 'noop';
}

function normalizeAutoSyncOptions(options: CloudSyncAutoOptions): CloudSyncAutoOptions {
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_REMOTE_POLL_INTERVAL_MS;
  return {
    ...options,
    debounceMs: options.debounceMs ?? DEFAULT_AUTO_SYNC_DEBOUNCE_MS,
    pollIntervalMs,
    retryMs: options.retryMs ?? pollIntervalMs
  };
}

export function normalizeCloudSyncIntervalMinutes(minutes: number): number {
  if (!Number.isFinite(minutes)) {
    return DEFAULT_CLOUD_SYNC_INTERVAL_MINUTES;
  }

  return Math.min(
    MAX_CLOUD_SYNC_INTERVAL_MINUTES,
    Math.max(MIN_CLOUD_SYNC_INTERVAL_MINUTES, Math.round(minutes))
  );
}

function minutesToMs(minutes: number): number {
  return normalizeCloudSyncIntervalMinutes(minutes) * 60 * 1000;
}

function formatUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : String(error || '未知错误');
}

function mergeWarnings(existing: string[] | undefined, additional?: string): string[] | undefined {
  const warnings = [...(existing || [])];
  if (additional) warnings.push(additional);
  return warnings.length > 0 ? warnings : undefined;
}

export function getCloudSyncResultMessage(action?: string, _conflictCount = 0): string {
  if (action === 'uploaded') return '同步完成，已上传本机数据';
  if (action === 'downloaded') return '同步完成，已更新本机数据';
  if (action === 'merged') return '同步完成，已合并本机和云端数据';
  return '同步完成，数据已是最新';
}

export function getCloudSyncErrorDiagnosis(
  error?: string | CloudSyncResult | CloudSyncStructuredDiagnostic,
  context: CloudSyncErrorDiagnosisContext = {}
): CloudSyncErrorDiagnosis {
  const structuredDiagnostic = extractCloudSyncStructuredDiagnostic(error);
  const rawError = normalizeCloudSyncError(
    typeof error === 'string'
      ? error
      : structuredDiagnostic?.message || ('error' in (error || {}) ? (error as CloudSyncResult).error : undefined)
  );
  let title = '同步遇到问题';
  let message = '同步失败，请稍后重试；如果反复出现，请复制错误详情反馈。';
  let canAutoRetry = false;
  let canUserFix = false;
  let suggestedActions = [
    '再次点击立即同步',
    '复制错误详情并反馈'
  ];

  if (structuredDiagnostic?.code === 'DATA_CONTRACT_INVALID') {
    title = '同步数据关系需要处理';
    message = '检测到无法安全确定的记录关系。本机数据保持不变，详情中列出了集合和记录标识。';
    canUserFix = true;
    suggestedActions = [
      '查看详情中的集合、记录标识和关联类型',
      '先导出本地安全备份，再修复对应记录',
      '修复后重新同步'
    ];
  } else if (structuredDiagnostic?.code === 'LOCAL_APPLY_QUOTA') {
    title = '本地存储空间不足';
    message = '数据库事务因存储配额不足而中止，原有数据未被部分覆盖。';
    canUserFix = true;
    suggestedActions = [
      '释放设备磁盘或应用存储空间',
      '关闭其他占用大量空间的页面后重试',
      '复制详情反馈存储配额信息'
    ];
  } else if (structuredDiagnostic?.code === 'LOCAL_APPLY_FAILED') {
    title = '本地数据库事务未能提交';
    message = '同步数据未写入，本机旧数据保持完整。详情中包含失败集合、记录键和数据库错误。';
    canUserFix = structuredDiagnostic.retryClass === 'user-action';
    suggestedActions = [
      '查看详情中的失败阶段、集合和记录键',
      '重启应用后再试一次',
      '如果错误指纹未变化，请复制详情反馈'
    ];
  } else if (isCloudSyncInstabilityError(rawError)) {
    title = '云端同步状态暂时不一致';
    message = '应用会保留本机数据并自动重试；如果持续出现，请查看详情复制诊断信息。';
    canAutoRetry = true;
    suggestedActions = [
      '等待下一次自动同步或稍后手动重试',
      '确认同一个云同步目录没有被其他工具或旧版本应用改写',
      '复制错误详情并反馈'
    ];
  } else if (isCloudSyncAuthError(rawError)) {
    title = '云存储认证失败';
    message = '存储服务拒绝了访问，请检查 WebDAV 用户名、密码或授权状态。';
    canUserFix = true;
    suggestedActions = [
      '重新输入 WebDAV 用户名和密码',
      '确认账号仍有访问同步目录的权限',
      '保存配置后重新测试连接'
    ];
  } else if (isCloudSyncNetworkError(rawError)) {
    title = '无法连接到云存储';
    message = '当前网络或云存储服务暂时不可用，应用会按同步周期自动重试。';
    canAutoRetry = true;
    canUserFix = true;
    suggestedActions = [
      '检查网络连接和 WebDAV 服务器地址',
      '确认代理、证书或服务器状态正常',
      '稍后重试同步'
    ];
  } else if (isCloudSyncPathError(rawError)) {
    title = '云端同步目录不可用';
    message = '同步目录无法读取或不存在，请检查 WebDAV/iCloud 路径配置。';
    canUserFix = true;
    suggestedActions = [
      '检查云存储目录路径是否存在',
      '确认应用拥有读取和写入权限',
      '保存配置后重新同步'
    ];
  } else if (isCloudSyncDatabaseError(rawError)) {
    title = '本地数据读写失败';
    message = '读取或写入本地数据库失败，请重启应用后重试；若仍失败请复制错误详情反馈。';
    suggestedActions = [
      '重启应用后重新同步',
      '确认本机磁盘空间充足',
      '复制错误详情并反馈'
    ];
  }

  return {
    title,
    message,
    rawError,
    canAutoRetry,
    canUserFix,
    suggestedActions,
    copyText: createCloudSyncErrorReport(rawError, context, {
      title,
      message,
      canAutoRetry,
      canUserFix,
      suggestedActions
    }, structuredDiagnostic)
  };
}

export function getFriendlyCloudSyncError(error?: string): string {
  return getCloudSyncErrorDiagnosis(error).message;
}

function normalizeCloudSyncError(error?: string): string {
  if (!error || !error.trim()) {
    return '未知错误';
  }

  return redactCloudSyncDiagnosticText(error.trim());
}

function redactCloudSyncDiagnosticText(value: string): string {
  if (containsPotentialSensitiveDiagnosticData(value)) {
    return `[敏感错误内容已隐藏；fingerprint=${createStableChecksum(value).slice(0, 16)}]`;
  }
  return value
    .replace(/data:[^\s'"<>]+/gi, '[已隐藏图片或二进制数据]')
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9+/_=.-]+/gi, '$1 [已隐藏凭据]')
    .replace(/([?&](?:api[_-]?key|token|password|secret|access[_-]?key)=)[^&#\s]+/gi, '$1[已隐藏]')
    .replace(/("(?:api[_-]?key|token|password|secret|authorization|prompt|content|generatedPrompt|systemPrompt)"\s*:\s*")[^"]*(")/gi, '$1[已隐藏]$2')
    .replace(/\b((?:api[_-]?key|token|password|secret|authorization|prompt|content|generatedPrompt|systemPrompt)\s*[=:]\s*)[^\s,;]+/gi, '$1[已隐藏]')
    .replace(/(https?:\/\/)[^/@\s]+:[^/@\s]+@/gi, '$1[已隐藏凭据]@')
    .replace(/\b[A-Za-z0-9+/]{96,}={0,2}\b/g, '[已隐藏长编码数据]');
}

function containsPotentialSensitiveDiagnosticData(value: string): boolean {
  return (
    /data:/i.test(value) ||
    /\b(?:Bearer|Basic)\s+/i.test(value) ||
    /https?:\/\/[^/@\s]+:[^/@\s]+@/i.test(value) ||
    /(?:api[_-]?key|x-api-key|access[_-]?key|password|passwd|secret|authorization|auth[_-]?token|token|prompt|content|generatedPrompt|systemPrompt)\s*(?:[=:]|\bis\b)/i.test(value) ||
    /["'](?:api[_-]?key|x-api-key|access[_-]?key|password|passwd|secret|authorization|token|prompt|content|generatedPrompt|systemPrompt)["']\s*:/i.test(value) ||
    /\b[A-Za-z0-9+/]{96,}={0,2}\b/.test(value)
  );
}

function redactCloudSyncDiagnosticIdentity(value: string | undefined): string {
  if (!value) return '未知';
  if (/^(uuid|id|configId|historyId|key|recordKey|index):/i.test(value)) {
    return redactCloudSyncDiagnosticText(value);
  }
  return `fingerprint:${createStableChecksum(value).slice(0, 16)}`;
}

function extractCloudSyncStructuredDiagnostic(
  value?: string | CloudSyncResult | CloudSyncStructuredDiagnostic
): CloudSyncStructuredDiagnostic | undefined {
  if (!value || typeof value === 'string') return undefined;
  if ('fingerprint' in value && 'retryClass' in value) {
    return value as CloudSyncStructuredDiagnostic;
  }
  return (value as CloudSyncResult).diagnostic;
}

function isCloudSyncInstabilityError(error: string): boolean {
  if (
    error.includes('云端同步文件状态持续变化') ||
    error.includes('云同步 manifest 保存后校验失败') ||
    error.includes('云同步 manifest 保存后数据校验失败') ||
    error.includes('云同步快照文件 保存后')
  ) {
    return true;
  }

  return false;
}

function isCloudSyncAuthError(error: string): boolean {
  return error.includes('401') || error.includes('Unauthorized') || error.includes('403');
}

function isCloudSyncNetworkError(error: string): boolean {
  return (
    error.includes('ECONNRESET') ||
    error.includes('ECONNREFUSED') ||
    error.includes('ENOTFOUND') ||
    error.includes('EAI_AGAIN') ||
    error.includes('ETIMEDOUT') ||
    error.includes('TLS connection') ||
    error.includes('socket disconnected') ||
    error.includes('Network') ||
    error.includes('network') ||
    error.includes('fetch failed') ||
    /\b(408|423|429|500|502|503|504|507)\b/.test(error) ||
    /temporar(?:y|ily)|临时|稍后重试/i.test(error)
  );
}

function isCloudSyncPathError(error: string): boolean {
  return (
    error.includes('404') ||
    error.includes('Not Found') ||
    error.includes('not found') ||
    error.includes('目录不存在') ||
    error.includes('路径不存在')
  );
}

function isCloudSyncDatabaseError(error: string): boolean {
  return error.includes('数据库') || error.includes('database');
}

function createCloudSyncErrorReport(
  rawError: string,
  context: CloudSyncErrorDiagnosisContext,
  diagnosis: Omit<CloudSyncErrorDiagnosis, 'rawError' | 'copyText'>,
  structuredDiagnostic?: CloudSyncStructuredDiagnostic
): string {
  const lines = [
    'AI-Gist 云同步错误诊断',
    `时间: ${context.timestamp || new Date().toISOString()}`,
    `平台: ${PlatformDetector.getPlatform()}`,
    `标题: ${diagnosis.title}`,
    `说明: ${diagnosis.message}`,
    `自动重试: ${diagnosis.canAutoRetry ? '是' : '否'}`,
    `用户可处理: ${diagnosis.canUserFix ? '是' : '否'}`
  ];

  if (context.storageId) {
    lines.push(`存储配置 ID: ${context.storageId}`);
  }

  if (context.reason) {
    lines.push(`触发原因: ${context.reason}`);
  }

  if (context.status) {
    lines.push(`同步状态: ${context.status}`);
  }

  if (typeof context.failureCount === 'number') {
    lines.push(`连续失败次数: ${context.failureCount}`);
  }

  if (typeof navigator !== 'undefined' && navigator.userAgent) {
    lines.push(`User-Agent: ${navigator.userAgent}`);
  }

  if (structuredDiagnostic) {
    lines.push(
      `操作 ID: ${structuredDiagnostic.operationId}`,
      `错误代码: ${structuredDiagnostic.code}`,
      `失败阶段: ${structuredDiagnostic.phase}`,
      `重试类型: ${structuredDiagnostic.retryClass}`,
      `错误指纹: ${structuredDiagnostic.fingerprint}`
    );
    if (structuredDiagnostic.localRevision) lines.push(`本地基线 revision: ${structuredDiagnostic.localRevision}`);
    if (structuredDiagnostic.remoteRevision) lines.push(`远端 revision: ${structuredDiagnostic.remoteRevision}`);
    if (structuredDiagnostic.targetRevision) lines.push(`目标 revision: ${structuredDiagnostic.targetRevision}`);

    for (const [index, failure] of (structuredDiagnostic.failures || []).entries()) {
      lines.push(
        `失败记录 ${index + 1}: code=${failure.code}, phase=${failure.phase}, ` +
        `collection=${failure.collection || '未知'}, recordKey=${redactCloudSyncDiagnosticIdentity(failure.recordKey)}, ` +
        `constraint=${failure.constraint || '未知'}, errorName=${failure.errorName || '未知'}`
      );
    }
    for (const [index, issue] of (structuredDiagnostic.contractIssues || []).entries()) {
      lines.push(
        `关系问题 ${index + 1}: code=${issue.code}, collection=${issue.collection}, ` +
        `record=${redactCloudSyncDiagnosticIdentity(issue.recordIdentity)}, relation=${issue.relation}`
      );
    }
  }

  lines.push(
    '',
    '建议操作:',
    ...diagnosis.suggestedActions.map(action => `- ${action}`),
    '',
    '原始错误:',
    rawError
  );

  return lines.join('\n');
}

function hasRemoteRevisionChanged(
  previousSnapshot: CloudSyncSnapshot,
  latestSnapshot?: CloudSyncSnapshot
): boolean {
  return !!latestSnapshot && latestSnapshot.revision !== previousSnapshot.revision;
}

function hasRemoteDataChanged(
  previousRemoteData: CloudSyncDataSet,
  latestSnapshot?: CloudSyncSnapshot
): boolean {
  if (!latestSnapshot) {
    return false;
  }

  return !dataSetsEqual(previousRemoteData, applyCloudSyncTombstones(latestSnapshot.data));
}

function compareRemoteSnapshotInfoDescending(
  left: CloudSyncRemoteSnapshotInfo,
  right: CloudSyncRemoteSnapshotInfo
): number {
  const timeDiff = getRemoteSnapshotInfoTime(right) - getRemoteSnapshotInfoTime(left);
  if (timeDiff !== 0) {
    return timeDiff;
  }

  return right.revision.localeCompare(left.revision);
}

function isCloudSyncSnapshotNewer(left: CloudSyncSnapshot, right: CloudSyncSnapshot): boolean {
  const leftTime = getCloudSyncSnapshotTime(left);
  const rightTime = getCloudSyncSnapshotTime(right);
  if (leftTime !== rightTime) {
    return leftTime > rightTime;
  }

  return left.revision.localeCompare(right.revision) > 0;
}

function getRemoteSnapshotInfoTime(info: CloudSyncRemoteSnapshotInfo): number {
  const modifiedAtTime = info.modifiedAt ? new Date(info.modifiedAt).getTime() : Number.NaN;
  return Number.isNaN(modifiedAtTime) ? 0 : modifiedAtTime;
}

function getCloudSyncSnapshotTime(snapshot: CloudSyncSnapshot): number {
  const createdAtTime = new Date(snapshot.createdAt).getTime();
  return Number.isNaN(createdAtTime) ? 0 : createdAtTime;
}

class CloudSyncContractError extends Error {
  readonly issues: CloudSyncContractIssue[];

  constructor(issues: CloudSyncContractIssue[]) {
    const first = issues[0];
    super(first
      ? `同步数据关系无效：${first.collection} ${first.recordIdentity} 的 ${first.relation} 无法安全解析`
      : '同步数据关系无效');
    this.name = 'CloudSyncContractError';
    this.issues = issues;
  }
}

class CloudSyncLocalApplyError extends Error {
  readonly result: ImportResult;

  constructor(result: ImportResult) {
    super(result.error || result.message || '同步合并数据写入本地失败');
    this.name = 'CloudSyncLocalApplyError';
    this.result = result;
  }
}

class CloudSyncLocalChangedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CloudSyncLocalChangedError';
  }
}

function createCloudSyncStructuredDiagnostic(
  error: unknown,
  context: Omit<CloudSyncStructuredDiagnostic, 'code' | 'retryClass' | 'message' | 'fingerprint'>
): CloudSyncStructuredDiagnostic {
  const message = error instanceof Error ? error.message : String(error);
  let code: CloudSyncErrorCode = 'UNKNOWN_SYNC_ERROR';
  let retryClass: CloudSyncRetryClass = 'deterministic';
  let failures: ImportResult['failures'];
  let contractIssues: CloudSyncContractIssue[] | undefined;

  if (error instanceof CloudSyncContractError) {
    code = 'DATA_CONTRACT_INVALID';
    contractIssues = error.issues.map(issue => ({
      ...issue,
      recordIdentity: redactCloudSyncDiagnosticIdentity(issue.recordIdentity)
    }));
  } else if (error instanceof CloudSyncLocalApplyError) {
    code = error.result.errorCode === 'QUOTA_EXCEEDED'
      ? 'LOCAL_APPLY_QUOTA'
      : 'LOCAL_APPLY_FAILED';
    retryClass = error.result.retryable ? 'transient' : 'user-action';
    failures = error.result.failures?.map(failure => ({
      phase: failure.phase,
      code: failure.code,
      collection: failure.collection,
      storeName: failure.storeName,
      recordKey: redactCloudSyncDiagnosticIdentity(failure.recordKey),
      constraint: failure.constraint,
      errorName: failure.errorName,
      message: `${failure.code} at ${failure.phase}`,
      retryable: failure.retryable
    }));
  } else if (error instanceof CloudSyncLocalChangedError) {
    code = 'SYNC_CANCELLED';
    retryClass = 'transient';
  } else if (isCloudSyncRemoteChangedError(error) || isCloudSyncRevisionConflictMessage(message)) {
    code = 'REMOTE_CHANGED';
    retryClass = 'remote-changed';
  } else if (isCloudSyncAuthError(message)) {
    code = 'REMOTE_AUTH';
    retryClass = 'user-action';
  } else if (isCloudSyncNetworkError(message)) {
    code = 'REMOTE_NETWORK';
    retryClass = 'transient';
  } else if (isCloudSyncPathError(message)) {
    code = 'REMOTE_PATH';
    retryClass = 'user-action';
  } else if (/schema version|协议版本|unsupported/i.test(message)) {
    code = 'PROTOCOL_INCOMPATIBLE';
    retryClass = 'user-action';
  } else if (isCloudSyncManifestCorruptionError(error)) {
    code = 'REMOTE_CORRUPT';
    retryClass = 'user-action';
  } else if (/生命周期同步取代|同步任务已被更新/.test(message)) {
    code = 'SYNC_CANCELLED';
    retryClass = 'transient';
  } else if (context.phase === 'export') {
    code = 'LOCAL_EXPORT_FAILED';
  }

  const fingerprint = createStableChecksum({
    code,
    phase: context.phase,
    storageId: context.storageId,
    localRevision: context.localRevision,
    remoteRevision: context.remoteRevision,
    targetRevision: context.targetRevision,
    failures: failures?.map(failure => ({
      code: failure.code,
      collection: failure.collection,
      recordKey: failure.recordKey,
      constraint: failure.constraint
    })),
    contractIssues
  });

  return {
    ...context,
    code,
    retryClass,
    message: redactCloudSyncDiagnosticText(message),
    failures,
    contractIssues,
    fingerprint
  };
}

class CloudSyncRemoteChangedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CloudSyncRemoteChangedError';
  }
}

function isCloudSyncRemoteChangedError(error: unknown): error is CloudSyncRemoteChangedError {
  return error instanceof CloudSyncRemoteChangedError ||
    (error instanceof Error && error.name === 'CloudSyncRemoteChangedError');
}

function isCloudSyncRevisionConflictMessage(message: string | undefined): boolean {
  return !!message && /manifest 已被其他设备更新|已被其他设备更新|Precondition|412|revision/i.test(message);
}

function isRecoverableCloudSyncManifestCorruption(error: unknown): boolean {
  if (isCloudSyncManifestCorruptionError(error)) {
    return true;
  }

  const message = error instanceof Error ? error.message : String(error);
  if (/401|403|Unauthorized|Forbidden|ECONN|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|TLS connection|socket disconnected|Network|network/i.test(message)) {
    return false;
  }

  return /读取云同步 manifest 失败.*内容无效|sync-manifest\.json.*checksum mismatch|sync-manifest\.backup\.json.*checksum mismatch|Unexpected token|JSON/i
    .test(message);
}

function isBrowserOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function createEmptySummary(): CloudSyncMergeSummary {
  return {
    added: 0,
    updated: 0,
    deleted: 0,
    kept: 0,
    conflicts: 0
  };
}

function dataSetsEqual(left: CloudSyncDataSet, right: CloudSyncDataSet): boolean {
  return createCloudSyncSemanticChecksum(left) === createCloudSyncSemanticChecksum(right);
}

function canAutoRetryCloudSyncResult(result: CloudSyncResult): boolean {
  const retryClass = result.diagnostic?.retryClass;
  if (retryClass) {
    return retryClass === 'transient' || retryClass === 'remote-changed';
  }
  return isCloudSyncNetworkError(result.error || '') || isCloudSyncInstabilityError(result.error || '');
}

export const cloudSyncService = CloudSyncService.getInstance();
