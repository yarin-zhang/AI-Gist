/**
 * 数据管理 Composable（完全前端实现）
 * 所有逻辑都在渲染进程内完成，只在必要时调用主进程文件操作
 */

import { ref, reactive, toRef } from 'vue';
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

  // 获取备份列表 - 从文件系统读取
  const getBackupList = async (): Promise<BackupInfo[]> => {
    try {
      setLoading('refreshBackupList', true);
      clearMessages();
      
      console.log('开始获取备份列表...');
      
      // 获取备份目录路径
      const userDataPath = await window.electronAPI.app.getPath('userData');
      const backupDir = `${userDataPath}/backups`;
      console.log('备份目录路径:', backupDir);
      
      // 确保备份目录存在
      await window.electronAPI.fs.ensureDir(backupDir);
      console.log('备份目录已确保存在');
      
      // 读取备份目录中的所有文件
      const files = await window.electronAPI.fs.readdir(backupDir);
      console.log('目录中的所有文件:', files);
      
      const backupFiles = files.filter(file => file.endsWith('.json'));
      console.log('备份文件列表:', backupFiles);
      
      const backups: BackupInfo[] = [];
      
      for (const file of backupFiles) {
        try {
          const filePath = `${backupDir}/${file}`;
          console.log('正在读取备份文件:', filePath);
          
          const content = await window.electronAPI.fs.readFile(filePath);
          const backupData = JSON.parse(content);
          
          // 获取文件状态
          const fileStats = await window.electronAPI.fs.stat(filePath);
          
          const backupInfo: BackupInfo = {
            id: backupData.id,
            name: backupData.name,
            description: backupData.description || '自动备份',
            createdAt: backupData.createdAt,
            size: fileStats.size,
            data: backupData.data
          };
          
          console.log('成功读取备份:', backupInfo);
          backups.push(backupInfo);
        } catch (err) {
          console.warn(`读取备份文件失败: ${file}`, err);
        }
      }
      
      // 按创建时间排序，最新的在前面
      backups.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      
      console.log('最终备份列表:', backups);
      // 强制触发响应式更新
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

  // 创建备份 - 调用 Electron 文件系统功能
  const createBackup = async (description?: string): Promise<BackupInfo | null> => {
    try {
      setLoading('backup', true);
      clearMessages();
      
      console.log('开始创建备份...');
      
      // 1. 导出所有数据
      const result = await safeDbOperation(() => databaseService.exportAllData());
      if (!result || !result.success) {
        throw new Error('导出数据失败');
      }
      
      console.log('数据导出成功，开始创建备份文件...');
      
      // 2. 创建备份信息
      const backupId = crypto.randomUUID();
      const timestamp = new Date().toISOString();
      const backupName = `backup-${timestamp.split('T')[0]}-${backupId.substring(0, 8)}`;
      
      // 3. 获取备份目录路径
      const userDataPath = await window.electronAPI.app.getPath('userData');
      const backupDir = `${userDataPath}/backups`;
      console.log('备份目录路径:', backupDir);
      
      // 4. 确保备份目录存在
      await window.electronAPI.fs.ensureDir(backupDir);
      console.log('备份目录已确保存在');
      
      // 5. 保存备份文件
      const backupFilePath = `${backupDir}/${backupName}.json`;
      const backupData = {
        id: backupId,
        name: backupName,
        description: description || '自动备份',
        createdAt: timestamp,
        version: '1.0',
        data: result.data
      };
      
      console.log('正在写入备份文件:', backupFilePath);
      const writeResult = await window.electronAPI.fs.writeFile(
        backupFilePath, 
        JSON.stringify(backupData, null, 2)
      );
      
      if (!writeResult.success) {
        throw new Error('备份文件写入失败');
      }
      
      console.log('备份文件写入成功');
      
      // 6. 获取文件大小
      const fileStats = await window.electronAPI.fs.stat(backupFilePath);
      console.log('备份文件大小:', fileStats.size);
      
      const backupInfo: BackupInfo = {
        id: backupId,
        name: backupName,
        description: description || '自动备份',
        createdAt: timestamp,
        size: fileStats.size,
        data: result.data,
      };

      // 7. 刷新备份列表
      console.log('刷新备份列表...');
      await getBackupList();

      success.value = '备份创建成功';
      console.log('备份创建完成');
      return backupInfo;
    } catch (err) {
      console.error('创建备份失败:', err);
      error.value = err instanceof Error ? err.message : '创建备份失败';
      return null;
    } finally {
      setLoading('backup', false);
    }
  };

  // 恢复备份 - 从文件系统读取备份数据
  const restoreBackup = async (backupId: string): Promise<boolean> => {
    try {
      setLoading('restore', true);
      clearMessages();
      
      // 1. 查找备份
      const backup = backupList.value.find(b => b.id === backupId);
      if (!backup) {
        throw new Error('备份不存在');
      }

      // 2. 从文件系统读取备份数据
      const userDataPath = await window.electronAPI.app.getPath('userData');
      const backupDir = `${userDataPath}/backups`;
      const backupFileName = `${backup.name}.json`;
      const backupFilePath = `${backupDir}/${backupFileName}`;
      
      const backupContent = await window.electronAPI.fs.readFile(backupFilePath);
      const backupData = JSON.parse(backupContent);
      
      if (!backupData.data) {
        throw new Error('备份数据无效');
      }

      // 3. 恢复到数据库
      const result = await safeDbOperation(() => databaseService.replaceAllData(backupData.data));
      if (result && result.success) {
        success.value = '备份恢复成功';
        return true;
      } else {
        throw new Error(result?.message || '恢复失败');
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : '恢复备份失败';
      return false;
    } finally {
      setLoading('restore', false);
    }
  };

  // 删除备份 - 从文件系统删除
  const deleteBackup = async (backupId: string): Promise<boolean> => {
    try {
      setLoading('backup', true);
      clearMessages();
      
      // 查找要删除的备份
      const backup = backupList.value.find(b => b.id === backupId);
      if (!backup) {
        throw new Error('备份不存在');
      }
      
      // 获取备份目录路径
      const userDataPath = await window.electronAPI.app.getPath('userData');
      const backupDir = `${userDataPath}/backups`;
      const backupFileName = `${backup.name}.json`;
      const backupFilePath = `${backupDir}/${backupFileName}`;
      
      // 删除文件
      const deleteResult = await window.electronAPI.fs.unlink(backupFilePath);
      
      if (!deleteResult.success) {
        throw new Error('删除备份文件失败');
      }
      
      // 刷新备份列表
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
      // 获取用户数据目录作为备份目录
      const userDataPath = await window.electronAPI.app.getPath('userData');
      const backupPath = `${userDataPath}/backups`;
      
      // 确保备份目录存在
      await window.electronAPI.fs.ensureDir(backupPath);
      
      // 打开备份目录
      await window.electronAPI.shell.openPath(backupPath);
    } catch (err) {
      error.value = '无法打开备份目录';
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
        error.value = '未选择导出路径';
        return false;
      }
      
      // 3. 导出数据
      const exportSuccess = await DataManagementAPI.exportDataToFile(result.data, filePath, 'json');
      
      if (exportSuccess) {
        success.value = '完整备份导出成功';
        return true;
      } else {
        error.value = '完整备份导出失败';
        return false;
      }
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
      
      // 1. 选择导入文件
      const filePath = await DataManagementAPI.selectImportFile('json');
      if (!filePath) {
        error.value = '未选择导入文件';
        return false;
      }
      
      // 2. 读取文件数据
      const data = await DataManagementAPI.importDataFromFile(filePath, 'json');
      if (!data) {
        error.value = '文件读取失败';
        return false;
      }
      
      // 3. 导入到数据库
      const result = await safeDbOperation(() => databaseService.replaceAllData(data));
      
      if (result && result.success) {
        success.value = '完整备份导入成功';
        return true;
      } else {
        error.value = result?.message || '完整备份导入失败';
        return false;
      }
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