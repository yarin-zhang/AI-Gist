<template>
  <div class="status-bar">
    <NFlex class="status-bar-content" align="center" justify="end">
      <!-- 左侧：预留扩展空间 -->
      <NFlex class="status-bar-left" align="center" gap="8px">
      </NFlex>

      <!-- 右侧：状态指示器组 -->
      <NFlex class="status-bar-right" align="center" gap="8px">
        <!-- 未来可以在这里添加其他指示器 -->
      </NFlex>
    </NFlex>
  </div>
</template>

<script setup lang="ts">
import { NFlex } from 'naive-ui'

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
  background-color: var(--n-color);
  font-size: 12px;
  overflow: hidden;
}

.status-bar-content {
  height: 100%;
  padding: 0 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  overflow: hidden;
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
  overflow: hidden;
}
</style>
