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

    <NTooltip v-if="hasUpdate" placement="top-end" :show-arrow="false">
      <template #trigger>
        <button type="button" class="app-status-bar__item app-status-bar__update" @click="handleOpenRelease">
          <NIcon :size="14" aria-hidden="true"><ArrowUpCircle /></NIcon>
          {{ t('mainPage.statusBar.updateAvailable', { version: latestVersionLabel }) }}
        </button>
      </template>
      {{ updateTooltip }}
    </NTooltip>

    <span v-if="currentVersion" class="app-status-bar__version">v{{ currentVersion }}</span>
  </footer>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { NIcon, NTooltip, useMessage } from 'naive-ui'
import { ArrowUpCircle } from '@vicons/tabler'
import CloudSyncStatusIndicator from '~/components/common/CloudSyncStatusIndicator.vue'
import { useLauncherShortcut } from '~/composables/useLauncherShortcut'
import { LATEST_RELEASE_URL, startAutoUpdateCheck, useUpdate } from '~/composables/useUpdate'

const emit = defineEmits<{
  'open-settings': [section: string]
}>()

const { t } = useI18n()
const message = useMessage()
const launcher = useLauncherShortcut()
const {
  currentVersion,
  initVersion,
  hasUpdate,
  latestVersion,
  downloadUrl,
  publishedAt,
  openDownloadPage
} = useUpdate()
const cliRunning = ref(false)
let stopAutoUpdateCheck: (() => void) | null = null

// tag 带不带 v 都显示成 v3.1.0，和右边的当前版本写法一致
const latestVersionLabel = computed(() => `v${latestVersion.value.replace(/^v/, '')}`)
const updateTooltip = computed(() => publishedAt.value
  ? t('mainPage.statusBar.updateTooltip', { date: publishedAt.value })
  : t('about.viewReleaseNotes'))

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

// 打开这个版本的 GitHub Release 页，拿不到地址时打开最新版本的
async function handleOpenRelease(): Promise<void> {
  const result = await openDownloadPage(downloadUrl.value || LATEST_RELEASE_URL)
  if (!result.success) message.error(t('about.openDownloadFailed'))
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
  stopAutoUpdateCheck = startAutoUpdateCheck()
  await initVersion()
})

onBeforeUnmount(() => {
  window.removeEventListener('focus', handleFocus)
  stopAutoUpdateCheck?.()
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

.app-status-bar__update {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

/* 有新版本是状态栏里唯一需要注意的提示，hover 时也保持强调色；
   深色下 --accent-primary 在状态栏底色上太暗，文字用 --accent-text */
.app-status-bar__update,
.app-status-bar__update:hover,
.app-status-bar__update:focus-visible {
  color: var(--accent-text);
}

.app-status-bar__version {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
</style>
