<template>
  <div class="status-bar">
    <NFlex justify="space-between" align="center" style="height: 100%; padding: 0 16px;">
      <!-- 左侧 -->
      <NFlex align="center" :size="12">
        <NText></NText>
      </NFlex>
      
      <!-- 右侧：操作按钮和信息 -->
      <NFlex align="center" :size="12">

        <!-- 最后同步时间 -->
        <NText v-if="showLastSyncTime" depth="3" style="font-size: 12px;">
          {{ formatSyncTime(lastSyncTime) }}
        </NText>

        <!-- 同步进度条 -->
        <div v-if="isSyncing" class="sync-progress-container">
          <div class="sync-progress-bar">
            <div class="sync-progress-fill"></div>
          </div>
        </div>

        <!-- 手动同步按钮 -->
        <NButton 
          v-if="showManualSyncButton" 
          size="tiny" 
          text 
          @click="triggerManualSync"
          :loading="isSyncing"
        >
          <template #icon>
            <NIcon>
              <Refresh />
            </NIcon>
          </template>
          手动同步
        </NButton>
        
        
        <!-- 状态图标 -->
        <NTooltip :show-arrow="false" placement="top">
          <template #trigger>
            <NIcon 
              :size="16" 
              :color="statusIconColor"
              class="status-icon"
              :class="{ spinning: isSyncing }"
              @click="handleStatusClick"
              style="cursor: pointer;"
            >
              <component :is="statusIcon" />
            </NIcon>
          </template>
          <div>{{ statusTooltip }}</div>
        </NTooltip>
        <!-- 状态文本 -->
        <span class="status-text" @click="handleStatusClick" style="cursor: pointer;">
          {{ statusText }}
        </span>
        
        
        <!-- 错误详情 -->
        <NPopover v-if="lastSyncError" trigger="hover" placement="top">
          <template #trigger>
            <NButton size="tiny" type="error" text @click="retrySync">
              <template #icon>
                <NIcon>
                  <AlertCircle />
                </NIcon>
              </template>
              重试
            </NButton>
          </template>
          <div class="error-details">
            <div class="error-title">同步错误详情</div>
            <div class="error-message">{{ lastSyncError }}</div>
            <div class="error-time" v-if="lastSyncErrorTime">
              {{ formatSyncTime(lastSyncErrorTime) }}
            </div>
          </div>
        </NPopover>
      </NFlex>
    </NFlex>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { NFlex, NIcon, NText, NButton, NPopover, NTooltip, useMessage } from 'naive-ui';
import { 
  Cloud, 
  CloudOff, 
  Refresh, 
  RefreshAlert,
  AlertCircle,
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

// 状态文本
const statusText = computed(() => {
  if (!isWebDAVConfigured.value) {
    return 'Local';
  }
  
  if (!webdavConfig.value.enabled) {
    return 'WebDAV 已关闭';
  }
  
  if (!isOnline.value) {
    return '离线';
  }
  
  if (isSyncing.value) {
    return '同步中';
  }
  
  if (lastSyncError.value) {
    return '同步失败';
  }
  
  if (syncStatus.value.pendingSyncCount > 0) {
    return `待同步 ${syncStatus.value.pendingSyncCount} 项`;
  }
  
  if (lastSyncTime.value) {
    return '已同步';
  }
  
  return 'WebDAV';
});

// 是否显示最后同步时间
const showLastSyncTime = computed(() => {
  return isWebDAVConfigured.value && webdavConfig.value.enabled && lastSyncTime.value;
});

// 是否显示手动同步按钮
const showManualSyncButton = computed(() => {
  return isWebDAVConfigured.value && webdavConfig.value.enabled;
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
.status-bar {
  height: 32px;
  background-color: var(--n-color);
  border-top: 1px solid var(--n-border-color);
  font-size: 12px;
}

.status-text {
  font-size: 12px;
  color: var(--n-text-color);
  user-select: none;
}

.status-icon {
  transition: transform 0.3s ease;
}

.status-icon.spinning {
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

.sync-progress-container {
  width: 60px;
  height: 4px;
  background-color: var(--n-border-color);
  border-radius: 2px;
  overflow: hidden;
  margin-left: 8px;
}

.sync-progress-bar {
  width: 100%;
  height: 100%;
  position: relative;
}

.sync-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #1890ff, #40a9ff);
  border-radius: 2px;
  animation: progress-slide 2s infinite;
  width: 30%;
}

@keyframes progress-slide {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(300%);
  }
}

.error-details {
  max-width: 300px;
}

.error-title {
  font-weight: bold;
  margin-bottom: 8px;
  color: var(--n-text-color);
}

.error-message {
  margin-bottom: 8px;
  word-break: break-word;
  color: var(--n-text-color-2);
}

.error-time {
  font-size: 11px;
  color: var(--n-text-color-3);
}
</style>
