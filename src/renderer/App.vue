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
import { useTheme } from '~/composables/useTheme'
import { useI18n } from '~/composables/useI18n'
import i18n from '~/i18n'
import MainPage from '~/pages/MainPage.vue'
import DatabaseStatusBanner from '~/components/common/DatabaseStatusBanner.vue'
import AppInitializer from '~/components/common/AppInitializer.vue'
import I18nErrorBanner from '~/components/common/I18nErrorBanner.vue'
import ShortcutListener from '~/components/common/ShortcutListener.vue'
import NotificationHandler from '~/components/common/NotificationHandler.vue'

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
    await initTheme()
})
</script>

<template>
    <NConfigProvider :theme="naiveTheme" :theme-overrides="getThemeOverrides()" :locale="naiveLocale" :date-locale="naiveDateLocale">
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
</template>
