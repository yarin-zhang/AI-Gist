<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { Copy, Refresh, Settings, X } from '@vicons/tabler';
import {
  cloudSyncService,
  getCloudSyncErrorDiagnosis,
  getCloudSyncResultMessage
} from '~/lib/services/cloud-sync.service';
import type { CloudSyncStatus } from '~/lib/services/cloud-sync.service';
import { formatFriendlyDate, formatRelativeTime } from '~/lib/utils/date';
import { joinSentences } from '~/lib/utils/join-sentences';
import {
  createDataSyncStatusInput,
  getDataSyncErrorSource,
  resolveDataSyncStatusKind
} from '~/lib/utils/data-sync-status';
import { useSyncConflict } from '~/composables/useSyncConflict';

const { t, locale } = useI18n();
const syncConflict = useSyncConflict();
const status = ref<CloudSyncStatus>(cloudSyncService.getStatus());
const tooltipVisible = ref(false);
const detailPanelVisible = ref(false);
const copyState = ref<'idle' | 'copied' | 'failed'>('idle');
const now = ref(Date.now());
const rootRef = ref<HTMLElement | null>(null);
const buttonRef = ref<HTMLButtonElement | null>(null);
let unsubscribe: (() => void) | null = null;
let copyStateTimer: ReturnType<typeof setTimeout> | null = null;
let clockTimer: ReturnType<typeof setInterval> | null = null;

const emit = defineEmits<{
  activate: [];
}>();

const rawErrorText = computed(() => status.value.error || status.value.lastResult?.error || '');
// 和设置页、备份列表一样用跟随界面语言的友好时间（今天 14:28 / Today 14:28）
const formatSyncTime = (value: string) => formatFriendlyDate(value, locale.value, { withTime: true });

const errorDiagnosis = computed(() => getCloudSyncErrorDiagnosis(getDataSyncErrorSource(status.value), {
  storageId: status.value.storageId,
  reason: status.value.reason,
  status: status.value.status,
  failureCount: status.value.failureCount,
  timestamp: status.value.updatedAt
}));

// 和设置页的状态卡片用同一套判断（resolveDataSyncStatusKind），两处不会再一个说
// 「已同步」、一个说「等待同步」；没有启用的存储时固定显示「未开启同步」(#425)
const statusKind = computed(() => resolveDataSyncStatusKind(createDataSyncStatusInput(status.value, {
  canAutoRetryError: errorDiagnosis.value.canAutoRetry
})));

const hasErrorDetail = computed(() =>
  (statusKind.value === 'error' || statusKind.value === 'retryScheduled') && !!rawErrorText.value
);

const conflictCount = computed(() => status.value.pendingConflict?.items.length || 0);

// 网络波动、同步任务被更新的世代取代等"可以自动恢复"的状况，不应该用刺眼的
// 错误红色呈现——它们会自动重试，用户通常无需介入。只有诊断判定为不可自动
// 重试的情况，才是真正需要用户查看并处理的错误。
const visualState = computed(() => {
  switch (statusKind.value) {
    case 'notConfigured': return 'off';
    // 失败后安排了重试：和单纯「等待下次同步」分开，状态栏要看得出刚才没同步成功
    case 'retryScheduled': return 'retrying';
    case 'error': return errorDiagnosis.value.canAutoRetry ? 'attention' : 'error';
    case 'conflict': return 'conflict';
    case 'paused': return 'paused';
    case 'syncing': return 'syncing';
    case 'pending': return 'scheduled';
    case 'current': return 'success';
    default: return 'idle';
  }
});

// 状态栏只放一个状态点和一句短文字：已同步为绿、进行中或等待为橙、需要处理为红，没开同步不着色
const dotClass = computed(() => {
  if (visualState.value === 'success') return 'ui-dot--success';
  if (visualState.value === 'error') return 'ui-dot--error';
  if (visualState.value === 'idle' || visualState.value === 'off') return '';
  return 'ui-dot--warning';
});

const shortText = computed(() => {
  if (visualState.value === 'off') return t('dataSync.indicatorSyncOff');
  if (visualState.value === 'paused') return t('dataSync.statusPaused');
  if (visualState.value === 'syncing') return t('dataSync.indicatorShortSyncing');
  if (visualState.value === 'conflict') return t('syncConflict.shortStatus', { count: conflictCount.value });
  if (visualState.value === 'error' || visualState.value === 'attention') return t('dataSync.indicatorShortError');
  if (visualState.value === 'retrying') return t('dataSync.indicatorShortRetrying');
  if (visualState.value === 'scheduled') return t('dataSync.indicatorWaitingNextSync');
  if (visualState.value === 'success' && status.value.lastSyncAt) {
    return t('dataSync.indicatorShortSynced', {
      time: formatRelativeTime(status.value.lastSyncAt, locale.value, new Date(now.value))
    });
  }
  if (visualState.value === 'success') return t('dataSync.indicatorSyncNormal');
  return t('dataSync.indicatorIdle');
});

const primaryText = computed(() => {
  switch (statusKind.value) {
    case 'notConfigured': return t('dataSync.indicatorSyncOff');
    case 'paused': return t('dataSync.statusPaused');
    case 'syncing': return t('dataSync.statusSyncing');
    case 'conflict': return t('syncConflict.statusTitle', { count: conflictCount.value });
    case 'retryScheduled': return t('dataSync.statusRetryScheduled');
    case 'error': return errorDiagnosis.value.title;
    case 'pending': return t('dataSync.indicatorWaitingNextSync');
    case 'current': return t('dataSync.indicatorSyncNormal');
    default: return t('dataSync.indicatorIdle');
  }
});

const detailText = computed(() => {
  switch (statusKind.value) {
    case 'notConfigured': return t('dataSync.indicatorSyncOffDetail');
    case 'paused': return t('dataSync.statusPausedDescription');
    case 'conflict': return t('syncConflict.statusDescription');
    case 'retryScheduled':
    case 'error': return errorDiagnosis.value.message;
    case 'current': return status.value.lastResult?.success
      ? getCloudSyncResultMessage(status.value.lastResult.action)
      : t('dataSync.indicatorSyncedDetail');
    case 'pending': return t('dataSync.indicatorScheduledDetail');
    case 'syncing': return t('dataSync.statusSyncingDescription');
    default: return t('dataSync.indicatorIdleDetail');
  }
});

// 只有真的在等下一次检查（有本地变更、或失败后安排了重试）时才报下次检查时间
const nextSyncText = computed(() => {
  if (!status.value.nextSyncAt || (statusKind.value !== 'pending' && statusKind.value !== 'retryScheduled')) return '';
  return t('dataSync.indicatorNextCheckAt', { time: formatSyncTime(status.value.nextSyncAt) });
});

const lastSyncText = computed(() => {
  if (!status.value.lastSyncAt || statusKind.value === 'notConfigured') return '';
  return t('dataSync.lastSyncAt', { time: formatSyncTime(status.value.lastSyncAt) });
});

// 状态、说明、操作三句话接起来读；句末已经有标点的不再补「. 」
const ariaLabel = computed(() => {
  const action = hasErrorDetail.value ? t('dataSync.indicatorAriaViewError') : t('dataSync.indicatorAriaOpenSettings');
  return [primaryText.value, detailText.value, action]
    .filter(Boolean)
    .reduce((label, sentence) => joinSentences(label, sentence, String(locale.value)));
});

const showTooltip = () => {
  tooltipVisible.value = true;
};

const hideTooltip = () => {
  tooltipVisible.value = false;
};

const handleActivate = () => {
  // 有冲突待处理：直接打开冲突弹窗
  if (status.value.status === 'conflict') {
    tooltipVisible.value = false;
    syncConflict.open(status.value.storageId);
    return;
  }

  if (hasErrorDetail.value) {
    detailPanelVisible.value = !detailPanelVisible.value;
    tooltipVisible.value = false;
    return;
  }

  emit('activate');
};

const closeDetailPanel = (options: { restoreFocus?: boolean } = {}) => {
  if (!detailPanelVisible.value) return;
  detailPanelVisible.value = false;
  if (!options.restoreFocus) return;
  // 用键盘关掉浮层后焦点回到状态栏按钮；这次聚焦不再弹出悬停提示
  void nextTick(() => {
    buttonRef.value?.focus();
    tooltipVisible.value = false;
  });
};

// 错误详情浮层是非模态的：Esc 和点浮层外面都能关掉，不必去找右上角的小 × (#420)
const handleDocumentKeydown = (event: KeyboardEvent) => {
  if (event.key !== 'Escape' || event.isComposing || event.defaultPrevented) return;
  closeDetailPanel({ restoreFocus: true });
};

const handleDocumentPointerDown = (event: PointerEvent) => {
  if (rootRef.value?.contains(event.target as Node)) return;
  closeDetailPanel();
};

watch(detailPanelVisible, visible => {
  if (visible) {
    document.addEventListener('keydown', handleDocumentKeydown);
    document.addEventListener('pointerdown', handleDocumentPointerDown, true);
  } else {
    document.removeEventListener('keydown', handleDocumentKeydown);
    document.removeEventListener('pointerdown', handleDocumentPointerDown, true);
  }
});

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
  // 用户点「重试」通常是刚处理过外部问题（例如改了密码），必须真正连接一次，不能返回上次记下的失败
  await cloudSyncService.syncNow(storageId, {
    reason: 'manual',
    forceRetry: true
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
  clockTimer = setInterval(() => {
    now.value = Date.now();
  }, 30_000);
  unsubscribe = cloudSyncService.onStatusChange(nextStatus => {
    status.value = nextStatus;
    if (nextStatus.status !== 'error') {
      detailPanelVisible.value = false;
    }
  });
  // 状态栏是同步状态的常驻入口，启动时先确认有没有启用的存储
  void cloudSyncService.refreshStorageAvailability();
});

onUnmounted(() => {
  if (copyStateTimer) {
    clearTimeout(copyStateTimer);
  }
  if (clockTimer) {
    clearInterval(clockTimer);
  }
  document.removeEventListener('keydown', handleDocumentKeydown);
  document.removeEventListener('pointerdown', handleDocumentPointerDown, true);
  unsubscribe?.();
});
</script>

<template>
  <div
    ref="rootRef"
    class="cloud-sync-indicator"
    @mouseenter="showTooltip"
    @mouseleave="hideTooltip"
  >
    <button
      ref="buttonRef"
      class="cloud-sync-button"
      :class="`is-${visualState}`"
      type="button"
      :aria-label="ariaLabel"
      :aria-expanded="hasErrorDetail ? detailPanelVisible : undefined"
      @click="handleActivate"
      @focus="showTooltip"
      @blur="hideTooltip"
    >
      <span class="ui-dot" :class="dotClass" aria-hidden="true" />
      <span>{{ shortText }}</span>
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
        <button class="cloud-sync-panel-icon-button" type="button" :aria-label="t('common.close')"
          @click="closeDetailPanel({ restoreFocus: true })">
          <X />
        </button>
      </div>

      <ul class="cloud-sync-actions-list">
        <li v-for="action in errorDiagnosis.suggestedActions" :key="action">{{ action }}</li>
      </ul>

      <!-- 原始报错（带存储配置 ID 等）只在反馈问题时有用：默认折叠，「复制详情」复制完整诊断 -->
      <details class="cloud-sync-tech">
        <summary>{{ t('dataSync.technicalDetails') }}</summary>
        <pre class="cloud-sync-raw-error">{{ rawErrorText }}</pre>
      </details>

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
  display: inline-flex;
  height: 20px;
  align-items: center;
  gap: 6px;
  padding: 0 6px;
  margin-left: -6px;
  color: var(--content-secondary);
  font: inherit;
  font-size: var(--font-size-xs);
  line-height: 1;
  white-space: nowrap;
  appearance: none;
  background: transparent;
  border: 0;
  border-radius: 4px;
  cursor: pointer;
}

.cloud-sync-button:hover,
.cloud-sync-button:focus-visible {
  color: var(--content-primary);
  background: var(--surface-tertiary);
  outline: none;
}

.cloud-sync-tooltip {
  position: absolute;
  left: 0;
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
  left: 0;
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

.cloud-sync-tech {
  color: var(--content-tertiary);
}

.cloud-sync-tech summary {
  width: fit-content;
  cursor: pointer;
}

.cloud-sync-tech summary:focus-visible {
  border-radius: var(--radius-control);
  outline: 2px solid var(--accent-primary);
  outline-offset: 1px;
}

.cloud-sync-tech[open] summary {
  margin-bottom: 6px;
}

.cloud-sync-raw-error {
  min-height: 70px;
  max-height: 160px;
  margin: 0;
  padding: 9px;
  color: var(--content-primary);
  font-family: var(--font-family-mono);
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



</style>
