import { ipcMain } from 'electron';
import { v4 as uuidv4 } from 'uuid';
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
import fs from 'fs/promises';
import path from 'path';

export class CloudBackupManager {
  private storageConfigs: Map<string, CloudStorageConfig> = new Map();
  private dataManagementService: DataManagementService;
  private configPath: string;

  constructor(dataManagementService: DataManagementService) {
    this.dataManagementService = dataManagementService;
    this.configPath = path.join(process.env.APPDATA || process.env.HOME || '', '.ai-gist', 'cloud-config.json');
    this.setupIpcHandlers();
  }

  private setupIpcHandlers() {
    // 获取存储配置列表
    ipcMain.handle('cloud:get-storage-configs', async () => {
      try {
        await this.loadConfigs();
        return Array.from(this.storageConfigs.values());
      } catch (error) {
        console.error('获取存储配置失败:', error);
        return [];
      }
    });

    // 添加存储配置
    ipcMain.handle('cloud:add-storage-config', async (_, config: Omit<CloudStorageConfig, 'id' | 'createdAt' | 'updatedAt'>) => {
      try {
        const newConfig: CloudStorageConfig = {
          ...config,
          id: uuidv4(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        // 测试连接
        const provider = this.createProvider(newConfig);
        const isConnected = await provider.testConnection();
        
        if (!isConnected) {
          throw new Error('连接测试失败');
        }

        this.storageConfigs.set(newConfig.id, newConfig);
        await this.saveConfigs();
        
        return { success: true, config: newConfig };
      } catch (error) {
        console.error('添加存储配置失败:', error);
        return { 
          success: false, 
          error: error instanceof Error ? error.message : '未知错误' 
        };
      }
    });

    // 更新存储配置
    ipcMain.handle('cloud:update-storage-config', async (_, id: string, config: Partial<CloudStorageConfig>) => {
      try {
        const existingConfig = this.storageConfigs.get(id);
        if (!existingConfig) {
          throw new Error('配置不存在');
        }

        const updatedConfig: CloudStorageConfig = {
          ...existingConfig,
          ...config,
          id,
          updatedAt: new Date().toISOString(),
        };

        // 测试连接
        const provider = this.createProvider(updatedConfig);
        const isConnected = await provider.testConnection();
        
        if (!isConnected) {
          throw new Error('连接测试失败');
        }

        this.storageConfigs.set(id, updatedConfig);
        await this.saveConfigs();
        
        return { success: true, config: updatedConfig };
      } catch (error) {
        console.error('更新存储配置失败:', error);
        return { 
          success: false, 
          error: error instanceof Error ? error.message : '未知错误' 
        };
      }
    });

    // 删除存储配置
    ipcMain.handle('cloud:delete-storage-config', async (_, id: string) => {
      try {
        if (!this.storageConfigs.has(id)) {
          throw new Error('配置不存在');
        }

        this.storageConfigs.delete(id);
        await this.saveConfigs();
        
        return { success: true };
      } catch (error) {
        console.error('删除存储配置失败:', error);
        return { 
          success: false, 
          error: error instanceof Error ? error.message : '未知错误' 
        };
      }
    });

    // 测试存储连接
    ipcMain.handle('cloud:test-storage-connection', async (_, config: CloudStorageConfig) => {
      try {
        const provider = this.createProvider(config);
        const isConnected = await provider.testConnection();
        return { success: isConnected };
      } catch (error) {
        console.error('测试存储连接失败:', error);
        return { 
          success: false, 
          error: error instanceof Error ? error.message : '未知错误' 
        };
      }
    });

    // 获取云端备份列表
    ipcMain.handle('cloud:get-backup-list', async (_, storageId: string) => {
      try {
        const config = this.storageConfigs.get(storageId);
        if (!config) {
          throw new Error('存储配置不存在');
        }

        const provider = this.createProvider(config);
        const files = await provider.listFiles();
        
        // 过滤出备份文件
        const backupFiles = files.filter(file => 
          file.name.endsWith('.json') && 
          !file.isDirectory
        );

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
            console.warn(`解析备份文件失败: ${file.path}`, error);
          }
        }

        return backups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      } catch (error) {
        console.error('获取云端备份列表失败:', error);
        throw new Error(`获取云端备份列表失败: ${error instanceof Error ? error.message : '未知错误'}`);
      }
    });

    // 创建云端备份
    ipcMain.handle('cloud:create-backup', async (_, storageId: string, description?: string): Promise<CloudBackupResult> => {
      try {
        const config = this.storageConfigs.get(storageId);
        if (!config) {
          throw new Error('存储配置不存在');
        }

        // 创建本地备份
        const localBackup = await this.dataManagementService.createBackup(description);
        
        // 上传到云端
        const provider = this.createProvider(config);
        const cloudFileName = `backup-${localBackup.id}.json`;
        const cloudPath = this.getCloudPath(config, cloudFileName);
        
        const backupData = JSON.stringify(localBackup, null, 2);
        await provider.writeFile(cloudPath, Buffer.from(backupData, 'utf-8'));

        const cloudBackup: CloudBackupInfo = {
          ...localBackup,
          cloudPath,
          storageId,
        };

        return {
          success: true,
          message: '云端备份创建成功',
          backupInfo: cloudBackup,
        };
      } catch (error) {
        console.error('创建云端备份失败:', error);
        return {
          success: false,
          message: '创建云端备份失败',
          error: error instanceof Error ? error.message : '未知错误',
        };
      }
    });

    // 从云端恢复备份
    ipcMain.handle('cloud:restore-backup', async (_, storageId: string, backupId: string): Promise<CloudRestoreResult> => {
      try {
        const config = this.storageConfigs.get(storageId);
        if (!config) {
          throw new Error('存储配置不存在');
        }

        const provider = this.createProvider(config);
        const files = await provider.listFiles();
        
        // 查找备份文件
        const backupFile = files.find(file => 
          file.name.includes(backupId) && 
          file.name.endsWith('.json')
        );

        if (!backupFile) {
          throw new Error('备份文件不存在');
        }

        // 读取备份数据
        const data = await provider.readFile(backupFile.path);
        const backupInfo: any = JSON.parse(data.toString());

        // 先创建本地备份文件，然后使用现有的恢复机制
        const localBackupPath = path.join(this.dataManagementService['backupDir'], `${backupInfo.name}.json`);
        await fs.writeFile(localBackupPath, JSON.stringify(backupInfo, null, 2));

        // 使用现有的恢复机制
        const result = await this.dataManagementService['restoreAllDataWithReplace'](backupInfo.data);

        return {
          success: true,
          message: '云端备份恢复成功',
          backupInfo: {
            ...backupInfo,
            cloudPath: backupFile.path,
            storageId,
          },
        };
      } catch (error) {
        console.error('恢复云端备份失败:', error);
        return {
          success: false,
          message: '恢复云端备份失败',
          error: error instanceof Error ? error.message : '未知错误',
        };
      }
    });

    // 删除云端备份
    ipcMain.handle('cloud:delete-backup', async (_, storageId: string, backupId: string) => {
      try {
        const config = this.storageConfigs.get(storageId);
        if (!config) {
          throw new Error('存储配置不存在');
        }

        const provider = this.createProvider(config);
        const files = await provider.listFiles();
        
        // 查找备份文件
        const backupFile = files.find(file => 
          file.name.includes(backupId) && 
          file.name.endsWith('.json')
        );

        if (!backupFile) {
          throw new Error('备份文件不存在');
        }

        // 删除文件
        await provider.deleteFile(backupFile.path);

        return { success: true, message: '云端备份删除成功' };
      } catch (error) {
        console.error('删除云端备份失败:', error);
        return { 
          success: false, 
          error: error instanceof Error ? error.message : '未知错误' 
        };
      }
    });
  }

  private createProvider(config: CloudStorageConfig) {
    switch (config.type) {
      case 'webdav':
        return new WebDAVProvider(config as WebDAVConfig);
      case 'icloud':
        return new ICloudProvider(config as ICloudConfig);
      default:
        throw new Error(`不支持的存储类型: ${config.type}`);
    }
  }

  private getCloudPath(config: CloudStorageConfig, fileName: string): string {
    switch (config.type) {
      case 'webdav':
        return path.join((config as WebDAVConfig).path || '', fileName);
      case 'icloud':
        return path.join((config as ICloudConfig).path || '', fileName);
      default:
        return fileName;
    }
  }

  private async loadConfigs() {
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

  private async saveConfigs() {
    try {
      const configDir = path.dirname(this.configPath);
      await fs.mkdir(configDir, { recursive: true });
      
      const configs = Array.from(this.storageConfigs.values());
      await fs.writeFile(this.configPath, JSON.stringify(configs, null, 2));
    } catch (error) {
      console.error('保存存储配置失败:', error);
      throw error;
    }
  }
} 