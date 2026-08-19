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

          <!-- 服务类型：改为卡片式弹层选择，分组顺序为「在线服务」在前、「本地服务」在后
               （移动端连接本地模型不方便，不适合作为默认优先项，详见 issue #58） -->
          <ion-item button detail lines="none" @click="showTypeModal = true">
            <ion-label>{{ t('aiConfig.serviceType') }}</ion-label>
            <div class="type-trigger-value" slot="end">
              <span class="type-badge">{{ selectedProviderChoice.initial }}</span>
              <span class="type-trigger-name">{{ selectedProviderChoice.label }}</span>
            </div>
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

        <!-- 模型配置 -->
        <div v-if="shouldShowModelConfig" class="form-section">
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

    <!-- 服务类型选择弹层：卡片式列表，分组顺序为「在线服务」→「本地服务」 -->
    <ion-modal :is-open="showTypeModal" @didDismiss="showTypeModal = false">
      <ion-header>
        <ion-toolbar>
          <ion-title>{{ t('aiConfig.serviceType') }}</ion-title>
          <ion-buttons slot="end">
            <ion-button @click="showTypeModal = false">
              {{ t('common.close') }}
            </ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>
      <ion-content class="type-modal-content">
        <template v-for="group in typeGroups" :key="group.key">
          <ion-list-header class="type-group-header">
            <ion-icon :icon="group.icon"></ion-icon>
            <ion-label>{{ group.label }}</ion-label>
          </ion-list-header>
          <div class="mobile-grouped-card">
            <ion-list lines="full">
              <ion-item
                v-for="provider in group.providers"
                :key="provider.type"
                button
                :detail="false"
                @click="selectType(provider.type)"
              >
                <span class="type-badge" slot="start">{{ provider.initial }}</span>
                <ion-label class="ion-text-wrap">
                  <h3>{{ provider.label }}</h3>
                  <p>{{ provider.description }}</p>
                </ion-label>
                <ion-icon
                  v-if="formData.type === provider.type"
                  :icon="checkmarkCircle"
                  slot="end"
                  color="primary"
                ></ion-icon>
              </ion-item>
            </ion-list>
          </div>
        </template>
      </ion-content>
    </ion-modal>
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
  IonListHeader,
  IonItem,
  IonLabel,
  IonInput,
  IonSelect,
  IonSelectOption,
  IonModal,
  IonChip,
  IonIcon,
  IonSpinner,
  alertController
} from '@ionic/vue'
import {
  add,
  close,
  checkmarkCircle,
  closeCircle,
  cloudOutline,
  hardwareChipOutline
} from 'ionicons/icons'
import { useI18n } from '~/composables/useI18n'
import { useAIConfigForm } from '~/composables/useAIConfigForm'
import { api } from '~/lib/api'
import { presentMobileToast } from '~/lib/utils/mobile-toast'
import type { AIConfig, AIProviderType } from '@shared/types'

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
const testResult = ref<{
  success: boolean
  message: string
  models?: string[]
  modelSource?: 'remote' | 'default' | 'unavailable'
} | null>(null)

// 判断是否为编辑模式
const isEditMode = computed(() => !!route.params.id)
const shouldShowModelConfig = computed(() => {
  return !!testResult.value?.success || isEditMode.value || formData.models.length > 0 || !!formData.customModel
})

// 服务商信息（名称 + 描述）。按类型取值，供当前选中态展示和选择弹层的卡片列表共用
const getServiceInfoByType = (type: AIProviderType) => {
  const info: Record<AIProviderType, { name: string; description: string }> = {
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
  return info[type] || { name: '', description: '' }
}

// 计算属性：当前选中服务商信息
const getServiceInfo = computed(() => getServiceInfoByType(formData.type))

// 服务类型选择弹层
// 移动端目前没有桌面端的「自定义服务」分组（OpenAI 兼容服务 / Claude 兼容服务）——
// 原生 ion-select 里从来只有「本地服务」「在线服务」两组，不存在对应的选项或数据，
// 因此这不是本次 issue 范围内该新增的功能，这里只调整已有两组的相对顺序：
// 在线服务在前、本地服务在后（手机连接本地模型不方便，不适合作为默认优先项）。
const showTypeModal = ref(false)

const localTypeOrder: AIProviderType[] = ['ollama', 'lmstudio']
const onlineTypeOrder: AIProviderType[] = [
  'openai', 'anthropic', 'google', 'azure', 'mistral',
  'openrouter', 'deepseek', 'tencent', 'aliyun', 'zhipu', 'siliconflow'
]

// 卡片头像用的短缩写，仅作视觉标识，不引入新的配色体系
const providerInitials: Record<AIProviderType, string> = {
  ollama: 'Ol',
  lmstudio: 'LM',
  openai: 'Op',
  anthropic: 'An',
  google: 'Go',
  azure: 'Az',
  mistral: 'Mi',
  openrouter: 'Or',
  deepseek: 'De',
  tencent: '腾',
  aliyun: '阿',
  zhipu: '智',
  siliconflow: '硅'
}

const buildProviderChoice = (type: AIProviderType) => {
  const info = getServiceInfoByType(type)
  return {
    type,
    label: info.name,
    description: info.description,
    initial: providerInitials[type]
  }
}

const typeGroups = computed(() => [
  {
    key: 'online',
    label: t('aiConfig.onlineServices'),
    icon: cloudOutline,
    providers: onlineTypeOrder.map(buildProviderChoice)
  },
  {
    key: 'local',
    label: t('aiConfig.localServices'),
    icon: hardwareChipOutline,
    providers: localTypeOrder.map(buildProviderChoice)
  }
])

const selectedProviderChoice = computed(() => buildProviderChoice(formData.type))

const selectType = (type: AIProviderType) => {
  if (formData.type !== type) {
    formData.type = type
    onTypeChange()
  }
  showTypeModal.value = false
}

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

const getModelListDisplayMessage = (result: {
  success: boolean
  models?: string[]
  error?: string
  modelSource?: 'remote' | 'default' | 'unavailable'
  modelListMessage?: string
}) => {
  if (!result.success) {
    return result.error || t('aiConfig.connectionTestFailed')
  }

  const modelCount = result.models?.length || 0
  if (result.modelSource === 'remote' && modelCount > 0) {
    return t('aiConfig.foundModels', { count: modelCount })
  }
  if (result.modelSource === 'default' && modelCount > 0) {
    return t('aiConfig.usingDefaultModels', { count: modelCount })
  }
  if (result.modelSource === 'unavailable') {
    return result.modelListMessage || t('aiConfig.connectionSuccessNoModels')
  }

  return result.modelListMessage || (
    modelCount > 0
      ? t('aiConfig.foundModels', { count: modelCount })
      : t('aiConfig.connectionSuccessNoModels')
  )
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
    // 使用统一的 API 调用（会自动根据平台选择实现）
    const result = await api.aiConfigs.test.mutate({
      type: formData.type,
      baseURL: formData.baseURL,
      apiKey: formData.apiKey
    })

    if (result.success) {
      const resultMessage = getModelListDisplayMessage(result)

      // 如果获取到模型，自动填充
      if (result.models && result.models.length > 0) {
        formData.models = result.models

        // 如果还没有设置默认模型，自动设置第一个
        if (!formData.defaultModel) {
          formData.defaultModel = result.models[0]
        }

        testResult.value = {
          success: true,
          message: resultMessage,
          models: result.models,
          modelSource: result.modelSource
        }
        showToast(resultMessage, result.modelSource === 'default' ? 'warning' : 'success')
      } else {
        // 连接成功但没有获取到模型
        testResult.value = {
          success: true,
          message: resultMessage,
          modelSource: result.modelSource
        }
        showToast(resultMessage, 'warning')
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
    if (!formData.defaultModel && formData.models.length > 0) {
      formData.defaultModel = formData.models[0]
    }
    if (!formData.defaultModel && formData.customModel) {
      formData.defaultModel = formData.customModel
    }

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
  await presentMobileToast(message, color)
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
  color: var(--ion-text-color);
  margin-bottom: 12px;
  padding: 0 4px;
}

.form-content {
  background: var(--surface-secondary);
  border-radius: 8px;
  border: 1px solid var(--border-default);
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
  font-size: var(--mobile-font-size-footnote);
  margin: 0 0 8px 0;
  line-height: var(--mobile-line-height-normal);
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
  background-color: color-mix(in srgb, var(--accent-success) 8%, var(--surface-primary));
}

.test-result.error {
  background-color: color-mix(in srgb, var(--accent-error) 8%, var(--surface-primary));
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
  font-size: var(--mobile-font-size-footnote);
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

/* 服务类型触发行：右侧展示当前选中的服务商头像 + 名称，点击后打开卡片式选择弹层 */
.type-trigger-value {
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: 60%;
}

.type-trigger-name {
  color: var(--content-secondary);
  font-size: var(--mobile-font-size-body);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 服务商头像：统一用缩写替代逐个品牌图标，避免引入新的配色/图标体系 */
.type-badge {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--accent-primary) 15%, transparent);
  color: var(--accent-primary);
  font-size: var(--mobile-font-size-caption);
  font-weight: 600;
  line-height: 1;
}

.type-modal-content {
  --padding-start: var(--mobile-page-gutter);
  --padding-end: var(--mobile-page-gutter);
  --padding-top: 12px;
  --padding-bottom: 20px;
}

/* 分组标题：图标 + 文案，呼应桌面端「本地服务/在线服务」分组标题的视觉语言 */
.type-group-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 16px 4px 8px;
  color: var(--content-secondary);
  font-size: var(--mobile-font-size-footnote);
}

.type-group-header:first-of-type {
  margin-top: 4px;
}

.type-group-header ion-icon {
  font-size: 16px;
}
</style>
