/**
 * 数据管理 Composable（完全前端实现）
 * 所有逻辑都在渲染进程内完成，只在必要时调用主进程文件操作
 */

import { ref, reactive, toRef } from 'vue';
import { DataManagementAPI } from '@renderer/lib/api/data-management.api';
import { useDatabase } from './useDatabase';
import { databaseService } from '@renderer/lib/db';
import {
  localBackupService,
  type LocalBackupInfo
} from '@renderer/lib/services/local-backup.service';

export type BackupInfo = LocalBackupInfo;

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

  // 获取本地备份列表
  const getBackupList = async (): Promise<BackupInfo[]> => {
    try {
      setLoading('refreshBackupList', true);
      clearMessages();
      const backups = await localBackupService.list();
      backupList.value = [...backups];
      return backups;
    } catch (err) {
      console.error('获取备份列表失败:', err);
      error.value = err instanceof Error ? err.message : '获取备份列表失败';
      return [];
    } finally {
      setLoading('refreshBackupList', false);
    }
  };

  // 创建本地备份；内容未变化时复用最新版本。
  const createBackup = async (description?: string): Promise<BackupInfo | null> => {
    try {
      setLoading('backup', true);
      clearMessages();
      const result = await localBackupService.create({
        description: description || '手动本地备份',
        backupType: 'manual',
        trigger: 'manual'
      });
      await getBackupList();
      success.value = result.action === 'unchanged' ? '数据未变化，已保留现有备份' : '备份创建成功';
      return result.backup;
    } catch (err) {
      console.error('创建备份失败:', err);
      error.value = err instanceof Error ? err.message : '创建备份失败';
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
      success.value = '备份恢复成功';
      return true;
    } catch (err) {
      error.value = err instanceof Error ? err.message : '恢复备份失败';
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
      success.value = '备份删除成功';
      return true;
    } catch (err) {
      error.value = err instanceof Error ? err.message : '删除备份失败';
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
      error.value = err instanceof Error ? err.message : '无法打开备份目录';
    }
  };

  // 完整备份导出
  const exportFullBackup = async (): Promise<boolean> => {
    try {
      setLoading('export', true);
      clearMessages();

      const result = await DataManagementAPI.exportFullBackup();
      if (result.success) {
        success.value = '完整备份导出成功';
        return true;
      }

      error.value = result.message || '完整备份导出失败';
      return false;
    } catch (err) {
      error.value = err instanceof Error ? err.message : '完整备份导出失败';
      return false;
    } finally {
      setLoading('export', false);
    }
  };

  // 完整备份导入
  const importFullBackup = async (): Promise<boolean> => {
    try {
      setLoading('import', true);
      clearMessages();

      const result = await DataManagementAPI.importFullBackup();
      if (result.success) {
        success.value = '完整备份导入成功';
        return true;
      }

      error.value = result.message || '完整备份导入失败';
      return false;
    } catch (err) {
      error.value = err instanceof Error ? err.message : '完整备份导入失败';
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
        throw new Error('导出数据失败');
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
        error.value = '未选择导出路径';
        return false;
      }
      
      // 4. 导出数据
      const exportSuccess = await DataManagementAPI.exportDataToFile(filteredData, filePath, format);
      
      if (exportSuccess) {
        success.value = '选择性数据导出成功';
        return true;
      } else {
        error.value = '选择性数据导出失败';
        return false;
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : '选择性数据导出失败';
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
        success.value = '数据库健康检查通过';
      } else {
        error.value = `数据库存在问题: ${result?.missingStores?.join(', ') || '未知问题'}`;
      }
      
      return result;
    } catch (err) {
      error.value = err instanceof Error ? err.message : '数据库健康检查失败';
      return { healthy: false, missingStores: ['检查失败'] };
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
        success.value = '数据库修复成功';
        return true;
      } else {
        error.value = result?.message || '数据库修复失败';
        return false;
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : '数据库修复失败';
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
      
      // 清空所有表
      await safeDbOperation(() => databaseService.forceCleanAllTables());
      
      // 清空备份列表
      backupList.value = [];
      localStorage.removeItem('ai-gist-backups');
      
      success.value = '数据库清空成功';
      return true;
    } catch (err) {
      error.value = err instanceof Error ? err.message : '数据库清空失败';
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
