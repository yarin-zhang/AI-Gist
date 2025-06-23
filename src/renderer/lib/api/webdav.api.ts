import { ipcInvoke } from '../ipc';
import { databaseServiceManager } from '../services';

export interface WebDAVConfig {
    enabled: boolean;
    serverUrl: string;
    username: string;
    password: string;
    autoSync: boolean;
    syncInterval: number;
    // 连接验证状态
    connectionTested?: boolean;
    connectionValid?: boolean;
    connectionMessage?: string;
    connectionTestedAt?: string; // ISO 时间戳
    // 用于检测配置是否变更的哈希值
    configHash?: string;
}

export interface WebDAVTestResult {
    success: boolean;
    message: string;
    serverInfo?: {
        name: string;
        version: string;
    };
}

export interface SyncResult {
    success: boolean;
    message: string;
    timestamp: string;
    filesUploaded: number;
    filesDownloaded: number;
    conflictsDetected: number;
    conflictsResolved: number;
    conflictDetails?: ConflictDetail[];
}

export interface ConflictDetail {
    type: 'data_conflict' | 'timestamp_conflict' | 'version_conflict';
    description: string;
    resolution: 'local_wins' | 'remote_wins' | 'merged' | 'backup_created';
    localData?: any;
    remoteData?: any;
}

export interface ManualSyncResult {
    success: boolean;
    message: string;
    timestamp: string;
    hasConflicts: boolean;
    conflictDetails?: ConflictDetail[];
    localData?: any;
    remoteData?: any;
}

export interface ConflictResolution {
    strategy: 'use_local' | 'use_remote' | 'merge_manual' | 'cancel';
    mergedData?: any;
}

export interface EncryptedPassword {
    encrypted: string;
    iv: string;
    tag: string;
}

export interface EncryptionResult {
    success: boolean;
    encryptedPassword?: EncryptedPassword;
    error?: string;
}

export interface DecryptionResult {
    success: boolean;
    password?: string;
    error?: string;
}

/**
 * WebDAV 同步 API
 */
export class WebDAVAPI {
    /**
     * 测试 WebDAV 连接
     */
    static async testConnection(config: Omit<WebDAVConfig, 'enabled' | 'autoSync' | 'syncInterval'>): Promise<WebDAVTestResult> {
        try {
            return await ipcInvoke('webdav:test-connection', config);
        } catch (error) {
            console.error('测试 WebDAV 连接失败:', error);
            throw error;
        }
    }

    /**
     * 立即同步数据
     */
    static async syncNow(): Promise<SyncResult> {
        try {
            return await ipcInvoke('webdav:sync-now');
        } catch (error) {
            console.error('WebDAV 同步失败:', error);
            throw error;
        }
    }

    /**
     * 安全同步数据
     * 在同步前检查数据库健康状态，必要时修复
     */
    static async safeSyncNow(): Promise<SyncResult> {
        try {
            // 检查数据库健康状态
            const checkResult = await databaseServiceManager.checkAndRepairDatabase();
            
            if (!checkResult.healthy) {
                console.error('数据库健康检查失败:', checkResult.message);
                return {
                    success: false,
                    message: `同步失败: 数据库异常 - ${checkResult.message}`,
                    timestamp: new Date().toISOString(),
                    filesUploaded: 0,
                    filesDownloaded: 0,
                    conflictsDetected: 0,
                    conflictsResolved: 0,
                };
            }
            
            if (checkResult.repaired) {
                console.log('数据库已修复，继续同步:', checkResult.message);
            }
            
            // 执行同步
            return await ipcInvoke('webdav:sync-now');
        } catch (error) {
            console.error('WebDAV 安全同步失败:', error);
            throw error;
        }
    }

    /**
     * 获取同步状态
     */
    static async getSyncStatus(): Promise<{
        isEnabled: boolean;
        lastSyncTime: string | null;
        nextSyncTime: string | null;
        isSyncing: boolean;
    }> {
        try {
            return await ipcInvoke('webdav:get-sync-status');
        } catch (error) {
            console.error('获取同步状态失败:', error);
            throw error;
        }
    }

    /**
     * 设置 WebDAV 配置
     */
    static async setConfig(config: WebDAVConfig): Promise<void> {
        try {
            await ipcInvoke('webdav:set-config', config);
        } catch (error) {
            console.error('设置 WebDAV 配置失败:', error);
            throw error;
        }
    }

    /**
     * 获取 WebDAV 配置
     */
    static async getConfig(): Promise<WebDAVConfig> {
        try {
            return await ipcInvoke('webdav:get-config');
        } catch (error) {
            console.error('获取 WebDAV 配置失败:', error);
            throw error;
        }
    }

    /**
     * 加密密码
     */
    static async encryptPassword(password: string): Promise<EncryptionResult> {
        try {
            return await ipcInvoke('webdav:encrypt-password', password);
        } catch (error) {
            console.error('密码加密失败:', error);
            throw error;
        }
    }

    /**
     * 解密密码
     */
    static async decryptPassword(encryptedPassword: EncryptedPassword): Promise<DecryptionResult> {
        try {
            return await ipcInvoke('webdav:decrypt-password', encryptedPassword);
        } catch (error) {
            console.error('密码解密失败:', error);
            throw error;
        }
    }

    /**
     * 手动上传数据到 WebDAV 服务器
     */
    static async manualUpload(): Promise<ManualSyncResult> {
        try {
            return await ipcInvoke('webdav:manual-upload');
        } catch (error) {
            console.error('手动上传失败:', error);
            throw error;
        }
    }

    /**
     * 手动从 WebDAV 服务器下载数据（检测冲突但不自动应用）
     */
    static async manualDownload(): Promise<ManualSyncResult> {
        try {
            return await ipcInvoke('webdav:manual-download');
        } catch (error) {
            console.error('手动下载失败:', error);
            throw error;
        }
    }

    /**
     * 应用下载的数据（解决冲突后）
     */
    static async applyDownloadedData(resolution: ConflictResolution): Promise<SyncResult> {
        try {
            return await ipcInvoke('webdav:apply-downloaded-data', resolution);
        } catch (error) {
            console.error('应用下载数据失败:', error);
            throw error;
        }
    }

    /**
     * 获取服务器上的数据预览（不下载）
     */
    static async getRemoteDataPreview(): Promise<{
        success: boolean;
        data?: any;
        timestamp?: string;
        message?: string;
    }> {
        try {
            return await ipcInvoke('webdav:get-remote-preview');
        } catch (error) {
            console.error('获取远程数据预览失败:', error);
            throw error;
        }
    }

    /**
     * 比较本地和远程数据差异
     */
    static async compareData(): Promise<{
        success: boolean;
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
        message?: string;
    }> {
        try {
            return await ipcInvoke('webdav:compare-data');
        } catch (error) {
            console.error('比较数据失败:', error);
            throw error;
        }
    }

    static async syncWithMergeConfirmed(): Promise<SyncResult> {
        try {
            return await ipcInvoke('webdav:sync-with-merge-confirmed');
        } catch (error) {
            console.error('确认合并后同步失败:', error);
            throw error;
        }
    }
}
