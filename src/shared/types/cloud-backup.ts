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

/** 连接测试结果：失败时带上服务器返回的原因（已隐去密码），设置页据此给出具体说明 */
export interface CloudConnectionCheckResult {
  success: boolean;
  error?: string;
}

export interface CloudStorageProvider {
  // 测试连接
  testConnection(): Promise<boolean>;

  // 测试连接并带回失败原因（可选；没有实现时只能知道成功与否）
  checkConnection?(): Promise<CloudConnectionCheckResult>;
  
  // 初始化目录结构（可选方法）
  initializeDirectories?(): Promise<void>;
  
  // 列出文件
  listFiles(path?: string): Promise<CloudFileInfo[]>;
  
  // 读取文件
  readFile(path: string): Promise<Buffer>;

  // 读取文件并带回这次响应的 ETag（可选，用于之后的条件写，省掉写入前再读一遍）
  readFileWithInfo?(path: string): Promise<CloudFileReadResult>;
  
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
  /**
   * 写后校验方式。content（默认）把文件整份下载回来逐字节比对；
   * metadata 只查一次文件信息，大小一致且 ETag 已经变化就算写入成功，看不出来时再按 content 校验；
   * none 不校验，只用于主文件之外的备用副本 (#486)
   */
  verify?: 'content' | 'metadata' | 'none';
  /** 调用方已确认父目录存在，写入前不再逐级检查 */
  skipDirectoryCheck?: boolean;
}

export interface CloudFileReadResult {
  data: Buffer;
  etag?: string;
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
