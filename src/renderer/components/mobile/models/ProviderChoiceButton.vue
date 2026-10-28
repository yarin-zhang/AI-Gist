<template>
  <button type="button" class="provider-choice" :class="{ 'is-selected': selected }" :aria-pressed="selected"
    @click="emit('select')">
    <ProviderTile :visual="visual" />
    <span class="provider-choice__label">{{ label }}</span>
  </button>
</template>

<script setup lang="ts">
import ProviderTile from './ProviderTile.vue'
import type { ProviderVisual } from './provider-catalog'

// selected 不传（如「全部」入口）时不是可选项，不输出 aria-pressed
withDefaults(defineProps<{
  visual: ProviderVisual
  label: string
  selected?: boolean
}>(), {
  selected: undefined
})

const emit = defineEmits<{ select: [] }>()
</script>

<style scoped>
/* 服务商宫格里的一格：方块 + 两行以内的名称；选中时描一圈主色 */
.provider-choice {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  min-width: 0;
  min-height: 92px;
  padding: 14px 4px 12px;
  border: 0;
  border-radius: 16px;
  background: var(--surface-primary);
  box-shadow: var(--shadow-card);
  color: var(--content-secondary);
  font: inherit;
  cursor: pointer;
}

.provider-choice:active {
  background: var(--surface-secondary);
}

.provider-choice.is-selected {
  box-shadow: inset 0 0 0 2px var(--accent-primary), var(--shadow-card);
  color: var(--accent-primary);
}

.provider-choice__label {
  display: -webkit-box;
  max-width: 100%;
  overflow: hidden;
  font-size: var(--m-font-caption);
  font-weight: 500;
  line-height: 1.3;
  text-align: center;
  word-break: break-word;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.provider-choice.is-selected .provider-choice__label {
  font-weight: 600;
}
</style>
