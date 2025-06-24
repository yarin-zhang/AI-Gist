/**
 * 应用服务管理器
 * 统一管理应用级别的功能，如偏好设置、主题、WebDAV等
 */

import { IpcUtils } from '../ipc';
import type { IpcResult } from '@shared/types';
import type { WebDAVConfig } from '@shared/types/webdav';

export interface AppPreferences {
  theme?: string;
  language?: string;
  autoStart?: boolean;
  minimizeToTray?: boolean;
  themeSource?: 'system' | 'light' | 'dark';
  webdav?: WebDAVConfig;
  [key: string]: any;
}

export class AppService {
  private static instance: AppService;

  // 私有构造函数，防止外部实例化
  private constructor() {
    // 空构造函数用于单例模式
  }

  static getInstance(): AppService {
    if (!AppService.instance) {
      AppService.instance = new AppService();
    }
    return AppService.instance;
  }

  // 偏好设置管理
  async getPreferences(): Promise<IpcResult<AppPreferences>> {
    return await IpcUtils.safeInvoke<AppPreferences>('get-user-preferences');
  }

  async setPreferences(preferences: Partial<AppPreferences>): Promise<IpcResult<AppPreferences>> {
    return await IpcUtils.safeInvoke<AppPreferences>('set-user-preferences', preferences);
  }

  async resetPreferences(): Promise<IpcResult<AppPreferences>> {
    return await IpcUtils.safeInvoke<AppPreferences>('reset-user-preferences');
  }

  // 主题管理
  async getCurrentTheme(): Promise<IpcResult<string>> {
    return await IpcUtils.safeInvoke<string>('theme:get-current');
  }

  async setThemeSource(source: 'system' | 'light' | 'dark'): Promise<IpcResult<string>> {
    return await IpcUtils.safeInvoke<string>('theme:set-source', source);
  }

  async isDarkTheme(): Promise<IpcResult<boolean>> {
    return await IpcUtils.safeInvoke<boolean>('theme:is-dark');
  }

  // 窗口管理
  async showWindow(): Promise<IpcResult<void>> {
    return await IpcUtils.safeInvoke<void>('show-window');
  }

  async hideToTray(): Promise<IpcResult<void>> {
    return await IpcUtils.safeInvoke<void>('hide-to-tray');
  }

  async getWindowSize(): Promise<IpcResult<{ width: number; height: number }>> {
    return await IpcUtils.safeInvoke<{ width: number; height: number }>('get-window-size');
  }

  // WebDAV 服务
  async testWebDAVConnection(config: WebDAVConfig): Promise<IpcResult<any>> {
    if (window.electronAPI?.webdav?.testConnection) {
      try {
        const result = await window.electronAPI.webdav.testConnection(config);
        return { success: true, data: result };
      } catch (error) {
        return { 
          success: false, 
          error: error instanceof Error ? error.message : String(error) 
        };
      }
    }
    return { success: false, error: 'WebDAV API 不可用' };
  }
  
  // 立即同步
  async syncWebDAVNow(): Promise<IpcResult<any>> {
    return await IpcUtils.safeInvoke<any>('webdav:sync-now');
  }

  // 用户确认合并后执行同步
  async syncWithMergeConfirmed(): Promise<IpcResult<any>> {
    return await IpcUtils.safeInvoke<any>('webdav:sync-with-merge-confirmed');
  }

  // 强制上传 (本地覆盖远端)
  async forceUpload(): Promise<any> {
    return await IpcUtils.safeInvoke<any>('webdav:force-upload');
  }

  // 强制下载 (远端覆盖本地)
  async forceDownload(): Promise<any> {
    return await IpcUtils.safeInvoke<any>('webdav:force-download');
  }

  // 应用下载的数据
  async applyDownloadedData(resolution: any): Promise<IpcResult<any>> {
    return await IpcUtils.safeInvoke<any>('webdav:apply-downloaded-data', resolution);
  }

  // 获取远程数据预览
  async getRemoteDataPreview(): Promise<IpcResult<any>> {
    return await IpcUtils.safeInvoke<any>('webdav:get-remote-preview');
  }

  // 比较本地和远程数据
  async compareWebDAVData(): Promise<IpcResult<any>> {
    return await IpcUtils.safeInvoke<any>('webdav:compare-data');
  }

  async getWebDAVSyncStatus(): Promise<IpcResult<any>> {
    if (window.electronAPI?.webdav?.getSyncStatus) {
      try {
        const result = await window.electronAPI.webdav.getSyncStatus();
        return { success: true, data: result };
      } catch (error) {
        return { 
          success: false, 
          error: error instanceof Error ? error.message : String(error) 
        };
      }
    }
    return { success: false, error: 'WebDAV API 不可用' };
  }

  async setWebDAVConfig(config: WebDAVConfig): Promise<IpcResult<void>> {
    if (window.electronAPI?.webdav?.setConfig) {
      try {
        await window.electronAPI.webdav.setConfig(config);
        return { success: true };
      } catch (error) {
        return { 
          success: false, 
          error: error instanceof Error ? error.message : String(error) 
        };
      }
    }
    return { success: false, error: 'WebDAV API 不可用' };
  }

  async getWebDAVConfig(): Promise<IpcResult<WebDAVConfig>> {
    if (window.electronAPI?.webdav?.getConfig) {
      try {
        const result = await window.electronAPI.webdav.getConfig();
        return { success: true, data: result };
      } catch (error) {
        return { 
          success: false, 
          error: error instanceof Error ? error.message : String(error) 
        };
      }
    }
    return { success: false, error: 'WebDAV API 不可用' };
  }

  // 数据管理
  async exportData(options: any, exportPath?: string): Promise<IpcResult<any>> {
    if (window.electronAPI?.data?.export) {
      try {
        const result = await window.electronAPI.data.export(options, exportPath);
        return { success: true, data: result };
      } catch (error) {
        return { 
          success: false, 
          error: error instanceof Error ? error.message : String(error) 
        };
      }
    }
    return { success: false, error: '数据管理 API 不可用' };
  }

  async importData(filePath: string, options: any): Promise<IpcResult<any>> {
    if (window.electronAPI?.data?.import) {
      try {
        const result = await window.electronAPI.data.import(filePath, options);
        return { success: true, data: result };
      } catch (error) {
        return { 
          success: false, 
          error: error instanceof Error ? error.message : String(error) 
        };
      }
    }
    return { success: false, error: '数据管理 API 不可用' };
  }

  async createBackup(description?: string): Promise<IpcResult<any>> {
    if (window.electronAPI?.data?.createBackup) {
      try {
        const result = await window.electronAPI.data.createBackup(description);
        return { success: true, data: result };
      } catch (error) {
        return { 
          success: false, 
          error: error instanceof Error ? error.message : String(error) 
        };
      }
    }
    return { success: false, error: '数据管理 API 不可用' };
  }

  async getBackupList(): Promise<IpcResult<any[]>> {
    if (window.electronAPI?.data?.getBackupList) {
      try {
        const result = await window.electronAPI.data.getBackupList();
        return { success: true, data: result };
      } catch (error) {
        return { 
          success: false, 
          error: error instanceof Error ? error.message : String(error) 
        };
      }
    }
    return { success: false, error: '数据管理 API 不可用' };
  }

  async restoreBackup(backupId: string): Promise<IpcResult<void>> {
    if (window.electronAPI?.data?.restoreBackup) {
      try {
        await window.electronAPI.data.restoreBackup(backupId);
        return { success: true };
      } catch (error) {
        return { 
          success: false, 
          error: error instanceof Error ? error.message : String(error) 
        };
      }
    }
    return { success: false, error: '数据管理 API 不可用' };
  }

  async deleteBackup(backupId: string): Promise<IpcResult<void>> {
    if (window.electronAPI?.data?.deleteBackup) {
      try {
        await window.electronAPI.data.deleteBackup(backupId);
        return { success: true };
      } catch (error) {
        return { 
          success: false, 
          error: error instanceof Error ? error.message : String(error) 
        };
      }
    }
    return { success: false, error: '数据管理 API 不可用' };
  }
}

// 导出单例实例
export const appService = AppService.getInstance();
