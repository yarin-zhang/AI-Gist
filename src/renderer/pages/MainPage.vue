<script setup lang="ts">
import { ref, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { PlatformDetector } from '@shared/platform'

import SettingsPage from './SettingsPage.vue'
import PromptsPage from './PromptsPage.vue'
import ModelsPage from './ModelsPage.vue'
import AppRail from '~/components/layout/AppRail.vue'
import AppStatusBar from '~/components/layout/AppStatusBar.vue'
import SyncConflictModal from '~/components/sync/SyncConflictModal.vue'
import type { AppView } from '~/components/layout/types'
import { useLauncherShortcut } from '~/composables/useLauncherShortcut'

const currentView = ref<AppView>('prompts')
const settingsTargetSection = ref<string>()
const capabilities = PlatformDetector.getCapabilities()
const launcher = useLauncherShortcut()

// 组件引用
const modelsPageRef = ref()
const promptManagementPageRef = ref()

// 提示词页切走时会被卸载，未保存的草稿和修改会跟着丢掉，所以离开前先让它确认
const canLeave = async (target: AppView) => {
    if (currentView.value !== 'prompts' || target === 'prompts') return true
    return (await promptManagementPageRef.value?.confirmLeave?.()) ?? true
}

// 从提示词引导页去连接模型时为 true：保存好配置后回到提示词页，引导页里写的描述还在，可以直接生成
const returnToPromptsAfterModelSaved = ref(false)

const handleNavigate = async (view: AppView) => {
    if (!(await canLeave(view))) return
    currentView.value = view
    returnToPromptsAfterModelSaved.value = false
    // 如果不是通过特定方式打开设置页面，重置目标区域
    if (view !== 'settings') {
        settingsTargetSection.value = undefined
    }
}

const handleNavigateToAIConfig = async (options?: { returnToPrompts?: boolean }) => {
    if (!(await canLeave('models'))) return
    currentView.value = 'models'
    returnToPromptsAfterModelSaved.value = Boolean(options?.returnToPrompts)
    // 等待组件渲染完成后自动打开添加配置弹窗
    await nextTick()
    modelsPageRef.value?.openAddConfigModal?.()
}

const handleModelConfigSaved = () => {
    if (!returnToPromptsAfterModelSaved.value) return
    returnToPromptsAfterModelSaved.value = false
    currentView.value = 'prompts'
}

const handleOpenSettings = async (targetSection?: string) => {
    if (!(await canLeave('settings'))) return
    returnToPromptsAfterModelSaved.value = false
    // 先清空旧目标，确保在设置页内切换后重复点击同一入口仍会触发定位。
    settingsTargetSection.value = undefined;
    currentView.value = 'settings'
    if (targetSection) {
        await nextTick();
        settingsTargetSection.value = targetSection;
    }
};

// 启动器快捷键没设置或不可用时，主导航的启动器按钮把用户带到快捷键设置
const handleOpenLauncher = async () => {
    if (launcher.status.value === 'ready') {
        await launcher.openLauncher()
        return
    }
    await handleOpenSettings('shortcuts')
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
    <div class="app-shell">
        <div class="app-shell__body">
            <AppRail
                :active="currentView"
                :show-launcher="capabilities.globalShortcuts && launcher.available"
                :launcher-shortcut="launcher.label.value"
                @navigate="handleNavigate"
                @open-launcher="handleOpenLauncher"
            />
            <main class="app-shell__content">
                <PromptsPage v-if="currentView === 'prompts'" ref="promptManagementPageRef"
                    @navigate-to-ai-config="handleNavigateToAIConfig" @open-settings="handleOpenSettings" />
                <ModelsPage v-else-if="currentView === 'models'" ref="modelsPageRef" @config-saved="handleModelConfigSaved" />
                <SettingsPage v-else-if="currentView === 'settings'" :target-section="settingsTargetSection" />
            </main>
        </div>
        <AppStatusBar @open-settings="handleOpenSettings" />
        <SyncConflictModal />
    </div>
</template>

<style scoped>
.app-shell {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100vh;
    min-height: 0;
    overflow: hidden;
    background: var(--surface-primary);
}

.app-shell__body {
    display: flex;
    flex: 1;
    min-height: 0;
}

.app-shell__content {
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: var(--surface-primary);
}
</style>
