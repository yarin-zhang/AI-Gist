/**
 * 现代化 WebDAV 同步服务
 * 基于 UUID 的可靠数据同步方案
 */

import { ipcMain, app } from 'electron';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { 
  WebDAVConfig, 
  WebDAVTestResult, 
  WebDAVSyncResult, 
  WebDAVSyncStatus,
  WebDAVFileInfo,
  WebDAVConflictDetail 
} from '@shared/types/webdav';

// WebDAV 客户端缓存
let webdavCreateClient: any = null;

/**
 * 获取 WebDAV 客户端创建函数
 */
async function getWebDAVCreateClient() {
    if (!webdavCreateClient) {
        try {
            // 使用 Function 构造函数创建动态导入，避免 编译时转换问题
            const dynamicImport = new Function('specifier', 'return import(specifier)');
            const webdavModule = await dynamicImport('webdav');
            
            // 处理不同的模块导出格式
            if (webdavModule.createClient) {
                webdavCreateClient = webdavModule.createClient;
            } else if (webdavModule.default && webdavModule.default.createClient) {
                webdavCreateClient = webdavModule.default.createClient;
            } else {
                // 尝试直接使用 default 导出
                webdavCreateClient = webdavModule.default || webdavModule;
            }
            
            if (typeof webdavCreateClient !== 'function') {
                throw new Error('WebDAV createClient 函数未找到');
            }
            
            console.log('WebDAV 模块加载成功');
        } catch (error) {
            console.error('WebDAV 模块加载失败:', error);
            
            // 尝试备用加载方法
            try {
                console.log('尝试备用加载方法...');
                // 使用 eval 来避免编译时的模块解析
                const webdavModule = await eval('import("webdav")');
                webdavCreateClient = webdavModule.createClient || webdavModule.default?.createClient || webdavModule.default;
                
                if (typeof webdavCreateClient !== 'function') {
                    throw new Error('WebDAV createClient 函数未找到');
                }
                
                console.log('WebDAV 模块备用加载成功');
            } catch (fallbackError) {
                console.error('WebDAV 模块备用加载也失败:', fallbackError);
                throw new Error(`WebDAV 模块加载失败: ${error instanceof Error ? error.message : '未知错误'}`);
            }
        }
    }
    return webdavCreateClient;
}

// 现代化数据结构接口
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

// 同步锁接口
interface SyncLock {
    id: string;
    deviceId: string;
    timestamp: string;
    type: 'sync' | 'exclusive';
    ttl: number; // 锁的生存时间（毫秒）
}

// 错误重试配置
interface RetryConfig {
    maxRetries: number;
    baseDelay: number; // 基础延迟（毫秒）
    maxDelay: number;  // 最大延迟（毫秒）
    backoffMultiplier: number;
}

/**
 * 现代化 WebDAV 同步服务
 * 基于 UUID 的可靠数据同步
 */
export class WebDAVService {
    private client: any = null;
    private config: WebDAVConfig | null = null;
    private deviceId: string;
    private isInitialized = false;
    private syncInProgress = false;
    private autoSyncTimer: NodeJS.Timeout | null = null;
    private preferencesManager: any;
    private dataManagementService: any;
    
    // 新增：同步锁和重试机制
    private currentSyncLock: SyncLock | null = null;
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
        console.log(`WebDAVService initialized with device ID: ${this.deviceId}`);
    }

    /**
     * 初始化服务
     */
    async initialize(): Promise<void> {
        console.log('[WebDAV] 开始初始化服务...');
        try {
            console.log('[WebDAV] 正在加载配置...');
            this.config = await this.loadConfig();
            console.log('[WebDAV] 配置加载结果:', {
                hasConfig: !!this.config,
                enabled: this.config?.enabled,
                serverUrl: this.config?.serverUrl,
                username: this.config?.username,
                hasPassword: !!this.config?.password,
                autoSync: this.config?.autoSync,
                syncInterval: this.config?.syncInterval
            });
            
            console.log('[WebDAV] 正在设置IPC处理程序...');
            this.setupIpcHandlers();
            console.log('[WebDAV] IPC处理程序设置完成');
            
            if (this.config?.enabled && this.config.autoSync) {
                console.log('[WebDAV] 启动自动同步...');
                this.startAutoSync();
            } else {
                console.log('[WebDAV] 自动同步未启用:', {
                    enabled: this.config?.enabled,
                    autoSync: this.config?.autoSync
                });
            }

            this.isInitialized = true;
            console.log('[WebDAV] 服务初始化完成 ✓');
        } catch (error) {
            console.error('[WebDAV] 服务初始化失败:', error);
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
            hostname = os.hostname();
        } catch (error) {
            console.warn('获取hostname失败，使用默认值:', error);
            hostname = 'unknown-host';
        }
        const timestamp = Date.now();
        
        // 尝试从本地存储获取现有设备ID
        const userDataPath = app.getPath('userData');
        const deviceIdFile = path.join(userDataPath, 'device-id.json');
        
        try {
            if (fs.existsSync(deviceIdFile)) {
                const data = JSON.parse(fs.readFileSync(deviceIdFile, 'utf8'));
                if (data.deviceId) {
                    console.log('使用现有设备ID:', data.deviceId);
                    return data.deviceId;
                }
            }
        } catch (error) {
            console.warn('读取设备ID文件失败:', error);
        }
        
        // 生成新的设备ID
        const newDeviceId = `${platform}-${hostname}-${uuidv4()}`;
        
        try {
            fs.writeFileSync(deviceIdFile, JSON.stringify({
                deviceId: newDeviceId,
                createdAt: new Date().toISOString(),
                platform,
                hostname
            }));
            console.log('生成新设备ID:', newDeviceId);
        } catch (error) {
            console.warn('保存设备ID失败:', error);
        }
        
        return newDeviceId;
    }

    /**
     * 加载配置
     */
    private async loadConfig(): Promise<WebDAVConfig | null> {
        console.log('[WebDAV] loadConfig() - 开始加载配置');
        try {
            console.log('[WebDAV] loadConfig() - 获取用户偏好设置...');
            const prefs = this.preferencesManager.getPreferences();
            console.log('[WebDAV] loadConfig() - 用户偏好设置获取成功，检查webdav配置...');
            
            const webdavConfig = prefs.webdav || null;
            console.log('[WebDAV] loadConfig() - WebDAV配置:', {
                exists: !!webdavConfig,
                enabled: webdavConfig?.enabled,
                serverUrl: webdavConfig?.serverUrl,
                username: webdavConfig?.username,
                hasPassword: !!webdavConfig?.password,
                autoSync: webdavConfig?.autoSync,
                syncInterval: webdavConfig?.syncInterval,
                rawConfig: webdavConfig
            });
            
            return webdavConfig;
        } catch (error) {
            console.error('[WebDAV] loadConfig() - 加载WebDAV配置失败:', error);
            return null;
        }
    }

    /**
     * 创建WebDAV客户端
     */
    private async createClient(config?: WebDAVConfig): Promise<any> {
        console.log('[WebDAV] createClient() - 开始创建WebDAV客户端');
        const clientConfig = config || this.config;
        
        console.log('[WebDAV] createClient() - 使用的配置:', {
            hasConfig: !!clientConfig,
            serverUrl: clientConfig?.serverUrl,
            username: clientConfig?.username,
            hasPassword: !!clientConfig?.password,
            source: config ? 'parameter' : 'instance'
        });
        
        if (!clientConfig) {
            console.error('[WebDAV] createClient() - 配置为空，抛出错误');
            throw new Error('WebDAV 配置未加载');
        }

        try {
            console.log('[WebDAV] createClient() - 获取WebDAV客户端创建函数...');
            const createWebDAVClient = await getWebDAVCreateClient();
            console.log('[WebDAV] createClient() - WebDAV模块加载成功，创建客户端...');
            
            const client = createWebDAVClient(clientConfig.serverUrl, {
                username: clientConfig.username,
                password: clientConfig.password
            });
            
            console.log('[WebDAV] createClient() - WebDAV客户端创建成功 ✓');
            return client;
        } catch (error) {
            console.error('[WebDAV] createClient() - 创建WebDAV客户端失败:', error);
            throw new Error(`WebDAV 客户端创建失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }    /**
     * 获取本地数据快照
     */
    private async getLocalSnapshot(): Promise<SyncSnapshot> {
        console.log('[WebDAV] 开始获取本地数据快照...');
        
        try {
            // 从数据库获取所有数据
            console.log('[WebDAV] 正在导出本地数据...');
            const localData = await this.exportLocalData();
            console.log('[WebDAV] 本地数据导出完成:', {
                hasData: !!localData,
                dataType: typeof localData,
                categories: localData?.categories?.length || 0,
                prompts: localData?.prompts?.length || 0,
                aiConfigs: localData?.aiConfigs?.length || 0,
                settings: localData?.settings?.length || 0,
                exportTime: localData?.exportTime
            });
            
            // 转换为现代化数据结构
            console.log('[WebDAV] 正在转换为现代化数据结构...');
            const allItems = await this.convertToModernFormat(localData);
            console.log('[WebDAV] 数据结构转换完成，共生成', allItems.length, '个数据项');
            
            const metadata: SnapshotMetadata = {
                totalItems: allItems.length,
                checksum: this.calculateChecksum(allItems),
                syncId: uuidv4(),
                conflictsResolved: [],
                deviceInfo: {
                    id: this.deviceId,
                    name: os.hostname(),
                    platform: process.platform,
                    appVersion: app.getVersion() || '1.0.0'
                }
            };
            
            console.log('[WebDAV] 快照元数据创建完成:', {
                totalItems: metadata.totalItems,
                checksumLength: metadata.checksum.length,
                syncId: metadata.syncId,
                deviceId: metadata.deviceInfo.id,
                platform: metadata.deviceInfo.platform,
                appVersion: metadata.deviceInfo.appVersion
            });            
            
            const snapshot: SyncSnapshot = {
                timestamp: new Date().toISOString(),
                version: '2.0.0', // 采用新的快照版本
                deviceId: this.deviceId,
                items: allItems,
                metadata
            };
            
            console.log('[WebDAV] 本地快照创建成功:', {
                timestamp: snapshot.timestamp,
                version: snapshot.version,
                deviceId: snapshot.deviceId,
                itemsCount: snapshot.items.length,
                metadataTotalItems: snapshot.metadata.totalItems
            });

            return snapshot;
        } catch (error) {
            console.error('[WebDAV] 获取本地快照失败:', error);
            throw error;
        }
    }

    /**
     * 将传统数据格式转换为现代格式
     */
    private async convertToModernFormat(legacyData: any): Promise<DataItem[]> {
        console.log('[WebDAV] 开始转换传统数据格式为现代格式...');
        console.log('[WebDAV] 输入数据详情:', {
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
            console.log('[WebDAV] 转换分类数据，共', legacyData.categories.length, '个分类');
            for (const category of legacyData.categories) {
                console.log('[WebDAV] 转换分类:', {
                    id: category.id,
                    name: category.name || category.title,
                    hasId: !!category.id,
                    hasName: !!(category.name || category.title)
                });
                
                const item: DataItem = {
                    id: category.id || uuidv4(),
                    type: 'category',
                    title: category.name || category.title,
                    content: category,
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
            console.log('[WebDAV] 分类转换完成，生成', items.length, '个分类项');
        } else {
            console.log('[WebDAV] 无分类数据或分类数据格式错误');
        }

        // 转换提示词
        if (legacyData.prompts && Array.isArray(legacyData.prompts)) {
            console.log('[WebDAV] 转换提示词数据，共', legacyData.prompts.length, '个提示词');
            for (const prompt of legacyData.prompts) {
                console.log('[WebDAV] 转换提示词:', {
                    id: prompt.id,
                    title: prompt.title,
                    hasId: !!prompt.id,
                    hasTitle: !!prompt.title
                });
                
                const item: DataItem = {
                    id: prompt.id || uuidv4(),
                    type: 'prompt',
                    title: prompt.title,
                    content: prompt,
                    metadata: {
                        createdAt: prompt.createdAt || now,
                        updatedAt: prompt.updatedAt || now,
                        version: 1,
                        deviceId: this.deviceId,
                        lastModifiedBy: this.deviceId,
                        checksum: this.calculateItemChecksum(prompt),
                        deleted: prompt.deleted || false,
                        tags: prompt.tags || []
                    }
                };
                items.push(item);
            }
            console.log('[WebDAV] 提示词转换完成，总计', items.length, '个项目');
        } else {
            console.log('[WebDAV] 无提示词数据或提示词数据格式错误');
        }

        // 转换AI配置
        if (legacyData.aiConfigs && Array.isArray(legacyData.aiConfigs)) {
            console.log('[WebDAV] 转换AI配置数据，共', legacyData.aiConfigs.length, '个配置');
            for (const config of legacyData.aiConfigs) {
                console.log('[WebDAV] 转换AI配置:', {
                    id: config.id,
                    name: config.name || config.title,
                    hasId: !!config.id,
                    hasName: !!(config.name || config.title)
                });
                
                const item: DataItem = {
                    id: config.id || uuidv4(),
                    type: 'aiConfig',
                    title: config.name || config.title,
                    content: config,
                    metadata: {
                        createdAt: config.createdAt || now,
                        updatedAt: config.updatedAt || now,
                        version: 1,
                        deviceId: this.deviceId,
                        lastModifiedBy: this.deviceId,
                        checksum: this.calculateItemChecksum(config),
                        deleted: config.deleted || false
                    }
                };
                items.push(item);
            }
            console.log('[WebDAV] AI配置转换完成，总计', items.length, '个项目');
        } else {
            console.log('[WebDAV] 无AI配置数据或AI配置数据格式错误');
        }

        // 转换其他数据类型...
        this.convertOtherDataTypes(legacyData, items, now);

        console.log('[WebDAV] 数据格式转换完成，最终生成', items.length, '个数据项');
        return items;
    }

    /**
     * 转换其他数据类型
     */
    private convertOtherDataTypes(legacyData: any, items: DataItem[], now: string): void {
        // 可以根据需要添加更多数据类型的转换
        const dataTypes = ['settings', 'users', 'posts', 'histories'];
        
        for (const dataType of dataTypes) {
            if (legacyData[dataType]) {
                for (const item of legacyData[dataType]) {
                    const dataItem: DataItem = {
                        id: item.id || uuidv4(),
                        type: dataType.slice(0, -1) as any, // 去掉复数形式
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
        const sorted = items.sort((a, b) => {
            const idA = String(a.id);
            const idB = String(b.id);
            return idA < idB ? -1 : idA > idB ? 1 : 0;
        });
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
        if (data === null || data === undefined) return null;
        
        if (Array.isArray(data)) {
            return data.map(item => this.normalizeForChecksum(item)).sort();
        }
        
        if (typeof data === 'object') {
            const normalized: any = {};
            const keys = Object.keys(data).sort();
            for (const key of keys) {
                // 跳过元数据字段
                if (['createdAt', 'updatedAt', 'syncStatus', 'version', 'checksum'].includes(key)) {
                    continue;
                }
                normalized[key] = this.normalizeForChecksum(data[key]);
            }
            return normalized;
        }
        
        return data;
    }

    /**
     * [重构] 核心同步逻辑
     * 采用更清晰、更可靠的算法替代旧的三阶段同步
     */
    async performIntelligentSync(config?: WebDAVConfig): Promise<SyncResult> {
        console.log('[WebDAV] [Refactored] 开始执行智能同步');
        
        if (this.syncInProgress) {
            console.warn('[WebDAV] [Refactored] 同步正在进行中，退出');
            throw new Error('同步正在进行中');
        }

        this.syncInProgress = true;
        
        const result: SyncResult = {
            success: false,
            message: '',
            timestamp: new Date().toISOString(),
            itemsProcessed: 0,
            itemsUpdated: 0,
            itemsCreated: 0,
            itemsDeleted: 0,
            conflictsResolved: 0,
            conflictDetails: [],
            errors: [],
            phases: { // 保持该结构以兼容前端
                upload: { completed: false, itemsProcessed: 0, errors: [] },
                deleteRemote: { completed: false, itemsProcessed: 0, errors: [] },  
                download: { completed: false, itemsProcessed: 0, errors: [] }
            }
        };

        let client: any = null;

        try {
            const syncConfig = config || await this.loadConfig();
            if (!syncConfig?.enabled) throw new Error('WebDAV 同步未启用');

            client = await this.createClient(syncConfig);
            await this.acquireSyncLock(client);

            console.log('[WebDAV] [Refactored] 获取本地和远程状态');
            const localSnapshot = await this.getLocalSnapshot();
            let remoteSnapshot = await this.getRemoteSnapshot(client);

            // 场景1：远程无数据，执行初始上传
            if (!remoteSnapshot) {
                console.log('[WebDAV] [Refactored] 远程无数据，执行初始上传');
                const uploadResult = await this.performInitialUpload(client, localSnapshot);
                // 兼容旧的返回格式
                result.success = uploadResult.success;
                result.message = uploadResult.message;
                result.itemsCreated = uploadResult.itemsCreated;
                result.itemsProcessed = uploadResult.itemsProcessed;
                result.phases.upload.completed = true;
                result.phases.upload.itemsProcessed = uploadResult.itemsProcessed;
                
                this.lastSuccessfulSync = result.timestamp;
                this.consecutiveFailures = 0;
                
                return result;
            }

            // 场景2：远程有数据，执行合并同步
            console.log('[WebDAV] [Refactored] 检测到远程数据，开始合并同步');
            
            const localItems = new Map(localSnapshot.items.map(i => [i.id, i]));
            const remoteItems = new Map(remoteSnapshot.items.map(i => [i.id, i]));

            const deletedItemsLog = await this.getDeletedItems();
            const deletedUUIDs = new Set(deletedItemsLog.map(item => item.uuid));
            console.log(`[WebDAV] [Refactored] 加载到 ${deletedUUIDs.size} 条删除记录`);

            // 创建最终的合并结果
            const finalItems: DataItem[] = [];
            const itemsToApplyLocally: DataItem[] = [];
            const workingRemoteItems = new Map<string, DataItem>(remoteItems);
            let hasRemoteChanges = false;
            let hasLocalChanges = false;
            const allItemIds = new Set([...localItems.keys(), ...remoteItems.keys()]);
            result.itemsProcessed = allItemIds.size;
            
            // 核心合并循环
            for (const id of allItemIds) {
                const localItem = localItems.get(id);
                const remoteItem = remoteItems.get(id);

                // 情况1：在删除日志中，跳过此项目
                if (deletedUUIDs.has(id)) {
                    console.log(`[WebDAV] [Refactored] 跳过已删除的项目: ${id}`);
                    result.itemsDeleted++;
                    continue;
                }

                // 情况2：仅本地存在 -> 保留到最终结果
                if (localItem && !remoteItem) {
                    console.log(`[WebDAV] [Refactored] 保留本地项目: ${id}`);
                    finalItems.push(localItem);
                    result.itemsCreated++;
                    continue;
                }

                // 情况3：仅远程存在 -> 下载到本地
                if (!localItem && remoteItem) {
                    console.log(`[WebDAV] [Refactored] 下载远程项目: ${id}`);
                    finalItems.push(remoteItem);
                    itemsToApplyLocally.push(remoteItem);
                    continue;
                }

                // 情况4：两端都存在 -> 比较和解决冲突
                if (localItem && remoteItem) {
                    if (localItem.metadata.checksum === remoteItem.metadata.checksum) {
                        continue; // 内容相同，无需操作
                    }

                    const localTime = new Date(localItem.metadata.updatedAt);
                    const remoteTime = new Date(remoteItem.metadata.updatedAt);

                    if (localTime > remoteTime) {
                        // 本地更新 -> 上传
                        workingRemoteItems.set(id, localItem);
                        hasRemoteChanges = true;
                        result.itemsUpdated++;
                    } else if (remoteTime > localTime) {
                        // 远程更新 -> 下载
                        itemsToApplyLocally.push(remoteItem);
                        hasLocalChanges = true;
                    } else {
                        // 时间戳相同但内容不同，定义一个解决策略（例如，远程优先）
                        workingRemoteItems.set(id, remoteItem);
                        hasRemoteChanges = true;
                        itemsToApplyLocally.push(remoteItem);
                        hasLocalChanges = true;
                        result.conflictsResolved++;
                        result.itemsUpdated++;
                        result.conflictDetails.push({
                            itemId: id,
                            strategy: 'remote_wins',
                            timestamp: new Date().toISOString(),
                            reason: '时间戳相同但内容不同，远程版本优先'
                        });
                    }
                }
            }

            // 提交变更
            if (hasRemoteChanges) {
                console.log(`[WebDAV] [Refactored] 远程状态已改变，上传新的快照...`);
                const newRemoteItems = Array.from(workingRemoteItems.values());
                remoteSnapshot.items = newRemoteItems;
                remoteSnapshot.metadata.totalItems = newRemoteItems.length;
                remoteSnapshot.metadata.checksum = this.calculateChecksum(newRemoteItems);
                remoteSnapshot.metadata.syncId = uuidv4();
                remoteSnapshot.timestamp = new Date().toISOString();
                
                await client.putFileContents('/ai-gist-sync/snapshot.json', JSON.stringify(remoteSnapshot, null, 2));
                console.log('[WebDAV] [Refactored] 新的远程快照上传成功');
            }

            if (hasLocalChanges) {
                console.log(`[WebDAV] [Refactored] 本地需要应用 ${itemsToApplyLocally.length} 项变更...`);
                await this.applyLocalChanges(itemsToApplyLocally);
                result.itemsUpdated += itemsToApplyLocally.length;
            }

            // 清理已成功同步的删除记录
            if (result.itemsDeleted > 0) {
                const successfullyDeletedUUIDs = Array.from(deletedUUIDs).filter(uuid => !workingRemoteItems.has(uuid));
                if(successfullyDeletedUUIDs.length > 0){
                    console.log(`[WebDAV] [Refactored] 清理 ${successfullyDeletedUUIDs.length} 条已同步的删除记录`);
                    await this.cleanupDeletedItems(successfullyDeletedUUIDs);
                }
            }
            
            result.success = true;
            result.message = '智能同步完成';
            this.lastSuccessfulSync = result.timestamp;
            this.consecutiveFailures = 0;
            
            console.log('[WebDAV] [Refactored] 同步完成:', {
                created: result.itemsCreated,
                updated: result.itemsUpdated,
                deleted: result.itemsDeleted,
                conflicts: result.conflictsResolved,
                finalItemsCount: result.itemsCreated + result.itemsUpdated + result.conflictsResolved
            });
            return result;

        } catch (error) {
            this.consecutiveFailures++;
            const errorMessage = error instanceof Error ? error.message : '未知错误';
            console.error('[WebDAV] [Refactored] 同步失败:', error);
            result.success = false;
            result.message = errorMessage;
            result.errors.push(errorMessage);
            return result;
        } finally {
            if (client) {
                await this.releaseSyncLock(client);
            }
            this.syncInProgress = false;
            console.log('[WebDAV] [Refactored] 清理同步状态');
        }
    }

    /**
     * 执行用户确认后的智能合并同步 - [废弃]
     * 新的 performIntelligentSync 已包含此逻辑
     */
    private async syncWithMergeConfirmed(config?: WebDAVConfig): Promise<SyncResult> {
        console.warn('[WebDAV] syncWithMergeConfirmed is deprecated. Calling performIntelligentSync instead.');
        return this.performIntelligentSync(config);
    }
    
    /**
     * 获取远程快照
     */
    private async getRemoteSnapshot(client: any): Promise<SyncSnapshot | null> {
        try {
            const remotePath = '/ai-gist-sync/snapshot.json';
            
            if (!(await this.remoteFileExists(client, remotePath))) {
                return null;
            }

            const content = await client.getFileContents(remotePath, { format: 'text' });
            return JSON.parse(content);
        } catch (error) {
            console.error('获取远程快照失败:', error);
            return null;
        }
    }

    /**
     * 检查远程文件是否存在
     */
    private async remoteFileExists(client: any, filePath: string): Promise<boolean> {
        try {
            await client.stat(filePath);
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * 执行初始上传
     */
    private async performInitialUpload(client: any, localSnapshot: SyncSnapshot): Promise<SyncResult> {
        console.log('执行初始上传...');
        
        try {
            // 确保远程目录存在
            await this.ensureRemoteDirectory(client, '/ai-gist-sync');
            
            // 上传快照
            await client.putFileContents('/ai-gist-sync/snapshot.json', JSON.stringify(localSnapshot, null, 2));
            
            // 更新本地同步时间
            await this.updateLocalSyncTime(localSnapshot.timestamp);

            return {
                success: true,
                message: '初始同步完成',
                timestamp: localSnapshot.timestamp,
                itemsProcessed: localSnapshot.items.length,
                itemsUpdated: 0,
                itemsCreated: localSnapshot.items.length,
                itemsDeleted: 0,
                conflictsResolved: 0,
                conflictDetails: [],
                errors: [],
                phases: {
                    upload: { completed: true, itemsProcessed: localSnapshot.items.length, errors: [] },
                    deleteRemote: { completed: true, itemsProcessed: 0, errors: [] },
                    download: { completed: true, itemsProcessed: 0, errors: [] }
                }
            };
        } catch (error) {
            console.error('初始上传失败:', error);
            throw error;
        }
    }

    /**
     * [废弃] 判断是否需要合并项目
     */
    private async shouldMergeItem(localItem: DataItem, remoteItem: DataItem): Promise<{
        needsMerge: boolean;
        strategy: 'local_wins' | 'remote_wins' | 'merge';
        reason: string;
    }> {
        const localTime = new Date(localItem.metadata.updatedAt);
        const remoteTime = new Date(remoteItem.metadata.updatedAt);
        
        // 如果内容相同（通过checksum比较），不需要合并
        if (localItem.metadata.checksum === remoteItem.metadata.checksum) {
            return {
                needsMerge: false,
                strategy: 'local_wins',
                reason: '内容相同，无需合并'
            };
        }
        
        // 按照updatedAt时间戳决定合并策略
        if (remoteTime > localTime) {
            return {
                needsMerge: true,
                strategy: 'remote_wins',
                reason: '远程版本更新，采用远程版本'
            };
        } else if (localTime > remoteTime) {
            return {
                needsMerge: true,
                strategy: 'local_wins',
                reason: '本地版本更新，保持本地版本'
            };
        } else {
            // 时间相同但内容不同，尝试智能合并
            return {
                needsMerge: true,
                strategy: 'merge',
                reason: '时间相同但内容不同，尝试智能合并'
            };
        }
    }

    /**
     * [废弃] 智能合并两个数据项
     */
    private async mergeItemsCompact(localItem: DataItem, remoteItem: DataItem): Promise<DataItem> {
        console.warn('mergeItemsCompact is deprecated');
        return localItem; // 返回本地项作为默认行为
    }

    /**
     * [重构] 开始智能合并同步
     */
    private async performIntelligentMerge(client: any, localSnapshot: SyncSnapshot, remoteSnapshot: SyncSnapshot): Promise<SyncResult> {
        console.log('[WebDAV] [Refactored] 开始智能合并同步...');
        
        const result: SyncResult = {
            success: false,
            message: '',
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
            // 获取删除记录
            const deletedItems = await this.getDeletedItems();
            const deletedUUIDs = new Set(deletedItems.map(item => item.uuid));
            console.log(`[WebDAV] [Refactored] 发现 ${deletedUUIDs.size} 条删除记录`);

            // 创建本地和远程项目的映射
            const localItemsMap = new Map<string, DataItem>();
            const remoteItemsMap = new Map<string, DataItem>();
            
            localSnapshot.items.forEach(item => localItemsMap.set(item.id, item));
            remoteSnapshot.items.forEach(item => remoteItemsMap.set(item.id, item));

            // 初始化工作变量
            const workingRemoteItems = new Map<string, DataItem>(remoteItemsMap);
            const itemsToApplyLocally: DataItem[] = [];
            let hasRemoteChanges = false;
            let hasLocalChanges = false;

            // 处理删除的项目
            for (const uuid of deletedUUIDs) {
                if (workingRemoteItems.has(uuid)) {
                    workingRemoteItems.delete(uuid);
                    hasRemoteChanges = true;
                    result.itemsDeleted++;
                    console.log(`[WebDAV] [Refactored] 标记删除远程项目: ${uuid}`);
                }
            }

            // 处理本地新增的项目
            for (const [id, localItem] of localItemsMap) {
                if (!remoteItemsMap.has(id) && !deletedUUIDs.has(id)) {
                    workingRemoteItems.set(id, localItem);
                    hasRemoteChanges = true;
                    result.itemsCreated++;
                    console.log(`[WebDAV] [Refactored] 新增项目: ${id}`);
                }
            }

            // 处理远程新增的项目
            for (const [id, remoteItem] of remoteItemsMap) {
                if (!localItemsMap.has(id) && !deletedUUIDs.has(id)) {
                    itemsToApplyLocally.push(remoteItem);
                    hasLocalChanges = true;
                    result.itemsCreated++;
                    console.log(`[WebDAV] [Refactored] 下载远程新增项目: ${id}`);
                }
            }

            // 处理冲突的项目
            for (const [id, localItem] of localItemsMap) {
                const remoteItem = remoteItemsMap.get(id);
                if (remoteItem && !deletedUUIDs.has(id)) {
                    // 检查内容是否相同
                    if (localItem.metadata.checksum === remoteItem.metadata.checksum) {
                        continue; // 内容相同，无需操作
                    }

                    const localTime = new Date(localItem.metadata.updatedAt);
                    const remoteTime = new Date(remoteItem.metadata.updatedAt);

                    if (localTime > remoteTime) {
                        // 本地更新 -> 上传
                        workingRemoteItems.set(id, localItem);
                        hasRemoteChanges = true;
                        result.itemsUpdated++;
                    } else if (remoteTime > localTime) {
                        // 远程更新 -> 下载
                        itemsToApplyLocally.push(remoteItem);
                        hasLocalChanges = true;
                    } else {
                        // 时间戳相同但内容不同，定义一个解决策略（例如，远程优先）
                        workingRemoteItems.set(id, remoteItem);
                        hasRemoteChanges = true;
                        itemsToApplyLocally.push(remoteItem);
                        hasLocalChanges = true;
                        result.conflictsResolved++;
                        result.itemsUpdated++;
                        result.conflictDetails.push({
                            itemId: id,
                            strategy: 'remote_wins',
                            timestamp: new Date().toISOString(),
                            reason: '时间戳相同但内容不同，远程版本优先'
                        });
                    }
                }
            }

            // 提交变更
            if (hasRemoteChanges) {
                console.log(`[WebDAV] [Refactored] 远程状态已改变，上传新的快照...`);
                const newRemoteItems = Array.from(workingRemoteItems.values());
                remoteSnapshot.items = newRemoteItems;
                remoteSnapshot.metadata.totalItems = newRemoteItems.length;
                remoteSnapshot.metadata.checksum = this.calculateChecksum(newRemoteItems);
                remoteSnapshot.metadata.syncId = uuidv4();
                remoteSnapshot.timestamp = new Date().toISOString();
                
                await client.putFileContents('/ai-gist-sync/snapshot.json', JSON.stringify(remoteSnapshot, null, 2));
                console.log('[WebDAV] [Refactored] 新的远程快照上传成功');
            }

            if (hasLocalChanges) {
                console.log(`[WebDAV] [Refactored] 本地需要应用 ${itemsToApplyLocally.length} 项变更...`);
                await this.applyLocalChanges(itemsToApplyLocally);
                result.itemsUpdated += itemsToApplyLocally.length;
            }

            // 清理已成功同步的删除记录
            if (result.itemsDeleted > 0) {
                const successfullyDeletedUUIDs = Array.from(deletedUUIDs).filter(uuid => !workingRemoteItems.has(uuid));
                if(successfullyDeletedUUIDs.length > 0){
                    console.log(`[WebDAV] [Refactored] 清理 ${successfullyDeletedUUIDs.length} 条已同步的删除记录`);
                    await this.cleanupDeletedItems(successfullyDeletedUUIDs);
                }
            }
            
            result.success = true;
            result.message = '智能同步完成';
            this.lastSuccessfulSync = result.timestamp;
            this.consecutiveFailures = 0;
            
            console.log('[WebDAV] [Refactored] 同步完成:', {
                created: result.itemsCreated,
                updated: result.itemsUpdated,
                deleted: result.itemsDeleted,
                conflicts: result.conflictsResolved,
                finalItemsCount: result.itemsCreated + result.itemsUpdated + result.conflictsResolved
            });
            return result;

        } catch (error) {
            this.consecutiveFailures++;
            const errorMessage = error instanceof Error ? error.message : '未知错误';
            console.error('[WebDAV] [Refactored] 同步失败:', error);
            result.success = false;
            result.message = errorMessage;
            result.errors.push(errorMessage);
            return result;
        }
    }

    /**
     * [废弃] 合并快照
     */
    private async mergeSnapshots(localSnapshot: SyncSnapshot, remoteSnapshot: SyncSnapshot): Promise<any> {
        console.warn('mergeSnapshots is deprecated');
        return {
            mergedSnapshot: localSnapshot,
            localChanges: [],
            hasChanges: false,
            itemsProcessed: 0,
            itemsUpdated: 0,
            itemsCreated: 0,
            itemsDeleted: 0,
            conflictsResolved: []
        };
    }

    /**
     * [废弃] 合并单个数据项
     */
    private async mergeItems(localItem: DataItem, remoteItem: DataItem): Promise<any> {
        console.warn('mergeItems is deprecated');
        return {
            mergedItem: localItem,
            hasChanges: false,
            needsLocalUpdate: false,
            type: 'keep'
        };
    }

    /**
     * [废弃] 智能合并项目内容
     */
    private async mergeItemContent(baseItem: DataItem, otherItem: DataItem): Promise<any> {
        console.warn('mergeItemContent is deprecated');
        return baseItem.content;
    }

    /**
     * [废弃] 合并提示词内容
     */
    private mergePromptContent(base: any, other: any): any {
        console.warn('mergePromptContent is deprecated');
        return base;
    }

    /**
     * [废弃] 合并分类内容
     */
    private mergeCategoryContent(base: any, other: any): any {
        console.warn('mergeCategoryContent is deprecated');
        return base;
    }

    /**
     * [废弃] 合并AI配置内容
     */
    private mergeAiConfigContent(base: any, other: any): any {
        console.warn('mergeAiConfigContent is deprecated');
        return base;
    }
    
    /**
     * [废弃] 通用内容合并
     */
    private mergeGenericContent(base: any, other: any): any {
        console.warn('mergeGenericContent is deprecated');
        return base;
    }

    /**
     * 应用本地变更
     */
    private async applyLocalChanges(changes: DataItem[]): Promise<void> {
        if (changes.length === 0) return;
        
        console.log(`[WebDAV] 开始应用 ${changes.length} 个本地变更...`);
        
        try {
            // 按类型分组变更
            const changesByType = changes.reduce((acc, item) => {
                if (!acc[item.type]) acc[item.type] = [];
                acc[item.type].push(item);
                return acc;
            }, {} as Record<string, DataItem[]>);
            
            console.log('[WebDAV] 变更按类型分组:', Object.keys(changesByType).map(type => `${type}: ${changesByType[type].length}`));
            
            // 将所有变更转换为前端期望的格式
            const importData: any = {};
            
            for (const [type, items] of Object.entries(changesByType)) {
                const convertedItems = items.map(item => {
                    // 转换为前端期望的格式
                    const converted = {
                        ...item.content,
                        id: item.id,
                        // 确保有必要的时间戳字段
                        updatedAt: item.metadata.updatedAt,
                        createdAt: item.metadata.createdAt || item.metadata.updatedAt
                    };
                    
                    // 移除删除的项目
                    if (item.metadata.deleted) {
                        return null;
                    }
                    
                    return converted;
                }).filter(item => item !== null);
                
                // 转换类型名称为复数形式
                const pluralType = this.getPlural(type);
                importData[pluralType] = convertedItems;
                
                console.log(`[WebDAV] 转换 ${type} -> ${pluralType}: ${convertedItems.length} 项`);
            }
            
            console.log('[WebDAV] 最终导入数据结构:', Object.keys(importData).map(key => `${key}: ${importData[key].length}`));
            
            // 一次性导入所有数据
            if (Object.keys(importData).length > 0) {
                await this.importAllData(importData);
            }
            
            console.log('[WebDAV] 本地变更应用完成');
        } catch (error) {
            console.error('[WebDAV] 应用本地变更失败:', error);
            throw error;
        }
    }

    /**
     * 获取类型的复数形式
     */
    private getPlural(type: string): string {
        const pluralMap: Record<string, string> = {
            'category': 'categories',
            'prompt': 'prompts',
            'aiConfig': 'aiConfigs',
            'setting': 'settings',
            'user': 'users',
            'post': 'posts',
            'history': 'histories'
        };
        
        return pluralMap[type] || (type + 's');
    }
    
    /**
     * 一次性导入所有数据
     */
    private async importAllData(importData: any): Promise<void> {
        console.log('[WebDAV] 开始一次性导入所有数据...');
        
        if (!this.dataManagementService) {
            console.warn('[WebDAV] 数据管理服务未初始化，跳过数据导入');
            return;
        }
        
        try {
            console.log('[WebDAV] 调用数据管理服务同步导入数据:', JSON.stringify(importData, null, 2));
            
            // 使用专门的同步导入方法
            const result = await this.dataManagementService.syncImportDataObject(importData);
            
            console.log('[WebDAV] 数据同步导入结果:', result);
            
            if (!result.success) {
                throw new Error(`数据同步导入失败: ${result.message}`);
            }
            
            console.log('[WebDAV] 数据同步导入成功:', {
                categories: result.imported.categories,
                prompts: result.imported.prompts,
                settings: result.imported.settings,
                history: result.imported.history,
                errors: result.errors
            });
            
        } catch (error) {
            console.error('[WebDAV] 数据同步导入失败:', error);
            throw error;
        }
    }

    /**
     * 应用特定类型的变更 - 已弃用，保留为备用
     */
    private async applyTypeChanges(type: string, items: DataItem[]): Promise<void> {
        console.log(`应用 ${type} 类型的 ${items.length} 个变更`);
        
        if (!this.dataManagementService) {
            console.warn('数据管理服务未初始化，跳过变更应用');
            return;
        }
        
        try {
            // 将变更转换为数据管理服务可以处理的格式
            const changesToApply = items.map(item => ({
                ...item.content,
                id: item.id,
                deleted: item.metadata.deleted,
                updatedAt: item.metadata.updatedAt,
                createdAt: item.metadata.createdAt
            }));
            
            // 使用数据管理服务导入变更
            await this.dataManagementService.importDataObject({
                [type + 's']: changesToApply // 转换为复数形式
            });
            
            console.log(`${type} 类型变更应用完成`);
        } catch (error) {
            console.error(`应用 ${type} 类型变更失败:`, error);
            throw error;
        }
    }

    /**
     * 确保远程目录存在
     */
    private async ensureRemoteDirectory(client: any, dirPath: string): Promise<void> {
        try {
            await client.createDirectory(dirPath, { recursive: true });
        } catch (error) {
            // 目录可能已存在，忽略错误
            console.log('远程目录创建结果:', dirPath);
        }
    }

    /**
     * 导出本地数据
     */
    private async exportLocalData(): Promise<any> {
        console.log('[WebDAV] 开始导出本地数据...');
        
        if (this.dataManagementService) {
            try {
                console.log('[WebDAV] 调用数据管理服务的 generateExportData 方法...');
                const exportResult = await this.dataManagementService.generateExportData();
                console.log('[WebDAV] 数据管理服务返回结果:', {
                    hasResult: !!exportResult,
                    hasData: !!exportResult?.data,
                    resultType: typeof exportResult,
                    dataType: typeof exportResult?.data,
                    resultKeys: exportResult ? Object.keys(exportResult) : [],
                    dataKeys: exportResult?.data ? Object.keys(exportResult.data) : []
                });
                
                if (exportResult?.data) {
                    const data = exportResult.data;
                    console.log('[WebDAV] 成功获取数据管理服务数据:', {
                        categories: data.categories?.length || 0,
                        prompts: data.prompts?.length || 0,
                        aiConfigs: data.aiConfigs?.length || 0,
                        settings: data.settings?.length || 0,
                        exportTime: data.exportTime
                    });
                    return data;
                } else if (exportResult) {
                    // 可能直接返回了数据，没有包装在 data 属性中
                    console.log('[WebDAV] 数据管理服务直接返回数据（无 data 包装）:', {
                        categories: exportResult.categories?.length || 0,
                        prompts: exportResult.prompts?.length || 0,
                        aiConfigs: exportResult.aiConfigs?.length || 0,
                        settings: exportResult.settings?.length || 0,
                        exportTime: exportResult.exportTime
                    });
                    return exportResult;
                } else {
                    console.warn('[WebDAV] 数据管理服务返回空结果，使用占位符数据');
                    return {
                        categories: [],
                        prompts: [],
                        aiConfigs: [],
                        settings: [],
                        exportTime: new Date().toISOString()
                    };
                }
            } catch (error) {
                console.error('[WebDAV] 从数据管理服务导出数据失败:', error);
                console.error('[WebDAV] 错误详情:', {
                    message: error instanceof Error ? error.message : '未知错误',
                    stack: error instanceof Error ? error.stack : undefined
                });
            }
        } else {
            console.warn('[WebDAV] 数据管理服务未初始化');
        }
        
        // 降级到占位符数据
        console.log('[WebDAV] 使用占位符数据作为降级方案');
        return {
            categories: [],
            prompts: [],
            aiConfigs: [],
            settings: [],
            exportTime: new Date().toISOString()
        };
    }

    /**
     * 更新本地同步时间
     */
    private async updateLocalSyncTime(syncTime: string): Promise<void> {
        try {
            const prefs = this.preferencesManager.getPreferences();
            prefs.dataSync = prefs.dataSync || {};
            prefs.dataSync.lastSyncTime = syncTime;
            this.preferencesManager.updatePreferences(prefs);
            console.log('本地同步时间已更新:', syncTime);
        } catch (error) {
            console.error('更新本地同步时间失败:', error);
        }
    }

    /**
     * 启动自动同步 - 改进版本，增加智能错误处理
     */
    private startAutoSync(): void {
        console.log('[WebDAV] 自动同步已禁用，防止数据重复问题');
        return; // 立即返回，禁用自动同步
        
        // 以下代码被禁用，但保留以防将来需要
        /*
        if (this.autoSyncTimer) {
            clearInterval(this.autoSyncTimer);
        }
        
        const intervalMs = (this.config?.syncInterval || 30) * 60 * 1000; // 转换为毫秒
        
        this.autoSyncTimer = setInterval(async () => {
            // 检查是否需要跳过此次同步
            if (this.shouldSkipAutoSync()) {
                console.log('[WebDAV] 跳过此次自动同步:', this.getSkipReason());
                return;
            }
            
            try {
                console.log('[WebDAV] 执行自动同步...');
                
                // 获取最新配置
                const config = await this.loadConfig();
                if (!config || !config.enabled) {
                    console.log('[WebDAV] 自动同步已禁用，停止自动同步');
                    this.stopAutoSync();
                    return;
                }
                
                const result = await this.performIntelligentSync(config);
                
                if (result.success) {
                    console.log('[WebDAV] 自动同步成功:', {
                        itemsProcessed: result.itemsProcessed,
                        itemsUpdated: result.itemsUpdated,
                        itemsCreated: result.itemsCreated,
                        itemsDeleted: result.itemsDeleted,
                        conflictsResolved: result.conflictsResolved
                    });
                    
                    // 重置失败计数
                    this.consecutiveFailures = 0;
                } else {
                    console.warn('[WebDAV] 自动同步失败:', result.message);
                    this.handleAutoSyncFailure(result);
                }
            } catch (error) {
                console.error('[WebDAV] 自动同步异常:', error);
                this.handleAutoSyncError(error);
            }
        }, intervalMs);
        
        console.log(`[WebDAV] 自动同步已启动，间隔: ${this.config?.syncInterval} 分钟`);
        */
    }

    /**
     * 检查是否应该跳过自动同步
     */
    private shouldSkipAutoSync(): boolean {
        // 如果同步正在进行中
        if (this.syncInProgress) {
            return true;
        }
        
        // 如果连续失败次数过多，增加延迟
        if (this.consecutiveFailures >= 3) {
            const timeSinceLastFailure = this.lastSuccessfulSync ? 
                Date.now() - new Date(this.lastSuccessfulSync).getTime() : 
                0;
            
            // 如果连续失败3次以上，延迟到1小时后再试
            if (timeSinceLastFailure < 60 * 60 * 1000) {
                return true;
            }
        }
        
        // 检查配置是否有效
        if (!this.config?.enabled) {
            return true;
        }
        
        return false;
    }

    /**
     * 获取跳过自动同步的原因
     */
    private getSkipReason(): string {
        if (this.syncInProgress) return '同步正在进行中';
        if (this.consecutiveFailures >= 3) return `连续失败${this.consecutiveFailures}次，延迟同步`;
        if (!this.config?.enabled) return 'WebDAV未启用';
        return '未知原因';
    }

    /**
     * 处理自动同步失败
     */
    private handleAutoSyncFailure(result: SyncResult): void {
        this.consecutiveFailures++;
        
        // 如果失败次数过多，考虑通知用户
        if (this.consecutiveFailures >= 5) {
            console.error('[WebDAV] 自动同步连续失败，建议检查网络和配置');
            // 这里可以发送通知给前端
            this.notifyAutoSyncIssue('连续同步失败，请检查网络连接和WebDAV配置');
        }
    }

    /**
     * 处理自动同步异常
     */
    private handleAutoSyncError(error: any): void {
        this.consecutiveFailures++;
        
        const errorMessage = error instanceof Error ? error.message : '未知错误';
        
        // 分析错误类型并采取相应措施
        if (this.isConfigurationError(errorMessage)) {
            console.error('[WebDAV] 配置错误，停止自动同步');
            this.stopAutoSync();
            this.notifyAutoSyncIssue('WebDAV配置错误，自动同步已停止');
        } else if (this.isNetworkError(errorMessage)) {
            console.warn('[WebDAV] 网络错误，将在下次间隔后重试');
        } else {
            console.error('[WebDAV] 自动同步未知错误:', errorMessage);
        }
    }

    /**
     * 检查是否为配置错误
     */
    private isConfigurationError(errorMessage: string): boolean {
        const configErrors = ['unauthorized', 'forbidden', 'authentication', 'credentials'];
        return configErrors.some(pattern => errorMessage.toLowerCase().includes(pattern));
    }

    /**
     * 检查是否为网络错误
     */
    private isNetworkError(errorMessage: string): boolean {
        const networkErrors = ['network', 'timeout', 'connection', 'enotfound', 'econnreset'];
        return networkErrors.some(pattern => errorMessage.toLowerCase().includes(pattern));
    }

    /**
     * 通知自动同步问题
     */
    private notifyAutoSyncIssue(message: string): void {
        // 这里可以通过IPC通知前端显示用户通知
        console.log('[WebDAV] 发送自动同步问题通知:', message);
        // 实际项目中可以发送到前端：
        // this.mainWindow?.webContents.send('webdav:auto-sync-issue', { message });
    }

    /**
     * 停止自动同步
     */
    private stopAutoSync(): void {
        if (this.autoSyncTimer) {
            clearInterval(this.autoSyncTimer);
            this.autoSyncTimer = null;
            console.log('自动同步已停止');
        }
    }

    /**
     * 设置 IPC 处理程序
     */
    setupIpcHandlers(): void {
        console.log('设置现代化 WebDAV IPC 处理程序...');

        // 测试连接
        ipcMain.handle('webdav:test-connection', async (event, config: WebDAVConfig) => {
            try {
                console.log('开始测试 WebDAV 连接...');
                console.log('服务器地址:', config.serverUrl);
                console.log('用户名:', config.username);
                
                const createWebDAVClient = await getWebDAVCreateClient();
                const client = createWebDAVClient(config.serverUrl, {
                    username: config.username,
                    password: config.password
                });
                console.log('WebDAV 客户端创建成功');

                // 测试基本连接
                await client.getDirectoryContents('/');
                console.log('WebDAV 连接测试成功');
                
                return {
                    success: true,
                    message: '连接成功',
                    serverInfo: {
                        url: config.serverUrl,
                        username: config.username
                    }
                };
            } catch (error) {
                console.error('WebDAV 连接测试失败:', error);
                let errorMessage = '连接失败';
                
                if (error instanceof Error) {
                    if (error.message.includes('WebDAV 模块加载失败')) {
                        errorMessage = 'WebDAV 模块加载失败，请检查网络依赖';
                    } else if (error.message.includes('ENOTFOUND')) {
                        errorMessage = '无法找到服务器，请检查服务器地址';
                    } else if (error.message.includes('ECONNREFUSED')) {
                        errorMessage = '连接被拒绝，请检查服务器是否运行';
                    } else if (error.message.includes('401') || error.message.includes('Unauthorized')) {
                        errorMessage = '用户名或密码错误';
                    } else if (error.message.includes('404')) {
                        errorMessage = '服务器地址不存在或WebDAV未启用';
                    } else if (error.message.includes('ETIMEDOUT')) {
                        errorMessage = '连接超时，请检查网络连接';
                    } else {
                        errorMessage = error.message;
                    }
                }
                
                return {
                    success: false,
                    message: errorMessage
                };
            }
        });

        // 立即同步 - 改进版本
        ipcMain.handle('webdav:sync-now', async (event, options?: { autoMergeConfirmed?: boolean }) => {
            try {
                console.log('[WebDAV] 开始立即同步...', options);
                
                // 获取配置
                const config = await this.loadConfig();
                
                console.log('[WebDAV] 同步时检查配置:', {
                    hasConfig: !!config,
                    enabled: config?.enabled,
                    serverUrl: config?.serverUrl,
                    username: config?.username
                });
                
                if (!config || !config.enabled) {
                    return {
                        success: false,
                        error: 'WebDAV 同步未启用'
                    };
                }

                if (!config.serverUrl || !config.username) {
                    return {
                        success: false,
                        error: 'WebDAV 配置不完整，请检查服务器地址和用户名'
                    };
                }
                
                // 立即同步使用最高优先级和较少重试
                const result = await this.executeWithRetry(
                    () => {
                        const syncResult: SyncResult = {
                            success: false,
                            message: '',
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
                            autoMergeConfirmed: options?.autoMergeConfirmed || false
                        };
                        return this.performIntelligentSync(config);
                    },
                    '立即同步',
                    { maxRetries: 1, baseDelay: 500 }
                );
                
                console.log('[WebDAV] 立即同步完成:', result);
                
                // 检查是否需要合并确认
                if (!result.success && result.message === 'MERGE_CONFIRMATION_NEEDED') {
                    console.log('[WebDAV] 需要合并确认，返回确认数据:', result.mergeInfo);
                    return {
                        success: false,
                        needsMergeConfirmation: true,
                        mergeInfo: result.mergeInfo,
                        message: '云端已存在一个库，默认进行合并。如需覆盖请在高级设置中手动解决覆盖'
                    };
                }
                
                // 生成详细的同步报告
                let message = result.message;
                if (result.success && result.phases) {
                    const details: string[] = [];
                    if (result.itemsCreated > 0) details.push(`新增 ${result.itemsCreated} 项`);
                    if (result.itemsUpdated > 0) details.push(`更新 ${result.itemsUpdated} 项`);
                    if (result.itemsDeleted > 0) details.push(`删除 ${result.itemsDeleted} 项`);
                    if (result.conflictsResolved > 0) details.push(`解决 ${result.conflictsResolved} 个冲突`);
                    
                    if (details.length > 0) {
                        message = `同步完成: ${details.join(', ')}`;
                    } else {
                        message = '同步完成，数据已是最新';
                    }
                }
                
                return {
                    success: result.success,
                    data: result,
                    message
                };
            } catch (error) {
                console.error('[WebDAV] 立即同步失败:', error);
                return {
                    success: false,
                    error: error instanceof Error ? error.message : '同步失败'
                };
            }
        });

        // 手动上传 - 改进版本
        ipcMain.handle('webdav:manual-upload', async () => {
            try {
                console.log('开始手动上传数据到 WebDAV...');
                
                // 获取配置
                const config = await this.loadConfig();
                if (!config) {
                    return {
                        success: false,
                        error: '未找到 WebDAV 配置'
                    };
                }

                if (!config.enabled) {
                    return {
                        success: false,
                        error: 'WebDAV 同步未启用'
                    };
                }

                // 手动上传使用智能同步，确保数据安全
                const result = await this.executeWithRetry(
                    () => this.performIntelligentSync(config),
                    '手动上传',
                    { maxRetries: 2 } // 手动操作减少重试次数
                );
                
                console.log('手动上传完成:', result);
                
                // 提供详细的结果信息
                let message = '上传成功';
                if (result.phases) {
                    const details: string[] = [];
                    if ( result.phases.upload.itemsProcessed > 0) {
                        details.push(`上传 ${result.phases.upload.itemsProcessed} 项`);
                    }
                    if (result.phases.deleteRemote.itemsProcessed > 0) {
                        details.push(`删除 ${result.phases.deleteRemote.itemsProcessed} 项`);
                    }
                    if (result.phases.download.itemsProcessed > 0) {
                        details.push(`下载 ${result.phases.download.itemsProcessed} 项`);
                    }
                    if (details.length > 0) {
                        message = `同步完成: ${details.join(', ')}`;
                    }
                }
                
                return {
                    success: true,
                    data: result,
                    message
                };
            } catch (error) {
                console.error('手动上传失败:', error);
                return {
                    success: false,
                    error: error instanceof Error ? error.message : '上传失败'
                };
            }
        });

        // 手动下载 - 改进版本
        ipcMain.handle('webdav:manual-download', async () => {
            try {
                console.log('开始从 WebDAV 下载数据...');
                
                // 获取配置
                const config = await this.loadConfig();
                if (!config) {
                    return {
                        success: false,
                        error: '未找到 WebDAV 配置'
                    };
                }

                if (!config.enabled) {
                    return {
                        success: false,
                        error: 'WebDAV 同步未启用'
                    };
                }

                // 手动下载也使用智能同步，但优先采用远程数据
                const result = await this.executeWithRetry(
                    () => this.performIntelligentSync(config),
                    '手动下载',
                    { maxRetries: 2 }
                );
                
                console.log('手动下载完成:', result);
                
                // 如果有冲突，返回冲突信息让用户处理
                if (result.conflictsResolved > 0) {
                    return {
                        success: true,
                        data: {
                            hasConflicts: true,
                            conflictDetails: result.conflictDetails,
                            timestamp: result.timestamp,
                            differences: {
                                itemsProcessed: result.itemsProcessed,
                                itemsUpdated: result.itemsUpdated,
                                itemsCreated: result.itemsCreated,
                                itemsDeleted: result.itemsDeleted,
                                conflicts: result.conflictsResolved
                            }
                        },
                        message: `下载完成，但检测到 ${result.conflictsResolved} 个冲突`
                    };
                }
                
                // 无冲突，直接返回成功结果
                let message = '下载成功';
                if (result.phases && result.phases.download.itemsProcessed > 0) {
                    message = `下载完成: 处理了 ${result.phases.download.itemsProcessed} 个项目`;
                }
                
                return {
                    success: true,
                    data: {
                        hasConflicts: false,
                        timestamp: result.timestamp,
                        differences: {
                            itemsProcessed: result.itemsProcessed,
                            itemsUpdated: result.itemsUpdated,
                            itemsCreated: result.itemsCreated,
                            itemsDeleted: result.itemsDeleted
                        }
                    },
                    message
                };
            } catch (error) {
                console.error('手动下载失败:', error);
                return {
                    success: false,
                    error: error instanceof Error ? error.message : '下载失败'
                };
            }
        });

        // 应用下载的数据
        ipcMain.handle('webdav:apply-downloaded-data', async (event, resolution: any) => {
            try {
                if (resolution.localChanges && resolution.localChanges.length > 0) {
                    await this.applyLocalChanges(resolution.localChanges);
                }
                
                if (resolution.timestamp) {
                    await this.updateLocalSyncTime(resolution.timestamp);
                }
                
                return {
                    success: true,
                    message: '数据应用成功'
                };
            } catch (error) {
                return {
                    success: false,
                    error: error instanceof Error ? error.message : '应用数据失败'
                };
            }
        });



        // 比较数据
        ipcMain.handle('webdav:compare-data', async () => {
            try {
                // 获取配置
                const config = await this.loadConfig();
                if (!config) {
                    return {
                        success: false,
                        error: '未找到 WebDAV 配置'
                    };
                }

                if (!config.enabled) {
                    return {
                        success: false,
                        error: 'WebDAV 同步未启用'
                    };
                }

                const client = await this.createClient(config);
                const localSnapshot = await this.getLocalSnapshot();
                const remoteSnapshot = await this.getRemoteSnapshot(client);
                
                if (!remoteSnapshot) {
                    return {
                        success: true,
                        data: {
                            differences: {
                                local: localSnapshot.items.length,
                                remote: 0,
                                conflicts: 0,
                                summary: '远程无数据，建议执行上传'
                            },
                            localSnapshot,
                            remoteSnapshot: null
                        }
                    };
                }
                
                const differences = await this.compareSnapshots(localSnapshot, remoteSnapshot);
                
                return {
                    success: true,
                    data: { 
                        differences,
                        localSnapshot,
                        remoteSnapshot
                    }
                };
            } catch (error) {
                console.error('比较数据失败:', error);
                return {
                    success: false,
                    error: error instanceof Error ? error.message : '比较失败'
                };
            }
        });

        // 获取配置
        ipcMain.handle('webdav:get-config', async () => {
            try {
                const config = await this.loadConfig();
                return config || {
                    enabled: false,
                    serverUrl: '',
                    username: '',
                    password: '',
                    autoSync: false,
                    syncInterval: 30,
                    // 连接验证状态
                    connectionTested: false,
                    connectionValid: false,
                    connectionMessage: '',
                    connectionTestedAt: '',
                    configHash: ''
                };
            } catch (error) {
                console.error('获取 WebDAV 配置失败:', error);
                return {
                    enabled: false,
                    serverUrl: '',
                    username: '',
                    password: '',
                    autoSync: false,
                    syncInterval: 30,
                    // 连接验证状态
                    connectionTested: false,
                    connectionValid: false,
                    connectionMessage: '',
                    connectionTestedAt: '',
                    configHash: ''
                };
            }
        });

        // 设置配置
        ipcMain.handle('webdav:set-config', async (event, config: WebDAVConfig) => {
            try {
                console.log('保存 WebDAV 配置:', {
                    ...config,
                    password: config.password ? '[已设置]' : '[未设置]'
                });

                const currentPrefs = this.preferencesManager.getPreferences();
                const currentWebDAVConfig = currentPrefs.webdav || {};

                // 合并配置
                const mergedConfig = {
                    ...currentWebDAVConfig,
                    enabled: config.enabled !== undefined ? config.enabled : currentWebDAVConfig.enabled,
                    serverUrl: config.serverUrl !== undefined ? config.serverUrl : currentWebDAVConfig.serverUrl,
                    username: config.username !== undefined ? config.username : currentWebDAVConfig.username,
                    password: config.password !== undefined ? config.password : currentWebDAVConfig.password,
                    autoSync: config.autoSync !== undefined ? config.autoSync : currentWebDAVConfig.autoSync,
                    syncInterval: config.syncInterval !== undefined ? config.syncInterval : currentWebDAVConfig.syncInterval,
                    encryptData: config.encryptData !== undefined ? config.encryptData : currentWebDAVConfig.encryptData,
                    maxRetries: config.maxRetries !== undefined ? config.maxRetries : currentWebDAVConfig.maxRetries,
                    conflictResolution: config.conflictResolution !== undefined ? config.conflictResolution : currentWebDAVConfig.conflictResolution,
                    // 连接验证状态
                    connectionTested: config.connectionTested !== undefined ? config.connectionTested : currentWebDAVConfig.connectionTested,
                    connectionValid: config.connectionValid !== undefined ? config.connectionValid : currentWebDAVConfig.connectionValid,
                    connectionMessage: config.connectionMessage !== undefined ? config.connectionMessage : currentWebDAVConfig.connectionMessage,
                    connectionTestedAt: config.connectionTestedAt !== undefined ? config.connectionTestedAt : currentWebDAVConfig.connectionTestedAt,
                    configHash: config.configHash !== undefined ? config.configHash : currentWebDAVConfig.configHash,
                };

                this.preferencesManager.updatePreferences({
                    webdav: mergedConfig
                });
                
                // 更新本地配置
                this.config = mergedConfig;
                
                // 重新配置自动同步
                if (mergedConfig.enabled && mergedConfig.autoSync) {
                    this.startAutoSync();
                } else {
                    this.stopAutoSync();
                }
                
                return {
                    success: true,
                    message: '配置已保存'
                };
            } catch (error) {
                console.error('保存 WebDAV 配置失败:', error);
                return {
                    success: false,
                    error: error instanceof Error ? error.message : '保存配置失败'
                };
            }
        });

        // 用户确认合并后的同步 - 现在将直接调用新的 performIntelligentSync
        ipcMain.handle('webdav:sync-with-merge-confirmed', async () => {
            try {
                console.log('[WebDAV] 用户确认合并，开始同步...');
                const result = await this.performIntelligentSync();
                
                // 生成详细的同步报告
                let message = result.message;
                if (result.success) {
                    const details: string[] = [];
                    if (result.itemsCreated > 0) details.push(`新增 ${result.itemsCreated} 项`);
                    if (result.itemsUpdated > 0) details.push(`更新 ${result.itemsUpdated} 项`);
                    if (result.itemsDeleted > 0) details.push(`删除 ${result.itemsDeleted} 项`);
                    if (result.conflictsResolved > 0) details.push(`解决 ${result.conflictsResolved} 个冲突`);
                    
                    if (details.length > 0) {
                        message = `合并同步完成: ${details.join(', ')}`;
                    } else {
                        message = '合并同步完成，数据已是最新';
                    }
                }
                
                // 记录同步历史
                await this.recordSyncHistory(result);
                
                return {
                    success: result.success,
                    data: result,
                    message
                };
            } catch (error) {
                console.error('[WebDAV] 确认合并同步失败:', error);
                return {
                    success: false,
                    error: error instanceof Error ? error.message : '合并同步失败'
                };
            }
        });

        // [重构] 新的即时删除接口
        ipcMain.handle('webdav:delete-remote-items', async (event, uuids: string[]) => {
            try {
                console.log(`[WebDAV] IPC: 收到立即删除 ${uuids.length} 个项目的请求。`);
                return await this.deleteRemoteItems(uuids);
            } catch (error) {
                console.error('[WebDAV] IPC: 立即远程删除失败:', error);
                return { success: false, error: error instanceof Error ? error.message : '删除远程项目失败' };
            }
        });

        console.log('现代化 WebDAV IPC 处理程序设置完成');
    }

    /**
     * 比较快照差异
     */
    private async compareSnapshots(localSnapshot: SyncSnapshot, remoteSnapshot: SyncSnapshot): Promise<any> {
        const localItemsMap = new Map<string, DataItem>();
        const remoteItemsMap = new Map<string, DataItem>();
        
        localSnapshot.items.forEach(item => localItemsMap.set(item.id, item));
        remoteSnapshot.items.forEach(item => remoteItemsMap.set(item.id, item));
        
        const allIds = new Set([...localItemsMap.keys(), ...remoteItemsMap.keys()]);
        
        let localOnly = 0;
        let remoteOnly = 0;
        let conflicts = 0;
        let identical = 0;
        const conflictItems: any[] = [];
        
        for (const id of allIds) {
            const localItem = localItemsMap.get(id);
            const remoteItem = remoteItemsMap.get(id);
            
            if (!localItem && remoteItem) {
                remoteOnly++;
            } else if (localItem && !remoteItem) {
                localOnly++;
            } else if (localItem && remoteItem) {
                if (localItem.metadata.checksum === remoteItem.metadata.checksum) {
                    identical++;
                } else {
                    conflicts++;
                    conflictItems.push({
                        id,
                        title: localItem.title || localItem.id,
                        type: localItem.type,
                        localUpdated: localItem.metadata.updatedAt,
                        remoteUpdated: remoteItem.metadata.updatedAt,
                        localChecksum: localItem.metadata.checksum,
                        remoteChecksum: remoteItem.metadata.checksum
                    });
                }
            }
        }
        
        return {
            summary: {
                local: localSnapshot.items.length,
                remote: remoteSnapshot.items.length,
                identical,
                localOnly,
                remoteOnly,
                conflicts
            },
            details: {
                conflictItems,
                lastLocalSync: localSnapshot.timestamp,
                lastRemoteSync: remoteSnapshot.timestamp
            },
            recommendation: this.getRecommendation(localOnly, remoteOnly, conflicts)
        };
    }

    /**
     * 获取同步建议
     */
    private getRecommendation(localOnly: number, remoteOnly: number, conflicts: number): string {
        if (localOnly > 0 && remoteOnly === 0 && conflicts === 0) {
            return '建议执行上传，将本地新增数据同步到远程';
        }
        if (localOnly === 0 && remoteOnly > 0 && conflicts === 0) {
            return '建议执行下载，将远程新增数据同步到本地';
        }
        if (conflicts > 0) {
            return '检测到数据冲突，建议执行智能同步进行自动合并';
        }
        if (localOnly > 0 && remoteOnly > 0) {
            return '两端都有新增数据，建议执行智能同步进行双向合并';
        }
        return '数据已同步，无需操作';
    }

    /**
     * 清理资源
     */
    cleanup(): void {
        console.log('清理 WebDAV 服务...');
        this.stopAutoSync();
        
        // 移除所有相关的 IPC 处理程序
        ipcMain.removeHandler('webdav:test-connection');
        ipcMain.removeHandler('webdav:sync-now');
        ipcMain.removeHandler('webdav:manual-upload');
        ipcMain.removeHandler('webdav:manual-download');
        ipcMain.removeHandler('webdav:apply-downloaded-data');
        ipcMain.removeHandler('webdav:compare-data');
        ipcMain.removeHandler('webdav:get-config');
        ipcMain.removeHandler('webdav:set-config');
        ipcMain.removeHandler('webdav:sync-with-merge-confirmed');
        ipcMain.removeHandler('webdav:record-deleted-items'); // 确保移除旧的
        ipcMain.removeHandler('webdav:delete-remote-items'); // 移除新的
        
        console.log('WebDAV IPC 处理程序已移除');
    }

    /**
     * 获取同步锁 - 防止并发同步
     */
    private async acquireSyncLock(client?: any): Promise<void> {
        const lockPath = '/ai-gist-sync/locks/sync.lock';
        const lockData: SyncLock = {
            id: uuidv4(),
            deviceId: this.deviceId,
            timestamp: new Date().toISOString(),
            type: 'sync',
            ttl: 5 * 60 * 1000 // 5分钟
        };

        try {
            // 使用传入的客户端或者缓存的客户端
            const lockClient = client || this.client;
            if (!lockClient) {
                throw new Error('WebDAV 客户端未初始化，无法获取同步锁');
            }

            // 检查是否已有锁
            const existingLock = await this.getCurrentLock(lockClient);
            if (existingLock && this.isLockValid(existingLock)) {
                if (existingLock.deviceId !== this.deviceId) {
                    throw new Error(`同步已被其他设备锁定: ${existingLock.deviceId}`);
                }
                // 如果是自己的锁，更新时间
                lockData.id = existingLock.id;
            }

            await this.ensureRemoteDirectory(lockClient, '/ai-gist-sync/locks');
            await lockClient.putFileContents(lockPath, JSON.stringify(lockData));
            this.currentSyncLock = lockData;
            
            console.log('[WebDAV] 获取同步锁成功:', lockData.id);
        } catch (error) {
            console.error('[WebDAV] 获取同步锁失败:', error);
            throw error;
        }
    }

    /**
     * 释放同步锁
     */
    private async releaseSyncLock(client?: any): Promise<void> {
        if (!this.currentSyncLock) {
            return;
        }

        try {
            const lockPath = '/ai-gist-sync/locks/sync.lock';
            const lockClient = client || this.client;
            if (lockClient) {
                await lockClient.deleteFile(lockPath);
                console.log('[WebDAV] 同步锁已释放:', this.currentSyncLock.id);
            }
        } catch (error) {
            console.warn('[WebDAV] 释放同步锁失败:', error);
        } finally {
            this.currentSyncLock = null;
        }
    }

    /**
     * 获取当前同步锁
     */
    private async getCurrentLock(client?: any): Promise<SyncLock | null> {
        try {
            const lockPath = '/ai-gist-sync/locks/sync.lock';
            const lockClient = client || this.client;
            if (!lockClient) {
                return null;
            }
            const content = await lockClient.getFileContents(lockPath, { format: 'text' });
            return JSON.parse(content);
        } catch (error) {
            return null;
        }
    }

    /**
     * 检查锁是否有效
     */
    private isLockValid(lock: SyncLock): boolean {
        const now = Date.now();
        const lockTime = new Date(lock.timestamp).getTime();
        return (now - lockTime) < lock.ttl;
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
        let lastError: Error = new Error('未知错误');
        
        for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
            try {
                if (attempt > 0) {
                    const delay = Math.min(
                        config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1),
                        config.maxDelay
                    );
                    console.log(`[WebDAV] ${operationName} 重试 ${attempt}/${config.maxRetries}，延迟 ${delay}ms`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
                
                return await operation();
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                console.warn(`[WebDAV] ${operationName} 第 ${attempt + 1} 次尝试失败:`, lastError.message);
                
                // 检查是否是不可重试的错误
                if (this.isNonRetryableError(lastError)) {
                    throw lastError;
                }
            }
        }
        
        throw new Error(`${operationName} 失败，已重试 ${config.maxRetries} 次: ${lastError.message}`);
    }

    /**
     * 判断是否为不可重试的错误
     */
    private isNonRetryableError(error: Error): boolean {
        const message = error.message.toLowerCase();
        // 认证、授权、找不到等错误不应重试
        const nonRetryablePatterns = ['401', '403', '404', 'unauthorized', 'forbidden', 'not found', 'credentials'];
        return nonRetryablePatterns.some(pattern => message.includes(pattern));
    }
    
    /**
     * [废弃] 上传阶段
     */
    private async performUploadPhase(
        client: any,
        localSnapshot: SyncSnapshot,
        remoteSnapshot: SyncSnapshot,
        result: SyncResult
    ): Promise<void> {
        console.warn('performUploadPhase is deprecated');
    }

    /**
     * [废弃] 删除远程阶段
     */
    private async performDeleteRemotePhase(
        client: any,
        localSnapshot: SyncSnapshot,
        remoteSnapshot: SyncSnapshot,
        result: SyncResult
    ): Promise<void> {
        console.warn('performDeleteRemotePhase is deprecated');
    }

    /**
     * [废弃] 下载和合并阶段
     */
    private async performDownloadAndMergePhase(
        client: any,
        localSnapshot: SyncSnapshot,
        remoteSnapshot: SyncSnapshot,
        result: SyncResult
    ): Promise<void> {
        console.warn('performDownloadAndMergePhase is deprecated');
    }

    /**
     * [废弃] 解决冲突
     */
    private async resolveConflict(localItem: DataItem, remoteItem: DataItem): Promise<ConflictResolution> {
        console.warn('resolveConflict is deprecated');
        return {
            itemId: localItem.id,
            strategy: 'local_wins',
            timestamp: new Date().toISOString(),
            reason: '方法已废弃'
        };
    }
    
    /**
     * 检查是否需要合并确认
     */
    private async checkIfNeedsMergeConfirmation(localSnapshot: SyncSnapshot, remoteSnapshot: SyncSnapshot): Promise<boolean> {
        console.log('[WebDAV] 检查是否需要合并确认:', {
            localItems: localSnapshot.items.length,
            remoteItems: remoteSnapshot.items.length,
            localDeviceId: localSnapshot.deviceId,
            remoteDeviceId: remoteSnapshot.deviceId
        });
        
        // 如果本地或远程任一为空，不需要确认
        if (localSnapshot.items.length === 0 || remoteSnapshot.items.length === 0) {
            console.log('[WebDAV] 无需确认 - 一端无数据');
            return false;
        }
        
        // 检查设备ID，如果是不同设备或首次同步，需要确认
        const localDeviceId = localSnapshot.deviceId;
        const remoteDeviceId = remoteSnapshot.deviceId;
        
        console.log('[WebDAV] 设备ID比较:', { localDeviceId, remoteDeviceId, 相同: localDeviceId === remoteDeviceId });
        
        if (localDeviceId !== remoteDeviceId) {
            // 不同设备，需要确认
            console.log('[WebDAV] 检测到不同设备，需要用户确认合并');
            return true;
        }
        
        // 同一设备，检查是否有过同步记录
        const hasLocalSyncHistory = await this.hasLocalSyncHistory();
        console.log('[WebDAV] 本地同步历史检查结果:', hasLocalSyncHistory);
        
        if (!hasLocalSyncHistory) {
            console.log('[WebDAV] 无同步历史，需要用户确认合并');
            return true;
        }
        
        console.log('[WebDAV] 无需确认 - 同设备且有同步历史');
        return false;
    }

    /**
     * 获取冲突项目数量
     */
    private getConflictingItemsCount(localSnapshot: SyncSnapshot, remoteSnapshot: SyncSnapshot): number {
        const localItemsMap = new Map(localSnapshot.items.map(item => [item.id, item]));
        const remoteItemsMap = new Map(remoteSnapshot.items.map(item => [item.id, item]));
        
        let conflictCount = 0;
        
        for (const [id, localItem] of localItemsMap) {
            const remoteItem = remoteItemsMap.get(id);
            if (remoteItem) {
                const localTime = new Date(localItem.metadata.updatedAt);
                const remoteTime = new Date(remoteItem.metadata.updatedAt);
                
                // 如果时间不同且内容也不同，则为冲突
                if (localTime.getTime() !== remoteTime.getTime() && 
                    localItem.metadata.checksum !== remoteItem.metadata.checksum) {
                    conflictCount++;
                }
            }
        }
        
        return conflictCount;
    }

    /**
     * 检查本地是否有同步历史
     */
    private async hasLocalSyncHistory(): Promise<boolean> {
        try {
            const prefs = this.preferencesManager.getPreferences();
            return !!prefs.dataSync?.lastSyncTime;
        } catch (error) {
            console.error('检查本地同步历史失败:', error);
            return false;
        }
    }

    /**
     * 记录同步历史
     */
    private async recordSyncHistory(result: SyncResult): Promise<void> {
        try {
            const prefs = this.preferencesManager.getPreferences();
            const history = prefs.webdav?.syncHistory || [];
            
            history.unshift({
                timestamp: result.timestamp,
                success: result.success,
                message: result.message,
                itemsCreated: result.itemsCreated,
                itemsUpdated: result.itemsUpdated,
                itemsDeleted: result.itemsDeleted,
                conflictsResolved: result.conflictsResolved,
                deviceId: this.deviceId
            });
            
            // 保留最近50条历史记录
            if (history.length > 50) {
                history.length = 50;
            }
            
            await this.preferencesManager.updatePreferences({
                webdav: {
                    ...prefs.webdav,
                    syncHistory: history
                }
            });
        } catch (error) {
            console.warn('[WebDAV] 记录同步历史失败:', error);
        }
    }

    /**
     * [新增] 立即从远程删除项目，并记录删除操作。
     */
    public async deleteRemoteItems(uuids: string[]): Promise<{ success: boolean; error?: string }> {
        if (!uuids || uuids.length === 0) {
            return { success: true };
        }
    
        // 步骤1：立即将删除操作记入日志，这是最关键的一步，确保数据最终一致性
        try {
            await this.recordDeletedItems(uuids);
        } catch (e) {
            const error = e instanceof Error ? e : new Error(String(e));
            console.error('[WebDAV] 即时删除: 记录删除日志失败。', error);
            return { success: false, error: '记录删除日志失败: ' + error.message };
        }
    
        console.log(`[WebDAV] 开始即时远程删除 ${uuids.length} 个项目。`);
    
        // 步骤2：尽力而为（Best-effort）地尝试从远程服务器上删除。
        // 即使此步骤失败，由于已记录日志，下一次完整同步会纠正远程状态。
        let client: any = null;
        try {
            const syncConfig = await this.loadConfig();
            if (!syncConfig?.enabled) {
                console.log('[WebDAV] 即时删除: WebDAV未启用，跳过远程删除。');
                return { success: true }; // 成功，因为已记入日志
            }
    
            client = await this.createClient(syncConfig);
            await this.acquireSyncLock(client); // 使用锁避免与完整同步冲突
    
            const remoteSnapshot = await this.getRemoteSnapshot(client);
            if (!remoteSnapshot) {
                console.log('[WebDAV] 即时删除: 远程无快照，无需删除。');
                return { success: true };
            }
    
            const originalCount = remoteSnapshot.items.length;
            const deletedUUIDs = new Set(uuids);
            const newItems = remoteSnapshot.items.filter(item => !deletedUUIDs.has(item.id));
            const deleteCount = originalCount - newItems.length;
    
            if (deleteCount > 0) {
                console.log(`[WebDAV] 即时删除: 从远程快照中移除 ${deleteCount} 项。`);
                remoteSnapshot.items = newItems;
                remoteSnapshot.metadata.totalItems = newItems.length;
                remoteSnapshot.metadata.checksum = this.calculateChecksum(newItems);
                remoteSnapshot.metadata.syncId = uuidv4();
                remoteSnapshot.timestamp = new Date().toISOString();
    
                await client.putFileContents('/ai-gist-sync/snapshot.json', JSON.stringify(remoteSnapshot, null, 2));
                console.log(`[WebDAV] 即时删除: 远程快照更新成功。`);
            } else {
                console.log('[WebDAV] 即时删除: 在远程未找到匹配项。');
            }
    
            return { success: true };
        } catch (error) {
            const e = error instanceof Error ? error : new Error(String(error));
            console.error(`[WebDAV] 即时远程删除失败:`, e);
            // 不向上抛出异常。删除操作已记录，完整同步会处理。
            return { success: false, error: '远程删除失败: ' + e.message };
        } finally {
            if (client) {
                await this.releaseSyncLock(client);
            }
        }
    }
    
    /**
     * 记录删除项 - 将UUID和时间戳保存到配置中
     */
    private async recordDeletedItems(uuids: string[]): Promise<void> {
        if (!uuids || uuids.length === 0) return;
        
        try {
            const prefs = this.preferencesManager.getPreferences();
            const existingItems = prefs.webdav?.deletedItems || [];
            const existingUuids = new Set(existingItems.map((item: any) => item.uuid));
            
            const newDeletedItems = uuids
                .filter(uuid => !existingUuids.has(uuid)) // 避免重复记录
                .map(uuid => ({
                    uuid,
                    deletedAt: new Date().toISOString(),
                    deviceId: this.deviceId
                }));

            if (newDeletedItems.length > 0) {
                const updatedDeletedItems = [...existingItems, ...newDeletedItems];
                
                // 限制删除日志的大小，例如最多保留最近2000条
                if (updatedDeletedItems.length > 2000) {
                    updatedDeletedItems.sort((a:any, b:any) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime());
                    updatedDeletedItems.length = 2000;
                }

                await this.preferencesManager.updatePreferences({
                    webdav: {
                        ...prefs.webdav,
                        deletedItems: updatedDeletedItems
                    }
                });
                console.log(`[WebDAV] 已将 ${newDeletedItems.length} 个新项目添加到删除日志`);
            }
        } catch (error) {
            console.error('[WebDAV] 记录删除项失败:', error);
            throw error;
        }
    }

    /**
     * 获取删除记录
     */
    private async getDeletedItems(): Promise<Array<{uuid: string, deletedAt: string, deviceId: string}>> {
        try {
            const prefs = this.preferencesManager.getPreferences();
            return prefs.webdav?.deletedItems || [];
        } catch (error) {
            console.error('获取删除记录失败:', error);
            return [];
        }
    }

    /**
     * 清理已完成同步的删除记录
     * 只有在确认远程服务器也删除了这些项目后才清理
     */
    private async cleanupDeletedItems(syncedUuids: string[]): Promise<void> {
        try {
            if (!syncedUuids || syncedUuids.length === 0) return;

            const prefs = this.preferencesManager.getPreferences();
            const deletedItems = prefs.webdav?.deletedItems || [];
            
            const syncedUuidsSet = new Set(syncedUuids);
            const remainingDeletedItems = deletedItems.filter((item: any) => 
                !syncedUuidsSet.has(item.uuid)
            );
            
            const cleanedCount = deletedItems.length - remainingDeletedItems.length;
            
            if (cleanedCount > 0) {
                await this.preferencesManager.updatePreferences({
                    webdav: {
                        ...prefs.webdav,
                        deletedItems: remainingDeletedItems
                    }
                });
                console.log(`[WebDAV] 成功清理了 ${cleanedCount} 个已同步的删除记录`);
            }
        } catch (error) {
            console.error('[WebDAV] 清理删除记录失败:', error);
            throw error;
        }
    }
}
