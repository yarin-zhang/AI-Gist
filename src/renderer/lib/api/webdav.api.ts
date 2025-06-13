import { ipcInvoke } from '../ipc-utils';

export interface WebDAVConfig {
    enabled: boolean;
    serverUrl: string;
    username: string;
    password: string;
    autoSync: boolean;
    syncInterval: number;
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
}
