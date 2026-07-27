import {
  createBackupDataChecksum,
  createBackupPayload,
  parseBackupPayload,
  type BackupPayload,
  type BackupType
} from '@shared/backup-integrity';
import {
  createCloudSyncSemanticChecksum,
  createCloudSyncSemanticSignature,
  type CloudSyncDataSet
} from '@shared/cloud-sync-engine';
import { normalizeForChecksum, stableSerialize } from '@shared/data-checksum';
import { PlatformDetector } from '@shared/platform';
import type { ExportResult } from '@shared/types/data-management';
import { DatabaseServiceManager } from './database-manager.service';

const WEB_BACKUPS_KEY = 'ai-gist:web:local-backups';
const WEB_BACKUP_DB_NAME = 'ai-gist-local-backups';
const WEB_BACKUP_STORE_NAME = 'backups';
const LOCAL_BACKUP_DIRECTORY = 'backups';

export interface LocalBackupInfo {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  size: number;
  backupType?: BackupType;
  trigger?: string;
  dataChecksum?: string;
  payload?: BackupPayload | Record<string, any>;
}

export interface LocalBackupRepository {
  list(): Promise<LocalBackupInfo[]>;
  write(payload: BackupPayload): Promise<LocalBackupInfo>;
  delete(backup: LocalBackupInfo): Promise<void>;
  openDirectory?(): Promise<void>;
}

export interface LocalBackupCreateOptions {
  description?: string;
  backupType?: BackupType;
  trigger?: string;
  deviceId?: string;
  data?: any;
  retention?: number;
}

export interface LocalBackupCreateResult {
  action: 'created' | 'unchanged';
  backup: LocalBackupInfo;
  deletedCount: number;
}

export interface LocalBackupServiceDeps {
  database?: { exportAllDataForBackup(): Promise<ExportResult> };
  repository?: LocalBackupRepository;
  now?: () => Date;
  createId?: () => string;
}

export class LocalBackupService {
  private readonly database: NonNullable<LocalBackupServiceDeps['database']>;
  private readonly repository: LocalBackupRepository;
  private readonly now: () => Date;
  private readonly createId: () => string;

  constructor(deps: LocalBackupServiceDeps = {}) {
    this.database = deps.database || DatabaseServiceManager.getInstance();
    this.repository = deps.repository || createLocalBackupRepository();
    this.now = deps.now || (() => new Date());
    this.createId = deps.createId || createLocalBackupId;
  }

  async list(): Promise<LocalBackupInfo[]> {
    return sortLocalBackups(await this.repository.list());
  }

  async create(options: LocalBackupCreateOptions = {}): Promise<LocalBackupCreateResult> {
    const data = options.data ?? await this.exportBackupData();
    const dataChecksum = createLocalBackupSemanticChecksum(data);
    const backups = await this.list();
    const latest = backups[0];

    if (latest && await this.backupMatches(latest, data, dataChecksum)) {
      const deletedCount = options.retention === undefined
        ? 0
        : await this.pruneAutomatic(options.retention, backups);
      return { action: 'unchanged', backup: latest, deletedCount };
    }

    const id = this.createId();
    const createdAt = this.now().toISOString();
    const name = `backup-${createdAt.split('T')[0]}-${id.slice(0, 8)}`;
    const payload = createBackupPayload({
      id,
      name,
      description: options.description || (options.backupType === 'automatic' ? '自动本地备份' : '手动本地备份'),
      createdAt,
      data,
      backupType: options.backupType || 'manual',
      trigger: options.trigger,
      deviceId: options.deviceId,
      dataChecksum
    });
    const writtenBackup = await this.repository.write(payload);
    let backup: LocalBackupInfo | undefined;
    try {
      backup = (await this.repository.list()).find(item => item.id === payload.id);
      if (!backup || !await this.backupMatches(backup, data, dataChecksum)) {
        throw new Error('本地备份写入后校验失败');
      }
    } catch (error) {
      try {
        await this.repository.delete(backup || writtenBackup);
      } catch (cleanupError) {
        console.warn('清理校验失败的本地备份失败:', cleanupError);
      }
      throw error instanceof Error ? error : new Error(String(error));
    }
    const deletedCount = options.retention === undefined
      ? 0
      : await this.pruneAutomatic(options.retention, [backup, ...backups]);
    return { action: 'created', backup, deletedCount };
  }

  async restore(backupId: string): Promise<boolean> {
    const backup = (await this.list()).find(item => item.id === backupId);
    if (!backup?.payload) throw new Error('备份不存在或内容不可读');
    const { dataRestoreService } = await import('./data-restore.service');
    const result = await dataRestoreService.restore(backup.payload, {
      source: 'local-file',
      backupId
    });
    if (!result.success) throw new Error(result.error || result.message || '恢复失败');
    return true;
  }

  async delete(backupId: string): Promise<void> {
    const backup = (await this.list()).find(item => item.id === backupId);
    if (!backup) throw new Error('备份不存在');
    await this.repository.delete(backup);
  }

  async pruneAutomatic(retention: number, backups?: LocalBackupInfo[]): Promise<number> {
    if (!Number.isFinite(retention)) return 0;
    const limit = Math.max(1, Math.round(retention));
    const automatic = (backups || await this.list())
      .filter(backup => backup.backupType === 'automatic')
      .sort(compareLocalBackupsDescending);
    const deleted = automatic.slice(limit);
    for (const backup of deleted) await this.repository.delete(backup);
    return deleted.length;
  }

  async openDirectory(): Promise<void> {
    if (!this.repository.openDirectory) {
      throw new Error('当前平台的备份保存在应用本地存储中，没有可打开的系统目录');
    }
    await this.repository.openDirectory();
  }

  private async exportBackupData(): Promise<any> {
    const result = await this.database.exportAllDataForBackup();
    if (!result.success || !result.data) {
      throw new Error(result.error || result.message || '导出本地数据失败');
    }
    return result.data;
  }

  private async backupMatches(
    backup: LocalBackupInfo,
    data: any,
    semanticChecksum: string
  ): Promise<boolean> {
    if (!backup.payload) return false;
    const parsed = parseBackupPayload(backup.payload);
    const storedSemanticChecksum = backup.dataChecksum || parsed.payload.dataChecksum;
    if (storedSemanticChecksum && storedSemanticChecksum !== semanticChecksum) return false;
    if (!storedSemanticChecksum && parsed.checksum !== createBackupDataChecksum(data)) return false;
    return createLocalBackupSemanticSignature(parsed.data) === createLocalBackupSemanticSignature(data);
  }
}

class ElectronLocalBackupRepository implements LocalBackupRepository {
  async list(): Promise<LocalBackupInfo[]> {
    const directory = await this.getDirectory();
    await window.electronAPI.fs.ensureDir(directory);
    const files = (await window.electronAPI.fs.readdir(directory)).filter(file => file.endsWith('.json'));
    const backups: LocalBackupInfo[] = [];
    for (const file of files) {
      const filePath = `${directory}/${file}`;
      try {
        const content = await window.electronAPI.fs.readFile(filePath);
        const stats = await window.electronAPI.fs.stat(filePath);
        backups.push(toLocalBackupInfo(JSON.parse(content), stats.size));
      } catch (error) {
        console.warn(`读取本地备份失败: ${file}`, error);
      }
    }
    return sortLocalBackups(backups);
  }

  async write(payload: BackupPayload): Promise<LocalBackupInfo> {
    const directory = await this.getDirectory();
    await window.electronAPI.fs.ensureDir(directory);
    const filePath = `${directory}/${payload.name}.json`;
    const content = JSON.stringify(payload, null, 2);
    const result = await window.electronAPI.fs.writeFile(filePath, content);
    if (!result.success) throw new Error('本地备份写入失败');
    const stats = await window.electronAPI.fs.stat(filePath);
    return toLocalBackupInfo(payload, stats.size);
  }

  async delete(backup: LocalBackupInfo): Promise<void> {
    const directory = await this.getDirectory();
    const result = await window.electronAPI.fs.unlink(`${directory}/${backup.name}.json`);
    if (!result.success) throw new Error('删除本地备份失败');
  }

  async openDirectory(): Promise<void> {
    const directory = await this.getDirectory();
    await window.electronAPI.fs.ensureDir(directory);
    const result = await window.electronAPI.shell.openPath(directory);
    if (!result.success) throw new Error(result.error || '无法打开备份目录');
  }

  private async getDirectory(): Promise<string> {
    const userDataPath = await window.electronAPI.app.getPath('userData');
    return `${userDataPath}/${LOCAL_BACKUP_DIRECTORY}`;
  }
}

class CapacitorLocalBackupRepository implements LocalBackupRepository {
  async list(): Promise<LocalBackupInfo[]> {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
    try {
      await Filesystem.mkdir({ path: LOCAL_BACKUP_DIRECTORY, directory: Directory.Data, recursive: true });
    } catch {
      // Directory already exists.
    }
    let entries: ({ name?: string } | string)[] = [];
    try {
      entries = (await Filesystem.readdir({ path: LOCAL_BACKUP_DIRECTORY, directory: Directory.Data })).files;
    } catch {
      return [];
    }
    const backups: LocalBackupInfo[] = [];
    for (const entry of entries) {
      const name = typeof entry === 'string' ? entry : entry.name || '';
      if (!name.endsWith('.json')) continue;
      try {
        const path = `${LOCAL_BACKUP_DIRECTORY}/${name}`;
        const result = await Filesystem.readFile({ path, directory: Directory.Data, encoding: Encoding.UTF8 });
        const content = typeof result.data === 'string' ? result.data : await result.data.text();
        backups.push(toLocalBackupInfo(JSON.parse(content), new Blob([content]).size));
      } catch (error) {
        console.warn(`读取移动端本地备份失败: ${name}`, error);
      }
    }
    return sortLocalBackups(backups);
  }

  async write(payload: BackupPayload): Promise<LocalBackupInfo> {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
    await Filesystem.mkdir({ path: LOCAL_BACKUP_DIRECTORY, directory: Directory.Data, recursive: true }).catch(() => undefined);
    const content = JSON.stringify(payload, null, 2);
    await Filesystem.writeFile({
      path: `${LOCAL_BACKUP_DIRECTORY}/${payload.name}.json`,
      data: content,
      directory: Directory.Data,
      encoding: Encoding.UTF8
    });
    return toLocalBackupInfo(payload, new Blob([content]).size);
  }

  async delete(backup: LocalBackupInfo): Promise<void> {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    await Filesystem.deleteFile({
      path: `${LOCAL_BACKUP_DIRECTORY}/${backup.name}.json`,
      directory: Directory.Data
    });
  }
}

interface WebBackupRecord {
  id: string;
  name: string;
  createdAt: string;
  size: number;
  content: string;
}

class WebLocalBackupRepository implements LocalBackupRepository {
  private fallback = new LocalStorageBackupRepository();

  async list(): Promise<LocalBackupInfo[]> {
    if (typeof indexedDB === 'undefined') return this.fallback.list();
    const records = await this.getAllRecords();
    if (records.length === 0) await this.importLegacyBackups();
    const nextRecords = records.length === 0 ? await this.getAllRecords() : records;
    return sortLocalBackups(nextRecords.map(record => toLocalBackupInfo(JSON.parse(record.content), record.size)));
  }

  async write(payload: BackupPayload): Promise<LocalBackupInfo> {
    if (typeof indexedDB === 'undefined') return this.fallback.write(payload);
    const content = JSON.stringify(payload);
    const record: WebBackupRecord = {
      id: payload.id,
      name: payload.name,
      createdAt: payload.createdAt,
      size: new Blob([content]).size,
      content
    };
    await this.withStore('readwrite', store => store.put(record));
    return toLocalBackupInfo(payload, record.size);
  }

  async delete(backup: LocalBackupInfo): Promise<void> {
    if (typeof indexedDB === 'undefined') return this.fallback.delete(backup);
    await this.withStore('readwrite', store => store.delete(backup.id));
  }

  private async importLegacyBackups(): Promise<void> {
    const legacy = await this.fallback.list();
    for (const backup of legacy) {
      if (!backup.payload) continue;
      const parsed = parseBackupPayload(backup.payload).payload;
      await this.write(parsed as BackupPayload);
    }
    if (legacy.length > 0) this.fallback.clear();
  }

  private async getAllRecords(): Promise<WebBackupRecord[]> {
    return await this.withStore<WebBackupRecord[]>('readonly', store => store.getAll());
  }

  private async withStore<T = void>(
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => IDBRequest | void
  ): Promise<T> {
    const database = await openWebBackupDatabase();
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(WEB_BACKUP_STORE_NAME, mode);
      const request = operation(transaction.objectStore(WEB_BACKUP_STORE_NAME));
      transaction.oncomplete = () => resolve((request as IDBRequest<T> | undefined)?.result as T);
      transaction.onerror = () => reject(transaction.error || new Error('浏览器本地备份事务失败'));
      transaction.onabort = () => reject(transaction.error || new Error('浏览器本地备份事务已取消'));
    });
  }
}

class LocalStorageBackupRepository implements LocalBackupRepository {
  async list(): Promise<LocalBackupInfo[]> {
    try {
      const raw = localStorage.getItem(WEB_BACKUPS_KEY);
      if (!raw) return [];
      const values = JSON.parse(raw);
      if (!Array.isArray(values)) return [];
      return values.map(value => {
        const payload = value.payload || value.data || value;
        return toLocalBackupInfo(payload, Number(value.size) || new Blob([JSON.stringify(payload)]).size);
      });
    } catch (error) {
      console.warn('读取浏览器旧版本地备份失败:', error);
      return [];
    }
  }

  async write(payload: BackupPayload): Promise<LocalBackupInfo> {
    const backup = toLocalBackupInfo(payload, new Blob([JSON.stringify(payload)]).size);
    const next = [backup, ...(await this.list())].map(item => ({ ...item, data: item.payload, payload: undefined }));
    localStorage.setItem(WEB_BACKUPS_KEY, JSON.stringify(next));
    return backup;
  }

  async delete(backup: LocalBackupInfo): Promise<void> {
    const next = (await this.list())
      .filter(item => item.id !== backup.id)
      .map(item => ({ ...item, data: item.payload, payload: undefined }));
    localStorage.setItem(WEB_BACKUPS_KEY, JSON.stringify(next));
  }

  clear(): void {
    localStorage.removeItem(WEB_BACKUPS_KEY);
  }
}

function createLocalBackupRepository(): LocalBackupRepository {
  if (PlatformDetector.isElectron()) return new ElectronLocalBackupRepository();
  if (PlatformDetector.isMobile()) return new CapacitorLocalBackupRepository();
  return new WebLocalBackupRepository();
}

function openWebBackupDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(WEB_BACKUP_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(WEB_BACKUP_STORE_NAME)) {
        database.createObjectStore(WEB_BACKUP_STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('无法打开浏览器本地备份数据库'));
  });
}

function toLocalBackupInfo(input: unknown, size: number): LocalBackupInfo {
  const parsed = parseBackupPayload(input);
  const payload = parsed.payload;
  return {
    id: payload.id,
    name: payload.name,
    description: payload.description || '本地备份',
    createdAt: payload.createdAt,
    size,
    backupType: payload.backupType,
    trigger: payload.trigger,
    dataChecksum: payload.dataChecksum,
    payload
  };
}

function createLocalBackupId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function compareLocalBackupsDescending(left: LocalBackupInfo, right: LocalBackupInfo): number {
  return Date.parse(right.createdAt) - Date.parse(left.createdAt) || right.id.localeCompare(left.id);
}

function sortLocalBackups(backups: LocalBackupInfo[]): LocalBackupInfo[] {
  return [...backups].sort(compareLocalBackupsDescending);
}

export function createLocalBackupSemanticChecksum(data: any): string {
  try {
    return `semantic-v1:${createCloudSyncSemanticChecksum({
      ...(data as CloudSyncDataSet),
      syncTombstones: Array.isArray(data?.syncTombstones) ? data.syncTombstones : []
    })}`;
  } catch {
    return `raw-v1:${createBackupDataChecksum(data)}`;
  }
}

export function createLocalBackupSemanticSignature(data: any): string {
  try {
    return `semantic-v1:${createCloudSyncSemanticSignature({
      ...(data as CloudSyncDataSet),
      syncTombstones: Array.isArray(data?.syncTombstones) ? data.syncTombstones : []
    })}`;
  } catch {
    return `raw-v1:${stableSerialize(normalizeForChecksum(data))}`;
  }
}

export const localBackupService = new LocalBackupService();
