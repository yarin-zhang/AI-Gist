<script setup lang="ts">
import { onMounted } from 'vue'
import {
    NLayout,
    NConfigProvider,
    NMessageProvider,
    NDialogProvider,
    zhCN,
    dateZhCN
} from 'naive-ui'
import { useTheme } from '~/composables/useTheme'
import MainPage from '~/pages/MainPage.vue'
import DatabaseStatusBanner from '~/components/common/DatabaseStatusBanner.vue'
import AppInitializer from '~/components/common/AppInitializer.vue'

// 使用主题管理
const { naiveTheme, initTheme } = useTheme()

// 初始化主题
onMounted(async () => {
    await initTheme()
})
</script>

<template>
    <NConfigProvider :theme="naiveTheme" :locale="zhCN" :date-locale="dateZhCN">
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
