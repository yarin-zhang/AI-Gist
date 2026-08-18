import { createApp } from 'vue'
import App from './App.vue'
import i18n from './i18n'
import { initDatabase, databaseService, cloudSyncService, automaticBackupService } from './lib/services'
import { applyDocumentLocale, resolveInitialLocale } from './i18n/locale-detection'
import { PlatformDetector } from '@shared/platform'
import './tailwind.css'
import './assets/scss/index.scss'
import { setupMobileDebug } from './utils/mobile-debug'
import { installWebRuntimeBridge } from './lib/platform/web-runtime-bridge'
import { applyDocumentTheme, getSystemThemePreference, resolveTheme, type ThemeSource } from './theme/runtime'

installWebRuntimeBridge()
document.documentElement.classList.toggle('desktop-shell', PlatformDetector.isDesktopShell())
document.documentElement.classList.toggle('mobile-shell', PlatformDetector.isMobileShell())
const isLauncherSurface = new URLSearchParams(window.location.search).get('surface') === 'launcher'
if (isLauncherSurface) {
  document.documentElement.classList.add('ai-gist-launcher')
  document.body.classList.add('ai-gist-launcher')
}
// 设置移动端调试
setupMobileDebug()

// 初始化语言设置
function initLocale() {
  const locale = resolveInitialLocale()
  i18n.global.locale.value = locale
  applyDocumentLocale(locale)
  console.log(`应用语言设置: ${locale}`)
}

// 预设初始主题类，避免闪烁
function setInitialTheme() {
  const savedTheme = localStorage.getItem('theme') as ThemeSource | null
  const source = savedTheme && ['system', 'light', 'dark'].includes(savedTheme) ? savedTheme : 'system'
  applyDocumentTheme(
    resolveTheme(source, getSystemThemePreference()),
    PlatformDetector.isMobileShell() ? 'mobile' : 'desktop'
  )
}

// 移除初始加载屏幕（同时隐藏原生 SplashScreen）
async function removeInitialLoading() {
  // 移动端：隐藏 Capacitor 原生启动屏
  if (PlatformDetector.isMobile()) {
    try {
      const { SplashScreen } = await import('@capacitor/splash-screen')
      await SplashScreen.hide({ fadeOutDuration: 300 })
    } catch (e) {
      console.warn('[Main] SplashScreen.hide 失败:', e)
    }
  }

  const loadingElement = document.getElementById('initial-loading')
  if (loadingElement) {
    loadingElement.classList.add('loading-hidden')
    setTimeout(() => {
      if (loadingElement.parentNode) {
        loadingElement.parentNode.removeChild(loadingElement)
      }
    }, 300) // 等待淡出动画完成
  }
}

// 初始化数据库，然后启动应用
async function startApp() {
  try {
    // 立即设置初始主题和语言
    setInitialTheme()
    initLocale()
    
    await initDatabase();
    console.log('IndexedDB initialized successfully');
    
    // 将数据库服务暴露到 window 对象上，供主进程访问
    (window as any).databaseAPI = {
      databaseServiceManager: databaseService,
      
      // 数据导出方法
      exportAllData: async () => {
        return await databaseService.exportAllData();
      },

      exportAllDataForBackup: async () => {
        return await databaseService.exportAllDataForBackup();
      },
      
      // 数据导入方法
      importData: async (data: any) => {
        return await databaseService.importData(data);
      },
      
      // 数据导入对象方法（主进程调用）
      importDataObject: async (data: any) => {
        return await databaseService.importData(data);
      },
      
      // 同步数据导入方法（用于WebDAV同步）
      syncImportDataObject: async (data: any) => {
        return await databaseService.syncImportData(data);
      },
      
      // 数据备份方法
      backupData: async () => {
        return await databaseService.backupData();
      },
      
      // 数据恢复方法
      restoreData: async (backupData: any) => {
        return await databaseService.restoreData(backupData);
      },
      
      // 数据完全替换方法
      replaceAllData: async (backupData: any) => {
        return await databaseService.replaceAllData(backupData);
      },
      
      // 健康检查方法
      getHealthStatus: async () => {
        return await databaseService.getHealthStatus();
      },
      
      // 获取统计信息
      getStats: async () => {
        try {
          const result = await databaseService.getDataStatistics();
          if (result.success) {
            return {
              success: true,
              stats: result.data
            };
          } else {
            return {
              success: false,
              error: result.error || '获取数据统计失败'
            };
          }
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : '未知错误'
          };
        }
      }
    };
    console.log('数据库服务已暴露到 window.databaseAPI');

    // 数据库服务已经暴露，不再需要单独的 IPC 处理器

    const app = createApp(App);
    app.use(i18n);

    // 条件注册 Ionic 和路由（原生移动端 + Web 移动浏览器）
    if (PlatformDetector.isMobileShell()) {
      console.log('📱 [Main] 检测到移动壳环境，开始加载 Ionic')
      const { setupIonic } = await import('./setup-ionic');
      setupIonic(app);

      const mobileRouter = await import('./router/mobile');
      app.use(mobileRouter.default);
      await mobileRouter.default.isReady();

      if (PlatformDetector.isMobile()) {
        // 激活 Capacitor 返回键桥接
        // AppPlugin.java 中 hasListeners = true 后，native 才会触发 backbutton DOM 事件，
        // 进而被 Ionic 的 startHardwareBackButton() 接管并派发 ionBackButton 事件
        const { App: CapApp } = await import('@capacitor/app');
        CapApp.addListener('backButton', () => { /* 由 Ionic 事件系统统一处理 */ });
      }
    }

    app.mount('#app');

    if (!isLauncherSurface) {
      await cloudSyncService.startAutoSyncFromSettings({
        platform: PlatformDetector.getPlatform(),
        deviceName: navigator.userAgent,
        startupDelayMs: PlatformDetector.isMobile() ? 0 : undefined
      });
      await automaticBackupService.startFromSettings();

      if (PlatformDetector.isElectron() && window.electronAPI.lifecycle) {
        window.electronAPI.lifecycle.onFlushRequested(({ timeoutMs }) => {
          const backupFlush = automaticBackupService.flushPendingBackup({ reason: 'shutdown', timeoutMs });
          const syncFlush = cloudSyncService.flushPendingSync({ reason: 'shutdown', timeoutMs });
          return Promise.allSettled([backupFlush, syncFlush]);
        });
      }

      if (!PlatformDetector.isMobile()) {
        window.addEventListener('blur', () => {
          void automaticBackupService.flushPendingBackup({ reason: 'blur', timeoutMs: 1500 });
        });
        window.addEventListener('pagehide', () => {
          void automaticBackupService.flushPendingBackup({ reason: 'background', timeoutMs: 1500 });
        });
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'hidden') {
            void automaticBackupService.flushPendingBackup({ reason: 'background', timeoutMs: 1500 });
          }
        });
      }

      if (PlatformDetector.isMobile()) {
        const { App: CapApp } = await import('@capacitor/app');
        CapApp.addListener('appStateChange', ({ isActive }) => {
          if (isActive) {
            cloudSyncService.scheduleSync('resume', { delayMs: 0 });
          } else {
            const backupFlush = automaticBackupService.flushPendingBackup({ reason: 'background', timeoutMs: 3000 });
            const syncFlush = cloudSyncService.flushPendingSync({ reason: 'background', timeoutMs: 3000 });
            void Promise.allSettled([backupFlush, syncFlush]);
          }
        });
      }
    }

    // Vue 应用挂载完成后移除加载屏幕
    removeInitialLoading();
  } catch (error) {
    console.error('Failed to initialize database:', error);
    // 即使数据库初始化失败，也要启动应用
    const app = createApp(App);
    app.use(i18n);

    // 条件注册 Ionic 和路由（原生移动端 + Web 移动浏览器）
    if (PlatformDetector.isMobileShell()) {
      // console.log('📱 [Main] 检测到移动壳环境，开始加载 Ionic')
      const { setupIonic } = await import('./setup-ionic');
      setupIonic(app);

      const mobileRouter = await import('./router/mobile');
      app.use(mobileRouter.default);
      await mobileRouter.default.isReady();

      if (PlatformDetector.isMobile()) {
        const { App: CapApp } = await import('@capacitor/app');
        CapApp.addListener('backButton', () => { /* 由 Ionic 事件系统统一处理 */ });
      }
    }

    app.mount('#app');

    // 移除加载屏幕
    removeInitialLoading();
  }
}

startApp();
