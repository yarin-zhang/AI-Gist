/**
 * 数据管理 Composable（极简 Electron 依赖版）
 * 所有复杂逻辑前端实现，主进程只做文件操作
 */

import { ref, computed, readonly } from 'vue';
import { databaseServiceManager } from '@/lib/services';
import type {
  BackupInfo,
  ExportOptions,
  DataStats,
  ExportResult,
  ImportResult
} from '@shared/types/data-management';

export interface UseDataManagementOptions {
  autoRefresh?: boolean;
  refreshInterval?: number;
}

export function useDataManagement(options: UseDataManagementOptions = {}) {
  const {
    autoRefresh = false,
    refreshInterval = 30000
  } = options;

  // 状态
  const loading = ref({
    backup: false,
    restore: false,
    export: false,
    import: false,
    healthCheck: false,
    repair: false,
    clearDatabase: false,
    refreshBackupList: false
  });
  const backupList = ref<BackupInfo[]>([]);
  const dataStats = ref<DataStats>({
    categories: 0,
    prompts: 0,
    history: 0,
    aiConfigs: 0,
    settings: 0,
    posts: 0,
    users: 0,
    totalRecords: 0
  });
  const error = ref<string | null>(null);
  const success = ref<string | null>(null);

  // 分页
  const currentPage = ref(1);
  const pageSize = ref(6);
  const totalItems = computed(() => backupList.value.length);
  const totalPages = computed(() => Math.ceil(totalItems.value / pageSize.value));
  const paginatedBackups = computed(() => {
    const start = (currentPage.value - 1) * pageSize.value;
    const end = start + pageSize.value;
    return backupList.value.slice(start, end);
  });

  // 清除消息
  const clearMessages = () => {
    error.value = null;
    success.value = null;
  };
  const setLoading = (key: keyof typeof loading.value, value: boolean) => {
    loading.value[key] = value;
  };

  // 获取备份列表
  const getBackupList = async (): Promise<BackupInfo[]> => {
    try {
      setLoading('refreshBackupList', true);
      clearMessages();
      const result = await window.electronAPI?.invoke('data:get-backup-list');
      if (result && Array.isArray(result)) {
        backupList.value = result;
        return result;
      } else {
        throw new Error('获取备份列表失败');
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : '获取备份列表失败';
      return [];
    } finally {
      setLoading('refreshBackupList', false);
    }
  };

  // 创建备份（前端导出数据，主进程写入）
  const createBackup = async (description?: string): Promise<BackupInfo | null> => {
    try {
      setLoading('backup', true);
      clearMessages();
      // 1. 前端导出所有数据
      const data = await databaseServiceManager.exportAllData();
      // 2. 传给主进程写入
      const result = await window.electronAPI?.invoke('data:create-backup', { description, data });
      if (result && result.id) {
        success.value = '备份创建成功';
        await getBackupList();
        return result;
      } else {
        throw new Error('创建备份失败');
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : '创建备份失败';
      return null;
    } finally {
      setLoading('backup', false);
    }
  };

  // 恢复备份（前端读取备份，前端恢复）
  const restoreBackup = async (backupId: string): Promise<boolean> => {
    try {
      setLoading('restore', true);
      clearMessages();
      // 1. 读取备份内容
      const backup: BackupInfo = await window.electronAPI?.invoke('data:read-backup', { backupId });
      if (!backup || !backup.data) throw new Error('备份数据无效');
      // 2. 恢复到数据库
      const result = await databaseServiceManager.replaceAllData(backup.data);
      if (result.success) {
        success.value = '备份恢复成功';
        return true;
      } else {
        throw new Error(result.message || '恢复失败');
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : '恢复备份失败';
      return false;
    } finally {
      setLoading('restore', false);
    }
  };

  // 删除备份
  const deleteBackup = async (backupId: string): Promise<boolean> => {
    try {
      setLoading('backup', true);
      clearMessages();
      const result = await window.electronAPI?.invoke('data:delete-backup', { backupId });
      if (result && result.success) {
        success.value = '备份删除成功';
        await getBackupList();
        return true;
      } else {
        throw new Error('删除备份失败');
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : '删除备份失败';
      return false;
    } finally {
      setLoading('backup', false);
    }
  };

  // 获取数据统计
  const getDataStats = async (): Promise<DataStats | null> => {
    try {
      clearMessages();
      const result = await window.electronAPI?.invoke('data:get-stats');
      if (result) {
        dataStats.value = result;
        return result;
      } else {
        throw new Error('获取数据统计失败');
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : '获取数据统计失败';
      return null;
    }
  };

  // 检查数据库健康状态
  const checkDatabaseHealth = async (): Promise<boolean> => {
    try {
      setLoading('healthCheck', true);
      clearMessages();
      const result = await databaseServiceManager.checkAndRepairDatabase();
      if (result.healthy) {
        success.value = result.message || '数据库状态良好';
        return true;
      } else {
        error.value = result.message || '数据库状态异常';
        return false;
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : '检查数据库健康状态失败';
      return false;
    } finally {
      setLoading('healthCheck', false);
    }
  };

  // 修复数据库
  const repairDatabase = async (): Promise<boolean> => {
    try {
      setLoading('repair', true);
      clearMessages();
      const result = await databaseServiceManager.repairDatabase();
      if (result.success) {
        success.value = result.message || '数据库修复成功';
        return true;
      } else {
        error.value = result.message || '数据库修复失败';
        return false;
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : '修复数据库失败';
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
      await databaseServiceManager.forceCleanAllTables();
      success.value = '数据库已清空';
      return true;
    } catch (err) {
      error.value = err instanceof Error ? err.message : '清空数据库失败';
      return false;
    } finally {
      setLoading('clearDatabase', false);
    }
  };

  // 数据导入（选择文件、读取、导入数据库）
  const importData = async (format: 'json' | 'csv'): Promise<ImportResult | null> => {
    try {
      setLoading('import', true);
      clearMessages();
      // 1. 选择文件
      const filePath = await window.electronAPI?.invoke('data:select-import-file', { format });
      if (!filePath) throw new Error('未选择文件');
      // 2. 读取内容
      const content = await window.electronAPI?.invoke('fs:read-file', { filePath });
      const data = format === 'csv' ? parseCSV(content) : JSON.parse(content);
      // 3. 导入数据库
      const result = await databaseServiceManager.importData(data);
      if (result.success) {
        success.value = '导入成功';
        return result;
      } else {
        throw new Error(result.message || '导入失败');
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : '导入失败';
      return null;
    } finally {
      setLoading('import', false);
    }
  };

  // 数据导出（前端导出、选择路径、写入文件）
  const exportData = async (options: ExportOptions): Promise<ExportResult | null> => {
    try {
      setLoading('export', true);
      clearMessages();
      // 1. 前端导出数据
      const data = await databaseServiceManager.exportAllData();
      // 2. 过滤/格式化
      let exportContent: string;
      if (options.format === 'json') {
        exportContent = JSON.stringify(data, null, 2);
      } else {
        exportContent = convertToCSV(data);
      }
      // 3. 选择路径
      const defaultName = `AI-Gist-导出-${new Date().toISOString().replace(/[:.]/g, '-')}.${options.format}`;
      const filePath = await window.electronAPI?.invoke('data:select-export-path', { defaultName });
      if (!filePath) throw new Error('未选择导出路径');
      // 4. 写入
      await window.electronAPI?.invoke('fs:write-file', { filePath, content: exportContent });
      success.value = '导出成功';
      return { success: true, filePath };
    } catch (err) {
      error.value = err instanceof Error ? err.message : '导出失败';
      return null;
    } finally {
      setLoading('export', false);
    }
  };

  // 打开备份目录
  const openBackupDirectory = async (): Promise<boolean> => {
    try {
      clearMessages();
      const result = await window.electronAPI?.invoke('data:get-backup-directory');
      if (result && result.success) {
        await window.electronAPI?.invoke('shell:open-external', result.path);
        return true;
      } else {
        throw new Error('获取备份目录失败');
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : '打开备份目录失败';
      return false;
    }
  };

  // CSV 转换（简单实现）
  function convertToCSV(data: any): string {
    let csv = '';
    if (data.categories && data.categories.length > 0) {
      csv += '--- 分类数据 ---\n';
      csv += 'ID,名称,描述,创建时间\n';
      data.categories.forEach((cat: any) => {
        csv += `${cat.id},"${cat.name}","${cat.description || ''}","${cat.createdAt}"\n`;
      });
      csv += '\n';
    }
    if (data.prompts && data.prompts.length > 0) {
      csv += '--- 提示词数据 ---\n';
      csv += 'ID,标题,内容,分类ID,标签,创建时间\n';
      data.prompts.forEach((prompt: any) => {
        csv += `${prompt.id},"${prompt.title}","${prompt.content}","${prompt.categoryId}","${normalizeTags(prompt.tags)}","${prompt.createdAt}"\n`;
      });
      csv += '\n';
    }
    if (data.history && data.history.length > 0) {
      csv += '--- 历史数据 ---\n';
      csv += 'ID,提示词ID,输入,输出,时间戳\n';
      data.history.forEach((hist: any) => {
        csv += `${hist.id},"${hist.promptId}","${hist.input}","${hist.output}","${hist.timestamp}"\n`;
      });
    }
    return csv;
  }
  function normalizeTags(tags: any, separator = ';'): string {
    if (!tags) return '';
    if (Array.isArray(tags)) {
      return tags.join(separator);
    } else if (typeof tags === 'string') {
      return tags.split(',').map((tag: string) => tag.trim()).filter((tag: string) => tag).join(separator);
    }
    return '';
  }
  function parseCSV(content: string): any {
    // 简单实现，实际可用 csv-parse 等库
    return { categories: [], prompts: [], settings: {}, history: [] };
  }

  // 初始化
  const initialize = async () => {
    try {
      await getBackupList();
      await getDataStats();
    } catch (err) {
      // 忽略
    }
  };

  // 自动刷新
  let refreshTimer: NodeJS.Timeout | null = null;
  const startAutoRefresh = () => {
    if (autoRefresh && !refreshTimer) {
      refreshTimer = setInterval(async () => {
        await getBackupList();
        await getDataStats();
      }, refreshInterval);
    }
  };
  const stopAutoRefresh = () => {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  };
  if (autoRefresh) startAutoRefresh();

  return {
    loading: readonly(loading),
    backupList: readonly(backupList),
    dataStats: readonly(dataStats),
    // 新增可写ref
    _backupList: backupList,
    _dataStats: dataStats,
    error: readonly(error),
    success: readonly(success),
    currentPage,
    pageSize,
    totalItems,
    totalPages,
    paginatedBackups,
    clearMessages,
    getBackupList,
    createBackup,
    restoreBackup,
    deleteBackup,
    getDataStats,
    checkDatabaseHealth,
    repairDatabase,
    clearDatabase,
    importData,
    exportData,
    openBackupDirectory,
    initialize,
    startAutoRefresh,
    stopAutoRefresh
  };
} 