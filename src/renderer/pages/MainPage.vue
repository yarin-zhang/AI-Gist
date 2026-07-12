<script setup lang="ts">
import { ref, h, nextTick, computed, onMounted, onBeforeUnmount } from 'vue'
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
    NText,
    NButton,
    NTooltip
} from 'naive-ui'
import {
    Home as HomeIcon,
    Star as PromptIcon,
    Settings as SettingsIcon,
    Diamonds as AIIcon,
    ChevronLeft,
    ChevronRight
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
const promptManagementPageRef = ref()

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

// 只在 Electron 环境下发送消息
if (window.electronAPI?.sendMessage) {
    window.electronAPI.sendMessage('Hello from App.vue!')
}

let removeShortcutNavigation: (() => void) | undefined
onMounted(() => {
    if (!window.electronAPI?.shortcuts?.onNavigateMain) return
    removeShortcutNavigation = window.electronAPI.shortcuts.onNavigateMain(async ({ target, promptUUID }) => {
        if (target === 'shortcuts') {
            handleOpenSettings('shortcuts')
            return
        }
        currentView.value = 'prompts'
        await nextTick()
        if (target === 'new-prompt') promptManagementPageRef.value?.createPrompt?.()
        else if (promptUUID) await promptManagementPageRef.value?.openPromptByUUID?.(promptUUID)
    })
})
onBeforeUnmount(() => removeShortcutNavigation?.())
</script>

<template>
    <div class="main-page-shell">
        <div class="main-layout">
            <NLayout has-sider class="main-layout-body">
                <NLayoutSider bordered collapse-mode="width" :collapsed-width="56"
                    :collapsed="collapseRef" :width="240" :native-scrollbar="false">
                    <div class="main-sider-content">
                        <NFlex vertical align="center" justify="center" class="main-sider-brand" v-if="!collapseRef">
                            <NText strong>{{ t('mainPage.title') }}</NText>
                        </NFlex>
                        <NMenu :options="menuOptions" :value="currentView" @update:value="handleMenuSelect"
                            :collapsed="collapseRef" :collapsed-width="56" :collapsed-icon-size="20"
                            class="main-sider-menu" />
                        <div class="main-sider-toggle">
                            <NTooltip placement="right">
                                <template #trigger>
                                    <NButton quaternary circle size="small" @click="collapseRef = !collapseRef">
                                        <template #icon>
                                            <NIcon size="16"><ChevronRight v-if="collapseRef" /><ChevronLeft v-else /></NIcon>
                                        </template>
                                    </NButton>
                                </template>
                                {{ collapseRef ? t('promptWorkspace.expandSidebar') : t('promptWorkspace.collapseSidebar') }}
                            </NTooltip>
                        </div>
                    </div>
                </NLayoutSider>

                <NLayout>
                    <NLayoutContent content-style="overflow-y: auto; height: 100%;">
                        <PromptManagementPage v-if="currentView === 'prompts'" ref="promptManagementPageRef"
                            @navigate-to-ai-config="handleNavigateToAIConfig" />
                        <AIConfigPage v-else-if="currentView === 'ai-config'" ref="aiConfigPageRef" />
                        <SettingsPage v-else-if="currentView === 'settings'" :target-section="settingsTargetSection" />
                    </NLayoutContent>
                </NLayout>
            </NLayout>
            <NLayoutFooter bordered class="main-layout-footer">
                <StatusBar @open-settings="handleOpenSettings" />
            </NLayoutFooter>
        </div>
    </div>
</template>

<style scoped>
.main-page-shell,
.main-layout {
    width: 100%;
    height: 100vh;
    min-height: 0;
}

.main-layout {
    display: flex;
    flex-direction: column;
}

.main-layout-body {
    flex: 1;
    min-height: 0;
}

.main-layout-footer {
    height: 24px;
    flex: 0 0 24px;
    padding: 0;
}

.main-sider-content {
    height: 100%;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: var(--surface-sidebar);
}

.main-sider-brand {
    min-height: 58px;
    padding: 0 16px;
    border-bottom: 1px solid var(--border-default);
    font-size: var(--n-font-size, 14px);
}

.main-sider-menu {
    flex: 1;
    min-height: 0;
    padding-top: var(--spacing-sm);
}

.main-sider-toggle {
    min-height: 48px;
    flex: 0 0 48px;
    margin-top: auto;
    display: flex;
    align-items: center;
    justify-content: center;
    border-top: 1px solid var(--border-default);
}
</style>
