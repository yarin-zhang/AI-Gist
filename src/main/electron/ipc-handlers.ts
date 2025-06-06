import { ipcMain } from 'electron';
import { preferencesManager } from './preferences-manager';
import { windowManager } from './window-manager';
import { themeManager } from './theme-manager';
import { UserPreferences, SystemTheme } from './types';

/**
 * IPC 处理器管理器
 */
class IpcHandlers {
  /**
   * 初始化所有 IPC 处理器
   */
  initialize() {
    this.setupMessageHandler();
    this.setupPreferencesHandlers();
    this.setupWindowHandlers();
    this.setupThemeHandlers();
  }

  /**
   * 设置简单消息处理器
   */
  private setupMessageHandler() {
    ipcMain.on('message', (event, message) => {
      console.log('收到渲染进程消息:', message);
    });
  }

  /**
   * 设置用户偏好设置处理器
   */
  private setupPreferencesHandlers() {
    // 获取用户偏好设置
    ipcMain.handle('get-user-preferences', (): UserPreferences => {
      return preferencesManager.getPreferences();
    });

    // 设置用户偏好
    ipcMain.handle('set-user-preferences', (_, newPrefs: Partial<UserPreferences>): UserPreferences => {
      return preferencesManager.updatePreferences(newPrefs);
    });

    // 重置用户偏好设置
    ipcMain.handle('reset-user-preferences', (): UserPreferences => {
      return preferencesManager.resetPreferences();
    });
  }

  /**
   * 设置窗口管理处理器
   */
  private setupWindowHandlers() {
    // 显示主窗口
    ipcMain.handle('show-window', () => {
      windowManager.showMainWindow();
    });

    // 隐藏窗口到托盘
    ipcMain.handle('hide-to-tray', () => {
      windowManager.hideMainWindow();
    });

    // 获取窗口尺寸
    ipcMain.handle('get-window-size', () => {
      return windowManager.getWindowSize();
    });

    // 获取窗口内容尺寸
    ipcMain.handle('get-content-size', () => {
      return windowManager.getContentSize();
    });
  }

  /**
   * 设置主题管理处理器
   */
  private setupThemeHandlers() {
    // 获取当前主题
    ipcMain.handle('theme:get-current', () => {
      return themeManager.getCurrentTheme();
    });

    // 获取主题详细信息
    ipcMain.handle('theme:get-info', () => {
      return themeManager.getThemeInfo();
    });

    // 设置主题来源
    ipcMain.handle('theme:set-source', (_, source: 'system' | 'light' | 'dark') => {
      themeManager.setThemeSource(source);
      // 同时保存到用户偏好设置中
      preferencesManager.updatePreferences({ themeSource: source });
      return themeManager.getCurrentTheme();
    });

    // 检查是否为暗色主题
    ipcMain.handle('theme:is-dark', () => {
      return themeManager.isDarkTheme();
    });
  }

  /**
   * 清理所有处理器
   */
  cleanup() {
    ipcMain.removeAllListeners('message');
    // 清理偏好设置处理器
    ipcMain.removeHandler('get-user-preferences');
    ipcMain.removeHandler('set-user-preferences');
    ipcMain.removeHandler('reset-user-preferences');
    // 清理窗口处理器
    ipcMain.removeHandler('show-window');
    ipcMain.removeHandler('hide-to-tray');
    ipcMain.removeHandler('get-window-size');
    ipcMain.removeHandler('get-content-size');
    // 清理主题处理器
    ipcMain.removeHandler('theme:get-current');
    ipcMain.removeHandler('theme:get-info');
    ipcMain.removeHandler('theme:set-source');
    ipcMain.removeHandler('theme:is-dark');
  }
}

// 单例模式
export const ipcHandlers = new IpcHandlers();
