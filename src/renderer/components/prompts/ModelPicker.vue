<template>
  <NDropdown
    v-if="models.hasModels.value"
    trigger="click"
    placement="bottom-end"
    :options="dropdownOptions"
    :disabled="disabled"
    scrollable
    @update:show="value => (menuOpen = value)"
    @select="key => models.select(String(key))"
  >
    <NTooltip :disabled="!truncated || menuOpen" :show-arrow="false">
      <template #trigger>
        <NButton quaternary size="tiny" class="model-picker" :disabled="disabled" :aria-label="t('promptAI.selectModel')">
          <NIcon :size="14" class="model-picker__icon"><Robot /></NIcon>
          <span ref="labelRef" class="model-picker__label">{{ selectedModel }}</span>
          <NIcon :size="12" class="model-picker__chevron"><ChevronDown /></NIcon>
        </NButton>
      </template>
      {{ selectedModel }}
    </NTooltip>
  </NDropdown>
  <!-- 没有模型时面板正文的空状态里已经有「连接模型」，标签头不再放第二个 -->
</template>

<script setup lang="ts">
import { computed, h, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { NButton, NDropdown, NIcon, NTooltip, type DropdownOption } from 'naive-ui'
import { Check, ChevronDown, Robot } from '@vicons/tabler'
import { useAIModels } from '@/composables/prompt/useAIModels'
import { useElementWidth } from '@/composables/useElementWidth'

defineProps<{ disabled?: boolean }>()
defineEmits<{ connect: [] }>()

const { t } = useI18n()
const models = useAIModels()
const selectedModel = computed(() => models.selected.value?.model || '')

// 模型名放不下时按钮收窄、名字显示省略号，太窄时只留图标；这两种情况悬停都给出全名，菜单打开时不再提示，免得盖住菜单
const labelRef = ref<HTMLElement>()
const menuOpen = ref(false)
const labelWidth = useElementWidth(labelRef)
const truncated = ref(false)
watch([labelWidth, selectedModel], async () => {
  await nextTick()
  const label = labelRef.value
  truncated.value = Boolean(label && (!label.clientWidth || label.scrollWidth > label.clientWidth))
}, { immediate: true })

// 按配置分组，选中的模型前面打勾
const dropdownOptions = computed<DropdownOption[]>(() => {
  const groups = new Map<string, DropdownOption[]>()
  models.options.value.forEach(option => {
    const children = groups.get(option.config.configId) || []
    children.push({
      key: option.key,
      label: option.model,
      icon: option.key === models.selectedKey.value
        ? () => h(NIcon, { size: 16 }, { default: () => h(Check) })
        : () => h('span', { style: 'display:inline-block;width:16px' }),
    })
    groups.set(option.config.configId, children)
  })
  return [...groups.entries()].map(([configId, children]) => {
    const config = models.configs.value.find(item => item.configId === configId)
    return { type: 'group', key: `group:${configId}`, label: config?.name || configId, children }
  })
})
</script>

<style scoped>
/* Naive 按钮默认不收缩；在标签头里要让出空间给页签 */
.model-picker {
  flex: 0 1 auto;
  min-width: 0;
  max-width: 100%;
}

.model-picker :deep(.n-button__content) {
  min-width: 0;
}

.model-picker__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-picker__chevron {
  flex: none;
  margin-left: 4px;
}

.model-picker__icon {
  display: none;
}

/* 标签头右侧只剩很少空间时（新建提示词的弹窗、意大利语），省略号也看不出是哪个模型，改成图标 */
@container side-actions (max-width: 88px) {
  .model-picker {
    padding: 0 4px;
  }

  .model-picker__icon {
    display: inline-flex;
  }

  .model-picker__label {
    display: none;
  }

  .model-picker__chevron {
    margin-left: 2px;
  }
}
</style>
