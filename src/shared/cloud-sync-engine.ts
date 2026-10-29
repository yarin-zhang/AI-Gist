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
  /** 两边都改了、改得不一样的字段（both_modified 时才有） */
  fields?: string[];
}

/**
 * 一次合并对本机数据意味着什么，按记录计数。冲突项只计入 conflicts，不再重复计入其他几项；
 * 删除标记（syncTombstones）本身不计数，它删掉的记录按 deleted 计 (#489)。
 */
export interface CloudSyncMergeSummary {
  /** 云端新增、本机还没有的记录 */
  added: number;
  /** 云端改过、本机没改，合并后本机会跟着更新的记录 */
  updated: number;
  /** 云端删除、本机还在，合并后本机会跟着删除的记录（本机自己删除的不算） */
  deleted: number;
  /** 本机保持不变的记录（包括只在本机改过或删除、等待上传的） */
  kept: number;
  /** 两边都改过、需要选择保留哪一份的记录 */
  conflicts: number;
}

/** 本机删除过、因为另一台设备保留或修改得更晚而在这次同步后重新出现的记录 (#489) */
export interface CloudSyncRestoredRecord {
  collection: string;
  key: string;
  /** 标题或名称，没有时为记录键 */
  label: string;
}

export interface CloudSyncMergeResult<TData extends CloudSyncDataSet = CloudSyncDataSet> {
  data: TData;
  conflicts: CloudSyncConflict[];
  summary: CloudSyncMergeSummary;
  hasConflicts: boolean;
}

export type CloudSyncConflictSide = 'local' | 'remote';

export interface CloudSyncMergeOptions {
  prefer?: 'local' | 'remote' | 'newer';
  /**
   * 用户在冲突弹窗里逐项选定保留的一方，键由 getCloudSyncConflictId 生成。
   * 只对真正冲突的记录生效：选中的一方整条保留（删除也算一种版本）。
   */
  resolutions?: Record<string, CloudSyncConflictSide>;
  /**
   * 用户处理冲突的时间，默认当前时间。「一边删除、一边修改」时，用户的选择按这个时间记为一次新操作：
   * 保留修改版时记录时间要晚于删除标记，保留删除时删除标记要晚于修改，否则会被删除标记的时间比较推翻 (#485)。
   */
  resolvedAt?: string;
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
  /** 用户处理冲突的时间（毫秒） */
  resolvedTime: number;
  /** 用户选择保留删除的记录：合并结束后把它们的删除标记挪到修改之后 */
  confirmedDeletes: { collection: string; record: any }[];
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

/**
 * 只记录使用情况的字段：两边不同不算冲突，删除冲突里也不算「改过这条记录」(#488)。
 * updatedAt 也在内，因为旧版本复制提示词时会顺带改它。
 */
const USAGE_ONLY_FIELDS: Record<string, string[]> = {
  prompts: ['useCount', 'lastUsedAt', 'updatedAt']
};

/**
 * 需要用户来选的冲突：同一条提示词或分类在两台设备上都改了，而且改的是用户自己写的同一处内容。
 * 其余冲突（只有一边改过、没有基线的两份副本、一边删一边改、删除标记、设置、收藏和排序这类状态）
 * 都按「较新的为准」自动处理，不让同步停下来。
 */
const USER_DECISION_FIELDS: Record<string, ReadonlySet<string>> = {
  prompts: new Set(['title', 'content', 'description', 'categoryId', 'categoryUuid', 'imageBlobs']),
  categories: new Set(['name', 'description', 'parentId'])
};

export function cloudSyncConflictNeedsUserDecision(
  conflict: Pick<CloudSyncConflict, 'collection' | 'reason' | 'fields'>
): boolean {
  if (conflict.reason !== 'both_modified') return false;
  const fields = USER_DECISION_FIELDS[conflict.collection];
  return !!fields && (conflict.fields || []).some(field => fields.has(field));
}

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

  if (Array.isArray(normalized.syncTombstones)) {
    normalized.syncTombstones = normalized.syncTombstones.map(stripTombstoneSnapshotImages);
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

    // 副本里的图片会在规范化时去掉（见 stripTombstoneSnapshotImages），其余地方不能有 Blob
    const blobPath = findRawBlobPath(stripTombstoneSnapshotImages(tombstone));
    if (blobPath) {
      return { valid: false, reason: `snapshot data syncTombstones[${index}] contains unserialized Blob at ${blobPath}` };
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
  tombstoneContext.resolvedTime = getTimestampValueTime(options.resolvedAt) || Date.now();

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
    summary.conflicts += merged.summary.conflicts;
    // 删除标记不是用户数据：新收到一条删除标记不能算「云端新增」，它删掉的记录已在所属集合里按 deleted 计数 (#489)
    if (collection === 'syncTombstones') {
      continue;
    }
    summary.added += merged.summary.added;
    summary.updated += merged.summary.updated;
    summary.deleted += merged.summary.deleted;
    summary.kept += merged.summary.kept;
  }

  if (tombstoneContext.confirmedDeletes.length > 0 && Array.isArray(resultData.syncTombstones)) {
    resultData.syncTombstones = resultData.syncTombstones.map(tombstone =>
      moveTombstoneAfterConfirmedDeletes(tombstone, tombstoneContext)
    );
  }

  const dataWithDeletesApplied = applyCloudSyncTombstones(resultData) as TData;

  return {
    data: dataWithDeletesApplied,
    conflicts,
    summary,
    hasConflicts: conflicts.length > 0
  };
}

export function getCloudSyncConflictId(conflict: Pick<CloudSyncConflict, 'collection' | 'key'>): string {
  return `${conflict.collection}::${conflict.key}`;
}

/**
 * 需要提醒「已恢复」的集合：用户直接管理、认得出名字的数据。
 * 变量、历史版本跟着提示词一起恢复，只提示词本身提醒一次；设置和 AI 生成记录不提醒。
 */
const RESTORE_NOTICE_COLLECTIONS = ['prompts', 'categories', 'aiConfigs', 'quickOptimizationConfigs'];

/**
 * 找出本机删除过（本机有删除标记）、合并后又回来的记录：另一台设备在冲突里保留了它，
 * 或者对它的修改晚于本机的删除，删除标记就不再生效 (#489)。
 * mergedData 是已经套用过删除标记、将要写回本机的数据。
 */
export function findCloudSyncRecordsRestoredOverLocalDeletes(
  localData: CloudSyncDataSet,
  mergedData: CloudSyncDataSet
): CloudSyncRestoredRecord[] {
  const localTombstones = normalizeCloudSyncTombstones(localData.syncTombstones || []);
  if (localTombstones.length === 0) {
    return [];
  }

  const restored: CloudSyncRestoredRecord[] = [];
  for (const collection of RESTORE_NOTICE_COLLECTIONS) {
    const localKeys = new Set(
      (localData[collection] || [])
        .filter(isPresent)
        .map(record => getCloudSyncRecordKey(collection, record))
    );
    for (const record of mergedData[collection] || []) {
      if (!isPresent(record)) continue;
      const key = getCloudSyncRecordKey(collection, record);
      if (localKeys.has(key)) continue;
      if (!localTombstones.some(tombstone => tombstoneMatchesRecord(tombstone, collection, record))) continue;
      restored.push({ collection, key, label: getCloudSyncRecordLabel(record, key) });
    }
  }
  return restored;
}

/** 记录的标题或名称，没有时用 fallback */
export function getCloudSyncRecordLabel(record: any, fallback: string): string {
  // 没有标题的提示词用正文第一行，不显示 uuid
  const firstLine = typeof record?.content === 'string'
    ? record.content.split('\n').map((line: string) => line.trim()).find(Boolean)
    : undefined;
  const label = record?.title || record?.name || firstLine || record?.key || record?.uuid;
  if (typeof label !== 'string' || !label.trim()) return fallback;
  const text = label.trim();
  return text.length > RECORD_LABEL_LENGTH ? `${text.slice(0, RECORD_LABEL_LENGTH)}…` : text;
}

const RECORD_LABEL_LENGTH = 60;

/**
 * 冲突弹窗里每一边展示的关键内容，用来让用户看清两边差在哪里 (#447)。
 * 只带截断后的短文本：不带图片，也不带 API 密钥、接口地址这类敏感字段。
 */
export interface CloudSyncConflictPreview {
  /** 标题或名称 */
  title?: string;
  /** 正文、优化模板等长文本的开头 */
  excerpt?: string;
  /** 其余关键字段，按展示顺序排列 */
  fields: CloudSyncConflictPreviewField[];
}

export type CloudSyncConflictPreviewFieldKey =
  | 'category'
  | 'tags'
  | 'description'
  | 'version'
  | 'provider'
  | 'model'
  | 'type'
  | 'defaultValue'
  | 'value'
  | 'images';

export interface CloudSyncConflictPreviewField {
  key: CloudSyncConflictPreviewFieldKey;
  value: string;
  /** 两边比较用的值；图片只显示张数，张数一样但换了图也要标出不同 */
  compareValue?: string;
}

export const CLOUD_SYNC_CONFLICT_EXCERPT_LENGTH = 240;
const CLOUD_SYNC_CONFLICT_FIELD_LENGTH = 120;
const SENSITIVE_SETTING_KEY_PATTERN = /key|token|secret|password|passwd|credential/i;

function toConflictPreviewText(value: unknown, limit: number): string {
  if (value === undefined || value === null) return '';
  const raw = typeof value === 'string' ? value : typeof value === 'object' ? JSON.stringify(value) : String(value);
  const text = raw.replace(/\r\n?/g, '\n').trim();
  // 按字符截断，不切坏 emoji 这类代理对
  const chars = Array.from(text);
  return chars.length > limit ? `${chars.slice(0, limit).join('').trimEnd()}…` : text;
}

function toConflictPreviewTags(tags: unknown): string {
  if (Array.isArray(tags)) return tags.map(tag => String(tag).trim()).filter(Boolean).join(', ');
  return typeof tags === 'string' ? tags : '';
}

/** 按 ID / uuid 找同一边数据里的分类名，用来把提示词的分类 ID 换成名字 */
export function createCloudSyncCategoryNameLookup(data: CloudSyncDataSet): (record: any) => string | undefined {
  const names = new Map<string, string>();
  for (const category of data.categories || []) {
    if (!isPresent(category) || typeof category.name !== 'string' || !category.name.trim()) continue;
    if (category.id !== undefined && category.id !== null) names.set(`id:${category.id}`, category.name.trim());
    if (category.uuid) names.set(`uuid:${category.uuid}`, category.name.trim());
  }
  return record => {
    if (typeof record?.category?.name === 'string' && record.category.name.trim()) return record.category.name.trim();
    if (record?.categoryUuid && names.has(`uuid:${record.categoryUuid}`)) return names.get(`uuid:${record.categoryUuid}`);
    if (record?.categoryId !== undefined && record?.categoryId !== null) return names.get(`id:${record.categoryId}`);
    return undefined;
  };
}

/** 冲突项某一边的预览；这一边已删除或没有这条记录时返回 undefined */
export function createCloudSyncConflictPreview(
  collection: string,
  record: any,
  options: { categoryNameOf?: (record: any) => string | undefined } = {}
): CloudSyncConflictPreview | undefined {
  if (!isPresent(record) || typeof record !== 'object') return undefined;

  const fields: CloudSyncConflictPreviewField[] = [];
  const add = (key: CloudSyncConflictPreviewFieldKey, value: unknown) => {
    const text = toConflictPreviewText(value, CLOUD_SYNC_CONFLICT_FIELD_LENGTH);
    if (text) fields.push({ key, value: text });
  };
  const titleOf = (value: unknown) => toConflictPreviewText(value, CLOUD_SYNC_CONFLICT_FIELD_LENGTH) || undefined;
  const excerptOf = (value: unknown) => toConflictPreviewText(value, CLOUD_SYNC_CONFLICT_EXCERPT_LENGTH) || undefined;

  switch (collection) {
    case 'prompts':
    case 'promptHistories':
      if (collection === 'promptHistories') add('version', record.version);
      add('category', options.categoryNameOf?.(record));
      add('tags', toConflictPreviewTags(record.tags));
      add('description', record.description);
      if (Array.isArray(record.imageBlobs) && record.imageBlobs.length) {
        fields.push({ key: 'images', value: String(record.imageBlobs.length), compareValue: createStableChecksum(record.imageBlobs) });
      }
      return { title: titleOf(record.title), excerpt: excerptOf(record.content), fields };
    case 'categories':
      add('description', record.description);
      return { title: titleOf(record.name), fields };
    case 'aiConfigs':
      add('provider', record.type ?? record.provider);
      add('model', record.defaultModel || record.customModel);
      return { title: titleOf(record.name), fields };
    case 'quickOptimizationConfigs':
      add('description', record.description);
      return { title: titleOf(record.name), excerpt: excerptOf(record.prompt), fields };
    case 'promptVariables':
      add('type', record.type);
      add('defaultValue', record.defaultValue);
      add('description', record.description);
      return { title: titleOf(record.name), fields };
    case 'settings':
      if (!SENSITIVE_SETTING_KEY_PATTERN.test(String(record.key || ''))) add('value', record.value);
      return { title: titleOf(record.key), fields };
    default:
      return { title: titleOf(record.title || record.name || record.key), fields };
  }
}

function getUserResolution(
  options: CloudSyncMergeOptions,
  collection: string,
  key: string
): CloudSyncConflictSide | undefined {
  return options.resolutions?.[getCloudSyncConflictId({ collection, key })];
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

    // 内容一样、只差使用统计或修改时间：没有基线算不出各自用了几次，次数取较大的一方、时间取较新的，不算冲突
    if (recordsEqualIgnoringMetadata(collection, localRecord, remoteRecord, relationContexts.local, relationContexts.remote)) {
      const merged = mergeUsageOnlyRecords(collection, localRecord, remoteRecord);
      records.push(merged);
      if (recordsEqual(collection, merged, localRecord, relationContexts.local, relationContexts.local)) {
        summary.kept++;
      } else {
        summary.updated++;
      }
      return;
    }

    const decided = getUserResolution(options, collection, key);
    const chosen = decided
      ? { record: decided === 'local' ? localRecord : remoteRecord, resolution: decided === 'local' ? 'keep-local' as const : 'take-remote' as const }
      : chooseRecord(localRecord, remoteRecord, options);
    records.push(cloneValue(chosen.record));
    // 冲突项只计入 conflicts
    addConflict(conflicts, summary, {
      collection,
      key,
      reason: 'create_collision',
      resolution: chosen.resolution,
      local: localRecord,
      remote: remoteRecord
    });
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

  // 两边都已删除：本机没有变化
  if (!localExists && !remoteExists) {
    summary.kept++;
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

    // 对方只是用过这条记录、没改内容，不算修改：直接接受删除。这是本机自己的删除，等待上传，不算云端删除
    const remoteChanged = !recordsEqualIgnoringUsage(collection, remoteRecord, baseRecord, relationContexts.remote, relationContexts.base);
    if (!remoteChanged) {
      summary.kept++;
      return;
    }

    // 本机删了、服务器改了：用户选本机时保留这次删除；没有选择时，删除标记比修改新就按删除处理
    const decided = getUserResolution(options, collection, key);
    if (decided === 'local' || (!decided && isDeletedByTombstone(tombstoneContext, collection, remoteRecord))) {
      addConflict(conflicts, summary, {
        collection,
        key,
        reason: 'delete_vs_update',
        resolution: 'keep-local',
        local: localRecord,
        remote: remoteRecord,
        base: baseRecord
      });
      if (decided === 'local') tombstoneContext.confirmedDeletes.push({ collection, record: remoteRecord });
      return;
    }

    records.push(cloneValue(decided === 'remote'
      ? reviveRecordOverTombstones(tombstoneContext, collection, remoteRecord, baseRecord)
      : remoteRecord));
    addConflict(conflicts, summary, {
      collection,
      key,
      reason: 'delete_vs_update',
      resolution: 'take-remote',
      local: localRecord,
      remote: remoteRecord,
      base: baseRecord
    });
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

    const localChanged = !recordsEqualIgnoringUsage(collection, localRecord, baseRecord, relationContexts.local, relationContexts.base);
    if (!localChanged) {
      summary.deleted++;
      return;
    }

    // 服务器删了、本机改了：用户选服务器时接受这次删除；没有选择时，删除标记比修改新就按删除处理
    const decided = getUserResolution(options, collection, key);
    if (decided === 'remote' || (!decided && isDeletedByTombstone(tombstoneContext, collection, localRecord))) {
      addConflict(conflicts, summary, {
        collection,
        key,
        reason: 'delete_vs_update',
        resolution: 'take-remote',
        local: localRecord,
        remote: remoteRecord,
        base: baseRecord
      });
      if (decided === 'remote') tombstoneContext.confirmedDeletes.push({ collection, record: localRecord });
      return;
    }

    records.push(cloneValue(decided === 'local'
      ? reviveRecordOverTombstones(tombstoneContext, collection, localRecord, baseRecord)
      : localRecord));
    addConflict(conflicts, summary, {
      collection,
      key,
      reason: 'delete_vs_update',
      resolution: 'keep-local',
      local: localRecord,
      remote: remoteRecord,
      base: baseRecord
    });
    return;
  }

  if (
    recordsEqual(collection, localRecord, remoteRecord, relationContexts.local, relationContexts.remote) &&
    !usageCountersDiverged(collection, localRecord, remoteRecord, baseRecord)
  ) {
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

  // 同一字段两边都改了，且用户指定了保留哪一方：整条采用那一方的版本
  const decided = mergedRecord.hasFieldConflict ? getUserResolution(options, collection, key) : undefined;
  if (decided) {
    records.push(cloneValue(decided === 'local' ? localRecord : remoteRecord));
    addConflict(conflicts, summary, {
      collection,
      key,
      reason: 'both_modified',
      resolution: decided === 'local' ? 'keep-local' : 'take-remote',
      local: localRecord,
      remote: remoteRecord,
      base: baseRecord,
      fields: mergedRecord.conflictFields
    });
    return;
  }

  records.push(cloneValue(mergedRecord.record));

  if (mergedRecord.hasFieldConflict) {
    addConflict(conflicts, summary, {
      collection,
      key,
      reason: 'both_modified',
      resolution: mergedRecord.resolution,
      local: localRecord,
      remote: remoteRecord,
      base: baseRecord,
      fields: mergedRecord.conflictFields
    });
    return;
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
    fields: conflict.fields ? [...conflict.fields] : undefined,
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
): { record: any; hasFieldConflict: boolean; conflictFields: string[]; resolution: CloudSyncResolution } {
  const chosen = chooseRecord(localRecord, remoteRecord, options);
  const merged: Record<string, any> = {};
  const conflictFields: string[] = [];
  const keys = new Set([
    ...Object.keys(baseRecord || {}),
    ...Object.keys(localRecord || {}),
    ...Object.keys(remoteRecord || {})
  ]);

  for (const field of keys) {
    const baseValue = baseRecord?.[field];
    const localValue = localRecord?.[field];
    const remoteValue = remoteRecord?.[field];

    // 使用次数是计数器：两边各自用了几次都要算上，放在相等判断之前（两边各用一次也是 +2）
    if (isUsageCounterField(collection, field)) {
      merged[field] = mergeUsageCounter(baseValue, localValue, remoteValue);
      continue;
    }

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

    conflictFields.push(field);
    merged[field] = cloneValue(chosen.record?.[field]);
  }

  return {
    record: merged,
    hasFieldConflict: conflictFields.length > 0,
    conflictFields,
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
    field === 'lastModified' ||
    field === 'lastUsedAt';
}

function isUsageCounterField(collection: string, field: string): boolean {
  return collection === 'prompts' && field === 'useCount';
}

function toUsageCount(value: any): number {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

/** 基线 + 本机增量 + 云端增量 */
function mergeUsageCounter(baseValue: any, localValue: any, remoteValue: any): number {
  return Math.max(0, toUsageCount(localValue) + toUsageCount(remoteValue) - toUsageCount(baseValue));
}

/** 两边都在基线上累加过使用次数：即使结果碰巧相同（各用一次），也要按增量合并 */
function usageCountersDiverged(collection: string, localRecord: any, remoteRecord: any, baseRecord: any): boolean {
  if (collection !== 'prompts') {
    return false;
  }

  const baseCount = toUsageCount(baseRecord?.useCount);
  return toUsageCount(localRecord?.useCount) !== baseCount && toUsageCount(remoteRecord?.useCount) !== baseCount;
}

function withoutUsageFields(collection: string, record: any): any {
  const fields = USAGE_ONLY_FIELDS[collection];
  if (!fields || !record || typeof record !== 'object') {
    return record;
  }

  const copy = { ...record };
  for (const field of fields) {
    delete copy[field];
  }
  return copy;
}

function recordsEqualIgnoringUsage(
  collection: string,
  left: any,
  right: any,
  leftRelationContext?: CloudSyncRelationContext,
  rightRelationContext?: CloudSyncRelationContext
): boolean {
  return recordsEqual(
    collection,
    withoutUsageFields(collection, left),
    withoutUsageFields(collection, right),
    leftRelationContext,
    rightRelationContext
  );
}

/** 去掉使用统计和修改时间后两份记录是否一样：没有基线时，只差这些不算冲突 */
function recordsEqualIgnoringMetadata(
  collection: string,
  left: any,
  right: any,
  leftRelationContext?: CloudSyncRelationContext,
  rightRelationContext?: CloudSyncRelationContext
): boolean {
  const strip = (record: any) => {
    const copy = withoutUsageFields(collection, record);
    if (!copy || typeof copy !== 'object') return copy;
    const result = { ...copy };
    for (const field of Object.keys(result)) {
      if (isMergeTimestampField(field)) delete result[field];
    }
    return result;
  };
  return recordsEqual(collection, strip(left), strip(right), leftRelationContext, rightRelationContext);
}

/** 没有基线时合并只差使用统计或修改时间的两份记录：次数取较大的一方，时间取较新的一方 */
function mergeUsageOnlyRecords(collection: string, localRecord: any, remoteRecord: any): any {
  const merged = cloneValue(localRecord);
  const fields = new Set([
    ...(USAGE_ONLY_FIELDS[collection] || []),
    ...[...Object.keys(localRecord || {}), ...Object.keys(remoteRecord || {})].filter(isMergeTimestampField)
  ]);
  for (const field of fields) {
    const localValue = localRecord?.[field];
    const remoteValue = remoteRecord?.[field];
    const value = isUsageCounterField(collection, field)
      ? Math.max(toUsageCount(localValue), toUsageCount(remoteValue))
      : chooseNewestTimestampValue(localValue, remoteValue);
    if (value !== undefined) {
      merged[field] = cloneValue(value);
    }
  }
  return merged;
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

    const normalized = stripTombstoneSnapshotImages(cloneValue(tombstone));
    const current = indexed.get(key);
    if (!current || getTombstoneTime(normalized) >= getTombstoneTime(current)) {
      indexed.set(key, normalized);
    }
  }

  return Array.from(indexed.values())
    .sort((left, right) => getCloudSyncTombstoneKey(left).localeCompare(getCloudSyncTombstoneKey(right)));
}

/**
 * 删除标记里的原记录副本只用来认出是哪条记录（uuid、id、所属提示词和分类），不需要图片。
 * 手机删掉带图片的提示词时，副本里还是 Blob：算校验和时按「类型 + 大小」算，写成 JSON 却变成 {}，
 * 云端文件和自己的校验和对不上，每台设备读到都当成损坏去修、再当成有改动去写，同步一直「云端文件在变」。
 * 去掉副本里的图片字段；云端旧文件里已经变成 {} 的同样去掉，两边才一致
 */
export function stripTombstoneSnapshotImages<T>(tombstone: T): T {
  const snapshot = (tombstone as any)?.recordSnapshot;
  if (!snapshot || typeof snapshot !== 'object' || !('imageBlobs' in snapshot)) {
    return tombstone;
  }
  const { imageBlobs: _images, ...rest } = snapshot;
  return { ...(tombstone as any), recordSnapshot: rest };
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
    ),
    resolvedTime: Date.now(),
    confirmedDeletes: []
  };
}

/** 合并结束后套用删除标记时，这条记录会不会被删掉 */
function isDeletedByTombstone(
  tombstoneContext: CloudSyncTombstoneMergeContext,
  collection: string,
  record: any
): boolean {
  return tombstoneContext.tombstones.some(tombstone => tombstoneDeletesRecord(tombstone, collection, record));
}

/**
 * 用户选择保留被另一边删除的记录：把记录时间挪到删除标记和处理时间之后，
 * 本机和其他设备套用删除标记时都不会再删掉它；提示词的变量、历史版本跟着保留 (#485)
 */
function reviveRecordOverTombstones(
  tombstoneContext: CloudSyncTombstoneMergeContext,
  collection: string,
  record: any,
  baseRecord: any
): any {
  const deletingTombstones = tombstoneContext.tombstones
    .filter(tombstone => tombstoneDeletesRecord(tombstone, collection, record));
  if (deletingTombstones.length === 0) {
    return record;
  }

  const latestDeleteTime = Math.max(...deletingTombstones.map(getTombstoneTime));
  const revived = {
    ...cloneValue(record),
    updatedAt: new Date(Math.max(tombstoneContext.resolvedTime, latestDeleteTime + 1)).toISOString()
  };

  if (collection === 'prompts') {
    const preserved = tombstoneContext.preservedPromptDeletes;
    for (const candidate of [revived, baseRecord]) {
      if (typeof candidate?.uuid === 'string' && candidate.uuid) preserved.promptUuids.add(candidate.uuid);
      const id = normalizeRelationId(candidate?.id);
      if (id) preserved.promptIds.add(id);
    }
  }

  return revived;
}

/** 用户选择保留删除：删除标记的时间挪到另一边的修改和处理时间之后，其他设备同步时同样按删除处理 */
function moveTombstoneAfterConfirmedDeletes(
  tombstone: any,
  tombstoneContext: CloudSyncTombstoneMergeContext
): any {
  const confirmed = tombstoneContext.confirmedDeletes
    .filter(item => tombstoneMatchesRecord(tombstone, item.collection, item.record));
  if (confirmed.length === 0) {
    return tombstone;
  }

  const latestEditTime = Math.max(...confirmed.map(item => getRecordTime(item.record)));
  const deletedAt = Math.max(tombstoneContext.resolvedTime, latestEditTime + 1, getTombstoneTime(tombstone));
  return { ...tombstone, deletedAt: new Date(deletedAt).toISOString() };
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
