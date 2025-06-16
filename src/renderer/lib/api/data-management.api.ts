import { ipcInvoke } from '../ipc';

export interface BackupInfo {
    id: string;
    name: string;
    size: number;
    createdAt: string;
    description?: string;
}

export interface ExportOptions {
    format: 'json' | 'csv';
    includeCategories?: boolean;
    includePrompts?: boolean;
    includeSettings?: boolean;
    includeHistory?: boolean;
}

export interface ImportOptions {
    format: 'json' | 'csv';
    overwrite?: boolean;
    mergeStrategy?: 'skip' | 'replace' | 'merge';
}

export interface ImportResult {
    success: boolean;
    message: string;
    imported: {
        categories: number;
        prompts: number;
        settings: number;
        history: number;
    };
    errors: string[];
}

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
     * 获取数据统计信息
     */
    static async getDataStats(): Promise<{
        categories: number;
        prompts: number;
        history: number;
        totalSize: number;
        lastBackupTime: string | null;
    }> {
        try {
            return await ipcInvoke('data:get-stats');
        } catch (error) {
            console.error('获取数据统计失败:', error);
            throw error;
        }
    }
}
