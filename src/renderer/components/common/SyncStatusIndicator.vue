<template>
  <NTooltip :show-arrow="false" placement="top">
    <template #trigger>
      <div 
        class="sync-status-indicator"
        @click="handleStatusClick"
      >
        <!-- 圆形进度环/状态环 -->
        <div class="status-ring" :class="statusRingClass">
          <svg class="progress-ring" viewBox="0 0 24 24">
            <circle
              class="progress-ring-bg"
              cx="12"
              cy="12"
              r="10"
              fill="none"
              :stroke="statusRingBackgroundColor"
              stroke-width="2"
            />
            <circle
              v-if="isSyncing"
              class="progress-ring-progress"
              cx="12"
              cy="12"
              r="10"
              fill="none"
              :stroke="statusIconColor"
              stroke-width="2"
              stroke-linecap="round"
              :stroke-dasharray="progressRingDashArray"
              :stroke-dashoffset="progressRingDashOffset"
            />
          </svg>
          
          <!-- 中心图标 -->
          <NIcon 
            :size="12" 
            :color="statusIconColor"
            class="status-icon"
            :class="{ spinning: isSyncing }"
          >
            <component :is="statusIcon" />
          </NIcon>
        </div>
      </div>
    </template>
    <div class="status-tooltip">
      <div class="tooltip-title">{{ statusTooltip }}</div>
      <div v-if="showLastSyncTime" class="tooltip-time">
        {{ formatSyncTime(lastSyncTime) }}
      </div>
      <div v-if="lastSyncError" class="tooltip-error">
        {{ lastSyncError }}
      </div>
      <div v-if="!isWebDAVConfigured" class="tooltip-hint">
        点击配置 WebDAV 同步
      </div>
      <div v-else-if="lastSyncError" class="tooltip-hint">
        点击重试同步
      </div>
      <div v-else-if="showManualSyncButton && !isSyncing" class="tooltip-hint">
        点击手动同步
      </div>
    </div>
  </NTooltip>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { NIcon, NTooltip, useMessage } from 'naive-ui';
import { 
  Cloud, 
  CloudOff, 
  Refresh, 
  RefreshAlert,
  Home
} from '@vicons/tabler';
import { autoSyncManager } from '@/lib/utils/auto-sync-manager';
import type { SyncStatus } from '@/lib/utils/auto-sync-manager';

const emit = defineEmits<{
  openSettings: [];
}>();

const message = useMessage();

// 状态数据
const syncStatus = ref<SyncStatus>({
  isOnline: navigator.onLine,
  isSyncing: false,
  lastSyncTime: null,
  lastSyncError: null,
  pendingSyncCount: 0
});

const webdavConfig = ref({
  enabled: false,
  serverUrl: '',
  lastSyncTime: null as string | null,
  lastSyncError: null as string | null,
  lastSyncErrorTime: null as string | null
});

// 计算属性
const isSyncing = computed(() => syncStatus.value.isSyncing);
const isOnline = computed(() => syncStatus.value.isOnline);
const lastSyncTime = computed(() => syncStatus.value.lastSyncTime || webdavConfig.value.lastSyncTime);
const lastSyncError = computed(() => syncStatus.value.lastSyncError || webdavConfig.value.lastSyncError);
const lastSyncErrorTime = computed(() => webdavConfig.value.lastSyncErrorTime);

// 判断是否配置了 WebDAV
const isWebDAVConfigured = computed(() => {
  return webdavConfig.value.serverUrl && webdavConfig.value.serverUrl.trim() !== '';
});

// 状态图标
const statusIcon = computed(() => {
  if (!isWebDAVConfigured.value) {
    return Home; // 本地模式图标
  }
  if (!webdavConfig.value.enabled) {
    return CloudOff;
  }
  if (isSyncing.value) {
    return Refresh;
  }
  if (lastSyncError.value) {
    return RefreshAlert;
  }
  if (!isOnline.value) {
    return CloudOff;
  }
  return Cloud;
});

// 状态图标颜色
const statusIconColor = computed(() => {
  if (!isWebDAVConfigured.value) {
    return '#999'; // 灰色表示本地模式
  }
  if (!webdavConfig.value.enabled) {
    return '#999';
  }
  if (isSyncing.value) {
    return '#1890ff';
  }
  if (lastSyncError.value) {
    return '#ff4d4f';
  }
  if (!isOnline.value) {
    return '#faad14';
  }
  return '#52c41a';
});

// 状态提示文本
const statusTooltip = computed(() => {
  if (!isWebDAVConfigured.value) {
    return '本地模式 - 未配置 WebDAV';
  }
  if (!webdavConfig.value.enabled) {
    return 'WebDAV 同步已关闭';
  }
  if (!isOnline.value) {
    return '网络离线';
  }
  if (isSyncing.value) {
    return '正在同步数据...';
  }
  if (lastSyncError.value) {
    return '同步失败，点击查看详情';
  }
  if (syncStatus.value.pendingSyncCount > 0) {
    return `有 ${syncStatus.value.pendingSyncCount} 项数据待同步`;
  }
  if (lastSyncTime.value) {
    return '同步正常';
  }
  return 'WebDAV 已配置';
});

// 是否显示最后同步时间
const showLastSyncTime = computed(() => {
  return isWebDAVConfigured.value && webdavConfig.value.enabled && lastSyncTime.value;
});

// 是否显示手动同步按钮
const showManualSyncButton = computed(() => {
  return isWebDAVConfigured.value && webdavConfig.value.enabled;
});

// 状态环样式类
const statusRingClass = computed(() => {
  const classes = [];
  if (isSyncing.value) {
    classes.push('syncing');
  }
  if (lastSyncError.value) {
    classes.push('error');
  }
  return classes;
});

// 状态环背景颜色
const statusRingBackgroundColor = computed(() => {
  return '#e5e5e5';
});

// 圆形进度条相关计算
const progressRingDashArray = computed(() => {
  const circumference = 2 * Math.PI * 10; // r=10
  return `${circumference} ${circumference}`;
});

const progressRingDashOffset = computed(() => {
  const circumference = 2 * Math.PI * 10;
  // 创建一个动态的进度效果
  return circumference * 0.75; // 显示 25% 的进度
});

// 格式化同步时间
const formatSyncTime = (timeStr: string | null) => {
  if (!timeStr) return '';
  
  const time = new Date(timeStr);
  const now = new Date();
  const diffMs = now.getTime() - time.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) {
    return '刚刚同步';
  } else if (diffMins < 60) {
    return `${diffMins}分钟前`;
  } else {
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) {
      return `${diffHours}小时前`;
    } else {
      return time.toLocaleDateString();
    }
  }
};

// 处理状态点击
const handleStatusClick = () => {
  if (!isWebDAVConfigured.value) {
    // 未配置时点击打开设置
    openWebDAVSettings();
  } else if (lastSyncError.value) {
    // 有错误时点击重试
    retrySync();
  } else if (isWebDAVConfigured.value && webdavConfig.value.enabled && !isSyncing.value) {
    // 已配置且未在同步时点击手动同步
    triggerManualSync();
  }
};

// 手动同步
const triggerManualSync = async () => {
  try {
    message.info('开始手动同步...');
    autoSyncManager.forceTriggerSync('手动触发');
  } catch (error) {
    console.error('手动同步失败:', error);
    message.error('手动同步失败');
  }
};

// 重试同步
const retrySync = async () => {
  try {
    message.info('重试同步...');
    autoSyncManager.forceTriggerSync('手动重试');
  } catch (error) {
    console.error('重试同步失败:', error);
    message.error('重试同步失败');
  }
};

// 打开设置
const openWebDAVSettings = () => {
  emit('openSettings');
};

// 监听同步状态变化
const updateSyncStatus = (status: SyncStatus) => {
  syncStatus.value = { ...status };
};

// 加载 WebDAV 配置
const loadWebDAVConfig = async () => {
  try {
    const userPrefs = await window.electronAPI?.preferences?.get();
    
    if (userPrefs?.webdav) {
      webdavConfig.value = {
        enabled: userPrefs.webdav.enabled || false,
        serverUrl: userPrefs.webdav.serverUrl || '',
        lastSyncTime: userPrefs.dataSync?.lastSyncTime || null,
        lastSyncError: null,
        lastSyncErrorTime: null
      };
    } else {
      webdavConfig.value = {
        enabled: false,
        serverUrl: '',
        lastSyncTime: null,
        lastSyncError: null,
        lastSyncErrorTime: null
      };
    }
  } catch (error) {
    console.error('加载 WebDAV 配置失败:', error);
    webdavConfig.value = {
      enabled: false,
      serverUrl: '',
      lastSyncTime: null,
      lastSyncError: null,
      lastSyncErrorTime: null
    };
  }
};

onMounted(async () => {
  // 加载配置
  await loadWebDAVConfig();
  
  // 监听同步状态
  autoSyncManager.addStatusListener(updateSyncStatus);
  
  // 获取初始状态
  updateSyncStatus(autoSyncManager.getStatus());
  
  // 监听网络状态
  const handleOnline = () => {
    syncStatus.value.isOnline = true;
  };
  
  const handleOffline = () => {
    syncStatus.value.isOnline = false;
  };
  
  // 监听 WebDAV 配置变更
  const handleConfigChange = async () => {
    await loadWebDAVConfig();
  };
  
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  window.addEventListener('webdav-config-changed', handleConfigChange);
  
  // 清理函数
  onUnmounted(() => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
    window.removeEventListener('webdav-config-changed', handleConfigChange);
  });
});

onUnmounted(() => {
  autoSyncManager.removeStatusListener(updateSyncStatus);
});
</script>

<style scoped>
/* 同步状态指示器 */
.sync-status-indicator {
  cursor: pointer;
  transition: opacity 0.2s ease;
  user-select: none;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.sync-status-indicator:hover {
  opacity: 0.8;
}

.sync-status-indicator:active {
  opacity: 0.6;
}

/* 状态环容器 */
.status-ring {
  position: relative;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 圆形进度环 */
.progress-ring {
  position: absolute;
  width: 20px;
  height: 20px;
  transform: rotate(-90deg);
}

.progress-ring-bg {
  opacity: 0.2;
}

.progress-ring-progress {
  transition: stroke-dashoffset 0.3s ease;
  animation: progress-rotate 2s linear infinite;
}

/* 同步中的旋转动画 */
.status-ring.syncing .progress-ring {
  animation: ring-rotate 2s linear infinite;
}

@keyframes ring-rotate {
  from {
    transform: rotate(-90deg);
  }
  to {
    transform: rotate(270deg);
  }
}

@keyframes progress-rotate {
  0% {
    stroke-dashoffset: 62.83; /* 完整圆周 */
  }
  50% {
    stroke-dashoffset: 15.71; /* 75% 进度 */
  }
  100% {
    stroke-dashoffset: 62.83;
  }
}

/* 中心图标 */
.status-icon {
  transition: all 0.3s ease;
  z-index: 1;
}

.status-icon.spinning {
  animation: icon-spin 2s linear infinite;
}

@keyframes icon-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* 错误状态的脉冲效果 */
.status-ring.error {
  animation: error-pulse 2s ease-in-out infinite;
}

@keyframes error-pulse {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(255, 77, 79, 0.4);
  }
  50% {
    box-shadow: 0 0 0 4px rgba(255, 77, 79, 0);
  }
}

/* Tooltip 样式 */
.status-tooltip {
  max-width: 200px;
  text-align: center;
}

.tooltip-title {
  font-weight: 500;
  margin-bottom: 4px;
  color: var(--n-text-color);
}

.tooltip-time {
  font-size: 11px;
  color: var(--n-text-color-2);
  margin-bottom: 2px;
}

.tooltip-error {
  font-size: 11px;
  color: var(--n-error-color);
  margin-bottom: 4px;
  word-break: break-word;
}

.tooltip-hint {
  font-size: 10px;
  color: var(--n-text-color-3);
  opacity: 0.8;
}
</style>
