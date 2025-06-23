/**
 * 现代化 WebDAV 同步服务
 * 基于 Joplin 同步策略的可靠实现
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
import { WebDAVSyncCore, SyncResult } from './webdav-sync-core';

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
            throw new Error(`WebDAV 模块加载失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }
    return webdavCreateClient;
}

// 同步锁接口
interface SyncLock {
    id: string;
    deviceId: string;
    timestamp: string;
    type: 'sync' | 'exclusive';
    ttl: number; // 锁的生存时间（毫秒）
}

// 重试配置
interface RetryConfig {
    maxRetries: number;
    baseDelay: number; // 基础延迟（毫秒）
    maxDelay: number;  // 最大延迟（毫秒）
    backoffMultiplier: number;
}

/**
 * 现代化 WebDAV 同步服务
 * 基于 Joplin 同步策略的可靠实现
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
    private syncCore: WebDAVSyncCore;
    
    // 同步锁和重试机制
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
        this.syncCore = new WebDAVSyncCore(this.deviceId, dataManagementService);
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
     * 生成设备ID
     */
    private generateDeviceId(): string {
        const platform = os.platform();
        const hostname = os.hostname();
        const userInfo = os.userInfo();
        
        const deviceInfo = `${platform}-${hostname}-${userInfo.username}`;
        return crypto.createHash('sha256').update(deviceInfo).digest('hex').substring(0, 16);
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
        const syncConfig = config || this.config;
        if (!syncConfig) throw new Error('WebDAV 配置未找到');

        const createClient = await getWebDAVCreateClient();
        
        const client = createClient(syncConfig.serverUrl, {
            username: syncConfig.username,
            password: syncConfig.password,
            maxBodyLength: 50 * 1024 * 1024, // 50MB
            timeout: 30000, // 30秒超时
        });

        return client;
    }

    /**
     * 执行智能同步
     */
    async performIntelligentSync(config?: WebDAVConfig): Promise<SyncResult> {
        console.log('[WebDAV] 开始执行智能同步');
        
        if (this.syncInProgress) {
            console.warn('[WebDAV] 同步正在进行中，退出');
            throw new Error('同步正在进行中');
        }

        this.syncInProgress = true;
        let client: any = null;

        try {
            const syncConfig = config || await this.loadConfig();
            if (!syncConfig?.enabled) throw new Error('WebDAV 同步未启用');

            client = await this.createClient(syncConfig);
            await this.acquireSyncLock(client);

            // 使用新的同步核心执行同步
            const result = await this.syncCore.performSync(client, syncConfig);
            
            if (result.success) {
                this.lastSuccessfulSync = result.timestamp;
                this.consecutiveFailures = 0;
            } else {
                this.consecutiveFailures++;
            }

            return result;

        } catch (error) {
            this.consecutiveFailures++;
            const errorMessage = error instanceof Error ? error.message : '未知错误';
            console.error('[WebDAV] 同步失败:', error);
            
            return {
                success: false,
                message: errorMessage,
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
            if (client) {
                await this.releaseSyncLock(client);
            }
            this.syncInProgress = false;
            console.log('[WebDAV] 清理同步状态');
        }
    }

    /**
     * 测试WebDAV连接
     */
    async testConnection(config?: WebDAVConfig): Promise<WebDAVTestResult> {
        console.log('[WebDAV] 开始测试连接');
        
        try {
            const testConfig = config || await this.loadConfig();
            if (!testConfig) {
                return {
                    success: false,
                    message: 'WebDAV 配置未找到',
                    error: '请先配置 WebDAV 服务器信息'
                };
            }

            const client = await this.createClient(testConfig);
            
            // 测试基本连接
            await client.stat('/');
            
            // 测试写入权限
            const testFile = `/test-${Date.now()}.txt`;
            const testContent = 'WebDAV connection test';
            await client.putFileContents(testFile, testContent);
            
            // 清理测试文件
            try {
                await client.deleteFile(testFile);
            } catch (cleanupError) {
                console.warn('[WebDAV] 清理测试文件失败:', cleanupError);
            }

            return {
                success: true,
                message: '连接测试成功',
                serverInfo: {
                    name: 'WebDAV Server',
                    version: '1.0',
                    capabilities: ['read', 'write', 'delete']
                }
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : '未知错误';
            console.error('[WebDAV] 连接测试失败:', error);
            
            return {
                success: false,
                message: '连接测试失败',
                error: errorMessage
            };
        }
    }

    /**
     * 启动自动同步
     */
    private startAutoSync(): void {
        if (this.autoSyncTimer) {
            clearInterval(this.autoSyncTimer);
        }

        const interval = (this.config?.syncInterval || 30) * 60 * 1000; // 转换为毫秒
        console.log(`[WebDAV] 启动自动同步，间隔: ${interval / 1000 / 60} 分钟`);

        this.autoSyncTimer = setInterval(async () => {
            if (this.shouldSkipAutoSync()) {
                console.log(`[WebDAV] 跳过自动同步: ${this.getSkipReason()}`);
                return;
            }

            try {
                console.log('[WebDAV] 执行自动同步...');
                const result = await this.performIntelligentSync();
                
                if (result.success) {
                    console.log('[WebDAV] 自动同步成功');
                } else {
                    this.handleAutoSyncFailure(result);
                }
            } catch (error) {
                this.handleAutoSyncError(error);
            }
        }, interval);
    }

    /**
     * 检查是否应该跳过自动同步
     */
    private shouldSkipAutoSync(): boolean {
        // 如果同步正在进行中，跳过
        if (this.syncInProgress) return true;
        
        // 如果连续失败次数过多，跳过
        if (this.consecutiveFailures >= 5) return true;
        
        // 如果配置未启用，跳过
        if (!this.config?.enabled) return true;
        
        return false;
    }

    /**
     * 获取跳过同步的原因
     */
    private getSkipReason(): string {
        if (this.syncInProgress) return '同步正在进行中';
        if (this.consecutiveFailures >= 5) return '连续失败次数过多';
        if (!this.config?.enabled) return '同步未启用';
        return '未知原因';
    }

    /**
     * 处理自动同步失败
     */
    private handleAutoSyncFailure(result: SyncResult): void {
        this.consecutiveFailures++;
        
        if (this.consecutiveFailures >= 5) {
            console.error('[WebDAV] 自动同步连续失败，建议检查网络和配置');
            this.notifyAutoSyncIssue('连续同步失败，请检查网络连接和WebDAV配置');
        }
    }

    /**
     * 处理自动同步错误
     */
    private handleAutoSyncError(error: any): void {
        this.consecutiveFailures++;
        const errorMessage = error instanceof Error ? error.message : '未知错误';
        
        console.error('[WebDAV] 自动同步错误:', error);
        
        if (this.isConfigurationError(errorMessage)) {
            console.error('[WebDAV] 配置错误，停止自动同步');
            this.stopAutoSync();
            this.notifyAutoSyncIssue('WebDAV 配置错误，请检查服务器设置');
        } else if (this.isNetworkError(errorMessage)) {
            console.warn('[WebDAV] 网络错误，将在下次重试');
        } else {
            console.error('[WebDAV] 未知错误，将在下次重试');
        }
    }

    /**
     * 判断是否为配置错误
     */
    private isConfigurationError(errorMessage: string): boolean {
        const configErrors = [
            'unauthorized',
            'forbidden',
            'not found',
            'invalid credentials',
            'authentication failed'
        ];
        return configErrors.some(error => errorMessage.toLowerCase().includes(error));
    }

    /**
     * 判断是否为网络错误
     */
    private isNetworkError(errorMessage: string): boolean {
        const networkErrors = [
            'timeout',
            'network',
            'connection',
            'econnrefused',
            'enotfound'
        ];
        return networkErrors.some(error => errorMessage.toLowerCase().includes(error));
    }

    /**
     * 通知自动同步问题
     */
    private notifyAutoSyncIssue(message: string): void {
        // 这里可以发送通知给前端
        console.warn('[WebDAV] 自动同步问题:', message);
    }

    /**
     * 停止自动同步
     */
    private stopAutoSync(): void {
        if (this.autoSyncTimer) {
            clearInterval(this.autoSyncTimer);
            this.autoSyncTimer = null;
            console.log('[WebDAV] 自动同步已停止');
        }
    }

    /**
     * 设置IPC处理程序
     */
    setupIpcHandlers(): void {
        console.log('[WebDAV] 设置IPC处理程序...');

        // 测试连接
        ipcMain.handle('webdav:test-connection', async (event, config?: WebDAVConfig) => {
            try {
                return await this.testConnection(config);
            } catch (error) {
                console.error('[WebDAV] 测试连接失败:', error);
                return {
                    success: false,
                    message: '测试连接失败',
                    error: error instanceof Error ? error.message : '未知错误'
                };
            }
        });

        // 立即同步
        ipcMain.handle('webdav:sync-now', async (event, options?: { autoMergeConfirmed?: boolean }) => {
            try {
                console.log('[WebDAV] 收到立即同步请求');
                
                if (this.syncInProgress) {
                    return {
                        success: false,
                        message: '同步正在进行中，请稍后再试'
                    };
                }

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
                    message: error instanceof Error ? error.message : '同步失败'
                };
            }
        });

        // 获取配置
        ipcMain.handle('webdav:get-config', async () => {
            return this.config;
        });

        // 设置配置
        ipcMain.handle('webdav:set-config', async (event, config: WebDAVConfig) => {
            try {
                const prefs = this.preferencesManager.getPreferences();
                await this.preferencesManager.updatePreferences({
                    ...prefs,
                    webdav: config
                });
                
                this.config = config;
                
                // 如果启用了自动同步，重启自动同步
                if (config.enabled && config.autoSync) {
                    this.startAutoSync();
                } else {
                    this.stopAutoSync();
                }
                
                return { success: true };
            } catch (error) {
                console.error('[WebDAV] 设置配置失败:', error);
                return { 
                    success: false, 
                    error: error instanceof Error ? error.message : '未知错误' 
                };
            }
        });

        console.log('[WebDAV] IPC处理程序设置完成');
    }

    /**
     * 获取同步锁
     */
    private async acquireSyncLock(client?: any): Promise<void> {
        // 简化版锁机制，实际项目中可以实现更复杂的分布式锁
        if (this.currentSyncLock) {
            throw new Error('同步锁已存在');
        }

        this.currentSyncLock = {
            id: uuidv4(),
            deviceId: this.deviceId,
            timestamp: new Date().toISOString(),
            type: 'sync',
            ttl: 300000 // 5分钟
        };

        console.log('[WebDAV] 获取同步锁:', this.currentSyncLock.id);
    }

    /**
     * 释放同步锁
     */
    private async releaseSyncLock(client?: any): Promise<void> {
        if (this.currentSyncLock) {
            console.log('[WebDAV] 释放同步锁:', this.currentSyncLock.id);
            this.currentSyncLock = null;
        }
    }

    /**
     * 清理资源
     */
    cleanup(): void {
        console.log('[WebDAV] 清理 WebDAV 服务...');
        this.stopAutoSync();
        
        // 移除所有相关的 IPC 处理程序
        ipcMain.removeHandler('webdav:test-connection');
        ipcMain.removeHandler('webdav:sync-now');
        ipcMain.removeHandler('webdav:get-config');
        ipcMain.removeHandler('webdav:set-config');
        
        console.log('[WebDAV] IPC 处理程序已移除');
    }
} 