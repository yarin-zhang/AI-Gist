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

        <!-- 云端备份 -->
        <ion-list-header>
          <ion-label>{{ t('cloudBackup.title') }}</ion-label>
        </ion-list-header>

        <ion-item button @click="navigateToCloudBackup">
          <ion-icon :icon="cloudOutline" slot="start"></ion-icon>
          <ion-label>{{ t('cloudBackup.title') }}</ion-label>
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
  toastController,
  alertController,
  loadingController
} from '@ionic/vue'
import {
  downloadOutline,
  cloudUploadOutline,
  cloudOutline
} from 'ionicons/icons'
import { useI18n } from '~/composables/useI18n'
import { useTheme } from '~/composables/useTheme'
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { databaseService } from '~/lib/db'

const router = useRouter()
const { t, currentLocale, switchLocale } = useI18n()
const { setThemeSource, themeSource } = useTheme()

const currentLanguage = ref(currentLocale.value)
const currentTheme = ref(themeSource.value || 'system')
const appVersion = ref('1.0.0')

// 语言切换
const handleLanguageChange = (event: any) => {
  const newLocale = event.detail.value
  console.log('[Settings] 语言切换:', {
    from: currentLanguage.value,
    to: newLocale
  })

  switchLocale(newLocale)
  currentLanguage.value = newLocale

  console.log('[Settings] 语言切换完成，当前语言:', currentLanguage.value)
}

// 主题切换
const handleThemeChange = async (event: any) => {
  const newTheme = event.detail.value as 'system' | 'light' | 'dark'

  console.log('[Settings] 主题切换开始:', {
    from: currentTheme.value,
    to: newTheme
  })

  // 保存到本地存储
  localStorage.setItem('theme', newTheme)
  currentTheme.value = newTheme

  console.log('[Settings] 主题已保存到 localStorage')

  // 应用主题
  applyTheme(newTheme)
}

// 应用主题函数
const applyTheme = (theme: 'system' | 'light' | 'dark') => {
  console.log('[Settings] applyTheme 调用，参数:', theme)

  const html = document.documentElement

  let isDark = false

  if (theme === 'system') {
    // 使用系统主题
    isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    console.log('[Settings] 使用系统主题，检测到:', isDark ? 'dark' : 'light')
  } else {
    isDark = theme === 'dark'
    console.log('[Settings] 使用指定主题:', theme)
  }

  console.log('[Settings] 应用主题前 html.classList:', html.classList.toString())

  // 根据 Ionic 官方文档，只需要在 html 元素上添加/移除 ion-palette-dark 类
  if (isDark) {
    html.classList.add('ion-palette-dark')
  } else {
    html.classList.remove('ion-palette-dark')
  }

  console.log('[Settings] 应用主题后 html.classList:', html.classList.toString())
  console.log('[Settings] 主题应用完成，isDark:', isDark)
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

    // 从数据库导出所有数据
    const result = await databaseService.exportAllData()

    if (!result || !result.success) {
      throw new Error('导出数据失败')
    }

    // 直接导出数据，与桌面端格式保持一致
    const jsonString = JSON.stringify(result.data, null, 2)
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

// 导航到云端备份页面
const navigateToCloudBackup = () => {
  router.push('/mobile/cloud-backup')
}

onMounted(() => {
  console.log('[Settings] 组件挂载')

  // 加载应用版本
  // appVersion.value = window.electronAPI?.getAppVersion() || '1.0.0'

  // 从本地存储加载主题设置
  const savedTheme = localStorage.getItem('theme') as 'system' | 'light' | 'dark' | null
  console.log('[Settings] 从 localStorage 读取主题:', savedTheme)

  if (savedTheme) {
    currentTheme.value = savedTheme
    console.log('[Settings] 应用保存的主题:', savedTheme)
    applyTheme(savedTheme)
  } else {
    // 默认使用系统主题
    console.log('[Settings] 没有保存的主题，使用系统默认')
    applyTheme('system')
  }

  console.log('[Settings] 当前语言:', currentLanguage.value)
  console.log('[Settings] 当前主题:', currentTheme.value)
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
