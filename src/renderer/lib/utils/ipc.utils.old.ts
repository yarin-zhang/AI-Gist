/**
 * IPC 通信工具类
 * 提供渲染进程与主进程之间的通信封装
 */

export interface IpcResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

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

  // 便捷方法：偏好设置
  static async getPreferences(): Promise<any> {
    return await this.invoke('get-user-preferences');
  }

  static async setPreferences(preferences: any): Promise<any> {
    return await this.invoke('set-user-preferences', preferences);
  }

  static async resetPreferences(): Promise<any> {
    return await this.invoke('reset-user-preferences');
  }

  // 便捷方法：主题管理
  static async setThemeSource(source: 'system' | 'light' | 'dark'): Promise<any> {
    return await this.invoke('theme:set-source', source);
  }

  static async getCurrentTheme(): Promise<any> {
    return await this.invoke('theme:get-current');
  }

  // 便捷方法：窗口管理
  static async showWindow(): Promise<void> {
    return await this.invoke('show-window');
  }

  static async hideToTray(): Promise<void> {
    return await this.invoke('hide-to-tray');
  }

  // 便捷方法：AI服务
  static async testAIConfig(config: any): Promise<any> {
    return await this.invoke('ai:test-config', config);
  }

  static async getAIModels(config: any): Promise<any> {
    return await this.invoke('ai:get-models', config);
  }

  static async generatePrompt(request: any, config: any): Promise<any> {
    return await this.invoke('ai:generate-prompt', request, config);
  }

  static async intelligentTestAI(config: any): Promise<any> {
    return await this.invoke('ai:intelligent-test', config);
  }
}

// 全局类型声明
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
