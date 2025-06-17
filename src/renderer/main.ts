import { createApp } from 'vue'
import App from './App.vue'
import { initDatabase, databaseServiceManager } from './lib/db'

// 预设初始主题类，避免闪烁
function setInitialTheme() {
  const html = document.documentElement
  const body = document.body
  
  // 检查系统主题偏好
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const themeClass = prefersDark ? 'dark' : 'light'
  
  // 立即应用主题类
  html.classList.add(themeClass)
  body.classList.add(themeClass)
  
  console.log(`预设主题: ${themeClass}`)
}

// 移除初始加载屏幕
function removeInitialLoading() {
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
    // 立即设置初始主题
    setInitialTheme()
    
    await initDatabase();
    console.log('IndexedDB initialized successfully');
    
    // 将数据库服务暴露到 window 对象上，供主进程访问
    (window as any).databaseAPI = {
      databaseServiceManager,
      
      // 数据导出方法
      exportAllData: async () => {
        return await databaseServiceManager.exportAllData();
      },
      
      // 数据导入方法
      importData: async (data: any) => {
        return await databaseServiceManager.importData(data);
      },
      
      // 数据备份方法
      backupData: async () => {
        return await databaseServiceManager.backupData();
      },
      
      // 数据恢复方法
      restoreData: async (backupData: any) => {
        return await databaseServiceManager.restoreData(backupData);
      },
      
      // 数据完全替换方法
      replaceAllData: async (backupData: any) => {
        return await databaseServiceManager.replaceAllData(backupData);
      },
      
      // 健康检查方法
      getHealthStatus: async () => {
        return await databaseServiceManager.getHealthStatus();
      },
      
      // 获取统计信息
      getStats: async () => {
        return await databaseServiceManager.getDatabaseStats();
      }
    };
    console.log('数据库服务已暴露到 window.databaseAPI');
    
    // 数据库服务已经暴露，不再需要单独的 IPC 处理器

    const app = createApp(App);
    app.mount('#app');
    
    // Vue 应用挂载完成后移除加载屏幕
    removeInitialLoading();
  } catch (error) {
    console.error('Failed to initialize database:', error);
    // 即使数据库初始化失败，也要启动应用
    const app = createApp(App);
    app.mount('#app');
    
    // 移除加载屏幕
    removeInitialLoading();
  }
}


startApp();
