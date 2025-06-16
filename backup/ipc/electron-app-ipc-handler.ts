/**
 * Electron 应用 IPC 处理器
 * 负责处理应用级别的 IPC 通信，如偏好设置、主题、WebDAV 等
 */

import { IpcUtils } from './ipc-utils';
import { IPC_CHANNELS } from '../../shared/types/ipc.types';
import type { 
  AppPreferences, 
  WebDAVConfig,
  IpcResult 
} from '../../shared/types/ipc.types';

export class ElectronAppIpcHandler {
  private static instance: ElectronAppIpcHandler;

  private constructor() {}

  static getInstance(): ElectronAppIpcHandler {
    if (!ElectronAppIpcHandler.instance) {
      ElectronAppIpcHandler.instance = new ElectronAppIpcHandler();
    }
    return ElectronAppIpcHandler.instance;
  }

  // 偏好设置相关方法
  async getPreferences(): Promise<IpcResult<AppPreferences>> {
    return await IpcUtils.safeInvoke<AppPreferences>(IPC_CHANNELS.PREFERENCES_GET);
  }

  async setPreferences(preferences: AppPreferences): Promise<IpcResult<void>> {
    return await IpcUtils.safeInvoke<void>(IPC_CHANNELS.PREFERENCES_SET, preferences);
  }

  async resetPreferences(): Promise<IpcResult<void>> {
    return await IpcUtils.safeInvoke<void>(IPC_CHANNELS.PREFERENCES_RESET);
  }

  // 主题相关方法
  async setThemeSource(source: string): Promise<IpcResult<void>> {
    return await IpcUtils.safeInvoke<void>(IPC_CHANNELS.THEME_SET_SOURCE, source);
  }

  // WebDAV 相关方法
  async testWebDAVConnection(config: WebDAVConfig): Promise<IpcResult<any>> {
    return await IpcUtils.safeInvoke(IPC_CHANNELS.WEBDAV_TEST_CONNECTION, config);
  }

  async syncWebDAVNow(): Promise<IpcResult<any>> {
    return await IpcUtils.safeInvoke(IPC_CHANNELS.WEBDAV_SYNC_NOW);
  }

  async getWebDAVSyncStatus(): Promise<IpcResult<any>> {
    return await IpcUtils.safeInvoke(IPC_CHANNELS.WEBDAV_GET_SYNC_STATUS);
  }

  async setWebDAVConfig(config: WebDAVConfig): Promise<IpcResult<void>> {
    return await IpcUtils.safeInvoke<void>(IPC_CHANNELS.WEBDAV_SET_CONFIG, config);
  }

  async getWebDAVConfig(): Promise<IpcResult<WebDAVConfig>> {
    return await IpcUtils.safeInvoke<WebDAVConfig>(IPC_CHANNELS.WEBDAV_GET_CONFIG);
  }

  // 应用控制相关方法
  async quitApp(): Promise<IpcResult<void>> {
    return await IpcUtils.safeInvoke<void>(IPC_CHANNELS.APP_QUIT);
  }

  async restartApp(): Promise<IpcResult<void>> {
    return await IpcUtils.safeInvoke<void>(IPC_CHANNELS.APP_RESTART);
  }

  async showWindow(): Promise<IpcResult<void>> {
    return await IpcUtils.safeInvoke<void>(IPC_CHANNELS.APP_SHOW_WINDOW);
  }

  async hideWindow(): Promise<IpcResult<void>> {
    return await IpcUtils.safeInvoke<void>(IPC_CHANNELS.APP_HIDE_WINDOW);
  }

  async toggleWindow(): Promise<IpcResult<void>> {
    return await IpcUtils.safeInvoke<void>(IPC_CHANNELS.APP_TOGGLE_WINDOW);
  }

  async getAppVersion(): Promise<IpcResult<string>> {
    return await IpcUtils.safeInvoke<string>(IPC_CHANNELS.APP_GET_VERSION);
  }

  // 系统托盘相关方法
  async updateTrayMenu(menu: any): Promise<IpcResult<void>> {
    return await IpcUtils.safeInvoke<void>(IPC_CHANNELS.TRAY_UPDATE_MENU, menu);
  }

  // AI 服务相关方法
  async invokeAIService(config: any): Promise<IpcResult<any>> {
    return await IpcUtils.safeInvoke(IPC_CHANNELS.AI_SERVICE_INVOKE, config);
  }

  // 便捷方法：使用传统的 window.electronAPI（向后兼容）
  async legacyGetPreferences(): Promise<any> {
    if (window.electronAPI?.preferences?.get) {
      return await window.electronAPI.preferences.get();
    }
    throw new Error('Electron API 不可用');
  }

  async legacySetPreferences(prefs: any): Promise<any> {
    if (window.electronAPI?.preferences?.set) {
      return await window.electronAPI.preferences.set(prefs);
    }
    throw new Error('Electron API 不可用');
  }

  async legacyTestWebDAVConnection(config: any): Promise<any> {
    if (window.electronAPI?.webdav?.testConnection) {
      return await window.electronAPI.webdav.testConnection(config);
    }
    throw new Error('Electron API 不可用');
  }

  async legacySyncWebDAVNow(): Promise<any> {
    if (window.electronAPI?.webdav?.syncNow) {
      return await window.electronAPI.webdav.syncNow();
    }
    throw new Error('Electron API 不可用');
  }

  async legacyGetWebDAVSyncStatus(): Promise<any> {
    if (window.electronAPI?.webdav?.getSyncStatus) {
      return await window.electronAPI.webdav.getSyncStatus();
    }
    throw new Error('Electron API 不可用');
  }
}
