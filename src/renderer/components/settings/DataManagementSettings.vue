<template>
    <div class="backup-settings">
        <!-- 自动备份：开关、间隔、保留份数都是改完即保存，和数据同步页一致 (#443) -->
        <UiPanel :title="t('dataBackup.automaticBackupTitle')" body="rows">
            <template #actions>
                <span class="backup-settings__meta">
                    {{ t('dataBackup.lastAutomaticBackup', { time: autoBackupStatus.lastBackupAt ? formatBackupDate(autoBackupStatus.lastBackupAt) : t('dataBackup.none') }) }}<template
                        v-if="autoBackupStatus.nextBackupAt"> · {{ t('dataBackup.nextAutomaticBackup', { time: formatBackupDate(autoBackupStatus.nextBackupAt) }) }}</template>
                </span>
            </template>
            <UiSettingRow :title="t('dataBackup.enableAutomaticBackup')" :description="t('dataBackup.automaticBackupLifecycleDescription')">
                <NSwitch v-model:value="autoBackupEnabled" :aria-label="t('dataBackup.enableAutomaticBackup')" @update:value="saveAutoBackupEnabled" />
            </UiSettingRow>
            <UiSettingRow :title="t('dataBackup.automaticBackupInterval')">
                <span class="backup-settings__inline">
                    <NInputNumber v-if="autoBackupIntervalSelection === CUSTOM_AUTO_BACKUP_INTERVAL" v-model:value="autoBackupIntervalMinutes"
                        class="backup-settings__number" :show-button="false" :min="MIN_AUTO_BACKUP_INTERVAL_MINUTES" :max="MAX_AUTO_BACKUP_INTERVAL_MINUTES"
                        :input-props="{ 'aria-label': t('dataBackup.customIntervalMinutes') }"
                        @blur="saveAutoBackupInterval" @keydown.enter.prevent="saveAutoBackupInterval">
                        <template #suffix>{{ t('dataBackup.minutes') }}</template>
                    </NInputNumber>
                    <NSelect v-model:value="autoBackupIntervalSelection" class="backup-settings__select" :options="autoBackupIntervalOptions"
                        :aria-label="t('dataBackup.automaticBackupInterval')" @update:value="handleAutoBackupIntervalSelection" />
                </span>
            </UiSettingRow>
            <UiSettingRow :title="t('dataBackup.automaticBackupRetention')" :description="t('dataBackup.retentionDescription')">
                <NInputNumber v-model:value="autoBackupRetention" class="backup-settings__number" :show-button="false" :min="1" :max="100"
                    :input-props="{ 'aria-label': t('dataBackup.automaticBackupRetention') }"
                    @blur="saveAutoBackupRetention" @keydown.enter.prevent="saveAutoBackupRetention">
                    <template #suffix>{{ t('dataBackup.copies') }}</template>
                </NInputNumber>
            </UiSettingRow>
            <!-- 偶尔一次没做成会自动重试，不打扰；连续几次都没做成才提一句，原因只写日志 -->
            <p v-if="shouldNotifyAutomaticBackupFailure(autoBackupStatus)" class="backup-settings__notice" role="status">
                {{ t('dataBackup.automaticBackupFailed') }}
            </p>
        </UiPanel>

        <!-- 备份版本 -->
        <UiPanel :title="t('dataBackup.versionsTitle')" body="flush">
            <template #actions>
                <span class="backup-settings__actions">
                    <NButton v-if="activeBackupLocation === 'local' && capabilities.localBackupDirectory" quaternary size="tiny"
                        @click="handleOpenBackupDirectory">{{ t('dataManagement.openBackupDirectory') }}</NButton>
                    <NButton quaternary size="tiny" class="backup-settings__icon" :aria-label="t('dataManagement.refreshBackupList')"
                        :loading="activeBackupLocation === 'local' ? loading.refreshBackupList : cloudPaneRef?.loading.refresh"
                        @click="handleRefresh">
                        <template #icon><NIcon :size="14"><Refresh /></NIcon></template>
                    </NButton>
                    <NButton size="tiny" :loading="activeBackupLocation === 'local' ? loading.backup : cloudPaneRef?.loading.create"
                        @click="handleCreate">
                        <template #icon><NIcon :size="12"><Plus /></NIcon></template>{{ t('dataManagement.createBackup') }}
                    </NButton>
                </span>
            </template>

            <div class="backup-versions">
                <UiSegmented v-if="storageConfigs.length" v-model="activeBackupLocation" :label="t('dataBackup.versionsTitle')"
                    :options="locationOptions" />
                <!-- 停用的存储在分段里点不动，说明原因和去哪里启用 (#445) -->
                <p v-if="hasDisabledStorage" class="backup-location-hint">
                    <span>{{ t('dataBackup.disabledStorageHint') }}</span>
                    <NButton text type="primary" size="tiny" @click="emit('navigate-section', 'cloud-backup')">
                        {{ t('dataBackup.configureCloudStorage') }}
                    </NButton>
                </p>

                <template v-if="activeBackupLocation === 'local'">
                    <div v-if="backupList.length" class="backup-list" :class="{ 'backup-list--scrollable': showAllBackups }">
                        <div v-for="backup in visibleBackups" :key="backup.id" class="backup-row">
                            <div class="backup-row__info">
                                <NTooltip trigger="hover" placement="bottom-start">
                                    <template #trigger><span class="backup-row__title">{{ backup.createdAt }}</span></template>
                                    {{ t('dataManagement.backupFileNameTooltip', { name: backup.name }) }}
                                </NTooltip>
                                <span class="backup-row__meta">{{ backup.meta }}</span>
                            </div>
                            <span class="backup-row__actions">
                                <NPopconfirm :negative-text="t('common.cancel')" :positive-text="t('dataBackup.confirmRestore')"
                                    :show-icon="false" @positive-click="handleRestoreBackup(backup.id)">
                                    <template #trigger>
                                        <NButton :loading="loading.restore" :disabled="loading.restore">{{ t('dataManagement.restore') }}</NButton>
                                    </template>
                                    <div class="backup-confirm">{{ t('dataManagement.restoreWarning') }}</div>
                                </NPopconfirm>
                                <NPopconfirm :negative-text="t('common.cancel')" :positive-text="t('common.confirm')"
                                    @positive-click="handleDeleteBackup(backup.id)">
                                    <template #trigger>
                                        <NButton quaternary type="error" class="backup-settings__icon" :aria-label="t('dataManagement.delete')">
                                            <template #icon><NIcon :size="14"><Trash /></NIcon></template>
                                        </NButton>
                                    </template>
                                    <div class="backup-confirm">{{ t('dataBackup.confirmDeleteBackupAt', { time: backup.createdAt }) }}</div>
                                </NPopconfirm>
                            </span>
                        </div>
                    </div>
                    <p v-else class="backup-empty">{{ t('dataManagement.noBackups') }}</p>
                    <NButton v-if="backupList.length > BACKUP_PREVIEW_COUNT" quaternary size="tiny" class="backup-toggle"
                        @click="showAllBackups = !showAllBackups">
                        {{ showAllBackups ? t('dataManagement.collapseBackupList') : t('dataManagement.showMoreBackups', { count: hiddenBackupCount }) }}
                    </NButton>
                </template>
                <CloudBackupLocationPane v-else-if="activeStorage" ref="cloudPaneRef" :config="activeStorage" />

                <UiAlert tone="warning">{{ t('dataBackup.restoreOverwriteNotice') }}</UiAlert>
                <div v-if="storageConfigs.length === 0" class="ui-alert backup-cloud-hint">
                    <NIcon :size="14" class="ui-alert__icon" aria-hidden="true"><InfoCircle /></NIcon>
                    <span class="backup-cloud-hint__text">{{ t('dataBackup.noCloudStorageDescription') }}</span>
                    <NButton size="tiny" @click="emit('navigate-section', 'cloud-backup')">{{ t('dataBackup.configureCloudStorage') }}</NButton>
                </div>
            </div>
        </UiPanel>

        <!-- 完整备份 -->
        <!-- 说明在上、按钮在下：意大利语、日语的长按钮不会把说明挤成窄条，也不会伸出面板 (#449) -->
        <UiPanel :title="t('dataBackup.fullBackupTitle')" data-settings-anchor="full-backup">
            <div class="backup-full">
                <p class="backup-full__text">{{ t('dataManagement.fullBackupDescription') }}</p>
                <div class="backup-full__actions">
                    <NButton :loading="loading.import" @click="handleImportFullBackup">{{ t('dataManagement.importFullBackup') }}</NButton>
                    <NButton :loading="fullExportLoading" @click="handleExportFullBackup">{{ t('dataManagement.exportFullBackup') }}</NButton>
                </div>
            </div>
        </UiPanel>

        <!-- 选择性导出 -->
        <UiPanel :title="t('dataBackup.selectiveExportTitle')">
            <template #actions><span class="backup-settings__meta">{{ t('dataBackup.selectiveExportHint') }}</span></template>
            <div class="backup-export">
                <div class="backup-export__options" role="radiogroup" :aria-label="t('dataManagement.selectDataTypeToExport')">
                    <label v-for="option in exportTypeOptions" :key="option.value" class="backup-export__option">
                        <input type="radio" name="export-type" :value="option.value" :checked="exportOptions.selectedType === option.value"
                            @change="handleTypeSelection(option.value, true)" />
                        <span>{{ option.label }}</span>
                        <span class="backup-settings__meta">{{ option.count }}</span>
                        <span v-if="option.value === 'aiConfigs'" class="ui-tag ui-tag--warning">{{ t('dataBackup.containsApiKeys') }}</span>
                    </label>
                </div>
                <UiAlert v-if="exportOptions.selectedType === 'aiConfigs'" tone="warning">
                    <strong>{{ t('dataManagement.securityWarning') }}</strong> {{ t('dataManagement.securityWarningText') }}
                    {{ t('dataManagement.formatNoteText') }}
                </UiAlert>
                <div class="backup-export__buttons">
                    <NButton v-if="exportOptions.selectedType !== 'aiConfigs'" :disabled="!hasSelectedData || !isCSVSupported"
                        :loading="selectiveExportLoading" @click="handleExportSelectedData('csv')">{{ t('dataManagement.exportToCSV') }}</NButton>
                    <NButton :disabled="!hasSelectedData" :loading="selectiveExportLoading" @click="handleExportSelectedData('json')">
                        {{ t('dataManagement.exportToJSON') }}
                    </NButton>
                </div>
            </div>
        </UiPanel>

        <!-- 数据库维护 -->
        <UiPanel :title="t('dataManagement.databaseMaintenance')" body="rows">
            <template #actions><span class="backup-settings__meta">{{ t('dataBackup.maintenanceHint') }}</span></template>
            <UiSettingRow :title="t('dataBackup.checkAndRepair')" :description="t('dataBackup.checkAndRepairDescription')">
                <span class="backup-settings__actions">
                    <NButton :loading="loading.healthCheck" @click="handleCheckDatabaseHealth">{{ t('dataManagement.checkDatabaseHealth') }}</NButton>
                    <NButton :loading="loading.repair" @click="handleRepairDatabase">{{ t('dataManagement.repairDatabase') }}</NButton>
                </span>
            </UiSettingRow>
            <UiSettingRow :description="t('dataBackup.clearDatabaseDescription')">
                <template #title><span class="backup-danger-title">{{ t('dataManagement.clearDatabase') }}</span></template>
                <!-- 最危险的操作用正式的确认弹窗，并要求先勾选确认，不再是按钮旁边的小气泡 (#446) -->
                <NButton type="error" ghost :loading="loading.clearDatabase" @click="requestClearDatabase">{{ t('dataManagement.clearDatabase') }}</NButton>
            </UiSettingRow>
        </UiPanel>
    </div>
</template>

<script setup lang="ts">
import { NButton, NCheckbox, NIcon, NInputNumber, NPopconfirm, NSelect, NSwitch, NTooltip, useDialog, useMessage } from "naive-ui";
import { InfoCircle, Plus, Refresh, Trash } from "@vicons/tabler";
import UiAlert from '@/components/ui/UiAlert.vue';
import UiPanel from '@/components/ui/UiPanel.vue';
import UiSegmented from '@/components/ui/UiSegmented.vue';
import UiSettingRow from '@/components/ui/UiSettingRow.vue';
import { ref, computed, h, onMounted, onUnmounted } from "vue";
import { useI18n } from 'vue-i18n';
import { useDataManagement } from '@renderer/composables/useDataManagement';
import { PlatformDetector } from '@shared/platform';
import { CloudBackupAPI } from '@/lib/api/cloud-backup.api';
import type { FullBackupImportSummary } from '@/lib/api/data-management.api';
import {
    automaticBackupService,
    AUTOMATIC_BACKUP_INTERVAL_PRESETS,
    DEFAULT_AUTO_BACKUP_INTERVAL_MINUTES,
    DEFAULT_AUTO_BACKUP_RETENTION,
    MAX_AUTO_BACKUP_INTERVAL_MINUTES,
    MIN_AUTO_BACKUP_INTERVAL_MINUTES,
    shouldNotifyAutomaticBackupFailure,
} from '@/lib/services/automatic-backup.service';
import type { AutomaticBackupStatus } from '@/lib/services/automatic-backup.service';
import { LOCAL_SAFETY_BACKUP_TRIGGERS } from '@/lib/services/local-backup.service';
import { onDataChange } from '@/lib/services/data-change-events';
import type { CloudStorageConfig } from '@shared/types/cloud-backup';
import { formatFriendlyDate } from '@/lib/utils/date';
import CloudBackupLocationPane from './CloudBackupLocationPane.vue';

const { t, locale } = useI18n();
const message = useMessage();
const dialog = useDialog();
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
// 最近一次保存成功的值：失焦和回车都会触发保存，值没变就不重复保存；取消时也靠它还原
let savedAutoBackupInterval = DEFAULT_AUTO_BACKUP_INTERVAL_MINUTES;
let savedAutoBackupRetention = DEFAULT_AUTO_BACKUP_RETENTION;
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

// 备份版本标题必须跟随当前界面语言展示，不能直接使用创建时写死存进备份文件的
// description 文本（那段文本的语言取决于创建备份那一刻的界面语言，与当前语言
// 切换无关）。这里始终按 backupType 现算标题文案；日期只在副标题行展示一次
// （通过 formatDateTime），避免标题和副标题重复显示同一个日期。
const formatBackupTypeLabel = (backup: { backupType?: string; trigger?: string }) => {
  if (backup.trigger === LOCAL_SAFETY_BACKUP_TRIGGERS.restore) return t('dataBackup.safetyBackupRestore');
  if (backup.trigger === LOCAL_SAFETY_BACKUP_TRIGGERS.clear) return t('dataBackup.safetyBackupClear');
  if (backup.trigger === LOCAL_SAFETY_BACKUP_TRIGGERS.import) return t('dataBackup.safetyBackupImport');
  if (backup.trigger === LOCAL_SAFETY_BACKUP_TRIGGERS.cloudOverwrite) return t('dataBackup.safetyBackupCloudOverwrite');
  return backup.backupType === 'automatic'
    ? t('dataManagement.backupTypeAutomatic')
    : t('dataManagement.backupTypeManual');
};

// 备份版本列表：默认只展示最近的几条，其余收进「查看更多」
const BACKUP_PREVIEW_COUNT = 3;
const showAllBackups = ref(false);
// 副标题：类型 · 提示词数量（备份内容可读时）· 大小。同一分钟里的两份备份靠提示词数量也能分开
const formatBackupMeta = (backup: any) => {
    const prompts = backup.payload?.data?.prompts;
    return [
        formatBackupTypeLabel(backup),
        ...(Array.isArray(prompts) ? [t('promptBrowse.itemCount', { count: prompts.length }, prompts.length)] : []),
        `${(backup.size / 1024).toFixed(2)} KB`,
    ].join(' · ');
};
const formattedBackups = computed(() => backupList.value.map((backup: any) => ({
    id: backup.id,
    name: backup.name,
    createdAt: formatFriendlyDate(backup.createdAt, locale.value, { withTime: true }),
    meta: formatBackupMeta(backup),
})));
const visibleBackups = computed(() => showAllBackups.value
    ? formattedBackups.value
    : formattedBackups.value.slice(0, BACKUP_PREVIEW_COUNT));
const hiddenBackupCount = computed(() => Math.max(backupList.value.length - BACKUP_PREVIEW_COUNT, 0));

const cloudPaneRef = ref<InstanceType<typeof CloudBackupLocationPane>>();
const activeStorage = computed(() => storageConfigs.value.find(config => config.id === activeBackupLocation.value) || null);
const locationOptions = computed(() => [
    { value: 'local', label: t('dataBackup.localLocation') },
    ...storageConfigs.value.map(config => ({
        value: config.id,
        label: config.enabled
            ? t('dataBackup.cloudLocation', { name: config.name })
            : t('dataBackup.cloudLocationDisabled', { name: config.name }),
        disabled: !config.enabled,
    })),
]);
const hasDisabledStorage = computed(() => storageConfigs.value.some(config => !config.enabled));
const hasEnabledStorage = computed(() => storageConfigs.value.some(config => config.enabled));
const exportTypeOptions = computed(() => [
    { value: 'prompts' as const, label: t('dataManagement.promptLibrary'), count: t('dataManagement.promptCount', { count: dataStats.value.prompts }) },
    { value: 'categories' as const, label: t('dataManagement.categoryManagement'), count: t('dataManagement.categoryCount', { count: dataStats.value.categories }) },
    { value: 'aiConfigs' as const, label: t('dataManagement.aiConfiguration'), count: t('dataManagement.aiConfigCount', { count: dataStats.value.aiConfigs }) },
]);

const handleRefresh = async () => {
    if (activeBackupLocation.value === 'local') await handleRefreshBackupList();
    else await cloudPaneRef.value?.refreshCloudBackupList();
};
const handleCreate = async () => {
    if (activeBackupLocation.value === 'local') await handleCreateBackup();
    else await cloudPaneRef.value?.createCloudBackup();
};

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

// 操作结果统一用顶部居中的 toast：用户多半停在页面下方操作，原来页顶的横幅根本看不到 (#441)。
// 失败提示多留一会儿并可手动关闭，保证用户读得完原因。
const notifyResult = () => {
    if (error.value) message.error(error.value, { duration: 6000, closable: true });
    else if (success.value) message.success(success.value);
    clearMessages();
};

// 导入、恢复、清空之后「选择性导出」里的条数要跟着变 (#441)
const refreshDataStats = async () => {
    const stats = await getDataStatistics();
    if (stats) dataStats.value = stats;
};

// 「导出完整备份」和「选择性导出」共用 loading.export，用 activeExport 区分是哪个按钮在转
const activeExport = ref<'full' | 'selective' | null>(null);
const fullExportLoading = computed(() => !!loading.value.export && activeExport.value === 'full');
const selectiveExportLoading = computed(() => !!loading.value.export && activeExport.value === 'selective');

// 事件处理函数
const handleCreateBackup = async () => {
    await createBackup();
    notifyResult();
};

const handleRefreshBackupList = async () => {
    await getBackupList({ showLoading: true });
    notifyResult();
};

const handleRestoreBackup = async (backupId: string) => {
    const restored = await restoreBackup(backupId);
    notifyResult();
    if (restored) await Promise.all([getBackupList(), refreshDataStats()]);
};

const handleDeleteBackup = async (backupId: string) => {
    await deleteBackup(backupId);
    notifyResult();
};

const handleOpenBackupDirectory = async () => {
    await openBackupDirectory();
    notifyResult();
};

const handleExportFullBackup = async () => {
    activeExport.value = 'full';
    try {
        await exportFullBackup();
    } finally { activeExport.value = null; }
    notifyResult();
};

// 导入会替换本机全部数据：选好文件后先说清楚文件里有什么、会发生什么，再动手
const approveImport = (summary: FullBackupImportSummary) => new Promise<boolean>(resolve => {
    let settled = false;
    const finish = (value: boolean) => {
        if (settled) return;
        settled = true;
        resolve(value);
    };
    dialog.warning({
        title: t('dataBackup.importConfirmTitle'),
        content: t('dataBackup.importConfirmContent', { ...summary }),
        positiveText: t('dataBackup.importConfirmPositive'),
        negativeText: t('common.cancel'),
        maskClosable: false,
        onPositiveClick: () => finish(true),
        onNegativeClick: () => finish(false),
        onClose: () => finish(false),
        onAfterLeave: () => finish(false),
    });
});

const handleImportFullBackup = async () => {
    if (await importFullBackup(approveImport)) {
        message.success(t('dataBackup.importDoneWithBackup'));
        clearMessages();
        await refreshDataStats();
        return;
    }
    notifyResult();
};

const handleExportSelectedData = async (format: 'csv' | 'json') => {
    const options = {
        format,
        selectedType: exportOptions.value.selectedType,
        includeCategories: exportOptions.value.selectedType === 'categories',
        includePrompts: exportOptions.value.selectedType === 'prompts',
        includeAIConfigs: exportOptions.value.selectedType === 'aiConfigs',
    };
    activeExport.value = 'selective';
    try {
        await exportSelectedData(format, options);
    } finally { activeExport.value = null; }
    notifyResult();
};

const handleCheckDatabaseHealth = async () => {
    await checkDatabaseHealth();
    notifyResult();
};

const handleRepairDatabase = async () => {
    await repairDatabase();
    notifyResult();
};

const handleClearDatabase = async () => {
    const cleared = await clearDatabase();
    notifyResult();
    if (cleared) await refreshDataStats();
};

// 清空前说清楚：会先自动备份、去哪里找回、开着同步时会影响其他设备；勾选确认后才能点「清空」(#446)
const requestClearDatabase = () => {
    const acknowledged = ref(false);
    const confirmDialog = dialog.error({
        title: t('dataBackup.clearConfirmTitle'),
        content: () => h('div', { class: 'backup-clear-confirm' }, [
            h('p', { style: 'margin: 0 0 8px' }, t('dataBackup.clearConfirmContent')),
            h('p', { style: 'margin: 0 0 8px' }, t('dataBackup.clearConfirmBackup')),
            hasEnabledStorage.value ? h('p', { style: 'margin: 0 0 8px' }, t('dataBackup.clearConfirmSync')) : null,
            h(NCheckbox, {
                checked: acknowledged.value,
                'onUpdate:checked': (value: boolean) => {
                    acknowledged.value = value;
                    confirmDialog.positiveButtonProps = { type: 'error', disabled: !value };
                },
            }, { default: () => t('dataBackup.clearConfirmAcknowledge') }),
        ]),
        positiveText: t('dataBackup.clearConfirmPositive'),
        negativeText: t('common.cancel'),
        positiveButtonProps: { type: 'error', disabled: true },
        onPositiveClick: () => {
            if (!acknowledged.value) return false;
            void handleClearDatabase();
        },
    });
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
    savedAutoBackupInterval = autoBackupIntervalMinutes.value;
    savedAutoBackupRetention = autoBackupRetention.value;
    autoBackupIntervalSelection.value = isAutomaticBackupIntervalPreset(autoBackupIntervalMinutes.value)
        ? autoBackupIntervalMinutes.value
        : CUSTOM_AUTO_BACKUP_INTERVAL;
};

const handleAutoBackupIntervalSelection = (value: AutoBackupIntervalSelection) => {
    autoBackupIntervalSelection.value = value;
    // 选「自定义」时先让用户填分钟数，填完（失焦或回车）再保存
    if (typeof value === 'number') {
        autoBackupIntervalMinutes.value = value;
        void saveAutoBackupInterval();
    }
};

const saveAutoBackupEnabled = async (enabled: boolean) => {
    autoBackupEnabled.value = await automaticBackupService.setEnabled(enabled);
    message.success(enabled ? t('dataBackup.automaticBackupEnabled') : t('dataBackup.automaticBackupDisabled'));
};

// 间隔和保留份数改完即保存（和同页的开关、数据同步页的检查间隔一致），
// 不再需要额外点「保存备份策略」，也就不会改完忘了保存、离开后悄悄丢失 (#443)
const saveAutoBackupInterval = async () => {
    const minutes = autoBackupIntervalMinutes.value;
    if (typeof minutes !== 'number' || minutes === savedAutoBackupInterval) return;
    try {
        const saved = await automaticBackupService.setIntervalMinutes(minutes);
        savedAutoBackupInterval = saved;
        autoBackupIntervalMinutes.value = saved;
        autoBackupIntervalSelection.value = isAutomaticBackupIntervalPreset(saved) ? saved : CUSTOM_AUTO_BACKUP_INTERVAL;
        message.success(t('dataBackup.automaticBackupIntervalSaved', { interval: formatAutomaticBackupInterval(saved) }));
    } catch (error) {
        console.error('保存自动备份间隔失败:', error);
        message.error(t('dataBackup.automaticBackupSettingsSaveFailed'));
    }
};

const automaticBackupCount = computed(() => backupList.value.filter(backup => backup.backupType === 'automatic').length);

// 调低保留份数会立刻删除多出来的旧自动备份：会删的时候先确认，取消就恢复原来的份数
const confirmRetentionPrune = (retention: number) => new Promise<boolean>(resolve => {
    const pruneCount = automaticBackupCount.value - retention;
    if (pruneCount <= 0) return resolve(true);
    let settled = false;
    const finish = (value: boolean) => {
        if (settled) return;
        settled = true;
        resolve(value);
    };
    dialog.warning({
        title: t('dataBackup.retentionPruneTitle'),
        content: t('dataBackup.retentionPruneContent', { retention, count: pruneCount }),
        positiveText: t('dataBackup.retentionPrunePositive'),
        negativeText: t('common.cancel'),
        onPositiveClick: () => finish(true),
        onNegativeClick: () => finish(false),
        onClose: () => finish(false),
        onAfterLeave: () => finish(false),
    });
});

// 回车保存时要拦掉回车的默认行为（模板里的 .prevent）：否则确认框一弹出，
// 同一次回车会落到确认框的按钮上，把它直接关掉
let savingRetention = false;
const saveAutoBackupRetention = async () => {
    const retention = autoBackupRetention.value;
    if (typeof retention !== 'number' || retention === savedAutoBackupRetention || savingRetention) return;
    savingRetention = true;
    try {
        if (!(await confirmRetentionPrune(retention))) {
            autoBackupRetention.value = savedAutoBackupRetention;
            return;
        }
        // 份数保存了就算成功；旧备份这次没删掉的，下次自动备份时会再清理，不用告诉用户
        const retentionResult = await automaticBackupService.setRetention(retention);
        savedAutoBackupRetention = retentionResult.retention;
        autoBackupRetention.value = retentionResult.retention;
        if (retentionResult.deletedCount > 0) {
            message.success(t('dataBackup.automaticBackupRetentionApplied', {
                count: retentionResult.deletedCount
            }));
        } else {
            message.success(t('dataBackup.automaticBackupRetentionSaved', { count: retentionResult.retention }));
        }
        if (retentionResult.deletedCount > 0) await getBackupList();
    } catch (error) {
        console.error('保存自动备份保留份数失败:', error);
        message.error(t('dataBackup.automaticBackupSettingsSaveFailed'));
    } finally {
        savingRetention = false;
    }
};

const formatBackupDate = (value: string) => formatFriendlyDate(value, locale.value, { withTime: true });

// 同步、其他窗口改了数据时统计也要跟上；连续写入只刷新一次
let unsubscribeDataChanges: (() => void) | null = null;
let statsRefreshTimer: ReturnType<typeof setTimeout> | null = null;
const scheduleStatsRefresh = () => {
    if (statsRefreshTimer) clearTimeout(statsRefreshTimer);
    statsRefreshTimer = setTimeout(() => {
        statsRefreshTimer = null;
        void refreshDataStats();
    }, 300);
};

// 自动备份在后台新建版本后，版本列表也跟着刷新
let lastAutoBackupAt: string | undefined;

// 初始化
onMounted(async () => {
    unsubscribeBackupStatus = automaticBackupService.onStatusChange(status => {
        autoBackupStatus.value = status;
        if (status.lastBackupAt && lastAutoBackupAt && status.lastBackupAt !== lastAutoBackupAt) void getBackupList();
        lastAutoBackupAt = status.lastBackupAt;
    });
    unsubscribeDataChanges = onDataChange(['prompts', 'categories', 'ai_configs'], scheduleStatsRefresh);
    await Promise.all([
        getBackupList(),
        loadStorageConfigs(),
        loadAutomaticBackupSettings(),
        refreshDataStats(),
    ]);
    notifyResult();
});

onUnmounted(() => {
    unsubscribeBackupStatus?.();
    unsubscribeDataChanges?.();
    if (statsRefreshTimer) clearTimeout(statsRefreshTimer);
});
</script>

<style scoped>
.backup-settings {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.backup-settings__meta {
    color: var(--content-tertiary);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-normal);
}

.backup-settings__inline,
.backup-settings__actions {
    display: inline-flex;
    align-items: center;
    gap: 8px;
}

.backup-settings__actions {
    gap: 4px;
}

.backup-settings__select {
    width: 160px;
}

.backup-settings__number {
    width: 120px;
}

.backup-settings__icon {
    width: 28px;
    padding: 0;
}

.backup-settings__notice {
    margin: 0;
    padding: 8px 0 12px;
    color: var(--accent-warning);
    font-size: var(--font-size-sm);
}

.backup-versions {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 16px 16px;
}

.backup-versions > .ui-seg {
    align-self: flex-start;
}

.backup-list {
    display: flex;
    flex-direction: column;
}

.backup-list--scrollable {
    max-height: 360px;
    overflow-y: auto;
}

.backup-row {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 56px;
    border-bottom: 1px solid var(--border-subtle);
}

.backup-row__info {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
}

.backup-row__title {
    width: fit-content;
    font-size: var(--font-size-base);
    cursor: default;
}

.backup-row__meta {
    color: var(--content-tertiary);
    font-size: var(--font-size-xs);
}

.backup-row__actions {
    display: flex;
    flex: none;
    gap: 4px;
}

.backup-empty {
    margin: 0;
    padding: 16px 0;
    color: var(--content-tertiary);
    font-size: var(--font-size-sm);
}

.backup-toggle {
    align-self: flex-start;
    margin: 4px 0;
}

.backup-cloud-hint {
    flex-wrap: wrap;
    align-items: center;
}

/* 长文案（意大利语等）时按钮换到下一行，说明不被挤成窄条 */
.backup-cloud-hint__text {
    flex: 1 1 260px;
    min-width: 0;
}

.backup-confirm {
    max-width: 320px;
}

.backup-confirm p {
    margin: 0 0 6px;
}

.backup-full {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.backup-full__text {
    margin: 0;
    color: var(--content-secondary);
    font-size: var(--font-size-sm);
}

.backup-full__actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
}

.backup-location-hint {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 8px;
    margin: 0;
    color: var(--content-tertiary);
    font-size: var(--font-size-xs);
}

.backup-export {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.backup-export__options {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.backup-export__option {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--font-size-base);
    cursor: pointer;
}

.backup-export__option input {
    margin: 0;
    accent-color: var(--accent-primary);
}

.backup-export__buttons {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
}

.backup-danger-title {
    color: var(--accent-error);
}
</style>
