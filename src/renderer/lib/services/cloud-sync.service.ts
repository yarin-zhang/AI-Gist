import { PlatformDetector } from '@shared/platform';
import { createStableChecksum } from '@shared/data-checksum';
import type { ExportResult, ImportResult } from '@shared/types/data-management';
import type { CloudStorageConfig } from '@shared/types/cloud-backup';
import type {
  CloudSyncConflict,
  CloudSyncConflictPreview,
  CloudSyncConflictReason,
  CloudSyncConflictSide,
  CloudSyncDataSet,
  CloudSyncMergeOptions,
  CloudSyncMergeResult,
  CloudSyncMergeSummary,
  CloudSyncRestoredRecord,
  CloudSyncSnapshot
} from '@shared/cloud-sync-engine';
import {
  applyCloudSyncTombstones,
  createCloudSyncCategoryNameLookup,
  createCloudSyncConflictPreview,
  findCloudSyncRecordsRestoredOverLocalDeletes,
  getCloudSyncConflictId,
  createCloudSyncSemanticChecksum,
  createCloudSyncSemanticSignature,
  createCloudSyncSnapshot,
  getCloudSyncRecordKey,
  getCloudSyncRecordLabel,
  mergeCloudSyncData,
  normalizeCloudSyncDataSet,
  validateCloudSyncDataSetShape,
  validateCloudSyncSnapshot
} from '@shared/cloud-sync-engine';
import type {
  CloudSyncConflictMetadata,
  CloudSyncManifest,
  CloudSyncManifestSaveOptions,
  CloudSyncManifestSaveResult
} from '@shared/cloud-sync-manifest';
import { getPlatformDeviceName } from '../utils/device-name';
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
  describeCloudSyncCategoryMerges,
  reconcileCloudSyncDataContract,
  pruneCloudSyncTombstonedPromptChildren,
  type CloudSyncBusinessKeyMerge,
  type CloudSyncCategoryMergeNotice,
  type CloudSyncContractIssue,
  type CloudSyncRelationRepair
} from '@shared/cloud-sync-contract';
import {
  createCloudSyncJoinPreview,
  createSyncedCloudSyncJoinPreview,
  type CloudSyncJoinPreview
} from '@shared/cloud-sync-join-preview';
import { dataSetContainsCredentials, stripCredentialsFromDataSet } from '@shared/ai-config-credentials';
import { generateUUID } from '../utils/uuid';
import i18n from '../../i18n';
import { CloudBackupAPI } from '../api/cloud-backup.api';
import { DatabaseServiceManager } from './database-manager.service';
import { AppSettingsService } from './app-settings.service';
import { mobileCloudBackupService } from './mobile-cloud-backup.service';
import { webCloudBackupService } from './web-cloud-backup.service';
import { localBackupService } from './local-backup.service';
import type { DataChangeEventPayload, DataStoreName } from './data-change-events';
import { onDataChange } from './data-change-events';
import {
  CloudSyncV2Coordinator,
  type CloudSyncV2RolloutMode,
  type CloudSyncV2RolloutState
} from './cloud-sync-v2-coordinator';
import type { CloudSyncV2ObjectStorageAdapter } from '@shared/cloud-sync-v2-repository';
import { resolveQuickOptimizationBuiltinKey } from './quick-optimization-defaults';

export type { CloudSyncJoinPreview } from '@shared/cloud-sync-join-preview';

const DEVICE_ID_STORAGE_KEY = 'ai_gist_cloud_sync_device_id';
const LOCAL_STATE_STORAGE_PREFIX = 'ai_gist_cloud_sync_state';
const LAST_AUTO_ATTEMPT_STORAGE_KEY = 'ai_gist_cloud_sync_last_auto_attempt_at';
const PENDING_CHANGE_STORAGE_KEY = 'ai_gist_cloud_sync_pending_change';
const CONFLICT_LOG_STORAGE_KEY = 'ai_gist_cloud_sync_conflict_log';
const RESTORE_SUSPENSIONS_STORAGE_KEY = 'ai_gist_cloud_sync_restore_suspensions';
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
/**
 * 窗口重新获得焦点、从后台回来、恢复联网时的检查，在云端没变也不必整份下载 manifest 时的最短间隔 (#487)。
 * 做不到的存储仍按完整检查间隔节流，避免频繁整份下载
 */
const CHEAP_REMOTE_CHECK_MIN_INTERVAL_MS = 60 * 1000;
const MAX_AUTO_SYNC_RETRY_MS = 60 * 60 * 1000;
const MAX_REMOTE_RECHECK_ATTEMPTS = 5;
const REMOTE_RECHECK_RETRY_STEP_MS = 200;
const READ_AFTER_WRITE_VERIFY_ATTEMPTS = 4;
const READ_AFTER_WRITE_VERIFY_RETRY_MS = 120;
const MAX_REMOTE_SNAPSHOT_SCAN = 20;
const ENABLE_EXPERIMENTAL_CLOUD_SYNC_V2_SHADOW =
  import.meta.env.VITE_CLOUD_SYNC_V2_SHADOW === 'true';
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

export type CloudSyncAction = 'uploaded' | 'downloaded' | 'merged' | 'noop' | 'conflict-pending';
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
export type CloudSyncLifecycleStatus = 'idle' | 'scheduled' | 'syncing' | 'success' | 'error' | 'paused' | 'conflict';

/**
 * 冲突处理方式：local / remote 只作用于冲突项（不冲突的改动照常合并）；
 * smart 是自动合并（冲突项取更新的版本）；manual 按 resolutions 逐项决定。
 */
export type CloudSyncConflictStrategy = 'local' | 'remote' | 'smart' | 'manual';

export interface CloudSyncConflictDecision {
  strategy: CloudSyncConflictStrategy;
  /** manual 时每个冲突项保留哪一方，键见 getCloudSyncConflictId */
  resolutions?: Record<string, CloudSyncConflictSide>;
}

export interface CloudSyncConflictItem {
  id: string;
  collection: string;
  key: string;
  reason: CloudSyncConflictReason;
  label: string;
  localUpdatedAt?: string;
  remoteUpdatedAt?: string;
  localDeleted: boolean;
  remoteDeleted: boolean;
  /** 这一边删除这条记录的时间（来自删除标记）；没删除或没有删除标记时没有 */
  localDeletedAt?: string;
  remoteDeletedAt?: string;
  /** 本机这一边的关键内容（标题、正文开头、分类等）；已删除时没有 */
  localPreview?: CloudSyncConflictPreview;
  /** 云端这一边的关键内容；已删除时没有 */
  remotePreview?: CloudSyncConflictPreview;
}

export interface CloudSyncCollectionCounts {
  prompts: number;
  categories: number;
  aiConfigs: number;
}

/** 等待用户处理的冲突：处理之前不改本机、不上传 */
export interface CloudSyncPendingConflict {
  storageId: string;
  detectedAt: string;
  items: CloudSyncConflictItem[];
  summary: CloudSyncMergeSummary;
  localCounts: CloudSyncCollectionCounts;
  remoteCounts: CloudSyncCollectionCounts;
}

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
  /** 同名分类合并时字段不一样的那几组，同步结果提示里告诉用户保留了哪一边 (#490) */
  categoryMerges?: CloudSyncCategoryMergeNotice[];
  relationRepairs?: CloudSyncRelationRepair[];
  v2MirrorStatus?: 'skipped' | 'published' | 'already-current' | 'rebase-required' | 'failed';
  pendingConflict?: CloudSyncPendingConflict;
  /** 本机删除过、因另一台设备保留或修改得更晚而在这次同步后恢复的记录，由同步状态提示告诉用户 (#489) */
  restoredAfterLocalDelete?: CloudSyncRestoredRecord[];
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
  | 'RESTORE_DECISION_REQUIRED'
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
  /** Internal escape hatch used only after the user resolves a restore decision. */
  allowSuspended?: boolean;
  /** 用户在冲突弹窗里选定的处理方式；没有时按服务的 conflictMode 决定是否暂停 */
  conflictDecision?: CloudSyncConflictDecision;
}

export interface CloudSyncRestoreSuspension {
  storageId: string;
  restoredAt: string;
  backupId?: string;
  source: 'local-file' | 'cloud-backup';
}

export interface CloudSyncCloudClient {
  getCloudSyncManifest(storageId: string): Promise<CloudSyncManifest>;
  /**
   * 刚读过 manifest 之后调用：下一次检查这个存储时，云端没变的话能否不下载整份 manifest
   * （条件读取或 PROPFIND 比对 ETag）。没有实现按「不能」处理 (#487)
   */
  canCheckManifestCheaply?(storageId: string): boolean;
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
}

export interface CloudSyncDatabaseClient {
  exportAllDataForSync(): Promise<ExportResult>;
  /**
   * 用同步结果整库替换本机数据。同步数据不带模型配置的 API Key (#491)，实现必须保留本机已有的凭据：
   * 写入的配置没有凭据时按 uuid / configId 用本机原有的补上（DatabaseServiceManager 默认如此）。
   */
  replaceAllData(data: CloudSyncDataSet, options?: { preserveSyncMetadata?: boolean }): Promise<ImportResult>;
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
  pendingConflict?: CloudSyncPendingConflict;
  /** 设置里的「启用自动同步」开关 */
  autoSyncEnabled?: boolean;
  /** 是否有已启用的云端存储；还没查过存储列表时为 undefined */
  hasEnabledStorage?: boolean;
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
  /** 只记哪条记录、为什么冲突、怎么处理的和两边的修改时间，不带完整记录 (#489) */
  conflicts: CloudSyncConflictMetadata[];
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
  localBackupService?: Pick<typeof localBackupService, 'create'>;
  /**
   * ask：两边都改过的记录先暂停同步，等用户在冲突弹窗里选择；
   * auto：按更新时间自动合并（单测与旧行为）。应用实例使用 ask。
   */
  conflictMode?: 'auto' | 'ask';
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
  private readonly localBackupService: Pick<typeof localBackupService, 'create'>;
  private readonly conflictMode: 'auto' | 'ask';
  private readonly pendingConflicts = new Map<string, CloudSyncPendingConflict>();
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
  /**
   * 每个存储最近一次检查后，下次检查在云端没变时能否不下载整份 manifest (#487)。
   * 查过的存储全都能做到时，焦点 / 唤醒触发的检查才放宽到最短 1 分钟一次
   */
  private readonly cheapRemoteCheckStorages = new Map<string, boolean>();
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
  private restoreSuspensions = new Map<string, CloudSyncRestoreSuspension>();

  constructor(deps: CloudSyncServiceDeps = {}) {
    this.cloudClient = deps.cloudClient;
    this.configClient = deps.configClient;
    this.database = deps.database || DatabaseServiceManager.getInstance();
    this.settings = deps.settings || AppSettingsService.getInstance();
    this.storage = deps.storage || getBrowserStorage();
    this.createDeviceId = deps.createDeviceId || generateUUID;
    this.subscribeToDataChanges = deps.subscribeToDataChanges || (listener => onDataChange(SYNC_STORE_NAMES, listener));
    this.localBackupService = deps.localBackupService || localBackupService;
    this.conflictMode = deps.conflictMode || 'auto';
    this.v2Coordinator = deps.v2Coordinator || new CloudSyncV2Coordinator({
      database: this.database,
      storageFactory: storageId => this.getCloudSyncV2StorageAdapter(storageId),
      allowExperimentalShadow: ENABLE_EXPERIMENTAL_CLOUD_SYNC_V2_SHADOW
    });
    this.restorePendingChangeState();
    this.restoreRestoreSuspensions();
    this.status.conflictLogCount = this.getConflictLog().length;
  }

  static getInstance(): CloudSyncService {
    if (!CloudSyncService.instance) {
      CloudSyncService.instance = new CloudSyncService({ conflictMode: 'ask' });
    }
    return CloudSyncService.instance;
  }

  async syncNow(storageId: string, options: CloudSyncOptions = {}): Promise<CloudSyncResult> {
    if (!options.allowSuspended && this.restoreSuspensions.has(storageId)) {
      return {
        success: false,
        appliedLocal: false,
        uploadedRemote: false,
        conflicts: [],
        summary: createEmptySummary(),
        error: '恢复后的云端处理方式尚未确认；自动同步已暂停',
        errorCode: 'RESTORE_DECISION_REQUIRED'
      };
    }
    const running = this.runningSyncs.get(storageId);
    if (running) {
      this.queueAutoSyncAfterRunning(storageId, options.reason || 'manual');
      return running;
    }
    const manualPendingVersion = (options.reason || 'manual') === 'manual' && this.pendingChangeVersion > 0
      ? this.pendingChangeVersion
      : undefined;

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
        // 有冲突待处理：本机和云端都没动，本机的待同步改动继续保留
        if (result.action === 'conflict-pending') {
          if (this.runningSyncs.get(storageId) === syncPromise) {
            this.updateStatus({
              status: 'conflict',
              pending: false,
              storageId,
              reason: options.reason || 'manual',
              lastResult: result,
              pendingConflict: result.pendingConflict,
              error: undefined,
              nextSyncAt: undefined
            });
          }
          return result;
        }
        if (result.success && result.uploadedRemote && result.remoteRevision) {
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
              '后台完整性验证状态记录失败；正式同步已成功且不受影响'
            ];
          }
        }
        if (
          result.success &&
          manualPendingVersion !== undefined &&
          this.pendingChangeVersion === manualPendingVersion &&
          this.autoSyncOptions
        ) {
          try {
            const enabledStorageIds = await this.resolveStorageIds();
            if (enabledStorageIds.length === 1 && enabledStorageIds[0] === storageId) {
              this.clearPendingChange(manualPendingVersion);
              this.clearScheduledTimer();
              this.queuedAutoSyncs.delete(storageId);
            }
          } catch (error) {
            console.warn('手动同步成功后检查待处理自动同步失败:', error);
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
          ...(result.success && this.status.pendingConflict?.storageId === storageId ? { pendingConflict: undefined } : {}),
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
        } else if (
          (options.reason || 'manual') === 'manual' &&
          this.autoSyncOptions &&
          canAutoRetryCloudSyncResult(result)
        ) {
          this.scheduleRetry(
            'manual',
            result.error || '手动同步遇到暂时性错误，等待自动重试',
            [storageId],
            manualPendingVersion
          );
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

  /** 当前等待处理的冲突（没有时返回 undefined） */
  getPendingConflict(storageId?: string): CloudSyncPendingConflict | undefined {
    if (storageId) return this.pendingConflicts.get(storageId);
    return this.status.pendingConflict || this.pendingConflicts.values().next().value;
  }

  /**
   * 按用户在冲突弹窗里的选择重新同步。期间云端如果又出现新的冲突，
   * manual 策略下没选过的项会让同步再次暂停，弹窗刷新列表。
   */
  resolveConflicts(
    storageId: string,
    decision: CloudSyncConflictDecision,
    options: CloudSyncOptions = {}
  ): Promise<CloudSyncResult> {
    return this.syncNow(storageId, {
      ...(this.autoSyncOptions || {}),
      ...options,
      reason: 'manual',
      forceRetry: true,
      conflictDecision: decision
    });
  }

  private mergeWithConflictDecision(
    localData: CloudSyncDataSet,
    remoteData: CloudSyncDataSet,
    baseData: CloudSyncDataSet,
    options: CloudSyncOptions
  ): CloudSyncMergeResult<CloudSyncDataSet> {
    const mergeOptions: CloudSyncMergeOptions = { prefer: options.prefer || 'newer' };
    const preview = mergeCloudSyncData(localData, remoteData, baseData, mergeOptions);
    const decision = options.conflictDecision;
    if (!preview.hasConflicts || !decision || decision.strategy === 'smart') {
      return preview;
    }

    const resolutions: Record<string, CloudSyncConflictSide> = decision.strategy === 'manual'
      ? { ...(decision.resolutions || {}) }
      : Object.fromEntries(preview.conflicts.map(conflict => [getCloudSyncConflictId(conflict), decision.strategy as CloudSyncConflictSide]));
    return mergeCloudSyncData(localData, remoteData, baseData, { ...mergeOptions, resolutions });
  }

  private hasUnresolvedConflicts(conflicts: CloudSyncConflict[], decision?: CloudSyncConflictDecision): boolean {
    if (conflicts.length === 0) return false;
    if (!decision) return this.conflictMode === 'ask';
    if (decision.strategy !== 'manual') return false;
    const resolutions = decision.resolutions || {};
    return conflicts.some(conflict => !resolutions[getCloudSyncConflictId(conflict)]);
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
    this.updateStatus({ autoSyncEnabled: enabled });

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
    this.updateStatus({ autoSyncEnabled: enabled });
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

  getRestoreSuspensions(): CloudSyncRestoreSuspension[] {
    return [...this.restoreSuspensions.values()].sort((left, right) =>
      left.restoredAt.localeCompare(right.restoredAt)
    );
  }

  isStorageSuspendedAfterRestore(storageId: string): boolean {
    return this.restoreSuspensions.has(storageId);
  }

  async suspendEnabledStoragesAfterRestore(input: {
    backupId?: string;
    source: CloudSyncRestoreSuspension['source'];
  }): Promise<CloudSyncRestoreSuspension[]> {
    const restoredAt = new Date().toISOString();
    const storageIds = await this.resolveAllEnabledStorageIds();
    const suspensions = storageIds.map(storageId => ({
      storageId,
      restoredAt,
      backupId: input.backupId,
      source: input.source
    }));
    suspensions.forEach(suspension => this.restoreSuspensions.set(suspension.storageId, suspension));
    storageIds.forEach(storageId => {
      this.syncGenerations.set(storageId, (this.syncGenerations.get(storageId) || 0) + 1);
      this.runningSyncs.delete(storageId);
    });
    this.persistRestoreSuspensions();
    this.clearScheduledTimer();
    this.updateStatus({
      status: suspensions.length > 0 ? 'paused' : this.status.status,
      pending: false,
      error: suspensions.length > 0 ? '恢复完成，云端同步已暂停，等待选择覆盖云端或重新合并' : undefined,
      nextSyncAt: undefined
    });
    return suspensions;
  }

  clearRestoreSuspension(storageId: string): void {
    if (!this.restoreSuspensions.delete(storageId)) return;
    this.persistRestoreSuspensions();
  }

  async resumeRestoreWithMerge(storageId: string, options: CloudSyncOptions = {}): Promise<CloudSyncResult> {
    const previous = this.restoreSuspensions.get(storageId);
    this.clearRestoreSuspension(storageId);
    const result = await this.syncNow(storageId, {
      ...options,
      reason: 'manual',
      forceRetry: true,
      allowSuspended: true
    });
    if (!result.success && previous) {
      this.restoreSuspensions.set(storageId, previous);
      this.persistRestoreSuspensions();
    }
    return result;
  }

  async publishRestoredDataToCloud(
    storageId: string,
    options: Pick<CloudSyncOptions, 'deviceName' | 'platform'> = {}
  ): Promise<CloudSyncResult> {
    if (!this.restoreSuspensions.has(storageId)) {
      return {
        success: false,
        appliedLocal: false,
        uploadedRemote: false,
        conflicts: [],
        summary: createEmptySummary(),
        error: '该存储没有待处理的恢复决策',
        errorCode: 'RESTORE_DECISION_REQUIRED'
      };
    }

    const generation = (this.syncGenerations.get(storageId) || 0) + 1;
    this.syncGenerations.set(storageId, generation);
    const operationId = generateUUID();
    let phase: CloudSyncStructuredDiagnostic['phase'] = 'export';
    try {
      const deviceId = this.getOrCreateDeviceId();
      const now = new Date().toISOString();
      const localData = await this.exportLocalData();
      const localChangeVersionAtExport = this.pendingChangeVersion;
      phase = 'read-remote';
      const manifest = await this.getCloudClient().getCloudSyncManifest(storageId);
      const remoteSnapshot = manifest.latestSnapshot;
      if (remoteSnapshot) this.assertValidRemoteSnapshot(remoteSnapshot);
      const remoteData = remoteSnapshot
        ? this.getRemoteMergeData(remoteSnapshot)
        : normalizeCloudSyncDataSet({});
      let safetyBackupCreated = false;

      if (remoteSnapshot) {
        await this.localBackupService.create({
          description: `覆盖云端前的本地安全备份 - ${new Date().toLocaleString()}`,
          data: remoteSnapshot.data,
          backupType: 'manual',
          trigger: 'pre-restore-cloud-overwrite',
          deviceId
        });
        safetyBackupCreated = true;
      }

      phase = 'merge';
      const restoredWithTombstones = this.createRestoredOverwriteData(localData, remoteData, now);
      const contract = reconcileCloudSyncDataContract(restoredWithTombstones, remoteData);
      if (!contract.valid) throw new CloudSyncContractError(contract.issues);
      const snapshot = createCloudSyncSnapshot(contract.data, deviceId);

      phase = 'write-remote';
      if (this.pendingChangeVersion !== localChangeVersionAtExport) {
        throw new CloudSyncLocalChangedError('确认覆盖云端期间本机数据发生变化，请重新确认后再试');
      }
      await this.saveManifest(
        storageId,
        this.buildManifest(manifest, snapshot, [], deviceId, now, {
          ...options,
          reason: 'manual',
          prefer: 'local'
        }),
        getCloudSyncManifestRevision(manifest),
        generation
      );

      const localChangedDuringPublish = this.pendingChangeVersion !== localChangeVersionAtExport;
      if (!localChangedDuringPublish && !dataSetsEqual(localData, contract.data)) {
        phase = 'apply-local';
        await this.replaceLocalDataForSync(contract.data, localData);
      }
      const stateWarning = await this.saveLocalState(storageId, deviceId, snapshot, now);
      this.clearRestoreSuspension(storageId);
      this.clearPendingChange(localChangeVersionAtExport);
      const result: CloudSyncResult = {
        success: true,
        action: 'uploaded',
        localRevision: snapshot.revision,
        remoteRevision: snapshot.revision,
        appliedLocal: !localChangedDuringPublish && !dataSetsEqual(localData, contract.data),
        uploadedRemote: true,
        conflicts: [],
        summary: {
          added: 0,
          updated: 0,
          deleted: Math.max(
            0,
            (contract.data.syncTombstones || []).length - (localData.syncTombstones || []).length
          ),
          kept: Object.values(contract.data).reduce(
            (sum, records) => sum + (Array.isArray(records) ? records.length : 0),
            0
          ),
          conflicts: 0
        },
        warnings: mergeWarnings(
          mergeWarnings(
            safetyBackupCreated ? ['已在本机创建覆盖云端前的安全备份'] : [],
            localChangedDuringPublish ? '发布期间检测到新的本机编辑，已保留并等待下一次同步' : undefined
          ),
          stateWarning
        )
      };
      this.failureCount = 0;
      this.updateStatus({
        status: 'success',
        pending: false,
        storageId,
        reason: 'manual',
        lastSyncAt: now,
        failureCount: 0,
        lastResult: result,
        error: undefined,
        nextSyncAt: undefined
      });
      return result;
    } catch (error) {
      const diagnostic = createCloudSyncStructuredDiagnostic(error, {
        operationId,
        phase,
        storageId
      });
      return {
        success: false,
        appliedLocal: false,
        uploadedRemote: false,
        conflicts: [],
        summary: createEmptySummary(),
        error: diagnostic.message,
        errorCode: diagnostic.code,
        diagnostic
      };
    }
  }

  private createRestoredOverwriteData(
    restoredData: CloudSyncDataSet,
    remoteData: CloudSyncDataSet,
    deletedAt: string
  ): CloudSyncDataSet {
    const result = normalizeCloudSyncDataSet(restoredData);
    const tombstones = [...(result.syncTombstones || [])];
    const existing = new Set(tombstones.map(item => `${item.collectionName}:${item.recordKey}`));
    const collections = [
      'categories',
      'prompts',
      'promptVariables',
      'promptHistories',
      'aiConfigs',
      'quickOptimizationConfigs',
      'aiHistory',
      'settings'
    ];

    for (const collection of collections) {
      const restoredKeys = new Set((result[collection] || []).map(record => getCloudSyncRecordKey(collection, record)));
      for (const record of remoteData[collection] || []) {
        const recordKey = getCloudSyncRecordKey(collection, record);
        const tombstoneKey = `${collection}:${recordKey}`;
        if (restoredKeys.has(recordKey) || existing.has(tombstoneKey)) continue;
        tombstones.push({
          collectionName: collection,
          recordKey,
          recordUuid: typeof record?.uuid === 'string' ? record.uuid : undefined,
          deletedAt
        });
        existing.add(tombstoneKey);
      }
    }

    return normalizeCloudSyncDataSet({ ...result, syncTombstones: tombstones });
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

  /**
   * 重新确认有没有已启用的云端存储，结果记在状态的 hasEnabledStorage 里。
   * 状态栏和设置页据此显示「未开启同步」；存储被删除或停用后，它留下的失败、冲突、
   * 下次检查时间和上次同步结果都不再作数，一并清掉 (#425)。
   * 调用方手里已经有最新的存储列表时直接传进来，省一次读取。
   */
  async refreshStorageAvailability(configs?: CloudStorageConfig[]): Promise<boolean> {
    let list = configs;
    if (!list) {
      try {
        list = await this.getConfigClient().getStorageConfigs();
      } catch (error) {
        console.warn('读取云端存储配置失败:', error);
        return this.status.hasEnabledStorage !== false;
      }
    }

    const enabledIds = new Set(list.filter(config => config.enabled).map(config => config.id));
    const hasEnabledStorage = enabledIds.size > 0;
    const update: Partial<CloudSyncStatus> = { hasEnabledStorage };
    for (const storageId of [...this.pendingConflicts.keys()]) {
      if (!enabledIds.has(storageId)) this.pendingConflicts.delete(storageId);
    }
    for (const storageId of [...this.blockedStorageFailures.keys()]) {
      if (!enabledIds.has(storageId)) this.blockedStorageFailures.delete(storageId);
    }

    const statusStorageGone = !!this.status.storageId && !enabledIds.has(this.status.storageId);
    if (!hasEnabledStorage || statusStorageGone) {
      if (this.status.storageId) this.clearRetryTimerForStorage(this.status.storageId);
      this.failureCount = 0;
      Object.assign(update, {
        status: 'idle',
        pending: false,
        storageId: undefined,
        nextSyncAt: undefined,
        error: undefined,
        lastResult: undefined,
        pendingConflict: undefined,
        failureCount: 0
      } satisfies Partial<CloudSyncStatus>);
    }
    if (!hasEnabledStorage) {
      // 一个存储都没有：不再安排检查，也不显示上次同步时间
      this.clearScheduledTimer();
      this.clearRetryTimer();
      update.lastSyncAt = undefined;
    }
    this.updateStatus(update);
    return hasEnabledStorage;
  }

  /**
   * 存储配置（地址、账号、密码等）改过之后，之前记下的失败已经说明不了什么：
   * 清掉这个存储的确定性失败记录，状态卡片也不再停在旧的错误上，下一次同步会真正连接云端。
   */
  resetStorageFailureState(storageId: string): void {
    this.deterministicFailureGuards.delete(storageId);
    this.blockedStorageFailures.delete(storageId);
    // 配置改了，存储层的 manifest 缓存也已作废，等下一次检查重新确认
    this.cheapRemoteCheckStorages.delete(storageId);
    if (this.status.status !== 'error' || this.status.storageId !== storageId || this.runningSyncs.has(storageId)) {
      return;
    }
    this.clearRetryTimerForStorage(storageId);
    this.failureCount = 0;
    this.updateStatus({
      status: 'idle',
      pending: false,
      error: undefined,
      lastResult: undefined,
      failureCount: 0,
      nextSyncAt: undefined
    });
  }

  /** 本机是否已经和这个存储同步过（有同步基线） */
  async hasSyncedWithStorage(storageId: string): Promise<boolean> {
    return !!(await this.getLocalState(storageId));
  }

  /**
   * 第一次连上一个存储之前，看两边各有多少数据、合并后会怎样 (#490)。只读：不改本机，也不写云端。
   * 本机已经和它同步过时不用再问。云端 manifest 还没有快照时，和同步一样再看一眼旧格式的快照文件；
   * manifest 损坏时同步会从快照文件恢复，这里也按最新的快照文件算。
   */
  async previewStorageJoin(storageId: string): Promise<CloudSyncJoinPreview> {
    if (await this.hasSyncedWithStorage(storageId)) {
      return createSyncedCloudSyncJoinPreview();
    }

    const localData = await this.exportLocalData();
    let remoteSnapshot: CloudSyncSnapshot | null | undefined;
    try {
      const manifest = await this.getCloudClient().getCloudSyncManifest(storageId);
      remoteSnapshot = manifest.latestSnapshot;
      if (remoteSnapshot) this.assertValidRemoteSnapshot(remoteSnapshot);
    } catch (error) {
      if (!isRecoverableCloudSyncManifestCorruption(error)) throw error;
      remoteSnapshot = undefined;
    }
    if (!remoteSnapshot) {
      remoteSnapshot = await this.getNewestRemoteSnapshot(storageId, { required: false });
    }

    const remoteData = remoteSnapshot ? applyCloudSyncTombstones(remoteSnapshot.data) : {};
    return createCloudSyncJoinPreview(localData, remoteData);
  }

  scheduleSync(
    reason: CloudSyncRunReason = 'manual',
    options: { storageId?: string; delayMs?: number } = {}
  ): void {
    if (reason === 'config-change' && options.storageId) {
      this.resetStorageFailureState(options.storageId);
    }

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

      const remoteData = this.getRemoteMergeData(remoteSnapshot);
      const baseData = this.getBaseData(localState);
      phase = 'merge';
      const mergeResult = this.mergeWithConflictDecision(localData, remoteData, baseData, options);
      if (this.hasUnresolvedConflicts(mergeResult.conflicts, options.conflictDecision)) {
        // 发布前暂停：本机数据和云端都不改，等用户在冲突弹窗里选择处理方式
        const pendingConflict = createCloudSyncPendingConflict(storageId, mergeResult, localData, remoteData, now);
        this.pendingConflicts.set(storageId, pendingConflict);
        return {
          success: true,
          action: 'conflict-pending',
          localRevision: localState?.lastKnownRevision,
          remoteRevision: remoteSnapshot.revision,
          appliedLocal: false,
          uploadedRemote: false,
          conflicts: mergeResult.conflicts,
          summary: mergeResult.summary,
          pendingConflict
        };
      }
      this.pendingConflicts.delete(storageId);
      const mergedWithDeletesApplied = pruneCloudSyncTombstonedPromptChildren(
        applyCloudSyncTombstones(mergeResult.data),
        baseData
      );
      const contractResult = reconcileCloudSyncDataContract(mergedWithDeletesApplied, baseData, {
        resolveQuickOptimizationBuiltinKey
      });
      if (!contractResult.valid) {
        throw new CloudSyncContractError(contractResult.issues);
      }
      const mergedData = contractResult.data;
      const mergedEqualsLocal = dataSetsEqual(localData, mergedData);
      // 旧版本上传的云端快照带着明文 API Key：内容相同也要重新上传一份不含凭据的，把云端的明文覆盖掉 (#491)
      const mergedEqualsRemote = !dataSetContainsCredentials(remoteSnapshot.data) &&
        dataSetsEqual(remoteData, mergedData);
      // 本机删除过、这次合并又带回来的记录：写回本机后要告诉用户，不能悄悄恢复 (#489)
      const restoredAfterLocalDelete = mergedEqualsLocal
        ? []
        : findCloudSyncRecordsRestoredOverLocalDeletes(localData, mergedData);
      // 同名分类另有 categoryMerges 逐个说明；默认快速优化动作归并成一份是预期行为，不用提示 (#490)
      const otherBusinessKeyMerges = contractResult.merges
        .filter(merge => merge.collection !== 'categories' && merge.collection !== 'quickOptimizationConfigs');
      const categoryMerges = describeCloudSyncCategoryMerges(contractResult.merges, mergedData, localData, remoteData);
      const contractWarnings = [
        ...(otherBusinessKeyMerges.length > 0
          ? [`已自动归并 ${otherBusinessKeyMerges.length} 组业务唯一键冲突`]
          : []),
        ...(contractResult.repairs.length > 0
          ? [`已自动修复 ${contractResult.repairs.length} 条失效的可选关联；相关提示词已保留为未分类`]
          : [])
      ];

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
          businessKeyMerges: contractResult.merges,
          categoryMerges,
          relationRepairs: contractResult.repairs
        };
      }

      let finalSnapshot = remoteSnapshot;
      let latestManifestForUpload: CloudSyncManifest | null = null;
      if (!mergedEqualsRemote) {
        // 不在上传前再读一遍云端：保存时带着读到的 revision 做条件写，
        // 期间别的设备写过就会被拒绝，按冲突重试 (#486)
        latestManifestForUpload = manifest;
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
        if (latestManifestForUpload) {
          // 本机已经包含这份云端快照的全部改动，基线随之前移。上传失败或重试时，
          // 下一次合并不会把云端的改动再算一遍：使用次数不会重复累加，选过的冲突也不会再问 (#488)
          await this.saveLocalState(storageId, deviceId, remoteSnapshot, now);
          this.assertCurrentSyncGeneration(storageId, generation);
        }
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
            // 本机已经写入了恢复的记录，重试时它们不再是「本机没有」的记录，提醒要带过去
            return await this.retryAfterManifestConflict(
              storageId,
              options,
              attempt,
              finalSnapshot,
              appliedLocal,
              generation,
              appliedLocal ? restoredAfterLocalDelete : []
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
        businessKeyMerges: contractResult.merges,
        categoryMerges,
        relationRepairs: contractResult.repairs,
        ...(appliedLocal && restoredAfterLocalDelete.length > 0 ? { restoredAfterLocalDelete } : {})
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
      // 守卫按「本机数据 + 云端 revision」判断失败会不会重复；认证和路径错误取决于账号、密码和服务器上的目录，
      // 这两样都不在守卫的判断条件里，记下来只会在用户改好之后继续返回旧的失败
      if (
        localChecksum &&
        diagnostic.retryClass !== 'transient' &&
        diagnostic.retryClass !== 'remote-changed' &&
        diagnostic.code !== 'REMOTE_AUTH' &&
        diagnostic.code !== 'REMOTE_PATH'
      ) {
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

    // 模型配置的 API Key 只留在本机：数据库导出时已经去掉，这里再兜一次底，任何导出实现都不会把凭据带进快照 (#491)
    return stripCredentialsFromDataSet(normalizeCloudSyncDataSet(applyCloudSyncTombstones(exportResult.data)));
  }

  /**
   * 参与合并的云端数据。旧版本上传的快照可能带着明文 API Key，合并前去掉：
   * 凭据不参与比较，两边只差 API Key 不算修改也不算冲突，也不会被写进本机或再上传 (#491)
   */
  private getRemoteMergeData(snapshot: CloudSyncSnapshot): CloudSyncDataSet {
    return stripCredentialsFromDataSet(applyCloudSyncTombstones(snapshot.data));
  }

  private async replaceLocalDataForSync(nextData: CloudSyncDataSet, rollbackData: CloudSyncDataSet): Promise<void> {
    this.applyingRemoteDataDepth++;
    try {
      // 保留同步基线：写入本机之后上传还可能失败或因并发重试，下一次合并仍要用旧基线 (#484)
      // 合并结果里的模型配置不带 API Key：replaceAllData 默认在同一个事务里按 uuid / configId
      // 用本机原有的凭据补上（preserveLocalCredentials），不会把本机的 API Key 清空 (#491)
      const importResult = await this.database.replaceAllData(nextData, { preserveSyncMetadata: true });
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
      // 回滚用的本机导出同样不带凭据，replaceAllData 按同样的规则补回本机原有的 API Key (#491)
      const rollbackResult = await this.database.replaceAllData(rollbackData, { preserveSyncMetadata: true });
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

    await delay((attempt + 1) * REMOTE_RECHECK_RETRY_STEP_MS);
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
    generation: number,
    restoredBeforeRetry: CloudSyncRestoredRecord[] = []
  ): Promise<CloudSyncResult> {
    const retryResult = withRestoredRecords(
      await this.retryWithLatestRemote(storageId, options, attempt, generation),
      restoredBeforeRetry
    );
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
      const cloudClient = this.getCloudClient();
      const manifest = await cloudClient.getCloudSyncManifest(storageId);
      this.cheapRemoteCheckStorages.set(storageId, cloudClient.canCheckManifestCheaply?.(storageId) === true);
      this.assertCurrentSyncGeneration(storageId, generation);
      if (manifest.latestSnapshot) {
        return { manifest };
      }
      return {
        manifest: await this.repairManifestFromSnapshotFiles(storageId, manifest, deviceId, now, options, {
          required: true
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
        baseSnapshot: undefined,
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

    if (result.verified) {
      return;
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
      // 旧版本留下的基线可能带着 API Key，和本机、云端一样去掉后再比较 (#491)
      return stripCredentialsFromDataSet(applyCloudSyncTombstones(localState.baseSnapshot.data));
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
        canCheckManifestCheaply: storageId => CloudBackupAPI.canCheckSyncManifestCheaply(storageId),
        saveCloudSyncManifest: (storageId, manifest, options) =>
          CloudBackupAPI.saveCloudSyncManifest(storageId, manifest, options),
        listCloudSyncSnapshots: storageId => CloudBackupAPI.listCloudSyncSnapshots(storageId),
        readCloudSyncSnapshot: (storageId, snapshot) => CloudBackupAPI.readCloudSyncSnapshot(storageId, snapshot)
      };
    }

    if (PlatformDetector.isWeb()) {
      return {
        getCloudSyncManifest: storageId => webCloudBackupService.getCloudSyncManifest(storageId),
        canCheckManifestCheaply: storageId => webCloudBackupService.canCheckSyncManifestCheaply(storageId),
        saveCloudSyncManifest: (storageId, manifest, options) =>
          webCloudBackupService.saveCloudSyncManifest(storageId, manifest, options),
        listCloudSyncSnapshots: storageId => webCloudBackupService.listCloudSyncSnapshots(storageId),
        readCloudSyncSnapshot: (storageId, snapshot) => webCloudBackupService.readCloudSyncSnapshot(storageId, snapshot)
      };
    }

    return {
      getCloudSyncManifest: storageId => mobileCloudBackupService.getCloudSyncManifest(storageId),
      canCheckManifestCheaply: storageId => mobileCloudBackupService.canCheckSyncManifestCheaply(storageId),
      saveCloudSyncManifest: (storageId, manifest, options) =>
        mobileCloudBackupService.saveCloudSyncManifest(storageId, manifest, options),
      listCloudSyncSnapshots: storageId => mobileCloudBackupService.listCloudSyncSnapshots(storageId),
      readCloudSyncSnapshot: (storageId, snapshot) => mobileCloudBackupService.readCloudSyncSnapshot(storageId, snapshot)
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

    // 复制提示词只改使用次数：不单独上传整库，等下一次同步一起带上 (#488)
    if (change.usageOnly) {
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

    let conflictResult: { storageId: string; result: CloudSyncResult } | undefined;
    for (const targetStorageId of storageIds) {
      const result = await this.syncNow(targetStorageId, {
        ...this.autoSyncOptions,
        reason
      });
      lastResult = result;
      if (!result.success) failures.push({ storageId: targetStorageId, result });
      else if (result.action === 'conflict-pending' && !conflictResult) conflictResult = { storageId: targetStorageId, result };
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

    // 冲突待处理：继续定时检查，但本机改动不算已同步，状态保持「有冲突」
    if (conflictResult) {
      this.clearRetryTimer();
      this.updateStatus({
        status: 'conflict',
        pending: false,
        storageId: conflictResult.storageId,
        reason,
        lastResult: conflictResult.result,
        pendingConflict: conflictResult.result.pendingConflict,
        error: undefined,
        nextSyncAt: undefined
      });
      return;
    }

    this.clearRetryTimer();
    this.failureCount = 0;
    if (!storageId && !storageIdsOverride && pendingVersion > 0) {
      this.clearPendingChange(pendingVersion);
    } else if (retryCoveredPendingVersion !== undefined) {
      this.clearPendingChange(retryCoveredPendingVersion);
    } else if (pendingVersion > 0 && await this.coversAllEnabledStorages(storageIds)) {
      // 只同步了指定的存储（例如刚添加存储后的首次同步），但它就是全部已启用的存储：
      // 本地改动已经上传，不能继续显示「有本地变更等待同步」(#425)
      this.clearPendingChange(pendingVersion);
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
      pendingConflict: undefined,
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
      return this.restoreSuspensions.has(storageId) ? [] : [storageId];
    }

    if (this.autoSyncOptions?.storageIds?.length) {
      return this.autoSyncOptions.storageIds.filter(id => !this.restoreSuspensions.has(id));
    }

    try {
      const configs = await this.getConfigClient().getStorageConfigs();
      return configs
        .filter(config => config.enabled)
        .map(config => config.id)
        .filter(id => !this.restoreSuspensions.has(id));
    } catch (error) {
      throw new Error(`获取自动同步存储配置失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async coversAllEnabledStorages(syncedStorageIds: string[]): Promise<boolean> {
    try {
      const enabledStorageIds = await this.resolveAllEnabledStorageIds();
      return enabledStorageIds.length > 0 && enabledStorageIds.every(id => syncedStorageIds.includes(id));
    } catch {
      return false;
    }
  }

  private async resolveAllEnabledStorageIds(): Promise<string[]> {
    if (this.autoSyncOptions?.storageIds?.length) {
      return [...this.autoSyncOptions.storageIds];
    }
    const configs = await this.getConfigClient().getStorageConfigs();
    return configs.filter(config => config.enabled).map(config => config.id);
  }

  private restoreRestoreSuspensions(): void {
    try {
      const raw = this.storage?.getItem(RESTORE_SUSPENSIONS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      this.restoreSuspensions = new Map(
        parsed
          .filter((item): item is CloudSyncRestoreSuspension =>
            !!item && typeof item.storageId === 'string' && typeof item.restoredAt === 'string' &&
            (item.source === 'local-file' || item.source === 'cloud-backup'))
          .map(item => [item.storageId, item])
      );
    } catch {
      this.restoreSuspensions.clear();
    }
  }

  private persistRestoreSuspensions(): void {
    try {
      const values = this.getRestoreSuspensions();
      if (values.length === 0) {
        this.storage?.removeItem(RESTORE_SUSPENSIONS_STORAGE_KEY);
      } else {
        this.storage?.setItem(RESTORE_SUSPENSIONS_STORAGE_KEY, JSON.stringify(values));
      }
    } catch (error) {
      console.warn('保存恢复后的同步暂停状态失败:', error);
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

    // 云端没变时检查只要一次条件请求（几百字节），焦点 / 唤醒 / 恢复联网时不必等满整个检查间隔，
    // 另一台设备的改动切回来就能看到；做不到的存储仍按完整间隔，避免频繁整份下载 (#487)
    const throttleIntervalMs = this.canRelaxForegroundCheckThrottle(reason)
      ? Math.min(intervalMs, CHEAP_REMOTE_CHECK_MIN_INTERVAL_MS)
      : intervalMs;
    return Math.max(0, lastAttemptTime + throttleIntervalMs - Date.now());
  }

  private canRelaxForegroundCheckThrottle(reason: CloudSyncRunReason): boolean {
    if (reason !== 'focus' && reason !== 'resume' && reason !== 'online') {
      return false;
    }
    const checks = [...this.cheapRemoteCheckStorages.values()];
    return checks.length > 0 && checks.every(Boolean);
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

function toIsoTime(value: unknown): string | undefined {
  if (!value) return undefined;
  const date = new Date(value as string | number | Date);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function isPresentRecord(record: any): boolean {
  return !!record && record._deleted !== true && record.isDeleted !== true;
}

/** 这一边删除这条记录的时间：取匹配的删除标记里最晚的一个 */
function getConflictDeletedAt(data: CloudSyncDataSet, conflict: CloudSyncConflict): string | undefined {
  const uuid = [conflict.local, conflict.remote, conflict.base]
    .map(record => record?.uuid)
    .find((value): value is string => typeof value === 'string' && !!value);
  const times = (data.syncTombstones || [])
    .filter(tombstone =>
      tombstone?.collectionName === conflict.collection &&
      (tombstone.recordKey === conflict.key || (!!uuid && tombstone.recordUuid === uuid)))
    .map(tombstone => toIsoTime(tombstone.deletedAt))
    .filter((value): value is string => !!value)
    .sort();
  return times[times.length - 1];
}

/** 把重试前已写入本机的「已恢复」记录并进重试结果，同一条只保留一次 */
function withRestoredRecords(result: CloudSyncResult, restored: CloudSyncRestoredRecord[]): CloudSyncResult {
  if (!result.success || restored.length === 0) {
    return result;
  }

  const existing = result.restoredAfterLocalDelete || [];
  const seen = new Set(existing.map(record => getCloudSyncConflictId(record)));
  return {
    ...result,
    restoredAfterLocalDelete: [...existing, ...restored.filter(record => !seen.has(getCloudSyncConflictId(record)))]
  };
}

function countSyncCollections(data: CloudSyncDataSet): CloudSyncCollectionCounts {
  const count = (records?: any[]) => (records || []).filter(isPresentRecord).length;
  return {
    prompts: count(data.prompts),
    categories: count(data.categories),
    aiConfigs: count(data.aiConfigs)
  };
}

/**
 * 把合并结果里的冲突整理成弹窗要展示的轻量信息：两边各带一份截断后的预览
 * （标题、正文开头、分类等），不带图片、密钥等大字段或敏感字段
 */
export function createCloudSyncPendingConflict(
  storageId: string,
  mergeResult: Pick<CloudSyncMergeResult<CloudSyncDataSet>, 'conflicts' | 'summary'>,
  localData: CloudSyncDataSet,
  remoteData: CloudSyncDataSet,
  detectedAt: string
): CloudSyncPendingConflict {
  const localCategoryName = createCloudSyncCategoryNameLookup(localData);
  const remoteCategoryName = createCloudSyncCategoryNameLookup(remoteData);
  return {
    storageId,
    detectedAt,
    items: mergeResult.conflicts.map(conflict => {
      const localDeleted = !isPresentRecord(conflict.local);
      const remoteDeleted = !isPresentRecord(conflict.remote);
      return {
        id: getCloudSyncConflictId(conflict),
        collection: conflict.collection,
        key: conflict.key,
        reason: conflict.reason,
        label: getCloudSyncRecordLabel(conflict.local || conflict.remote || conflict.base, conflict.key),
        localUpdatedAt: toIsoTime(conflict.local?.updatedAt || conflict.local?.createdAt),
        remoteUpdatedAt: toIsoTime(conflict.remote?.updatedAt || conflict.remote?.createdAt),
        localDeleted,
        remoteDeleted,
        // 「一边删除、一边修改」时，智能合并比较的是删除时间和修改时间，弹窗里也要能看到删除时间
        localDeletedAt: localDeleted ? getConflictDeletedAt(localData, conflict) : undefined,
        remoteDeletedAt: remoteDeleted ? getConflictDeletedAt(remoteData, conflict) : undefined,
        localPreview: createCloudSyncConflictPreview(conflict.collection, conflict.local, { categoryNameOf: localCategoryName }),
        remotePreview: createCloudSyncConflictPreview(conflict.collection, conflict.remote, { categoryNameOf: remoteCategoryName })
      };
    }),
    // 冲突项只算在 items 里，summary 里的新增 / 修改 / 删除都是不冲突、会直接合并的改动 (#489)
    summary: { ...mergeResult.summary },
    localCounts: countSyncCollections(localData),
    remoteCounts: countSyncCollections(remoteData)
  };
}

function getBrowserStorage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | undefined {
  return typeof window !== 'undefined' ? window.localStorage : undefined;
}

/**
 * 调用方没给设备名时的兜底：按平台生成「Mac 上的 AI Gist」这类名字，不再写整串 User-Agent (#489)。
 * 桌面端启动自动同步时会先经主进程取主机名传进来。
 */
function getDefaultDeviceName(): string {
  return getPlatformDeviceName();
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

/**
 * 同步结果提示会直接出现在桌面端和移动端的界面上，必须跟随当前语言。
 * i18n 尚未初始化时（例如纯 Node 单测）回退到中文原文，避免抛错。
 */
function translateSyncMessage(key: string): string {
  try {
    const translated = (i18n.global.t as (key: string) => string)(key);
    return translated === key ? SYNC_MESSAGE_FALLBACKS[key] || key : translated;
  } catch {
    return SYNC_MESSAGE_FALLBACKS[key] || key;
  }
}

const SYNC_MESSAGE_FALLBACKS: Record<string, string> = {
  'dataSync.syncResult.conflictPending': '本机和云端有改动冲突，请选择处理方式',
  'dataSync.syncResult.uploaded': '同步完成，已上传本机数据',
  'dataSync.syncResult.downloaded': '同步完成，已更新本机数据',
  'dataSync.syncResult.merged': '同步完成，已合并本机和云端数据',
  'dataSync.syncResult.upToDate': '同步完成，数据已是最新'
};

export function getCloudSyncResultMessage(action?: string, _conflictCount = 0): string {
  if (action === 'conflict-pending') return translateSyncMessage('dataSync.syncResult.conflictPending');
  const key = action === 'uploaded' || action === 'downloaded' || action === 'merged'
    ? action
    : 'upToDate';
  return translateSyncMessage(`dataSync.syncResult.${key}`);
}

/**
 * 本机删除过的记录被另一台设备保留或修改得更晚、这次同步后恢复了：给用户一句说明 (#489)。
 * 一条时写出名字；多条时写第一条的名字和其余条数。没有恢复的记录时返回空字符串。
 */
export function getCloudSyncRestoredMessage(records: CloudSyncRestoredRecord[] | undefined): string {
  if (!records || records.length === 0) return '';
  const name = records[0].label;
  if (records.length === 1) {
    return translateSyncCountMessage('dataSync.syncResult.restoredOne', { name }, 1,
      `「${name}」在另一台设备上被修改，已恢复`);
  }
  // count 是名字之外的其余条数（英语、意大利语按它变单复数），total 是总条数（中文、日语写「等 N 项」）
  const count = records.length - 1;
  const total = records.length;
  return translateSyncCountMessage('dataSync.syncResult.restoredMany', { name, count, total }, count,
    `「${name}」等 ${total} 项在另一台设备上被修改，已恢复`);
}

function translateSyncCountMessage(
  key: string,
  named: Record<string, unknown>,
  plural: number,
  fallback: string
): string {
  try {
    const translated = (i18n.global.t as (key: string, named: Record<string, unknown>, plural: number) => string)(key, named, plural);
    return translated === key ? fallback : translated;
  } catch {
    return fallback;
  }
}

/** 诊断标题、说明、建议操作和可复制的报告都会直接给用户看，必须跟随界面语言 */
const tr = (key: string, named?: Record<string, unknown>) =>
  (i18n.global.t as (key: string, named?: Record<string, unknown>) => string)(key, named ?? {});

/** 每类诊断在语言包里有 title / message / step1…stepN，这里记录各有几条建议操作 */
const CLOUD_SYNC_DIAGNOSIS_STEPS = {
  generic: 2,
  dataContract: 3,
  localQuota: 3,
  localApply: 3,
  restoreDecision: 3,
  cancelled: 1,
  instability: 3,
  auth: 3,
  network: 3,
  path: 3,
  database: 3,
  transient: 3
} as const;
type CloudSyncDiagnosisKind = keyof typeof CLOUD_SYNC_DIAGNOSIS_STEPS;

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
  let kind: CloudSyncDiagnosisKind = 'generic';
  let canAutoRetry = false;
  let canUserFix = false;

  if (structuredDiagnostic?.code === 'DATA_CONTRACT_INVALID') {
    kind = 'dataContract';
    canUserFix = true;
  } else if (structuredDiagnostic?.code === 'LOCAL_APPLY_QUOTA') {
    kind = 'localQuota';
    canUserFix = true;
  } else if (structuredDiagnostic?.code === 'LOCAL_APPLY_FAILED') {
    kind = 'localApply';
    canUserFix = structuredDiagnostic.retryClass === 'user-action';
  } else if (structuredDiagnostic?.code === 'RESTORE_DECISION_REQUIRED' || rawError.includes('恢复后的云端处理方式')) {
    kind = 'restoreDecision';
    canUserFix = true;
  } else if (structuredDiagnostic?.code === 'SYNC_CANCELLED' || isCloudSyncCancelledMessage(rawError)) {
    kind = 'cancelled';
    canAutoRetry = true;
  } else if (isCloudSyncInstabilityError(rawError)) {
    kind = 'instability';
    canAutoRetry = true;
  } else if (isCloudSyncAuthError(rawError)) {
    kind = 'auth';
    canUserFix = true;
  } else if (isCloudSyncNetworkError(rawError)) {
    kind = 'network';
    canAutoRetry = true;
    canUserFix = true;
  } else if (isCloudSyncPathError(rawError)) {
    kind = 'path';
    canUserFix = true;
  } else if (isCloudSyncDatabaseError(rawError)) {
    kind = 'database';
  } else if (structuredDiagnostic?.retryClass === 'transient' || structuredDiagnostic?.retryClass === 'remote-changed') {
    // 兜底：结构化诊断已判定为可自动恢复的临时状况，但文案未命中以上任何具体分类。
    // 仍然应当以"警告并自动重试"的口吻呈现，而不是让用户误以为需要自己处理。
    kind = 'transient';
    canAutoRetry = true;
  }

  const title = tr(`dataSync.diagnosis.${kind}.title`);
  const message = tr(`dataSync.diagnosis.${kind}.message`);
  const suggestedActions = Array.from(
    { length: CLOUD_SYNC_DIAGNOSIS_STEPS[kind] },
    (_, index) => tr(`dataSync.diagnosis.${kind}.step${index + 1}`)
  );

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

export interface CloudStorageConnectionDiagnosis {
  title: string;
  message: string;
  /** 服务器原样返回的技术信息（已脱敏），放在说明下面供反馈用 */
  detail?: string;
}

/**
 * 「测试连接」失败时的提示。和同步失败共用认证 / 网络 / 路径的判断，
 * 但网络问题拆得更细：用户正在填表，要告诉他是地址拼错、端口不对还是服务器没响应。
 */
export function getCloudStorageConnectionDiagnosis(error?: string): CloudStorageConnectionDiagnosis {
  const detail = error?.trim() ? redactCloudSyncDiagnosticText(error.trim()) : undefined;
  const raw = detail || '';
  let kind = 'generic';

  if (/invalid url|ERR_INVALID_URL|only absolute urls|unsupported protocol/i.test(raw)) {
    kind = 'invalidUrl';
  } else if (/ENOTFOUND|EAI_AGAIN|getaddrinfo|UnknownHostException|could not resolve/i.test(raw)) {
    kind = 'hostNotFound';
  } else if (/ECONNREFUSED|connection refused|failed to connect/i.test(raw)) {
    kind = 'refused';
  } else if (/certificate|CERT_|self[- ]signed|EPROTO/i.test(raw) || /\b(?:SSL|TLS)\b/.test(raw)) {
    kind = 'tls';
  } else if (/ETIMEDOUT|timeout|timed out|socket hang up|ECONNRESET|socket disconnected|aborted|超时/i.test(raw)) {
    kind = 'timeout';
  } else if (/\b(?:401|403)\b|Unauthorized|Forbidden/i.test(raw)) {
    kind = 'auth';
  } else if (/\b(?:404|405|501)\b|Not Found|Method Not Allowed/i.test(raw)) {
    kind = 'path';
  } else if (/\b5\d\d\b/.test(raw)) {
    kind = 'server';
  }

  return {
    title: tr(`dataSync.connectionDiagnosis.${kind}.title`),
    message: tr(`dataSync.connectionDiagnosis.${kind}.message`),
    detail
  };
}

function normalizeCloudSyncError(error?: string): string {
  if (!error || !error.trim()) {
    return tr('dataSync.diagnosis.unknownError');
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
    /failed to connect|connection (?:refused|reset)|connectexception|sockettimeoutexception|unknownhostexception/i.test(error) ||
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

/**
 * 同一个同步存储配置上，新的同步请求会取代仍在进行中的旧请求（世代号机制），
 * 这是正常的调度行为而非真正的失败：旧请求的调用方会看到这条消息，但新请求
 * 会接手继续完成同步。展示给用户时必须和真正需要处理的错误区分开。
 */
function isCloudSyncCancelledMessage(error: string): boolean {
  return /生命周期同步取代|同步任务已被更新/.test(error);
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
  const label = (key: string, value: unknown) => `${tr(`dataSync.diagnosisReport.${key}`)}: ${value}`;
  const yesNo = (value: boolean) => tr(value ? 'dataSync.diagnosisReport.yes' : 'dataSync.diagnosisReport.no');
  const unknown = tr('dataSync.diagnosisReport.unknown');
  const lines = [
    tr('dataSync.diagnosisReport.heading'),
    label('time', context.timestamp || new Date().toISOString()),
    label('platform', PlatformDetector.getPlatform()),
    label('title', diagnosis.title),
    label('message', diagnosis.message),
    label('autoRetry', yesNo(diagnosis.canAutoRetry)),
    label('userFixable', yesNo(diagnosis.canUserFix))
  ];

  if (context.storageId) {
    lines.push(label('storageId', context.storageId));
  }

  if (context.reason) {
    lines.push(label('reason', context.reason));
  }

  if (context.status) {
    lines.push(label('status', context.status));
  }

  if (typeof context.failureCount === 'number') {
    lines.push(label('failureCount', context.failureCount));
  }

  if (typeof navigator !== 'undefined' && navigator.userAgent) {
    lines.push(`User-Agent: ${navigator.userAgent}`);
  }

  if (structuredDiagnostic) {
    lines.push(
      label('operationId', structuredDiagnostic.operationId),
      label('errorCode', structuredDiagnostic.code),
      label('phase', structuredDiagnostic.phase),
      label('retryClass', structuredDiagnostic.retryClass),
      label('fingerprint', structuredDiagnostic.fingerprint)
    );
    if (structuredDiagnostic.localRevision) lines.push(label('localRevision', structuredDiagnostic.localRevision));
    if (structuredDiagnostic.remoteRevision) lines.push(label('remoteRevision', structuredDiagnostic.remoteRevision));
    if (structuredDiagnostic.targetRevision) lines.push(label('targetRevision', structuredDiagnostic.targetRevision));

    // 字段名（code=、collection= 等）是给开发者看的标识，保持英文不翻译
    for (const [index, failure] of (structuredDiagnostic.failures || []).entries()) {
      lines.push(
        `${tr('dataSync.diagnosisReport.failureRecord', { index: index + 1 })}: code=${failure.code}, phase=${failure.phase}, ` +
        `collection=${failure.collection || unknown}, recordKey=${failure.recordKey ? redactCloudSyncDiagnosticIdentity(failure.recordKey) : unknown}, ` +
        `constraint=${failure.constraint || unknown}, errorName=${failure.errorName || unknown}`
      );
    }
    for (const [index, issue] of (structuredDiagnostic.contractIssues || []).entries()) {
      lines.push(
        `${tr('dataSync.diagnosisReport.contractIssue', { index: index + 1 })}: code=${issue.code}, collection=${issue.collection}, ` +
        `record=${issue.recordIdentity ? redactCloudSyncDiagnosticIdentity(issue.recordIdentity) : unknown}, relation=${issue.relation}`
      );
    }
  }

  lines.push(
    '',
    `${tr('dataSync.diagnosisReport.suggestedActions')}:`,
    ...diagnosis.suggestedActions.map(action => `- ${action}`),
    '',
    `${tr('dataSync.diagnosisReport.rawError')}:`,
    rawError
  );

  return lines.join('\n');
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
  } else if (
    isCloudSyncRemoteChangedError(error) ||
    isCloudSyncRevisionConflictMessage(message) ||
    isCloudSyncInstabilityError(message)
  ) {
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
  } else if (isCloudSyncCancelledMessage(message)) {
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
  if (isCloudSyncAuthError(message) || isCloudSyncNetworkError(message)) {
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
  const leftChecksum = createCloudSyncSemanticChecksum(left);
  const rightChecksum = createCloudSyncSemanticChecksum(right);
  return leftChecksum === rightChecksum &&
    createCloudSyncSemanticSignature(left) === createCloudSyncSemanticSignature(right);
}

function canAutoRetryCloudSyncResult(result: CloudSyncResult): boolean {
  const retryClass = result.diagnostic?.retryClass;
  if (retryClass) {
    return retryClass === 'transient' ||
      retryClass === 'remote-changed' ||
      isCloudSyncInstabilityError(result.error || '');
  }
  return isCloudSyncNetworkError(result.error || '') || isCloudSyncInstabilityError(result.error || '');
}

export const cloudSyncService = CloudSyncService.getInstance();
