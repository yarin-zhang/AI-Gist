<template>
  <div v-if="shouldShow" class="auto-sync-status" :class="statusClass">
    <NIcon :size="16" class="status-icon">
      <Refresh v-if="status.isSyncing" />
      <Cloud v-else-if="isOnline && !status.lastSyncError" />
      <CloudOff v-else-if="!isOnline" />
      <RefreshAlert v-else />
    </NIcon>
    
    <span class="status-text">{{ statusText }}</span>
    
    <!-- 同步进度条 -->
    <div v-if="status.isSyncing" class="sync-progress">
      <div class="progress-bar"></div>
    </div>
    
    <!-- 错误详情 -->
    <NPopover v-if="status.lastSyncError" trigger="hover" placement="top">
      <template #trigger>
        <NIcon :size="14" class="error-icon">
          <AlertCircle />
        </NIcon>
      </template>
      <div class="error-details">
        <div class="error-title">同步错误</div>
        <div class="error-message">{{ status.lastSyncError }}</div>
        <div class="error-actions">
          <NButton size="tiny" type="primary" @click="retrySync">
            重试同步
          </NButton>
        </div>
      </div>
    </NPopover>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { NIcon, NPopover, NButton } from 'naive-ui';
import { 
  Refresh, 
  Cloud, 
  CloudOff, 
  RefreshAlert,
  AlertCircle 
} from '@vicons/tabler';
import { autoSyncManager } from '@/lib/utils/auto-sync-manager';
import type { SyncStatus } from '@/lib/utils/auto-sync-manager';

const props = withDefaults(defineProps<{
  showWhenIdle?: boolean; // 是否在空闲时也显示
  position?: 'fixed' | 'relative';
}>(), {
  showWhenIdle: false,
  position: 'fixed'
});

const status = ref<SyncStatus>({
  isOnline: navigator.onLine,
  isSyncing: false,
  lastSyncTime: null,
  lastSyncError: null,
  pendingSyncCount: 0
});

const isOnline = computed(() => status.value.isOnline);

const shouldShow = computed(() => {
  // 如果设置为总是显示，则显示
  if (props.showWhenIdle) return true;
  
  // 如果正在同步，显示
  if (status.value.isSyncing) return true;
  
  // 如果有错误，显示
  if (status.value.lastSyncError) return true;
  
  // 如果离线，显示
  if (!status.value.isOnline) return true;
  
  // 如果有待同步的任务，显示
  if (status.value.pendingSyncCount > 0) return true;
  
  return false;
});

const statusClass = computed(() => {
  const classes = ['auto-sync-status'];
  
  if (props.position === 'fixed') {
    classes.push('fixed');
  }
  
  if (status.value.isSyncing) {
    classes.push('syncing');
  } else if (status.value.lastSyncError) {
    classes.push('error');
  } else if (!status.value.isOnline) {
    classes.push('offline');
  } else {
    classes.push('success');
  }
  
  return classes;
});

const statusText = computed(() => {
  if (status.value.isSyncing) {
    return '同步中...';
  }
  
  if (status.value.lastSyncError) {
    return '同步失败';
  }
  
  if (!status.value.isOnline) {
    return '离线';
  }
  
  if (status.value.pendingSyncCount > 0) {
    return `待同步 ${status.value.pendingSyncCount} 项`;
  }
  
  if (status.value.lastSyncTime) {
    const syncTime = new Date(status.value.lastSyncTime);
    const now = new Date();
    const diffMs = now.getTime() - syncTime.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) {
      return '刚刚同步';
    } else if (diffMins < 60) {
      return `${diffMins}分钟前同步`;
    } else {
      const diffHours = Math.floor(diffMins / 60);
      return `${diffHours}小时前同步`;
    }
  }
  
  return '已同步';
});

const retrySync = async () => {
  try {
    autoSyncManager.triggerAutoSync('手动重试');
  } catch (error) {
    console.error('重试同步失败:', error);
  }
};

let statusUnsubscribe: (() => void) | null = null;

onMounted(() => {
  // 监听同步状态变化
  statusUnsubscribe = autoSyncManager.addStatusListener((newStatus) => {
    status.value = { ...newStatus };
  });
  
  // 获取初始状态
  status.value = autoSyncManager.getStatus();
  
  // 监听自定义的自动同步错误事件
  const handleAutoSyncError = (event: CustomEvent) => {
    console.warn('收到自动同步错误事件:', event.detail);
  };
  
  window.addEventListener('autoSyncError', handleAutoSyncError as EventListener);
  
  // 清理函数
  onUnmounted(() => {
    if (statusUnsubscribe) {
      statusUnsubscribe();
    }
    window.removeEventListener('autoSyncError', handleAutoSyncError as EventListener);
  });
});
</script>

<style scoped>
.auto-sync-status {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  transition: all 0.3s ease;
  z-index: 1000;
}

.auto-sync-status.fixed {
  position: fixed;
  bottom: 16px;
  right: 16px;
  background: var(--n-card-color);
  border: 1px solid var(--n-border-color);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.auto-sync-status.syncing {
  background: rgba(24, 160, 88, 0.1);
  border-color: var(--n-success-color);
  color: var(--n-success-color);
}

.auto-sync-status.success {
  background: rgba(24, 160, 88, 0.1);
  border-color: var(--n-success-color);
  color: var(--n-success-color);
}

.auto-sync-status.error {
  background: rgba(208, 48, 80, 0.1);
  border-color: var(--n-error-color);
  color: var(--n-error-color);
}

.auto-sync-status.offline {
  background: rgba(250, 194, 102, 0.1);
  border-color: var(--n-warning-color);
  color: var(--n-warning-color);
}

.status-icon {
  flex-shrink: 0;
}

.status-text {
  white-space: nowrap;
  font-weight: 500;
}

.sync-progress {
  width: 60px;
  height: 2px;
  background: rgba(255, 255, 255, 0.3);
  border-radius: 1px;
  overflow: hidden;
  margin-left: 4px;
}

.progress-bar {
  height: 100%;
  background: currentColor;
  border-radius: 1px;
  animation: progress 1.5s ease-in-out infinite;
}

@keyframes progress {
  0% {
    width: 0%;
    margin-left: 0%;
  }
  50% {
    width: 50%;
    margin-left: 25%;
  }
  100% {
    width: 0%;
    margin-left: 100%;
  }
}

.error-icon {
  cursor: pointer;
  opacity: 0.8;
  transition: opacity 0.2s;
}

.error-icon:hover {
  opacity: 1;
}

.error-details {
  max-width: 300px;
}

.error-title {
  font-weight: 600;
  margin-bottom: 4px;
  color: var(--n-error-color);
}

.error-message {
  font-size: 12px;
  margin-bottom: 8px;
  word-break: break-word;
}

.error-actions {
  display: flex;
  justify-content: flex-end;
}

/* 动画效果 */
.auto-sync-status.syncing .status-icon {
  animation: spin 2s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}
</style>
