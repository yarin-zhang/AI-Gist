<script setup lang="ts">
import { ref, h } from 'vue'
import {
    NConfigProvider,
    NMessageProvider
} from 'naive-ui'
import MainPage from './components/MainPage.vue'
</script>

<template>
    <NConfigProvider>
        <NMessageProvider>
            <MainPage />
        </NMessageProvider>
    </NConfigProvider>
</template>

