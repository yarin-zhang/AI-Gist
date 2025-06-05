import { ipcMain } from 'electron';
import { preferencesManager } from './preferences-manager';
import { windowManager } from './window-manager';
import { UserPreferences } from './types';

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
  }

  /**
   * 清理所有处理器
   */
  cleanup() {
    ipcMain.removeAllListeners('message');
    ipcMain.removeHandler('get-user-preferences');
    ipcMain.removeHandler('set-user-preferences');
    ipcMain.removeHandler('show-window');
    ipcMain.removeHandler('hide-to-tray');
  }
}

// 单例模式
export const ipcHandlers = new IpcHandlers();
