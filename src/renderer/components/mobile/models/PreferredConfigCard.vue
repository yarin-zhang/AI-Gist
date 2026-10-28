<template>
  <section class="m-section">
    <div class="m-gt"><span>{{ t('aiConfig.globalPreferred') }}</span></div>
    <div class="preferred-card">
      <span class="preferred-card__orb" aria-hidden="true" />
      <ion-icon :icon="star" class="preferred-card__star" aria-hidden="true" />

      <button type="button" class="preferred-card__main" @click="emit('open')">
        <span class="preferred-card__head">
          <ProviderTile :visual="visual" size="lg" variant="inverse" />
          <span class="preferred-card__names">
            <span class="preferred-card__name">{{ config.name }}</span>
            <span class="preferred-card__model">{{ modelLabel }}</span>
          </span>
        </span>
        <span class="preferred-card__foot">
          <span class="preferred-card__status" :class="`is-${badge.badge}`">
            <span class="preferred-card__dot" aria-hidden="true" />
            <span>{{ badge.label }}</span>
          </span>
          <span class="preferred-card__caption">{{ t('mobileModels.preferredCaption') }}</span>
        </span>
      </button>

      <div class="preferred-card__actions">
        <button type="button" class="preferred-card__action" :disabled="status?.state === 'testing'"
          @click="emit('test')">
          <ion-spinner v-if="status?.state === 'testing'" name="crescent" />
          <ion-icon v-else :icon="flashOutline" aria-hidden="true" />
          {{ t('aiConfig.testConnection') }}
        </button>
        <button type="button" class="preferred-card__action" @click="emit('clear')">
          <ion-icon :icon="starOutline" aria-hidden="true" />
          {{ t('aiConfig.cancelPreferred') }}
        </button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { IonIcon, IonSpinner } from '@ionic/vue'
import { flashOutline, star, starOutline } from 'ionicons/icons'
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

const emit = defineEmits<{ open: []; test: []; clear: [] }>()

const { t } = useI18n()

const modelLabel = computed(() => props.config.defaultModel || props.config.customModel
  || t('aiConfig.workspace.noDefaultModel'))

// 状态和列表、详情页同一套判断；status 变化（测试中 → 结果）时重新计算
const badge = computed(() => {
  void props.status
  return connectionBadgeView(props.config, t, { withElapsed: true })
})
</script>

<style scoped>
.preferred-card {
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 20px;
  background: linear-gradient(135deg, var(--accent-brand), var(--accent-primary));
  box-shadow: var(--shadow-floating);
  color: var(--content-inverse);
}

.preferred-card__orb {
  position: absolute;
  right: -40px;
  bottom: -60px;
  width: 180px;
  height: 180px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--content-inverse) 10%, transparent);
  pointer-events: none;
}

.preferred-card__star {
  position: absolute;
  top: 20px;
  right: 22px;
  color: var(--category-amber);
  font-size: 24px;
}

.preferred-card__main {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 18px 18px 14px;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.preferred-card__head {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  padding-right: 32px;
}

.preferred-card__names {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.preferred-card__name {
  overflow: hidden;
  font-size: var(--m-font-block);
  font-weight: 600;
  letter-spacing: -0.01em;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preferred-card__model {
  overflow: hidden;
  font-family: var(--font-family-mono);
  font-size: var(--m-font-sub);
  opacity: 0.86;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preferred-card__foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.preferred-card__status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 12px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--content-inverse) 18%, transparent);
  font-size: var(--m-font-sub);
  font-weight: 500;
}

.preferred-card__dot {
  width: 6px;
  height: 6px;
  border-radius: 3px;
  background: color-mix(in srgb, var(--content-inverse) 60%, transparent);
}

.preferred-card__status.is-ok .preferred-card__dot {
  background: var(--indicator-success);
}

.preferred-card__status.is-error .preferred-card__dot {
  background: var(--indicator-error);
}

.preferred-card__status.is-testing .preferred-card__dot,
.preferred-card__status.is-noModel .preferred-card__dot {
  background: var(--indicator-warning);
}

.preferred-card__caption {
  font-size: var(--m-font-caption);
  opacity: 0.86;
}

.preferred-card__actions {
  position: relative;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  border-top: 1px solid color-mix(in srgb, var(--content-inverse) 18%, transparent);
}

.preferred-card__action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 46px;
  padding: 0 8px;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: var(--m-font-sub);
  font-weight: 600;
  cursor: pointer;
}

.preferred-card__action + .preferred-card__action {
  border-left: 1px solid color-mix(in srgb, var(--content-inverse) 18%, transparent);
}

.preferred-card__action:active {
  background: color-mix(in srgb, var(--content-inverse) 10%, transparent);
}

.preferred-card__action:disabled {
  opacity: 0.7;
}

.preferred-card__action ion-icon {
  font-size: 16px;
}

.preferred-card__action ion-spinner {
  --color: currentColor;
  width: 16px;
  height: 16px;
}
</style>
