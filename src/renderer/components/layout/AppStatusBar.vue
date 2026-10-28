<template>
  <footer class="app-status-bar">
    <CloudSyncStatusIndicator @activate="emit('open-settings', 'cloud-backup')" />
    <span class="app-status-bar__spacer" />

    <NTooltip v-if="launcher.available && launcher.label.value" placement="top-end" :show-arrow="false">
      <template #trigger>
        <button type="button" class="app-status-bar__item" @click="handleLauncher">
          {{ t('mainPage.statusBar.launcher', { shortcut: launcher.label.value }) }}
        </button>
      </template>
      {{ launcherTooltip }}
    </NTooltip>

    <button
      v-if="cliRunning"
      type="button"
      class="app-status-bar__item"
      @click="emit('open-settings', 'cli-bridge')"
    >
      {{ t('mainPage.statusBar.cliEnabled') }}
    </button>

    <span v-if="currentVersion" class="app-status-bar__version">v{{ currentVersion }}</span>
  </footer>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { NTooltip } from 'naive-ui'
import CloudSyncStatusIndicator from '~/components/common/CloudSyncStatusIndicator.vue'
import { useLauncherShortcut } from '~/composables/useLauncherShortcut'
import { useUpdate } from '~/composables/useUpdate'

const emit = defineEmits<{
  'open-settings': [section: string]
}>()

const { t } = useI18n()
const launcher = useLauncherShortcut()
const { currentVersion, initVersion } = useUpdate()
const cliRunning = ref(false)

const launcherTooltip = computed(() => {
  const shortcut = launcher.label.value
  switch (launcher.status.value) {
    case 'disabled': return t('shortcuts.launcherStatusDisabled', { shortcut })
    case 'unavailable': return t('shortcuts.launcherStatusUnavailable', { shortcut })
    case 'unset': return t('shortcuts.launcherStatusNotSet')
    default: return t('shortcuts.launcherStatusHint', { shortcut })
  }
})

// 快捷键可用时直接打开启动器；没设置或注册失败时带用户去快捷键设置
async function handleLauncher(): Promise<void> {
  if (launcher.status.value === 'ready') {
    await launcher.openLauncher()
    return
  }
  emit('open-settings', 'shortcuts')
}

async function refreshCliStatus(): Promise<void> {
  const cliBridge = window.electronAPI?.cliBridge
  if (!cliBridge) return
  try {
    const status = await cliBridge.getStatus()
    cliRunning.value = status.enabled && status.running
  } catch {
    cliRunning.value = false
  }
}

// CLI 和快捷键没有变更事件，窗口重新获得焦点时刷新一次
function handleFocus(): void {
  void refreshCliStatus()
  void launcher.refresh()
}

onMounted(async () => {
  window.addEventListener('focus', handleFocus)
  void refreshCliStatus()
  await initVersion()
})

onBeforeUnmount(() => {
  window.removeEventListener('focus', handleFocus)
})
</script>

<style scoped>
.app-status-bar {
  position: relative;
  z-index: 10;
  display: flex;
  flex: none;
  align-items: center;
  gap: 16px;
  height: var(--statusbar-height);
  padding: 0 12px;
  border-top: 1px solid var(--border-default);
  background: var(--surface-secondary);
  color: var(--content-secondary);
  font-size: var(--font-size-xs);
}

.app-status-bar__spacer {
  flex: 1;
}

.app-status-bar__item {
  height: 20px;
  padding: 0 6px;
  margin: 0 -6px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font: inherit;
  white-space: nowrap;
  cursor: pointer;
}

.app-status-bar__item:hover,
.app-status-bar__item:focus-visible {
  outline: none;
  background: var(--surface-tertiary);
  color: var(--content-primary);
}

.app-status-bar__version {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
</style>
