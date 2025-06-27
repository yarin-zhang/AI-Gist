/**
 * 数据管理相关类型定义 - 统一管理
 * 用于 Main 进程和 Renderer 进程之间的类型共享
 */

// 导入通用类型
import type { ValidationResult, BaseResponse } from './common';

/**
 * 数据备份信息
 */
export interface BackupInfo {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  size: number;
  data?: any;
  version?: string;
  checksum?: string;
}

/**
 * 导出选项
 */
export interface ExportOptions {
  format: 'json' | 'csv';
  includeUsers?: boolean;
  includePosts?: boolean;
  includeCategories?: boolean;
  includePrompts?: boolean;
  includeAIConfigs?: boolean;
  includeAIHistory?: boolean;
  includeSettings?: boolean;
  includeHistory?: boolean;
  compression?: boolean;
  encryption?: boolean;
}

/**
 * 导入选项
 */
export interface ImportOptions {
  format: 'json' | 'csv';
  replaceExisting?: boolean;
  skipDuplicates?: boolean;
  createCategories?: boolean;
  overwrite?: boolean;
  mergeStrategy?: 'skip' | 'replace' | 'merge';
  backupBeforeImport?: boolean;
}

/**
 * 导入结果 - 扩展 BaseResponse
 */
export interface ImportResult extends BaseResponse {
  totalImported?: number;
  totalErrors?: number;
  details?: Record<string, number>;
  imported?: {
    categories: number;
    prompts: number;
    settings: number;
    history: number;
    aiConfigs?: number;
    users?: number;
    posts?: number;
  };
  errors?: string[];
  warnings?: string[];
  skipped?: number;
  backupId?: string;
}

/**
 * 导出结果 - 扩展 BaseResponse
 */
export interface ExportResult extends BaseResponse {
  filePath?: string;
  size?: number;
  recordCount?: number;
  format?: string;
  compressed?: boolean;
  encrypted?: boolean;
  data?: {
    categories: any[];
    prompts: any[];
    aiConfigs: any[];
    aiHistory: any[];
    settings: any[];
  };
}

/**
 * 数据统计信息
 */
export interface DataStats {
  categories: number;
  prompts: number;
  history: number;
  aiConfigs: number;
  settings: number;
  posts: number;
  users: number;
  totalRecords: number;
  totalSize?: number;
  lastModified?: string;
  oldestRecord?: string;
  newestRecord?: string;
}

/**
 * 数据验证结果 - 扩展通用的验证类型
 */
export interface DataValidationResult extends ValidationResult {
  stats?: DataStats;
  missingReferences?: {
    type: string;
    missingIds: string[];
  }[];
  duplicates?: {
    type: string;
    duplicateIds: string[];
  }[];
}

/**
 * 数据迁移选项
 */
export interface DataMigrationOptions {
  fromVersion: string;
  toVersion: string;
  backupBeforeMigration: boolean;
  validateAfterMigration: boolean;
  dryRun?: boolean;
}

/**
 * 数据迁移结果 - 扩展 BaseResponse
 */
export interface DataMigrationResult extends BaseResponse {
  fromVersion: string;
  toVersion: string;
  migratedRecords: number;
  backupId?: string;
  validationResult?: DataValidationResult;
  duration?: number;
}

/**
 * 数据清理选项
 */
export interface DataCleanupOptions {
  removeOrphanedRecords: boolean;
  removeDuplicates: boolean;
  removeEmptyCategories: boolean;
  removeOldHistory: boolean;
  historyRetentionDays?: number;
  dryRun?: boolean;
}

/**
 * 数据清理结果 - 扩展 BaseResponse
 */
export interface DataCleanupResult extends BaseResponse {
  cleanedRecords: {
    orphaned: number;
    duplicates: number;
    emptyCategories: number;
    oldHistory: number;
  };
  freedSpace?: number;
  duration?: number;
}

/**
 * 数据同步状态
 */
export interface DataSyncStatus {
  lastSync?: Date;
  nextSync?: Date;
  inProgress: boolean;
  error?: string;
  syncedRecords?: number;
  totalRecords?: number;
  conflicts?: number;
}

/**
 * 数据修复选项
 */
export interface DataRepairOptions {
  fixMissingUUIDs: boolean;
  fixBrokenReferences: boolean;
  fixDuplicateUUIDs: boolean;
  fixCorruptedData: boolean;
  createBackup: boolean;
  dryRun?: boolean;
}

/**
 * 数据修复结果 - 扩展 BaseResponse
 */
export interface DataRepairResult extends BaseResponse {
  repaired: {
    missingUUIDs: number;
    brokenReferences: number;
    duplicateUUIDs: number;
    corruptedData: number;
  };
  backupId?: string;
  duration?: number;
}
