import { BrowserWindow, dialog, app } from 'electron';
import { join } from 'path';
import { getAppIconPath } from './utils';
import { preferencesManager } from './preferences-manager';

/**
 * 窗口管理器
 */
class WindowManager {
  private mainWindow: BrowserWindow | null = null;
  private isQuitting = false;

  /**
   * 创建主窗口
   * 初始化应用的主窗口，设置窗口属性和事件处理
   */  createMainWindow(): BrowserWindow {
    const iconPath = getAppIconPath();
    const userPrefs = preferencesManager.getPreferences();
    
    // 根据用户主题偏好确定窗口背景色
    const backgroundColor = userPrefs.themeSource === 'dark' 
      ? '#101014' 
      : userPrefs.themeSource === 'light' 
        ? '#ffffff' 
        : '#ffffff'; // 默认使用浅色，系统主题会在渲染进程中处理
    
    // 创建浏览器窗口
    this.mainWindow = new BrowserWindow({
      width: 1080,
      height: 720,
      minHeight: 600,
      minWidth: 800,
      icon: iconPath || undefined, // 为窗口设置图标，这样会在任务栏显示
      show: !userPrefs.startMinimized, // 如果设置了启动时最小化，则不显示窗口
      autoHideMenuBar: true, // 隐藏菜单栏
      backgroundColor: backgroundColor, // 设置窗口背景色，防止拖拽时显示白色
      webPreferences: {
        preload: join(__dirname, '..', 'preload.js'), // 预加载脚本
        nodeIntegration: false, // 禁用 Node.js 集成
        contextIsolation: true, // 启用上下文隔离
        devTools: process.env.NODE_ENV === 'development', // 开发模式下启用开发者工具
      }
    });

    // 处理窗口关闭事件
    this.mainWindow.on('close', (event) => this.handleWindowClose(event));

    // 开发模式下的开发者工具支持
    if (process.env.NODE_ENV === 'development') {
      // 设置快捷键来打开开发者工具
      this.mainWindow.webContents.on('before-input-event', (event, input) => {
        // F12 或 Ctrl+Shift+I 打开开发者工具
        if ((input.key === 'F12') || 
            (input.control && input.shift && input.key === 'I')) {
          this.mainWindow?.webContents.toggleDevTools();
        }
      });

      // 窗口加载完成后，可以选择自动打开开发者工具（注释掉，按需启用）
      // this.mainWindow.webContents.once('did-finish-load', () => {
      //   this.mainWindow?.webContents.openDevTools();
      // });
    }

    // 根据环境加载不同的页面
    this.loadContent();

    // 如果设置了启动时最小化，窗口准备好后隐藏到托盘
    if (userPrefs.startMinimized) {
      this.mainWindow.once('ready-to-show', () => {
        console.log('应用启动时最小化到托盘');
        // 不显示窗口，直接保持隐藏状态
      });
    } else {
      this.mainWindow.once('ready-to-show', () => {
        this.mainWindow?.show();
      });
    }

    return this.mainWindow;
  }

  /**
   * 处理窗口关闭事件
   */
  private async handleWindowClose(event: Electron.Event) {
    // 如果应用正在退出，直接返回
    if (this.isQuitting) {
      return;
    }

    // 阻止默认关闭行为
    event.preventDefault();

    const userPrefs = preferencesManager.getPreferences();    // 如果用户设置了固定行为，直接执行保存的操作
    if (userPrefs.closeBehaviorMode === 'fixed') {
      console.log(`执行用户保存的关闭行为: ${userPrefs.closeAction}`);
      if (userPrefs.closeAction === 'minimize') {
        this.hideToTray(); // 隐藏到托盘
      } else {
        this.quitApplication(); // 直接退出
      }
      return;
    }

    // 显示关闭确认对话框
    const result = await dialog.showMessageBox(this.mainWindow!, {
      type: 'question',
      buttons: ['退出', '最小化到托盘', '取消'],
      defaultId: 0,
      cancelId: 2,
      title: '确认操作',
      message: '您想要退出应用程序还是最小化到系统托盘？',
      detail: '最小化到托盘后，应用程序将在后台继续运行。',
      checkboxLabel: '不再显示此对话框',
      checkboxChecked: false
    });

    // 用户选择取消
    if (result.response === 2) {
      return;
    }

    // 保存用户偏好设置
    if (result.checkboxChecked) {      // 修复：正确保存用户选择
      const closeAction = result.response === 0 ? 'quit' : 'minimize';
      console.log(`用户选择记住关闭行为: ${closeAction}`);
      preferencesManager.updatePreferences({
        closeBehaviorMode: 'fixed',
        closeAction: closeAction
      });
    }

    // 根据用户选择执行相应操作
    if (result.response === 0) {
      // 退出应用
      this.quitApplication();
    } else if (result.response === 1) {
      // 最小化到托盘
      this.hideToTray();
    }
  }

  /**
   * 加载窗口内容
   */
  private loadContent() {
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

  /**
   * 显示主窗口
   */
  showMainWindow() {
    if (this.mainWindow) {
      // 在 macOS 下，确保窗口能够正确显示和获得焦点
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
   * 隐藏主窗口
   */
  hideMainWindow() {
    if (this.mainWindow) {
      this.mainWindow.hide();
    }
  }

  /**
   * 隐藏到托盘（专门用于隐藏到系统托盘的方法）
   */
  private hideToTray() {
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
   * 获取主窗口实例
   */
  getMainWindow(): BrowserWindow | null {
    return this.mainWindow;
  }

  /**
   * 获取窗口尺寸信息
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
   */
  getContentSize(): { width: number; height: number } | null {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      return null;
    }
    
    const [width, height] = this.mainWindow.getContentSize();
    return { width, height };
  }

  /**
   * 设置退出状态
   */
  setQuitting(isQuitting: boolean) {
    this.isQuitting = isQuitting;
  }

  /**
   * 退出应用程序
   */
  private quitApplication() {
    console.log('开始退出应用程序...');
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
  destroy() {
    if (this.mainWindow) {
      this.mainWindow.destroy();
      this.mainWindow = null;
    }
  }
}

// 单例模式
export const windowManager = new WindowManager();
