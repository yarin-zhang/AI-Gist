<template>
    <div class="settings-page">
        <NFlex vertical size="large">
            <!-- 页面标题 -->
            <NFlex justify="space-between" align="center">
                <div>
                    <NText strong style="font-size: 28px">应用设置</NText>
                    <NText depth="3" style="display: block; margin-top: 4px">
                        个性化配置您的应用偏好
                    </NText>
                </div>
                <NFlex>
                    <NButton type="error" @click="resetSettings" :loading="loading.reset" secondary>
                        <template #icon>
                            <NIcon>
                                <Refresh />
                            </NIcon>
                        </template>
                        恢复默认设置
                    </NButton>
                </NFlex>
            </NFlex>

            <NFlex :size="24">
                <!-- 左侧菜单 -->
                <div style="width: 240px; flex-shrink: 0">
                    <NCard>
                        <template #header>
                            <NFlex align="center" :size="12">
                                <NIcon size="20" color="#409EFF">
                                    <Settings />
                                </NIcon>
                                <span>设置菜单</span>
                            </NFlex>
                        </template>

                        <NMenu v-model:value="activeSettingKey" :options="menuOptions" @update:value="handleMenuSelect"
                            accordion show-trigger />
                    </NCard>
                </div>

                <!-- 右侧设置内容 -->
                <div style="flex: 1; min-width: 0">
                    <NFlex vertical :size="24">
                        <!-- 页面标题 -->
                        <NCard>
                            <template #header>
                                <NFlex align="center" :size="12">
                                    <NIcon size="24" color="#409EFF">
                                        <component :is="currentSectionIcon" />
                                    </NIcon>
                                    <span>{{ currentSectionTitle }}</span>
                                </NFlex>
                            </template>

                            <NFlex vertical :size="16">
                                <NAlert type="info" show-icon>
                                    <template #header>设置说明</template>
                                    {{ currentSectionDescription }}
                                </NAlert>
                            </NFlex>
                        </NCard>

                        <!-- 关闭行为设置 -->
                        <NCard v-show="activeSettingKey === 'close-behavior'" title="关闭行为详细设置">
                            <NFlex vertical :size="16">
                                <NFormItem label="关闭行为模式">
                                    <NRadioGroup v-model:value="settings.closeBehaviorMode"
                                        @update:value="updateSetting">
                                        <NFlex vertical :size="12">
                                            <NRadio value="ask">
                                                <NFlex align="center" :size="8">
                                                    <div>
                                                        <div>每次询问</div>
                                                        <NText depth="3" style="font-size: 12px">
                                                            点击关闭按钮时弹出对话框，让您选择退出应用还是最小化到托盘
                                                        </NText>
                                                    </div>
                                                </NFlex>
                                            </NRadio>
                                            <NRadio value="fixed">
                                                <NFlex align="center" :size="8">
                                                    <div>
                                                        <div>固定行为</div>
                                                        <NText depth="3" style="font-size: 12px">
                                                            点击关闭按钮时直接执行指定的关闭动作，不再弹出对话框
                                                        </NText>
                                                    </div>
                                                </NFlex>
                                            </NRadio>
                                        </NFlex>
                                    </NRadioGroup>
                                </NFormItem>

                                <NFormItem v-if="settings.closeBehaviorMode === 'fixed'" label="关闭动作"
                                    style="margin-left: 24px">
                                    <NRadioGroup v-model:value="settings.closeAction" @update:value="updateSetting">
                                        <NFlex vertical :size="8">
                                            <NRadio value="quit">
                                                <NFlex align="center" :size="8">
                                                    <div>
                                                        <div>退出应用</div>
                                                        <NText depth="3" style="font-size: 12px">
                                                            直接退出应用程序
                                                        </NText>
                                                    </div>
                                                </NFlex>
                                            </NRadio>
                                            <NRadio value="minimize">
                                                <NFlex align="center" :size="8">
                                                    <div>
                                                        <div>最小化到托盘</div>
                                                        <NText depth="3" style="font-size: 12px">
                                                            最小化到系统托盘，应用继续在后台运行
                                                        </NText>
                                                    </div>
                                                </NFlex>
                                            </NRadio>
                                        </NFlex>
                                    </NRadioGroup>
                                </NFormItem>

                                <NAlert v-if="settings.closeBehaviorMode === 'ask'" type="info" show-icon>
                                    <template #header>当前设置</template>
                                    点击关闭按钮时会弹出对话框，您可以选择退出应用或最小化到托盘。
                                </NAlert>

                                <NAlert v-if="settings.closeBehaviorMode === 'fixed'" type="success" show-icon>
                                    <template #header>当前设置</template>
                                    点击关闭按钮时将直接执行"{{
                                        settings.closeAction === "quit"
                                            ? "退出应用"
                                    : "最小化到托盘"
                                    }}"操作，不会弹出对话框。
                                </NAlert>
                            </NFlex>
                        </NCard>

                        <!-- 启动行为设置 -->
                        <NCard v-show="activeSettingKey === 'startup-behavior'" title="启动行为详细设置">
                            <NFlex vertical :size="16">
                                <NFormItem label="启动模式">
                                    <NCheckbox v-model:checked="settings.startMinimized"
                                        @update:checked="updateSetting">
                                        <NFlex align="center" :size="8">
                                            <div>
                                                <div>启动时最小化到系统托盘</div>
                                                <NText depth="3" style="font-size: 12px">
                                                    启用后应用启动时不会显示主窗口，直接最小化到托盘运行
                                                </NText>
                                            </div>
                                        </NFlex>
                                    </NCheckbox>
                                </NFormItem>

                                <NDivider />

                                <NFormItem label="自启动设置">
                                    <NCheckbox v-model:checked="settings.autoLaunch" @update:checked="updateSetting">
                                        <NFlex align="center" :size="8">
                                            <div>
                                                <div>开机时自动启动应用</div>
                                                <NText depth="3" style="font-size: 12px">
                                                    启用后应用会在系统启动时自动运行
                                                </NText>
                                            </div>
                                        </NFlex>
                                    </NCheckbox>
                                </NFormItem>
                            </NFlex>
                        </NCard>

                        <!-- 外观设置 -->
                        <NCard v-show="activeSettingKey === 'appearance'" title="外观详细设置">
                            <NFlex vertical :size="16">
                                <NFormItem label="主题模式">
                                    <NRadioGroup v-model:value="settings.themeSource" @update:value="updateSetting">
                                        <NFlex vertical :size="8">
                                            <NRadio value="system">
                                                <NFlex align="center" :size="8">
                                                    <div>
                                                        <div>跟随系统</div>
                                                        <NText depth="3" style="font-size: 12px">
                                                            自动跟随系统的主题设置
                                                        </NText>
                                                    </div>
                                                </NFlex>
                                            </NRadio>
                                            <NRadio value="light">
                                                <NFlex align="center" :size="8">
                                                    <div>
                                                        <div>浅色主题</div>
                                                        <NText depth="3" style="font-size: 12px">
                                                            始终使用浅色主题
                                                        </NText>
                                                    </div>
                                                </NFlex>
                                            </NRadio>
                                            <NRadio value="dark">
                                                <NFlex align="center" :size="8">
                                                    <div>
                                                        <div>深色主题</div>
                                                        <NText depth="3" style="font-size: 12px">
                                                            始终使用深色主题
                                                        </NText>
                                                    </div>
                                                </NFlex>
                                            </NRadio>
                                        </NFlex>
                                    </NRadioGroup>
                                </NFormItem>
                            </NFlex>
                        </NCard>

                        <!-- 操作状态提示 -->
                        <NCard>
                            <NFlex justify="space-between" align="center">
                                <NFlex :size="12">
                                    <NText depth="3">设置会自动保存</NText>
                                    <NIcon v-if="!saving" color="#18a058">
                                        <Check />
                                    </NIcon>
                                    <NSpin v-else size="small" />
                                </NFlex>
                            </NFlex>
                        </NCard>
                    </NFlex>
                </div>
            </NFlex>
        </NFlex>
    </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed, h } from "vue";
import {
    NCard,
    NAlert,
    NFlex,
    NIcon,
    NFormItem,
    NRadioGroup,
    NRadio,
    NCheckbox,
    NButton,
    NText,
    NSpin,
    NMenu,
    NDivider,
    useMessage,
} from "naive-ui";
import {
    Settings,
    Check,
    Refresh,
    Power,
    Minimize,
    EyeOff,
    Rocket,
    DeviceDesktop,
    Sun,
    Moon,
} from "@vicons/tabler";

// 消息提示
const message = useMessage();

// 当前激活的设置项
const activeSettingKey = ref("close-behavior");

// 状态管理
const saving = ref(false);
const loading = reactive({
    reset: false,
});

// 设置数据
const settings = reactive({
    closeBehaviorMode: "ask" as "ask" | "fixed", // 新增：关闭行为模式
    closeAction: "quit" as "quit" | "minimize",
    startMinimized: false,
    autoLaunch: false,
    themeSource: "system" as "system" | "light" | "dark",
});

// 菜单选项
const menuOptions = [
    {
        label: "外观设置",
        key: "appearance",
        icon: () => h(NIcon, { size: 16 }, { default: () => h(Sun) }),
    },
    {
        label: "启动行为设置",
        key: "startup-behavior",
        icon: () => h(NIcon, { size: 16 }, { default: () => h(Rocket) }),
    },
    {
        label: "关闭行为设置",
        key: "close-behavior",
        icon: () => h(NIcon, { size: 16 }, { default: () => h(Power) }),
    },
];

// 当前设置节的信息
const currentSectionInfo = computed(() => {
    const sections = {
        "close-behavior": {
            title: "关闭行为设置",
            icon: Power,
            description:
                '配置点击关闭按钮时的行为，可选择退出应用或最小化到托盘。启用"记住我的选择"后，设置将永久保存。',
        },
        "startup-behavior": {
            title: "启动行为设置",
            icon: Rocket,
            description:
                "配置应用启动时的行为，包括是否最小化启动和开机自启动等选项。",
        },
        appearance: {
            title: "外观设置",
            icon: Sun,
            description: "配置应用的主题模式，可选择跟随系统、浅色或深色主题。",
        },
    };
    return sections[activeSettingKey.value] || sections["close-behavior"];
});

const currentSectionTitle = computed(() => currentSectionInfo.value.title);
const currentSectionIcon = computed(() => currentSectionInfo.value.icon);
const currentSectionDescription = computed(
    () => currentSectionInfo.value.description
);

// 处理菜单选择
const handleMenuSelect = (key: string) => {
    activeSettingKey.value = key;
};

// 加载设置
const loadSettings = async () => {
    try {
        const prefs = await window.electronAPI.preferences.get();

        // 处理向后兼容性：将旧的 dontShowCloseDialog 转换为新的 closeBehaviorMode
        if (prefs.hasOwnProperty("dontShowCloseDialog")) {
            prefs.closeBehaviorMode = prefs.dontShowCloseDialog ? "fixed" : "ask";
            delete prefs.dontShowCloseDialog;
        }

        Object.assign(settings, prefs);
        console.log("设置加载成功:", prefs);
    } catch (error) {
        console.error("加载设置失败:", error);
        message.error("加载设置失败");
    }
};

// 更新设置
const updateSetting = async () => {
    if (saving.value) return;

    saving.value = true;
    try {
        // 创建纯对象副本，避免传递 Vue 响应式对象
        const settingsData = JSON.parse(
            JSON.stringify({
                closeBehaviorMode: settings.closeBehaviorMode,
                closeAction: settings.closeAction,
                startMinimized: settings.startMinimized,
                autoLaunch: settings.autoLaunch,
                themeSource: settings.themeSource,
            })
        );

        const updatedPrefs = await window.electronAPI.preferences.set(settingsData);
        console.log("设置更新成功:", updatedPrefs);

        // 如果更改了主题设置，也要更新主题管理器
        if (settings.themeSource) {
            await window.electronAPI.theme.setSource(settings.themeSource);
        }

        setTimeout(() => {
            saving.value = false;
        }, 500);
    } catch (error) {
        console.error("保存设置失败:", error);
        message.error("保存设置失败");
        saving.value = false;
    }
};

// 重置设置
const resetSettings = async () => {
    loading.reset = true;
    try {
        const defaultPrefs = await window.electronAPI.preferences.reset();
        Object.assign(settings, defaultPrefs);

        // 重置主题
        await window.electronAPI.theme.setSource(settings.themeSource);

        message.success("设置已恢复为默认值");
        console.log("设置已重置:", defaultPrefs);
    } catch (error) {
        console.error("重置设置失败:", error);
        message.error("重置设置失败");
    }
    loading.reset = false;
};

// 组件挂载时加载设置
onMounted(async () => {
    await loadSettings();
});
</script>

<style scoped>
.settings-page {
    padding: 24px;
    height: 100vh;
    overflow-y: auto;
}

.n-form-item {
    margin-bottom: 0;
}
</style>
