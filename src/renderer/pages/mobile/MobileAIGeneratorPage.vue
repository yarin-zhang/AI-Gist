<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button :default-href="'/tabs/prompts'"></ion-back-button>
        </ion-buttons>
        <ion-title>{{ t('promptManagement.aiGenerate') }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <!-- 没有AI配置时显示的空状态 -->
      <div v-if="configs.length === 0 && !loading" class="empty-container">
        <ion-icon :icon="sparklesOutline" class="empty-icon"></ion-icon>
        <p class="empty-text">{{ t('aiGenerator.noConfigAvailable') }}</p>
        <p class="empty-description">{{ t('aiGenerator.addConfigFirst') }}</p>
        <ion-button @click="navigateToAIConfig">
          {{ t('aiGenerator.addAIConfig') }}
        </ion-button>
      </div>

      <!-- 有AI配置时显示的生成工具 -->
      <div v-else class="generator-container">
        <!-- 输入区域 -->
        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ t('aiGenerator.requirement') }}</ion-card-title>
          </ion-card-header>
          <ion-card-content>
            <ion-textarea
              v-model="formData.topic"
              :placeholder="t('aiGenerator.requirementPlaceholder')"
              :rows="4"
              :auto-grow="true"
            ></ion-textarea>
          </ion-card-content>
        </ion-card>

        <!-- 模型选择 -->
        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ t('aiGenerator.selectModel') }}</ion-card-title>
          </ion-card-header>
          <ion-card-content>
            <ion-list>
              <ion-item>
                <ion-select
                  v-model="selectedModelKey"
                  :placeholder="t('aiGenerator.selectModel')"
                  interface="action-sheet"
                  @ionChange="handleModelChange"
                >
                  <ion-select-option
                    v-for="config in configs"
                    :key="config.configId"
                    :value="`${config.configId}:${config.defaultModel}`"
                  >
                    {{ config.name }} - {{ config.defaultModel }}
                    <span v-if="config.isPreferred"> ⭐</span>
                  </ion-select-option>
                </ion-select>
              </ion-item>
            </ion-list>
          </ion-card-content>
        </ion-card>

        <!-- 生成结果 -->
        <ion-card v-if="generatedResult || generating">
          <ion-card-header>
            <ion-card-title>{{ t('aiGenerator.result') }}</ion-card-title>
          </ion-card-header>
          <ion-card-content>
            <div v-if="generating" class="generating-status">
              <ion-spinner></ion-spinner>
              <p>{{ t('aiGenerator.generating') }}</p>
            </div>
            <ion-textarea
              v-else
              v-model="generatedResult"
              :rows="8"
              :auto-grow="true"
              :readonly="autoSaveEnabled"
            ></ion-textarea>
          </ion-card-content>
        </ion-card>

        <!-- 操作按钮 -->
        <div class="action-buttons">
          <ion-button
            expand="block"
            @click="generatePrompt"
            :disabled="!formData.topic || !selectedModelKey || generating"
          >
            <ion-icon slot="start" :icon="sparklesOutline"></ion-icon>
            {{ t('aiGenerator.generate') }}
          </ion-button>

          <ion-button
            v-if="generating"
            expand="block"
            color="danger"
            @click="stopGeneration"
          >
            <ion-icon slot="start" :icon="closeCircle"></ion-icon>
            {{ t('aiGenerator.stop') }}
          </ion-button>

          <div v-if="generatedResult && !generating" class="result-actions">
            <ion-item lines="none">
              <ion-label>{{ t('aiGenerator.autoSave') }}</ion-label>
              <ion-toggle v-model="autoSaveEnabled"></ion-toggle>
            </ion-item>

            <ion-button
              v-if="!autoSaveEnabled"
              expand="block"
              color="success"
              @click="manualSavePrompt"
            >
              <ion-icon slot="start" :icon="saveOutline"></ion-icon>
              {{ t('common.save') }}
            </ion-button>
          </div>
        </div>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonBackButton,
  IonCard,
  IonCardHeader,
  IonCardTitle,
  IonCardContent,
  IonTextarea,
  IonButton,
  IonIcon,
  IonSpinner,
  IonList,
  IonItem,
  IonLabel,
  IonSelect,
  IonSelectOption,
  IonToggle,
  toastController
} from '@ionic/vue'
import {
  sparklesOutline,
  closeCircle,
  saveOutline
} from 'ionicons/icons'
import { useI18n } from '~/composables/useI18n'
import { api } from '~/lib/api'
import { databaseService } from '~/lib/db'
import type { AIConfig } from '@shared/types'

const { t } = useI18n()
const router = useRouter()

// 状态
const configs = ref<AIConfig[]>([])
const loading = ref(true)
const generating = ref(false)
const selectedModelKey = ref<string>('')
const generatedResult = ref<string>('')
const autoSaveEnabled = ref<boolean>(true)

// 表单数据
const formData = reactive({
  topic: ''
})

// 加载 AI 配置
const loadConfigs = async () => {
  loading.value = true
  try {
    const result = await databaseService.aiConfig.getEnabledAIConfigs()
    configs.value = result

    // 自动选择首选配置
    const preferred = await databaseService.aiConfig.getPreferredAIConfig()
    if (preferred && preferred.defaultModel) {
      selectedModelKey.value = `${preferred.configId}:${preferred.defaultModel}`
    } else if (result.length > 0 && result[0].defaultModel) {
      selectedModelKey.value = `${result[0].configId}:${result[0].defaultModel}`
    }
  } catch (error) {
    console.error('加载 AI 配置失败:', error)
    showToast(t('aiConfig.loadFailed'), 'danger')
  } finally {
    loading.value = false
  }
}

// 导航到AI配置页面
const navigateToAIConfig = () => {
  router.push('/tabs/ai-config')
}

// 模型选择变化
const handleModelChange = () => {
  console.log('选择的模型:', selectedModelKey.value)
}

// 生成提示词
const generatePrompt = async () => {
  if (!formData.topic || !selectedModelKey.value) {
    showToast(t('aiGenerator.requirementRequired'), 'warning')
    return
  }

  generating.value = true
  generatedResult.value = ''

  try {
    // 解析选中的配置和模型
    const [configId, model] = selectedModelKey.value.split(':')
    const selectedConfig = configs.value.find(c => c.configId === configId)

    if (!selectedConfig) {
      throw new Error('未找到选中的配置')
    }

    const request = {
      configId: selectedConfig.configId,
      model: model,
      topic: formData.topic
    }

    // 序列化配置
    const serializedConfig = serializeConfig(selectedConfig)

    // 调用生成API
    const result = await window.electronAPI.ai.generatePrompt(request, serializedConfig)

    generatedResult.value = result.generatedPrompt

    // 保存到历史记录
    await api.aiGenerationHistory.create.mutate({
      historyId: result.id,
      configId: result.configId,
      topic: result.topic,
      generatedPrompt: result.generatedPrompt,
      model: result.model,
      status: 'success',
      uuid: `history_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    })

    // 根据自动保存开关决定是否立即保存
    if (autoSaveEnabled.value) {
      await saveGeneratedPrompt(result)
      showToast(t('aiGenerator.generateAndSaveSuccess'), 'success')
    } else {
      showToast(t('aiGenerator.generateSuccess'), 'success')
    }

    // 清空输入框
    formData.topic = ''
  } catch (error) {
    console.error('生成失败:', error)
    showToast(t('aiGenerator.generateFailed') + ': ' + (error as Error).message, 'danger')
    generatedResult.value = ''
  } finally {
    generating.value = false
  }
}

// 停止生成
const stopGeneration = async () => {
  try {
    await window.electronAPI.ai.stopGeneration()
    generating.value = false
    showToast(t('aiGenerator.stopped'), 'warning')
  } catch (error) {
    console.error('停止生成失败:', error)
    generating.value = false
  }
}

// 手动保存提示词
const manualSavePrompt = async () => {
  if (!generatedResult.value.trim()) {
    showToast(t('aiGenerator.noContentToSave'), 'warning')
    return
  }

  try {
    const promptData = {
      title: `AI生成: ${formData.topic || '提示词生成'}`,
      content: generatedResult.value,
      description: '',
      tags: ['AI生成', '手动保存'],
      categoryId: undefined,
      isFavorite: false,
      useCount: 0,
      uuid: `prompt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      isActive: true
    }

    await api.prompts.create.mutate(promptData)
    showToast(t('aiGenerator.saveSuccess'), 'success')

    // 保存后返回提示词列表
    router.push('/tabs/prompts')
  } catch (error) {
    console.error('保存提示词失败:', error)
    showToast(t('aiGenerator.saveFailed') + ': ' + (error as Error).message, 'danger')
  }
}

// 直接保存生成的提示词
const saveGeneratedPrompt = async (result: any) => {
  try {
    const promptData = {
      title: `AI生成: ${result.topic}`,
      content: result.generatedPrompt,
      description: '',
      tags: ['AI生成', '自动保存'],
      categoryId: undefined,
      isFavorite: false,
      useCount: 0,
      uuid: `prompt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      isActive: true
    }

    await api.prompts.create.mutate(promptData)
  } catch (error) {
    console.error('保存提示词失败:', error)
    throw new Error('保存提示词失败: ' + (error as Error).message)
  }
}

// 序列化配置对象
const serializeConfig = (config: AIConfig) => {
  return {
    id: config.id,
    configId: config.configId,
    name: config.name,
    type: config.type,
    baseURL: config.baseURL,
    apiKey: config.apiKey,
    secretKey: config.secretKey,
    models: [...(config.models || [])],
    defaultModel: config.defaultModel,
    customModel: config.customModel,
    enabled: config.enabled,
    systemPrompt: config.systemPrompt,
    createdAt: config.createdAt instanceof Date ? config.createdAt.toISOString() : config.createdAt,
    updatedAt: config.updatedAt instanceof Date ? config.updatedAt.toISOString() : config.updatedAt
  } as unknown as AIConfig
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

// 初始化
onMounted(async () => {
  await loadConfigs()
})
</script>

<style scoped>
.empty-container {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 60px 20px;
  text-align: center;
  height: 100%;
}

.empty-icon {
  font-size: 80px;
  color: var(--ion-color-medium);
  margin-bottom: 16px;
}

.empty-text {
  color: var(--ion-color-dark);
  margin-bottom: 8px;
  font-size: 18px;
  font-weight: 600;
}

.empty-description {
  color: var(--ion-color-medium);
  margin-bottom: 24px;
  font-size: 14px;
}

.generator-container {
  padding: 16px;
}

ion-card {
  margin-bottom: 16px;
}

.generating-status {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px;
  gap: 12px;
}

.generating-status p {
  margin: 0;
  color: var(--ion-color-medium);
}

.action-buttons {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 16px;
}

.result-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>
