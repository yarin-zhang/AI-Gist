<template>
  <!-- 应用选择后同步还在跑：不能关、不能再改选择，只显示进度 -->
  <ion-modal :is-open="isOpen" class="m-sheet-modal" :breakpoints="[0, 0.92]" :initial-breakpoint="0.92"
    :can-dismiss="!applying" @didDismiss="emit('close')">
    <div class="m-sheet conflict-sheet">
      <div class="m-grab" aria-hidden="true" />
      <div class="conflict-sheet__bar">
        <button type="button" class="m-btn" :disabled="applying" @click="emit('close')">{{ t('common.cancel') }}</button>
        <h2 class="conflict-sheet__title">{{ t('syncConflict.title') }}</h2>
        <button type="button" class="m-save" :disabled="!pending || applying || (strategy === 'manual' && missingCount > 0)"
          @click="apply">
          <ion-spinner v-if="applying" name="crescent" class="conflict-sheet__spinner" aria-hidden="true" />
          <span>{{ t('syncConflict.apply') }}</span>
        </button>
      </div>

      <div v-if="applying" class="conflict-sheet__progress" role="status" aria-live="polite">
        <span>{{ t(progress.labelKey) }}</span>
        <span class="conflict-sheet__progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100"
          :aria-valuenow="progress.percent" :aria-valuetext="t(progress.labelKey)">
          <span class="conflict-sheet__progress-bar" :style="{ width: `${progress.percent}%` }" />
        </span>
      </div>

      <div v-if="pending" class="m-body conflict-sheet__body" :class="{ 'is-busy': applying }" :inert="applying || undefined">
        <p class="m-desc">{{ t('syncConflict.description') }}</p>
        <!-- 新增 / 修改 / 删除只数不冲突、会直接合并的改动，删除标记本身不算新增 (#489) -->
        <div class="conflict-sheet__stats">
          <span v-if="pending.items.length" class="m-pill m-pill-warn">{{ t('syncConflict.bothChanged', { count: pending.items.length }) }}</span>
          <span v-if="pending.summary.added" class="m-pill m-pill-ok">{{ t('syncConflict.added', { count: pending.summary.added }, pending.summary.added) }}</span>
          <span v-if="pending.summary.updated" class="m-pill m-pill-warn">{{ t('syncConflict.updated', { count: pending.summary.updated }, pending.summary.updated) }}</span>
          <span v-if="pending.summary.deleted" class="m-pill">{{ t('syncConflict.deleted', { count: pending.summary.deleted }, pending.summary.deleted) }}</span>
        </div>

        <section class="m-section">
          <div class="m-gt"><span>{{ t('syncConflict.strategyLabel') }}</span></div>
          <div class="m-group" role="radiogroup" :aria-label="t('syncConflict.strategyLabel')">
            <button v-for="option in strategyOptions" :key="option.value" type="button" class="m-row" role="radio"
              :aria-checked="strategy === option.value" @click="strategy = option.value">
              <span class="two">
                <span>{{ option.label }}<span v-if="option.badge" class="m-pill m-pill-blue conflict-sheet__badge">{{ option.badge }}</span></span>
                <span class="sub">{{ option.description }}</span>
              </span>
              <ion-icon v-if="strategy === option.value" :icon="checkmark" class="conflict-sheet__check" aria-hidden="true" />
            </button>
          </div>
        </section>

        <section v-if="strategy === 'manual'" class="m-section">
          <div class="m-gt">
            <span>{{ t('syncConflict.bothChanged', { count: pending.items.length }) }}</span>
            <button type="button" @click="chooseAll('local')">{{ t('syncConflict.chooseAllLocal') }}</button>
          </div>
          <div class="conflict-sheet__items">
            <div v-for="item in pending.items" :key="item.id" class="m-card conflict-sheet__item">
              <div class="conflict-sheet__item-head">
                <span class="conflict-sheet__item-name">{{ item.label }}</span>
                <span class="m-pill">{{ collectionLabel(item.collection) }}</span>
              </div>
              <!-- 两边在同一分钟内时显示到秒，并标出较新的一边 (#489) -->
              <div class="m-seg" role="radiogroup" :aria-label="item.label">
                <button v-for="side in SIDES" :key="side" type="button" role="radio" class="conflict-sheet__side"
                  :class="{ on: resolutions[item.id] === side }"
                  :aria-checked="resolutions[item.id] === side" @click="choose(item.id, side)">
                  <span class="conflict-sheet__side-name">
                    {{ side === 'local' ? t('syncConflict.localVersion') : t('syncConflict.remoteVersion') }}
                    <span v-if="isNewer(item, side)" class="m-pill m-pill-blue conflict-sheet__newer">{{ t('syncConflict.newer') }}</span>
                  </span>
                  <span class="conflict-sheet__side-time">{{ versionLabel(item, side) }}</span>
                </button>
              </div>
            </div>
          </div>
          <p v-if="missingCount" class="m-note conflict-sheet__missing">{{ t('syncConflict.missingChoices', { count: missingCount }) }}</p>
        </section>

        <p class="m-note">
          <ion-icon :icon="informationCircleOutline" aria-hidden="true" />
          <span>{{ t('syncConflict.statusDescription') }}</span>
        </p>
      </div>
      <div v-else class="m-body">
        <p class="m-desc">{{ t('syncConflict.nothingPending') }}</p>
      </div>
    </div>
  </ion-modal>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { IonIcon, IonModal, IonSpinner } from '@ionic/vue'
import { checkmark, informationCircleOutline } from 'ionicons/icons'
import type { CloudSyncConflictSide } from '@shared/cloud-sync-engine'
import { useI18n } from '~/composables/useI18n'
import {
  cloudSyncService,
  getCloudSyncErrorDiagnosis,
  getCloudSyncResultMessage,
  type CloudSyncConflictItem,
  type CloudSyncConflictStrategy,
  type CloudSyncPendingConflict
} from '~/lib/services/cloud-sync.service'
import { describeConflictVersionTimes } from '~/lib/utils/sync-conflict-versions'
import { describeSyncProgress } from '~/lib/utils/sync-progress'
import { presentMobileToast } from '~/lib/utils/mobile-toast'

const SIDES = ['local', 'remote'] as const

const props = defineProps<{
  isOpen: boolean
  storageId?: string
}>()

const emit = defineEmits<{
  close: []
  resolved: []
}>()

const { t, locale } = useI18n()
const pending = ref<CloudSyncPendingConflict | undefined>()
const strategy = ref<CloudSyncConflictStrategy>('smart')
const resolutions = ref<Record<string, CloudSyncConflictSide>>({})
const applying = ref(false)
const syncPhase = ref(cloudSyncService.getStatus().syncPhase)
const progress = computed(() => describeSyncProgress(syncPhase.value))
// 这次同步已经出结果：之后排队的自动同步不再推动进度条，免得关面板前又跳回第一步
let progressSettled = false
let unsubscribe: (() => void) | null = null

const refreshPending = () => {
  pending.value = cloudSyncService.getPendingConflict(props.storageId)
  const ids = new Set(pending.value?.items.map(item => item.id) || [])
  resolutions.value = Object.fromEntries(Object.entries(resolutions.value).filter(([id]) => ids.has(id)))
}

watch(() => props.isOpen, open => {
  if (!open) return
  strategy.value = 'smart'
  resolutions.value = {}
  refreshPending()
}, { immediate: true })

const strategyOptions = computed(() => [
  { value: 'smart' as const, label: t('syncConflict.smartMerge'), description: t('syncConflict.smartMergeDesc'), badge: t('syncConflict.recommended') },
  { value: 'local' as const, label: t('syncConflict.useLocal'), description: t('syncConflict.useLocalDesc'), badge: '' },
  { value: 'remote' as const, label: t('syncConflict.useRemote'), description: t('syncConflict.useRemoteDesc'), badge: '' },
  { value: 'manual' as const, label: t('syncConflict.manual'), description: t('syncConflict.manualDesc'), badge: '' },
])

const missingCount = computed(() => (pending.value?.items || []).filter(item => !resolutions.value[item.id]).length)

const KNOWN_COLLECTIONS = new Set([
  'prompts', 'categories', 'aiConfigs', 'promptVariables', 'promptHistories', 'quickOptimizationConfigs', 'aiHistory', 'settings'
])
const collectionLabel = (collection: string) => (
  KNOWN_COLLECTIONS.has(collection) ? t(`syncConflict.collections.${collection}`) : collection
)

// 每项两边的时间：同一分钟内显示到秒，并记下较新的一边（与桌面端冲突弹窗一致）
const versionTimes = computed(() => Object.fromEntries(
  (pending.value?.items || []).map(item => [item.id, describeConflictVersionTimes(item, String(locale.value))])
))

const versionLabel = (item: CloudSyncConflictItem, side: CloudSyncConflictSide) => {
  const time = versionTimes.value[item.id]?.[side]
  if (side === 'local' ? item.localDeleted : item.remoteDeleted) {
    return time ? t('syncConflict.deletedAtTime', { time }) : t('syncConflict.deletedVersion')
  }
  return time || t('syncConflict.unknownTime')
}

const isNewer = (item: CloudSyncConflictItem, side: CloudSyncConflictSide) => versionTimes.value[item.id]?.newer === side

const choose = (id: string, side: CloudSyncConflictSide) => {
  resolutions.value = { ...resolutions.value, [id]: side }
}

const chooseAll = (side: CloudSyncConflictSide) => {
  resolutions.value = Object.fromEntries((pending.value?.items || []).map(item => [item.id, side]))
}

const apply = async () => {
  if (!pending.value || applying.value) return
  applying.value = true
  syncPhase.value = undefined
  progressSettled = false
  try {
    const result = await cloudSyncService.resolveConflicts(pending.value.storageId, {
      strategy: strategy.value,
      resolutions: strategy.value === 'manual' ? resolutions.value : undefined
    })
    progressSettled = true
    if (result.action === 'conflict-pending') {
      refreshPending()
      await presentMobileToast(t('syncConflict.changedMeanwhile'), 'warning')
      return
    }
    if (!result.success) {
      await presentMobileToast(getCloudSyncErrorDiagnosis(result, { storageId: pending.value.storageId, reason: 'manual', status: 'error' }).message, 'danger')
      return
    }
    await presentMobileToast(getCloudSyncResultMessage(result.action), 'success')
    emit('resolved')
    emit('close')
  } finally {
    applying.value = false
  }
}

onMounted(() => {
  unsubscribe = cloudSyncService.onStatusChange(status => {
    // 同步结束时状态里的步骤会清空：保留最后一步，不退回第一步
    if (!progressSettled && status.syncPhase) syncPhase.value = status.syncPhase
    if (props.isOpen && !applying.value) refreshPending()
  })
})
onUnmounted(() => unsubscribe?.())
</script>

<style scoped>
.conflict-sheet {
  height: 100%;
  overflow-y: auto;
}

.conflict-sheet__bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px 4px;
}

.conflict-sheet__title {
  flex: 1;
  margin: 0;
  color: var(--content-primary);
  font-size: var(--m-font-body);
  font-weight: 600;
  text-align: center;
}

.conflict-sheet__body {
  gap: 16px;
}

.conflict-sheet__stats {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0 6px;
}

.conflict-sheet__badge {
  margin-left: 6px;
  vertical-align: 1px;
}

.conflict-sheet__check {
  flex: none;
  color: var(--accent-primary);
  font-size: 20px;
}

.conflict-sheet__items {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.conflict-sheet__item {
  gap: 10px;
  padding: 14px;
}

.conflict-sheet__item-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.conflict-sheet__item-name {
  overflow: hidden;
  font-size: var(--m-font-body);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conflict-sheet__item .m-seg > button {
  height: auto;
  min-height: 44px;
  padding: 6px;
  font-size: var(--m-font-caption);
  line-height: 1.3;
}

.conflict-sheet__side {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
}

.conflict-sheet__side-name {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.conflict-sheet__newer {
  height: 18px;
  padding: 0 6px;
}

.conflict-sheet__side-time {
  color: var(--content-tertiary);
}

.conflict-sheet__missing {
  padding-top: 8px;
  color: var(--accent-warning);
}

.conflict-sheet__spinner {
  width: 16px;
  height: 16px;
  margin-right: 6px;
  color: currentColor;
}

.conflict-sheet__progress {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 20px 4px;
  color: var(--content-secondary);
  font-size: var(--m-font-sub);
}

.conflict-sheet__progress-track {
  display: block;
  overflow: hidden;
  height: 4px;
  border-radius: 999px;
  background: var(--surface-tertiary);
}

.conflict-sheet__progress-bar {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--accent-primary);
  transition: width 0.3s ease;
}

.conflict-sheet__body.is-busy {
  opacity: 0.5;
  pointer-events: none;
}
</style>
