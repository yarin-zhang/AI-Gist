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
          <ion-label>{{ t('settings.appearance') }}</ion-label>
        </ion-list-header>

        <ion-item>
          <ion-label>{{ t('settings.language') }}</ion-label>
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
          <ion-label>{{ t('settings.theme') }}</ion-label>
          <ion-select
            v-model="currentTheme"
            interface="action-sheet"
            @ionChange="handleThemeChange"
          >
            <ion-select-option value="light">{{ t('settings.lightTheme') }}</ion-select-option>
            <ion-select-option value="dark">{{ t('settings.darkTheme') }}</ion-select-option>
            <ion-select-option value="auto">{{ t('settings.autoTheme') }}</ion-select-option>
          </ion-select>
        </ion-item>

        <!-- 数据管理 -->
        <ion-list-header>
          <ion-label>{{ t('settings.dataManagement') }}</ion-label>
        </ion-list-header>

        <ion-item button @click="handleExport">
          <ion-icon :icon="downloadOutline" slot="start"></ion-icon>
          <ion-label>{{ t('settings.exportData') }}</ion-label>
        </ion-item>

        <ion-item button @click="handleImport">
          <ion-icon :icon="cloudUploadOutline" slot="start"></ion-icon>
          <ion-label>{{ t('settings.importData') }}</ion-label>
        </ion-item>

        <ion-item button @click="handleBackup">
          <ion-icon :icon="saveOutline" slot="start"></ion-icon>
          <ion-label>{{ t('settings.backup') }}</ion-label>
        </ion-item>

        <!-- 关于 -->
        <ion-list-header>
          <ion-label>{{ t('settings.about') }}</ion-label>
        </ion-list-header>

        <ion-item>
          <ion-label>
            <h3>{{ t('settings.version') }}</h3>
            <p>{{ appVersion }}</p>
          </ion-label>
        </ion-item>

        <ion-item button @click="handleCheckUpdate">
          <ion-icon :icon="refreshOutline" slot="start"></ion-icon>
          <ion-label>{{ t('settings.checkUpdate') }}</ion-label>
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
  actionSheetController
} from '@ionic/vue'
import {
  downloadOutline,
  cloudUploadOutline,
  saveOutline,
  refreshOutline
} from 'ionicons/icons'
import { useI18n } from '~/composables/useI18n'
import { useTheme } from '~/composables/useTheme'
import { api } from '~/lib/api'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

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
  showToast(t('settings.languageChanged'))
}

// 主题切换
const handleThemeChange = (event: any) => {
  const newTheme = event.detail.value
  setTheme(newTheme)
  showToast(t('settings.themeChanged'))
}

// 导出数据
const handleExport = async () => {
  try {
    const data = await api.appSettings.exportData.query()
    const jsonString = JSON.stringify(data, null, 2)
    const fileName = `ai-gist-backup-${new Date().toISOString().split('T')[0]}.json`

    // 保存到文件系统
    const savedFile = await Filesystem.writeFile({
      path: fileName,
      data: jsonString,
      directory: Directory.Documents,
      encoding: 'utf8'
    })

    // 分享文件
    await Share.share({
      title: t('settings.exportData'),
      text: t('settings.exportSuccess'),
      url: savedFile.uri,
      dialogTitle: t('settings.exportData')
    })

    showToast(t('settings.exportSuccess'))
  } catch (error) {
    console.error('Export error:', error)
    showToast(t('settings.exportFailed'), 'danger')
  }
}

// 导入数据
const handleImport = async () => {
  const actionSheet = await actionSheetController.create({
    header: t('settings.importData'),
    buttons: [
      {
        text: t('common.cancel'),
        role: 'cancel'
      }
    ]
  })

  await actionSheet.present()
  showToast(t('settings.importNotImplemented'), 'warning')
}

// 备份
const handleBackup = async () => {
  try {
    await api.appSettings.backupData.mutate()
    showToast(t('settings.backupSuccess'))
  } catch (error) {
    console.error('Backup error:', error)
    showToast(t('settings.backupFailed'), 'danger')
  }
}

// 检查更新
const handleCheckUpdate = () => {
  showToast(t('settings.alreadyLatest'))
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
