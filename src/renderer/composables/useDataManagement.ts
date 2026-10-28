/**
 * 数据管理 Composable（完全前端实现）
 * 所有逻辑都在渲染进程内完成，只在必要时调用主进程文件操作
 */

import { ref, reactive, toRef } from 'vue';
import i18n from '@renderer/i18n';
import { DataManagementAPI, type FullBackupImportOptions } from '@renderer/lib/api/data-management.api';
import { useDatabase } from './useDatabase';
import { databaseService } from '@renderer/lib/db';
import {
  localBackupService,
  type LocalBackupInfo
} from '@renderer/lib/services/local-backup.service';

export type BackupInfo = LocalBackupInfo;

// 提示会直接显示在设置页上，必须跟随界面语言
const tr = (key: string, named?: Record<string, unknown>) =>
  (i18n.global.t as (key: string, named?: Record<string, unknown>) => string)(key, named ?? {});

export interface DataManagementState {
  backupList: BackupInfo[];
  loading: Record<string, boolean>;
  error: string | null;
  success: string | null;
}

export function useDataManagement() {
  const { safeDbOperation } = useDatabase();
  
  // 状态管理
  const backupList = ref<BackupInfo[]>([]);
  const loading = ref<Record<string, boolean>>({});
  const error = ref<string | null>(null);
  const success = ref<string | null>(null);

  // 设置加载状态
  const setLoading = (key: string, value: boolean) => {
    loading.value[key] = value;
  };

  // 清除消息
  const clearMessages = () => {
    error.value = null;
    success.value = null;
  };

  // 获取本地备份列表。
  // 只有用户点「刷新备份列表」时才让按钮进入加载态；挂载和创建/恢复后的静默刷新
  // 通常几毫秒就结束，切换加载态只会让按钮图标淡出又淡入，看起来像图标空白 (#389)。
  const getBackupList = async (options: { showLoading?: boolean } = {}): Promise<BackupInfo[]> => {
    const { showLoading = false } = options;
    try {
      if (showLoading) setLoading('refreshBackupList', true);
      clearMessages();
      const backups = await localBackupService.list();
      backupList.value = [...backups];
      return backups;
    } catch (err) {
      console.error('获取备份列表失败:', err);
      error.value = err instanceof Error ? err.message : tr('settingsMessages.getBackupListFailed');
      return [];
    } finally {
      if (showLoading) setLoading('refreshBackupList', false);
    }
  };

  // 创建本地备份；内容未变化时复用最新版本。
  const createBackup = async (description?: string): Promise<BackupInfo | null> => {
    try {
      setLoading('backup', true);
      clearMessages();
      const result = await localBackupService.create({
        description,
        backupType: 'manual',
        trigger: 'manual'
      });
      await getBackupList();
      success.value = result.action === 'unchanged' ? tr('dataManagement.messages.backupUnchanged') : tr('dataManagement.messages.backupCreated');
      return result.backup;
    } catch (err) {
      console.error('创建备份失败:', err);
      error.value = err instanceof Error ? err.message : tr('settingsMessages.backupCreatedFailed');
      return null;
    } finally {
      setLoading('backup', false);
    }
  };

  // 恢复本地备份
  const restoreBackup = async (backupId: string): Promise<boolean> => {
    try {
      setLoading('restore', true);
      clearMessages();
      await localBackupService.restore(backupId);
      success.value = tr('dataManagement.messages.backupRestored');
      return true;
    } catch (err) {
      error.value = err instanceof Error ? err.message : tr('dataManagement.messages.backupRestoreFailed');
      return false;
    } finally {
      setLoading('restore', false);
    }
  };

  // 删除本地备份
  const deleteBackup = async (backupId: string): Promise<boolean> => {
    try {
      setLoading('backup', true);
      clearMessages();
      await localBackupService.delete(backupId);
      await getBackupList();
      success.value = tr('settingsMessages.backupDeleteSuccess');
      return true;
    } catch (err) {
      error.value = err instanceof Error ? err.message : tr('settingsMessages.backupDeleteFailed');
      return false;
    } finally {
      setLoading('backup', false);
    }
  };

  // 打开备份目录
  const openBackupDirectory = async (): Promise<void> => {
    try {
      await localBackupService.openDirectory();
    } catch (err) {
      error.value = err instanceof Error ? err.message : tr('dataManagement.messages.openDirectoryFailed');
    }
  };

  // 完整备份导出
  const exportFullBackup = async (): Promise<boolean> => {
    try {
      setLoading('export', true);
      clearMessages();

      const result = await DataManagementAPI.exportFullBackup();
      if (result.success) {
        success.value = tr('settingsMessages.fullBackupExportSuccess');
        return true;
      }
      // 在保存对话框里点了取消，不算失败
      if (result.cancelled) return false;

      error.value = result.message || tr('settingsMessages.fullBackupExportFailed');
      return false;
    } catch (err) {
      error.value = err instanceof Error ? err.message : tr('settingsMessages.fullBackupExportFailed');
      return false;
    } finally {
      setLoading('export', false);
    }
  };

  // 完整备份导入：会替换本机全部数据，先由界面确认，确认后先做一份导入前备份，备份失败就不导入
  const importFullBackup = async (approve?: FullBackupImportOptions['approve']): Promise<boolean> => {
    try {
      setLoading('import', true);
      clearMessages();

      const result = await DataManagementAPI.importFullBackup({
        approve,
        beforeReplace: () => localBackupService.createSafetyBackup('import'),
      });
      if (result.success) {
        await getBackupList();
        success.value = tr('settingsMessages.fullBackupImportSuccess');
        return true;
      }
      if (result.cancelled) return false;

      error.value = result.message || tr('settingsMessages.fullBackupImportFailed');
      return false;
    } catch (err) {
      error.value = err instanceof Error ? err.message : tr('settingsMessages.fullBackupImportFailed');
      return false;
    } finally {
      setLoading('import', false);
    }
  };

  // 选择性数据导出
  const exportSelectedData = async (format: 'csv' | 'json', options: any): Promise<boolean> => {
    try {
      setLoading('export', true);
      clearMessages();
      
      // 1. 从数据库获取选定数据
      const result = await safeDbOperation(() => databaseService.exportAllData());
      if (!result || !result.success) {
        throw new Error(tr('dataManagement.messages.exportDataFailed'));
      }
      
      // 2. 根据选项过滤数据
      const filteredData: any = {};
      
      if (options.includeCategories) {
        filteredData.categories = result.data?.categories || [];
      }
      
      if (options.includePrompts) {
        filteredData.prompts = result.data?.prompts || [];
      }
      
      if (options.includeAIConfigs) {
        filteredData.aiConfigs = result.data?.aiConfigs || [];
      }
      
      // 3. 选择导出路径
      const timestamp = new Date().toISOString().split('T')[0];
      const defaultName = `ai-gist-selected-${timestamp}.${format}`;
      const filePath = await DataManagementAPI.selectExportPath(defaultName);
      
      if (!filePath) {
        error.value = tr('dataManagement.messages.noExportPath');
        return false;
      }
      
      // 4. 导出数据
      const exportSuccess = await DataManagementAPI.exportDataToFile(filteredData, filePath, format, {
        categories: result.data?.categories
      });
      
      if (exportSuccess) {
        success.value = tr('dataManagement.messages.selectiveExportSuccess');
        return true;
      } else {
        error.value = tr('dataManagement.messages.selectiveExportFailed');
        return false;
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : tr('dataManagement.messages.selectiveExportFailed');
      return false;
    } finally {
      setLoading('export', false);
    }
  };

  // 获取数据统计信息
  const getDataStatistics = async (): Promise<any> => {
    try {
      const result = await safeDbOperation(() => databaseService.getDataStats());
      return result || { categories: 0, prompts: 0, aiConfigs: 0, aiHistory: 0, settings: 0 };
    } catch (err) {
      console.error('获取数据统计失败:', err);
      return { categories: 0, prompts: 0, aiConfigs: 0, aiHistory: 0, settings: 0 };
    }
  };

  // 数据库健康检查
  const checkDatabaseHealth = async (): Promise<any> => {
    try {
      setLoading('healthCheck', true);
      clearMessages();
      
      const result = await safeDbOperation(() => databaseService.getHealthStatus());
      
      if (result && result.healthy) {
        success.value = tr('dataManagement.messages.healthCheckPassed');
      } else {
        error.value = tr('dataManagement.messages.healthCheckIssues', {
          stores: result?.missingStores?.join(', ') || tr('dataManagement.messages.unknownIssue')
        });
      }
      
      return result;
    } catch (err) {
      error.value = err instanceof Error ? err.message : tr('settingsMessages.databaseHealthCheckFailed');
      return { healthy: false, missingStores: [tr('dataManagement.messages.checkFailed')] };
    } finally {
      setLoading('healthCheck', false);
    }
  };

  // 修复数据库
  const repairDatabase = async (): Promise<boolean> => {
    try {
      setLoading('repair', true);
      clearMessages();
      
      const result = await safeDbOperation(() => databaseService.repairDatabase());
      
      if (result && result.success) {
        success.value = tr('dataManagement.messages.repairSuccess');
        return true;
      } else {
        error.value = result?.message || tr('dataManagement.messages.repairFailed');
        return false;
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : tr('dataManagement.messages.repairFailed');
      return false;
    } finally {
      setLoading('repair', false);
    }
  };

  // 清空数据库
  const clearDatabase = async (): Promise<boolean> => {
    try {
      setLoading('clearDatabase', true);
      clearMessages();
      
      // 清空前先备份当前数据（界面承诺「先自动备份，再删除」），备份失败就不清空
      await localBackupService.createSafetyBackup('clear');

      // 清空所有表
      await safeDbOperation(() => databaseService.forceCleanAllTables());
      
      // 本地备份存在独立的库里，清空数据不会删掉它们（包括刚做的保护性备份），刷新一下列表
      await getBackupList();
      
      success.value = tr('settingsMessages.databaseCleared');
      return true;
    } catch (err) {
      error.value = err instanceof Error ? err.message : tr('settingsMessages.databaseClearFailed');
      return false;
    } finally {
      setLoading('clearDatabase', false);
    }
  };

  return {
    // 状态
    backupList,
    loading,
    error,
    success,
    
    // 备份管理
    getBackupList,
    createBackup,
    restoreBackup,
    deleteBackup,
    openBackupDirectory,
    
    // 完整备份管理
    exportFullBackup,
    importFullBackup,
    
    // 选择性数据导出
    exportSelectedData,
    getDataStatistics,
    
    // 数据库管理
    checkDatabaseHealth,
    repairDatabase,
    clearDatabase,
    
    // 工具方法
    setLoading,
    clearMessages
  };
}
