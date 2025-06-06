import { Tray, Menu, nativeImage, BrowserWindow } from 'electron';
import { getAppIconPath } from './utils';

/**
 * 系统托盘管理器
 */
class TrayManager {
  private tray: Tray | null = null;
  private mainWindow: BrowserWindow | null = null;
  private onQuitCallback?: () => void;
  private showWindowCallback?: () => void;

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
   * 设置显示窗口回调函数
   */
  setShowWindowCallback(callback: () => void) {
    this.showWindowCallback = callback;
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

      console.log(`正在使用图标文件: ${iconPath}`);

      // 创建托盘图标
      let icon = nativeImage.createFromPath(iconPath);
      
      // 针对 Windows 平台的特殊处理
      if (process.platform === 'win32' && !icon.isEmpty()) {
        // Windows 托盘图标建议尺寸为 16x16
        icon = icon.resize({ width: 16, height: 16 });
      }
      
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
        { type: 'separator' },
        {
          label: '退出',
          click: () => this.quitApplication()
        }
      ]);
      
      // 设置托盘提示文本和右键菜单
      this.tray.setToolTip('AI-Gist - AI 提示词管理工具');
      this.tray.setContextMenu(contextMenu);
      
      // 双击托盘图标显示窗口
      this.tray.on('double-click', () => this.showMainWindow());
      
      // 根据平台设置点击行为
      if (process.platform === 'darwin') {
        // 在 macOS 下，单击托盘图标也显示窗口（macOS 用户习惯）
        this.tray.on('click', () => this.showMainWindow());
      } else if (process.platform === 'win32') {
        // 在 Windows 下，单击托盘图标显示窗口（Windows 用户习惯）
        this.tray.on('click', () => this.showMainWindow());
      }

      console.log('系统托盘创建成功');
      return true;
    } catch (error) {
      console.error('创建系统托盘失败:', error);
      console.error('错误详情:', error);
      return false;
    }
  }

  /**
   * 显示主窗口
   */
  private showMainWindow() {
    // 优先使用回调函数，确保使用 windowManager 的方法
    if (this.showWindowCallback) {
      this.showWindowCallback();
    } else if (this.mainWindow) {
      // 备用方案：直接操作窗口
      if (process.platform === 'darwin') {
        // 如果窗口被最小化，先恢复它
        if (this.mainWindow.isMinimized()) {
          this.mainWindow.restore();
        }
        // 显示窗口
        this.mainWindow.show();
        // 确保应用获得焦点
        this.mainWindow.focus();
        // 在 macOS 下，确保应用出现在前台
        const { app } = require('electron');
        app.focus({ steal: true });
      } else {
        // 其他平台的处理
        if (this.mainWindow.isMinimized()) {
          this.mainWindow.restore();
        }
        this.mainWindow.show();
        this.mainWindow.focus();
      }
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
