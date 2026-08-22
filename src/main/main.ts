import { app, BrowserWindow, session, Menu, powerMonitor } from 'electron';
import {
  windowManager,
  trayManager,
  ipcHandlers,
  themeManager,
  preferencesManager,
  singleInstanceManager,
  NetworkProxyManager,
  cliBridgeManager,
} from './electron';
import { quitFlushCoordinator } from './electron/quit-flush-coordinator';
import { ShortcutManager } from './electron/shortcut-manager';
import {
  dataManagementService
} from './data';
import { CloudBackupManager } from './cloud/cloud-backup-manager';

// 全局变量定义
let isQuitting = false; // 标记应用是否正在退出
let cloudBackupManager: CloudBackupManager;
let resourcesCleaned = false;

function cleanupResources(): void {
  if (resourcesCleaned) return;
  resourcesCleaned = true;
  ipcHandlers.cleanup();
  trayManager.destroy();
  themeManager.cleanup();
  ShortcutManager.getInstance().destroy();
}

/**
 * 触发一次"优雅退出"：不管是从哪条路径调用（窗口关闭选择彻底退出、托盘退出、
 * 系统关机、非 macOS 无托盘时的 window-all-closed），都统一交给
 * quitFlushCoordinator 处理——它会并行刷新渲染进程数据、停止本地 CLI 桥接
 * （并清理 ~/.ai-gist/cli-bridge.json），完成后才真正调用 app.quit()。
 * 这样"应用真的要退出时必须停止 CLI 桥接"这条契约只需要维护在一个地方，
 * 不需要每条退出路径各自记得去调用 cliBridgeManager.stop()。
 */
function beginGracefulQuit(timeoutMs: number, source: string): void {
  isQuitting = true;
  windowManager.setQuitting(true);
  quitFlushCoordinator.begin(timeoutMs, source, () => app.quit());
}

function attachSystemSessionEndHandler(window: BrowserWindow): void {
  window.on('session-end', () => {
    // Electron 32 的 Windows session-end 不可阻塞，只能做最后一次尽力刷新
    // （不涉及 CLI 桥接：会话结束不代表应用一定会退出）。
    void quitFlushCoordinator.requestRendererSyncFlush(3000);
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

  // 本地 CLI 桥接：若用户已在设置中开启，则随应用启动
  cliBridgeManager.setMainWindow(mainWindow);
  void cliBridgeManager.start();
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
      cliBridgeManager.setMainWindow(newWindow);
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
  if (quitFlushCoordinator.isFlushCompleted()) {
    cleanupResources();
    return;
  }

  event.preventDefault();
  beginGracefulQuit(5000, '应用即将退出');
});
