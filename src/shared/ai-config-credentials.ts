/**
 * 模型配置的访问凭据（API Key 等）只保存在本机 (#491)。
 *
 * 云同步快照和云端备份放在 WebDAV / iCloud 上，服务的管理员能直接读到文件内容，
 * 所以写到云端之前要去掉这些字段；同步结果写回本机时，再按 uuid / configId 把本机原有的凭据补回去。
 */

/** 属于凭据、不能离开本机的模型配置字段 */
export const AI_CONFIG_CREDENTIAL_FIELDS = ['apiKey', 'secretKey'] as const;

export type AIConfigCredentialField = typeof AI_CONFIG_CREDENTIAL_FIELDS[number];

/** 本地服务（Ollama、LM Studio）不需要 API Key；和编辑表单里的判断一致 */
const CREDENTIAL_FREE_PROVIDER_TYPES = new Set(['ollama', 'lmstudio']);

const AI_CONFIG_COLLECTION = 'aiConfigs';
const AI_CONFIG_STORE = 'ai_configs';

export function hasCredentialValue(value: unknown): boolean {
  return typeof value === 'string' && value.trim() !== '';
}

/** 这条模型配置里有没有凭据字段（空字符串也算，写到云端前都要去掉） */
export function hasAIConfigCredentialFields(config: unknown): boolean {
  if (!config || typeof config !== 'object') return false;
  return AI_CONFIG_CREDENTIAL_FIELDS.some(field => field in (config as Record<string, unknown>));
}

/**
 * 需要 API Key 的服务商却没有填写：另一台设备同步过来的配置不带凭据，需要在这台设备上补填。
 */
export function isAIConfigCredentialMissing(config: { type?: unknown; apiKey?: unknown } | null | undefined): boolean {
  if (!config) return false;
  if (typeof config.type === 'string' && CREDENTIAL_FREE_PROVIDER_TYPES.has(config.type)) return false;
  return !hasCredentialValue(config.apiKey);
}

/** 去掉一条模型配置里的凭据字段；没有凭据字段时原样返回 */
export function stripAIConfigCredentials<T>(config: T): T {
  if (!hasAIConfigCredentialFields(config)) return config;
  const stripped = { ...(config as Record<string, unknown>) };
  for (const field of AI_CONFIG_CREDENTIAL_FIELDS) {
    delete stripped[field];
  }
  return stripped as T;
}

function isAIConfigTombstone(tombstone: any): boolean {
  return tombstone?.collectionName === AI_CONFIG_COLLECTION || tombstone?.storeName === AI_CONFIG_STORE;
}

interface CredentialBearingData {
  aiConfigs?: any[];
  syncTombstones?: any[];
}

/**
 * 去掉同步数据 / 备份数据里所有模型配置凭据：aiConfigs 本身，以及删除标记里保存的被删配置副本。
 * 返回新对象，不改动传入的数据。
 */
export function stripCredentialsFromDataSet<T>(data: T): T {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  const source = data as T & CredentialBearingData;
  const result: Record<string, unknown> = { ...(source as Record<string, unknown>) };

  if (Array.isArray(source.aiConfigs)) {
    result.aiConfigs = source.aiConfigs.map(config => stripAIConfigCredentials(config));
  }

  if (Array.isArray(source.syncTombstones)) {
    result.syncTombstones = source.syncTombstones.map(tombstone => {
      if (!isAIConfigTombstone(tombstone) || !hasAIConfigCredentialFields(tombstone?.recordSnapshot)) {
        return tombstone;
      }
      return { ...tombstone, recordSnapshot: stripAIConfigCredentials(tombstone.recordSnapshot) };
    });
  }

  return result as T;
}

/** 数据里还有没有凭据字段：旧版本客户端上传过的云端快照会带着明文 API Key */
export function dataSetContainsCredentials(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const source = data as CredentialBearingData;
  if (Array.isArray(source.aiConfigs) && source.aiConfigs.some(config => hasAIConfigCredentialFields(config))) {
    return true;
  }
  return Array.isArray(source.syncTombstones) && source.syncTombstones.some(tombstone =>
    isAIConfigTombstone(tombstone) && hasAIConfigCredentialFields(tombstone?.recordSnapshot)
  );
}

type CredentialValues = Partial<Record<AIConfigCredentialField, string>>;

function pickCredentialValues(config: any): CredentialValues | null {
  const values: CredentialValues = {};
  for (const field of AI_CONFIG_CREDENTIAL_FIELDS) {
    if (hasCredentialValue(config?.[field])) values[field] = config[field];
  }
  return Object.keys(values).length > 0 ? values : null;
}

function normalizeIdentity(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

/**
 * 把本机已有的凭据补回到即将写入本机的模型配置里：先按 uuid 找，找不到再按 configId。
 * 只补对方没有值的字段；传入的记录本身带着凭据（例如恢复一份含 API Key 的本地备份）时以它为准。
 */
export function restoreLocalAIConfigCredentials<T>(
  incoming: T[],
  localConfigs: unknown[]
): { records: T[]; restored: number } {
  const byUuid = new Map<string, CredentialValues>();
  const byConfigId = new Map<string, CredentialValues>();
  for (const config of localConfigs || []) {
    const values = pickCredentialValues(config);
    if (!values) continue;
    const uuid = normalizeIdentity((config as any)?.uuid);
    const configId = normalizeIdentity((config as any)?.configId);
    if (uuid && !byUuid.has(uuid)) byUuid.set(uuid, values);
    if (configId && !byConfigId.has(configId)) byConfigId.set(configId, values);
  }

  if (byUuid.size === 0 && byConfigId.size === 0) {
    return { records: incoming, restored: 0 };
  }

  let restored = 0;
  const records = incoming.map(record => {
    const uuid = normalizeIdentity((record as any)?.uuid);
    const configId = normalizeIdentity((record as any)?.configId);
    const local = (uuid && byUuid.get(uuid)) || (configId && byConfigId.get(configId)) || null;
    if (!local) return record;

    const missing = AI_CONFIG_CREDENTIAL_FIELDS.filter(field =>
      local[field] !== undefined && !hasCredentialValue((record as any)?.[field])
    );
    if (missing.length === 0) return record;

    restored += 1;
    const next = { ...(record as Record<string, unknown>) };
    for (const field of missing) next[field] = local[field];
    return next as T;
  });

  return { records, restored };
}
