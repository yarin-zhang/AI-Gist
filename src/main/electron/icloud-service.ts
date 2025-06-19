/**
 * iCloud 同步服务
 * 基于 iCloud Drive 文件系统的同步实现
 */


import { ipcMain, app, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as crypto from 'crypto';

interface ICloudConfig {
    enabled: boolean;
    autoSync: boolean;
    syncInterval: number; // 分钟
    customPath?: string; // 可选的自定义同步路径
}

interface ICloudTestResult {
    success: boolean;
    message: string;
    iCloudPath?: string;
    available?: boolean;
}

interface SyncResult {
    success: boolean;
    message: string;
    timestamp: string;
    filesUploaded: number;
    filesDownloaded: number;
    conflictsDetected: number;
    conflictsResolved: number;
    conflictDetails?: ConflictDetail[];
}

interface ConflictDetail {
    type: 'data_conflict' | 'timestamp_conflict' | 'version_conflict';
    description: string;
    resolution: 'local_wins' | 'remote_wins' | 'merged' | 'backup_created';
    localData?: any;
    remoteData?: any;
}

interface SyncMetadata {
    lastSyncTime: string;
    localVersion: string;
    remoteVersion: string;
    dataHash: string;
    syncCount: number;
    deviceId: string;
    appVersion: string;
    totalRecords: number;
    lastModifiedTime: string;
    syncStrategy: string;
}

interface ManualSyncResult {
    success: boolean;
    message: string;
    timestamp: string;
    hasConflicts: boolean;
    conflictDetails?: ConflictDetail[];
    localData?: any;
    remoteData?: any;
    differences?: {
        added: any[];
        modified: any[];
        deleted: any[];
        summary: {
            localTotal: number;
            remoteTotal: number;
            conflicts: number;
        };
    };
}

interface ConflictResolution {
    strategy: 'use_local' | 'use_remote' | 'merge_smart' | 'merge_manual' | 'cancel';
    mergedData?: any;
}

enum ConflictResolutionStrategy {
    ASK_USER = 'ask_user',
    LOCAL_WINS = 'local_wins', 
    REMOTE_WINS = 'remote_wins',
    AUTO_MERGE = 'auto_merge',
    CREATE_BACKUP = 'create_backup'
}

export class ICloudService {
    private config: ICloudConfig | null = null;
    private syncTimer: NodeJS.Timeout | null = null;
    private tempRemoteData: any = null;
    private tempRemoteMetadata: any = null;
    private readonly defaultICloudPath: string;
    private readonly syncDirName = 'AI-Gist-Sync';
    private isInitialized = false;

    constructor(private preferencesManager: any, private dataManagementService?: any) {
        // 默认 iCloud Drive 路径
        this.defaultICloudPath = path.join(os.homedir(), 'Library', 'Mobile Documents', 'com~apple~CloudDocs');
        console.log('iCloud 服务初始化中...');
        console.log('默认 iCloud Drive 路径:', this.defaultICloudPath);
        console.log('iCloud 服务已初始化');
    }

    /**
     * 初始化服务
     */
    async initialize(): Promise<void> {
        try {
            this.config = await this.loadConfig();
            this.setupIpcHandlers();
            
            if (this.config?.enabled && this.config.autoSync) {
                this.startAutoSync();
            }

            this.isInitialized = true;
            console.log('iCloud 服务初始化完成');
        } catch (error) {
            console.error('iCloud 服务初始化失败:', error);
            throw error;
        }
    }

    /**
     * 加载配置
     */
    private async loadConfig(): Promise<ICloudConfig | null> {
        try {
            const prefs = this.preferencesManager.getPreferences();
            return prefs.icloud || null;
        } catch (error) {
            console.error('加载iCloud配置失败:', error);
            return null;
        }
    }

    /**
     * 设置 IPC 处理器
     */
    public setupIpcHandlers() {
        console.log('正在设置 iCloud IPC 处理程序...');
        
        try {
            // 测试 iCloud 可用性
            console.log('注册 icloud:test-availability 处理程序');
            ipcMain.handle('icloud:test-availability', async (): Promise<ICloudTestResult> => {
                try {
                    const result = await this.testICloudAvailability();
                    console.log('iCloud 可用性测试结果:', result);
                    return result;
                } catch (error) {
                    console.error('iCloud 可用性测试失败:', error);
                    const errorMessage = error instanceof Error ? error.message : '未知错误';
                    return {
                        success: false,
                        message: `测试失败: ${errorMessage}`,
                        available: false
                    };
                }
            });

            // 立即同步
            console.log('注册 icloud:sync-now 处理程序');
            ipcMain.handle('icloud:sync-now', async (): Promise<SyncResult> => {
                try {
                    // 获取配置
                    const preferences = this.preferencesManager.getPreferences();
                    const config: ICloudConfig = preferences.icloud;
                    
                    console.log('同步时检查 iCloud 配置:', {
                        hasConfig: !!config,
                        enabled: config?.enabled,
                        autoSync: config?.autoSync
                    });
                    
                    if (!config || !config.enabled) {
                        return {
                            success: false,
                            message: 'iCloud 同步未启用',
                            timestamp: new Date().toISOString(),
                            filesUploaded: 0,
                            filesDownloaded: 0,
                            conflictsDetected: 0,
                            conflictsResolved: 0,
                        };
                    }

                    // 测试 iCloud 可用性
                    const availability = await this.testICloudAvailability();
                    if (!availability.success || !availability.available) {
                        return {
                            success: false,
                            message: `iCloud 不可用: ${availability.message}`,
                            timestamp: new Date().toISOString(),
                            filesUploaded: 0,
                            filesDownloaded: 0,
                            conflictsDetected: 0,
                            conflictsResolved: 0,
                        };
                    }
                    
                    // 直接使用配置进行同步
                    this.config = config;
                    const result = await this.performSync();
                    return result;
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : '同步失败';
                    return {
                        success: false,
                        message: errorMessage,
                        timestamp: new Date().toISOString(),
                        filesUploaded: 0,
                        filesDownloaded: 0,
                        conflictsDetected: 0,
                        conflictsResolved: 0,
                    };
                }
            });

            // 手动上传数据
            console.log('注册 icloud:manual-upload 处理程序');
            ipcMain.handle('icloud:manual-upload', async (): Promise<ManualSyncResult> => {
                try {
                    console.log('开始手动上传数据到 iCloud...');
                    
                    // 获取配置
                    const config = await this.getStoredConfig();
                    if (!config) {
                        return {
                            success: false,
                            message: '未找到 iCloud 配置',
                            timestamp: new Date().toISOString(),
                            hasConflicts: false
                        };
                    }

                    // 测试 iCloud 可用性
                    const availability = await this.testICloudAvailability();
                    if (!availability.success || !availability.available) {
                        return {
                            success: false,
                            message: `iCloud 不可用: ${availability.message}`,
                            timestamp: new Date().toISOString(),
                            hasConflicts: false
                        };
                    }

                    const syncDir = this.getSyncDirectory();
                    const dataFile = path.join(syncDir, 'data.json');
                    const metadataFile = path.join(syncDir, 'metadata.json');

                    // 确保同步目录存在
                    await this.ensureSyncDirectory(syncDir);

                    // 获取本地数据
                    const localData = await this.generateExportData();
                    const localMetadata = await this.getLocalSyncMetadata();
                    localMetadata.totalRecords = this.calculateTotalRecords(localData);

                    // 上传数据和元数据
                    await fs.promises.writeFile(dataFile, JSON.stringify(localData, null, 2));
                    await fs.promises.writeFile(metadataFile, JSON.stringify(localMetadata, null, 2));

                    // 更新本地同步时间
                    await this.updateLocalSyncTime(new Date().toISOString());

                    console.log('手动上传完成');
                    return {
                        success: true,
                        message: '数据上传成功',
                        timestamp: new Date().toISOString(),
                        hasConflicts: false
                    };
                } catch (error) {
                    console.error('手动上传失败:', error);
                    const errorMessage = error instanceof Error ? error.message : '上传失败';
                    return {
                        success: false,
                        message: errorMessage,
                        timestamp: new Date().toISOString(),
                        hasConflicts: false
                    };
                }
            });

            // 手动从 iCloud 下载数据（检测冲突但不自动应用）
            console.log('注册 icloud:manual-download 处理程序');
            ipcMain.handle('icloud:manual-download', async (): Promise<ManualSyncResult> => {
                try {
                    console.log('开始从 iCloud 下载数据...');
                    
                    // 获取配置
                    const config = await this.getStoredConfig();
                    if (!config) {
                        return {
                            success: false,
                            message: '未找到 iCloud 配置',
                            timestamp: new Date().toISOString(),
                            hasConflicts: false
                        };
                    }

                    // 测试 iCloud 可用性
                    const availability = await this.testICloudAvailability();
                    if (!availability.success || !availability.available) {
                        return {
                            success: false,
                            message: `iCloud 不可用: ${availability.message}`,
                            timestamp: new Date().toISOString(),
                            hasConflicts: false
                        };
                    }

                    const syncDir = this.getSyncDirectory();
                    const dataFile = path.join(syncDir, 'data.json');
                    const metadataFile = path.join(syncDir, 'metadata.json');

                    const dataExists = await this.checkFileExists(dataFile);
                    if (!dataExists) {
                        return {
                            success: false,
                            message: 'iCloud 上没有找到数据文件',
                            timestamp: new Date().toISOString(),
                            hasConflicts: false
                        };
                    }

                    // 下载远程数据
                    const remoteDataContent = await fs.promises.readFile(dataFile, 'utf-8');
                    const remoteData = JSON.parse(remoteDataContent);

                    let remoteMetadata = null;
                    if (await this.checkFileExists(metadataFile)) {
                        const remoteMetadataContent = await fs.promises.readFile(metadataFile, 'utf-8');
                        remoteMetadata = JSON.parse(remoteMetadataContent);
                    }

                    // 获取本地数据
                    const localData = await this.generateExportData();
                    const localMetadata = await this.getLocalSyncMetadata();

                    // 检测冲突并生成详细的差异分析
                    const detailedDifferences = await this.generateDetailedDifferences(localData, remoteData, localMetadata, remoteMetadata);

                    // 暂存远程数据供后续使用
                    this.tempRemoteData = remoteData;
                    this.tempRemoteMetadata = remoteMetadata;

                    return {
                        success: true,
                        message: '数据下载完成',
                        timestamp: new Date().toISOString(),
                        hasConflicts: detailedDifferences.summary.conflicts > 0,
                        differences: detailedDifferences,
                        localData,
                        remoteData
                    };

                } catch (error) {
                    console.error('手动下载失败:', error);
                    const errorMessage = error instanceof Error ? error.message : '下载失败';
                    return {
                        success: false,
                        message: errorMessage,
                        timestamp: new Date().toISOString(),
                        hasConflicts: false
                    };
                }
            });

            // 应用下载的数据（解决冲突后）
            console.log('注册 icloud:apply-downloaded-data 处理程序');
            ipcMain.handle('icloud:apply-downloaded-data', async (event, resolution: ConflictResolution): Promise<SyncResult> => {
                try {
                    if (!this.tempRemoteData) {
                        return {
                            success: false,
                            message: '没有临时数据可以应用',
                            timestamp: new Date().toISOString(),
                            filesUploaded: 0,
                            filesDownloaded: 0,
                            conflictsDetected: 0,
                            conflictsResolved: 0
                        };
                    }

                    let finalData: any;

                    switch (resolution.strategy) {
                        case 'use_local':
                            // 不需要应用，直接返回成功
                            return {
                                success: true,
                                message: '保持使用本地数据',
                                timestamp: new Date().toISOString(),
                                filesUploaded: 0,
                                filesDownloaded: 0,
                                conflictsDetected: 0,
                                conflictsResolved: 1
                            };
                        case 'use_remote':
                            finalData = this.tempRemoteData;
                            break;
                        case 'merge_smart':
                        case 'merge_manual':
                            finalData = resolution.mergedData;
                            break;
                        case 'cancel':
                            return {
                                success: false,
                                message: '用户取消操作',
                                timestamp: new Date().toISOString(),
                                filesUploaded: 0,
                                filesDownloaded: 0,
                                conflictsDetected: 0,
                                conflictsResolved: 0
                            };
                        default:
                            throw new Error(`未知的解决策略: ${resolution.strategy}`);
                    }

                    // 应用数据到本地
                    if (this.dataManagementService) {
                        await this.dataManagementService.importDataObject(finalData);
                    }

                    // 更新同步时间
                    await this.updateLocalSyncTime(new Date().toISOString());

                    // 清理临时数据
                    this.tempRemoteData = null;
                    this.tempRemoteMetadata = null;

                    return {
                        success: true,
                        message: '数据应用成功',
                        timestamp: new Date().toISOString(),
                        filesUploaded: 0,
                        filesDownloaded: 1,
                        conflictsDetected: 1,
                        conflictsResolved: 1
                    };

                } catch (error) {
                    console.error('应用数据失败:', error);
                    const errorMessage = error instanceof Error ? error.message : '未知错误';
                    return {
                        success: false,
                        message: `应用数据失败: ${errorMessage}`,
                        timestamp: new Date().toISOString(),
                        filesUploaded: 0,
                        filesDownloaded: 0,
                        conflictsDetected: 0,
                        conflictsResolved: 0
                    };
                }
            });

            // 比较本地和远程数据
            console.log('注册 icloud:compare-data 处理程序');
            ipcMain.handle('icloud:compare-data', async () => {
                try {
                    // 获取配置
                    const config = await this.getStoredConfig();
                    if (!config) {
                        return {
                            success: false,
                            message: '未找到 iCloud 配置'
                        };
                    }

                    // 测试 iCloud 可用性
                    const availability = await this.testICloudAvailability();
                    if (!availability.success || !availability.available) {
                        return {
                            success: false,
                            message: `iCloud 不可用: ${availability.message}`
                        };
                    }

                    const syncDir = this.getSyncDirectory();
                    const dataFile = path.join(syncDir, 'data.json');
                    const metadataFile = path.join(syncDir, 'metadata.json');

                    const dataExists = await this.checkFileExists(dataFile);
                    if (!dataExists) {
                        return {
                            success: false,
                            message: 'iCloud 上没有找到数据文件'
                        };
                    }

                    const remoteDataContent = await fs.promises.readFile(dataFile, 'utf-8');
                    const remoteData = JSON.parse(remoteDataContent);

                    let remoteMetadata = null;
                    if (await this.checkFileExists(metadataFile)) {
                        const remoteMetadataContent = await fs.promises.readFile(metadataFile, 'utf-8');
                        remoteMetadata = JSON.parse(remoteMetadataContent);
                    }

                    const localData = await this.generateExportData();
                    const localMetadata = await this.getLocalSyncMetadata();

                    // 使用详细差异分析
                    const differences = await this.generateDetailedDifferences(localData, remoteData, localMetadata, remoteMetadata);

                    return {
                        success: true,
                        differences,
                        localMetadata,
                        remoteMetadata
                    };

                } catch (error) {
                    console.error('比较数据失败:', error);
                    const errorMessage = error instanceof Error ? error.message : '比较失败';
                    return {
                        success: false,
                        message: errorMessage
                    };
                }
            });

            // 获取 iCloud 配置
            console.log('注册 icloud:get-config 处理程序');
            ipcMain.handle('icloud:get-config', async (): Promise<ICloudConfig> => {
                try {
                    const preferences = this.preferencesManager.getPreferences();
                    return preferences.icloud || {
                        enabled: false,
                        autoSync: false,
                        syncInterval: 30
                    };
                } catch (error) {
                    console.error('获取 iCloud 配置失败:', error);
                    return {
                        enabled: false,
                        autoSync: false,
                        syncInterval: 30
                    };
                }
            });

            // 设置 iCloud 配置
            console.log('注册 icloud:set-config 处理程序');
            ipcMain.handle('icloud:set-config', async (event, config: ICloudConfig) => {
                try {
                    console.log('保存 iCloud 配置:', {
                        ...config,
                        customPath: config.customPath ? '[已设置]' : '[未设置]'
                    });

                    // 获取当前偏好设置
                    const currentPrefs = this.preferencesManager.getPreferences();
                    const currentICloudConfig = currentPrefs.icloud || {};

                    // 合并配置
                    const mergedConfig = {
                        ...currentICloudConfig,
                        enabled: config.enabled !== undefined ? config.enabled : currentICloudConfig.enabled,
                        autoSync: config.autoSync !== undefined ? config.autoSync : currentICloudConfig.autoSync,
                        syncInterval: config.syncInterval !== undefined ? config.syncInterval : currentICloudConfig.syncInterval,
                        customPath: config.customPath !== undefined ? config.customPath : currentICloudConfig.customPath
                    };

                    console.log('保存 iCloud 配置:', mergedConfig);

                    // 保存配置到偏好设置
                    this.preferencesManager.updatePreferences({
                        icloud: mergedConfig
                    });

                    return {
                        success: true,
                        message: '配置已保存'
                    };
                } catch (error) {
                    console.error('保存 iCloud 配置失败:', error);
                    return {
                        success: false,
                        error: error instanceof Error ? error.message : '保存配置失败'
                    };
                }
            });

            // 打开同步目录
            console.log('注册 icloud:open-sync-directory 处理程序');
            ipcMain.handle('icloud:open-sync-directory', async () => {
                try {
                    const iCloudPath = this.getICloudPath();
                    const syncPath = path.join(iCloudPath, this.syncDirName);
                    
                    // 检查目录是否存在，如果不存在则创建
                    try {
                        await fs.promises.access(syncPath);
                    } catch (error) {
                        // 目录不存在，创建它
                        await fs.promises.mkdir(syncPath, { recursive: true });
                    }

                    // 使用 shell.openPath 打开目录
                    const result = await shell.openPath(syncPath);
                    
                    if (result) {
                        // openPath 返回非空字符串表示有错误
                        throw new Error(`无法打开目录: ${result}`);
                    }
                    
                    return {
                        success: true,
                        message: '已打开同步目录',
                        path: syncPath
                    };
                } catch (error) {
                    console.error('打开同步目录失败:', error);
                    return {
                        success: false,
                        error: error instanceof Error ? error.message : '打开目录失败'
                    };
                }
            });

            console.log('iCloud IPC 处理程序设置完成');
        } catch (error) {
            console.error('设置 iCloud IPC 处理程序失败:', error);
        }
    }

    /**
     * 清理 iCloud IPC 处理器
     */
    public cleanup() {
        console.log('清理 iCloud 服务...');
        this.stopAutoSync();
        
        // 移除 IPC 处理器
        ipcMain.removeAllListeners('icloud:test-availability');
        ipcMain.removeAllListeners('icloud:sync-now');
        ipcMain.removeAllListeners('icloud:manual-upload');
        ipcMain.removeAllListeners('icloud:manual-download');
        ipcMain.removeAllListeners('icloud:apply-downloaded-data');
        ipcMain.removeAllListeners('icloud:compare-data');
        ipcMain.removeAllListeners('icloud:get-config');
        ipcMain.removeAllListeners('icloud:set-config');
        ipcMain.removeAllListeners('icloud:open-sync-directory');
        
        console.log('iCloud 服务清理完成');
    }

    /**
     * 测试 iCloud Drive 可用性
     */
    private async testICloudAvailability(): Promise<ICloudTestResult> {
        try {
            const iCloudPath = this.getICloudPath();
            console.log('测试 iCloud Drive 可用性，路径:', iCloudPath);
            
            // 检查 iCloud Drive 目录是否存在
            try {
                const stats = await fs.promises.stat(iCloudPath);
                if (!stats.isDirectory()) {
                    console.log('iCloud Drive 路径存在但不是目录');
                    return {
                        success: false,
                        message: 'iCloud Drive 路径不是有效目录',
                        iCloudPath,
                        available: false
                    };
                }
                console.log('iCloud Drive 根目录存在且可访问');
            } catch (statError) {
                console.log('iCloud Drive 根目录不存在或无法访问:', statError);
                return {
                    success: false,
                    message: `iCloud Drive 目录不存在或无法访问: ${statError instanceof Error ? statError.message : '未知错误'}`,
                    iCloudPath,
                    available: false
                };
            }

            // 检查是否可以读取目录内容
            try {
                const files = await fs.promises.readdir(iCloudPath);
                console.log('iCloud Drive 目录内容:', files.length, '个项目');
            } catch (readError) {
                console.log('无法读取 iCloud Drive 目录:', readError);
                return {
                    success: false,
                    message: `无法读取 iCloud Drive 目录: ${readError instanceof Error ? readError.message : '未知错误'}`,
                    iCloudPath,
                    available: false
                };
            }

            // 尝试在 iCloud Drive 中创建测试目录和文件
            const testDirName = `test-${Date.now()}`;
            const testDir = path.join(iCloudPath, testDirName);
            const testFile = path.join(testDir, 'test.txt');

            try {
                console.log('尝试创建测试目录:', testDir);
                await fs.promises.mkdir(testDir, { recursive: true });
                
                console.log('尝试写入测试文件:', testFile);
                const testContent = `iCloud Drive 测试文件 - 创建于 ${new Date().toISOString()}`;
                await fs.promises.writeFile(testFile, testContent);
                
                console.log('尝试读取测试文件');
                const content = await fs.promises.readFile(testFile, 'utf-8');
                
                if (content !== testContent) {
                    throw new Error('读取的内容与写入的内容不匹配');
                }

                console.log('清理测试文件');
                await fs.promises.unlink(testFile);
                await fs.promises.rmdir(testDir);
                
                console.log('iCloud Drive 测试成功完成');
            } catch (testError) {
                console.error('iCloud Drive 写入测试失败:', testError);
                
                // 尝试清理可能残留的测试文件
                try {
                    await fs.promises.unlink(testFile);
                } catch (e) {
                    // 忽略清理错误
                }
                try {
                    await fs.promises.rmdir(testDir);
                } catch (e) {
                    // 忽略清理错误
                }
                
                return {
                    success: false,
                    message: `iCloud Drive 读写测试失败: ${testError instanceof Error ? testError.message : '未知错误'}`,
                    iCloudPath,
                    available: false
                };
            }

            return {
                success: true,
                message: 'iCloud Drive 可用并可正常读写',
                iCloudPath,
                available: true
            };

        } catch (error) {
            console.error('iCloud Drive 可用性测试出现异常:', error);
            return {
                success: false,
                message: `iCloud Drive 测试异常: ${error instanceof Error ? error.message : '未知错误'}`,
                available: false
            };
        }
    }

    /**
     * 执行同步操作
     */
    private async performSync(): Promise<SyncResult> {
        try {
            console.log('开始执行 iCloud 智能同步...');
            
            if (!this.config) {
                throw new Error('iCloud 配置未设置');
            }

            // 测试 iCloud 可用性
            const availability = await this.testICloudAvailability();
            if (!availability.success || !availability.available) {
                throw new Error(`iCloud 不可用: ${availability.message}`);
            }

            const syncDir = this.getSyncDirectory();
            const dataFile = path.join(syncDir, 'data.json');
            const metadataFile = path.join(syncDir, 'metadata.json');

            // 确保同步目录存在
            await this.ensureSyncDirectory(syncDir);

            // 获取本地数据和元数据
            const localData = await this.generateExportData();
            const localMetadata = await this.getLocalSyncMetadata();
            localMetadata.totalRecords = this.calculateTotalRecords(localData);
            const localDataHash = this.calculateDataHash(localData);

            console.log('本地数据信息:');
            console.log('- 总记录数:', localMetadata.totalRecords);
            console.log('- 数据哈希:', localDataHash);
            console.log('- 同步时间:', localMetadata.lastSyncTime);
            console.log('- 同步次数:', localMetadata.syncCount);
            console.log('- 设备ID:', localMetadata.deviceId);
            console.log('- 应用版本:', localMetadata.appVersion);
            console.log('- 分类数量:', localData.categories?.length || 0);
            console.log('- 提示词数量:', localData.prompts?.length || 0);

            // 检查远程是否存在数据
            const remoteDataExists = await this.checkFileExists(dataFile);
            const remoteMetadataExists = await this.checkFileExists(metadataFile);

            let remoteData: any = null;
            let remoteMetadata: SyncMetadata | null = null;

            if (remoteDataExists && remoteMetadataExists) {
                try {
                    // 下载远程数据和元数据
                    const remoteDataContent = await fs.promises.readFile(dataFile, 'utf-8');
                    const remoteMetadataContent = await fs.promises.readFile(metadataFile, 'utf-8');

                    remoteData = JSON.parse(remoteDataContent);
                    remoteMetadata = JSON.parse(remoteMetadataContent);

                    if (remoteMetadata && remoteData) {
                        console.log('远程数据信息:');
                        console.log('- 总记录数:', remoteMetadata.totalRecords);
                        console.log('- 数据哈希:', remoteMetadata.dataHash);
                        console.log('- 同步时间:', remoteMetadata.lastSyncTime);
                        console.log('- 同步次数:', remoteMetadata.syncCount);
                        console.log('- 设备ID:', remoteMetadata.deviceId);
                        console.log('- 应用版本:', remoteMetadata.appVersion);
                        console.log('- 分类数量:', remoteData.categories?.length || 0);
                        console.log('- 提示词数量:', remoteData.prompts?.length || 0);
                    }

                    console.log('远程数据已下载，最后同步时间:', remoteMetadata?.lastSyncTime);
                } catch (error) {
                    console.warn('下载远程数据失败，将视为首次同步', error);
                }
            }

            // 执行智能同步决策
            const syncDecision = await this.makeSyncDecision(
                localData, localMetadata, localDataHash,
                remoteData, remoteMetadata
            );

            console.log('同步决策:', syncDecision);

            // 执行同步操作
            const result = await this.executeSyncOperation(
                syncDir, dataFile, metadataFile,
                localData, localMetadata, localDataHash,
                remoteData, remoteMetadata,
                syncDecision
            );

            return result;
        } catch (error) {
            console.error('iCloud 同步失败:', error);
            throw new Error(`同步失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    /**
     * 获取 iCloud 同步目录路径
     */
    private getICloudPath(): string {
        const preferences = this.preferencesManager.getPreferences();
        const config = preferences.icloud;
        
        if (config?.customPath) {
            return config.customPath;
        }
        
        return this.defaultICloudPath;
    }

    /**
     * 获取同步目录
     */
    private getSyncDirectory(): string {
        return path.join(this.getICloudPath(), this.syncDirName);
    }

    /**
     * 确保同步目录存在
     */
    private async ensureSyncDirectory(syncDir: string): Promise<void> {
        try {
            await fs.promises.mkdir(syncDir, { recursive: true });
        } catch (error) {
            console.error('创建同步目录失败:', error);
            throw new Error(`无法创建同步目录: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    /**
     * 检查文件是否存在
     */
    private async checkFileExists(filePath: string): Promise<boolean> {
        try {
            await fs.promises.access(filePath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * 获取本地同步元数据
     */
    private async getLocalSyncMetadata(): Promise<SyncMetadata> {
        const preferences = this.preferencesManager.getPreferences();
        const dataSync = preferences.dataSync;
        
        // 生成唯一的设备ID
        const deviceId = this.generateDeviceId();
        
        // 获取应用版本
        const appVersion = app.getVersion() || '1.0.0';
        
        return {
            lastSyncTime: dataSync?.lastSyncTime || new Date(0).toISOString(),
            localVersion: '1.0.0',
            remoteVersion: '1.0.0', 
            dataHash: '',
            syncCount: (dataSync?.syncCount || 0),
            deviceId: deviceId,
            appVersion: appVersion,
            totalRecords: 0,
            lastModifiedTime: new Date().toISOString(),
            syncStrategy: 'auto_merge'
        };
    }

    /**
     * 计算数据哈希
     */
    private calculateDataHash(data: any): string {
        if (!data || typeof data !== 'object') {
            return crypto.createHash('sha256').update('').digest('hex').substring(0, 16);
        }
        
        // 标准化数据：排序键、移除时间戳等易变字段
        const normalizedData = this.normalizeDataForHashing(data);
        const dataString = JSON.stringify(normalizedData);
        return crypto.createHash('sha256').update(dataString).digest('hex').substring(0, 16);
    }

    /**
     * 标准化数据用于哈希计算
     */
    private normalizeDataForHashing(data: any): any {
        if (!data || typeof data !== 'object') {
            return data;
        }

        if (Array.isArray(data)) {
            // 对数组按 id 或 uuid 排序，并递归处理每个元素
            return this.sortArray(data).map(item => this.normalizeDataForHashing(item));
        } else {
            // 对对象的键排序，移除时间戳字段，并递归处理值
            return this.sortObject(data);
        }
    }

    /**
     * 排序数组
     */
    private sortArray(arr: any[], keyField: string = 'id'): any[] {
        return [...arr].sort((a, b) => {
            // 尝试按多个字段排序
            const aKey = a[keyField] || a.uuid || a.name || a.title || '';
            const bKey = b[keyField] || b.uuid || b.name || b.title || '';
            return String(aKey).localeCompare(String(bKey));
        });
    }

    /**
     * 排序对象
     */
    private sortObject(obj: any): any {
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
            return obj;
        }

        const result: any = {};
        const keys = Object.keys(obj).sort();
        
        for (const key of keys) {
            // 跳过时间戳和易变字段
            if (['createdAt', 'updatedAt', 'modifiedAt', 'lastModified', 'timestamp'].includes(key)) {
                continue;
            }
            
            result[key] = this.normalizeDataForHashing(obj[key]);
        }
        
        return result;
    }

    /**
     * 计算总记录数
     */
    private calculateTotalRecords(data: any): number {
        if (!data || typeof data !== 'object') {
            return 0;
        }

        let total = 0;
        const countableFields = ['categories', 'prompts', 'aiConfigs', 'aiHistory', 'settings'];
        
        for (const field of countableFields) {
            if (data[field] && Array.isArray(data[field])) {
                total += data[field].length;
            }
        }
        
        return total;
    }

    /**
     * 同步决策算法
     */
    private async makeSyncDecision(
        localData: any, localMetadata: SyncMetadata, localDataHash: string,
        remoteData: any, remoteMetadata: SyncMetadata | null
    ): Promise<{
        action: 'upload_only' | 'download_only' | 'merge' | 'conflict_detected';
        strategy: ConflictResolutionStrategy;
        reason: string;
    }> {
        
        console.log('\n=== iCloud 同步决策分析 ===');
        console.log('本地哈希:', localDataHash);
        console.log('本地时间:', localMetadata.lastSyncTime);
        console.log('本地同步次数:', localMetadata.syncCount);
        console.log('本地设备ID:', localMetadata.deviceId);
        console.log('本地记录数:', localMetadata.totalRecords);
        
        // 情况1：远程没有数据，直接上传
        if (!remoteData || !remoteMetadata) {
            console.log('决策: 首次上传');
            return {
                action: 'upload_only',
                strategy: ConflictResolutionStrategy.LOCAL_WINS,
                reason: '远程无数据，执行首次上传'
            };
        }
        
        const remoteDataHash = this.calculateDataHash(remoteData);
        console.log('远程哈希:', remoteDataHash);
        console.log('远程时间:', remoteMetadata.lastSyncTime);
        console.log('远程同步次数:', remoteMetadata.syncCount);
        console.log('远程设备ID:', remoteMetadata.deviceId);
        console.log('远程记录数:', remoteMetadata.totalRecords);
        
        // 情况2：本地数据为空，直接下载
        if (!localData || Object.keys(localData).length === 0 || localMetadata.totalRecords === 0) {
            console.log('决策: 本地无数据，下载远程数据');
            return {
                action: 'download_only', 
                strategy: ConflictResolutionStrategy.REMOTE_WINS,
                reason: '本地无数据，执行首次下载'
            };
        }

        // 情况3：数据完全相同
        if (localDataHash === remoteDataHash) {
            console.log('决策: 数据相同，仅更新时间戳');
            return {
                action: 'upload_only',
                strategy: ConflictResolutionStrategy.LOCAL_WINS,
                reason: '数据相同，仅更新同步时间'
            };
        }

        const localTime = new Date(localMetadata.lastSyncTime).getTime();
        const remoteTime = new Date(remoteMetadata.lastSyncTime).getTime();
        const timeDiff = Math.abs(localTime - remoteTime);

        console.log('时间差:', timeDiff, 'ms');

        // 情况4：检查记录数变化
        const recordDiff = localMetadata.totalRecords - (remoteMetadata.totalRecords || 0);
        console.log('记录数差异:', recordDiff);
        
        // 如果本地记录数明显更多，优先上传
        if (recordDiff > 0) {
            console.log('决策: 本地记录数更多，上传本地数据');
            return {
                action: 'upload_only',
                strategy: ConflictResolutionStrategy.LOCAL_WINS,
                reason: `本地新增了 ${recordDiff} 条记录`
            };
        }
        
        // 如果远程记录数明显更多，可能需要下载
        if (recordDiff < -5) { // 远程比本地多超过5条记录
            console.log('决策: 远程记录数明显更多，下载远程数据');
            return {
                action: 'download_only',
                strategy: ConflictResolutionStrategy.REMOTE_WINS,
                reason: `远程多了 ${Math.abs(recordDiff)} 条记录`
            };
        }

        // 情况5：检查是否是同一设备的不同同步
        if (localMetadata.deviceId === remoteMetadata.deviceId) {
            console.log('检测到同设备同步');
            // 同一设备，比较同步计数
            if (localMetadata.syncCount > remoteMetadata.syncCount) {
                console.log('决策: 同设备，本地版本更新');
                return {
                    action: 'upload_only',
                    strategy: ConflictResolutionStrategy.LOCAL_WINS,
                    reason: '同设备本地版本更新'
                };
            } else if (localMetadata.syncCount < remoteMetadata.syncCount) {
                console.log('决策: 同设备，远程版本更新');
                return {
                    action: 'download_only',
                    strategy: ConflictResolutionStrategy.REMOTE_WINS,
                    reason: '同设备远程版本更新'
                };
            } else {
                // 同设备同步计数相同但数据不同，这通常表示本地有未同步的修改
                console.log('检测到同设备未同步的本地修改（删除、编辑等）');
                // 比较记录数，如果本地记录数变化，说明是正常的增删操作
                if (recordDiff !== 0) {
                    console.log(`决策: 同设备本地数据有变化（记录数差异: ${recordDiff}），上传本地版本`);
                    return {
                        action: 'upload_only',
                        strategy: ConflictResolutionStrategy.LOCAL_WINS,
                        reason: `同设备本地数据有变化（${recordDiff > 0 ? '新增' : '删除'}了${Math.abs(recordDiff)}条记录）`
                    };
                } else {
                    // 记录数相同但内容不同，可能是编辑操作
                    console.log('决策: 同设备记录数相同但内容有修改，上传本地版本');
                    return {
                        action: 'upload_only',
                        strategy: ConflictResolutionStrategy.LOCAL_WINS,
                        reason: '同设备本地数据有编辑修改'
                    };
                }
            }
        }

        // 情况6：不同设备的修改，需要更仔细的分析
        
        // 6.1：时间差很大，使用时间戳决策
        if (timeDiff > 300000) { // 5分钟
            if (localTime > remoteTime) {
                console.log('决策: 本地时间较新（时间差>5分钟）');
                return {
                    action: 'upload_only',
                    strategy: ConflictResolutionStrategy.LOCAL_WINS,
                    reason: '本地修改时间较新'
                };
            } else {
                console.log('决策: 远程时间较新（时间差>5分钟）');
                return {
                    action: 'download_only',
                    strategy: ConflictResolutionStrategy.REMOTE_WINS,
                    reason: '远程修改时间较新'
                };
            }
        }

        // 6.2：时间差较小，可能是并发修改
        if (timeDiff < 60000) { // 1分钟内
            console.log('决策: 检测到可能的并发修改，需要合并');
            return {
                action: 'merge',
                strategy: ConflictResolutionStrategy.AUTO_MERGE,
                reason: '检测到并发修改，尝试自动合并'
            };
        }

        // 6.3：中等时间差，使用同步计数辅助判断
        const syncCountDiff = localMetadata.syncCount - remoteMetadata.syncCount;
        if (Math.abs(syncCountDiff) > 5) {
            // 同步计数差异很大，可能有一方很久没同步
            if (syncCountDiff > 0) {
                console.log('决策: 本地同步计数远大于远程');
                return {
                    action: 'upload_only',
                    strategy: ConflictResolutionStrategy.LOCAL_WINS,
                    reason: '本地同步次数更多'
                };
            } else {
                console.log('决策: 远程同步计数远大于本地');
                return {
                    action: 'download_only',
                    strategy: ConflictResolutionStrategy.REMOTE_WINS,
                    reason: '远程同步次数更多'
                };
            }
        }

        // 情况7：无法明确决策，标记为冲突
        console.log('决策: 无法自动决策，标记为冲突');
        return {
            action: 'conflict_detected',
            strategy: ConflictResolutionStrategy.CREATE_BACKUP,
            reason: `无法自动解决冲突: 时间差${Math.round(timeDiff/1000)}秒, 同步计数差${syncCountDiff}`
        };
    }

    /**
     * 执行同步操作
     */
    private async executeSyncOperation(
        syncDir: string, dataFile: string, metadataFile: string,
        localData: any, localMetadata: SyncMetadata, localDataHash: string,
        remoteData: any, remoteMetadata: SyncMetadata | null,
        decision: any
    ): Promise<SyncResult> {
        
        const now = new Date().toISOString();
        let filesUploaded = 0;
        let filesDownloaded = 0;
        let conflictsDetected = 0;
        let conflictsResolved = 0;
        const conflictDetails: ConflictDetail[] = [];

        switch (decision.action) {
            case 'upload_only':
                console.log('执行上传操作...');
                
                // 分析数据变更详情
                const changeAnalysis = this.analyzeDataChanges(localData, remoteData);
                
                // 上传数据文件
                await fs.promises.writeFile(dataFile, JSON.stringify(localData, null, 2));
                if (changeAnalysis.hasChanges) filesUploaded++;
                
                // 更新并上传元数据
                const uploadMetadata: SyncMetadata = {
                    ...localMetadata,
                    lastSyncTime: now,
                    dataHash: localDataHash,
                    syncCount: (localMetadata.syncCount || 0) + 1,
                    totalRecords: this.calculateTotalRecords(localData),
                    lastModifiedTime: now
                };
                
                await fs.promises.writeFile(metadataFile, JSON.stringify(uploadMetadata, null, 2));
                filesUploaded++; // 元数据总是会更新
                
                // 更新本地同步时间
                await this.updateLocalSyncTime(now);
                
                // 构建有意义的成功消息
                const successMessage = this.buildSyncSuccessMessage('upload', changeAnalysis);
                
                return {
                    success: true,
                    message: successMessage,
                    timestamp: now,
                    filesUploaded,
                    filesDownloaded,
                    conflictsDetected,
                    conflictsResolved,
                    conflictDetails
                };
                
            case 'download_only':
                console.log('执行下载操作...');
                
                if (remoteData && this.dataManagementService) {
                    // 分析下载的数据变更
                    const downloadAnalysis = this.analyzeDataChanges(remoteData, localData);
                    
                    // 导入远程数据到本地
                    await this.dataManagementService.importDataObject(remoteData);
                    filesDownloaded++;
                    
                    // 更新本地同步时间
                    await this.updateLocalSyncTime(remoteMetadata?.lastSyncTime || now);
                    
                    // 构建有意义的成功消息
                    const successMessage = this.buildSyncSuccessMessage('download', downloadAnalysis);
                    
                    return {
                        success: true,
                        message: successMessage,
                        timestamp: now,
                        filesUploaded,
                        filesDownloaded,
                        conflictsDetected,
                        conflictsResolved,
                        conflictDetails
                    };
                }
                
                break;
                
            case 'merge':
                console.log('执行数据合并操作...');
                
                // 创建冲突备份
                if (this.dataManagementService) {
                    await this.dataManagementService.createBackup(`同步冲突备份 - ${now}`);
                }
                
                // 尝试智能合并
                const mergedData = await this.mergeData(localData, remoteData);
                
                // 上传合并后的数据
                await fs.promises.writeFile(dataFile, JSON.stringify(mergedData, null, 2));
                filesUploaded++;
                
                const mergeMetadata: SyncMetadata = {
                    lastSyncTime: now,
                    localVersion: localMetadata.localVersion,
                    remoteVersion: remoteMetadata?.remoteVersion || '1.0.0',
                    dataHash: this.calculateDataHash(mergedData),
                    syncCount: Math.max(localMetadata.syncCount || 0, remoteMetadata?.syncCount || 0) + 1,
                    deviceId: localMetadata.deviceId,
                    appVersion: localMetadata.appVersion,
                    totalRecords: this.calculateTotalRecords(mergedData),
                    lastModifiedTime: now,
                    syncStrategy: 'auto_merge'
                };
                
                await fs.promises.writeFile(metadataFile, JSON.stringify(mergeMetadata, null, 2));
                filesUploaded++;
                
                // 导入合并后的数据到本地
                if (this.dataManagementService) {
                    await this.dataManagementService.importDataObject(mergedData);
                }
                
                await this.updateLocalSyncTime(now);
                
                conflictsDetected++;
                conflictsResolved++;
                conflictDetails.push({
                    type: 'data_conflict',
                    description: '检测到数据冲突，已自动合并',
                    resolution: 'merged'
                });
                
                break;
                
            case 'conflict_detected':
                console.log('检测到严重冲突，创建备份...');
                
                // 创建本地备份
                if (this.dataManagementService) {
                    await this.dataManagementService.createBackup(`冲突备份-本地 - ${now}`);
                }
                
                conflictsDetected++;
                conflictDetails.push({
                    type: 'version_conflict',
                    description: '检测到严重的数据冲突，已创建备份，请手动处理',
                    resolution: 'backup_created'
                });
                
                break;
        }

        const result: SyncResult = {
            success: true,
            message: `同步完成: ${decision.reason}`,
            timestamp: now,
            filesUploaded,
            filesDownloaded,
            conflictsDetected,
            conflictsResolved,
            conflictDetails: conflictDetails.length > 0 ? conflictDetails : undefined
        };

        console.log('iCloud 智能同步完成:', result);
        return result;
    }

    /**
     * 合并数据
     */
    private async mergeData(localData: any, remoteData: any): Promise<any> {
        // 简化的合并算法 - 实际项目中应该根据数据结构实现更智能的合并
        console.log('执行数据合并算法...');
        
        const merged = { ...localData };
        
        // 合并提示词数据（如果存在）
        if (remoteData.prompts && localData.prompts) {
            const localPromptIds = new Set(localData.prompts.map((p: any) => p.id));
            const remoteNewPrompts = remoteData.prompts.filter((p: any) => !localPromptIds.has(p.id));
            merged.prompts = [...localData.prompts, ...remoteNewPrompts];
        } else if (remoteData.prompts) {
            merged.prompts = remoteData.prompts;
        }
        
        // 合并分类数据
        if (remoteData.categories && localData.categories) {
            const localCategoryIds = new Set(localData.categories.map((c: any) => c.id));
            const remoteNewCategories = remoteData.categories.filter((c: any) => !localCategoryIds.has(c.id));
            merged.categories = [...localData.categories, ...remoteNewCategories];
        } else if (remoteData.categories) {
            merged.categories = remoteData.categories;
        }
        
        // 其他数据类型的合并...
        
        console.log('数据合并完成');
        return merged;
    }

    /**
     * 生成详细的数据差异分析
     */
    private async generateDetailedDifferences(localData: any, remoteData: any, localMetadata: SyncMetadata, remoteMetadata: SyncMetadata | null): Promise<{
        added: any[];
        modified: any[];
        deleted: any[];
        summary: {
            localTotal: number;
            remoteTotal: number;
            conflicts: number;
        };
    }> {
        console.log('生成详细的数据差异分析...');
        
        const added: any[] = [];
        const modified: any[] = [];
        const deleted: any[] = [];
        let conflicts = 0;

        // 简化的差异分析实现
        const localTotal = this.calculateTotalRecords(localData);
        const remoteTotal = this.calculateTotalRecords(remoteData);
        
        // 基于记录数差异计算冲突
        if (Math.abs(localTotal - remoteTotal) > 0) {
            conflicts++;
        }

        return {
            added,
            modified,
            deleted,
            summary: {
                localTotal,
                remoteTotal,
                conflicts
            }
        };
    }

    /**
     * 更新本地同步时间和计数
     */
    private async updateLocalSyncTime(syncTime: string): Promise<void> {
        try {
            const currentPrefs = this.preferencesManager.getPreferences();
            const currentSyncCount = currentPrefs.dataSync?.syncCount || 0;
            
            await this.preferencesManager.updatePreferences({
                dataSync: {
                    ...currentPrefs.dataSync,
                    lastSyncTime: syncTime,
                    syncCount: currentSyncCount + 1 // 增加同步计数
                }
            });
            
            console.log(`本地同步信息已更新: 时间=${syncTime}, 计数=${currentSyncCount + 1}`);
        } catch (error) {
            console.error('更新本地同步时间失败:', error);
        }
    }

    /**
     * 生成导出数据
     */
    private async generateExportData(): Promise<any> {
        try {
            // 如果有数据管理服务，使用它来获取数据
            if (this.dataManagementService) {
                return await this.dataManagementService.generateExportData();
            }
            
            // 否则返回空数据结构
            return {
                exportTime: new Date().toISOString(),
                version: '1.0',
                categories: [],
                prompts: [],
                aiConfigs: [],
                aiHistory: [],
                settings: []
            };
        } catch (error) {
            console.error('生成导出数据失败:', error);
            throw new Error(`导出数据失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    /**
     * 启动自动同步
     */
    private startAutoSync() {
        this.stopAutoSync();
        
        if (this.config?.syncInterval) {
            const interval = this.config.syncInterval * 60 * 1000; // 转换为毫秒
            this.syncTimer = setInterval(() => {
                this.performSync().catch(console.error);
            }, interval);
        }
    }

    /**
     * 停止自动同步
     */
    private stopAutoSync() {
        if (this.syncTimer) {
            clearInterval(this.syncTimer);
            this.syncTimer = null;
        }
    }

    /**
     * 生成设备ID
     */
    private generateDeviceId(): string {
        // 基于用户数据路径和系统信息生成唯一设备ID
        const crypto = require('crypto');
        const uniqueString = `${os.hostname()}-${os.platform()}-${app.getPath('userData')}`;
        return crypto.createHash('md5').update(uniqueString).digest('hex').substring(0, 12);
    }

    /**
     * 获取存储的 iCloud 配置
     */
    private async getStoredConfig(): Promise<ICloudConfig | null> {
        try {
            const preferences = this.preferencesManager.getPreferences();
            return preferences.icloud || null;
        } catch (error) {
            console.error('获取 iCloud 配置失败:', error);
            return null;
        }
    }

    /**
     * 分析数据变更详情
     */
    private analyzeDataChanges(newData: any, oldData: any): {
        hasChanges: boolean;
        categoriesAdded: number;
        categoriesModified: number;
        categoriesDeleted: number;
        promptsAdded: number;
        promptsModified: number;
        promptsDeleted: number;
        totalChanges: number;
        details: string[];
    } {
        const analysis = {
            hasChanges: false,
            categoriesAdded: 0,
            categoriesModified: 0,
            categoriesDeleted: 0,
            promptsAdded: 0,
            promptsModified: 0,
            promptsDeleted: 0,
            totalChanges: 0,
            details: [] as string[]
        };

        if (!oldData) {
            // 首次同步
            const newCategories = newData.categories || [];
            const newPrompts = newData.prompts || [];
            
            analysis.categoriesAdded = newCategories.length;
            analysis.promptsAdded = newPrompts.length;
            analysis.hasChanges = analysis.categoriesAdded > 0 || analysis.promptsAdded > 0;
            analysis.totalChanges = analysis.categoriesAdded + analysis.promptsAdded;
            
            if (analysis.hasChanges) {
                if (analysis.categoriesAdded > 0) {
                    analysis.details.push(`新增 ${analysis.categoriesAdded} 个分类`);
                }
                if (analysis.promptsAdded > 0) {
                    analysis.details.push(`新增 ${analysis.promptsAdded} 个提示词`);
                }
            }
            
            return analysis;
        }

        // 比较分类变化
        const oldCategories = oldData.categories || [];
        const newCategories = newData.categories || [];
        
        // 使用 UUID 进行精确比较
        const oldCategoryMap = new Map(oldCategories.map((c: any) => [c.uuid || c.id, c]));
        const newCategoryMap = new Map(newCategories.map((c: any) => [c.uuid || c.id, c]));
        
        for (const [uuid, newCategory] of newCategoryMap) {
            if (!oldCategoryMap.has(uuid)) {
                analysis.categoriesAdded++;
            } else {
                const oldCategory = oldCategoryMap.get(uuid);
                if (this.calculateDataHash(newCategory) !== this.calculateDataHash(oldCategory)) {
                    analysis.categoriesModified++;
                }
            }
        }
        
        for (const [uuid] of oldCategoryMap) {
            if (!newCategoryMap.has(uuid)) {
                analysis.categoriesDeleted++;
            }
        }

        // 比较提示词变化
        const oldPrompts = oldData.prompts || [];
        const newPrompts = newData.prompts || [];
        
        const oldPromptMap = new Map(oldPrompts.map((p: any) => [p.uuid || p.id, p]));
        const newPromptMap = new Map(newPrompts.map((p: any) => [p.uuid || p.id, p]));
        
        for (const [uuid, newPrompt] of newPromptMap) {
            if (!oldPromptMap.has(uuid)) {
                analysis.promptsAdded++;
            } else {
                const oldPrompt = oldPromptMap.get(uuid);
                if (this.calculateDataHash(newPrompt) !== this.calculateDataHash(oldPrompt)) {
                    analysis.promptsModified++;
                }
            }
        }
        
        for (const [uuid] of oldPromptMap) {
            if (!newPromptMap.has(uuid)) {
                analysis.promptsDeleted++;
            }
        }

        // 计算总变更和生成详情
        analysis.totalChanges = 
            analysis.categoriesAdded + analysis.categoriesModified + analysis.categoriesDeleted +
            analysis.promptsAdded + analysis.promptsModified + analysis.promptsDeleted;
        
        analysis.hasChanges = analysis.totalChanges > 0;

        // 生成变更详情
        if (analysis.categoriesAdded > 0) {
            analysis.details.push(`新增 ${analysis.categoriesAdded} 个分类`);
        }
        if (analysis.categoriesModified > 0) {
            analysis.details.push(`修改 ${analysis.categoriesModified} 个分类`);
        }
        if (analysis.categoriesDeleted > 0) {
            analysis.details.push(`删除 ${analysis.categoriesDeleted} 个分类`);
        }
        if (analysis.promptsAdded > 0) {
            analysis.details.push(`新增 ${analysis.promptsAdded} 个提示词`);
        }
        if (analysis.promptsModified > 0) {
            analysis.details.push(`修改 ${analysis.promptsModified} 个提示词`);
        }
        if (analysis.promptsDeleted > 0) {
            analysis.details.push(`删除 ${analysis.promptsDeleted} 个提示词`);
        }

        return analysis;
    }

    /**
     * 构建同步成功消息
     */
    private buildSyncSuccessMessage(operation: 'upload' | 'download', analysis: any): string {
        if (!analysis.hasChanges) {
            return operation === 'upload' ? '数据已上传，无变更' : '数据已下载，无变更';
        }

        const action = operation === 'upload' ? '上传' : '下载';
        const details = analysis.details.join('，');
        
        return `${action}完成：${details}`;
    }
}