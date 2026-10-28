<template>
  <nav class="app-rail" :aria-label="t('mainPage.rail.navigation')">
    <img :src="appIcon" class="app-rail__logo" alt="AI Gist" />

    <NTooltip v-for="item in primaryItems" :key="item.key" placement="right" :show-arrow="false">
      <template #trigger>
        <button
          type="button"
          class="app-rail__item"
          :class="{ 'is-active': active === item.key }"
          :aria-label="item.label"
          :aria-current="active === item.key ? 'page' : undefined"
          @click="emit('navigate', item.key)"
        >
          <NIcon :size="18"><component :is="item.icon" /></NIcon>
        </button>
      </template>
      {{ item.label }}
    </NTooltip>

    <span class="app-rail__spacer" />

    <NTooltip v-if="showLauncher" placement="right" :show-arrow="false">
      <template #trigger>
        <button
          type="button"
          class="app-rail__item"
          :aria-label="launcherLabel"
          @click="emit('open-launcher')"
        >
          <NIcon :size="18"><Search /></NIcon>
        </button>
      </template>
      {{ launcherLabel }}
    </NTooltip>

    <NTooltip placement="right" :show-arrow="false">
      <template #trigger>
        <button
          type="button"
          class="app-rail__item"
          :class="{ 'is-active': active === 'settings' }"
          :aria-label="t('mainPage.rail.settings')"
          :aria-current="active === 'settings' ? 'page' : undefined"
          @click="emit('navigate', 'settings')"
        >
          <NIcon :size="18"><Settings /></NIcon>
        </button>
      </template>
      {{ t('mainPage.rail.settings') }}
    </NTooltip>
  </nav>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { NIcon, NTooltip } from 'naive-ui'
import { FileText, Robot, Search, Settings } from '@vicons/tabler'
import type { AppView } from './types'
import appIcon from '~/assets/images/logo.png'

const props = withDefaults(defineProps<{
  active: AppView
  showLauncher?: boolean
  launcherShortcut?: string
}>(), {
  showLauncher: false,
  launcherShortcut: ''
})

const emit = defineEmits<{
  navigate: [view: AppView]
  'open-launcher': []
}>()

const { t } = useI18n()

const primaryItems = computed(() => [
  { key: 'prompts' as const, label: t('mainPage.rail.prompts'), icon: FileText },
  { key: 'models' as const, label: t('mainPage.rail.models'), icon: Robot }
])

const launcherLabel = computed(() => (
  props.launcherShortcut
    ? t('mainPage.rail.launcherWithShortcut', { shortcut: props.launcherShortcut })
    : t('mainPage.rail.launcher')
))
</script>

<style scoped>
.app-rail {
  display: flex;
  flex: none;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  width: var(--rail-width);
  min-height: 0;
  padding: 12px 0;
  border-right: 1px solid var(--border-default);
  background: var(--surface-secondary);
}

.app-rail__logo {
  display: block;
  flex: none;
  width: 28px;
  height: 28px;
  margin-bottom: 10px;
  border-radius: 6px;
}

.app-rail__spacer {
  flex: 1;
}

.app-rail__item {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
  border: 0;
  border-radius: var(--radius-panel);
  background: transparent;
  color: var(--content-tertiary);
  cursor: pointer;
}

.app-rail__item:hover {
  background: var(--surface-tertiary);
  color: var(--content-primary);
}

.app-rail__item:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.app-rail__item.is-active {
  background: var(--accent-soft);
  color: var(--accent-primary);
}
</style>
