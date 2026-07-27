<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button :text="t('common.back')" default-href="/tabs/settings"></ion-back-button>
        </ion-buttons>
        <ion-title>{{ t('dataSync.title') }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <ion-list>
        <ion-list-header>
          <ion-label>{{ t('cloudBackup.autoSync') }}</ion-label>
        </ion-list-header>
        <ion-item>
          <ion-label>启用自动同步</ion-label>
          <ion-toggle slot="end" :checked="autoSyncEnabled" @ionChange="saveAutoSyncEnabled"></ion-toggle>
        </ion-item>
        <ion-item>
          <ion-label>
            <h3>{{ t('cloudBackup.syncInterval') }}</h3>
            <p>{{ t('cloudBackup.syncIntervalDescription', { minutes: syncIntervalMinutes }) }}</p>
          </ion-label>
          <ion-input
            class="sync-interval-input"
            slot="end"
            type="number"
            inputmode="numeric"
            :min="MIN_CLOUD_SYNC_INTERVAL_MINUTES"
            :max="MAX_CLOUD_SYNC_INTERVAL_MINUTES"
            :value="syncIntervalMinutes"
            @ionInput="handleSyncIntervalInput"
          ></ion-input>
        </ion-item>
        <div class="sync-interval-actions">
          <ion-button
            size="small"
            fill="outline"
            @click="saveSyncInterval"
            :disabled="loading.saveSyncInterval"
          >
            {{ t('cloudBackup.saveSyncInterval') }}
          </ion-button>
        </div>
        <ion-item>
          <ion-label>
            <h3>自动恢复快照</h3>
            <p>仅在数据变化时创建完整备份；保留份数同时约束自动备份和同步恢复版本</p>
          </ion-label>
          <ion-toggle slot="end" :checked="autoBackupEnabled" @ionChange="saveAutoBackupEnabled"></ion-toggle>
        </ion-item>
        <ion-item>
          <ion-label>快照间隔（分钟）</ion-label>
          <ion-input slot="end" type="number" :value="autoBackupIntervalMinutes" @ionInput="handleAutoBackupIntervalInput"></ion-input>
        </ion-item>
        <ion-item>
          <ion-label>保留份数</ion-label>
          <ion-input slot="end" type="number" :value="autoBackupRetention" @ionInput="handleAutoBackupRetentionInput"></ion-input>
        </ion-item>
        <div class="sync-interval-actions">
          <ion-button size="small" fill="outline" @click="saveAutoBackupSettings">保存快照策略</ion-button>
          <ion-button size="small" fill="outline" @click="automaticBackupService.runNow('manual')">立即创建</ion-button>
        </div>
      </ion-list>

      <ion-list v-if="restoreSuspensions.length > 0">
        <ion-list-header>
          <ion-label>{{ t('cloudBackup.restoreDecisionTitle') }}</ion-label>
        </ion-list-header>
        <ion-item v-for="suspension in restoreSuspensions" :key="suspension.storageId" class="restore-suspension-item">
          <ion-label>
            <h3>{{ getStorageName(suspension.storageId) }}</h3>
            <p>{{ t('cloudBackup.restoreDecisionDescription') }}</p>
          </ion-label>
        </ion-item>
        <div class="sync-interval-actions">
          <ion-button
            v-for="suspension in restoreSuspensions"
            :key="`${suspension.storageId}-merge`"
            size="small"
            fill="outline"
            :disabled="loading.restoreDecision"
            @click="resolveRestoreDecision(suspension.storageId, 'merge')"
          >
            {{ t('cloudBackup.mergeWithCloud') }}
          </ion-button>
          <ion-button
            v-for="suspension in restoreSuspensions"
            :key="`${suspension.storageId}-overwrite`"
            size="small"
            color="danger"
            :disabled="loading.restoreDecision"
            @click="confirmRestoreOverwrite(suspension.storageId)"
          >
            {{ t('cloudBackup.overwriteCloud') }}
          </ion-button>
        </div>
      </ion-list>

      <ion-list>
        <ion-list-header>
          <ion-label>{{ t('cloudBackup.syncStatus') }}</ion-label>
        </ion-list-header>
        <ion-item>
          <ion-label>
            <h3>{{ getSyncStatusLabel() }}</h3>
            <p v-if="syncStatus.lastSyncAt">{{ t('cloudBackup.lastSyncAt') }}: {{ formatDate(syncStatus.lastSyncAt) }}</p>
            <p v-if="syncStatus.error">{{ syncStatus.error }}</p>
          </ion-label>
          <ion-badge slot="end" :color="getSyncStatusColor()">{{ getSyncStatusBadge() }}</ion-badge>
        </ion-item>
      </ion-list>

      <!-- 存储配置列表 -->
      <ion-list v-if="storageConfigs.length > 0">
        <ion-list-header>
          <ion-label>{{ t('cloudBackup.storageConfiguration') }}</ion-label>
        </ion-list-header>

        <ion-item-sliding v-for="config in storageConfigs" :key="config.id">
          <ion-item button @click="selectStorage(config)">
            <ion-icon :icon="cloudOutline" slot="start"></ion-icon>
            <ion-label>
              <h3>{{ config.name }}</h3>
              <p>{{ getConfigDescription(config) }}</p>
            </ion-label>
            <ion-badge :color="config.enabled ? 'success' : 'warning'" slot="end">
              {{ config.enabled ? t('cloudBackup.enabled') : t('cloudBackup.disabled') }}
            </ion-badge>
          </ion-item>

          <ion-item-options side="end">
            <ion-item-option color="primary" @click="editConfig(config)">
              <ion-icon :icon="createOutline"></ion-icon>
              {{ t('common.edit') }}
            </ion-item-option>
            <ion-item-option color="danger" @click="deleteConfig(config)">
              <ion-icon :icon="trashOutline"></ion-icon>
              {{ t('common.delete') }}
            </ion-item-option>
          </ion-item-options>
        </ion-item-sliding>
      </ion-list>

      <!-- 无配置提示 -->
      <div v-else class="empty-state">
        <ion-icon :icon="cloudOfflineOutline" size="large"></ion-icon>
        <p>{{ t('cloudBackup.noStorageConfig') }}</p>
      </div>

      <!-- 添加配置按钮 -->
      <ion-fab vertical="bottom" horizontal="end" slot="fixed">
        <ion-fab-button @click="showAddConfigModal = true">
          <ion-icon :icon="addOutline"></ion-icon>
        </ion-fab-button>
      </ion-fab>

      <!-- 添加/编辑配置模态框 -->
      <ion-modal :is-open="showAddConfigModal" @didDismiss="closeConfigModal">
        <ion-header>
          <ion-toolbar>
            <ion-buttons slot="start">
              <ion-button @click="closeConfigModal">{{ t('common.cancel') }}</ion-button>
            </ion-buttons>
            <ion-title>{{ editingConfig ? t('cloudBackup.editConfig') : t('cloudBackup.addStorageConfig') }}</ion-title>
            <ion-buttons slot="end">
              <ion-button @click="saveConfig" :disabled="!isConfigValid">{{ t('common.save') }}</ion-button>
            </ion-buttons>
          </ion-toolbar>
        </ion-header>
        <ion-content>
          <ion-list>
            <ion-item>
              <ion-label position="stacked">{{ t('cloudBackup.configName') }}</ion-label>
              <ion-input v-model="configForm.name" :placeholder="t('cloudBackup.configNamePlaceholder')"></ion-input>
            </ion-item>

            <!-- WebDAV 配置 -->
            <template v-if="configForm.type === 'webdav'">
              <ion-item>
                <ion-label position="stacked">{{ t('cloudBackup.serverUrl') }}</ion-label>
                <ion-input v-model="configForm.url" placeholder="https://your-webdav-server.com"></ion-input>
              </ion-item>
              <ion-item>
                <ion-label position="stacked">{{ t('cloudBackup.username') }}</ion-label>
                <ion-input v-model="configForm.username" :placeholder="t('cloudBackup.usernamePlaceholder')"></ion-input>
              </ion-item>
              <ion-item>
                <ion-label position="stacked">{{ t('cloudBackup.password') }}</ion-label>
                <ion-input v-model="configForm.password" type="password" :placeholder="t('cloudBackup.passwordPlaceholder')"></ion-input>
              </ion-item>
            </template>

            <ion-item>
              <ion-label>{{ t('cloudBackup.enableConfig') }}</ion-label>
              <ion-toggle v-model="configForm.enabled"></ion-toggle>
            </ion-item>

            <ion-item lines="none">
              <ion-button
                expand="block"
                fill="outline"
                class="connection-test-button"
                @click="testConfigConnection"
                :disabled="!isConfigValid || loading.testConnection"
              >
                <ion-spinner v-if="loading.testConnection" slot="start"></ion-spinner>
                {{ t('aiConfig.connectionTest') }}
              </ion-button>
            </ion-item>
          </ion-list>
        </ion-content>
      </ion-modal>

      <!-- 备份管理模态框 -->
      <ion-modal :is-open="showBackupModal" @didDismiss="showBackupModal = false">
        <ion-header>
          <ion-toolbar>
            <ion-buttons slot="start">
              <ion-button @click="showBackupModal = false">{{ t('common.close') }}</ion-button>
            </ion-buttons>
            <ion-title>{{ selectedConfig?.name }}</ion-title>
            <ion-buttons slot="end">
              <ion-button @click="refreshBackupList">
                <ion-icon :icon="refreshOutline"></ion-icon>
              </ion-button>
            </ion-buttons>
          </ion-toolbar>
        </ion-header>
        <ion-content>
          <!-- 操作按钮 -->
          <div class="action-buttons">
            <ion-button expand="block" @click="createBackup" :disabled="loading.createBackup">
              <ion-icon :icon="cloudUploadOutline" slot="start"></ion-icon>
              {{ t('cloudBackup.createCloudBackup') }}
            </ion-button>
            <ion-button expand="block" fill="outline" @click="syncCloudData()" :disabled="loading.syncNow">
              <ion-icon :icon="syncOutline" slot="start"></ion-icon>
              {{ t('cloudBackup.syncNow') }}
            </ion-button>
          </div>

          <!-- 备份列表 -->
          <ion-list v-if="currentBackups.length > 0">
            <ion-list-header>
              <ion-label>{{ t('cloudBackup.cloudBackupList') }}</ion-label>
            </ion-list-header>

            <ion-item-sliding v-for="backup in currentBackups" :key="backup.id">
              <ion-item>
                <ion-icon :icon="documentOutline" slot="start"></ion-icon>
                <ion-label>
                  <h3>{{ backup.name }}</h3>
                  <p>{{ backup.description }}</p>
                  <p>{{ formatDate(backup.createdAt) }} · {{ formatSize(backup.size) }}</p>
                </ion-label>
                <ion-button slot="end" color="primary" @click="restoreBackup(backup)">
                  <ion-icon :icon="downloadOutline" slot="start"></ion-icon>
                  {{ t('cloudBackup.restore') }}
                </ion-button>
              </ion-item>

              <ion-item-options side="end">
                <ion-item-option color="danger" @click="deleteBackup(backup)">
                  <ion-icon :icon="trashOutline"></ion-icon>
                  {{ t('cloudBackup.delete') }}
                </ion-item-option>
              </ion-item-options>
            </ion-item-sliding>
          </ion-list>

          <!-- 无备份提示 -->
          <div v-else class="empty-state">
            <ion-icon :icon="folderOpenOutline" size="large"></ion-icon>
            <p>{{ t('cloudBackup.noCloudBackups') }}</p>
          </div>
        </ion-content>
      </ion-modal>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { Capacitor } from '@capacitor/core'
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonBackButton,
  IonButton,
  IonList,
  IonListHeader,
  IonItem,
  IonLabel,
  IonIcon,
  IonBadge,
  IonFab,
  IonFabButton,
  IonModal,
  IonInput,
  IonToggle,
  IonItemSliding,
  IonItemOptions,
  IonItemOption,
  IonSpinner,
  alertController,
  loadingController
} from '@ionic/vue'
import {
  cloudOutline,
  cloudOfflineOutline,
  addOutline,
  cloudUploadOutline,
  downloadOutline,
  trashOutline,
  documentOutline,
  folderOpenOutline,
  refreshOutline,
  createOutline,
  syncOutline
} from 'ionicons/icons'
import { useI18n } from '~/composables/useI18n'
import { mobileCloudBackupService } from '~/lib/services/mobile-cloud-backup.service'
import { CloudBackupAPI } from '~/lib/api/cloud-backup.api'
import {
  cloudSyncService,
  DEFAULT_CLOUD_SYNC_INTERVAL_MINUTES,
  MAX_CLOUD_SYNC_INTERVAL_MINUTES,
  MIN_CLOUD_SYNC_INTERVAL_MINUTES,
  getCloudSyncResultMessage,
  getCloudSyncErrorDiagnosis
} from '~/lib/services/cloud-sync.service'
import {
  automaticBackupService,
  DEFAULT_AUTO_BACKUP_INTERVAL_MINUTES,
  DEFAULT_AUTO_BACKUP_RETENTION
} from '~/lib/services/automatic-backup.service'
import { presentMobileToast } from '~/lib/utils/mobile-toast'
import type { CloudStorageConfig, CloudBackupInfo } from '@shared/types/cloud-backup'
import type {
  CloudSyncResult,
  CloudSyncRestoreSuspension,
  CloudSyncStatus
} from '~/lib/services/cloud-sync.service'

const { t } = useI18n()
const router = useRouter()
const platform = Capacitor.getPlatform()

const storageConfigs = ref<CloudStorageConfig[]>([])
const currentBackups = ref<CloudBackupInfo[]>([])
const syncIntervalMinutes = ref(DEFAULT_CLOUD_SYNC_INTERVAL_MINUTES)
const autoSyncEnabled = ref(true)
const autoBackupEnabled = ref(true)
const autoBackupIntervalMinutes = ref(DEFAULT_AUTO_BACKUP_INTERVAL_MINUTES)
const autoBackupRetention = ref(DEFAULT_AUTO_BACKUP_RETENTION)
const selectedConfig = ref<CloudStorageConfig | null>(null)
const editingConfig = ref<CloudStorageConfig | null>(null)
const restoreSuspensions = ref<CloudSyncRestoreSuspension[]>(cloudSyncService.getRestoreSuspensions())
const syncStatus = ref<CloudSyncStatus>(cloudSyncService.getStatus())
let unsubscribeSyncStatus: (() => void) | null = null

const showAddConfigModal = ref(false)
const showBackupModal = ref(false)

const configForm = ref({
  name: '',
  type: 'webdav' as const,
  enabled: true,
  url: '',
  username: '',
  password: ''
})

const loading = ref({
  createBackup: false,
  restoreBackup: false,
  restoreDecision: false,
  syncNow: false,
  saveSyncInterval: false,
  testConnection: false
})

const isConfigValid = computed(() => {
  if (!configForm.value.name.trim()) return false

  return !!(configForm.value.url.trim() && configForm.value.username.trim() && configForm.value.password)
})

const handleSyncIntervalInput = (event: CustomEvent<{ value?: string | number | null }>) => {
  const value = Number(event.detail?.value)
  if (Number.isFinite(value)) {
    syncIntervalMinutes.value = value
  }
}

const loadSyncInterval = async () => {
  syncIntervalMinutes.value = await cloudSyncService.getAutoSyncIntervalMinutes()
}

const loadAutomationSettings = async () => {
  autoSyncEnabled.value = await cloudSyncService.getAutoSyncEnabled()
  autoBackupEnabled.value = await automaticBackupService.getEnabled()
  autoBackupIntervalMinutes.value = await automaticBackupService.getIntervalMinutes()
  autoBackupRetention.value = await automaticBackupService.getRetention()
}

const saveAutoSyncEnabled = async (event: CustomEvent<{ checked: boolean }>) => {
  autoSyncEnabled.value = await cloudSyncService.setAutoSyncEnabled(event.detail.checked)
}

const saveAutoBackupEnabled = async (event: CustomEvent<{ checked: boolean }>) => {
  autoBackupEnabled.value = await automaticBackupService.setEnabled(event.detail.checked)
}

const handleAutoBackupIntervalInput = (event: CustomEvent<{ value?: string | number | null }>) => {
  const value = Number(event.detail.value)
  if (Number.isFinite(value)) autoBackupIntervalMinutes.value = value
}

const handleAutoBackupRetentionInput = (event: CustomEvent<{ value?: string | number | null }>) => {
  const value = Number(event.detail.value)
  if (Number.isFinite(value)) autoBackupRetention.value = value
}

const saveAutoBackupSettings = async () => {
  autoBackupIntervalMinutes.value = await automaticBackupService.setIntervalMinutes(autoBackupIntervalMinutes.value)
  const retentionResult = await automaticBackupService.setRetention(autoBackupRetention.value)
  autoBackupRetention.value = retentionResult.retention
  if (retentionResult.warnings.length > 0) {
    await showToast(`策略已保存，但部分旧版本清理失败：${retentionResult.warnings.join('；')}`, 'warning')
  } else if (retentionResult.deferredCount > 0) {
    await showToast(`已清理 ${retentionResult.deletedCount} 个旧版本；${retentionResult.deferredCount} 个刚写入的版本将在安全窗口后重试`)
  } else {
    await showToast(`保留策略已生效，已清理 ${retentionResult.deletedCount} 个旧版本`)
  }
}

const saveSyncInterval = async () => {
  loading.value.saveSyncInterval = true
  try {
    syncIntervalMinutes.value = await cloudSyncService.setAutoSyncIntervalMinutes(syncIntervalMinutes.value)
    await showToast(t('cloudBackup.saveSyncIntervalSuccess', { minutes: syncIntervalMinutes.value }))
  } catch (error) {
    console.error('保存自动同步频率失败:', error)
    await showToast(t('cloudBackup.saveSyncIntervalFailed'), 'danger')
  } finally {
    loading.value.saveSyncInterval = false
  }
}

// 加载存储配置
const loadStorageConfigs = async () => {
  try {
    storageConfigs.value = await mobileCloudBackupService.getStorageConfigs()
  } catch (error) {
    console.error('加载存储配置失败:', error)
    showToast(t('cloudBackup.loadConfigsFailed'), 'danger')
  }
}

// 选择存储
const selectStorage = async (config: CloudStorageConfig) => {
  if (config.type !== 'webdav') {
    await showToast(t('cloudBackup.mobileICloudUnsupported'), 'warning')
    return
  }
  selectedConfig.value = config
  showBackupModal.value = true
  await loadBackupList(config.id)
}

// 编辑配置
const editConfig = (config: CloudStorageConfig) => {
  if (config.type !== 'webdav') {
    void showToast(t('cloudBackup.mobileICloudUnsupported'), 'warning')
    return
  }
  editingConfig.value = config
  configForm.value = {
    name: config.name,
    type: config.type,
    enabled: config.enabled,
    url: (config as any).url || '',
    username: (config as any).username || '',
    password: (config as any).password || ''
  }
  showAddConfigModal.value = true
}

// 删除配置
const deleteConfig = async (config: CloudStorageConfig) => {
  const alert = await alertController.create({
    header: t('common.confirm'),
    message: t('cloudBackup.confirmDeleteConfig'),
    buttons: [
      {
        text: t('common.cancel'),
        role: 'cancel'
      },
      {
        text: t('common.delete'),
        role: 'destructive',
        handler: async () => {
          await performDeleteConfig(config)
        }
      }
    ]
  })

  await alert.present()
}

// 执行删除配置
const performDeleteConfig = async (config: CloudStorageConfig) => {
  try {
    const result = await mobileCloudBackupService.deleteStorageConfig(config.id)

    if (result.success) {
      showToast(t('cloudBackup.deleteConfigSuccess'))
      await loadStorageConfigs()
    } else {
      showToast(result.error || t('cloudBackup.deleteConfigFailed'), 'danger')
    }
  } catch (error) {
    console.error('删除配置失败:', error)
    showToast(t('cloudBackup.deleteConfigFailed'), 'danger')
  }
}

// 重置配置表单
const resetConfigForm = () => {
  editingConfig.value = null
  configForm.value = {
    name: '',
    type: 'webdav',
    enabled: true,
    url: '',
    username: '',
    password: ''
  }
}

// 加载备份列表
const loadBackupList = async (storageId: string) => {
  try {
    currentBackups.value = await mobileCloudBackupService.getCloudBackupList(storageId)
  } catch (error) {
    console.error('加载备份列表失败:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)

    // 如果是 iCloud 目录不存在的错误，显示友好提示
    if (errorMessage.includes('does not exist')) {
      showToast(t('cloudBackup.backupDirectoryCreated'), 'warning')
    } else {
      showToast(t('cloudBackup.loadBackupsFailed') + ': ' + errorMessage, 'danger')
    }

    // 即使失败也设置为空数组，避免界面显示错误
    currentBackups.value = []
  }
}

// 刷新备份列表
const refreshBackupList = async () => {
  if (selectedConfig.value) {
    await loadBackupList(selectedConfig.value.id)
    showToast(t('cloudBackup.refreshSuccess'))
  }
}

// 保存配置
const saveConfig = async () => {
  const loadingEl = await loadingController.create({
    message: t('common.loading')
  })

  try {
    await loadingEl.present()

    const configData = {
      name: configForm.value.name.trim(),
      type: configForm.value.type,
      enabled: configForm.value.enabled,
      url: configForm.value.url.trim(),
      username: configForm.value.username.trim(),
      password: configForm.value.password
    }

    let result
    if (editingConfig.value) {
      result = await mobileCloudBackupService.updateStorageConfig(editingConfig.value.id, configData)
    } else {
      result = await mobileCloudBackupService.addStorageConfig(configData)
    }

    if (result.success) {
      showToast(editingConfig.value ? t('cloudBackup.updateSuccess') : t('cloudBackup.addSuccess'))
      closeConfigModal()
      await loadStorageConfigs()
      if (result.config?.enabled) {
        cloudSyncService.scheduleSync('config-change', {
          storageId: result.config.id,
          delayMs: 0
        })
      }
    } else {
      showToast(result.error || t('cloudBackup.saveFailed'), 'danger')
    }
  } catch (error) {
    console.error('保存配置失败:', error)
    showToast(t('cloudBackup.saveFailed'), 'danger')
  } finally {
    await loadingEl.dismiss()
  }
}

const testConfigConnection = async () => {
  if (!isConfigValid.value) return

  loading.value.testConnection = true
  try {
    const result = await mobileCloudBackupService.testStorageConnection({
      id: editingConfig.value?.id || 'draft',
      createdAt: editingConfig.value?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      name: configForm.value.name.trim(),
      type: configForm.value.type,
      enabled: configForm.value.enabled,
      url: configForm.value.url.trim(),
      username: configForm.value.username.trim(),
      password: configForm.value.password
    } as CloudStorageConfig)

    if (result.success) {
      await showToast(result.warning || t('aiConfig.connectionTestSuccess'), result.warning ? 'warning' : 'success')
    } else {
      await showToast(result.error || t('aiConfig.connectionTestFailed'), 'danger')
    }
  } catch (error) {
    console.error('测试存储连接失败:', error)
    await showToast(t('aiConfig.connectionTestFailed'), 'danger')
  } finally {
    loading.value.testConnection = false
  }
}

// 关闭配置模态框
const closeConfigModal = () => {
  showAddConfigModal.value = false
  resetConfigForm()
}

// 创建备份
const createBackup = async () => {
  if (!selectedConfig.value) return

  const loadingEl = await loadingController.create({
    message: t('cloudBackup.creatingBackup')
  })

  loading.value.createBackup = true

  try {
    await loadingEl.present()

    const timestamp = new Date().toLocaleString()
    const result = await CloudBackupAPI.createCloudBackup(
      selectedConfig.value.id,
      {
        description: `${t('cloudBackup.mobileBackup')} - ${timestamp}`,
        backupType: 'manual',
        trigger: 'manual'
      }
    )

    if (result.success) {
      showToast(t('cloudBackup.createSuccess'))
      await loadBackupList(selectedConfig.value.id)
    } else {
      const friendlyError = getFriendlyBackupError(result.error)
      showToast(friendlyError, 'danger')
    }
  } catch (error) {
    console.error('创建备份失败:', error)
    const friendlyError = getFriendlyBackupError(error instanceof Error ? error.message : String(error))
    showToast(friendlyError, 'danger')
  } finally {
    await loadingEl.dismiss()
    loading.value.createBackup = false
  }
}

// 立即同步
const syncCloudData = async (forceRetry = false) => {
  if (!selectedConfig.value) return

  const loadingEl = await loadingController.create({
    message: t('cloudBackup.syncing')
  })

  loading.value.syncNow = true
  let syncError: string | CloudSyncResult | undefined

  try {
    await loadingEl.present()

    const result = await cloudSyncService.syncNow(selectedConfig.value.id, {
      platform,
      deviceName: getDeviceLabel(),
      reason: 'manual',
      forceRetry
    })

    if (result.success) {
      showToast([
        getCloudSyncResultMessage(result.action, result.conflicts.length),
        ...(result.warnings || [])
      ].join('；'))
    } else {
      syncError = result
    }
  } catch (error) {
    console.error('云同步失败:', error)
    syncError = error instanceof Error ? error.message : String(error)
  } finally {
    await loadingEl.dismiss()
    loading.value.syncNow = false
  }

  if (syncError) {
    await presentSyncErrorDetails(syncError)
  }
}

const presentSyncErrorDetails = async (error?: string | CloudSyncResult) => {
  const storageId = selectedConfig.value?.id
  const diagnosis = getCloudSyncErrorDiagnosis(error, {
    storageId,
    reason: 'manual',
    status: 'error',
    timestamp: new Date().toISOString()
  })

  await showToast(diagnosis.message, 'danger')

  const alert = await alertController.create({
    header: diagnosis.title,
    message: [
      `<p>${escapeHtml(diagnosis.message)}</p>`,
      '<p><strong>建议操作</strong></p>',
      '<ul>',
      ...diagnosis.suggestedActions.map(action => `<li>${escapeHtml(action)}</li>`),
      '</ul>',
      '<p><strong>完整错误详情</strong></p>',
      `<pre class="cloud-sync-error-report">${escapeHtml(diagnosis.copyText)}</pre>`
    ].join(''),
    buttons: [
      {
        text: '复制详情',
        handler: () => {
          void copySyncErrorDetails(diagnosis.copyText)
        }
      },
      {
        text: '重新同步',
        handler: () => {
          void syncCloudData(true)
        }
      },
      {
        text: t('common.close'),
        role: 'cancel'
      }
    ]
  })

  await alert.present()
}

const copySyncErrorDetails = async (copyText: string) => {
  try {
    await navigator.clipboard.writeText(copyText)
    await showToast('错误详情已复制')
  } catch {
    await showToast('复制错误详情失败', 'danger')
  }
}

const getStorageName = (storageId: string) =>
  storageConfigs.value.find(config => config.id === storageId)?.name || storageId

const getSyncStatusLabel = () => {
  if (restoreSuspensions.value.length > 0) return t('cloudBackup.restoreDecisionDescription')
  return t(`cloudBackup.syncStatusValues.${syncStatus.value.status}`)
}

const getSyncStatusBadge = () => restoreSuspensions.value.length > 0 ? 'paused' : syncStatus.value.status

const getSyncStatusColor = () => {
  if (restoreSuspensions.value.length > 0 || ['error', 'paused'].includes(syncStatus.value.status)) return 'warning'
  if (syncStatus.value.status === 'success') return 'success'
  if (syncStatus.value.status === 'syncing' || syncStatus.value.status === 'scheduled') return 'primary'
  return 'medium'
}

const resolveRestoreDecision = async (storageId: string, decision: 'merge' | 'overwrite') => {
  loading.value.restoreDecision = true
  try {
    const result = decision === 'merge'
      ? await cloudSyncService.resumeRestoreWithMerge(storageId, {
          platform,
          deviceName: getDeviceLabel()
        })
      : await cloudSyncService.publishRestoredDataToCloud(storageId, {
          platform,
          deviceName: getDeviceLabel()
        })
    if (!result.success) {
      await presentSyncErrorDetails(result)
      return
    }
    restoreSuspensions.value = cloudSyncService.getRestoreSuspensions()
    await showToast(decision === 'merge'
      ? t('cloudBackup.mergeWithCloudSuccess')
      : t('cloudBackup.overwriteCloudSuccess'))
  } finally {
    loading.value.restoreDecision = false
  }
}

const confirmRestoreOverwrite = async (storageId: string) => {
  const alert = await alertController.create({
    header: t('cloudBackup.overwriteCloud'),
    message: t('cloudBackup.overwriteCloudWarning'),
    buttons: [
      { text: t('common.cancel'), role: 'cancel' },
      {
        text: t('common.confirm'),
        role: 'destructive',
        handler: () => { void resolveRestoreDecision(storageId, 'overwrite') }
      }
    ]
  })
  await alert.present()
}

const escapeHtml = (value: string) => {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

// 恢复备份
const restoreBackup = async (backup: CloudBackupInfo) => {
  const alert = await alertController.create({
    header: t('common.confirm'),
    message: t('cloudBackup.restoreWarning'),
    buttons: [
      {
        text: t('common.cancel'),
        role: 'cancel'
      },
      {
        text: t('common.confirm'),
        handler: async () => {
          await performRestore(backup)
        }
      }
    ]
  })

  await alert.present()
}

// 执行恢复
const performRestore = async (backup: CloudBackupInfo) => {
  const loadingEl = await loadingController.create({
    message: t('cloudBackup.restoringBackup')
  })

  loading.value.restoreBackup = true

  try {
    await loadingEl.present()

    if (!selectedConfig.value) {
      throw new Error(t('cloudBackup.noStorageSelected'))
    }

    // 从云端获取备份数据
    const result = await CloudBackupAPI.restoreCloudBackup(
      selectedConfig.value.id,
      backup.id
    )

    if (!result.success) {
      throw new Error(result.error || t('cloudBackup.restoreFailed'))
    }

    await loadingEl.dismiss()
    showToast(t('cloudBackup.restoreSuccess'))
    restoreSuspensions.value = cloudSyncService.getRestoreSuspensions()
  } catch (error) {
    await loadingEl.dismiss()
    console.error('恢复备份失败:', error)
    const friendlyError = getFriendlyRestoreError(error instanceof Error ? error.message : String(error))
    showToast(friendlyError, 'danger')
  } finally {
    loading.value.restoreBackup = false
  }
}

// 删除备份
const deleteBackup = async (backup: CloudBackupInfo) => {
  const alert = await alertController.create({
    header: t('common.confirm'),
    message: t('cloudBackup.confirmDeleteBackup'),
    buttons: [
      {
        text: t('common.cancel'),
        role: 'cancel'
      },
      {
        text: t('common.confirm'),
        handler: async () => {
          await performDelete(backup)
        }
      }
    ]
  })

  await alert.present()
}

// 执行删除
const performDelete = async (backup: CloudBackupInfo) => {
  try {
    if (!selectedConfig.value) return

    const result = await mobileCloudBackupService.deleteCloudBackup(
      selectedConfig.value.id,
      backup.id
    )

    if (result.success) {
      showToast(t('cloudBackup.deleteSuccess'))
      await loadBackupList(selectedConfig.value.id)
    } else {
      showToast(result.error || t('cloudBackup.deleteFailed'), 'danger')
    }
  } catch (error) {
    console.error('删除备份失败:', error)
    showToast(t('cloudBackup.deleteFailed'), 'danger')
  }
}

// 获取配置描述
const getConfigDescription = (config: CloudStorageConfig) => {
  if (config.type === 'webdav') {
    return (config as any).url
  } else {
    return t('cloudBackup.mobileICloudUnsupported')
  }
}

// 格式化日期
const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleString()
}

const getDeviceLabel = () => {
  const language = navigator.language || 'unknown-locale'
  return `${platform}-${language}`
}

// 格式化大小
const formatSize = (size: number) => {
  if (!size || isNaN(size) || size <= 0) return '0 B'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

// 将技术错误转换为用户友好的备份错误提示
const getFriendlyBackupError = (error?: string): string => {
  if (!error) return '备份创建失败，请稍后重试'
  if (error.includes('401') || error.includes('Unauthorized') || error.includes('403')) {
    return '存储服务认证失败，请检查用户名和密码是否正确'
  }
  if (error.includes('404') || error.includes('Not Found')) {
    return '备份目录不存在，请确认 WebDAV 服务器上的路径配置正确'
  }
  if (error.includes('ECONNREFUSED') || error.includes('Network') || error.includes('network') || error.includes('fetch')) {
    return '无法连接到存储服务器，请检查网络连接和服务器地址'
  }
  if (error.includes('timeout') || error.includes('Timeout')) {
    return '连接超时，请检查网络状态或稍后重试'
  }
  if (error.includes('数据库') || error.includes('database')) {
    return '读取本地数据失败，请尝试重启应用后再备份'
  }
  return `备份失败：${error}`
}

// 将技术错误转换为用户友好的恢复错误提示
const getFriendlyRestoreError = (error?: string): string => {
  if (!error) return '恢复失败，请稍后重试'
  if (error.includes('401') || error.includes('Unauthorized') || error.includes('403')) {
    return '存储服务认证失败，请检查用户名和密码是否正确'
  }
  if (error.includes('404') || error.includes('Not Found') || error.includes('备份不存在')) {
    return '备份文件不存在，可能已被删除。请刷新列表后重试'
  }
  if (error.includes('ECONNREFUSED') || error.includes('Network') || error.includes('network') || error.includes('fetch')) {
    return '无法连接到存储服务器，请检查网络连接和服务器地址'
  }
  if (error.includes('timeout') || error.includes('Timeout')) {
    return '下载超时，请检查网络状态或稍后重试'
  }
  if (error.includes('JSON') || error.includes('parse') || error.includes('格式')) {
    return '备份文件格式损坏，无法恢复。请尝试其他备份'
  }
  if (error.includes('数据库') || error.includes('database')) {
    return '写入本地数据库失败，请尝试重启应用后再恢复'
  }
  return `恢复失败：${error}`
}

// 显示提示
const showToast = async (message: string, color: string = 'success') => {
  await presentMobileToast(message, color)
}

onMounted(() => {
  unsubscribeSyncStatus = cloudSyncService.onStatusChange(status => {
    syncStatus.value = status
    restoreSuspensions.value = cloudSyncService.getRestoreSuspensions()
  })
  loadSyncInterval()
  loadAutomationSettings()
  loadStorageConfigs()
})

onUnmounted(() => unsubscribeSyncStatus?.())
</script>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
  color: var(--ion-color-medium);
}

.empty-state ion-icon {
  margin-bottom: 16px;
  font-size: 64px;
}

.action-buttons {
  padding: 16px;
}

.sync-interval-input {
  width: 88px;
  text-align: right;
}

.sync-interval-actions {
  padding: 0 16px 12px;
}

.restore-suspension-item {
  --background: color-mix(in srgb, var(--accent-warning) 10%, var(--surface-primary));
  --border-color: color-mix(in srgb, var(--accent-warning) 28%, var(--border-default));
}

.connection-test-button {
  width: 100%;
  margin: 8px 0;
}

:global(.cloud-sync-error-report) {
  max-height: 220px;
  padding: 10px;
  overflow: auto;
  color: var(--content-primary);
  font-size: 12px;
  line-height: 1.45;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  background: var(--surface-secondary);
  border-radius: 8px;
}
</style>
