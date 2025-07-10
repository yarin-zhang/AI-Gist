// 标准库导入
import { Tray, Menu, nativeImage, BrowserWindow, app } from 'electron';

// 本地模块导入
import { getAppIconPath } from './utils';

/**
 * 常量定义
 */
const CONSTANTS = {
  TOOLTIP_TEXT: 'AI-Gist - AI 提示词管理工具',
  MENU_LABELS: {
    SHOW_WINDOW: '显示主窗口',
    QUIT: '退出'
  },
  LOG_MESSAGES: {
    TRAY_CREATED: '系统托盘创建成功',
    TRAY_CREATE_ERROR: '创建系统托盘失败:',
    ICON_PATH_LOG: '正在使用图标文件:',
    ICON_NOT_FOUND: '无法创建托盘：未找到图标文件',
    ICON_INVALID: '无法创建托盘：图标文件无效或为空'
  }
} as const;

/**
 * 系统托盘管理器
 * 负责创建、管理和销毁系统托盘图标
 */
class TrayManager {
  // ==================== 私有属性 ====================
  private tray: Tray | null = null;
  private mainWindow: BrowserWindow | null = null;
  private onQuitCallback?: () => void;
  private showWindowCallback?: () => void;

  // ==================== 窗口管理方法 ====================
  
  /**
   * 设置主窗口引用
   * @param window 主窗口实例
   */
  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  /**
   * 设置退出回调函数
   * @param callback 退出回调函数
   */
  setQuitCallback(callback: () => void): void {
    this.onQuitCallback = callback;
  }

  /**
   * 设置显示窗口回调函数
   * @param callback 显示窗口回调函数
   */
  setShowWindowCallback(callback: () => void): void {
    this.showWindowCallback = callback;
  }

  // ==================== 托盘生命周期方法 ====================
  
  /**
   * 创建系统托盘
   * @returns 是否创建成功
   */
  createTray(): boolean {
    try {
      const icon = this.createTrayIcon();
      if (!icon) {
        return false;
      }

      this.tray = new Tray(icon);
      this.setupTrayMenu();
      this.setupTrayEvents();

      console.log(CONSTANTS.LOG_MESSAGES.TRAY_CREATED);
      return true;
    } catch (error) {
      console.error(CONSTANTS.LOG_MESSAGES.TRAY_CREATE_ERROR, error);
      return false;
    }
  }

  /**
   * 销毁托盘
   */
  destroy(): void {
    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }
  }

  /**
   * 获取托盘实例
   * @returns 托盘实例或 null
   */
  getTray(): Tray | null {
    return this.tray;
  }

  // ==================== 私有方法 ====================
  
  /**
   * 创建托盘图标
   * @returns 图标实例或 null
   */
  private createTrayIcon(): Electron.NativeImage | null {
    const iconPath = getAppIconPath();
    if (!iconPath) {
      console.warn(CONSTANTS.LOG_MESSAGES.ICON_NOT_FOUND);
      return null;
    }

    console.log(CONSTANTS.LOG_MESSAGES.ICON_PATH_LOG, iconPath);

    let icon = nativeImage.createFromPath(iconPath);
    
    // Windows 平台特殊处理
    if (process.platform === 'win32' && !icon.isEmpty()) {
      icon = icon.resize({ width: 16, height: 16 });
    }
    
    if (icon.isEmpty()) {
      console.warn(CONSTANTS.LOG_MESSAGES.ICON_INVALID);
      return null;
    }

    return icon;
  }

  /**
   * 设置托盘菜单
   */
  private setupTrayMenu(): void {
    if (!this.tray) return;

    const contextMenu = Menu.buildFromTemplate([
      {
        label: CONSTANTS.MENU_LABELS.SHOW_WINDOW,
        click: () => this.showMainWindow()
      },
      { type: 'separator' },
      {
        label: CONSTANTS.MENU_LABELS.QUIT,
        click: () => this.quitApplication()
      }
    ]);

    this.tray.setToolTip(CONSTANTS.TOOLTIP_TEXT);
    this.tray.setContextMenu(contextMenu);
  }

  /**
   * 设置托盘事件
   */
  private setupTrayEvents(): void {
    if (!this.tray) return;

    // 双击事件
    this.tray.on('double-click', () => this.showMainWindow());
    
    // 单击事件（根据平台设置）
    if (this.shouldHandleClickEvent()) {
      this.tray.on('click', () => this.showMainWindow());
    }
  }

  /**
   * 判断是否应该处理单击事件
   * @returns 是否处理单击事件
   */
  private shouldHandleClickEvent(): boolean {
    return process.platform === 'darwin' || process.platform === 'win32';
  }

  /**
   * 显示主窗口
   */
  private showMainWindow(): void {
    // 优先使用回调函数
    if (this.showWindowCallback) {
      this.showWindowCallback();
      return;
    }

    // 备用方案：直接操作窗口
    if (this.mainWindow) {
      this.restoreAndShowWindow();
    }
  }

  /**
   * 恢复并显示窗口
   */
  private restoreAndShowWindow(): void {
    if (!this.mainWindow) return;

    // 恢复最小化的窗口
    if (this.mainWindow.isMinimized()) {
      this.mainWindow.restore();
    }

    // 显示并聚焦窗口
    this.mainWindow.show();
    this.mainWindow.focus();

    // macOS 平台特殊处理
    if (process.platform === 'darwin') {
      app.focus({ steal: true });
    }
  }

  /**
   * 退出应用程序
   */
  private quitApplication(): void {
    if (this.onQuitCallback) {
      this.onQuitCallback();
    } else {
      app.quit();
    }
  }
}

// 单例模式导出
export const trayManager = new TrayManager();
