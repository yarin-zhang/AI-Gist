/**
 * 第一次连上一个已经有数据的存储时，先说明两边会怎么合并 (#490)。
 *
 * 只看提示词和分类：这是用户能直接看到、也最在意会不会被混在一起的数据。
 * 默认快速优化动作、设置这类数据每台设备都有，合并它们不需要用户确认。
 */

export interface CloudSyncJoinCounts {
  prompts: number;
  categories: number;
}

export interface CloudSyncJoinPreview {
  /** 两边各有对方没有的提示词或分类：合并后两边都会多出东西，要先问用户 */
  needsConfirmation: boolean;
  local: CloudSyncJoinCounts;
  remote: CloudSyncJoinCounts;
  /** 合并后大约有多少：提示词按 uuid 去重，同名分类算一个 */
  merged: CloudSyncJoinCounts;
  /** 两边都有、但不是同一条记录的分类名称，会合并成一个 */
  sameNameCategories: string[];
}

type CloudSyncJoinData = Record<string, unknown[] | undefined>;

const EMPTY_COUNTS: CloudSyncJoinCounts = { prompts: 0, categories: 0 };

/** 本机已经和这个存储同步过时用：不需要再确认 */
export function createSyncedCloudSyncJoinPreview(): CloudSyncJoinPreview {
  return {
    needsConfirmation: false,
    local: { ...EMPTY_COUNTS },
    remote: { ...EMPTY_COUNTS },
    merged: { ...EMPTY_COUNTS },
    sameNameCategories: []
  };
}

/**
 * 两边的数据都应当已经去掉了删除标记对应的记录。
 * 一边为空，或者一边的提示词和分类另一边全都有（例如同一台设备删掉存储后又加回来），
 * 合并后不会把两份数据混在一起，不用问。
 */
export function createCloudSyncJoinPreview(
  localData: CloudSyncJoinData,
  remoteData: CloudSyncJoinData
): CloudSyncJoinPreview {
  const localPrompts = liveRecords(localData.prompts);
  const remotePrompts = liveRecords(remoteData.prompts);
  const localCategories = liveRecords(localData.categories);
  const remoteCategories = liveRecords(remoteData.categories);

  const localKeys = new Set([
    ...recordKeys('local', 'prompts', localPrompts),
    ...recordKeys('local', 'categories', localCategories)
  ]);
  const remoteKeys = new Set([
    ...recordKeys('remote', 'prompts', remotePrompts),
    ...recordKeys('remote', 'categories', remoteCategories)
  ]);
  const localOnly = [...localKeys].some(key => !remoteKeys.has(key));
  const remoteOnly = [...remoteKeys].some(key => !localKeys.has(key));

  const remoteCategoryUuids = new Set(remoteCategories.map(uuidOf).filter(Boolean));
  const remoteCategoryNames = new Set(remoteCategories.map(nameOf).filter(Boolean));
  const sameNameCategories = Array.from(new Set(localCategories
    .filter(category => !remoteCategoryUuids.has(uuidOf(category)) && remoteCategoryNames.has(nameOf(category)))
    .map(nameOf)))
    .sort((left, right) => left.localeCompare(right));

  return {
    needsConfirmation: localOnly && remoteOnly,
    local: { prompts: localPrompts.length, categories: localCategories.length },
    remote: { prompts: remotePrompts.length, categories: remoteCategories.length },
    merged: {
      prompts: new Set([
        ...recordKeys('local', 'prompts', localPrompts),
        ...recordKeys('remote', 'prompts', remotePrompts)
      ]).size,
      categories: countMergedCategories([...remoteCategories, ...localCategories])
    },
    sameNameCategories
  };
}

/** 和同步引擎一样，带删除标记的记录不算 */
function liveRecords(records: unknown[] | undefined): any[] {
  return Array.isArray(records)
    ? records.filter((record: any) =>
      !!record && typeof record === 'object' &&
      record._deleted !== true && record.isDeleted !== true && record.deletedAt === undefined)
    : [];
}

function uuidOf(record: any): string {
  return typeof record?.uuid === 'string' ? record.uuid : '';
}

function nameOf(record: any): string {
  return typeof record?.name === 'string' ? record.name : '';
}

/** 没有 uuid 的旧记录各算一条，不和另一边的任何记录当成同一条 */
function recordKeys(side: 'local' | 'remote', collection: string, records: any[]): string[] {
  return records.map((record, index) => uuidOf(record)
    ? `${collection}:uuid:${uuidOf(record)}`
    : `${collection}:${side}:${index}`);
}

/** 先按 uuid 去重，再把同名的算作一个，和同步时的分类归并规则一致 */
function countMergedCategories(categories: any[]): number {
  const seenUuids = new Set<string>();
  const names = new Set<string>();
  let unnamed = 0;
  for (const category of categories) {
    const uuid = uuidOf(category);
    if (uuid) {
      if (seenUuids.has(uuid)) continue;
      seenUuids.add(uuid);
    }
    const name = nameOf(category);
    if (name) names.add(name);
    else unnamed++;
  }
  return names.size + unnamed;
}
