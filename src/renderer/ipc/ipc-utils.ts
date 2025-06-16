/**
 * 纯 IPC 通信工具
 * 不依赖任何应用特定的逻辑，仅提供通用的 IPC 调用封装
 */

import type { IpcResult } from '../../shared/types/ipc.types';

export class IpcUtils {
  /**
   * 通用的 IPC 调用方法
   * @param channel IPC 通道名称
   * @param args 参数
   * @returns Promise<T>
   */
  static async invoke<T = any>(channel: string, ...args: any[]): Promise<T> {
    if (!window.electronAPI?.invoke) {
      throw new Error('Electron API 不可用');
    }
    
    try {
      const result = await window.electronAPI.invoke(channel, ...args);
      return result;
    } catch (error) {
      console.error(`IPC 调用失败 [${channel}]:`, error);
      throw error;
    }
  }
  
  /**
   * 安全的 IPC 调用方法，返回结构化结果
   * @param channel IPC 通道名称
   * @param args 参数
   * @returns Promise<IpcResult<T>>
   */
  static async safeInvoke<T = any>(channel: string, ...args: any[]): Promise<IpcResult<T>> {
    try {
      const result = await this.invoke<T>(channel, ...args);
      return {
        success: true,
        data: result
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
  
  /**
   * 检查 Electron API 是否可用
   */
  static isElectronAvailable(): boolean {
    return typeof window !== 'undefined' && !!window.electronAPI;
  }
  
  /**
   * 等待 Electron API 可用
   * @param timeout 超时时间（毫秒）
   */
  static async waitForElectronAPI(timeout = 5000): Promise<void> {
    const startTime = Date.now();
    
    while (!this.isElectronAvailable()) {
      if (Date.now() - startTime > timeout) {
        throw new Error('等待 Electron API 超时');
      }
      
      // 等待 100ms 后重试
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}

/**
 * 兼容旧版 ipcInvoke 函数
 * @deprecated 请使用 IpcUtils.invoke 或 IpcUtils.safeInvoke
 */
export async function ipcInvoke<T = any>(channel: string, data?: any): Promise<T> {
  if (typeof window !== 'undefined' && window.electronAPI) {
    // 根据通道名称调用对应的 API
    const [namespace, method] = channel.split(':');
    
    switch (namespace) {
      case 'webdav':
        switch (method) {
          case 'test-connection':
            return window.electronAPI.webdav.testConnection(data);
          case 'sync-now':
            return window.electronAPI.webdav.syncNow();
          case 'get-sync-status':
            return window.electronAPI.webdav.getSyncStatus();
          case 'set-config':
            return window.electronAPI.webdav.setConfig(data);
          case 'get-config':
            return window.electronAPI.webdav.getConfig();
        }
        break;
      case 'data':
        switch (method) {
          case 'create-backup':
            return window.electronAPI.data.createBackup(data?.description);
          case 'get-backup-list':
            return window.electronAPI.data.getBackupList();
          case 'restore-backup':
            return window.electronAPI.data.restoreBackup(data?.backupId);
          case 'delete-backup':
            return window.electronAPI.data.deleteBackup(data?.backupId);
          case 'export':
            return window.electronAPI.data.export(data.options, data.exportPath);
          case 'import':
            return window.electronAPI.data.import(data?.filePath, data?.options);
          case 'select-import-file':
            return window.electronAPI.data.selectImportFile(data?.format);
          case 'select-export-path':
            return window.electronAPI.data.selectExportPath(data?.defaultName);
          case 'get-stats':
            return window.electronAPI.data.getStats();
        }
        break;
    }
  }
  
  throw new Error(`Unknown IPC channel: ${channel}`);
}

// 扩展 Window 接口
declare global {
  interface Window {
    electronAPI: {
      invoke: (channel: string, ...args: any[]) => Promise<any>;
      preferences: {
        get: () => Promise<any>;
        set: (prefs: any) => Promise<any>;
        reset: () => Promise<any>;
      };
      theme: {
        setSource: (source: string) => Promise<void>;
      };
      webdav: {
        testConnection: (config: any) => Promise<any>;
        syncNow: () => Promise<any>;
        getSyncStatus: () => Promise<any>;
        setConfig: (config: any) => Promise<void>;
        getConfig: () => Promise<any>;
      };
      app: {
        quit: () => Promise<void>;
        restart: () => Promise<void>;
        showWindow: () => Promise<void>;
        hideWindow: () => Promise<void>;
        toggleWindow: () => Promise<void>;
        getVersion: () => Promise<string>;
      };
      tray: {
        updateMenu: (menu: any) => Promise<void>;
      };
      ai: {
        invoke: (config: any) => Promise<any>;
      };
      data: {
        createBackup: (description?: string) => Promise<any>;
        getBackupList: () => Promise<any>;
        restoreBackup: (backupId: string) => Promise<void>;
        deleteBackup: (backupId: string) => Promise<void>;
        export: (options: any, exportPath?: string) => Promise<any>;
        import: (filePath: string, options: any) => Promise<any>;
        selectImportFile: (format: string) => Promise<string | null>;
        selectExportPath: (defaultName: string) => Promise<string | null>;
        getStats: () => Promise<any>;
      };
    };
    databaseAPI?: any;
  }
}
