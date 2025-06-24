/**
 * 现代化 iCloud 同步服务
 * 基于 UUID 的可靠数据同步方案
 * 与 WebDAV 服务保持一致的架构
 */

import { app, ipcMain, shell } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';

// 现代化数据结构接口（与 WebDAV 保持一致）
interface DataItem {
    id: string; // UUID
    type: 'category' | 'prompt' | 'aiConfig' | 'setting' | 'user' | 'post' | 'history';
    title?: string;
    content: any;
    metadata: DataItemMetadata;
}

interface DataItemMetadata {
    createdAt: string; // ISO 8601
    updatedAt: string; // ISO 8601
    version: number; // 版本号
    deviceId: string; // 创建设备ID
    lastModifiedBy: string; // 最后修改的设备ID
    checksum: string; // 内容校验和
    deleted?: boolean; // 软删除标记
    tags?: string[]; // 标签
    syncStatus?: 'synced' | 'pending' | 'conflict'; // 同步状态
}

interface SyncSnapshot {
    timestamp: string;
    version: string;
    deviceId: string;
    items: DataItem[];
    metadata: SnapshotMetadata;
}

interface SnapshotMetadata {
    totalItems: number;
    checksum: string; // 整个快照的校验和
    syncId: string; // 同步操作的唯一ID
    previousSyncId?: string; // 上一次同步的ID
    conflictsResolved: ConflictResolution[];
    deviceInfo: {
        id: string;
        name: string;
        platform: string;
        appVersion: string;
    };
}

interface ConflictResolution {
    itemId: string;
    strategy: 'local_wins' | 'remote_wins' | 'merge' | 'create_duplicate';
    timestamp: string;
    reason: string;
}

interface SyncResult {
    success: boolean;
    message: string;
    timestamp: string;
    itemsProcessed: number;
    itemsUpdated: number;
    itemsCreated: number;
    itemsDeleted: number;
    conflictsResolved: number;
    conflictDetails: ConflictResolution[];
    errors: string[];
    // 新增同步阶段信息
    phases: {
        upload: { completed: boolean; itemsProcessed: number; errors: string[] };
        deleteRemote: { completed: boolean; itemsProcessed: number; errors: string[] };
        download: { completed: boolean; itemsProcessed: number; errors: string[] };
    };
    // 新增合并确认相关信息
    autoMergeConfirmed?: boolean;
    mergeInfo?: {
        localItems: number;
        remoteItems: number;
        conflictingItems: number;
    };
}

interface ICloudConfig {
    enabled: boolean;
    autoSync: boolean;
    syncInterval: number; // 分钟
    customPath?: string; // 可选的自定义同步路径
    // 连接验证状态
    connectionTested?: boolean;
    connectionValid?: boolean;
    connectionMessage?: string;
    connectionTestedAt?: string; // ISO 时间戳
    // 用于检测配置是否变更的哈希值
    configHash?: string;
}

interface ICloudTestResult {
    success: boolean;
    message: string;
    iCloudPath?: string;
    available?: boolean;
}

interface ManualSyncResult {
    success: boolean;
    message: string;
    timestamp: string;
    hasConflicts: boolean;
    conflictDetails?: ConflictResolution[];
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

// 错误重试配置
interface RetryConfig {
    maxRetries: number;
    baseDelay: number; // 基础延迟（毫秒）
    maxDelay: number;  // 最大延迟（毫秒）
    backoffMultiplier: number;
}

/**
 * 现代化 iCloud 同步服务
 * 基于 UUID 的可靠数据同步
 */
export class ICloudService {
    private config: ICloudConfig | null = null;
    private deviceId: string;
    private isInitialized = false;
    private syncInProgress = false;
    private autoSyncTimer: NodeJS.Timeout | null = null;
    private preferencesManager: any;
    private dataManagementService: any;
    
    // iCloud 特定配置
    private readonly defaultICloudPath: string;
    private readonly syncDirName = 'AI-Gist-Sync';
    
    // 重试机制
    private retryConfig: RetryConfig = {
        maxRetries: 3,
        baseDelay: 1000,
        maxDelay: 30000,
        backoffMultiplier: 2
    };
    
    // 同步状态追踪
    private lastSuccessfulSync: string | null = null;
    private consecutiveFailures = 0;

    constructor(preferencesManager: any, dataManagementService?: any) {
        this.preferencesManager = preferencesManager;
        this.dataManagementService = dataManagementService;
        this.deviceId = this.generateDeviceId();
        
        // 默认 iCloud Drive 路径
        this.defaultICloudPath = path.join(os.homedir(), 'Library', 'Mobile Documents', 'com~apple~CloudDocs');
        
        console.log(`iCloudService initialized with device ID: ${this.deviceId}`);
        console.log('默认 iCloud Drive 路径:', this.defaultICloudPath);
    }

    /**
     * 初始化服务
     */
    async initialize(): Promise<void> {
        console.log('[iCloud] 开始初始化服务...');
        try {
            this.config = await this.loadConfig();
            if (this.config?.enabled && this.config?.autoSync) {
                this.startAutoSync();
            }
            this.isInitialized = true;
            console.log('[iCloud] 服务初始化完成');
        } catch (error) {
            console.error('[iCloud] 初始化失败:', error);
            throw error;
        }
    }

    /**
     * 生成设备唯一ID
     */
    private generateDeviceId(): string {
        const platform = process.platform;
        let hostname: string;
        try {
            hostname = os.hostname() || 'unknown';
        } catch (error) {
            hostname = 'unknown';
        }
        
        const machineId = crypto.createHash('sha256')
            .update(`${platform}-${hostname}-${app.getPath('userData')}`)
            .digest('hex')
            .substring(0, 16);
            
        return machineId;
    }

    /**
     * 计算配置哈希值，用于检测配置是否发生变更
     */
    private computeConfigHash(config: { customPath?: string }): string {
        const configStr = `${config.customPath || ''}`
        // 简单的哈希函数
        let hash = 0
        for (let i = 0; i < configStr.length; i++) {
            const char = configStr.charCodeAt(i)
            hash = ((hash << 5) - hash) + char
            hash = hash & hash // 转为32位整数
        }
        return hash.toString()
    }

    /**
     * 加载配置
     */
    private async loadConfig(): Promise<ICloudConfig | null> {
        console.log('[iCloud] loadConfig() - 开始加载配置');
        try {
            const preferences = this.preferencesManager.getPreferences();
            const config = preferences.icloud;
            
            console.log('[iCloud] loadConfig() - 配置详情:', {
                hasConfig: !!config,
                enabled: config?.enabled,
                autoSync: config?.autoSync,
                syncInterval: config?.syncInterval,
                hasCustomPath: !!config?.customPath
            });

            if (!config) {
                console.log('[iCloud] loadConfig() - 未找到配置，返回默认配置');
                return {
                    enabled: false,
                    autoSync: false,
                    syncInterval: 30
                };
            }

            return config;
        } catch (error) {
            console.error('[iCloud] loadConfig() - 加载配置失败:', error);
            return null;
        }
    }

    /**
     * 获取本地数据快照
     */
    private async getLocalSnapshot(): Promise<SyncSnapshot> {
        console.log('[iCloud] 开始获取本地数据快照...');
        
        try {
            // 从数据管理服务获取数据
            const localData = await this.exportLocalData();
            console.log('[iCloud] 获取到的本地数据:', {
                hasData: !!localData,
                categories: localData?.categories?.length || 0,
                prompts: localData?.prompts?.length || 0,
                aiConfigs: localData?.aiConfigs?.length || 0
            });

            // 转换为现代格式
            const items = await this.convertToModernFormat(localData);
            
            const now = new Date().toISOString();
            const syncId = uuidv4();
            
            const snapshot: SyncSnapshot = {
                timestamp: now,
                version: '2.0.0',
                deviceId: this.deviceId,
                items,
                metadata: {
                    totalItems: items.length,
                    checksum: this.calculateChecksum(items),
                    syncId,
                    conflictsResolved: [],
                    deviceInfo: {
                        id: this.deviceId,
                        name: os.hostname() || 'Unknown',
                        platform: process.platform,
                        appVersion: app.getVersion() || '1.0.0'
                    }
                }
            };

            console.log('[iCloud] 本地快照生成完成，包含', items.length, '个数据项');
            return snapshot;
        } catch (error) {
            console.error('[iCloud] 获取本地快照失败:', error);
            throw error;
        }
    }

    /**
     * 将传统数据格式转换为现代格式
     */
    private async convertToModernFormat(legacyData: any): Promise<DataItem[]> {
        console.log('[iCloud] 开始转换传统数据格式为现代格式...');
        console.log('[iCloud] 输入数据详情:', {
            hasData: !!legacyData,
            dataType: typeof legacyData,
            isArray: Array.isArray(legacyData),
            keys: legacyData ? Object.keys(legacyData) : [],
            categories: legacyData?.categories ? {
                isArray: Array.isArray(legacyData.categories),
                length: legacyData.categories.length || 0
            } : null,
            prompts: legacyData?.prompts ? {
                isArray: Array.isArray(legacyData.prompts),
                length: legacyData.prompts.length || 0
            } : null,
            aiConfigs: legacyData?.aiConfigs ? {
                isArray: Array.isArray(legacyData.aiConfigs),
                length: legacyData.aiConfigs.length || 0
            } : null
        });
        
        const items: DataItem[] = [];
        const now = new Date().toISOString();

        // 转换分类
        if (legacyData.categories && Array.isArray(legacyData.categories)) {
            for (const category of legacyData.categories) {
                const item: DataItem = {
                    id: category.uuid || category.id || uuidv4(),
                    type: 'category',
                    title: category.name || category.title,
                    content: {
                        name: category.name,
                        description: category.description,
                        icon: category.icon,
                        color: category.color,
                        order: category.order
                    },
                    metadata: {
                        createdAt: category.createdAt || now,
                        updatedAt: category.updatedAt || now,
                        version: 1,
                        deviceId: this.deviceId,
                        lastModifiedBy: this.deviceId,
                        checksum: this.calculateItemChecksum(category),
                        deleted: category.deleted || false
                    }
                };
                items.push(item);
            }
            console.log('[iCloud] 转换了', legacyData.categories.length, '个分类');
        } else {
            console.log('[iCloud] 未找到分类数据或格式不正确');
        }

        // 转换提示词
        if (legacyData.prompts && Array.isArray(legacyData.prompts)) {
            for (const prompt of legacyData.prompts) {
                const item: DataItem = {
                    id: prompt.uuid || prompt.id || uuidv4(),
                    type: 'prompt',
                    title: prompt.title || prompt.name,
                    content: {
                        title: prompt.title,
                        content: prompt.content,
                        categoryId: prompt.categoryId,
                        tags: prompt.tags,
                        isPrivate: prompt.isPrivate,
                        order: prompt.order,
                        usageCount: prompt.usageCount
                    },
                    metadata: {
                        createdAt: prompt.createdAt || now,
                        updatedAt: prompt.updatedAt || now,
                        version: 1,
                        deviceId: this.deviceId,
                        lastModifiedBy: this.deviceId,
                        checksum: this.calculateItemChecksum(prompt),
                        deleted: prompt.deleted || false,
                        tags: prompt.tags
                    }
                };
                items.push(item);
            }
            console.log('[iCloud] 转换了', legacyData.prompts.length, '个提示词');
        } else {
            console.log('[iCloud] 未找到提示词数据或格式不正确');
        }

        // 转换AI配置
        if (legacyData.aiConfigs && Array.isArray(legacyData.aiConfigs)) {
            for (const aiConfig of legacyData.aiConfigs) {
                const item: DataItem = {
                    id: aiConfig.uuid || aiConfig.id || uuidv4(),
                    type: 'aiConfig',
                    title: aiConfig.name || aiConfig.title,
                    content: {
                        name: aiConfig.name,
                        type: aiConfig.type,
                        apiKey: aiConfig.apiKey,
                        baseUrl: aiConfig.baseUrl,
                        model: aiConfig.model,
                        settings: aiConfig.settings
                    },
                    metadata: {
                        createdAt: aiConfig.createdAt || now,
                        updatedAt: aiConfig.updatedAt || now,
                        version: 1,
                        deviceId: this.deviceId,
                        lastModifiedBy: this.deviceId,
                        checksum: this.calculateItemChecksum(aiConfig),
                        deleted: aiConfig.deleted || false
                    }
                };
                items.push(item);
            }
            console.log('[iCloud] 转换了', legacyData.aiConfigs.length, '个AI配置');
        } else {
            console.log('[iCloud] 未找到AI配置数据或格式不正确');
        }

        // 转换其他数据类型...
        this.convertOtherDataTypes(legacyData, items, now);

        console.log('[iCloud] 数据格式转换完成，最终生成', items.length, '个数据项');
        return items;
    }

    /**
     * 转换其他数据类型
     */
    private convertOtherDataTypes(legacyData: any, items: DataItem[], now: string): void {
        // 可以根据需要添加更多数据类型的转换
        const dataTypes = ['settings', 'users', 'posts', 'histories'];
        
        for (const dataType of dataTypes) {
            if (legacyData[dataType] && Array.isArray(legacyData[dataType])) {
                for (const item of legacyData[dataType]) {
                    const dataItem: DataItem = {
                        id: item.uuid || item.id || uuidv4(),
                        type: dataType.slice(0, -1) as any, // 去掉复数s
                        title: item.title || item.name,
                        content: item,
                        metadata: {
                            createdAt: item.createdAt || now,
                            updatedAt: item.updatedAt || now,
                            version: 1,
                            deviceId: this.deviceId,
                            lastModifiedBy: this.deviceId,
                            checksum: this.calculateItemChecksum(item),
                            deleted: item.deleted || false
                        }
                    };
                    items.push(dataItem);
                }
                console.log(`[iCloud] 转换了 ${legacyData[dataType].length} 个 ${dataType}`);
            }
        }
    }

    /**
     * 计算数据项校验和
     */
    private calculateItemChecksum(item: any): string {
        // 创建一个标准化的数据副本用于计算校验和
        const normalized = this.normalizeForChecksum(item);
        return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
    }

    /**
     * 计算整个数据集的校验和
     */
    private calculateChecksum(items: DataItem[]): string {
        const sorted = items.sort((a, b) => a.id.localeCompare(b.id));
        const combined = sorted.map(item => ({
            id: item.id,
            checksum: item.metadata.checksum,
            updatedAt: item.metadata.updatedAt
        }));
        return crypto.createHash('sha256').update(JSON.stringify(combined)).digest('hex');
    }

    /**
     * 标准化数据用于校验和计算
     */
    private normalizeForChecksum(data: any): any {
        if (data === null || data === undefined) {
            return data;
        }

        if (Array.isArray(data)) {
            return data.map(item => this.normalizeForChecksum(item)).sort();
        }

        if (typeof data === 'object') {
            const normalized: any = {};
            const keys = Object.keys(data).sort();
            
            for (const key of keys) {
                // 跳过时间戳和易变字段
                if (!['createdAt', 'updatedAt', 'lastModifiedAt', 'syncTime'].includes(key)) {
                    normalized[key] = this.normalizeForChecksum(data[key]);
                }
            }
            
            return normalized;
        }

        return data;
    }

    /**
     * 执行智能同步 - 基于三阶段同步策略
     */
    async performIntelligentSync(config?: ICloudConfig): Promise<SyncResult> {
        console.log('[iCloud] 开始执行智能同步...');
        
        if (this.syncInProgress) {
            return {
                success: false,
                message: '同步正在进行中，请稍后再试',
                timestamp: new Date().toISOString(),
                itemsProcessed: 0,
                itemsUpdated: 0,
                itemsCreated: 0,
                itemsDeleted: 0,
                conflictsResolved: 0,
                conflictDetails: [],
                errors: ['同步正在进行中'],
                phases: {
                    upload: { completed: false, itemsProcessed: 0, errors: [] },
                    deleteRemote: { completed: false, itemsProcessed: 0, errors: [] },
                    download: { completed: false, itemsProcessed: 0, errors: [] }
                }
            };
        }

        this.syncInProgress = true;

        try {
            const result = await this.executeWithRetry(
                () => this.performSyncInternal(config),
                'intelligentSync'
            );

            if (result.success) {
                this.lastSuccessfulSync = result.timestamp;
                this.consecutiveFailures = 0;
                await this.updateLocalSyncTime(result.timestamp);
            } else {
                this.consecutiveFailures++;
            }

            return result;
        } catch (error) {
            console.error('[iCloud] 智能同步失败:', error);
            this.consecutiveFailures++;
            
            const errorMessage = error instanceof Error ? error.message : String(error);
            return {
                success: false,
                message: `同步失败: ${errorMessage}`,
                timestamp: new Date().toISOString(),
                itemsProcessed: 0,
                itemsUpdated: 0,
                itemsCreated: 0,
                itemsDeleted: 0,
                conflictsResolved: 0,
                conflictDetails: [],
                errors: [errorMessage],
                phases: {
                    upload: { completed: false, itemsProcessed: 0, errors: [errorMessage] },
                    deleteRemote: { completed: false, itemsProcessed: 0, errors: [] },
                    download: { completed: false, itemsProcessed: 0, errors: [] }
                }
            };
        } finally {
            this.syncInProgress = false;
        }
    }

    /**
     * 内部同步实现
     */
    private async performSyncInternal(config?: ICloudConfig): Promise<SyncResult> {
        console.log('[iCloud] 开始内部同步流程...');
        
        // 测试 iCloud 可用性
        const testResult = await this.testICloudAvailability();
        if (!testResult.success) {
            throw new Error(`iCloud 不可用: ${testResult.message}`);
        }

        // 获取本地快照
        const localSnapshot = await this.getLocalSnapshot();
        console.log('[iCloud] 本地快照:', {
            timestamp: localSnapshot.timestamp,
            itemCount: localSnapshot.items.length,
            deviceId: localSnapshot.deviceId
        });

        // 确保同步目录存在
        const syncDir = this.getSyncDirectory();
        await this.ensureSyncDirectory(syncDir);

        // 获取远程快照
        const remoteSnapshot = await this.getRemoteSnapshot(syncDir);
        console.log('[iCloud] 远程快照:', {
            exists: !!remoteSnapshot,
            timestamp: remoteSnapshot?.timestamp,
            itemCount: remoteSnapshot?.items?.length || 0
        });

        // 如果远程没有数据，执行初始上传
        if (!remoteSnapshot) {
            return await this.performInitialUpload(syncDir, localSnapshot);
        }

        // 检查是否需要用户确认合并
        if (await this.checkIfNeedsMergeConfirmation(localSnapshot, remoteSnapshot)) {
            return {
                success: false,
                message: '检测到数据冲突，需要用户确认合并策略',
                timestamp: new Date().toISOString(),
                itemsProcessed: 0,
                itemsUpdated: 0,
                itemsCreated: 0,
                itemsDeleted: 0,
                conflictsResolved: 0,
                conflictDetails: [],
                errors: [],
                phases: {
                    upload: { completed: false, itemsProcessed: 0, errors: [] },
                    deleteRemote: { completed: false, itemsProcessed: 0, errors: [] },
                    download: { completed: false, itemsProcessed: 0, errors: [] }
                },
                mergeInfo: {
                    localItems: localSnapshot.items.length,
                    remoteItems: remoteSnapshot.items.length,
                    conflictingItems: this.getConflictingItemsCount(localSnapshot, remoteSnapshot)
                }
            };
        }

        // 执行智能合并
        return await this.performIntelligentMerge(syncDir, localSnapshot, remoteSnapshot);
    }

    /**
     * 测试 iCloud Drive 可用性
     */
    private async testICloudAvailability(): Promise<ICloudTestResult> {
        try {
            console.log('[iCloud] 测试 iCloud Drive 可用性...');
            
            const iCloudPath = this.getICloudPath();
            console.log('[iCloud] 检查路径:', iCloudPath);

            // 检查 iCloud Drive 目录是否存在
            if (!fs.existsSync(iCloudPath)) {
                const result = {
                    success: false,
                    message: 'iCloud Drive 目录不存在，请确保已启用 iCloud Drive',
                    available: false
                };
                
                // 保存失败状态到配置
                await this.saveConnectionStatus(result, false);
                return result;
            }

            // 尝试读取目录内容以确认权限
            try {
                fs.readdirSync(iCloudPath);
            } catch (error) {
                const result = {
                    success: false,
                    message: '无法访问 iCloud Drive 目录，权限不足',
                    available: false
                };
                
                // 保存失败状态到配置
                await this.saveConnectionStatus(result, false);
                return result;
            }

            // 测试写入权限
            const testFile = path.join(iCloudPath, '.ai-gist-test');
            try {
                fs.writeFileSync(testFile, 'test');
                fs.unlinkSync(testFile);
            } catch (error) {
                const result = {
                    success: false,
                    message: '无法写入 iCloud Drive 目录，权限不足',
                    available: false
                };
                
                // 保存失败状态到配置
                await this.saveConnectionStatus(result, false);
                return result;
            }

            console.log('[iCloud] iCloud Drive 可用性测试通过');
            const result = {
                success: true,
                message: 'iCloud Drive 可用',
                iCloudPath,
                available: true
            };
            
            // 保存成功状态到配置
            await this.saveConnectionStatus(result, true);
            return result;
        } catch (error) {
            console.error('[iCloud] iCloud Drive 可用性测试失败:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            const result = {
                success: false,
                message: `测试失败: ${errorMessage}`,
                available: false
            };
            
            // 保存失败状态到配置
            await this.saveConnectionStatus(result, false);
            return result;
        }
    }

    /**
     * 保存连接状态到配置
     */
    private async saveConnectionStatus(testResult: ICloudTestResult, isValid: boolean): Promise<void> {
        try {
            const currentConfig = this.config || {
                enabled: false,
                autoSync: false,
                syncInterval: 30
            };
            
            const configHash = this.computeConfigHash(currentConfig);
            
            // 更新配置中的连接验证状态
            Object.assign(currentConfig, {
                connectionTested: true,
                connectionValid: isValid,
                connectionMessage: testResult.message,
                connectionTestedAt: new Date().toISOString(),
                configHash: configHash,
                // 如果测试成功且有路径信息，保存路径
                ...(testResult.iCloudPath && { customPath: testResult.iCloudPath })
            });
            
            // 保存到偏好设置
            this.preferencesManager.updatePreferences({ icloud: currentConfig });
            this.config = currentConfig;
            
            console.log('[iCloud] 连接状态已保存到配置:', {
                tested: true,
                valid: isValid,
                message: testResult.message,
                testedAt: currentConfig.connectionTestedAt,
                path: testResult.iCloudPath
            });
        } catch (error) {
            console.error('[iCloud] 保存连接状态失败:', error);
        }
    }

    /**
     * 获取远程快照
     */
    private async getRemoteSnapshot(syncDir: string): Promise<SyncSnapshot | null> {
        const snapshotFile = path.join(syncDir, 'snapshot.json');
        
        try {
            if (!fs.existsSync(snapshotFile)) {
                console.log('[iCloud] 远程快照文件不存在');
                return null;
            }

            const snapshotData = JSON.parse(fs.readFileSync(snapshotFile, 'utf8'));
            console.log('[iCloud] 成功读取远程快照');
            return snapshotData;
        } catch (error) {
            console.error('[iCloud] 读取远程快照失败:', error);
            return null;
        }
    }

    /**
     * 执行初始上传
     */
    private async performInitialUpload(syncDir: string, localSnapshot: SyncSnapshot): Promise<SyncResult> {
        console.log('[iCloud] 执行初始上传...');
        
        const result: SyncResult = {
            success: true,
            message: '初始上传完成',
            timestamp: new Date().toISOString(),
            itemsProcessed: localSnapshot.items.length,
            itemsUpdated: 0,
            itemsCreated: localSnapshot.items.length,
            itemsDeleted: 0,
            conflictsResolved: 0,
            conflictDetails: [],
            errors: [],
            phases: {
                upload: { completed: false, itemsProcessed: 0, errors: [] },
                deleteRemote: { completed: true, itemsProcessed: 0, errors: [] },
                download: { completed: true, itemsProcessed: 0, errors: [] }
            }
        };

        try {
            // 保存快照到 iCloud
            const snapshotFile = path.join(syncDir, 'snapshot.json');
            fs.writeFileSync(snapshotFile, JSON.stringify(localSnapshot, null, 2));
            
            // 保存备份数据
            const backupFile = path.join(syncDir, `backup-${Date.now()}.json`);
            const exportData = await this.exportLocalData();
            fs.writeFileSync(backupFile, JSON.stringify(exportData, null, 2));

            result.phases.upload.completed = true;
            result.phases.upload.itemsProcessed = localSnapshot.items.length;
            
            console.log('[iCloud] 初始上传成功');
            return result;
        } catch (error) {
            console.error('[iCloud] 初始上传失败:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            result.success = false;
            result.message = `初始上传失败: ${errorMessage}`;
            result.errors.push(errorMessage);
            result.phases.upload.errors.push(errorMessage);
            return result;
        }
    }

    /**
     * 执行智能合并
     */
    private async performIntelligentMerge(
        syncDir: string,
        localSnapshot: SyncSnapshot,
        remoteSnapshot: SyncSnapshot
    ): Promise<SyncResult> {
        console.log('[iCloud] 执行智能合并...');
        
        const result: SyncResult = {
            success: true,
            message: '智能合并完成',
            timestamp: new Date().toISOString(),
            itemsProcessed: 0,
            itemsUpdated: 0,
            itemsCreated: 0,
            itemsDeleted: 0,
            conflictsResolved: 0,
            conflictDetails: [],
            errors: [],
            phases: {
                upload: { completed: false, itemsProcessed: 0, errors: [] },
                deleteRemote: { completed: false, itemsProcessed: 0, errors: [] },
                download: { completed: false, itemsProcessed: 0, errors: [] }
            }
        };

        try {
            // 执行三阶段同步
            await this.performUploadPhase(syncDir, localSnapshot, remoteSnapshot, result);
            await this.performDeleteRemotePhase(syncDir, localSnapshot, remoteSnapshot, result);
            await this.performDownloadAndMergePhase(syncDir, localSnapshot, remoteSnapshot, result);

            // 保存更新后的快照
            const updatedSnapshot = await this.getLocalSnapshot();
            const snapshotFile = path.join(syncDir, 'snapshot.json');
            fs.writeFileSync(snapshotFile, JSON.stringify(updatedSnapshot, null, 2));

            console.log('[iCloud] 智能合并完成');
            return result;
        } catch (error) {
            console.error('[iCloud] 智能合并失败:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            result.success = false;
            result.message = `智能合并失败: ${errorMessage}`;
            result.errors.push(errorMessage);
            return result;
        }
    }

    /**
     * 阶段1：上传本地变更
     */
    private async performUploadPhase(
        syncDir: string,
        localSnapshot: SyncSnapshot,
        remoteSnapshot: SyncSnapshot,
        result: SyncResult
    ): Promise<void> {
        console.log('[iCloud] 执行上传阶段...');
        
        const remoteItemsMap = new Map(remoteSnapshot.items.map(item => [item.id, item]));
        const localChanges: DataItem[] = [];

        for (const localItem of localSnapshot.items) {
            const remoteItem = remoteItemsMap.get(localItem.id);
            
            if (!remoteItem) {
                // 新项目
                localChanges.push(localItem);
                result.itemsCreated++;
            } else if (new Date(localItem.metadata.updatedAt) > new Date(remoteItem.metadata.updatedAt)) {
                // 本地更新
                localChanges.push(localItem);
                result.itemsUpdated++;
            }
        }

        result.phases.upload.itemsProcessed = localChanges.length;
        result.phases.upload.completed = true;
        result.itemsProcessed += localChanges.length;
        
        console.log(`[iCloud] 上传阶段完成，处理了 ${localChanges.length} 个变更`);
    }

    /**
     * 阶段2：删除远程已删除的项目
     */
    private async performDeleteRemotePhase(
        syncDir: string,
        localSnapshot: SyncSnapshot,
        remoteSnapshot: SyncSnapshot,
        result: SyncResult
    ): Promise<void> {
        console.log('[iCloud] 执行删除远程阶段...');
        
        const localItemsMap = new Map(localSnapshot.items.map(item => [item.id, item]));
        let deletedCount = 0;

        for (const remoteItem of remoteSnapshot.items) {
            const localItem = localItemsMap.get(remoteItem.id);
            
            if (!localItem || localItem.metadata.deleted) {
                deletedCount++;
                result.itemsDeleted++;
            }
        }

        result.phases.deleteRemote.itemsProcessed = deletedCount;
        result.phases.deleteRemote.completed = true;
        result.itemsProcessed += deletedCount;
        
        console.log(`[iCloud] 删除远程阶段完成，删除了 ${deletedCount} 个项目`);
    }

    /**
     * 阶段3：下载并合并远程变更
     */
    private async performDownloadAndMergePhase(
        syncDir: string,
        localSnapshot: SyncSnapshot,
        remoteSnapshot: SyncSnapshot,
        result: SyncResult
    ): Promise<void> {
        console.log('[iCloud] 执行下载和合并阶段...');
        
        const localItemsMap = new Map(localSnapshot.items.map(item => [item.id, item]));
        const remoteChanges: DataItem[] = [];

        for (const remoteItem of remoteSnapshot.items) {
            const localItem = localItemsMap.get(remoteItem.id);
            
            if (!localItem) {
                // 远程新项目
                remoteChanges.push(remoteItem);
                result.itemsCreated++;
            } else if (new Date(remoteItem.metadata.updatedAt) > new Date(localItem.metadata.updatedAt)) {
                // 远程更新
                remoteChanges.push(remoteItem);
                result.itemsUpdated++;
            } else if (remoteItem.metadata.checksum !== localItem.metadata.checksum) {
                // 内容冲突，需要解决
                const conflictResolution = await this.resolveConflict(localItem, remoteItem);
                result.conflictDetails.push(conflictResolution);
                result.conflictsResolved++;
            }
        }

        // 应用远程变更到本地
        if (remoteChanges.length > 0) {
            await this.applyRemoteChanges(remoteChanges);
        }

        result.phases.download.itemsProcessed = remoteChanges.length;
        result.phases.download.completed = true;
        result.itemsProcessed += remoteChanges.length;
        
        console.log(`[iCloud] 下载和合并阶段完成，处理了 ${remoteChanges.length} 个远程变更`);
    }

    /**
     * 应用远程变更到本地
     */
    private async applyRemoteChanges(remoteChanges: DataItem[]): Promise<void> {
        console.log('[iCloud] 应用远程变更到本地...');
        
        const importData: any = {
            categories: [],
            prompts: [],
            aiConfigs: [],
            settings: [],
            users: [],
            posts: [],
            histories: []
        };

        // 将 DataItem 转换回传统格式
        for (const item of remoteChanges) {
            const legacyItem = this.convertFromModernFormat(item);
            
            switch (item.type) {
                case 'category':
                    importData.categories.push(legacyItem);
                    break;
                case 'prompt':
                    importData.prompts.push(legacyItem);
                    break;
                case 'aiConfig':
                    importData.aiConfigs.push(legacyItem);
                    break;
                case 'setting':
                    importData.settings.push(legacyItem);
                    break;
                case 'user':
                    importData.users.push(legacyItem);
                    break;
                case 'post':
                    importData.posts.push(legacyItem);
                    break;
                case 'history':
                    importData.histories.push(legacyItem);
                    break;
            }
        }

        await this.importAllData(importData);
        console.log('[iCloud] 远程变更应用完成');
    }

    /**
     * 将现代格式转换回传统格式
     */
    private convertFromModernFormat(item: DataItem): any {
        const legacyItem = {
            ...item.content,
            uuid: item.id,
            id: item.id,
            createdAt: item.metadata.createdAt,
            updatedAt: item.metadata.updatedAt,
            deleted: item.metadata.deleted || false
        };

        // 根据类型添加特定字段
        switch (item.type) {
            case 'category':
                legacyItem.name = item.title || legacyItem.name;
                break;
            case 'prompt':
                legacyItem.title = item.title || legacyItem.title;
                break;
            case 'aiConfig':
                legacyItem.name = item.title || legacyItem.name;
                break;
        }

        return legacyItem;
    }

    /**
     * 解决冲突
     */
    private async resolveConflict(localItem: DataItem, remoteItem: DataItem): Promise<ConflictResolution> {
        // 简单的冲突解决策略：时间戳较新的获胜
        const localTime = new Date(localItem.metadata.updatedAt).getTime();
        const remoteTime = new Date(remoteItem.metadata.updatedAt).getTime();
        
        const strategy = localTime > remoteTime ? 'local_wins' : 'remote_wins';
        
        return {
            itemId: localItem.id,
            strategy,
            timestamp: new Date().toISOString(),
            reason: `基于时间戳解决冲突，${strategy === 'local_wins' ? '本地' : '远程'}数据更新`
        };
    }

    /**
     * 检查是否需要用户确认合并
     */
    private async checkIfNeedsMergeConfirmation(localSnapshot: SyncSnapshot, remoteSnapshot: SyncSnapshot): Promise<boolean> {
        // 如果没有本地同步历史，且远程有数据，需要确认
        if (!(await this.hasLocalSyncHistory()) && remoteSnapshot.items.length > 0) {
            return true;
        }

        // 如果冲突项目过多，需要确认
        const conflictCount = this.getConflictingItemsCount(localSnapshot, remoteSnapshot);
        return conflictCount > 10; // 超过10个冲突需要用户确认
    }

    /**
     * 获取冲突项目数量
     */
    private getConflictingItemsCount(localSnapshot: SyncSnapshot, remoteSnapshot: SyncSnapshot): number {
        const localItemsMap = new Map(localSnapshot.items.map(item => [item.id, item]));
        let conflictCount = 0;

        for (const remoteItem of remoteSnapshot.items) {
            const localItem = localItemsMap.get(remoteItem.id);
            
            if (localItem && 
                localItem.metadata.checksum !== remoteItem.metadata.checksum &&
                localItem.metadata.updatedAt !== remoteItem.metadata.updatedAt) {
                conflictCount++;
            }
        }

        return conflictCount;
    }

    /**
     * 检查是否有本地同步历史
     */
    private async hasLocalSyncHistory(): Promise<boolean> {
        try {
            const preferences = this.preferencesManager.getPreferences();
            return !!(preferences.dataSync?.lastSyncTime);
        } catch (error) {
            return false;
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
            if (!fs.existsSync(syncDir)) {
                fs.mkdirSync(syncDir, { recursive: true });
                console.log('[iCloud] 创建同步目录:', syncDir);
            }
        } catch (error) {
            console.error('[iCloud] 创建同步目录失败:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`无法创建同步目录: ${errorMessage}`);
        }
    }

    /**
     * 导出本地数据
     */
    private async exportLocalData(): Promise<any> {
        try {
            if (this.dataManagementService) {
                return await this.dataManagementService.exportAllData();
            } else {
                // 如果没有数据管理服务，返回空数据
                console.warn('[iCloud] 数据管理服务不可用，返回空数据');
                return {
                    categories: [],
                    prompts: [],
                    aiConfigs: [],
                    settings: [],
                    users: [],
                    posts: [],
                    histories: []
                };
            }
        } catch (error) {
            console.error('[iCloud] 导出本地数据失败:', error);
            throw error;
        }
    }

    /**
     * 一次性导入所有数据
     */
    private async importAllData(importData: any): Promise<void> {
        try {
            if (this.dataManagementService) {
                // 使用 syncImportDataObject 方法进行同步导入
                const result = await this.dataManagementService.syncImportDataObject(importData);
                if (!result.success) {
                    throw new Error(`数据导入失败: ${result.message}`);
                }
                console.log('[iCloud] 数据导入完成:', result.message);
            } else {
                console.warn('[iCloud] 数据管理服务不可用，无法导入数据');
            }
        } catch (error) {
            console.error('[iCloud] 导入数据失败:', error);
            throw error;
        }
    }

    /**
     * 更新本地同步时间
     */
    private async updateLocalSyncTime(syncTime: string): Promise<void> {
        try {
            this.preferencesManager.updatePreferences({
                dataSync: {
                    lastSyncTime: syncTime
                }
            });
            console.log('[iCloud] 更新本地同步时间:', syncTime);
        } catch (error) {
            console.error('[iCloud] 更新同步时间失败:', error);
        }
    }

    /**
     * 带重试的执行方法
     */
    private async executeWithRetry<T>(
        operation: () => Promise<T>,
        operationName: string,
        customRetryConfig?: Partial<RetryConfig>
    ): Promise<T> {
        const config = { ...this.retryConfig, ...customRetryConfig };
        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
            try {
                console.log(`[iCloud] ${operationName} - 尝试 ${attempt}/${config.maxRetries}`);
                return await operation();
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error(`[iCloud] ${operationName} - 尝试 ${attempt} 失败:`, errorMessage);

                if (attempt === config.maxRetries || this.isNonRetryableError(lastError)) {
                    break;
                }

                const delay = Math.min(
                    config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1),
                    config.maxDelay
                );
                
                console.log(`[iCloud] ${operationName} - 等待 ${delay}ms 后重试...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        throw lastError || new Error('Unknown error occurred');
    }

    /**
     * 判断是否为不可重试的错误
     */
    private isNonRetryableError(error: Error): boolean {
        const nonRetryableMessages = [
            'iCloud Drive 目录不存在',
            '权限不足',
            '配置错误',
            '无效的配置'
        ];

        return nonRetryableMessages.some(msg => error.message.includes(msg));
    }

    /**
     * 启动自动同步
     */
    private startAutoSync(): void {
        this.stopAutoSync();
        
        if (this.config?.syncInterval) {
            const intervalMs = this.config.syncInterval * 60 * 1000;
            this.autoSyncTimer = setInterval(async () => {
                if (this.shouldSkipAutoSync()) {
                    console.log('[iCloud] 跳过自动同步:', this.getSkipReason());
                    return;
                }

                try {
                    console.log('[iCloud] 执行自动同步...');
                    const result = await this.performIntelligentSync();
                    
                    if (result.success) {
                        console.log('[iCloud] 自动同步成功');
                    } else {
                        this.handleAutoSyncFailure(result);
                    }
                } catch (error) {
                    this.handleAutoSyncError(error);
                }
            }, intervalMs);
            
            console.log(`[iCloud] 自动同步已启动，间隔: ${this.config.syncInterval} 分钟`);
        }
    }

    /**
     * 检查是否应该跳过自动同步
     */
    private shouldSkipAutoSync(): boolean {
        return this.syncInProgress || this.consecutiveFailures >= 5;
    }

    /**
     * 获取跳过自动同步的原因
     */
    private getSkipReason(): string {
        if (this.syncInProgress) {
            return '同步正在进行中';
        }
        if (this.consecutiveFailures >= 5) {
            return `连续失败次数过多 (${this.consecutiveFailures})`;
        }
        return '未知原因';
    }

    /**
     * 处理自动同步失败
     */
    private handleAutoSyncFailure(result: SyncResult): void {
        console.error('[iCloud] 自动同步失败:', result.message);
        
        // 如果是配置错误，停止自动同步
        if (this.isConfigurationError(result.message)) {
            console.log('[iCloud] 检测到配置错误，停止自动同步');
            this.stopAutoSync();
        }
    }

    /**
     * 处理自动同步异常
     */
    private handleAutoSyncError(error: any): void {
        console.error('[iCloud] 自动同步异常:', error);
        
        // 如果是严重错误，停止自动同步
        if (this.isConfigurationError(error.message) || this.consecutiveFailures >= 5) {
            console.log('[iCloud] 检测到严重错误，停止自动同步');
            this.stopAutoSync();
        }
    }

    /**
     * 检查是否为配置错误
     */
    private isConfigurationError(errorMessage: string): boolean {
        const configErrors = ['配置错误', '无效的配置', 'iCloud Drive 目录不存在', '权限不足'];
        return configErrors.some(error => errorMessage.includes(error));
    }

    /**
     * 停止自动同步
     */
    private stopAutoSync(): void {
        if (this.autoSyncTimer) {
            clearInterval(this.autoSyncTimer);
            this.autoSyncTimer = null;
            console.log('[iCloud] 自动同步已停止');
        }
    }

    /**
     * 设置 IPC 处理程序
     */
    setupIpcHandlers(): void {
        console.log('[iCloud] 正在设置 IPC 处理程序...');
        
        try {
            // 测试 iCloud 可用性
            ipcMain.handle('icloud:test-availability', async () => {
                return await this.testICloudAvailability();
            });

            // 立即同步
            ipcMain.handle('icloud:sync-now', async () => {
                return await this.performIntelligentSync();
            });

            // 获取同步状态
            ipcMain.handle('icloud:get-sync-status', async () => {
                return {
                    isEnabled: this.config?.enabled || false,
                    lastSyncTime: this.lastSuccessfulSync,
                    nextSyncTime: this.autoSyncTimer ? new Date(Date.now() + this.config!.syncInterval * 60 * 1000).toISOString() : null,
                    isSyncing: this.syncInProgress
                };
            });

            // 获取配置
            ipcMain.handle('icloud:get-config', async (): Promise<ICloudConfig> => {
                return this.config || {
                    enabled: false,
                    autoSync: false,
                    syncInterval: 30
                };
            });

            // 设置配置
            ipcMain.handle('icloud:set-config', async (event, config: ICloudConfig) => {
                const currentConfig = this.config || {
                    enabled: false,
                    autoSync: false,
                    syncInterval: 30
                };
                
                // 检查配置是否发生变更
                const currentHash = this.computeConfigHash(currentConfig);
                const newHash = this.computeConfigHash(config);
                
                // 如果配置发生变更，重置连接验证状态
                if (currentHash !== newHash) {
                    console.log('[iCloud] 配置已变更，重置连接验证状态');
                    Object.assign(config, {
                        connectionTested: false,
                        connectionValid: false,
                        connectionMessage: '',
                        connectionTestedAt: '',
                        configHash: newHash
                    });
                } else {
                    // 保持现有的连接验证状态
                    Object.assign(config, {
                        connectionTested: currentConfig.connectionTested,
                        connectionValid: currentConfig.connectionValid,
                        connectionMessage: currentConfig.connectionMessage,
                        connectionTestedAt: currentConfig.connectionTestedAt,
                        configHash: newHash
                    });
                }
                
                this.preferencesManager.updatePreferences({ icloud: config });
                this.config = config;
                
                if (config.enabled && config.autoSync) {
                    this.startAutoSync();
                } else {
                    this.stopAutoSync();
                }
                
                console.log('[iCloud] 配置已更新:', config);
            });

            // 手动上传
            ipcMain.handle('icloud:manual-upload', async (): Promise<ManualSyncResult> => {
                try {
                    const result = await this.performIntelligentSync();
                    return {
                        success: result.success,
                        message: result.message,
                        timestamp: result.timestamp,
                        hasConflicts: result.conflictsResolved > 0,
                        conflictDetails: result.conflictDetails
                    };
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    return {
                        success: false,
                        message: `上传失败: ${errorMessage}`,
                        timestamp: new Date().toISOString(),
                        hasConflicts: false
                    };
                }
            });

            // 手动下载
            ipcMain.handle('icloud:manual-download', async (): Promise<ManualSyncResult> => {
                try {
                    // 获取远程数据预览
                    const syncDir = this.getSyncDirectory();
                    const remoteSnapshot = await this.getRemoteSnapshot(syncDir);
                    
                    if (!remoteSnapshot) {
                        return {
                            success: false,
                            message: '远程没有找到同步数据',
                            timestamp: new Date().toISOString(),
                            hasConflicts: false
                        };
                    }

                    const localSnapshot = await this.getLocalSnapshot();
                    const conflictCount = this.getConflictingItemsCount(localSnapshot, remoteSnapshot);

                    return {
                        success: true,
                        message: '远程数据预览获取成功',
                        timestamp: new Date().toISOString(),
                        hasConflicts: conflictCount > 0,
                        localData: localSnapshot,
                        remoteData: remoteSnapshot
                    };
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    return {
                        success: false,
                        message: `下载失败: ${errorMessage}`,
                        timestamp: new Date().toISOString(),
                        hasConflicts: false
                    };
                }
            });

            // 应用下载的数据
            ipcMain.handle('icloud:apply-downloaded-data', async (event, resolution: any): Promise<SyncResult> => {
                // 这里可以根据解决方案应用数据
                return await this.performIntelligentSync();
            });

            // 比较数据
            ipcMain.handle('icloud:compare-data', async () => {
                try {
                    const syncDir = this.getSyncDirectory();
                    const remoteSnapshot = await this.getRemoteSnapshot(syncDir);
                    const localSnapshot = await this.getLocalSnapshot();

                    if (!remoteSnapshot) {
                        return {
                            success: false,
                            message: '远程没有数据可比较'
                        };
                    }

                    const differences = await this.generateDetailedDifferences(localSnapshot, remoteSnapshot);
                    
                    return {
                        success: true,
                        differences
                    };
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    return {
                        success: false,
                        message: `比较失败: ${errorMessage}`
                    };
                }
            });

            // 打开同步目录
            ipcMain.handle('icloud:open-sync-directory', async () => {
                try {
                    const syncDir = this.getSyncDirectory();
                    await this.ensureSyncDirectory(syncDir);
                    shell.openPath(syncDir);
                    
                    return {
                        success: true,
                        message: '同步目录已打开',
                        path: syncDir
                    };
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    return {
                        success: false,
                        message: `打开目录失败: ${errorMessage}`
                    };
                }
            });

            console.log('[iCloud] IPC 处理程序设置完成');
        } catch (error) {
            console.error('[iCloud] 设置 IPC 处理程序失败:', error);
        }
    }

    /**
     * 生成详细的数据差异分析
     */
    private async generateDetailedDifferences(localSnapshot: SyncSnapshot, remoteSnapshot: SyncSnapshot): Promise<{
        added: any[];
        modified: any[];
        deleted: any[];
        summary: {
            localTotal: number;
            remoteTotal: number;
            conflicts: number;
        };
    }> {
        const localItemsMap = new Map(localSnapshot.items.map(item => [item.id, item]));
        const remoteItemsMap = new Map(remoteSnapshot.items.map(item => [item.id, item]));
        
        const added: any[] = [];
        const modified: any[] = [];
        const deleted: any[] = [];
        let conflicts = 0;

        // 检查远程新增或修改的项目
        for (const remoteItem of remoteSnapshot.items) {
            const localItem = localItemsMap.get(remoteItem.id);
            
            if (!localItem) {
                added.push(this.convertFromModernFormat(remoteItem));
            } else if (remoteItem.metadata.checksum !== localItem.metadata.checksum) {
                modified.push({
                    local: this.convertFromModernFormat(localItem),
                    remote: this.convertFromModernFormat(remoteItem)
                });
                conflicts++;
            }
        }

        // 检查本地删除的项目
        for (const localItem of localSnapshot.items) {
            if (!remoteItemsMap.has(localItem.id)) {
                deleted.push(this.convertFromModernFormat(localItem));
            }
        }

        return {
            added,
            modified,
            deleted,
            summary: {
                localTotal: localSnapshot.items.length,
                remoteTotal: remoteSnapshot.items.length,
                conflicts
            }
        };
    }

    /**
     * 清理资源
     */
    cleanup(): void {
        console.log('[iCloud] 清理服务...');
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
        
        console.log('[iCloud] 服务清理完成');
    }
}
