<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button :text="t('common.back')"></ion-back-button>
        </ion-buttons>
        <ion-title>{{ t('cloudBackup.title') }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <!-- 存储配置列表 -->
      <ion-list v-if="storageConfigs.length > 0">
        <ion-list-header>
          <ion-label>{{ t('cloudBackup.storageConfiguration') }}</ion-label>
        </ion-list-header>

        <ion-item v-for="config in storageConfigs" :key="config.id" button @click="selectStorage(config)">
          <ion-icon :icon="cloudOutline" slot="start"></ion-icon>
          <ion-label>
            <h3>{{ config.name }}</h3>
            <p>{{ getConfigDescription(config) }}</p>
          </ion-label>
          <ion-badge :color="config.enabled ? 'success' : 'warning'" slot="end">
            {{ config.enabled ? t('cloudBackup.enabled') : t('cloudBackup.disabled') }}
          </ion-badge>
        </ion-item>
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
      <ion-modal :is-open="showAddConfigModal" @didDismiss="showAddConfigModal = false">
        <ion-header>
          <ion-toolbar>
            <ion-buttons slot="start">
              <ion-button @click="showAddConfigModal = false">{{ t('common.cancel') }}</ion-button>
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

            <ion-item>
              <ion-label position="stacked">{{ t('cloudBackup.storageType') }}</ion-label>
              <ion-select v-model="configForm.type" interface="action-sheet">
                <ion-select-option value="webdav">WebDAV</ion-select-option>
                <ion-select-option value="icloud">iCloud Drive</ion-select-option>
              </ion-select>
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

            <!-- iCloud Drive 配置 -->
            <template v-if="configForm.type === 'icloud'">
              <!-- Android 平台不支持提示 -->
              <ion-item v-if="platform === 'android'" lines="none">
                <ion-note color="warning">
                  {{ t('cloudBackup.androidNotSupported') }}
                </ion-note>
              </ion-item>

              <!-- iOS 平台 iCloud 不可用提示 -->
              <ion-item v-else-if="!iCloudAvailable" lines="none">
                <ion-note color="warning">
                  {{ t('cloudBackup.icloudNotAvailable') }}
                </ion-note>
              </ion-item>

              <!-- iCloud 配置表单 -->
              <template v-else>
                <ion-item>
                  <ion-label position="stacked">{{ t('cloudBackup.icloudPath') }}</ion-label>
                  <ion-input v-model="configForm.path" placeholder="AI-Gist-Backup"></ion-input>
                </ion-item>
                <ion-note class="ion-padding">
                  {{ t('cloudBackup.icloudPathNote') }}
                </ion-note>
              </template>
            </template>

            <ion-item>
              <ion-label>{{ t('cloudBackup.enableConfig') }}</ion-label>
              <ion-toggle v-model="configForm.enabled"></ion-toggle>
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
              </ion-item>

              <ion-item-options side="end">
                <ion-item-option color="primary" @click="restoreBackup(backup)">
                  <ion-icon :icon="downloadOutline"></ion-icon>
                  {{ t('cloudBackup.restore') }}
                </ion-item-option>
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
import { ref, computed, onMounted } from 'vue'
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
  IonSelect,
  IonSelectOption,
  IonToggle,
  IonNote,
  IonItemSliding,
  IonItemOptions,
  IonItemOption,
  toastController,
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
  refreshOutline
} from 'ionicons/icons'
import { useI18n } from '~/composables/useI18n'
import { mobileCloudBackupService } from '~/lib/services/mobile-cloud-backup.service'
import { databaseService } from '~/lib/db'
import type { CloudStorageConfig, CloudBackupInfo } from '@shared/types/cloud-backup'

const { t } = useI18n()
const router = useRouter()
const platform = Capacitor.getPlatform()

const storageConfigs = ref<CloudStorageConfig[]>([])
const currentBackups = ref<CloudBackupInfo[]>([])
const selectedConfig = ref<CloudStorageConfig | null>(null)
const editingConfig = ref<CloudStorageConfig | null>(null)
const iCloudAvailable = ref(false)

const showAddConfigModal = ref(false)
const showBackupModal = ref(false)

const configForm = ref({
  name: '',
  type: 'webdav' as 'webdav' | 'icloud',
  enabled: true,
  url: '',
  username: '',
  password: '',
  path: 'AI-Gist-Backup'
})

const loading = ref({
  createBackup: false,
  restoreBackup: false
})

const isConfigValid = computed(() => {
  if (!configForm.value.name) return false

  if (configForm.value.type === 'webdav') {
    return !!(configForm.value.url && configForm.value.username && configForm.value.password)
  } else if (configForm.value.type === 'icloud') {
    // Android 不支持 iCloud
    if (platform === 'android') return false
    // iOS 需要 iCloud 可用
    if (!iCloudAvailable.value) return false
    return !!configForm.value.path
  }

  return false
})

// 检查 iCloud 可用性
const checkICloudAvailability = async () => {
  try {
    const result = await mobileCloudBackupService.isICloudAvailable()
    iCloudAvailable.value = result.available
    if (!result.available) {
      console.log('iCloud 不可用:', result.reason)
    }
  } catch (error) {
    console.error('检查 iCloud 可用性失败:', error)
    iCloudAvailable.value = false
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
  selectedConfig.value = config
  showBackupModal.value = true
  await loadBackupList(config.id)
}

// 加载备份列表
const loadBackupList = async (storageId: string) => {
  try {
    console.log('开始加载备份列表，存储ID:', storageId)
    currentBackups.value = await mobileCloudBackupService.getCloudBackupList(storageId)
    console.log('备份列表加载完成，数量:', currentBackups.value.length)
  } catch (error) {
    console.error('加载备份列表失败:', error)
    const errorMessage = error instanceof Error ? error.message : String(error)

    // 如果是 iCloud 目录不存在的错误，显示友好提示
    if (errorMessage.includes('does not exist')) {
      showToast('备份目录不存在，已自动创建。请创建第一个备份。', 'warning')
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
      name: configForm.value.name,
      type: configForm.value.type,
      enabled: configForm.value.enabled,
      ...(configForm.value.type === 'webdav' ? {
        url: configForm.value.url,
        username: configForm.value.username,
        password: configForm.value.password
      } : {
        path: configForm.value.path
      })
    }

    let result
    if (editingConfig.value) {
      result = await mobileCloudBackupService.updateStorageConfig(editingConfig.value.id, configData)
    } else {
      result = await mobileCloudBackupService.addStorageConfig(configData)
    }

    if (result.success) {
      showToast(editingConfig.value ? t('cloudBackup.updateSuccess') : t('cloudBackup.addSuccess'))
      showAddConfigModal.value = false
      await loadStorageConfigs()
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

// 创建备份
const createBackup = async () => {
  if (!selectedConfig.value) return

  const loadingEl = await loadingController.create({
    message: t('cloudBackup.creatingBackup')
  })

  loading.value.createBackup = true

  try {
    await loadingEl.present()

    // 导出数据
    const exportResult = await databaseService.exportAllData()
    if (!exportResult.success) {
      throw new Error(exportResult.error || t('cloudBackup.exportFailed'))
    }

    // 创建云端备份
    const timestamp = new Date().toLocaleString('zh-CN')
    const result = await mobileCloudBackupService.createCloudBackup(
      selectedConfig.value.id,
      exportResult.data,
      `${t('cloudBackup.mobileBackup')} - ${timestamp}`
    )

    if (result.success) {
      showToast(t('cloudBackup.createSuccess'))
      await loadBackupList(selectedConfig.value.id)
    } else {
      showToast(result.error || t('cloudBackup.createFailed'), 'danger')
    }
  } catch (error) {
    console.error('创建备份失败:', error)
    showToast(t('cloudBackup.createFailed'), 'danger')
  } finally {
    await loadingEl.dismiss()
    loading.value.createBackup = false
  }
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
    const result = await mobileCloudBackupService.restoreCloudBackup(
      selectedConfig.value.id,
      backup.id
    )

    if (!result.success || !result.backupInfo?.data) {
      throw new Error(result.error || t('cloudBackup.restoreFailed'))
    }

    // 恢复到数据库
    const restoreResult = await databaseService.replaceAllData(result.backupInfo.data)

    if (!restoreResult.success) {
      throw new Error(restoreResult.error || t('cloudBackup.restoreFailed'))
    }

    await loadingEl.dismiss()
    showToast(t('cloudBackup.restoreSuccess'))

    // 延迟刷新页面
    setTimeout(() => {
      window.location.reload()
    }, 1000)
  } catch (error) {
    await loadingEl.dismiss()
    console.error('恢复备份失败:', error)
    showToast(t('cloudBackup.restoreFailed'), 'danger')
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
    return `iCloud Drive - ${(config as any).path || 'AI-Gist-Backup'}`
  }
}

// 格式化日期
const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleString('zh-CN')
}

// 格式化大小
const formatSize = (size: number) => {
  if (!size || isNaN(size) || size <= 0) return '0 B'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

// 显示提示
const showToast = async (message: string, color: string = 'success') => {
  const toast = await toastController.create({
    message,
    duration: 2000,
    color
  })
  await toast.present()
}

onMounted(() => {
  loadStorageConfigs()
  checkICloudAvailability()
})
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
</style>
