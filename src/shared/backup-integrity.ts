import { createStableChecksum } from './data-checksum';

export const BACKUP_PAYLOAD_SCHEMA_VERSION = 1;

export type BackupType = 'manual' | 'automatic';

export interface BackupMetadata {
  backupType?: BackupType;
  trigger?: string;
  deviceId?: string;
  dataChecksum?: string;
}

export interface BackupPayload<TData = any> {
  schemaVersion: typeof BACKUP_PAYLOAD_SCHEMA_VERSION;
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  size?: number;
  data: TData;
  checksum: string;
  checksumAlgorithm: 'fnv1a32';
  backupType?: BackupType;
  trigger?: string;
  deviceId?: string;
  dataChecksum?: string;
}

export interface ParsedBackupPayload<TData = any> {
  payload: BackupPayload<TData> | LegacyBackupPayload<TData>;
  data: TData;
  checksum?: string;
  legacy: boolean;
}

interface LegacyBackupPayload<TData = any> {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  size?: number;
  data: TData;
  checksum?: string;
  checksumAlgorithm?: string;
  schemaVersion?: number;
  [key: string]: any;
}

export function createBackupPayload<TData>(
  input: {
    id: string;
    name: string;
    description?: string;
    createdAt: string;
    data: TData;
  } & BackupMetadata
): BackupPayload<TData> {
  return {
    schemaVersion: BACKUP_PAYLOAD_SCHEMA_VERSION,
    id: input.id,
    name: input.name,
    description: input.description,
    createdAt: input.createdAt,
    data: input.data,
    checksum: createBackupDataChecksum(input.data),
    checksumAlgorithm: 'fnv1a32',
    backupType: input.backupType,
    trigger: input.trigger,
    deviceId: input.deviceId,
    dataChecksum: input.dataChecksum
  };
}

export function createBackupDataChecksum(data: any): string {
  return createStableChecksum(data);
}

export function parseBackupPayload<TData = any>(value: unknown): ParsedBackupPayload<TData> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('备份文件格式无效');
  }

  const payload = value as LegacyBackupPayload<TData>;
  if (!('data' in payload) || payload.data === undefined || payload.data === null) {
    throw new Error('备份文件缺少 data 字段');
  }

  if (typeof payload.id !== 'string' || !payload.id) {
    throw new Error('备份文件缺少 id 字段');
  }

  if (typeof payload.name !== 'string' || !payload.name) {
    throw new Error('备份文件缺少 name 字段');
  }

  if (typeof payload.createdAt !== 'string' || !payload.createdAt) {
    throw new Error('备份文件缺少 createdAt 字段');
  }

  if (payload.schemaVersion !== undefined && payload.schemaVersion !== BACKUP_PAYLOAD_SCHEMA_VERSION) {
    throw new Error(`不支持的备份格式版本: ${payload.schemaVersion}`);
  }

  if (payload.checksum !== undefined) {
    if (typeof payload.checksum !== 'string' || !payload.checksum) {
      throw new Error('备份文件校验码无效');
    }

    const actualChecksum = createBackupDataChecksum(payload.data);
    if (payload.checksum !== actualChecksum) {
      throw new Error('备份数据校验失败，文件可能已损坏或未完整同步');
    }
  }

  return {
    payload,
    data: payload.data,
    checksum: payload.checksum,
    legacy: payload.checksum === undefined
  };
}

export function unwrapBackupData<TData = any>(value: unknown): TData {
  if (isBackupPayload(value)) {
    return parseBackupPayload<TData>(value).data;
  }

  return value as TData;
}

export function isBackupPayload(value: unknown): boolean {
  return !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    'data' in value &&
    ('checksum' in value || 'schemaVersion' in value || 'createdAt' in value);
}
