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
}
