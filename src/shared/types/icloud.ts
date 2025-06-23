/**
 * iCloud 同步服务类型定义
 * 与 WebDAV 保持一致的现代化架构
 */

// 现代化数据结构接口（与 WebDAV 保持一致）
export interface DataItem {
    id: string; // UUID
    type: 'category' | 'prompt' | 'aiConfig' | 'setting' | 'user' | 'post' | 'history';
    title?: string;
    content: any;
    metadata: DataItemMetadata;
}

export interface DataItemMetadata {
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

export interface SyncSnapshot {
    timestamp: string;
    version: string;
    deviceId: string;
    items: DataItem[];
    metadata: SnapshotMetadata;
}

export interface SnapshotMetadata {
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

export interface ConflictResolution {
    itemId: string;
    strategy: 'local_wins' | 'remote_wins' | 'merge' | 'create_duplicate';
    timestamp: string;
    reason: string;
}

export interface ICloudSyncResult {
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

export interface ICloudConfig {
    enabled: boolean;
    autoSync: boolean;
    syncInterval: number; // 分钟
    customPath?: string; // 可选的自定义同步路径
}

export interface ICloudTestResult {
    success: boolean;
    message: string;
    iCloudPath?: string;
    available?: boolean;
}

export interface ICloudManualSyncResult {
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

export interface ICloudConflictResolution {
    strategy: 'use_local' | 'use_remote' | 'merge_smart' | 'merge_manual' | 'cancel';
    mergedData?: any;
}

// 错误重试配置
export interface RetryConfig {
    maxRetries: number;
    baseDelay: number; // 基础延迟（毫秒）
    maxDelay: number;  // 最大延迟（毫秒）
    backoffMultiplier: number;
}

// IPC 事件类型
export interface ICloudIPCEvents {
    'icloud:test-availability': () => Promise<ICloudTestResult>;
    'icloud:sync-now': () => Promise<ICloudSyncResult>;
    'icloud:get-config': () => Promise<ICloudConfig>;
    'icloud:set-config': (config: ICloudConfig) => Promise<void>;
    'icloud:manual-upload': () => Promise<ICloudManualSyncResult>;
    'icloud:manual-download': () => Promise<ICloudManualSyncResult>;
    'icloud:apply-downloaded-data': (resolution: ICloudConflictResolution) => Promise<ICloudSyncResult>;
    'icloud:compare-data': () => Promise<{
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
    }>;
    'icloud:open-sync-directory': () => Promise<{
        success: boolean;
        message: string;
        path?: string;
    }>;
}
