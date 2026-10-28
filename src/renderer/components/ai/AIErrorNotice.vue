<template>
  <component :is="plain ? 'div' : UiAlert" v-bind="plain ? {} : { tone: 'error' }" class="ai-error" :class="{ 'is-plain': plain }">
    <span class="ai-error__body">
      <strong class="ai-error__title">{{ formatTitle ? formatTitle(diagnosis.title) : diagnosis.title }}</strong>
      <span class="ai-error__message">{{ diagnosis.message }}</span>
      <details v-if="diagnosis.detail" class="ai-error__detail">
        <summary>{{ t('aiError.detailLabel') }}</summary>
        <span class="ai-error__raw">{{ diagnosis.detail }}</span>
      </details>
      <span v-if="retry || $slots.default" class="ai-error__actions">
        <NButton v-if="retry" size="tiny" @click="emit('retry')">{{ t('common.retry') }}</NButton>
        <slot />
      </span>
    </span>
  </component>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { NButton } from 'naive-ui'
import UiAlert from '@/components/ui/UiAlert.vue'
import { describeAIError } from '@/lib/utils/ai-error'

/** AI 请求失败的提示：先说原因和怎么办，原始报错折叠在「技术详情」里 */
const props = defineProps<{
  error: unknown
  /** 请求的是本机服务，连不上时提示「服务没有启动」 */
  local?: boolean
  /** 给标题加上下文，例如「连接失败：{原因}」 */
  formatTitle?: (title: string) => string
  /** 显示「重试」按钮 */
  retry?: boolean
  /** 不带提示框外观，放进已经有状态样式的卡片里（AI 会话） */
  plain?: boolean
}>()

const emit = defineEmits<{ retry: [] }>()

const { t } = useI18n()
const diagnosis = computed(() => describeAIError(props.error, { local: props.local }, t))
</script>

<style scoped>
.ai-error__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.ai-error__title {
  font-weight: var(--font-weight-medium);
}

.ai-error.is-plain .ai-error__title {
  color: var(--content-primary);
  font-size: var(--font-size-sm);
}

.ai-error__message {
  color: var(--content-secondary);
  font-size: var(--font-size-sm);
}

.ai-error.is-plain .ai-error__message {
  font-size: var(--font-size-xs);
}

.ai-error__detail {
  margin-top: 4px;
  color: var(--content-tertiary);
  font-size: var(--font-size-xs);
}

.ai-error__detail summary {
  width: fit-content;
  cursor: pointer;
}

.ai-error__detail summary:focus-visible {
  border-radius: var(--radius-control);
  outline: 2px solid var(--accent-primary);
  outline-offset: 1px;
}

.ai-error__raw {
  display: block;
  margin-top: 4px;
  font-family: var(--font-family-mono);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  user-select: text;
}

.ai-error__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 6px;
}
</style>
