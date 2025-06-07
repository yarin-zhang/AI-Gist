import { createApp } from 'vue'
import App from './App.vue'
import { initDatabase } from './lib/db'
import { initDatabaseState } from './composables/useDatabase'

// 创建加载屏幕元素
function createLoadingScreen() {
  const loadingDiv = document.createElement('div')
  loadingDiv.id = 'loading-screen'
  loadingDiv.innerHTML = `
    <div style="
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: #fff;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      z-index: 9999;
    ">
      <div style="
        width: 40px;
        height: 40px;
        border: 3px solid #f3f3f3;
        border-top: 3px solid #3498db;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin-bottom: 20px;
      "></div>
      <div style="color: #666; font-size: 16px;">正在初始化数据库...</div>
    </div>
    <style>
      @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    </style>
  `
  document.body.appendChild(loadingDiv)
  return loadingDiv
}

// 移除加载屏幕
function removeLoadingScreen(loadingScreen: HTMLElement) {
  loadingScreen.style.opacity = '0'
  loadingScreen.style.transition = 'opacity 0.3s ease-out'
  setTimeout(() => {
    if (loadingScreen.parentNode) {
      loadingScreen.parentNode.removeChild(loadingScreen)
    }
  }, 300)
}

// 初始化数据库，然后启动应用
async function startApp() {
  const loadingScreen = createLoadingScreen()
    try {
    console.log('正在初始化数据库...')
    await initDatabase()
    await initDatabaseState()
    console.log('数据库初始化成功')
    
    // 移除加载屏幕
    removeLoadingScreen(loadingScreen)
    
    // 启动 Vue 应用
    const app = createApp(App)
    app.mount('#app')
    
    console.log('应用启动完成')
  } catch (error) {
    console.error('数据库初始化失败:', error)
    
    // 更新加载屏幕显示错误信息
    const errorDiv = loadingScreen.querySelector('div:last-child') as HTMLElement
    if (errorDiv) {
      errorDiv.innerHTML = `
        <div style="color: #e74c3c; font-size: 16px; text-align: center;">
          <div>数据库初始化失败</div>
          <div style="font-size: 14px; margin-top: 10px; opacity: 0.8;">
            ${error instanceof Error ? error.message : '未知错误'}
          </div>
          <div style="font-size: 12px; margin-top: 10px; opacity: 0.6;">
            应用将在 3 秒后尝试启动...
          </div>
        </div>
      `
    }
    
    // 等待 3 秒后仍然启动应用，但可能功能受限
    setTimeout(() => {
      removeLoadingScreen(loadingScreen)
      const app = createApp(App)
      app.mount('#app')
      console.log('应用已启动（数据库功能可能受限）')
    }, 3000)
  }
}

startApp()
