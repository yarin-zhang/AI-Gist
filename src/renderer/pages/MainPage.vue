<script setup lang="ts">
import { ref, h, nextTick, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
    NLayout,
    NLayoutSider,
    NLayoutContent,
    NLayoutFooter,
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
import StatusBar from '~/components/common/StatusBar.vue'

const { t } = useI18n()
const currentView = ref('prompts')
const settingsTargetSection = ref<string>()

// 组件引用
const aiConfigPageRef = ref()

// 菜单选项
const menuOptions: MenuOption[] = [
    {
        label: t('mainPage.menu.prompts'),
        key: 'prompts',
        icon: () => h(NIcon, null, { default: () => h(PromptIcon) })
    },
    {
        label: t('mainPage.menu.aiConfig'),
        key: 'ai-config',
        icon: () => h(NIcon, null, { default: () => h(AIIcon) })
    },
    {
        label: t('mainPage.menu.settings'),
        key: 'settings',
        icon: () => h(NIcon, null, { default: () => h(SettingsIcon) })
    }
]

const handleMenuSelect = (key: string) => {
    currentView.value = key
    // 如果不是通过特定方式打开设置页面，重置目标区域
    if (key !== 'settings') {
        settingsTargetSection.value = undefined;
    }
}

const handleNavigateToAIConfig = async () => {
    currentView.value = 'ai-config'
    // 等待组件渲染完成后自动打开添加配置弹窗
    await nextTick()
    if (aiConfigPageRef.value?.openAddConfigModal) {
        aiConfigPageRef.value.openAddConfigModal()
    }
}

const handleOpenSettings = (targetSection?: string) => {
    currentView.value = 'settings'
    // 设置目标设置区域
    if (targetSection) {
        settingsTargetSection.value = targetSection;
    }
};

const collapseRef = ref(true)

window.electronAPI.sendMessage('Hello from App.vue!')
</script>

<template>
    <div style="height: 100vh; ">
        <NLayout>
            <NLayout has-sider style="height: 100%; ">
                <NLayoutSider bordered collapse-mode="width" :collapsed-width="64"
                    @update:collapsed="collapseRef = $event" :default-collapsed="collapseRef" :width="260"
                    show-trigger="bar">
                    <NFlex vertical align="center" justify="center" style="padding: 20px; " v-if="!collapseRef">
                        <NText strong style="font-size: 16px; ">
                            {{ t('mainPage.title') }}
                        </NText>
                    </NFlex>
                    <NMenu :options="menuOptions" :value="currentView" @update:value="handleMenuSelect"
                        :collapsed-width="64" :collapsed-icon-size="22" style="margin-top: 8px;" />
                </NLayoutSider>

                <NLayout>
                    <NLayoutContent content-style="overflow-y: auto; height: calc(100vh - 24px);">
                        <PromptManagementPage v-if="currentView === 'prompts'"
                            @navigate-to-ai-config="handleNavigateToAIConfig" />
                        <AIConfigPage v-else-if="currentView === 'ai-config'" ref="aiConfigPageRef" />
                        <SettingsPage v-else-if="currentView === 'settings'" :target-section="settingsTargetSection" />
                    </NLayoutContent>
                </NLayout>
            </NLayout>
            <NLayoutFooter bordered style="height: 24px; padding: 0;">
                <StatusBar @open-settings="handleOpenSettings" />
            </NLayoutFooter>
        </NLayout>
    </div>
</template>
