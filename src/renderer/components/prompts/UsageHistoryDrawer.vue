<template>
  <NDrawer :show="show" :width="420" placement="right" @update:show="value => emit('update:show', value)">
    <NDrawerContent :title="t('promptUsage.title')" closable :body-content-style="{ padding: 0 }">
      <p class="usage__note">{{ t('promptUsage.note') }}</p>
      <div class="usage__list">
        <div v-if="!records.length" class="usage__empty">{{ t('promptWorkspace.noUseHistory') }}</div>
        <div v-for="record in records" :key="record.date" class="usage-record">
          <div class="usage-record__head">
            <span class="usage-record__time">
              {{ formatFriendlyDate(record.date, locale, { withTime: true }) }}
              <template v-if="copyCount(record) > 1">· {{ t('promptUsage.copiedTimes', { count: copyCount(record) }, copyCount(record)) }}</template>
            </span>
            <div class="usage-record__actions">
              <NButton size="tiny" @click="emit('restore', record)">{{ t('promptUsage.restore') }}</NButton>
              <NTooltip :show-arrow="false">
                <template #trigger>
                  <NButton quaternary size="tiny" class="usage-record__delete" :aria-label="t('promptUsage.deleteRecord')"
                    @click="emit('delete', record)">
                    <template #icon><NIcon :size="14"><Trash /></NIcon></template>
                  </NButton>
                </template>
                {{ t('promptUsage.deleteRecord') }}
              </NTooltip>
            </div>
          </div>
          <div v-if="valueEntries(record).length" class="usage-record__values">
            <!-- 填写的值可能很长：标签里省略，悬停看全文 -->
            <span v-for="[name, value] in valueEntries(record)" :key="name" class="ui-tag ui-tag--line"
              :title="t('promptUsage.valuePair', { name, value })">
              <span class="ui-tag__text">{{ t('promptUsage.valuePair', { name, value }) }}</span>
            </span>
          </div>
          <p class="usage-record__content">{{ record.content }}</p>
        </div>
      </div>
      <!-- 记录里有完整的生成文本和填写值，给一个清空的地方；只删记录，不改使用次数 -->
      <template v-if="records.length" #footer>
        <NPopconfirm :positive-text="t('promptUsage.clearConfirmAction')" :negative-text="t('common.cancel')"
          :positive-button-props="{ type: 'error' }" @positive-click="emit('clear')">
          <template #trigger>
            <NButton size="small">{{ t('promptUsage.clearAll') }}</NButton>
          </template>
          {{ t('promptUsage.clearConfirm') }}
        </NPopconfirm>
      </template>
    </NDrawerContent>
  </NDrawer>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { NButton, NDrawer, NDrawerContent, NIcon, NPopconfirm, NTooltip } from 'naive-ui'
import { Trash } from '@vicons/tabler'
import type { PromptUsageRecord } from '@/lib/utils/prompt-usage'
import { formatFriendlyDate } from '@/lib/utils/date'

defineProps<{
  show: boolean
  records: PromptUsageRecord[]
}>()

const emit = defineEmits<{
  'update:show': [value: boolean]
  restore: [record: PromptUsageRecord]
  /** 删除单条记录 */
  delete: [record: PromptUsageRecord]
  /** 清空全部记录（已在气泡里确认过） */
  clear: []
}>()

const { t, locale } = useI18n()

// 同样的值连续复制会合并成一条，这里显示一共复制了几次
const copyCount = (record: PromptUsageRecord) => record.count || 1

// 取值合并成一行放进标签，太长时由样式显示省略号，悬停 title 看全文（特别长的值只取前 300 字）
const valueEntries = (record: PromptUsageRecord) => Object.entries(record.variables || {})
  .filter(([, value]) => value !== '' && value !== undefined && value !== null)
  .map(([name, value]) => {
    // 开关的值记的是 true / false，显示成「是 / 否」
    const raw = typeof value === 'boolean' ? t(value ? 'promptPage.yes' : 'promptPage.no') : String(value)
    const text = raw.replace(/\s+/g, ' ').trim()
    return [name, text.length > 300 ? `${text.slice(0, 300)}…` : text] as const
  })
</script>

<style scoped>
.usage__note {
  margin: 0;
  padding: 12px 20px;
  border-bottom: 1px solid var(--border-default);
  color: var(--content-secondary);
  font-size: var(--font-size-sm);
}

.usage__list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px 20px;
}

.usage__empty {
  padding: 24px 0;
  color: var(--content-tertiary);
  font-size: var(--font-size-sm);
  text-align: center;
}

.usage-record {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-radius: var(--radius-panel);
  background: var(--surface-secondary);
}

.usage-record__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.usage-record__time {
  min-width: 0;
  color: var(--content-tertiary);
  font-size: var(--font-size-xs);
}

.usage-record__actions {
  display: flex;
  flex: none;
  align-items: center;
  gap: 4px;
}

.usage-record__delete {
  width: 22px;
  padding: 0;
}

.usage-record__values {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.usage-record__content {
  display: -webkit-box;
  margin: 0;
  overflow: hidden;
  color: var(--content-secondary);
  font-size: var(--font-size-sm);
  line-height: 1.6;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  user-select: text;
}
</style>
