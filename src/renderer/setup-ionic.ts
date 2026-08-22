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

// 导入 Ionic 暗色模式调色板
import '@ionic/vue/css/palettes/dark.class.css'
import './assets/styles/mobile.css'

import { IonicVue } from '@ionic/vue'
import type { App } from 'vue'
import { PlatformDetector } from '@shared/platform'

/**
 * 初始化 Ionic
 */
export function setupIonic(app: App) {
  document.documentElement.classList.add('ai-gist-mobile')
  document.body.classList.add('ai-gist-mobile')

  // Web 移动版没有原生平台信息，Ionic 默认会回退到 Material Design。
  // 只为 Web 移动壳固定 iOS 模式；原生 Android/iOS 继续使用平台默认行为。
  const ionicConfig = PlatformDetector.isWeb() ? { mode: 'ios' as const } : undefined
  app.use(IonicVue, ionicConfig)
}
