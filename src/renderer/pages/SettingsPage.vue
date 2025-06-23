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
                                <NAlert :show-icon="false">
                                    {{ currentSectionDescription }}
                                </NAlert>
                            </NFlex>
                        </NCard>


                        <!-- 数据管理设置 -->
                        <DataManagementSettings 
                            ref="dataManagementRef"
                            v-show="activeSettingKey === 'data-management'"
                            :loading="loading"
                            @export-data="exportData"
                            @import-data="importData"
                            @export-selected-data="exportSelectedData"
                            @export-full-backup="exportFullBackup"
                            @import-full-backup="importFullBackup"
                            @create-backup="createBackup"
                            @restore-backup="restoreSpecificBackup"
                            @delete-backup="deleteBackup"
                            @refresh-backup-list="refreshBackupList"
                            @check-database-health="checkDatabaseHealth"
                            @repair-database="repairDatabase"
                            @clear-database="clearDatabase"
                        />                        <!-- WebDAV 同步设置 -->
                        <WebDAVSyncSettings 
                            v-show="activeSettingKey === 'webdav-sync'"
                            :model-value="{ 
                                webdav: { ...settings.webdav }, 
                                dataSync: { ...settings.dataSync } 
                            }"
                            @update:model-value="(val) => { 
                                // 只更新设置数据，不自动保存
                                Object.assign(settings.webdav, val.webdav); 
                                Object.assign(settings.dataSync, val.dataSync); 
                            }"
                            @save-webdav="saveWebDAVSettings"
                            @test-connection="testWebDAVConnection"
                            @sync-now="syncNow"
                            @sync-time-updated="updateSyncTime"
                        />

                        <!-- iCloud 同步设置 -->
                        <ICloudSyncSettings 
                            v-show="activeSettingKey === 'icloud-sync'"
                        />

                        <!-- 外观设置 -->
                        <AppearanceSettings 
                            v-show="activeSettingKey === 'appearance'"
                            :model-value="{ themeSource: settings.themeSource }"
                            @update:model-value="(val) => { settings.themeSource = val.themeSource; updateSetting(); }"
                        />

                        <!-- 关闭行为设置 -->
                        <CloseBehaviorSettings 
                            v-show="activeSettingKey === 'close-behavior'"
                            :model-value="{ closeBehaviorMode: settings.closeBehaviorMode, closeAction: settings.closeAction }"
                            @update:model-value="(val) => { settings.closeBehaviorMode = val.closeBehaviorMode; settings.closeAction = val.closeAction; updateSetting(); }"
                        />

                        <!-- 启动行为设置 -->
                        <StartupBehaviorSettings 
                            v-show="activeSettingKey === 'startup-behavior'"
                            :model-value="{ startMinimized: settings.startMinimized, autoLaunch: settings.autoLaunch }"
                            @update:model-value="(val) => { settings.startMinimized = val.startMinimized; settings.autoLaunch = val.autoLaunch; updateSetting(); }"
                        />
                        
                        
                        <!-- 关于 -->
                        <AboutSettings 
                            v-show="activeSettingKey === 'about'"
                        />
                        
                        <!-- 实验室 (仅开发环境) -->
                        <NCard v-show="activeSettingKey === 'laboratory' && isDevelopment">
                            <LaboratoryPanel />
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
import { ref, reactive, onMounted, computed, h, watch } from "vue";
import {
    NCard,
    NAlert,
    NFlex,
    NIcon,
    NButton,
    NText,
    NSpin,
    NMenu,
    useMessage,
} from "naive-ui";
import {
    Settings,
    Check,
    Refresh,
    Power,
    Rocket,
    Sun,
    Flask,
    Cloud,
    Database,
    InfoCircle,
} from "@vicons/tabler";
import LaboratoryPanel from "@/components/example/LaboratoryPanel.vue";
import AppearanceSettings from "@/components/settings/AppearanceSettings.vue";
import CloseBehaviorSettings from "@/components/settings/CloseBehaviorSettings.vue";
import StartupBehaviorSettings from "@/components/settings/StartupBehaviorSettings.vue";
import WebDAVSyncSettings from "@/components/settings/WebDAVSyncSettings.vue";
import ICloudSyncSettings from "@/components/settings/ICloudSyncSettings.vue";
import DataManagementSettings from "@/components/settings/DataManagementSettings.vue";
import AboutSettings from "@/components/settings/AboutSettings.vue";
import { WebDAVAPI, DataManagementAPI } from "@/lib/api";

// Props 定义
interface Props {
    targetSection?: string;
}

const props = withDefaults(defineProps<Props>(), {
    targetSection: undefined
});

// 消息提示
const message = useMessage();

// 检测是否为开发环境
const isDevelopment = import.meta.env.DEV;
const currentMode = import.meta.env.MODE;

// 当前激活的设置项
const activeSettingKey = ref(props.targetSection || 'data-management');

// 组件引用
const dataManagementRef = ref<InstanceType<typeof DataManagementSettings>>();

// 状态管理
const saving = ref(false);
const loading = reactive({
    reset: false,
    webdavTest: false,
    sync: false,
    export: false,
    import: false,
    repair: false,
    healthCheck: false,
    backup: false,
    clearDatabase: false,
});

// 设置数据
const settings = reactive({
    closeBehaviorMode: "ask" as "ask" | "fixed", // 新增：关闭行为模式
    closeAction: "quit" as "quit" | "minimize",
    startMinimized: false,
    autoLaunch: false,
    themeSource: "system" as "system" | "light" | "dark",
    // WebDAV 同步设置
    webdav: {
        enabled: false,
        serverUrl: "",
        username: "",
        password: "",
        autoSync: false,
        syncInterval: 30, // 分钟
        // 连接验证状态
        connectionTested: false,
        connectionValid: false,
        connectionMessage: '',
        connectionTestedAt: '',
        configHash: '',
    },
    // 数据同步设置
    dataSync: {
        lastSyncTime: null as string | null,
        autoBackup: true,
        backupInterval: 24, // 小时
    },
});

// 菜单选项
const menuOptions = computed(() => {
    const baseOptions = [
        {
            label: "数据管理",
            key: "data-management",
            icon: () => h(NIcon, { size: 16 }, { default: () => h(Database) }),
        },
        {
            label: "WebDAV 同步",
            key: "webdav-sync",
            icon: () => h(NIcon, { size: 16 }, { default: () => h(Cloud) }),
        },
        {
            label: "iCloud 同步",
            key: "icloud-sync",
            icon: () => h(NIcon, { size: 16 }, { default: () => h(Cloud) }),
        },
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
        {
            label: "关于",
            key: "about",
            icon: () => h(NIcon, { size: 16 }, { default: () => h(InfoCircle) }),
        },
    ];

    // 仅在开发环境中添加实验室菜单
    if (isDevelopment) {
        baseOptions.push({
            label: "实验室",
            key: "laboratory",
            icon: () => h(NIcon, { size: 16 }, { default: () => h(Flask) }),
        });
    }

    return baseOptions;
});

// 当前设置节的信息
const currentSectionInfo = computed(() => {
    const sections = {
        "close-behavior": {
            title: "关闭行为设置",
            icon: Power,
            description: "配置点击关闭按钮时的行为方式"
        },
        "startup-behavior": {
            title: "启动行为设置",
            icon: Rocket,
            description: "配置应用启动和自启动选项"
        },
        appearance: {
            title: "外观设置",
            icon: Sun,
            description: "配置应用的主题模式"
        },
        "webdav-sync": {
            title: "WebDAV 同步",
            icon: Cloud,
            description: "配置 WebDAV 服务器连接和数据同步设置"
        },
        "icloud-sync": {
            title: "iCloud 同步",
            icon: Cloud,
            description: "配置 iCloud Drive 数据同步设置，Windows 用户可手动安装 iCloud 客户端"
        },
        "data-management": {
            title: "数据管理",
            icon: Database,
            description: "数据备份、恢复、导入导出功能"
        },
        about: {
            title: "关于",
            icon: InfoCircle,
            description: "查看应用版本信息和检查更新"
        },
        laboratory: {
            title: "实验室",
            icon: Flask,
            description: "开发中的实验性功能和组件测试"
        },
    };
    return sections[activeSettingKey.value] || sections["data-management"];
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
        console.log('开始加载设置...');
        const prefs = await window.electronAPI.preferences.get();
        console.log('获取到的原始配置:', prefs);
        
        // 直接从 WebDAV API 获取配置
        try {
            const webdavConfig = await WebDAVAPI.getConfig();
            console.log('从 WebDAV API 获取的配置:', webdavConfig);
            
            settings.webdav = {
                enabled: webdavConfig.enabled || false,
                serverUrl: webdavConfig.serverUrl || "",
                username: webdavConfig.username || "",
                password: webdavConfig.password || "",
                autoSync: webdavConfig.autoSync || false,
                syncInterval: webdavConfig.syncInterval || 30,
                // 连接验证状态
                connectionTested: webdavConfig.connectionTested || false,
                connectionValid: webdavConfig.connectionValid || false,
                connectionMessage: webdavConfig.connectionMessage || '',
                connectionTestedAt: webdavConfig.connectionTestedAt || '',
                configHash: webdavConfig.configHash || '',
            };
        } catch (error) {
            console.error('从 WebDAV API 获取配置失败，使用 preferences:', error);
            // 回退到使用 preferences
            const webdavConfig = prefs.webdav || {};
            console.log('WebDAV 配置:', webdavConfig);
            
            settings.webdav = {
                enabled: webdavConfig.enabled || false,
                serverUrl: webdavConfig.serverUrl || "",
                username: webdavConfig.username || "",
                password: webdavConfig.password || "",
                autoSync: webdavConfig.autoSync || false,
                syncInterval: webdavConfig.syncInterval || 30,
                // 连接验证状态
                connectionTested: webdavConfig.connectionTested || false,
                connectionValid: webdavConfig.connectionValid || false,
                connectionMessage: webdavConfig.connectionMessage || '',
                connectionTestedAt: webdavConfig.connectionTestedAt || '',
                configHash: webdavConfig.configHash || '',
            };
        }
        
        console.log('最终设置的 WebDAV 配置:', settings.webdav);
        
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
        
        console.log("设置加载成功:", {
            ...settings,
            webdav: {
                ...settings.webdav,
                password: settings.webdav.password ? '[已设置]' : '[未设置]'
            }
        });
    } catch (error) {
        console.error("加载设置失败:", error);
        message.error("加载设置失败");
    }
};

// 更新设置（排除WebDAV设置，避免密码处理问题）
const updateSetting = async () => {
    if (saving.value) return;

    saving.value = true;
    try {
        // 创建纯对象副本，排除WebDAV设置，避免密码加密问题
        const settingsData = JSON.parse(
            JSON.stringify({
                closeBehaviorMode: settings.closeBehaviorMode,
                closeAction: settings.closeAction,
                startMinimized: settings.startMinimized,
                autoLaunch: settings.autoLaunch,
                themeSource: settings.themeSource,
                dataSync: settings.dataSync,
                // 排除 webdav 设置，由专门的函数处理
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

// 更新设置（智能版本，用于特定字段更新）
const updateSettingsSmart = async (fieldsToUpdate = null) => {
    if (saving.value) return;

    saving.value = true;
    try {
        // 只更新指定字段，如果没有指定则更新所有字段
        let settingsData;
        if (fieldsToUpdate) {
            settingsData = {};
            for (const field of fieldsToUpdate) {
                if (field === 'webdav') {
                    // WebDAV 设置由专门的函数处理，这里跳过
                    console.log('跳过 WebDAV 设置，由专门函数处理');
                    continue;
                } else if (field === 'dataSync') {
                    settingsData.dataSync = JSON.parse(JSON.stringify(settings.dataSync));
                } else {
                    settingsData[field] = settings[field];
                }
            }
        } else {
            // 创建纯对象副本，排除 WebDAV 设置
            settingsData = JSON.parse(
                JSON.stringify({
                    closeBehaviorMode: settings.closeBehaviorMode,
                    closeAction: settings.closeAction,
                    startMinimized: settings.startMinimized,
                    autoLaunch: settings.autoLaunch,
                    themeSource: settings.themeSource,
                    dataSync: settings.dataSync,
                    // 排除 webdav 设置，由专门的函数处理
                })
            );
        }

        // 如果没有要更新的数据，直接返回
        if (!settingsData || Object.keys(settingsData).length === 0) {
            console.log('没有需要更新的设置');
            saving.value = false;
            return;
        }

        const updatedPrefs = await window.electronAPI.preferences.set(settingsData);
        console.log("设置更新成功:", updatedPrefs);

        // 如果更改了主题设置，也要更新主题管理器
        if (settingsData.themeSource) {
            await window.electronAPI.theme.setSource(settingsData.themeSource);
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

// 更新非 WebDAV 设置
const updateNonWebDAVSetting = async () => {
    if (saving.value) return;

    saving.value = true;
    try {
        // 只更新非敏感的设置
        const settingsData = {
            closeBehaviorMode: settings.closeBehaviorMode,
            closeAction: settings.closeAction,
            startMinimized: settings.startMinimized,
            autoLaunch: settings.autoLaunch,
            themeSource: settings.themeSource,
            dataSync: settings.dataSync,
        };

        await window.electronAPI.preferences.set(settingsData);
        console.log("基础设置更新成功");

        // 如果更改了主题设置，也要更新主题管理器
        if (settingsData.themeSource) {
            await window.electronAPI.theme.setSource(settingsData.themeSource);
        }

        setTimeout(() => {
            saving.value = false;
        }, 300);
    } catch (error) {
        console.error("保存设置失败:", error);
        saving.value = false;
    }
};

// 确保 WebDAV 配置已保存到后端（简化版本）
const ensureWebdavConfigSaved = async () => {
    try {
        console.log('确保WebDAV配置已保存到后端...');
        
        // 直接保存 WebDAV 配置，不需要复杂的密码状态管理
        await saveWebDAVSettings();
        console.log('WebDAV配置已确保保存');
    } catch (error) {
        console.error('确保WebDAV配置保存失败:', error);
        throw new Error('配置保存失败，无法进行同步');
    }
};

// 测试 WebDAV 连接
const testWebDAVConnection = async (callback) => {
    // 简单验证
    if (!settings.webdav.serverUrl || !settings.webdav.username || !settings.webdav.password) {
        const errorResult = { success: false, message: "请填写完整的服务器信息" };
        message.error(errorResult.message);
        if (callback) callback(errorResult);
        return errorResult;
    }

    loading.webdavTest = true;
    try {
        const result = await WebDAVAPI.testConnection({
            serverUrl: settings.webdav.serverUrl,
            username: settings.webdav.username,
            password: settings.webdav.password
        });
        
        if (result.success) {
            message.success(`WebDAV 连接测试成功${result.serverInfo?.name ? ` - ${result.serverInfo.name}` : ''}`);
        } else {
            message.error(result.message || "WebDAV 连接测试失败");
        }
        
        if (callback) callback(result);
        return result;
    } catch (error) {
        console.error("WebDAV 连接测试失败:", error);
        const errorResult = { 
            success: false, 
            message: error instanceof Error ? error.message : "WebDAV 连接测试失败" 
        };
        message.error(errorResult.message);
        if (callback) callback(errorResult);
        return errorResult;
    } finally {
        loading.webdavTest = false;
    }
};

// 立即同步
const syncNow = async () => {
    if (!settings.webdav.enabled) {
        message.error("请先启用 WebDAV 同步");
        return;
    }

    // 简单验证
    if (!settings.webdav.serverUrl || !settings.webdav.username || !settings.webdav.password) {
        message.error("WebDAV配置不完整，请检查服务器地址、用户名和密码");
        return;
    }

    loading.sync = true;
    try {
        // 使用安全同步方法，包含数据库健康检查
        const result = await WebDAVAPI.safeSyncNow();
        
        if (result.success) {
            settings.dataSync.lastSyncTime = result.timestamp;
            
            // 只更新 dataSync 配置，避免重复加密 WebDAV 密码
            await updateSettingsSmart(['dataSync']);
            
            // 优先显示后端返回的消息，如果没有则显示默认消息
            let successMessage = result.message || "数据同步成功";
            
            // 如果有冲突信息，简洁地显示
            if (result.conflictsDetected > 0) {
                if (result.conflictsResolved > 0) {
                    successMessage += ` (检测到 ${result.conflictsDetected} 个冲突，已解决 ${result.conflictsResolved} 个)`;
                } else {
                    successMessage += ` (检测到 ${result.conflictsDetected} 个冲突)`;
                }
                
                // 在控制台显示详细的冲突信息，前端只显示简洁消息
                if (result.conflictDetails && result.conflictDetails.length > 0) {
                    console.log('同步冲突详情:', result.conflictDetails);
                }
            }
            
            message.success(successMessage);
        } else {
            message.error(result.message || "数据同步失败");
        }
    } catch (error) {
        console.error("数据同步失败:", error);
        message.error("数据同步失败");
    }
    loading.sync = false;
};

// 创建备份
const createBackup = async () => {
    loading.backup = true;
    try {
        const timestamp = new Date().toLocaleString('zh-CN');
        const backup = await DataManagementAPI.createBackup(`手动备份 - ${timestamp}`);
        message.success(`备份创建成功: ${backup.name} (大小: ${(backup.size / 1024).toFixed(2)} KB)`);
        
        // 创建成功后立即刷新备份列表
        await refreshBackupList();
    } catch (error) {
        console.error("创建备份失败:", error);
        message.error("创建备份失败");
    } finally {
        loading.backup = false;
    }
};

// 恢复备份
const restoreBackup = async () => {
    try {
        const backups = await DataManagementAPI.getBackupList();
        if (backups.length === 0) {
            message.warning("没有可用的备份文件");
            return;
        }
        
        // 显示备份选择提示
        message.info(`找到 ${backups.length} 个备份文件，将恢复最新的备份: ${backups[0].name}`);
        
        // 使用最新的备份
        const latestBackup = backups[0];
        const result = await DataManagementAPI.restoreBackup(latestBackup.id);
        
        // 显示恢复结果
        if (result.success) {
            const successMessage = result.message || `备份恢复成功: ${latestBackup.name}`;
            message.success(successMessage);
        } else {
            message.error(result.message || "备份恢复失败");
        }
    } catch (error) {
        console.error("恢复备份失败:", error);
        message.error("恢复备份失败");
    }
};

// 恢复指定备份
const restoreSpecificBackup = async (backupId: string) => {
    loading.backup = true;
    try {
        // 步骤1: 先创建当前数据的自动备份
        message.info("正在创建当前数据的自动备份...");
        const timestamp = new Date().toLocaleString('zh-CN');
        const autoBackup = await DataManagementAPI.createBackup(`恢复前自动备份 - ${timestamp}`);
        console.log(`自动备份创建成功: ${autoBackup.name}`);
        
        // 步骤2: 执行恢复操作
        message.info("正在恢复备份数据...");
        const result = await DataManagementAPI.restoreBackupWithReplace(backupId);
        
        if (result.success) {
            const successMessage = result.message || "备份恢复成功";
            message.success(`${successMessage}。已自动备份原数据: ${autoBackup.name}`);
            // 恢复成功后刷新备份列表
            await refreshBackupList();
        } else {
            message.error(result.message || "备份恢复失败");
        }
    } catch (error) {
        console.error("恢复备份失败:", error);
        const errorMessage = error instanceof Error ? error.message : '恢复备份失败';
        message.error(`恢复备份失败: ${errorMessage}`);
    } finally {
        loading.backup = false;
    }
};

// 删除备份
const deleteBackup = async (backupId: string) => {
    try {
        console.log(`开始删除备份: ${backupId}`);
        await DataManagementAPI.deleteBackup(backupId);
        message.success("备份删除成功");
        // 删除成功后刷新备份列表
        await refreshBackupList();
    } catch (error) {
        console.error("删除备份失败:", error);
        const errorMessage = error instanceof Error ? error.message : '删除备份失败';
        message.error(`删除备份失败: ${errorMessage}`);
        
        // 删除失败后也刷新备份列表，以确保UI状态正确
        try {
            await refreshBackupList();
        } catch (refreshError) {
            console.error("刷新备份列表失败:", refreshError);
        }
    }
};

// 刷新备份列表
const refreshBackupList = async () => {
    try {
        const backups = await DataManagementAPI.getBackupList();
        
        // 转换备份数据格式以匹配组件期望的格式
        const formattedBackups = backups.map(backup => ({
            id: backup.id,
            name: backup.name,
            createdAt: new Date(backup.createdAt).toLocaleString('zh-CN'),
            size: `${(backup.size / 1024).toFixed(2)} KB`,
            version: backup.description || 'v1.0'
        }));
        
        // 更新子组件的备份列表
        if (dataManagementRef.value) {
            dataManagementRef.value.updateBackupList(formattedBackups);
        }
    } catch (error) {
        console.error("获取备份列表失败:", error);
        message.error("获取备份列表失败");
    }
};

// 导出数据
const exportData = async (format: 'json' | 'csv') => {
    loading.export = true;
    try {
        const defaultName = `ai-gist-sync-${new Date().toISOString().split('T')[0]}.${format}`;
        const exportPath = await DataManagementAPI.selectExportPath(defaultName);
        
        if (exportPath) {
            const result = await DataManagementAPI.exportData({
                format,
                includeCategories: true,
                includePrompts: true,
                includeSettings: true,
                includeHistory: true,
            }, exportPath);
              if (result.success) {
                // 优先显示后端返回的消息，如果没有则显示默认成功消息
                const successMessage = result.message || `数据已导出为 ${format.toUpperCase()} 格式`;
                message.success(successMessage);
            } else {
                message.error(result.message || '导出失败');
            }
        }
    } catch (error) {
        console.error("导出数据失败:", error);
        message.error("导出数据失败");
    }
    loading.export = false;
};

// 导入数据
const importData = async (format: 'json' | 'csv') => {
    loading.import = true;
    try {
        const filePath = await DataManagementAPI.selectImportFile(format);
        
        if (filePath) {
            const result = await DataManagementAPI.importData(filePath, {
                format,
                overwrite: false,
                mergeStrategy: 'merge',
            });
              if (result.success) {
                // 优先显示后端返回的消息，如果没有则显示默认成功消息
                const successMessage = result.message || `${format.toUpperCase()} 数据导入成功`;
                message.success(successMessage);
                
                if (result.errors.length > 0) {
                    console.warn("导入过程中的警告:", result.errors);
                }
            } else {
                message.error(result.message || "数据导入失败");
            }
        }
    } catch (error) {
        console.error("导入数据失败:", error);
        message.error("导入数据失败");
    }
    loading.import = false;
};

// 选择性数据导出
const exportSelectedData = async (format: 'json' | 'csv', options: any) => {
    loading.export = true;
    try {
        console.log('开始选择性数据导出:', { format, options });
        
        const result = await DataManagementAPI.exportSelectedData({
            format,
            ...options
        });
        
        if (result.success) {
            const sizeText = result.size ? ` (${(result.size / 1024).toFixed(2)} KB)` : '';
            message.success(result.message || `选择性数据导出成功${sizeText}`);
            
            // 如果包含AI配置，显示安全提醒
            if (options.includeAIConfigs) {
                message.warning('导出文件包含AI配置信息，请妥善保管避免泄露', {
                    duration: 5000
                });
            }
        } else {
            message.error(result.message || '选择性数据导出失败');
        }
    } catch (error) {
        console.error('选择性数据导出失败:', error);
        message.error('选择性数据导出失败');
    }
    loading.export = false;
};

// 完整备份导出
const exportFullBackup = async () => {
    loading.export = true;
    try {
        console.log('开始完整备份导出...');
        
        const result = await DataManagementAPI.exportFullBackup();
        
        if (result.success) {
            const sizeText = result.size ? ` (${(result.size / 1024 / 1024).toFixed(2)} MB)` : '';
            message.success(result.message || `完整备份导出成功${sizeText}`);
            
            // 提醒用户备份包含敏感信息
            message.warning('完整备份包含所有数据和配置信息，请妥善保管', {
                duration: 5000
            });
        } else {
            message.error(result.message || '完整备份导出失败');
        }
    } catch (error) {
        console.error('完整备份导出失败:', error);
        message.error('完整备份导出失败');
    }
    loading.export = false;
};

// 完整备份导入
const importFullBackup = async () => {
    loading.import = true;
    try {
        console.log('开始完整备份导入...');
        
        const result = await DataManagementAPI.importFullBackup();
        
        if (result.success) {
            message.success(result.message || '完整备份导入成功');
            // 导入成功后刷新备份列表和数据统计
            await refreshBackupList();
            await refreshDataStats();
        } else {
            message.error(result.message || '完整备份导入失败');
        }
    } catch (error) {
        console.error('完整备份导入失败:', error);
        message.error('完整备份导入失败');
    }
    loading.import = false;
};

// 刷新数据统计
const refreshDataStats = async () => {
    try {
        const stats = await DataManagementAPI.getDataStats();
        
        // 更新子组件的数据统计
        if (dataManagementRef.value) {
            dataManagementRef.value.updateDataStats(stats);
        }
    } catch (error) {
        console.error('获取数据统计失败:', error);
        // 在失败时使用默认值
        if (dataManagementRef.value) {
            dataManagementRef.value.updateDataStats({
                categories: 0,
                prompts: 0,
                history: 0,
                aiConfigs: 0,
                settings: 0,
                posts: 0,
                users: 0,
                totalRecords: 0,
            });
        }
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

// 保存 WebDAV 设置（专门处理密码加密）
const saveWebDAVSettings = async () => {
    if (saving.value) return;
    
    saving.value = true;
    try {
        console.log('保存 WebDAV 设置...');
        
        // 创建纯对象副本，避免Vue响应式对象问题
        const cleanConfig = JSON.parse(JSON.stringify({
            enabled: settings.webdav.enabled,
            serverUrl: settings.webdav.serverUrl,
            username: settings.webdav.username,
            password: settings.webdav.password,
            autoSync: settings.webdav.autoSync,
            syncInterval: settings.webdav.syncInterval,
            // 连接验证状态
            connectionTested: settings.webdav.connectionTested,
            connectionValid: settings.webdav.connectionValid,
            connectionMessage: settings.webdav.connectionMessage,
            connectionTestedAt: settings.webdav.connectionTestedAt,
            configHash: settings.webdav.configHash,
        }));
        
        // 直接保存配置
        await WebDAVAPI.setConfig(cleanConfig);
        
        console.log('WebDAV 设置保存成功');
        message.success('WebDAV 设置保存成功');
    } catch (error) {
        console.error('保存 WebDAV 设置失败:', error);
        message.error('保存 WebDAV 设置失败');
    }
    saving.value = false;
};

// 数据库修复
const repairDatabase = async () => {
    loading.repair = true;
    try {
        const { databaseServiceManager } = await import("@/lib/services");
        const result = await databaseServiceManager.checkAndRepairDatabase();
        
        if (result.healthy) {
            if (result.repaired) {
                message.success(`数据库修复成功：${result.message}`);
            } else {
                message.success("数据库状态正常，无需修复");
            }
        } else {
            message.error(`数据库修复失败：${result.message}`);
            if (result.missingStores && result.missingStores.length > 0) {
                console.error('仍缺失的对象存储:', result.missingStores);
            }
        }
    } catch (error) {
        console.error("数据库修复失败:", error);
        message.error("数据库修复失败");
    }
    loading.repair = false;
};

// 检查数据库健康状态
const checkDatabaseHealth = async () => {
    loading.healthCheck = true;
    try {
        const { databaseServiceManager } = await import("@/lib/services");
        const result = await databaseServiceManager.getHealthStatus();
        
        if (result.healthy) {
            message.success("数据库状态正常");
        } else {
            message.warning(`数据库存在异常，缺失的对象存储: ${result.missingStores.join(', ')}`);
            console.warn('数据库健康检查结果:', result);
        }
    } catch (error) {
        console.error("数据库健康检查失败:", error);
        message.error("数据库健康检查失败");
    }
    loading.healthCheck = false;
};

// 清空数据库
const clearDatabase = async () => {
    loading.clearDatabase = true;
    try {
        // 步骤1: 先创建当前数据的备份
        message.info("正在创建数据备份...");
        const timestamp = new Date().toLocaleString('zh-CN');
        const autoBackup = await DataManagementAPI.createBackup(`清空前自动备份 - ${timestamp}`);
        console.log(`自动备份创建成功: ${autoBackup.name}`);
        
        // 步骤2: 清空数据库
        message.info("正在清空数据库...");
        const { databaseServiceManager } = await import("@/lib/services");
        
        // 使用强制清空方法
        await databaseServiceManager.forceCleanAllTables();
        
        message.success(`数据库清空成功！已自动备份原数据: ${autoBackup.name}`);
        
        // 刷新备份列表
        await refreshBackupList();
        
    } catch (error) {
        console.error("清空数据库失败:", error);
        const errorMessage = error instanceof Error ? error.message : '清空数据库失败';
        message.error(`清空数据库失败: ${errorMessage}`);
    } finally {
        loading.clearDatabase = false;
    }
};

// 更新同步时间（避免触发完整设置保存）
const updateSyncTime = (timestamp: string) => {
    settings.dataSync.lastSyncTime = timestamp;
    // 只保存同步时间，不触发完整的设置保存
    window.electronAPI.preferences.set({
        dataSync: { ...settings.dataSync }
    }).then(() => {
        console.log('同步时间已更新:', timestamp);
    }).catch(error => {
        console.error('更新同步时间失败:', error);
    });
};

// 组件挂载时加载设置
onMounted(async () => {
    await loadSettings();
    // 加载备份列表和数据统计
    await refreshBackupList();
    await refreshDataStats();
});

// 监听 props 变化，自动跳转到对应设置页面
watch(() => props.targetSection, (newTargetSection) => {
    if (newTargetSection && newTargetSection !== activeSettingKey.value) {
        activeSettingKey.value = newTargetSection;
    }
}, { immediate: true });

// 监听设置页面切换，当切换到数据管理页面时刷新备份列表和数据统计
watch(activeSettingKey, async (newKey) => {
    if (newKey === 'data-management') {
        await refreshBackupList();
        await refreshDataStats();
    }
});
</script>

<style scoped>
.settings-page {
    padding: 24px;
    overflow-y: auto;
}

.n-form-item {
    margin-bottom: 0;
}
</style>