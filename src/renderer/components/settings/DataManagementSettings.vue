<template>
    <NCard size="small">
        <NTabs v-model:value="activeBackupLocation" type="line" animated>
            <NTabPane name="local" :tab="t('dataBackup.local')">
                <NFlex vertical :size="16" style="padding-top: 4px;">

            <!-- 数据备份恢复 -->
            <div>
                <NFlex vertical :size="16">
                    <NFlex vertical :size="12">
                        <NText strong>{{ t('dataManagement.backupManagement') }}</NText>
                        <NFlex :size="12" wrap>
                            <NButton type="primary" @click="handleCreateBackup" :loading="loading.backup">
                                <template #icon>
                                    <NIcon>
                                        <Upload />
                                    </NIcon>
                                </template>
                                {{ t('dataManagement.createBackup') }}
                            </NButton>
                            <NButton @click="handleRefreshBackupList" :loading="loading.refreshBackupList">
                                <template #icon>
                                    <NIcon>
                                        <Refresh />
                                    </NIcon>
                                </template>
                                {{ t('dataManagement.refreshBackupList') }}
                            </NButton>
                            <NButton v-if="capabilities.localBackupDirectory" @click="handleOpenBackupDirectory">
                                <template #icon>
                                    <NIcon>
                                        <Folder />
                                    </NIcon>
                                </template>
                                {{ t('dataManagement.openBackupDirectory') }}
                            </NButton>
                        </NFlex>
                    </NFlex>

                    <!-- 备份版本列表 -->
                    <div v-if="backupList.length > 0">
                        <NFlex vertical :size="12">
                            <NText strong>{{ t('dataManagement.backupVersionList') }}</NText>
                            <NGrid cols="6" item-responsive :x-gap="12" :y-gap="12">
                                <NGridItem v-for="backup in paginatedBackups" :key="backup.id"
                                    span="6 600:5 900:4 1200:3 1500:2 1800:1">
                                    <NCard size="small" :title="backup.version">
                                        <NFlex vertical :size="4">
                                            <NFlex align="center" :size="8">
                                                <NText strong>{{ backup.name }}</NText>
                                            </NFlex>
                                        </NFlex>
                                        <template #header-extra>
                                            <NFlex vertical :size="4">
                                                <NFlex align="center" :size="8">
                                                    <NTag type="info" size="small">{{ backup.createdAt }}</NTag>
                                                </NFlex>
                                            </NFlex>
                                        </template>

                                        <template #action>
                                            <NFlex justify="space-between" align="center" style="width: 100%;">
                                                <NPopconfirm @positive-click="handleRestoreBackup(backup.id)"
                                                    :negative-text="t('common.cancel')"
                                                    :positive-text="t('dataBackup.confirmRestore')" placement="top"
                                                    :show-icon="false">
                                                    <template #trigger>
                                                        <NButton type="primary" size="small"
                                                            :loading="loading.restore"
                                                            :disabled="loading.restore">
                                                            <template #icon>
                                                                <NIcon>
                                                                    <Recharging />
                                                                </NIcon>
                                                            </template>
                                                            {{ t('dataManagement.restore') }}
                                                        </NButton>
                                                    </template>
                                                    <div style="max-width: 300px;">
                                                        <p>{{ t('dataManagement.restoreWarning') }}</p>
                                                    </div>
                                                </NPopconfirm>
                                                <NPopconfirm @positive-click="handleDeleteBackup(backup.id)"
                                                    :negative-text="t('common.cancel')"
                                                    :positive-text="t('common.confirm')">
                                                    <template #trigger>
                                                        <NButton type="error" secondary size="small">
                                                            <template #icon>
                                                                <NIcon>
                                                                    <Trash />
                                                                </NIcon>
                                                            </template>
                                                            {{ t('dataManagement.delete') }}
                                                        </NButton>
                                                    </template>
                                                    {{ t('dataManagement.confirmDeleteBackup') }}
                                                </NPopconfirm>
                                            </NFlex>
                                        </template>
                                    </NCard>
                                </NGridItem>
                            </NGrid>

                            <!-- 分页组件 -->
                            <div v-if="totalPages > 1" class="pagination-container">
                                <NPagination v-model:page="currentPage" v-model:page-size="pageSize"
                                    :item-count="totalItems" show-size-picker show-quick-jumper
                                    :page-sizes="[6, 12, 18]" />
                            </div>
                        </NFlex>
                    </div>

                    <div v-else>
                        <NText depth="3" style="font-size: 14px;">
                            {{ t('dataManagement.noBackups') }}
                        </NText>
                    </div>
                </NFlex>
            </div>

            <NDivider />

            <!-- 完整备份导出/导入 -->
            <div>
                <NFlex vertical :size="16">
                    <NFlex vertical :size="12">
                        <NText strong>{{ t('dataManagement.fullBackupManagement') }}</NText>
                        <NText depth="3" style="font-size: 12px; ">
                            {{ t('dataManagement.fullBackupDescription') }}
                        </NText>

                        <NFlex :size="12" wrap>
                            <NButton type="primary" @click="handleExportFullBackup" :loading="loading.export">
                                <template #icon>
                                    <NIcon>
                                        <Archive />
                                    </NIcon>
                                </template>
                                {{ t('dataManagement.exportFullBackup') }}
                            </NButton>
                            <NButton @click="handleImportFullBackup" :loading="loading.import">
                                <template #icon>
                                    <NIcon>
                                        <Folder />
                                    </NIcon>
                                </template>
                                {{ t('dataManagement.importFullBackup') }}
                            </NButton>
                        </NFlex>
                    </NFlex>
                </NFlex>
            </div>

            <NDivider />

            <!-- 选择性数据导出 -->
            <div>
                <NFlex vertical :size="16">
                    <NFlex vertical :size="12">
                        <NText strong>{{ t('dataManagement.selectiveDataExport') }}</NText>
                        <NText depth="3" style="font-size: 12px; ">
                            {{ t('dataManagement.exportDescription') }}
                        </NText>

                        <!-- 数据类型选择 -->
                        <NCard size="small">
                            <NFlex vertical :size="12">
                                <NText depth="2" style="font-size: 14px;">{{ t('dataManagement.selectDataTypeToExport')
                                    }}</NText>
                                <NFlex vertical :size="8">
                                    <NRadio :checked="exportOptions.selectedType === 'prompts'" value="prompts"
                                        @update:checked="handleTypeSelection('prompts', $event)">
                                        <NFlex align="center" :size="8">
                                            <NText>{{ t('dataManagement.promptLibrary') }}</NText>
                                            <NTag size="small" type="info">{{ t('dataManagement.promptCount', { count: dataStats.prompts }) }}</NTag>
                                        </NFlex>
                                    </NRadio>
                                    <NRadio :checked="exportOptions.selectedType === 'categories'" value="categories"
                                        @update:checked="handleTypeSelection('categories', $event)">
                                        <NFlex align="center" :size="8">
                                            <NText>{{ t('dataManagement.categoryManagement') }}</NText>
                                            <NTag size="small" type="info">{{ t('dataManagement.categoryCount', { count: dataStats.categories }) }}</NTag>
                                        </NFlex>
                                    </NRadio>
                                    <NRadio :checked="exportOptions.selectedType === 'aiConfigs'" value="aiConfigs"
                                        @update:checked="handleTypeSelection('aiConfigs', $event)">
                                        <NFlex align="center" :size="8">
                                            <NText>{{ t('dataManagement.aiConfiguration') }}</NText>
                                            <NTag size="small" type="info">{{ t('dataManagement.aiConfigCount', { count: dataStats.aiConfigs }) }}</NTag>
                                            <NTag size="small" type="warning">{{
                                                t('dataManagement.containsSensitiveInfo') }}</NTag>
                                        </NFlex>
                                    </NRadio>
                                </NFlex>
                            </NFlex>
                        </NCard>

                        <NFlex :size="12" wrap>
                            <NButton v-if="exportOptions.selectedType !== 'aiConfigs'" type="primary"
                                @click="handleExportSelectedData('csv')" :disabled="!hasSelectedData || !isCSVSupported"
                                :loading="loading.export">
                                <template #icon>
                                    <NIcon>
                                        <FileExport />
                                    </NIcon>
                                </template>
                                {{ t('dataManagement.exportToCSV') }}
                            </NButton>
                            <NButton @click="handleExportSelectedData('json')" :disabled="!hasSelectedData"
                                :loading="loading.export">
                                <template #icon>
                                    <NIcon>
                                        <FileExport />
                                    </NIcon>
                                </template>
                                {{ t('dataManagement.exportToJSON') }}
                            </NButton>
                        </NFlex>

                        <NAlert v-if="exportOptions.selectedType === 'aiConfigs'" type="warning" show-icon>
                            <template #header>{{ t('dataManagement.securityWarning') }}</template>
                            {{ t('dataManagement.securityWarningText') }}
                        </NAlert>

                        <NAlert v-if="exportOptions.selectedType === 'aiConfigs'" type="info" show-icon>
                            <template #header>{{ t('dataManagement.formatNote') }}</template>
                            {{ t('dataManagement.formatNoteText') }}
                        </NAlert>
                    </NFlex>
                </NFlex>
            </div>

            <NDivider />

            <!-- 数据库维护 -->
            <div>
                <NFlex vertical :size="16">
                    <NFlex vertical :size="12">
                        <NText strong>{{ t('dataManagement.databaseMaintenance') }}</NText>
                        <NText depth="3" style="font-size: 12px">
                            {{ t('dataManagement.maintenanceDescription') }}
                        </NText>
                        <NFlex :size="12" wrap>
                            <NButton type="primary" @click="handleCheckDatabaseHealth">
                                <template #icon>
                                    <NIcon>
                                        <AlertCircle />
                                    </NIcon>
                                </template>
                                {{ t('dataManagement.checkDatabaseHealth') }}
                            </NButton>
                            <NButton type="warning" @click="handleRepairDatabase">
                                <template #icon>
                                    <NIcon>
                                        <Database />
                                    </NIcon>
                                </template>
                                {{ t('dataManagement.repairDatabase') }}
                            </NButton>
                            <NPopconfirm @positive-click="handleClearDatabase" :negative-text="t('common.cancel')"
                                :positive-text="t('dataManagement.clearDatabase')" placement="top">
                                <template #trigger>
                                    <NButton type="error" :loading="loading.clearDatabase">
                                        <template #icon>
                                            <NIcon>
                                                <DatabaseOff />
                                            </NIcon>
                                        </template>
                                        {{ t('dataManagement.clearDatabase') }}
                                    </NButton>
                                </template>
                                <div style="max-width: 350px;">
                                    <p><strong>{{ t('dataManagement.clearDatabaseWarning') }}</strong></p>
                                    <p>{{ t('dataManagement.clearDatabaseWarningText') }}</p>
                                    <ul style="margin: 8px 0; padding-left: 20px;">
                                        <li v-for="item in t('dataManagement.clearDatabaseWarningItems')" :key="item">{{
                                            item }}
                                        </li>
                                    </ul>
                                    <p><strong>{{ t('dataManagement.confirmClearDatabase') }}</strong></p>
                                </div>
                            </NPopconfirm>
                        </NFlex>
                    </NFlex>
                </NFlex>
            </div>

            <!-- 消息提示 -->
            <NAlert v-if="error" type="error" show-icon closable @close="clearMessages">
                {{ error }}
            </NAlert>
            
            <NAlert v-if="success" type="success" show-icon closable @close="clearMessages">
                {{ success }}
            </NAlert>

            <NCollapse>
                <NCollapseItem :title="t('dataBackup.automaticBackupSettings')" name="automatic-backup-settings">
                    <NFlex vertical :size="16" style="padding-top: 4px;">
                        <NText depth="3" style="font-size: 12px;">
                            {{ t('dataBackup.automaticBackupDescription') }}
                        </NText>
                        <NText depth="3" style="font-size: 12px;">
                            {{ t('dataBackup.automaticBackupLifecycleDescription') }}
                        </NText>
                        <NFlex align="center" justify="space-between" :size="12" wrap>
                            <NText>{{ t('dataBackup.enableAutomaticBackup') }}</NText>
                            <NSwitch v-model:value="autoBackupEnabled" @update:value="saveAutoBackupEnabled" />
                        </NFlex>
                        <NFlex align="end" :size="12" wrap>
                            <NFlex vertical :size="4">
                                <NText depth="3" style="font-size: 13px;">{{ t('dataBackup.automaticBackupInterval') }}</NText>
                                <NSelect v-model:value="autoBackupIntervalSelection"
                                    :options="autoBackupIntervalOptions"
                                    style="width: 220px;"
                                    @update:value="handleAutoBackupIntervalSelection" />
                            </NFlex>
                            <NFlex v-if="autoBackupIntervalSelection === CUSTOM_AUTO_BACKUP_INTERVAL" vertical :size="4">
                                <NText depth="3" style="font-size: 13px;">{{ t('dataBackup.customIntervalMinutes') }}</NText>
                                <NInputNumber v-model:value="autoBackupIntervalMinutes"
                                    :min="MIN_AUTO_BACKUP_INTERVAL_MINUTES"
                                    :max="MAX_AUTO_BACKUP_INTERVAL_MINUTES"
                                    :step="1" style="width: 180px;">
                                    <template #suffix>{{ t('dataBackup.minutes') }}</template>
                                </NInputNumber>
                            </NFlex>
                            <NFlex vertical :size="4">
                                <NText depth="3" style="font-size: 13px;">{{ t('dataBackup.automaticBackupRetention') }}</NText>
                                <NInputNumber v-model:value="autoBackupRetention" :min="1" :max="100"
                                    style="width: 160px;">
                                    <template #suffix>{{ t('dataBackup.copies') }}</template>
                                </NInputNumber>
                            </NFlex>
                            <NButton secondary @click="saveAutoBackupSettings" :loading="autoBackupLoading">
                                {{ t('dataBackup.saveAutomaticBackupSettings') }}
                            </NButton>
                            <NButton secondary @click="runAutoBackupNow"
                                :loading="autoBackupStatus.status === 'backing-up'">
                                {{ t('dataBackup.createNow') }}
                            </NButton>
                        </NFlex>
                        <NText depth="3" style="font-size: 12px;">
                            {{ t('dataBackup.lastAutomaticBackup', {
                                time: autoBackupStatus.lastBackupAt ? formatBackupDate(autoBackupStatus.lastBackupAt) : t('dataBackup.none')
                            }) }}
                            <template v-if="autoBackupStatus.nextBackupAt">
                                · {{ t('dataBackup.nextAutomaticBackup', { time: formatBackupDate(autoBackupStatus.nextBackupAt) }) }}
                            </template>
                            <template v-if="autoBackupStatus.error">
                                · {{ t('dataBackup.automaticBackupFailed', { error: autoBackupStatus.error }) }}
                            </template>
                        </NText>
                    </NFlex>
                </NCollapseItem>
            </NCollapse>
                </NFlex>
            </NTabPane>

            <NTabPane v-for="config in storageConfigs" :key="config.id" :name="config.id"
                :tab="config.name" :disabled="!config.enabled" display-directive="show:lazy">
                <CloudBackupLocationPane :config="config" />
            </NTabPane>
        </NTabs>

        <NAlert v-if="storageConfigs.length === 0" type="info" style="margin-top: var(--section-gap);">
            {{ t('dataBackup.noCloudStorageDescription') }}
            <template #action>
                <NButton size="small" secondary @click="emit('navigate-section', 'cloud-backup')">
                    {{ t('dataBackup.configureCloudStorage') }}
                </NButton>
            </template>
        </NAlert>

    </NCard>
</template>

<script setup lang="ts">
import {
    NCard,
    NFlex,
    NText,
    NButton,
    NIcon,
    NAlert,
    NDivider,
    NPopconfirm,
    NTag,
    NPagination,
    NCheckbox,
    NRadio,
    NGrid,
    NGridItem,
    NTabs,
    NTabPane,
    NCollapse,
    NCollapseItem,
    NSwitch,
    NInputNumber,
    NSelect,
    useMessage,
} from "naive-ui";
import {
    FileExport,
    FileImport,
    Upload,
    Download,
    AlertCircle,
    Database,
    Refresh,
    Trash,
    Recharging,
    DatabaseOff,
    Archive,
    Folder,
} from "@vicons/tabler";
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { useI18n } from 'vue-i18n';
import { useDataManagement } from '@renderer/composables/useDataManagement';
import { PlatformDetector } from '@shared/platform';
import { CloudBackupAPI } from '@/lib/api/cloud-backup.api';
import {
    automaticBackupService,
    AUTOMATIC_BACKUP_INTERVAL_PRESETS,
    DEFAULT_AUTO_BACKUP_INTERVAL_MINUTES,
    DEFAULT_AUTO_BACKUP_RETENTION,
    MAX_AUTO_BACKUP_INTERVAL_MINUTES,
    MIN_AUTO_BACKUP_INTERVAL_MINUTES,
} from '@/lib/services/automatic-backup.service';
import type { AutomaticBackupStatus } from '@/lib/services/automatic-backup.service';
import type { CloudStorageConfig } from '@shared/types/cloud-backup';
import { formatDateTime } from '@/lib/utils/date';
import CloudBackupLocationPane from './CloudBackupLocationPane.vue';

const { t } = useI18n();
const message = useMessage();
const capabilities = PlatformDetector.getCapabilities();
const emit = defineEmits<{ 'navigate-section': [section: string] }>();

const activeBackupLocation = ref('local');
const storageConfigs = ref<CloudStorageConfig[]>([]);
const CUSTOM_AUTO_BACKUP_INTERVAL = 'custom' as const;
type AutoBackupIntervalSelection = number | typeof CUSTOM_AUTO_BACKUP_INTERVAL;
const autoBackupEnabled = ref(true);
const autoBackupIntervalMinutes = ref(DEFAULT_AUTO_BACKUP_INTERVAL_MINUTES);
const autoBackupIntervalSelection = ref<AutoBackupIntervalSelection>(DEFAULT_AUTO_BACKUP_INTERVAL_MINUTES);
const autoBackupRetention = ref(DEFAULT_AUTO_BACKUP_RETENTION);
const autoBackupLoading = ref(false);
const autoBackupStatus = ref<AutomaticBackupStatus>(automaticBackupService.getStatus());
let unsubscribeBackupStatus: (() => void) | null = null;
const autoBackupIntervalOptions = computed(() => [
    ...AUTOMATIC_BACKUP_INTERVAL_PRESETS.map(minutes => ({
        label: formatAutomaticBackupInterval(minutes),
        value: minutes,
    })),
    { label: t('dataBackup.customInterval'), value: CUSTOM_AUTO_BACKUP_INTERVAL },
]);

const formatAutomaticBackupInterval = (minutes: number) => {
    if (minutes < 60) return t('dataBackup.backupEveryMinutes', { count: minutes });
    if (minutes < 1440) return t('dataBackup.backupEveryHours', { count: minutes / 60 });
    if (minutes === 1440) return t('dataBackup.backupEveryDay');
    return t('dataBackup.backupEveryDays', { count: minutes / 1440 });
};

const isAutomaticBackupIntervalPreset = (minutes: number) =>
    (AUTOMATIC_BACKUP_INTERVAL_PRESETS as readonly number[]).includes(minutes);

// 使用数据管理 composable
const {
    backupList,
    loading,
    error,
    success,
    getBackupList,
    createBackup,
    restoreBackup,
    deleteBackup,
    openBackupDirectory,
    exportFullBackup,
    importFullBackup,
    exportSelectedData,
    getDataStatistics,
    checkDatabaseHealth,
    repairDatabase,
    clearDatabase,
    clearMessages
} = useDataManagement();

// 数据统计
const dataStats = ref({
    categories: 0,
    prompts: 0,
    aiConfigs: 0,
    aiHistory: 0,
    settings: 0
});

// 分页
const currentPage = ref(1);
const pageSize = ref(6);
const totalItems = computed(() => backupList.value.length);
const totalPages = computed(() => Math.ceil(totalItems.value / pageSize.value));
// 备份版本标题必须跟随当前界面语言展示，不能直接使用创建时写死存进备份文件的
// description 文本（那段文本的语言取决于创建备份那一刻的界面语言，与当前语言
// 切换无关）。这里始终按 backupType 现算标题文案，日期统一复用 formatDateTime。
const formatBackupVersionLabel = (backup: { backupType?: string; createdAt: string }) => {
  const typeLabel = backup.backupType === 'automatic'
    ? t('dataManagement.backupTypeAutomatic')
    : t('dataManagement.backupTypeManual');
  return `${typeLabel} - ${formatDateTime(backup.createdAt)}`;
};

const paginatedBackups = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  const end = start + pageSize.value;
  // 转换备份数据格式以匹配组件期望的格式
  const formattedBackups = backupList.value.map((backup: any) => ({
    id: backup.id,
    name: backup.name,
    createdAt: formatDateTime(backup.createdAt),
    size: `${(backup.size / 1024).toFixed(2)} KB`,
    version: formatBackupVersionLabel(backup)
  }));
  return formattedBackups.slice(start, end);
});

// 选择性导出选项
const exportOptions = ref({
    selectedType: '' as 'prompts' | 'categories' | 'aiConfigs' | '',
});

// 计算是否选择了数据
const hasSelectedData = computed(() => {
    return exportOptions.value.selectedType !== '';
});

// 计算是否支持CSV导出（支持提示词和分类数据）
const isCSVSupported = computed(() => {
    return exportOptions.value.selectedType === 'prompts' || exportOptions.value.selectedType === 'categories';
});

// 处理类型选择
const handleTypeSelection = (type: 'prompts' | 'categories' | 'aiConfigs', checked: boolean) => {
    if (checked) {
        exportOptions.value.selectedType = type;
    } else {
        exportOptions.value.selectedType = '';
    }
};

// 事件处理函数
const handleCreateBackup = async () => {
    await createBackup();
};

const handleRefreshBackupList = async () => {
    await getBackupList();
};

const handleRestoreBackup = async (backupId: string) => {
    await restoreBackup(backupId);
};

const handleDeleteBackup = async (backupId: string) => {
    await deleteBackup(backupId);
};

const handleOpenBackupDirectory = async () => {
    await openBackupDirectory();
};

const handleExportFullBackup = async () => {
    await exportFullBackup();
};

const handleImportFullBackup = async () => {
    await importFullBackup();
};

const handleExportSelectedData = async (format: 'csv' | 'json') => {
    const options = {
        format,
        selectedType: exportOptions.value.selectedType,
        includeCategories: exportOptions.value.selectedType === 'categories',
        includePrompts: exportOptions.value.selectedType === 'prompts',
        includeAIConfigs: exportOptions.value.selectedType === 'aiConfigs',
    };
    await exportSelectedData(format, options);
};

const handleCheckDatabaseHealth = async () => {
    await checkDatabaseHealth();
};

const handleRepairDatabase = async () => {
    await repairDatabase();
};

const handleClearDatabase = async () => {
    await clearDatabase();
};

const loadStorageConfigs = async () => {
    try {
        storageConfigs.value = await CloudBackupAPI.getStorageConfigs();
        if (activeBackupLocation.value !== 'local' &&
            !storageConfigs.value.some(config => config.id === activeBackupLocation.value && config.enabled)) {
            activeBackupLocation.value = 'local';
        }
    } catch (error) {
        console.error('加载云端存储配置失败:', error);
        message.error(t('dataBackup.loadStorageConfigsFailed'));
    }
};

const loadAutomaticBackupSettings = async () => {
    [autoBackupEnabled.value, autoBackupIntervalMinutes.value, autoBackupRetention.value] = await Promise.all([
        automaticBackupService.getEnabled(),
        automaticBackupService.getIntervalMinutes(),
        automaticBackupService.getRetention(),
    ]);
    autoBackupIntervalSelection.value = isAutomaticBackupIntervalPreset(autoBackupIntervalMinutes.value)
        ? autoBackupIntervalMinutes.value
        : CUSTOM_AUTO_BACKUP_INTERVAL;
};

const handleAutoBackupIntervalSelection = (value: AutoBackupIntervalSelection) => {
    autoBackupIntervalSelection.value = value;
    if (typeof value === 'number') autoBackupIntervalMinutes.value = value;
};

const saveAutoBackupEnabled = async (enabled: boolean) => {
    autoBackupEnabled.value = await automaticBackupService.setEnabled(enabled);
    message.success(enabled ? t('dataBackup.automaticBackupEnabled') : t('dataBackup.automaticBackupDisabled'));
};

const saveAutoBackupSettings = async () => {
    autoBackupLoading.value = true;
    try {
        autoBackupIntervalMinutes.value = await automaticBackupService.setIntervalMinutes(autoBackupIntervalMinutes.value);
        autoBackupIntervalSelection.value = isAutomaticBackupIntervalPreset(autoBackupIntervalMinutes.value)
            ? autoBackupIntervalMinutes.value
            : CUSTOM_AUTO_BACKUP_INTERVAL;
        const retentionResult = await automaticBackupService.setRetention(autoBackupRetention.value);
        autoBackupRetention.value = retentionResult.retention;
        if (retentionResult.warnings.length > 0) {
            message.warning(t('dataBackup.automaticBackupRetentionWarning', {
                error: retentionResult.warnings.join('；')
            }));
        } else if (retentionResult.deferredCount > 0) {
            message.info(t('dataBackup.automaticBackupRetentionDeferred', {
                count: retentionResult.deletedCount,
                deferred: retentionResult.deferredCount
            }));
        } else {
            message.success(t('dataBackup.automaticBackupRetentionApplied', {
                count: retentionResult.deletedCount
            }));
        }
    } catch (error) {
        console.error('保存自动备份设置失败:', error);
        message.error(t('dataBackup.automaticBackupSettingsSaveFailed'));
    } finally {
        autoBackupLoading.value = false;
    }
};

const runAutoBackupNow = async () => {
    await automaticBackupService.runNow('manual');
    const status = automaticBackupService.getStatus();
    if (status.error) message.error(status.error);
    else if (status.lastRunAction === 'unchanged') message.success(t('dataBackup.automaticBackupUnchanged'));
    else message.success(t('dataBackup.automaticBackupCreatedAndRotated', { count: status.deletedCount || 0 }));
};

const formatBackupDate = (value: string) => formatDateTime(value);

// 监听备份列表变化
watch(() => backupList.value.length, (newLength, oldLength) => {
    console.log(`备份列表长度变化: ${oldLength} -> ${newLength}`);
});
watch(pageSize, () => { currentPage.value = 1; });

// 初始化
onMounted(async () => {
    unsubscribeBackupStatus = automaticBackupService.onStatusChange(status => {
        autoBackupStatus.value = status;
    });
    console.log('组件挂载，开始加载数据...');
    await Promise.all([
        getBackupList(),
        loadStorageConfigs(),
        loadAutomaticBackupSettings(),
    ]);
    console.log('备份列表加载完成，当前长度:', backupList.value.length);
    
    // 加载数据统计
    const stats = await getDataStatistics();
    if (stats) {
        dataStats.value = stats;
    }
    console.log('数据统计加载完成');
});

onUnmounted(() => {
    unsubscribeBackupStatus?.();
});
</script>

<style scoped>
.pagination-container {
    display: flex;
    justify-content: center;
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px solid var(--border-default);
}
</style>
