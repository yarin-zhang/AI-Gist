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

          <!-- 服务类型：卡片式弹层选择，分组顺序为「自定义服务」→「在线服务」→「本地服务」
               （严格按 issue #58 原文的三条顺序需求：自定义优先，在线次之，本地最后——
               手机连接本地模型不方便，不适合作为默认优先项） -->
          <ion-item button detail lines="none" @click="showTypeModal = true">
            <ion-label>{{ t('aiConfig.serviceType') }}</ion-label>
            <div class="type-trigger-value" slot="end">
              <span class="provider-icon" aria-hidden="true"><component :is="selectedProviderChoice.icon" /></span>
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

          <p
            v-if="formData.type === 'openai' && !isCustomSelected"
            class="base-url-hint"
          >
            {{ t('aiConfig.openaiBaseURLHint') }}
          </p>

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

    <!-- 服务类型选择弹层：卡片式列表，分组顺序为「自定义服务」→「在线服务」→「本地服务」 -->
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
                :key="provider.id"
                button
                :detail="false"
                @click="selectType(provider)"
              >
                <span class="provider-icon" slot="start" aria-hidden="true"><component :is="provider.icon" /></span>
                <ion-label class="ion-text-wrap">
                  <h3>{{ provider.label }}</h3>
                  <p>{{ provider.description }}</p>
                </ion-label>
                <ion-icon
                  v-if="selectedChoiceId === provider.id"
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
import { ref, computed, onMounted, type Component } from 'vue'
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
  hardwareChipOutline,
  extensionPuzzleOutline
} from 'ionicons/icons'
import {
  Api, Atom, BrandGoogle, BrandOpenSource, BrandWindows, Circles, Cloud, DeviceDesktop,
  LetterA, LetterD, LetterM, LetterT, LetterZ, Route
} from '@vicons/tabler'
import { useI18n } from '~/composables/useI18n'
import { useAIConfigForm } from '~/composables/useAIConfigForm'
import { api } from '~/lib/api'
import { presentMobileToast } from '~/lib/utils/mobile-toast'
import { getDefaultBaseURL } from '@shared/ai-provider-metadata'
import type { AIConfig, AIProviderType } from '@shared/types'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

// 使用 composable。needsBaseURL / getBaseURLInfo / getApiKeyInfo 在组合式函数里只按
// AIProviderType 判断，无法识别本页新增的「自定义服务」卡片（type 仍是 openai/anthropic，
// 但需要不同的字段展示逻辑），因此这里取原始值并在下方结合 isCustomSelected 派生出
// 同名的、感知自定义状态的版本，其余用法不变。
const {
  formData,
  needsBaseURL: baseNeedsBaseURL,
  needsApiKey,
  handleTypeChange,
  getApiKeyLabel,
  getBaseURLInfo: baseGetBaseURLInfo,
  getApiKeyInfo: baseGetApiKeyInfo,
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

// 计算属性：当前选中服务商信息。自定义服务的名称/描述来自选中的卡片本身（复用兼容服务的
// 文案），而不是按 type（openai/anthropic）取通用服务商介绍。
const getServiceInfo = computed(() => isCustomSelected.value
  ? { name: selectedProviderChoice.value.label, description: selectedProviderChoice.value.description }
  : getServiceInfoByType(formData.type))

// 服务类型选择弹层：三个分组，顺序严格按 issue #58 原文——
// 1. 自定义服务（最前）：OpenAI 兼容服务 / Claude 兼容服务，参照桌面端 AIConfigPage.vue
//    的 compatibilityProviderChoices 实现——type 仍是 openai/anthropic，仅加 custom
//    标记、baseURL 留空，不引入新的 AIProviderType 或数据模型改动。
// 2. 在线服务（第二）
// 3. 本地服务（最后）：手机连接本地模型不方便，不适合作为默认优先项。
// 注意：这个顺序是 issue 原文的三条需求本身要求的顺序，与桌面端当前实现顺序
// （本地→在线→自定义）不同——「和桌面端保持一致」指的是复用桌面端已有的自定义服务
// 功能，不是照抄桌面端现状的分组顺序。
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

// Reuse the established provider marks from the desktop provider picker. These
// are vector icons, so they stay crisp inside the circular mobile affordance.
const providerIcons: Record<AIProviderType, Component> = {
  openai: Atom,
  ollama: BrandOpenSource,
  anthropic: LetterA,
  google: BrandGoogle,
  azure: BrandWindows,
  lmstudio: DeviceDesktop,
  deepseek: LetterD,
  mistral: LetterM,
  siliconflow: Circles,
  tencent: LetterT,
  aliyun: Cloud,
  zhipu: LetterZ,
  openrouter: Route
}

interface ProviderCardChoice {
  id: string
  type: AIProviderType
  label: string
  description: string
  initial: string
  icon: Component
  custom?: boolean
  placeholder?: string
}

const buildProviderChoice = (type: AIProviderType): ProviderCardChoice => {
  const info = getServiceInfoByType(type)
  return {
    id: `official:${type}`,
    type,
    label: info.name,
    description: info.description,
    initial: providerInitials[type],
    icon: providerIcons[type]
  }
}

// 自定义服务分组：复用桌面端 AIConfigPage.vue 的 custom:openai / custom:claude 概念
// （type 仍是 'openai' / 'anthropic'，只是加 custom 标记 + 空 baseURL），共用同一套
// i18n 文案（aiConfig.workspace.customOpenAI* / customClaude*），不新增翻译 key。
const compatibilityChoices = computed<ProviderCardChoice[]>(() => [
  {
    id: 'custom:openai',
    type: 'openai',
    label: t('aiConfig.workspace.customOpenAI'),
    description: t('aiConfig.workspace.customOpenAIDesc'),
    initial: providerInitials.openai,
    icon: Api,
    custom: true,
    placeholder: 'https://your-provider.example/v1'
  },
  {
    id: 'custom:claude',
    type: 'anthropic',
    label: t('aiConfig.workspace.customClaude'),
    description: t('aiConfig.workspace.customClaudeDesc'),
    initial: providerInitials.anthropic,
    icon: LetterA,
    custom: true,
    placeholder: 'https://your-provider.example'
  }
])

const typeGroups = computed(() => [
  {
    key: 'custom',
    label: t('aiConfig.workspace.customServices'),
    icon: extensionPuzzleOutline,
    providers: compatibilityChoices.value
  },
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

// 当前选中的卡片 id（official:xxx / custom:openai / custom:claude）。
// 因为自定义服务和官方服务可能共用同一个 AIProviderType（如 custom:openai 与
// official:openai 都是 type:'openai'），仅凭 formData.type 无法区分选中的是哪张卡片，
// 需要单独的 id 状态。
const selectedChoiceId = ref('custom:openai')
const allProviderChoices = computed(() => typeGroups.value.flatMap(group => group.providers))
const selectedProviderChoice = computed(() =>
  allProviderChoices.value.find(choice => choice.id === selectedChoiceId.value)
  || buildProviderChoice(formData.type)
)
const isCustomSelected = computed(() => Boolean(selectedProviderChoice.value.custom))

// needsBaseURL / canTestConnection / getBaseURLInfo / getApiKeyInfo：在组合式函数原始值
// 基础上叠加「自定义服务」的差异化展示逻辑（参照桌面端 isCustomProviderChoice 的处理）：
// - 自定义 Claude 兼容服务的 type 是 anthropic，但和普通 Anthropic 不同，必须填 Base URL；
// - Base URL 标签/占位符改为「兼容服务地址」+ 具体协议示例，不使用官方默认地址自动填充；
// - 自定义服务没有已知的获取 Key / 文档链接，不展示这两个按钮。
const needsBaseURL = computed(() => isCustomSelected.value || baseNeedsBaseURL.value)
const canTestConnection = computed(() => (
  (!needsApiKey.value || Boolean(formData.apiKey.trim()))
  && (!needsBaseURL.value || Boolean(formData.baseURL.trim()))
))
const getBaseURLInfo = computed(() => isCustomSelected.value
  ? {
      label: t('aiConfig.workspace.customServiceEndpoint'),
      placeholder: selectedProviderChoice.value.placeholder || t('aiConfig.useOfficialEndpoint')
    }
  : baseGetBaseURLInfo.value)
const getApiKeyInfo = computed(() => isCustomSelected.value
  ? { apiKeyUrl: '', docUrl: '' }
  : baseGetApiKeyInfo.value)

const selectType = (choice: ProviderCardChoice) => {
  const isSame = selectedChoiceId.value === choice.id
  selectedChoiceId.value = choice.id
  if (!isSame) {
    formData.type = choice.type
    onTypeChange()
    if (choice.custom) {
      // 自定义服务：Base URL 必须留空让用户自己填，不能沿用 handleTypeChange 按
      // type 自动填充的官方默认地址；配置名称同样只在新建模式下才自动带入卡片标题。
      formData.baseURL = ''
      if (!isEditMode.value) {
        formData.name = choice.label
      }
    }
  }
  showTypeModal.value = false
}

// 判断已保存的配置是否为「自定义服务」：与桌面端 AIConfigPage.vue 的 isCustomConfig
// 判断逻辑一致——openai 类型但 baseURL 不是官方默认地址，或 anthropic 类型但填了
// baseURL（官方 Anthropic 不需要 baseURL），即视为自定义。
const normalizeURL = (value?: string) => (value || '').trim().replace(/\/+$/, '')
const isCustomConfig = (config: AIConfig) => (
  config.type === 'openai' && normalizeURL(config.baseURL) !== normalizeURL(getDefaultBaseURL('openai'))
) || (
  config.type === 'anthropic' && Boolean(normalizeURL(config.baseURL))
)

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
      selectedChoiceId.value = isCustomConfig(config)
        ? (config.type === 'anthropic' ? 'custom:claude' : 'custom:openai')
        : `official:${config.type}`
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
const initializeNewConfig = () => {
  if (isEditMode.value) return

  // The default card is the OpenAI-compatible service. Keep the form data in
  // sync with that card so the first render can be tested or saved directly.
  resetForm()
  const defaultChoice = compatibilityChoices.value[0]
  selectedChoiceId.value = defaultChoice.id
  formData.type = defaultChoice.type
  formData.name = defaultChoice.label
  formData.baseURL = ''
}

onMounted(() => {
  loadConfig()
  initializeNewConfig()
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

.base-url-hint {
  color: var(--ion-color-medium);
  font-size: var(--mobile-font-size-footnote);
  line-height: var(--mobile-line-height-normal);
  margin: 0 16px 8px;
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

/* 服务商头像：复用桌面端矢量标识，统一放入圆形边框避免图标错位 */
.provider-icon {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1px solid var(--border-default);
  background: var(--surface-secondary);
  color: var(--content-secondary);
}

.provider-icon :deep(svg) {
  width: 16px;
  height: 16px;
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
