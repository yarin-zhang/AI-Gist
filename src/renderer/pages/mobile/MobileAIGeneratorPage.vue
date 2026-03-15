<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button @click="handleCancel">
            <ion-icon :icon="arrowBack"></ion-icon>
          </ion-button>
        </ion-buttons>
        <ion-title>{{ t('promptManagement.aiGenerate') }}</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="generatePrompt" :disabled="!formData.topic || !selectedModelKey || generating">
            {{ generating ? t('aiGenerator.generating') : t('aiGenerator.generate') }}
          </ion-button>
        </ion-buttons>
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

      <!-- 有AI配置时显示的生成表单 -->
      <form v-else @submit.prevent="generatePrompt">
        <ion-list>
          <!-- 需求描述 -->
          <ion-item>
            <ion-textarea
              v-model="formData.topic"
              :label="t('aiGenerator.requirement')"
              label-placement="stacked"
              :placeholder="t('aiGenerator.requirementPlaceholder')"
              :rows="6"
              :auto-grow="true"
              required
            ></ion-textarea>
          </ion-item>

          <!-- 模型选择 -->
          <ion-item button @click="showModelPicker = true">
            <ion-label>{{ t('aiGenerator.selectModel') }}</ion-label>
            <ion-note slot="end">
              {{ selectedModelName || t('aiGenerator.selectModel') }}
            </ion-note>
          </ion-item>

          <!-- 自动保存选项 -->
          <ion-item>
            <ion-label>{{ t('aiGenerator.autoSave') }}</ion-label>
            <ion-toggle v-model="autoSaveEnabled" slot="end"></ion-toggle>
          </ion-item>

          <!-- 生成结果 -->
          <ion-item v-if="generatedResult || generating">
            <ion-textarea
              v-model="generatedResult"
              :label="t('aiGenerator.result')"
              label-placement="stacked"
              :placeholder="generating ? t('aiGenerator.generating') : t('aiGenerator.resultPlaceholder')"
              :rows="10"
              :auto-grow="true"
              :readonly="generating || autoSaveEnabled"
            ></ion-textarea>
          </ion-item>

          <!-- 手动保存按钮 -->
          <ion-item v-if="generatedResult && !generating && !autoSaveEnabled" lines="none">
            <ion-button expand="block" color="success" @click="savePrompt" style="width: 100%; margin: 8px 0;">
              <ion-icon slot="start" :icon="saveOutline"></ion-icon>
              {{ t('common.save') }}
            </ion-button>
          </ion-item>
        </ion-list>
      </form>

      <!-- 加载指示器 -->
      <div v-if="generating" class="generating-overlay">
        <ion-spinner></ion-spinner>
        <p>{{ t('aiGenerator.generating') }}</p>
      </div>
    </ion-content>

    <!-- 模型选择器模态框 -->
    <ion-modal :is-open="showModelPicker" @didDismiss="showModelPicker = false">
      <ion-header>
        <ion-toolbar>
          <ion-title>{{ t('aiGenerator.selectModel') }}</ion-title>
          <ion-buttons slot="end">
            <ion-button @click="showModelPicker = false">
              {{ t('common.close') }}
            </ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>
      <ion-content>
        <ion-list>
          <template v-for="config in configs" :key="config.configId">
            <ion-list-header v-if="configs.length > 1">
              <ion-label>
                {{ config.name }}
                <ion-icon v-if="config.isPreferred" :icon="star" color="warning" style="margin-left: 4px;"></ion-icon>
              </ion-label>
            </ion-list-header>
            <ion-item
              v-for="model in getConfigModels(config)"
              :key="`${config.configId}:${model}`"
              button
              @click="selectModel(config.configId, model, config.name)"
            >
              <ion-label>{{ model }}</ion-label>
              <ion-icon
                v-if="selectedModelKey === `${config.configId}:${model}`"
                :icon="checkmark"
                slot="end"
                color="primary"
              ></ion-icon>
            </ion-item>
          </template>
        </ion-list>
      </ion-content>
    </ion-modal>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonButton,
  IonIcon,
  IonList,
  IonItem,
  IonLabel,
  IonTextarea,
  IonToggle,
  IonNote,
  IonModal,
  IonListHeader,
  IonSpinner,
  toastController,
  alertController,
  useBackButton
} from '@ionic/vue'
import {
  arrowBack,
  sparklesOutline,
  saveOutline,
  checkmark,
  star
} from 'ionicons/icons'
import { useI18n } from '~/composables/useI18n'
import { api } from '~/lib/api'
import { databaseService } from '~/lib/db'
import type { AIConfig } from '@shared/types'
import { AIGeneratorService } from '~/lib/services/mobile-ai-generator.service'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()

// 状态
const configs = ref<AIConfig[]>([])
const loading = ref(true)
const generating = ref(false)
const selectedModelKey = ref<string>('')
const selectedConfigName = ref<string>('')
const generatedResult = ref<string>('')
const autoSaveEnabled = ref<boolean>(true)
const showModelPicker = ref(false)
const generatedTopic = ref<string>('') // 保存生成时使用的主题

// 表单数据
const formData = reactive({
  topic: ''
})

// 选中的模型显示名称
const selectedModelName = computed(() => {
  if (!selectedModelKey.value) return ''
  const [configId, model] = selectedModelKey.value.split(':')
  const config = configs.value.find(c => c.configId === configId)
  if (!config) return model
  return configs.value.length > 1 ? `${config.name} - ${model}` : model
})

// 获取配置的所有模型
const getConfigModels = (config: AIConfig) => {
  const models: string[] = []

  // 添加所有可用模型
  if (config.models && config.models.length > 0) {
    models.push(...config.models)
  }

  // 如果有自定义模型，也添加进去
  if (config.customModel && !models.includes(config.customModel)) {
    models.push(config.customModel)
  }

  // 如果没有任何模型，至少添加默认模型
  if (models.length === 0 && config.defaultModel) {
    models.push(config.defaultModel)
  }

  return models
}

// 加载 AI 配置
const loadConfigs = async () => {
  loading.value = true
  try {
    const result = await databaseService.aiConfig.getEnabledAIConfigs()
    configs.value = result

    // 直接从已加载的启用列表中查找首选配置，避免二次 DB 查询与列表数据不一致
    // （单独调用 getPreferredAIConfig 可能因 enabled 字段类型差异返回不在列表中的配置）
    const preferred = result.find(c => c.isPreferred) ?? result[0]
    if (preferred?.defaultModel) {
      selectedModelKey.value = `${preferred.configId}:${preferred.defaultModel}`
      selectedConfigName.value = preferred.name
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

// 选择模型
const selectModel = (configId: string, model: string, configName: string) => {
  selectedModelKey.value = `${configId}:${model}`
  selectedConfigName.value = configName
  showModelPicker.value = false
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
    // 解析选中的配置和模型（使用首个 ':' 分割，保证模型名含 ':' 时也能正确解析）
    const firstColon = selectedModelKey.value.indexOf(':')
    const configId = selectedModelKey.value.substring(0, firstColon)
    const model = selectedModelKey.value.substring(firstColon + 1)
    const selectedConfig = configs.value.find(c => c.configId === configId)

    if (!selectedConfig) {
      throw new Error('未找到选中的配置')
    }

    console.log('生成请求参数:', { configId, model, topic: formData.topic })

    const request = {
      configId: selectedConfig.configId,
      model: model,
      topic: formData.topic
    }

    // 保存当前主题，用于后续保存
    generatedTopic.value = formData.topic

    // 使用统一的 AI 生成服务，支持流式传输
    const result = await AIGeneratorService.generatePrompt(
      request,
      selectedConfig,
      (content: string) => {
        // 流式更新生成结果
        generatedResult.value = content
      }
    )

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
      // 自动保存后返回列表
      setTimeout(() => {
        router.push('/tabs/prompts')
      }, 1000)
    } else {
      showToast(t('aiGenerator.generateSuccess'), 'success')
    }
  } catch (error) {
    console.error('生成失败:', error)
    showToast(t('aiGenerator.generateFailed') + ': ' + (error as Error).message, 'danger')
    generatedResult.value = ''
  } finally {
    generating.value = false
  }
}

// 手动保存提示词
const savePrompt = async () => {
  if (!generatedResult.value.trim()) {
    showToast(t('aiGenerator.noContentToSave'), 'warning')
    return
  }

  try {
    const promptData = {
      title: `AI生成: ${generatedTopic.value || '提示词生成'}`,
      content: generatedResult.value,
      description: '',
      tags: ['AI生成'],
      categoryId: undefined,
      isFavorite: false,
      useCount: 0,
      uuid: `prompt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      isActive: true
    }

    await api.prompts.create.mutate(promptData)
    showToast(t('aiGenerator.saveSuccess'), 'success')

    // 保存后返回提示词列表
    setTimeout(() => {
      router.push('/tabs/prompts')
    }, 1000)
  } catch (error) {
    console.error('保存提示词失败:', error)
    showToast(t('aiGenerator.saveFailed') + ': ' + (error as Error).message, 'danger')
  }
}

// 直接保存生成的提示词（自动保存使用）
const saveGeneratedPrompt = async (result: any) => {
  try {
    const promptData = {
      title: `AI生成: ${result.topic}`,
      content: result.generatedPrompt,
      description: '',
      tags: ['AI生成'],
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

// 取消
const handleCancel = async () => {
  // 检查是否有未保存的内容
  const hasUnsavedContent = generatedResult.value && !autoSaveEnabled.value

  if (hasUnsavedContent) {
    const alert = await alertController.create({
      header: t('common.confirm'),
      message: t('promptManagement.unsavedChanges'),
      buttons: [
        {
          text: t('common.cancel'),
          role: 'cancel'
        },
        {
          text: t('promptManagement.discardChanges'),
          role: 'destructive',
          handler: () => {
            resetForm()
            router.back()
          }
        }
      ]
    })
    await alert.present()
  } else {
    resetForm()
    router.back()
  }
}

// 处理 Android 物理返回键（与屏幕取消按钮逻辑一致）
useBackButton(10, () => {
  handleCancel()
})

// 重置表单
const resetForm = () => {
  formData.topic = ''
  generatedResult.value = ''
  generatedTopic.value = ''
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

// 监听路由变化，每次进入页面时重置表单
watch(() => route.path, (newPath) => {
  if (newPath === '/ai-generator') {
    resetForm()
  }
}, { immediate: true })
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

.generating-overlay {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  z-index: 1000;
}

.generating-overlay p {
  margin: 0;
  color: var(--ion-color-medium);
  font-size: 14px;
}

ion-textarea {
  --padding-top: 12px;
  --padding-bottom: 12px;
}
</style>
