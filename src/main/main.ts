import { app, BrowserWindow, session } from 'electron';
import { 
  windowManager, 
  trayManager, 
  ipcHandlers 
} from './electron';

// 全局变量定义
let isQuitting = false; // 标记应用是否正在退出

// 应用准备就绪时的初始化流程
app.whenReady().then(async () => {
  console.log('应用启动中...');

  // 初始化 IPC 处理器
  ipcHandlers.initialize();

  // 创建主窗口
  const mainWindow = windowManager.createMainWindow();
  
  // 创建系统托盘并设置主窗口引用
  trayManager.setMainWindow(mainWindow);
  trayManager.setQuitCallback(() => {
    isQuitting = true;
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
    }
  });
});

// 所有窗口关闭时的处理
app.on('window-all-closed', async function () {
  // 在 Windows 和 Linux 上，如果有托盘图标，不退出应用
  if (process.platform !== 'darwin' && !trayManager.getTray()) {
    app.quit();
  }
});

// 应用即将退出时的处理
app.on('before-quit', () => {
  isQuitting = true;
  windowManager.setQuitting(true);
  
  // 清理资源
  ipcHandlers.cleanup();
  trayManager.destroy();
});