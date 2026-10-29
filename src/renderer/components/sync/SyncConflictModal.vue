<template>
  <UiModal :show="visible" width="var(--overlay-width-wizard)" :title="t('syncConflict.title')" :close-label="t('common.close')"
    @close="closeUnlessApplying">
    <!-- 应用选择后同步还在跑：不能关、不能再改选择，只显示进度 -->
    <div v-if="pending" class="conflict" :class="{ 'is-busy': applying }" :inert="applying || undefined">
      <div class="ui-alert ui-alert--warning">
        <NIcon :size="14" class="ui-alert__icon" aria-hidden="true"><AlertTriangle /></NIcon>
        <div class="conflict__alert">
          <span>{{ t('syncConflict.description') }}</span>
          <span class="conflict__counts">
            {{ t('syncConflict.localCounts', countParams(pending.localCounts)) }} · {{ t('syncConflict.remoteCounts', countParams(pending.remoteCounts)) }}
          </span>
        </div>
      </div>

      <!-- 统计写成完整的短句（云端新增了几条、两边都改过几项），不用「+」「~」这类符号。
           新增 / 修改 / 删除只数不冲突、会直接合并的改动；删除标记本身不算新增 (#489) -->
      <div class="conflict__stats">
        <span v-if="pending.items.length" class="ui-tag ui-tag--warning">{{ t('syncConflict.bothChanged', { count: pending.items.length }) }}</span>
        <span v-if="pending.summary.added" class="ui-tag ui-tag--success">{{ t('syncConflict.added', { count: pending.summary.added }, pending.summary.added) }}</span>
        <span v-if="pending.summary.updated" class="ui-tag">{{ t('syncConflict.updated', { count: pending.summary.updated }, pending.summary.updated) }}</span>
        <span v-if="pending.summary.deleted" class="ui-tag">{{ t('syncConflict.deleted', { count: pending.summary.deleted }, pending.summary.deleted) }}</span>
      </div>

      <UiChoiceCards v-model="strategy" :options="strategyOptions" :label="t('syncConflict.strategyLabel')" />

      <section v-if="strategy === 'manual'" class="ui-panel conflict__panel">
        <header class="conflict__panel-head">
          <span class="conflict__panel-title">{{ t('syncConflict.bothChanged', { count: pending.items.length }) }}</span>
          <span class="conflict__panel-actions">
            <NButton quaternary size="tiny" @click="chooseAll('local')">{{ t('syncConflict.chooseAllLocal') }}</NButton>
            <NButton quaternary size="tiny" @click="chooseAll('remote')">{{ t('syncConflict.chooseAllRemote') }}</NButton>
            <NButton quaternary size="tiny" @click="resolutions = {}">{{ t('syncConflict.clearChoices') }}</NButton>
          </span>
        </header>
        <div class="conflict__table-wrap">
          <table class="conflict__table">
            <thead>
              <tr>
                <th>{{ t('syncConflict.item') }}</th>
                <th>{{ t('syncConflict.localVersion') }}</th>
                <th>{{ t('syncConflict.remoteVersion') }}</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="(item, index) in pending.items" :key="item.id">
                <tr :class="{ 'is-expanded': expanded[item.id] }">
                  <td>
                    <span class="conflict__item">
                      <!-- 只看时间没法判断该留哪份：每项都能展开对照两边的标题、正文开头和分类等 (#447) -->
                      <NButton quaternary size="tiny" class="conflict__expand"
                        :aria-label="expanded[item.id] ? t('syncConflict.hideDifferences') : t('syncConflict.showDifferences')"
                        :aria-expanded="!!expanded[item.id]" :aria-controls="`conflict-preview-${index}`"
                        @click="toggleExpanded(item.id)">
                        <template #icon><NIcon :size="14"><ChevronDown v-if="expanded[item.id]" /><ChevronRight v-else /></NIcon></template>
                      </NButton>
                      <span class="conflict__item-text">
                        <span class="conflict__item-name">{{ item.label }}</span>
                        <span class="conflict__item-type">{{ collectionLabel(item.collection) }} · {{ reasonLabel(item.reason) }}</span>
                      </span>
                    </span>
                  </td>
                  <!-- 两边在同一分钟内时显示到秒，并标出较新的一边 (#489) -->
                  <td v-for="side in SIDES" :key="side">
                    <label class="conflict__choice">
                      <input type="radio" :name="item.id" :checked="resolutions[item.id] === side"
                        @change="resolutions = { ...resolutions, [item.id]: side }" />
                      <span>{{ versionLabel(item, side) }}</span>
                      <span v-if="isNewer(item, side)" class="ui-tag">{{ t('syncConflict.newer') }}</span>
                    </label>
                  </td>
                </tr>
                <tr v-if="expanded[item.id]" :id="`conflict-preview-${index}`" class="conflict__preview-row">
                  <td colspan="3">
                    <div class="conflict__compare">
                      <div v-for="side in comparisonSides(item)" :key="side.key" class="conflict__side">
                        <span class="conflict__side-label">{{ side.label }}</span>
                        <template v-if="side.preview">
                          <span class="conflict__side-title" :class="{ 'is-different': side.differs.title }">{{ side.preview.title || '—' }}</span>
                          <dl v-if="side.fields.length" class="conflict__fields">
                            <template v-for="field in side.fields" :key="field.key">
                              <dt>{{ field.label }}</dt>
                              <dd :class="{ 'is-different': field.differs }">{{ field.value || '—' }}</dd>
                            </template>
                          </dl>
                          <p v-if="side.preview.excerpt || side.differs.excerpt" class="conflict__excerpt"
                            :class="{ 'is-different': side.differs.excerpt }">{{ side.preview.excerpt || '—' }}</p>
                        </template>
                        <span v-else class="conflict__side-empty">
                          {{ side.deleted ? t('syncConflict.deletedOnSide') : t('syncConflict.noPreview') }}
                        </span>
                      </div>
                    </div>
                    <span class="conflict__compare-hint">{{ t('syncConflict.differenceHint') }}</span>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </section>
    </div>
    <div v-else class="conflict__resolved">{{ t('syncConflict.nothingPending') }}</div>

    <template #footer-start>
      <span v-if="applying" class="conflict__progress" role="status" aria-live="polite">
        <span class="conflict__progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100"
          :aria-valuenow="progress.percent" :aria-valuetext="t(progress.labelKey)">
          <span class="conflict__progress-bar" :style="{ width: `${progress.percent}%` }" />
        </span>
        <span>{{ t(progress.labelKey) }}</span>
      </span>
      <span v-else-if="pending && strategy === 'manual' && missingCount" class="conflict__missing">
        {{ t('syncConflict.missingChoices', { count: missingCount }) }}
      </span>
    </template>
    <template #footer>
      <NButton :disabled="applying" @click="close">{{ t('common.cancel') }}</NButton>
      <NButton type="primary" :loading="applying" :disabled="!pending || (strategy === 'manual' && missingCount > 0)" @click="apply">
        {{ t('syncConflict.apply') }}
      </NButton>
    </template>
  </UiModal>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { NButton, NIcon, useMessage } from 'naive-ui'
import { AlertTriangle, ChevronDown, ChevronRight } from '@vicons/tabler'
import type {
  CloudSyncConflictPreview,
  CloudSyncConflictPreviewFieldKey,
  CloudSyncConflictReason,
  CloudSyncConflictSide
} from '@shared/cloud-sync-engine'
import UiChoiceCards from '@/components/ui/UiChoiceCards.vue'
import UiModal from '@/components/ui/UiModal.vue'
import { useSyncConflict } from '@/composables/useSyncConflict'
import {
  cloudSyncService,
  getCloudSyncErrorDiagnosis,
  getCloudSyncResultMessage,
  type CloudSyncCollectionCounts,
  type CloudSyncConflictItem,
  type CloudSyncConflictStrategy,
  type CloudSyncPendingConflict
} from '@/lib/services/cloud-sync.service'
import { describeConflictVersionTimes } from '@/lib/utils/sync-conflict-versions'
import { describeSyncProgress } from '@/lib/utils/sync-progress'

const SIDES = ['local', 'remote'] as const

const { t, locale } = useI18n()
const message = useMessage()
const { visible, storageId, close } = useSyncConflict()

const pending = ref<CloudSyncPendingConflict | undefined>()
const strategy = ref<CloudSyncConflictStrategy>('smart')
const resolutions = ref<Record<string, CloudSyncConflictSide>>({})
const expanded = ref<Record<string, boolean>>({})
const applying = ref(false)
const syncPhase = ref(cloudSyncService.getStatus().syncPhase)
const progress = computed(() => describeSyncProgress(syncPhase.value))
// 这次同步已经出结果：之后排队的自动同步不再推动进度条，免得关弹窗前又跳回第一步
let progressSettled = false
let unsubscribe: (() => void) | null = null

const closeUnlessApplying = () => {
  if (!applying.value) close()
}

const refreshPending = () => {
  pending.value = cloudSyncService.getPendingConflict(storageId.value)
  // 列表刷新后丢掉已经不存在的选择，保留还在的
  const ids = new Set(pending.value?.items.map(item => item.id) || [])
  resolutions.value = Object.fromEntries(Object.entries(resolutions.value).filter(([id]) => ids.has(id)))
}

watch(visible, show => {
  if (!show) return
  strategy.value = 'smart'
  resolutions.value = {}
  expanded.value = {}
  refreshPending()
})

const strategyOptions = computed(() => [
  { value: 'local' as const, label: t('syncConflict.useLocal'), description: t('syncConflict.useLocalDesc') },
  { value: 'remote' as const, label: t('syncConflict.useRemote'), description: t('syncConflict.useRemoteDesc') },
  { value: 'smart' as const, label: t('syncConflict.smartMerge'), description: t('syncConflict.smartMergeDesc'), badge: t('syncConflict.recommended') },
  { value: 'manual' as const, label: t('syncConflict.manual'), description: t('syncConflict.manualDesc') },
])

const missingCount = computed(() => (pending.value?.items || []).filter(item => !resolutions.value[item.id]).length)

// 每一类各自按单复数写好（1 prompt, 12 categories），再拼进「本机：…」「云端：…」
const countParams = (counts: CloudSyncCollectionCounts) => ({
  prompts: t('syncConflict.countPrompts', { count: counts.prompts }, counts.prompts),
  categories: t('syncConflict.countCategories', { count: counts.categories }, counts.categories),
  aiConfigs: t('syncConflict.countAiConfigs', { count: counts.aiConfigs }, counts.aiConfigs),
})

const COLLECTION_KEYS: Record<string, string> = {
  prompts: 'prompts',
  categories: 'categories',
  aiConfigs: 'aiConfigs',
  promptVariables: 'promptVariables',
  promptHistories: 'promptHistories',
  quickOptimizationConfigs: 'quickOptimizationConfigs',
  aiHistory: 'aiHistory',
  settings: 'settings',
}
const collectionLabel = (collection: string) => (
  COLLECTION_KEYS[collection] ? t(`syncConflict.collections.${COLLECTION_KEYS[collection]}`) : collection
)

// 每项两边的时间：同一分钟内显示到秒，并记下较新的一边
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

const reasonLabel = (reason: CloudSyncConflictReason) => t(`syncConflict.reasons.${reason}`)

const toggleExpanded = (id: string) => {
  expanded.value = { ...expanded.value, [id]: !expanded.value[id] }
}

/**
 * 展开后左右对照的两栏：两边按同一组字段逐行排列（一边没有的显示「—」），
 * 两边不一样的值高亮，用户一眼能看出差在哪里
 */
const comparisonSides = (item: CloudSyncConflictItem) => {
  const previews: Record<CloudSyncConflictSide, CloudSyncConflictPreview | undefined> = {
    local: item.localPreview,
    remote: item.remotePreview,
  }
  const fieldOf = (preview: CloudSyncConflictPreview | undefined, key: CloudSyncConflictPreviewFieldKey) =>
    preview?.fields.find(field => field.key === key)
  const valueOf = (preview: CloudSyncConflictPreview | undefined, key: CloudSyncConflictPreviewFieldKey) =>
    fieldOf(preview, key)?.value || ''
  const compareOf = (preview: CloudSyncConflictPreview | undefined, key: CloudSyncConflictPreviewFieldKey) => {
    const field = fieldOf(preview, key)
    return field?.compareValue ?? field?.value ?? ''
  }
  const keys = [...new Set([...(item.localPreview?.fields || []), ...(item.remotePreview?.fields || [])].map(field => field.key))]
  const bothPresent = !!item.localPreview && !!item.remotePreview
  const differs = {
    title: bothPresent && (item.localPreview?.title || '') !== (item.remotePreview?.title || ''),
    excerpt: bothPresent && (item.localPreview?.excerpt || '') !== (item.remotePreview?.excerpt || ''),
  }
  return SIDES.map(side => ({
    key: side,
    label: [
      side === 'local' ? t('syncConflict.localVersion') : t('syncConflict.remoteVersion'),
      versionLabel(item, side),
      ...(isNewer(item, side) ? [t('syncConflict.newer')] : []),
    ].join(' · '),
    preview: previews[side],
    deleted: side === 'local' ? item.localDeleted : item.remoteDeleted,
    differs,
    fields: keys.map(key => ({
      key,
      label: fieldLabel(key),
      value: fieldText(key, valueOf(previews[side], key)),
      differs: bothPresent && compareOf(item.localPreview, key) !== compareOf(item.remotePreview, key),
    })),
  }))
}

// 图片沿用提示词编辑里的「图片」「N 张」
const fieldLabel = (key: CloudSyncConflictPreviewFieldKey) =>
  key === 'images' ? t('promptManagement.images') : t(`syncConflict.fields.${key}`)
const fieldText = (key: CloudSyncConflictPreviewFieldKey, value: string) =>
  key === 'images' && value ? t('mobilePrompt.imageCount', { count: Number(value) }, Number(value)) : value

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
      resolutions: strategy.value === 'manual' ? resolutions.value : undefined,
    })
    progressSettled = true
    if (result.action === 'conflict-pending') {
      // 等待期间云端又有新的改动，列表已刷新，请用户再确认一次
      refreshPending()
      message.warning(t('syncConflict.changedMeanwhile'))
      return
    }
    if (!result.success) {
      message.error(getCloudSyncErrorDiagnosis(result, { storageId: pending.value.storageId, reason: 'manual', status: 'error' }).message)
      return
    }
    message.success(getCloudSyncResultMessage(result.action))
    close()
  } finally {
    applying.value = false
  }
}

onMounted(() => {
  unsubscribe = cloudSyncService.onStatusChange(status => {
    // 同步结束时状态里的步骤会清空：保留最后一步，不退回第一步
    if (!progressSettled && status.syncPhase) syncPhase.value = status.syncPhase
    if (visible.value && !applying.value) refreshPending()
  })
})
onUnmounted(() => unsubscribe?.())
</script>

<style scoped>
.conflict {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.conflict__alert {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.conflict__counts {
  color: var(--content-secondary);
  font-size: var(--font-size-xs);
}

.conflict__stats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.conflict__panel {
  overflow: hidden;
}

.conflict__panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 40px;
  padding: 0 12px 0 16px;
  border-bottom: 1px solid var(--border-default);
  background: var(--surface-secondary);
}

.conflict__panel-title {
  font-size: var(--font-size-sm);
  font-weight: var(--font-weight-medium);
}

.conflict__panel-actions {
  display: flex;
  gap: 4px;
}

.conflict__table-wrap {
  max-height: 360px;
  overflow-y: auto;
}

.conflict__table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--font-size-sm);
}

.conflict__table th {
  position: sticky;
  top: 0;
  height: 36px;
  padding: 0 16px;
  border-bottom: 1px solid var(--border-default);
  background: var(--surface-secondary);
  color: var(--content-tertiary);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-medium);
  text-align: left;
}

.conflict__table td {
  height: 52px;
  padding: 0 16px;
  border-bottom: 1px solid var(--border-subtle);
}

.conflict__table tr:last-child td {
  border-bottom: 0;
}

.conflict__item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.conflict__expand {
  flex: none;
  width: 22px;
  padding: 0;
}

.conflict__item-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.conflict__item-name {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
}

.conflict__item-type {
  color: var(--content-tertiary);
  font-size: var(--font-size-xs);
}

.conflict__table tr.is-expanded td {
  border-bottom-color: transparent;
}

.conflict__preview-row td {
  height: auto;
  padding: 0 16px 16px 46px;
}

.conflict__compare {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.conflict__side {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--border-default);
  border-radius: var(--radius-control);
  background: var(--surface-secondary);
}

.conflict__side-label {
  color: var(--content-tertiary);
  font-size: var(--font-size-xs);
}

.conflict__side-title {
  font-weight: var(--font-weight-medium);
  overflow-wrap: anywhere;
}

.conflict__fields {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 2px 8px;
  margin: 0;
  font-size: var(--font-size-xs);
}

.conflict__fields dt {
  color: var(--content-tertiary);
}

.conflict__fields dd {
  margin: 0;
  color: var(--content-secondary);
  overflow-wrap: anywhere;
}

.conflict__excerpt {
  max-height: 120px;
  margin: 0;
  overflow-y: auto;
  color: var(--content-secondary);
  font-size: var(--font-size-xs);
  line-height: var(--line-height-normal);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

/* 两边不一样的值 */
.conflict__side .is-different {
  border-radius: var(--radius-control);
  background: var(--accent-warning-bg);
  color: var(--content-primary);
}

.conflict__side-title.is-different,
.conflict__fields dd.is-different {
  width: fit-content;
  max-width: 100%;
  padding: 0 4px;
}

.conflict__excerpt.is-different {
  padding: 4px 6px;
}

.conflict__side-empty {
  color: var(--content-tertiary);
  font-size: var(--font-size-sm);
}

.conflict__compare-hint {
  display: block;
  margin-top: 8px;
  color: var(--content-tertiary);
  font-size: var(--font-size-xs);
}

.conflict__choice {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.conflict__choice input {
  margin: 0;
  accent-color: var(--accent-primary);
}

.conflict__missing {
  color: var(--accent-warning);
}

.conflict.is-busy {
  opacity: 0.5;
  pointer-events: none;
}

.conflict__progress {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--content-secondary);
  font-size: var(--font-size-sm);
}

.conflict__progress-track {
  display: block;
  overflow: hidden;
  width: 160px;
  height: 4px;
  border-radius: 999px;
  background: var(--surface-tertiary);
}

.conflict__progress-bar {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--accent-primary);
  transition: width 0.3s ease;
}

.conflict__resolved {
  padding: 24px 0;
  color: var(--content-tertiary);
  font-size: var(--font-size-sm);
  text-align: center;
}
</style>
