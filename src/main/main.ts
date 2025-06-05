import { app, BrowserWindow, session, dialog } from 'electron';
// import { initDatabase, closeDatabase } from './database';
import { 
  windowManager, 
  trayManager, 
  ipcHandlers 
} from './electron';

// 全局变量定义
let isQuitting = false; // 标记应用是否正在退出

/**
 * 初始化数据库
 * @returns Promise<boolean> 初始化是否成功
 */
async function initializeDatabase(): Promise<boolean> {
  try {
    console.log('数据库已迁移到 IndexedDB，主进程不再需要数据库初始化');
    // await initDatabase();
    
    console.log('数据库初始化成功');
    return true;
  } catch (error) {
    console.error('数据库初始化失败:', error);
    
    // 显示数据库初始化失败的错误对话框
    const mainWindow = windowManager.getMainWindow();
    if (mainWindow) {
      dialog.showErrorBox(
        '数据库初始化失败',
        `应用程序无法初始化数据库。错误信息：\n${error instanceof Error ? error.message : String(error)}\n\n请尝试重新启动应用程序。如果问题持续存在，请联系技术支持。`
      );
    }
    
    return false;
  }
}

// 应用准备就绪时的初始化流程
app.whenReady().then(async () => {
  // 初始化数据库
  const dbInitialized = await initializeDatabase();
  if (!dbInitialized) {
    // 延迟退出，让用户看到错误信息
    setTimeout(() => {
      app.quit();
    }, 3000);
    return;
  }

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
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) {
      windowManager.createMainWindow();
    }
  });
});

// 所有窗口关闭时的处理
app.on('window-all-closed', async function () {
  // 关闭数据库连接（数据已迁移到 IndexedDB）
  // await closeDatabase();
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