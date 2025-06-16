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
                            <NButton @click="restoreBackup">
                                <template #icon>
                                    <NIcon>
                                        <Download />
                                    </NIcon>
                                </template>
                                恢复备份
                            </NButton>
                        </NFlex>
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
} from "naive-ui";
import {
    FileExport,
    FileImport,
    Upload,
    Download,
    AlertCircle,
    Database,
    Refresh,
} from "@vicons/tabler";

const emit = defineEmits<{
    "export-data": [format: "csv" | "json"];
    "import-data": [format: "csv" | "json"];
    "create-backup": [];
    "restore-backup": [];
    "check-database-health": [];
    "repair-database": [];
}>();

const exportData = (format: "csv" | "json") => {
    emit("export-data", format);
};

const importData = (format: "csv" | "json") => {
    emit("import-data", format);
};

const createBackup = () => {
    emit("create-backup");
};

const restoreBackup = () => {
    emit("restore-backup");
};

const checkDatabaseHealth = () => {
    emit("check-database-health");
};

const repairDatabase = () => {
    emit("repair-database");
};
</script>
