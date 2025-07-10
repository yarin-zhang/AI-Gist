// 标准库导入
import fs from 'fs/promises';
import path from 'path';

// 第三方库导入
import { ipcMain } from 'electron';
import { v4 as uuidv4 } from 'uuid';

// 本地模块导入
import { 
  CloudStorageConfig, 
  WebDAVConfig, 
  ICloudConfig, 
  CloudBackupInfo, 
  CloudBackupResult, 
  CloudRestoreResult 
} from '@shared/types/cloud-backup';
import { WebDAVProvider } from './webdav-provider';
import { ICloudProvider } from './icloud-provider';
import { DataManagementService } from '../data/data-management-service';

/**
 * 常量定义
 */
const CONSTANTS = {
  CONFIG_FILE: 'cloud-config.json',
  CONFIG_DIR: '.ai-gist',
  BACKUP_FILE_EXTENSION: '.json',
  BACKUP_FILE_PREFIX: 'backup-',
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

  // ==================== 构造函数和初始化 ====================

  /**
   * 构造函数
   * @param dataManagementService 数据管理服务实例
   */
  constructor(dataManagementService: DataManagementService) {
    this.dataManagementService = dataManagementService;
    this.configPath = this.buildConfigPath();
    this.setupIpcHandlers();
  }

  /**
   * 构建配置文件路径
   * @returns 配置文件完整路径
   */
  private buildConfigPath(): string {
    const baseDir = process.env.APPDATA || process.env.HOME || '';
    return path.join(baseDir, CONSTANTS.CONFIG_DIR, CONSTANTS.CONFIG_FILE);
  }

  // ==================== IPC 处理器设置 ====================

  /**
   * 设置 IPC 事件处理器
   */
  private setupIpcHandlers(): void {
    this.setupAvailabilityHandlers();
    this.setupConfigManagementHandlers();
    this.setupBackupManagementHandlers();
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
        console.error(CONSTANTS.LOG_MESSAGES.ICLOUD_AVAILABILITY_CHECK_FAILED, error);
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
        console.error(CONSTANTS.LOG_MESSAGES.TEST_STORAGE_CONNECTION_FAILED, error);
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
        console.error(CONSTANTS.LOG_MESSAGES.GET_STORAGE_CONFIGS_FAILED, error);
        return [];
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
        console.error(CONSTANTS.LOG_MESSAGES.ADD_STORAGE_CONFIG_FAILED, error);
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
        console.error(CONSTANTS.LOG_MESSAGES.UPDATE_STORAGE_CONFIG_FAILED, error);
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
        console.error(CONSTANTS.LOG_MESSAGES.DELETE_STORAGE_CONFIG_FAILED, error);
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
        const provider = this.createProvider(config);
        const files = await provider.listFiles();
        const backupFiles = this.filterBackupFiles(files);
        const backups = await this.parseBackupFiles(provider, backupFiles, storageId);
        return this.sortBackupsByDate(backups);
      } catch (error) {
        console.error(CONSTANTS.LOG_MESSAGES.GET_BACKUP_LIST_FAILED, error);
        throw new Error(`获取云端备份列表失败: ${this.getErrorMessage(error)}`);
      }
    });

    // 创建云端备份
    ipcMain.handle('cloud:create-backup', async (_, storageId: string, description?: string): Promise<CloudBackupResult> => {
      try {
        const config = this.getStorageConfig(storageId);
        const localBackup = await this.dataManagementService.createBackup(description);
        const provider = this.createProvider(config);
        const cloudBackup = await this.uploadBackupToCloud(provider, config, localBackup);
        
        return {
          success: true,
          message: CONSTANTS.SUCCESS_MESSAGES.BACKUP_CREATED,
          backupInfo: cloudBackup,
        };
      } catch (error) {
        console.error(CONSTANTS.LOG_MESSAGES.CREATE_BACKUP_FAILED, error);
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
        const backupFile = await this.findBackupFile(provider, backupId);
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
        console.error(CONSTANTS.LOG_MESSAGES.RESTORE_BACKUP_FAILED, error);
        return {
          success: false,
          message: '恢复云端备份失败',
          error: this.getErrorMessage(error),
        };
      }
    });

    // 删除云端备份
    ipcMain.handle('cloud:delete-backup', async (_, storageId: string, backupId: string) => {
      try {
        const config = this.getStorageConfig(storageId);
        const provider = this.createProvider(config);
        const backupFile = await this.findBackupFile(provider, backupId);
        await provider.deleteFile(backupFile.path);
        
        return { 
          success: true, 
          message: CONSTANTS.SUCCESS_MESSAGES.BACKUP_DELETED 
        };
      } catch (error) {
        console.error(CONSTANTS.LOG_MESSAGES.DELETE_BACKUP_FAILED, error);
        return { 
          success: false, 
          error: this.getErrorMessage(error) 
        };
      }
    });
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
    return files.filter(file => 
      file.name.endsWith(CONSTANTS.BACKUP_FILE_EXTENSION) && 
      !file.isDirectory
    );
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
        const backupInfo: CloudBackupInfo = JSON.parse(data.toString());
        backups.push({
          ...backupInfo,
          cloudPath: file.path,
          storageId,
        });
      } catch (error) {
        console.warn(`${CONSTANTS.ERROR_MESSAGES.BACKUP_PARSE_FAILED}: ${file.path}`, error);
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
  private async findBackupFile(provider: any, backupId: string): Promise<any> {
    const files = await provider.listFiles();
    const backupFile = files.find((file: any) => 
      file.name.includes(backupId) && 
      file.name.endsWith(CONSTANTS.BACKUP_FILE_EXTENSION)
    );

    if (!backupFile) {
      throw new Error(CONSTANTS.ERROR_MESSAGES.BACKUP_FILE_NOT_FOUND);
    }

    return backupFile;
  }

  /**
   * 读取备份数据
   * @param provider 存储提供者
   * @param backupFile 备份文件
   * @returns 备份信息
   */
  private async readBackupData(provider: any, backupFile: any): Promise<any> {
    const data = await provider.readFile(backupFile.path);
    return JSON.parse(data.toString());
  }

  /**
   * 上传备份到云端
   * @param provider 存储提供者
   * @param config 存储配置
   * @param localBackup 本地备份
   * @returns 云端备份信息
   */
  private async uploadBackupToCloud(provider: any, config: CloudStorageConfig, localBackup: any): Promise<CloudBackupInfo> {
    const cloudFileName = `${CONSTANTS.BACKUP_FILE_PREFIX}${localBackup.id}${CONSTANTS.BACKUP_FILE_EXTENSION}`;
    const cloudPath = this.getCloudPath(config, cloudFileName);
    
    const backupData = JSON.stringify(localBackup, null, 2);
    await provider.writeFile(cloudPath, Buffer.from(backupData, 'utf-8'));

    return {
      ...localBackup,
      cloudPath,
      storageId: config.id,
    };
  }

  /**
   * 恢复备份数据
   * @param backupInfo 备份信息
   */
  private async restoreBackupData(backupInfo: any): Promise<void> {
    const localBackupPath = path.join(this.dataManagementService['backupDir'], `${backupInfo.name}.json`);
    await fs.writeFile(localBackupPath, JSON.stringify(backupInfo, null, 2));
    await this.dataManagementService['restoreAllDataWithReplace'](backupInfo.data);
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
        return fileName;
      case 'icloud':
        return fileName;
      default:
        return fileName;
    }
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
      // 配置文件不存在或读取失败，使用空配置
      this.storageConfigs.clear();
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
      console.error(CONSTANTS.LOG_MESSAGES.SAVE_CONFIG_FAILED, error);
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
} 