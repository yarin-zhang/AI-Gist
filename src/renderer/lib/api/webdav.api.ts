import { ipcInvoke } from '../ipc';
import { databaseServiceManager } from '../services';
import type { 
  WebDAVConfig, 
  WebDAVTestResult, 
  WebDAVSyncResult,
  WebDAVConflictDetail 
} from '@shared/types/webdav';

// 特定于 API 层的类型
export interface ManualSyncResult {
    success: boolean;
    message: string;
    timestamp: string;
    hasConflicts: boolean;
    conflictDetails?: WebDAVConflictDetail[];
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
    static async syncNow(): Promise<WebDAVSyncResult> {
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
    static async safeSyncNow(): Promise<WebDAVSyncResult> {
        try {
            // 检查数据库健康状态
            const checkResult = await databaseServiceManager.checkAndRepairDatabase();
            
            if (!checkResult.healthy) {
                console.error('数据库健康检查失败:', checkResult.message);
                return {
                    success: false,
                    message: `同步失败: 数据库异常 - ${checkResult.message}`,
                    timestamp: new Date().toISOString(),
                    itemsProcessed: 0,
                    itemsUpdated: 0,
                    itemsCreated: 0,
                    itemsDeleted: 0,
                    conflictsResolved: 0,
                    conflictDetails: [],
                    errors: [checkResult.message]
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

    static async syncWithMergeConfirmed(): Promise<WebDAVSyncResult> {
        try {
            return await ipcInvoke('webdav:sync-with-merge-confirmed');
        } catch (error) {
            console.error('确认合并后同步失败:', error);
            throw error;
        }
    }

    /**
     * 记录删除的项目UUID（用于WebDAV同步）
     */
    static async recordDeletedItems(uuids: string[]): Promise<{ success: boolean; error?: string }> {
        try {
            return await ipcInvoke('webdav:record-deleted-items', uuids);
        } catch (error) {
            console.error('记录删除项目失败:', error);
            return { success: false, error: error instanceof Error ? error.message : '记录删除失败' };
        }
    }

    /**
     * 删除远程项目（即时删除）
     */
    static async deleteRemoteItems(uuids: string[]): Promise<{ success: boolean; error?: string }> {
        try {
            return await ipcInvoke('webdav:delete-remote-items', uuids);
        } catch (error) {
            console.error('删除远程项目失败:', error);
            return { success: false, error: error instanceof Error ? error.message : '删除远程项目失败' };
        }
    }

    /**
     * 强制上传 (本地覆盖远端)
     */
    async forceUpload(): Promise<WebDAVSyncResult> {
        return await ipcInvoke('webdav:force-upload');
    }

    /**
     * 强制下载 (远端覆盖本地)
     */
    async forceDownload(): Promise<WebDAVSyncResult> {
        return await ipcInvoke('webdav:force-download');
    }
}
