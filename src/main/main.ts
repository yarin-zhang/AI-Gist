import { app, BrowserWindow, session, Menu } from 'electron';
import { 
  windowManager, 
  trayManager, 
  ipcHandlers,
  themeManager,
  preferencesManager,
  singleInstanceManager,
} from './electron';
import { 
  DataManagementService
} from './data';


// 全局变量定义
let isQuitting = false; // 标记应用是否正在退出
let dataManagementService: DataManagementService;

// 防止多重启动 - 初始化单实例管理器
singleInstanceManager.initialize();

// 应用准备就绪时的初始化流程
app.whenReady().then(async () => {
  console.log('应用启动中...');

  // 移除应用菜单栏
  Menu.setApplicationMenu(null);

  // 应用偏好设置（在创建窗口之前）
  preferencesManager.applyAllSettings();
  // 初始化主题管理器
  themeManager.initialize();  // 初始化新的服务（在 IPC 处理器之前）
  dataManagementService = new DataManagementService(app.getPath('userData'));
  
  // 初始化 IPC 处理器（放在服务初始化之后）
  ipcHandlers.initialize();
  
  // 创建主窗口
  const mainWindow = windowManager.createMainWindow();
  
  // 设置主题管理器的主窗口引用
  themeManager.setMainWindow(mainWindow);
  
  // 创建系统托盘并设置主窗口引用
  trayManager.setMainWindow(mainWindow);
  trayManager.setQuitCallback(() => {
    console.log('从托盘触发退出...');
    isQuitting = true;
    windowManager.setQuitting(true);
    app.quit();
  });
  // 设置显示窗口回调，使用 windowManager 的方法
  trayManager.setShowWindowCallback(() => {
    windowManager.showMainWindow();
  });
  trayManager.createTray();

  // 设置内容安全策略
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': ['script-src \'self\'']
      }
    })
  })

  // macOS 特有：当点击 dock 图标且没有窗口打开时，重新创建窗口
  // 或者当点击 dock 图标时，显示已存在的窗口
  app.on('activate', function () {
    const mainWindow = windowManager.getMainWindow();
    if (mainWindow) {
      // 如果主窗口存在但被隐藏，则显示它
      windowManager.showMainWindow();
    } else if (BrowserWindow.getAllWindows().length === 0) {
      // 如果没有窗口，则创建新窗口
      const newWindow = windowManager.createMainWindow();
      trayManager.setMainWindow(newWindow);
      themeManager.setMainWindow(newWindow);
    }
  });

  // 窗口加载完成后，通知当前主题
  mainWindow.webContents.once('did-finish-load', () => {
    console.log('主窗口加载完成，通知当前主题');
    themeManager.notifyCurrentTheme();
  });
});

// 所有窗口关闭时的处理
app.on('window-all-closed', function () {
  console.log('所有窗口已关闭');
  // 在 Windows 和 Linux 上，如果没有托盘图标，则退出应用
  // 在 macOS 上，通常保持应用运行，除非用户明确选择退出
  if (process.platform !== 'darwin') {
    if (!trayManager.getTray() || isQuitting) {
      console.log('退出应用程序');
      app.quit();
    }
  }
});

// 应用即将退出时的处理
app.on('before-quit', () => {
  console.log('应用即将退出，清理资源...');
  isQuitting = true;
  windowManager.setQuitting(true);
  
  // 清理资源
  ipcHandlers.cleanup();
  trayManager.destroy();
  themeManager.cleanup();
  
  // 强制销毁所有窗口
  const allWindows = BrowserWindow.getAllWindows();
  allWindows.forEach(window => {
    if (!window.isDestroyed()) {
      window.destroy();
    }
  });
});