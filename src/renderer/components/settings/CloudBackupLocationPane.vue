<template>
    <NFlex vertical :size="16">
        <NFlex justify="space-between" align="center">
            <div>
                <NText depth="2">{{ config.name }}</NText>
                <NText depth="3" style="display: block; margin-top: 4px; font-size: 12px;">
                    {{ t('dataBackup.cloudLocationDescription') }}
                </NText>
            </div>
            <NFlex :size="12">
                <NButton type="primary" @click="createCloudBackup" :loading="loading.create">
                    <template #icon><NIcon><Upload /></NIcon></template>
                    {{ t('dataBackup.createCloudBackup') }}
                </NButton>
                <NButton @click="refreshCloudBackupList" :loading="loading.refresh">
                    <template #icon><NIcon><Refresh /></NIcon></template>
                    {{ t('dataBackup.refreshBackupList') }}
                </NButton>
            </NFlex>
        </NFlex>

        <NGrid v-if="paginatedBackups.length > 0" cols="6" item-responsive :x-gap="12" :y-gap="12">
            <NGridItem v-for="backup in paginatedBackups" :key="backup.id"
                span="6 600:5 900:4 1200:3 1500:2 1800:1">
                <NCard size="small" :title="backup.name">
                    <NFlex vertical :size="8">
                        <NText strong>{{ backup.description || t('dataBackup.cloudBackup') }}</NText>
                        <NFlex align="center" :size="8">
                            <NTag type="info" size="small">{{ formatDate(backup.createdAt) }}</NTag>
                            <NTag type="success" size="small">{{ formatSize(backup.size) }}</NTag>
                        </NFlex>
                    </NFlex>
                    <template #action>
                        <NFlex justify="space-between" align="center" style="width: 100%;">
                            <NPopconfirm @positive-click="restoreCloudBackup(backup.id)"
                                :negative-text="t('common.cancel')" :positive-text="t('dataBackup.confirmRestore')"
                                placement="top" :show-icon="false">
                                <template #trigger>
                                    <NButton type="primary" size="small" :loading="loading.restore"
                                        :disabled="loading.restore">
                                        <template #icon><NIcon><Recharging /></NIcon></template>
                                        {{ t('dataBackup.restore') }}
                                    </NButton>
                                </template>
                                <div style="max-width: 300px;">{{ t('dataBackup.restoreWarning') }}</div>
                            </NPopconfirm>
                            <NPopconfirm @positive-click="deleteCloudBackup(backup.id)"
                                :negative-text="t('common.cancel')" :positive-text="t('common.confirm')">
                                <template #trigger>
                                    <NButton type="error" secondary size="small">
                                        <template #icon><NIcon><Trash /></NIcon></template>
                                        {{ t('common.delete') }}
                                    </NButton>
                                </template>
                                {{ t('dataBackup.confirmDeleteCloudBackup') }}
                            </NPopconfirm>
                        </NFlex>
                    </template>
                </NCard>
            </NGridItem>
        </NGrid>

        <NEmpty v-else-if="!loading.refresh" :description="t('dataBackup.noCloudBackups')" />

        <div v-if="totalPages > 1" class="pagination-container">
            <NPagination v-model:page="currentPage" v-model:page-size="pageSize"
                :item-count="cloudBackups.length" show-size-picker show-quick-jumper
                :page-sizes="[6, 12, 18]" />
        </div>
    </NFlex>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
    NButton, NCard, NEmpty, NFlex, NGrid, NGridItem, NIcon, NPagination,
    NPopconfirm, NTag, NText, useMessage,
} from 'naive-ui';
import { Recharging, Refresh, Trash, Upload } from '@vicons/tabler';
import { CloudBackupAPI } from '@/lib/api/cloud-backup.api';
import type { CloudBackupInfo, CloudStorageConfig } from '@shared/types/cloud-backup';

const props = defineProps<{ config: CloudStorageConfig }>();
const { t } = useI18n();
const message = useMessage();
const cloudBackups = ref<CloudBackupInfo[]>([]);
const currentPage = ref(1);
const pageSize = ref(6);
const loading = reactive({ refresh: false, create: false, restore: false });
const totalPages = computed(() => Math.ceil(cloudBackups.value.length / pageSize.value));
const paginatedBackups = computed(() => {
    const start = (currentPage.value - 1) * pageSize.value;
    return cloudBackups.value.slice(start, start + pageSize.value);
});

const refreshCloudBackupList = async () => {
    if (loading.refresh) return;
    loading.refresh = true;
    try {
        cloudBackups.value = await CloudBackupAPI.getCloudBackupList(props.config.id);
        if (currentPage.value > totalPages.value) currentPage.value = Math.max(totalPages.value, 1);
    } catch (error) {
        console.error('刷新云端备份列表失败:', error);
        message.error(t('dataBackup.loadCloudBackupsFailed'));
    } finally { loading.refresh = false; }
};

const createCloudBackup = async () => {
    loading.create = true;
    try {
        const result = await CloudBackupAPI.createCloudBackup(props.config.id, {
            description: t('dataBackup.manualCloudBackupDescription', { time: new Date().toLocaleString() }),
            backupType: 'manual',
        });
        if (!result.success) return message.error(result.error || t('dataBackup.createCloudBackupFailed'));
        message.success(result.message || t('dataBackup.createCloudBackupSuccess'));
        await refreshCloudBackupList();
    } catch (error) {
        console.error('创建云端备份失败:', error);
        message.error(error instanceof Error ? error.message : t('dataBackup.createCloudBackupFailed'));
    } finally { loading.create = false; }
};

const restoreCloudBackup = async (backupId: string) => {
    loading.restore = true;
    try {
        const result = await CloudBackupAPI.restoreCloudBackup(props.config.id, backupId);
        if (!result.success) return message.error(result.error || t('dataBackup.restoreFailed'));
        message.success(result.message || t('dataBackup.restoreSuccess'));
        window.location.reload();
    } catch (error) {
        console.error('恢复云端备份失败:', error);
        message.error(error instanceof Error ? error.message : t('dataBackup.restoreFailed'));
    } finally { loading.restore = false; }
};

const deleteCloudBackup = async (backupId: string) => {
    try {
        const result = await CloudBackupAPI.deleteCloudBackup(props.config.id, backupId);
        if (!result.success) return message.error(result.error || t('dataBackup.deleteFailed'));
        message.success(result.message || t('dataBackup.deleteSuccess'));
        await refreshCloudBackupList();
    } catch (error) {
        console.error('删除云端备份失败:', error);
        message.error(t('dataBackup.deleteFailed'));
    }
};

const formatDate = (value: string) => new Date(value).toLocaleString();
const formatSize = (size: number) => {
    if (!size || Number.isNaN(size) || size <= 0) return '0 B';
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

watch(() => props.config.id, () => {
    currentPage.value = 1;
    void refreshCloudBackupList();
});
watch(pageSize, () => { currentPage.value = 1; });
onMounted(refreshCloudBackupList);
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
