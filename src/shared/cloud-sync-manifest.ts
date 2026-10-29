import type {
  CloudSyncDataSet,
  CloudSyncConflict,
  CloudSyncSnapshot
} from './cloud-sync-engine';
import {
  createCloudSyncDataChecksum,
  createCloudSyncSemanticChecksum,
  normalizeCloudSyncDataSet,
  validateCloudSyncSnapshot
} from './cloud-sync-engine';

export const CLOUD_SYNC_MANIFEST_KIND = 'ai-gist-cloud-sync-manifest';
export const CLOUD_SYNC_MANIFEST_SCHEMA_VERSION = 1;
export const CLOUD_SYNC_MANIFEST_REPAIR_METADATA_KEY = '__cloudSyncManifestRepair';
const MAX_CONFLICT_METADATA_KEY_LENGTH = 512;

/**
 * 写进云端 manifest 和本机冲突审计日志的冲突记录：只留是哪条记录、为什么冲突、怎么处理的，
 * 以及两边当时的修改时间。不带两边和基线的完整记录——那会让每台设备每次同步都多下载
 * 几 KB 到几十 KB，还可能带出 API 密钥这类字段 (#489)。
 */
export interface CloudSyncConflictMetadata {
  collection: string;
  key: string;
  reason: CloudSyncConflict['reason'];
  resolution: CloudSyncConflict['resolution'];
  /** 本机版本的修改时间；本机这边已删除时没有 */
  localUpdatedAt?: string;
  /** 云端版本的修改时间；云端这边已删除时没有 */
  remoteUpdatedAt?: string;
}

export interface CloudSyncDeviceState {
  deviceId: string;
  deviceName?: string;
  platform?: string;
  lastSyncAt: string;
  lastKnownRevision?: string;
}

export interface CloudSyncManifest {
  kind: typeof CLOUD_SYNC_MANIFEST_KIND;
  schemaVersion: typeof CLOUD_SYNC_MANIFEST_SCHEMA_VERSION;
  updatedAt: string;
  latestSnapshot?: CloudSyncSnapshot;
  baseSnapshot?: CloudSyncSnapshot;
  devices: Record<string, CloudSyncDeviceState>;
  conflicts: CloudSyncConflictMetadata[];
  [CLOUD_SYNC_MANIFEST_REPAIR_METADATA_KEY]?: CloudSyncManifestRepairMetadata;
}

export interface CloudSyncManifestRepairMetadata {
  reasons: string[];
  repairedSnapshotFields: ('latestSnapshot' | 'baseSnapshot')[];
}

export interface CloudSyncManifestValidationResult {
  valid: boolean;
  reason?: string;
  manifest?: CloudSyncManifest;
}

export interface CloudSyncManifestFallbackReadOptions {
  readPrimary: () => Promise<CloudSyncManifest>;
  readBackup: () => Promise<CloudSyncManifest>;
  isNotFoundError?: (error: unknown) => boolean;
  describeError?: (error: unknown) => string;
}

export interface CloudSyncManifestSaveOptions {
  /**
   * The cloud latestSnapshot revision this save is based on.
   * - undefined: do not enforce compare-and-swap.
   * - null: save only if the cloud manifest has no latestSnapshot yet.
   * - string: save only if the cloud latestSnapshot revision still matches.
   */
  expectedRevision?: string | null;
}

export interface CloudSyncManifestSaveResult {
  success: boolean;
  error?: string;
  conflict?: boolean;
  currentRevision?: string | null;
  /** 存储层写后已经确认落盘（例如桌面 WebDAV 查过文件信息），调用方不必再整份读回校验 (#486) */
  verified?: boolean;
}

export class CloudSyncManifestCorruptError extends Error {
  readonly primaryError: unknown;
  readonly backupError: unknown;
  readonly primaryDescription: string;
  readonly backupDescription: string;

  constructor(primaryError: unknown, backupError: unknown, describeError = describeCloudSyncManifestError) {
    const primaryDescription = describeError(primaryError);
    const backupDescription = describeError(backupError);
    super(
      `云同步 manifest 已损坏且两个副本都不可用: ${primaryDescription}；` +
      `备份副本错误: ${backupDescription}`
    );
    this.name = 'CloudSyncManifestCorruptError';
    this.primaryError = primaryError;
    this.backupError = backupError;
    this.primaryDescription = primaryDescription;
    this.backupDescription = backupDescription;
  }
}

export function createEmptyCloudSyncManifest(now = new Date().toISOString()): CloudSyncManifest {
  return {
    kind: CLOUD_SYNC_MANIFEST_KIND,
    schemaVersion: CLOUD_SYNC_MANIFEST_SCHEMA_VERSION,
    updatedAt: now,
    devices: {},
    conflicts: []
  };
}

export function normalizeCloudSyncManifest(input: unknown): CloudSyncManifest {
  if (!input || typeof input !== 'object') {
    return createEmptyCloudSyncManifest();
  }

  const value = input as Partial<CloudSyncManifest>;
  return {
    kind: CLOUD_SYNC_MANIFEST_KIND,
    schemaVersion: CLOUD_SYNC_MANIFEST_SCHEMA_VERSION,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : new Date().toISOString(),
    latestSnapshot: isCloudSyncSnapshot(value.latestSnapshot) ? value.latestSnapshot : undefined,
    baseSnapshot: isCloudSyncSnapshot(value.baseSnapshot) ? value.baseSnapshot : undefined,
    devices: normalizeDeviceStates(value.devices),
    conflicts: sanitizeCloudSyncConflictsForMetadata(value.conflicts)
  };
}

export function validateCloudSyncManifest(input: unknown): CloudSyncManifestValidationResult {
  if (!input || typeof input !== 'object') {
    return {
      valid: false,
      reason: 'manifest must be an object'
    };
  }

  const value = input as Partial<CloudSyncManifest>;
  if (value.kind !== undefined && value.kind !== CLOUD_SYNC_MANIFEST_KIND) {
    return {
      valid: false,
      reason: 'manifest kind is invalid'
    };
  }

  if (value.schemaVersion !== undefined && value.schemaVersion !== CLOUD_SYNC_MANIFEST_SCHEMA_VERSION) {
    return {
      valid: false,
      reason: 'manifest schema version is unsupported'
    };
  }

  const latestSnapshotValidation = validateOptionalSnapshot('latestSnapshot', value.latestSnapshot);
  if (!latestSnapshotValidation.valid) {
    return latestSnapshotValidation;
  }

  const baseSnapshotValidation = validateOptionalSnapshot('baseSnapshot', value.baseSnapshot);
  if (!baseSnapshotValidation.valid) {
    return baseSnapshotValidation;
  }

  return {
    valid: true,
    manifest: normalizeCloudSyncManifest(input)
  };
}

export function assertValidCloudSyncManifest(input: unknown): CloudSyncManifest {
  const result = validateCloudSyncManifest(input);
  if (result.valid && result.manifest) {
    return result.manifest;
  }

  const repairedManifest = repairCloudSyncManifest(input);
  if (repairedManifest) {
    return repairedManifest;
  }

  throw new Error(result.reason || 'cloud sync manifest is invalid');
}

export async function readCloudSyncManifestWithFallback(
  options: CloudSyncManifestFallbackReadOptions
): Promise<CloudSyncManifest> {
  const isNotFoundError = options.isNotFoundError || isCloudSyncManifestNotFoundError;
  const describeError = options.describeError || describeCloudSyncManifestError;

  try {
    return await options.readPrimary();
  } catch (primaryError) {
    try {
      return await options.readBackup();
    } catch (backupError) {
      if (isNotFoundError(primaryError) && isNotFoundError(backupError)) {
        return createEmptyCloudSyncManifest();
      }

      const primaryRecoverable = isNotFoundError(primaryError) || isCloudSyncManifestCorruptionError(primaryError);
      const backupRecoverable = isNotFoundError(backupError) || isCloudSyncManifestCorruptionError(backupError);
      if (
        primaryRecoverable &&
        backupRecoverable &&
        (isCloudSyncManifestCorruptionError(primaryError) || isCloudSyncManifestCorruptionError(backupError))
      ) {
        throw new CloudSyncManifestCorruptError(primaryError, backupError, describeError);
      }

      throw new Error(
        `读取云同步 manifest 失败，且备份副本不可用: ${describeError(primaryError)}；` +
        `备份副本错误: ${describeError(backupError)}`
      );
    }
  }
}

export function updateCloudSyncManifestDevice(
  manifest: CloudSyncManifest,
  device: CloudSyncDeviceState
): CloudSyncManifest {
  return {
    ...manifest,
    updatedAt: device.lastSyncAt,
    devices: {
      ...manifest.devices,
      [device.deviceId]: device
    }
  };
}

export function getCloudSyncManifestRevision(manifest: CloudSyncManifest | null | undefined): string | null {
  return manifest?.latestSnapshot?.revision || null;
}

export function getCloudSyncManifestRepairMetadata(
  manifest: CloudSyncManifest | null | undefined
): CloudSyncManifestRepairMetadata | undefined {
  return manifest?.[CLOUD_SYNC_MANIFEST_REPAIR_METADATA_KEY];
}

export function doesCloudSyncManifestMatchExpectedRevision(
  manifest: CloudSyncManifest | null | undefined,
  expectedRevision: string | null | undefined
): boolean {
  if (expectedRevision === undefined) {
    return true;
  }

  return getCloudSyncManifestRevision(manifest) === expectedRevision;
}

export function createCloudSyncManifestRevisionConflictError(
  expectedRevision: string | null | undefined,
  currentRevision: string | null | undefined
): Error {
  const expected = expectedRevision || '空';
  const current = currentRevision || '空';
  return new Error(`云同步 manifest 已被其他设备更新：期望 revision ${expected}，当前 revision ${current}`);
}

/**
 * 把合并结果里的冲突（或旧版本写下的、带完整记录的冲突）精简成 CloudSyncConflictMetadata。
 * 旧格式里的 local / remote / base 只用来取修改时间，然后丢掉。
 */
export function sanitizeCloudSyncConflictsForMetadata(input: unknown): CloudSyncConflictMetadata[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map(conflict => sanitizeCloudSyncConflictForMetadata(conflict))
    .filter((conflict): conflict is CloudSyncConflictMetadata => !!conflict);
}

export function isCloudSyncManifestNotFoundError(error: unknown): boolean {
  const message = describeCloudSyncManifestError(error);
  return /404|not\s*found|no such file|does not exist|ENOENT|不存在|未找到/i.test(message);
}

export function isCloudSyncManifestCorruptionError(error: unknown): boolean {
  if (error instanceof CloudSyncManifestCorruptError) {
    return true;
  }

  const message = describeCloudSyncManifestError(error);
  return /manifest 内容无效|cloud sync manifest is invalid|manifest must be|snapshot data checksum mismatch|snapshot dataChecksum is invalid|Unexpected token|JSON/i
    .test(message);
}

function describeCloudSyncManifestError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function repairCloudSyncManifest(input: unknown): CloudSyncManifest | null {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const value = input as Partial<CloudSyncManifest>;
  if (value.kind !== undefined && value.kind !== CLOUD_SYNC_MANIFEST_KIND) {
    return null;
  }

  if (value.schemaVersion !== undefined && value.schemaVersion !== CLOUD_SYNC_MANIFEST_SCHEMA_VERSION) {
    return null;
  }

  const latestSnapshotRepair = repairOptionalSnapshotChecksum('latestSnapshot', value.latestSnapshot);
  if (!latestSnapshotRepair.valid) {
    return null;
  }

  const baseSnapshotRepair = repairOptionalSnapshotChecksum('baseSnapshot', value.baseSnapshot);
  if (!baseSnapshotRepair.valid) {
    return null;
  }

  const reasons = [
    ...latestSnapshotRepair.reasons,
    ...baseSnapshotRepair.reasons
  ];

  if (reasons.length === 0) {
    return null;
  }

  const manifest: CloudSyncManifest = {
    kind: CLOUD_SYNC_MANIFEST_KIND,
    schemaVersion: CLOUD_SYNC_MANIFEST_SCHEMA_VERSION,
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : new Date().toISOString(),
    latestSnapshot: latestSnapshotRepair.snapshot,
    baseSnapshot: baseSnapshotRepair.snapshot,
    devices: normalizeDeviceStates(value.devices),
    conflicts: sanitizeCloudSyncConflictsForMetadata(value.conflicts),
    [CLOUD_SYNC_MANIFEST_REPAIR_METADATA_KEY]: {
      reasons,
      repairedSnapshotFields: [
        ...latestSnapshotRepair.repairedFields,
        ...baseSnapshotRepair.repairedFields
      ]
    }
  };

  return validateCloudSyncManifest(manifest).valid ? manifest : null;
}

function repairOptionalSnapshotChecksum(
  fieldName: 'latestSnapshot' | 'baseSnapshot',
  value: unknown
): {
  valid: boolean;
  snapshot?: CloudSyncSnapshot;
  reasons: string[];
  repairedFields: ('latestSnapshot' | 'baseSnapshot')[];
} {
  if (value === undefined || value === null) {
    return { valid: true, reasons: [], repairedFields: [] };
  }

  const validation = validateCloudSyncSnapshot(value);
  if (validation.valid) {
    return {
      valid: true,
      snapshot: value as CloudSyncSnapshot,
      reasons: [],
      repairedFields: []
    };
  }

  if (
    validation.reason !== 'snapshot data checksum mismatch' &&
    validation.reason !== 'snapshot content checksum mismatch'
  ) {
    return { valid: false, reasons: [], repairedFields: [] };
  }

  const snapshot = value as Partial<CloudSyncSnapshot>;
  if (
    snapshot.schemaVersion !== 1 ||
    typeof snapshot.deviceId !== 'string' ||
    !snapshot.deviceId ||
    typeof snapshot.revision !== 'string' ||
    !snapshot.revision ||
    typeof snapshot.createdAt !== 'string' ||
    !snapshot.createdAt ||
    !snapshot.data ||
    typeof snapshot.data !== 'object' ||
    Array.isArray(snapshot.data)
  ) {
    return { valid: false, reasons: [], repairedFields: [] };
  }

  try {
    const normalizedData = normalizeCloudSyncDataSet(snapshot.data as CloudSyncDataSet);
    const repairedSnapshot: CloudSyncSnapshot = {
      schemaVersion: 1,
      deviceId: snapshot.deviceId,
      revision: snapshot.revision,
      createdAt: snapshot.createdAt,
      data: normalizedData,
      dataChecksum: createCloudSyncDataChecksum(normalizedData),
      contentChecksum: createCloudSyncSemanticChecksum(normalizedData)
    };

    if (!validateCloudSyncSnapshot(repairedSnapshot).valid) {
      return { valid: false, reasons: [], repairedFields: [] };
    }

    return {
      valid: true,
      snapshot: repairedSnapshot,
      reasons: [`${fieldName} ${validation.reason}`],
      repairedFields: [fieldName]
    };
  } catch {
    return { valid: false, reasons: [], repairedFields: [] };
  }
}

function isCloudSyncSnapshot(value: unknown): value is CloudSyncSnapshot {
  return validateCloudSyncSnapshot(value).valid;
}

function validateOptionalSnapshot(
  fieldName: 'latestSnapshot' | 'baseSnapshot',
  value: unknown
): CloudSyncManifestValidationResult {
  if (value === undefined || value === null) {
    return { valid: true };
  }

  const snapshotValidation = validateCloudSyncSnapshot(value);
  if (!snapshotValidation.valid) {
    return {
      valid: false,
      reason: `${fieldName} ${snapshotValidation.reason || 'is invalid'}`
    };
  }

  return { valid: true };
}

function normalizeDeviceStates(input: unknown): Record<string, CloudSyncDeviceState> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {};
  }

  const devices: Record<string, CloudSyncDeviceState> = {};
  for (const [key, value] of Object.entries(input)) {
    if (!value || typeof value !== 'object') {
      continue;
    }

    const device = value as Partial<CloudSyncDeviceState>;
    if (typeof device.deviceId !== 'string' || typeof device.lastSyncAt !== 'string') {
      continue;
    }

    devices[key] = {
      deviceId: device.deviceId,
      deviceName: typeof device.deviceName === 'string' ? device.deviceName : undefined,
      platform: typeof device.platform === 'string' ? device.platform : undefined,
      lastSyncAt: device.lastSyncAt,
      lastKnownRevision: typeof device.lastKnownRevision === 'string' ? device.lastKnownRevision : undefined
    };
  }

  return devices;
}

function sanitizeCloudSyncConflictForMetadata(value: unknown): CloudSyncConflictMetadata | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const conflict = value as Partial<CloudSyncConflict & CloudSyncConflictMetadata>;
  if (
    typeof conflict.collection !== 'string' ||
    typeof conflict.key !== 'string' ||
    !isCloudSyncConflictReason(conflict.reason) ||
    !isCloudSyncResolution(conflict.resolution)
  ) {
    return null;
  }

  const sanitized: CloudSyncConflictMetadata = {
    collection: conflict.collection,
    key: truncateConflictMetadataKey(conflict.key),
    reason: conflict.reason,
    resolution: conflict.resolution
  };

  // 精简后的格式直接带时间；旧格式（以及合并引擎刚产生的冲突）从两边的完整记录里取
  const localUpdatedAt = toConflictMetadataTime(conflict.localUpdatedAt) ?? getConflictRecordTime(conflict.local);
  const remoteUpdatedAt = toConflictMetadataTime(conflict.remoteUpdatedAt) ?? getConflictRecordTime(conflict.remote);
  if (localUpdatedAt) sanitized.localUpdatedAt = localUpdatedAt;
  if (remoteUpdatedAt) sanitized.remoteUpdatedAt = remoteUpdatedAt;

  return sanitized;
}

function truncateConflictMetadataKey(key: string): string {
  return key.length > MAX_CONFLICT_METADATA_KEY_LENGTH
    ? `${key.slice(0, MAX_CONFLICT_METADATA_KEY_LENGTH)}...`
    : key;
}

function getConflictRecordTime(record: unknown): string | undefined {
  if (!record || typeof record !== 'object') {
    return undefined;
  }

  const value = record as { updatedAt?: unknown; createdAt?: unknown };
  return toConflictMetadataTime(value.updatedAt) ?? toConflictMetadataTime(value.createdAt);
}

function toConflictMetadataTime(value: unknown): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number' && !(value instanceof Date)) {
    return undefined;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function isCloudSyncConflictReason(value: unknown): value is CloudSyncConflict['reason'] {
  return value === 'both_modified' ||
    value === 'create_collision' ||
    value === 'delete_vs_update';
}

function isCloudSyncResolution(value: unknown): value is CloudSyncConflict['resolution'] {
  return value === 'keep-local' ||
    value === 'take-remote' ||
    value === 'take-newer';
}
