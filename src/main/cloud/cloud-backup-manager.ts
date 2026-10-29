// 标准库导入
import fs from 'fs/promises';
import path from 'path';

// 第三方库导入
import { ipcMain } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import { BrowserWindow } from 'electron';

// 本地模块导入
import { 
  CloudStorageConfig, 
  CloudBackupCreateOptions,
  CloudBackupDeleteTarget,
  WebDAVConfig, 
  ICloudConfig, 
  CloudBackupInfo, 
  CloudBackupResult, 
  CloudRestoreResult,
  CloudFileInfo,
  CloudFileWriteOptions,
  CloudFileWriteResult,
  CloudStorageProvider,
  CloudConnectionCheckResult
} from '@shared/types/cloud-backup';
import {
  CLOUD_SYNC_MANIFEST_BACKUP_FILE,
  CLOUD_SYNC_MANIFEST_FILE,
  CLOUD_BACKUP_FILE_EXTENSION,
  CLOUD_BACKUP_FILE_PREFIX,
  getCloudBackupDirectoryPath,
  getCloudBackupFilePath,
  getCloudSyncSnapshotFileName,
  getCloudSyncSnapshotRevisionFromFileName,
  getCloudSyncSnapshotsDirectoryRelativePath,
  getCloudSyncV2DirectoryPath,
  isCloudBackupFileName,
  joinCloudPath
} from '@shared/cloud-backup-paths';
import type { CloudSyncSnapshot } from '@shared/cloud-sync-engine';
import type {
  CloudSyncManifest,
  CloudSyncManifestSaveOptions
} from '@shared/cloud-sync-manifest';
import {
  assertValidCloudSyncManifest,
  createCloudSyncManifestRevisionConflictError,
  doesCloudSyncManifestMatchExpectedRevision,
  getCloudSyncManifestRevision,
  readCloudSyncManifestWithFallback
} from '@shared/cloud-sync-manifest';
import type {
  CloudSyncRemoteSnapshotInfo
} from '@shared/cloud-sync-snapshots';
import type {
  CloudSyncV2ObjectWriteOptions,
  CloudSyncV2ObjectWriteResult,
  CloudSyncV2StoredObject,
  CloudSyncV2StoredObjectInfo
} from '@shared/cloud-sync-v2-repository';
import {
  assertValidCloudSyncSnapshotFile,
  createCloudSyncSnapshotFile
} from '@shared/cloud-sync-snapshots';
import { WebDAVProvider } from './webdav-provider';
import { ICloudProvider } from './icloud-provider';
import {
  decodeStoredStorageConfigs,
  encodeStorageConfigsForDisk,
  getPasswordEncryptionUnavailableReason,
  reportPlaintextPasswordFallback,
  resolveSafeStorage
} from './storage-config-secrets';
import { DataManagementService } from '../data/data-management-service';
import {
  createBackupPayload,
  parseBackupPayload
} from '@shared/backup-integrity';

/**
 * 保存存储配置前连不上存储。界面按 errorCode 用「测试连接」同一套说明告诉用户怎么改，
 * message 只放服务器原样返回的内容，供技术详情和日志使用。
 */
class StorageConnectionError extends Error {
  readonly code = 'CONNECTION_FAILED' as const;
}

/**
 * 常量定义
 */
const CONSTANTS = {
  CONFIG_FILE: 'cloud-config.json',
  CONFIG_DIR: '.ai-gist',
  BACKUP_FILE_EXTENSION: CLOUD_BACKUP_FILE_EXTENSION,
  BACKUP_FILE_PREFIX: CLOUD_BACKUP_FILE_PREFIX,
  ERROR_MESSAGES: {
    ICLOUD_PATH_EMPTY: 'iCloud 路径不能为空',
    CONFIG_NOT_FOUND: '配置不存在',
    STORAGE_CONFIG_NOT_FOUND: '存储配置不存在',
    CONNECTION_TEST_FAILED: '连接测试失败',
    BACKUP_FILE_NOT_FOUND: '备份文件不存在',
    BACKUP_PARSE_FAILED: '解析备份文件失败',
    SAVE_CONFIG_FAILED: '保存存储配置失败',
    UNSUPPORTED_STORAGE_TYPE: '不支持的存储类型',
    UNKNOWN_ERROR: '未知错误'
  },
  SUCCESS_MESSAGES: {
    BACKUP_CREATED: '云端备份创建成功',
    BACKUP_RESTORED: '云端备份恢复成功',
    BACKUP_DELETED: '云端备份删除成功'
  },
  LOG_MESSAGES: {
    ICLOUD_AVAILABILITY_CHECK_FAILED: '检测 iCloud 可用性失败',
    GET_STORAGE_CONFIGS_FAILED: '获取存储配置失败',
    ADD_STORAGE_CONFIG_FAILED: '添加存储配置失败',
    UPDATE_STORAGE_CONFIG_FAILED: '更新存储配置失败',
    DELETE_STORAGE_CONFIG_FAILED: '删除存储配置失败',
    TEST_STORAGE_CONNECTION_FAILED: '测试存储连接失败',
    GET_BACKUP_LIST_FAILED: '获取云端备份列表失败',
    CREATE_BACKUP_FAILED: '创建云端备份失败',
    RESTORE_BACKUP_FAILED: '恢复云端备份失败',
    DELETE_BACKUP_FAILED: '删除云端备份失败',
    SAVE_CONFIG_FAILED: '保存存储配置失败'
  }
} as const;

/** 同步 manifest 的本地缓存：只在 ETag 证明云端还是这一份时使用 (#487) */
interface SyncManifestReadCacheEntry {
  /** 缓存对应的存储位置（类型、地址、账号、manifest 路径）；配置改了地址或账号就不再匹配 */
  location: string;
  etag: string;
  content: Buffer;
}

/** 主文件这一次是怎么读到的 */
interface PrimarySyncManifestRead {
  manifest: CloudSyncManifest;
  /** 这次 GET 响应里的 ETag，用于之后的条件写；从缓存返回时没有 */
  readEtag?: string;
  /** 这次下载的原文和要和它一起缓存的 ETag；从缓存返回时没有 */
  downloaded?: { content: Buffer; etag?: string };
}

/**
 * 云端备份管理器
 * 负责管理云端存储配置、备份创建、恢复和删除等操作
 */
export class CloudBackupManager {
  // ==================== 私有属性 ====================
  private storageConfigs = new Map<string, CloudStorageConfig>();
  /**
   * 每个存储最近一次读到或写入的同步 manifest：revision 和对应的 ETag。
   * 下次保存基于同一个 revision 时直接拿它做 If-Match 条件写，不必先把整份 manifest 再读一遍 (#486)
   */
  private syncManifestEtags = new Map<string, { revision: string | null; etag: string; source: 'read' | 'write' }>();
  /** 本次运行中已经确认同步目录存在的存储 */
  private verifiedSyncDirectories = new Set<string>();
  /** GET 响应里的 ETag 拿去条件写会被拒绝的存储（服务器两处 ETag 写法不一致），只用写后查到的 ETag */
  private storagesRejectingReadEtags = new Set<string>();
  /**
   * 每个存储最近一次从主文件读到、或者本机刚写入的 manifest 原文和对应的 ETag (#487)。
   * 下次检查带 If-None-Match（或 PROPFIND 比对 ETag），云端没变就直接用这份，不再整份下载。
   * 只缓存主文件：读到备份副本、ETag 缺失、存储地址变化或配置被修改 / 删除时都会清掉
   */
  private syncManifestReadCache = new Map<string, SyncManifestReadCacheEntry>();
  /** GET 不认 If-None-Match（没变也回 200）的存储：改用 PROPFIND 比对 ETag，变了再 GET (#487) */
  private storagesIgnoringConditionalRead = new Set<string>();
  private dataManagementService: DataManagementService;
  /** 解不开的 WebDAV 加密密码（钥匙串暂时不可用等），保存配置时原样写回，见 storage-config-secrets.ts */
  private undecryptablePasswords = new Map<string, string>();
  /** 配置文件依次写入，避免并发保存互相覆盖 */
  private configWriteQueue: Promise<void> = Promise.resolve();
  /** 旧版明文密码迁移成加密存储，同一时间只做一次 */
  private passwordMigration: Promise<void> | null = null;
  /** 迁移写入失败过（例如目录只读）：本次运行不再每次读取都重试，下一次正常保存配置时会顺带加密 */
  private passwordMigrationFailed = false;
  private configPath: string;
  private backupDir: string;

  // ==================== 构造函数和初始化 ====================

  /**
   * 构造函数
   * @param dataManagementService 数据管理服务实例
   */
  constructor(dataManagementService: DataManagementService) {
    this.dataManagementService = dataManagementService;
    this.configPath = this.buildConfigPath();
    this.backupDir = this.buildBackupDir();
    this.setupIpcHandlers();
  }

  /**
   * 构建配置文件路径
   */
  private buildConfigPath(): string {
    const baseDir = process.env.APPDATA || process.env.HOME || '';
    return path.join(baseDir, CONSTANTS.CONFIG_DIR, CONSTANTS.CONFIG_FILE);
  }

  /**
   * 构建备份目录路径
   */
  private buildBackupDir(): string {
    const userDataPath = process.env.APPDATA || 
      (process.platform === 'darwin' ? process.env.HOME + '/Library/Application Support' : process.env.HOME + '/.config');
    return path.join(userDataPath, 'ai-gist', 'backups');
  }

  // ==================== IPC 处理器设置 ====================

  /**
   * 设置 IPC 事件处理器
   */
  private setupIpcHandlers(): void {
    this.setupAvailabilityHandlers();
    this.setupConfigManagementHandlers();
    this.setupBackupManagementHandlers();
    this.setupSyncManifestHandlers();
    this.setupSyncV2ObjectStorageHandlers();
  }

  /**
   * 设置可用性检测处理器
   */
  private setupAvailabilityHandlers(): void {
    // 检测 iCloud 可用性
    ipcMain.handle('cloud:check-icloud-availability', async () => {
      try {
        return await ICloudProvider.isICloudAvailable();
      } catch (error) {
        this.debugError(CONSTANTS.LOG_MESSAGES.ICLOUD_AVAILABILITY_CHECK_FAILED, error);
        return { available: false, reasonCode: 'check-failed' };
      }
    });

    // 测试存储连接
    ipcMain.handle('cloud:test-storage-connection', async (_, config: CloudStorageConfig) => {
      try {
        this.validateICloudPath(config);
        const cleanConfig = this.createCleanConfig(config);
        const provider = this.createProvider(cleanConfig);
        return await this.checkProviderConnection(provider);
      } catch (error) {
        this.debugError(CONSTANTS.LOG_MESSAGES.TEST_STORAGE_CONNECTION_FAILED, error);
        return { 
          success: false, 
          error: this.getErrorMessage(error) 
        };
      }
    });
  }

  /**
   * 设置配置管理处理器
   */
  private setupConfigManagementHandlers(): void {
    // 获取存储配置列表
    ipcMain.handle('cloud:get-storage-configs', async () => {
      try {
        await this.loadConfigs();
        return Array.from(this.storageConfigs.values());
      } catch (error) {
        this.debugError(CONSTANTS.LOG_MESSAGES.GET_STORAGE_CONFIGS_FAILED, error);
        throw new Error(`获取存储配置失败: ${this.getErrorMessage(error)}`);
      }
    });

    // 添加存储配置
    ipcMain.handle('cloud:add-storage-config', async (_, config: Omit<CloudStorageConfig, 'id' | 'createdAt' | 'updatedAt'>) => {
      try {
        this.validateICloudPath(config);
        const newConfig = this.createNewConfig(config);
        await this.testAndSaveConfig(newConfig);
        return { success: true, config: newConfig };
      } catch (error) {
        this.debugError(CONSTANTS.LOG_MESSAGES.ADD_STORAGE_CONFIG_FAILED, error);
        return {
          success: false,
          error: this.getErrorMessage(error),
          ...(error instanceof StorageConnectionError ? { errorCode: error.code } : {})
        };
      }
    });

    // 更新存储配置
    ipcMain.handle('cloud:update-storage-config', async (_, id: string, config: Partial<CloudStorageConfig>) => {
      try {
        const existingConfig = this.getExistingConfig(id);
        this.validateICloudPathForUpdate(config, existingConfig);
        const updatedConfig = this.createUpdatedConfig(id, existingConfig, config);
        await this.testAndSaveConfig(updatedConfig);
        this.forgetSyncWriteState(id);
        this.storagesRejectingReadEtags.delete(id);
        this.storagesIgnoringConditionalRead.delete(id);
        return { success: true, config: updatedConfig };
      } catch (error) {
        this.debugError(CONSTANTS.LOG_MESSAGES.UPDATE_STORAGE_CONFIG_FAILED, error);
        return {
          success: false,
          error: this.getErrorMessage(error),
          ...(error instanceof StorageConnectionError ? { errorCode: error.code } : {})
        };
      }
    });

    // 删除存储配置
    ipcMain.handle('cloud:delete-storage-config', async (_, id: string) => {
      try {
        this.validateConfigExists(id);
        this.storageConfigs.delete(id);
        this.forgetSyncWriteState(id);
        this.storagesRejectingReadEtags.delete(id);
        this.storagesIgnoringConditionalRead.delete(id);
        await this.saveConfigs();
        return { success: true };
      } catch (error) {
        this.debugError(CONSTANTS.LOG_MESSAGES.DELETE_STORAGE_CONFIG_FAILED, error);
        return { 
          success: false, 
          error: this.getErrorMessage(error) 
        };
      }
    });
  }

  /**
   * 设置备份管理处理器
   */
  private setupBackupManagementHandlers(): void {
    // 获取云端备份列表
    ipcMain.handle('cloud:get-backup-list', async (_, storageId: string) => {
      try {
        const config = this.getStorageConfig(storageId);
        this.debugLog(`开始获取云端备份列表，存储类型: ${config.type}, 存储ID: ${storageId}`);
        
        const provider = this.createProvider(config);
        
        // 对于WebDAV，确保目录已初始化
        if (config.type === 'webdav' && provider.initializeDirectories) {
          try {
            this.debugLog('正在初始化WebDAV目录...');
            await provider.initializeDirectories();
            this.debugLog('WebDAV目录初始化完成');
          } catch (error) {
            this.debugWarn('WebDAV 目录初始化失败，继续尝试列出文件:', error);
          }
        }
        
        this.debugLog('正在列出文件...');
        const backupFiles = await this.listBackupCandidateFiles(provider, config);
        
        this.debugLog(`过滤后找到 ${backupFiles.length} 个备份文件`);
        
        const backups = await this.parseBackupFiles(provider, backupFiles, storageId);
        this.debugLog(`解析完成，共 ${backups.length} 个备份`);
        
        return this.sortBackupsByDate(backups);
      } catch (error) {
        this.debugError(CONSTANTS.LOG_MESSAGES.GET_BACKUP_LIST_FAILED, error);
        throw new Error(`获取云端备份列表失败: ${this.getErrorMessage(error)}`);
      }
    });

    // 创建云端备份
    ipcMain.handle('cloud:create-backup', async (_, storageId: string, options?: string | CloudBackupCreateOptions): Promise<CloudBackupResult> => {
      // 读本机数据时失败要和连不上存储分开：前者用户处理不了，界面不能让他去查密码和地址
      let localFailure = false;
      try {
        const config = this.getStorageConfig(storageId);
        // 直接通过数据库服务导出数据，然后创建备份
        const mainWindow = BrowserWindow.getAllWindows()[0];
        if (!mainWindow) {
          localFailure = true;
          throw new Error('没有找到主窗口，无法访问数据库');
        }
        
        const normalizedOptions = typeof options === 'string' ? { description: options } : options;
        let backupDataToWrite = normalizedOptions?.data;
        if (!backupDataToWrite) {
          // 手动备份未携带预导出数据时，再从渲染进程读取。
          const exportResult = await mainWindow.webContents.executeJavaScript(`
            (async () => {
              try {
                if (!window.databaseAPI || !window.databaseAPI.databaseServiceManager) {
                  throw new Error('数据库API未初始化');
                }
                const databaseServiceManager = window.databaseAPI.databaseServiceManager;
                return await databaseServiceManager.exportAllDataForBackup();
              } catch (error) {
                return {
                  success: false,
                  error: error.message || '未知错误'
                };
              }
            })()
          `);
          if (!exportResult.success) {
            localFailure = true;
            throw new Error(`获取数据失败: ${exportResult.error}`);
          }
          backupDataToWrite = exportResult.data;
        }
        
        // 创建本地备份信息
        const backupId = uuidv4();
        const timestamp = new Date().toISOString();
        const backupName = `backup-${timestamp.split('T')[0]}-${backupId.substring(0, 8)}`;
        
        const localBackup = createBackupPayload({
          id: backupId,
          name: backupName,
          description: normalizedOptions?.description || '云端备份',
          createdAt: timestamp,
          data: backupDataToWrite,
          backupType: normalizedOptions?.backupType,
          trigger: normalizedOptions?.trigger,
          deviceId: normalizedOptions?.deviceId,
          dataChecksum: normalizedOptions?.dataChecksum
        });
        
        const provider = this.createProvider(config);
        const cloudBackup = await this.uploadBackupToCloud(provider, config, localBackup);
        
        return {
          success: true,
          message: CONSTANTS.SUCCESS_MESSAGES.BACKUP_CREATED,
          backupInfo: cloudBackup,
        };
      } catch (error) {
        this.debugError(CONSTANTS.LOG_MESSAGES.CREATE_BACKUP_FAILED, error);
        return {
          success: false,
          message: '创建云端备份失败',
          error: this.getErrorMessage(error),
          ...(localFailure ? { localFailure } : {}),
        };
      }
    });

    // 从云端恢复备份
    ipcMain.handle('cloud:restore-backup', async (_, storageId: string, backupId: string): Promise<CloudRestoreResult> => {
      let localFailure = false;
      try {
        const config = this.getStorageConfig(storageId);
        const provider = this.createProvider(config);
        const backupFile = await this.findBackupFile(provider, config, backupId);
        const backupInfo = await this.readBackupData(provider, backupFile);
        // 备份已经下载下来，之后的失败都发生在写入本机数据时
        localFailure = true;
        await this.restoreBackupData(backupInfo);
        
        return {
          success: true,
          message: CONSTANTS.SUCCESS_MESSAGES.BACKUP_RESTORED,
          backupInfo: {
            ...backupInfo,
            cloudPath: backupFile.path,
            storageId,
          },
        };
      } catch (error) {
        this.debugError(CONSTANTS.LOG_MESSAGES.RESTORE_BACKUP_FAILED, error);
        return {
          success: false,
          message: '恢复云端备份失败',
          error: this.getErrorMessage(error),
          ...(localFailure ? { localFailure } : {}),
        };
      }
    });

    // 删除云端备份
    ipcMain.handle('cloud:delete-backup', async (_, storageId: string, backup: CloudBackupDeleteTarget) => {
      try {
        const config = this.getStorageConfig(storageId);
        const provider = this.createProvider(config);
        const backupFile = await this.resolveBackupFileForDelete(provider, config, backup);
        try {
          await provider.deleteFile(backupFile.path);
        } catch (error) {
          if (!this.isNotFoundError(error)) throw error;
        }
        
        return { 
          success: true, 
          message: CONSTANTS.SUCCESS_MESSAGES.BACKUP_DELETED 
        };
      } catch (error) {
        this.debugError(CONSTANTS.LOG_MESSAGES.DELETE_BACKUP_FAILED, error);
        return { 
          success: false, 
          error: this.getErrorMessage(error) 
        };
      }
    });
  }

  /**
   * 设置同步 manifest 处理器。
   * manifest 是 WebDAV/iCloud 多端同步的稳定入口，不参与普通备份列表。
   */
  private setupSyncManifestHandlers(): void {
    ipcMain.handle('cloud:get-sync-manifest', async (_, storageId: string) => {
      try {
        const manifest = await this.readCloudSyncManifest(storageId);
        return {
          success: true,
          manifest,
          // 渲染进程据此决定焦点 / 唤醒时能不能更频繁地检查 (#487)
          cheapCheckAvailable: this.canCheckSyncManifestCheaply(storageId)
        };
      } catch (error) {
        return {
          success: false,
          error: `读取云同步 manifest 失败: ${this.getErrorMessage(error)}`
        };
      }
    });

    ipcMain.handle('cloud:save-sync-manifest', async (
      _,
      storageId: string,
      manifest: CloudSyncManifest,
      options?: CloudSyncManifestSaveOptions
    ) => {
      try {
        const { verified } = await this.writeCloudSyncManifest(storageId, manifest, options);
        return { success: true, verified };
      } catch (error) {
        if (this.isCloudSyncRevisionConflictError(error)) {
          return {
            success: false,
            conflict: true,
            currentRevision: await this.tryReadCloudSyncManifestRevision(storageId),
            error: this.getErrorMessage(error)
          };
        }

        return {
          success: false,
          error: this.getErrorMessage(error)
        };
      }
    });

    ipcMain.handle('cloud:list-sync-snapshots', async (_, storageId: string) => {
      try {
        return {
          success: true,
          snapshots: await this.listCloudSyncSnapshots(storageId)
        };
      } catch (error) {
        return {
          success: false,
          error: this.getErrorMessage(error)
        };
      }
    });

    ipcMain.handle('cloud:read-sync-snapshot', async (
      _,
      storageId: string,
      snapshot: CloudSyncRemoteSnapshotInfo | string
    ) => {
      try {
        return {
          success: true,
          snapshot: await this.readCloudSyncSnapshot(storageId, snapshot)
        };
      } catch (error) {
        return {
          success: false,
          error: this.getErrorMessage(error)
        };
      }
    });

    ipcMain.handle('cloud:save-sync-snapshot', async (
      _,
      storageId: string,
      snapshot: CloudSyncSnapshot
    ) => {
      try {
        await this.writeCloudSyncSnapshot(storageId, snapshot);
        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: this.getErrorMessage(error)
        };
      }
    });

    ipcMain.handle('cloud:delete-sync-snapshot', async (
      _,
      storageId: string,
      snapshot: CloudSyncRemoteSnapshotInfo | string
    ) => {
      try {
        await this.deleteCloudSyncSnapshot(storageId, snapshot);
        return { success: true };
      } catch (error) {
        return { success: false, error: this.getErrorMessage(error) };
      }
    });
  }

  /**
   * Exposes only the protocol-v2 object namespace to the renderer. Paths are
   * validated before a provider is created so IPC callers cannot use this as
   * a general-purpose cloud filesystem API.
   */
  private setupSyncV2ObjectStorageHandlers(): void {
    ipcMain.handle('cloud:read-sync-v2-object', async (_, storageId: string, objectPath: string) =>
      this.readCloudSyncV2Object(storageId, objectPath));

    ipcMain.handle('cloud:write-sync-v2-object', async (
      _,
      storageId: string,
      objectPath: string,
      data: Uint8Array,
      options?: CloudSyncV2ObjectWriteOptions
    ) => this.writeCloudSyncV2Object(storageId, objectPath, data, options));

    ipcMain.handle('cloud:list-sync-v2-objects', async (_, storageId: string, prefix: string) =>
      this.listCloudSyncV2Objects(storageId, prefix));

    ipcMain.handle('cloud:delete-sync-v2-object', async (_, storageId: string, objectPath: string) =>
      this.deleteCloudSyncV2Object(storageId, objectPath));
  }

  // ==================== 配置验证和创建 ====================

  /**
   * 验证 iCloud 路径
   * @param config 存储配置
   */
  private validateICloudPath(config: any): void {
    if (config.type === 'icloud' && (!config.path || config.path.trim() === '')) {
      throw new Error(CONSTANTS.ERROR_MESSAGES.ICLOUD_PATH_EMPTY);
    }
  }

  /**
   * 验证更新时的 iCloud 路径
   * @param config 更新配置
   * @param existingConfig 现有配置
   */
  private validateICloudPathForUpdate(config: Partial<CloudStorageConfig>, existingConfig: CloudStorageConfig): void {
    if (config.type === 'icloud' || existingConfig.type === 'icloud') {
      const iCloudConfig = config as Partial<ICloudConfig>;
      const existingICloudConfig = existingConfig as ICloudConfig;
      const path = iCloudConfig.path ?? existingICloudConfig.path;
      if (!path || path.trim() === '') {
        throw new Error(CONSTANTS.ERROR_MESSAGES.ICLOUD_PATH_EMPTY);
      }
    }
  }

  /**
   * 创建新配置
   * @param config 基础配置
   * @returns 完整配置对象
   */
  private createNewConfig(config: Omit<CloudStorageConfig, 'id' | 'createdAt' | 'updatedAt'>): CloudStorageConfig {
    return {
      ...config,
      id: uuidv4(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * 创建更新后的配置
   * @param id 配置ID
   * @param existingConfig 现有配置
   * @param config 更新配置
   * @returns 更新后的配置对象
   */
  private createUpdatedConfig(id: string, existingConfig: CloudStorageConfig, config: Partial<CloudStorageConfig>): CloudStorageConfig {
    return {
      ...existingConfig,
      ...config,
      id,
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * 创建清理后的配置对象
   * @param config 原始配置
   * @returns 清理后的配置对象
   */
  private createCleanConfig(config: CloudStorageConfig): CloudStorageConfig {
    return {
      id: config.id,
      name: config.name,
      type: config.type,
      enabled: config.enabled,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
      ...(config.type === 'webdav' ? {
        url: (config as WebDAVConfig).url,
        username: (config as WebDAVConfig).username,
        password: (config as WebDAVConfig).password,
        requestTimeoutMs: (config as WebDAVConfig).requestTimeoutMs,
      } : {
        path: (config as ICloudConfig).path,
      })
    };
  }

  // ==================== 配置管理 ====================

  /**
   * 获取现有配置
   * @param id 配置ID
   * @returns 配置对象
   */
  private getExistingConfig(id: string): CloudStorageConfig {
    const config = this.storageConfigs.get(id);
    if (!config) {
      throw new Error(CONSTANTS.ERROR_MESSAGES.CONFIG_NOT_FOUND);
    }
    return config;
  }

  /**
   * 验证配置是否存在
   * @param id 配置ID
   */
  private validateConfigExists(id: string): void {
    if (!this.storageConfigs.has(id)) {
      throw new Error(CONSTANTS.ERROR_MESSAGES.CONFIG_NOT_FOUND);
    }
  }

  /**
   * 获取存储配置
   * @param storageId 存储ID
   * @returns 存储配置对象
   */
  private getStorageConfig(storageId: string): CloudStorageConfig {
    const config = this.storageConfigs.get(storageId);
    if (!config) {
      throw new Error(CONSTANTS.ERROR_MESSAGES.STORAGE_CONFIG_NOT_FOUND);
    }
    return config;
  }

  /**
   * 测试并保存配置
   * @param config 配置对象
   */
  private async testAndSaveConfig(config: CloudStorageConfig): Promise<void> {
    const result = await this.checkProviderConnection(this.createProvider(config));
    
    if (!result.success) {
      throw new StorageConnectionError(result.error || CONSTANTS.ERROR_MESSAGES.CONNECTION_TEST_FAILED);
    }

    this.storageConfigs.set(config.id, config);
    await this.saveConfigs();
  }

  // ==================== 备份文件处理 ====================

  /**
   * 过滤备份文件
   * @param files 文件列表
   * @returns 备份文件列表
   */
  private filterBackupFiles(files: any[]): any[] {
    return files.filter(file => isCloudBackupFileName(file.name) && !file.isDirectory);
  }

  /**
   * 列出可能包含备份文件的位置。
   * WebDAV 新版本统一使用 /AI-Gist-Backup，旧版本曾直接写入配置 URL 根目录。
   */
  private async listBackupCandidateFiles(provider: any, config: CloudStorageConfig): Promise<any[]> {
    const backupFiles: any[] = [];
    const searchPaths = this.getBackupSearchPaths(provider, config);

    for (const searchPath of searchPaths) {
      try {
        const files = await provider.listFiles(searchPath || '/');
        const filtered = this.filterBackupFiles(files);
        this.debugLog(`从 ${searchPath || '/'} 找到 ${filtered.length} 个备份文件`);
        backupFiles.push(...filtered);
      } catch (error) {
        this.debugWarn(`从 ${searchPath || '/'} 列出备份文件失败:`, error);
      }
    }

    return this.dedupeFilesByPath(backupFiles);
  }

  /**
   * 按远端路径去重，避免标准目录和旧目录搜索返回同一文件。
   */
  private dedupeFilesByPath(files: any[]): any[] {
    const seen = new Set<string>();
    return files.filter(file => {
      const key = file.path || file.name;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * 解析备份文件
   * @param provider 存储提供者
   * @param backupFiles 备份文件列表
   * @param storageId 存储ID
   * @returns 备份信息列表
   */
  private async parseBackupFiles(provider: any, backupFiles: any[], storageId: string): Promise<CloudBackupInfo[]> {
    const backups: CloudBackupInfo[] = [];
    
    for (const file of backupFiles) {
      try {
        const data = await provider.readFile(file.path);
        const parsedBackup = parseBackupPayload(JSON.parse(data.toString()));
        const backupInfo = parsedBackup.payload;
        
        // 计算文件大小（优先使用文件的实际大小，如果没有则使用数据长度）
        const size = file.size || data.length || backupInfo.size || 0;
        
        backups.push({
          ...backupInfo,
          size,
          cloudPath: file.path,
          storageId,
          checksum: parsedBackup.checksum,
          modifiedAt: file.modifiedAt,
        });
      } catch (error) {
        this.debugWarn(`${CONSTANTS.ERROR_MESSAGES.BACKUP_PARSE_FAILED}: ${file.path}`, error);
      }
    }
    
    return backups;
  }

  /**
   * 按日期排序备份
   * @param backups 备份列表
   * @returns 排序后的备份列表
   */
  private sortBackupsByDate(backups: CloudBackupInfo[]): CloudBackupInfo[] {
    return backups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  /**
   * 查找备份文件
   * @param provider 存储提供者
   * @param backupId 备份ID
   * @returns 备份文件对象
   */
  private async findBackupFile(provider: any, config: CloudStorageConfig, backupId: string): Promise<any> {
    const files = await this.listBackupCandidateFiles(provider, config);
    const backupFile = files.find((file: any) =>
      file.name.includes(backupId) &&
      file.name.endsWith(CONSTANTS.BACKUP_FILE_EXTENSION)
    );

    if (!backupFile) {
      throw new Error(CONSTANTS.ERROR_MESSAGES.BACKUP_FILE_NOT_FOUND);
    }

    return backupFile;
  }

  private async resolveBackupFileForDelete(
    provider: CloudStorageProvider,
    config: CloudStorageConfig,
    backup: CloudBackupDeleteTarget
  ): Promise<{ path: string }> {
    if (typeof backup === 'string' || !backup.cloudPath) {
      return this.findBackupFile(provider, config, typeof backup === 'string' ? backup : backup.id);
    }

    const normalizedPath = backup.cloudPath.replace(/\\/g, '/');
    const fileName = path.posix.basename(normalizedPath);
    if (!isCloudBackupFileName(fileName)) {
      throw new Error('备份删除路径无效');
    }

    const allowedPaths = new Set([
      this.getCloudPath(config, fileName).replace(/\\/g, '/'),
      `/${fileName}`,
      fileName
    ]);
    if (!allowedPaths.has(normalizedPath)) {
      throw new Error('备份删除路径超出允许的命名空间');
    }
    return { path: backup.cloudPath };
  }

  /**
   * 读取备份数据
   * @param provider 存储提供者
   * @param backupFile 备份文件
   * @returns 备份信息
   */
  private async readBackupData(provider: any, backupFile: any): Promise<any> {
    const data = await provider.readFile(backupFile.path);
    return parseBackupPayload(JSON.parse(data.toString())).payload;
  }

  /**
   * 上传备份到云端
   * @param provider 存储提供者
   * @param config 存储配置
   * @param localBackup 本地备份
   * @returns 云端备份信息
   */
  private async uploadBackupToCloud(provider: any, config: CloudStorageConfig, localBackup: any): Promise<CloudBackupInfo> {
    // 对于WebDAV，确保目录已初始化
    if (config.type === 'webdav' && provider.initializeDirectories) {
      try {
        await provider.initializeDirectories();
      } catch (error) {
        this.debugWarn('WebDAV 目录初始化失败，继续尝试写入文件:', error);
      }
    }

    const cloudFileName = `${CONSTANTS.BACKUP_FILE_PREFIX}${localBackup.id}${CONSTANTS.BACKUP_FILE_EXTENSION}`;
    const cloudPath = this.getCloudPath(config, cloudFileName);
    
    const backupData = JSON.stringify(localBackup, null, 2);
    await provider.writeFile(cloudPath, Buffer.from(backupData, 'utf-8'));

    return {
      ...localBackup,
      size: Buffer.byteLength(backupData, 'utf-8'), // 设置正确的文件大小
      cloudPath,
      storageId: config.id,
      checksum: localBackup.checksum,
    };
  }

  /**
   * 恢复备份数据
   * @param backupInfo 备份信息
   */
  private async restoreBackupData(backupInfo: any): Promise<void> {
    // 确保备份目录存在
    await fs.mkdir(this.backupDir, { recursive: true });
    
    const localBackupPath = path.join(this.backupDir, `${backupInfo.name}.json`);
    await fs.writeFile(localBackupPath, JSON.stringify(backupInfo, null, 2));
    
    // 通过渲染进程恢复数据
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (!mainWindow) {
      throw new Error('没有找到主窗口，无法访问数据库');
    }
    
    const restoreResult = await mainWindow.webContents.executeJavaScript(`
      (async () => {
        try {
          if (!window.databaseAPI || !window.databaseAPI.databaseServiceManager) {
            throw new Error('数据库API未初始化');
          }
          const databaseServiceManager = window.databaseAPI.databaseServiceManager;
          return await databaseServiceManager.replaceAllData(${JSON.stringify(backupInfo.data)});
        } catch (error) {
          return {
            success: false,
            error: error.message || '未知错误'
          };
        }
      })()
    `);
    
    if (!restoreResult.success) {
      throw new Error(`恢复数据失败: ${restoreResult.error}`);
    }
  }

  /**
   * 读取云同步 manifest。首次同步时 manifest 不存在，返回空 manifest。
   *
   * 本机有上次读到 / 写入的那份 manifest 和它的 ETag 时，先确认云端变没变，没变就不再整份下载 (#487)
   */
  private async readCloudSyncManifest(storageId: string): Promise<CloudSyncManifest> {
    await this.loadConfigs();
    const config = this.getStorageConfig(storageId);
    const provider = this.createProvider(config);
    const manifestPath = this.getSyncManifestCloudPath(config);
    const backupPath = this.getSyncManifestBackupCloudPath(config);
    const cacheLocation = this.getSyncManifestCacheLocation(config, manifestPath);
    let primary: PrimarySyncManifestRead | undefined;

    const manifest = await readCloudSyncManifestWithFallback({
      readPrimary: async () => {
        primary = await this.readPrimaryCloudSyncManifest(storageId, provider, manifestPath, cacheLocation);
        return primary.manifest;
      },
      readBackup: () => this.readCloudSyncManifestFile(provider, backupPath),
      isNotFoundError: error => this.isNotFoundError(error),
      describeError: error => this.formatErrorMessage(error)
    });

    // readPrimary 成功时才会赋值；没有值说明用的是备份副本，或者主文件、备份都不存在
    const primaryRead = primary as PrimarySyncManifestRead | undefined;
    if (!primaryRead) {
      // 主文件读不到或已损坏，云端主文件现在是什么样不清楚，缓存不能再拿来和它比对
      this.syncManifestReadCache.delete(storageId);
    } else if (primaryRead.downloaded) {
      this.rememberSyncManifestContent(
        storageId,
        cacheLocation,
        primaryRead.downloaded.etag,
        primaryRead.downloaded.content
      );
    }

    // 只有主文件读成功时 ETag 才对应这份 manifest；从备份副本读到的不能用来条件写主文件。
    // 不用这次读到的 ETag 时（包括云端没变、直接用了缓存），本机上次记下的 ETag 只要 revision 还对得上就继续留着
    const primaryEtag = primaryRead?.readEtag;
    const revision = getCloudSyncManifestRevision(manifest);
    if (primaryEtag && config.type === 'webdav' && !this.storagesRejectingReadEtags.has(storageId)) {
      this.syncManifestEtags.set(storageId, { revision, etag: primaryEtag, source: 'read' });
    } else if (this.syncManifestEtags.get(storageId)?.revision !== revision) {
      this.syncManifestEtags.delete(storageId);
    }
    return manifest;
  }

  /**
   * 读主文件。手里有这份 manifest 的缓存时先确认云端变没变 (#487)：
   * 默认带 If-None-Match 做条件 GET，304 就用缓存；
   * 服务器不认条件 GET 时先 PROPFIND 比对 ETag，一样就用缓存，不一样再整份 GET
   */
  private async readPrimaryCloudSyncManifest(
    storageId: string,
    provider: CloudStorageProvider,
    manifestPath: string,
    cacheLocation: string | null
  ): Promise<PrimarySyncManifestRead> {
    const cached = this.getSyncManifestReadCache(storageId, cacheLocation);
    if (!cached || !provider.readFileWithInfo) {
      return this.downloadPrimaryCloudSyncManifest(provider, manifestPath);
    }

    if (this.storagesIgnoringConditionalRead.has(storageId)) {
      const info = await this.getCloudFileInfo(provider, manifestPath);
      if (info?.etag && this.isSameEtag(info.etag, cached.etag)) {
        return { manifest: this.parseCloudSyncManifestContent(cached.content, manifestPath) };
      }

      // 缓存配 PROPFIND 的 ETag：之后比对的也是它。ETag 先于正文拿到，两次请求之间云端又变了的话，
      // 缓存里是新内容配旧 ETag，下次比对不上会再下载一次，不会把旧内容当成新的
      const downloaded = await this.downloadPrimaryCloudSyncManifest(provider, manifestPath);
      return {
        ...downloaded,
        downloaded: downloaded.downloaded && { content: downloaded.downloaded.content, etag: info?.etag }
      };
    }

    const result = await provider.readFileWithInfo(manifestPath, { ifNoneMatch: cached.etag });
    if (result.notModified) {
      return { manifest: this.parseCloudSyncManifestContent(cached.content, manifestPath) };
    }
    if (result.conditionIgnored) {
      // 这次已经整份下载了，内容照常用；之后这个存储改用 PROPFIND 比对，省掉没变时的下载
      this.storagesIgnoringConditionalRead.add(storageId);
    }

    const content = Buffer.from(result.data);
    return {
      manifest: this.parseCloudSyncManifestContent(content, manifestPath),
      readEtag: result.etag,
      downloaded: { content, etag: result.etag }
    };
  }

  private async downloadPrimaryCloudSyncManifest(
    provider: CloudStorageProvider,
    manifestPath: string
  ): Promise<PrimarySyncManifestRead> {
    const { manifest, etag, content } = await this.readCloudSyncManifestFileWithInfo(provider, manifestPath);
    return { manifest, readEtag: etag, downloaded: { content, etag } };
  }

  private async readCloudSyncManifestFile(
    provider: CloudStorageProvider,
    cloudPath: string
  ): Promise<CloudSyncManifest> {
    return (await this.readCloudSyncManifestFileWithInfo(provider, cloudPath)).manifest;
  }

  private async readCloudSyncManifestFileWithInfo(
    provider: CloudStorageProvider,
    cloudPath: string
  ): Promise<{ manifest: CloudSyncManifest; etag?: string; content: Buffer }> {
    const { data, etag } = provider.readFileWithInfo
      ? await provider.readFileWithInfo(cloudPath)
      : { data: await provider.readFile(cloudPath), etag: undefined };
    const content = Buffer.from(data);
    return {
      manifest: this.parseCloudSyncManifestContent(content, cloudPath),
      etag,
      content
    };
  }

  private parseCloudSyncManifestContent(content: Buffer, cloudPath: string): CloudSyncManifest {
    try {
      return assertValidCloudSyncManifest(JSON.parse(content.toString('utf-8')));
    } catch (error) {
      throw new Error(`云同步 manifest 内容无效（${cloudPath}）: ${this.formatErrorMessage(error)}`);
    }
  }

  /**
   * 缓存对应的存储位置。只有 WebDAV 需要缓存：iCloud 读的是本机同步目录里的文件，不走网络
   */
  private getSyncManifestCacheLocation(config: CloudStorageConfig, manifestPath: string): string | null {
    if (config.type !== 'webdav') {
      return null;
    }
    const webdavConfig = config as WebDAVConfig;
    return JSON.stringify([config.type, webdavConfig.url, webdavConfig.username || '', manifestPath]);
  }

  private getSyncManifestReadCache(
    storageId: string,
    cacheLocation: string | null
  ): SyncManifestReadCacheEntry | undefined {
    const cached = this.syncManifestReadCache.get(storageId);
    if (!cached) {
      return undefined;
    }
    // 存储地址或账号变了（包括没经过「编辑存储」直接改了配置文件），旧缓存对应的是另一个文件
    if (!cacheLocation || cached.location !== cacheLocation) {
      this.syncManifestReadCache.delete(storageId);
      return undefined;
    }
    return cached;
  }

  /** 记下主文件的原文和 ETag；没有 ETag 就无法确认云端是否还是这一份，干脆不缓存 */
  private rememberSyncManifestContent(
    storageId: string,
    cacheLocation: string | null,
    etag: string | undefined,
    content: Buffer
  ): void {
    if (!cacheLocation || !etag?.trim()) {
      this.syncManifestReadCache.delete(storageId);
      return;
    }
    this.syncManifestReadCache.set(storageId, { location: cacheLocation, etag, content });
  }

  /**
   * 下一次检查这个存储时，云端没变的话能不能不下载整份 manifest：
   * WebDAV 要手里有带 ETag 的缓存；iCloud 读的是本机文件，本来就不走网络
   */
  private canCheckSyncManifestCheaply(storageId: string): boolean {
    if (this.storageConfigs.get(storageId)?.type === 'icloud') {
      return true;
    }
    return this.syncManifestReadCache.has(storageId);
  }

  /** GET 响应头和 PROPFIND 里的 ETag 写法可能一个带引号一个不带，比较前去掉引号和弱标记 */
  private isSameEtag(left: string, right: string): boolean {
    const normalize = (etag: string) => etag.trim().replace(/^W\//i, '').replace(/^"(.*)"$/, '$1');
    return normalize(left) === normalize(right);
  }

  /**
   * 写入云同步 manifest。
   *
   * 基于上次读到 / 写入的 revision 保存时，直接用记住的 ETag 做 If-Match 条件写，
   * 写后只查一次文件信息确认落盘；条件写被拒绝时再退回「读一遍、比 revision、再写」(#486)。
   * 返回 verified 表示这次写入已经在主进程确认过，渲染进程不必再整份读回校验。
   */
  private async writeCloudSyncManifest(
    storageId: string,
    manifest: CloudSyncManifest,
    options: CloudSyncManifestSaveOptions = {}
  ): Promise<{ verified: boolean }> {
    await this.loadConfigs();
    const config = this.getStorageConfig(storageId);
    const provider = this.createProvider(config);
    const manifestPath = this.getSyncManifestCloudPath(config);
    const backupPath = this.getSyncManifestBackupCloudPath(config);
    const normalizedManifest = assertValidCloudSyncManifest({
      ...manifest,
      updatedAt: new Date().toISOString()
    });
    const revision = getCloudSyncManifestRevision(normalizedManifest);
    const content = Buffer.from(JSON.stringify(normalizedManifest), 'utf-8');
    const cacheLocation = this.getSyncManifestCacheLocation(config, manifestPath);
    // WebDAVProvider 写后都会校验（至少查一次文件信息），渲染进程不必再读回
    const verified = config.type === 'webdav';

    if (options.expectedRevision === undefined) {
      await this.ensureSyncDirectories(storageId, config, provider);
      const written = await provider.writeFile(manifestPath, content, this.createSyncWriteOptions(storageId));
      this.rememberWrittenSyncManifest(storageId, revision, written, cacheLocation, content);
      await this.writeSyncManifestBackup(storageId, provider, backupPath, content);
      return { verified };
    }

    const cached = this.syncManifestEtags.get(storageId);
    let cachedEtagRejected = false;
    if (config.type === 'webdav' && cached && cached.revision === options.expectedRevision) {
      // 手里有这份 manifest 的 ETag，说明它所在的目录存在，不必再逐级检查；目录被删时 PUT 会返回 409
      this.verifiedSyncDirectories.add(storageId);
      try {
        const written = await provider.writeFile(manifestPath, content, {
          ...this.createSyncWriteOptions(storageId),
          ifMatch: cached.etag
        });
        this.rememberWrittenSyncManifest(storageId, revision, written, cacheLocation, content);
        await this.writeSyncManifestBackup(storageId, provider, backupPath, content);
        return { verified };
      } catch (error) {
        this.forgetSyncWriteState(storageId);
        // 412：云端被别的设备改过，或者服务器不认这个 ETag 的写法；目录被删掉时是 409。
        // 这两种都退回完整流程判断，其余错误照常交给上层
        if (!this.isCloudSyncRevisionConflictError(error) && !this.isMissingParentDirectoryError(error)) {
          throw error;
        }
        cachedEtagRejected = true;
      }
    }

    await this.ensureSyncDirectories(storageId, config, provider);
    const primaryInfo = await this.getCloudFileInfo(provider, manifestPath);
    const currentManifest = await readCloudSyncManifestWithFallback({
      readPrimary: () => this.readCloudSyncManifestFile(provider, manifestPath),
      readBackup: () => this.readCloudSyncManifestFile(provider, backupPath),
      isNotFoundError: error => this.isNotFoundError(error),
      describeError: error => this.formatErrorMessage(error)
    });
    this.assertExpectedCloudSyncRevision(currentManifest, options.expectedRevision);
    if (cachedEtagRejected && cached?.source === 'read') {
      // revision 没变、条件写却被拒：这台服务器 GET 返回的 ETag 不能直接用于 If-Match
      this.storagesRejectingReadEtags.add(storageId);
    }

    const writeOptions = {
      ...this.createSyncWriteOptions(storageId),
      ...this.createManifestWriteOptions(primaryInfo, currentManifest, options.expectedRevision)
    };
    let written: void | CloudFileWriteResult;
    try {
      written = await provider.writeFile(manifestPath, content, writeOptions);
    } catch (error) {
      this.forgetSyncWriteState(storageId);
      if (this.isCloudSyncRevisionConflictError(error)) {
        throw createCloudSyncManifestRevisionConflictError(
          options.expectedRevision,
          getCloudSyncManifestRevision(currentManifest)
        );
      }
      throw error;
    }

    this.rememberWrittenSyncManifest(storageId, revision, written, cacheLocation, content);
    await this.writeSyncManifestBackup(storageId, provider, backupPath, content);
    return { verified };
  }

  /** 同步目录每次运行只确认一次，之后的写入不再逐级 PROPFIND */
  private async ensureSyncDirectories(
    storageId: string,
    config: CloudStorageConfig,
    provider: CloudStorageProvider
  ): Promise<void> {
    if (config.type !== 'webdav' || !provider.initializeDirectories || this.verifiedSyncDirectories.has(storageId)) {
      return;
    }

    await provider.initializeDirectories();
    this.verifiedSyncDirectories.add(storageId);
  }

  /** 备用副本只在主文件损坏时读取，PUT 成功即可，不再查文件信息 */
  private async writeSyncManifestBackup(
    storageId: string,
    provider: CloudStorageProvider,
    backupPath: string,
    content: Buffer
  ): Promise<void> {
    await provider.writeFile(backupPath, content, {
      ...this.createSyncWriteOptions(storageId),
      verify: 'none'
    });
  }

  private createSyncWriteOptions(storageId: string): CloudFileWriteOptions {
    return {
      verify: 'metadata',
      skipDirectoryCheck: this.verifiedSyncDirectories.has(storageId)
    };
  }

  /**
   * 主文件写成功后记下写后 ETag；刚写的内容也一起缓存，本机下一次检查用它做条件读取，
   * 自己刚上传的 manifest 不必再下载回来 (#487)
   */
  private rememberWrittenSyncManifest(
    storageId: string,
    revision: string | null,
    written: void | CloudFileWriteResult,
    cacheLocation: string | null,
    content: Buffer
  ): void {
    if (written?.etag) {
      this.syncManifestEtags.set(storageId, { revision, etag: written.etag, source: 'write' });
    } else {
      this.syncManifestEtags.delete(storageId);
    }
    this.rememberSyncManifestContent(storageId, cacheLocation, written?.etag, content);
  }

  /** 存储配置变了、或者写入失败后云端状态不明时调用：记下的 ETag、目录确认和 manifest 缓存都作废 */
  private forgetSyncWriteState(storageId: string): void {
    this.syncManifestEtags.delete(storageId);
    this.verifiedSyncDirectories.delete(storageId);
    this.syncManifestReadCache.delete(storageId);
  }

  private isMissingParentDirectoryError(error: unknown): boolean {
    return /\b409\b|\b404\b/.test(this.getErrorMessage(error));
  }

  private async listCloudSyncSnapshots(storageId: string): Promise<CloudSyncRemoteSnapshotInfo[]> {
    await this.loadConfigs();
    const config = this.getStorageConfig(storageId);
    const provider = this.createProvider(config);
    const snapshotsDir = this.getSyncSnapshotsDirectoryCloudPath(config);

    try {
      const files = await provider.listFiles(snapshotsDir);
      return files
        .filter(file => !file.isDirectory)
        .map(file => this.createRemoteSnapshotInfo(config, file))
        .filter((info): info is CloudSyncRemoteSnapshotInfo => !!info)
        .sort((a, b) => (b.createdAt || b.modifiedAt || '').localeCompare(a.createdAt || a.modifiedAt || ''));
    } catch (error) {
      if (this.isNotFoundError(error)) {
        return [];
      }
      throw error;
    }
  }

  private async readCloudSyncSnapshot(
    storageId: string,
    snapshot: CloudSyncRemoteSnapshotInfo | string
  ): Promise<CloudSyncSnapshot> {
    await this.loadConfigs();
    const config = this.getStorageConfig(storageId);
    const provider = this.createProvider(config);
    const snapshotInfo = this.normalizeSnapshotInfo(config, snapshot);
    const data = await provider.readFile(snapshotInfo.path);

    try {
      return assertValidCloudSyncSnapshotFile(JSON.parse(Buffer.from(data).toString('utf-8')));
    } catch (error) {
      throw new Error(`云同步快照内容无效（${snapshotInfo.path}）: ${this.formatErrorMessage(error)}`);
    }
  }

  private async writeCloudSyncSnapshot(storageId: string, snapshot: CloudSyncSnapshot): Promise<void> {
    await this.loadConfigs();
    const config = this.getStorageConfig(storageId);
    const provider = this.createProvider(config);
    const normalizedSnapshot = assertValidCloudSyncSnapshotFile(snapshot);
    const snapshotPath = this.getSyncSnapshotCloudPath(config, normalizedSnapshot.revision);
    const content = Buffer.from(
      JSON.stringify(createCloudSyncSnapshotFile(normalizedSnapshot), null, 2),
      'utf-8'
    );

    if (config.type === 'webdav' && provider.initializeDirectories) {
      await provider.initializeDirectories();
    }

    try {
      await provider.writeFile(snapshotPath, content, { ifNoneMatch: true });
    } catch (error) {
      if (!this.isCloudSyncRevisionConflictError(error)) {
        throw error;
      }

      const existingSnapshot = await this.readCloudSyncSnapshot(storageId, {
        revision: normalizedSnapshot.revision,
        path: snapshotPath
      });
      if (this.isSameCloudSyncSnapshot(existingSnapshot, normalizedSnapshot)) {
        return;
      }

      throw new Error(`云同步快照 ${normalizedSnapshot.revision} 已存在但内容不一致`);
    }
  }

  private async deleteCloudSyncSnapshot(
    storageId: string,
    snapshot: CloudSyncRemoteSnapshotInfo | string
  ): Promise<void> {
    await this.loadConfigs();
    const config = this.getStorageConfig(storageId);
    const provider = this.createProvider(config);
    const revision = typeof snapshot === 'string' ? snapshot : snapshot.revision;
    if (!revision) throw new Error('云同步快照 revision 不能为空');
    const snapshotPath = this.getSyncSnapshotCloudPath(config, revision);
    try {
      await provider.deleteFile(snapshotPath);
    } catch (error) {
      if (!this.isNotFoundError(error)) throw error;
    }
  }

  private async readCloudSyncV2Object(
    storageId: string,
    objectPath: string
  ): Promise<CloudSyncV2StoredObject | null> {
    const canonicalPath = this.assertCloudSyncV2ObjectPath(objectPath);
    const { provider, providerPath } = await this.createCloudSyncV2ProviderContext(storageId, canonicalPath);
    const info = await this.getCloudFileInfo(provider, providerPath);
    if (info?.isDirectory) {
      throw new Error(`云同步 v2 对象路径指向目录: ${canonicalPath}`);
    }

    try {
      const data = await provider.readFile(providerPath);
      return {
        data: Uint8Array.from(data),
        etag: info?.etag || (await this.getCloudFileInfo(provider, providerPath))?.etag
      };
    } catch (error) {
      if (this.isNotFoundError(error)) {
        return null;
      }
      throw error;
    }
  }

  private async writeCloudSyncV2Object(
    storageId: string,
    objectPath: string,
    data: Uint8Array,
    options: CloudSyncV2ObjectWriteOptions = {}
  ): Promise<CloudSyncV2ObjectWriteResult> {
    const canonicalPath = this.assertCloudSyncV2ObjectPath(objectPath, false);
    const bytes = this.copyCloudSyncV2Bytes(data);
    if (options.ifAbsent && options.expectedEtag !== undefined) {
      throw new Error('云同步 v2 条件写不能同时指定 ifAbsent 和 expectedEtag');
    }
    if (options.expectedEtag !== undefined && !options.expectedEtag.trim()) {
      throw new Error('云同步 v2 expectedEtag 不能为空');
    }

    const { config, provider, providerPath } = await this.createCloudSyncV2ProviderContext(storageId, canonicalPath);
    if (config.type === 'icloud' && (options.ifAbsent || options.expectedEtag !== undefined)) {
      // Desktop iCloud's stat-then-rename sequence is not an atomic CAS across
      // processes. Refuse conditional writes so v2 can never silently lose a
      // concurrent manifest update.
      return { status: 'precondition_failed' };
    }
    try {
      const writeResult = await provider.writeFile(providerPath, bytes, {
        ifNoneMatch: options.ifAbsent,
        ifMatch: options.expectedEtag
      });
      const etag = writeResult?.etag || (await this.getCloudFileInfo(provider, providerPath))?.etag;
      return { status: 'written', etag };
    } catch (error) {
      if (!this.isCloudSyncRevisionConflictError(error)) {
        throw error;
      }
      const current = await this.getCloudFileInfo(provider, providerPath).catch(() => null);
      return { status: 'precondition_failed', etag: current?.etag };
    }
  }

  private async listCloudSyncV2Objects(
    storageId: string,
    prefix: string
  ): Promise<CloudSyncV2StoredObjectInfo[]> {
    const canonicalPrefix = this.assertCloudSyncV2ObjectPath(prefix);
    const { provider, providerPath } = await this.createCloudSyncV2ProviderContext(storageId, canonicalPrefix);
    const exactInfo = await this.getCloudFileInfo(provider, providerPath);
    if (exactInfo && !exactInfo.isDirectory) {
      return [{ path: canonicalPrefix, etag: exactInfo.etag, byteLength: exactInfo.size }];
    }

    const objects: CloudSyncV2StoredObjectInfo[] = [];
    await this.collectCloudSyncV2Objects(provider, canonicalPrefix, providerPath, objects);
    if (objects.length > 0 || exactInfo?.isDirectory) {
      return objects.sort((left, right) => left.path.localeCompare(right.path));
    }

    // Object-store prefixes may end in a partial filename rather than a real
    // directory. Fall back to its parent and retain only matching object keys.
    const canonicalParent = path.posix.dirname(canonicalPrefix);
    if (canonicalParent === canonicalPrefix || !this.isCloudSyncV2PathInNamespace(canonicalParent)) {
      return [];
    }
    const parentObjects: CloudSyncV2StoredObjectInfo[] = [];
    await this.collectCloudSyncV2Objects(
      provider,
      canonicalParent,
      path.posix.dirname(providerPath),
      parentObjects
    );
    return parentObjects
      .filter(object => object.path.startsWith(canonicalPrefix))
      .sort((left, right) => left.path.localeCompare(right.path));
  }

  private async deleteCloudSyncV2Object(storageId: string, objectPath: string): Promise<void> {
    const canonicalPath = this.assertCloudSyncV2ObjectPath(objectPath, false);
    const { provider, providerPath } = await this.createCloudSyncV2ProviderContext(storageId, canonicalPath);
    try {
      await provider.deleteFile(providerPath);
    } catch (error) {
      // Object-store delete is idempotent.
      if (!this.isNotFoundError(error)) {
        throw error;
      }
    }
  }

  private async createCloudSyncV2ProviderContext(
    storageId: string,
    canonicalPath: string
  ): Promise<{ config: CloudStorageConfig; provider: CloudStorageProvider; providerPath: string }> {
    await this.loadConfigs();
    const config = this.getStorageConfig(storageId);
    const provider = this.createProvider(config);
    return {
      config,
      provider,
      providerPath: this.getCloudSyncV2ProviderPath(config, canonicalPath)
    };
  }

  private async collectCloudSyncV2Objects(
    provider: CloudStorageProvider,
    canonicalDirectory: string,
    providerDirectory: string,
    output: CloudSyncV2StoredObjectInfo[]
  ): Promise<void> {
    let entries: CloudFileInfo[];
    try {
      entries = await provider.listFiles(providerDirectory);
    } catch (error) {
      if (this.isNotFoundError(error)) {
        return;
      }
      throw error;
    }

    for (const entry of entries) {
      const name = entry.name || path.posix.basename((entry.path || '').replace(/\\/g, '/'));
      if (!this.isSafeCloudSyncV2ChildName(name)) {
        continue;
      }
      const canonicalChild = this.assertCloudSyncV2ObjectPath(`${canonicalDirectory}/${name}`);
      const providerChild = this.joinProviderCloudPath(providerDirectory, name);
      if (entry.isDirectory) {
        await this.collectCloudSyncV2Objects(provider, canonicalChild, providerChild, output);
        continue;
      }

      const currentInfo = await this.getCloudFileInfo(provider, providerChild);
      output.push({
        path: canonicalChild,
        etag: currentInfo?.etag || entry.etag,
        byteLength: currentInfo?.size ?? entry.size
      });
    }
  }

  private assertCloudSyncV2ObjectPath(objectPath: string, allowRoot = true): string {
    const root = getCloudSyncV2DirectoryPath();
    if (typeof objectPath !== 'string' || objectPath.length === 0 || objectPath !== objectPath.trim()) {
      throw new Error('云同步 v2 对象路径无效');
    }
    if (
      objectPath.includes('\\') ||
      objectPath.includes('%') ||
      objectPath.includes('?') ||
      objectPath.includes('#') ||
      this.containsControlCharacter(objectPath) ||
      objectPath.includes('//') ||
      objectPath.endsWith('/')
    ) {
      throw new Error('云同步 v2 对象路径包含不安全字符');
    }

    const segments = objectPath.split('/').slice(1);
    if (!objectPath.startsWith('/') || segments.some(segment => !segment || segment === '.' || segment === '..')) {
      throw new Error('云同步 v2 对象路径不是规范绝对路径');
    }
    if (!this.isCloudSyncV2PathInNamespace(objectPath)) {
      throw new Error('云同步 v2 对象路径超出允许的命名空间');
    }
    if (!allowRoot && objectPath === root) {
      throw new Error('云同步 v2 根目录不能作为对象写入或删除');
    }
    return objectPath;
  }

  private getCloudSyncV2ProviderPath(config: CloudStorageConfig, canonicalPath: string): string {
    if (config.type === 'webdav' && this.isWebDAVUrlAtBackupDir((config as WebDAVConfig).url)) {
      return canonicalPath.replace(getCloudBackupDirectoryPath(), '') || '/';
    }
    return canonicalPath;
  }

  private isCloudSyncV2PathInNamespace(objectPath: string): boolean {
    const root = getCloudSyncV2DirectoryPath();
    return objectPath === root || objectPath.startsWith(`${root}/`);
  }

  private joinProviderCloudPath(directory: string, name: string): string {
    return `${directory.replace(/\/+$/, '')}/${name}`;
  }

  private isSafeCloudSyncV2ChildName(name: string): boolean {
    return !!name &&
      name !== '.' &&
      name !== '..' &&
      !/[\\/%?#]/.test(name) &&
      !this.containsControlCharacter(name);
  }

  private containsControlCharacter(value: string): boolean {
    return [...value].some(character => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127;
    });
  }

  private copyCloudSyncV2Bytes(data: Uint8Array): Buffer {
    if (!(data instanceof Uint8Array)) {
      throw new Error('云同步 v2 对象内容必须是 Uint8Array');
    }
    return Buffer.from(data);
  }

  // ==================== 存储提供者管理 ====================

  /**
   * 创建存储提供者
   * @param config 存储配置
   * @returns 存储提供者实例
   */
  /**
   * 测试连接。能带回失败原因的存储（WebDAV）把服务器的原话一起返回，
   * 设置页据此说明是密码不对、地址写错还是网络的问题
   */
  private async checkProviderConnection(provider: CloudStorageProvider): Promise<CloudConnectionCheckResult> {
    if (typeof provider.checkConnection === 'function') {
      return provider.checkConnection();
    }
    return { success: await provider.testConnection() };
  }

  private createProvider(config: CloudStorageConfig) {
    switch (config.type) {
      case 'webdav':
        return new WebDAVProvider(config as WebDAVConfig);
      case 'icloud':
        return new ICloudProvider(config as ICloudConfig);
      default:
        throw new Error(`${CONSTANTS.ERROR_MESSAGES.UNSUPPORTED_STORAGE_TYPE}: ${config.type}`);
    }
  }

  /**
   * 获取云端路径
   * @param config 存储配置
   * @param fileName 文件名
   * @returns 云端路径
   */
  private getCloudPath(config: CloudStorageConfig, fileName: string): string {
    switch (config.type) {
      case 'webdav':
        return this.getWebDAVBackupPath(config as WebDAVConfig, fileName);
      case 'icloud':
        return fileName;
      default:
        return fileName;
    }
  }

  private getSyncManifestCloudPath(config: CloudStorageConfig, fileName = CLOUD_SYNC_MANIFEST_FILE): string {
    switch (config.type) {
      case 'webdav':
        return this.getWebDAVBackupPath(config as WebDAVConfig, fileName);
      case 'icloud':
        return fileName;
      default:
        return fileName;
    }
  }

  private getSyncManifestBackupCloudPath(config: CloudStorageConfig): string {
    return this.getSyncManifestCloudPath(config, CLOUD_SYNC_MANIFEST_BACKUP_FILE);
  }

  private getSyncSnapshotsDirectoryCloudPath(config: CloudStorageConfig): string {
    return this.getSyncManifestCloudPath(config, getCloudSyncSnapshotsDirectoryRelativePath());
  }

  private getSyncSnapshotCloudPath(config: CloudStorageConfig, revision: string): string {
    return this.getSyncManifestCloudPath(
      config,
      joinCloudPath(getCloudSyncSnapshotsDirectoryRelativePath(), getCloudSyncSnapshotFileName(revision))
        .replace(/^\/+/, '')
    );
  }

  // ==================== 配置文件管理 ====================

  /**
   * 加载配置文件
   */
  private async loadConfigs(): Promise<void> {
    try {
      const configDir = path.dirname(this.configPath);
      await fs.mkdir(configDir, { recursive: true });
      
      const data = await fs.readFile(this.configPath, 'utf-8');
      // WebDAV 密码在文件里是加密的，这里解密成内存里的 password，对外的配置形状不变 (#491)
      const decoded = decodeStoredStorageConfigs(JSON.parse(data));

      this.storageConfigs.clear();
      for (const config of decoded.configs) {
        this.storageConfigs.set(config.id, config);
      }
      this.undecryptablePasswords = decoded.undecryptablePasswords;

      if (decoded.hasPlaintextPasswords) {
        await this.migratePlaintextPasswords();
      }
    } catch (error) {
      if (this.isFileNotFoundError(error)) {
        this.storageConfigs.clear();
        this.undecryptablePasswords.clear();
        return;
      }

      throw new Error(`读取云存储配置失败: ${this.getErrorMessage(error)}`);
    }
  }

  /**
   * 旧版本写的明文密码：系统加密可用时重写一遍配置文件，改成加密保存。
   * 重写失败只记日志，不影响这次读取和同步；系统加密不可用时保持明文 (#491)。
   */
  private async migratePlaintextPasswords(): Promise<void> {
    if (this.passwordMigrationFailed) return;
    const unavailableReason = getPasswordEncryptionUnavailableReason(resolveSafeStorage());
    if (unavailableReason) {
      reportPlaintextPasswordFallback(unavailableReason);
      return;
    }
    if (!this.passwordMigration) {
      this.passwordMigration = this.saveConfigs()
        .catch(error => {
          this.passwordMigrationFailed = true;
          console.warn('[cloud-config] WebDAV 密码迁移到加密存储失败，暂时保持明文：', this.getErrorMessage(error));
        })
        .finally(() => {
          this.passwordMigration = null;
        });
    }
    await this.passwordMigration;
  }

  /**
   * 保存配置文件。WebDAV 密码能加密时只写密文；先写临时文件再改名，
   * 读取的一方不会读到写了一半的文件；文件只允许当前用户读写。
   */
  private async saveConfigs(): Promise<void> {
    const configs = encodeStorageConfigsForDisk(
      Array.from(this.storageConfigs.values()),
      resolveSafeStorage(),
      this.undecryptablePasswords
    );
    const content = JSON.stringify(configs, null, 2);
    const write = this.configWriteQueue.then(() => this.writeConfigFile(content));
    this.configWriteQueue = write.catch(() => undefined);
    try {
      await write;
      this.passwordMigrationFailed = false;
    } catch (error) {
      this.debugError(CONSTANTS.LOG_MESSAGES.SAVE_CONFIG_FAILED, error);
      throw error;
    }
  }

  private async writeConfigFile(content: string): Promise<void> {
    const configDir = path.dirname(this.configPath);
    await fs.mkdir(configDir, { recursive: true });

    const tempPath = `${this.configPath}.${process.pid}.${Date.now()}.tmp`;
    try {
      await fs.writeFile(tempPath, content, { encoding: 'utf-8', mode: 0o600 });
      await fs.rename(tempPath, this.configPath);
    } catch (error) {
      await fs.rm(tempPath, { force: true }).catch(() => undefined);
      // 个别文件系统不支持覆盖式改名（例如目标文件被占用），退回直接写入
      this.debugWarn('原子写入云存储配置失败，改为直接写入:', error);
      await fs.writeFile(this.configPath, content, { encoding: 'utf-8', mode: 0o600 });
    }
    // 旧版本创建的配置文件权限可能是 0644，收紧到只有当前用户能读写（Windows 上忽略）
    await fs.chmod(this.configPath, 0o600).catch(() => undefined);
  }

  // ==================== 工具方法 ====================

  /**
   * 获取错误消息
   * @param error 错误对象
   * @returns 错误消息字符串
   */
  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : CONSTANTS.ERROR_MESSAGES.UNKNOWN_ERROR;
  }

  private getBackupSearchPaths(provider: any, config: CloudStorageConfig): string[] {
    if (config.type !== 'webdav') {
      return [''];
    }

    const backupDir = typeof provider.getDefaultBackupDirectory === 'function'
      ? provider.getDefaultBackupDirectory()
      : getCloudBackupDirectoryPath();
    const paths = [backupDir, ''].filter((searchPath): searchPath is string => typeof searchPath === 'string');
    return paths.filter((searchPath, index) => paths.indexOf(searchPath) === index);
  }

  private getWebDAVBackupPath(config: WebDAVConfig, fileName: string): string {
    if (this.isWebDAVUrlAtBackupDir(config.url)) {
      return `/${fileName.replace(/^\/+/, '')}`;
    }

    return getCloudBackupFilePath(fileName);
  }

  private isWebDAVUrlAtBackupDir(url: string): boolean {
    try {
      const directoryName = getCloudBackupDirectoryPath().split('/').filter(Boolean).pop();
      const pathname = new URL(url).pathname.replace(/\/+$/, '');
      return pathname.split('/').filter(Boolean).pop() === directoryName;
    } catch {
      return false;
    }
  }

  private isNotFoundError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /404|not\s*found|no such file|does not exist|ENOENT|不存在|未找到/i.test(message);
  }

  private async getCloudFileInfo(
    provider: CloudStorageProvider,
    cloudPath: string
  ): Promise<CloudFileInfo | null> {
    if (!provider.getFileInfo) {
      return null;
    }

    return await provider.getFileInfo(cloudPath);
  }

  private assertExpectedCloudSyncRevision(
    manifest: CloudSyncManifest,
    expectedRevision: string | null | undefined
  ): void {
    if (doesCloudSyncManifestMatchExpectedRevision(manifest, expectedRevision)) {
      return;
    }

    throw createCloudSyncManifestRevisionConflictError(
      expectedRevision,
      getCloudSyncManifestRevision(manifest)
    );
  }

  private createManifestWriteOptions(
    primaryInfo: CloudFileInfo | null,
    currentManifest: CloudSyncManifest,
    expectedRevision: string | null | undefined
  ): CloudFileWriteOptions {
    if (expectedRevision === undefined) {
      return {};
    }

    if (primaryInfo?.etag) {
      return { ifMatch: primaryInfo.etag };
    }

    if (!currentManifest.latestSnapshot) {
      return { ifNoneMatch: true };
    }

    return {};
  }

  private createRemoteSnapshotInfo(
    config: CloudStorageConfig,
    file: CloudFileInfo
  ): CloudSyncRemoteSnapshotInfo | null {
    const fileName = file.name || path.basename(file.path || '');
    const revision = getCloudSyncSnapshotRevisionFromFileName(fileName);
    if (!revision) {
      return null;
    }

    return {
      revision,
      path: this.getSyncSnapshotCloudPath(config, revision),
      modifiedAt: file.modifiedAt,
      size: file.size
    };
  }

  private normalizeSnapshotInfo(
    config: CloudStorageConfig,
    snapshot: CloudSyncRemoteSnapshotInfo | string
  ): CloudSyncRemoteSnapshotInfo {
    if (typeof snapshot === 'string') {
      return {
        revision: snapshot,
        path: this.getSyncSnapshotCloudPath(config, snapshot)
      };
    }

    return {
      ...snapshot,
      path: snapshot.path || this.getSyncSnapshotCloudPath(config, snapshot.revision)
    };
  }

  private isSameCloudSyncSnapshot(left: CloudSyncSnapshot, right: CloudSyncSnapshot): boolean {
    return left.revision === right.revision &&
      left.dataChecksum === right.dataChecksum &&
      JSON.stringify(left.data) === JSON.stringify(right.data);
  }

  private isCloudSyncRevisionConflictError(error: unknown): boolean {
    const message = this.getErrorMessage(error);
    return /manifest 已被其他设备更新|Precondition|412|if-match|if-none-match|已被其他设备更新|已存在，取消覆盖/i
      .test(message);
  }

  private async tryReadCloudSyncManifestRevision(storageId: string): Promise<string | null> {
    try {
      return getCloudSyncManifestRevision(await this.readCloudSyncManifest(storageId));
    } catch {
      return null;
    }
  }

  private isFileNotFoundError(error: unknown): boolean {
    const code = typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: string }).code || '')
      : '';
    return code === 'ENOENT';
  }

  private debugLog(...args: unknown[]): void {
    if (!this.isDebugLoggingEnabled()) {
      return;
    }
    console.debug(...args);
  }

  private debugWarn(...args: unknown[]): void {
    if (!this.isDebugLoggingEnabled()) {
      return;
    }
    console.warn(...args);
  }

  private debugError(...args: unknown[]): void {
    if (!this.isDebugLoggingEnabled()) {
      return;
    }
    console.error(...args);
  }

  private isDebugLoggingEnabled(): boolean {
    return process.env.AI_GIST_DEBUG_CLOUD === '1' ||
      (process.env.DEBUG || '').split(',').some(scope => scope.trim() === 'ai-gist:cloud');
  }

  private formatErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
