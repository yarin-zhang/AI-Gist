<script setup lang="ts">
import { ref, h, nextTick } from 'vue'
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
    Star as PromptIcon,
    Settings as SettingsIcon,
    Diamonds as AIIcon
} from '@vicons/tabler'

import SettingsPage from './SettingsPage.vue'
import PromptManagementPage from './PromptManagementPage.vue'
import AIConfigPage from './AIConfigPage.vue'
const currentView = ref('prompts')

// 组件引用
const aiConfigPageRef = ref()

// 菜单选项
const menuOptions: MenuOption[] = [
    {
        label: 'AI 提示词',
        key: 'prompts',
        icon: () => h(NIcon, null, { default: () => h(PromptIcon) })
    },
    {
        label: 'AI 配置',
        key: 'ai-config',
        icon: () => h(NIcon, null, { default: () => h(AIIcon) })
    },
    {
        label: '设置',
        key: 'settings',
        icon: () => h(NIcon, null, { default: () => h(SettingsIcon) })
    }
]

const handleMenuSelect = (key: string) => {
    currentView.value = key
}

const handleNavigateToAIConfig = async () => {
    currentView.value = 'ai-config'
    // 等待组件渲染完成后自动打开添加配置弹窗
    await nextTick()
    if (aiConfigPageRef.value?.openAddConfigModal) {
        aiConfigPageRef.value.openAddConfigModal()
    }
}

const collapseRef = ref(true)

window.electronAPI.sendMessage('Hello from App.vue!')
</script>

<template>
    <div style="height: 100vh;">
        <NLayout has-sider style="height: 100%;">
            <NLayoutSider bordered collapse-mode="width" :collapsed-width="64" @update:collapsed="collapseRef = $event"
                :default-collapsed="collapseRef" :width="260" show-trigger="bar">
                <NFlex vertical align="center" justify="center" style="padding: 20px; " v-if="!collapseRef">
                    <NText strong style="font-size: 16px; ">
                        AI Gist
                    </NText>
                </NFlex>
                <NMenu :options="menuOptions" :value="currentView" @update:value="handleMenuSelect"
                    :collapsed-width="64" :collapsed-icon-size="22" style="margin-top: 8px;" />
            </NLayoutSider>            <NLayoutContent content-style="overflow-y: auto;">
                <PromptManagementPage 
                    v-if="currentView === 'prompts'" 
                    @navigate-to-ai-config="handleNavigateToAIConfig" 
                />
                <AIConfigPage 
                    v-else-if="currentView === 'ai-config'" 
                    ref="aiConfigPageRef" 
                />
                <SettingsPage v-else-if="currentView === 'settings'" />
            </NLayoutContent>
        </NLayout>
    </div>
</template>
