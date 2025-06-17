/**
 * WebDAV 同步服务
 * 这个文件需要在主进程中实现
 */

import { ipcMain, app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';

// 使用动态导入来避免 ES 模块问题
let createWebDAVClient: any = null;

// 密码加密相关常量
const ENCRYPTION_ALGORITHM = 'aes-256-cbc';
const ENCRYPTION_KEY_LENGTH = 32;
const IV_LENGTH = 16;

interface EncryptedPassword {
    encrypted: string;
    iv: string;
    tag: string;
}

interface WebDAVConfig {
    serverUrl: string;
    username: string;
    password: string;
}

// 存储配置的接口，密码可以是加密的
interface WebDAVStorageConfig {
    serverUrl: string;
    username: string;
    password: string | EncryptedPassword;
    enabled?: boolean;
    autoSync?: boolean;
    syncInterval?: number;
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
    private tempRemoteData: any = null;
    private tempRemoteMetadata: any = null;

    constructor(private preferencesManager: any, private dataManagementService?: any) {
        console.log('WebDAV 服务初始化中...');
        console.log('WebDAV 服务已初始化');
    }

    /**
     * 生成加密密钥（基于设备信息）
     */
    private getEncryptionKey(): Buffer {
        const deviceInfo = require('os').hostname() + require('os').platform() + require('os').arch();
        return crypto.scryptSync(deviceInfo, 'ai-gist-salt', ENCRYPTION_KEY_LENGTH);
    }

    /**
     * 加密密码
     */
    private encryptPassword(password: string): EncryptedPassword {
        if (!password) {
            return { encrypted: '', iv: '', tag: '' };
        }

        try {
            const key = this.getEncryptionKey();
            const iv = crypto.randomBytes(16);
            const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
            
            let encrypted = cipher.update(password, 'utf8', 'hex');
            encrypted += cipher.final('hex');
            
            return {
                encrypted,
                iv: iv.toString('hex'),
                tag: '' // CBC 模式不需要 auth tag
            };
        } catch (error) {
            console.error('密码加密失败:', error);
            // 如果加密失败，返回原始密码（向后兼容）
            return { encrypted: password, iv: '', tag: '' };
        }
    }

    /**
     * 解密密码
     */
    private decryptPassword(encryptedPassword: EncryptedPassword): string {
        if (!encryptedPassword.encrypted || !encryptedPassword.iv) {
            return '';
        }

        try {
            const key = this.getEncryptionKey();
            const iv = Buffer.from(encryptedPassword.iv, 'hex');
            
            const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
            
            let decrypted = decipher.update(encryptedPassword.encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            return decrypted;
        } catch (error) {
            console.error('密码解密失败:', error);
            // 如果解密失败，可能是未加密的原始密码
            if (typeof encryptedPassword.encrypted === 'string' && !encryptedPassword.tag) {
                console.log('检测到可能是未加密的密码，直接返回');
                return encryptedPassword.encrypted;
            }
            throw new Error('密码解密失败，可能是数据损坏或密钥错误');
        }
    }

    /**
     * 检查密码是否已加密
     */
    private isPasswordEncrypted(password: any): password is EncryptedPassword {
        return password && typeof password === 'object' && 
               'encrypted' in password && 'iv' in password &&
               password.encrypted && password.iv; // tag 在 CBC 模式下可能为空
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

    public setupIpcHandlers() {
        console.log('正在设置 WebDAV IPC 处理程序...');
        
        // 测试 WebDAV 连接
        ipcMain.handle('webdav:test-connection', async (event, config: WebDAVConfig): Promise<WebDAVTestResult> => {
            try {
                console.log('开始测试 WebDAV 连接:', config.serverUrl);
                
                // 基本验证
                if (!config.serverUrl || !config.username || !config.password) {
                    return {
                        success: false,
                        message: '请填写完整的连接信息',
                    };
                }
                
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
            try {                // 获取当前保存的 WebDAV 配置
                const preferences = this.preferencesManager.getPreferences();
                let config: WebDAVStorageConfig = preferences.webdav;
                
                console.log('同步时检查WebDAV配置:', {
                    hasConfig: !!config,
                    enabled: config?.enabled,
                    serverUrl: config?.serverUrl ? '[已设置]' : '[未设置]',
                    username: config?.username ? '[已设置]' : '[未设置]',
                    hasPassword: !!config?.password
                });
                
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
                
                // 验证基本配置
                if (!config.serverUrl || config.serverUrl.trim() === '') {
                    return {
                        success: false,
                        message: 'WebDAV 服务器地址未设置，请在设置中配置',
                        timestamp: new Date().toISOString(),
                        filesUploaded: 0,
                        filesDownloaded: 0,
                        conflictsDetected: 0,
                        conflictsResolved: 0,
                    };
                }
                
                if (!config.username || config.username.trim() === '') {
                    return {
                        success: false,
                        message: 'WebDAV 用户名未设置，请在设置中配置',
                        timestamp: new Date().toISOString(),
                        filesUploaded: 0,
                        filesDownloaded: 0,
                        conflictsDetected: 0,
                        conflictsResolved: 0,
                    };
                }
                
                if (!config.password) {
                    return {
                        success: false,
                        message: 'WebDAV 密码未设置，请在设置中配置密码',
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
        ipcMain.handle('webdav:manual-upload', async (): Promise<any> => {
            try {
                console.log('开始手动上传数据...');
                
                // 获取配置
                const config = await this.getStoredConfig();
                if (!config) {
                    return {
                        success: false,
                        message: '未找到 WebDAV 配置',
                        timestamp: new Date().toISOString(),
                        hasConflicts: false
                    };
                }

                // 创建客户端
                const WebDAVClient = await this.getWebDAVClient();
                const client = WebDAVClient(config.serverUrl, {
                    username: config.username,
                    password: config.password,
                });

                // 生成本地数据
                const localData = await this.generateExportData();
                const localMetadata = await this.getLocalSyncMetadata();
                
                // 上传数据
                const remoteDir = '/ai-gist-sync';
                const dataFile = `${remoteDir}/data.json`;
                const metadataFile = `${remoteDir}/metadata.json`;

                await this.ensureRemoteDirectory(client, remoteDir);
                
                // 上传数据和元数据
                await client.putFileContents(dataFile, JSON.stringify(localData, null, 2));
                await client.putFileContents(metadataFile, JSON.stringify(localMetadata, null, 2));

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
                const errorMessage = error instanceof Error ? error.message : '未知错误';
                return {
                    success: false,
                    message: `上传失败: ${errorMessage}`,
                    timestamp: new Date().toISOString(),
                    hasConflicts: false
                };
            }
        });

        // 手动下载数据（检测冲突但不应用）
        ipcMain.handle('webdav:manual-download', async (): Promise<any> => {
            try {
                console.log('开始手动下载数据...');
                
                // 获取配置
                const config = await this.getStoredConfig();
                if (!config) {
                    return {
                        success: false,
                        message: '未找到 WebDAV 配置',
                        timestamp: new Date().toISOString(),
                        hasConflicts: false
                    };
                }

                // 创建客户端
                const WebDAVClient = await this.getWebDAVClient();
                const client = WebDAVClient(config.serverUrl, {
                    username: config.username,
                    password: config.password,
                });

                const remoteDir = '/ai-gist-sync';
                const dataFile = `${remoteDir}/data.json`;
                const metadataFile = `${remoteDir}/metadata.json`;

                // 检查远程文件是否存在
                const dataExists = await this.checkRemoteFileExists(client, dataFile);
                const metadataExists = await this.checkRemoteFileExists(client, metadataFile);

                if (!dataExists) {
                    return {
                        success: false,
                        message: '服务器上没有找到数据文件',
                        timestamp: new Date().toISOString(),
                        hasConflicts: false
                    };
                }

                // 下载远程数据
                const remoteDataContent = await client.getFileContents(dataFile, { format: 'text' });
                const remoteData = JSON.parse(remoteDataContent);

                let remoteMetadata = null;
                if (metadataExists) {
                    const remoteMetadataContent = await client.getFileContents(metadataFile, { format: 'text' });
                    remoteMetadata = JSON.parse(remoteMetadataContent);
                }

                // 获取本地数据
                const localData = await this.generateExportData();
                const localMetadata = await this.getLocalSyncMetadata();

                // 检测冲突并生成专业的差异分析
                const detailedDifferences = await this.generateDetailedDifferences(localData, remoteData, localMetadata, remoteMetadata);
                
                // 暂存远程数据供后续使用
                this.tempRemoteData = remoteData;
                this.tempRemoteMetadata = remoteMetadata;

                console.log('手动下载完成，差异分析:', detailedDifferences);
                return {
                    success: true,
                    message: detailedDifferences.hasDifferences ? '发现数据差异，请手动解决' : '数据下载成功，无差异',
                    timestamp: new Date().toISOString(),
                    hasConflicts: detailedDifferences.hasDifferences,
                    differences: detailedDifferences,
                    localData: localData,
                    remoteData: remoteData
                };

            } catch (error) {
                console.error('手动下载失败:', error);
                const errorMessage = error instanceof Error ? error.message : '未知错误';
                return {
                    success: false,
                    message: `下载失败: ${errorMessage}`,
                    timestamp: new Date().toISOString(),
                    hasConflicts: false
                };
            }
        });

        // 应用下载的数据
        ipcMain.handle('webdav:apply-downloaded-data', async (event, resolution: any): Promise<SyncResult> => {
            try {
                console.log('应用下载的数据，解决方案:', resolution.strategy);

                if (!this.tempRemoteData) {
                    throw new Error('没有可应用的远程数据，请先下载');
                }

                let finalData = null;
                
                switch (resolution.strategy) {
                    case 'use_remote':
                        finalData = this.tempRemoteData;
                        break;
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

        // 获取远程数据预览
        ipcMain.handle('webdav:get-remote-preview', async () => {
            try {
                const config = await this.getStoredConfig();
                if (!config) {
                    return {
                        success: false,
                        message: '未找到 WebDAV 配置'
                    };
                }

                const WebDAVClient = await this.getWebDAVClient();
                const client = WebDAVClient(config.serverUrl, {
                    username: config.username,
                    password: config.password,
                });

                const remoteDir = '/ai-gist-sync';
                const dataFile = `${remoteDir}/data.json`;
                const metadataFile = `${remoteDir}/metadata.json`;

                const dataExists = await this.checkRemoteFileExists(client, dataFile);
                if (!dataExists) {
                    return {
                        success: false,
                        message: '服务器上没有找到数据文件'
                    };
                }

                const remoteDataContent = await client.getFileContents(dataFile, { format: 'text' });
                const remoteData = JSON.parse(remoteDataContent);

                let timestamp = new Date().toISOString();
                if (await this.checkRemoteFileExists(client, metadataFile)) {
                    const remoteMetadataContent = await client.getFileContents(metadataFile, { format: 'text' });
                    const remoteMetadata = JSON.parse(remoteMetadataContent);
                    timestamp = remoteMetadata.lastSyncTime || timestamp;
                }

                return {
                    success: true,
                    data: remoteData,
                    timestamp: timestamp
                };

            } catch (error) {
                console.error('获取远程数据预览失败:', error);
                const errorMessage = error instanceof Error ? error.message : '未知错误';
                return {
                    success: false,
                    message: `获取预览失败: ${errorMessage}`
                };
            }
        });

        // 比较本地和远程数据
        ipcMain.handle('webdav:compare-data', async () => {
            try {
                const config = await this.getStoredConfig();
                if (!config) {
                    return {
                        success: false,
                        message: '未找到 WebDAV 配置'
                    };
                }

                const WebDAVClient = await this.getWebDAVClient();
                const client = WebDAVClient(config.serverUrl, {
                    username: config.username,
                    password: config.password,
                });

                const remoteDir = '/ai-gist-sync';
                const dataFile = `${remoteDir}/data.json`;
                const metadataFile = `${remoteDir}/metadata.json`;

                const dataExists = await this.checkRemoteFileExists(client, dataFile);
                if (!dataExists) {
                    return {
                        success: false,
                        message: '服务器上没有找到数据文件'
                    };
                }

                const remoteDataContent = await client.getFileContents(dataFile, { format: 'text' });
                const remoteData = JSON.parse(remoteDataContent);
                
                let remoteMetadata = null;
                if (await this.checkRemoteFileExists(client, metadataFile)) {
                    const remoteMetadataContent = await client.getFileContents(metadataFile, { format: 'text' });
                    remoteMetadata = JSON.parse(remoteMetadataContent);
                }

                const localData = await this.generateExportData();
                const localMetadata = await this.getLocalSyncMetadata();

                // 使用新的详细差异分析
                const differences = await this.generateDetailedDifferences(localData, remoteData, localMetadata, remoteMetadata);

                return {
                    success: true,
                    differences: differences
                };

            } catch (error) {
                console.error('比较数据失败:', error);
                const errorMessage = error instanceof Error ? error.message : '未知错误';
                return {
                    success: false,
                    message: `比较失败: ${errorMessage}`
                };
            }
        });

        // 加密密码（供前端调用）
        ipcMain.handle('webdav:encrypt-password', async (event, password: string) => {
            console.log('WebDAV 密码加密 IPC 处理程序被调用');
            try {
                return {
                    success: true,
                    encryptedPassword: this.encryptPassword(password)
                };
            } catch (error) {
                console.error('密码加密失败:', error);
                return {
                    success: false,
                    error: '密码加密失败'
                };
            }
        });

        // 解密密码（供前端调用）
        ipcMain.handle('webdav:decrypt-password', async (event, encryptedPassword: EncryptedPassword) => {
            console.log('WebDAV 密码解密 IPC 处理程序被调用');
            try {
                return {
                    success: true,
                    password: this.decryptPassword(encryptedPassword)
                };
            } catch (error) {
                console.error('密码解密失败:', error);
                return {
                    success: false,
                    error: '密码解密失败'
                };
            }
        });

        // 设置 WebDAV 配置
        ipcMain.handle('webdav:set-config', async (event, config: WebDAVConfig): Promise<any> => {
            console.log('WebDAV 设置配置 IPC 处理程序被调用');
            try {
                // 保存配置到偏好设置
                this.preferencesManager.updatePreferences({
                    webdav: config
                });
                
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
        
        console.log('WebDAV IPC 处理程序设置完成，包括加密/解密处理程序');
    }

    /**
     * 清理 WebDAV IPC 处理器
     */
    public cleanup() {
        console.log('正在清理 WebDAV IPC 处理程序...');
        
        // 移除所有 WebDAV 相关的 IPC 处理器
        ipcMain.removeHandler('webdav:test-connection');
        ipcMain.removeHandler('webdav:sync-now');
        ipcMain.removeHandler('webdav:manual-upload');
        ipcMain.removeHandler('webdav:manual-download');
        ipcMain.removeHandler('webdav:apply-downloaded-data');
        ipcMain.removeHandler('webdav:get-remote-preview');
        ipcMain.removeHandler('webdav:compare-data');
        ipcMain.removeHandler('webdav:encrypt-password');
        ipcMain.removeHandler('webdav:decrypt-password');
        ipcMain.removeHandler('webdav:set-config');
        
        console.log('WebDAV IPC 处理程序清理完成');
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
            const remoteDataExists = await this.checkRemoteFileExists(client, dataFile);
            const remoteMetadataExists = await this.checkRemoteFileExists(client, metadataFile);
            
            let remoteData: any = null;
            let remoteMetadata: SyncMetadata | null = null;
            
            if (remoteDataExists && remoteMetadataExists) {
                try {
                    // 下载远程数据和元数据
                    const remoteDataContent = await client.getFileContents(dataFile, { format: 'text' });
                    const remoteMetadataContent = await client.getFileContents(metadataFile, { format: 'text' });
                    
                    remoteData = JSON.parse(remoteDataContent as string);
                    remoteMetadata = JSON.parse(remoteMetadataContent as string);
                    
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
        const webdav = preferences.webdav;
        
        // 生成唯一的设备ID（基于用户数据路径）
        const deviceId = this.generateDeviceId();
        
        // 获取应用版本（在生产环境中安全的方式）
        const appVersion = app.getVersion() || '1.0.0';
        
        return {
            lastSyncTime: dataSync?.lastSyncTime || new Date(0).toISOString(), // 如果从未同步，使用很早的时间
            localVersion: '1.0.0',
            remoteVersion: '1.0.0', 
            dataHash: '',
            syncCount: (dataSync?.syncCount || 0),
            deviceId: deviceId,
            appVersion: appVersion,
            totalRecords: 0, // 这将在同步时更新
            lastModifiedTime: new Date().toISOString(),
            syncStrategy: 'auto_merge'
        };
    }

    private calculateDataHash(data: any): string {
        if (!data || typeof data !== 'object') {
            return crypto.createHash('sha256').update('').digest('hex').substring(0, 16);
        }
        
        // 标准化数据：排序键、移除时间戳等易变字段
        const normalizedData = this.normalizeDataForHashing(data);
        const dataString = JSON.stringify(normalizedData);
        return crypto.createHash('sha256').update(dataString).digest('hex').substring(0, 16);
    }

    private normalizeDataForHashing(data: any): any {
        const normalized: any = {};
        
        // 只包含实际数据，排除元数据
        if (data.categories) normalized.categories = this.sortArray(data.categories, 'id');
        if (data.prompts) normalized.prompts = this.sortArray(data.prompts, 'id');
        if (data.aiConfigs) normalized.aiConfigs = this.sortArray(data.aiConfigs, 'id');
        if (data.users) normalized.users = this.sortArray(data.users, 'id');
        if (data.posts) normalized.posts = this.sortArray(data.posts, 'id');
        if (data.settings) normalized.settings = this.sortObject(data.settings);
        
        return normalized;
    }

    private sortArray(arr: any[], keyField: string = 'id'): any[] {
        if (!Array.isArray(arr)) return arr;
        return arr.slice().sort((a, b) => {
            const aKey = a[keyField] || JSON.stringify(a);
            const bKey = b[keyField] || JSON.stringify(b);
            return aKey.toString().localeCompare(bKey.toString());
        });
    }

    private sortObject(obj: any): any {
        if (!obj || typeof obj !== 'object') return obj;
        const sorted: any = {};
        Object.keys(obj).sort().forEach(key => {
            sorted[key] = obj[key];
        });
        return sorted;
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
        
        console.log('\n=== WebDAV 同步决策分析 ===');
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
                // 比如删除、编辑等操作，这是正常情况，不应标记为冲突
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

        // 情况5：不同设备的修改，需要更仔细的分析
        
        // 5.1：时间差很大，使用时间戳决策
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

        // 5.2：时间差较小，可能是并发修改
        if (timeDiff < 60000) { // 1分钟内
            console.log('决策: 检测到可能的并发修改，需要合并');
            return {
                action: 'merge',
                strategy: ConflictResolutionStrategy.AUTO_MERGE,
                reason: '检测到并发修改，尝试自动合并'
            };
        }

        // 5.3：中等时间差，使用同步计数辅助判断
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

        // 情况6：无法明确决策，标记为冲突
        console.log('决策: 无法自动决策，标记为冲突');
        return {
            action: 'conflict_detected',
            strategy: ConflictResolutionStrategy.CREATE_BACKUP,
            reason: `无法自动解决冲突: 时间差${Math.round(timeDiff/1000)}秒, 同步计数差${syncCountDiff}`
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

    /**
     * 检测本地和远程数据之间的冲突
     */
    private async detectConflicts(localData: any, remoteData: any, localMetadata: any, remoteMetadata: any): Promise<any[]> {
        const conflicts: any[] = [];

        if (!localData && !remoteData) {
            return conflicts;
        }

        if (!localData) {
            conflicts.push({
                type: 'data_conflict',
                description: '本地无数据，远程有数据',
                resolution: 'remote_wins'
            });
            return conflicts;
        }

        if (!remoteData) {
            conflicts.push({
                type: 'data_conflict',
                description: '远程无数据，本地有数据',
                resolution: 'local_wins'
            });
            return conflicts;
        }

        // 比较数据哈希
        const localHash = this.calculateDataHash(localData);
        const remoteHash = this.calculateDataHash(remoteData);

        if (localHash === remoteHash) {
            // 数据相同，无冲突
            return conflicts;
        }

        // 检查时间戳冲突
        if (localMetadata && remoteMetadata) {
            const localTime = new Date(localMetadata.lastSyncTime).getTime();
            const remoteTime = new Date(remoteMetadata.lastSyncTime).getTime();
            const timeDiff = Math.abs(localTime - remoteTime);

            if (timeDiff > 300000) { // 5分钟
                conflicts.push({
                    type: 'timestamp_conflict',
                    description: `时间戳冲突: 本地 ${localMetadata.lastSyncTime}, 远程 ${remoteMetadata.lastSyncTime}`,
                    resolution: 'manual'
                });
            }
        }

        // 数据内容不同
        conflicts.push({
            type: 'data_conflict',
            description: '本地和远程数据不同',
            resolution: 'manual'
        });

        return conflicts;
    }
}