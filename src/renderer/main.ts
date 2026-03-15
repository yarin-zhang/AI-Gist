import { createApp } from 'vue'
import App from './App.vue'
import i18n from './i18n'
import { initDatabase, databaseService } from './lib/services'
import type { SupportedLocale } from '@shared/types/preferences'
import { PlatformDetector } from '@shared/platform'
import './tailwind.css'
import './assets/scss/index.scss'
import { setupMobileDebug } from './utils/mobile-debug'

// 设置移动端调试
setupMobileDebug()

// 初始化语言设置
function initLocale() {
  const savedLocale = localStorage.getItem('locale')
  if (savedLocale && ['zh-CN', 'zh-TW', 'en-US', 'ja-JP'].includes(savedLocale)) {
    i18n.global.locale.value = savedLocale as SupportedLocale
    console.log(`应用语言设置: ${savedLocale}`)
  } else {
    // 如果没有保存的语言设置，使用系统语言或默认语言
    const systemLocale = navigator.language
    if (systemLocale.startsWith('zh')) {
      // 根据系统语言判断是简体还是繁体
      if (systemLocale.includes('TW') || systemLocale.includes('HK')) {
        i18n.global.locale.value = 'zh-TW'
        localStorage.setItem('locale', 'zh-TW')
        console.log('检测到繁体中文系统，设置语言为: zh-TW')
      } else {
        i18n.global.locale.value = 'zh-CN'
        localStorage.setItem('locale', 'zh-CN')
        console.log('检测到简体中文系统，设置语言为: zh-CN')
      }
    } else if (systemLocale.startsWith('ja')) {
      i18n.global.locale.value = 'ja-JP'
      localStorage.setItem('locale', 'ja-JP')
      console.log('检测到日语系统，设置语言为: ja-JP')
    } else {
      i18n.global.locale.value = 'en-US'
      localStorage.setItem('locale', 'en-US')
      console.log('设置默认语言为: en-US')
    }
  }
}

// 预设初始主题类，避免闪烁
function setInitialTheme() {
  console.log('[Main] setInitialTheme 开始')

  const html = document.documentElement

  // 检查保存的主题设置
  const savedTheme = localStorage.getItem('theme') as 'system' | 'light' | 'dark' | null
  console.log('[Main] localStorage 中的主题:', savedTheme)

  let isDark = false

  if (savedTheme === 'dark') {
    isDark = true
    console.log('[Main] 使用保存的暗色主题')
  } else if (savedTheme === 'light') {
    isDark = false
    console.log('[Main] 使用保存的亮色主题')
  } else {
    // 默认或 system：检查系统主题偏好
    isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    console.log('[Main] 使用系统主题，检测到:', isDark ? 'dark' : 'light')
  }

  console.log('[Main] 应用主题前 html.classList:', html.classList.toString())

  // 根据 Ionic 官方文档，只需要在 html 元素上添加/移除 ion-palette-dark 类
  if (isDark) {
    html.classList.add('ion-palette-dark')
  } else {
    html.classList.remove('ion-palette-dark')
  }

  console.log('[Main] 应用主题后 html.classList:', html.classList.toString())
  console.log(`[Main] 预设主题完成: ${isDark ? 'dark' : 'light'} (来源: ${savedTheme || 'system'})`)
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

    // 条件注册 Ionic 和路由（仅移动端）
    if (PlatformDetector.isMobile()) {
      console.log('📱 [Main] 检测到移动端环境，开始加载 Ionic')
      const { setupIonic } = await import('./setup-ionic');
      setupIonic(app);

      const mobileRouter = await import('./router/mobile');
      app.use(mobileRouter.default);
      await mobileRouter.default.isReady();

      // 激活 Capacitor 返回键桥接
      // AppPlugin.java 中 hasListeners = true 后，native 才会触发 backbutton DOM 事件，
      // 进而被 Ionic 的 startHardwareBackButton() 接管并派发 ionBackButton 事件
      const { App: CapApp } = await import('@capacitor/app');
      CapApp.addListener('backButton', () => { /* 由 Ionic 事件系统统一处理 */ });
    }

    app.mount('#app');

    // Vue 应用挂载完成后移除加载屏幕
    removeInitialLoading();
  } catch (error) {
    console.error('Failed to initialize database:', error);
    // 即使数据库初始化失败，也要启动应用
    const app = createApp(App);
    app.use(i18n);

    // 条件注册 Ionic 和路由（仅移动端）
    if (PlatformDetector.isMobile()) {
      // console.log('📱 [Main] 检测到移动端环境，开始加载 Ionic')
      const { setupIonic } = await import('./setup-ionic');
      setupIonic(app);

      const mobileRouter = await import('./router/mobile');
      app.use(mobileRouter.default);
      await mobileRouter.default.isReady();

      const { App: CapApp } = await import('@capacitor/app');
      CapApp.addListener('backButton', () => { /* 由 Ionic 事件系统统一处理 */ });
    }

    app.mount('#app');

    // 移除加载屏幕
    removeInitialLoading();
  }
}

startApp();
