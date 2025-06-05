import { createApp } from 'vue'
import App from './App.vue'
import { initDatabase } from './lib/db'

// 初始化数据库，然后启动应用
async function startApp() {
  try {
    await initDatabase();
    console.log('IndexedDB initialized successfully');
    
    const app = createApp(App);
    app.mount('#app');
  } catch (error) {
    console.error('Failed to initialize database:', error);
    // 即使数据库初始化失败，也要启动应用
    const app = createApp(App);
    app.mount('#app');
  }
}

startApp();
