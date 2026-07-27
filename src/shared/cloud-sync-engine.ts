/**
 * Deterministic record-level sync merge helpers.
 *
 * The engine is intentionally storage-agnostic: WebDAV, iCloud, and local
 * tests can all pass snapshots into this module and get the same decisions.
 */

import {
  createStableChecksum,
  stableSerialize
} from './data-checksum';

export type CloudSyncCollectionName =
  | 'categories'
  | 'prompts'
  | 'promptVariables'
  | 'promptHistories'
  | 'aiConfigs'
  | 'quickOptimizationConfigs'
  | 'aiHistory'
  | 'settings';

export interface CloudSyncDataSet {
  categories?: any[];
  prompts?: any[];
  promptVariables?: any[];
  promptHistories?: any[];
  aiConfigs?: any[];
  quickOptimizationConfigs?: any[];
  aiHistory?: any[];
  settings?: any[];
  syncTombstones?: CloudSyncTombstone[];
  [collection: string]: any[] | undefined;
}

export interface CloudSyncTombstone {
  id?: number;
  storeName?: string;
  collectionName: string;
  recordKey: string;
  recordUuid?: string;
  deletedAt: string | Date;
  recordSnapshot?: any;
}

export interface CloudSyncSnapshot {
  schemaVersion: 1;
  deviceId: string;
  revision: string;
  createdAt: string;
  data: CloudSyncDataSet;
  dataChecksum?: string;
  contentChecksum?: string;
}

export type CloudSyncConflictReason =
  | 'both_modified'
  | 'create_collision'
  | 'delete_vs_update';

export type CloudSyncResolution =
  | 'keep-local'
  | 'take-remote'
  | 'take-newer';

export interface CloudSyncConflict {
  collection: string;
  key: string;
  reason: CloudSyncConflictReason;
  resolution: CloudSyncResolution;
  local?: any;
  remote?: any;
  base?: any;
}

export interface CloudSyncMergeSummary {
  added: number;
  updated: number;
  deleted: number;
  kept: number;
  conflicts: number;
}

export interface CloudSyncMergeResult<TData extends CloudSyncDataSet = CloudSyncDataSet> {
  data: TData;
  conflicts: CloudSyncConflict[];
  summary: CloudSyncMergeSummary;
  hasConflicts: boolean;
}

export interface CloudSyncMergeOptions {
  prefer?: 'local' | 'remote' | 'newer';
}

interface CloudSyncRelationContext {
  categoryUuidById: Map<string, string>;
  promptUuidById: Map<string, string>;
}

interface PreservedPromptDeleteContext {
  promptUuids: Set<string>;
  promptIds: Set<string>;
}

interface PreservedCategoryDeleteContext {
  categoryUuids: Set<string>;
  categoryIds: Set<string>;
}

interface CloudSyncTombstoneMergeContext {
  tombstones: CloudSyncTombstone[];
  preservedPromptDeletes: PreservedPromptDeleteContext;
  preservedCategoryDeletes: PreservedCategoryDeleteContext;
}

export interface CloudSyncSnapshotValidationResult {
  valid: boolean;
  reason?: string;
}

const DEFAULT_COLLECTIONS: CloudSyncCollectionName[] = [
  'categories',
  'prompts',
  'promptVariables',
  'promptHistories',
  'aiConfigs',
  'quickOptimizationConfigs',
  'aiHistory',
  'settings'
];

const REQUIRED_SNAPSHOT_COLLECTIONS = [
  ...DEFAULT_COLLECTIONS,
  'syncTombstones'
];

const IDENTITY_FIELDS: Record<string, string[]> = {
  categories: ['uuid', 'id'],
  prompts: ['uuid', 'id'],
  promptVariables: ['uuid', 'id'],
  promptHistories: ['uuid', 'id'],
  aiConfigs: ['uuid', 'configId', 'id'],
  quickOptimizationConfigs: ['uuid', 'id'],
  aiHistory: ['uuid', 'historyId', 'id'],
  settings: ['key', 'id'],
  syncTombstones: ['recordKey', 'recordUuid', 'id']
};

export function createCloudSyncSnapshot(
  data: CloudSyncDataSet,
  deviceId: string,
  revision = createRevision()
): CloudSyncSnapshot {
  const snapshotData = normalizeCloudSyncDataSet(data);
  return {
    schemaVersion: 1,
    deviceId,
    revision,
    createdAt: new Date().toISOString(),
    data: snapshotData,
    dataChecksum: createCloudSyncDataChecksum(snapshotData),
    contentChecksum: createCloudSyncSemanticChecksum(snapshotData)
  };
}

export function normalizeCloudSyncDataSet<TData extends CloudSyncDataSet>(data: TData): TData {
  const normalized = normalizeSnapshotJsonValue(cloneValue(data)) as CloudSyncDataSet;

  for (const collection of REQUIRED_SNAPSHOT_COLLECTIONS) {
    const records = normalized[collection];
    if (records !== undefined && !Array.isArray(records)) {
      throw new Error(`同步快照数据表格式无效: ${collection}`);
    }

    if (records === undefined) {
      normalized[collection] = [];
    }
  }

  validateSnapshotTombstonesOrThrow(normalized.syncTombstones || []);
  const recordValidation = validateSnapshotRecords(normalized);
  if (!recordValidation.valid) {
    throw new Error(recordValidation.reason || '同步快照记录格式无效');
  }

  return normalized as TData;
}

export function createCloudSyncDataChecksum(data: CloudSyncDataSet): string {
  return createStableChecksum(data);
}

export function createCloudSyncSemanticChecksum(data: CloudSyncDataSet): string {
  return createStableChecksum(createCloudSyncSemanticComparableData(data));
}

export function createCloudSyncSemanticSignature(data: CloudSyncDataSet): string {
  return stableSerialize(createCloudSyncSemanticComparableData(data));
}

function createCloudSyncSemanticComparableData(data: CloudSyncDataSet): Record<string, any[]> {
  const normalizedData = normalizeCloudSyncDataSet(data);
  const relationContext = createRelationContext(normalizedData);
  const comparableData: Record<string, any[]> = {};

  for (const collection of getAllCollectionNames(normalizedData)) {
    comparableData[collection] = (normalizedData[collection] || [])
      .map(record => ({
        key: getCloudSyncRecordKey(collection, record),
        value: normalizeForCompare(collection, record, relationContext)
      }))
      .sort((left, right) => {
        const keyOrder = left.key.localeCompare(right.key);
        if (keyOrder !== 0) {
          return keyOrder;
        }
        return stableSerialize(left.value).localeCompare(stableSerialize(right.value));
      })
      .map(entry => entry.value);
  }

  return comparableData;
}

export function validateCloudSyncSnapshot(value: unknown): CloudSyncSnapshotValidationResult {
  if (!value || typeof value !== 'object') {
    return { valid: false, reason: 'snapshot must be an object' };
  }

  const snapshot = value as Partial<CloudSyncSnapshot>;
  if (snapshot.schemaVersion !== 1) {
    return { valid: false, reason: 'unsupported snapshot schema version' };
  }

  if (typeof snapshot.deviceId !== 'string' || !snapshot.deviceId) {
    return { valid: false, reason: 'snapshot deviceId is missing' };
  }

  if (typeof snapshot.revision !== 'string' || !snapshot.revision) {
    return { valid: false, reason: 'snapshot revision is missing' };
  }

  if (typeof snapshot.createdAt !== 'string' || !snapshot.createdAt) {
    return { valid: false, reason: 'snapshot createdAt is missing' };
  }

  if (!snapshot.data || typeof snapshot.data !== 'object' || Array.isArray(snapshot.data)) {
    return { valid: false, reason: 'snapshot data must be an object' };
  }

  const dataShapeValidation = validateCloudSyncDataSetShape(snapshot.data);
  if (!dataShapeValidation.valid) {
    return dataShapeValidation;
  }

  if (snapshot.dataChecksum !== undefined) {
    if (typeof snapshot.dataChecksum !== 'string' || !snapshot.dataChecksum) {
      return { valid: false, reason: 'snapshot dataChecksum is invalid' };
    }

    const actualChecksum = createCloudSyncDataChecksum(snapshot.data);
    if (snapshot.dataChecksum !== actualChecksum) {
      return { valid: false, reason: 'snapshot data checksum mismatch' };
    }
  }

  if (snapshot.contentChecksum !== undefined) {
    if (typeof snapshot.contentChecksum !== 'string' || !snapshot.contentChecksum) {
      return { valid: false, reason: 'snapshot contentChecksum is invalid' };
    }

    const actualContentChecksum = createCloudSyncSemanticChecksum(snapshot.data);
    if (snapshot.contentChecksum !== actualContentChecksum) {
      return { valid: false, reason: 'snapshot content checksum mismatch' };
    }
  }

  return { valid: true };
}

export function validateCloudSyncDataSetShape(data: CloudSyncDataSet): CloudSyncSnapshotValidationResult {
  for (const collection of REQUIRED_SNAPSHOT_COLLECTIONS) {
    const records = data[collection];
    if (records === undefined) {
      return { valid: false, reason: `snapshot data missing collection ${collection}` };
    }

    if (!Array.isArray(records)) {
      return { valid: false, reason: `snapshot data collection ${collection} must be an array` };
    }
  }

  const tombstoneValidation = validateSnapshotTombstones(data.syncTombstones || []);
  if (!tombstoneValidation.valid) {
    return tombstoneValidation;
  }

  const recordValidation = validateSnapshotRecords(data);
  if (!recordValidation.valid) {
    return recordValidation;
  }

  return { valid: true };
}

function validateSnapshotTombstonesOrThrow(tombstones: CloudSyncTombstone[]): void {
  const validation = validateSnapshotTombstones(tombstones);
  if (!validation.valid) {
    throw new Error(validation.reason || '同步删除标记格式无效');
  }
}

function validateSnapshotTombstones(tombstones: CloudSyncTombstone[]): CloudSyncSnapshotValidationResult {
  for (const [index, tombstone] of tombstones.entries()) {
    if (!isCloudSyncTombstone(tombstone)) {
      return { valid: false, reason: `snapshot data syncTombstones[${index}] is invalid` };
    }

    const deletedAt = tombstone.deletedAt;
    const deletedAtTime = new Date(deletedAt).getTime();
    if (
      !(typeof deletedAt === 'string' || deletedAt instanceof Date) ||
      Number.isNaN(deletedAtTime)
    ) {
      return { valid: false, reason: `snapshot data syncTombstones[${index}] deletedAt is invalid` };
    }
  }

  return { valid: true };
}

function validateSnapshotRecords(data: CloudSyncDataSet): CloudSyncSnapshotValidationResult {
  for (const collection of DEFAULT_COLLECTIONS) {
    const records = data[collection] || [];
    const seenKeys = new Set<string>();

    for (const [index, record] of records.entries()) {
      if (!record || typeof record !== 'object' || Array.isArray(record)) {
        return { valid: false, reason: `snapshot data ${collection}[${index}] must be an object` };
      }

      const blobPath = findRawBlobPath(record);
      if (blobPath) {
        return {
          valid: false,
          reason: `snapshot data ${collection}[${index}] contains unserialized Blob at ${blobPath}`
        };
      }

      const key = getCloudSyncRecordKey(collection, record);
      if (seenKeys.has(key)) {
        return { valid: false, reason: `snapshot data ${collection} has duplicate record key ${key}` };
      }
      seenKeys.add(key);
    }
  }

  return { valid: true };
}

export function mergeCloudSyncData<TData extends CloudSyncDataSet>(
  localData: TData,
  remoteData: CloudSyncDataSet,
  baseData: CloudSyncDataSet = {},
  options: CloudSyncMergeOptions = {}
): CloudSyncMergeResult<TData> {
  const resultData: CloudSyncDataSet = {};
  const conflicts: CloudSyncConflict[] = [];
  const summary: CloudSyncMergeSummary = {
    added: 0,
    updated: 0,
    deleted: 0,
    kept: 0,
    conflicts: 0
  };
  const relationContexts = {
    local: createRelationContext(localData),
    remote: createRelationContext(remoteData),
    base: createRelationContext(baseData)
  };
  const tombstoneContext = createTombstoneMergeContext(localData, remoteData, baseData);

  const collections = getAllCollectionNames(localData, remoteData, baseData);

  for (const collection of collections) {
    const merged = mergeCollection(
      collection,
      localData[collection] || [],
      remoteData[collection] || [],
      baseData[collection] || [],
      relationContexts,
      tombstoneContext,
      options
    );

    resultData[collection] = merged.records;
    conflicts.push(...merged.conflicts);
    summary.added += merged.summary.added;
    summary.updated += merged.summary.updated;
    summary.deleted += merged.summary.deleted;
    summary.kept += merged.summary.kept;
    summary.conflicts += merged.summary.conflicts;
  }

  const dataWithDeletesApplied = applyCloudSyncTombstones(resultData) as TData;

  return {
    data: dataWithDeletesApplied,
    conflicts,
    summary,
    hasConflicts: conflicts.length > 0
  };
}

export function getCloudSyncRecordKey(collection: string, record: any): string {
  if (collection === 'syncTombstones') {
    const tombstoneKey = getCloudSyncTombstoneKey(record);
    if (tombstoneKey) {
      return `tombstone:${tombstoneKey}`;
    }
  }

  const fields = IDENTITY_FIELDS[collection] || ['uuid', 'key', 'id'];

  for (const field of fields) {
    const value = record?.[field];
    if (value !== undefined && value !== null && value !== '') {
      return `${field}:${String(value)}`;
    }
  }

  return `hash:${stableSerialize(normalizeForCompare(collection, record))}`;
}

export function applyCloudSyncTombstones<TData extends CloudSyncDataSet>(data: TData): TData {
  const cloned = cloneValue(data) as CloudSyncDataSet;
  const tombstones = normalizeCloudSyncTombstones(cloned.syncTombstones || []);
  const preservedPromptDeletes = createPreservedPromptDeleteContext(cloned, tombstones);
  const preservedCategoryDeletes = createPreservedCategoryDeleteContext(cloned, tombstones);

  for (const collection of Object.keys(cloned)) {
    if (collection === 'syncTombstones') {
      continue;
    }

    const records = cloned[collection];
    if (!Array.isArray(records)) {
      continue;
    }

    cloned[collection] = records.filter(record =>
      !tombstones.some(tombstone => {
        if (shouldIgnoreCascadePromptChildTombstone(tombstone, preservedPromptDeletes)) {
          return false;
        }

        if (shouldIgnoreReferencedCategoryTombstone(tombstone, preservedCategoryDeletes)) {
          return false;
        }

        return tombstoneDeletesRecord(tombstone, collection, record);
      })
    );
  }

  cloned.syncTombstones = tombstones;
  return cloned as TData;
}

function mergeCollection(
  collection: string,
  localRecords: any[],
  remoteRecords: any[],
  baseRecords: any[],
  relationContexts: {
    local: CloudSyncRelationContext;
    remote: CloudSyncRelationContext;
    base: CloudSyncRelationContext;
  },
  tombstoneContext: CloudSyncTombstoneMergeContext,
  options: CloudSyncMergeOptions
): {
  records: any[];
  conflicts: CloudSyncConflict[];
  summary: CloudSyncMergeSummary;
} {
  const local = indexBySyncKey(collection, localRecords);
  const remote = indexBySyncKey(collection, remoteRecords);
  const base = indexBySyncKey(collection, baseRecords);
  const keys = new Set([...local.keys(), ...remote.keys(), ...base.keys()]);
  const records: any[] = [];
  const conflicts: CloudSyncConflict[] = [];
  const summary: CloudSyncMergeSummary = {
    added: 0,
    updated: 0,
    deleted: 0,
    kept: 0,
    conflicts: 0
  };

  for (const key of keys) {
    const localRecord = local.get(key);
    const remoteRecord = remote.get(key);
    const baseRecord = base.get(key);

    if (!baseRecord) {
      mergeWithoutBase(collection, key, localRecord, remoteRecord, records, conflicts, summary, relationContexts, options);
      continue;
    }

    mergeWithBase(
      collection,
      key,
      localRecord,
      remoteRecord,
      baseRecord,
      records,
      conflicts,
      summary,
      relationContexts,
      tombstoneContext,
      options
    );
  }

  return { records, conflicts, summary };
}

function mergeWithoutBase(
  collection: string,
  key: string,
  localRecord: any | undefined,
  remoteRecord: any | undefined,
  records: any[],
  conflicts: CloudSyncConflict[],
  summary: CloudSyncMergeSummary,
  relationContexts: {
    local: CloudSyncRelationContext;
    remote: CloudSyncRelationContext;
  },
  options: CloudSyncMergeOptions
): void {
  const localExists = isPresent(localRecord);
  const remoteExists = isPresent(remoteRecord);

  if (localExists && remoteExists) {
    if (recordsEqual(collection, localRecord, remoteRecord, relationContexts.local, relationContexts.remote)) {
      records.push(cloneValue(localRecord));
      summary.kept++;
      return;
    }

    const chosen = chooseRecord(localRecord, remoteRecord, options);
    records.push(cloneValue(chosen.record));
    addConflict(conflicts, summary, {
      collection,
      key,
      reason: 'create_collision',
      resolution: chosen.resolution,
      local: localRecord,
      remote: remoteRecord
    });
    if (chosen.record === remoteRecord) {
      summary.updated++;
    } else {
      summary.kept++;
    }
    return;
  }

  if (remoteExists) {
    records.push(cloneValue(remoteRecord));
    summary.added++;
    return;
  }

  if (localExists) {
    records.push(cloneValue(localRecord));
    summary.kept++;
  }
}

function mergeWithBase(
  collection: string,
  key: string,
  localRecord: any | undefined,
  remoteRecord: any | undefined,
  baseRecord: any,
  records: any[],
  conflicts: CloudSyncConflict[],
  summary: CloudSyncMergeSummary,
  relationContexts: {
    local: CloudSyncRelationContext;
    remote: CloudSyncRelationContext;
    base: CloudSyncRelationContext;
  },
  tombstoneContext: CloudSyncTombstoneMergeContext,
  options: CloudSyncMergeOptions
): void {
  const localExists = isPresent(localRecord);
  const remoteExists = isPresent(remoteRecord);

  if (!localExists && !remoteExists) {
    summary.deleted++;
    return;
  }

  if (!localExists) {
    if (hasIgnoredCascadePromptChildTombstone(tombstoneContext, collection, remoteRecord)) {
      records.push(cloneValue(remoteRecord));
      summary.updated++;
      return;
    }

    if (hasIgnoredReferencedCategoryTombstone(tombstoneContext, collection, remoteRecord)) {
      records.push(cloneValue(remoteRecord));
      summary.updated++;
      return;
    }

    const remoteChanged = !recordsEqual(collection, remoteRecord, baseRecord, relationContexts.remote, relationContexts.base);
    if (!remoteChanged) {
      summary.deleted++;
      return;
    }

    records.push(cloneValue(remoteRecord));
    addConflict(conflicts, summary, {
      collection,
      key,
      reason: 'delete_vs_update',
      resolution: 'take-remote',
      local: localRecord,
      remote: remoteRecord,
      base: baseRecord
    });
    summary.updated++;
    return;
  }

  if (!remoteExists) {
    if (hasIgnoredCascadePromptChildTombstone(tombstoneContext, collection, localRecord)) {
      records.push(cloneValue(localRecord));
      summary.kept++;
      return;
    }

    if (hasIgnoredReferencedCategoryTombstone(tombstoneContext, collection, localRecord)) {
      records.push(cloneValue(localRecord));
      summary.kept++;
      return;
    }

    const localChanged = !recordsEqual(collection, localRecord, baseRecord, relationContexts.local, relationContexts.base);
    if (!localChanged) {
      summary.deleted++;
      return;
    }

    records.push(cloneValue(localRecord));
    addConflict(conflicts, summary, {
      collection,
      key,
      reason: 'delete_vs_update',
      resolution: 'keep-local',
      local: localRecord,
      remote: remoteRecord,
      base: baseRecord
    });
    summary.kept++;
    return;
  }

  if (recordsEqual(collection, localRecord, remoteRecord, relationContexts.local, relationContexts.remote)) {
    records.push(cloneValue(localRecord));
    summary.kept++;
    return;
  }

  const localChanged = !recordsEqual(collection, localRecord, baseRecord, relationContexts.local, relationContexts.base);
  const remoteChanged = !recordsEqual(collection, remoteRecord, baseRecord, relationContexts.remote, relationContexts.base);

  if (!localChanged && remoteChanged) {
    records.push(cloneValue(remoteRecord));
    summary.updated++;
    return;
  }

  if (localChanged && !remoteChanged) {
    records.push(cloneValue(localRecord));
    summary.kept++;
    return;
  }

  const mergedRecord = mergeChangedRecordFields(
    collection,
    localRecord,
    remoteRecord,
    baseRecord,
    relationContexts,
    options
  );
  records.push(cloneValue(mergedRecord.record));

  if (mergedRecord.hasFieldConflict) {
    addConflict(conflicts, summary, {
      collection,
      key,
      reason: 'both_modified',
      resolution: mergedRecord.resolution,
      local: localRecord,
      remote: remoteRecord,
      base: baseRecord
    });
  }

  if (!recordsEqual(collection, mergedRecord.record, localRecord, relationContexts.local, relationContexts.local)) {
    summary.updated++;
  } else {
    summary.kept++;
  }
}

function indexBySyncKey(collection: string, records: any[]): Map<string, any> {
  const indexed = new Map<string, any>();
  for (const record of records) {
    const key = getCloudSyncRecordKey(collection, record);
    if (indexed.has(key)) {
      throw new Error(`同步数据包含重复记录: ${collection} ${key}`);
    }
    indexed.set(key, record);
  }
  return indexed;
}

function addConflict(
  conflicts: CloudSyncConflict[],
  summary: CloudSyncMergeSummary,
  conflict: CloudSyncConflict
): void {
  conflicts.push({
    ...conflict,
    local: conflict.local === undefined ? undefined : cloneValue(conflict.local),
    remote: conflict.remote === undefined ? undefined : cloneValue(conflict.remote),
    base: conflict.base === undefined ? undefined : cloneValue(conflict.base)
  });
  summary.conflicts++;
}

function chooseRecord(
  localRecord: any,
  remoteRecord: any,
  options: CloudSyncMergeOptions
): { record: any; resolution: CloudSyncResolution } {
  if (options.prefer === 'local') {
    return { record: localRecord, resolution: 'keep-local' };
  }

  if (options.prefer === 'remote') {
    return { record: remoteRecord, resolution: 'take-remote' };
  }

  const localTime = getRecordTime(localRecord);
  const remoteTime = getRecordTime(remoteRecord);
  if (remoteTime > localTime) {
    return { record: remoteRecord, resolution: 'take-newer' };
  }

  return { record: localRecord, resolution: options.prefer === 'newer' ? 'take-newer' : 'keep-local' };
}

function mergeChangedRecordFields(
  collection: string,
  localRecord: any,
  remoteRecord: any,
  baseRecord: any,
  relationContexts: {
    local: CloudSyncRelationContext;
    remote: CloudSyncRelationContext;
    base: CloudSyncRelationContext;
  },
  options: CloudSyncMergeOptions
): { record: any; hasFieldConflict: boolean; resolution: CloudSyncResolution } {
  const chosen = chooseRecord(localRecord, remoteRecord, options);
  const merged: Record<string, any> = {};
  let hasFieldConflict = false;
  const keys = new Set([
    ...Object.keys(baseRecord || {}),
    ...Object.keys(localRecord || {}),
    ...Object.keys(remoteRecord || {})
  ]);

  for (const field of keys) {
    const baseValue = baseRecord?.[field];
    const localValue = localRecord?.[field];
    const remoteValue = remoteRecord?.[field];

    if (fieldValuesEqual(collection, field, localValue, remoteValue, relationContexts.local, relationContexts.remote)) {
      merged[field] = cloneValue(localValue);
      continue;
    }

    if (isLocalIdentityField(field)) {
      merged[field] = cloneValue(localValue !== undefined ? localValue : remoteValue);
      continue;
    }

    if (isMergeTimestampField(field)) {
      merged[field] = cloneValue(chooseNewestTimestampValue(localValue, remoteValue, baseValue));
      continue;
    }

    const mergedSpecialValue = mergeSpecialFieldValue(field, localValue, remoteValue);
    if (mergedSpecialValue.merged) {
      merged[field] = mergedSpecialValue.value;
      continue;
    }

    const localChanged = !fieldValuesEqual(collection, field, localValue, baseValue, relationContexts.local, relationContexts.base);
    const remoteChanged = !fieldValuesEqual(collection, field, remoteValue, baseValue, relationContexts.remote, relationContexts.base);

    if (localChanged && !remoteChanged) {
      merged[field] = cloneValue(localValue);
      continue;
    }

    if (!localChanged && remoteChanged) {
      merged[field] = cloneValue(remoteValue);
      continue;
    }

    if (!localChanged && !remoteChanged) {
      merged[field] = cloneValue(localValue);
      continue;
    }

    hasFieldConflict = true;
    merged[field] = cloneValue(chosen.record?.[field]);
  }

  return {
    record: merged,
    hasFieldConflict,
    resolution: chosen.resolution
  };
}

function fieldValuesEqual(
  collection: string,
  field: string,
  left: any,
  right: any,
  leftRelationContext?: CloudSyncRelationContext,
  rightRelationContext?: CloudSyncRelationContext
): boolean {
  if (field === 'tags') {
    return stableSerialize(normalizeTags(left)) === stableSerialize(normalizeTags(right));
  }

  if (collection === 'prompts' && field === 'variables') {
    return true;
  }

  if (field === 'categoryId' && (collection === 'prompts' || collection === 'promptHistories')) {
    const leftCategoryUuid = getRelationUuidById(leftRelationContext?.categoryUuidById, left);
    const rightCategoryUuid = getRelationUuidById(rightRelationContext?.categoryUuidById, right);
    if (leftCategoryUuid && rightCategoryUuid) {
      return leftCategoryUuid === rightCategoryUuid;
    }
  }

  if (field === 'promptId' && (collection === 'promptVariables' || collection === 'promptHistories')) {
    const leftPromptUuid = getRelationUuidById(leftRelationContext?.promptUuidById, left);
    const rightPromptUuid = getRelationUuidById(rightRelationContext?.promptUuidById, right);
    if (leftPromptUuid && rightPromptUuid) {
      return leftPromptUuid === rightPromptUuid;
    }
  }

  return stableSerialize(normalizeForCompare(collection, left)) ===
    stableSerialize(normalizeForCompare(collection, right));
}

function isLocalIdentityField(field: string): boolean {
  return field === 'id';
}

function isMergeTimestampField(field: string): boolean {
  return field === 'updatedAt' ||
    field === 'modifiedAt' ||
    field === 'lastModified';
}

function chooseNewestTimestampValue(...values: any[]): any {
  let newestValue = values[0];
  let newestTime = getTimestampValueTime(newestValue);

  for (const value of values.slice(1)) {
    const time = getTimestampValueTime(value);
    if (time > newestTime) {
      newestTime = time;
      newestValue = value;
    }
  }

  return newestValue;
}

function getTimestampValueTime(value: any): number {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function findRawBlobPath(value: any, path = '$', seen = new WeakSet<object>()): string | null {
  if (value === null || value === undefined || typeof value !== 'object') {
    return null;
  }

  if (isBlob(value)) {
    return path;
  }

  if (seen.has(value)) {
    return null;
  }
  seen.add(value);

  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      const found = findRawBlobPath(item, `${path}[${index}]`, seen);
      if (found) {
        return found;
      }
    }
    return null;
  }

  for (const [key, fieldValue] of Object.entries(value)) {
    const found = findRawBlobPath(fieldValue, `${path}.${key}`, seen);
    if (found) {
      return found;
    }
  }

  return null;
}

function mergeSpecialFieldValue(
  field: string,
  localValue: any,
  remoteValue: any
): { merged: boolean; value?: any } {
  if (field === 'tags') {
    return {
      merged: true,
      value: Array.from(new Set([
        ...normalizeTags(localValue),
        ...normalizeTags(remoteValue)
      ])).sort()
    };
  }

  return { merged: false };
}

function isPresent(record: any | undefined): boolean {
  return !!record &&
    record._deleted !== true &&
    (record.deletedAt === undefined || isCloudSyncTombstone(record)) &&
    record.isDeleted !== true;
}

function recordsEqual(
  collection: string,
  left: any,
  right: any,
  leftRelationContext?: CloudSyncRelationContext,
  rightRelationContext?: CloudSyncRelationContext
): boolean {
  if (!isPresent(left) || !isPresent(right)) {
    return isPresent(left) === isPresent(right);
  }

  return stableSerialize(normalizeForCompare(collection, left, leftRelationContext)) ===
    stableSerialize(normalizeForCompare(collection, right, rightRelationContext));
}

function normalizeForCompare(
  collection: string,
  value: any,
  relationContext?: CloudSyncRelationContext
): any {
  if (value === null || value === undefined) {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (isBlob(value)) {
    return {
      blobType: value.type,
      blobSize: value.size
    };
  }

  if (Array.isArray(value)) {
    const normalizedArray = value.map(item => normalizeForCompare(collection, item, relationContext));
    if (collection === 'prompts' && value.every(item => item && typeof item === 'object')) {
      return normalizedArray.sort((a, b) =>
        stableSerialize(a).localeCompare(stableSerialize(b))
      );
    }
    return normalizedArray;
  }

  if (typeof value !== 'object') {
    return value;
  }

  const normalized: Record<string, any> = {};
  const valueRecord = value as Record<string, any>;
  const inferredCategoryUuid = getInferredCategoryUuid(valueRecord, relationContext);
  const inferredPromptUuid = getInferredPromptUuid(valueRecord, relationContext);

  if (collection === 'prompts' && valueRecord.category?.uuid) {
    normalized.categoryUuid = valueRecord.category.uuid;
  } else if (collection === 'prompts' && inferredCategoryUuid) {
    normalized.categoryUuid = inferredCategoryUuid;
  }

  if (collection === 'promptHistories' && inferredCategoryUuid) {
    normalized.categoryUuid = valueRecord.categoryUuid || inferredCategoryUuid;
  }

  if (
    (collection === 'promptHistories' || collection === 'promptVariables') &&
    inferredPromptUuid
  ) {
    normalized.promptUuid = valueRecord.promptUuid || inferredPromptUuid;
  }

  for (const [key, fieldValue] of Object.entries(valueRecord)) {
    if (key === 'id' || key === 'category') {
      continue;
    }

    if (key === 'categoryId' && (valueRecord.category?.uuid || valueRecord.categoryUuid || inferredCategoryUuid)) {
      continue;
    }

    if (collection === 'prompts' && key === 'variables') {
      continue;
    }

    if (key === 'promptId' && (collection === 'promptHistories' || collection === 'promptVariables')) {
      continue;
    }

    if (key === 'tags') {
      normalized[key] = normalizeTags(fieldValue);
      continue;
    }

    normalized[key] = normalizeForCompare(collection, fieldValue, relationContext);
  }

  return normalized;
}

function createRelationContext(data: CloudSyncDataSet): CloudSyncRelationContext {
  const categoryUuidById = new Map<string, string>();
  const promptUuidById = new Map<string, string>();

  for (const category of data.categories || []) {
    const id = normalizeRelationId(category?.id);
    if (id && typeof category?.uuid === 'string' && category.uuid) {
      categoryUuidById.set(id, category.uuid);
    }
  }

  for (const prompt of data.prompts || []) {
    const id = normalizeRelationId(prompt?.id);
    if (id && typeof prompt?.uuid === 'string' && prompt.uuid) {
      promptUuidById.set(id, prompt.uuid);
    }
  }

  return {
    categoryUuidById,
    promptUuidById
  };
}

function getInferredCategoryUuid(
  record: Record<string, any>,
  relationContext?: CloudSyncRelationContext
): string | undefined {
  if (typeof record.categoryUuid === 'string' && record.categoryUuid) {
    return record.categoryUuid;
  }

  if (record.category?.uuid) {
    return String(record.category.uuid);
  }

  const categoryId = normalizeRelationId(record.categoryId);
  return categoryId ? relationContext?.categoryUuidById.get(categoryId) : undefined;
}

function getInferredPromptUuid(
  record: Record<string, any>,
  relationContext?: CloudSyncRelationContext
): string | undefined {
  if (typeof record.promptUuid === 'string' && record.promptUuid) {
    return record.promptUuid;
  }

  const promptId = normalizeRelationId(record.promptId);
  return promptId ? relationContext?.promptUuidById.get(promptId) : undefined;
}

function getRelationUuidById(
  idMap: Map<string, string> | undefined,
  id: unknown
): string | undefined {
  const normalizedId = normalizeRelationId(id);
  return normalizedId ? idMap?.get(normalizedId) : undefined;
}

function normalizeRelationId(value: unknown): string {
  if (value === undefined || value === null || value === '') {
    return '';
  }

  return String(value);
}

function normalizeTags(tags: any): string[] {
  if (Array.isArray(tags)) {
    return tags.map(tag => String(tag).trim()).filter(Boolean).sort();
  }

  if (typeof tags === 'string') {
    return tags.split(',').map(tag => tag.trim()).filter(Boolean).sort();
  }

  return [];
}

function getRecordTime(record: any): number {
  const candidates = [
    record?.updatedAt,
    record?.createdAt,
    record?.deletedAt,
    record?.modifiedAt
  ];

  for (const candidate of candidates) {
    const time = new Date(candidate).getTime();
    if (!Number.isNaN(time)) {
      return time;
    }
  }

  return 0;
}

function normalizeCloudSyncTombstones(tombstones: any[]): CloudSyncTombstone[] {
  const indexed = new Map<string, CloudSyncTombstone>();

  for (const tombstone of tombstones) {
    if (!isCloudSyncTombstone(tombstone)) {
      continue;
    }

    const key = getCloudSyncTombstoneKey(tombstone);
    if (!key) {
      continue;
    }

    const normalized = cloneValue(tombstone);
    const current = indexed.get(key);
    if (!current || getTombstoneTime(normalized) >= getTombstoneTime(current)) {
      indexed.set(key, normalized);
    }
  }

  return Array.from(indexed.values())
    .sort((left, right) => getCloudSyncTombstoneKey(left).localeCompare(getCloudSyncTombstoneKey(right)));
}

function isCloudSyncTombstone(value: any): value is CloudSyncTombstone {
  return !!value &&
    typeof value === 'object' &&
    typeof value.collectionName === 'string' &&
    typeof value.recordKey === 'string' &&
    value.recordKey.length > 0;
}

function getCloudSyncTombstoneKey(tombstone: any): string {
  if (!tombstone || typeof tombstone !== 'object') {
    return '';
  }

  const collectionName = typeof tombstone.collectionName === 'string'
    ? tombstone.collectionName
    : '';
  const recordKey = typeof tombstone.recordKey === 'string'
    ? tombstone.recordKey
    : '';

  if (collectionName && recordKey) {
    return `${collectionName}:${recordKey}`;
  }

  if (collectionName && typeof tombstone.recordUuid === 'string' && tombstone.recordUuid) {
    return `${collectionName}:uuid:${tombstone.recordUuid}`;
  }

  return '';
}

function createTombstoneMergeContext(...dataSets: CloudSyncDataSet[]): CloudSyncTombstoneMergeContext {
  const tombstones = normalizeCloudSyncTombstones(
    dataSets.flatMap(data => data.syncTombstones || [])
  );
  const promptData: CloudSyncDataSet = {
    prompts: dataSets.flatMap(data => Array.isArray(data.prompts) ? data.prompts : [])
  };

  return {
    tombstones,
    preservedPromptDeletes: createPreservedPromptDeleteContext(promptData, tombstones),
    preservedCategoryDeletes: createPreservedCategoryDeleteContext(
      mergeDataSetsForRelationContext(...getActiveMergeDataSets(dataSets)),
      tombstones
    )
  };
}

function getActiveMergeDataSets(dataSets: CloudSyncDataSet[]): CloudSyncDataSet[] {
  return dataSets.length > 1 ? dataSets.slice(0, 2) : dataSets;
}

function mergeDataSetsForRelationContext(...dataSets: CloudSyncDataSet[]): CloudSyncDataSet {
  return {
    categories: dataSets.flatMap(data => Array.isArray(data.categories) ? data.categories : []),
    prompts: dataSets.flatMap(data => Array.isArray(data.prompts) ? data.prompts : [])
  };
}

function createPreservedPromptDeleteContext(
  data: CloudSyncDataSet,
  tombstones: CloudSyncTombstone[]
): PreservedPromptDeleteContext {
  const context: PreservedPromptDeleteContext = {
    promptUuids: new Set<string>(),
    promptIds: new Set<string>()
  };

  const prompts = Array.isArray(data.prompts) ? data.prompts : [];
  for (const tombstone of tombstones) {
    if (tombstone.collectionName !== 'prompts') {
      continue;
    }

    for (const prompt of prompts) {
      if (
        tombstoneMatchesRecord(tombstone, 'prompts', prompt) &&
        !tombstoneDeletesRecord(tombstone, 'prompts', prompt)
      ) {
        const promptUuid = typeof prompt?.uuid === 'string' ? prompt.uuid : '';
        const promptId = normalizeRelationId(prompt?.id);
        if (promptUuid) {
          context.promptUuids.add(promptUuid);
        }
        if (promptId) {
          context.promptIds.add(promptId);
        }
      }
    }
  }

  return context;
}

function hasIgnoredCascadePromptChildTombstone(
  tombstoneContext: CloudSyncTombstoneMergeContext,
  collection: string,
  record: any
): boolean {
  if (!isPresent(record)) {
    return false;
  }

  return tombstoneContext.tombstones.some(tombstone =>
    shouldIgnoreCascadePromptChildTombstone(tombstone, tombstoneContext.preservedPromptDeletes) &&
    tombstoneMatchesRecord(tombstone, collection, record)
  );
}

function shouldIgnoreCascadePromptChildTombstone(
  tombstone: CloudSyncTombstone,
  preservedPromptDeletes: PreservedPromptDeleteContext
): boolean {
  if (
    tombstone.collectionName !== 'promptVariables' &&
    tombstone.collectionName !== 'promptHistories' &&
    tombstone.collectionName !== 'aiHistory'
  ) {
    return false;
  }

  const snapshot = tombstone.recordSnapshot;
  if (!snapshot || typeof snapshot !== 'object') {
    return false;
  }

  const promptUuid = typeof snapshot.promptUuid === 'string' ? snapshot.promptUuid : '';
  if (promptUuid && preservedPromptDeletes.promptUuids.has(promptUuid)) {
    return true;
  }

  const promptId = normalizeRelationId(snapshot.promptId);
  return !!promptId && preservedPromptDeletes.promptIds.has(promptId);
}

function createPreservedCategoryDeleteContext(
  data: CloudSyncDataSet,
  tombstones: CloudSyncTombstone[]
): PreservedCategoryDeleteContext {
  const context: PreservedCategoryDeleteContext = {
    categoryUuids: new Set<string>(),
    categoryIds: new Set<string>()
  };
  const categoryTombstones = tombstones
    .filter(tombstone => tombstone.collectionName === 'categories');
  if (categoryTombstones.length === 0) {
    return context;
  }

  const relationContext = createRelationContext(data);
  const prompts = (Array.isArray(data.prompts) ? data.prompts : [])
    .filter(prompt => !tombstones.some(tombstone => tombstoneDeletesRecord(tombstone, 'prompts', prompt)));
  for (const tombstone of categoryTombstones) {
    const categoryRefs = getCategoryRefsFromTombstone(tombstone);
    for (const prompt of prompts) {
      if (promptReferencesCategory(prompt, categoryRefs, relationContext)) {
        categoryRefs.categoryUuids.forEach(categoryUuid => context.categoryUuids.add(categoryUuid));
        categoryRefs.categoryIds.forEach(categoryId => context.categoryIds.add(categoryId));
      }
    }
  }

  return context;
}

function hasIgnoredReferencedCategoryTombstone(
  tombstoneContext: CloudSyncTombstoneMergeContext,
  collection: string,
  record: any
): boolean {
  if (collection !== 'categories' || !isPresent(record)) {
    return false;
  }

  return tombstoneContext.tombstones.some(tombstone =>
    shouldIgnoreReferencedCategoryTombstone(tombstone, tombstoneContext.preservedCategoryDeletes) &&
    tombstoneMatchesRecord(tombstone, collection, record)
  );
}

function shouldIgnoreReferencedCategoryTombstone(
  tombstone: CloudSyncTombstone,
  preservedCategoryDeletes: PreservedCategoryDeleteContext
): boolean {
  if (tombstone.collectionName !== 'categories') {
    return false;
  }

  const categoryRefs = getCategoryRefsFromTombstone(tombstone);
  return categoryRefs.categoryUuids.some(categoryUuid => preservedCategoryDeletes.categoryUuids.has(categoryUuid)) ||
    categoryRefs.categoryIds.some(categoryId => preservedCategoryDeletes.categoryIds.has(categoryId));
}

function getCategoryRefsFromTombstone(tombstone: CloudSyncTombstone): {
  categoryUuids: string[];
  categoryIds: string[];
} {
  const categoryUuids = new Set<string>();
  const categoryIds = new Set<string>();
  if (typeof tombstone.recordUuid === 'string' && tombstone.recordUuid) {
    categoryUuids.add(tombstone.recordUuid);
  }

  const snapshot = tombstone.recordSnapshot;
  if (snapshot && typeof snapshot === 'object') {
    if (typeof snapshot.uuid === 'string' && snapshot.uuid) {
      categoryUuids.add(snapshot.uuid);
    }

    const snapshotId = normalizeRelationId(snapshot.id);
    if (snapshotId) {
      categoryIds.add(snapshotId);
    }
  }

  const recordKeyUuid = tombstone.recordKey.match(/^uuid:(.+)$/)?.[1];
  if (recordKeyUuid) {
    categoryUuids.add(recordKeyUuid);
  }

  const recordKeyId = tombstone.recordKey.match(/^id:(.+)$/)?.[1];
  if (recordKeyId) {
    categoryIds.add(recordKeyId);
  }

  return {
    categoryUuids: Array.from(categoryUuids),
    categoryIds: Array.from(categoryIds)
  };
}

function promptReferencesCategory(
  prompt: any,
  categoryRefs: { categoryUuids: string[]; categoryIds: string[] },
  relationContext: CloudSyncRelationContext
): boolean {
  const promptCategoryUuid = getInferredCategoryUuid(prompt, relationContext);
  if (promptCategoryUuid && categoryRefs.categoryUuids.includes(promptCategoryUuid)) {
    return true;
  }

  const promptCategoryId = normalizeRelationId(prompt?.categoryId);
  return !!promptCategoryId && categoryRefs.categoryIds.includes(promptCategoryId);
}

function tombstoneDeletesRecord(tombstone: CloudSyncTombstone, collection: string, record: any): boolean {
  if (!tombstoneMatchesRecord(tombstone, collection, record)) {
    return false;
  }

  const tombstoneTime = getTombstoneTime(tombstone);
  const recordTime = getRecordTime(record);
  return tombstoneTime === 0 || recordTime === 0 || tombstoneTime >= recordTime;
}

function tombstoneMatchesRecord(tombstone: CloudSyncTombstone, collection: string, record: any): boolean {
  if (tombstone.collectionName !== collection || !isPresent(record)) {
    return false;
  }

  const recordKey = getCloudSyncRecordKey(collection, record);
  const matchesKey = tombstone.recordKey === recordKey;
  const matchesUuid = !!tombstone.recordUuid && tombstone.recordUuid === record?.uuid;

  return matchesKey || matchesUuid;
}

function getTombstoneTime(tombstone: CloudSyncTombstone): number {
  const time = new Date(tombstone.deletedAt).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function cloneValue<T>(value: T): T {
  if (value === null || value === undefined) {
    return value;
  }

  if (value instanceof Date) {
    return new Date(value.getTime()) as T;
  }

  if (isBlob(value)) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(item => cloneValue(item)) as T;
  }

  if (typeof value === 'object') {
    const cloned: Record<string, any> = {};
    for (const [key, fieldValue] of Object.entries(value as Record<string, any>)) {
      cloned[key] = cloneValue(fieldValue);
    }
    return cloned as T;
  }

  return value;
}

function normalizeSnapshotJsonValue(value: any): any {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (isBlob(value)) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(item => item === undefined ? null : normalizeSnapshotJsonValue(item));
  }

  if (typeof value === 'object') {
    const normalized: Record<string, any> = {};
    for (const [key, fieldValue] of Object.entries(value as Record<string, any>)) {
      const normalizedValue = normalizeSnapshotJsonValue(fieldValue);
      if (normalizedValue !== undefined) {
        normalized[key] = normalizedValue;
      }
    }
    return normalized;
  }

  return value;
}

function getAllCollectionNames(...dataSets: CloudSyncDataSet[]): string[] {
  const names = new Set<string>(DEFAULT_COLLECTIONS);
  for (const dataSet of dataSets) {
    for (const key of Object.keys(dataSet)) {
      if (Array.isArray(dataSet[key])) {
        names.add(key);
      }
    }
  }
  return Array.from(names);
}

function isBlob(value: any): value is Blob {
  return typeof Blob !== 'undefined' && value instanceof Blob;
}

function createRevision(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
