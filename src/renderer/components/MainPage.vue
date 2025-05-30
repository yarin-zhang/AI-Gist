<script setup lang="ts">
import { ref, h } from 'vue'
import {
    NLayout,
    NLayoutSider,
    NLayoutContent,
    NMenu,
    MenuOption,
    NIcon,
    NFlex,
    NText
} from 'naive-ui'
import {
    Home as HomeIcon,
    Database as DatabaseIcon,
    Server as TrpcIcon,
    Star as PromptIcon
} from '@vicons/tabler'

import HelloWorld from './HelloWorld.vue'
import TrpcDemo from './TrpcDemo.vue'
import PromptManager from './PromptManager.vue'

const currentView = ref('hello')

// 菜单选项
const menuOptions: MenuOption[] = [
    {
        label: '欢迎',
        key: 'hello',
        icon: () => h(NIcon, null, { default: () => h(HomeIcon) })
    },
    {
        label: 'AI Prompt',
        key: 'prompts',
        icon: () => h(NIcon, null, { default: () => h(PromptIcon) })
    },
    {
        label: 'tRPC 演示',
        key: 'trpc',
        icon: () => h(NIcon, null, { default: () => h(TrpcIcon) })
    }
]

const handleMenuSelect = (key: string) => {
    currentView.value = key
}

const collapseRef = ref(false)

window.electronAPI.sendMessage('Hello from App.vue!')
</script>

<template>
    <NLayout has-sider style="height: 100vh;">
        <NLayoutSider bordered collapse-mode="width" :collapsed-width="64" @update:collapsed="collapseRef = $event"
            :width="260" show-trigger>
            <NFlex vertical align="center" justify="center" style="padding: 20px; border-bottom: 1px solid #e0e0e6;"
                v-if="!collapseRef">
                <NText strong style="font-size: 16px; color: #333;">
                    Electron Starter
                </NText>
            </NFlex>
            <NMenu :options="menuOptions" :value="currentView" @update:value="handleMenuSelect" :collapsed-width="64"
                :collapsed-icon-size="22" style="margin-top: 8px;" />
        </NLayoutSider>

        <NLayoutContent content-style="padding: 24px; overflow-y: auto; background-color: #f8f9fa;">
            <HelloWorld v-if="currentView === 'hello'" msg="Electron Starter" />
            <PromptManager v-if="currentView === 'prompts'" />
            <TrpcDemo v-if="currentView === 'trpc'" />
        </NLayoutContent>
    </NLayout>
</template>
