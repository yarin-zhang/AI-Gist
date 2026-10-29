<template>
    <div class="sync-settings">
        <section class="ui-panel sync-status"
            :class="[`sync-status--${statusAlertType}`, { 'sync-status--off': dataSyncStatusKind === 'notConfigured' }]">
            <span class="sync-status__icon" aria-hidden="true"><NIcon :size="20"><component :is="statusIcon" /></NIcon></span>
            <div class="sync-status__text">
                <span class="sync-status__title">{{ statusTitle }}</span>
                <span v-if="statusLine" class="sync-status__description">{{ statusLine }}</span>
                <span v-if="syncStatus.pendingChanges && dataSyncStatusKind !== 'notConfigured'" class="sync-status__description">{{ t('dataSync.pendingChanges') }}</span>
            </div>
            <!-- 窄窗口或长文案（意大利语等）时按钮整体换到第二行，不把左边的说明挤成一列 -->
            <div v-if="showErrorDetailsButton || dataSyncStatusKind === 'conflict' || primaryStorage" class="sync-status__actions">
                <NButton v-if="showErrorDetailsButton" quaternary @click="showCurrentSyncError">{{ t('dataSync.viewErrorDetails') }}</NButton>
                <NButton v-if="dataSyncStatusKind === 'conflict'" type="primary" @click="syncConflict.open(syncStatus.storageId)">{{ t('syncConflict.resolve') }}</NButton>
                <NButton v-if="primaryStorage" :loading="loading.syncNow" @click="syncCloudData(primaryStorage.id)">
                    <template #icon><NIcon><Refresh /></NIcon></template>{{ t('dataSync.syncNow') }}
                </NButton>
            </div>
        </section>

        <UiPanel :title="t('dataSync.storageConfiguration')" body="rows">
            <template #actions>
                <NButton size="tiny" @click="showAddConfigModal">
                    <template #icon><NIcon :size="12"><Plus /></NIcon></template>{{ t('dataSync.addStorageConfig') }}
                </NButton>
            </template>
            <UiSettingRow v-for="config in storageConfigs" :key="config.id">
                <template #title>
                    <span class="storage-title">
                        {{ config.name }}
                        <span v-if="config.name.trim().toLowerCase() !== storageTypeLabel(config).toLowerCase()" class="ui-tag ui-tag--line">
                            {{ storageTypeLabel(config) }}
                        </span>
                        <span class="ui-tag" :class="{ 'ui-tag--success': config.enabled }">
                            {{ config.enabled ? t('dataSync.enabled') : t('dataSync.disabled') }}
                        </span>
                    </span>
                </template>
                <template #description><span class="ui-mono storage-location">{{ getConfigDescription(config) }}</span></template>
                <span class="storage-actions">
                    <NButton :loading="testingStorageId === config.id" @click="testSavedConnection(config)">{{ t('dataSync.testConnection') }}</NButton>
                    <NButton @click="editConfig(config)">{{ t('dataSync.editConfig') }}</NButton>
                    <NDropdown trigger="click" placement="bottom-end" :options="storageActionOptions(config)"
                        @select="key => handleStorageAction(key, config)">
                        <NButton quaternary class="storage-actions__more" :aria-label="t('dataSync.storageActions')">
                            <template #icon><NIcon :size="16"><Dots /></NIcon></template>
                        </NButton>
                    </NDropdown>
                </span>
            </UiSettingRow>
            <div v-if="!storageConfigs.length" class="storage-empty">
                <span>{{ t('dataSync.noStorageConfig') }}</span>
                <span class="ui-help">{{ storageDescriptionText }}</span>
            </div>
        </UiPanel>

        <UiPanel :title="t('dataSync.advancedSettings')" body="rows">
            <UiSettingRow :title="t('dataSync.enableAutoSync')" :description="t('dataSync.autoSyncDescription')">
                <NSwitch v-model:value="autoSyncEnabled" :aria-label="t('dataSync.enableAutoSync')" @update:value="saveAutoSyncEnabled" />
            </UiSettingRow>
            <!-- 说明里写明允许的范围；超出范围时就地说明，不悄悄改成别的值 -->
            <UiSettingRow :title="t('dataSync.syncInterval')">
                <template #description>
                    {{ t('dataSync.syncIntervalDescription', { min: MIN_CLOUD_SYNC_INTERVAL_MINUTES, hours: MAX_CLOUD_SYNC_INTERVAL_MINUTES / 60 }) }}
                    <span v-if="syncIntervalError" id="sync-interval-error" class="sync-interval-error" role="alert">{{ syncIntervalError }}</span>
                </template>
                <NInputNumber v-model:value="syncIntervalMinutes" class="sync-interval" :show-button="false"
                    :status="syncIntervalError ? 'error' : undefined"
                    :input-props="{ 'aria-label': t('dataSync.syncInterval'), 'aria-invalid': Boolean(syncIntervalError), 'aria-describedby': syncIntervalError ? 'sync-interval-error' : undefined }"
                    @update:value="syncIntervalError = ''" @blur="saveSyncInterval" @keydown.enter="saveSyncInterval">
                    <template #suffix>{{ t('dataSync.minutes') }}</template>
                </NInputNumber>
            </UiSettingRow>
        </UiPanel>

        <UiModal :show="showConfigModal" width="var(--overlay-width-form)" :close-label="t('common.close')"
            :title="configForm.id ? t('dataSync.editStorageConfig') : t('dataSync.addStorageConfig')" @close="showConfigModal = false">
            <!-- 回车（含密码框）等同于点「保存」 -->
            <NForm ref="formRef" :model="configForm" :rules="formRules" label-placement="top" @keydown.enter="handleFormEnter">
                <p v-if="configForm.type === 'webdav'" class="sync-form-intro">{{ t('dataSync.webdavIntro') }}</p>
                <NFormItem v-if="capabilities.icloud" :label="t('dataSync.storageType')" path="type">
                    <UiSegmented :model-value="configForm.type" :label="t('dataSync.storageType')" :options="storageTypeOptions"
                        @update:model-value="value => { configForm.type = value; handleTypeChange() }" />
                </NFormItem>
                <NFormItem :label="t('dataSync.configName')" path="name">
                    <NInput v-model:value="configForm.name" :placeholder="t('dataSync.configNamePlaceholder')" />
                </NFormItem>
                <template v-if="configForm.type === 'webdav'">
                    <NFormItem :label="t('dataSync.serverUrl')" path="url" show-require-mark>
                        <div class="sync-form-field">
                            <NInput v-model:value="configForm.url" placeholder="https://dav.example.com/dav/" />
                            <span class="sync-form-help">{{ t('dataSync.serverUrlHelp') }}</span>
                        </div>
                    </NFormItem>
                    <div class="sync-form-grid">
                        <NFormItem :label="t('dataSync.username')" path="username" show-require-mark>
                            <NInput v-model:value="configForm.username" :placeholder="t('dataSync.usernamePlaceholder')" />
                        </NFormItem>
                        <NFormItem :label="t('dataSync.password')" path="password" show-require-mark>
                            <NInput v-model:value="configForm.password" type="password" show-password-on="click"
                                :placeholder="t('dataSync.passwordPlaceholder')" />
                        </NFormItem>
                    </div>
                    <p class="sync-form-help sync-form-help--block">{{ t('dataSync.passwordHelp') }}</p>
                </template>
                <template v-else>
                    <UiAlert v-if="iCloudAvailability && !iCloudAvailability.available" tone="warning" class="sync-form-alert">
                        {{ iCloudAvailability.reason }}
                    </UiAlert>
                    <NFormItem :label="t('dataSync.icloudPath')" path="path" show-require-mark>
                        <NInput v-model:value="configForm.path" placeholder="AI-Gist-Backup" />
                    </NFormItem>
                </template>
                <div class="sync-form-switch">
                    <span>{{ t('dataSync.enableConfig') }}</span>
                    <NSwitch v-model:value="configForm.enabled" :aria-label="t('dataSync.enableConfig')" />
                </div>
            </NForm>
            <!-- 测试结果留在弹窗里，用户对照着改表单，不靠几秒就消失的提示 -->
            <UiAlert v-if="draftTest.state === 'testing'" class="sync-form-result">{{ t('dataSync.connectionDiagnosis.testing') }}</UiAlert>
            <UiAlert v-else-if="draftTest.state === 'success'" tone="success" class="sync-form-result">
                {{ t('dataSync.connectionTestSuccess') }}
            </UiAlert>
            <UiAlert v-else-if="draftTest.diagnosis" tone="error" class="sync-form-result">
                <strong>{{ draftTest.diagnosis.title }}</strong> {{ draftTest.diagnosis.message }}
                <!-- 服务器原样返回的内容只在反馈问题时有用：默认折叠，说明和建议已经在上面 -->
                <details v-if="draftTest.diagnosis.detail" class="sync-form-result__detail">
                    <summary>{{ t('dataSync.technicalDetails') }}</summary>
                    {{ t('dataSync.connectionDiagnosis.detail', { detail: draftTest.diagnosis.detail }) }}
                </details>
            </UiAlert>
            <!-- 存储已经停用保存，只是读不到云端数据：留在弹窗里说明原因，改好后再点保存会重新读取 (#490) -->
            <UiAlert v-if="joinError" tone="error" class="sync-form-result">
                <strong>{{ joinError.title }}</strong> {{ joinError.message }}
            </UiAlert>
            <template #footer>
                <NButton @click="showConfigModal = false">{{ t('common.cancel') }}</NButton>
                <NButton @click="testDraftConnection" :loading="loading.testDraft" :disabled="!canUseICloudConfig">
                    {{ t('dataSync.testConnection') }}
                </NButton>
                <NButton type="primary" @click="saveConfig" :loading="loading.saveConfig" :disabled="!canUseICloudConfig || loading.testDraft">
                    {{ t('common.save') }}
                </NButton>
            </template>
        </UiModal>

        <!-- 第一次连上一个已有数据的存储：先说明两边会怎么合并，确认后才启用并开始同步 (#490) -->
        <UiModal :show="joinConfirm.visible" :close-label="t('common.close')" :title="t('dataSync.joinConfirm.title')"
            @close="settleJoinConfirm(false)">
            <div v-if="joinConfirm.preview" class="join-confirm">
                <p class="join-confirm__text">{{ t('dataSync.joinConfirm.description') }}</p>
                <div class="ui-panel join-confirm__panel">
                    <table class="join-confirm__table">
                        <thead>
                            <tr>
                                <td />
                                <th scope="col">{{ t('dataSync.joinConfirm.local') }}</th>
                                <th scope="col">{{ t('dataSync.joinConfirm.remote') }}</th>
                                <th scope="col">{{ t('dataSync.joinConfirm.merged') }}</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="row in joinRows" :key="row.key">
                                <th scope="row">{{ row.label }}</th>
                                <td>{{ row.local }}</td>
                                <td>{{ row.remote }}</td>
                                <td>{{ row.merged }}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <p v-if="joinCategoryLine" class="join-confirm__text">{{ joinCategoryLine }}</p>
                <p class="ui-help">{{ t('dataSync.joinConfirm.cancelHint') }}</p>
            </div>
            <template #footer>
                <NButton @click="settleJoinConfirm(false)">{{ t('dataSync.joinConfirm.cancel') }}</NButton>
                <NButton type="primary" @click="settleJoinConfirm(true)">{{ t('dataSync.joinConfirm.confirm') }}</NButton>
            </template>
        </UiModal>

        <UiModal :show="syncErrorDialogVisible" width="var(--overlay-width-form)" :close-label="t('common.close')"
            :title="t('dataSync.syncErrorDetails')" @close="syncErrorDialogVisible = false">
            <div v-if="syncErrorDiagnosis" class="sync-error">
                <UiAlert :tone="syncErrorDiagnosis.canAutoRetry ? 'warning' : 'error'">
                    <strong>{{ syncErrorDiagnosis.title }}</strong> {{ syncErrorDiagnosis.message }}
                </UiAlert>
                <div class="sync-error__actions">
                    <span class="sync-error__label">{{ t('dataSync.suggestedActions') }}</span>
                    <ul class="sync-error-action-list">
                        <li v-for="action in syncErrorDiagnosis.suggestedActions" :key="action">{{ action }}</li>
                    </ul>
                </div>
                <!-- 存储配置 ID、User-Agent 这类诊断信息只在反馈问题时有用：默认折叠，「复制」按钮复制的就是这一段 -->
                <details class="sync-error__tech">
                    <summary>{{ t('dataSync.technicalDetails') }}</summary>
                    <NInput :value="syncErrorDiagnosis.copyText" type="textarea" readonly class="sync-error__details"
                        :autosize="{ minRows: 6, maxRows: 12 }" />
                </details>
            </div>
            <template #footer>
                <NButton @click="syncErrorDialogVisible = false">{{ t('common.close') }}</NButton>
                <NButton @click="copySyncErrorDetails">
                    <template #icon><NIcon><Copy /></NIcon></template>{{ t('dataSync.indicatorCopyDetails') }}
                </NButton>
                <NButton type="primary" @click="retrySyncFromDialog" :loading="loading.syncNow" :disabled="!syncErrorStorageId">
                    {{ t('dataSync.retrySync') }}
                </NButton>
            </template>
        </UiModal>
    </div>
</template>

<script setup lang="ts">
import { computed, h, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { FormInst, FormRules } from 'naive-ui';
import {
    NButton, NDropdown, NForm, NFormItem, NIcon, NInput, NInputNumber, NSwitch, useDialog, useMessage,
} from 'naive-ui';
import { AlertCircle, AlertTriangle, CircleCheck, CloudOff, CloudUpload, Copy, Dots, Plus, Refresh, Trash } from '@vicons/tabler';
import UiAlert from '@/components/ui/UiAlert.vue';
import UiModal from '@/components/ui/UiModal.vue';
import UiPanel from '@/components/ui/UiPanel.vue';
import UiSegmented from '@/components/ui/UiSegmented.vue';
import UiSettingRow from '@/components/ui/UiSettingRow.vue';
import { CloudBackupAPI } from '@/lib/api/cloud-backup.api';
import {
    cloudSyncService,
    DEFAULT_CLOUD_SYNC_INTERVAL_MINUTES,
    MAX_CLOUD_SYNC_INTERVAL_MINUTES,
    MIN_CLOUD_SYNC_INTERVAL_MINUTES,
    getCloudStorageConnectionDiagnosis,
    getCloudSyncErrorDiagnosis,
    getCloudSyncResultMessage,
} from '@/lib/services/cloud-sync.service';
import type {
    CloudStorageConnectionDiagnosis, CloudSyncJoinPreview, CloudSyncResult, CloudSyncStatus,
} from '@/lib/services/cloud-sync.service';
import {
    getCloudSyncJoinCategoryLine,
    getCloudSyncJoinRows,
} from '@/lib/utils/cloud-sync-merge-notices';
import { PlatformDetector } from '@shared/platform';
import type { CloudStorageConfig } from '@shared/types/cloud-backup';
import {
    createCloudStorageConfigForConnectionTest,
    normalizeCloudStorageConfigForConnectionTest,
} from '@/lib/utils/cloud-storage-config';
import { formatFriendlyDate } from '@/lib/utils/date';
import type { DataSyncStatusKind } from '@/lib/utils/data-sync-status';
import {
    createDataSyncStatusInput,
    getDataSyncErrorSource,
    resolveDataSyncAlertType,
    resolveDataSyncStatusKind,
} from '@/lib/utils/data-sync-status';
import { useSyncConflict } from '@/composables/useSyncConflict';

const { t, locale } = useI18n();
const message = useMessage();
const dialog = useDialog();
const capabilities = PlatformDetector.getCapabilities();
const syncConflict = useSyncConflict();
// 和状态栏、备份列表一样用跟随界面语言的友好时间（今天 14:28 / Today 14:28）
const formatSyncTime = (value: string) => formatFriendlyDate(value, locale.value, { withTime: true });

const storageConfigs = ref<CloudStorageConfig[]>([]);
const syncStatus = ref<CloudSyncStatus>(cloudSyncService.getStatus());
const syncIntervalMinutes = ref<number | null>(DEFAULT_CLOUD_SYNC_INTERVAL_MINUTES);
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
// 弹窗里「测试连接」的结果；改了连接相关的字段就作废
const draftTest = ref<{ state: 'idle' | 'testing' | 'success' | 'error'; diagnosis?: CloudStorageConnectionDiagnosis }>({ state: 'idle' });
let draftTestRun = 0;
// 第一次加入同步前的确认框；保存时读不到云端数据的原因
const joinConfirm = ref<{ visible: boolean; preview: CloudSyncJoinPreview | null }>({ visible: false, preview: null });
const joinError = ref<{ title: string; message: string } | null>(null);
let settleJoin: ((confirmed: boolean) => void) | null = null;
let unsubscribeSyncStatus: (() => void) | null = null;

const configForm = ref({
    id: '', name: '', type: 'webdav' as 'webdav' | 'icloud', enabled: true,
    url: '', username: '', password: '', path: 'AI-Gist-Backup',
});

// 没有协议的地址（nas.local）请求时只会得到 Invalid URL，在表单里先拦下来
const isHttpUrl = (value: string) => {
    if (!/^https?:\/\/[^\s/]/i.test(value)) return false;
    try {
        return Boolean(new URL(value).host);
    } catch {
        return false;
    }
};

const formRules: FormRules = {
    name: { required: true, message: () => t('dataSync.configNameRequired'), trigger: 'blur' },
    url: {
        trigger: 'blur',
        validator: (_rule, value) => {
            if (configForm.value.type !== 'webdav') return true;
            const url = String(value || '').trim();
            if (!url) return new Error(t('dataSync.serverUrlRequired'));
            return isHttpUrl(url) ? true : new Error(t('dataSync.serverUrlInvalid'));
        },
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
const hasEnabledStorage = computed(() => storageConfigs.value.some(config => config.enabled));
// 同步失败时不要把原始技术错误（可能带内部 ID、堆栈片段）直接展示给用户，
// 统一通过诊断函数转成可读文案，并借助 canAutoRetry 区分"会自动恢复的临时
// 状况"（警告色）和"需要用户处理的错误"（错误色）。
const syncStatusDiagnosis = computed(() => getCloudSyncErrorDiagnosis(
    getDataSyncErrorSource(syncStatus.value),
    {
        storageId: syncStatus.value.storageId,
        reason: syncStatus.value.reason,
        status: syncStatus.value.status,
        failureCount: syncStatus.value.failureCount,
        timestamp: syncStatus.value.updatedAt,
    }
));
// 标题、说明和横幅颜色都来自同一个 kind（resolveDataSyncStatusKind），状态输入也和
// 窗口底部的状态栏用同一个 createDataSyncStatusInput 生成，不能各自维护一份 if/else：
// 之前两边对 pendingChanges 的处理不同，同步成功后状态栏说「已同步」、这里却说
// 「等待同步」(#425)。存储列表以本页刚加载的为准（只算已启用的存储）。
const dataSyncStatusKind = computed<DataSyncStatusKind>(() => resolveDataSyncStatusKind(createDataSyncStatusInput(syncStatus.value, {
    canAutoRetryError: syncStatusDiagnosis.value.canAutoRetry,
    quietError: syncStatusDiagnosis.value.quiet,
    autoSyncEnabled: autoSyncEnabled.value,
    hasStorageConfigs: hasEnabledStorage.value,
})));
const showErrorDetailsButton = computed(() =>
    dataSyncStatusKind.value === 'error' || dataSyncStatusKind.value === 'retryScheduled'
);
const statusAlertType = computed<'success' | 'info' | 'warning' | 'error'>(
    () => resolveDataSyncAlertType(dataSyncStatusKind.value, syncStatusDiagnosis.value.canAutoRetry)
);
const statusTitle = computed(() => {
    switch (dataSyncStatusKind.value) {
        case 'retryScheduled': return t('dataSync.statusRetryScheduled');
        case 'error': return syncStatusDiagnosis.value.title;
        case 'conflict': return t('syncConflict.statusTitle', { count: syncStatus.value.pendingConflict?.items.length || 0 });
        case 'paused': return t('dataSync.statusPaused');
        case 'syncing': return t('dataSync.statusSyncing');
        case 'pending': return t('dataSync.statusPending');
        case 'current': return t('dataSync.statusCurrent');
        case 'ready': return t('dataSync.statusReady');
        case 'notConfigured': return t('dataSync.statusNotConfigured');
    }
});
const statusDescription = computed(() => {
    switch (dataSyncStatusKind.value) {
        case 'notConfigured': return storageConfigs.value.length > 0
            ? t('dataSync.statusAllStoragesDisabledDescription')
            : t('dataSync.statusNotConfiguredDescription');
        // 诊断说明本身就写着「会自动重试」，这里只取原因（标题），重试时间说一次
        case 'retryScheduled': return t('dataSync.statusRetryScheduledDescription', {
            error: syncStatusDiagnosis.value.title,
            time: formatSyncTime(syncStatus.value.nextSyncAt!),
        });
        case 'error': return syncStatusDiagnosis.value.message;
        case 'conflict': return t('syncConflict.statusDescription');
        case 'paused': return t('dataSync.statusPausedDescription');
        case 'syncing': return t('dataSync.statusSyncingDescription');
        // 正常状态标题已经说清楚了，只补上次同步时间
        default: return '';
    }
});

const statusLine = computed(() => [
    statusDescription.value,
    syncStatus.value.lastSyncAt && dataSyncStatusKind.value !== 'notConfigured'
        ? t('dataSync.lastSyncAt', { time: formatSyncTime(syncStatus.value.lastSyncAt) })
        : '',
].filter(Boolean).join(' · '));

// 没开同步时不用「刷新」图标，免得看起来像正在排队同步
const statusIcon = computed(() => dataSyncStatusKind.value === 'notConfigured' ? CloudOff : ({
    success: CircleCheck, info: Refresh, warning: AlertTriangle, error: AlertCircle,
})[statusAlertType.value]);
// 状态卡片上的「立即同步」用当前同步中的存储，没有时用第一个已启用的存储
const primaryStorage = computed(() => storageConfigs.value.find(config => config.id === syncStatus.value.storageId && config.enabled)
    || storageConfigs.value.find(config => config.enabled));
const storageTypeOptions = computed(() => [
    { value: 'webdav' as const, label: 'WebDAV' },
    { value: 'icloud' as const, label: 'iCloud Drive' },
]);
const storageTypeLabel = (config: CloudStorageConfig) => config.type === 'webdav' ? 'WebDAV' : 'iCloud';

const getAutoGeneratedName = () => {
    const baseName = configForm.value.type === 'webdav' ? 'WebDAV' : 'iCloud Drive';
    const count = storageConfigs.value.filter(config => config.type === configForm.value.type && config.name.startsWith(baseName)).length;
    return count === 0 ? baseName : `${baseName} ${count + 1}`;
};

// 名称没被用户改过时跟着服务器地址走（坚果云、nas.example.com），
// 列表里才分得清是哪个存储，不再是一排「WebDAV」(#448)
let autoConfigName = '';
const getNameFromServerUrl = (url: string) => {
    if (!isHttpUrl(url.trim())) return '';
    const host = new URL(url.trim()).hostname;
    return /(^|\.)jianguoyun\.com$/i.test(host) ? t('dataSync.jianguoyunName') : host;
};
const applyAutoConfigName = (name: string) => {
    configForm.value.name = name;
    autoConfigName = name;
};
watch(() => configForm.value.url, url => {
    if (configForm.value.id || configForm.value.type !== 'webdav') return;
    if (configForm.value.name.trim() && configForm.value.name !== autoConfigName) return;
    applyAutoConfigName(getNameFromServerUrl(url) || getAutoGeneratedName());
});

const resetConfigForm = () => {
    configForm.value = {
        id: '', name: '', type: 'webdav', enabled: true,
        url: '', username: '', password: '', path: 'AI-Gist-Backup',
    };
    applyAutoConfigName(getAutoGeneratedName());
};

const resetDraftTest = () => {
    draftTestRun += 1;
    draftTest.value = { state: 'idle' };
    joinError.value = null;
};

const showAddConfigModal = () => {
    resetConfigForm();
    resetDraftTest();
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
    resetDraftTest();
    showConfigModal.value = true;
};

// 测试结果只对测试时的地址和账号成立
watch(
    () => [configForm.value.type, configForm.value.url, configForm.value.username, configForm.value.password, configForm.value.path],
    () => { if (draftTest.value.state !== 'idle' || joinError.value) resetDraftTest(); },
);

const handleTypeChange = () => {
    if (configForm.value.type === 'icloud' && !configForm.value.path.trim()) configForm.value.path = 'AI-Gist-Backup';
    if (!configForm.value.id) applyAutoConfigName(getAutoGeneratedName());
};

const handleFormEnter = (event: KeyboardEvent) => {
    // 输入法组字时的回车只是确认候选词；开关、分段这类控件上的回车也不算提交
    if (event.isComposing || !(event.target instanceof HTMLInputElement)) return;
    event.preventDefault();
    if (loading.value.saveConfig || loading.value.testDraft || !canUseICloudConfig.value) return;
    void saveConfig();
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

/** 成功返回 null；失败时把服务器原样返回的技术错误翻译成用户能看懂的原因 */
const testConnection = async (config: CloudStorageConfig): Promise<CloudStorageConnectionDiagnosis | null> => {
    try {
        const result = await CloudBackupAPI.testStorageConnection(normalizeCloudStorageConfigForConnectionTest(config));
        return result.success ? null : getCloudStorageConnectionDiagnosis(result.error);
    } catch (error) {
        console.error('测试存储连接失败:', error);
        return getCloudStorageConnectionDiagnosis(error instanceof Error ? error.message : String(error));
    }
};

const testDraftConnection = async () => {
    if (!(await validateForm())) return;
    const run = ++draftTestRun;
    loading.value.testDraft = true;
    draftTest.value = { state: 'testing' };
    try {
        const diagnosis = await testConnection(toStorageConfig());
        // 测试期间改了地址或账号，这个结果已经不对应当前表单
        if (run !== draftTestRun) return;
        draftTest.value = diagnosis ? { state: 'error', diagnosis } : { state: 'success' };
    } finally { loading.value.testDraft = false; }
};

const testSavedConnection = async (config: CloudStorageConfig) => {
    testingStorageId.value = config.id;
    try {
        const diagnosis = await testConnection(config);
        if (!diagnosis) message.success(t('dataSync.connectionTestSuccess'));
        else message.error(`${diagnosis.title} · ${diagnosis.message}`);
    } finally { testingStorageId.value = ''; }
};

const saveConfig = async () => {
    if (!(await validateForm())) return;
    loading.value.saveConfig = true;
    joinError.value = null;
    try {
        const draft = toStorageConfig();
        const data = configForm.value.type === 'webdav'
            ? { name: draft.name, type: draft.type, enabled: draft.enabled, url: (draft as any).url, username: (draft as any).username, password: (draft as any).password }
            : { name: draft.name, type: draft.type, enabled: draft.enabled, path: (draft as any).path };
        const editingId = configForm.value.id;
        // 本机还没和这个存储同步过：先停用保存，看过两边的数据（需要时问过用户）再启用，
        // 免得自动同步抢在用户确认之前就把两边合并 (#490)
        const joining = data.enabled && !(editingId && await cloudSyncService.hasSyncedWithStorage(editingId));
        const payload = joining ? { ...data, enabled: false } : data;
        const result = editingId
            ? await CloudBackupAPI.updateStorageConfig(editingId, payload)
            : await CloudBackupAPI.addStorageConfig(payload as any);
        if (!result.success) {
            reportStorageSaveFailure(result);
            return;
        }
        // 地址、账号或密码改过之后，之前记下的失败不再作数
        if (result.config) cloudSyncService.resetStorageFailureState(result.config.id);
        if (joining && result.config) {
            // 已经存下了：之后再点保存是更新这一条，不会重复添加
            configForm.value.id = result.config.id;
            await joinStorage(result.config.id, !editingId);
            return;
        }
        message.success(editingId ? t('dataSync.updateSuccess') : t('dataSync.addSuccess'));
        showConfigModal.value = false;
        await loadStorageConfigs();
        // 启用的存储随后按新配置真正连接一次
        if (result.config?.enabled) cloudSyncService.scheduleSync('config-change', { storageId: result.config.id, delayMs: 0 });
    } catch (error) {
        console.error('保存存储配置失败:', error);
        message.error(t('dataSync.saveFailed'));
    } finally { loading.value.saveConfig = false; }
};

const askJoinConfirm = (preview: CloudSyncJoinPreview) => new Promise<boolean>(resolve => {
    settleJoin = resolve;
    joinConfirm.value = { visible: true, preview };
});
const settleJoinConfirm = (confirmed: boolean) => {
    joinConfirm.value = { ...joinConfirm.value, visible: false };
    const settle = settleJoin;
    settleJoin = null;
    settle?.(confirmed);
};
const joinRows = computed(() => joinConfirm.value.preview ? getCloudSyncJoinRows(joinConfirm.value.preview) : []);
const joinCategoryLine = computed(() => joinConfirm.value.preview ? getCloudSyncJoinCategoryLine(joinConfirm.value.preview) : '');

/**
 * 保存或启用存储失败。保存前都会先连一次存储：连不上时用「测试连接」同一套说明告诉用户怎么改，
 * 弹窗还开着就留在表单下面对照着改；其他原因（写配置文件失败等）用户处理不了，只说没保存成功。
 */
const reportStorageSaveFailure = (result: { error?: string; errorCode?: string }) => {
    console.warn('保存存储配置失败:', result.error);
    if (result.errorCode !== 'CONNECTION_FAILED') {
        message.error(t('dataSync.saveFailed'));
        return;
    }
    const diagnosis = getCloudStorageConnectionDiagnosis(result.error);
    if (showConfigModal.value) draftTest.value = { state: 'error', diagnosis };
    else message.error(diagnosis.message);
};

/**
 * 刚存下（停用状态）的存储：读两边的数据。本机和云端各有对方没有的提示词或分类时先问用户，
 * 确认后马上同步一次、结果就地提示，再启用；选「暂不同步」时存储保持停用。
 */
const joinStorage = async (storageId: string, isNew: boolean) => {
    let preview: CloudSyncJoinPreview;
    try {
        preview = await cloudSyncService.previewStorageJoin(storageId);
    } catch (error) {
        console.error('读取云端同步数据失败:', error);
        await loadStorageConfigs();
        const diagnosis = getCloudStorageConnectionDiagnosis(error instanceof Error ? error.message : String(error));
        joinError.value = {
            title: t('dataSync.joinConfirm.previewFailed', { error: diagnosis.title }),
            message: diagnosis.message,
        };
        return;
    }

    showConfigModal.value = false;
    if (preview.needsConfirmation) {
        if (!(await askJoinConfirm(preview))) {
            await loadStorageConfigs();
            message.info(t('dataSync.joinConfirm.savedDisabled'));
            return;
        }
        // 趁存储还停用着亲自跑第一次同步：自动同步不碰停用的存储，不会抢先合并，
        // 合并结果（含同名分类保留了哪一边）一定在这里提示出来
        await syncCloudData(storageId);
    }

    const enabled = await CloudBackupAPI.updateStorageConfig(storageId, { enabled: true });
    await loadStorageConfigs();
    if (!enabled.success) {
        reportStorageSaveFailure(enabled);
        return;
    }
    if (!preview.needsConfirmation) message.success(isNew ? t('dataSync.addSuccess') : t('dataSync.updateSuccess'));
    // 启用后按新配置再连接一次；确认过的那次同步跑在停用状态下，本机「有改动等待同步」的标记靠这一次清掉
    cloudSyncService.scheduleSync('config-change', { storageId, delayMs: 0 });
};

const deleteConfig = async (id: string) => {
    try {
        const result = await CloudBackupAPI.deleteStorageConfig(id);
        if (!result.success) {
            console.warn('删除存储配置失败:', result.error);
            return message.error(t('dataSync.deleteFailed'));
        }
        message.success(t('dataSync.deleteSuccess'));
        await loadStorageConfigs();
    } catch (error) {
        console.error('删除存储配置失败:', error);
        message.error(t('dataSync.deleteFailed'));
    }
};

// 删除是存储卡片里唯一的破坏性操作，移进"…"二级菜单是为了避免用户误触；
// 二次确认沿用之前 NPopconfirm 的文案，只是换成从下拉菜单触发的 dialog 确认。
const storageActionOptions = (config: CloudStorageConfig) => [
    {
        label: t('dataSync.syncNow'),
        key: 'sync',
        disabled: !config.enabled,
        icon: () => h(NIcon, { size: 16 }, { default: () => h(CloudUpload) }),
    },
    { type: 'divider', key: 'divider' },
    {
        label: t('common.delete'),
        key: 'delete',
        props: { class: 'is-danger' },
        icon: () => h(NIcon, { size: 16 }, { default: () => h(Trash) }),
    },
];
const handleStorageAction = (key: string, config: CloudStorageConfig) => {
    if (key === 'sync') {
        void syncCloudData(config.id);
        return;
    }
    if (key !== 'delete') return;
    // 删除只是让本机不再连接这个存储：标题写明是哪个存储，正文说清本机数据和云端文件都不会被删 (#446)
    dialog.warning({
        title: t('dataSync.deleteConfigTitle', { name: config.name }),
        content: t('dataSync.confirmDeleteConfig'),
        positiveText: t('dataSync.deleteConfigPositive'),
        negativeText: t('common.cancel'),
        onPositiveClick: () => deleteConfig(config.id),
    });
};

// 这里的入口（状态卡片、存储菜单、错误详情里的重新同步）都是用户亲手点的：
// 他多半刚处理过外部问题，总是真正连接一次，不返回上次记下的失败
const syncCloudData = async (storageId: string) => {
    loading.value.syncNow = true;
    syncingStorageId.value = storageId;
    try {
        const result = await cloudSyncService.syncNow(storageId, {
            platform: PlatformDetector.getPlatform(), reason: 'manual', forceRetry: true
        });
        if (result.action === 'conflict-pending') {
            message.warning(getCloudSyncResultMessage(result.action));
            syncConflict.open(storageId);
        } else if (result.success) {
            // 恢复了哪些记录、同名分类保留了哪一边等，由状态栏的 useCloudSyncResultNotices 统一提醒
            message.success(getCloudSyncResultMessage(result.action, result.conflicts.length));
        } else reportManualSyncFailure(result, storageId);
    } catch (error) {
        console.error('云同步失败:', error);
        reportManualSyncFailure(error instanceof Error ? error.message : String(error), storageId);
    } finally {
        loading.value.syncNow = false;
        syncingStorageId.value = '';
    }
};

// 同步被新的同步接替、临时状况这类应用自己会恢复的失败，只轻轻说一句稍后会再同步，不弹错误详情
const reportManualSyncFailure = (error: string | CloudSyncResult, storageId: string) => {
    const diagnosis = getCloudSyncErrorDiagnosis(error, { storageId, reason: 'manual', status: 'error' });
    if (diagnosis.quiet) message.info(t('dataSync.syncWillRetrySoon'));
    else message.error(showSyncErrorDetails(error, storageId).message);
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
    await syncCloudData(storageId);
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
let savedSyncInterval = DEFAULT_CLOUD_SYNC_INTERVAL_MINUTES;
const syncIntervalError = ref('');
/** 输入框里的值能不能保存：不能时返回提示，能时返回取整后的分钟数 */
const checkSyncInterval = (value: number | null): { minutes: number } | { error: string } => {
    if (value === null || !Number.isFinite(value)) {
        return { error: t('dataSync.syncIntervalRequired', { min: MIN_CLOUD_SYNC_INTERVAL_MINUTES, max: MAX_CLOUD_SYNC_INTERVAL_MINUTES }) };
    }
    const minutes = Math.round(value);
    if (minutes < MIN_CLOUD_SYNC_INTERVAL_MINUTES) return { error: t('dataSync.syncIntervalTooShort', { min: MIN_CLOUD_SYNC_INTERVAL_MINUTES }) };
    if (minutes > MAX_CLOUD_SYNC_INTERVAL_MINUTES) {
        return { error: t('dataSync.syncIntervalTooLong', { hours: MAX_CLOUD_SYNC_INTERVAL_MINUTES / 60, max: MAX_CLOUD_SYNC_INTERVAL_MINUTES }) };
    }
    return { minutes };
};
const saveSyncInterval = async () => {
    if (loading.value.saveSyncInterval) return;
    // 超出范围或清空：就地说明原因，保留用户填的值等他改，不悄悄改成 5 或 1440
    const checked = checkSyncInterval(syncIntervalMinutes.value);
    if ('error' in checked) {
        syncIntervalError.value = checked.error;
        return;
    }
    syncIntervalError.value = '';
    syncIntervalMinutes.value = checked.minutes;
    // 失焦和回车都会触发，值没变就不重复保存
    if (checked.minutes === savedSyncInterval) return;
    loading.value.saveSyncInterval = true;
    try {
        syncIntervalMinutes.value = await cloudSyncService.setAutoSyncIntervalMinutes(checked.minutes);
        savedSyncInterval = syncIntervalMinutes.value;
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
        // 添加、停用或删除存储后状态栏要立刻跟上：删掉最后一个存储就显示「未开启同步」
        await cloudSyncService.refreshStorageAvailability(storageConfigs.value);
    }
    catch (error) {
        console.error('加载存储配置失败:', error);
        message.error(t('dataSync.loadConfigsFailed'));
    }
};
const getConfigDescription = (config: CloudStorageConfig) => config.type === 'webdav'
    ? (config as any).url : `iCloud Drive - ${(config as any).path || 'AI-Gist-Backup'}`;

onMounted(async () => {
    unsubscribeSyncStatus = cloudSyncService.onStatusChange(status => { syncStatus.value = status; });
    [autoSyncEnabled.value, syncIntervalMinutes.value] = await Promise.all([
        cloudSyncService.getAutoSyncEnabled(), cloudSyncService.getAutoSyncIntervalMinutes(),
    ]);
    savedSyncInterval = syncIntervalMinutes.value;
    await Promise.all([loadStorageConfigs(), checkICloudAvailability()]);
});
onUnmounted(() => unsubscribeSyncStatus?.());
</script>

<style scoped>
.sync-settings {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.sync-status {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
}

.sync-status__icon {
    display: grid;
    flex: none;
    place-items: center;
    width: 36px;
    height: 36px;
    border-radius: var(--radius-panel);
    background: var(--accent-soft);
    color: var(--accent-primary);
}

.sync-status--off .sync-status__icon {
    background: var(--surface-tertiary);
    color: var(--content-secondary);
}

.sync-status--success .sync-status__icon {
    background: var(--accent-success-bg);
    color: var(--accent-success);
}

.sync-status--warning .sync-status__icon {
    background: var(--accent-warning-bg);
    color: var(--accent-warning);
}

.sync-status--error .sync-status__icon {
    background: var(--accent-error-bg);
    color: var(--accent-error);
}

.sync-status__text {
    display: flex;
    flex: 1 1 240px;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
}

/* 放不下时整组按钮换到下一行并靠右，说明文字保持可读的宽度 */
.sync-status__actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
    margin-left: auto;
}

.sync-status__title {
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-medium);
}

.sync-status__description {
    color: var(--content-tertiary);
    font-size: var(--font-size-xs);
}

.storage-title {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
}

.storage-location {
    font-size: var(--font-size-xs);
    overflow-wrap: anywhere;
}

.storage-actions {
    display: inline-flex;
    gap: 4px;
}

.storage-actions__more {
    width: 28px;
    padding: 0;
}

.storage-empty {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 20px 0;
    color: var(--content-secondary);
    font-size: var(--font-size-sm);
    text-align: center;
}

.sync-interval {
    width: 120px;
}

.sync-interval-error {
    display: block;
    margin-top: 2px;
    color: var(--accent-error);
    font-size: var(--font-size-xs);
}

.sync-form-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
}

.sync-form-alert {
    margin-bottom: 16px;
}

.sync-form-intro {
    margin: 0 0 16px;
    color: var(--content-secondary);
    font-size: var(--font-size-sm);
    line-height: var(--line-height-normal);
}

.sync-form-field {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
}

.sync-form-help {
    color: var(--content-tertiary);
    font-size: var(--font-size-xs);
    overflow-wrap: anywhere;
}

.sync-form-help--block {
    margin: -8px 0 16px;
}

.sync-form-switch {
    display: flex;
    align-items: center;
    justify-content: space-between;
    color: var(--content-primary);
    font-size: var(--font-size-sm);
}

.sync-form-result {
    margin-top: 16px;
}

.sync-form-result__detail {
    display: block;
    margin-top: 4px;
    color: var(--content-secondary);
    font-size: var(--font-size-xs);
    overflow-wrap: anywhere;
}

.sync-form-result__detail summary {
    width: fit-content;
    cursor: pointer;
}

.sync-form-result__detail summary:focus-visible {
    border-radius: var(--radius-control);
    outline: 2px solid var(--accent-primary);
    outline-offset: 1px;
}

.join-confirm {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.join-confirm__text {
    margin: 0;
    color: var(--content-primary);
    font-size: var(--font-size-base);
    line-height: var(--line-height-normal);
}

.join-confirm__panel {
    overflow: hidden;
}

.join-confirm__table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--font-size-base);
}

.join-confirm__table thead :is(th, td) {
    height: 34px;
    padding: 0 12px;
    border-bottom: 1px solid var(--border-default);
    background: var(--surface-secondary);
    color: var(--content-secondary);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
}

.join-confirm__table tbody :is(th, td) {
    height: 40px;
    padding: 0 12px;
    border-bottom: 1px solid var(--border-subtle);
}

.join-confirm__table tbody tr:last-child :is(th, td) {
    border-bottom: 0;
}

/* 名称列占满剩下的宽度，数字列按内容收紧、表头不折行 */
.join-confirm__table th[scope='row'],
.join-confirm__table thead td {
    width: 100%;
    color: var(--content-primary);
    font-weight: var(--font-weight-medium);
    text-align: left;
}

.join-confirm__table th[scope='col'],
.join-confirm__table tbody td {
    font-variant-numeric: tabular-nums;
    text-align: right;
    white-space: nowrap;
}

.sync-error {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.sync-error__actions {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.sync-error__label {
    color: var(--content-secondary);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
}

.sync-error__tech {
    color: var(--content-tertiary);
    font-size: var(--font-size-sm);
}

.sync-error__tech summary {
    width: fit-content;
    cursor: pointer;
}

.sync-error__tech summary:focus-visible {
    border-radius: var(--radius-control);
    outline: 2px solid var(--accent-primary);
    outline-offset: 1px;
}

.sync-error__tech[open] summary {
    margin-bottom: 8px;
}

.sync-error__details :deep(textarea) {
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
}

.sync-error-action-list {
    margin: 0;
    padding-left: 20px;
    color: var(--content-secondary);
    font-size: var(--font-size-sm);
    line-height: 1.6;
}
</style>
