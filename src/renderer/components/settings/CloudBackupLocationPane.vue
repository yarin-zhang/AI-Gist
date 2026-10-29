<template>
    <div class="cloud-backups">
        <p class="cloud-backups__hint">{{ t('dataBackup.cloudLocationDescription') }}</p>
        <!-- 读取失败不能显示成「暂无云端备份」，否则用户会以为备份没了：说明原因并给出重试 (#445) -->
        <div v-if="listError" class="ui-alert ui-alert--error cloud-backups__error" role="alert">
            <NIcon :size="14" class="ui-alert__icon" aria-hidden="true"><AlertCircle /></NIcon>
            <span class="cloud-backups__error-text">
                <strong>{{ t('dataBackup.loadCloudBackupsFailedTitle') }}</strong>
                {{ t('dataBackup.loadCloudBackupsFailedReason', { title: listError.title, message: listError.message }) }}
            </span>
            <NButton size="tiny" :loading="loading.refresh" @click="refreshCloudBackupList">{{ t('common.retry') }}</NButton>
        </div>
        <div v-else-if="cloudBackups.length" class="cloud-backups__list" :class="{ 'is-scrollable': showAll }">
            <div v-for="backup in visibleBackups" :key="backup.id" class="cloud-backup">
                <div class="cloud-backup__info">
                    <span class="cloud-backup__title">{{ formatDate(backup.createdAt) }}</span>
                    <!-- 创建时写进去的说明自带一个日期（「手动云端备份 - 2026-10-27 14:37:32」），和标题重复：副标题按类型现算 -->
                    <span class="cloud-backup__meta">{{ getBackupTypeLabel(backup) }} · {{ formatSize(backup.size) }}</span>
                </div>
                <span class="cloud-backup__actions">
                    <NPopconfirm :negative-text="t('common.cancel')" :positive-text="t('dataBackup.confirmRestore')" :show-icon="false"
                        @positive-click="restoreCloudBackup(backup.id)">
                        <template #trigger>
                            <NButton :loading="loading.restore" :disabled="loading.restore">{{ t('dataBackup.restore') }}</NButton>
                        </template>
                        <div class="cloud-backup__confirm">{{ t('dataBackup.restoreWarning') }}</div>
                    </NPopconfirm>
                    <NPopconfirm :negative-text="t('common.cancel')" :positive-text="t('common.confirm')"
                        @positive-click="deleteCloudBackup(backup.id)">
                        <template #trigger>
                            <NButton quaternary type="error" class="cloud-backup__icon" :aria-label="t('common.delete')">
                                <template #icon><NIcon :size="14"><Trash /></NIcon></template>
                            </NButton>
                        </template>
                        <div class="cloud-backup__confirm">{{ t('dataBackup.confirmDeleteCloudBackupAt', { time: formatDate(backup.createdAt) }) }}</div>
                    </NPopconfirm>
                </span>
            </div>
        </div>
        <p v-else-if="listLoaded" class="cloud-backups__empty">{{ t('dataBackup.noCloudBackups') }}</p>
        <p v-else class="cloud-backups__empty">{{ t('dataBackup.loadingCloudBackups') }}</p>
        <NButton v-if="!listError && cloudBackups.length > PREVIEW_COUNT" quaternary size="tiny" class="cloud-backups__toggle" @click="showAll = !showAll">
            {{ showAll ? t('dataManagement.collapseBackupList') : t('dataManagement.showMoreBackups', { count: cloudBackups.length - PREVIEW_COUNT }) }}
        </NButton>
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { NButton, NIcon, NPopconfirm, useMessage } from 'naive-ui';
import { AlertCircle, Trash } from '@vicons/tabler';
import { CloudBackupAPI } from '@/lib/api/cloud-backup.api';
import { getCloudStorageConnectionDiagnosis } from '@/lib/services/cloud-sync.service';
import type { CloudStorageConnectionDiagnosis } from '@/lib/services/cloud-sync.service';
import { describeCloudBackupFailure } from '@/lib/utils/cloud-backup-feedback';
import { formatDateTime, formatFriendlyDate } from '@/lib/utils/date';
import type { CloudBackupInfo, CloudStorageConfig } from '@shared/types/cloud-backup';

const props = defineProps<{ config: CloudStorageConfig }>();
const { t, locale } = useI18n();
const message = useMessage();
const cloudBackups = ref<CloudBackupInfo[]>([]);
// 和本机备份一样只先显示最近几条，其余收进「展开全部」
const PREVIEW_COUNT = 3;
const showAll = ref(false);
const loading = reactive({ refresh: false, create: false, restore: false });
// 当前存储的列表有没有成功读过一次；读之前显示「正在读取」，不显示成空列表
const listLoaded = ref(false);
const listError = ref<CloudStorageConnectionDiagnosis | null>(null);
const visibleBackups = computed(() => showAll.value ? cloudBackups.value : cloudBackups.value.slice(0, PREVIEW_COUNT));

// 静默加载列表：挂载、切换存储和创建/删除后使用，不让「刷新备份列表」按钮闪成加载态 (#389)。
let pendingListLoad: { storageId: string; promise: Promise<void> } | null = null;
const loadCloudBackupList = () => {
    const storageId = props.config.id;
    if (pendingListLoad?.storageId === storageId) return pendingListLoad.promise;
    const promise = (async () => {
        try {
            const backups = await CloudBackupAPI.getCloudBackupList(storageId);
            // 等待期间切换了存储位置时，丢弃旧位置的结果
            if (storageId !== props.config.id) return;
            cloudBackups.value = backups;
            listError.value = null;
            listLoaded.value = true;
        } catch (error) {
            console.error('刷新云端备份列表失败:', error);
            if (storageId !== props.config.id) return;
            // 把服务器返回的技术错误翻成用户看得懂的原因（密码不对、找不到服务器……）
            listError.value = getCloudStorageConnectionDiagnosis(error instanceof Error ? error.message : String(error));
        } finally {
            // 同一存储同时只会有一次加载，切换存储后不动新存储的加载记录
            if (pendingListLoad?.storageId === storageId) pendingListLoad = null;
        }
    })();
    pendingListLoad = { storageId, promise };
    return promise;
};

const refreshCloudBackupList = async () => {
    if (loading.refresh) return;
    loading.refresh = true;
    try {
        await loadCloudBackupList();
    } finally { loading.refresh = false; }
};

// 服务层返回的 message / error 是写给日志的中文原文：成功一律显示界面语言的提示，
// 失败只在连不上存储时说出原因（用户能自己处理），其余原因只写日志
const showFailure = (text: string) => message.error(text, { duration: 6000, closable: true });

const createCloudBackup = async () => {
    if (loading.create) return;
    loading.create = true;
    try {
        const result = await CloudBackupAPI.createCloudBackup(props.config.id, {
            description: t('dataBackup.manualCloudBackupDescription', { time: formatDateTime(new Date()) }),
            backupType: 'manual',
            trigger: 'manual',
        });
        if (!result.success) {
            console.warn('创建云端备份失败:', result.error || result.message);
            showFailure(describeCloudBackupFailure(t('dataBackup.createCloudBackupFailed'), result.error,
                { localFailure: result.localFailure, detailed: true }));
            return;
        }
        message.success(t('dataBackup.createCloudBackupSuccess'));
        await loadCloudBackupList();
    } catch (error) {
        console.error('创建云端备份失败:', error);
        showFailure(describeCloudBackupFailure(t('dataBackup.createCloudBackupFailed'), error, { detailed: true }));
    } finally { loading.create = false; }
};

const restoreCloudBackup = async (backupId: string) => {
    loading.restore = true;
    try {
        const result = await CloudBackupAPI.restoreCloudBackup(props.config.id, backupId);
        if (!result.success) {
            console.warn('恢复云端备份失败:', result.error || result.message);
            // 恢复在替换本机数据之前失败，或者替换本身失败后整体回滚：本机数据都没有变
            showFailure(describeCloudBackupFailure(t('dataBackup.restoreFailed'), result.error, {
                localFailure: result.localFailure,
                otherwise: t('dataBackup.restoreFailedUnchanged'),
                detailed: true,
            }));
            return;
        }
        message.success(t('dataBackup.restoreSuccess'));
        window.location.reload();
    } catch (error) {
        console.error('恢复云端备份失败:', error);
        showFailure(describeCloudBackupFailure(t('dataBackup.restoreFailed'), error, { detailed: true }));
    } finally { loading.restore = false; }
};

const deleteCloudBackup = async (backupId: string) => {
    try {
        const result = await CloudBackupAPI.deleteCloudBackup(props.config.id, backupId);
        if (!result.success) {
            console.warn('删除云端备份失败:', result.error || result.message);
            showFailure(describeCloudBackupFailure(t('dataBackup.deleteFailed'), result.error, { detailed: true }));
            return;
        }
        message.success(t('dataBackup.deleteSuccess'));
        await loadCloudBackupList();
    } catch (error) {
        console.error('删除云端备份失败:', error);
        showFailure(describeCloudBackupFailure(t('dataBackup.deleteFailed'), error, { detailed: true }));
    }
};

const formatDate = (value: string) => formatFriendlyDate(value, locale.value, { withTime: true });
// 和移动端一样按备份类型现算，不用创建时写进文件的说明（那是创建那一刻的界面语言，还带着重复的日期）
const getBackupTypeLabel = (backup: CloudBackupInfo) => backup.backupType === 'automatic'
    ? t('mobileSettings.backup.automaticCloudBackup')
    : t('mobileSettings.backup.manualCloudBackup');
const formatSize = (size: number) => {
    if (!size || Number.isNaN(size) || size <= 0) return '0 B';
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
};

watch(() => props.config.id, () => {
    showAll.value = false;
    // 换了存储就不再显示上一个存储的列表或错误
    cloudBackups.value = [];
    listLoaded.value = false;
    listError.value = null;
    void loadCloudBackupList();
});
onMounted(loadCloudBackupList);

defineExpose({ loading, createCloudBackup, refreshCloudBackupList });
</script>

<style scoped>
.cloud-backups {
    display: flex;
    flex-direction: column;
}

.cloud-backups__hint {
    margin: 0 0 4px;
    color: var(--content-tertiary);
    font-size: var(--font-size-xs);
}

.cloud-backups__list.is-scrollable {
    max-height: 360px;
    overflow-y: auto;
}

.cloud-backup {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 56px;
    border-bottom: 1px solid var(--border-subtle);
}

.cloud-backup__info {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
}

.cloud-backup__title {
    font-size: var(--font-size-base);
}

.cloud-backup__meta {
    overflow: hidden;
    color: var(--content-tertiary);
    font-size: var(--font-size-xs);
    text-overflow: ellipsis;
    white-space: nowrap;
}

.cloud-backup__actions {
    display: flex;
    flex: none;
    gap: 4px;
}

.cloud-backup__icon {
    width: 28px;
    padding: 0;
}

.cloud-backup__confirm {
    max-width: 300px;
}

.cloud-backups__error {
    align-items: center;
    margin: 4px 0 8px;
}

.cloud-backups__error-text {
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
}

.cloud-backups__empty {
    margin: 0;
    padding: 16px 0;
    color: var(--content-tertiary);
    font-size: var(--font-size-sm);
}

.cloud-backups__toggle {
    align-self: flex-start;
    margin: 4px 0;
}
</style>
