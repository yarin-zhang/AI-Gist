<script setup lang="ts">
/**
 * 全局 Android 返回键处理器
 *
 * 官方文档推荐模式：https://ionicframework.com/docs/developing/hardware-back-button
 * 使用 useBackButton(-1) 作为最低优先级的兜底处理器：
 *   - 更高优先级组件（overlays: 100, menu: 99, 路由导航: 0, 编辑页未保存检查: 10）先处理
 *   - 如果没有其他组件处理（用户在根 Tab 页），则退出 App
 *   - 如果路由器仍有历史记录可以返回，则什么都不做
 */
import { useBackButton, useIonRouter } from '@ionic/vue'
import { App } from '@capacitor/app'

const ionRouter = useIonRouter()

useBackButton(-1, () => {
  if (!ionRouter.canGoBack()) {
    App.exitApp()
  }
})
</script>

<template></template>
