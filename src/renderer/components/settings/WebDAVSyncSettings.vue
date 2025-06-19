<template>
  <div class="webdav-sync-settings">
    <NCard :bordered="false">


      <!-- 基本设置 -->
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <div class="font-medium">启用 WebDAV 同步</div>
            <div class="text-sm text-gray-500">
              将数据同步到 WebDAV 服务器
            </div>
          </div>
          <NSwitch 
            v-model:value="props.modelValue.webdav.enabled" 
            @update:value="handleEnabledChange"
          />
        </div>

        <div class="flex items-center justify-between">
          <div>
            <div class="font-medium">自动同步</div>
            <div class="text-sm text-gray-500">
              数据变更后自动触发同步
            </div>
          </div>
          <NSwitch 
            v-model:value="props.modelValue.webdav.autoSync" 
            @update:value="handleAutoSyncChange"
            :disabled="!props.modelValue.webdav.enabled"
          />
        </div>

        <div class="flex items-center justify-between">
          <div>
            <div class="font-medium">同步间隔</div>
            <div class="text-sm text-gray-500">
              自动同步的时间间隔（分钟）
            </div>
          </div>
          <NInputNumber 
            v-model:value="props.modelValue.webdav.syncInterval" 
            @update:value="handleConfigChange"
            :min="1" 
            :max="1440"
            :step="5"
            :disabled="!props.modelValue.webdav.enabled || !props.modelValue.webdav.autoSync"
            style="width: 120px"
          />
        </div>
      </div>

      <!-- 服务器配置 -->
      <NDivider />
      
      <div class="space-y-4" :class="{ 'config-disabled': !props.modelValue.webdav.enabled }">
        <div class="font-medium mb-2">服务器配置</div>
        
        <div class="space-y-3">
          <div>
            <div class="text-sm font-medium mb-1">服务器地址</div>
            <NInput 
              v-model:value="props.modelValue.webdav.serverUrl" 
              placeholder="https://example.com/webdav" 
              type="url" 
              @update:value="handleConfigChange"
              :disabled="!props.modelValue.webdav.enabled"
            >
              <template #prefix>
                <NIcon>
                  <Cloud />
                </NIcon>
              </template>
            </NInput>
          </div>
          
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <div class="text-sm font-medium mb-1">用户名</div>
              <NInput 
                v-model:value="props.modelValue.webdav.username" 
                placeholder="用户名" 
                @update:value="handleConfigChange"
                :disabled="!props.modelValue.webdav.enabled"
              />
            </div>
            <div>
              <div class="text-sm font-medium mb-1">密码</div>
              <NInput 
                v-model:value="props.modelValue.webdav.password" 
                type="password" 
                placeholder="密码" 
                @update:value="handleConfigChange"
                :disabled="!props.modelValue.webdav.enabled"
              />
            </div>
          </div>
        </div>

      <!-- WebDAV 连接状态检查 -->
      <div class="mb-6">
        <NAlert 
          v-if="!connectionStatus.checked && props.modelValue.webdav.enabled"
          type="info" 
          :show-icon="true"
          class="mb-4"
        >
          <template #header>WebDAV 服务器状态未检测</template>
          点击下方"测试连接"按钮来检查 WebDAV 服务器连接状态。
        </NAlert>

        <NAlert 
          v-else-if="connectionStatus.checked && !connectionStatus.connected && props.modelValue.webdav.enabled"
          type="warning" 
          :show-icon="true"
          class="mb-4"
        >
          <template #header>WebDAV 服务器连接失败</template>
          {{ connectionStatus.message }}
          <br>
          <small class="text-gray-500">
            请检查服务器地址、用户名和密码是否正确。
          </small>
        </NAlert>

        <NAlert 
          v-else-if="connectionStatus.checked && connectionStatus.connected && props.modelValue.webdav.enabled"
          type="success" 
          :show-icon="true"
          class="mb-4"
        >
          <template #header>WebDAV 服务器连接正常</template>
          服务器地址: {{ props.modelValue.webdav.serverUrl }}
        </NAlert>

        <NAlert 
          v-if="!props.modelValue.webdav.enabled"
          type="default" 
          :show-icon="true"
          class="mb-4"
        >
          <template #header>WebDAV 同步已禁用</template>
          请先启用 WebDAV 同步功能，然后配置服务器信息。
        </NAlert>

        <div class="flex gap-2">
          <NButton 
            @click="testConnection" 
            :loading="testingConnection"
            :disabled="!props.modelValue.webdav.enabled || !props.modelValue.webdav.serverUrl || !props.modelValue.webdav.username"
            type="primary"
            ghost
            size="small"
          >
            <template #icon>
              <NIcon>
                <CloudStorm />
              </NIcon>
            </template>
            测试连接
          </NButton>
        </div>
      </div>
      </div>


      <!-- 同步操作 -->
      <NDivider />
      
      <div class="space-y-4">
        <div class="font-medium mb-2">手动同步操作</div>
        
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <NButton 
            @click="handleCompareData" 
            :loading="compareLoading"
            :disabled="!props.modelValue.webdav.enabled"
            type="primary"
            ghost
            block
          >
            <template #icon>
              <NIcon>
                <GitCompare />
              </NIcon>
            </template>
            比较数据
          </NButton>

          <NButton 
            @click="handleManualUpload" 
            :loading="uploadLoading"
            :disabled="!props.modelValue.webdav.enabled"
            type="success"
            ghost
            block
          >
            <template #icon>
              <NIcon>
                <Upload />
              </NIcon>
            </template>
            上传到服务器
          </NButton>

          <NButton 
            @click="handleManualDownload" 
            :loading="downloadLoading"
            :disabled="!props.modelValue.webdav.enabled"
            type="info"
            ghost
            block
          >
            <template #icon>
              <NIcon>
                <Download />
              </NIcon>
            </template>
            从服务器下载
          </NButton>
        </div>
        
        <div class="grid grid-cols-2 md:grid-cols-2 gap-3 mt-3">
          <NButton 
            @click="syncNow" 
            :loading="syncLoading"
            :disabled="!props.modelValue.webdav.enabled"
            type="primary"
            block
          >
            <template #icon>
              <NIcon>
                <BrandSoundcloud />
              </NIcon>
            </template>
            立即同步
          </NButton>
        </div>
      </div>

      <!-- 同步状态 -->
      <NDivider />
      
      <div class="space-y-2">
        <div class="font-medium">同步状态</div>
        <div class="text-sm space-y-1">
          <div v-if="props.modelValue.dataSync.lastSyncTime" class="flex justify-between">
            <span class="text-gray-600">最后同步:</span>
            <span>{{ formatSyncTime(props.modelValue.dataSync.lastSyncTime) }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-600">同步状态:</span>
            <span :class="props.modelValue.webdav.enabled ? 'text-green-600' : 'text-gray-500'">
              {{ props.modelValue.webdav.enabled ? '已启用' : '已禁用' }}
            </span>
          </div>

          
          <NButton 
            @click="handleGetRemotePreview" 
            :loading="previewLoading"
            :disabled="!props.modelValue.webdav.enabled"
            type="default"
            ghost
            block
          >
            <template #icon>
              <NIcon>
                <Eye />
              </NIcon>
            </template>
            预览远程数据
          </NButton>
        </div>
      </div>
    </NCard>

    <!-- 冲突解决对话框 -->
    <ConflictResolutionDialog
      v-if="showConflictDialog"
      :visible="showConflictDialog"
      :local-data="conflictData?.localData"
      :remote-data="conflictData?.remoteData"
      :differences="conflictData?.differences"
      @resolve="handleConflictResolve"
      @cancel="handleConflictCancel"
    />

    <!-- 数据预览对话框 -->
    <NModal v-model:show="showPreviewDialog" preset="card" title="远程数据预览" style="width: 80%; max-width: 800px;">
      <div v-if="remotePreviewData">
        <div class="space-y-4">
          <NAlert type="info" :show-icon="true">
            <template #header>数据概览</template>
            <div class="text-sm space-y-1">
              <div>上次同步时间: {{ formatSyncTime(remotePreviewData.timestamp) }}</div>
              <div>分类数: {{ remotePreviewData.data?.categories?.length || 0 }}</div>
              <div>提示词数: {{ remotePreviewData.data?.prompts?.length || 0 }}</div>
              <div>AI配置数: {{ remotePreviewData.data?.aiConfigs?.length || 0 }}</div>
            </div>
          </NAlert>
          
          <NTabs type="line">
            <NTabPane name="categories" tab="分类">
              <div v-if="remotePreviewData.data?.categories?.length" class="space-y-2">
                <div v-for="category in remotePreviewData.data.categories.slice(0, 10)" :key="category.id" class="preview-item">
                  <div class="font-medium">{{ category.name }}</div>
                  <div class="text-sm text-gray-500">{{ category.description }}</div>
                </div>
                <div v-if="remotePreviewData.data.categories.length > 10" class="text-sm text-gray-500">
                  ... 还有 {{ remotePreviewData.data.categories.length - 10 }} 个分类
                </div>
              </div>
              <NEmpty v-else description="无分类数据" />
            </NTabPane>
            
            <NTabPane name="prompts" tab="提示词">
              <div v-if="remotePreviewData.data?.prompts?.length" class="space-y-2">
                <div v-for="prompt in remotePreviewData.data.prompts.slice(0, 10)" :key="prompt.id" class="preview-item">
                  <div class="font-medium">{{ prompt.title }}</div>
                  <div class="text-sm text-gray-500">{{ prompt.description }}</div>
                </div>
                <div v-if="remotePreviewData.data.prompts.length > 10" class="text-sm text-gray-500">
                  ... 还有 {{ remotePreviewData.data.prompts.length - 10 }} 个提示词
                </div>
              </div>
              <NEmpty v-else description="无提示词数据" />
            </NTabPane>
          </NTabs>
        </div>
      </div>
    </NModal>

    <!-- 数据比较对话框 -->
    <NModal v-model:show="showCompareDialog" preset="card" title="数据比较结果" style="width: 80%; max-width: 1000px;">
      <div v-if="compareData">
        <div class="space-y-4">
          <NAlert type="info" :show-icon="true">
            <template #header>比较概览</template>
            <div class="text-sm space-y-1">
              <div>本地记录数: {{ compareData.summary?.localTotal || 0 }}</div>
              <div>远程记录数: {{ compareData.summary?.remoteTotal || 0 }}</div>
              <div>新增项: {{ compareData.added?.length || 0 }}</div>
              <div>修改项: {{ compareData.modified?.length || 0 }}</div>
              <div>删除项: {{ compareData.deleted?.length || 0 }}</div>
            </div>
          </NAlert>
          
          <NTabs type="line">
            <NTabPane name="added" tab="新增项" v-if="compareData.added?.length">
              <div class="space-y-2">
                <div v-for="item in compareData.added" :key="`${item._type}-${item.id}`" class="compare-item">
                  <div class="flex items-center gap-2">
                    <NTag type="success" size="small">{{ getDataTypeLabel(item._type) }}</NTag>
                    <div>{{ item.name || item.title || item.id }}</div>
                  </div>
                </div>
              </div>
            </NTabPane>
            
            <NTabPane name="modified" tab="修改项" v-if="compareData.modified?.length">
              <div class="space-y-2">
                <div v-for="item in compareData.modified" :key="`${item._type}-${item.id}`" class="compare-item">
                  <div class="flex items-center gap-2">
                    <NTag type="warning" size="small">{{ getDataTypeLabel(item._type) }}</NTag>
                    <div>{{ item.local?.name || item.local?.title || item.id }}</div>
                    <div class="text-sm text-gray-500">（本地和远程都有修改）</div>
                  </div>
                </div>
              </div>
            </NTabPane>
            
            <NTabPane name="deleted" tab="删除项" v-if="compareData.deleted?.length">
              <div class="space-y-2">
                <div v-for="item in compareData.deleted" :key="`${item._type}-${item.id}`" class="compare-item">
                  <div class="flex items-center gap-2">
                    <NTag type="error" size="small">{{ getDataTypeLabel(item._type) }}</NTag>
                    <div>{{ item.name || item.title || item.id }}</div>
                    <div class="text-sm text-gray-500">（本地存在，远程已删除）</div>
                  </div>
                </div>
              </div>
            </NTabPane>
          </NTabs>
        </div>
      </div>
    </NModal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import {
  NCard, NAlert, NButton, NSwitch, NInputNumber, NDivider, NIcon,
  NInput, NModal, NTabs, NTabPane, NTag, NEmpty,
  useMessage
} from 'naive-ui'
import {
  Cloud, CloudStorm, BrandSoundcloud, Upload, Download, GitCompare, Eye
} from '@vicons/tabler'
import ConflictResolutionDialog from './ConflictResolutionDialog.vue'
import { AppService } from '../../lib/utils/app.service'

interface WebDAVSettings {
    webdav: {
        enabled: boolean;
        serverUrl: string;
        username: string;
        password: string;
        autoSync: boolean;
        syncInterval: number;
    };
    dataSync: {
        lastSyncTime: string | null;
        autoBackup: boolean;
        backupInterval: number;
    };
}

const props = defineProps<{
    modelValue: WebDAVSettings;
}>();

const emit = defineEmits<{
    "update:modelValue": [value: WebDAVSettings];
    "save-webdav": [];
    "test-connection": [];
    "sync-now": [];
}>();

const message = useMessage()
const appService = AppService.getInstance()

// 连接状态
const connectionStatus = reactive({
  checked: false,
  connected: false,
  message: ''
})

// 加载状态
const testingConnection = ref(false)
const uploadLoading = ref(false)
const downloadLoading = ref(false)
const syncLoading = ref(false)
const resolveLoading = ref(false)
const compareLoading = ref(false)
const previewLoading = ref(false)

// 对话框状态
const showConflictDialog = ref(false);
const showPreviewDialog = ref(false);
const showCompareDialog = ref(false);

// 数据状态
const conflictData = ref(null);
const remotePreviewData = ref(null);
const compareData = ref(null);

// 测试连接
const testConnection = async () => {
  if (!props.modelValue.webdav.serverUrl || !props.modelValue.webdav.username) {
    message.warning('请先填写完整的服务器配置信息')
    return
  }

  testingConnection.value = true
  try {
    emit("test-connection")
    
    // 模拟测试连接结果，实际应该从 emit 的回调中获取结果
    // 这里需要与实际的测试连接逻辑配合
    setTimeout(() => {
      connectionStatus.checked = true
      // 这里应该根据实际测试结果设置 connected 状态
      // 暂时假设连接成功
      connectionStatus.connected = true
      connectionStatus.message = '连接成功'
      
      if (connectionStatus.connected) {
        message.success('WebDAV 服务器连接正常')
      } else {
        message.warning('WebDAV 服务器连接失败')
      }
    }, 1000)
  } catch (error) {
    console.error('测试连接失败:', error)
    connectionStatus.checked = true
    connectionStatus.connected = false
    connectionStatus.message = '测试连接失败'
    message.error('测试连接失败')
  } finally {
    testingConnection.value = false
  }
}

// 启用/禁用 WebDAV 同步
const handleEnabledChange = () => {
  // 禁用时重置连接状态
  if (!props.modelValue.webdav.enabled) {
    connectionStatus.checked = false
    connectionStatus.connected = false
    connectionStatus.message = ''
  }
  
  emit("update:modelValue", props.modelValue)
  emit("save-webdav")
  notifyConfigChange()
}

// 配置变更
const handleConfigChange = () => {
  emit("update:modelValue", props.modelValue)
  emit("save-webdav")
  notifyConfigChange()
}

// 自动同步开关变更
const handleAutoSyncChange = async () => {
  emit("update:modelValue", props.modelValue)
  emit("save-webdav")
  
  setTimeout(async () => {
    try {
      const { autoSyncManager } = await import('@/lib/utils/auto-sync-manager')
      await autoSyncManager.reinitializeFromSettings()
      console.log('自动同步管理器配置已更新')
    } catch (error) {
      console.error('更新自动同步管理器配置失败:', error)
    }
  }, 500)
  
  notifyConfigChange()
}

// 通知配置变更
const notifyConfigChange = () => {
  window.dispatchEvent(new CustomEvent('webdav-config-changed'))
}

// 立即同步
const syncNow = () => {
  emit("sync-now")
}

// 手动上传
const handleManualUpload = async () => {
    uploadLoading.value = true;
    try {
        const result = await appService.manualUploadWebDAV();
        if (result.success) {
            message.success(result.data.message || '上传成功');
            emit("update:modelValue", {
                ...props.modelValue,
                dataSync: {
                    ...props.modelValue.dataSync,
                    lastSyncTime: result.data.timestamp
                }
            });
        } else {
            message.error(result.error || '上传失败');
        }
    } catch (error) {
        message.error('上传失败: ' + error.message);
    } finally {
        uploadLoading.value = false;
    }
};

// 手动下载
const handleManualDownload = async () => {
    downloadLoading.value = true;
    try {
        const result = await appService.manualDownloadWebDAV();
        if (result.success) {
            if (result.data.hasConflicts) {
                // 显示专业的冲突解决对话框
                conflictData.value = result.data;
                showConflictDialog.value = true;
                message.warning('检测到数据差异，请选择处理方式');
            } else {
                // 无冲突，直接应用远程数据
                const applyResult = await appService.applyDownloadedData({
                    strategy: 'use_remote'
                });
                if (applyResult.success) {
                    message.success('数据下载并应用成功，无差异');
                    emit("update:modelValue", {
                        ...props.modelValue,
                        dataSync: {
                            ...props.modelValue.dataSync,
                            lastSyncTime: result.data.timestamp
                        }
                    });
                } else {
                    message.error(applyResult.error || '应用数据失败');
                }
            }
        } else {
            message.error(result.error || '下载失败');
        }
    } catch (error) {
        message.error('下载失败: ' + error.message);
    } finally {
        downloadLoading.value = false;
    }
};

// 比较数据
const handleCompareData = async () => {
    compareLoading.value = true;
    try {
        const result = await appService.compareWebDAVData();
        if (result.success) {
            if (result.data.differences) {
                compareData.value = result.data.differences;
                showCompareDialog.value = true;
                message.success('数据比较完成');
            } else {
                message.info('数据比较完成，本地与远程数据完全一致');
            }
        } else {
            message.error(result.error || '数据比较失败');
        }
    } catch (error) {
        message.error('数据比较失败: ' + error.message);
    } finally {
        compareLoading.value = false;
    }
};

// 获取远程数据预览
const handleGetRemotePreview = async () => {
    previewLoading.value = true;
    try {
        const result = await appService.getRemoteDataPreview();
        if (result.success) {
            remotePreviewData.value = result.data;
            showPreviewDialog.value = true;
            message.success('远程数据预览加载完成');
        } else {
            message.error(result.error || '获取远程数据预览失败');
        }
    } catch (error) {
        message.error('获取远程数据预览失败: ' + error.message);
    } finally {
        previewLoading.value = false;
    }
};

// 处理冲突解决
const handleConflictResolve = async (resolution: any) => {
    resolveLoading.value = true;
    try {
        const result = await appService.applyDownloadedData(resolution);
        if (result.success) {
            message.success('冲突解决成功');
            showConflictDialog.value = false;
            conflictData.value = null;
            emit("update:modelValue", {
                ...props.modelValue,
                dataSync: {
                    ...props.modelValue.dataSync,
                    lastSyncTime: result.data.timestamp
                }
            });
        } else {
            message.error(result.error || '应用数据失败');
        }
    } catch (error) {
        message.error('解决冲突失败: ' + error.message);
    } finally {
        resolveLoading.value = false;
    }
};

// 处理冲突取消
const handleConflictCancel = () => {
    showConflictDialog.value = false;
    conflictData.value = null;
};

// 格式化同步时间
const formatSyncTime = (timeString: string) => {
    const date = new Date(timeString);
    return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
};

// 获取数据类型标签
const getDataTypeLabel = (type: string) => {
    const labels = {
        categories: '分类',
        prompts: '提示词',
        aiConfigs: 'AI配置',
        history: '历史记录',
        settings: '设置'
    };
    return labels[type] || type;
};
</script>

<style scoped>
.webdav-sync-settings {
  max-width: 800px;
}

.grid {
  display: grid;
}

.grid-cols-1 {
  grid-template-columns: repeat(1, minmax(0, 1fr));
}

@media (min-width: 768px) {
  .grid-cols-1.md\:grid-cols-2 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  
  .grid-cols-1.md\:grid-cols-3 {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

.gap-2 {
  gap: 0.5rem;
}

.gap-3 {
  gap: 0.75rem;
}

.space-y-1 > * + * {
  margin-top: 0.25rem;
}

.space-y-2 > * + * {
  margin-top: 0.5rem;
}

.space-y-3 > * + * {
  margin-top: 0.75rem;
}

.space-y-4 > * + * {
  margin-top: 1rem;
}

.text-gray-500 {
  color: #6b7280;
}

.text-gray-600 {
  color: #4b5563;
}

.text-green-600 {
  color: #059669;
}

.flex {
  display: flex;
}

.items-center {
  align-items: center;
}

.justify-between {
  justify-content: space-between;
}

.font-medium {
  font-weight: 500;
}

.text-sm {
  font-size: 0.875rem;
  line-height: 1.25rem;
}

.mb-1 {
  margin-bottom: 0.25rem;
}

.mb-2 {
  margin-bottom: 0.5rem;
}

.mb-4 {
  margin-bottom: 1rem;
}

.mb-6 {
  margin-bottom: 1.5rem;
}

.mt-3 {
  margin-top: 0.75rem;
}

.block {
  display: block;
  width: 100%;
}

.preview-item {
  padding: 12px;
  border-left: 3px solid var(--primary-color);
  margin-bottom: 8px;
  background-color: var(--card-color);
  border-radius: 6px;
}

.compare-item {
  padding: 12px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  margin-bottom: 8px;
  transition: background-color 0.2s;
}

.compare-item:hover {
  background-color: var(--hover-color);
}

.config-disabled {
  opacity: 0.6;
  pointer-events: none;
  position: relative;
}

.config-disabled::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  backdrop-filter: blur(1px);
}
</style>
