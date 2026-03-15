<script setup lang="ts">
import { onMounted, computed } from 'vue'
import {
    NLayout,
    NConfigProvider,
    NMessageProvider,
    NDialogProvider,
    zhCN,
    zhTW,
    enUS,
    jaJP,
    dateZhCN,
    dateZhTW,
    dateEnUS,
    dateJaJP
} from 'naive-ui'
import { IonApp, IonRouterOutlet } from '@ionic/vue'
import { useTheme } from '~/composables/useTheme'
import { useI18n } from '~/composables/useI18n'
import { PlatformDetector } from '@shared/platform'
import i18n from '~/i18n'
import MainPage from '~/pages/MainPage.vue'
import MobileTestPage from '~/pages/MobileTestPage.vue'
import DatabaseStatusBanner from '~/components/common/DatabaseStatusBanner.vue'
import AppInitializer from '~/components/common/AppInitializer.vue'
import I18nErrorBanner from '~/components/common/I18nErrorBanner.vue'
import ShortcutListener from '~/components/common/ShortcutListener.vue'
import NotificationHandler from '~/components/common/NotificationHandler.vue'
import MobileBackButtonHandler from '~/components/mobile/MobileBackButtonHandler.vue'

// 检测平台
const isDesktop = PlatformDetector.isDesktop()

// 使用主题管理
const { naiveTheme, getThemeOverrides, initTheme } = useTheme()

// 使用 i18n
const { currentLocale } = useI18n()

// 根据当前语言计算 Naive UI 的 locale 和 date-locale
const naiveLocale = computed(() => {
    switch (currentLocale.value) {
        case 'zh-CN':
            return zhCN
        case 'zh-TW':
            return zhTW
        case 'ja-JP':
            return jaJP
        default:
            return enUS
    }
})

const naiveDateLocale = computed(() => {
    switch (currentLocale.value) {
        case 'zh-CN':
            return dateZhCN
        case 'zh-TW':
            return dateZhTW
        case 'ja-JP':
            return dateJaJP
        default:
            return dateEnUS
    }
})

// 初始化主题
onMounted(async () => {
    // 只在桌面端初始化主题，移动端由设置页面管理
    if (!isDesktop) {
        console.log('[App] 移动端环境，跳过 initTheme')
        return
    }

    try {
        console.log('[App] 桌面端环境，初始化主题')
        await initTheme()
    } catch (error) {
        console.error('❌ [App] 主题初始化失败:', error)
    }
})
</script>

<template>
    <!-- 桌面端：使用 Naive UI -->
    <NConfigProvider v-if="isDesktop" :theme="naiveTheme" :theme-overrides="getThemeOverrides()" :locale="naiveLocale" :date-locale="naiveDateLocale">
        <NMessageProvider>
            <NDialogProvider>
                <AppInitializer>
                    <!-- 国际化错误检测横幅 -->
                    <I18nErrorBanner />
                    <!-- 数据库状态横幅 -->
                    <DatabaseStatusBanner />
                    <!-- 快捷键监听器 -->
                    <ShortcutListener />
                    <!-- 通知处理器 -->
                    <NotificationHandler />
                    <MainPage />
                </AppInitializer>
            </NDialogProvider>
        </NMessageProvider>
    </NConfigProvider>

    <!-- 移动端：使用 Ionic + Vue Router -->
    <ion-app v-else>
        <MobileBackButtonHandler />
        <ion-router-outlet />
    </ion-app>
</template>
