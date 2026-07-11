import { createStableChecksum, stableSerialize } from './data-checksum';

/**
 * Storage-independent contract for data that can participate in cloud sync.
 *
 * `stableIdentityFields` are checked in order and must survive numeric ID
 * regeneration. `businessUniqueFields` mirror unique IndexedDB indexes that
 * can reject a snapshot even when every UUID is distinct.
 */
export const CLOUD_SYNC_COLLECTION_CONTRACT = {
  categories: {
    storeName: 'categories',
    stableIdentityFields: ['uuid'],
    businessUniqueFields: ['name']
  },
  prompts: {
    storeName: 'prompts',
    stableIdentityFields: ['uuid'],
    businessUniqueFields: []
  },
  promptVariables: {
    storeName: 'promptVariables',
    stableIdentityFields: ['uuid'],
    businessUniqueFields: []
  },
  promptHistories: {
    storeName: 'promptHistories',
    stableIdentityFields: ['uuid'],
    businessUniqueFields: []
  },
  aiConfigs: {
    storeName: 'ai_configs',
    stableIdentityFields: ['uuid', 'configId'],
    businessUniqueFields: ['configId']
  },
  quickOptimizationConfigs: {
    storeName: 'quick_optimization_configs',
    stableIdentityFields: ['uuid'],
    businessUniqueFields: []
  },
  aiHistory: {
    storeName: 'ai_generation_history',
    stableIdentityFields: ['uuid', 'historyId'],
    businessUniqueFields: ['historyId']
  },
  settings: {
    storeName: 'settings',
    stableIdentityFields: ['key'],
    businessUniqueFields: ['key']
  },
  syncTombstones: {
    storeName: 'syncTombstones',
    stableIdentityFields: ['recordKey'],
    businessUniqueFields: []
  }
} as const;

export type CloudSyncContractCollection = keyof typeof CLOUD_SYNC_COLLECTION_CONTRACT;
export type CloudSyncContractData = Partial<Record<CloudSyncContractCollection, any[]>> &
  Record<string, any>;

export interface CloudSyncCollectionContract {
  storeName: string;
  stableIdentityFields: readonly string[];
  businessUniqueFields: readonly string[];
}

export type CloudSyncContractIssueCode =
  | 'missing_required_relation'
  | 'unresolved_relation_uuid'
  | 'unresolved_relation_id'
  | 'ambiguous_relation_id'
  | 'self_relation';

export interface CloudSyncContractIssue {
  code: CloudSyncContractIssueCode;
  collection: CloudSyncContractCollection;
  recordIdentity: string;
  relation: 'category' | 'parentCategory' | 'prompt';
  targetCollection: 'categories' | 'prompts';
  referenceUuid?: string;
  referenceId?: string;
}

export interface CloudSyncBusinessKeyMerge {
  collection: 'categories' | 'aiConfigs' | 'aiHistory';
  businessKeyField: 'name' | 'configId' | 'historyId';
  businessKeyFingerprint: string;
  canonicalUuid?: string;
  mergedRecordIdentities: string[];
}

export type CloudSyncRelationRepairCode =
  | 'removed_unresolved_optional_relation'
  | 'removed_ambiguous_optional_relation'
  | 'removed_self_relation';

export interface CloudSyncRelationRepair {
  code: CloudSyncRelationRepairCode;
  collection: CloudSyncContractCollection;
  recordIdentity: string;
  relation: CloudSyncContractIssue['relation'];
  targetCollection: CloudSyncContractIssue['targetCollection'];
}

export interface CloudSyncContractResult<TData extends CloudSyncContractData = CloudSyncContractData> {
  data: TData;
  issues: CloudSyncContractIssue[];
  merges: CloudSyncBusinessKeyMerge[];
  repairs: CloudSyncRelationRepair[];
  valid: boolean;
}

export interface CloudSyncContractQuarantineRecord {
  collection: CloudSyncContractCollection;
  recordIdentity: string;
  payload: any;
}

export interface CloudSyncContractQuarantineGroup {
  groupId: string;
  issues: CloudSyncContractIssue[];
  records: CloudSyncContractQuarantineRecord[];
}

export interface CloudSyncContractQuarantineResult<TData extends CloudSyncContractData = CloudSyncContractData> {
  data: TData;
  groups: CloudSyncContractQuarantineGroup[];
}

interface DuplicateResolution {
  records: any[];
  uuidAliases: Map<string, string>;
  idTargets: Map<string, Set<any>>;
  merges: CloudSyncBusinessKeyMerge[];
}

interface RelationDefinition {
  collection: 'categories' | 'prompts' | 'promptVariables' | 'promptHistories';
  relation: CloudSyncContractIssue['relation'];
  targetCollection: 'categories' | 'prompts';
  uuidField: 'categoryUuid' | 'parentUuid' | 'promptUuid';
  idField: 'categoryId' | 'parentId' | 'promptId';
  required: boolean;
}

const BUSINESS_UNIQUE_COLLECTIONS = [
  { collection: 'categories', field: 'name' },
  { collection: 'aiConfigs', field: 'configId' },
  { collection: 'aiHistory', field: 'historyId' }
] as const;

const RELATIONS: readonly RelationDefinition[] = [
  {
    collection: 'categories',
    relation: 'parentCategory',
    targetCollection: 'categories',
    uuidField: 'parentUuid',
    idField: 'parentId',
    required: false
  },
  {
    collection: 'prompts',
    relation: 'category',
    targetCollection: 'categories',
    uuidField: 'categoryUuid',
    idField: 'categoryId',
    required: false
  },
  {
    collection: 'promptVariables',
    relation: 'prompt',
    targetCollection: 'prompts',
    uuidField: 'promptUuid',
    idField: 'promptId',
    required: true
  },
  {
    collection: 'promptHistories',
    relation: 'prompt',
    targetCollection: 'prompts',
    uuidField: 'promptUuid',
    idField: 'promptId',
    required: true
  },
  {
    collection: 'promptHistories',
    relation: 'category',
    targetCollection: 'categories',
    uuidField: 'categoryUuid',
    idField: 'categoryId',
    required: false
  }
];

export function getCloudSyncCollectionContract(
  collection: CloudSyncContractCollection
): CloudSyncCollectionContract {
  return CLOUD_SYNC_COLLECTION_CONTRACT[collection];
}

export function getCloudSyncStableIdentity(
  collection: CloudSyncContractCollection,
  record: any
): string | undefined {
  const contract = CLOUD_SYNC_COLLECTION_CONTRACT[collection];
  for (const field of contract.stableIdentityFields) {
    const value = normalizeIdentityValue(record?.[field]);
    if (value !== undefined) {
      return `${field}:${value}`;
    }
  }
  return undefined;
}

/**
 * Reconciles database-level unique keys and relations before a snapshot is
 * written. Input objects are never mutated.
 */
export function reconcileCloudSyncDataContract<TData extends CloudSyncContractData>(
  input: TData,
  base?: CloudSyncContractData
): CloudSyncContractResult<TData> {
  const data = cloneValue(input) as TData;
  const baseData = base ? cloneValue(base) : undefined;
  const merges: CloudSyncBusinessKeyMerge[] = [];
  const resolutions = new Map<CloudSyncContractCollection, DuplicateResolution>();

  for (const collection of Object.keys(CLOUD_SYNC_COLLECTION_CONTRACT) as CloudSyncContractCollection[]) {
    const records = getCollectionRecords(data, collection);
    resolutions.set(collection, {
      records,
      uuidAliases: new Map<string, string>(),
      idTargets: buildDirectIdTargets(records),
      merges: []
    });
  }

  for (const definition of BUSINESS_UNIQUE_COLLECTIONS) {
    const current = resolutions.get(definition.collection)!;
    const resolution = resolveBusinessKeyDuplicates(
      definition.collection,
      definition.field,
      current.records,
      baseData ? getCollectionRecords(baseData, definition.collection) : []
    );
    resolutions.set(definition.collection, resolution);
    data[definition.collection] = resolution.records;
    merges.push(...resolution.merges);
  }

  // Non-business-key collections still need numeric-ID indexes for relation
  // recovery. Rebuild every index after canonical records have been selected.
  for (const [collection, resolution] of resolutions) {
    if (!BUSINESS_UNIQUE_COLLECTIONS.some(item => item.collection === collection)) {
      resolution.idTargets = buildDirectIdTargets(resolution.records);
    }
  }

  const { issues, repairs } = rewriteRelations(data, resolutions);
  return {
    data,
    issues: sortIssues(issues),
    merges,
    repairs: sortRepairs(repairs),
    valid: issues.length === 0
  };
}

/**
 * Removes child rows whose prompt was conclusively removed by a tombstone.
 * If the prompt survived because it is newer than the tombstone, children are
 * preserved and normal relation validation still applies.
 */
export function pruneCloudSyncTombstonedPromptChildren<TData extends CloudSyncContractData>(
  input: TData,
  base?: CloudSyncContractData
): TData {
  const data = cloneValue(input) as TData;
  const prompts = getCollectionRecords(data, 'prompts');
  const livePromptUuids = new Set(prompts.map(prompt => normalizeIdentityValue(prompt?.uuid)).filter(Boolean));
  const livePromptIds = new Set(prompts.map(prompt => normalizeIdentityValue(prompt?.id)).filter(Boolean));
  const deletedPromptUuids = new Set<string>();
  const deletedPromptIds = new Set<string>();
  const basePromptIdByUuid = new Map<string, string>();
  for (const prompt of base ? getCollectionRecords(base, 'prompts') : []) {
    const uuid = normalizeIdentityValue(prompt?.uuid);
    const id = normalizeIdentityValue(prompt?.id);
    if (uuid && id) basePromptIdByUuid.set(uuid, id);
  }

  for (const tombstone of getCollectionRecords(data, 'syncTombstones')) {
    if (tombstone?.collectionName !== 'prompts') continue;
    const snapshotUuid = normalizeIdentityValue(tombstone?.recordSnapshot?.uuid);
    const snapshotId = normalizeIdentityValue(tombstone?.recordSnapshot?.id);
    const recordUuid = normalizeIdentityValue(tombstone?.recordUuid);
    const keyUuid = typeof tombstone?.recordKey === 'string'
      ? tombstone.recordKey.match(/^uuid:(.+)$/)?.[1]
      : undefined;
    const keyId = typeof tombstone?.recordKey === 'string'
      ? tombstone.recordKey.match(/^id:(.+)$/)?.[1]
      : undefined;
    for (const uuid of [snapshotUuid, recordUuid, keyUuid]) if (uuid) deletedPromptUuids.add(uuid);
    for (const id of [snapshotId, keyId]) if (id) deletedPromptIds.add(id);
    for (const uuid of [snapshotUuid, recordUuid, keyUuid]) {
      const baseId = uuid ? basePromptIdByUuid.get(uuid) : undefined;
      if (baseId) deletedPromptIds.add(baseId);
    }
  }

  for (const collection of ['promptVariables', 'promptHistories'] as const) {
    data[collection] = getCollectionRecords(data, collection).filter(record => {
      const promptUuid = normalizeIdentityValue(record?.promptUuid);
      const promptId = normalizeIdentityValue(record?.promptId);
      if (promptUuid && livePromptUuids.has(promptUuid)) return true;
      if (!promptUuid && promptId && livePromptIds.has(promptId)) return true;
      return !(
        (promptUuid && deletedPromptUuids.has(promptUuid)) ||
        (promptId && deletedPromptIds.has(promptId))
      );
    });
  }

  return data;
}

/**
 * Removes unresolved records as dependency-complete groups while preserving
 * their exact payloads for a v2 quarantine bundle.
 */
export function quarantineCloudSyncContractIssues<TData extends CloudSyncContractData>(
  input: TData,
  issues: CloudSyncContractIssue[]
): CloudSyncContractQuarantineResult<TData> {
  const data = cloneValue(input) as TData;
  const groups = issues.map(issue => {
    const selected = new Map<CloudSyncContractCollection, Set<string>>();
    addSelectedIdentity(selected, issue.collection, issue.recordIdentity);
    expandQuarantineDependencies(data, selected);
    const records: CloudSyncContractQuarantineRecord[] = [];

    for (const collection of Object.keys(CLOUD_SYNC_COLLECTION_CONTRACT) as CloudSyncContractCollection[]) {
      const identities = selected.get(collection);
      if (!identities?.size) continue;
      for (const record of getCollectionRecords(data, collection)) {
        const identity = safeRecordIdentity(collection, record);
        if (identities.has(identity)) {
          records.push({ collection, recordIdentity: identity, payload: cloneValue(record) });
        }
      }
    }

    records.sort((left, right) =>
      `${left.collection}:${left.recordIdentity}`.localeCompare(`${right.collection}:${right.recordIdentity}`)
    );
    return {
      groupId: createStableChecksum({
        issues: [issue],
        records: records.map(record => [record.collection, record.recordIdentity])
      }),
      issues: [issue],
      records
    };
  });

  const mergedGroups = mergeOverlappingQuarantineGroups(groups);
  const quarantined = new Map<CloudSyncContractCollection, Set<string>>();
  for (const group of mergedGroups) {
    for (const record of group.records) addSelectedIdentity(quarantined, record.collection, record.recordIdentity);
  }
  for (const collection of Object.keys(CLOUD_SYNC_COLLECTION_CONTRACT) as CloudSyncContractCollection[]) {
    const identities = quarantined.get(collection);
    if (identities?.size) {
      data[collection] = getCollectionRecords(data, collection)
        .filter(record => !identities.has(safeRecordIdentity(collection, record)));
    }
  }

  return { data, groups: mergedGroups };
}

function addSelectedIdentity(
  selected: Map<CloudSyncContractCollection, Set<string>>,
  collection: CloudSyncContractCollection,
  identity: string
): void {
  const identities = selected.get(collection) || new Set<string>();
  identities.add(identity);
  selected.set(collection, identities);
}

function expandQuarantineDependencies(
  data: CloudSyncContractData,
  selected: Map<CloudSyncContractCollection, Set<string>>
): void {
  let changed = true;
  while (changed) {
    changed = false;
    const selectedCategoryUuids = selectedRecordUuids(data, selected, 'categories');
    const selectedCategoryIds = selectedRecordIds(data, selected, 'categories');
    const selectedPromptUuids = selectedRecordUuids(data, selected, 'prompts');
    const selectedPromptIds = selectedRecordIds(data, selected, 'prompts');

    for (const category of getCollectionRecords(data, 'categories')) {
      const identity = safeRecordIdentity('categories', category);
      if (selected.get('categories')?.has(identity)) continue;
      if (
        (category.parentUuid && selectedCategoryUuids.has(String(category.parentUuid))) ||
        (category.parentId !== undefined && selectedCategoryIds.has(String(category.parentId)))
      ) {
        addSelectedIdentity(selected, 'categories', identity);
        changed = true;
      }
    }
    for (const prompt of getCollectionRecords(data, 'prompts')) {
      const identity = safeRecordIdentity('prompts', prompt);
      if (selected.get('prompts')?.has(identity)) continue;
      if (
        (prompt.categoryUuid && selectedCategoryUuids.has(String(prompt.categoryUuid))) ||
        (prompt.categoryId !== undefined && selectedCategoryIds.has(String(prompt.categoryId)))
      ) {
        addSelectedIdentity(selected, 'prompts', identity);
        changed = true;
      }
    }
    for (const collection of ['promptVariables', 'promptHistories'] as const) {
      for (const record of getCollectionRecords(data, collection)) {
        const identity = safeRecordIdentity(collection, record);
        if (selected.get(collection)?.has(identity)) continue;
        if (
          (record.promptUuid && selectedPromptUuids.has(String(record.promptUuid))) ||
          (record.promptId !== undefined && selectedPromptIds.has(String(record.promptId)))
        ) {
          addSelectedIdentity(selected, collection, identity);
          changed = true;
        }
      }
    }
  }
}

function selectedRecordUuids(
  data: CloudSyncContractData,
  selected: Map<CloudSyncContractCollection, Set<string>>,
  collection: 'categories' | 'prompts'
): Set<string> {
  return new Set(getCollectionRecords(data, collection)
    .filter(record => selected.get(collection)?.has(safeRecordIdentity(collection, record)))
    .map(record => normalizeIdentityValue(record?.uuid))
    .filter((value): value is string => !!value));
}

function selectedRecordIds(
  data: CloudSyncContractData,
  selected: Map<CloudSyncContractCollection, Set<string>>,
  collection: 'categories' | 'prompts'
): Set<string> {
  return new Set(getCollectionRecords(data, collection)
    .filter(record => selected.get(collection)?.has(safeRecordIdentity(collection, record)))
    .map(record => normalizeIdentityValue(record?.id))
    .filter((value): value is string => !!value));
}

function mergeOverlappingQuarantineGroups(
  groups: CloudSyncContractQuarantineGroup[]
): CloudSyncContractQuarantineGroup[] {
  const result: CloudSyncContractQuarantineGroup[] = [];
  for (const group of groups) {
    const keys = new Set(group.records.map(record => `${record.collection}:${record.recordIdentity}`));
    const overlapIndex = result.findIndex(existing =>
      existing.records.some(record => keys.has(`${record.collection}:${record.recordIdentity}`))
    );
    if (overlapIndex < 0) {
      result.push(group);
      continue;
    }
    const existing = result[overlapIndex];
    const recordsByKey = new Map(
      [...existing.records, ...group.records]
        .map(record => [`${record.collection}:${record.recordIdentity}`, record] as const)
    );
    const issues = [...existing.issues, ...group.issues];
    const records = Array.from(recordsByKey.values()).sort((left, right) =>
      `${left.collection}:${left.recordIdentity}`.localeCompare(`${right.collection}:${right.recordIdentity}`)
    );
    result[overlapIndex] = {
      groupId: createStableChecksum({
        issues,
        records: records.map(record => [record.collection, record.recordIdentity])
      }),
      issues,
      records
    };
  }
  return result;
}

function resolveBusinessKeyDuplicates(
  collection: 'categories' | 'aiConfigs' | 'aiHistory',
  field: 'name' | 'configId' | 'historyId',
  records: any[],
  baseRecords: any[]
): DuplicateResolution {
  const groups = new Map<string, any[]>();
  const recordsWithoutBusinessKey: any[] = [];

  for (const record of records) {
    const key = normalizeBusinessKey(record?.[field]);
    if (key === undefined) {
      recordsWithoutBusinessKey.push(record);
      continue;
    }
    const group = groups.get(key) || [];
    group.push(record);
    groups.set(key, group);
  }

  const baseByBusinessKey = new Map<string, any>();
  for (const record of baseRecords) {
    const key = normalizeBusinessKey(record?.[field]);
    if (key !== undefined && !baseByBusinessKey.has(key)) {
      baseByBusinessKey.set(key, record);
    }
  }

  const uuidAliases = new Map<string, string>();
  const idTargets = new Map<string, Set<any>>();
  const merges: CloudSyncBusinessKeyMerge[] = [];
  const output = [...recordsWithoutBusinessKey];

  for (const key of Array.from(groups.keys()).sort()) {
    const group = groups.get(key)!;
    const baseRecord = baseByBusinessKey.get(key);
    const canonical = mergeDuplicateGroup(group, baseRecord, field);
    output.push(canonical);

    const canonicalUuid = normalizeIdentityValue(canonical.uuid);
    for (const source of group) {
      const sourceUuid = normalizeIdentityValue(source?.uuid);
      if (sourceUuid && canonicalUuid) {
        uuidAliases.set(sourceUuid, canonicalUuid);
      }
      const sourceId = normalizeIdentityValue(source?.id);
      if (sourceId) {
        addIdTarget(idTargets, sourceId, canonical);
      }
    }

    if (group.length > 1) {
      const mergedRecordIdentities = group
        .map(record => safeRecordIdentity(collection, record))
        .sort();
      merges.push({
        collection,
        businessKeyField: field,
        // Fingerprint only non-content record identities. Hashing the actual
        // category/config key would still permit dictionary-based disclosure.
        businessKeyFingerprint: createStableChecksum({ collection, field, mergedRecordIdentities }),
        canonicalUuid,
        mergedRecordIdentities
      });
    }
  }

  for (const record of recordsWithoutBusinessKey) {
    const id = normalizeIdentityValue(record?.id);
    if (id) {
      addIdTarget(idTargets, id, record);
    }
  }

  output.sort((left, right) => compareCanonicalCandidates(left, right, field));
  return { records: output, uuidAliases, idTargets, merges };
}

function mergeDuplicateGroup(group: any[], baseRecord: any, businessKeyField: string): any {
  const baseUuid = normalizeIdentityValue(baseRecord?.uuid);
  const candidates = [...group].sort((left, right) => {
    if (baseUuid) {
      const leftMatchesBase = normalizeIdentityValue(left?.uuid) === baseUuid;
      const rightMatchesBase = normalizeIdentityValue(right?.uuid) === baseUuid;
      if (leftMatchesBase !== rightMatchesBase) {
        return leftMatchesBase ? -1 : 1;
      }
    }
    return compareCanonicalCandidates(left, right, businessKeyField);
  });

  const canonicalSource = candidates[0];
  const canonical = cloneValue(canonicalSource);
  const byUpdateOrder = [...group].sort((left, right) => {
    const leftTime = normalizeTimestamp(left?.updatedAt ?? left?.createdAt);
    const rightTime = normalizeTimestamp(right?.updatedAt ?? right?.createdAt);
    if (leftTime !== rightTime) return leftTime - rightTime;
    return compareCanonicalCandidates(left, right, businessKeyField);
  });
  for (const candidate of byUpdateOrder) {
    mergeDefinedFields(canonical, candidate, new Set(['id', 'uuid', businessKeyField, 'createdAt']));
  }
  canonical.id = canonicalSource?.id;
  canonical.createdAt = canonicalSource?.createdAt;
  canonical[businessKeyField] = canonicalSource?.[businessKeyField];
  if (baseUuid) {
    canonical.uuid = baseUuid;
  } else {
    canonical.uuid = canonicalSource?.uuid;
  }
  return canonical;
}

function compareCanonicalCandidates(left: any, right: any, businessKeyField: string): number {
  const createdAtOrder = normalizeTimestamp(left?.createdAt) - normalizeTimestamp(right?.createdAt);
  if (createdAtOrder !== 0) {
    return createdAtOrder;
  }
  const uuidOrder = compareText(
    normalizeIdentityValue(left?.uuid) || '',
    normalizeIdentityValue(right?.uuid) || ''
  );
  if (uuidOrder !== 0) {
    return uuidOrder;
  }
  const keyOrder = compareText(
    normalizeBusinessKey(left?.[businessKeyField]) || '',
    normalizeBusinessKey(right?.[businessKeyField]) || ''
  );
  if (keyOrder !== 0) {
    return keyOrder;
  }
  const idOrder = compareText(
    normalizeIdentityValue(left?.id) || '',
    normalizeIdentityValue(right?.id) || ''
  );
  if (idOrder !== 0) {
    return idOrder;
  }
  return compareText(stableSerialize(left), stableSerialize(right));
}

function mergeDefinedFields(target: any, source: any, excludedFields: Set<string>): void {
  if (!source || typeof source !== 'object') {
    return;
  }
  for (const key of Object.keys(source).sort()) {
    if (!excludedFields.has(key) && source[key] !== undefined) {
      target[key] = cloneValue(source[key]);
    }
  }
}

function rewriteRelations(
  data: CloudSyncContractData,
  resolutions: Map<CloudSyncContractCollection, DuplicateResolution>
): { issues: CloudSyncContractIssue[]; repairs: CloudSyncRelationRepair[] } {
  const issues: CloudSyncContractIssue[] = [];
  const repairs: CloudSyncRelationRepair[] = [];

  for (const definition of RELATIONS) {
    const records = getCollectionRecords(data, definition.collection);
    const targets = resolutions.get(definition.targetCollection)!;
    const targetByUuid = new Map<string, any>();
    for (const target of targets.records) {
      const uuid = normalizeIdentityValue(target?.uuid);
      if (uuid) {
        targetByUuid.set(uuid, target);
      }
    }

    for (const record of records) {
      rewriteRelation(record, definition, targets, targetByUuid, issues, repairs);
    }
  }
  return { issues, repairs };
}

function getCollectionRecords(
  data: CloudSyncContractData,
  collection: CloudSyncContractCollection
): any[] {
  const value = data[collection];
  return Array.isArray(value) ? value : [];
}

function rewriteRelation(
  record: any,
  definition: RelationDefinition,
  targets: DuplicateResolution,
  targetByUuid: Map<string, any>,
  issues: CloudSyncContractIssue[],
  repairs: CloudSyncRelationRepair[]
): void {
  const referenceUuid = normalizeIdentityValue(record?.[definition.uuidField]);
  const referenceId = normalizeIdentityValue(record?.[definition.idField]);
  const issueBase = {
    collection: definition.collection,
    recordIdentity: safeRecordIdentity(definition.collection, record),
    relation: definition.relation,
    targetCollection: definition.targetCollection
  } as const;

  if (referenceUuid) {
    const canonicalUuid = targets.uuidAliases.get(referenceUuid) || referenceUuid;
    const target = targetByUuid.get(canonicalUuid);
    if (!target) {
      if (!definition.required) {
        removeOptionalRelation(record, definition, issueBase, repairs, 'removed_unresolved_optional_relation');
        return;
      }
      issues.push({
        ...issueBase,
        code: 'unresolved_relation_uuid',
        referenceUuid
      });
      return;
    }
    if (definition.collection === definition.targetCollection && target === record) {
      delete record[definition.uuidField];
      delete record[definition.idField];
      if (definition.required) {
        issues.push({ ...issueBase, code: 'self_relation', referenceUuid });
      } else {
        repairs.push({ ...issueBase, code: 'removed_self_relation' });
      }
      return;
    }
    record[definition.uuidField] = canonicalUuid;
    rewriteNumericId(record, definition.idField, target?.id);
    return;
  }

  if (referenceId) {
    const matchingTargets = targets.idTargets.get(referenceId);
    if (!matchingTargets || matchingTargets.size === 0) {
      if (!definition.required) {
        removeOptionalRelation(record, definition, issueBase, repairs, 'removed_unresolved_optional_relation');
        return;
      }
      issues.push({ ...issueBase, code: 'unresolved_relation_id', referenceId });
      return;
    }
    if (matchingTargets.size > 1) {
      if (!definition.required) {
        removeOptionalRelation(record, definition, issueBase, repairs, 'removed_ambiguous_optional_relation');
        return;
      }
      issues.push({ ...issueBase, code: 'ambiguous_relation_id', referenceId });
      return;
    }
    const target = Array.from(matchingTargets)[0];
    if (definition.collection === definition.targetCollection && target === record) {
      delete record[definition.idField];
      if (definition.required) {
        issues.push({ ...issueBase, code: 'self_relation', referenceId });
      } else {
        repairs.push({ ...issueBase, code: 'removed_self_relation' });
      }
      return;
    }
    const targetUuid = normalizeIdentityValue(target?.uuid);
    if (targetUuid) {
      record[definition.uuidField] = targetUuid;
    }
    rewriteNumericId(record, definition.idField, target?.id);
    return;
  }

  if (definition.required) {
    issues.push({ ...issueBase, code: 'missing_required_relation' });
  }
}

function removeOptionalRelation(
  record: any,
  definition: RelationDefinition,
  issueBase: Omit<CloudSyncContractIssue, 'code' | 'referenceUuid' | 'referenceId'>,
  repairs: CloudSyncRelationRepair[],
  code: CloudSyncRelationRepairCode
): void {
  delete record[definition.uuidField];
  delete record[definition.idField];
  repairs.push({ ...issueBase, code });
}

function rewriteNumericId(record: any, field: string, targetId: any): void {
  if (targetId === undefined || targetId === null || targetId === '') {
    delete record[field];
    return;
  }
  record[field] = targetId;
}

function buildDirectIdTargets(records: any[]): Map<string, Set<any>> {
  const result = new Map<string, Set<any>>();
  for (const record of records) {
    const id = normalizeIdentityValue(record?.id);
    if (id) {
      addIdTarget(result, id, record);
    }
  }
  return result;
}

function addIdTarget(targets: Map<string, Set<any>>, id: string, target: any): void {
  const values = targets.get(id) || new Set<any>();
  values.add(target);
  targets.set(id, values);
}

function safeRecordIdentity(collection: CloudSyncContractCollection, record: any): string {
  return getCloudSyncStableIdentity(collection, record) ||
    (normalizeIdentityValue(record?.id) ? `id:${normalizeIdentityValue(record.id)}` : 'unknown');
}

function normalizeBusinessKey(value: any): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function normalizeIdentityValue(value: any): string | undefined {
  if (typeof value === 'string') {
    return value.length > 0 ? value : undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

function normalizeTimestamp(value: any): number {
  if (value instanceof Date) {
    const timestamp = value.getTime();
    return Number.isFinite(timestamp) ? timestamp : Number.MAX_SAFE_INTEGER;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const timestamp = new Date(value).getTime();
    return Number.isFinite(timestamp) ? timestamp : Number.MAX_SAFE_INTEGER;
  }
  return Number.MAX_SAFE_INTEGER;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortIssues(issues: CloudSyncContractIssue[]): CloudSyncContractIssue[] {
  return issues.sort((left, right) => compareText(
    `${left.collection}\u0000${left.recordIdentity}\u0000${left.relation}\u0000${left.code}`,
    `${right.collection}\u0000${right.recordIdentity}\u0000${right.relation}\u0000${right.code}`
  ));
}

function sortRepairs(repairs: CloudSyncRelationRepair[]): CloudSyncRelationRepair[] {
  return [...repairs].sort((left, right) => compareText(
    `${left.collection}\u0000${left.recordIdentity}\u0000${left.relation}\u0000${left.code}`,
    `${right.collection}\u0000${right.recordIdentity}\u0000${right.relation}\u0000${right.code}`
  ));
}

function cloneValue<T>(value: T): T {
  if (value instanceof Date) {
    return new Date(value.getTime()) as T;
  }
  if (Array.isArray(value)) {
    return value.map(item => cloneValue(item)) as T;
  }
  if (value && typeof value === 'object') {
    if (typeof Blob !== 'undefined' && value instanceof Blob) {
      return value;
    }
    const result: Record<string, any> = {};
    for (const [key, item] of Object.entries(value as Record<string, any>)) {
      result[key] = cloneValue(item);
    }
    return result as T;
  }
  return value;
}
