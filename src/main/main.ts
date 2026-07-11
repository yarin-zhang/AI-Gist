import { app, BrowserWindow, session, Menu, ipcMain, powerMonitor } from 'electron';
import { randomUUID } from 'crypto';
import { 
  windowManager, 
  trayManager, 
  ipcHandlers,
  themeManager,
  preferencesManager,
  singleInstanceManager,
  NetworkProxyManager,
} from './electron';
import { ShortcutManager } from './electron/shortcut-manager';
import { 
  dataManagementService
} from './data';
import { CloudBackupManager } from './cloud/cloud-backup-manager';

// 全局变量定义
let isQuitting = false; // 标记应用是否正在退出
let cloudBackupManager: CloudBackupManager;
let quitFlushCompleted = false;
let quitFlushInProgress = false;
let resourcesCleaned = false;

async function requestRendererSyncFlush(timeoutMs = 5000): Promise<void> {
  const mainWindow = windowManager.getMainWindow();
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return;

  const id = randomUUID();
  await new Promise<void>(resolve => {
    const timer = setTimeout(() => {
      ipcMain.removeListener('cloud-sync:flush-response', onResponse);
      resolve();
    }, timeoutMs + 250);
    const onResponse = (_event: Electron.IpcMainEvent, response: { id?: string }) => {
      if (response?.id !== id) return;
      clearTimeout(timer);
      ipcMain.removeListener('cloud-sync:flush-response', onResponse);
      resolve();
    };
    ipcMain.on('cloud-sync:flush-response', onResponse);
    mainWindow.webContents.send('cloud-sync:flush-request', { id, reason: 'shutdown', timeoutMs });
  });
}

function cleanupResources(): void {
  if (resourcesCleaned) return;
  resourcesCleaned = true;
  ipcHandlers.cleanup();
  trayManager.destroy();
  themeManager.cleanup();
}

function beginGracefulQuit(timeoutMs: number, source: string): void {
  if (quitFlushCompleted || quitFlushInProgress) return;
  quitFlushInProgress = true;
  console.log(`${source}，刷新待同步数据...`);
  isQuitting = true;
  windowManager.setQuitting(true);
  void requestRendererSyncFlush(timeoutMs).finally(() => {
    quitFlushCompleted = true;
    quitFlushInProgress = false;
    app.quit();
  });
}

function attachSystemSessionEndHandler(window: BrowserWindow): void {
  window.on('session-end', () => {
    // Electron 32 的 Windows session-end 不可阻塞，只能做最后一次尽力刷新。
    void requestRendererSyncFlush(3000);
  });
}

// 防止多重启动 - 初始化单实例管理器
singleInstanceManager.initialize();



// 应用准备就绪时的初始化流程
app.whenReady().then(async () => {
  console.log('应用启动中...');

  // 配置网络代理设置
  try {
    const userPrefs = preferencesManager.getPreferences();
    const proxyConfig = userPrefs.networkProxy;
    
    if (proxyConfig) {
      await NetworkProxyManager.initialize(proxyConfig);
    } else {
      // 如果没有用户配置，使用系统代理
      await NetworkProxyManager.initialize({ mode: 'system' });
    }
  } catch (error) {
    console.error('初始化网络代理配置失败:', error);
    // 如果配置失败，使用系统代理作为后备
    await NetworkProxyManager.initialize({ mode: 'system' });
  }

  // 移除应用菜单栏
  Menu.setApplicationMenu(null);

  // 应用偏好设置（在创建窗口之前）
  preferencesManager.applyAllSettings();
  // 初始化主题管理器
  themeManager.initialize();  // 初始化新的服务（在 IPC 处理器之前）
  
  // 初始化云端备份管理器
  cloudBackupManager = new CloudBackupManager(dataManagementService);
  
  // 初始化 IPC 处理器（放在服务初始化之后）
  ipcHandlers.initialize();
  
  // 创建主窗口
  const mainWindow = windowManager.createMainWindow();
  attachSystemSessionEndHandler(mainWindow);
  (powerMonitor as any).on('shutdown', (event: Electron.Event) => {
    // Electron 32 的类型声明缺少事件参数，但 Linux/macOS 运行时支持阻止关机以便限时清理。
    event.preventDefault();
    beginGracefulQuit(3000, '系统即将关机');
  });
  
  // 设置主题管理器的主窗口引用
  themeManager.setMainWindow(mainWindow);
  
  // 初始化快捷键管理器
  const shortcutManager = ShortcutManager.getInstance();
  shortcutManager.setMainWindow(mainWindow);
  await shortcutManager.initialize();
  
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

  // 设置内容安全策略 - 允许 vue-i18n 正常工作
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': ['script-src \'self\' \'unsafe-eval\'']
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
      attachSystemSessionEndHandler(newWindow);
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
app.on('before-quit', (event) => {
  if (quitFlushCompleted) {
    cleanupResources();
    return;
  }

  event.preventDefault();
  beginGracefulQuit(5000, '应用即将退出');
});
