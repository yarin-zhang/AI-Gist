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
        <!-- 服务类型 -->
        <ion-list>
          <ion-list-header>
            <ion-label>{{ t('aiConfig.basicConfig') }}</ion-label>
          </ion-list-header>

          <ion-item>
            <ion-select
              v-model="formData.type"
              :label="t('aiConfig.serviceType')"
              :placeholder="t('aiConfig.pleaseSelectType')"
              @ionChange="handleTypeChange"
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

          <!-- 配置名称 -->
          <ion-item>
            <ion-input
              v-model="formData.name"
              :label="t('aiConfig.configName')"
              :placeholder="t('aiConfig.pleaseEnterConfigName')"
              required
            ></ion-input>
          </ion-item>

          <!-- Base URL -->
          <ion-item v-if="needsBaseURL">
            <ion-input
              v-model="formData.baseURL"
              :label="getBaseURLInfo.label"
              :placeholder="getBaseURLInfo.placeholder"
              type="url"
            ></ion-input>
          </ion-item>

          <!-- API Key -->
          <ion-item v-if="needsApiKey">
            <ion-input
              v-model="formData.apiKey"
              :label="getApiKeyLabel"
              placeholder="API Key"
              type="password"
            ></ion-input>
          </ion-item>

          <!-- 服务信息 -->
          <ion-item v-if="getServiceInfo.description" lines="none">
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

          <!-- 连接测试 -->
          <ion-item lines="none">
            <ion-button expand="block" @click="handleTestConnection" :disabled="testingConnection">
              <ion-spinner v-if="testingConnection" slot="start"></ion-spinner>
              {{ t('aiConfig.testConnection') }}
            </ion-button>
          </ion-item>

          <!-- 测试结果 -->
          <ion-item v-if="testResult" lines="none">
            <div class="test-result" :class="{ success: testResult.success, error: !testResult.success }">
              <ion-icon
                :icon="testResult.success ? checkmarkCircle : closeCircle"
                :color="testResult.success ? 'success' : 'danger'"
              ></ion-icon>
              <span>{{ testResult.message }}</span>
            </div>
          </ion-item>
        </ion-list>

        <!-- 模型配置 -->
        <ion-list>
          <ion-list-header>
            <ion-label>{{ t('aiConfig.modelConfig') }}</ion-label>
          </ion-list-header>

          <!-- 模型列表 -->
          <ion-item>
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
          <ion-item v-if="formData.models.length > 0">
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
          <ion-item>
            <ion-input
              v-model="formData.customModel"
              :label="t('aiConfig.customModel')"
              :placeholder="t('aiConfig.customModelPlaceholder')"
            ></ion-input>
          </ion-item>
        </ion-list>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
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
  IonListHeader,
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
import { api } from '~/lib/api'
import type { AIConfig, AIProviderType } from '@shared/types'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

// 状态
const saving = ref(false)
const testingConnection = ref(false)
const testResult = ref<{ success: boolean; message: string } | null>(null)

// 判断是否为编辑模式
const isEditMode = computed(() => !!route.params.id)

// 表单数据
const formData = reactive({
  type: 'openai' as AIProviderType,
  name: '',
  baseURL: '',
  apiKey: '',
  models: [] as string[],
  defaultModel: '',
  customModel: ''
})

// 计算属性：是否需要Base URL
const needsBaseURL = computed(() => {
  return !['anthropic', 'google'].includes(formData.type)
})

// 计算属性：是否需要API Key
const needsApiKey = computed(() => {
  return !['ollama', 'lmstudio'].includes(formData.type)
})

// 计算属性：API Key标签
const getApiKeyLabel = computed(() => {
  const labels: Record<string, string> = {
    anthropic: 'Anthropic API Key',
    google: 'Google Gemini AI API Key',
    azure: 'Azure OpenAI API Key',
    deepseek: 'DeepSeek API Key',
    siliconflow: '硅基流动 API Key',
    tencent: '腾讯云 API Key',
    aliyun: '阿里云 API Key',
    mistral: 'Mistral API Key',
    zhipu: '智谱AI API Key',
    openrouter: 'OpenRouter API Key'
  }
  return labels[formData.type] || 'API Key'
})

// 计算属性：Base URL标签和placeholder
const getBaseURLInfo = computed(() => {
  const info: Record<string, { label: string; placeholder: string }> = {
    ollama: {
      label: t('aiConfig.ollamaServiceAddress'),
      placeholder: t('aiConfig.ollamaExample')
    },
    lmstudio: {
      label: t('aiConfig.lmstudioServiceAddress'),
      placeholder: t('aiConfig.lmstudioExample')
    },
    azure: {
      label: t('aiConfig.azureOpenAIEndpoint'),
      placeholder: t('aiConfig.azureExample')
    },
    deepseek: {
      label: t('aiConfig.deepseekAPIAddress'),
      placeholder: t('aiConfig.deepseekExample')
    },
    siliconflow: {
      label: t('aiConfig.siliconflowAPIAddress'),
      placeholder: t('aiConfig.siliconflowExample')
    },
    tencent: {
      label: t('aiConfig.tencentAPIAddress'),
      placeholder: t('aiConfig.tencentExample')
    },
    aliyun: {
      label: t('aiConfig.aliyunAPIAddress'),
      placeholder: t('aiConfig.aliyunExample')
    },
    mistral: {
      label: t('aiConfig.mistralAPIAddress'),
      placeholder: t('aiConfig.mistralExample')
    },
    zhipu: {
      label: t('aiConfig.zhipuAPIAddress'),
      placeholder: t('aiConfig.zhipuExample')
    },
    openrouter: {
      label: t('aiConfig.baseURL'),
      placeholder: 'https://openrouter.ai/api/v1'
    }
  }
  return info[formData.type] || {
    label: t('aiConfig.baseURL'),
    placeholder: t('aiConfig.openaiExample')
  }
})

// 计算属性：API Key 信息
const getApiKeyInfo = computed(() => {
  const info: Record<string, { apiKeyUrl: string; docUrl: string }> = {
    openai: {
      apiKeyUrl: 'https://platform.openai.com/api-keys',
      docUrl: 'https://platform.openai.com/docs'
    },
    anthropic: {
      apiKeyUrl: 'https://console.anthropic.com/',
      docUrl: 'https://docs.anthropic.com/'
    },
    google: {
      apiKeyUrl: 'https://makersuite.google.com/app/apikey',
      docUrl: 'https://ai.google.dev/docs'
    },
    azure: {
      apiKeyUrl: 'https://portal.azure.com/',
      docUrl: 'https://learn.microsoft.com/en-us/azure/ai-services/openai/'
    },
    deepseek: {
      apiKeyUrl: 'https://platform.deepseek.com/api_keys',
      docUrl: 'https://platform.deepseek.com/docs'
    },
    siliconflow: {
      apiKeyUrl: 'https://cloud.siliconflow.cn/me/account/ak',
      docUrl: 'https://docs.siliconflow.cn/'
    },
    tencent: {
      apiKeyUrl: 'https://console.cloud.tencent.com/hunyuan',
      docUrl: 'https://cloud.tencent.com/document/product/1729'
    },
    aliyun: {
      apiKeyUrl: 'https://bailian.console.aliyun.com/',
      docUrl: 'https://bailian.console.aliyun.com/?tab=doc#/doc'
    },
    mistral: {
      apiKeyUrl: 'https://console.mistral.ai/api-keys/',
      docUrl: 'https://docs.mistral.ai/'
    },
    zhipu: {
      apiKeyUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
      docUrl: 'https://docs.bigmodel.cn/cn/guide/start/model-overview'
    },
    openrouter: {
      apiKeyUrl: 'https://openrouter.ai/keys',
      docUrl: 'https://openrouter.ai/docs'
    },
    ollama: {
      apiKeyUrl: '',
      docUrl: 'https://github.com/ollama/ollama'
    },
    lmstudio: {
      apiKeyUrl: '',
      docUrl: 'https://lmstudio.ai/docs/app/basics'
    }
  }
  return info[formData.type] || { apiKeyUrl: '', docUrl: '' }
})

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
const handleTypeChange = () => {
  testResult.value = null
  // 清空不需要的字段
  if (!needsBaseURL.value) {
    formData.baseURL = ''
  }
  if (!needsApiKey.value) {
    formData.apiKey = ''
  }
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
    const result = await api.aiConfigs.test.mutate({
      type: formData.type,
      baseURL: formData.baseURL,
      apiKey: formData.apiKey
    })

    if (result.success && result.models) {
      formData.models = result.models
      testResult.value = {
        success: true,
        message: t('aiConfig.foundModels', { count: result.models.length })
      }
      showToast(t('aiConfig.connectionTestSuccess'))
    } else {
      testResult.value = {
        success: false,
        message: result.error || t('aiConfig.connectionTestFailed')
      }
      showToast(result.error || t('aiConfig.connectionTestFailed'), 'danger')
    }
  } catch (error) {
    console.error('测试连接失败:', error)
    testResult.value = {
      success: false,
      message: t('aiConfig.testFailed')
    }
    showToast(t('aiConfig.testFailed'), 'danger')
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
  formData.models.splice(index, 1)
  // 如果删除的是默认模型，清空默认模型
  if (formData.defaultModel === formData.models[index]) {
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
  padding-bottom: 20px;
}

ion-list {
  margin-bottom: 16px;
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
}

.test-result {
  display: flex;
  align-items: center;
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
