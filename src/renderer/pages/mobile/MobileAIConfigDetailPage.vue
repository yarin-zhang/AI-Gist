<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button :text="t('common.back')"></ion-back-button>
        </ion-buttons>
        <ion-title>{{ config?.name }}</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="showActionMenu">
            <ion-icon slot="icon-only" :icon="ellipsisVertical"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <!-- 下拉刷新 -->
      <ion-refresher slot="fixed" @ionRefresh="handleRefresh">
        <ion-refresher-content></ion-refresher-content>
      </ion-refresher>

      <!-- 加载状态 -->
      <div v-if="loading" class="loading-container">
        <ion-spinner></ion-spinner>
      </div>

      <!-- 配置详情 -->
      <div v-else-if="config" class="detail-container">
        <!-- 状态卡片 -->
        <div class="detail-section">
          <div class="section-title">{{ t('aiConfig.preferredStatus') }}</div>
          <div class="section-content">
            <ion-list lines="none">
              <ion-item lines="none">
                <ion-label>{{ t('aiConfig.enabled') }}</ion-label>
                <ion-toggle
                  slot="end"
                  :checked="config.enabled"
                  @ionChange="handleToggleEnabled"
                ></ion-toggle>
              </ion-item>
              <ion-item lines="none">
                <ion-label>
                  <h3>{{ t('aiConfig.globalPreferred') }}</h3>
                  <p>{{ t('aiConfig.multipleConfigsWarning') }}</p>
                </ion-label>
                <ion-button
                  slot="end"
                  :fill="config.isPreferred ? 'solid' : 'outline'"
                  :color="config.isPreferred ? 'primary' : 'medium'"
                  @click="handleTogglePreferred"
                  :disabled="!config.enabled"
                >
                  {{ config.isPreferred ? t('aiConfig.alreadyPreferred') : t('aiConfig.setAsPreferred') }}
                </ion-button>
              </ion-item>
            </ion-list>
          </div>
        </div>

        <!-- 基本信息 -->
        <div class="detail-section">
          <div class="section-title">{{ t('aiConfig.basicConfig') }}</div>
          <div class="section-content">
            <ion-list lines="none">
              <ion-item lines="none">
                <ion-label>
                  <h3>{{ t('aiConfig.serviceType') }}</h3>
                  <p>{{ getServiceTypeName(config.type) }}</p>
                </ion-label>
              </ion-item>
              <ion-item v-if="config.baseURL" lines="none">
                <ion-label>
                  <h3>{{ t('aiConfig.baseURL') }}</h3>
                  <p class="url-text">{{ config.baseURL }}</p>
                </ion-label>
              </ion-item>
              <ion-item v-if="config.apiKey" lines="none">
                <ion-label>
                  <h3>API Key</h3>
                  <p class="masked-text">{{ maskApiKey(config.apiKey) }}</p>
                </ion-label>
              </ion-item>
              <ion-item lines="none">
                <ion-label>
                  <h3>{{ t('aiConfig.createdAt') }}</h3>
                  <p>{{ formatDate(config.createdAt) }}</p>
                </ion-label>
              </ion-item>
            </ion-list>
          </div>
        </div>

        <!-- 模型配置 -->
        <div class="detail-section">
          <div class="section-title">{{ t('aiConfig.modelConfig') }}</div>
          <div class="section-content">
            <ion-list lines="none">
              <ion-item lines="none">
                <ion-label>
                  <h3>{{ t('aiConfig.modelList') }}</h3>
                  <div class="models-chips">
                    <ion-chip
                      v-for="model in config.models"
                      :key="model"
                      :color="model === config.defaultModel ? 'primary' : 'medium'"
                      @click="handleSelectModel(model)"
                      class="clickable-chip"
                    >
                      <ion-label>{{ model }}</ion-label>
                    </ion-chip>
                  </div>
                </ion-label>
              </ion-item>
              <ion-item v-if="config.defaultModel" lines="none">
                <ion-label>
                  <h3>{{ t('aiConfig.defaultModel') }}</h3>
                  <p>{{ config.defaultModel }}</p>
                </ion-label>
              </ion-item>
              <ion-item v-if="config.customModel" lines="none">
                <ion-label>
                  <h3>{{ t('aiConfig.customModel') }}</h3>
                  <p>{{ config.customModel }}</p>
                </ion-label>
              </ion-item>
            </ion-list>
          </div>
        </div>

        <!-- 系统提示词 -->
        <div class="detail-section">
          <div class="section-title-with-action">
            <div class="section-title">{{ t('aiConfig.systemPrompt') }}</div>
            <ion-button fill="clear" size="small" @click="handleEditSystemPrompt">
              <ion-icon slot="icon-only" :icon="createOutline"></ion-icon>
            </ion-button>
          </div>
          <div class="section-content">
            <div class="system-prompt-content">
              {{ config.systemPrompt || t('aiConfig.systemPromptDefault') }}
            </div>
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="action-buttons">
          <ion-button expand="block" @click="handleTestConnection" :disabled="testingConnection">
            <ion-spinner v-if="testingConnection" slot="start"></ion-spinner>
            <ion-icon v-else slot="start" :icon="flashOutline"></ion-icon>
            {{ t('aiConfig.connectionTest') }}
          </ion-button>

          <ion-button expand="block" @click="handleIntelligentTest" :disabled="testingIntelligent">
            <ion-spinner v-if="testingIntelligent" slot="start"></ion-spinner>
            <ion-icon v-else slot="start" :icon="sparklesOutline"></ion-icon>
            {{ t('aiConfig.requestTest') }}
          </ion-button>
        </div>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonButton,
  IonBackButton,
  IonList,
  IonItem,
  IonLabel,
  IonToggle,
  IonChip,
  IonIcon,
  IonSpinner,
  IonRefresher,
  IonRefresherContent,
  alertController,
  toastController,
  actionSheetController,
  onIonViewWillEnter
} from '@ionic/vue'
import {
  createOutline,
  flashOutline,
  sparklesOutline,
  trashOutline,
  ellipsisVertical
} from 'ionicons/icons'
import { useI18n } from '~/composables/useI18n'
import { api } from '~/lib/api'
import type { AIConfig } from '@shared/types'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

// 状态
const config = ref<AIConfig | null>(null)
const loading = ref(true)
const testingConnection = ref(false)
const testingIntelligent = ref(false)

// 加载配置详情
const loadConfig = async () => {
  loading.value = true

  try {
    const configs = await api.aiConfigs.getAll.query()
    config.value = configs.find(c => c.id === Number(route.params.id)) || null

    if (!config.value) {
      showToast(t('aiConfig.configNotFound'), 'danger')
      router.back()
    }
  } catch (error) {
    console.error('加载配置失败:', error)
    showToast(t('aiConfig.loadFailed'), 'danger')
  } finally {
    loading.value = false
  }
}

// 下拉刷新
const handleRefresh = async (event: any) => {
  await loadConfig()
  event.target.complete()
}

// 切换启用状态
const handleToggleEnabled = async (event: any) => {
  if (!config.value) return

  const enabled = event.detail.checked

  try {
    await api.aiConfigs.update.mutate({
      id: config.value.id!,
      data: {
        ...config.value,
        enabled
      }
    })

    config.value.enabled = enabled
    const message = enabled
      ? t('aiConfig.configEnabled')
      : t('aiConfig.configDisabled')
    showToast(message)
  } catch (error) {
    console.error('更新配置失败:', error)
    event.target.checked = !enabled
    showToast(t('aiConfig.updateFailed'), 'danger')
  }
}

// 切换首选状态
const handleTogglePreferred = async () => {
  if (!config.value) return

  try {
    if (config.value.isPreferred) {
      // 取消首选
      await api.aiConfigs.clearPreferred.mutate()
      config.value.isPreferred = false
      showToast(t('aiConfig.preferredCleared'))
    } else {
      // 设置为首选
      await api.aiConfigs.setPreferred.mutate(config.value.id!)
      config.value.isPreferred = true
      showToast(t('aiConfig.setAsPreferredSuccess', { name: config.value.name }))
    }
  } catch (error) {
    console.error('更新首选状态失败:', error)
    showToast(t('aiConfig.setFailed'), 'danger')
  }
}

// 选择模型
const handleSelectModel = async (model: string) => {
  if (!config.value || model === config.value.defaultModel) return

  try {
    await api.aiConfigs.update.mutate({
      id: config.value.id!,
      data: {
        ...config.value,
        defaultModel: model
      }
    })

    config.value.defaultModel = model
    showToast(t('aiConfig.modelSelected', { model }))
  } catch (error) {
    console.error('更新默认模型失败:', error)
    showToast(t('aiConfig.updateFailed'), 'danger')
  }
}

// 编辑配置
const handleEdit = () => {
  router.push(`/ai-config/edit/${config.value?.id}`)
}

// 编辑系统提示词
const handleEditSystemPrompt = () => {
  router.push(`/ai-config/${config.value?.id}/system-prompt`)
}

// 测试连接
const handleTestConnection = async () => {
  if (!config.value) return

  testingConnection.value = true

  try {
    const result = await api.aiConfigs.test.mutate({
      type: config.value.type,
      baseURL: config.value.baseURL,
      apiKey: config.value.apiKey
    })

    if (result.success) {
      showToast(t('aiConfig.connectionTestSuccess'))
    } else {
      showToast(result.error || t('aiConfig.connectionTestFailed'), 'danger')
    }
  } catch (error) {
    console.error('测试连接失败:', error)
    showToast(t('aiConfig.testFailed'), 'danger')
  } finally {
    testingConnection.value = false
  }
}

// 智能测试
const handleIntelligentTest = async () => {
  if (!config.value) return

  testingIntelligent.value = true

  try {
    const result = await api.aiConfigs.intelligentTest.mutate(config.value.id!)

    if (result.success) {
      const alert = await alertController.create({
        header: t('aiConfig.testSuccessTitle'),
        message: `${t('aiConfig.inputPrompt')} ${result.inputPrompt}\n\n${t('aiConfig.aiResponse')} ${result.response}`,
        buttons: [t('common.ok')]
      })
      await alert.present()
    } else {
      showToast(result.error || t('aiConfig.intelligentTestFailed'), 'danger')
    }
  } catch (error) {
    console.error('智能测试失败:', error)
    showToast(t('aiConfig.intelligentTestFailed'), 'danger')
  } finally {
    testingIntelligent.value = false
  }
}

// 删除配置
const handleDelete = async () => {
  if (!config.value) return

  const alert = await alertController.create({
    header: t('common.confirm'),
    message: t('aiConfig.deleteConfirm', { name: config.value.name }),
    buttons: [
      {
        text: t('common.cancel'),
        role: 'cancel'
      },
      {
        text: t('common.delete'),
        role: 'destructive',
        handler: async () => {
          try {
            await api.aiConfigs.delete.mutate(config.value!.id!)
            showToast(t('aiConfig.configDeleteSuccess'))
            router.back()
          } catch (error) {
            console.error('删除配置失败:', error)
            showToast(t('aiConfig.deleteFailed'), 'danger')
          }
        }
      }
    ]
  })

  await alert.present()
}

// 获取服务类型名称
const getServiceTypeName = (type: string): string => {
  const names: Record<string, string> = {
    openai: 'OpenAI',
    ollama: 'Ollama',
    anthropic: 'Anthropic Claude',
    google: 'Google Gemini AI',
    azure: 'Azure OpenAI',
    lmstudio: 'LM Studio',
    deepseek: 'DeepSeek',
    mistral: 'Mistral AI',
    siliconflow: '硅基流动',
    tencent: '腾讯云',
    aliyun: '阿里云',
    zhipu: '智谱 AI',
    openrouter: 'OpenRouter'
  }
  return names[type] || type
}

// 遮罩 API Key
const maskApiKey = (apiKey: string): string => {
  if (apiKey.length <= 8) return '********'
  return apiKey.substring(0, 4) + '****' + apiKey.substring(apiKey.length - 4)
}

// 格式化日期
const formatDate = (date: Date | string): string => {
  const d = new Date(date)
  return d.toLocaleString()
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

// 显示操作菜单
const showActionMenu = async () => {
  if (!config.value) return

  const buttons = [
    {
      text: t('common.edit'),
      icon: createOutline,
      handler: () => {
        handleEdit()
      }
    }
  ]

  // 只有非首选配置才能删除
  if (!config.value.isPreferred) {
    buttons.push({
      text: t('common.delete'),
      icon: trashOutline,
      role: 'destructive',
      handler: () => {
        handleDelete()
      }
    })
  }

  buttons.push({
    text: t('common.cancel'),
    role: 'cancel'
  })

  const actionSheet = await actionSheetController.create({
    header: t('common.actions'),
    buttons
  })

  await actionSheet.present()
}

// 初始化
onMounted(() => {
  loadConfig()
})

// 页面进入时刷新
onIonViewWillEnter(() => {
  loadConfig()
})
</script>

<style scoped>
.loading-container {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 200px;
}

.detail-container {
  padding: 16px;
}

.detail-section {
  margin-bottom: 24px;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--ion-text-color);
  margin-bottom: 12px;
  padding: 0 4px;
}

.section-title-with-action {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding: 0 4px;
}

.section-title-with-action .section-title {
  margin-bottom: 0;
  padding: 0;
}

.section-content {
  background: var(--ion-color-light);
  border-radius: 8px;
  border: 1px solid var(--ion-color-light-shade);
  overflow: hidden;
}

ion-list {
  background: transparent;
  padding: 0;
}

ion-item {
  --background: transparent;
  --padding-start: 16px;
  --padding-end: 16px;
  --inner-padding-end: 0;
}

.url-text {
  word-break: break-all;
  font-family: monospace;
  font-size: 12px;
}

.masked-text {
  font-family: monospace;
}

.models-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

ion-chip {
  margin: 0;
}

.system-prompt-content {
  white-space: pre-wrap;
  font-family: monospace;
  font-size: 13px;
  line-height: 1.5;
  color: var(--ion-text-color);
  padding: 16px;
  max-height: 200px;
  overflow-y: auto;
}

.action-buttons {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 8px;
}

.clickable-chip {
  cursor: pointer;
}

.clickable-chip:hover {
  opacity: 0.8;
}
</style>
