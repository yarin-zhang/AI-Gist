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
              @update:value="handleServerConfigChange"
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
                @update:value="handleServerConfigChange"
                :disabled="!props.modelValue.webdav.enabled"
              />
            </div>
            <div>
              <div class="text-sm font-medium mb-1">密码</div>
              <NInput 
                v-model:value="props.modelValue.webdav.password" 
                type="password" 
                placeholder="密码" 
                @update:value="handleServerConfigChange"
                :disabled="!props.modelValue.webdav.enabled"
              />
            </div>
          </div>
          
          <div class="flex items-center justify-between mt-3">
            <NButton 
              @click="saveServerConfig" 
              :loading="savingServerConfig"
              :disabled="!props.modelValue.webdav.enabled || !hasUnsavedServerConfig"
              type="primary"
              size="small"
            >
              <template #icon>
                <NIcon>
                  <Cloud />
                </NIcon>
              </template>
              保存配置
            </NButton>
            <div v-if="hasUnsavedServerConfig" class="text-sm text-orange-600">
              <NIcon class="mr-1">
                <CloudStorm />
              </NIcon>
              服务器配置有未保存的更改
            </div>
            <div v-else class="text-sm text-gray-500">
              服务器配置已保存
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
          <br>
          <small class="text-gray-500" v-if="props.modelValue.webdav.connectionTestedAt">
            最后验证时间: {{ formatSyncTime(props.modelValue.webdav.connectionTestedAt) }}
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
          <br>
          <small class="text-gray-500" v-if="props.modelValue.webdav.connectionTestedAt">
            最后验证时间: {{ formatSyncTime(props.modelValue.webdav.connectionTestedAt) }}
          </small>
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
            :disabled="!props.modelValue.webdav.enabled || !isConfigComplete"
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
        <div class="grid grid-cols-2 md:grid-cols-2 gap-3 mt-3">
          <NButton 
            @click="syncNow" 
            :loading="syncLoading"
            :disabled="!isWebDAVReady"
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
      </div>


      <!-- 同步操作 -->
      <NDivider />
      
      <div class="space-y-4">
  <n-collapse>

    <n-collapse-item title="高级操作" name="1">
        <div class="font-medium mb-2">高级操作</div>
        
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <NButton 
            @click="handleCompareData" 
            :loading="compareLoading"
            :disabled="!isWebDAVReady"
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
            :disabled="!isWebDAVReady"
            type="success"
            ghost
            block
          >
            <template #icon>
              <NIcon>
                <Upload />
              </NIcon>
            </template>
            用本地覆盖服务器
          </NButton>

          <NButton 
            @click="handleManualDownload" 
            :loading="downloadLoading"
            :disabled="!isWebDAVReady"
            type="info"
            ghost
            block
          >
            <template #icon>
              <NIcon>
                <Download />
              </NIcon>
            </template>
            用服务器覆盖本地
          </NButton>
        </div>
    </n-collapse-item>
  </n-collapse>
        
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
            <span :class="syncStatusInfo.class">
              {{ syncStatusInfo.text }}
            </span>
          </div>
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
import { ref, reactive, onMounted, computed, watch } from 'vue'
import {
  NCard, NAlert, NButton, NSwitch, NInputNumber, NDivider, NIcon,
  NInput, NModal, NTabs, NTabPane, NTag, NEmpty, NCollapse, NCollapseItem,
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
        // 连接验证状态
        connectionTested?: boolean;
        connectionValid?: boolean;
        connectionMessage?: string;
        connectionTestedAt?: string;
        configHash?: string;
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

// 计算配置哈希值，用于检测配置是否发生变更
const computeConfigHash = (config: { serverUrl: string; username: string; password: string }) => {
  const configStr = `${config.serverUrl}|${config.username}|${config.password}`
  // 简单的哈希函数
  let hash = 0
  for (let i = 0; i < configStr.length; i++) {
    const char = configStr.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // 转为32位整数
  }
  return hash.toString()
}

// 从持久化配置中恢复连接状态
const restoreConnectionStatus = () => {
  const config = props.modelValue.webdav
  console.log('开始恢复连接状态，当前配置:', {
    serverUrl: config.serverUrl || '',
    username: config.username || '',
    hasPassword: !!(config.password || ''),
    connectionTested: config.connectionTested,
    connectionValid: config.connectionValid,
    connectionMessage: config.connectionMessage,
    connectionTestedAt: config.connectionTestedAt,
    configHash: config.configHash
  })
  
  const currentHash = computeConfigHash({
    serverUrl: config.serverUrl || '',
    username: config.username || '',
    password: config.password || ''
  })
  
  console.log('配置哈希比较:', {
    currentHash,
    storedHash: config.configHash,
    hashMatches: config.configHash === currentHash,
    connectionTested: config.connectionTested
  })
  
  // 如果配置哈希值匹配且有连接测试记录，则恢复状态
  if (config.configHash === currentHash && config.connectionTested) {
    connectionStatus.checked = true
    connectionStatus.connected = config.connectionValid || false
    connectionStatus.message = config.connectionMessage || ''
    
    console.log('✅ 已成功恢复连接状态:', {
      tested: connectionStatus.checked,
      connected: connectionStatus.connected,
      message: connectionStatus.message,
      testedAt: config.connectionTestedAt
    })
  } else {
    // 配置已变更或没有测试记录，重置状态
    connectionStatus.checked = false
    connectionStatus.connected = false
    connectionStatus.message = ''
    
    console.log('❌ 连接状态已重置 - 原因:', 
      !config.connectionTested ? '没有测试记录' : 
      config.configHash !== currentHash ? '配置已变更' : '未知原因')
  }
}

// 立即恢复连接状态（在组件初始化时）
restoreConnectionStatus()

// 加载状态
const testingConnection = ref(false)
const uploadLoading = ref(false)
const downloadLoading = ref(false)
const syncLoading = ref(false)
const resolveLoading = ref(false)
const compareLoading = ref(false)
const previewLoading = ref(false)
const savingServerConfig = ref(false)

// 服务器配置状态
const hasUnsavedServerConfig = ref(false)
const originalServerConfig = ref({
  serverUrl: '',
  username: '',
  password: ''
})

// 对话框状态
const showConflictDialog = ref(false);
const showPreviewDialog = ref(false);
const showCompareDialog = ref(false);

// 数据状态
const conflictData = ref(null);
const remotePreviewData = ref(null);
const compareData = ref(null);

// 计算属性：配置是否完整
const isConfigComplete = computed(() => {
  const config = props.modelValue.webdav
  return !!(config.serverUrl && config.username && config.password)
})

// 计算属性：WebDAV是否真正可用
const isWebDAVReady = computed(() => {
  return props.modelValue.webdav.enabled && 
         isConfigComplete.value && 
         connectionStatus.connected
})

// 计算属性：同步状态文本和样式
const syncStatusInfo = computed(() => {
  if (!props.modelValue.webdav.enabled) {
    return { text: '已禁用', class: 'text-gray-500' }
  }
  if (!isConfigComplete.value) {
    return { text: '配置不完整', class: 'text-orange-600' }
  }
  if (!connectionStatus.checked) {
    return { text: '未验证连接', class: 'text-orange-600' }
  }
  if (!connectionStatus.connected) {
    return { text: '连接失败', class: 'text-red-600' }
  }
  return { text: '就绪', class: 'text-green-600' }
})

// 测试连接
const testConnection = async () => {
  if (!props.modelValue.webdav.serverUrl || !props.modelValue.webdav.username || !props.modelValue.webdav.password) {
    message.warning('请先填写完整的服务器配置信息')
    return
  }

  testingConnection.value = true
  connectionStatus.checked = false
  connectionStatus.connected = false
  connectionStatus.message = ''

  try {
    // 调用父组件的测试连接方法
    const result = await new Promise((resolve) => {
      // 发出事件并等待父组件处理
      emit("test-connection", resolve)
    })
    
    connectionStatus.checked = true
    
    if (result && result.success) {
      connectionStatus.connected = true
      connectionStatus.message = result.message || '连接成功'
      message.success('WebDAV 服务器连接正常')
      
      // 保存连接验证状态到配置
      const currentConfig = props.modelValue.webdav
      const configHash = computeConfigHash({
        serverUrl: currentConfig.serverUrl || '',
        username: currentConfig.username || '',
        password: currentConfig.password || ''
      })
      
      // 更新配置中的连接验证状态
      Object.assign(currentConfig, {
        connectionTested: true,
        connectionValid: true,
        connectionMessage: connectionStatus.message,
        connectionTestedAt: new Date().toISOString(),
        configHash: configHash
      })
      
      emit("update:modelValue", props.modelValue)
      emit("save-webdav")
      
      console.log('连接验证状态已保存')
    } else {
      connectionStatus.connected = false
      connectionStatus.message = result?.message || '连接失败'
      message.error(`WebDAV 服务器连接失败: ${connectionStatus.message}`)
      
      // 保存失败状态
      const currentConfig = props.modelValue.webdav
      const configHash = computeConfigHash({
        serverUrl: currentConfig.serverUrl || '',
        username: currentConfig.username || '',
        password: currentConfig.password || ''
      })
      
      Object.assign(currentConfig, {
        connectionTested: true,
        connectionValid: false,
        connectionMessage: connectionStatus.message,
        connectionTestedAt: new Date().toISOString(),
        configHash: configHash
      })
      
      emit("update:modelValue", props.modelValue)
      emit("save-webdav")
    }
  } catch (error) {
    console.error('测试连接失败:', error)
    connectionStatus.checked = true
    connectionStatus.connected = false
    connectionStatus.message = error instanceof Error ? error.message : '测试连接失败'
    message.error(`测试连接失败: ${connectionStatus.message}`)
    
    // 保存错误状态
    const currentConfig = props.modelValue.webdav
    const configHash = computeConfigHash({
      serverUrl: currentConfig.serverUrl || '',
      username: currentConfig.username || '',
      password: currentConfig.password || ''
    })
    
    Object.assign(currentConfig, {
      connectionTested: true,
      connectionValid: false,
      connectionMessage: connectionStatus.message,
      connectionTestedAt: new Date().toISOString(),
      configHash: configHash
    })
    
    emit("update:modelValue", props.modelValue)
    emit("save-webdav")
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
  
  // 启用时初始化原始配置
  if (props.modelValue.webdav.enabled) {
    originalServerConfig.value = {
      serverUrl: props.modelValue.webdav.serverUrl,
      username: props.modelValue.webdav.username,
      password: props.modelValue.webdav.password
    }
    hasUnsavedServerConfig.value = false
  }
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

// 服务器配置变更（不立即保存）
const handleServerConfigChange = () => {
  const current = props.modelValue.webdav
  const original = originalServerConfig.value
  
  hasUnsavedServerConfig.value = (
    current.serverUrl !== original.serverUrl ||
    current.username !== original.username ||
    current.password !== original.password
  )
  
  // 如果服务器配置发生变更，重置连接验证状态
  if (hasUnsavedServerConfig.value) {
    connectionStatus.checked = false
    connectionStatus.connected = false
    connectionStatus.message = ''
    
    // 清除配置中的连接验证状态
    Object.assign(current, {
      connectionTested: false,
      connectionValid: false,
      connectionMessage: '',
      connectionTestedAt: '',
      configHash: ''
    })
  }
  
  emit("update:modelValue", props.modelValue)
}

// 保存服务器配置
const saveServerConfig = async () => {
  savingServerConfig.value = true
  try {
    emit("save-webdav")
    
    // 更新原始配置
    originalServerConfig.value = {
      serverUrl: props.modelValue.webdav.serverUrl,
      username: props.modelValue.webdav.username,
      password: props.modelValue.webdav.password
    }
    
    hasUnsavedServerConfig.value = false
    
    // 保存配置后，不重置连接状态，保持当前验证状态
    // 但如果用户修改了配置，已经在 handleServerConfigChange 中重置了状态
    
    message.success('服务器配置已保存')
    notifyConfigChange()
  } catch (error) {
    console.error('保存服务器配置失败:', error)
    message.error('保存服务器配置失败')
  } finally {
    savingServerConfig.value = false
  }
}

// 通知配置变更
const notifyConfigChange = () => {
  window.dispatchEvent(new CustomEvent('webdav-config-changed'))
}

// 立即同步
const syncNow = async () => {
    console.log("开始立即同步...");
    syncLoading.value = true;
    try {
        const result = await appService.syncWebDAVNow();
        if (result.success) {
            message.success(result.data.message || '同步成功');
            // 更新同步时间
            if (result.data.timestamp) {
                emit("sync-time-updated", result.data.timestamp);
            }
        } else {
            message.error(result.error || '同步失败');
        }
    } catch (error) {
        console.error('立即同步失败:', error);
        message.error('同步失败: ' + error.message);
    } finally {
        syncLoading.value = false;
    }
}

// 手动上传
const handleManualUpload = async () => {
    console.log("开始手动上传...");
    uploadLoading.value = true;
    try {
        const result = await appService.manualUploadWebDAV();
        if (result.success) {
            message.success(result.data.message || '上传成功');
            // 更新同步时间
            if (result.data.timestamp) {
                emit("sync-time-updated", result.data.timestamp);
            }
        } else {
            message.error(result.error || '上传失败');
        }
    } catch (error) {
        console.error('手动上传失败:', error);
        message.error('上传失败: ' + error.message);
    } finally {
        uploadLoading.value = false;
    }
};

// 手动下载
const handleManualDownload = async () => {
    console.log("开始手动下载...");
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
                    // 更新同步时间
                    if (result.data.timestamp) {
                        emit("sync-time-updated", result.data.timestamp);
                    }
                } else {
                    message.error(applyResult.error || '应用数据失败');
                }
            }
        } else {
            message.error(result.error || '下载失败');
        }
    } catch (error) {
        console.error('手动下载失败:', error);
        message.error('下载失败: ' + error.message);
    } finally {
        downloadLoading.value = false;
    }
};

// 比较数据
const handleCompareData = async () => {
    console.log("开始比较数据...");
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
            // 更新同步时间
            if (result.data.timestamp) {
                emit("sync-time-updated", result.data.timestamp);
            }
        } else {
            message.error(result.error || '应用数据失败');
        }
    } catch (error) {
        console.error('解决冲突失败:', error);
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
        settings: '设置'    };
    return labels[type] || type;
};

// 初始化原始服务器配置
onMounted(() => {
    originalServerConfig.value = {
        serverUrl: props.modelValue.webdav.serverUrl,
        username: props.modelValue.webdav.username,
        password: props.modelValue.webdav.password
    }
    hasUnsavedServerConfig.value = false
    
    // 恢复连接状态
    restoreConnectionStatus()
});

// 监听props变化，当WebDAV配置更新时恢复连接状态
watch(() => props.modelValue.webdav, (newConfig, oldConfig) => {
    // 跳过初始调用，因为已经在组件初始化时调用了
    if (!oldConfig) return
    
    // 只有在配置真正发生变化时才恢复状态
    if (newConfig && (
        newConfig.serverUrl !== oldConfig.serverUrl ||
        newConfig.username !== oldConfig.username ||
        newConfig.password !== oldConfig.password ||
        newConfig.connectionTested !== oldConfig.connectionTested ||
        newConfig.connectionValid !== oldConfig.connectionValid)) {
        console.log('WebDAV配置已更新，恢复连接状态...')
        restoreConnectionStatus()
    }
}, { deep: true, immediate: true });
</script>

<style scoped>

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

.text-red-600 {
  color: #dc2626;
}

.text-orange-600 {
  color: #ea580c;
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

.mr-1 {
  margin-right: 0.25rem;
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
