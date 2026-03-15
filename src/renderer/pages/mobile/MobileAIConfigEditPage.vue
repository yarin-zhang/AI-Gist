<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button :text="t('common.back')"></ion-back-button>
        </ion-buttons>
        <ion-title>{{ isEditMode ? t('aiConfig.editConfig') : t('aiConfig.addConfig') }}</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="handleSave" :disabled="saving">
            {{ t('common.save') }}
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <div class="form-container">
        <!-- 基本配置 -->
        <div class="form-section">
          <div class="section-title">{{ t('aiConfig.basicConfig') }}</div>
          <div class="form-content">
            <ion-list lines="none">

          <!-- 服务类型 -->
          <ion-item lines="none">
            <ion-select
              v-model="formData.type"
              :label="t('aiConfig.serviceType')"
              :placeholder="t('aiConfig.pleaseSelectType')"
              @ionChange="onTypeChange"
            >
              <ion-select-option disabled>{{ t('aiConfig.localServices') }}</ion-select-option>
              <ion-select-option value="ollama">Ollama</ion-select-option>
              <ion-select-option value="lmstudio">LM Studio</ion-select-option>
              <ion-select-option disabled>{{ t('aiConfig.onlineServices') }}</ion-select-option>
              <ion-select-option value="openai">OpenAI</ion-select-option>
              <ion-select-option value="anthropic">Anthropic Claude</ion-select-option>
              <ion-select-option value="google">Google Gemini AI</ion-select-option>
              <ion-select-option value="azure">Azure OpenAI</ion-select-option>
              <ion-select-option value="mistral">Mistral AI</ion-select-option>
              <ion-select-option value="openrouter">OpenRouter</ion-select-option>
              <ion-select-option value="deepseek">DeepSeek</ion-select-option>
              <ion-select-option value="tencent">腾讯云</ion-select-option>
              <ion-select-option value="aliyun">阿里云</ion-select-option>
              <ion-select-option value="zhipu">智谱 AI</ion-select-option>
              <ion-select-option value="siliconflow">硅基流动</ion-select-option>
            </ion-select>
          </ion-item>

          <!-- 配置名称 - 选择服务类型后显示 -->
          <ion-item v-if="formData.type" lines="none">
            <ion-input
              v-model="formData.name"
              :label="t('aiConfig.configName')"
              :placeholder="t('aiConfig.pleaseEnterConfigName')"
              required
            ></ion-input>
          </ion-item>

          <!-- Base URL -->
          <ion-item v-if="formData.type && needsBaseURL" lines="none">
            <ion-input
              v-model="formData.baseURL"
              :label="getBaseURLInfo.label"
              :placeholder="getBaseURLInfo.placeholder"
              type="url"
            ></ion-input>
          </ion-item>

          <!-- API Key -->
          <ion-item v-if="formData.type && needsApiKey" lines="none">
            <ion-input
              v-model="formData.apiKey"
              :label="getApiKeyLabel"
              placeholder="API Key"
              type="password"
            ></ion-input>
          </ion-item>

          <!-- 服务信息 -->
          <ion-item v-if="formData.type && getServiceInfo.description" lines="none">
            <div class="service-info">
              <p class="service-description">{{ getServiceInfo.description }}</p>
              <div class="service-links">
                <ion-button
                  v-if="getApiKeyInfo.apiKeyUrl"
                  fill="clear"
                  size="small"
                  @click="openUrl(getApiKeyInfo.apiKeyUrl)"
                >
                  {{ t('aiConfig.getApiKey') }}
                </ion-button>
                <ion-button
                  v-if="getApiKeyInfo.docUrl"
                  fill="clear"
                  size="small"
                  @click="openUrl(getApiKeyInfo.docUrl)"
                >
                  {{ t('aiConfig.viewDocumentation') }}
                </ion-button>
              </div>
            </div>
          </ion-item>

          <!-- 测试连接按钮 -->
          <ion-item v-if="formData.type" lines="none">
            <div class="action-buttons">
              <ion-button
                expand="block"
                @click="handleTestConnection"
                :disabled="testingConnection || !canTestConnection"
              >
                <ion-spinner v-if="testingConnection" slot="start"></ion-spinner>
                {{ t('aiConfig.testConnection') }}
              </ion-button>
            </div>
          </ion-item>

          <!-- 测试结果 -->
          <ion-item v-if="testResult" lines="none">
            <div class="test-result" :class="{ success: testResult.success, error: !testResult.success }">
              <ion-icon
                :icon="testResult.success ? checkmarkCircle : closeCircle"
                :color="testResult.success ? 'success' : 'danger'"
              ></ion-icon>
              <div class="test-result-content">
                <div class="test-result-message">{{ testResult.message }}</div>
                <!-- 显示详细错误信息 -->
                <div v-if="!testResult.success && testResult.message" class="test-result-detail">
                  {{ testResult.message }}
                </div>
              </div>
            </div>
          </ion-item>
            </ion-list>
          </div>
        </div>

        <!-- 模型配置 - 测试成功后显示 -->
        <div v-if="testResult?.success" class="form-section">
          <div class="section-title">{{ t('aiConfig.modelConfig') }}</div>
          <div class="form-content">
            <ion-list lines="none">

          <!-- 模型列表 -->
          <ion-item lines="none">
            <div class="models-container">
              <ion-label position="stacked">{{ t('aiConfig.modelList') }}</ion-label>
              <div class="models-chips">
                <ion-chip
                  v-for="(model, index) in formData.models"
                  :key="index"
                  @click="removeModel(index)"
                >
                  <ion-label>{{ model }}</ion-label>
                  <ion-icon :icon="close"></ion-icon>
                </ion-chip>
                <ion-chip @click="showAddModelAlert" color="primary">
                  <ion-icon :icon="add"></ion-icon>
                  <ion-label>{{ t('aiConfig.addModel') }}</ion-label>
                </ion-chip>
              </div>
            </div>
          </ion-item>

          <!-- 默认模型 -->
          <ion-item v-if="formData.models.length > 0" lines="none">
            <ion-select
              v-model="formData.defaultModel"
              :label="t('aiConfig.defaultModel')"
              :placeholder="t('aiConfig.pleaseSelectDefaultModel')"
            >
              <ion-select-option v-for="model in formData.models" :key="model" :value="model">
                {{ model }}
              </ion-select-option>
            </ion-select>
          </ion-item>

          <!-- 自定义模型 -->
          <ion-item lines="none">
            <ion-input
              v-model="formData.customModel"
              :label="t('aiConfig.customModel')"
              :placeholder="t('aiConfig.customModelPlaceholder')"
            ></ion-input>
          </ion-item>
            </ion-list>
          </div>
        </div>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
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
  IonInput,
  IonSelect,
  IonSelectOption,
  IonChip,
  IonIcon,
  IonSpinner,
  alertController,
  toastController
} from '@ionic/vue'
import {
  add,
  close,
  checkmarkCircle,
  closeCircle
} from 'ionicons/icons'
import { useI18n } from '~/composables/useI18n'
import { useAIConfigForm } from '~/composables/useAIConfigForm'
import { api } from '~/lib/api'
import type { AIConfig } from '@shared/types'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

// 使用 composable
const {
  formData,
  needsBaseURL,
  needsApiKey,
  canTestConnection,
  handleTypeChange,
  getApiKeyLabel,
  getBaseURLInfo,
  getApiKeyInfo,
  resetForm
} = useAIConfigForm()

// 状态
const saving = ref(false)
const testingConnection = ref(false)
const testResult = ref<{ success: boolean; message: string; models?: string[] } | null>(null)

// 判断是否为编辑模式
const isEditMode = computed(() => !!route.params.id)

// 计算属性：服务商信息
const getServiceInfo = computed(() => {
  const info: Record<string, { name: string; description: string }> = {
    openai: {
      name: 'OpenAI',
      description: t('aiConfig.serviceDescriptions.openai')
    },
    anthropic: {
      name: 'Anthropic Claude',
      description: t('aiConfig.serviceDescriptions.anthropic')
    },
    google: {
      name: 'Google Gemini AI',
      description: t('aiConfig.serviceDescriptions.google')
    },
    azure: {
      name: 'Azure OpenAI',
      description: t('aiConfig.serviceDescriptions.azure')
    },
    deepseek: {
      name: 'DeepSeek',
      description: t('aiConfig.serviceDescriptions.deepseek')
    },
    siliconflow: {
      name: '硅基流动',
      description: t('aiConfig.serviceDescriptions.siliconflow')
    },
    tencent: {
      name: '腾讯云',
      description: t('aiConfig.serviceDescriptions.tencent')
    },
    aliyun: {
      name: '阿里云',
      description: t('aiConfig.serviceDescriptions.aliyun')
    },
    mistral: {
      name: 'Mistral AI',
      description: t('aiConfig.serviceDescriptions.mistral')
    },
    zhipu: {
      name: '智谱AI',
      description: t('aiConfig.serviceDescriptions.zhipu')
    },
    openrouter: {
      name: 'OpenRouter',
      description: t('aiConfig.serviceDescriptions.openrouter')
    },
    ollama: {
      name: 'Ollama',
      description: t('aiConfig.serviceDescriptions.ollama')
    },
    lmstudio: {
      name: 'LM Studio',
      description: t('aiConfig.serviceDescriptions.lmstudio')
    }
  }
  return info[formData.type] || { name: '', description: '' }
})

// 加载配置数据（编辑模式）
const loadConfig = async () => {
  if (!isEditMode.value) return

  try {
    const configs = await api.aiConfigs.getAll.query()
    const config = configs.find(c => c.id === Number(route.params.id))

    if (config) {
      formData.type = config.type
      formData.name = config.name
      formData.baseURL = config.baseURL
      formData.apiKey = config.apiKey || ''
      formData.models = config.models
      formData.defaultModel = config.defaultModel || ''
      formData.customModel = config.customModel || ''
    }
  } catch (error) {
    console.error('加载配置失败:', error)
    showToast(t('aiConfig.loadFailed'), 'danger')
  }
}

// 处理服务类型变化
const onTypeChange = () => {
  handleTypeChange(formData.type, isEditMode.value)
  testResult.value = null
}

// 测试连接
const handleTestConnection = async () => {
  // 验证必填字段
  if (!formData.name) {
    showToast(t('aiConfig.pleaseEnterConfigName'), 'warning')
    return
  }
  if (needsBaseURL.value && !formData.baseURL) {
    showToast(t('aiConfig.pleaseEnterBaseURL'), 'warning')
    return
  }
  if (needsApiKey.value && !formData.apiKey) {
    showToast(t('aiConfig.pleaseEnterAPIKey'), 'warning')
    return
  }

  testingConnection.value = true
  testResult.value = null

  try {
    console.log('[Page] 准备测试连接，formData:', {
      type: formData.type,
      baseURL: formData.baseURL,
      hasApiKey: !!formData.apiKey,
      apiKeyLength: formData.apiKey?.length || 0
    })

    // 使用统一的 API 调用（会自动根据平台选择实现）
    const result = await api.aiConfigs.test.mutate({
      type: formData.type,
      baseURL: formData.baseURL,
      apiKey: formData.apiKey
    })

    console.log('[Page] 测试结果:', result)

    if (result.success) {
      // 如果获取到模型，自动填充
      if (result.models && result.models.length > 0) {
        formData.models = result.models

        // 如果还没有设置默认模型，自动设置第一个
        if (!formData.defaultModel) {
          formData.defaultModel = result.models[0]
        }

        testResult.value = {
          success: true,
          message: t('aiConfig.foundModels', { count: result.models.length }),
          models: result.models
        }
        showToast(t('aiConfig.connectionTestSuccess'))
      } else {
        // 连接成功但没有获取到模型
        testResult.value = {
          success: true,
          message: t('aiConfig.connectionSuccessNoModels') || '连接成功，但未获取到模型列表，请手动添加'
        }
        showToast(t('aiConfig.connectionSuccessNoModels') || '连接成功，请手动添加模型', 'warning')
      }
    } else {
      // 显示详细的错误信息
      const errorMessage = result.error || t('aiConfig.connectionTestFailed')
      testResult.value = {
        success: false,
        message: errorMessage
      }
      showToast(errorMessage, 'danger')
    }
  } catch (error) {
    console.error('[Page] 测试连接失败:', error)
    const errorMessage = (error as Error).message || t('aiConfig.testFailed')
    testResult.value = {
      success: false,
      message: errorMessage
    }
    showToast(errorMessage, 'danger')
  } finally {
    testingConnection.value = false
  }
}

// 添加模型
const showAddModelAlert = async () => {
  const alert = await alertController.create({
    header: t('aiConfig.addModel'),
    inputs: [
      {
        name: 'modelName',
        type: 'text',
        placeholder: t('aiConfig.modelNamePlaceholder')
      }
    ],
    buttons: [
      {
        text: t('common.cancel'),
        role: 'cancel'
      },
      {
        text: t('common.add'),
        handler: (data) => {
          if (data.modelName && data.modelName.trim()) {
            formData.models.push(data.modelName.trim())
          }
        }
      }
    ]
  })

  await alert.present()
}

// 移除模型
const removeModel = (index: number) => {
  const removedModel = formData.models[index]
  formData.models.splice(index, 1)
  // 如果删除的是默认模型，清空默认模型
  if (formData.defaultModel === removedModel) {
    formData.defaultModel = ''
  }
}

// 打开URL
const openUrl = (url: string) => {
  window.open(url, '_blank')
}

// 保存配置
const handleSave = async () => {
  // 验证必填字段
  if (!formData.name) {
    showToast(t('aiConfig.pleaseEnterConfigName'), 'warning')
    return
  }
  if (needsBaseURL.value && !formData.baseURL) {
    showToast(t('aiConfig.pleaseEnterBaseURL'), 'warning')
    return
  }
  if (needsApiKey.value && !formData.apiKey) {
    showToast(t('aiConfig.pleaseEnterAPIKey'), 'warning')
    return
  }

  saving.value = true

  try {
    const configData: Partial<AIConfig> = {
      type: formData.type,
      name: formData.name,
      baseURL: formData.baseURL,
      apiKey: formData.apiKey,
      models: formData.models,
      defaultModel: formData.defaultModel,
      customModel: formData.customModel,
      enabled: true
    }

    if (isEditMode.value) {
      await api.aiConfigs.update.mutate({
        id: Number(route.params.id),
        data: configData as AIConfig
      })
      showToast(t('aiConfig.configUpdateSuccess'))
    } else {
      // 新建时必须生成 configId，否则生成器页面无法通过 configId 查找配置
      configData.configId = `config_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      await api.aiConfigs.create.mutate(configData as AIConfig)
      showToast(t('aiConfig.configAddSuccess'))
    }

    router.back()
  } catch (error) {
    console.error('保存配置失败:', error)
    showToast(
      isEditMode.value ? t('aiConfig.updateFailed') : t('aiConfig.saveFailed'),
      'danger'
    )
  } finally {
    saving.value = false
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

// 初始化
onMounted(() => {
  loadConfig()
})
</script>

<style scoped>
.form-container {
  padding: 16px;
  padding-bottom: 20px;
}

.form-section {
  margin-bottom: 24px;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--ion-text-color);
  margin-bottom: 12px;
  padding: 0 4px;
}

.form-content {
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

.service-info {
  width: 100%;
  padding: 12px 0;
}

.service-description {
  color: var(--ion-color-medium);
  font-size: 14px;
  margin: 0 0 8px 0;
  line-height: 1.5;
}

.service-links {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.action-buttons {
  display: flex;
  gap: 12px;
  width: 100%;
  padding: 8px 0;
}

.action-buttons ion-button {
  flex: 1;
  margin: 0;
}

.test-result {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px;
  border-radius: 8px;
  width: 100%;
}

.test-result.success {
  background-color: var(--ion-color-success-tint);
}

.test-result.error {
  background-color: var(--ion-color-danger-tint);
}

.test-result-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.test-result-message {
  font-weight: 500;
}

.test-result-detail {
  font-size: 13px;
  opacity: 0.8;
  word-break: break-word;
}

.models-container {
  width: 100%;
  padding: 12px 0;
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
</style>
