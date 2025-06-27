<template>
    <NCard>
        <NFlex vertical :size="20">

            <!-- 数据备份恢复 -->
            <div>
                <NFlex vertical :size="16">
                    <NFlex vertical :size="12">
                        <NText depth="2">数据备份</NText>
                        <NFlex :size="12">
                            <NButton type="primary" @click="createBackup" :loading="props.loading?.backup">
                                <template #icon>
                                    <NIcon>
                                        <Upload />
                                    </NIcon>
                                </template>
                                创建备份
                            </NButton>
                            <NButton @click="refreshBackupList">
                                <template #icon>
                                    <NIcon>
                                        <Refresh />
                                    </NIcon>
                                </template>
                                刷新备份列表
                            </NButton>
                            <NButton @click="openBackupDirectory">
                                <template #icon>
                                    <NIcon>
                                        <Folder />
                                    </NIcon>
                                </template>
                                打开备份目录
                            </NButton>
                        </NFlex>
                    </NFlex>

                    <!-- 备份版本列表 -->
                    <div v-if="backupList.length > 0">
                        <NFlex vertical :size="12">
                            <NText depth="2">备份版本列表</NText>
                            <NGrid cols="6" item-responsive :x-gap="12" :y-gap="12">
                                <NGridItem v-for="backup in paginatedBackups" :key="backup.id" span="6 600:5 900:4 1200:3 1500:2 1800:1">
                                    <NCard size="small" :title="backup.version" >
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
                                                <NPopconfirm @positive-click="restoreSpecificBackup(backup.id)"
                                                    negative-text="取消" positive-text="确定恢复" placement="top"
                                                    :show-icon="false">
                                                    <template #trigger>
                                                        <NButton type="primary" size="small"
                                                            :loading="props.loading?.backup"
                                                            :disabled="props.loading?.backup">
                                                            <template #icon>
                                                                <NIcon>
                                                                    <Recharging />
                                                                </NIcon>
                                                            </template>
                                                            恢复
                                                        </NButton>
                                                    </template>
                                                    <div style="max-width: 300px;">
                                                        <p>注意！恢复备份将会：</p>
                                                        <ul style="margin: 8px 0; padding-left: 20px;">
                                                            <li>自动备份当前数据</li>
                                                            <li>完全覆盖现有数据库</li>
                                                        </ul>
                                                    </div>
                                                </NPopconfirm>
                                                <NPopconfirm @positive-click="deleteBackup(backup.id)" negative-text="取消"
                                                    positive-text="确定">
                                                    <template #trigger>
                                                        <NButton type="error" secondary size="small">
                                                            <template #icon>
                                                                <NIcon>
                                                                    <Trash />
                                                                </NIcon>
                                                            </template>
                                                            删除
                                                        </NButton>
                                                    </template>
                                                    确定要删除这个备份吗？
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
                            暂无备份版本，请先创建备份
                        </NText>
                    </div>
                </NFlex>
            </div>

            <NDivider />
            
            <!-- 完整备份导出/导入 -->
            <div>
                <NFlex vertical :size="16">
                    <NFlex vertical :size="12">
                        <NText depth="2">完整备份管理</NText>
                        <NText depth="3" style="font-size: 12px; ">
                            导出完整备份压缩包，或从压缩包导入完整备份。导出的数据将包含 AI 配置信息中的 API 密钥等敏感信息。请妥善保管导出文件，避免泄露。
                        </NText>
                        
                        <NFlex :size="12">
                            <NButton type="primary" @click="exportFullBackup" 
                                     :loading="props.loading?.export">
                                <template #icon>
                                    <NIcon>
                                        <Archive />
                                    </NIcon>
                                </template>
                                导出完整备份
                            </NButton>
                            <NButton @click="importFullBackup" 
                                     :loading="props.loading?.import">
                                <template #icon>
                                    <NIcon>
                                        <Folder />
                                    </NIcon>
                                </template>
                                导入完整备份
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
                        <NText depth="2">选择性数据导出</NText>
                        <NText depth="3" style="font-size: 12px; ">
                            选择部分数据进行可读格式导出，暂时无法恢复到应用中。
                        </NText>
                        
                        <!-- 数据类型选择 -->
                        <NCard size="small" >
                            <NFlex vertical :size="12">
                                <NText depth="2" style="font-size: 14px;">选择要导出的数据类型：</NText>
                                <NFlex vertical :size="8">
                                    <NRadio 
                                        :checked="exportOptions.selectedType === 'prompts'" 
                                        value="prompts"
                                        @update:checked="handleTypeSelection('prompts', $event)">
                                        <NFlex align="center" :size="8">
                                            <NText>描述词库</NText>
                                            <NTag size="small" type="info">{{ dataStats.prompts || 0 }} 条</NTag>
                                        </NFlex>
                                    </NRadio>
                                    <NRadio 
                                        :checked="exportOptions.selectedType === 'categories'" 
                                        value="categories"
                                        @update:checked="handleTypeSelection('categories', $event)">
                                        <NFlex align="center" :size="8">
                                            <NText>分类管理</NText>
                                            <NTag size="small" type="info">{{ dataStats.categories || 0 }} 个</NTag>
                                        </NFlex>
                                    </NRadio>
                                    <NRadio 
                                        :checked="exportOptions.selectedType === 'aiConfigs'" 
                                        value="aiConfigs"
                                        @update:checked="handleTypeSelection('aiConfigs', $event)">
                                        <NFlex align="center" :size="8">
                                            <NText>AI 配置</NText>
                                            <NTag size="small" type="info">{{ dataStats.aiConfigs || 0 }} 个</NTag>
                                            <NTag size="small" type="warning">包含敏感信息</NTag>
                                        </NFlex>
                                    </NRadio>
                                </NFlex>
                            </NFlex>
                        </NCard>
                        
                        <NFlex :size="12">
                            <NButton v-if="exportOptions.selectedType !== 'aiConfigs'" 
                                     type="primary" 
                                     @click="exportSelectedData('csv')" 
                                     :disabled="!hasSelectedData || !isCSVSupported" 
                                     :loading="props.loading?.export">
                                <template #icon>
                                    <NIcon>
                                        <FileExport />
                                    </NIcon>
                                </template>
                                导出为 CSV
                            </NButton>
                            <NButton @click="exportSelectedData('json')" 
                                     :disabled="!hasSelectedData" 
                                     :loading="props.loading?.export">
                                <template #icon>
                                    <NIcon>
                                        <FileExport />
                                    </NIcon>
                                </template>
                                导出为 JSON
                            </NButton>
                        </NFlex>
                        
                        <NAlert v-if="exportOptions.selectedType === 'aiConfigs'" type="warning" show-icon>
                            <template #header>安全提示</template>
                            您选择了导出 AI 配置，导出的数据将包含 API 密钥等敏感信息。请妥善保管导出文件，避免泄露。
                        </NAlert>
                        
                        <NAlert v-if="exportOptions.selectedType === 'aiConfigs'" type="info" show-icon>
                            <template #header>格式说明</template>
                            AI 配置数据包含复杂的对象结构因此表头不统一，仅支持导出为 JSON 格式。
                        </NAlert>
                    </NFlex>
                </NFlex>
            </div>


            <NDivider />

            <!-- 数据库维护 -->
            <div>
                <NFlex vertical :size="16">
                    <NFlex vertical :size="12">
                        <NText depth="2">数据库维护</NText>
                        <NText depth="3" style="font-size: 12px">
                            当遇到数据异常时，可尝试修复数据库
                        </NText>
                        <NFlex :size="12">
                            <NButton type="primary" @click="checkDatabaseHealth">
                                <template #icon>
                                    <NIcon>
                                        <AlertCircle />
                                    </NIcon>
                                </template>
                                检查数据库状态
                            </NButton>
                            <NButton type="warning" @click="repairDatabase">
                                <template #icon>
                                    <NIcon>
                                        <Database />
                                    </NIcon>
                                </template>
                                修复数据库
                            </NButton>
                            <NPopconfirm @positive-click="clearDatabase" negative-text="取消" positive-text="确定清空"
                                placement="top">
                                <template #trigger>
                                    <NButton type="error" :loading="props.loading?.clearDatabase">
                                        <template #icon>
                                            <NIcon>
                                                <DatabaseOff />
                                            </NIcon>
                                        </template>
                                        清空数据库
                                    </NButton>
                                </template>
                                <div style="max-width: 350px;">
                                    <p><strong>⚠️ 危险操作警告</strong></p>
                                    <p>清空数据库将会：</p>
                                    <ul style="margin: 8px 0; padding-left: 20px;">
                                        <li>自动创建当前数据的备份</li>
                                        <li>删除所有现有数据</li>
                                        <li>重置数据库到初始状态</li>
                                        <li>此操作不可撤销</li>
                                    </ul>
                                    <p><strong>确定要清空整个数据库吗？</strong></p>
                                </div>
                            </NPopconfirm>
                        </NFlex>
                    </NFlex>

                </NFlex>
            </div>
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
import { useWindowSize } from "@/composables/useWindowSize";

// Props
const props = defineProps<{
    loading?: {
        backup?: boolean;
        export?: boolean;
        import?: boolean;
        repair?: boolean;
        healthCheck?: boolean;
        clearDatabase?: boolean;
    };
}>();

const emit = defineEmits<{
    "export-data": [format: "csv" | "json"];
    "import-data": [format: "csv" | "json"];
    "export-selected-data": [format: "csv" | "json", options: any];
    "export-full-backup": [];
    "import-full-backup": [];
    "create-backup": [];
    "restore-backup": [backupId: string];
    "delete-backup": [backupId: string];
    "refresh-backup-list": [];
    "check-database-health": [];
    "repair-database": [];
    "clear-database": [];
    "open-backup-directory": [];
}>();

// 备份列表数据
interface BackupItem {
    id: string;
    name: string;
    createdAt: string;
    size: string;
    version: string;
}

const backupList = ref<BackupItem[]>([]);

// 选择性导出选项
const exportOptions = ref({
    selectedType: '' as 'prompts' | 'categories' | 'aiConfigs' | '',
});

// 数据统计
const dataStats = ref({
    categories: 0,
    prompts: 0,
    history: 0,
    aiConfigs: 0,
    settings: 0,
    posts: 0,
    users: 0,
    totalRecords: 0,
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

// 分页相关状态
const currentPage = ref(1);
const pageSize = 6;

// 计算分页数据
const paginatedBackups = computed(() => {
    const start = (currentPage.value - 1) * pageSize;
    const end = start + pageSize;
    return backupList.value.slice(start, end);
});

const totalItems = computed(() => backupList.value.length);
const totalPages = computed(() => Math.ceil(totalItems.value / pageSize));

const exportData = (format: "csv" | "json") => {
    emit("export-data", format);
};

const importData = (format: "csv" | "json") => {
    emit("import-data", format);
};

const createBackup = () => {
    emit("create-backup");
};

const restoreSpecificBackup = (backupId: string) => {
    emit("restore-backup", backupId);
};

const deleteBackup = (backupId: string) => {
    emit("delete-backup", backupId);
};

const refreshBackupList = () => {
    emit("refresh-backup-list");
};

const checkDatabaseHealth = () => {
    emit("check-database-health");
};

const repairDatabase = () => {
    emit("repair-database");
};

const clearDatabase = () => {
    emit("clear-database");
};

// 选择性数据导出
const exportSelectedData = (format: "csv" | "json") => {
    const options = {
        format,
        includePrompts: exportOptions.value.selectedType === 'prompts',
        includeCategories: exportOptions.value.selectedType === 'categories',
        includeAIConfigs: exportOptions.value.selectedType === 'aiConfigs',
    };
    emit("export-selected-data", format, options);
};

// 完整备份导出
const exportFullBackup = () => {
    emit("export-full-backup");
};

// 完整备份导入
const importFullBackup = () => {
    emit("import-full-backup");
};

// 打开备份目录
const openBackupDirectory = () => {
    emit("open-backup-directory");
};

// 更新备份列表
const updateBackupList = (backups: BackupItem[]) => {
    backupList.value = backups;
};

// 更新数据统计
const updateDataStats = (stats: any) => {
    dataStats.value = {
        categories: stats.categories || 0,
        prompts: stats.prompts || 0,
        history: stats.history || 0,
        aiConfigs: stats.aiConfigs || 0,
        settings: stats.settings || 0,
        posts: stats.posts || 0,
        users: stats.users || 0,
        totalRecords: stats.totalRecords || 0,
    };
};

// 暴露方法供父组件调用
defineExpose({
    updateBackupList,
    updateDataStats,
});
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
