/**
 * IPC 工具类 - 统一的 IPC 通信管理
 * 整合原来分散在多个地方的 IPC 逻辑
 */

import { IpcChannels, IpcResult, IpcError, IpcInvokeOptions } from '../../shared/types';

declare global {
  interface Window {
    electronAPI: {
      sendMessage: (message: string) => void;
      preferences: {
        get: () => Promise<any>;
        set: (prefs: any) => Promise<any>;
        reset: () => Promise<any>;
      };
      window: {
        show: () => Promise<void>;
        hideToTray: () => Promise<void>;
        getSize: () => Promise<{ width: number; height: number } | null>;
        getContentSize: () => Promise<{ width: number; height: number } | null>;
      };
      theme: {
        getCurrent: () => Promise<'light' | 'dark' | 'system'>;
        getInfo: () => Promise<any>;
        setSource: (source: 'system' | 'light' | 'dark') => Promise<'light' | 'dark' | 'system'>;
        isDark: () => Promise<boolean>;
        onThemeChanged: (callback: (data: any) => void) => () => void;
      };
      ai: {
        getConfigs: () => Promise<any[]>;
        getEnabledConfigs: () => Promise<any[]>;
        addConfig: (config: any) => Promise<any>;
        updateConfig: (id: string, config: any) => Promise<any>;
        removeConfig: (id: string) => Promise<boolean>;
        testConfig: (config: any) => Promise<any>;
        getModels: (config: any) => Promise<string[]>;
        generatePrompt: (request: any, config: any) => Promise<any>;
        generatePromptStream: (request: any, config: any, onProgress: any) => Promise<any>;
        intelligentTest: (config: any) => Promise<any>;
        stopGeneration: () => Promise<any>;
        debugPrompt: (prompt: string, config: any) => Promise<any>;
      };
      webdav: {
        testConnection: (config: any) => Promise<any>;
        syncNow: () => Promise<any>;
        getSyncStatus: () => Promise<any>;
        setConfig: (config: any) => Promise<void>;
        getConfig: () => Promise<any>;
        encryptPassword: (password: string) => Promise<any>;
        decryptPassword: (encryptedPassword: any) => Promise<string>;
      };
      data: {
        createBackup: (description?: string) => Promise<any>;
        getBackupList: () => Promise<any>;
        restoreBackup: (backupId: string) => Promise<any>;
        deleteBackup: (backupId: string) => Promise<any>;
        export: (options: any, exportPath?: string) => Promise<any>;
        import: (filePath: string, options: any) => Promise<any>;
        selectImportFile: (format: string) => Promise<string | null>;
        selectExportPath: (defaultName: string) => Promise<string | null>;
        getStats: () => Promise<any>;
      };
    };
  }
}

/**
 * IPC 工具类
 */
export class IpcUtils {
  private static timeout = 30000; // 30秒超时

  /**
   * 检查 Electron API 是否可用
   */
  static isElectronAvailable(): boolean {
    return typeof window !== 'undefined' && !!window.electronAPI;
  }

  /**
   * 通用 IPC 调用方法
   */
  static async invoke<T = any>(
    channel: string, 
    data?: any, 
    options: IpcInvokeOptions = {}
  ): Promise<T> {
    if (!this.isElectronAvailable()) {
      throw new IpcError('Electron API not available', channel);
    }

    const { timeout = this.timeout, retries = 0, retryDelay = 1000 } = options;

    let lastError: Error | undefined;
    
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const result = await Promise.race([
          this.doInvoke<T>(channel, data),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('IPC call timeout')), timeout)
          )
        ]);
        
        return result;
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          continue;
        }
        
        throw new IpcError(
          `IPC call failed after ${retries + 1} attempts: ${lastError.message}`,
          channel,
          lastError
        );
      }
    }
    
    throw lastError!;
  }

  /**
   * 安全的 IPC 调用 - 不抛出异常，返回结果对象
   */
  static async safeInvoke<T = any>(
    channel: string, 
    data?: any, 
    options: IpcInvokeOptions = {}
  ): Promise<IpcResult<T>> {
    try {
      const result = await this.invoke<T>(channel, data, options);
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
   * 实际执行 IPC 调用的方法
   */
  private static async doInvoke<T>(channel: string, data?: any): Promise<T> {
    const api = window.electronAPI;

    // 根据频道路由到对应的 API
    const [namespace, method] = channel.split(':');
    
    switch (namespace) {
      case 'preferences':
      case 'get-user-preferences':
        return api.preferences.get();
      case 'set-user-preferences':
        return api.preferences.set(data);
      case 'reset-user-preferences':
        return api.preferences.reset();
        
      case 'show-window':
        return api.window.show();
      case 'hide-to-tray':
        return api.window.hideToTray();
      case 'get-window-size':
        return api.window.getSize();
      case 'get-content-size':
        return api.window.getContentSize();
        
      case 'theme':
        switch (method) {
          case 'get-current':
            return api.theme.getCurrent();
          case 'get-info':
            return api.theme.getInfo();
          case 'set-source':
            return api.theme.setSource(data);
          case 'is-dark':
            return api.theme.isDark();
        }
        break;
        
      case 'ai':
        switch (method) {
          case 'get-configs':
            return api.ai.getConfigs();
          case 'get-enabled-configs':
            return api.ai.getEnabledConfigs();
          case 'add-config':
            return api.ai.addConfig(data);
          case 'update-config':
            return api.ai.updateConfig(data.id, data.config);
          case 'remove-config':
            return api.ai.removeConfig(data);
          case 'test-config':
            return api.ai.testConfig(data);
          case 'get-models':
            return api.ai.getModels(data);
          case 'generate-prompt':
            return api.ai.generatePrompt(data.request, data.config);
          case 'generate-prompt-stream':
            return api.ai.generatePromptStream(data.request, data.config, data.onProgress);
          case 'intelligent-test':
            return api.ai.intelligentTest(data);
          case 'stop-generation':
            return api.ai.stopGeneration();
          case 'debug-prompt':
            return api.ai.debugPrompt(data.prompt, data.config);
        }
        break;
        
      case 'webdav':
        switch (method) {
          case 'test-connection':
            return api.webdav.testConnection(data);
          case 'sync-now':
            return api.webdav.syncNow();
          case 'get-sync-status':
            return api.webdav.getSyncStatus();
          case 'set-config':
            return api.webdav.setConfig(data);
          case 'get-config':
            return api.webdav.getConfig();
          case 'encrypt-password':
            return api.webdav.encryptPassword(data);
          case 'decrypt-password':
            return api.webdav.decryptPassword(data);
        }
        break;
        
      case 'data':
        switch (method) {
          case 'create-backup':
            return api.data.createBackup(data?.description);
          case 'get-backup-list':
            return api.data.getBackupList();
          case 'restore-backup':
            return api.data.restoreBackup(data.backupId);
          case 'restore-backup-replace':
            return api.data.restoreBackupWithReplace(data.backupId);
          case 'delete-backup':
            return api.data.deleteBackup(data.backupId);
          case 'export':
            return api.data.export(data.options, data.exportPath);
          case 'import':
            return api.data.import(data.filePath, data.options);
          case 'select-import-file':
            return api.data.selectImportFile(data?.format);
          case 'select-export-path':
            return api.data.selectExportPath(data?.defaultName);
          case 'get-stats':
            return api.data.getStats();
        }
        break;
    }
    
    throw new Error(`Unknown IPC channel: ${channel}`);
  }
}

/**
 * 向后兼容的 ipcInvoke 函数
 * @deprecated 请使用 IpcUtils.invoke 或 IpcUtils.safeInvoke
 */
export async function ipcInvoke<T = any>(channel: string, data?: any): Promise<T> {
  return IpcUtils.invoke<T>(channel, data);
}

/**
 * 默认导出 IpcUtils 类
 */
export default IpcUtils;
