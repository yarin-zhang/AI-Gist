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
import { ref, onMounted } from 'vue'
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
import { presentMobileToast } from '~/lib/utils/mobile-toast'
import { createBackupPayload } from '@shared/backup-integrity'
import { getCssVars } from '~/theme'

const router = useRouter()
const { t, currentLocale, switchLocale } = useI18n()
const { themeSource } = useTheme()

const currentLanguage = ref(currentLocale.value)
const currentTheme = ref(themeSource.value || 'system')
const appVersion = ref(typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '')

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

  // 应用主题
  applyTheme(newTheme)
}

// 应用主题函数
const applyTheme = (theme: 'system' | 'light' | 'dark') => {
  const html = document.documentElement

  let isDark = false

  if (theme === 'system') {
    // 使用系统主题
    isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  } else {
    isDark = theme === 'dark'
  }

  // 1. Ionic 官方暗色调色板（控制 Ionic 组件颜色变量）
  html.classList.toggle('ion-palette-dark', isDark)

  // 2. 同步应用层主题类（global.css 中 html.dark/html.light 控制背景色等变量）
  const body = document.body
  html.classList.toggle('dark', isDark)
  html.classList.toggle('light', !isDark)
  body.classList.toggle('dark', isDark)
  body.classList.toggle('light', !isDark)

  for (const [key, value] of Object.entries(getCssVars(isDark ? 'dark' : 'light'))) {
    html.style.setProperty(`--${key}`, value)
  }
}

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
      data: result.data
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

      // 确认导入操作
      const alert = await alertController.create({
        header: t('common.warning'),
        message: t('dataManagement.importWarning'),
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

    // 验证数据格式（与桌面端一致）
    if (!importData || typeof importData !== 'object') {
      throw new Error('无效的备份文件格式')
    }

    // 导入到数据库
    const result = await databaseService.replaceAllData(importData)

    if (!result || !result.success) {
      throw new Error(result?.error || result?.message || '导入失败')
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

onMounted(() => {
  // 加载应用版本
  // appVersion.value = window.electronAPI?.getAppVersion() || '1.0.0'

  // 从本地存储加载主题设置
  const savedTheme = localStorage.getItem('theme') as 'system' | 'light' | 'dark' | null

  if (savedTheme) {
    currentTheme.value = savedTheme
    applyTheme(savedTheme)
  } else {
    // 默认使用系统主题
    applyTheme('system')
  }
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
