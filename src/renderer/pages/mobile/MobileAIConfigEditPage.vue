<template>
  <ion-page>
    <MobileNavBar :title="isEditMode ? t('aiConfig.editConfig') : t('aiConfig.addConfig')" leading="none" solid>
      <template #start>
        <button type="button" class="m-btn edit-nav__cancel" @click="handleCancel">{{ t('common.cancel') }}</button>
      </template>
      <template #end>
        <button type="button" class="m-save" :disabled="saving" @click="handleSave">{{ t('common.save') }}</button>
      </template>
    </MobileNavBar>

    <ion-content class="m-page-content">
      <div class="m-body edit-body">
        <!-- 服务类型：常用三项 + 「全部」，全部服务商在底部面板里按 自定义 → 在线 → 本地 分组
             （issue #58：手机连接本地模型不方便，本地服务排最后） -->
        <section class="m-section">
          <div class="m-gt"><span>{{ t('aiConfig.serviceType') }}</span></div>
          <div class="edit-providers">
            <ProviderChoiceButton v-for="choice in quickChoices" :key="choice.id" :visual="getChoiceVisual(choice)"
              :label="choice.label" :selected="choice.id === selectedChoiceId" @select="selectType(choice)" />
            <ProviderChoiceButton :visual="moreVisual"
              :label="t('mobileModels.allProviders', { count: availableChoiceCount })"
              @select="showTypeModal = true" />
          </div>
          <!-- 从桌面端同步来的 Ollama / LM Studio / Azure 配置：可以编辑，但移动端的 AI 功能用不了 -->
          <p v-if="desktopOnlySelected" class="m-note service-description">
            <ion-icon :icon="desktopOutline" aria-hidden="true" />
            <span>{{ t('mobileModels.desktopOnlyConfigNote') }}</span>
          </p>
          <!-- 服务说明：前面加信息图标，和上方的服务商宫格区分开（issue #145） -->
          <p v-if="getServiceInfo.description" class="m-note service-description">
            <ion-icon :icon="informationCircleOutline" aria-hidden="true" />
            <span>{{ getServiceInfo.description }}</span>
          </p>
        </section>

        <!-- 连接：每个字段标签单独一行、输入框占满下一行，长地址不会被挤短（issue #145） -->
        <section class="m-section">
          <div class="m-gt"><span>{{ t('aiConfig.workspace.connectionSection') }}</span></div>
          <div class="m-group">
            <label class="m-field">
              <span>{{ t('aiConfig.configName') }}</span>
              <input v-model="formData.name" :placeholder="t('aiConfig.pleaseEnterConfigName')" autocomplete="off"
                required>
            </label>

            <div v-if="needsApiKey" class="m-field">
              <label for="ai-config-api-key">{{ t('mobileModels.apiKey') }}</label>
              <div class="edit-secret">
                <input id="ai-config-api-key" v-model="formData.apiKey" :type="showApiKey ? 'text' : 'password'"
                  :placeholder="t('aiConfig.workspace.apiKeyPlaceholder')" autocomplete="off" autocapitalize="off"
                  spellcheck="false">
                <button type="button" class="edit-secret__toggle"
                  :aria-label="showApiKey ? t('mobileModels.hideSecret') : t('mobileModels.showSecret')"
                  @click="showApiKey = !showApiKey">
                  <ion-icon :icon="showApiKey ? eyeOffOutline : eyeOutline" />
                </button>
              </div>
            </div>

            <label v-if="needsBaseURL" class="m-field">
              <span>{{ getBaseURLInfo.label }}</span>
              <input v-model="formData.baseURL" type="url" inputmode="url" :placeholder="getBaseURLInfo.placeholder"
                autocomplete="off" autocapitalize="off" spellcheck="false">
            </label>
          </div>

          <p v-if="formData.type === 'openai' && !isCustomSelected" class="m-note base-url-hint">
            {{ t('aiConfig.openaiBaseURLHint') }}
          </p>

          <div v-if="getApiKeyInfo.apiKeyUrl || getApiKeyInfo.docUrl" class="edit-links">
            <button v-if="getApiKeyInfo.apiKeyUrl" type="button" @click="openUrl(getApiKeyInfo.apiKeyUrl)">
              <ion-icon :icon="keyOutline" aria-hidden="true" />
              {{ t('aiConfig.getApiKey') }}
            </button>
            <button v-if="getApiKeyInfo.docUrl" type="button" @click="openUrl(getApiKeyInfo.docUrl)">
              <ion-icon :icon="documentTextOutline" aria-hidden="true" />
              {{ t('aiConfig.viewDocumentation') }}
            </button>
          </div>
        </section>

        <!-- 模型：轻点设为默认模型；「编辑」后轻点移除 -->
        <section class="m-section">
          <div class="m-gt">
            <span class="edit-models__title">
              {{ t('models.modelsPanel') }}
              <small v-if="formData.models.length > 0">
                {{ t('aiConfig.workspace.modelCount', { count: formData.models.length }) }}
              </small>
            </span>
            <button v-if="formData.models.length > 0" type="button" @click="editingModels = !editingModels">
              {{ editingModels ? t('mobileModels.done') : t('common.edit') }}
            </button>
          </div>

          <div class="edit-models" :class="{ 'is-editing': editingModels }">
            <button v-for="(model, index) in formData.models" :key="`${model}-${index}`" type="button"
              class="m-chip edit-model" :class="{ on: !editingModels && model === formData.defaultModel }"
              :aria-pressed="!editingModels && model === formData.defaultModel"
              :aria-label="editingModels ? `${t('common.delete')} ${model}` : model"
              @click="handleModelChip(model, index)">
              <ion-icon v-if="editingModels" :icon="closeCircle" aria-hidden="true" />
              <ion-icon v-else-if="model === formData.defaultModel" :icon="checkmark" aria-hidden="true" />
              <span>{{ model }}</span>
            </button>
            <button v-if="!editingModels" type="button" class="m-chip edit-model edit-model--add"
              @click="showAddModelAlert">
              <ion-icon :icon="add" aria-hidden="true" />
              {{ t('aiConfig.addModel') }}
            </button>
          </div>

          <!-- 和桌面向导一致，只保留「添加模型」一种方式：旧的「自定义模型」打开时已并进上面的列表 -->
          <p class="m-note edit-models__note">
            {{ formData.models.length > 0 ? t('mobileModels.modelChipHint') : t('mobileModels.modelsEmptyHint') }}
          </p>
        </section>

        <!-- 测试连接：次级按钮（白底卡片），不是整条主色块按钮（issue #145） -->
        <button type="button" class="m-cta m-cta-2 edit-test" :disabled="testingConnection || !canTestConnection"
          @click="handleTestConnection">
          <ion-spinner v-if="testingConnection" name="crescent" />
          <ion-icon v-else :icon="flashOutline" aria-hidden="true" />
          {{ t('aiConfig.testConnection') }}
        </button>

        <!-- 测试结果：失败时给出原因和处理办法，原始信息收在详情里 -->
        <div v-if="testResult" class="m-card edit-test-result" role="status">
          <span class="m-tile" :class="testResult.success ? 'm-tile--success' : 'm-tile--error'" aria-hidden="true">
            <ion-icon :icon="testResult.success ? checkmarkCircle : closeCircle" />
          </span>
          <MobileAIErrorNote v-if="testResult.error" class="edit-test-result__error" :error="testResult.error" />
          <p v-else>{{ testResult.message }}</p>
        </div>
      </div>
    </ion-content>

    <ProviderPickerSheet :open="showTypeModal" :groups="groups" :selected-id="selectedChoiceId" :note="desktopOnlyNote"
      @close="showTypeModal = false" @select="selectType" />
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  IonPage,
  IonContent,
  IonIcon,
  IonSpinner,
  alertController,
  useBackButton
} from '@ionic/vue'
import {
  add,
  checkmark,
  checkmarkCircle,
  closeCircle,
  desktopOutline,
  documentTextOutline,
  ellipsisHorizontal,
  eyeOffOutline,
  eyeOutline,
  flashOutline,
  informationCircleOutline,
  keyOutline
} from 'ionicons/icons'
import { useI18n } from '~/composables/useI18n'
import { useAIConfigForm } from '~/composables/useAIConfigForm'
import { api } from '~/lib/api'
import { mergeLegacyCustomModel, shouldPreferNewConfig } from '~/lib/utils/ai-config-models'
import { presentMobileToast } from '~/lib/utils/mobile-toast'
import type { AIConfig } from '@shared/types'
import MobileNavBar from '~/components/mobile/ui/MobileNavBar.vue'
import ProviderChoiceButton from '~/components/mobile/models/ProviderChoiceButton.vue'
import ProviderPickerSheet from '~/components/mobile/models/ProviderPickerSheet.vue'
import {
  getChoiceVisual,
  useMobileProviderCatalog,
  type ProviderChoice,
  type ProviderVisual
} from '~/components/mobile/models/provider-catalog'
import { rememberConnectionStatus, type ConnectionStatus } from '~/components/mobile/models/connection-status'
import { describeMobileAIError, isMobileSupportedProvider, type MobileAIErrorView } from '~/components/mobile/prompt/mobile-ai'
import MobileAIErrorNote from '~/components/mobile/prompt/MobileAIErrorNote.vue'
import { confirmAlert } from '~/components/mobile/models/useConfigActions'
import { useSwipeBackGuard } from '~/components/mobile/useSwipeBackGuard'

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()

// 使用 composable。needsBaseURL / getBaseURLInfo / getApiKeyInfo 在组合式函数里只按
// AIProviderType 判断，无法识别「自定义服务」和预设服务（type 仍是 openai/anthropic，
// 但需要不同的字段展示逻辑），因此这里取原始值并在下方结合 isCustomSelected 派生出
// 同名的、感知自定义状态的版本，其余用法不变。
const {
  formData,
  needsBaseURL: baseNeedsBaseURL,
  needsApiKey,
  handleTypeChange,
  getBaseURLInfo: baseGetBaseURLInfo,
  getApiKeyInfo: baseGetApiKeyInfo,
  resetForm
} = useAIConfigForm()

// 服务商目录与桌面端共用（在线 / 本地 / 自定义，含 Groq、Moonshot 等预设）
const {
  groups,
  availableChoiceCount,
  desktopOnlyNames,
  compatibilityProviderChoices,
  featuredChoices,
  findChoice,
  officialChoiceFor,
  resolveProviderChoiceId
} = useMobileProviderCatalog()

// 状态
const saving = ref(false)
const testingConnection = ref(false)
const showApiKey = ref(false)
const editingModels = ref(false)
const showTypeModal = ref(false)
// 编辑时保留原来的启用状态，保存不会把已禁用的配置悄悄打开
const loadedEnabled = ref(true)
const testResult = ref<{
  success: boolean
  message: string
  error?: MobileAIErrorView
  models?: string[]
  modelSource?: 'remote' | 'default' | 'unavailable'
} | null>(null)
// 最近一次测试时的连接信息和结果：保存时连接信息没变，就把结果记到这个配置上（模型页直接显示）
let lastTest: { key: string; status: ConnectionStatus } | null = null
const connectionKey = () => JSON.stringify([formData.type, formData.baseURL.trim(), formData.apiKey.trim()])

// 判断是否为编辑模式
const isEditMode = computed(() => !!route.params.id)

// 当前选中的服务商 id（official:xxx / preset:xxx / custom:openai / custom:claude）。
// 自定义服务、预设服务和官方服务可能共用同一个 AIProviderType（如 custom:openai 与
// official:openai 都是 type:'openai'），仅凭 formData.type 无法区分选中的是哪一项，
// 需要单独的 id 状态。
const selectedChoiceId = ref('custom:openai')
const selectedProviderChoice = computed(() => findChoice(selectedChoiceId.value)
  || officialChoiceFor(formData.type)
  || compatibilityProviderChoices.value[0])
const isCustomSelected = computed(() => Boolean(selectedProviderChoice.value.custom))

const quickChoices = computed(() => featuredChoices(selectedChoiceId.value))
const desktopOnlySelected = computed(() => !isMobileSupportedProvider(formData.type))

const formatNames = (names: string[]) => {
  try {
    return new Intl.ListFormat(locale.value, { type: 'conjunction' }).format(names)
  } catch {
    return names.join(', ')
  }
}
const desktopOnlyNote = computed(() => desktopOnlyNames.value.length
  ? t('mobileModels.desktopOnlyProviders', { names: formatNames(desktopOnlyNames.value) })
  : '')

// 自定义兼容服务的地址字段叫「兼容服务地址」，漏填时的提示用同一个叫法
const baseURLRequiredMessage = () => isCustomSelected.value
  ? t('mobileModels.enterServiceEndpoint')
  : t('aiConfig.pleaseEnterBaseURL')
const moreVisual: ProviderVisual = { initial: '', tone: 'grey', icon: ellipsisHorizontal }

// 当前选中服务商的名称和说明（自定义/预设服务的说明来自选项本身）
const getServiceInfo = computed(() => ({
  name: selectedProviderChoice.value.label,
  description: selectedProviderChoice.value.description
}))

// needsBaseURL / canTestConnection / getBaseURLInfo / getApiKeyInfo：在组合式函数原始值
// 基础上叠加「自定义服务」的差异化展示逻辑（参照桌面端的处理）：
// - 自定义 Claude 兼容服务的 type 是 anthropic，但和普通 Anthropic 不同，必须填 Base URL；
// - Base URL 标签改为「兼容服务地址」+ 具体协议示例，不使用官方默认地址自动填充；
// - 自定义兼容服务没有已知的获取 Key / 文档链接，预设服务用预设自带的链接。
const needsBaseURL = computed(() => isCustomSelected.value || baseNeedsBaseURL.value)
const canTestConnection = computed(() => (
  (!needsApiKey.value || Boolean(formData.apiKey.trim()))
  && (!needsBaseURL.value || Boolean(formData.baseURL.trim()))
))
const getBaseURLInfo = computed(() => isCustomSelected.value
  ? {
      label: t('aiConfig.workspace.customServiceEndpoint'),
      placeholder: selectedProviderChoice.value.placeholder
        || selectedProviderChoice.value.baseURL
        || t('aiConfig.useOfficialEndpoint')
    }
  : { label: t('aiConfig.baseURL'), placeholder: baseGetBaseURLInfo.value.placeholder })
const getApiKeyInfo = computed(() => isCustomSelected.value
  ? {
      apiKeyUrl: selectedProviderChoice.value.apiKeyUrl || '',
      docUrl: selectedProviderChoice.value.docUrl || ''
    }
  : baseGetApiKeyInfo.value)

const selectType = (choice: ProviderChoice) => {
  const isSame = selectedChoiceId.value === choice.id
  selectedChoiceId.value = choice.id
  if (!isSame) {
    formData.type = choice.type
    onTypeChange()
    if (choice.custom) {
      // 自定义服务：Base URL 留空让用户自己填（预设服务带入预设地址），不能沿用
      // handleTypeChange 按 type 自动填充的官方默认地址；配置名称只在新建模式下带入。
      formData.baseURL = choice.baseURL || ''
      if (!isEditMode.value) {
        formData.name = choice.defaultName || choice.label
      }
    }
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
      // 旧数据里的「自定义模型」并进可用模型列表；没有默认模型时它就是默认模型（与桌面向导一致）
      const { models, defaultModel } = mergeLegacyCustomModel(config)
      formData.models = models
      formData.defaultModel = defaultModel
      loadedEnabled.value = config.enabled
      // 与桌面端判断一致：预设地址 → 预设；openai 非官方地址或 anthropic 填了地址 → 自定义
      selectedChoiceId.value = resolveProviderChoiceId(config)
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
  editingModels.value = false
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
    showToast(baseURLRequiredMessage(), 'warning')
    return
  }
  if (needsApiKey.value && !formData.apiKey) {
    showToast(t('aiConfig.pleaseEnterAPIKey'), 'warning')
    return
  }

  testingConnection.value = true
  testResult.value = null
  const key = connectionKey()
  const started = performance.now()

  try {
    // 使用统一的 API 调用（会自动根据平台选择实现）
    const result = await api.aiConfigs.test.mutate({
      type: formData.type,
      baseURL: formData.baseURL,
      apiKey: formData.apiKey
    })

    lastTest = {
      key,
      status: result.success
        ? { state: 'ok', elapsed: Math.round(performance.now() - started) }
        : { state: 'error', error: result.error }
    }

    if (result.success) {
      const resultMessage = getModelListDisplayMessage(result)

      // 如果获取到模型，自动填充
      if (result.models && result.models.length > 0) {
        // 已选的默认模型（包括并进来的旧「自定义模型」）服务没返回时也留在列表里，和桌面向导一致
        formData.models = formData.defaultModel && !result.models.includes(formData.defaultModel)
          ? [formData.defaultModel, ...result.models]
          : result.models
        editingModels.value = false

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
      // 按错误类别给出说明，原始信息收进详情
      const errorMessage = result.error || t('aiConfig.connectionTestFailed')
      testResult.value = {
        success: false,
        message: errorMessage,
        error: describeMobileAIError(errorMessage, t)
      }
      showToast(t('mobileModels.connectionFailedShort'), 'danger')
    }
  } catch (error) {
    console.error('[Page] 测试连接失败:', error)
    const errorMessage = (error as Error).message || t('aiConfig.testFailed')
    lastTest = { key, status: { state: 'error', error: errorMessage } }
    testResult.value = {
      success: false,
      message: errorMessage,
      error: describeMobileAIError(error, t)
    }
    showToast(t('mobileModels.connectionFailedShort'), 'danger')
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
          const modelName = data.modelName?.trim()
          if (modelName && !formData.models.includes(modelName)) {
            formData.models.push(modelName)
            if (!formData.defaultModel) {
              formData.defaultModel = modelName
            }
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
  // 删掉的是默认模型时改用列表第一个，和桌面向导一致
  if (formData.defaultModel === removedModel) {
    formData.defaultModel = formData.models[0] || ''
  }
  if (formData.models.length === 0) {
    editingModels.value = false
  }
}

// 模型芯片：平时轻点设为默认模型，编辑状态下轻点移除
const handleModelChip = (model: string, index: number) => {
  if (editingModels.value) {
    removeModel(index)
    return
  }
  formData.defaultModel = model
}

// 打开URL
const openUrl = (url: string) => {
  window.open(url, '_blank')
}

// 未保存修改检测：加载完成后记一份快照，取消/返回时对比
const snapshot = ref('')
const serializeForm = () => JSON.stringify({
  ...formData,
  models: [...formData.models],
  choice: selectedChoiceId.value
})
const takeSnapshot = () => {
  snapshot.value = serializeForm()
}
const isDirty = computed(() => snapshot.value !== '' && serializeForm() !== snapshot.value)

const leavePage = () => {
  if (window.history.length > 1) router.back()
  else router.replace('/tabs/ai-config')
}

// 取消 / 系统返回：有改动先确认
const handleCancel = async () => {
  if (saving.value) return
  if (isDirty.value) {
    const discard = await confirmAlert({
      header: t('aiConfig.workspace.unsavedChanges'),
      message: t('aiConfig.workspace.unsavedEditorMessage'),
      confirmText: t('aiConfig.workspace.discardChanges'),
      cancelText: t('aiConfig.workspace.continueEditing'),
      destructive: true
    })
    if (!discard) return
  }
  leavePage()
}

useBackButton(10, () => {
  handleCancel()
})

// iOS 边缘右滑返回：有未保存的修改时关闭，只能点取消走确认
useSwipeBackGuard(isDirty)

// 保存配置
const handleSave = async () => {
  // 验证必填字段
  if (!formData.name) {
    showToast(t('aiConfig.pleaseEnterConfigName'), 'warning')
    return
  }
  if (needsBaseURL.value && !formData.baseURL) {
    showToast(baseURLRequiredMessage(), 'warning')
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

    const configData: Partial<AIConfig> = {
      type: formData.type,
      name: formData.name,
      baseURL: formData.baseURL,
      apiKey: formData.apiKey,
      models: formData.models,
      defaultModel: formData.defaultModel,
      // 「自定义模型」已经并进可用模型列表，这里清掉旧字段，免得删掉的模型还从它冒出来
      customModel: '',
      enabled: isEditMode.value ? loadedEnabled.value : true
    }

    let savedId: number | undefined
    if (isEditMode.value) {
      savedId = Number(route.params.id)
      await api.aiConfigs.update.mutate({
        id: savedId,
        data: configData as AIConfig
      })
      showToast(t('aiConfig.configUpdateSuccess'))
    } else {
      // 新建时必须生成 configId，否则生成器页面无法通过 configId 查找配置
      configData.configId = `config_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
      // 还没有别的启用配置时，新加的这个就是 AI 功能实际在用的，直接设为首选（与桌面向导一致）
      const preferNew = shouldPreferNewConfig(await api.aiConfigs.getAll.query())
      const created = await api.aiConfigs.create.mutate(configData as AIConfig)
      savedId = created?.id
      if (preferNew && savedId) await api.aiConfigs.setPreferred.mutate(savedId)
      showToast(t('aiConfig.configAddSuccess'))
    }
    // 保存的正是刚测试过的连接信息：把测试结果记到这个配置上，模型页如实显示「可用」或「连接失败」。
    // 改过地址或凭据又没重新测试时，旧结果的指纹对不上，会自动变回「未验证」
    if (lastTest && lastTest.key === connectionKey()) {
      rememberConnectionStatus({ id: savedId, type: formData.type, baseURL: formData.baseURL, apiKey: formData.apiKey }, lastTest.status)
    }

    takeSnapshot()
    leavePage()
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

  // The default choice is the OpenAI-compatible service. Keep the form data in
  // sync with that choice so the first render can be tested or saved directly.
  resetForm()
  const defaultChoice = compatibilityProviderChoices.value[0]
  selectedChoiceId.value = defaultChoice.id
  formData.type = defaultChoice.type
  formData.name = defaultChoice.label
  formData.baseURL = ''
}

onMounted(() => {
  initializeNewConfig()
  loadConfig().finally(takeSnapshot)
})
</script>

<style scoped>
.edit-nav__cancel {
  color: var(--content-secondary);
}

.edit-body {
  gap: 18px;
}

/* 服务商宫格：一行四格 */
.edit-providers {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.service-description {
  padding-top: 10px;
}

.base-url-hint {
  padding-top: 8px;
}

/* API Key 输入框右侧的显示/隐藏按钮 */
.edit-secret {
  display: flex;
  align-items: center;
  gap: 8px;
}

.edit-secret input {
  flex: 1;
}

.edit-secret__toggle {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 32px;
  margin-right: -12px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--content-tertiary);
  font-size: 18px;
  cursor: pointer;
}

.edit-links {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  padding: 6px 6px 0;
}

.edit-links button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--accent-primary);
  font: inherit;
  font-size: var(--m-font-sub);
  font-weight: 600;
  cursor: pointer;
}

.edit-links ion-icon {
  font-size: 16px;
}

.edit-models__title {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
}

.edit-models__title small {
  color: var(--content-tertiary);
  font-size: var(--m-font-caption);
  font-weight: 500;
}

/* 模型芯片：等宽字体，默认模型实心主色 */
.edit-models {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.edit-model {
  max-width: 100%;
  font-family: var(--font-family-mono);
  font-size: var(--m-font-caption);
}

.edit-model span {
  overflow: hidden;
  text-overflow: ellipsis;
}

.edit-model ion-icon {
  flex: none;
  font-size: 14px;
}

.edit-models.is-editing .edit-model ion-icon {
  color: var(--accent-error);
  font-size: 16px;
}

.edit-model--add {
  outline: 1px dashed var(--border-strong);
  outline-offset: -1px;
  background: transparent;
  box-shadow: none;
  font-family: inherit;
}

.edit-models__note {
  padding-top: 8px;
}

.edit-test ion-icon {
  font-size: 18px;
}

.edit-test ion-spinner {
  width: 18px;
  height: 18px;
}

.edit-test-result {
  flex-direction: row;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
}

.edit-test-result p {
  flex: 1;
  margin: 4px 0 0;
  color: var(--content-secondary);
  font-size: var(--m-font-sub);
  line-height: 1.6;
  word-break: break-word;
}

.edit-test-result__error {
  flex: 1;
  min-width: 0;
  margin-top: 4px;
}
</style>
