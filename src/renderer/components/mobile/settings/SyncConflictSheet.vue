<template>
  <ion-modal :is-open="isOpen" class="m-sheet-modal" :breakpoints="[0, 0.92]" :initial-breakpoint="0.92"
    @didDismiss="emit('close')">
    <div class="m-sheet conflict-sheet">
      <div class="m-grab" aria-hidden="true" />
      <div class="conflict-sheet__bar">
        <button type="button" class="m-btn" @click="emit('close')">{{ t('common.cancel') }}</button>
        <h2 class="conflict-sheet__title">{{ t('syncConflict.title') }}</h2>
        <button type="button" class="m-save" :disabled="!pending || applying || (strategy === 'manual' && missingCount > 0)"
          @click="apply">{{ t('syncConflict.apply') }}</button>
      </div>

      <div v-if="pending" class="m-body conflict-sheet__body">
        <p class="m-desc">{{ t('syncConflict.description') }}</p>
        <div class="conflict-sheet__stats">
          <span v-if="pending.summary.added" class="m-pill m-pill-ok">{{ t('syncConflict.added', { count: pending.summary.added }) }}</span>
          <span v-if="pending.summary.updated" class="m-pill m-pill-warn">{{ t('syncConflict.updated', { count: pending.summary.updated }) }}</span>
          <span v-if="pending.summary.deleted" class="m-pill">{{ t('syncConflict.deleted', { count: pending.summary.deleted }) }}</span>
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
              <div class="m-seg" role="radiogroup" :aria-label="item.label">
                <button type="button" role="radio" :class="{ on: resolutions[item.id] === 'local' }"
                  :aria-checked="resolutions[item.id] === 'local'" @click="choose(item.id, 'local')">
                  {{ t('syncConflict.localVersion') }} · {{ versionLabel(item.localDeleted, item.localUpdatedAt) }}
                </button>
                <button type="button" role="radio" :class="{ on: resolutions[item.id] === 'remote' }"
                  :aria-checked="resolutions[item.id] === 'remote'" @click="choose(item.id, 'remote')">
                  {{ t('syncConflict.remoteVersion') }} · {{ versionLabel(item.remoteDeleted, item.remoteUpdatedAt) }}
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
import { IonIcon, IonModal } from '@ionic/vue'
import { checkmark, informationCircleOutline } from 'ionicons/icons'
import type { CloudSyncConflictSide } from '@shared/cloud-sync-engine'
import { useI18n } from '~/composables/useI18n'
import {
  cloudSyncService,
  getCloudSyncErrorDiagnosis,
  getCloudSyncResultMessage,
  type CloudSyncConflictStrategy,
  type CloudSyncPendingConflict
} from '~/lib/services/cloud-sync.service'
import { formatFriendlyDate } from '~/lib/utils/date'
import { presentMobileToast } from '~/lib/utils/mobile-toast'

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

const versionLabel = (deleted: boolean, updatedAt?: string) => {
  if (deleted) return t('syncConflict.deletedVersion')
  return updatedAt ? formatFriendlyDate(updatedAt, locale.value, { withTime: true }) : t('syncConflict.unknownTime')
}

const choose = (id: string, side: CloudSyncConflictSide) => {
  resolutions.value = { ...resolutions.value, [id]: side }
}

const chooseAll = (side: CloudSyncConflictSide) => {
  resolutions.value = Object.fromEntries((pending.value?.items || []).map(item => [item.id, side]))
}

const apply = async () => {
  if (!pending.value) return
  applying.value = true
  try {
    const result = await cloudSyncService.resolveConflicts(pending.value.storageId, {
      strategy: strategy.value,
      resolutions: strategy.value === 'manual' ? resolutions.value : undefined
    })
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
  unsubscribe = cloudSyncService.onStatusChange(() => {
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
  min-height: 36px;
  padding: 4px 6px;
  font-size: var(--m-font-caption);
  line-height: 1.3;
}

.conflict-sheet__missing {
  padding-top: 8px;
  color: var(--accent-warning);
}
</style>
