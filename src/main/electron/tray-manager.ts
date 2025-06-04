import { Tray, Menu, nativeImage, BrowserWindow } from 'electron';
import { getAppIconPath } from './utils';

/**
 * 系统托盘管理器
 */
class TrayManager {
  private tray: Tray | null = null;
  private mainWindow: BrowserWindow | null = null;
  private onQuitCallback?: () => void;

  /**
   * 设置主窗口引用
   */
  setMainWindow(window: BrowserWindow) {
    this.mainWindow = window;
  }

  /**
   * 设置退出回调函数
   */
  setQuitCallback(callback: () => void) {
    this.onQuitCallback = callback;
  }

  /**
   * 创建系统托盘
   * 在系统托盘区域创建应用图标，提供右键菜单和双击事件
   */
  createTray(): boolean {
    try {
      // 获取图标路径
      const iconPath = getAppIconPath();
      if (!iconPath) {
        console.warn('无法创建托盘：未找到图标文件');
        return false;
      }

      // 创建托盘图标
      const icon = nativeImage.createFromPath(iconPath);
      if (icon.isEmpty()) {
        console.warn('无法创建托盘：图标文件无效或为空');
        return false;
      }

      this.tray = new Tray(icon);
      
      // 创建右键菜单
      const contextMenu = Menu.buildFromTemplate([
        {
          label: '显示主窗口',
          click: () => this.showMainWindow()
        },
        {
          label: '退出',
          click: () => this.quitApplication()
        }
      ]);
      
      // 设置托盘提示文本和右键菜单
      this.tray.setToolTip('AI-Gist');
      this.tray.setContextMenu(contextMenu);
      
      // 双击托盘图标显示窗口
      this.tray.on('double-click', () => this.showMainWindow());

      console.log('系统托盘创建成功');
      return true;
    } catch (error) {
      console.error('创建系统托盘失败:', error);
      return false;
    }
  }

  /**
   * 显示主窗口
   */
  private showMainWindow() {
    if (this.mainWindow) {
      this.mainWindow.show();
      this.mainWindow.focus();
    }
  }

  /**
   * 退出应用程序
   */
  private quitApplication() {
    // 调用退出回调函数，让主进程处理退出逻辑
    if (this.onQuitCallback) {
      this.onQuitCallback();
    } else {
      // 备用方案：直接退出
      const { app } = require('electron');
      app.quit();
    }
  }

  /**
   * 销毁托盘
   */
  destroy() {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }

  /**
   * 获取托盘实例
   */
  getTray(): Tray | null {
    return this.tray;
  }
}

// 单例模式
export const trayManager = new TrayManager();
