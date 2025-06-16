<template>
    <NCard>
        <NFlex vertical :size="20">
            <!-- 数据导入导出 -->
            <div>
                <NFlex vertical :size="16">
                    <NFlex vertical :size="12">
                        <NText depth="2">导出数据</NText>
                        <NFlex :size="12">
                            <NButton @click="exportData('csv')">
                                <template #icon>
                                    <NIcon>
                                        <FileExport />
                                    </NIcon>
                                </template>
                                导出为 CSV
                            </NButton>
                            <NButton @click="exportData('json')">
                                <template #icon>
                                    <NIcon>
                                        <FileExport />
                                    </NIcon>
                                </template>
                                导出为 JSON
                            </NButton>
                        </NFlex>
                    </NFlex>

                    <NFlex vertical :size="12">
                        <NText depth="2">导入数据</NText>
                        <NFlex :size="12">
                            <NButton @click="importData('csv')">
                                <template #icon>
                                    <NIcon>
                                        <FileImport />
                                    </NIcon>
                                </template>
                                导入 CSV
                            </NButton>
                            <NButton @click="importData('json')">
                                <template #icon>
                                    <NIcon>
                                        <FileImport />
                                    </NIcon>
                                </template>
                                导入 JSON
                            </NButton>
                        </NFlex>
                    </NFlex>

                    <NAlert type="warning" show-icon>
                        <template #header>注意</template>
                        导入数据将覆盖现有数据，请确保已备份重要数据
                    </NAlert>
                </NFlex>
            </div>

            <NDivider />

            <!-- 数据备份恢复 -->
            <div>
                <NFlex vertical :size="16">
                    <NFlex vertical :size="12">
                        <NText depth="2">数据备份</NText>
                        <NFlex :size="12">
                            <NButton type="primary" @click="createBackup">
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
                        </NFlex>
                    </NFlex>

                    <!-- 备份版本列表 -->
                    <div v-if="backupList.length > 0">
                        <NFlex vertical :size="12">
                            <NText depth="2">备份版本列表</NText>
                            <div v-for="backup in backupList" :key="backup.id" class="backup-item">
                                <NCard size="small">
                                    <NFlex justify="space-between" align="center">
                                        <NFlex vertical :size="4">
                                            <NFlex align="center" :size="8">
                                                <NText strong>{{ backup.name }}</NText>
                                                <NTag type="info" size="small">{{ backup.version }}</NTag>
                                            </NFlex>
                                            <NFlex :size="16">
                                                <NText depth="3" style="font-size: 12px;">
                                                    {{ backup.createdAt }}
                                                </NText>
                                                <NText depth="3" style="font-size: 12px;">
                                                    {{ backup.size }}
                                                </NText>
                                            </NFlex>
                                        </NFlex>
                                        <NFlex :size="8">
                                            <NButton 
                                                type="primary" 
                                                size="small" 
                                                @click="restoreSpecificBackup(backup.id)"
                                            >
                                                恢复
                                            </NButton>
                                            <NPopconfirm
                                                @positive-click="deleteBackup(backup.id)"
                                                negative-text="取消"
                                                positive-text="确定"
                                            >
                                                <template #trigger>
                                                    <NButton type="error" size="small">
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
                                    </NFlex>
                                </NCard>
                            </div>
                        </NFlex>
                    </div>

                    <div v-else>
                        <NText depth="3" style="color: #999; font-size: 14px;">
                            暂无备份版本，请先创建备份
                        </NText>
                    </div>
                </NFlex>
            </div>

            <NDivider />

            <!-- 数据库维护 -->
            <div>
                <NFlex vertical :size="16">
                    <NFlex vertical :size="12">
                        <NText depth="2">数据库维护</NText>
                        <NText depth="3" style="font-size: 12px">
                            当遇到同步错误或数据异常时，可尝试修复数据库
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

                        </NFlex>
                    </NFlex>

                    <NAlert type="info" show-icon>
                        <template #header>数据库修复说明</template>
                        <div>
                            <p>• <strong>检查状态</strong>：检查数据库是否存在问题</p>
                            <p>• <strong>修复数据库</strong>：尝试修复缺失的数据表</p>
                        </div>
                    </NAlert>

                    <NAlert type="warning" show-icon>
                        <template #header>重要提示</template>
                        修复数据库会尝试恢复缺失的数据表，但可能需要重新登录或重新配置某些设置
                    </NAlert>
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
} from "@vicons/tabler";
import { ref } from "vue";

const emit = defineEmits<{
    "export-data": [format: "csv" | "json"];
    "import-data": [format: "csv" | "json"];
    "create-backup": [];
    "restore-backup": [backupId: string];
    "delete-backup": [backupId: string];
    "refresh-backup-list": [];
    "check-database-health": [];
    "repair-database": [];
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

// 暴露方法供父组件调用
const updateBackupList = (list: BackupItem[]) => {
    backupList.value = list;
};

defineExpose({
    updateBackupList,
});
</script>

<style scoped>
.backup-item {
    margin-bottom: 8px;
}

.backup-item:last-child {
    margin-bottom: 0;
}
</style>
