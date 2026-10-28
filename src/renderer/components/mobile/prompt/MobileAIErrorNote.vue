<!--
  AI 请求出错时的说明：先说原因和怎么处理，服务商返回的原始信息收在「技术详情」里。
  归类和文案与桌面端的 AIErrorNotice 共用 lib/utils/ai-error；试运行、AI 生成、快速优化和模型页共用。
-->
<template>
  <div class="ai-error" role="alert">
    <p class="ai-error__summary">{{ error.summary }}</p>
    <p v-if="error.hint" class="ai-error__hint">{{ error.hint }}</p>
    <details v-if="error.detail" class="ai-error__details">
      <summary>{{ t('aiError.detailLabel') }}</summary>
      <p class="ai-error__raw">{{ error.detail }}</p>
    </details>
  </div>
</template>

<script setup lang="ts">
import { useI18n } from '~/composables/useI18n'
import type { MobileAIErrorView } from './mobile-ai'

defineProps<{
  error: MobileAIErrorView
}>()

const { t } = useI18n()
</script>

<style scoped>
.ai-error {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.ai-error__summary {
  margin: 0;
  color: var(--accent-error);
  font-size: var(--m-font-sub);
  font-weight: 600;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.ai-error__hint {
  margin: 0;
  color: var(--content-secondary);
  font-size: var(--m-font-sub);
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.ai-error__details summary {
  width: fit-content;
  min-height: 32px;
  color: var(--content-tertiary);
  font-size: var(--m-font-caption);
  line-height: 32px;
  cursor: pointer;
}

.ai-error__raw {
  margin: 4px 0 0;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--surface-secondary);
  color: var(--content-secondary);
  font-family: var(--font-family-mono);
  font-size: var(--m-font-caption);
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  user-select: text;
}
</style>
