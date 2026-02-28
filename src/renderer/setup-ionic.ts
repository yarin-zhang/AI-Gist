/**
 * 移动端 Ionic 初始化
 * 确保 Ionic 样式和插件在应用启动前加载
 */

// 导入所有 Ionic 核心样式
import '@ionic/vue/css/core.css'
import '@ionic/vue/css/normalize.css'
import '@ionic/vue/css/structure.css'
import '@ionic/vue/css/typography.css'
import '@ionic/vue/css/padding.css'
import '@ionic/vue/css/float-elements.css'
import '@ionic/vue/css/text-alignment.css'
import '@ionic/vue/css/text-transformation.css'
import '@ionic/vue/css/flex-utils.css'
import '@ionic/vue/css/display.css'

import { IonicVue } from '@ionic/vue'
import type { App } from 'vue'

/**
 * 初始化 Ionic
 */
export function setupIonic(app: App) {
  app.use(IonicVue)
  console.log('✅ Ionic Vue 已注册')
}
