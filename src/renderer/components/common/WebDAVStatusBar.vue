<template>
  <div class="webdav-status-bar">
    <NFlex justify="space-between" align="center" style="height: 100%; padding: 0 16px;">
      <!-- 左侧：同步状态 -->
      <NFlex align="center" :size="12">
        <NIcon :size="16" :color="statusIconColor">
          <component :is="statusIcon" />
        </NIcon>
        <span class="status-text">{{ statusText }}</span>
        
        <!-- 同步进度 -->
        <div v-if="isSyncing" class="sync-progress-container">
          <div class="sync-progress-bar">
            <div class="sync-progress-fill"></div>
          </div>
        </div>
      </NFlex>
      
      <!-- 右侧：操作按钮和信息 -->
      <NFlex align="center" :size="12">
        <!-- 最后同步时间 -->
        <NText v-if="lastSyncTime" depth="3" style="font-size: 12px;">
          {{ formatSyncTime(lastSyncTime) }}
        </NText>
        
        <!-- 手动同步按钮 -->
        <NButton 
          v-if="webdavConfig.enabled" 
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
        
        <!-- 错误详情 -->
        <NPopover v-if="lastSyncError" trigger="hover" placement="top">
          <template #trigger>
            <NButton size="tiny" type="error" text>
              <template #icon>
                <NIcon>
                  <AlertCircle />
                </NIcon>
              </template>
              查看错误
            </NButton>
          </template>
          <div class="error-details">
            <div class="error-title">同步错误详情</div>
            <div class="error-message">{{ lastSyncError }}</div>
            <div class="error-time">{{ formatSyncTime(lastSyncErrorTime) }}</div>
          </div>
        </NPopover>
        
        <!-- 设置按钮 -->
        <NButton size="tiny" text @click="openWebDAVSettings">
          <template #icon>
            <NIcon>
              <Settings />
            </NIcon>
          </template>
          WebDAV 设置
        </NButton>
      </NFlex>
    </NFlex>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { NFlex, NIcon, NText, NButton, NPopover, useMessage } from 'naive-ui';
import { 
  Cloud, 
  CloudOff, 
  Refresh, 
  RefreshAlert,
  AlertCircle,
  Settings,
  Clock
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

const statusIcon = computed(() => {
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

const statusIconColor = computed(() => {
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

const statusText = computed(() => {
  if (!webdavConfig.value.enabled) {
    return 'WebDAV 同步已关闭';
  }
  if (isSyncing.value) {
    return '正在同步...';
  }
  if (lastSyncError.value) {
    return '同步失败';
  }
  if (!isOnline.value) {
    return '网络离线';
  }
  if (syncStatus.value.pendingSyncCount > 0) {
    return `待同步 ${syncStatus.value.pendingSyncCount} 项`;
  }
  if (lastSyncTime.value) {
    return '同步正常';
  }
  return 'WebDAV 同步已启用';
});

// 方法
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

const triggerManualSync = async () => {
  try {
    message.info('开始手动同步...');
    autoSyncManager.triggerAutoSync('手动触发');
  } catch (error) {
    console.error('手动同步失败:', error);
    message.error('手动同步失败');
  }
};

const openWebDAVSettings = () => {
  emit('openSettings');
};

// 监听同步状态变化
let statusUnsubscribe: (() => void) | null = null;

const updateSyncStatus = (status: SyncStatus) => {
  syncStatus.value = { ...status };
};

const loadWebDAVConfig = async () => {
  try {
    // 从应用设置中加载 WebDAV 配置
    const { databaseServiceManager } = await import('@/lib/services');
    const settings = await databaseServiceManager.appSettings.getAllSettings();
    
    const webdavSettings = settings.find(s => s.key === 'webdav');
    if (webdavSettings?.value) {
      const config = JSON.parse(webdavSettings.value);
      webdavConfig.value = {
        enabled: config.enabled || false,
        serverUrl: config.serverUrl || '',
        lastSyncTime: config.lastSyncTime || null,
        lastSyncError: config.lastSyncError || null,
        lastSyncErrorTime: config.lastSyncErrorTime || null
      };
    }
  } catch (error) {
    console.error('加载 WebDAV 配置失败:', error);
  }
};

onMounted(async () => {
  // 加载配置
  await loadWebDAVConfig();
  
  // 监听同步状态
  statusUnsubscribe = autoSyncManager.onStatusChange(updateSyncStatus);
  
  // 获取初始状态
  updateSyncStatus(autoSyncManager.getStatus());
  
  // 监听网络状态
  const handleOnline = () => {
    syncStatus.value.isOnline = true;
  };
  
  const handleOffline = () => {
    syncStatus.value.isOnline = false;
  };
  
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);
  
  // 清理函数
  onUnmounted(() => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  });
});

onUnmounted(() => {
  if (statusUnsubscribe) {
    statusUnsubscribe();
  }
});
</script>

<style scoped>
.webdav-status-bar {
  height: 32px;
  background-color: var(--n-color);
  border-top: 1px solid var(--n-border-color);
  font-size: 12px;
}

.status-text {
  font-size: 12px;
  color: var(--n-text-color);
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
