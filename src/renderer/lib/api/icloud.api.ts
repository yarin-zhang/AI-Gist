/**
 * iCloud 同步 API
 * 渲染进程中的 iCloud 同步接口封装
 */

import { databaseServiceManager } from '../services';

// 安全获取 electronAPI
const getElectronAPI = () => {
    return (window as any).electronAPI;
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
            case 'get-sync-status':
                return await electronAPI.icloud.getSyncStatus();
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
    // 连接验证状态
    connectionTested?: boolean;
    connectionValid?: boolean;
    connectionMessage?: string;
    connectionTestedAt?: string; // ISO 时间戳
    // 用于检测配置是否变更的哈希值
    configHash?: string;
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

export interface ConflictResolution {
    itemId: string;
    strategy: 'local_wins' | 'remote_wins' | 'merge' | 'create_duplicate';
    timestamp: string;
    reason: string;
}

export interface ManualSyncResult {
    success: boolean;
    message: string;
    timestamp: string;
    hasConflicts: boolean;
    conflictDetails?: ConflictResolution[];
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

export interface ConflictResolutionStrategy {
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
            return await safeIpcInvoke('icloud:get-sync-status');
        } catch (error) {
            console.error('获取同步状态失败:', error);
            throw error;
        }
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
    static async applyDownloadedData(resolution: ConflictResolutionStrategy): Promise<SyncResult> {
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

    /**
     * 确认合并后同步数据
     * 用于用户确认合并策略后执行同步
     */
    static async syncWithMergeConfirmed(): Promise<SyncResult> {
        try {
            // 标记用户已确认合并，然后执行同步
            return await this.syncNow();
        } catch (error) {
            console.error('确认合并后同步失败:', error);
            throw error;
        }
    }
}
