<template>
    <NCard>
        <NFlex vertical :size="20">

            <!-- 数据备份恢复 -->
            <div>
                <NFlex vertical :size="16">
                    <NFlex vertical :size="12">
                        <NText depth="2">{{ t('dataManagement.backupManagement') }}</NText>
                        <NFlex :size="12">
                            <NButton type="primary" @click="$emit('create-backup')" :loading="loading.backup">
                                <template #icon>
                                    <NIcon>
                                        <Upload />
                                    </NIcon>
                                </template>
                                {{ t('dataManagement.createBackup') }}
                            </NButton>
                            <NButton @click="$emit('refresh-backup-list')" :loading="loading.refreshBackupList">
                                <template #icon>
                                    <NIcon>
                                        <Refresh />
                                    </NIcon>
                                </template>
                                {{ t('dataManagement.refreshBackupList') }}
                            </NButton>
                            <NButton @click="$emit('open-backup-directory')">
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
                            <NText depth="2">{{ t('dataManagement.backupVersionList') }}</NText>
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
                                                <NPopconfirm @positive-click="$emit('restore-backup', backup.id)"
                                                    negative-text="取消" positive-text="确定恢复" placement="top"
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
                                                <NPopconfirm @positive-click="$emit('delete-backup', backup.id)"
                                                    negative-text="取消" positive-text="确定">
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
                                <NPagination v-model:page="currentPage" :page-count="totalPages" :page-size="pageSize"
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
                        <NText depth="2">{{ t('dataManagement.fullBackupManagement') }}</NText>
                        <NText depth="3" style="font-size: 12px; ">
                            {{ t('dataManagement.fullBackupDescription') }}
                        </NText>

                        <NFlex :size="12">
                            <NButton type="primary" @click="$emit('export-full-backup')" :loading="loading.export">
                                <template #icon>
                                    <NIcon>
                                        <Archive />
                                    </NIcon>
                                </template>
                                {{ t('dataManagement.exportFullBackup') }}
                            </NButton>
                            <NButton @click="$emit('import-full-backup')" :loading="loading.import">
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
                        <NText depth="2">{{ t('dataManagement.selectiveDataExport') }}</NText>
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
                                            <NTag size="small" type="info">{{ dataStats.prompts || 0 }} 条</NTag>
                                        </NFlex>
                                    </NRadio>
                                    <NRadio :checked="exportOptions.selectedType === 'categories'" value="categories"
                                        @update:checked="handleTypeSelection('categories', $event)">
                                        <NFlex align="center" :size="8">
                                            <NText>{{ t('dataManagement.categoryManagement') }}</NText>
                                            <NTag size="small" type="info">{{ dataStats.categories || 0 }} 个</NTag>
                                        </NFlex>
                                    </NRadio>
                                    <NRadio :checked="exportOptions.selectedType === 'aiConfigs'" value="aiConfigs"
                                        @update:checked="handleTypeSelection('aiConfigs', $event)">
                                        <NFlex align="center" :size="8">
                                            <NText>{{ t('dataManagement.aiConfiguration') }}</NText>
                                            <NTag size="small" type="info">{{ dataStats.aiConfigs || 0 }} 个</NTag>
                                            <NTag size="small" type="warning">{{
                                                t('dataManagement.containsSensitiveInfo') }}</NTag>
                                        </NFlex>
                                    </NRadio>
                                </NFlex>
                            </NFlex>
                        </NCard>

                        <NFlex :size="12">
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
                        <NText depth="2">{{ t('dataManagement.databaseMaintenance') }}</NText>
                        <NText depth="3" style="font-size: 12px">
                            {{ t('dataManagement.maintenanceDescription') }}
                        </NText>
                        <NFlex :size="12">
                            <NButton type="primary" @click="$emit('check-database-health')">
                                <template #icon>
                                    <NIcon>
                                        <AlertCircle />
                                    </NIcon>
                                </template>
                                {{ t('dataManagement.checkDatabaseHealth') }}
                            </NButton>
                            <NButton type="warning" @click="$emit('repair-database')">
                                <template #icon>
                                    <NIcon>
                                        <Database />
                                    </NIcon>
                                </template>
                                {{ t('dataManagement.repairDatabase') }}
                            </NButton>
                            <NPopconfirm @positive-click="$emit('clear-database')" :negative-text="t('common.cancel')"
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
            <NAlert v-if="error" type="error" show-icon closable @close="$emit('clear-messages')">
                {{ error }}
            </NAlert>
            
            <NAlert v-if="success" type="success" show-icon closable @close="$emit('clear-messages')">
                {{ success }}
            </NAlert>
        </NFlex>
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
import { ref, computed } from "vue";
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

// Props 定义
interface Props {
  backupList: any[];
  dataStats: any;
  loading: any;
  error?: string | null;
  success?: string | null;
}

const props = withDefaults(defineProps<Props>(), {
  backupList: () => [],
  dataStats: () => ({
    categories: 0,
    prompts: 0,
    aiConfigs: 0,
    history: 0,
    settings: 0
  }),
  loading: () => ({
    backup: false,
    restore: false,
    export: false,
    import: false,
    healthCheck: false,
    repair: false,
    clearDatabase: false,
    refreshBackupList: false
  }),
  error: null,
  success: null
});

// Emits 定义
const emit = defineEmits<{
  'create-backup': [];
  'refresh-backup-list': [];
  'restore-backup': [backupId: string];
  'delete-backup': [backupId: string];
  'open-backup-directory': [];
  'export-full-backup': [];
  'import-full-backup': [];
  'export-selected-data': [format: 'csv' | 'json', options: any];
  'check-database-health': [];
  'repair-database': [];
  'clear-database': [];
  'clear-messages': [];
}>();

// 分页
const currentPage = ref(1);
const pageSize = ref(6);
const totalItems = computed(() => props.backupList.length);
const totalPages = computed(() => Math.ceil(totalItems.value / pageSize.value));
const paginatedBackups = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  const end = start + pageSize.value;
  // 转换备份数据格式以匹配组件期望的格式
  const formattedBackups = props.backupList.map((backup: any) => ({
    id: backup.id,
    name: backup.name,
    createdAt: new Date(backup.createdAt).toLocaleString('zh-CN'),
    size: `${(backup.size / 1024).toFixed(2)} KB`,
    version: backup.description || 'v1.0'
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

// 处理选择性数据导出
const handleExportSelectedData = (format: 'csv' | 'json') => {
    const options = {
        format,
        selectedType: exportOptions.value.selectedType,
        includeCategories: exportOptions.value.selectedType === 'categories',
        includePrompts: exportOptions.value.selectedType === 'prompts',
        includeAIConfigs: exportOptions.value.selectedType === 'aiConfigs',
    };
    emit('export-selected-data', format, options);
};
</script>

<style scoped>
.pagination-container {
    display: flex;
    justify-content: center;
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px solid var(--border-color);
}
</style>
