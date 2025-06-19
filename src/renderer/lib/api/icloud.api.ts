/**
 * iCloud 同步 API
 * 渲染进程中的 iCloud 同步接口封装
 */

// 安全获取 electronAPI
const getElectronAPI = () => {
    // @ts-ignore
    return window.electronAPI;
};

const safeIpcInvoke = async (channel: string, ...args: any[]) => {
    const electronAPI = getElectronAPI();
    if (!electronAPI) {
        throw new Error('Electron API 不可用，请确保应用已正确初始化');
    }
    
    // 根据 channel 路由到对应的 API
    const [namespace, method] = channel.split(':');
    
    if (namespace === 'icloud') {
        if (!electronAPI.icloud) {
            throw new Error('iCloud API 不可用，请确保 preload 脚本已正确加载');
        }
        
        switch (method) {
            case 'test-availability':
                return await electronAPI.icloud.testAvailability();
            case 'sync-now':
                return await electronAPI.icloud.syncNow();
            case 'get-config':
                return await electronAPI.icloud.getConfig();
            case 'set-config':
                return await electronAPI.icloud.setConfig(args[0]);
            case 'manual-upload':
                return await electronAPI.icloud.manualUpload();
            case 'manual-download':
                return await electronAPI.icloud.manualDownload();
            case 'compare-data':
                return await electronAPI.icloud.compareData();
            case 'apply-downloaded-data':
                return await electronAPI.icloud.applyDownloadedData(args[0]);
            case 'open-sync-directory':
                return await electronAPI.icloud.openSyncDirectory();
            default:
                throw new Error(`Unknown iCloud method: ${method}`);
        }
    }
    
    throw new Error(`Unknown channel: ${channel}`);
};

export interface ICloudConfig {
    enabled: boolean;
    autoSync: boolean;
    syncInterval: number;
    customPath?: string;
}

export interface ICloudTestResult {
    success: boolean;
    message: string;
    iCloudPath?: string;
    available?: boolean;
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

export interface ConflictResolution {
    strategy: 'use_local' | 'use_remote' | 'merge_smart' | 'merge_manual' | 'cancel';
    mergedData?: any;
}

/**
 * iCloud 同步 API
 */
export class ICloudAPI {
    /**
     * 测试 iCloud Drive 可用性
     */
    static async testAvailability(): Promise<ICloudTestResult> {
        try {
            return await safeIpcInvoke('icloud:test-availability');
        } catch (error) {
            console.error('测试 iCloud 可用性失败:', error);
            throw error;
        }
    }

    /**
     * 立即同步数据
     */
    static async syncNow(): Promise<SyncResult> {
        try {
            return await safeIpcInvoke('icloud:sync-now');
        } catch (error) {
            console.error('iCloud 同步失败:', error);
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
            const { databaseServiceManager } = await import('../services');
            const checkResult = await databaseServiceManager.checkAndRepairDatabase();
            
            if (!checkResult.healthy) {
                console.error('数据库健康检查失败:', checkResult.message);
            }
            
            if (checkResult.repaired) {
                console.log('数据库已修复，继续同步');
            }
            
            // 执行同步
            return await safeIpcInvoke('icloud:sync-now');
        } catch (error) {
            console.error('iCloud 安全同步失败:', error);
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
            // iCloud 同步状态基于配置计算
            const config = await this.getConfig();
            const userPrefs = await window.electronAPI?.preferences?.get();
            
            return {
                isEnabled: config.enabled && config.autoSync,
                lastSyncTime: userPrefs?.dataSync?.lastSyncTime || null,
                nextSyncTime: this.calculateNextSyncTime(config),
                isSyncing: false // 这个需要从状态管理器获取
            };
        } catch (error) {
            console.error('获取同步状态失败:', error);
            throw error;
        }
    }

    /**
     * 计算下次同步时间
     */
    private static calculateNextSyncTime(config: ICloudConfig): string | null {
        if (!config.enabled || !config.autoSync || !config.syncInterval) {
            return null;
        }
        
        const now = new Date();
        const nextSync = new Date(now.getTime() + config.syncInterval * 60 * 1000);
        return nextSync.toISOString();
    }

    /**
     * 设置 iCloud 配置
     */
    static async setConfig(config: ICloudConfig): Promise<void> {
        try {
            await safeIpcInvoke('icloud:set-config', config);
        } catch (error) {
            console.error('设置 iCloud 配置失败:', error);
            throw error;
        }
    }

    /**
     * 获取 iCloud 配置
     */
    static async getConfig(): Promise<ICloudConfig> {
        try {
            return await safeIpcInvoke('icloud:get-config');
        } catch (error) {
            console.error('获取 iCloud 配置失败:', error);
            throw error;
        }
    }

    /**
     * 手动上传数据到 iCloud
     */
    static async manualUpload(): Promise<ManualSyncResult> {
        try {
            return await safeIpcInvoke('icloud:manual-upload');
        } catch (error) {
            console.error('手动上传失败:', error);
            throw error;
        }
    }

    /**
     * 手动从 iCloud 下载数据（检测冲突但不自动应用）
     */
    static async manualDownload(): Promise<ManualSyncResult> {
        try {
            return await safeIpcInvoke('icloud:manual-download');
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
            return await safeIpcInvoke('icloud:apply-downloaded-data', resolution);
        } catch (error) {
            console.error('应用下载数据失败:', error);
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
            return await safeIpcInvoke('icloud:compare-data');
        } catch (error) {
            console.error('比较数据失败:', error);
            throw error;
        }
    }

    /**
     * 检查 iCloud Drive 是否可用
     */
    static async isAvailable(): Promise<boolean> {
        try {
            const result = await this.testAvailability();
            return result.success && result.available === true;
        } catch (error) {
            console.error('检查 iCloud 可用性失败:', error);
            return false;
        }
    }

    /**
     * 打开 iCloud 同步目录
     */
    static async openSyncDirectory(): Promise<{
        success: boolean;
        message: string;
        path?: string;
    }> {
        try {
            return await safeIpcInvoke('icloud:open-sync-directory');
        } catch (error) {
            console.error('打开同步目录失败:', error);
            throw error;
        }
    }

    /**
     * 获取 iCloud 同步路径信息
     */
    static async getICloudInfo(): Promise<{
        available: boolean;
        path?: string;
        message?: string;
    }> {
        try {
            const result = await this.testAvailability();
            return {
                available: result.success && result.available === true,
                path: result.iCloudPath,
                message: result.message
            };
        } catch (error) {
            console.error('获取 iCloud 信息失败:', error);
            return {
                available: false,
                message: '获取 iCloud 信息失败'
            };
        }
    }
}
