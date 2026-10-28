<template>
  <aside class="model-library" :aria-label="t('models.title')">
    <div class="model-library__head">
      <span class="ui-title-section">{{ t('models.title') }}</span>
      <span class="model-library__count">{{ t('aiConfig.workspace.configCount', { count: total }) }}</span>
      <span class="model-library__spacer" />
      <NTooltip :show-arrow="false">
        <template #trigger>
          <NButton type="primary" size="small" class="model-library__icon-button" :aria-label="t('aiConfig.addConfig')"
            @click="emit('create')">
            <template #icon><NIcon :size="16"><Plus /></NIcon></template>
          </NButton>
        </template>
        {{ t('aiConfig.addConfig') }}
      </NTooltip>
    </div>

    <div ref="filtersRef" class="model-library__filters">
      <NInput :value="search" clearable :placeholder="t('aiConfig.workspace.searchPlaceholder')"
        :input-props="{ 'aria-label': t('aiConfig.workspace.searchPlaceholder') }" @update:value="value => emit('update:search', value)">
        <template #prefix><NIcon :size="14"><Search /></NIcon></template>
      </NInput>
      <!-- 四个选项放得下时用分段（按文字长短分宽度）；日语、意大利语等放不下时改用下拉，不显示被截断的选项 -->
      <UiSegmented v-if="filterFits" :model-value="filter" fill class="model-library__segmented"
        :label="t('aiConfig.workspace.filterLabel')" :options="filterOptions"
        @update:model-value="value => emit('update:filter', value)" />
      <NSelect v-else :value="filter" :options="filterOptions" size="small"
        :input-props="{ 'aria-label': t('aiConfig.workspace.filterLabel') }"
        @update:value="(value: ConfigFilter) => emit('update:filter', value)" />
    </div>

    <NScrollbar class="model-library__scroll">
      <div class="model-library__items" role="listbox" :aria-label="t('models.title')">
        <button v-for="config in configs" :key="config.id" type="button" role="option" class="model-item"
          :class="{ 'is-active': config.id === selectedId }" :aria-selected="config.id === selectedId" @click="emit('select', config)">
          <span class="model-item__title">
            <span class="model-item__name" :class="{ 'is-disabled': !config.enabled }">{{ config.name }}</span>
            <span v-if="config.isPreferred && config.enabled" class="ui-tag model-item__tag">{{ t('models.preferred') }}</span>
            <span v-else-if="config.enabled" class="ui-dot ui-dot--success" :aria-label="t('aiConfig.enabled')" />
            <span v-else class="model-item__state">{{ t('models.disabled') }}</span>
          </span>
          <span class="model-item__meta">{{ metaText(config) }}</span>
        </button>
        <div v-if="!configs.length" class="model-library__empty">{{ t('aiConfig.workspace.noMatchingConfigs') }}</div>
      </div>
    </NScrollbar>
  </aside>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { NButton, NIcon, NInput, NScrollbar, NSelect, NTooltip } from 'naive-ui'
import { Plus, Search } from '@vicons/tabler'
import type { AIConfig } from '@shared/types/ai'
import UiSegmented from '@/components/ui/UiSegmented.vue'
import type { ConfigFilter } from '@/composables/ai/useAIConfigWorkspace'

defineProps<{
  configs: AIConfig[]
  total: number
  selectedId: number | null
  search: string
  filter: ConfigFilter
}>()

const emit = defineEmits<{
  select: [config: AIConfig]
  create: []
  'update:search': [value: string]
  'update:filter': [value: ConfigFilter]
}>()

const { t, locale } = useI18n()
const filtersRef = ref<HTMLElement>()
const filterFits = ref(true)

// 列表宽度固定，只在挂载、换语言、字体加载完时量一次：有选项被省略或折成两行就改用下拉
const checkFilterFit = async () => {
  filterFits.value = true
  await nextTick()
  const labels = Array.from(filtersRef.value?.querySelectorAll<HTMLElement>('.ui-seg__label') || [])
  if (!labels.length || !filtersRef.value?.clientWidth) return
  filterFits.value = !labels.some(label => {
    const lineHeight = parseFloat(getComputedStyle(label).fontSize) * 1.6
    return label.scrollWidth > label.clientWidth + 1 || label.scrollHeight > lineHeight
  })
}

watch(locale, () => { void checkFilterFit() })
onMounted(() => {
  void checkFilterFit()
  void document.fonts?.ready.then(checkFilterFit)
})

const filterOptions = computed(() => [
  { value: 'all' as ConfigFilter, label: t('models.filterAll') },
  { value: 'online' as ConfigFilter, label: t('models.filterOnline') },
  { value: 'local' as ConfigFilter, label: t('models.filterLocal') },
  { value: 'custom' as ConfigFilter, label: t('models.filterCustom') },
])

const metaText = (config: AIConfig) => {
  const model = config.defaultModel || config.customModel || t('aiConfig.workspace.noDefaultModel')
  // 和详情页一样，旧数据里的「自定义模型」也算一个
  const count = new Set([...(config.models || []), config.defaultModel, config.customModel].filter(Boolean)).size
  return `${model} · ${t('aiConfig.workspace.modelCount', { count }, count)}`
}
</script>

<style scoped>
.model-library {
  display: flex;
  flex: none;
  flex-direction: column;
  width: var(--list-width);
  min-height: 0;
  border-right: 1px solid var(--border-default);
  background: var(--surface-secondary);
}

.model-library__head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 14px 12px 10px 16px;
}

.model-library__count {
  color: var(--content-tertiary);
  font-size: var(--font-size-xs);
}

.model-library__spacer {
  flex: 1;
}

.model-library__icon-button {
  width: 28px;
  padding: 0;
}

.model-library__filters {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0 12px 10px;
}

/* 按文字长短分配宽度：「全部」「All」短，长译文的选项多分一些 */
.model-library__segmented :deep(.ui-seg__item) {
  flex: 1 1 auto;
}

.model-library__scroll {
  flex: 1;
  min-height: 0;
}

.model-library__items {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 0 8px 12px;
}

.model-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  padding: 8px 10px;
  border: 0;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--content-primary);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.model-item:hover {
  background: var(--surface-tertiary);
}

.model-item:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.model-item.is-active {
  background: var(--accent-soft);
}

.model-item.is-active .model-item__name:not(.is-disabled) {
  color: var(--accent-soft-text);
}

.model-item__title {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: var(--font-size-base);
  font-weight: var(--font-weight-medium);
  line-height: 1.4;
}

.model-item__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-item__name.is-disabled {
  color: var(--content-tertiary);
}

.model-item__tag {
  height: 18px;
  padding: 0 6px;
}

.model-item__state {
  flex: none;
  color: var(--content-tertiary);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-normal);
}

.model-item__meta {
  overflow: hidden;
  color: var(--content-tertiary);
  font-size: var(--font-size-xs);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-library__empty {
  padding: 24px 8px;
  color: var(--content-tertiary);
  font-size: var(--font-size-sm);
  text-align: center;
}
</style>
