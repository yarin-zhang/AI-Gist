<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { AlertTriangle, CircleCheck, Clock, CloudOff, Copy, Refresh, Settings, X } from '@vicons/tabler';
import {
  cloudSyncService,
  getCloudSyncErrorDiagnosis,
  getCloudSyncResultMessage
} from '~/lib/services/cloud-sync.service';
import type { CloudSyncStatus } from '~/lib/services/cloud-sync.service';
import { formatDateTime } from '~/lib/utils/date';

const { t } = useI18n();
const status = ref<CloudSyncStatus>(cloudSyncService.getStatus());
const tooltipVisible = ref(false);
const detailPanelVisible = ref(false);
const copyState = ref<'idle' | 'copied' | 'failed'>('idle');
let unsubscribe: (() => void) | null = null;
let copyStateTimer: ReturnType<typeof setTimeout> | null = null;

const emit = defineEmits<{
  activate: [];
}>();

const rawErrorText = computed(() => status.value.error || status.value.lastResult?.error || '');

const hasErrorDetail = computed(() => status.value.status === 'error' && !!rawErrorText.value);

const errorDiagnosis = computed(() => getCloudSyncErrorDiagnosis(rawErrorText.value, {
  storageId: status.value.storageId,
  reason: status.value.reason,
  status: status.value.status,
  failureCount: status.value.failureCount,
  timestamp: status.value.updatedAt
}));

// 网络波动、同步任务被更新的世代取代等"可以自动恢复"的状况，不应该用刺眼的
// 错误红色呈现——它们会自动重试，用户通常无需介入。只有诊断判定为不可自动
// 重试的情况，才是真正需要用户查看并处理的错误。
const isAttentionWorthy = computed(() => hasErrorDetail.value && errorDiagnosis.value.canAutoRetry);

const visualState = computed(() => {
  if (status.value.status === 'syncing') return 'syncing';
  if (status.value.status === 'error' && status.value.pending && status.value.nextSyncAt) return 'scheduled';
  if (status.value.status === 'error' && isAttentionWorthy.value) return 'attention';
  if (status.value.status === 'error') return 'error';
  if (status.value.status === 'scheduled' && status.value.pendingChanges) return 'scheduled';
  if (status.value.lastResult?.success || status.value.lastSyncAt) return 'success';
  if (status.value.status === 'scheduled') return 'scheduled';
  return 'idle';
});

const statusIcon = computed(() => {
  if (visualState.value === 'syncing') return Refresh;
  if (visualState.value === 'scheduled') return Clock;
  if (visualState.value === 'attention') return Clock;
  if (visualState.value === 'error') return AlertTriangle;
  if (visualState.value === 'success') return CircleCheck;
  return CloudOff;
});

const primaryText = computed(() => {
  if (status.value.status === 'syncing') return t('dataSync.statusSyncing');
  if (status.value.status === 'error' && status.value.pending && status.value.nextSyncAt) return t('dataSync.statusRetryScheduled');
  if (status.value.status === 'error') return errorDiagnosis.value.title;
  if (visualState.value === 'scheduled') return t('dataSync.indicatorWaitingNextSync');
  if (visualState.value === 'success') return t('dataSync.indicatorSyncNormal');
  return t('dataSync.indicatorIdle');
});

const detailText = computed(() => {
  if (status.value.status === 'error') {
    return errorDiagnosis.value.message;
  }

  if (visualState.value === 'success' && status.value.lastResult?.success) {
    return getCloudSyncResultMessage(status.value.lastResult.action);
  }

  if (visualState.value === 'success') {
    return t('dataSync.indicatorSyncedDetail');
  }

  if (visualState.value === 'scheduled') {
    return t('dataSync.indicatorScheduledDetail');
  }

  if (status.value.status === 'syncing') {
    return t('dataSync.statusSyncingDescription');
  }

  return t('dataSync.indicatorIdleDetail');
});

const nextSyncText = computed(() => {
  if (!status.value.nextSyncAt) return '';
  return t('dataSync.indicatorNextCheckAt', { time: formatDateTime(status.value.nextSyncAt) });
});

const lastSyncText = computed(() => {
  if (!status.value.lastSyncAt) return '';
  return t('dataSync.lastSyncAt', { time: formatDateTime(status.value.lastSyncAt) });
});

const ariaLabel = computed(() => {
  const action = hasErrorDetail.value ? t('dataSync.indicatorAriaViewError') : t('dataSync.indicatorAriaOpenSettings');
  return [primaryText.value, detailText.value, action].filter(Boolean).join('. ');
});

const showTooltip = () => {
  tooltipVisible.value = true;
};

const hideTooltip = () => {
  tooltipVisible.value = false;
};

const handleActivate = () => {
  if (hasErrorDetail.value) {
    detailPanelVisible.value = true;
    tooltipVisible.value = false;
    return;
  }

  emit('activate');
};

const closeDetailPanel = () => {
  detailPanelVisible.value = false;
};

const openSettings = () => {
  closeDetailPanel();
  emit('activate');
};

const retrySyncNow = async () => {
  const storageId = status.value.storageId;
  if (!storageId) {
    return;
  }

  closeDetailPanel();
  await cloudSyncService.syncNow(storageId, {
    reason: 'manual'
  });
};

const copyErrorDetails = async () => {
  try {
    await navigator.clipboard.writeText(errorDiagnosis.value.copyText);
    setCopyState('copied');
  } catch {
    setCopyState('failed');
  }
};

const setCopyState = (nextState: 'idle' | 'copied' | 'failed') => {
  copyState.value = nextState;
  if (copyStateTimer) {
    clearTimeout(copyStateTimer);
  }

  if (nextState !== 'idle') {
    copyStateTimer = setTimeout(() => {
      copyState.value = 'idle';
      copyStateTimer = null;
    }, 1800);
  }
};

onMounted(() => {
  unsubscribe = cloudSyncService.onStatusChange(nextStatus => {
    status.value = nextStatus;
    if (nextStatus.status !== 'error') {
      detailPanelVisible.value = false;
    }
  });
});

onUnmounted(() => {
  if (copyStateTimer) {
    clearTimeout(copyStateTimer);
  }
  unsubscribe?.();
});
</script>

<template>
  <div
    class="cloud-sync-indicator"
    @mouseenter="showTooltip"
    @mouseleave="hideTooltip"
  >
    <button
      class="cloud-sync-button"
      :class="`is-${visualState}`"
      type="button"
      :aria-label="ariaLabel"
      @click="handleActivate"
      @focus="showTooltip"
      @blur="hideTooltip"
    >
      <component
        :is="statusIcon"
        class="cloud-sync-icon"
        :class="{ 'is-spinning': visualState === 'syncing' }"
      />
    </button>

    <div
      v-show="tooltipVisible && !detailPanelVisible"
      class="cloud-sync-tooltip"
      role="status"
    >
      <strong>{{ primaryText }}</strong>
      <span>{{ detailText }}</span>
      <span v-if="hasErrorDetail">{{ t('dataSync.indicatorViewFullError') }}</span>
      <span v-if="nextSyncText">{{ nextSyncText }}</span>
      <span v-else-if="lastSyncText">{{ lastSyncText }}</span>
    </div>

    <div
      v-if="detailPanelVisible && hasErrorDetail"
      class="cloud-sync-detail-panel"
      role="dialog"
      aria-modal="false"
      :aria-label="t('dataSync.syncErrorDetails')"
      @click.stop
    >
      <div class="cloud-sync-detail-header">
        <div>
          <strong>{{ errorDiagnosis.title }}</strong>
          <span>{{ errorDiagnosis.message }}</span>
        </div>
        <button class="cloud-sync-panel-icon-button" type="button" :aria-label="t('common.close')" @click="closeDetailPanel">
          <X />
        </button>
      </div>

      <ul class="cloud-sync-actions-list">
        <li v-for="action in errorDiagnosis.suggestedActions" :key="action">{{ action }}</li>
      </ul>

      <pre class="cloud-sync-raw-error">{{ rawErrorText }}</pre>

      <div class="cloud-sync-detail-actions">
        <button class="cloud-sync-panel-button" type="button" @click="copyErrorDetails">
          <Copy />
          <span v-if="copyState === 'copied'">{{ t('dataSync.indicatorCopyCopied') }}</span>
          <span v-else-if="copyState === 'failed'">{{ t('dataSync.indicatorCopyFailed') }}</span>
          <span v-else>{{ t('dataSync.indicatorCopyDetails') }}</span>
        </button>
        <button
          class="cloud-sync-panel-button"
          type="button"
          :disabled="!status.storageId"
          @click="retrySyncNow"
        >
          <Refresh />
          <span>{{ t('common.retry') }}</span>
        </button>
        <button class="cloud-sync-panel-button" type="button" @click="openSettings">
          <Settings />
          <span>{{ t('settings.title') }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cloud-sync-indicator {
  position: relative;
  z-index: 20;
  display: inline-flex;
  height: 100%;
  align-items: center;
}

.cloud-sync-button {
  display: grid;
  width: 24px;
  height: 22px;
  box-sizing: border-box;
  flex: 0 0 24px;
  place-items: center;
  padding: 0;
  color: var(--content-secondary);
  line-height: 1;
  appearance: none;
  background: var(--surface-primary);
  border: 1px solid transparent;
  border-radius: var(--radius-control);
  cursor: pointer;
  transition: color 160ms ease, background-color 160ms ease;
}

.cloud-sync-button:hover,
.cloud-sync-button:focus-visible {
  border-color: var(--border-default);
  background: var(--surface-secondary);
  outline: none;
}

.cloud-sync-button.is-success {
  color: var(--accent-success);
}

.cloud-sync-button.is-scheduled {
  color: var(--accent-info);
}

.cloud-sync-button.is-syncing {
  color: var(--accent-warning);
}

.cloud-sync-button.is-error {
  color: var(--accent-error);
}

.cloud-sync-button.is-attention {
  color: var(--accent-warning);
}

.cloud-sync-icon {
  display: block;
  width: 15px;
  height: 15px;
}

.cloud-sync-icon.is-spinning {
  animation: cloud-sync-spin 900ms linear infinite;
}

.cloud-sync-tooltip {
  position: absolute;
  right: 0;
  bottom: calc(100% + 8px);
  display: flex;
  width: max-content;
  max-width: min(320px, calc(100vw - 32px));
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  color: var(--content-primary);
  font-size: 12px;
  line-height: 1.45;
  overflow-wrap: anywhere;
  background: var(--surface-primary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-panel);
  box-shadow: var(--shadow-popover);
  pointer-events: none;
}

.cloud-sync-tooltip strong {
  font-size: 13px;
  font-weight: 600;
}

.cloud-sync-detail-panel {
  position: absolute;
  right: 0;
  bottom: calc(100% + 8px);
  display: flex;
  width: min(380px, calc(100vw - 24px));
  max-height: min(520px, calc(100vh - 64px));
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  color: var(--content-primary);
  font-size: 12px;
  line-height: 1.5;
  background: var(--surface-primary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-panel);
  box-shadow: var(--shadow-popover);
}

.cloud-sync-detail-header {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  justify-content: space-between;
}

.cloud-sync-detail-header > div {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.cloud-sync-detail-header strong {
  font-size: 13px;
  font-weight: 600;
}

.cloud-sync-detail-header span {
  color: var(--content-secondary);
  overflow-wrap: anywhere;
}

.cloud-sync-panel-icon-button {
  display: grid;
  width: 24px;
  height: 24px;
  flex: 0 0 auto;
  place-items: center;
  color: var(--content-secondary);
  background: var(--surface-secondary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-control);
  cursor: pointer;
}

.cloud-sync-panel-icon-button:hover,
.cloud-sync-panel-icon-button:focus-visible {
  color: var(--content-primary);
  border-color: var(--border-strong);
  background: var(--surface-tertiary);
  outline: none;
}

.cloud-sync-panel-icon-button svg {
  width: 15px;
  height: 15px;
}

.cloud-sync-actions-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding-left: 18px;
  color: var(--content-secondary);
}

.cloud-sync-raw-error {
  min-height: 70px;
  max-height: 160px;
  margin: 0;
  padding: 9px;
  color: var(--content-primary);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  font-size: var(--font-size-xs);
  line-height: 1.45;
  white-space: pre-wrap;
  overflow: auto;
  overflow-wrap: anywhere;
  background: var(--surface-tertiary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-control);
}

.cloud-sync-detail-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.cloud-sync-panel-button {
  display: inline-flex;
  min-height: 28px;
  align-items: center;
  gap: 5px;
  padding: 0 9px;
  color: var(--content-primary);
  font-size: 12px;
  background: var(--surface-primary);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-control);
  cursor: pointer;
}

.cloud-sync-panel-button:hover,
.cloud-sync-panel-button:focus-visible {
  border-color: var(--border-strong);
  background: var(--surface-secondary);
  outline: none;
}

.cloud-sync-panel-button:disabled {
  color: var(--content-tertiary);
  cursor: not-allowed;
  background: var(--surface-secondary);
}

.cloud-sync-panel-button svg {
  width: 14px;
  height: 14px;
}

@keyframes cloud-sync-spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

</style>
