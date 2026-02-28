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
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
