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

// WebDAV 客户端缓存
let webdavCreateClient: any = null;

/**
 * 获取 WebDAV 客户端创建函数
 */
async function getWebDAVCreateClient() {
    if (!webdavCreateClient) {
        try {
            // 使用 Function 构造函数创建动态导入，避免编译时转换问题
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
}

interface WebDAVConfig {
    enabled: boolean;
    serverUrl: string;
    username: string;
    password: string;
    autoSync: boolean;
    syncInterval: number;
    encryptData?: boolean;
    maxRetries?: number;
    conflictResolution?: 'ask' | 'local_wins' | 'remote_wins' | 'merge';
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
        const hostname = os.hostname();
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
    }

    /**
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
            const items = await this.convertToModernFormat(localData);
            console.log('[WebDAV] 数据结构转换完成，共生成', items.length, '个数据项');
            
            const metadata: SnapshotMetadata = {
                totalItems: items.length,
                checksum: this.calculateChecksum(items),
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
                version: '2.0.0',
                deviceId: this.deviceId,
                items,
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
            console.error('[WebDAV] 错误详情:', {
                message: error instanceof Error ? error.message : '未知错误',
                stack: error instanceof Error ? error.stack : undefined
            });
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
     * 执行智能同步
     */
    async performIntelligentSync(config?: WebDAVConfig): Promise<SyncResult> {
        console.log('[WebDAV] performIntelligentSync() - 开始执行智能同步');
        console.log('[WebDAV] performIntelligentSync() - 参数:', {
            hasConfigParam: !!config,
            syncInProgress: this.syncInProgress
        });
        
        if (this.syncInProgress) {
            console.warn('[WebDAV] performIntelligentSync() - 同步正在进行中，退出');
            throw new Error('同步正在进行中');
        }

        this.syncInProgress = true;
        console.log('[WebDAV] performIntelligentSync() - 设置同步进行中标志');

        try {
            const syncConfig = config || this.config;
            console.log('[WebDAV] performIntelligentSync() - 使用的同步配置:', {
                hasConfig: !!syncConfig,
                enabled: syncConfig?.enabled,
                serverUrl: syncConfig?.serverUrl,
                username: syncConfig?.username,
                hasPassword: !!syncConfig?.password
            });
            
            if (!syncConfig) {
                console.error('[WebDAV] performIntelligentSync() - 同步配置为空');
                throw new Error('WebDAV 配置未加载');
            }

            console.log('[WebDAV] performIntelligentSync() - 创建WebDAV客户端...');
            const client = await this.createClient(syncConfig);
            console.log('[WebDAV] performIntelligentSync() - 客户端创建成功');

            console.log('[WebDAV] performIntelligentSync() - 获取本地数据快照...');
            const localSnapshot = await this.getLocalSnapshot();
            console.log('[WebDAV] performIntelligentSync() - 本地快照获取成功，项目数量:', localSnapshot.items.length);

            console.log('[WebDAV] performIntelligentSync() - 获取远程数据快照...');
            const remoteSnapshot = await this.getRemoteSnapshot(client);
            console.log('[WebDAV] performIntelligentSync() - 远程快照获取结果:', {
                hasRemoteSnapshot: !!remoteSnapshot,
                remoteItemsCount: remoteSnapshot?.items?.length || 0
            });

            let result: SyncResult;

            if (!remoteSnapshot) {
                console.log('[WebDAV] performIntelligentSync() - 远程无数据，执行初始上传');
                result = await this.performInitialUpload(client, localSnapshot);
            } else {
                console.log('[WebDAV] performIntelligentSync() - 远程有数据，执行智能合并');
                result = await this.performIntelligentMerge(client, localSnapshot, remoteSnapshot);
            }

            console.log('[WebDAV] performIntelligentSync() - 智能同步完成 ✓:', result);
            return result;

        } catch (error) {
            console.error('[WebDAV] performIntelligentSync() - 智能同步失败:', error);
            return {
                success: false,
                message: error instanceof Error ? error.message : '同步失败',
                timestamp: new Date().toISOString(),
                itemsProcessed: 0,
                itemsUpdated: 0,
                itemsCreated: 0,
                itemsDeleted: 0,
                conflictsResolved: 0,
                conflictDetails: [],
                errors: [error instanceof Error ? error.message : '未知错误']
            };
        } finally {
            this.syncInProgress = false;
            console.log('[WebDAV] performIntelligentSync() - 清除同步进行中标志');
        }
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
                errors: []
            };
        } catch (error) {
            console.error('初始上传失败:', error);
            throw error;
        }
    }

    /**
     * 执行智能合并
     */
    private async performIntelligentMerge(client: any, localSnapshot: SyncSnapshot, remoteSnapshot: SyncSnapshot): Promise<SyncResult> {
        console.log('执行智能合并...');
        
        const mergeResult = await this.mergeSnapshots(localSnapshot, remoteSnapshot);
        
        // 如果有变更，上传新的快照
        if (mergeResult.hasChanges) {
            await client.putFileContents('/ai-gist-sync/snapshot.json', JSON.stringify(mergeResult.mergedSnapshot, null, 2));
            
            // 应用本地变更
            await this.applyLocalChanges(mergeResult.localChanges);
            
            // 更新本地同步时间
            await this.updateLocalSyncTime(mergeResult.mergedSnapshot.timestamp);
        }

        return {
            success: true,
            message: mergeResult.hasChanges ? '同步完成，数据已合并' : '无需同步，数据已是最新',
            timestamp: mergeResult.mergedSnapshot.timestamp,
            itemsProcessed: mergeResult.itemsProcessed,
            itemsUpdated: mergeResult.itemsUpdated,
            itemsCreated: mergeResult.itemsCreated,
            itemsDeleted: mergeResult.itemsDeleted,
            conflictsResolved: mergeResult.conflictsResolved.length,
            conflictDetails: mergeResult.conflictsResolved,
            errors: []
        };
    }

    /**
     * 合并快照 - 核心智能合并逻辑
     */
    private async mergeSnapshots(localSnapshot: SyncSnapshot, remoteSnapshot: SyncSnapshot): Promise<{
        mergedSnapshot: SyncSnapshot;
        localChanges: DataItem[];
        hasChanges: boolean;
        itemsProcessed: number;
        itemsUpdated: number;
        itemsCreated: number;
        itemsDeleted: number;
        conflictsResolved: ConflictResolution[];
    }> {
        // 创建ID映射
        const localItemsMap = new Map<string, DataItem>();
        const remoteItemsMap = new Map<string, DataItem>();
        
        localSnapshot.items.forEach(item => localItemsMap.set(item.id, item));
        remoteSnapshot.items.forEach(item => remoteItemsMap.set(item.id, item));
        
        const mergedItems: DataItem[] = [];
        const localChanges: DataItem[] = [];
        const conflictsResolved: ConflictResolution[] = [];
        
        let itemsProcessed = 0;
        let itemsUpdated = 0;
        let itemsCreated = 0;
        let itemsDeleted = 0;
        
        // 获取所有唯一ID
        const allIds = new Set([...localItemsMap.keys(), ...remoteItemsMap.keys()]);
        
        for (const id of allIds) {
            itemsProcessed++;
            
            const localItem = localItemsMap.get(id);
            const remoteItem = remoteItemsMap.get(id);
            
            if (!localItem && remoteItem) {
                // 仅存在于远程 - 添加到本地
                mergedItems.push(remoteItem);
                localChanges.push(remoteItem);
                itemsCreated++;
                
            } else if (localItem && !remoteItem) {
                // 仅存在于本地 - 保留
                mergedItems.push(localItem);
                
            } else if (localItem && remoteItem) {
                // 两边都存在 - 需要合并
                const mergeResult = await this.mergeItems(localItem, remoteItem);
                mergedItems.push(mergeResult.mergedItem);
                
                if (mergeResult.hasChanges) {
                    if (mergeResult.type === 'update') {
                        itemsUpdated++;
                    }
                    
                    if (mergeResult.needsLocalUpdate) {
                        localChanges.push(mergeResult.mergedItem);
                    }
                    
                    if (mergeResult.conflictResolution) {
                        conflictsResolved.push(mergeResult.conflictResolution);
                    }
                }
                
                if (mergeResult.mergedItem.metadata.deleted) {
                    itemsDeleted++;
                }
            }
        }
        
        // 创建合并后的快照
        const mergedSnapshot: SyncSnapshot = {
            timestamp: new Date().toISOString(),
            version: '2.0.0',
            deviceId: this.deviceId,
            items: mergedItems,
            metadata: {
                totalItems: mergedItems.length,
                checksum: this.calculateChecksum(mergedItems),
                syncId: uuidv4(),
                previousSyncId: localSnapshot.metadata.syncId,
                conflictsResolved,
                deviceInfo: {
                    id: this.deviceId,
                    name: os.hostname(),
                    platform: process.platform,
                    appVersion: app.getVersion() || '1.0.0'
                }
            }
        };
        
        const hasChanges = itemsCreated > 0 || itemsUpdated > 0 || itemsDeleted > 0 || conflictsResolved.length > 0;
        
        return {
            mergedSnapshot,
            localChanges,
            hasChanges,
            itemsProcessed,
            itemsUpdated,
            itemsCreated,
            itemsDeleted,
            conflictsResolved
        };
    }

    /**
     * 合并单个数据项 - 最核心的冲突解决逻辑
     */
    private async mergeItems(localItem: DataItem, remoteItem: DataItem): Promise<{
        mergedItem: DataItem;
        hasChanges: boolean;
        needsLocalUpdate: boolean;
        type: 'keep' | 'update' | 'conflict';
        conflictResolution?: ConflictResolution;
    }> {
        // 1. 检查是否完全相同
        if (localItem.metadata.checksum === remoteItem.metadata.checksum) {
            return {
                mergedItem: localItem,
                hasChanges: false,
                needsLocalUpdate: false,
                type: 'keep'
            };
        }

        // 2. 检查删除状态
        if (localItem.metadata.deleted && remoteItem.metadata.deleted) {
            // 都已删除，选择较新的删除时间
            const winner = new Date(localItem.metadata.updatedAt) > new Date(remoteItem.metadata.updatedAt) 
                ? localItem : remoteItem;
            return {
                mergedItem: winner,
                hasChanges: winner === remoteItem,
                needsLocalUpdate: winner === remoteItem,
                type: 'update'
            };
        }

        if (localItem.metadata.deleted && !remoteItem.metadata.deleted) {
            // 本地删除，远程未删除 - 检查时间
            const localDeleteTime = new Date(localItem.metadata.updatedAt);
            const remoteUpdateTime = new Date(remoteItem.metadata.updatedAt);
            
            if (localDeleteTime > remoteUpdateTime) {
                // 删除操作更新，保持删除状态
                return {
                    mergedItem: localItem,
                    hasChanges: false,
                    needsLocalUpdate: false,
                    type: 'keep'
                };
            } else {
                // 远程更新更新，恢复项目
                const restoredItem = {
                    ...remoteItem,
                    metadata: {
                        ...remoteItem.metadata,
                        version: remoteItem.metadata.version + 1,
                        lastModifiedBy: this.deviceId,
                        updatedAt: new Date().toISOString()
                    }
                };
                return {
                    mergedItem: restoredItem,
                    hasChanges: true,
                    needsLocalUpdate: true,
                    type: 'update',
                    conflictResolution: {
                        itemId: localItem.id,
                        strategy: 'remote_wins',
                        timestamp: new Date().toISOString(),
                        reason: '远程数据更新时间晚于本地删除时间，恢复项目'
                    }
                };
            }
        }

        if (!localItem.metadata.deleted && remoteItem.metadata.deleted) {
            // 远程删除，本地未删除
            const remoteDeleteTime = new Date(remoteItem.metadata.updatedAt);
            const localUpdateTime = new Date(localItem.metadata.updatedAt);
            
            if (remoteDeleteTime > localUpdateTime) {
                // 删除操作更新，删除本地项目
                return {
                    mergedItem: remoteItem,
                    hasChanges: true,
                    needsLocalUpdate: true,
                    type: 'update',
                    conflictResolution: {
                        itemId: localItem.id,
                        strategy: 'remote_wins',
                        timestamp: new Date().toISOString(),
                        reason: '远程删除时间晚于本地修改时间，执行删除'
                    }
                };
            } else {
                // 本地更新更新，保持项目
                return {
                    mergedItem: localItem,
                    hasChanges: false,
                    needsLocalUpdate: false,
                    type: 'keep'
                };
            }
        }

        // 3. 都未删除 - 根据更新时间和内容进行智能合并
        const localUpdateTime = new Date(localItem.metadata.updatedAt);
        const remoteUpdateTime = new Date(remoteItem.metadata.updatedAt);
        
        // 选择更新时间较晚的作为基础
        const isRemoteNewer = remoteUpdateTime > localUpdateTime;
        const baseItem = isRemoteNewer ? remoteItem : localItem;
        const otherItem = isRemoteNewer ? localItem : remoteItem;
        
        // 尝试智能合并内容
        const mergedContent = await this.mergeItemContent(baseItem, otherItem);
        
        const mergedItem: DataItem = {
            ...baseItem,
            content: mergedContent,
            metadata: {
                ...baseItem.metadata,
                version: Math.max(localItem.metadata.version, remoteItem.metadata.version) + 1,
                lastModifiedBy: this.deviceId,
                updatedAt: new Date().toISOString(),
                checksum: this.calculateItemChecksum(mergedContent)
            }
        };

        const hasContentChanges = mergedItem.metadata.checksum !== baseItem.metadata.checksum;
        
        return {
            mergedItem,
            hasChanges: hasContentChanges || isRemoteNewer,
            needsLocalUpdate: isRemoteNewer || hasContentChanges,
            type: hasContentChanges ? 'conflict' : 'update',
            conflictResolution: hasContentChanges ? {
                itemId: localItem.id,
                strategy: 'merge',
                timestamp: new Date().toISOString(),
                reason: '内容存在差异，执行智能合并'
            } : undefined
        };
    }

    /**
     * 智能合并项目内容
     */
    private async mergeItemContent(baseItem: DataItem, otherItem: DataItem): Promise<any> {
        const baseContent = baseItem.content;
        const otherContent = otherItem.content;
        
        // 根据数据类型执行不同的合并策略
        switch (baseItem.type) {
            case 'prompt':
                return this.mergePromptContent(baseContent, otherContent);
            case 'category':
                return this.mergeCategoryContent(baseContent, otherContent);
            case 'aiConfig':
                return this.mergeAiConfigContent(baseContent, otherContent);
            default:
                return this.mergeGenericContent(baseContent, otherContent);
        }
    }

    /**
     * 合并提示词内容
     */
    private mergePromptContent(base: any, other: any): any {
        const merged = { ...base };
        
        // 合并标签
        if (other.tags && Array.isArray(other.tags)) {
            const baseTags = base.tags || [];
            const allTags = [...new Set([...baseTags, ...other.tags])];
            merged.tags = allTags;
        }
        
        // 如果标题不同，选择较长的
        if (other.title && other.title.length > (base.title?.length || 0)) {
            merged.title = other.title;
        }
        
        // 如果内容不同，选择较长的
        if (other.content && other.content.length > (base.content?.length || 0)) {
            merged.content = other.content;
        }
        
        // 合并其他字段
        ['description', 'variables', 'examples'].forEach(field => {
            if (other[field] && (!base[field] || other[field].length > base[field].length)) {
                merged[field] = other[field];
            }
        });
        
        return merged;
    }

    /**
     * 合并分类内容
     */
    private mergeCategoryContent(base: any, other: any): any {
        const merged = { ...base };
        
        // 选择较新的名称和描述
        if (other.name && other.name !== base.name) {
            merged.name = other.name;
        }
        
        if (other.description && other.description.length > (base.description?.length || 0)) {
            merged.description = other.description;
        }
        
        // 合并颜色和图标设置
        if (other.color && other.color !== base.color) {
            merged.color = other.color;
        }
        
        if (other.icon && other.icon !== base.icon) {
            merged.icon = other.icon;
        }
        
        return merged;
    }

    /**
     * 合并AI配置内容
     */
    private mergeAiConfigContent(base: any, other: any): any {
        const merged = { ...base };
        
        // 合并配置参数
        ['name', 'model', 'temperature', 'maxTokens', 'topP', 'frequencyPenalty', 'presencePenalty'].forEach(field => {
            if (other[field] !== undefined && other[field] !== base[field]) {
                merged[field] = other[field];
            }
        });
        
        return merged;
    }

    /**
     * 通用内容合并
     */
    private mergeGenericContent(base: any, other: any): any {
        if (typeof base !== 'object' || typeof other !== 'object') {
            return base; // 保持基础版本
        }
        
        const merged = { ...base };
        
        Object.keys(other).forEach(key => {
            if (other[key] !== undefined && other[key] !== base[key]) {
                if (typeof other[key] === 'string' && typeof base[key] === 'string') {
                    // 字符串字段选择较长的
                    merged[key] = other[key].length > base[key].length ? other[key] : base[key];
                } else if (Array.isArray(other[key]) && Array.isArray(base[key])) {
                    // 数组字段去重合并
                    merged[key] = [...new Set([...base[key], ...other[key]])];
                } else {
                    // 其他类型选择非空值
                    merged[key] = other[key] || base[key];
                }
            }
        });
        
        return merged;
    }

    /**
     * 应用本地变更
     */
    private async applyLocalChanges(changes: DataItem[]): Promise<void> {
        if (changes.length === 0) return;
        
        console.log(`应用 ${changes.length} 个本地变更...`);
        
        try {
            // 按类型分组变更
            const changesByType = changes.reduce((acc, item) => {
                if (!acc[item.type]) acc[item.type] = [];
                acc[item.type].push(item);
                return acc;
            }, {} as Record<string, DataItem[]>);
            
            // 应用每种类型的变更
            for (const [type, items] of Object.entries(changesByType)) {
                await this.applyTypeChanges(type, items);
            }
            
            console.log('本地变更应用完成');
        } catch (error) {
            console.error('应用本地变更失败:', error);
            throw error;
        }
    }

    /**
     * 应用特定类型的变更
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
     * 启动自动同步
     */
    private startAutoSync(): void {
        if (this.autoSyncTimer) {
            clearInterval(this.autoSyncTimer);
        }
        
        const intervalMs = (this.config?.syncInterval || 30) * 60 * 1000; // 转换为毫秒
        
        this.autoSyncTimer = setInterval(async () => {
            try {
                console.log('执行自动同步...');
                await this.performIntelligentSync();
            } catch (error) {
                console.error('自动同步失败:', error);
            }
        }, intervalMs);
        
        console.log(`自动同步已启动，间隔: ${this.config?.syncInterval} 分钟`);
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

        // 立即同步
        ipcMain.handle('webdav:sync-now', async () => {
            try {
                // 获取配置
                const config = await this.loadConfig();
                
                console.log('同步时检查 WebDAV 配置:', {
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
                
                const result = await this.performIntelligentSync(config);
                return {
                    success: result.success,
                    data: result,
                    message: result.message
                };
            } catch (error) {
                console.error('立即同步失败:', error);
                return {
                    success: false,
                    error: error instanceof Error ? error.message : '同步失败'
                };
            }
        });

        // 手动上传
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

                const client = await this.createClient(config);
                const localSnapshot = await this.getLocalSnapshot();
                const result = await this.performInitialUpload(client, localSnapshot);
                
                console.log('手动上传完成');
                return {
                    success: true,
                    data: result,
                    message: result.message || '上传成功'
                };
            } catch (error) {
                console.error('手动上传失败:', error);
                return {
                    success: false,
                    error: error instanceof Error ? error.message : '上传失败'
                };
            }
        });

        // 手动下载
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

                const client = await this.createClient(config);
                const remoteSnapshot = await this.getRemoteSnapshot(client);
                
                if (!remoteSnapshot) {
                    return {
                        success: false,
                        error: 'WebDAV 服务器上没有找到数据文件'
                    };
                }

                // 获取本地数据
                const localSnapshot = await this.getLocalSnapshot();
                
                // 检测冲突并生成详细的差异分析
                const mergeResult = await this.mergeSnapshots(localSnapshot, remoteSnapshot);
                
                return {
                    success: true,
                    data: {
                        hasConflicts: mergeResult.conflictsResolved.length > 0,
                        conflictDetails: mergeResult.conflictsResolved,
                        itemsToUpdate: mergeResult.localChanges.length,
                        timestamp: mergeResult.mergedSnapshot.timestamp,
                        differences: {
                            itemsProcessed: mergeResult.itemsProcessed,
                            itemsUpdated: mergeResult.itemsUpdated,
                            itemsCreated: mergeResult.itemsCreated,
                            itemsDeleted: mergeResult.itemsDeleted,
                            summary: {
                                localTotal: localSnapshot.items.length,
                                remoteTotal: remoteSnapshot.items.length,
                                conflicts: mergeResult.conflictsResolved.length
                            }
                        },
                        localChanges: mergeResult.localChanges,
                        localSnapshot,
                        remoteSnapshot
                    },
                    message: '数据下载完成'
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
                    syncInterval: 30
                };
            } catch (error) {
                console.error('获取 WebDAV 配置失败:', error);
                return {
                    enabled: false,
                    serverUrl: '',
                    username: '',
                    password: '',
                    autoSync: false,
                    syncInterval: 30
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
                    conflictResolution: config.conflictResolution !== undefined ? config.conflictResolution : currentWebDAVConfig.conflictResolution
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
        console.log('清理现代化 WebDAV 服务资源...');
        
        this.stopAutoSync();
        
        // 移除 IPC 处理程序
        const handlers = [
            'webdav:test-connection',
            'webdav:sync-now',
            'webdav:manual-upload',
            'webdav:manual-download',
            'webdav:apply-downloaded-data',
            'webdav:compare-data',
            'webdav:get-config',
            'webdav:set-config'
        ];
        
        handlers.forEach(handler => {
            try {
                ipcMain.removeHandler(handler);
            } catch (error) {
                console.warn(`移除处理程序失败: ${handler}`, error);
            }
        });
        
        console.log('现代化 WebDAV 服务清理完成');
    }
}
