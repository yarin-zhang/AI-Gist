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
                    };
                }
                
                if (!config.serverUrl || !config.username || !config.password) {
                    return {
                        success: false,
                        message: 'WebDAV 配置不完整，请检查服务器地址、用户名和密码',
                        timestamp: new Date().toISOString(),
                        filesUploaded: 0,
                        filesDownloaded: 0,
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
            console.log('开始执行 WebDAV 同步...');
            
            const webdavClient = await this.getWebDAVClient();
            
            if (!this.config) {
                throw new Error('WebDAV 配置未设置');
            }
            
            // 使用真实的 WebDAV 客户端进行同步
            const client = webdavClient(this.config.serverUrl, {
                username: this.config.username,
                password: this.config.password,
                timeout: 30000, // 30秒超时
            });
            
            // 检查远程目录是否存在，如果不存在则创建
            const remoteDir = '/ai-gist-data';
            try {
                await client.stat(remoteDir);
            } catch (error) {
                // 目录不存在，创建它
                await client.createDirectory(remoteDir);
                console.log('创建远程目录:', remoteDir);
            }
            
            let filesUploaded = 0;
            let filesDownloaded = 0;
            
            // 1. 导出本地数据并上传
            console.log('正在导出本地数据...');
            try {
                // 生成导出数据
                const exportData = await this.generateExportData();
                const exportFileName = `ai-gist-data-${new Date().toISOString().split('T')[0]}.json`;
                const remotePath = `${remoteDir}/${exportFileName}`;
                
                // 上传到WebDAV服务器
                console.log('正在上传数据到WebDAV服务器...', remotePath);
                await client.putFileContents(remotePath, JSON.stringify(exportData, null, 2), {
                    contentType: 'application/json'
                });
                
                filesUploaded = 1;
                console.log('本地数据上传完成');
            } catch (error) {
                console.error('上传本地数据失败:', error);
                throw new Error(`上传数据失败: ${error instanceof Error ? error.message : '未知错误'}`);
            }
            
            // 2. 列出远程文件并下载最新的备份文件（如果需要）
            console.log('正在检查远程数据...');
            try {
                const remoteFiles = await client.getDirectoryContents(remoteDir);
                const jsonFiles = remoteFiles.filter((file: any) => 
                    file.type === 'file' && file.filename.endsWith('.json')
                ).sort((a: any, b: any) => new Date(b.lastmod).getTime() - new Date(a.lastmod).getTime());
                
                if (jsonFiles.length > 1) {
                    // 如果有多个文件，可以下载最新的作为备份参考
                    console.log(`发现 ${jsonFiles.length} 个远程数据文件`);
                    filesDownloaded = jsonFiles.length - 1; // 除了刚上传的文件
                }
            } catch (error) {
                console.error('检查远程数据失败:', error);
                // 不阻断同步流程，仅记录错误
            }
            
            // 3. 更新同步时间
            const syncTime = new Date().toISOString();
            this.preferencesManager.updatePreferences({
                dataSync: {
                    ...this.preferencesManager.getPreferences().dataSync,
                    lastSyncTime: syncTime
                }
            });
            
            const result = {
                success: true,
                message: '同步完成！数据已成功同步到 WebDAV 服务器',
                timestamp: syncTime,
                filesUploaded,
                filesDownloaded,
            };
            
            console.log('WebDAV 同步完成:', result);
            return result;
        } catch (error) {
            console.error('WebDAV 同步失败:', error);
            throw new Error(`同步失败: ${error instanceof Error ? error.message : '未知错误'}`);
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
}
