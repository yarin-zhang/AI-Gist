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
   */
  createMainWindow(): BrowserWindow {
    const iconPath = getAppIconPath();
    
    // 创建浏览器窗口
    this.mainWindow = new BrowserWindow({
      width: 800,
      height: 600,
      icon: iconPath || undefined, // 为窗口设置图标，这样会在任务栏显示
      webPreferences: {
        preload: join(__dirname, '..', 'preload.js'), // 预加载脚本
        nodeIntegration: false, // 禁用 Node.js 集成
        contextIsolation: true, // 启用上下文隔离
      }
    });

    // 处理窗口关闭事件
    this.mainWindow.on('close', (event) => this.handleWindowClose(event));

    // 根据环境加载不同的页面
    this.loadContent();

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

    const userPrefs = preferencesManager.getPreferences();

    // 如果用户设置了不再提示，直接执行保存的操作
    if (userPrefs.dontShowCloseDialog) {
      if (userPrefs.closeAction === 'minimize') {
        this.mainWindow?.hide(); // 隐藏到托盘
      } else {
        this.quitApplication();
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
    if (result.checkboxChecked) {
      preferencesManager.updatePreferences({
        dontShowCloseDialog: true,
        closeAction: result.response === 0 ? 'quit' : 'minimize'
      });
    }

    // 根据用户选择执行相应操作
    if (result.response === 0) {
      // 退出应用
      this.quitApplication();
    } else if (result.response === 1) {
      // 最小化到托盘
      this.mainWindow?.hide();
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
      this.mainWindow.show();
      this.mainWindow.focus();
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
   * 获取主窗口实例
   */
  getMainWindow(): BrowserWindow | null {
    return this.mainWindow;
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
    this.isQuitting = true;
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
