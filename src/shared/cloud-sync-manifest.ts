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
const MAX_CONFLICT_METADATA_STRING_LENGTH = 512;
const MAX_CONFLICT_METADATA_ARRAY_ITEMS = 10;
const MAX_CONFLICT_METADATA_OBJECT_KEYS = 40;

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
  conflicts: CloudSyncConflict[];
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

export function sanitizeCloudSyncConflictsForMetadata(input: unknown): CloudSyncConflict[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map(conflict => sanitizeCloudSyncConflictForMetadata(conflict))
    .filter((conflict): conflict is CloudSyncConflict => !!conflict);
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

function sanitizeCloudSyncConflictForMetadata(value: unknown): CloudSyncConflict | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const conflict = value as Partial<CloudSyncConflict>;
  if (
    typeof conflict.collection !== 'string' ||
    typeof conflict.key !== 'string' ||
    !isCloudSyncConflictReason(conflict.reason) ||
    !isCloudSyncResolution(conflict.resolution)
  ) {
    return null;
  }

  const sanitized: CloudSyncConflict = {
    collection: conflict.collection,
    key: conflict.key,
    reason: conflict.reason,
    resolution: conflict.resolution
  };

  if (conflict.local !== undefined) {
    sanitized.local = sanitizeConflictValueForMetadata(conflict.local);
  }
  if (conflict.remote !== undefined) {
    sanitized.remote = sanitizeConflictValueForMetadata(conflict.remote);
  }
  if (conflict.base !== undefined) {
    sanitized.base = sanitizeConflictValueForMetadata(conflict.base);
  }

  return sanitized;
}

function sanitizeConflictValueForMetadata(value: unknown, seen = new WeakSet<object>(), fieldName?: string): any {
  if (fieldName === 'imageBlobs') {
    if (isOmittedImageBlobsSummary(value)) {
      return value;
    }
    return summarizeOmittedImageBlobs(value);
  }

  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    return value.length > MAX_CONFLICT_METADATA_STRING_LENGTH
      ? `${value.slice(0, MAX_CONFLICT_METADATA_STRING_LENGTH)}...`
      : value;
  }

  if (typeof value !== 'object') {
    return value;
  }

  if (typeof Blob !== 'undefined' && value instanceof Blob) {
    return {
      omitted: true,
      type: 'Blob',
      size: value.size,
      mimeType: value.type || undefined
    };
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (seen.has(value)) {
    return '[Circular]';
  }
  seen.add(value);

  if (Array.isArray(value)) {
    const items = value
      .slice(0, MAX_CONFLICT_METADATA_ARRAY_ITEMS)
      .map(item => sanitizeConflictValueForMetadata(item, seen));
    if (value.length > MAX_CONFLICT_METADATA_ARRAY_ITEMS) {
      items.push({
        omitted: true,
        type: 'array-items',
        itemCount: value.length - MAX_CONFLICT_METADATA_ARRAY_ITEMS
      });
    }
    return items;
  }

  const sanitized: Record<string, any> = {};
  const entries = Object.entries(value);
  for (const [key, item] of entries.slice(0, MAX_CONFLICT_METADATA_OBJECT_KEYS)) {
    sanitized[key] = sanitizeConflictValueForMetadata(item, seen, key);
  }
  if (entries.length > MAX_CONFLICT_METADATA_OBJECT_KEYS) {
    sanitized.__omittedKeys = entries.length - MAX_CONFLICT_METADATA_OBJECT_KEYS;
  }

  return sanitized;
}

function summarizeOmittedImageBlobs(value: unknown): Record<string, unknown> {
  return {
    omitted: true,
    type: 'imageBlobs',
    itemCount: Array.isArray(value) ? value.length : undefined
  };
}

function isOmittedImageBlobsSummary(value: unknown): value is Record<string, unknown> {
  return !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).omitted === true &&
    (value as Record<string, unknown>).type === 'imageBlobs';
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
