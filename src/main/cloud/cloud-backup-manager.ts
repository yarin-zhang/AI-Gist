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
  CloudStorageProvider
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
import { DataManagementService } from '../data/data-management-service';
import {
  createBackupPayload,
  parseBackupPayload
} from '@shared/backup-integrity';

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

/**
 * 云端备份管理器
 * 负责管理云端存储配置、备份创建、恢复和删除等操作
 */
export class CloudBackupManager {
  // ==================== 私有属性 ====================
  private storageConfigs = new Map<string, CloudStorageConfig>();
  private dataManagementService: DataManagementService;
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
        return { available: false, reason: '检测失败' };
      }
    });

    // 测试存储连接
    ipcMain.handle('cloud:test-storage-connection', async (_, config: CloudStorageConfig) => {
      try {
        this.validateICloudPath(config);
        const cleanConfig = this.createCleanConfig(config);
        const provider = this.createProvider(cleanConfig);
        const isConnected = await provider.testConnection();
        return { success: isConnected };
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
          error: this.getErrorMessage(error) 
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
        return { success: true, config: updatedConfig };
      } catch (error) {
        this.debugError(CONSTANTS.LOG_MESSAGES.UPDATE_STORAGE_CONFIG_FAILED, error);
        return { 
          success: false, 
          error: this.getErrorMessage(error) 
        };
      }
    });

    // 删除存储配置
    ipcMain.handle('cloud:delete-storage-config', async (_, id: string) => {
      try {
        this.validateConfigExists(id);
        this.storageConfigs.delete(id);
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
      try {
        const config = this.getStorageConfig(storageId);
        // 直接通过数据库服务导出数据，然后创建备份
        const mainWindow = BrowserWindow.getAllWindows()[0];
        if (!mainWindow) {
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
        };
      }
    });

    // 从云端恢复备份
    ipcMain.handle('cloud:restore-backup', async (_, storageId: string, backupId: string): Promise<CloudRestoreResult> => {
      try {
        const config = this.getStorageConfig(storageId);
        const provider = this.createProvider(config);
        const backupFile = await this.findBackupFile(provider, config, backupId);
        const backupInfo = await this.readBackupData(provider, backupFile);
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
        return {
          success: true,
          manifest: await this.readCloudSyncManifest(storageId)
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
        await this.writeCloudSyncManifest(storageId, manifest, options);
        return { success: true };
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
    const provider = this.createProvider(config);
    const isConnected = await provider.testConnection();
    
    if (!isConnected) {
      throw new Error(CONSTANTS.ERROR_MESSAGES.CONNECTION_TEST_FAILED);
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
   */
  private async readCloudSyncManifest(storageId: string): Promise<CloudSyncManifest> {
    await this.loadConfigs();
    const config = this.getStorageConfig(storageId);
    const provider = this.createProvider(config);
    const manifestPath = this.getSyncManifestCloudPath(config);
    const backupPath = this.getSyncManifestBackupCloudPath(config);

    return readCloudSyncManifestWithFallback({
      readPrimary: () => this.readCloudSyncManifestFile(provider, manifestPath),
      readBackup: () => this.readCloudSyncManifestFile(provider, backupPath),
      isNotFoundError: error => this.isNotFoundError(error),
      describeError: error => this.formatErrorMessage(error)
    });
  }

  private async readCloudSyncManifestFile(
    provider: CloudStorageProvider,
    cloudPath: string
  ): Promise<CloudSyncManifest> {
    const data = await provider.readFile(cloudPath);
    try {
      return assertValidCloudSyncManifest(JSON.parse(Buffer.from(data).toString('utf-8')));
    } catch (error) {
      throw new Error(`云同步 manifest 内容无效（${cloudPath}）: ${this.formatErrorMessage(error)}`);
    }
  }

  /**
   * 写入云同步 manifest。
   */
  private async writeCloudSyncManifest(
    storageId: string,
    manifest: CloudSyncManifest,
    options: CloudSyncManifestSaveOptions = {}
  ): Promise<void> {
    await this.loadConfigs();
    const config = this.getStorageConfig(storageId);
    const provider = this.createProvider(config);
    const manifestPath = this.getSyncManifestCloudPath(config);
    const backupPath = this.getSyncManifestBackupCloudPath(config);
    const normalizedManifest = assertValidCloudSyncManifest({
      ...manifest,
      updatedAt: new Date().toISOString()
    });

    if (config.type === 'webdav' && provider.initializeDirectories) {
      await provider.initializeDirectories();
    }

    const content = Buffer.from(JSON.stringify(normalizedManifest, null, 2), 'utf-8');
    if (options.expectedRevision === undefined) {
      await provider.writeFile(manifestPath, content);
      await provider.writeFile(backupPath, content);
      return;
    }

    const primaryInfo = await this.getCloudFileInfo(provider, manifestPath);
    const currentManifest = await readCloudSyncManifestWithFallback({
      readPrimary: () => this.readCloudSyncManifestFile(provider, manifestPath),
      readBackup: () => this.readCloudSyncManifestFile(provider, backupPath),
      isNotFoundError: error => this.isNotFoundError(error),
      describeError: error => this.formatErrorMessage(error)
    });
    this.assertExpectedCloudSyncRevision(currentManifest, options.expectedRevision);

    const writeOptions = this.createManifestWriteOptions(primaryInfo, currentManifest, options.expectedRevision);
    try {
      await provider.writeFile(manifestPath, content, writeOptions);
    } catch (error) {
      if (this.isCloudSyncRevisionConflictError(error)) {
        throw createCloudSyncManifestRevisionConflictError(
          options.expectedRevision,
          getCloudSyncManifestRevision(currentManifest)
        );
      }
      throw error;
    }

    await provider.writeFile(backupPath, content);
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
      const configs = JSON.parse(data);
      
      this.storageConfigs.clear();
      for (const config of configs) {
        this.storageConfigs.set(config.id, config);
      }
    } catch (error) {
      if (this.isFileNotFoundError(error)) {
        this.storageConfigs.clear();
        return;
      }

      throw new Error(`读取云存储配置失败: ${this.getErrorMessage(error)}`);
    }
  }

  /**
   * 保存配置文件
   */
  private async saveConfigs(): Promise<void> {
    try {
      const configDir = path.dirname(this.configPath);
      await fs.mkdir(configDir, { recursive: true });
      
      const configs = Array.from(this.storageConfigs.values());
      await fs.writeFile(this.configPath, JSON.stringify(configs, null, 2));
    } catch (error) {
      this.debugError(CONSTANTS.LOG_MESSAGES.SAVE_CONFIG_FAILED, error);
      throw error;
    }
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
