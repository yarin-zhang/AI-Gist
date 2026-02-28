import { createRouter, createWebHashHistory } from '@ionic/vue-router'
import type { RouteRecordRaw } from 'vue-router'

console.log('📱 开始创建移动端路由配置')

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: '/tabs/prompts'
  },
  {
    path: '/tabs',
    component: () => import('../pages/MobileMainPage.vue'),
    children: [
      {
        path: '',
        redirect: '/tabs/prompts'
      },
      {
        path: 'prompts',
        component: () => import('../pages/mobile/MobilePromptPage.vue')
      },
      {
        path: 'ai-config',
        component: () => import('../pages/mobile/MobileAIConfigPage.vue')
      },
      {
        path: 'settings',
        component: () => import('../pages/mobile/MobileSettingsPage.vue')
      }
    ]
  }
]

console.log('📱 路由配置:', routes)

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

console.log('📱 路由器已创建')

// 添加详细的路由日志
router.beforeEach((to, from, next) => {
  console.log('🔄 [路由] 导航开始:', {
    to: to.path,
    from: from.path,
    fullPath: to.fullPath
  })
  next()
})

router.afterEach((to, from) => {
  console.log('✅ [路由] 导航完成:', {
    to: to.path,
    from: from.path
  })
})

router.onError((error) => {
  console.error('❌ [路由] 路由错误:', error)
  console.error('❌ [路由] 错误堆栈:', error.stack)
})

// 监听路由准备完成
router.isReady().then(() => {
  console.log('✅ [路由] 路由器已准备就绪')
  console.log('📍 [路由] 当前路由:', router.currentRoute.value.path)
}).catch(error => {
  console.error('❌ [路由] 路由器准备失败:', error)
})

export default router
