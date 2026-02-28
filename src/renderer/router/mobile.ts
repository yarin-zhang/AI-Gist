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
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
