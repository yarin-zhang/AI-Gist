<template>
    <div class="settings-page">
        <SettingsNav class="settings-page__nav" :groups="navGroups" :active="activeSettingKey" @select="handleMenuSelect" />

        <div class="settings-page__compact">
            <NSelect :value="activeSettingKey" :options="compactMenuOptions" :placeholder="t('settings.selectSection')"
                @update:value="handleMenuSelect" />
        </div>

        <NScrollbar class="settings-page__scroll" trigger="hover">
            <div ref="contentRef" class="settings-content">
                <UiPageHeader v-if="showPageHeader" :title="currentSectionTitle" :description="currentSectionDescription" />

                <!-- 数据同步 -->
                <DataSyncSettings v-if="capabilities.cloudBackup && activeSettingKey === 'cloud-backup'" />

                <!-- 数据备份 -->
                <DataManagementSettings v-if="activeSettingKey === 'data-management'" @navigate-section="handleMenuSelect" />

                <!-- 通用设置：外观和语言 -->
                <template v-if="activeSettingKey === 'general'">
                    <AppearanceSettings :model-value="{ themeSource: settings.themeSource }"
                        @update:model-value="(val) => { settings.themeSource = val.themeSource; updateSetting(); }" />
                    <LanguageSettings />
                </template>

                <StartupBehaviorSettings v-if="capabilities.startup && activeSettingKey === 'startup-behavior'"
                    :model-value="{ startMinimized: settings.startMinimized, autoLaunch: settings.autoLaunch }"
                    @update:model-value="(val) => { settings.startMinimized = val.startMinimized; settings.autoLaunch = val.autoLaunch; updateSetting(); }" />

                <CloseBehaviorSettings v-if="capabilities.tray && activeSettingKey === 'close-behavior'"
                    :model-value="{ closeBehaviorMode: settings.closeBehaviorMode, closeAction: settings.closeAction }"
                    @update:model-value="(val) => { settings.closeBehaviorMode = val.closeBehaviorMode; settings.closeAction = val.closeAction; updateSetting(); }" />

                <!-- 快捷键页自带页头（恢复默认按钮在页头上） -->
                <ShortcutSettings v-if="capabilities.globalShortcuts && activeSettingKey === 'shortcuts'" />

                <NetworkProxySettings v-if="capabilities.systemProxy && activeSettingKey === 'network-proxy'"
                    :model-value="settings.networkProxy"
                    @update:model-value="(val) => { settings.networkProxy = val; updateSetting(); }" />

                <CliBridgeSettings v-if="capabilities.cliBridge && activeSettingKey === 'cli-bridge'" />

                <!-- 关于页自带带图标的页头 -->
                <AboutSettings v-if="activeSettingKey === 'about'" />

                <UiPanel v-if="activeSettingKey === 'laboratory' && isDevelopment">
                    <LaboratoryPanel />
                </UiPanel>
            </div>
        </NScrollbar>
    </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onBeforeUnmount, computed, nextTick, watch } from "vue";
import { useI18n } from '~/composables/useI18n'
import { NScrollbar, NSelect, useMessage } from "naive-ui";
import { Cloud, Database, Flask, InfoCircle, Keyboard, Power, Rocket, Settings, Terminal2, Wifi } from "@vicons/tabler";
import LaboratoryPanel from "@/components/example/LaboratoryPanel.vue";
import AboutSettings from "@/components/settings/AboutSettings.vue";
import AppearanceSettings from "@/components/settings/AppearanceSettings.vue";
import CliBridgeSettings from "@/components/settings/CliBridgeSettings.vue";
import CloseBehaviorSettings from "@/components/settings/CloseBehaviorSettings.vue";
import DataManagementSettings from "@/components/settings/DataManagementSettings.vue";
import DataSyncSettings from "@/components/settings/DataSyncSettings.vue";
import LanguageSettings from "@/components/settings/LanguageSettings.vue";
import NetworkProxySettings from "@/components/settings/NetworkProxySettings.vue";
import SettingsNav from "@/components/settings/SettingsNav.vue";
import ShortcutSettings from "@/components/settings/ShortcutSettings.vue";
import StartupBehaviorSettings from "@/components/settings/StartupBehaviorSettings.vue";
import type { SettingsNavGroup } from "@/components/settings/types";
import UiPageHeader from "@/components/ui/UiPageHeader.vue";
import UiPanel from "@/components/ui/UiPanel.vue";
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

const normalizeSettingKey = (key?: string) => {
    if (key === 'appearance' || key === 'language') {
        return 'general';
    }

    return key;
};

// 外部入口可以用 # 带上页面里的面板，例如 data-management#full-backup：切到这一页后滚到该面板并短暂高亮
const splitTargetSection = (target?: string) => {
    const [section, anchor] = (target || '').split('#');
    return { section: normalizeSettingKey(section || undefined), anchor: anchor || '' };
};

// 当前激活的设置项。兼容外部入口仍传入旧的外观、语言 key。
const activeSettingKey = ref(splitTargetSection(props.targetSection).section || 'cloud-backup');

const contentRef = ref<HTMLElement>();
let stopFollowingAnchor: (() => void) | null = null;

/** 滚到带 data-settings-anchor 的面板，描一圈强调色，焦点放到面板里的第一个按钮 */
const revealAnchor = async (anchor: string) => {
    stopFollowingAnchor?.();
    await nextTick();
    const content = contentRef.value;
    const target = content?.querySelector<HTMLElement>(`[data-settings-anchor="${anchor}"]`);
    const scroller = target?.closest<HTMLElement>('.n-scrollbar-container');
    if (!content || !target || !scroller) return;

    const scrollToTarget = () => {
        scroller.scrollTop += target.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 24;
    };
    // 面板上方的备份列表是异步加载的，加载完内容变高会把面板挤下去：短时间内跟着重新定位，用户自己滚动后就不再跟
    const observer = new ResizeObserver(scrollToTarget);
    let timer = 0;
    const stop = () => {
        observer.disconnect();
        window.clearTimeout(timer);
        scroller.removeEventListener('wheel', stop);
        stopFollowingAnchor = null;
    };
    scrollToTarget();
    observer.observe(content);
    timer = window.setTimeout(stop, 1500);
    scroller.addEventListener('wheel', stop, { passive: true });
    stopFollowingAnchor = stop;

    target.classList.add('is-settings-target');
    window.setTimeout(() => target.classList.remove('is-settings-target'), 2000);
    target.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
};


const saving = ref(false);

// 设置数据
const settings = reactive({
    closeBehaviorMode: "ask" as "ask" | "fixed", // 新增：关闭行为模式
    closeAction: "quit" as "quit" | "minimize",
    startMinimized: false,
    autoLaunch: false,
    themeSource: "system" as "system" | "light" | "dark",
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
        { label: t('settings.sections.cloudBackup'), key: "cloud-backup", icon: Cloud, visible: capabilities.cloudBackup },
        { label: t('settings.sections.dataManagement'), key: "data-management", icon: Database, visible: true },
        { label: t('settings.sections.general'), key: "general", icon: Settings, visible: true },
        { label: t('settings.sections.startup'), key: "startup-behavior", icon: Rocket, visible: capabilities.startup },
        { label: t('settings.sections.close'), key: "close-behavior", icon: Power, visible: capabilities.tray },
        { label: t('settings.sections.shortcuts'), key: "shortcuts", icon: Keyboard, visible: capabilities.globalShortcuts },
        { label: t('settings.sections.networkProxy'), key: "network-proxy", icon: Wifi, visible: capabilities.systemProxy },
        { label: t('settings.sections.cliBridge'), key: "cli-bridge", icon: Terminal2, visible: capabilities.cliBridge },
        { label: t('settings.sections.about'), key: "about", icon: InfoCircle, visible: true },
        ...(isDevelopment ? [{ label: t('settings.sections.laboratory'), key: "laboratory", icon: Flask, visible: true }] : []),
    ].filter(option => option.visible)
        .map(({ visible, ...option }) => option);
});

// V5 分组：数据（同步、备份）/ 偏好（通用、启动、关闭、快捷键）/ 系统（代理、CLI）/ 其他（关于）
const navGroups = computed<SettingsNavGroup[]>(() => {
    const items = settingItems.value;
    const pick = (...keys: string[]) => items.filter(item => keys.includes(item.key));

    return [
        { key: 'data', label: t('settings.groups.data'), items: pick('cloud-backup', 'data-management') },
        { key: 'preferences', label: t('settings.groups.preferences'), items: pick('general', 'startup-behavior', 'close-behavior', 'shortcuts') },
        { key: 'system', label: t('settings.groups.system'), items: pick('network-proxy', 'cli-bridge') },
        { key: 'other', label: t('settings.groups.other'), items: pick('about', 'laboratory') },
    ].filter(group => group.items.length > 0);
});

const compactMenuOptions = computed(() => settingItems.value.map(item => ({
    label: item.label,
    value: item.key,
})));

const visibleSettingKeys = computed(() => settingItems.value.map(option => option.key));

const ensureActiveSettingIsVisible = () => {
    if (!visibleSettingKeys.value.includes(activeSettingKey.value)) {
        activeSettingKey.value = visibleSettingKeys.value[0] || 'data-management';
    }
};

// 快捷键和关于页自己画页头
const showPageHeader = computed(() => !['shortcuts', 'about'].includes(activeSettingKey.value));
const currentSectionTitle = computed(() => settingItems.value.find(option => option.key === activeSettingKey.value)?.label || '');
const currentSectionDescription = computed(() => t(`settings.sectionDescriptions.${activeSettingKey.value}.description`));

// 处理菜单选择
const handleMenuSelect = (key: string) => {
    activeSettingKey.value = key;
};

// 加载设置
const loadSettings = async () => {
    try {
        const prefs = await preferencesClient.get();

        // 其他配置
        settings.closeBehaviorMode = prefs.closeBehaviorMode || "ask";
        settings.closeAction = prefs.closeAction || "quit";
        settings.startMinimized = prefs.startMinimized || false;
        settings.autoLaunch = prefs.autoLaunch || false;
        settings.themeSource = prefs.themeSource || "system";
        
        // 网络代理配置
        if (prefs.networkProxy) {
            settings.networkProxy.mode = prefs.networkProxy.mode || 'system';
            if (prefs.networkProxy.manualConfig) {
                settings.networkProxy.manualConfig.httpProxy = prefs.networkProxy.manualConfig.httpProxy || '';
                settings.networkProxy.manualConfig.httpsProxy = prefs.networkProxy.manualConfig.httpsProxy || '';
                settings.networkProxy.manualConfig.noProxy = prefs.networkProxy.manualConfig.noProxy || '';
            }
        }

    } catch (error) {
        console.error(t('settingsMessages.loadSettingsFailed'), error);
        message.error(t('settingsMessages.loadSettingsFailed'));
    }
};

// 更新设置
// 保存还没结束时又改了设置（例如 0.5 秒内连点两张主题卡片）：不能丢掉后一次，
// 记下来，等这次保存结束后按最新的值再存一遍，卡片选中态和实际主题才会一致 (#444)
let saveQueued = false;
const updateSetting = async () => {
    if (saving.value) {
        saveQueued = true;
        return;
    }

    saving.value = true;
    saveQueued = false;
    try {
        // 创建纯对象副本
        const settingsData = JSON.parse(
            JSON.stringify({
                closeBehaviorMode: settings.closeBehaviorMode,
                closeAction: settings.closeAction,
                startMinimized: settings.startMinimized,
                autoLaunch: settings.autoLaunch,
                themeSource: settings.themeSource,
                networkProxy: settings.networkProxy,
            })
        );

        await preferencesClient.set(settingsData);

        // 如果更改了主题设置，也要更新主题管理器
        if (settings.themeSource) {
            await setThemeSource(settings.themeSource);
        }

    } catch (error) {
        console.error(t('settingsMessages.saveSettingsFailed'), error);
        message.error(t('settingsMessages.saveSettingsFailed'));
    } finally {
        saving.value = false;
        if (saveQueued) void updateSetting();
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
    const { section, anchor } = splitTargetSection(newTargetSection);
    if (section && section !== activeSettingKey.value) {
        activeSettingKey.value = section;
        ensureActiveSettingIsVisible();
    }
    if (anchor) void revealAnchor(anchor);
}, { immediate: true });

onBeforeUnmount(() => stopFollowingAnchor?.());

watch(navGroups, () => {
    ensureActiveSettingIsVisible();
}, { immediate: true });
</script>

<style scoped>
.settings-page {
    display: flex;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: var(--surface-primary);
}

.settings-page__compact {
    display: none;
}

.settings-page__scroll {
    flex: 1;
    min-width: 0;
    min-height: 0;
}

.settings-page__scroll :deep(.n-scrollbar-container) {
    overscroll-behavior: contain;
}

.settings-content {
    display: flex;
    flex-direction: column;
    gap: 16px;
    width: 100%;
    max-width: var(--reading-width);
    box-sizing: border-box;
    padding: 28px var(--page-padding-detail);
}

/* 从别处定位过来的面板：短暂描一圈强调色，告诉用户要找的东西在这里 */
.settings-content :deep([data-settings-anchor]) {
    transition: border-color 0.3s ease, box-shadow 0.3s ease;
}

.settings-content :deep(.is-settings-target) {
    border-color: var(--accent-primary);
    box-shadow: var(--focus-ring);
}

@media (max-width: 860px) {
    .settings-page {
        flex-direction: column;
    }

    .settings-page__nav {
        display: none;
    }

    .settings-page__compact {
        display: block;
        flex: none;
        padding: 12px var(--page-padding-list);
        border-bottom: 1px solid var(--border-default);
        background: var(--surface-secondary);
    }

    .settings-page__compact .n-select {
        max-width: 320px;
    }

    .settings-content {
        padding: 24px var(--page-padding-list);
    }
}
</style>
