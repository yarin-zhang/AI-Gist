/**
 * IPC 工具类 - 统一的 IPC 通信管理
 * 整合原来分散在多个地方的 IPC 逻辑
 */

import { IpcChannels, IpcResult, IpcError, IpcInvokeOptions } from '@shared/types';
import type ElectronApi from '../typings/electron';

declare global {
  interface Window {
    electronAPI: ElectronApi;
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
        return api.preferences.get() as T;
      case 'set-user-preferences':
        return api.preferences.set(data) as T;
      case 'reset-user-preferences':
        return api.preferences.reset() as T;
        
      case 'show-window':
        return api.window.show() as T;
      case 'hide-to-tray':
        return api.window.hideToTray() as T;
      case 'get-window-size':
        return api.window.getSize() as T;
      case 'get-content-size':
        return api.window.getContentSize() as T;
        
      case 'theme':
        switch (method) {
          case 'get-current':
            return api.theme.getCurrent() as T;
          case 'get-info':
            return api.theme.getInfo() as T;
          case 'set-source':
            return api.theme.setSource(data) as T;
          case 'is-dark':
            return api.theme.isDark() as T;
        }
        break;
        
      case 'ai':
        switch (method) {
          case 'get-configs':
            return api.ai.getConfigs() as T;
          case 'get-enabled-configs':
            return api.ai.getEnabledConfigs() as T;
          case 'add-config':
            return api.ai.addConfig(data) as T;
          case 'update-config':
            return api.ai.updateConfig(data.id, data.config) as T;
          case 'remove-config':
            return api.ai.removeConfig(data) as T;
          case 'test-config':
            return api.ai.testConfig(data) as T;
          case 'get-models':
            return api.ai.getModels(data) as T;
          case 'generate-prompt':
            return api.ai.generatePrompt(data.request, data.config) as T;
          case 'generate-prompt-stream':
            return api.ai.generatePromptStream(data.request, data.config, data.onProgress) as T;
          case 'intelligent-test':
            return api.ai.intelligentTest(data) as T;
          case 'stop-generation':
            return api.ai.stopGeneration() as T;
          case 'debug-prompt':
            return api.ai.debugPrompt(data.prompt, data.config) as T;
        }
        break;
        
      case 'data':
        switch (method) {
          case 'create-backup':
            return api.data.createBackup(data) as T;
          case 'get-backup-list':
            return api.data.getBackupList() as T;
          case 'restore-backup':
            return api.data.restoreBackup(data) as T;
          case 'restore-backup-replace':
            return api.data.restoreBackupWithReplace(data) as T;
          case 'delete-backup':
            return api.data.deleteBackup(data) as T;
          case 'export':
            return api.data.export(data.options, data.exportPath) as T;
          case 'import':
            return api.data.import(data.filePath, data.options) as T;
          case 'export-selected':
            return api.data.exportSelected(data.options, data.exportPath) as T;
          case 'export-full-backup':
            return api.data.exportFullBackup() as T;
          case 'import-full-backup':
            return api.data.importFullBackup() as T;
          case 'select-import-file':
            return api.data.selectImportFile(data) as T;
          case 'select-export-path':
            return api.data.selectExportPath(data) as T;
          case 'get-stats':
            return api.data.getStats() as T;
          case 'get-backup-directory':
            return api.data.getBackupDirectory() as T;
        }
        break;
    }
    
    // 如果没有匹配的路由，直接调用 ipcRenderer.invoke
    if (typeof window !== 'undefined' && window.electronAPI) {
      // 这里需要直接调用 ipcRenderer.invoke，但我们需要一个更通用的方法
      throw new Error(`Unsupported IPC channel: ${channel}`);
    }
    
    throw new Error(`IPC not available for channel: ${channel}`);
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
