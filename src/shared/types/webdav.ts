/**
 * WebDAV 相关类型定义 - 统一管理
 * 用于 Main 进程和 Renderer 进程之间的类型共享
 */

/**
 * WebDAV 配置接口
 * 统一的 WebDAV 配置类型，用于所有 WebDAV 相关服务
 */
export interface WebDAVConfig {
  enabled: boolean;
  serverUrl: string;
  username: string;
  password: string;
  autoSync: boolean;
  syncInterval: number; // 同步间隔（分钟）
  encryptData?: boolean;
  maxRetries?: number;
  conflictResolution?: 'ask' | 'local_wins' | 'remote_wins' | 'merge';
  // 连接验证状态
  connectionTested?: boolean;
  connectionValid?: boolean;
  connectionMessage?: string;
  connectionTestedAt?: string; // ISO 时间戳
  // 用于检测配置是否变更的哈希值
  configHash?: string;
}

/**
 * WebDAV 连接测试结果
 */
export interface WebDAVTestResult {
  success: boolean;
  error?: string;
  message?: string;
  serverInfo?: {
    name: string;
    version: string;
    capabilities?: string[];
  };
}

/**
 * WebDAV 同步状态
 */
export interface WebDAVSyncStatus {
  isOnline: boolean;
  lastSync?: Date;
  nextSync?: Date;
  totalItems?: number;
  syncedItems?: number;
  errors?: string[];
  inProgress: boolean;
  currentOperation?: string;
  progress?: number; // 0-100
}

/**
 * WebDAV 同步结果
 */
export interface WebDAVSyncResult {
  success: boolean;
  message?: string;
  error?: string;
  timestamp: string;
  itemsProcessed: number;
  itemsUpdated: number;
  itemsCreated: number;
  itemsDeleted: number;
  conflictsResolved: number;
  conflictDetails: WebDAVConflictDetail[];
  errors: string[];
  duration?: number; // 同步耗时（毫秒）
}

/**
 * WebDAV 冲突详情
 */
export interface WebDAVConflictDetail {
  id: string;
  type: 'category' | 'prompt' | 'aiConfig' | 'setting';
  localVersion: any;
  remoteVersion: any;
  resolution: 'local_wins' | 'remote_wins' | 'merged' | 'manual';
  resolvedAt?: string;
}

/**
 * WebDAV 文件信息
 */
export interface WebDAVFileInfo {
  name: string;
  path: string;
  size: number;
  lastModified: Date;
  type: 'file' | 'directory';
  etag?: string;
}

/**
 * WebDAV 服务器信息
 */
export interface WebDAVServerInfo {
  name: string;
  version: string;
  capabilities: string[];
  supportedMethods: string[];
  maxFileSize?: number;
  quotaUsed?: number;
  quotaTotal?: number;
}

/**
 * WebDAV 操作选项
 */
export interface WebDAVOperationOptions {
  timeout?: number; // 操作超时时间（毫秒）
  retries?: number; // 重试次数
  conflictResolution?: 'ask' | 'local_wins' | 'remote_wins' | 'merge';
  encryptData?: boolean;
  compressData?: boolean;
}

/**
 * WebDAV 错误类型
 */
export interface WebDAVError {
  code: string;
  message: string;
  details?: any;
  timestamp: string;
  operation?: string;
}

/**
 * WebDAV 统计信息
 */
export interface WebDAVStats {
  totalSyncs: number;
  successfulSyncs: number;
  failedSyncs: number;
  totalDataSynced: number; // 字节
  averageSyncTime: number; // 毫秒
  lastSuccessfulSync?: string;
  lastFailedSync?: string;
}

/**
 * WebDAV 备份信息
 */
export interface WebDAVBackupInfo {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  size: number;
  path: string;
  checksum?: string;
  encrypted: boolean;
}

/**
 * WebDAV 同步锁信息
 */
export interface WebDAVSyncLock {
  deviceId: string;
  processId: string;
  timestamp: string;
  operation: string;
  timeout: number;
}
