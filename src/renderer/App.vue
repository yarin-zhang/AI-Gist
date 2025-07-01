<script setup lang="ts">
import { onMounted, computed } from 'vue'
import {
    NLayout,
    NConfigProvider,
    NMessageProvider,
    NDialogProvider,
    zhCN,
    enUS,
    dateZhCN,
    dateEnUS
} from 'naive-ui'
import { useTheme } from '~/composables/useTheme'
import { useI18n } from '~/composables/useI18n'
import i18n from '~/i18n'
import MainPage from '~/pages/MainPage.vue'
import DatabaseStatusBanner from '~/components/common/DatabaseStatusBanner.vue'
import AppInitializer from '~/components/common/AppInitializer.vue'

// 使用主题管理
const { naiveTheme, initTheme } = useTheme()

// 使用 i18n
const { currentLocale } = useI18n()

// 根据当前语言计算 Naive UI 的 locale 和 date-locale
const naiveLocale = computed(() => {
    return currentLocale.value === 'zh-CN' ? zhCN : enUS
})

const naiveDateLocale = computed(() => {
    return currentLocale.value === 'zh-CN' ? dateZhCN : dateEnUS
})

// 初始化主题
onMounted(async () => {
    await initTheme()
})
</script>

<template>
    <NConfigProvider :theme="naiveTheme" :locale="naiveLocale" :date-locale="naiveDateLocale">
        <NMessageProvider>
            <NDialogProvider>
                <AppInitializer>
                    <!-- 数据库状态横幅 -->
                    <DatabaseStatusBanner />
                    <MainPage />
                </AppInitializer>
            </NDialogProvider>
        </NMessageProvider>
    </NConfigProvider>
</template>
