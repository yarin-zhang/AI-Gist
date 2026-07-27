/**
 * 云端备份相关类型定义
 */

// 使用 Uint8Array 替代 Buffer 类型
type Buffer = Uint8Array;

export type CloudBackupType = 'manual' | 'automatic';

export interface CloudBackupCreateOptions {
  description?: string;
  data?: any;
  backupType?: CloudBackupType;
  trigger?: string;
  deviceId?: string;
  dataChecksum?: string;
}

export interface CloudStorageConfig {
  id: string;
  name: string;
  type: 'webdav' | 'icloud';
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WebDAVConfig extends CloudStorageConfig {
  type: 'webdav';
  url: string;
  username: string;
  password: string;
  requestTimeoutMs?: number;
}

export interface ICloudConfig extends CloudStorageConfig {
  type: 'icloud';
  path: string; // iCloud Drive 中的路径
}

export interface CloudBackupInfo {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  modifiedAt?: string;
  size: number;
  localPath?: string; // 本地备份文件路径
  cloudPath?: string; // 云端备份文件路径
  storageId: string; // 关联的存储配置ID
  checksum?: string;
  version?: string;
  backupType?: CloudBackupType;
  trigger?: string;
  deviceId?: string;
  dataChecksum?: string;
}

export interface CloudBackupDeleteReference {
  id: string;
  cloudPath?: string;
  name?: string;
}

export type CloudBackupDeleteTarget = string | CloudBackupDeleteReference;

export interface CloudStorageProvider {
  // 测试连接
  testConnection(): Promise<boolean>;
  
  // 初始化目录结构（可选方法）
  initializeDirectories?(): Promise<void>;
  
  // 列出文件
  listFiles(path?: string): Promise<CloudFileInfo[]>;
  
  // 读取文件
  readFile(path: string): Promise<Buffer>;
  
  // 写入文件
  writeFile(path: string, data: Buffer, options?: CloudFileWriteOptions): Promise<void | CloudFileWriteResult>;
  
  // 删除文件
  deleteFile(path: string): Promise<void>;
  
  // 创建目录
  createDirectory(path: string): Promise<void>;

  // 获取文件信息（可选，用于支持云同步条件写）
  getFileInfo?(path: string): Promise<CloudFileInfo | null>;
}

export interface CloudFileInfo {
  name: string;
  path: string;
  size: number;
  isDirectory: boolean;
  modifiedAt: string;
  etag?: string;
}

export interface CloudFileWriteOptions {
  overwrite?: boolean;
  ifMatch?: string;
  ifNoneMatch?: boolean;
}

export interface CloudFileWriteResult {
  etag?: string;
  modifiedAt?: string;
}

export interface CloudBackupResult {
  success: boolean;
  message: string;
  backupInfo?: CloudBackupInfo;
  error?: string;
}

export interface CloudRestoreResult {
  success: boolean;
  message: string;
  backupInfo?: CloudBackupInfo;
  error?: string;
  data?: any; // 恢复的备份数据（移动端使用）
} 
