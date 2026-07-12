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
import DatabaseStatusBanner from '~/components/common/DatabaseStatusBanner.vue'
import AppInitializer from '~/components/common/AppInitializer.vue'
import I18nErrorBanner from '~/components/common/I18nErrorBanner.vue'
import NotificationHandler from '~/components/common/NotificationHandler.vue'
import MobileBackButtonHandler from '~/components/mobile/MobileBackButtonHandler.vue'
import PromptLauncher from '~/components/shortcuts/PromptLauncher.vue'

// 检测运行壳：Web 桌面浏览器使用桌面壳，Web 手机浏览器和原生移动端使用移动壳
const isDesktopShell = PlatformDetector.isDesktopShell()
const isNativeMobile = PlatformDetector.isMobile()
const isLauncherSurface = new URLSearchParams(window.location.search).get('surface') === 'launcher'

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

// 初始化主题。桌面、Web 与移动端共用同一套主题解析和 token 应用链路。
onMounted(async () => {
    try {
        await initTheme()
    } catch (error) {
        console.error('❌ [App] 主题初始化失败:', error)
    }
})
</script>

<template>
    <!-- 桌面端：使用 Naive UI -->
    <NConfigProvider v-if="isDesktopShell" :theme="naiveTheme" :theme-overrides="getThemeOverrides()" :locale="naiveLocale" :date-locale="naiveDateLocale">
        <NMessageProvider>
            <NDialogProvider>
                <AppInitializer>
                    <!-- 国际化错误检测横幅 -->
                    <I18nErrorBanner v-if="!isLauncherSurface" />
                    <!-- 数据库状态横幅 -->
                    <DatabaseStatusBanner v-if="!isLauncherSurface" />
                    <!-- 通知处理器 -->
                    <NotificationHandler v-if="!isLauncherSurface" />
                    <PromptLauncher v-if="isLauncherSurface" />
                    <MainPage v-else />
                </AppInitializer>
            </NDialogProvider>
        </NMessageProvider>
    </NConfigProvider>

    <!-- 移动端：使用 Ionic + Vue Router -->
    <ion-app v-else>
        <MobileBackButtonHandler v-if="isNativeMobile" />
        <ion-router-outlet />
    </ion-app>
</template>
