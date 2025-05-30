<script setup lang="ts">
import { ref, h } from 'vue'
import {
    NLayout,
    NConfigProvider
} from 'naive-ui'
import MainPage from './components/MainPage.vue'
</script>

<template>
    <NConfigProvider>
        <MainPage />
    </NConfigProvider>
</template>

