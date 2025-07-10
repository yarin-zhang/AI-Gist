/**
 * 云端备份相关类型定义
 */

// 使用 Uint8Array 替代 Buffer 类型
type Buffer = Uint8Array;

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
  size: number;
  localPath?: string; // 本地备份文件路径
  cloudPath?: string; // 云端备份文件路径
  storageId: string; // 关联的存储配置ID
  checksum?: string;
  version?: string;
}

export interface CloudStorageProvider {
  // 测试连接
  testConnection(): Promise<boolean>;
  
  // 列出文件
  listFiles(path?: string): Promise<CloudFileInfo[]>;
  
  // 读取文件
  readFile(path: string): Promise<Buffer>;
  
  // 写入文件
  writeFile(path: string, data: Buffer): Promise<void>;
  
  // 删除文件
  deleteFile(path: string): Promise<void>;
  
  // 创建目录
  createDirectory(path: string): Promise<void>;
}

export interface CloudFileInfo {
  name: string;
  path: string;
  size: number;
  isDirectory: boolean;
  modifiedAt: string;
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
} 