// 标准库导入
import { join } from 'path';

// 第三方库导入
import { BrowserWindow, dialog, app } from 'electron';

// 本地模块导入
import { getAppIconPath } from './utils';
import { preferencesManager } from './preferences-manager';

/**
 * 常量定义
 */
const CONSTANTS = {
  WINDOW_DIMENSIONS: {
    DEFAULT_WIDTH: 1080,
    DEFAULT_HEIGHT: 720,
    MIN_WIDTH: 800,
    MIN_HEIGHT: 660
  },
  BACKGROUND_COLORS: {
    DARK: '#101014',
    LIGHT: '#ffffff'
  },
  DIALOG_BUTTONS: {
    QUIT: '退出',
    MINIMIZE: '最小化到托盘',
    CANCEL: '取消'
  },
  DIALOG_MESSAGES: {
    TITLE: '确认操作',
    MESSAGE: '您想要退出应用程序还是最小化到系统托盘？',
    DETAIL: '最小化到托盘后，应用程序将在后台继续运行。',
    CHECKBOX_LABEL: '不再显示此对话框'
  },
  LOG_MESSAGES: {
    QUIT_START: '开始退出应用程序...',
    START_MINIMIZED: '应用启动时最小化到托盘',
    CLOSE_BEHAVIOR_EXECUTED: '执行用户保存的关闭行为:',
    USER_PREFERENCE_SAVED: '用户选择记住关闭行为:'
  }
} as const;

/**
 * 窗口管理器
 * 负责管理应用主窗口的创建、显示、隐藏和销毁
 */
class WindowManager {
  // ==================== 私有属性 ====================
  private mainWindow: BrowserWindow | null = null;
  private isQuitting = false;

  // ==================== 窗口创建和初始化 ====================

  /**
   * 创建主窗口
   * 初始化应用的主窗口，设置窗口属性和事件处理
   * @returns 创建的主窗口实例
   */
  createMainWindow(): BrowserWindow {
    const iconPath = getAppIconPath();
    const userPrefs = preferencesManager.getPreferences();
    
    // 根据用户主题偏好确定窗口背景色
    const backgroundColor = this.getBackgroundColor(userPrefs.themeSource);
    
    // 创建浏览器窗口
    this.mainWindow = new BrowserWindow({
      width: CONSTANTS.WINDOW_DIMENSIONS.DEFAULT_WIDTH,
      height: CONSTANTS.WINDOW_DIMENSIONS.DEFAULT_HEIGHT,
      minHeight: CONSTANTS.WINDOW_DIMENSIONS.MIN_HEIGHT,
      minWidth: CONSTANTS.WINDOW_DIMENSIONS.MIN_WIDTH,
      icon: iconPath || undefined, // 为窗口设置图标，这样会在任务栏显示
      show: !userPrefs.startMinimized, // 如果设置了启动时最小化，则不显示窗口
      autoHideMenuBar: true, // 隐藏菜单栏
      backgroundColor: backgroundColor, // 设置窗口背景色，防止拖拽时显示白色
      webPreferences: {
        preload: join(__dirname, '..', 'preload.js'), // 预加载脚本
        nodeIntegration: false, // 禁用 Node.js 集成
        contextIsolation: true, // 启用上下文隔离
        devTools: true, // 允许使用开发者工具（生产环境也可用）
      }
    });

    this.setupWindowEvents();
    this.loadContent();
    this.setupReadyToShowHandler(userPrefs.startMinimized);

    return this.mainWindow;
  }

  /**
   * 根据主题源获取背景色
   * @param themeSource 主题来源
   * @returns 背景色字符串
   */
  private getBackgroundColor(themeSource: string): string {
    switch (themeSource) {
      case 'dark':
        return CONSTANTS.BACKGROUND_COLORS.DARK;
      case 'light':
        return CONSTANTS.BACKGROUND_COLORS.LIGHT;
      default:
        return CONSTANTS.BACKGROUND_COLORS.LIGHT; // 默认使用浅色，系统主题会在渲染进程中处理
    }
  }

  /**
   * 设置窗口事件监听器
   */
  private setupWindowEvents(): void {
    if (!this.mainWindow) return;

    // 处理窗口关闭事件
    this.mainWindow.on('close', (event) => this.handleWindowClose(event));

    // 开发者工具支持
    this.setupDevToolsShortcuts();
  }

  /**
   * 设置开发者工具快捷键
   */
  private setupDevToolsShortcuts(): void {
    if (!this.mainWindow) return;

    this.mainWindow.webContents.on('before-input-event', (event, input) => {
      // Shift + F12 打开开发者工具（生产环境可用）
      if (input.shift && input.key === 'F12') {
        this.mainWindow?.webContents.toggleDevTools();
      }
      
      // 开发环境下的额外快捷键
      if (process.env.NODE_ENV === 'development') {
        if ((input.key === 'F12') || 
            (input.control && input.shift && input.key === 'I')) {
          this.mainWindow?.webContents.toggleDevTools();
        }
      }
    });
  }

  /**
   * 设置窗口准备显示时的处理逻辑
   * @param startMinimized 是否启动时最小化
   */
  private setupReadyToShowHandler(startMinimized: boolean): void {
    if (!this.mainWindow) return;

    this.mainWindow.once('ready-to-show', () => {
      if (startMinimized) {
        console.log(CONSTANTS.LOG_MESSAGES.START_MINIMIZED);
        // 不显示窗口，直接保持隐藏状态
      } else {
        this.mainWindow?.show();
      }
    });
  }

  /**
   * 加载窗口内容
   */
  private loadContent(): void {
    if (!this.mainWindow) return;

    if (process.env.NODE_ENV === 'development') {
      // 开发环境：加载开发服务器页面
      const rendererPort = process.argv[2];
      this.mainWindow.loadURL(`http://localhost:${rendererPort}`);
    } else {
      // 生产环境：加载打包后的静态文件
      this.mainWindow.loadFile(join(app.getAppPath(), 'renderer', 'index.html'));
    }
  }

  // ==================== 窗口显示和隐藏 ====================

  /**
   * 显示主窗口
   */
  showMainWindow(): void {
    if (!this.mainWindow) return;

    this.restoreWindowIfMinimized();
    this.showAndFocusWindow();
  }

  /**
   * 隐藏主窗口
   */
  hideMainWindow(): void {
    if (this.mainWindow) {
      this.mainWindow.hide();
    }
  }

  /**
   * 隐藏到托盘（专门用于隐藏到系统托盘的方法）
   */
  private hideToTray(): void {
    if (this.mainWindow) {
      this.mainWindow.hide();
      
      // 在 macOS 下显示通知提醒用户应用已最小化到托盘
      if (process.platform === 'darwin') {
        // 可以在这里添加系统通知，提醒用户应用已最小化到托盘
        // 用户可以通过托盘图标或 Dock 图标重新打开
      }
    }
  }

  /**
   * 恢复最小化的窗口
   */
  private restoreWindowIfMinimized(): void {
    if (this.mainWindow?.isMinimized()) {
      this.mainWindow.restore();
    }
  }

  /**
   * 显示窗口并获取焦点
   */
  private showAndFocusWindow(): void {
    if (!this.mainWindow) return;

    this.mainWindow.show();
    this.mainWindow.focus();

    // 在 macOS 下，确保应用出现在前台
    if (process.platform === 'darwin') {
      app.focus({ steal: true });
    }
  }

  // ==================== 窗口关闭处理 ====================

  /**
   * 处理窗口关闭事件
   * @param event 关闭事件对象
   */
  private async handleWindowClose(event: Electron.Event): Promise<void> {
    // 如果应用正在退出，直接返回
    if (this.isQuitting) {
      return;
    }

    // 阻止默认关闭行为
    event.preventDefault();

    const userPrefs = preferencesManager.getPreferences();
    
    // 如果用户设置了固定行为，直接执行保存的操作
    if (userPrefs.closeBehaviorMode === 'fixed') {
      this.executeFixedCloseBehavior(userPrefs.closeAction);
      return;
    }

    // 显示关闭确认对话框
    const result = await this.showCloseConfirmationDialog();
    
    // 用户选择取消
    if (result.response === 2) {
      return;
    }

    // 保存用户偏好设置
    this.saveUserClosePreference(result);

    // 根据用户选择执行相应操作
    this.executeCloseAction(result.response);
  }

  /**
   * 执行固定的关闭行为
   * @param closeAction 关闭动作
   */
  private executeFixedCloseBehavior(closeAction: string): void {
    console.log(CONSTANTS.LOG_MESSAGES.CLOSE_BEHAVIOR_EXECUTED, closeAction);
    if (closeAction === 'minimize') {
      this.hideToTray();
    } else {
      this.quitApplication();
    }
  }

  /**
   * 显示关闭确认对话框
   * @returns 对话框结果
   */
  private async showCloseConfirmationDialog() {
    return await dialog.showMessageBox(this.mainWindow!, {
      type: 'question',
      buttons: [CONSTANTS.DIALOG_BUTTONS.QUIT, CONSTANTS.DIALOG_BUTTONS.MINIMIZE, CONSTANTS.DIALOG_BUTTONS.CANCEL],
      defaultId: 0,
      cancelId: 2,
      title: CONSTANTS.DIALOG_MESSAGES.TITLE,
      message: CONSTANTS.DIALOG_MESSAGES.MESSAGE,
      detail: CONSTANTS.DIALOG_MESSAGES.DETAIL,
      checkboxLabel: CONSTANTS.DIALOG_MESSAGES.CHECKBOX_LABEL,
      checkboxChecked: false
    });
  }

  /**
   * 保存用户关闭偏好设置
   * @param result 对话框结果
   */
  private saveUserClosePreference(result: Electron.MessageBoxReturnValue): void {
    if (result.checkboxChecked) {
      const closeAction = result.response === 0 ? 'quit' : 'minimize';
      console.log(CONSTANTS.LOG_MESSAGES.USER_PREFERENCE_SAVED, closeAction);
      preferencesManager.updatePreferences({
        closeBehaviorMode: 'fixed',
        closeAction: closeAction
      });
    }
  }

  /**
   * 执行关闭操作
   * @param response 用户选择的响应
   */
  private executeCloseAction(response: number): void {
    if (response === 0) {
      this.quitApplication();
    } else if (response === 1) {
      this.hideToTray();
    }
  }

  // ==================== 应用退出管理 ====================

  /**
   * 设置退出状态
   * @param isQuitting 是否正在退出
   */
  setQuitting(isQuitting: boolean): void {
    this.isQuitting = isQuitting;
  }

  /**
   * 退出应用程序
   */
  private quitApplication(): void {
    console.log(CONSTANTS.LOG_MESSAGES.QUIT_START);
    this.isQuitting = true;
    
    // 确保窗口关闭
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.destroy();
      this.mainWindow = null;
    }
    
    // 触发应用退出
    app.quit();
  }

  /**
   * 销毁窗口
   */
  destroy(): void {
    if (this.mainWindow) {
      this.mainWindow.destroy();
      this.mainWindow = null;
    }
  }

  // ==================== 窗口信息获取 ====================

  /**
   * 获取主窗口实例
   * @returns 主窗口实例或 null
   */
  getMainWindow(): BrowserWindow | null {
    return this.mainWindow;
  }

  /**
   * 获取窗口尺寸信息
   * @returns 窗口尺寸对象或 null
   */
  getWindowSize(): { width: number; height: number } | null {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      return null;
    }
    
    const [width, height] = this.mainWindow.getSize();
    return { width, height };
  }

  /**
   * 获取窗口内容区域尺寸
   * @returns 内容区域尺寸对象或 null
   */
  getContentSize(): { width: number; height: number } | null {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      return null;
    }
    
    const [width, height] = this.mainWindow.getContentSize();
    return { width, height };
  }
}

// 单例模式导出
export const windowManager = new WindowManager();
