<template>
  <div class="history-panel">
    <div class="history-panel__head">
      <h2 class="ui-title-section">{{ t('promptHistory.title') }}</h2>
      <NButton quaternary size="small" class="history-panel__close" :aria-label="t('common.close')" @click="emit('close')">
        <template #icon><NIcon :size="16"><X /></NIcon></template>
      </NButton>
    </div>
    <NScrollbar class="history-panel__scroll">
      <div class="history-panel__list">
        <div v-if="loading" class="history-panel__empty"><NSpin :size="16" /></div>
        <div v-else-if="!versions.length" class="history-panel__empty">{{ t('promptHistory.empty') }}</div>
        <!-- 当前内容还没记成版本（在别处改过）时，单独列一行「当前」，下次保存时会补记 -->
        <button v-if="!loading && versions.length && !currentRecorded" type="button" class="history-item"
          @click="emit('select', null)">
          <span class="history-item__title">{{ t('promptHistory.current') }}</span>
          <span class="history-item__meta">{{ t('promptHistory.currentUnrecorded') }}</span>
        </button>
        <template v-for="(version, index) in versions" :key="version.id ?? version.version">
          <!-- 选中的旧版本（正文上方在对比）和点开的当前版本都可以改说明 -->
          <div v-if="isEditing(version, index)" class="history-item is-active">
            <span class="history-item__title">
              v{{ version.version }}<template v-if="isCurrent(index)"> · {{ t('promptHistory.current') }}</template>
            </span>
            <span class="history-item__meta">{{ formatTime(version.createdAt) }}</span>
            <NInput v-model:value="descriptionDraft" size="small" :placeholder="t('promptHistory.descriptionPlaceholder')"
              :input-props="{ 'aria-label': t('promptHistory.descriptionLabel', { version: version.version }) }"
              @blur="commitDescription(version)" @keydown.enter="handleEnterKey($event, () => commitDescription(version))" />
          </div>
          <button v-else type="button" class="history-item" @click="selectVersion(version, index)">
            <span class="history-item__title">
              v{{ version.version }}<template v-if="isCurrent(index)"> · {{ t('promptHistory.current') }}</template>
            </span>
            <span class="history-item__meta">{{ itemMeta(version) }}</span>
          </button>
        </template>
      </div>
    </NScrollbar>
    <p class="ui-help history-panel__foot">{{ t('promptHistory.hint') }}</p>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { NButton, NIcon, NInput, NScrollbar, NSpin } from 'naive-ui'
import { X } from '@vicons/tabler'
import type { PromptHistory } from '@shared/types/database'
import { formatFriendlyDate } from '@/lib/utils/date'
import { handleEnterKey } from '@/lib/utils/ime'
import { localizeHistoryDescription } from '@/lib/utils/prompt-history-display'

const props = withDefaults(defineProps<{
  /** 新的在前；每一版是保存后的内容，第一条和已保存的内容一致时就是当前版本 */
  versions: PromptHistory[]
  /** 第一条是否就是当前内容；提示词在别处改过时为 false */
  currentRecorded?: boolean
  selectedId?: number | null
  loading?: boolean
}>(), {
  currentRecorded: true,
  selectedId: null,
  loading: false,
})

const isCurrent = (index: number) => props.currentRecorded && index === 0

const emit = defineEmits<{
  select: [version: PromptHistory | null]
  close: []
  'update-description': [version: PromptHistory, description: string]
}>()

const { t, locale } = useI18n()
const descriptionDraft = ref('')
// 当前版本不需要和自己对比，点它只是展开来改说明
const editingCurrent = ref(false)

// 自动写入的说明（「编辑更新」「恢复自 v1」…）按当前语言显示
const describe = (version: PromptHistory) => localizeHistoryDescription(version.changeDescription, t)

const isEditing = (version: PromptHistory, index: number) => (
  isCurrent(index) ? editingCurrent.value && !props.selectedId : version.id === props.selectedId
)

const resetDraft = () => {
  const version = editingCurrent.value && !props.selectedId
    ? props.versions[0]
    : props.versions.find(item => item.id === props.selectedId)
  descriptionDraft.value = version ? describe(version) : ''
}

watch(() => props.selectedId, selected => {
  if (selected) editingCurrent.value = false
  resetDraft()
}, { immediate: true })

const selectVersion = async (version: PromptHistory, index: number) => {
  if (!isCurrent(index)) {
    emit('select', version)
    return
  }
  // 点当前版本：退出对比，展开当前版本的说明输入框
  emit('select', null)
  editingCurrent.value = true
  resetDraft()
  await nextTick()
  document.querySelector<HTMLInputElement>('.history-item.is-active input')?.focus()
}

const formatTime = (value: Date | string) => formatFriendlyDate(value, locale.value, { withTime: true })

const itemMeta = (version: PromptHistory) => [describe(version), formatTime(version.createdAt)]
  .filter(Boolean)
  .join(' · ')

// 和显示出来的说明（自动说明已经换成当前语言）一样就是没改，不写回去
const commitDescription = (version: PromptHistory) => {
  const next = descriptionDraft.value.trim()
  if (next === describe(version)) return
  emit('update-description', version, next)
}
</script>

<style scoped>
.history-panel {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

.history-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 41px;
  padding: 0 8px 0 16px;
  border-bottom: 1px solid var(--border-default);
  background: var(--surface-secondary);
}

.history-panel__close {
  width: 28px;
  padding: 0;
}

.history-panel__scroll {
  flex: 1;
  min-height: 0;
}

.history-panel__list {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 12px 8px;
}

.history-panel__empty {
  display: flex;
  justify-content: center;
  padding: 24px 0;
  color: var(--content-tertiary);
  font-size: var(--font-size-sm);
}

.history-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  padding: 8px 10px;
  border: 0;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--content-primary);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

button.history-item:hover {
  background: var(--surface-tertiary);
}

.history-item.is-active {
  gap: 8px;
  background: var(--accent-soft);
  color: var(--accent-soft-text);
  cursor: default;
}

.history-item__title {
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
}

.history-item__meta {
  color: var(--content-tertiary);
  font-size: var(--font-size-xs);
}

.history-panel__foot {
  padding: 12px 16px;
  border-top: 1px solid var(--border-default);
}
</style>
