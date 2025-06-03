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

import PromptManager from './PromptManager.vue'

const currentView = ref('prompts')

// 菜单选项
const menuOptions: MenuOption[] = [
    {
        label: 'AI Prompt',
        key: 'prompts',
        icon: () => h(NIcon, null, { default: () => h(PromptIcon) })
    }
]

const handleMenuSelect = (key: string) => {
    currentView.value = key
}

const collapseRef = ref(true)

window.electronAPI.sendMessage('Hello from App.vue!')
</script>

<template>
    <NLayout has-sider style="height: 100vh;">
        <NLayoutSider bordered collapse-mode="width" :collapsed-width="64" @update:collapsed="collapseRef = $event" :default-collapsed="collapseRef"
            :width="260" show-trigger="bar">
            <NFlex vertical align="center" justify="center" style="padding: 20px; border-bottom: 1px solid #e0e0e6;" v-if="!collapseRef">
                <NText strong style="font-size: 16px; color: #333;">
                    AI Gist
                </NText>
            </NFlex>
            <NMenu :options="menuOptions" :value="currentView" @update:value="handleMenuSelect" :collapsed-width="64"
                :collapsed-icon-size="22" style="margin-top: 8px;" />
        </NLayoutSider>

        <NLayoutContent content-style="padding: 24px; overflow-y: auto; background-color: #f8f9fa;">
            <PromptManager v-if="currentView === 'prompts'" />
            <TrpcDemo v-if="currentView === 'trpc'" />
        </NLayoutContent>
    </NLayout>
</template>
