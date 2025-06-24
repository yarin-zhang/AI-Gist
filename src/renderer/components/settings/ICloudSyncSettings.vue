<template>
  <div class="icloud-sync-settings">
    <NCard>

      <!-- iCloud 状态检查 -->
      <div class="mb-6">
        <NAlert 
          v-if="!iCloudStatus.checked"
          type="info" 
          :show-icon="true"
          class="mb-4"
        >
          <template #header>iCloud Drive 状态未检测</template>
          点击下方"检测可用性"按钮来检查 iCloud Drive 是否可用。
        </NAlert>

        <NAlert 
          v-else-if="iCloudStatus.checked && !iCloudStatus.available"
          type="warning" 
          :show-icon="true"
          class="mb-4"
        >
          <template #header>iCloud Drive 不可用</template>
          {{ iCloudStatus.message }}
          <br>
          <small class="text-gray-500">
            请确保已登录 iCloud 账户并启用了 iCloud Drive 功能。
          </small>
          <br>
          <small class="text-gray-500" v-if="localConfig.connectionTestedAt">
            最后验证时间: {{ formatTime(localConfig.connectionTestedAt) }}
          </small>
        </NAlert>

        <NAlert 
          v-else-if="iCloudStatus.checked && iCloudStatus.available"
          type="success" 
          :show-icon="true"
          class="mb-4"
        >
          <template #header>iCloud Drive 连接正常</template>
          同步路径: {{ iCloudStatus.path }}
          <br>
          <small class="text-gray-500" v-if="localConfig.connectionTestedAt">
            最后验证时间: {{ formatTime(localConfig.connectionTestedAt) }}
          </small>
        </NAlert>

        <div class="flex gap-2">
          <NButton 
            @click="checkICloudStatus" 
            :loading="statusChecking"
            type="primary"
            ghost
            size="small"
          >
            <template #icon>
              <NIcon>
                <Eye />
              </NIcon>
            </template>
            检测 iCloud 状态
          </NButton>
        </div>
      </div>

      <!-- 基本设置 -->
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <div class="font-medium">启用 iCloud 同步</div>
            <div class="text-sm text-gray-500">
              自动将数据同步到 iCloud Drive
            </div>
          </div>
          <NSwitch 
            v-model:value="localConfig.enabled" 
            @update:value="handleConfigChange"
            :disabled="!iCloudStatus.available"
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
            v-model:value="localConfig.autoSync" 
            @update:value="handleConfigChange"
            :disabled="!localConfig.enabled"
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
            v-model:value="localConfig.syncInterval" 
            @update:value="handleConfigChange"
            :min="5" 
            :max="1440"
            :step="5"
            :disabled="!localConfig.enabled || !localConfig.autoSync"
            style="width: 120px"
          />
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
          <NButton 
            @click="syncNow" 
            :loading="syncing"
            :disabled="!localConfig.enabled"
            type="primary"
            block
          >
            <template #icon>
              <NIcon>
                <Refresh />
              </NIcon>
            </template>
            立即同步
          </NButton>
          
        </div>

      </div>

      <!-- 同步操作 -->
      <NDivider />
      
      <div class="space-y-4">
  <n-collapse>

    <n-collapse-item title="高级操作" name="1">
        
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <NButton 
            @click="compareData" 
            :loading="comparing"
            :disabled="!localConfig.enabled"
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
            @click="uploadData" 
            :loading="uploading"
            :disabled="!localConfig.enabled"
            type="success"
            ghost
            block
          >
            <template #icon>
              <NIcon>
                <Upload />
              </NIcon>
            </template>
            上传到 iCloud
          </NButton>

          <NButton 
            @click="downloadData" 
            :loading="downloading"
            :disabled="!localConfig.enabled"
            type="info"
            ghost
            block
          >
            <template #icon>
              <NIcon>
                <Download />
              </NIcon>
            </template>
            从 iCloud 下载
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
          <div v-if="syncStatus.lastSyncTime" class="flex justify-between">
            <span class="text-gray-600">最后同步:</span>
            <span>{{ formatTime(syncStatus.lastSyncTime) }}</span>
          </div>
          <div v-if="syncStatus.nextSyncTime" class="flex justify-between">
            <span class="text-gray-600">下次同步:</span>
            <span>{{ formatTime(syncStatus.nextSyncTime) }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-600">同步状态:</span>
            <span :class="localConfig.enabled ? 'text-green-600' : 'text-gray-500'">
              {{ localConfig.enabled ? '已启用' : '已禁用' }}
            </span>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-1 gap-3">
            <NButton 
                @click="openSyncDirectory" 
                :disabled="!localConfig.enabled"
                type="default"
                ghost
                block
                >
                <template #icon>
                    <NIcon>
                    <Folder />
                    </NIcon>
                </template>
                打开同步目录
                </NButton>
                </div>
        
      </div>

    </NCard>

    <!-- 冲突解决对话框 -->
    <ConflictResolutionDialog
      v-if="showConflictDialog"
      :show="showConflictDialog"
      :conflict-data="conflictDialogData"
      @update:show="(value) => showConflictDialog = value"
      @resolve="handleConflictResolution"
      @cancel="handleConflictCancel"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed, nextTick } from 'vue'
import { 
  NCard, NAlert, NButton, NSwitch, NInputNumber, NDivider, NIcon, NFlex, NCollapse, NCollapseItem,
  useMessage, useDialog
} from 'naive-ui'
import { 
  Cloud, Eye, GitCompare, Upload, Download, Refresh, Folder
} from '@vicons/tabler'
import { ICloudAPI, type ICloudConfig, type ManualSyncResult } from '../../lib/api/icloud.api'
import ConflictResolutionDialog from './ConflictResolutionDialog.vue'

// 扩展 Window 接口以支持 autoSyncManager
declare global {
  interface Window {
    autoSyncManager?: {
      reinitializeFromSettings?: () => Promise<void>
    }
  }
}

// 响应式数据
const message = useMessage()
const dialog = useDialog()

const localConfig = reactive<ICloudConfig>({
  enabled: false,
  autoSync: false,
  syncInterval: 30,
  customPath: undefined
})

const iCloudStatus = reactive({
  checked: false,
  available: false,
  path: '',
  message: ''
})

const syncStatus = reactive({
  isEnabled: false,
  lastSyncTime: null as string | null,
  nextSyncTime: null as string | null,
  isSyncing: false
})

// 加载状态
const statusChecking = ref(false)
const comparing = ref(false)
const uploading = ref(false)
const downloading = ref(false)
const syncing = ref(false)

// 冲突解决
const showConflictDialog = ref(false)
const conflictDialogData = ref<{
  hasConflicts: boolean;
  localData: any;
  remoteData: any;
  differences: any;
} | null>(null)

// 格式化时间
const formatTime = (timeString: string | null) => {
  if (!timeString) return '从未'
  const date = new Date(timeString)
  return date.toLocaleString('zh-CN')
}

// 计算配置哈希值，用于检测配置是否发生变更
const computeConfigHash = (config: { customPath?: string }) => {
  const configStr = `${config.customPath || ''}`
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
  console.log('开始恢复 iCloud 连接状态，当前配置:', {
    customPath: localConfig.customPath || '',
    connectionTested: localConfig.connectionTested,
    connectionValid: localConfig.connectionValid,
    connectionMessage: localConfig.connectionMessage,
    connectionTestedAt: localConfig.connectionTestedAt,
    configHash: localConfig.configHash
  })
  
  const currentHash = computeConfigHash({
    customPath: localConfig.customPath || ''
  })
  
  console.log('配置哈希比较:', {
    currentHash,
    storedHash: localConfig.configHash,
    hashMatches: localConfig.configHash === currentHash,
    connectionTested: localConfig.connectionTested
  })
  
  // 如果配置哈希值匹配且有连接测试记录，则恢复状态
  if (localConfig.configHash === currentHash && localConfig.connectionTested) {
    iCloudStatus.checked = true
    iCloudStatus.available = localConfig.connectionValid || false
    iCloudStatus.message = localConfig.connectionMessage || ''
    // 从配置中获取路径信息
    iCloudStatus.path = localConfig.customPath || ''
    
    console.log('✅ 已成功恢复 iCloud 连接状态:', {
      tested: iCloudStatus.checked,
      available: iCloudStatus.available,
      message: iCloudStatus.message,
      path: iCloudStatus.path,
      testedAt: localConfig.connectionTestedAt
    })
  } else {
    // 配置已变更或没有测试记录，重置状态
    iCloudStatus.checked = false
    iCloudStatus.available = false
    iCloudStatus.message = ''
    iCloudStatus.path = ''
    
    console.log('❌ iCloud 连接状态已重置 - 原因:', 
      !localConfig.connectionTested ? '没有测试记录' : 
      localConfig.configHash !== currentHash ? '配置已变更' : '未知原因')
  }
}

// 检查 iCloud 状态
const checkICloudStatus = async () => {
  statusChecking.value = true
  try {
    const result = await ICloudAPI.testAvailability()
    iCloudStatus.checked = true
    iCloudStatus.available = result.success && result.available === true
    iCloudStatus.path = result.iCloudPath || ''
    iCloudStatus.message = result.message

    if (!iCloudStatus.available) {
      message.warning('iCloud Drive 不可用，请检查设置')
    } else {
      message.success('iCloud Drive 连接正常')
    }
    
    // 如果检测成功且有路径信息，更新路径
    if (result.iCloudPath) {
      localConfig.customPath = result.iCloudPath
    }
    
    // 更新配置中的连接验证状态（使用最新的配置计算哈希）
    const configHash = computeConfigHash({
      customPath: localConfig.customPath || ''
    })
    
    Object.assign(localConfig, {
      connectionTested: true,
      connectionValid: iCloudStatus.available,
      connectionMessage: iCloudStatus.message,
      connectionTestedAt: new Date().toISOString(),
      configHash: configHash
    })
    
    // 直接保存配置，不调用 handleConfigChange 避免重置状态
    const plainConfig: ICloudConfig = {
      enabled: localConfig.enabled,
      autoSync: localConfig.autoSync,
      syncInterval: localConfig.syncInterval,
      customPath: localConfig.customPath,
      connectionTested: localConfig.connectionTested,
      connectionValid: localConfig.connectionValid,
      connectionMessage: localConfig.connectionMessage,
      connectionTestedAt: localConfig.connectionTestedAt,
      configHash: localConfig.configHash
    }
    
    await ICloudAPI.setConfig(plainConfig)
    
    console.log('iCloud 连接验证状态已保存')
  } catch (error) {
    console.error('检查 iCloud 状态失败:', error)
    message.error('检查 iCloud 状态失败')
    iCloudStatus.checked = true
    iCloudStatus.available = false
    iCloudStatus.message = '检查失败'
    
    // 保存失败状态
    const configHash = computeConfigHash({
      customPath: localConfig.customPath || ''
    })
    
    Object.assign(localConfig, {
      connectionTested: true,
      connectionValid: false,
      connectionMessage: '检查失败',
      connectionTestedAt: new Date().toISOString(),
      configHash: configHash
    })
    
    // 直接保存配置，不调用 handleConfigChange 避免重置状态
    const plainConfig: ICloudConfig = {
      enabled: localConfig.enabled,
      autoSync: localConfig.autoSync,
      syncInterval: localConfig.syncInterval,
      customPath: localConfig.customPath,
      connectionTested: localConfig.connectionTested,
      connectionValid: localConfig.connectionValid,
      connectionMessage: localConfig.connectionMessage,
      connectionTestedAt: localConfig.connectionTestedAt,
      configHash: localConfig.configHash
    }
    
    await ICloudAPI.setConfig(plainConfig)
  } finally {
    statusChecking.value = false
  }
}

// 处理配置变更
const handleConfigChange = async () => {
  try {
    // 检查配置是否发生变更
    const currentHash = computeConfigHash({
      customPath: localConfig.customPath || ''
    })
    
    // 如果配置哈希值不匹配，重置连接验证状态
    if (localConfig.configHash && localConfig.configHash !== currentHash) {
      console.log('iCloud 配置已变更，重置连接验证状态')
      Object.assign(localConfig, {
        connectionTested: false,
        connectionValid: false,
        connectionMessage: '',
        connectionTestedAt: '',
        configHash: currentHash
      })
      
      // 重置 UI 状态
      iCloudStatus.checked = false
      iCloudStatus.available = false
      iCloudStatus.message = ''
      iCloudStatus.path = ''
    }
    
    // 将 reactive 对象转换为普通对象，避免 IPC 传递时的克隆错误
    const plainConfig: ICloudConfig = {
      enabled: localConfig.enabled,
      autoSync: localConfig.autoSync,
      syncInterval: localConfig.syncInterval,
      customPath: localConfig.customPath,
      connectionTested: localConfig.connectionTested,
      connectionValid: localConfig.connectionValid,
      connectionMessage: localConfig.connectionMessage,
      connectionTestedAt: localConfig.connectionTestedAt,
      configHash: localConfig.configHash
    }
    
    await ICloudAPI.setConfig(plainConfig)
    // 只在非检测连接的配置变更时显示成功消息
    if (!statusChecking.value) {
      message.success('配置已保存')
    }
    
    // 更新同步状态
    try {
      await updateSyncStatus()
    } catch (statusError) {
      console.warn('更新同步状态失败:', statusError)
    }
    
    // 如果启用了自动同步管理器，通知更新
    try {
      if (window.autoSyncManager && window.autoSyncManager.reinitializeFromSettings) {
        await window.autoSyncManager.reinitializeFromSettings()
      }
    } catch (managerError) {
      console.warn('通知自动同步管理器失败:', managerError)
    }
  } catch (error) {
    console.error('保存配置失败:', error)
    message.error('保存配置失败: ' + (error instanceof Error ? error.message : '未知错误'))
  }
}

// 比较数据
const compareData = async () => {
  comparing.value = true
  try {
    const result = await ICloudAPI.compareData()
    
    if (!result.success) {
      message.error(result.message || '比较数据失败')
      return
    }

    if (!result.differences || !result.differences.summary.conflicts) {
      message.success('本地和 iCloud 数据一致，无需同步')
      return
    }

    // 显示差异信息
    const { summary } = result.differences
    dialog.success({
      title: '数据差异分析',
      content: `发现 ${summary.conflicts} 项差异：
      • 新增项: ${result.differences.added.length}
      • 修改项: ${result.differences.modified.length}  
      • 删除项: ${result.differences.deleted.length}
      
      本地记录数: ${summary.localTotal}
      iCloud 记录数: ${summary.remoteTotal}`,
      positiveText: '确定'
    })
  } catch (error) {
    console.error('比较数据失败:', error)
    message.error('比较数据失败')
  } finally {
    comparing.value = false
  }
}

// 上传数据
const uploadData = async () => {
  uploading.value = true
  try {
    const result = await ICloudAPI.manualUpload()
    
    if (result.success) {
      message.success('数据已成功上传到 iCloud')
      await updateSyncStatus()
    } else {
      message.error(result.message || '上传失败')
    }
  } catch (error) {
    console.error('上传数据失败:', error)
    message.error('上传数据失败')
  } finally {
    uploading.value = false
  }
}

// 下载数据
const downloadData = async () => {
  downloading.value = true
  try {
    const result = await ICloudAPI.manualDownload()
    
    if (!result.success) {
      message.error(result.message || '下载失败')
      return
    }

    if (!result.hasConflicts) {
      message.success('数据下载成功，无冲突')
      await updateSyncStatus()
      return
    }

    // 存在冲突，显示冲突解决对话框
    conflictDialogData.value = {
      hasConflicts: true,
      localData: result.localData,
      remoteData: result.remoteData,
      differences: result.differences
    }
    showConflictDialog.value = true
    
  } catch (error) {
    console.error('下载数据失败:', error)
    message.error('下载数据失败')
  } finally {
    downloading.value = false
  }
}

// 打开同步目录
const openSyncDirectory = async () => {
  try {
    const result = await ICloudAPI.openSyncDirectory()
    
    if (result.success) {
      message.success('已打开同步目录')
    } else {
      message.error(`打开目录失败: ${result.message}`)
    }
  } catch (error) {
    console.error('打开同步目录失败:', error)
    message.error('打开同步目录失败')
  }
}

const syncNow = async () => {
  syncing.value = true
  try {
    const result = await ICloudAPI.safeSyncNow()
    
    if (result.success) {
      // 显示更有意义的同步结果信息
      message.success(result.message || '同步完成')
      await updateSyncStatus()
    } else {
      message.error(result.message || '同步失败')
    }
  } catch (error) {
    console.error('立即同步失败:', error)
    message.error('立即同步失败')
  } finally {
    syncing.value = false
  }
}

// 处理冲突解决
const handleConflictResolution = async (resolution: any) => {
  try {
    // 转换解决策略到 API 期望的格式
    const strategyMapping: Record<string, string> = {
      'local_wins': 'use_local',
      'remote_wins': 'use_remote',
      'merge': 'merge_smart',
      'create_duplicate': 'merge_manual'
    }
    
    const apiResolution = {
      strategy: strategyMapping[resolution.strategy] || resolution.strategy,
      mergedData: resolution.mergedData
    }
    
    const result = await ICloudAPI.applyDownloadedData(apiResolution)
    
    if (result.success) {
      message.success('冲突已解决，数据已应用')
      await updateSyncStatus()
    } else {
      message.error(result.message || '应用数据失败')
    }
  } catch (error) {
    console.error('解决冲突失败:', error)
    message.error('解决冲突失败')
  } finally {
    showConflictDialog.value = false
    conflictDialogData.value = null
  }
}

// 取消冲突解决
const handleConflictCancel = () => {
  showConflictDialog.value = false
  conflictDialogData.value = null
  message.info('已取消冲突解决')
}

// 更新同步状态
const updateSyncStatus = async () => {
  try {
    const status = await ICloudAPI.getSyncStatus()
    Object.assign(syncStatus, status)
  } catch (error) {
    console.error('更新同步状态失败:', error)
  }
}

// 初始化
const initializeSettings = async () => {
  try {
    // 加载配置
    try {
      const config = await ICloudAPI.getConfig()
      Object.assign(localConfig, config)
      
      // 从配置中恢复连接状态
      restoreConnectionStatus()
    } catch (configError) {
      console.warn('加载 iCloud 配置失败，使用默认配置:', configError)
      // 使用默认配置
      Object.assign(localConfig, {
        enabled: false,
        autoSync: false,
        syncInterval: 30,
        customPath: undefined
      })
    }
    
    // 更新同步状态
    try {
      await updateSyncStatus()
    } catch (statusError) {
      console.warn('更新同步状态失败:', statusError)
    }
    
    // 不再在初始化时检查 iCloud 状态，只有用户手动点击时才检查
    // 避免在设置页面加载时就触发错误提示
  } catch (error) {
    console.error('初始化 iCloud 设置失败:', error)
    // 不显示错误消息，避免在组件加载时弹出错误
    console.warn('iCloud 同步功能暂不可用')
  }
}

// 组件挂载时初始化
onMounted(async () => {
  // 延迟初始化，确保组件完全挂载
  await nextTick()
  try {
    await initializeSettings()
  } catch (error) {
    console.warn('延迟初始化 iCloud 设置失败:', error)
  }
})
</script>

<style scoped>

.grid {
  display: grid;
}

.grid-cols-1 {
  grid-template-columns: repeat(1, minmax(0, 1fr));
}

@media (min-width: 768px) {
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

.mb-2 {
  margin-bottom: 0.5rem;
}

.mb-4 {
  margin-bottom: 1rem;
}

.mb-6 {
  margin-bottom: 1.5rem;
}

.block {
  display: block;
  width: 100%;
}
</style>
