<script setup lang="ts">
import { onMounted } from 'vue'
import {
    NLayout,
    NConfigProvider,
    NMessageProvider,
    zhCN,
    dateZhCN
} from 'naive-ui'
import { useTheme } from './composables/useTheme'
import MainPage from './pages/MainPage.vue'

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
            <MainPage />
        </NMessageProvider>
    </NConfigProvider>
</template>
