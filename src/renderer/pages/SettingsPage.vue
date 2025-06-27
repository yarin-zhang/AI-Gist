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
                <!-- 操作状态提示 -->
                <NFlex :size="12">
                    <NButton ghost :loading="saving" secondary>
                        <template #icon>
                            <NIcon v-if="!saving" color="#18a058">
                                <Check />
                            </NIcon>
                        </template>
                        设置会自动保存
                    </NButton>
                </NFlex>
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
                        <DataManagementSettings ref="dataManagementRef" v-show="activeSettingKey === 'data-management'"
                            :model-value="{ dataSync: { ...settings.dataSync } }"
                            @update:model-value="(val: any) => { Object.assign(settings.dataSync, val.dataSync); }"
                            @export-data="exportData" @import-data="importData" @export-selected-data="exportSelected"
                            @export-full-backup="exportFullBackup" @import-full-backup="importFullBackup" @create-backup="createBackup"
                            @restore-backup="restoreSpecificBackup" @delete-backup="deleteBackup"
                            @refresh-backup-list="refreshBackupList" @check-database-health="checkDatabaseHealth"
                            @repair-database="repairDatabase" @clear-database="clearDatabase" 
                            @open-backup-directory="openBackupDirectory" /> 
                            
                        <!-- 云端备份设置 -->
                        <CloudBackupSettings v-show="activeSettingKey === 'cloud-backup'" />
                            
                        <!-- 外观设置 -->
                        <AppearanceSettings v-show="activeSettingKey === 'appearance'"
                            :model-value="{ themeSource: settings.themeSource }"
                            @update:model-value="(val) => { settings.themeSource = val.themeSource; updateSetting(); }" />

                        <!-- 关闭行为设置 -->
                        <CloseBehaviorSettings v-show="activeSettingKey === 'close-behavior'"
                            :model-value="{ closeBehaviorMode: settings.closeBehaviorMode, closeAction: settings.closeAction }"
                            @update:model-value="(val) => { settings.closeBehaviorMode = val.closeBehaviorMode; settings.closeAction = val.closeAction; updateSetting(); }" />

                        <!-- 启动行为设置 -->
                        <StartupBehaviorSettings v-show="activeSettingKey === 'startup-behavior'"
                            :model-value="{ startMinimized: settings.startMinimized, autoLaunch: settings.autoLaunch }"
                            @update:model-value="(val) => { settings.startMinimized = val.startMinimized; settings.autoLaunch = val.autoLaunch; updateSetting(); }" />


                        <!-- 关于 -->
                        <AboutSettings v-show="activeSettingKey === 'about'" />

                        <!-- 实验室 (仅开发环境) -->
                        <NCard v-show="activeSettingKey === 'laboratory' && isDevelopment">
                            <LaboratoryPanel />
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
    Database,
    InfoCircle,
    Cloud,
} from "@vicons/tabler";
import LaboratoryPanel from "@/components/example/LaboratoryPanel.vue";
import AppearanceSettings from "@/components/settings/AppearanceSettings.vue";
import CloseBehaviorSettings from "@/components/settings/CloseBehaviorSettings.vue";
import StartupBehaviorSettings from "@/components/settings/StartupBehaviorSettings.vue";
import DataManagementSettings from "@/components/settings/DataManagementSettings.vue";
import CloudBackupSettings from "@/components/settings/CloudBackupSettings.vue";
import AboutSettings from "@/components/settings/AboutSettings.vue";
import { DataManagementAPI } from "@/lib/api";
import { databaseServiceManager } from "@/lib/services";

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
            label: "云端备份",
            key: "cloud-backup",
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

// 当前设置区域信息
const currentSectionInfo = computed(() => {
    const sections: Record<string, { title: string; icon: any; description: string }> = {
        "close-behavior": {
            title: "关闭行为设置",
            icon: Power,
            description: "配置应用关闭时的行为"
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
        "data-management": {
            title: "数据管理",
            icon: Database,
            description: "数据备份、恢复、导入导出功能"
        },
        "cloud-backup": {
            title: "云端备份",
            icon: Cloud,
            description: "配置 WebDAV 和 iCloud Drive 云端备份功能"
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
        });
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
        // 创建纯对象副本
        const settingsData = JSON.parse(
            JSON.stringify({
                closeBehaviorMode: settings.closeBehaviorMode,
                closeAction: settings.closeAction,
                startMinimized: settings.startMinimized,
                autoLaunch: settings.autoLaunch,
                themeSource: settings.themeSource,
                dataSync: settings.dataSync,
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
                message.success(`数据导出成功`);
            } else {
                message.error('数据导出失败');
            }
        }
    } catch (error) {
        console.error('数据导出失败:', error);
        message.error('数据导出失败');
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
                message.success(result.message || '数据导入成功');
            } else {
                message.error(result.message || '数据导入失败');
            }
        }
    } catch (error) {
        console.error('数据导入失败:', error);
        message.error('数据导入失败');
    }
    loading.import = false;
};

// 选择性数据导出
const exportSelected = async (format: 'json' | 'csv', options: any) => {
    loading.export = true;
    try {
        const defaultName = `ai-gist-selected-${new Date().toISOString().split('T')[0]}.${format}`;
        const exportPath = await DataManagementAPI.selectExportPath(defaultName);
        
        if (exportPath) {
            const result = await DataManagementAPI.exportSelectedData(options, exportPath);
            
            if (result.success) {
                message.success(result.message || `选择性导出成功`);
            } else {
                message.error(result.message || '选择性导出失败');
            }
        }
    } catch (error) {
        console.error('选择性导出失败:', error);
        message.error('选择性导出失败');
    }
    loading.export = false;
};

// 完整备份导入
const importFullBackup = async () => {
    loading.import = true;
    try {
        const result = await DataManagementAPI.importFullBackup();
        
        if (result.success) {
            message.success(result.message || '完整备份导入成功');
        } else {
            message.error(result.message || '完整备份导入失败');
        }
    } catch (error) {
        console.error('完整备份导入失败:', error);
        message.error('完整备份导入失败');
    }
    loading.import = false;
};

// 完整备份导出
const exportFullBackup = async () => {
    loading.export = true;
    try {
        const result = await DataManagementAPI.exportFullBackup();
        
        if (result.success) {
            message.success(result.message || '完整备份导出成功');
        } else {
            message.error(result.message || '完整备份导出失败');
        }
    } catch (error) {
        console.error('完整备份导出失败:', error);
        message.error('完整备份导出失败');
    }
    loading.export = false;
};

// 加载数据统计
const loadDataStats = async () => {
    try {
        const stats = await DataManagementAPI.getDataStats();
        
        // 更新子组件的数据统计
        if (dataManagementRef.value) {
            dataManagementRef.value.updateDataStats(stats);
        }
    } catch (error) {
        console.error("获取数据统计失败:", error);
        // 不显示错误消息，因为这不是关键功能
    }
};

// 刷新备份列表
const refreshBackupList = async () => {
    try {
        const backups = await DataManagementAPI.getBackupList();

        // 转换备份数据格式以匹配组件期望的格式
        const formattedBackups = backups.map((backup: any) => ({
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
            message.success(`备份恢复成功。已自动备份原数据: ${autoBackup.name}`);
            // 恢复成功后刷新备份列表
            await refreshBackupList();
        } else {
            message.error("备份恢复失败");
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

// 检查数据库健康状态
const checkDatabaseHealth = async () => {
    loading.healthCheck = true;
    try {
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
        await databaseServiceManager.forceCleanAllTables();
        message.success("数据库清空成功");
    } catch (error) {
        console.error("数据库清空失败:", error);
        message.error("数据库清空失败");
    }
    loading.clearDatabase = false;
};

// 数据库修复
const repairDatabase = async () => {
    loading.repair = true;
    try {
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

// 打开备份目录
const openBackupDirectory = async () => {
    try {
        const result = await DataManagementAPI.getBackupDirectory();
        
        if (result.success && result.path) {
            // 使用系统默认应用打开文件夹
            const shellResult = await window.electronAPI.shell.openPath(result.path);
            if (shellResult.success) {
                message.success("已打开备份目录");
            } else {
                message.error(shellResult.error || "打开备份目录失败");
            }
        } else {
            message.error(result.message || "获取备份目录路径失败");
        }
    } catch (error) {
        console.error("打开备份目录失败:", error);
        message.error("打开备份目录失败");
    }
};

// 组件挂载时加载设置
onMounted(async () => {
    await loadSettings();
    // 加载备份列表
    await refreshBackupList();
    await loadDataStats();
});

// 监听 props 变化，自动跳转到对应设置页面
watch(() => props.targetSection, (newTargetSection) => {
    if (newTargetSection && newTargetSection !== activeSettingKey.value) {
        activeSettingKey.value = newTargetSection;
    }
}, { immediate: true });

// 监听设置页面切换，当切换到数据管理页面时刷新备份列表
watch(activeSettingKey, async (newKey) => {
    if (newKey === 'data-management') {
        await refreshBackupList();
        await loadDataStats();
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