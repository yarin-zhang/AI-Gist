<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ t('mainPage.menu.settings') }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <ion-list>
        <!-- 外观设置 -->
        <ion-list-header>
          <ion-label>{{ t('appearance.theme') }}</ion-label>
        </ion-list-header>

        <ion-item>
          <ion-label>{{ t('language.selectLanguage') }}</ion-label>
          <ion-select
            slot="end"
            v-model="currentLanguage"
            interface="action-sheet"
            @ionChange="handleLanguageChange"
          >
            <ion-select-option value="zh-CN">简体中文</ion-select-option>
            <ion-select-option value="zh-TW">繁體中文</ion-select-option>
            <ion-select-option value="en-US">English</ion-select-option>
            <ion-select-option value="ja-JP">日本語</ion-select-option>
          </ion-select>
        </ion-item>

        <ion-item>
          <ion-label>{{ t('appearance.theme') }}</ion-label>
          <ion-select
            slot="end"
            v-model="currentTheme"
            interface="action-sheet"
            @ionChange="handleThemeChange"
          >
            <ion-select-option value="light">{{ t('appearance.light') }}</ion-select-option>
            <ion-select-option value="dark">{{ t('appearance.dark') }}</ion-select-option>
            <ion-select-option value="system">{{ t('appearance.auto') }}</ion-select-option>
          </ion-select>
        </ion-item>

        <!-- 数据同步 -->
        <ion-list-header>
          <ion-label>{{ t('dataSync.title') }}</ion-label>
        </ion-list-header>

        <ion-item button @click="navigateToCloudBackup">
          <ion-icon :icon="cloudOutline" slot="start"></ion-icon>
          <ion-label>{{ t('dataSync.title') }}</ion-label>
        </ion-item>

        <!-- 数据备份 -->
        <ion-list-header>
          <ion-label>{{ t('dataBackup.title') }}</ion-label>
        </ion-list-header>

        <ion-item>
          <ion-label>
            <h3>{{ t('dataBackup.automaticBackupSettings') }}</h3>
            <p>{{ t('dataBackup.automaticBackupDescription') }}</p>
          </ion-label>
          <ion-toggle
            slot="end"
            :checked="autoBackupEnabled"
            @ionChange="saveAutoBackupEnabled"
          ></ion-toggle>
        </ion-item>

        <ion-item>
          <ion-label>{{ t('dataBackup.automaticBackupInterval') }}</ion-label>
          <ion-input
            class="backup-number-input"
            slot="end"
            type="number"
            inputmode="numeric"
            :min="MIN_AUTO_BACKUP_INTERVAL_MINUTES"
            :max="MAX_AUTO_BACKUP_INTERVAL_MINUTES"
            :value="autoBackupIntervalMinutes"
            @ionInput="handleAutoBackupIntervalInput"
          ></ion-input>
        </ion-item>

        <ion-item>
          <ion-label>{{ t('dataBackup.automaticBackupRetention') }}</ion-label>
          <ion-input
            class="backup-number-input"
            slot="end"
            type="number"
            inputmode="numeric"
            min="1"
            max="100"
            :value="autoBackupRetention"
            @ionInput="handleAutoBackupRetentionInput"
          ></ion-input>
        </ion-item>

        <div class="backup-policy-actions">
          <ion-button
            size="small"
            fill="outline"
            :disabled="autoBackupSaving"
            @click="saveAutoBackupSettings"
          >
            {{ t('dataBackup.saveAutomaticBackupSettings') }}
          </ion-button>
          <ion-button
            size="small"
            fill="outline"
            :disabled="autoBackupStatus.status === 'backing-up'"
            @click="runAutoBackupNow"
          >
            {{ t('dataBackup.createNow') }}
          </ion-button>
        </div>

        <ion-item lines="none">
          <ion-note>
            {{ t('dataBackup.lastAutomaticBackup', {
              time: autoBackupStatus.lastBackupAt ? formatBackupDate(autoBackupStatus.lastBackupAt) : t('dataBackup.none')
            }) }}
            <template v-if="autoBackupStatus.nextBackupAt">
              · {{ t('dataBackup.nextAutomaticBackup', { time: formatBackupDate(autoBackupStatus.nextBackupAt) }) }}
            </template>
          </ion-note>
        </ion-item>

        <ion-item button @click="handleExport">
          <ion-icon :icon="downloadOutline" slot="start"></ion-icon>
          <ion-label>{{ t('dataManagement.exportFullBackup') }}</ion-label>
        </ion-item>

        <ion-item button @click="handleImport">
          <ion-icon :icon="cloudUploadOutline" slot="start"></ion-icon>
          <ion-label>{{ t('dataManagement.importFullBackup') }}</ion-label>
        </ion-item>

        <!-- 关于 -->
        <ion-list-header>
          <ion-label>{{ t('about.projectInfo') }}</ion-label>
        </ion-list-header>

        <ion-item button @click="navigateToAbout">
          <ion-icon :icon="informationCircleOutline" slot="start"></ion-icon>
          <ion-label>{{ t('settings.menus.about.title') }}</ion-label>
          <ion-note slot="end">{{ appVersion }}</ion-note>
        </ion-item>
      </ion-list>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonList,
  IonListHeader,
  IonItem,
  IonLabel,
  IonSelect,
  IonSelectOption,
  IonIcon,
  IonNote,
  IonInput,
  IonToggle,
  IonButton,
  alertController,
  loadingController
} from '@ionic/vue'
import {
  downloadOutline,
  cloudUploadOutline,
  cloudOutline,
  informationCircleOutline
} from 'ionicons/icons'
import { useI18n } from '~/composables/useI18n'
import { useTheme } from '~/composables/useTheme'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { databaseService } from '~/lib/db'
import { dataRestoreService } from '~/lib/services/data-restore.service'
import { presentMobileToast } from '~/lib/utils/mobile-toast'
import { createBackupPayload } from '@shared/backup-integrity'
import {
  automaticBackupService,
  DEFAULT_AUTO_BACKUP_INTERVAL_MINUTES,
  DEFAULT_AUTO_BACKUP_RETENTION,
  MAX_AUTO_BACKUP_INTERVAL_MINUTES,
  MIN_AUTO_BACKUP_INTERVAL_MINUTES,
  type AutomaticBackupStatus
} from '~/lib/services/automatic-backup.service'

const router = useRouter()
const { t, currentLocale, switchLocale } = useI18n()
const { themeSource, setThemeSource } = useTheme()

const currentLanguage = ref(currentLocale.value)
const currentTheme = ref(themeSource.value || 'system')
const appVersion = ref(typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '')
const autoBackupEnabled = ref(true)
const autoBackupIntervalMinutes = ref(DEFAULT_AUTO_BACKUP_INTERVAL_MINUTES)
const autoBackupRetention = ref(DEFAULT_AUTO_BACKUP_RETENTION)
const autoBackupSaving = ref(false)
const autoBackupStatus = ref<AutomaticBackupStatus>(automaticBackupService.getStatus())
let unsubscribeAutoBackupStatus: (() => void) | null = null

const createBackupId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

// 语言切换
const handleLanguageChange = (event: any) => {
  const newLocale = event.detail.value
  switchLocale(newLocale)
  currentLanguage.value = newLocale
}

// 主题切换
const handleThemeChange = async (event: any) => {
  const newTheme = event.detail.value as 'system' | 'light' | 'dark'

  // 保存到本地存储
  localStorage.setItem('theme', newTheme)
  currentTheme.value = newTheme

  await setThemeSource(newTheme)
}

const loadAutoBackupSettings = async () => {
  const [enabled, intervalMinutes, retention] = await Promise.all([
    automaticBackupService.getEnabled(),
    automaticBackupService.getIntervalMinutes(),
    automaticBackupService.getRetention()
  ])
  autoBackupEnabled.value = enabled
  autoBackupIntervalMinutes.value = intervalMinutes
  autoBackupRetention.value = retention
}

const saveAutoBackupEnabled = async (event: CustomEvent<{ checked: boolean }>) => {
  autoBackupEnabled.value = await automaticBackupService.setEnabled(event.detail.checked)
  await showToast(t(autoBackupEnabled.value
    ? 'dataBackup.automaticBackupEnabled'
    : 'dataBackup.automaticBackupDisabled'))
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
  autoBackupSaving.value = true
  try {
    autoBackupIntervalMinutes.value = await automaticBackupService.setIntervalMinutes(autoBackupIntervalMinutes.value)
    const retentionResult = await automaticBackupService.setRetention(autoBackupRetention.value)
    autoBackupRetention.value = retentionResult.retention
    if (retentionResult.warnings.length > 0) {
      await showToast(t('dataBackup.automaticBackupRetentionWarning', {
        error: retentionResult.warnings.join('；')
      }), 'warning')
    } else {
      await showToast(t('dataBackup.automaticBackupRetentionApplied', {
        count: retentionResult.deletedCount
      }))
    }
  } catch (error) {
    await showToast(t('dataBackup.automaticBackupSettingsSaveFailed'), 'danger')
  } finally {
    autoBackupSaving.value = false
  }
}

const runAutoBackupNow = async () => {
  await automaticBackupService.runNow('manual')
  const status = automaticBackupService.getStatus()
  if (status.status === 'error') {
    await showToast(t('dataBackup.automaticBackupFailed', { error: status.error || '' }), 'danger')
  } else if (status.lastRunAction === 'unchanged') {
    await showToast(t('dataBackup.automaticBackupUnchanged'))
  } else {
    await showToast(t('dataBackup.automaticBackupCreatedAndRotated', { count: status.deletedCount || 0 }))
  }
}

const formatBackupDate = (value: string) => new Date(value).toLocaleString()

// 导出数据
const handleExport = async () => {
  // 先显示警告提示
  const alert = await alertController.create({
    header: t('common.warning'),
    message: t('dataManagement.exportWarning'),
    buttons: [
      {
        text: t('common.cancel'),
        role: 'cancel'
      },
      {
        text: t('common.confirm'),
        handler: async () => {
          await performExport()
        }
      }
    ]
  })

  await alert.present()
}

// 执行导出
const performExport = async () => {
  const loading = await loadingController.create({
    message: t('common.loading')
  })

  try {
    await loading.present()

    // 从数据库导出完整备份数据，确保图片等二进制元数据被序列化
    const result = await databaseService.exportAllDataForBackup()

    if (!result || !result.success || !result.data) {
      throw new Error(result?.error || result?.message || '导出数据失败')
    }

    const createdAt = new Date().toISOString()
    const backupId = createBackupId()
    const backupPayload = createBackupPayload({
      id: backupId,
      name: `ai-gist-backup-${createdAt.split('T')[0]}-${backupId.slice(0, 8)}`,
      description: t('dataManagement.exportFullBackup'),
      createdAt,
      data: result.data,
      backupType: 'manual',
      trigger: 'manual-file-export'
    })
    const jsonString = JSON.stringify(backupPayload, null, 2)
    const fileName = `${backupPayload.name}.json`

    // 保存到文件系统
    const savedFile = await Filesystem.writeFile({
      path: fileName,
      data: jsonString,
      directory: Directory.Documents,
      encoding: Encoding.UTF8
    })

    await loading.dismiss()

    // 分享文件
    await Share.share({
      title: t('dataManagement.exportFullBackup'),
      text: t('settingsMessages.dataExportSuccess'),
      url: savedFile.uri,
      dialogTitle: t('dataManagement.exportFullBackup')
    })

    showToast(t('settingsMessages.dataExportSuccess'))
  } catch (error) {
    await loading.dismiss()
    console.error('Export error:', error)
    showToast(t('settingsMessages.dataExportFailed'), 'danger')
  }
}

// 导入数据
const handleImport = async () => {
  try {
    // 创建文件输入元素
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'

    input.onchange = async (e: any) => {
      const file = e.target?.files?.[0]
      if (!file) return

      let prepared
      try {
        prepared = dataRestoreService.parseFileContent(await file.text())
      } catch (error) {
        console.error('Import validation error:', error)
        await showToast(error instanceof Error ? error.message : t('settingsMessages.dataImportFailed'), 'danger')
        return
      }

      // 确认导入操作
      const alert = await alertController.create({
        header: t('common.warning'),
        message: [
          t('dataManagement.importWarning'),
          `<br><br>${t('dataManagement.restorePreview', {
            total: prepared.preview.total,
            prompts: prepared.preview.prompts,
            categories: prepared.preview.categories
          })}`
        ].join(''),
        buttons: [
          {
            text: t('common.cancel'),
            role: 'cancel'
          },
          {
            text: t('common.confirm'),
            handler: async () => {
              await performImport(prepared.payload)
            }
          }
        ]
      })

      await alert.present()
    }

    input.click()
  } catch (error) {
    console.error('Import error:', error)
    showToast(t('settingsMessages.dataImportFailed'), 'danger')
  }
}

// 执行导入
const performImport = async (importData: unknown) => {
  const loading = await loadingController.create({
    message: t('common.loading')
  })

  try {
    await loading.present()

    const result = await dataRestoreService.restore(importData, {
      source: 'local-file'
    })

    if (!result || !result.success) {
      throw new Error(result?.error || result?.message || '导入失败')
    }

    await loading.dismiss()
    showToast(t('settingsMessages.dataImportSuccess'))
    if (result.suspensions?.length) {
      const decisionAlert = await alertController.create({
        header: t('cloudBackup.restoreDecisionTitle'),
        message: t('cloudBackup.restoreDecisionDescription'),
        buttons: [
          { text: t('common.close'), role: 'cancel' },
          {
            text: t('dataSync.title'),
            handler: () => { void router.push('/mobile/cloud-backup') }
          }
        ]
      })
      await decisionAlert.present()
    }
  } catch (error) {
    await loading.dismiss()
    console.error('Import error:', error)
    showToast(t('settingsMessages.dataImportFailed'), 'danger')
  }
}

// 显示提示
const showToast = async (message: string, color: string = 'success') => {
  await presentMobileToast(message, color)
}

// 导航到云端备份页面
const navigateToCloudBackup = () => {
  router.push('/mobile/cloud-backup')
}

// 导航到关于页面
const navigateToAbout = () => {
  router.push('/mobile/about')
}

onMounted(async () => {
  unsubscribeAutoBackupStatus = automaticBackupService.onStatusChange(status => {
    autoBackupStatus.value = status
  })
  await loadAutoBackupSettings()

  // 加载应用版本
  // appVersion.value = window.electronAPI?.getAppVersion() || '1.0.0'

  // 从本地存储加载主题设置
  const savedTheme = localStorage.getItem('theme') as 'system' | 'light' | 'dark' | null

  if (savedTheme) {
    currentTheme.value = savedTheme
    await setThemeSource(savedTheme)
  } else {
    // 默认使用系统主题
    await setThemeSource('system')
  }
})

onUnmounted(() => unsubscribeAutoBackupStatus?.())
</script>

<style scoped>
ion-list-header {
  font-weight: 600;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.backup-number-input {
  width: 88px;
  text-align: right;
}

.backup-policy-actions {
  display: flex;
  gap: 8px;
  padding: 0 16px 12px;
}
</style>
