import { createRouter, createWebHashHistory } from '@ionic/vue-router'
import type { RouteRecordRaw } from 'vue-router'

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
  },
  {
    path: '/prompt/create',
    component: () => import('../pages/mobile/MobilePromptEditPage.vue')
  },
  {
    path: '/prompt/edit/:id',
    component: () => import('../pages/mobile/MobilePromptEditPage.vue')
  },
  {
    path: '/prompt/detail/:id',
    component: () => import('../pages/mobile/MobilePromptDetailPage.vue')
  },
  {
    path: '/ai-config/create',
    component: () => import('../pages/mobile/MobileAIConfigEditPage.vue')
  },
  {
    path: '/ai-config/edit/:id',
    component: () => import('../pages/mobile/MobileAIConfigEditPage.vue')
  },
  {
    path: '/ai-config/:id',
    component: () => import('../pages/mobile/MobileAIConfigDetailPage.vue')
  },
  {
    path: '/ai-config/:id/system-prompt',
    component: () => import('../pages/mobile/MobileSystemPromptEditPage.vue')
  },
  // 设置二级页面：设置首页只做导航，具体设置都在这些独立页面里
  {
    path: '/mobile/settings/general',
    component: () => import('../pages/mobile/settings/MobileGeneralSettingsPage.vue')
  },
  {
    path: '/mobile/settings/data-sync',
    component: () => import('../pages/mobile/settings/MobileDataSyncPage.vue')
  },
  {
    path: '/mobile/settings/data-sync/storage/:id',
    component: () => import('../pages/mobile/settings/MobileStorageConfigPage.vue')
  },
  {
    path: '/mobile/settings/data-backup',
    component: () => import('../pages/mobile/settings/MobileDataBackupPage.vue')
  },
  {
    path: '/mobile/settings/data-backup/local',
    component: () => import('../pages/mobile/settings/MobileLocalBackupPage.vue')
  },
  {
    path: '/mobile/settings/data-backup/cloud/:storageId',
    component: () => import('../pages/mobile/settings/MobileCloudBackupPage.vue')
  },
  {
    // 旧入口（应用内深链和历史记录）继续可用
    path: '/mobile/cloud-backup',
    redirect: '/mobile/settings/data-sync'
  },
  {
    path: '/ai-generator',
    component: () => import('../pages/mobile/MobileAIGeneratorPage.vue')
  },
  {
    path: '/mobile/about',
    component: () => import('../pages/mobile/MobileAboutPage.vue')
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
