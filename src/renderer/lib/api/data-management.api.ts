import { ipcInvoke } from '../ipc';
import type { 
  BackupInfo, 
  ExportOptions, 
  ImportOptions, 
  ImportResult,
  ExportResult,
  DataStats 
} from '@shared/types/data-management';

/**
 * 数据管理 API
 */
export class DataManagementAPI {
    /**
     * 创建数据备份
     */
    static async createBackup(description?: string): Promise<BackupInfo> {
        try {
            return await ipcInvoke('data:create-backup', { description });
        } catch (error) {
            console.error('创建备份失败:', error);
            throw error;
        }
    }

    /**
     * 获取备份列表
     */
    static async getBackupList(): Promise<BackupInfo[]> {
        try {
            return await ipcInvoke('data:get-backup-list');
        } catch (error) {
            console.error('获取备份列表失败:', error);
            throw error;
        }
    }

    /**
     * 恢复备份
     */
    static async restoreBackup(backupId: string): Promise<{
        success: boolean;
        message: string;
    }> {
        try {
            return await ipcInvoke('data:restore-backup', { backupId });
        } catch (error) {
            console.error('恢复备份失败:', error);
            throw error;
        }
    }

    /**
     * 恢复备份（完全替换现有数据）
     */
    static async restoreBackupWithReplace(backupId: string): Promise<{
        success: boolean;
        message: string;
    }> {
        try {
            return await ipcInvoke('data:restore-backup-replace', { backupId });
        } catch (error) {
            console.error('恢复备份失败:', error);
            throw error;
        }
    }

    /**
     * 删除备份
     */
    static async deleteBackup(backupId: string): Promise<void> {
        try {
            await ipcInvoke('data:delete-backup', { backupId });
        } catch (error) {
            console.error('删除备份失败:', error);
            throw error;
        }
    }

    /**
     * 导出数据
     */
    static async exportData(options: ExportOptions, exportPath?: string): Promise<any> {
        try {
            return await ipcInvoke('data:export', { options, exportPath });
        } catch (error) {
            console.error('导出数据失败:', error);
            throw error;
        }
    }

    /**
     * 导入数据
     */
    static async importData(filePath: string, options: ImportOptions): Promise<ImportResult> {
        try {
            return await ipcInvoke('data:import', { filePath, options });
        } catch (error) {
            console.error('导入数据失败:', error);
            throw error;
        }
    }

    /**
     * 选择导入文件
     */
    static async selectImportFile(format: 'json' | 'csv'): Promise<string | null> {
        try {
            return await ipcInvoke('data:select-import-file', { format });
        } catch (error) {
            console.error('选择导入文件失败:', error);
            throw error;
        }
    }

    /**
     * 选择导出路径
     */
    static async selectExportPath(defaultName: string): Promise<string | null> {
        try {
            return await ipcInvoke('data:select-export-path', { defaultName });
        } catch (error) {
            console.error('选择导出路径失败:', error);
            throw error;
        }
    }

    /**
     * 选择性数据导出
     */
    static async exportSelectedData(options: ExportOptions, exportPath?: string): Promise<ExportResult> {
        try {
            return await ipcInvoke('data:export-selected', { options, exportPath });
        } catch (error) {
            console.error('选择性数据导出失败:', error);
            throw error;
        }
    }

    /**
     * 导出完整备份压缩包
     */
    static async exportFullBackup(): Promise<ExportResult> {
        try {
            return await ipcInvoke('data:export-full-backup');
        } catch (error) {
            console.error('完整备份导出失败:', error);
            throw error;
        }
    }

    /**
     * 导入完整备份压缩包
     */
    static async importFullBackup(): Promise<{
        success: boolean;
        message: string;
    }> {
        try {
            return await ipcInvoke('data:import-full-backup');
        } catch (error) {
            console.error('完整备份导入失败:', error);
            throw error;
        }
    }

    /**
     * 获取数据统计信息
     */
    static async getDataStats(): Promise<DataStats> {
        try {
            return await ipcInvoke('data:get-stats');
        } catch (error) {
            console.error('获取数据统计失败:', error);
            throw error;
        }
    }

    /**
     * 获取备份目录路径
     */
    static async getBackupDirectory(): Promise<{
        success: boolean;
        path?: string;
        error?: string;
        message?: string;
    }> {
        try {
            return await ipcInvoke('data:get-backup-directory');
        } catch (error) {
            console.error('获取备份目录路径失败:', error);
            throw error;
        }
    }
}
