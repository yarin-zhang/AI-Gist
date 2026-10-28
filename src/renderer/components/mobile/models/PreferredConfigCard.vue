<template>
  <section class="m-section">
    <div class="m-gt"><span>{{ t('aiConfig.globalPreferred') }}</span></div>
    <!-- 和列表行同样朴素的白卡片：测试连接、取消首选都在详情页里 -->
    <button type="button" class="m-card preferred-card" @click="emit('open')">
      <ProviderTile :visual="visual" size="md" />
      <span class="preferred-card__names">
        <span class="preferred-card__name">{{ config.name }}</span>
        <span class="preferred-card__model">{{ modelLabel }}</span>
      </span>
      <span class="m-pill preferred-card__status" :class="badge.tone">
        <span v-if="badge.dot" class="preferred-card__dot" aria-hidden="true" />
        {{ badge.label }}
      </span>
      <ion-icon :icon="chevronForward" class="preferred-card__chev" aria-hidden="true" />
    </button>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { IonIcon } from '@ionic/vue'
import { chevronForward } from 'ionicons/icons'
import { useI18n } from '~/composables/useI18n'
import type { AIConfig } from '@shared/types'
import ProviderTile from './ProviderTile.vue'
import type { ProviderVisual } from './provider-catalog'
import { connectionBadgeView, type ConnectionStatus } from './connection-status'

const props = defineProps<{
  config: AIConfig
  visual: ProviderVisual
  status?: ConnectionStatus
}>()

const emit = defineEmits<{ open: [] }>()

const { t } = useI18n()

const modelLabel = computed(() => props.config.defaultModel || props.config.customModel
  || t('aiConfig.workspace.noDefaultModel'))

// 状态和列表、详情页同一套判断；连接正常且测过耗时的只显示耗时。status 变化（测试中 → 结果）时重新计算
const badge = computed(() => {
  const view = connectionBadgeView(props.config, t)
  const elapsed = props.status?.elapsed
  if (view.badge === 'ok' && elapsed !== undefined) return { ...view, label: t('models.elapsed', { ms: elapsed }) }
  return view
})
</script>

<style scoped>
/* 写成两个类，压过全局 .m-card 的纵向排列 */
.m-card.preferred-card {
  flex-direction: row;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 14px 16px;
  border: 0;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.m-card.preferred-card:active {
  background: var(--surface-secondary);
}

.preferred-card__names {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.preferred-card__name {
  overflow: hidden;
  font-size: var(--m-font-body);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preferred-card__model {
  overflow: hidden;
  color: var(--content-tertiary);
  font-family: var(--font-family-mono);
  font-size: var(--m-font-sub);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preferred-card__status {
  flex: none;
}

.preferred-card__dot {
  width: 6px;
  height: 6px;
  border-radius: 3px;
  background: currentColor;
}

.preferred-card__chev {
  flex: none;
  color: var(--border-strong);
  font-size: 18px;
}
</style>
