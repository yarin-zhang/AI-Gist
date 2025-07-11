/**
 * 数据管理 Composable（完全前端实现）
 * 所有逻辑都在渲染进程内完成，只在必要时调用主进程文件操作
 */

import { ref, reactive } from 'vue';
import { DataManagementAPI } from '@renderer/lib/api/data-management.api';
import { useDatabase } from './useDatabase';
import { databaseService } from '@renderer/lib/db';

export interface BackupInfo {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  size: number;
  data?: any;
}

export interface DataManagementState {
  backupList: BackupInfo[];
  loading: Record<string, boolean>;
  error: string | null;
  success: string | null;
}

export function useDataManagement() {
  const { waitForDatabase, safeDbOperation } = useDatabase();
  
  // 状态管理
  const state = reactive<DataManagementState>({
    backupList: [],
    loading: {},
    error: null,
    success: null
  });

  // 设置加载状态
  const setLoading = (key: string, value: boolean) => {
    state.loading[key] = value;
  };

  // 清除消息
  const clearMessages = () => {
    state.error = null;
    state.success = null;
  };

  // 获取备份列表 - 从 localStorage 读取
  const getBackupList = async (): Promise<BackupInfo[]> => {
    try {
      setLoading('refreshBackupList', true);
      clearMessages();
      
      // 从 localStorage 读取备份列表
      const storedBackups = localStorage.getItem('ai-gist-backups');
      if (storedBackups) {
        const backups = JSON.parse(storedBackups);
        state.backupList = backups;
        return backups;
      } else {
        state.backupList = [];
        return [];
      }
    } catch (err) {
      state.error = err instanceof Error ? err.message : '获取备份列表失败';
      return [];
    } finally {
      setLoading('refreshBackupList', false);
    }
  };

  // 创建备份 - 完全在渲染进程内完成
  const createBackup = async (description?: string): Promise<BackupInfo | null> => {
    try {
      setLoading('backup', true);
      clearMessages();
      
      // 1. 导出所有数据
      const result = await safeDbOperation(() => databaseService.exportAllData());
      if (!result || !result.success) {
        throw new Error('导出数据失败');
      }
      
      // 2. 创建备份信息
      const backupId = crypto.randomUUID();
      const timestamp = new Date().toISOString();
      const backupName = `backup-${timestamp.split('T')[0]}-${backupId.substring(0, 8)}`;
      
      const backupInfo: BackupInfo = {
        id: backupId,
        name: backupName,
        description: description || '自动备份',
        createdAt: timestamp,
        size: JSON.stringify(result.data).length,
        data: result.data,
      };

      // 3. 保存到 localStorage
      const existingBackups = state.backupList;
      existingBackups.unshift(backupInfo);
      state.backupList = existingBackups;
      localStorage.setItem('ai-gist-backups', JSON.stringify(existingBackups));

      state.success = '备份创建成功';
      return backupInfo;
    } catch (err) {
      state.error = err instanceof Error ? err.message : '创建备份失败';
      return null;
    } finally {
      setLoading('backup', false);
    }
  };

  // 恢复备份 - 完全在渲染进程内完成
  const restoreBackup = async (backupId: string): Promise<boolean> => {
    try {
      setLoading('restore', true);
      clearMessages();
      
      // 1. 查找备份
      const backup = state.backupList.find(b => b.id === backupId);
      if (!backup || !backup.data) {
        throw new Error('备份数据无效');
      }

      // 2. 恢复到数据库
      const result = await safeDbOperation(() => databaseService.replaceAllData(backup.data));
      if (result && result.success) {
        state.success = '备份恢复成功';
        return true;
      } else {
        throw new Error(result?.message || '恢复失败');
      }
    } catch (err) {
      state.error = err instanceof Error ? err.message : '恢复备份失败';
      return false;
    } finally {
      setLoading('restore', false);
    }
  };

  // 删除备份 - 完全在渲染进程内完成
  const deleteBackup = async (backupId: string): Promise<boolean> => {
    try {
      setLoading('backup', true);
      clearMessages();
      
      // 从列表中移除
      const updatedBackups = state.backupList.filter(b => b.id !== backupId);
      state.backupList = updatedBackups;
      localStorage.setItem('ai-gist-backups', JSON.stringify(updatedBackups));
      
      state.success = '备份删除成功';
      return true;
    } catch (err) {
      state.error = err instanceof Error ? err.message : '删除备份失败';
      return false;
    } finally {
      setLoading('backup', false);
    }
  };

  // 打开备份目录
  const openBackupDirectory = async (): Promise<void> => {
    try {
      if (typeof window !== 'undefined' && window.electronAPI) {
        // 获取用户数据目录作为备份目录
        const userDataPath = await window.electronAPI.app.getPath('userData');
        const backupPath = `${userDataPath}/backups`;
        await window.electronAPI.shell.openPath(backupPath);
      }
    } catch (err) {
      state.error = '无法打开备份目录';
    }
  };

  // 完整备份导出
  const exportFullBackup = async (): Promise<boolean> => {
    try {
      setLoading('export', true);
      clearMessages();
      
      // 1. 从数据库获取所有数据
      const result = await safeDbOperation(() => databaseService.exportAllData());
      if (!result || !result.success) {
        throw new Error('导出数据失败');
      }
      
      // 2. 选择导出路径
      const timestamp = new Date().toISOString().split('T')[0];
      const defaultName = `ai-gist-full-backup-${timestamp}.json`;
      const filePath = await DataManagementAPI.selectExportPath(defaultName);
      
      if (!filePath) {
        state.error = '未选择导出路径';
        return false;
      }
      
      // 3. 导出数据
      const success = await DataManagementAPI.exportDataToFile(result.data, filePath, 'json');
      
      if (success) {
        state.success = '完整备份导出成功';
        return true;
      } else {
        state.error = '完整备份导出失败';
        return false;
      }
    } catch (err) {
      state.error = err instanceof Error ? err.message : '完整备份导出失败';
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
      
      // 1. 选择导入文件
      const filePath = await DataManagementAPI.selectImportFile('json');
      if (!filePath) {
        state.error = '未选择导入文件';
        return false;
      }
      
      // 2. 读取文件数据
      const data = await DataManagementAPI.importDataFromFile(filePath, 'json');
      if (!data) {
        state.error = '文件读取失败';
        return false;
      }
      
      // 3. 导入到数据库
      const result = await safeDbOperation(() => databaseService.replaceAllData(data));
      
      if (result && result.success) {
        state.success = '完整备份导入成功';
        return true;
      } else {
        state.error = result?.message || '完整备份导入失败';
        return false;
      }
    } catch (err) {
      state.error = err instanceof Error ? err.message : '完整备份导入失败';
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
      let filteredData: any = {};
      
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
        state.error = '未选择导出路径';
        return false;
      }
      
      // 4. 导出数据
      const success = await DataManagementAPI.exportDataToFile(filteredData, filePath, format);
      
      if (success) {
        state.success = '选择性数据导出成功';
        return true;
      } else {
        state.error = '选择性数据导出失败';
        return false;
      }
    } catch (err) {
      state.error = err instanceof Error ? err.message : '选择性数据导出失败';
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
        state.success = '数据库健康检查通过';
      } else {
        state.error = `数据库存在问题: ${result?.missingStores?.join(', ') || '未知问题'}`;
      }
      
      return result;
    } catch (err) {
      state.error = err instanceof Error ? err.message : '数据库健康检查失败';
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
        state.success = '数据库修复成功';
        return true;
      } else {
        state.error = result?.message || '数据库修复失败';
        return false;
      }
    } catch (err) {
      state.error = err instanceof Error ? err.message : '数据库修复失败';
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
      state.backupList = [];
      localStorage.removeItem('ai-gist-backups');
      
      state.success = '数据库清空成功';
      return true;
    } catch (err) {
      state.error = err instanceof Error ? err.message : '数据库清空失败';
      return false;
    } finally {
      setLoading('clearDatabase', false);
    }
  };

  return {
    // 状态
    backupList: state.backupList,
    loading: state.loading,
    error: state.error,
    success: state.success,
    
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