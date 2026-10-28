<template>
  <span class="provider-tile" :class="[`provider-tile--${tone}`, `provider-tile--${size}`, `provider-tile--${variant}`]"
    aria-hidden="true">
    <ion-icon v-if="visual.icon" :icon="visual.icon" />
    <template v-else>{{ visual.initial }}</template>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { IonIcon } from '@ionic/vue'
import type { ProviderVisual } from './provider-catalog'

const props = withDefaults(defineProps<{
  visual: ProviderVisual
  /** sm 36（列表行、宫格）/ md 44（详情页头、首选卡片） */
  size?: 'sm' | 'md'
  /** soft：浅色底 + 彩色字；muted：已禁用 */
  variant?: 'soft' | 'muted'
}>(), {
  size: 'sm',
  variant: 'soft'
})

const tone = computed(() => props.visual.tone)
</script>

<style scoped>
.provider-tile {
  --tile-color: var(--category-blue);
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--tile-color) 14%, var(--surface-primary));
  color: var(--tile-color);
  font-weight: 700;
  line-height: 1;
}

.provider-tile--blue { --tile-color: var(--category-blue); }
.provider-tile--orange { --tile-color: var(--category-orange); }
.provider-tile--pink { --tile-color: var(--category-pink); }
.provider-tile--violet { --tile-color: var(--category-violet); }
.provider-tile--green { --tile-color: var(--category-green); }
.provider-tile--teal { --tile-color: var(--category-teal); }
.provider-tile--amber { --tile-color: var(--category-amber); }
.provider-tile--grey { --tile-color: var(--content-tertiary); }

.provider-tile--sm {
  width: 36px;
  height: 36px;
  border-radius: 11px;
  font-size: 16px;
}

.provider-tile--md {
  width: 44px;
  height: 44px;
  border-radius: 14px;
  font-size: 18px;
}

.provider-tile ion-icon {
  font-size: 1.15em;
}

.provider-tile--muted {
  background: var(--surface-tertiary);
  color: var(--content-muted);
}
</style>
