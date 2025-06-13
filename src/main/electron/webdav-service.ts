/**
 * WebDAV 同步服务
 * 这个文件需要在主进程中实现
 */

import { ipcMain, app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

// 使用动态导入来避免 ES 模块问题
let createWebDAVClient: any = null;

interface WebDAVConfig {
    serverUrl: string;
    username: string;
    password: string;
}

interface WebDAVTestResult {
    success: boolean;
    message: string;
    serverInfo?: {
        name: string;
        version: string;
    };
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

enum ConflictResolutionStrategy {
    ASK_USER = 'ask_user',
    LOCAL_WINS = 'local_wins', 
    REMOTE_WINS = 'remote_wins',
    AUTO_MERGE = 'auto_merge',
    CREATE_BACKUP = 'create_backup'
}

export class WebDAVService {
    private client: any = null;
    private config: any = null;
    private syncTimer: NodeJS.Timeout | null = null;

    constructor(private preferencesManager: any, private dataManagementService?: any) {
        this.setupIpcHandlers();
    }

    private async getWebDAVClient() {
        if (!createWebDAVClient) {
            try {
                // 使用 eval 来避免 TypeScript 编译器将动态导入转换为 require
                const webdav = await eval('import("webdav")');
                createWebDAVClient = webdav.createClient;
                console.log('WebDAV 模块加载成功');
            } catch (error) {
                console.error('WebDAV 模块加载失败:', error);
                throw new Error('WebDAV 模块加载失败，请确保 webdav 依赖已正确安装');
            }
        }
        return createWebDAVClient;
    }

    private setupIpcHandlers() {
        // 测试 WebDAV 连接
        ipcMain.handle('webdav:test-connection', async (event, config: WebDAVConfig): Promise<WebDAVTestResult> => {
            try {
                console.log('开始测试 WebDAV 连接:', config.serverUrl);
                
                const webdavClient = await this.getWebDAVClient();
                
                // 使用真实的 WebDAV 客户端
                const client = webdavClient(config.serverUrl, {
                    username: config.username,
                    password: config.password,
                    timeout: 10000, // 10秒超时
                });
                
                // 测试连接 - 尝试获取根目录内容
                const contents = await client.getDirectoryContents('/');
                console.log('WebDAV 连接测试成功，目录内容:', contents);
                
                return {
                    success: true,
                    message: '连接成功！服务器响应正常',
                    serverInfo: {
                        name: 'WebDAV Server', 
                        version: '1.0',
                    },
                };
            } catch (error) {
                console.error('WebDAV 连接测试失败:', error);
                
                let errorMessage = '连接失败';
                if (error instanceof Error) {
                    if (error.message.includes('ENOTFOUND')) {
                        errorMessage = '服务器地址无法访问，请检查服务器URL';
                    } else if (error.message.includes('401')) {
                        errorMessage = '认证失败，请检查用户名和密码';
                    } else if (error.message.includes('timeout')) {
                        errorMessage = '连接超时，请检查网络连接';
                    } else if (error.message.includes('ECONNREFUSED')) {
                        errorMessage = '连接被拒绝，请检查服务器是否运行';
                    } else {
                        errorMessage = `连接失败: ${error.message}`;
                    }
                }
                
                return {
                    success: false,
                    message: errorMessage,
                };
            }
        });

        // 立即同步
        ipcMain.handle('webdav:sync-now', async (): Promise<SyncResult> => {
            try {
                // 获取当前保存的 WebDAV 配置
                const preferences = this.preferencesManager.getPreferences();
                const config = preferences.webdav;
                
                if (!config || !config.enabled) {
                    return {
                        success: false,
                        message: 'WebDAV 未启用，请先在设置中配置并启用 WebDAV',
                        timestamp: new Date().toISOString(),
                        filesUploaded: 0,
                        filesDownloaded: 0,
                        conflictsDetected: 0,
                        conflictsResolved: 0,
                    };
                }
                
                if (!config.serverUrl || !config.username || !config.password) {
                    return {
                        success: false,
                        message: 'WebDAV 配置不完整，请检查服务器地址、用户名和密码',
                        timestamp: new Date().toISOString(),
                        filesUploaded: 0,
                        filesDownloaded: 0,
                        conflictsDetected: 0,
                        conflictsResolved: 0,
                    };
                }
                
                // 临时设置配置用于同步
                const oldConfig = this.config;
                this.config = config;
                
                try {
                    const result = await this.performSync();
                    return result;
                } finally {
                    // 恢复原配置
                    this.config = oldConfig;
                }
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

        // 获取同步状态
        ipcMain.handle('webdav:get-sync-status', async () => {
            const preferences = this.preferencesManager.getPreferences();
            return {
                isEnabled: preferences.webdav?.enabled || false,
                lastSyncTime: preferences.dataSync?.lastSyncTime || null,
                nextSyncTime: this.getNextSyncTime(),
                isSyncing: false, // 实际应该跟踪同步状态
            };
        });

        // 设置 WebDAV 配置
        ipcMain.handle('webdav:set-config', async (event, config) => {
            this.config = config;
            await this.preferencesManager.updatePreferences({ webdav: config });
            
            if (config.enabled && config.autoSync) {
                this.startAutoSync();
            } else {
                this.stopAutoSync();
            }
        });

        // 获取 WebDAV 配置
        ipcMain.handle('webdav:get-config', async () => {
            const preferences = this.preferencesManager.getPreferences();
            return preferences.webdav || {
                enabled: false,
                serverUrl: '',
                username: '',
                password: '',
                autoSync: false,
                syncInterval: 30,
            };
        });
    }

    private async performSync(): Promise<SyncResult> {
        try {
            console.log('开始执行 WebDAV 智能同步...');
            
            const webdavClient = await this.getWebDAVClient();
            
            if (!this.config) {
                throw new Error('WebDAV 配置未设置');
            }
            
            const client = webdavClient(this.config.serverUrl, {
                username: this.config.username,
                password: this.config.password,
                timeout: 30000,
            });
            
            const remoteDir = '/ai-gist-data';
            const metadataFile = `${remoteDir}/sync-metadata.json`;
            const dataFile = `${remoteDir}/data-export.json`;
            
            // 确保远程目录存在
            await this.ensureRemoteDirectory(client, remoteDir);
            
            // 获取本地数据和元数据
            const localData = await this.generateExportData();
            const localMetadata = await this.getLocalSyncMetadata();
            localMetadata.totalRecords = this.calculateTotalRecords(localData);
            const localDataHash = this.calculateDataHash(localData);
            
            // 检查远程是否存在数据
            const remoteDataExists = await this.checkRemoteFileExists(client, dataFile);
            const remoteMetadataExists = await this.checkRemoteFileExists(client, metadataFile);
            
            let remoteData = null;
            let remoteMetadata: SyncMetadata | null = null;
            
            if (remoteDataExists && remoteMetadataExists) {
                try {
                    // 下载远程数据和元数据
                    const remoteDataContent = await client.getFileContents(dataFile, { format: 'text' });
                    const remoteMetadataContent = await client.getFileContents(metadataFile, { format: 'text' });
                    
                    remoteData = JSON.parse(remoteDataContent as string);
                    remoteMetadata = JSON.parse(remoteMetadataContent as string);
                    
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
                client, remoteDir, dataFile, metadataFile,
                localData, localMetadata, localDataHash,
                remoteData, remoteMetadata,
                syncDecision
            );
            
            return result;
        } catch (error) {
            console.error('WebDAV 同步失败:', error);
            throw new Error(`同步失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    private async ensureRemoteDirectory(client: any, remoteDir: string): Promise<void> {
        try {
            await client.stat(remoteDir);
        } catch (error) {
            console.log('创建远程目录:', remoteDir);
            await client.createDirectory(remoteDir);
        }
    }

    private async checkRemoteFileExists(client: any, filePath: string): Promise<boolean> {
        try {
            await client.stat(filePath);
            return true;
        } catch (error) {
            return false;
        }
    }

    private async getLocalSyncMetadata(): Promise<SyncMetadata> {
        const preferences = this.preferencesManager.getPreferences();
        const dataSync = preferences.dataSync;
        
        // 生成唯一的设备ID（基于用户数据路径）
        const deviceId = this.generateDeviceId();
        
        // 获取应用版本
        const appVersion = require('../../../package.json').version || '1.0.0';
        
        return {
            lastSyncTime: dataSync?.lastSyncTime || new Date().toISOString(),
            localVersion: '1.0.0',
            remoteVersion: '1.0.0', 
            dataHash: '',
            syncCount: dataSync?.syncCount || 0,
            deviceId: deviceId,
            appVersion: appVersion,
            totalRecords: 0, // 这将在同步时更新
            lastModifiedTime: new Date().toISOString(),
            syncStrategy: 'auto_merge'
        };
    }

    private calculateDataHash(data: any): string {
        // 简单的哈希算法，实际项目中应该使用更强的哈希算法
        const dataString = JSON.stringify(data);
        let hash = 0;
        for (let i = 0; i < dataString.length; i++) {
            const char = dataString.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return hash.toString(16);
    }

    private calculateTotalRecords(data: any): number {
        if (!data) return 0;
        
        let total = 0;
        if (data.categories) total += data.categories.length;
        if (data.prompts) total += data.prompts.length;
        if (data.history) total += data.history.length;
        if (data.settings) total += Object.keys(data.settings).length;
        
        return total;
    }

    private async makeSyncDecision(
        localData: any, localMetadata: SyncMetadata, localDataHash: string,
        remoteData: any, remoteMetadata: SyncMetadata | null
    ): Promise<{
        action: 'upload_only' | 'download_only' | 'merge' | 'conflict_detected';
        strategy: ConflictResolutionStrategy;
        reason: string;
    }> {
        
        // 情况1：远程没有数据，直接上传
        if (!remoteData || !remoteMetadata) {
            return {
                action: 'upload_only',
                strategy: ConflictResolutionStrategy.LOCAL_WINS,
                reason: '远程无数据，执行首次上传'
            };
        }
        
        // 情况2：本地数据为空，直接下载
        if (!localData || Object.keys(localData).length === 0) {
            return {
                action: 'download_only', 
                strategy: ConflictResolutionStrategy.REMOTE_WINS,
                reason: '本地无数据，执行首次下载'
            };
        }
        
        // 情况3：比较数据哈希，如果相同则无需同步
        const remoteDataHash = this.calculateDataHash(remoteData);
        if (localDataHash === remoteDataHash) {
            return {
                action: 'upload_only', // 只更新时间戳
                strategy: ConflictResolutionStrategy.LOCAL_WINS,
                reason: '数据相同，仅更新同步时间'
            };
        }
        
        // 情况4：比较时间戳判断冲突
        const localTime = new Date(localMetadata.lastSyncTime).getTime();
        const remoteTime = new Date(remoteMetadata.lastSyncTime).getTime();
        const timeDiff = Math.abs(localTime - remoteTime);
        
        // 如果时间差小于1分钟，认为是同一时间的更新，尝试合并
        if (timeDiff < 60000) {
            return {
                action: 'merge',
                strategy: ConflictResolutionStrategy.AUTO_MERGE,
                reason: '检测到并发修改，尝试自动合并'
            };
        }
        
        // 情况5：本地更新较新，上传本地数据
        if (localTime > remoteTime) {
            return {
                action: 'upload_only',
                strategy: ConflictResolutionStrategy.LOCAL_WINS,
                reason: '本地数据更新，上传到远程'
            };
        }
        
        // 情况6：远程更新较新，下载远程数据
        if (remoteTime > localTime) {
            return {
                action: 'download_only',
                strategy: ConflictResolutionStrategy.REMOTE_WINS,
                reason: '远程数据更新，下载到本地'
            };
        }
        
        // 情况7：无法确定，标记为冲突
        return {
            action: 'conflict_detected',
            strategy: ConflictResolutionStrategy.CREATE_BACKUP,
            reason: '检测到数据冲突，需要人工处理'
        };
    }

    private async executeSyncOperation(
        client: any, remoteDir: string, dataFile: string, metadataFile: string,
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
                
                // 上传数据文件
                await client.putFileContents(dataFile, JSON.stringify(localData, null, 2));
                filesUploaded++;
                
                // 更新并上传元数据
                const uploadMetadata: SyncMetadata = {
                    ...localMetadata,
                    lastSyncTime: now,
                    dataHash: localDataHash,
                    syncCount: (localMetadata.syncCount || 0) + 1,
                    totalRecords: this.calculateTotalRecords(localData),
                    lastModifiedTime: now
                };
                
                await client.putFileContents(metadataFile, JSON.stringify(uploadMetadata, null, 2));
                filesUploaded++;
                
                // 更新本地同步时间
                await this.updateLocalSyncTime(now);
                
                break;
                
            case 'download_only':
                console.log('执行下载操作...');
                
                if (remoteData && this.dataManagementService) {
                    // 导入远程数据到本地
                    await this.dataManagementService.importDataObject(remoteData);
                    filesDownloaded++;
                    
                    // 更新本地同步时间
                    await this.updateLocalSyncTime(remoteMetadata?.lastSyncTime || now);
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
                await client.putFileContents(dataFile, JSON.stringify(mergedData, null, 2));
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
                
                await client.putFileContents(metadataFile, JSON.stringify(mergeMetadata, null, 2));
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

        console.log('WebDAV 智能同步完成:', result);
        return result;
    }

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
     * 比较数据版本，检测冲突
     */
    private async compareDataVersions(localData: any, remoteData: any): Promise<any[]> {
        const conflicts: any[] = [];
        
        try {
            // 比较分类
            if (localData.categories && remoteData.categories) {
                const localCategories = new Map(localData.categories.map((c: any) => [c.id, c]));
                const remoteCategories = new Map(remoteData.categories.map((c: any) => [c.id, c]));
                
                for (const [id, localCat] of localCategories) {
                    const remoteCat = remoteCategories.get(id);
                    if (remoteCat && JSON.stringify(localCat) !== JSON.stringify(remoteCat)) {
                        conflicts.push({
                            type: 'category',
                            id,
                            localVersion: localCat,
                            remoteVersion: remoteCat,
                            conflictReason: 'modified_both'
                        });
                    }
                }
            }
            
            // 比较提示词
            if (localData.prompts && remoteData.prompts) {
                const localPrompts = new Map(localData.prompts.map((p: any) => [p.id, p]));
                const remotePrompts = new Map(remoteData.prompts.map((p: any) => [p.id, p]));
                
                for (const [id, localPrompt] of localPrompts) {
                    const remotePrompt = remotePrompts.get(id);
                    if (remotePrompt && JSON.stringify(localPrompt) !== JSON.stringify(remotePrompt)) {
                        conflicts.push({
                            type: 'prompt',
                            id,
                            localVersion: localPrompt,
                            remoteVersion: remotePrompt,
                            conflictReason: 'modified_both'
                        });
                    }
                }
            }
            
            console.log(`检测到 ${conflicts.length} 个冲突`);
            return conflicts;
        } catch (error) {
            console.error('比较数据版本失败:', error);
            return [];
        }
    }
    
    /**
     * 合并有冲突的数据
     */
    private async mergeConflictedData(localData: any, remoteData: any, conflicts: any[]): Promise<any> {
        try {
            const mergedData = JSON.parse(JSON.stringify(localData)); // 深拷贝本地数据作为基础
            
            for (const conflict of conflicts) {
                switch (conflict.type) {
                    case 'category':
                        // 简单策略：优先使用最新修改时间的版本
                        const localModTime = new Date(conflict.localVersion.updatedAt || conflict.localVersion.createdAt).getTime();
                        const remoteModTime = new Date(conflict.remoteVersion.updatedAt || conflict.remoteVersion.createdAt).getTime();
                        
                        if (remoteModTime > localModTime) {
                            const categoryIndex = mergedData.categories.findIndex((c: any) => c.id === conflict.id);
                            if (categoryIndex >= 0) {
                                mergedData.categories[categoryIndex] = conflict.remoteVersion;
                            }
                        }
                        break;
                        
                    case 'prompt':
                        // 对于提示词，也使用最新修改时间的版本
                        const localPromptModTime = new Date(conflict.localVersion.updatedAt || conflict.localVersion.createdAt).getTime();
                        const remotePromptModTime = new Date(conflict.remoteVersion.updatedAt || conflict.remoteVersion.createdAt).getTime();
                        
                        if (remotePromptModTime > localPromptModTime) {
                            const promptIndex = mergedData.prompts.findIndex((p: any) => p.id === conflict.id);
                            if (promptIndex >= 0) {
                                mergedData.prompts[promptIndex] = conflict.remoteVersion;
                            }
                        }
                        break;
                }
            }
            
            // 添加远程独有的数据
            if (remoteData.categories) {
                const localCategoryIds = new Set(mergedData.categories?.map((c: any) => c.id) || []);
                const newRemoteCategories = remoteData.categories.filter((c: any) => !localCategoryIds.has(c.id));
                if (newRemoteCategories.length > 0) {
                    mergedData.categories = [...(mergedData.categories || []), ...newRemoteCategories];
                }
            }
            
            if (remoteData.prompts) {
                const localPromptIds = new Set(mergedData.prompts?.map((p: any) => p.id) || []);
                const newRemotePrompts = remoteData.prompts.filter((p: any) => !localPromptIds.has(p.id));
                if (newRemotePrompts.length > 0) {
                    mergedData.prompts = [...(mergedData.prompts || []), ...newRemotePrompts];
                }
            }
            
            console.log(`数据合并完成，解决了 ${conflicts.length} 个冲突`);
            return mergedData;
        } catch (error) {
            console.error('合并冲突数据失败:', error);
            throw new Error(`数据合并失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }
    
    /**
     * 更新本地同步时间
     */
    private async updateLocalSyncTime(syncTime: string): Promise<void> {
        try {
            const currentPrefs = this.preferencesManager.getPreferences();
            await this.preferencesManager.updatePreferences({
                dataSync: {
                    ...currentPrefs.dataSync,
                    lastSyncTime: syncTime
                }
            });
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
            
            // 否则直接从数据库文件读取数据（简化版本）
            const userDataPath = app.getPath('userData');
            const dbPath = path.join(userDataPath, 'ai-gist.db');
            
            if (fs.existsSync(dbPath)) {
                // 这里应该连接数据库并导出数据
                // 暂时返回一个示例结构
                return {
                    exportTime: new Date().toISOString(),
                    version: '1.0',
                    data: {
                        // 这里应该包含实际的数据库数据
                        message: '数据导出功能需要完整的数据库访问实现'
                    }
                };
            } else {
                return {
                    exportTime: new Date().toISOString(),
                    version: '1.0',
                    data: {
                        message: '暂无数据'
                    }
                };
            }
        } catch (error) {
            console.error('生成导出数据失败:', error);
            throw new Error(`生成导出数据失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    private startAutoSync() {
        this.stopAutoSync();
        
        if (this.config?.syncInterval) {
            const interval = this.config.syncInterval * 60 * 1000; // 转换为毫秒
            this.syncTimer = setInterval(() => {
                this.performSync().catch(console.error);
            }, interval);
        }
    }

    private stopAutoSync() {
        if (this.syncTimer) {
            clearInterval(this.syncTimer);
            this.syncTimer = null;
        }
    }

    private getNextSyncTime(): string | null {
        if (!this.config?.autoSync || !this.config?.syncInterval) {
            return null;
        }
        
        const now = new Date();
        const nextSync = new Date(now.getTime() + this.config.syncInterval * 60 * 1000);
        return nextSync.toISOString();
    }

    private generateDeviceId(): string {
        // 基于用户数据路径和系统信息生成唯一设备ID
        const os = require('os');
        const crypto = require('crypto');
        const { app } = require('electron');
        
        const uniqueString = `${os.hostname()}-${os.platform()}-${app.getPath('userData')}`;
        return crypto.createHash('md5').update(uniqueString).digest('hex').substring(0, 12);
    }
}
