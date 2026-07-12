<template>
    <NCard size="small">
        <NFlex vertical :size="20">
            <NAlert :type="statusAlertType" :title="statusTitle" show-icon>
                <NFlex vertical :size="4">
                    <NText>{{ statusDescription }}</NText>
                    <NText v-if="syncStatus.lastSyncAt" depth="3" style="font-size: 12px;">
                        {{ t('dataSync.lastSyncAt', { time: formatDate(syncStatus.lastSyncAt) }) }}
                    </NText>
                    <NText v-if="syncStatus.pendingChanges" depth="3" style="font-size: 12px;">
                        {{ t('dataSync.pendingChanges') }}
                    </NText>
                </NFlex>
                <template v-if="syncStatus.status === 'error'" #action>
                    <NButton size="small" secondary @click="showCurrentSyncError">
                        {{ t('dataSync.viewErrorDetails') }}
                    </NButton>
                </template>
            </NAlert>

            <NFlex vertical :size="16">
                <NFlex justify="space-between" align="center" :size="12" wrap>
                    <div>
                        <NText strong>{{ t('dataSync.storageConfiguration') }}</NText>
                        <NText depth="3" style="display: block; margin-top: 4px; font-size: 12px;">
                            {{ storageDescriptionText }}
                        </NText>
                    </div>
                    <NButton type="primary" @click="showAddConfigModal">
                        <template #icon>
                            <NIcon><Plus /></NIcon>
                        </template>
                        {{ t('dataSync.addStorageConfig') }}
                    </NButton>
                </NFlex>

                <NGrid v-if="storageConfigs.length > 0" cols="6" item-responsive :x-gap="12" :y-gap="12">
                    <NGridItem v-for="config in storageConfigs" :key="config.id"
                        span="6 700:6 1100:3 1600:2">
                        <NCard size="small" :title="config.name">
                            <NFlex vertical :size="8">
                                <NFlex align="center" :size="8">
                                    <NTag :type="config.type === 'webdav' ? 'info' : 'success'" size="small">
                                        {{ config.type === 'webdav' ? 'WebDAV' : 'iCloud Drive' }}
                                    </NTag>
                                    <NTag :type="config.enabled ? 'success' : 'warning'" size="small">
                                        {{ config.enabled ? t('dataSync.enabled') : t('dataSync.disabled') }}
                                    </NTag>
                                </NFlex>
                                <NText depth="3" style="font-size: 12px; word-break: break-all;">
                                    {{ getConfigDescription(config) }}
                                </NText>
                            </NFlex>

                            <template #action>
                                <NFlex justify="space-between" align="center" style="width: 100%;" wrap>
                                    <NFlex :size="8" wrap>
                                        <NButton size="small" @click="editConfig(config)">
                                            <template #icon><NIcon><Edit /></NIcon></template>
                                            {{ t('dataSync.editConfig') }}
                                        </NButton>
                                        <NButton size="small" @click="testSavedConnection(config)"
                                            :loading="testingStorageId === config.id">
                                            <template #icon><NIcon><Wifi /></NIcon></template>
                                            {{ t('dataSync.testConnection') }}
                                        </NButton>
                                        <NButton size="small" secondary @click="syncCloudData(config.id)"
                                            :loading="loading.syncNow && syncingStorageId === config.id"
                                            :disabled="!config.enabled">
                                            <template #icon><NIcon><Refresh /></NIcon></template>
                                            {{ t('dataSync.syncNow') }}
                                        </NButton>
                                    </NFlex>
                                    <NPopconfirm @positive-click="deleteConfig(config.id)"
                                        :negative-text="t('common.cancel')" :positive-text="t('common.confirm')">
                                        <template #trigger>
                                            <NButton type="error" secondary size="small">
                                                <template #icon><NIcon><Trash /></NIcon></template>
                                                {{ t('common.delete') }}
                                            </NButton>
                                        </template>
                                        {{ t('dataSync.confirmDeleteConfig') }}
                                    </NPopconfirm>
                                </NFlex>
                            </template>
                        </NCard>
                    </NGridItem>
                </NGrid>

                <NEmpty v-else :description="t('dataSync.noStorageConfig')">
                    <template #extra>
                        <NButton type="primary" @click="showAddConfigModal">
                            {{ t('dataSync.addStorageConfig') }}
                        </NButton>
                    </template>
                </NEmpty>
            </NFlex>

            <NCollapse>
                <NCollapseItem :title="t('dataSync.advancedSettings')" name="advanced-sync-settings">
                    <NFlex vertical :size="16" style="padding-top: 4px;">
                        <NFlex align="center" justify="space-between" :size="12" wrap>
                            <div>
                                <NText>{{ t('dataSync.enableAutoSync') }}</NText>
                                <NText depth="3" style="display: block; margin-top: 4px; font-size: 12px;">
                                    {{ t('dataSync.autoSyncDescription') }}
                                </NText>
                            </div>
                            <NSwitch v-model:value="autoSyncEnabled" @update:value="saveAutoSyncEnabled" />
                        </NFlex>
                        <NFlex align="center" justify="space-between" :size="12" wrap>
                            <div>
                                <NText>{{ t('dataSync.syncInterval') }}</NText>
                                <NText depth="3" style="display: block; margin-top: 4px; font-size: 12px;">
                                    {{ t('dataSync.syncIntervalDescription') }}
                                </NText>
                            </div>
                            <NFlex align="center" :size="12" wrap>
                                <NInputNumber v-model:value="syncIntervalMinutes"
                                    :min="MIN_CLOUD_SYNC_INTERVAL_MINUTES"
                                    :max="MAX_CLOUD_SYNC_INTERVAL_MINUTES" :step="5" style="width: 160px;">
                                    <template #suffix>{{ t('dataSync.minutes') }}</template>
                                </NInputNumber>
                                <NButton secondary @click="saveSyncInterval" :loading="loading.saveSyncInterval">
                                    {{ t('common.save') }}
                                </NButton>
                            </NFlex>
                        </NFlex>
                    </NFlex>
                </NCollapseItem>
            </NCollapse>
        </NFlex>

        <NModal v-model:show="showConfigModal" preset="card" style="width: min(600px, calc(100vw - 32px));"
            :title="configForm.id ? t('dataSync.editStorageConfig') : t('dataSync.addStorageConfig')">
            <NFlex vertical :size="16">
                <NForm ref="formRef" :model="configForm" :rules="formRules">
                    <NFormItem :label="t('dataSync.storageType')" path="type">
                        <NRadioGroup v-model:value="configForm.type" @update:value="handleTypeChange">
                            <NRadio value="webdav">WebDAV</NRadio>
                            <NRadio v-if="capabilities.icloud" value="icloud">iCloud Drive</NRadio>
                        </NRadioGroup>
                    </NFormItem>
                    <NFormItem :label="t('dataSync.configName')" path="name">
                        <NInput v-model:value="configForm.name" :placeholder="t('dataSync.configNamePlaceholder')" />
                    </NFormItem>
                    <template v-if="configForm.type === 'webdav'">
                        <NFormItem :label="t('dataSync.serverUrl')" path="url">
                            <NInput v-model:value="configForm.url" placeholder="https://your-webdav-server.com" />
                        </NFormItem>
                        <NFormItem :label="t('dataSync.username')" path="username">
                            <NInput v-model:value="configForm.username" :placeholder="t('dataSync.usernamePlaceholder')" />
                        </NFormItem>
                        <NFormItem :label="t('dataSync.password')" path="password">
                            <NInput v-model:value="configForm.password" type="password"
                                :placeholder="t('dataSync.passwordPlaceholder')" />
                        </NFormItem>
                    </template>
                    <template v-else>
                        <NAlert v-if="iCloudAvailability && !iCloudAvailability.available" type="warning"
                            style="margin-bottom: 16px;">
                            {{ iCloudAvailability.reason }}
                        </NAlert>
                        <NFormItem :label="t('dataSync.icloudPath')" path="path">
                            <NInput v-model:value="configForm.path" placeholder="AI-Gist-Backup" />
                        </NFormItem>
                    </template>
                    <NFormItem :label="t('dataSync.enableConfig')" path="enabled">
                        <NSwitch v-model:value="configForm.enabled" />
                    </NFormItem>
                </NForm>

                <NFlex justify="space-between" align="center">
                    <NButton @click="showConfigModal = false">{{ t('common.cancel') }}</NButton>
                    <NFlex :size="12">
                        <NButton @click="testDraftConnection" :loading="loading.testDraft"
                            :disabled="!canUseICloudConfig">
                            <template #icon><NIcon><Wifi /></NIcon></template>
                            {{ t('dataSync.testConnection') }}
                        </NButton>
                        <NButton type="primary" @click="saveConfig" :loading="loading.saveConfig"
                            :disabled="!canUseICloudConfig">
                            {{ t('common.save') }}
                        </NButton>
                    </NFlex>
                </NFlex>
            </NFlex>
        </NModal>

        <NModal v-model:show="syncErrorDialogVisible" preset="card"
            style="width: min(680px, calc(100vw - 32px));" :title="t('dataSync.syncErrorDetails')">
            <NFlex v-if="syncErrorDiagnosis" vertical :size="16">
                <NAlert type="error" :title="syncErrorDiagnosis.title">
                    {{ syncErrorDiagnosis.message }}
                </NAlert>
                <NFlex vertical :size="8">
                    <NText depth="2">{{ t('dataSync.suggestedActions') }}</NText>
                    <ul class="sync-error-action-list">
                        <li v-for="action in syncErrorDiagnosis.suggestedActions" :key="action">{{ action }}</li>
                    </ul>
                </NFlex>
                <NInput :value="syncErrorDiagnosis.copyText" type="textarea" readonly
                    :autosize="{ minRows: 8, maxRows: 14 }" />
                <NFlex justify="end" :size="12">
                    <NButton @click="syncErrorDialogVisible = false">{{ t('common.close') }}</NButton>
                    <NButton secondary @click="copySyncErrorDetails">
                        <template #icon><NIcon><Copy /></NIcon></template>
                        {{ t('common.copy') }}
                    </NButton>
                    <NButton type="primary" @click="retrySyncFromDialog" :loading="loading.syncNow"
                        :disabled="!syncErrorStorageId">
                        <template #icon><NIcon><Refresh /></NIcon></template>
                        {{ t('dataSync.retrySync') }}
                    </NButton>
                </NFlex>
            </NFlex>
        </NModal>
    </NCard>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import type { FormInst, FormRules } from 'naive-ui';
import {
    NAlert, NButton, NCard, NCollapse, NCollapseItem, NEmpty, NFlex, NForm, NFormItem,
    NGrid, NGridItem, NIcon, NInput, NInputNumber, NModal, NPopconfirm, NRadio,
    NRadioGroup, NSwitch, NTag, NText, useMessage,
} from 'naive-ui';
import { Copy, Edit, Plus, Refresh, Trash, Wifi } from '@vicons/tabler';
import { CloudBackupAPI } from '@/lib/api/cloud-backup.api';
import {
    cloudSyncService,
    DEFAULT_CLOUD_SYNC_INTERVAL_MINUTES,
    MAX_CLOUD_SYNC_INTERVAL_MINUTES,
    MIN_CLOUD_SYNC_INTERVAL_MINUTES,
    getCloudSyncErrorDiagnosis,
    getCloudSyncResultMessage,
} from '@/lib/services/cloud-sync.service';
import type { CloudSyncResult, CloudSyncStatus } from '@/lib/services/cloud-sync.service';
import { PlatformDetector } from '@shared/platform';
import type { CloudStorageConfig } from '@shared/types/cloud-backup';
import {
    createCloudStorageConfigForConnectionTest,
    normalizeCloudStorageConfigForConnectionTest,
} from '@/lib/utils/cloud-storage-config';

const { t } = useI18n();
const message = useMessage();
const capabilities = PlatformDetector.getCapabilities();

const storageConfigs = ref<CloudStorageConfig[]>([]);
const syncStatus = ref<CloudSyncStatus>(cloudSyncService.getStatus());
const syncIntervalMinutes = ref(DEFAULT_CLOUD_SYNC_INTERVAL_MINUTES);
const autoSyncEnabled = ref(true);
const showConfigModal = ref(false);
const formRef = ref<FormInst | null>(null);
const iCloudAvailability = ref<{ available: boolean; reason?: string } | null>(null);
const testingStorageId = ref('');
const syncingStorageId = ref('');
const syncErrorDialogVisible = ref(false);
const syncErrorStorageId = ref('');
const syncErrorDiagnosis = ref<ReturnType<typeof getCloudSyncErrorDiagnosis> | null>(null);
const loading = ref({ saveConfig: false, testDraft: false, syncNow: false, saveSyncInterval: false });
let unsubscribeSyncStatus: (() => void) | null = null;

const configForm = ref({
    id: '', name: '', type: 'webdav' as 'webdav' | 'icloud', enabled: true,
    url: '', username: '', password: '', path: 'AI-Gist-Backup',
});

const formRules: FormRules = {
    name: { required: true, message: () => t('dataSync.configNameRequired'), trigger: 'blur' },
    url: {
        trigger: 'blur',
        validator: (_rule, value) => configForm.value.type !== 'webdav' || !!value
            ? true : new Error(t('dataSync.serverUrlRequired')),
    },
    username: {
        trigger: 'blur',
        validator: (_rule, value) => configForm.value.type !== 'webdav' || !!value
            ? true : new Error(t('dataSync.usernameRequired')),
    },
    password: {
        trigger: 'blur',
        validator: (_rule, value) => configForm.value.type !== 'webdav' || !!value
            ? true : new Error(t('dataSync.passwordRequired')),
    },
    path: {
        trigger: 'blur',
        validator: (_rule, value) => configForm.value.type !== 'icloud' || !!String(value || '').trim()
            ? true : new Error(t('dataSync.icloudPathRequired')),
    },
};

const canUseICloudConfig = computed(() => configForm.value.type !== 'icloud' || iCloudAvailability.value?.available !== false);
const storageDescriptionText = computed(() => capabilities.icloud
    ? t('dataSync.storageDescription') : t('dataSync.webdavOnlyStorageDescription'));
const statusAlertType = computed<'success' | 'info' | 'warning' | 'error'>(() => {
    if (syncStatus.value.status === 'error') return 'error';
    if (!autoSyncEnabled.value) return 'warning';
    if (syncStatus.value.status === 'syncing' || syncStatus.value.status === 'scheduled') return 'info';
    if (syncStatus.value.lastSyncAt || syncStatus.value.lastResult?.success) return 'success';
    return 'info';
});
const statusTitle = computed(() => {
    if (syncStatus.value.status === 'error') return t('dataSync.statusError');
    if (!autoSyncEnabled.value) return t('dataSync.statusPaused');
    if (syncStatus.value.status === 'syncing') return t('dataSync.statusSyncing');
    if (syncStatus.value.pendingChanges) return t('dataSync.statusPending');
    if (syncStatus.value.lastSyncAt || syncStatus.value.lastResult?.success) return t('dataSync.statusCurrent');
    return storageConfigs.value.length ? t('dataSync.statusReady') : t('dataSync.statusNotConfigured');
});
const statusDescription = computed(() => {
    if (syncStatus.value.status === 'error') return syncStatus.value.error || t('dataSync.statusErrorDescription');
    if (!autoSyncEnabled.value) return t('dataSync.statusPausedDescription');
    if (storageConfigs.value.length === 0) return t('dataSync.statusNotConfiguredDescription');
    if (syncStatus.value.status === 'syncing') return t('dataSync.statusSyncingDescription');
    return t('dataSync.statusAutomaticDescription');
});

const getAutoGeneratedName = () => {
    const baseName = configForm.value.type === 'webdav' ? 'WebDAV' : 'iCloud Drive';
    const count = storageConfigs.value.filter(config => config.type === configForm.value.type && config.name.startsWith(baseName)).length;
    return count === 0 ? baseName : `${baseName} ${count + 1}`;
};

const resetConfigForm = () => {
    configForm.value = {
        id: '', name: '', type: 'webdav', enabled: true,
        url: '', username: '', password: '', path: 'AI-Gist-Backup',
    };
    configForm.value.name = getAutoGeneratedName();
};

const showAddConfigModal = () => {
    resetConfigForm();
    showConfigModal.value = true;
};

const editConfig = (config: CloudStorageConfig) => {
    configForm.value = {
        id: config.id,
        name: config.name,
        type: config.type,
        enabled: config.enabled,
        url: config.type === 'webdav' ? (config as any).url : '',
        username: config.type === 'webdav' ? (config as any).username : '',
        password: config.type === 'webdav' ? (config as any).password : '',
        path: config.type === 'icloud' ? (config as any).path || 'AI-Gist-Backup' : 'AI-Gist-Backup',
    };
    showConfigModal.value = true;
};

const handleTypeChange = () => {
    if (configForm.value.type === 'icloud' && !configForm.value.path.trim()) configForm.value.path = 'AI-Gist-Backup';
    if (!configForm.value.id) configForm.value.name = getAutoGeneratedName();
};

const toStorageConfig = (): CloudStorageConfig => createCloudStorageConfigForConnectionTest(
    configForm.value,
    storageConfigs.value.find(config => config.id === configForm.value.id),
);

const validateForm = async () => {
    try {
        await formRef.value?.validate();
        return true;
    } catch {
        return false;
    }
};

const testConnection = async (config: CloudStorageConfig) => {
    const normalizedConfig = normalizeCloudStorageConfigForConnectionTest(config);
    const result = await CloudBackupAPI.testStorageConnection(normalizedConfig);
    if (result.success) message.success(t('dataSync.connectionTestSuccess'));
    else message.error(result.error || t('dataSync.connectionTestFailed'));
};

const testDraftConnection = async () => {
    if (!(await validateForm())) return;
    loading.value.testDraft = true;
    try { await testConnection(toStorageConfig()); }
    catch (error) {
        console.error('测试存储连接失败:', error);
        message.error(t('dataSync.connectionTestFailed'));
    } finally { loading.value.testDraft = false; }
};

const testSavedConnection = async (config: CloudStorageConfig) => {
    testingStorageId.value = config.id;
    try { await testConnection(config); }
    catch (error) {
        console.error('测试存储连接失败:', error);
        message.error(t('dataSync.connectionTestFailed'));
    } finally { testingStorageId.value = ''; }
};

const saveConfig = async () => {
    if (!(await validateForm())) return;
    loading.value.saveConfig = true;
    try {
        const draft = toStorageConfig();
        const data = configForm.value.type === 'webdav'
            ? { name: draft.name, type: draft.type, enabled: draft.enabled, url: (draft as any).url, username: (draft as any).username, password: (draft as any).password }
            : { name: draft.name, type: draft.type, enabled: draft.enabled, path: (draft as any).path };
        const result = configForm.value.id
            ? await CloudBackupAPI.updateStorageConfig(configForm.value.id, data)
            : await CloudBackupAPI.addStorageConfig(data as any);
        if (!result.success) {
            message.error(result.error || t('dataSync.saveFailed'));
            return;
        }
        message.success(configForm.value.id ? t('dataSync.updateSuccess') : t('dataSync.addSuccess'));
        showConfigModal.value = false;
        await loadStorageConfigs();
        if (result.config?.enabled) cloudSyncService.scheduleSync('config-change', { storageId: result.config.id, delayMs: 0 });
    } catch (error) {
        console.error('保存存储配置失败:', error);
        message.error(t('dataSync.saveFailed'));
    } finally { loading.value.saveConfig = false; }
};

const deleteConfig = async (id: string) => {
    try {
        const result = await CloudBackupAPI.deleteStorageConfig(id);
        if (!result.success) return message.error(result.error || t('dataSync.deleteFailed'));
        message.success(t('dataSync.deleteSuccess'));
        await loadStorageConfigs();
    } catch (error) {
        console.error('删除存储配置失败:', error);
        message.error(t('dataSync.deleteFailed'));
    }
};

const syncCloudData = async (storageId: string, forceRetry = false) => {
    loading.value.syncNow = true;
    syncingStorageId.value = storageId;
    try {
        const result = await cloudSyncService.syncNow(storageId, {
            platform: PlatformDetector.getPlatform(), reason: 'manual', forceRetry
        });
        if (result.success) {
            message.success(getCloudSyncResultMessage(result.action, result.conflicts.length));
            for (const warning of result.warnings || []) message.warning(warning);
        } else message.error(showSyncErrorDetails(result, storageId).message);
    } catch (error) {
        console.error('云同步失败:', error);
        message.error(showSyncErrorDetails(error instanceof Error ? error.message : String(error), storageId).message);
    } finally {
        loading.value.syncNow = false;
        syncingStorageId.value = '';
    }
};

const showSyncErrorDetails = (error: string | CloudSyncResult | undefined, storageId: string) => {
    const diagnosis = getCloudSyncErrorDiagnosis(error, {
        storageId, reason: 'manual', status: 'error', timestamp: new Date().toISOString(),
    });
    syncErrorStorageId.value = storageId;
    syncErrorDiagnosis.value = diagnosis;
    syncErrorDialogVisible.value = true;
    return diagnosis;
};

const showCurrentSyncError = () => showSyncErrorDetails(
    syncStatus.value.lastResult || syncStatus.value.error,
    syncStatus.value.storageId || ''
);
const retrySyncFromDialog = async () => {
    const storageId = syncErrorStorageId.value;
    if (!storageId) return;
    syncErrorDialogVisible.value = false;
    await syncCloudData(storageId, true);
};
const copySyncErrorDetails = async () => {
    if (!syncErrorDiagnosis.value) return;
    try {
        await navigator.clipboard.writeText(syncErrorDiagnosis.value.copyText);
        message.success(t('dataSync.errorDetailsCopied'));
    } catch { message.error(t('dataSync.errorDetailsCopyFailed')); }
};

const saveAutoSyncEnabled = async (enabled: boolean) => {
    autoSyncEnabled.value = await cloudSyncService.setAutoSyncEnabled(enabled);
    message.success(enabled ? t('dataSync.autoSyncEnabled') : t('dataSync.autoSyncDisabled'));
};
const saveSyncInterval = async () => {
    loading.value.saveSyncInterval = true;
    try {
        syncIntervalMinutes.value = await cloudSyncService.setAutoSyncIntervalMinutes(syncIntervalMinutes.value);
        message.success(t('dataSync.syncIntervalSaved', { minutes: syncIntervalMinutes.value }));
    } catch (error) {
        console.error('保存自动同步频率失败:', error);
        message.error(t('dataSync.syncIntervalSaveFailed'));
    } finally { loading.value.saveSyncInterval = false; }
};

const checkICloudAvailability = async () => {
    if (!capabilities.icloud) {
        iCloudAvailability.value = { available: false, reason: t('dataSync.icloudUnsupported') };
        return;
    }
    try { iCloudAvailability.value = await CloudBackupAPI.checkICloudAvailability(); }
    catch { iCloudAvailability.value = { available: false, reason: t('dataSync.icloudCheckFailed') }; }
};
const loadStorageConfigs = async () => {
    try {
        storageConfigs.value = await CloudBackupAPI.getStorageConfigs();
    }
    catch (error) {
        console.error('加载存储配置失败:', error);
        message.error(t('dataSync.loadConfigsFailed'));
    }
};
const getConfigDescription = (config: CloudStorageConfig) => config.type === 'webdav'
    ? (config as any).url : `iCloud Drive - ${(config as any).path || 'AI-Gist-Backup'}`;
const formatDate = (value: string) => new Date(value).toLocaleString();

onMounted(async () => {
    unsubscribeSyncStatus = cloudSyncService.onStatusChange(status => { syncStatus.value = status; });
    [autoSyncEnabled.value, syncIntervalMinutes.value] = await Promise.all([
        cloudSyncService.getAutoSyncEnabled(), cloudSyncService.getAutoSyncIntervalMinutes(),
    ]);
    await Promise.all([loadStorageConfigs(), checkICloudAvailability()]);
});
onUnmounted(() => unsubscribeSyncStatus?.());
</script>

<style scoped>
.sync-error-action-list {
    margin: 0;
    padding-left: 20px;
    color: var(--content-secondary);
    font-size: 13px;
    line-height: 1.6;
}
</style>
