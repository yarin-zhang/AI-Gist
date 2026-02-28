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
            v-model="currentTheme"
            interface="action-sheet"
            @ionChange="handleThemeChange"
          >
            <ion-select-option value="light">{{ t('appearance.light') }}</ion-select-option>
            <ion-select-option value="dark">{{ t('appearance.dark') }}</ion-select-option>
            <ion-select-option value="auto">{{ t('appearance.auto') }}</ion-select-option>
          </ion-select>
        </ion-item>

        <!-- 数据管理 -->
        <ion-list-header>
          <ion-label>{{ t('dataManagement.backupManagement') }}</ion-label>
        </ion-list-header>

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

        <ion-item>
          <ion-label>
            <h3>{{ t('about.currentVersion') }}</h3>
            <p>{{ appVersion }}</p>
          </ion-label>
        </ion-item>
      </ion-list>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
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
  toastController,
  alertController,
  loadingController
} from '@ionic/vue'
import {
  downloadOutline,
  cloudUploadOutline
} from 'ionicons/icons'
import { useI18n } from '~/composables/useI18n'
import { useTheme } from '~/composables/useTheme'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { databaseService } from '~/lib/db'

const { t, currentLocale, setLocale } = useI18n()
const { currentTheme: themeMode, setTheme } = useTheme()

const currentLanguage = ref(currentLocale.value)
const currentTheme = ref(themeMode.value || 'auto')
const appVersion = ref('1.0.0')

// 语言切换
const handleLanguageChange = (event: any) => {
  const newLocale = event.detail.value
  setLocale(newLocale)
  localStorage.setItem('locale', newLocale)
  showToast(t('language.description'))
}

// 主题切换
const handleThemeChange = (event: any) => {
  const newTheme = event.detail.value
  setTheme(newTheme)
  showToast(t('appearance.theme'))
}

// 导出数据
const handleExport = async () => {
  const loading = await loadingController.create({
    message: t('common.loading')
  })

  try {
    await loading.present()

    // 从数据库导出所有数据
    const result = await databaseService.exportAllData()

    if (!result || !result.success) {
      throw new Error('导出数据失败')
    }

    const exportData = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      data: result.data
    }

    const jsonString = JSON.stringify(exportData, null, 2)
    const fileName = `ai-gist-backup-${new Date().toISOString().split('T')[0]}.json`

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

      // 确认导入操作
      const alert = await alertController.create({
        header: t('common.confirm'),
        message: t('dataManagement.fullBackupDescription'),
        buttons: [
          {
            text: t('common.cancel'),
            role: 'cancel'
          },
          {
            text: t('common.confirm'),
            handler: async () => {
              await performImport(file)
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
const performImport = async (file: File) => {
  const loading = await loadingController.create({
    message: t('common.loading')
  })

  try {
    await loading.present()

    // 读取文件内容
    const text = await file.text()
    const importData = JSON.parse(text)

    // 验证数据格式
    if (!importData.data) {
      throw new Error('无效的备份文件格式')
    }

    // 导入到数据库
    const result = await databaseService.replaceAllData(importData.data)

    if (!result || !result.success) {
      throw new Error(result?.message || '导入失败')
    }

    await loading.dismiss()
    showToast(t('settingsMessages.dataImportSuccess'))

    // 延迟刷新页面以确保数据同步
    setTimeout(() => {
      window.location.reload()
    }, 1000)
  } catch (error) {
    await loading.dismiss()
    console.error('Import error:', error)
    showToast(t('settingsMessages.dataImportFailed'), 'danger')
  }
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
  // 加载应用版本
  // appVersion.value = window.electronAPI?.getAppVersion() || '1.0.0'
})
</script>

<style scoped>
ion-list-header {
  font-weight: 600;
  font-size: 14px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
</style>
