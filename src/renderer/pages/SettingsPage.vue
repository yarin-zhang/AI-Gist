<template>
    <div class="settings-page">
        <NFlex vertical size="large">
            <!-- 页面标题 -->
            <NFlex justify="space-between" align="center">
                <div>
                    <NText strong style="font-size: 28px">{{ t('settings.title') }}</NText>
                    <NText depth="3" style="display: block; margin-top: 4px">
                        {{ t('settings.subtitle') }}
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
                        {{ t('settings.autoSave') }}
                    </NButton>
                </NFlex>
                    <NButton type="error" @click="resetSettings" :loading="loading.reset" secondary>
                        <template #icon>
                            <NIcon>
                                <Refresh />
                            </NIcon>
                        </template>
                        {{ t('settings.resetToDefault') }}
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
                                <span>{{ t('settings.settingsMenu') }}</span>
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

                        <!-- 语言设置 -->
                        <NCard v-show="activeSettingKey === 'language'">
                            <NFlex vertical :size="16">
                                <NFlex vertical :size="12">
                                    <NText depth="2">{{ t('language.title') }}</NText>
                                    <NText depth="3" style="font-size: 12px;">
                                        {{ t('language.description') }}
                                    </NText>
                                </NFlex>
                                
                                <NFlex vertical :size="12">
                                    <NText depth="2" style="font-size: 14px;">{{ t('language.selectLanguage') }}：</NText>
                                    <NSelect
                                        v-model:value="currentLocale"
                                        :options="supportedLocales.map(locale => ({
                                            label: locale.name,
                                            value: locale.code
                                        }))"
                                        :placeholder="t('language.selectLanguage')"
                                        style="max-width: 200px;"
                                        @update:value="switchLocale"
                                    />
                                </NFlex>
                            </NFlex>
                        </NCard>

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
import { useI18n } from '~/composables/useI18n'
import {
    NCard,
    NAlert,
    NFlex,
    NIcon,
    NButton,
    NText,
    NMenu,
    NSelect,
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
    Globe,
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
const { t, currentLocale, supportedLocales, switchLocale, initLocale } = useI18n()

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
            label: t('settings.sections.dataManagement'),
            key: "data-management",
            icon: () => h(NIcon, { size: 16 }, { default: () => h(Database) }),
        },
        {
            label: t('settings.sections.cloudBackup'),
            key: "cloud-backup",
            icon: () => h(NIcon, { size: 16 }, { default: () => h(Cloud) }),
        },
        {
            label: t('settings.sections.appearance'),
            key: "appearance",
            icon: () => h(NIcon, { size: 16 }, { default: () => h(Sun) }),
        },
        {
            label: t('language.title'),
            key: "language",
            icon: () => h(NIcon, { size: 16 }, { default: () => h(Globe) }),
        },
        {
            label: t('settings.sections.startup'),
            key: "startup-behavior",
            icon: () => h(NIcon, { size: 16 }, { default: () => h(Rocket) }),
        },
        {
            label: t('settings.sections.close'),
            key: "close-behavior",
            icon: () => h(NIcon, { size: 16 }, { default: () => h(Power) }),
        },
        {
            label: t('settings.sections.about'),
            key: "about",
            icon: () => h(NIcon, { size: 16 }, { default: () => h(InfoCircle) }),
        },
    ];

    // 仅在开发环境中添加实验室菜单
    if (isDevelopment) {
        baseOptions.push({
            label: t('settings.sections.laboratory'),
            key: "laboratory",
            icon: () => h(NIcon, { size: 16 }, { default: () => h(Flask) }),
        });
    }

    return baseOptions;
});

// 当前设置区域信息
const currentSectionInfo = computed(() => {
    const key = activeSettingKey.value;
    const section = {
        "close-behavior": Power,
        "startup-behavior": Rocket,
        appearance: Sun,
        language: Globe,
        "data-management": Database,
        "cloud-backup": Cloud,
        about: InfoCircle,
        laboratory: Flask
    };
    return {
        title: t(`settings.sectionDescriptions.${key}.title`),
        icon: section[key as keyof typeof section] || Database,
        description: t(`settings.sectionDescriptions.${key}.description`)
    };
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
        console.log(t('settingsMessages.loadSettings'));
        const prefs = await window.electronAPI.preferences.get();
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
            })
        );

        const updatedPrefs = await window.electronAPI.preferences.set(settingsData);
        console.log(t('settingsMessages.settingsUpdated'), updatedPrefs);

        // 如果更改了主题设置，也要更新主题管理器
        if (settings.themeSource) {
            await window.electronAPI.theme.setSource(settings.themeSource);
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
                })
            );
        }

        // 如果没有要更新的数据，直接返回
        if (!settingsData || Object.keys(settingsData).length === 0) {
            console.log(t('settingsMessages.noSettingsToUpdate'));
            saving.value = false;
            return;
        }

        const updatedPrefs = await window.electronAPI.preferences.set(settingsData);
        console.log(t('settingsMessages.settingsUpdated'), updatedPrefs);

        // 如果更改了主题设置，也要更新主题管理器
        if (settingsData.themeSource) {
            await window.electronAPI.theme.setSource(settingsData.themeSource);
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

// 重置设置
const resetSettings = async () => {
    loading.reset = true;
    try {
        const defaultPrefs = await window.electronAPI.preferences.reset();
        Object.assign(settings, defaultPrefs);

        // 重置主题
        await window.electronAPI.theme.setSource(settings.themeSource);

        message.success(t('settingsMessages.settingsReset'));
        console.log(t('settingsMessages.settingsResetLog'), defaultPrefs);
    } catch (error) {
        console.error(t('settingsMessages.resetSettingsFailed'), error);
        message.error(t('settingsMessages.resetSettingsFailed'));
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
                message.success(t('settingsMessages.dataExportSuccess'));
            } else {
                message.error(t('settingsMessages.dataExportFailed'));
            }
        }
    } catch (error) {
        console.error(t('settingsMessages.dataExportFailed'), error);
        message.error(t('settingsMessages.dataExportFailed'));
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
                message.success(result.message || t('settingsMessages.dataImportSuccess'));
            } else {
                message.error(result.message || t('settingsMessages.dataImportFailed'));
            }
        }
    } catch (error) {
        console.error(t('settingsMessages.dataImportFailed'), error);
        message.error(t('settingsMessages.dataImportFailed'));
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
                message.success(result.message || t('settingsMessages.selectiveExportSuccess'));
            } else {
                message.error(result.message || t('settingsMessages.selectiveExportFailed'));
            }
        }
    } catch (error) {
        console.error(t('settingsMessages.selectiveExportFailed'), error);
        message.error(t('settingsMessages.selectiveExportFailed'));
    }
    loading.export = false;
};

// 完整备份导入
const importFullBackup = async () => {
    loading.import = true;
    try {
        const result = await DataManagementAPI.importFullBackup();
        
        if (result.success) {
            message.success(result.message || t('settingsMessages.fullBackupImportSuccess'));
        } else {
            message.error(result.message || t('settingsMessages.fullBackupImportFailed'));
        }
    } catch (error) {
        console.error(t('settingsMessages.fullBackupImportFailed'), error);
        message.error(t('settingsMessages.fullBackupImportFailed'));
    }
    loading.import = false;
};

// 完整备份导出
const exportFullBackup = async () => {
    loading.export = true;
    try {
        const result = await DataManagementAPI.exportFullBackup();
        
        if (result.success) {
            message.success(result.message || t('settingsMessages.fullBackupExportSuccess'));
        } else {
            message.error(result.message || t('settingsMessages.fullBackupExportFailed'));
        }
    } catch (error) {
        console.error(t('settingsMessages.fullBackupExportFailed'), error);
        message.error(t('settingsMessages.fullBackupExportFailed'));
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
        console.error(t('settingsMessages.getDataStatsFailed'), error);
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
        console.error(t('settingsMessages.getBackupListFailed'), error);
        message.error(t('settingsMessages.getBackupListFailed'));
    }
};

// 创建备份
const createBackup = async () => {
    loading.backup = true;
    try {
        const timestamp = new Date().toLocaleString('zh-CN');
        const backup = await DataManagementAPI.createBackup(t('settingsMessages.manualBackup', { timestamp }));
        message.success(t('settingsMessages.backupCreatedSuccess', { 
            name: backup.name, 
            size: (backup.size / 1024).toFixed(2) 
        }));

        // 创建成功后立即刷新备份列表
        await refreshBackupList();
    } catch (error) {
        console.error(t('settingsMessages.backupCreatedFailed'), error);
        message.error(t('settingsMessages.backupCreatedFailed'));
    } finally {
        loading.backup = false;
    }
};

// 恢复指定备份
const restoreSpecificBackup = async (backupId: string) => {
    loading.backup = true;
    try {
        // 步骤1: 先创建当前数据的自动备份
        message.info(t('settingsMessages.creatingAutoBackup'));
        const timestamp = new Date().toLocaleString('zh-CN');
        const autoBackup = await DataManagementAPI.createBackup(t('settingsMessages.autoBackupBeforeRestore', { timestamp }));
        console.log(t('settingsMessages.autoBackupCreated', { name: autoBackup.name }));

        // 步骤2: 执行恢复操作
        message.info(t('settingsMessages.restoringBackup'));
        const result = await DataManagementAPI.restoreBackupWithReplace(backupId);

        if (result.success) {
            message.success(t('settingsMessages.backupRestoreSuccess', { name: autoBackup.name }));
            // 恢复成功后刷新备份列表
            await refreshBackupList();
        } else {
            message.error(t('settingsMessages.backupRestoreFailed'));
        }
    } catch (error) {
        console.error(t('settingsMessages.backupRestoreFailed'), error);
        const errorMessage = error instanceof Error ? error.message : t('settingsMessages.backupRestoreFailed');
        message.error(`${t('settingsMessages.backupRestoreFailed')}: ${errorMessage}`);
    } finally {
        loading.backup = false;
    }
};

// 删除备份
const deleteBackup = async (backupId: string) => {
    try {
        console.log(t('settingsMessages.startDeleteBackup', { backupId }));
        await DataManagementAPI.deleteBackup(backupId);
        message.success(t('settingsMessages.backupDeleteSuccess'));
        // 删除成功后刷新备份列表
        await refreshBackupList();
    } catch (error) {
        console.error(t('settingsMessages.backupDeleteFailed'), error);
        const errorMessage = error instanceof Error ? error.message : t('settingsMessages.backupDeleteFailed');
        message.error(`${t('settingsMessages.backupDeleteFailed')}: ${errorMessage}`);

        // 删除失败后也刷新备份列表，以确保UI状态正确
        try {
            await refreshBackupList();
        } catch (refreshError) {
            console.error(t('settingsMessages.getBackupListFailed'), refreshError);
        }
    }
};

// 检查数据库健康状态
const checkDatabaseHealth = async () => {
    loading.healthCheck = true;
    try {
        const result = await databaseServiceManager.getHealthStatus();
        
        if (result.healthy) {
            message.success(t('settingsMessages.databaseHealthy'));
        } else {
            message.warning(t('settingsMessages.databaseUnhealthy', { stores: result.missingStores.join(', ') }));
            console.warn(t('settingsMessages.databaseHealthCheckResult'), result);
        }
    } catch (error) {
        console.error(t('settingsMessages.databaseHealthCheckFailed'), error);
        message.error(t('settingsMessages.databaseHealthCheckFailed'));
    }
    loading.healthCheck = false;
};

// 清空数据库
const clearDatabase = async () => {
    loading.clearDatabase = true;
    try {
        await databaseServiceManager.forceCleanAllTables();
        message.success(t('settingsMessages.databaseCleared'));
    } catch (error) {
        console.error(t('settingsMessages.databaseClearFailed'), error);
        message.error(t('settingsMessages.databaseClearFailed'));
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
                message.success(t('settingsMessages.databaseRepairSuccess', { message: result.message }));
            } else {
                message.success(t('settingsMessages.databaseNoRepairNeeded'));
            }
        } else {
            message.error(t('settingsMessages.databaseRepairFailed', { message: result.message }));
            if (result.missingStores && result.missingStores.length > 0) {
                console.error(t('settingsMessages.stillMissingStores'), result.missingStores);
            }
        }
    } catch (error) {
        console.error(t('settingsMessages.databaseRepairFailed', { message: '' }), error);
        message.error(t('settingsMessages.databaseRepairFailed', { message: '' }));
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
                message.success(t('settingsMessages.backupDirectoryOpened'));
            } else {
                message.error(shellResult.error || t('settingsMessages.openBackupDirectoryFailed'));
            }
        } else {
            message.error(result.message || t('settingsMessages.getBackupDirectoryFailed'));
        }
    } catch (error) {
        console.error(t('settingsMessages.openBackupDirectoryFailed'), error);
        message.error(t('settingsMessages.openBackupDirectoryFailed'));
    }
};

// 组件挂载时加载设置
onMounted(async () => {
    initLocale(); // 初始化语言设置
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