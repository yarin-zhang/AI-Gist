<template>
  <div class="status-bar">
    <NFlex class="status-bar-content" align="center" justify="end">
      <!-- 左侧：预留扩展空间 -->
      <NFlex class="status-bar-left" align="center" gap="8px">
      </NFlex>

      <!-- 右侧：状态指示器组 -->
      <NFlex class="status-bar-right" align="center" gap="8px">
        <CloudSyncStatusIndicator @activate="handleOpenSettings('cloud-backup')" />
        <PromptLauncherStatusIndicator
          v-if="capabilities.globalShortcuts"
          @activate="handleOpenSettings('shortcuts')"
        />
      </NFlex>
    </NFlex>
  </div>
</template>

<script setup lang="ts">
import { NFlex } from 'naive-ui'
import CloudSyncStatusIndicator from '~/components/common/CloudSyncStatusIndicator.vue'
import PromptLauncherStatusIndicator from '~/components/common/PromptLauncherStatusIndicator.vue'
import { PlatformDetector } from '@shared/platform'

const capabilities = PlatformDetector.getCapabilities()

const emit = defineEmits<{
  openSettings: [targetSection?: string];
}>();

const handleOpenSettings = (targetSection?: string) => {
  emit('openSettings', targetSection);
};
</script>

<style scoped>
.status-bar {
  height: 100%;
  background-color: var(--surface-primary);
  font-size: 12px;
  overflow: visible;
}

.status-bar-content {
  height: 100%;
  padding: 0 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  overflow: visible;
}

.status-bar-left {
  display: flex;
  align-items: center;
  height: 100%;
  overflow: hidden;
}

.status-bar-right {
  display: flex;
  align-items: center;
  height: 100%;
  overflow: visible;
}
</style>
