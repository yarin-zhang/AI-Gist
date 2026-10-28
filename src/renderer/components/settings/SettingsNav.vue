<template>
  <nav class="settings-nav" :aria-label="t('settings.settingsMenu')">
    <span class="ui-title-section settings-nav__title">{{ t('settings.title') }}</span>
    <template v-for="group in groups" :key="group.key">
      <span class="ui-overline settings-nav__group">{{ group.label }}</span>
      <button v-for="item in group.items" :key="item.key" type="button" class="settings-nav__item"
        :class="{ 'is-active': item.key === active }" :aria-current="item.key === active ? 'page' : undefined"
        @click="emit('select', item.key)">
        <NIcon :size="16" class="settings-nav__icon"><component :is="item.icon" /></NIcon>
        <span>{{ item.label }}</span>
      </button>
    </template>
  </nav>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { NIcon } from 'naive-ui'
import type { SettingsNavGroup } from './types'

defineProps<{
  groups: SettingsNavGroup[]
  active: string
}>()

const emit = defineEmits<{ select: [key: string] }>()
const { t } = useI18n()
</script>

<style scoped>
.settings-nav {
  display: flex;
  flex: none;
  flex-direction: column;
  gap: 2px;
  width: var(--nav-width);
  min-height: 0;
  padding: 16px 12px;
  overflow-y: auto;
  border-right: 1px solid var(--border-default);
  background: var(--surface-secondary);
}

.settings-nav__title {
  padding: 0 10px 10px;
}

.settings-nav__group {
  padding: 10px 10px 4px;
}

.settings-nav__item {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 32px;
  padding: 0 10px;
  border: 0;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--content-secondary);
  font: inherit;
  font-size: var(--font-size-base);
  text-align: left;
  cursor: pointer;
}

.settings-nav__item:hover {
  background: var(--surface-tertiary);
  color: var(--content-primary);
}

.settings-nav__item:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.settings-nav__icon {
  color: var(--content-tertiary);
}

.settings-nav__item.is-active {
  background: var(--accent-soft);
  color: var(--accent-soft-text);
  font-weight: var(--font-weight-medium);
}

.settings-nav__item.is-active .settings-nav__icon {
  color: var(--accent-primary);
}
</style>
