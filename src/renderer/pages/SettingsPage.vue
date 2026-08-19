<template>
    <div class="settings-page">
        <header class="settings-command-bar">
            <div class="page-identity">
                <span class="page-identity-icon"><NIcon size="18"><SettingsNavigationIcon /></NIcon></span>
                <div>
                    <NText strong class="page-title">{{ t('settings.title') }}</NText>
                    <NText depth="3" class="page-subtitle">{{ t('settings.subtitle') }}</NText>
                </div>
            </div>

            <NFlex v-if="saving" align="center" :size="8" class="settings-save-status">
                <NSpin size="small" />
                <NText depth="3">{{ t('settings.saving') }}</NText>
            </NFlex>
        </header>

        <div class="settings-workspace">
            <aside class="settings-navigation" :aria-label="t('settings.settingsMenu')">
                <NScrollbar class="settings-navigation-scrollbar" trigger="hover">
                    <div class="settings-navigation-inner">
                        <NMenu
                            v-model:value="activeSettingKey"
                            :options="menuOptions"
                            :root-indent="8"
                            :indent="16"
                            @update:value="handleMenuSelect"
                        />
                    </div>
                </NScrollbar>
            </aside>

            <div class="settings-compact-navigation">
                <NSelect
                    v-model:value="activeSettingKey"
                    :options="compactMenuOptions"
                    :placeholder="t('settings.selectSection')"
                    @update:value="handleMenuSelect"
                />
            </div>

            <main class="settings-detail">
                <header class="settings-section-header">
                    <div>
                        <NText strong class="settings-section-title">{{ currentSectionTitle }}</NText>
                        <NText v-if="currentSectionDescription" depth="3" class="settings-section-description">
                            {{ currentSectionDescription }}
                        </NText>
                    </div>
                </header>

                <NScrollbar class="settings-content-scrollbar" trigger="hover">
                    <div class="settings-content-inner">
                        <NFlex vertical :size="16">
                        <!-- 数据同步设置 -->
                        <DataSyncSettings v-if="capabilities.cloudBackup && activeSettingKey === 'cloud-backup'" />

                        <!-- 数据备份设置 -->
                        <DataManagementSettings v-if="activeSettingKey === 'data-management'"
                            @navigate-section="handleMenuSelect" />
                            
                        <!-- 通用设置 -->
                        <template v-if="activeSettingKey === 'general'">
                            <AppearanceSettings
                                :model-value="{ themeSource: settings.themeSource }"
                                @update:model-value="(val) => { settings.themeSource = val.themeSource; updateSetting(); }" />
                            <LanguageSettings />
                        </template>

                        <!-- 启动行为设置 -->
                        <StartupBehaviorSettings v-if="capabilities.startup && activeSettingKey === 'startup-behavior'"
                            :model-value="{ startMinimized: settings.startMinimized, autoLaunch: settings.autoLaunch }"
                            @update:model-value="(val) => { settings.startMinimized = val.startMinimized; settings.autoLaunch = val.autoLaunch; updateSetting(); }" />

                        <!-- 关闭行为设置 -->
                        <CloseBehaviorSettings v-if="capabilities.tray && activeSettingKey === 'close-behavior'"
                            :model-value="{ closeBehaviorMode: settings.closeBehaviorMode, closeAction: settings.closeAction }"
                            @update:model-value="(val) => { settings.closeBehaviorMode = val.closeBehaviorMode; settings.closeAction = val.closeAction; updateSetting(); }" />

                        <!-- 快捷键设置 -->
                        <ShortcutSettings v-if="capabilities.globalShortcuts && activeSettingKey === 'shortcuts'" />

                        <!-- 网络代理设置 -->
                        <NetworkProxySettings v-if="capabilities.systemProxy && activeSettingKey === 'network-proxy'"
                            :model-value="settings.networkProxy"
                            @update:model-value="(val) => {
                                console.log('SettingsPage: networkProxy updated:', val);
                                settings.networkProxy = val;
                                updateSetting();
                            }" />

                        <!-- 本地 CLI 桥接设置 -->
                        <CliBridgeSettings v-if="capabilities.cliBridge && activeSettingKey === 'cli-bridge'" />

                        <!-- 关于 -->
                        <AboutSettings v-if="activeSettingKey === 'about'" />

                        <!-- 实验室 (仅开发环境) -->
                        <NCard v-if="activeSettingKey === 'laboratory' && isDevelopment">
                            <LaboratoryPanel />
                        </NCard>
                        </NFlex>
                    </div>
                </NScrollbar>
            </main>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed, h, watch } from "vue";
import { useI18n } from '~/composables/useI18n'
import {
    NCard,
    NFlex,
    NIcon,
    NText,
    NMenu,
    NSelect,
    NSpin,
    NScrollbar,
    useMessage,
} from "naive-ui";
import {
    Power,
    Rocket,
    Flask,
    Database,
    InfoCircle,
    Cloud,
    Keyboard,
    Wifi,
    Terminal2,
} from "@vicons/tabler";
import { SettingsNavigationIcon } from '@/theme/navigation-icons'
import LaboratoryPanel from "@/components/example/LaboratoryPanel.vue";
import AppearanceSettings from "@/components/settings/AppearanceSettings.vue";
import CloseBehaviorSettings from "@/components/settings/CloseBehaviorSettings.vue";
import StartupBehaviorSettings from "@/components/settings/StartupBehaviorSettings.vue";
import DataManagementSettings from "@/components/settings/DataManagementSettings.vue";
import DataSyncSettings from "@/components/settings/DataSyncSettings.vue";
import AboutSettings from "@/components/settings/AboutSettings.vue";
import ShortcutSettings from "@/components/settings/ShortcutSettings.vue";
import NetworkProxySettings from "@/components/settings/NetworkProxySettings.vue";
import CliBridgeSettings from "@/components/settings/CliBridgeSettings.vue";
import LanguageSettings from "@/components/settings/LanguageSettings.vue";
import { PlatformDetector } from "@shared/platform";
import { preferencesClient } from "@/lib/platform/preferences";
import { useTheme } from "~/composables/useTheme";


// Props 定义
interface Props {
    targetSection?: string;
}

const props = withDefaults(defineProps<Props>(), {
    targetSection: undefined
});

// 消息提示
const message = useMessage();
const { t, initLocale } = useI18n()
const { setThemeSource } = useTheme()
const capabilities = PlatformDetector.getCapabilities()

// 检测是否为开发环境
const isDevelopment = import.meta.env.DEV;
const currentMode = import.meta.env.MODE;

const normalizeSettingKey = (key?: string) => {
    if (key === 'appearance' || key === 'language') {
        return 'general';
    }

    return key;
};

// 当前激活的设置项。兼容外部入口仍传入旧的外观、语言 key。
const activeSettingKey = ref(normalizeSettingKey(props.targetSection) || 'cloud-backup');



const saving = ref(false);

// 设置数据
const settings = reactive({
    closeBehaviorMode: "ask" as "ask" | "fixed", // 新增：关闭行为模式
    closeAction: "quit" as "quit" | "minimize",
    startMinimized: false,
    autoLaunch: false,
    themeSource: "system" as "system" | "light" | "dark",
    // 数据同步设置
    dataSync: {
        lastSyncTime: null as string | null,
        autoBackup: true,
        backupInterval: 24, // 小时
    },
    // 快捷键设置
    shortcuts: {
        version: 2 as const,
        defaultAction: 'copy' as const,
        commands: {
            launcher: {
                accelerator: 'CommandOrControl+Shift+G',
                enabled: true,
            },
            showMainWindow: {
                accelerator: '',
                enabled: false,
            },
        },
        promptBindings: [],
        recentPromptUUIDs: [],
    },
    // 网络代理设置
    networkProxy: {
        mode: 'system' as 'direct' | 'system' | 'manual',
        manualConfig: {
            httpProxy: '',
            httpsProxy: '',
            noProxy: ''
        }
    },
});

// 设置入口。系统组功能必须通过平台能力控制可见性。
const settingItems = computed(() => {
    return [
        {
            label: t('settings.sections.cloudBackup'),
            key: "cloud-backup",
            icon: () => h(NIcon, { size: 16 }, { default: () => h(Cloud) }),
            visible: capabilities.cloudBackup,
        },
        {
            label: t('settings.sections.dataManagement'),
            key: "data-management",
            icon: () => h(NIcon, { size: 16 }, { default: () => h(Database) }),
            visible: true,
        },
        {
            label: t('settings.sections.general'),
            key: "general",
            icon: () => h(NIcon, { size: 16 }, { default: () => h(SettingsNavigationIcon) }),
            visible: true,
        },
        {
            label: t('settings.sections.startup'),
            key: "startup-behavior",
            icon: () => h(NIcon, { size: 16 }, { default: () => h(Rocket) }),
            visible: capabilities.startup,
        },
        {
            label: t('settings.sections.close'),
            key: "close-behavior",
            icon: () => h(NIcon, { size: 16 }, { default: () => h(Power) }),
            visible: capabilities.tray,
        },
        {
            label: t('settings.sections.shortcuts'),
            key: "shortcuts",
            icon: () => h(NIcon, { size: 16 }, { default: () => h(Keyboard) }),
            visible: capabilities.globalShortcuts,
        },
        {
            label: t('settings.sections.networkProxy'),
            key: "network-proxy",
            icon: () => h(NIcon, { size: 16 }, { default: () => h(Wifi) }),
            visible: capabilities.systemProxy,
        },
        {
            label: t('settings.sections.cliBridge'),
            key: "cli-bridge",
            icon: () => h(NIcon, { size: 16 }, { default: () => h(Terminal2) }),
            visible: capabilities.cliBridge,
        },
        {
            label: t('settings.sections.about'),
            key: "about",
            icon: () => h(NIcon, { size: 16 }, { default: () => h(InfoCircle) }),
            visible: true,
        },
        ...(isDevelopment ? [{
            label: t('settings.sections.laboratory'),
            key: "laboratory",
            icon: () => h(NIcon, { size: 16 }, { default: () => h(Flask) }),
            visible: true,
        }] : []),
    ].filter(option => option.visible)
        .map(({ visible, ...option }) => option);
});

const menuOptions = computed(() => {
    const items = settingItems.value;
    const pick = (...keys: string[]) => items.filter(item => keys.includes(String(item.key)));

    return [
        {
            type: 'group' as const,
            label: t('settings.groups.data'),
            key: 'settings-group-data',
            children: pick('cloud-backup', 'data-management'),
        },
        {
            type: 'group' as const,
            label: t('settings.groups.preferences'),
            key: 'settings-group-preferences',
            children: pick('general'),
        },
        {
            type: 'group' as const,
            label: t('settings.groups.system'),
            key: 'settings-group-system',
            children: pick('startup-behavior', 'close-behavior', 'shortcuts', 'network-proxy', 'cli-bridge'),
        },
        {
            type: 'group' as const,
            label: t('settings.groups.other'),
            key: 'settings-group-other',
            children: pick('about', 'laboratory'),
        },
    ].filter(group => group.children.length > 0);
});

const compactMenuOptions = computed(() => settingItems.value.map(item => ({
    label: item.label,
    value: String(item.key),
})));

const visibleSettingKeys = computed(() => settingItems.value.map(option => String(option.key)));

const ensureActiveSettingIsVisible = () => {
    if (!visibleSettingKeys.value.includes(activeSettingKey.value)) {
        activeSettingKey.value = visibleSettingKeys.value[0] || 'data-management';
    }
};

        // 当前设置区域信息
const currentSectionInfo = computed(() => {
    const key = activeSettingKey.value;
    const item = settingItems.value.find(option => option.key === key);
    const sectionsWithDescription = new Set([
        'cloud-backup',
        'data-management',
        'shortcuts',
        'network-proxy',
        'cli-bridge',
    ]);

    return {
        title: item?.label || t(`settings.sectionDescriptions.${key}.title`),
        description: sectionsWithDescription.has(key)
            ? t(`settings.sectionDescriptions.${key}.description`)
            : '',
    };
});

const currentSectionTitle = computed(() => currentSectionInfo.value.title);
const currentSectionDescription = computed(() => currentSectionInfo.value.description);

// 处理菜单选择
const handleMenuSelect = (key: string) => {
    activeSettingKey.value = key;
};

// 加载设置
const loadSettings = async () => {
    try {
        console.log(t('settingsMessages.loadSettings'));
        const prefs = await preferencesClient.get();
        console.log(t('settingsMessages.originalConfig'), prefs);

        // 确保数据同步配置结构完整  
        const dataSyncConfig = prefs.dataSync || {};
        settings.dataSync = {
            lastSyncTime: dataSyncConfig.lastSyncTime || null,
            autoBackup: dataSyncConfig.autoBackup !== undefined ? dataSyncConfig.autoBackup : true,
            backupInterval: dataSyncConfig.backupInterval || 24,
        };

        // 其他配置
        settings.closeBehaviorMode = prefs.closeBehaviorMode || "ask";
        settings.closeAction = prefs.closeAction || "quit";
        settings.startMinimized = prefs.startMinimized || false;
        settings.autoLaunch = prefs.autoLaunch || false;
        settings.themeSource = prefs.themeSource || "system";
        
        // 快捷键配置
        if (prefs.shortcuts) {
            settings.shortcuts = prefs.shortcuts as typeof settings.shortcuts;
        }

        // 网络代理配置
        if (prefs.networkProxy) {
            settings.networkProxy.mode = prefs.networkProxy.mode || 'system';
            if (prefs.networkProxy.manualConfig) {
                settings.networkProxy.manualConfig.httpProxy = prefs.networkProxy.manualConfig.httpProxy || '';
                settings.networkProxy.manualConfig.httpsProxy = prefs.networkProxy.manualConfig.httpsProxy || '';
                settings.networkProxy.manualConfig.noProxy = prefs.networkProxy.manualConfig.noProxy || '';
            }
        }

        console.log(t('settingsMessages.settingsLoaded'), {
            ...settings,
        });
    } catch (error) {
        console.error(t('settingsMessages.loadSettingsFailed'), error);
        message.error(t('settingsMessages.loadSettingsFailed'));
    }
};

// 更新设置
const updateSetting = async () => {
    if (saving.value) return;

    saving.value = true;
    try {
        // 创建纯对象副本
        const settingsData = JSON.parse(
            JSON.stringify({
                closeBehaviorMode: settings.closeBehaviorMode,
                closeAction: settings.closeAction,
                startMinimized: settings.startMinimized,
                autoLaunch: settings.autoLaunch,
                themeSource: settings.themeSource,
                dataSync: settings.dataSync,
                networkProxy: settings.networkProxy,
            })
        );

        console.log('SettingsPage: saving settings data:', settingsData);
        const updatedPrefs = await preferencesClient.set(settingsData);
        console.log(t('settingsMessages.settingsUpdated'), updatedPrefs);

        // 如果更改了主题设置，也要更新主题管理器
        if (settings.themeSource) {
            await setThemeSource(settings.themeSource);
        }

        setTimeout(() => {
            saving.value = false;
        }, 500);
    } catch (error) {
        console.error(t('settingsMessages.saveSettingsFailed'), error);
        message.error(t('settingsMessages.saveSettingsFailed'));
        saving.value = false;
    }
};

// 更新设置（智能版本，用于特定字段更新）
const updateSettingsSmart = async (fieldsToUpdate: string[] | null = null) => {
    if (saving.value) return;

    saving.value = true;
    try {
        // 只更新指定字段，如果没有指定则更新所有字段
        let settingsData: any;
        if (fieldsToUpdate) {
            settingsData = {};
            for (const field of fieldsToUpdate) {
                if (field === 'dataSync') {
                    settingsData.dataSync = JSON.parse(JSON.stringify(settings.dataSync));
                } else {
                    (settingsData as any)[field] = (settings as any)[field];
                }
            }
        } else {
            // 创建纯对象副本
            settingsData = JSON.parse(
                JSON.stringify({
                    closeBehaviorMode: settings.closeBehaviorMode,
                    closeAction: settings.closeAction,
                    startMinimized: settings.startMinimized,
                    autoLaunch: settings.autoLaunch,
                    themeSource: settings.themeSource,
                    dataSync: settings.dataSync,
                    networkProxy: settings.networkProxy,
                })
            );
        }

        // 如果没有要更新的数据，直接返回
        if (!settingsData || Object.keys(settingsData).length === 0) {
            console.log(t('settingsMessages.noSettingsToUpdate'));
            saving.value = false;
            return;
        }

        const updatedPrefs = await preferencesClient.set(settingsData);
        console.log(t('settingsMessages.settingsUpdated'), updatedPrefs);

        // 如果更改了主题设置，也要更新主题管理器
        if (settingsData.themeSource) {
            await setThemeSource(settingsData.themeSource);
        }

        setTimeout(() => {
            saving.value = false;
        }, 500);
    } catch (error) {
        console.error(t('settingsMessages.saveSettingsFailed'), error);
        message.error(t('settingsMessages.saveSettingsFailed'));
        saving.value = false;
    }
};

// 组件挂载时加载设置
onMounted(async () => {
    initLocale(); // 初始化语言设置
    ensureActiveSettingIsVisible();
    await loadSettings();
});

// 监听 props 变化，自动跳转到对应设置页面
watch(() => props.targetSection, (newTargetSection) => {
    const normalizedTargetSection = normalizeSettingKey(newTargetSection);
    if (normalizedTargetSection && normalizedTargetSection !== activeSettingKey.value) {
        activeSettingKey.value = normalizedTargetSection;
        ensureActiveSettingIsVisible();
    }
}, { immediate: true });

watch(menuOptions, () => {
    ensureActiveSettingIsVisible();
}, { immediate: true });
</script>

<style scoped>
.settings-page {
    width: 100%;
    height: calc(100vh - 24px);
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--surface-body);
}

.settings-command-bar {
    flex: 0 0 60px;
    min-height: 60px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--section-gap);
    padding: 0 var(--page-padding);
    border-bottom: 1px solid var(--border-default);
    background: var(--surface-primary);
}

.page-identity {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 10px;
}

.page-identity-icon {
    width: 32px;
    height: 32px;
    flex: 0 0 32px;
    display: grid;
    place-items: center;
    color: var(--accent-primary);
    border-radius: var(--radius-panel);
    background: var(--surface-secondary);
}

.page-title {
    display: block;
    font-size: var(--font-size-lg);
    line-height: 1.25;
}

.page-subtitle {
    display: block;
    max-width: 320px;
    margin-top: 1px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--font-size-xs);
}

.settings-save-status {
    flex: 0 0 auto;
    color: var(--content-secondary);
}

.settings-workspace {
    flex: 1;
    height: 0;
    min-width: 0;
    min-height: 0;
    display: grid;
    grid-template-columns: 260px minmax(0, 1fr);
    overflow: hidden;
}

.settings-navigation {
    height: 100%;
    min-height: 0;
    overflow: hidden;
    border-right: 1px solid var(--border-default);
    background: var(--surface-primary);
}

.settings-navigation-scrollbar {
    height: 100%;
}

.settings-navigation-scrollbar :deep(.n-scrollbar-container) {
    overscroll-behavior: contain;
}

.settings-navigation-inner {
    padding: 8px;
}

.settings-navigation :deep(.n-menu) {
    width: 100%;
}

.settings-compact-navigation {
    display: none;
}

.settings-detail {
    height: 100%;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--surface-body);
}

.settings-section-header {
    flex: 0 0 auto;
    min-height: 76px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--section-gap);
    padding: 10px var(--page-padding);
    border-bottom: 1px solid var(--border-default);
    background: var(--surface-primary);
}

.settings-section-title {
    display: block;
    font-size: var(--font-size-xl);
    line-height: 1.25;
}

.settings-section-description {
    display: block;
    margin-top: 3px;
    font-size: var(--font-size-sm);
}

.settings-content-scrollbar {
    flex: 1;
    height: 0;
    min-height: 0;
}

.settings-content-scrollbar :deep(.n-scrollbar-container) {
    overscroll-behavior: contain;
}

.settings-content-inner {
    width: 100%;
    max-width: 1120px;
    box-sizing: border-box;
    margin: 0 auto;
    padding: var(--page-padding);
}

.n-form-item {
    margin-bottom: 0;
}

.settings-content-inner :deep(.n-divider:not(.n-divider--vertical)) {
    margin: 0;
}

@media (max-width: 860px) {
    .settings-workspace {
        display: flex;
        flex-direction: column;
    }

    .settings-navigation {
        display: none;
    }

    .settings-compact-navigation {
        display: block;
        flex: 0 0 auto;
        padding: var(--compact-padding) var(--page-padding);
        border-bottom: 1px solid var(--border-default);
        background: var(--surface-secondary);
    }

    .settings-detail {
        flex: 1 1 auto;
        height: 0;
    }

    .settings-compact-navigation .n-select {
        max-width: 320px;
    }

    .page-subtitle { display: none; }
}
</style>
