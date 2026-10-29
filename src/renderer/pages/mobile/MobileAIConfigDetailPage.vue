<template>
  <ion-page>
    <MobileNavBar fallback="/tabs/ai-config">
      <template #end>
        <button type="button" class="m-btn detail-nav__edit" :disabled="!config" @click="handleEdit">
          {{ t('common.edit') }}
        </button>
      </template>
    </MobileNavBar>

    <ion-content class="m-page-content">
      <!-- 下拉刷新 -->
      <ion-refresher slot="fixed" @ionRefresh="handleRefresh">
        <ion-refresher-content></ion-refresher-content>
      </ion-refresher>

      <!-- 加载状态 -->
      <div v-if="loading" class="detail-state">
        <ion-spinner name="crescent" />
      </div>

      <div v-else-if="config" class="m-body detail-body">
        <!-- 头部：服务商方块 + 名称 + 状态标记 -->
        <div class="detail-head">
          <ProviderTile :visual="visual" size="md" :variant="config.enabled ? 'soft' : 'muted'" />
          <div class="detail-head__text">
            <h1 class="detail-head__name">{{ config.name }}</h1>
            <span class="detail-head__provider">{{ providerLabel }}</span>
            <div class="detail-head__pills">
              <span class="m-pill" :class="statusPill.tone">
                <span v-if="statusPill.dot" class="detail-dot" :class="`detail-dot--${statusPill.dot}`" aria-hidden="true" />
                {{ statusPill.label }}
              </span>
              <span v-if="config.isPreferred" class="m-pill m-pill-blue">
                <ion-icon :icon="star" aria-hidden="true" />
                {{ t('aiConfig.globalPreferred') }}
              </span>
            </div>
          </div>
        </div>

        <!-- Ollama、LM Studio、Azure 只能在桌面版使用：说明原因，移动端的 AI 功能不会选到它 -->
        <p v-if="desktopOnly" class="m-note detail-note">
          <ion-icon :icon="desktopOutline" aria-hidden="true" />
          <span>{{ t('mobileModels.desktopOnlyConfigNote') }}</span>
        </p>

        <!-- API Key 不随同步传输：另一台设备同步过来的配置要在这台设备上补填 (#491) -->
        <p v-else-if="credentialMissing" class="m-note detail-note">
          <ion-icon :icon="keyOutline" aria-hidden="true" />
          <span>{{ t('models.credentialNotSynced') }}</span>
        </p>

        <!-- 启用 / 全局首选 -->
        <MobileGroup>
          <MobileRow static :title="t('aiConfig.enabled')" :icon="powerOutline" tone="green">
            <template #end>
              <ion-toggle :checked="config.enabled" :aria-label="t('aiConfig.enabled')"
                @ionChange="handleToggleEnabled" />
            </template>
          </MobileRow>
          <MobileRow static :title="t('aiConfig.setAsPreferred')" :icon="star" tone="blue">
            <template #end>
              <ion-toggle :checked="!!config.isPreferred" :disabled="!config.enabled"
                :aria-label="t('aiConfig.setAsPreferred')" @ionChange="handleTogglePreferred" />
            </template>
          </MobileRow>
        </MobileGroup>

        <!-- 连接 -->
        <MobileGroup :title="t('aiConfig.workspace.connectionSection')" :footer="createdAtText">
          <MobileRow :title="t('aiConfig.defaultModel')" :icon="cubeOutline" tone="blue" :show-chevron="true"
            @click="showModelPicker = true">
            <template #end>
              <span class="detail-mono">{{ currentModel || t('aiConfig.workspace.noDefaultModel') }}</span>
            </template>
          </MobileRow>
          <MobileRow static :title="t('aiConfig.baseURL')" :icon="linkOutline" tone="teal"
            :value="config.baseURL || t('aiConfig.workspace.officialEndpoint')" />
          <MobileRow static :title="t('mobileModels.apiKey')" :icon="keyOutline" tone="pink">
            <template #end>
              <span :class="{ 'detail-mono': config.apiKey }">{{ apiKeyText }}</span>
            </template>
          </MobileRow>
          <MobileRow :title="t('aiConfig.systemPrompt')" :icon="documentTextOutline" tone="violet"
            :value="config.systemPrompt ? t('aiConfig.systemPromptCustomized') : t('aiConfig.systemPromptDefault')"
            :show-chevron="true" @click="handleEditSystemPrompt" />
        </MobileGroup>

        <!-- 测试 -->
        <div class="detail-actions">
          <button type="button" class="m-cta m-cta-2 detail-actions__btn" :disabled="testingConnection"
            @click="handleTestConnection">
            <ion-spinner v-if="testingConnection" name="crescent" />
            <ion-icon v-else :icon="flashOutline" aria-hidden="true" />
            {{ t('aiConfig.testConnection') }}
          </button>
          <button type="button" class="m-cta m-cta-2 detail-actions__btn" :disabled="testingIntelligent"
            @click="handleIntelligentTest">
            <ion-spinner v-if="testingIntelligent" name="crescent" />
            <ion-icon v-else :icon="paperPlaneOutline" aria-hidden="true" />
            {{ t('aiConfig.requestTest') }}
          </button>
        </div>

        <!-- 测试失败：原因和处理办法，原始信息收在详情里 -->
        <div v-if="testFailure" class="m-card detail-failure">
          <MobileAIErrorNote :error="testFailure" />
        </div>

        <!-- 请求测试结果：发出的提示词和 AI 回复 -->
        <div v-if="requestResult" class="m-card detail-reply">
          <div class="detail-reply__meta">
            <span class="m-tile m-tile--success" aria-hidden="true"><ion-icon :icon="checkmark" /></span>
            <span>{{ t('models.replyMeta', { ms: requestResult.elapsed }) }}</span>
          </div>
          <p class="detail-reply__text">{{ requestResult.response }}</p>
          <p v-if="requestResult.inputPrompt" class="detail-reply__prompt">
            <strong>{{ t('models.requestPromptLabel') }}</strong>
            <span>{{ requestResult.inputPrompt }}</span>
          </p>
        </div>

        <button type="button" class="m-danger" @click="handleDelete">{{ t('mobileModels.deleteConfig') }}</button>
      </div>
    </ion-content>

    <ModelPickerSheet :open="showModelPicker" :models="modelOptions" :selected="currentModel"
      @close="showModelPicker = false" @select="handleSelectModel" @edit="handleEditFromPicker" />
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
  IonToggle,
  IonRefresher,
  IonRefresherContent,
  onIonViewWillEnter
} from '@ionic/vue'
import {
  checkmark,
  cubeOutline,
  desktopOutline,
  documentTextOutline,
  flashOutline,
  keyOutline,
  linkOutline,
  paperPlaneOutline,
  powerOutline,
  star
} from 'ionicons/icons'
import { useI18n } from '~/composables/useI18n'
import { api } from '~/lib/api'
import { presentMobileToast } from '~/lib/utils/mobile-toast'
import { formatFriendlyDate } from '~/lib/utils/date'
import type { AIConfig } from '@shared/types'
import MobileNavBar from '~/components/mobile/ui/MobileNavBar.vue'
import MobileGroup from '~/components/mobile/ui/MobileGroup.vue'
import MobileRow from '~/components/mobile/ui/MobileRow.vue'
import ProviderTile from '~/components/mobile/models/ProviderTile.vue'
import ModelPickerSheet from '~/components/mobile/models/ModelPickerSheet.vue'
import { useMobileProviderCatalog, isLocalProvider } from '~/components/mobile/models/provider-catalog'
import { connectionBadgeView, statusForConfig, testSavedConfigConnection } from '~/components/mobile/models/connection-status'
import MobileAIErrorNote from '~/components/mobile/prompt/MobileAIErrorNote.vue'
import {
  describeMobileAIError,
  describeMobileAIFailure,
  isMobileSupportedProvider,
  type MobileAIErrorView
} from '~/components/mobile/prompt/mobile-ai'
import { useConfigActions } from '~/components/mobile/models/useConfigActions'
import { isAIConfigCredentialMissing } from '@shared/ai-config-credentials'

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const { visualForConfig, getConfigDisplayLabel } = useMobileProviderCatalog()
const actions = useConfigActions()

// 状态
const config = ref<AIConfig | null>(null)
const loading = ref(true)
const testingIntelligent = ref(false)
const showModelPicker = ref(false)
const requestResult = ref<{ inputPrompt?: string; response?: string; elapsed: number } | null>(null)
// 最近一次测试连接 / 请求测试失败的原因
const testFailure = ref<MobileAIErrorView | null>(null)
let initialLoadPromise: Promise<void> | null = null

const visual = computed(() => visualForConfig(config.value!))
const providerLabel = computed(() => config.value ? getConfigDisplayLabel(config.value) : '')
const connectionStatus = computed(() => config.value ? statusForConfig(config.value) : undefined)
const testingConnection = computed(() => connectionStatus.value?.state === 'testing')
const desktopOnly = computed(() => Boolean(config.value && !isMobileSupportedProvider(config.value.type)))
const credentialMissing = computed(() => isAIConfigCredentialMissing(config.value))

// 头部状态：和模型列表、首选卡片同一套判断，测试成功时带上耗时
const statusPill = computed(() => connectionBadgeView(config.value!, t, { withElapsed: true }))

const currentModel = computed(() => config.value?.defaultModel || config.value?.customModel || '')

// 可选模型：已保存的模型列表，再加上手动填写的自定义模型
const modelOptions = computed(() => {
  const models = [...(config.value?.models || [])]
  const custom = config.value?.customModel?.trim()
  if (custom && !models.includes(custom)) models.push(custom)
  return models
})

const apiKeyText = computed(() => {
  const apiKey = config.value?.apiKey
  if (apiKey) return maskApiKey(apiKey)
  return config.value && isLocalProvider(config.value.type)
    ? t('aiConfig.workspace.notRequired')
    : t('aiConfig.workspace.notConfigured')
})

// 和其他页面一样用友好的日期格式，并跟随界面语言
const createdAtText = computed(() => config.value?.createdAt
  ? `${t('aiConfig.createdAt')} ${formatFriendlyDate(config.value.createdAt, locale.value, { withTime: true, capitalize: false })}`
  : '')

// 加载配置详情
const loadConfig = async (options: { showLoading?: boolean } = {}) => {
  const showLoading = options.showLoading ?? true
  if (showLoading) {
    loading.value = true
  }

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
    if (showLoading) {
      loading.value = false
    }
  }
}

// 下拉刷新
const handleRefresh = async (event: any) => {
  await loadConfig({ showLoading: false })
  event.target.complete()
}

// 切换启用状态（禁用首选配置前会先确认，取消时把开关拨回去）
const handleToggleEnabled = async (event: any) => {
  if (!config.value) return
  const enabled = event.detail.checked
  const changed = await actions.setEnabled(config.value, enabled)
  if (!changed) {
    event.target.checked = !enabled
  }
}

// 切换首选状态
const handleTogglePreferred = async (event: any) => {
  if (!config.value) return
  const preferred = event.detail.checked
  if (preferred === Boolean(config.value.isPreferred)) return

  const changed = preferred
    ? await actions.setPreferred(config.value)
    : await actions.clearPreferred()
  if (changed && !preferred) {
    config.value.isPreferred = false
  }
  if (!changed) {
    event.target.checked = !preferred
  }
}

// 选择默认模型
const handleSelectModel = async (model: string) => {
  showModelPicker.value = false
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
  if (!config.value) return
  router.push(`/ai-config/edit/${config.value.id}`)
}

// 模型面板里没有模型时，直接去编辑页获取
const handleEditFromPicker = () => {
  showModelPicker.value = false
  handleEdit()
}

// 编辑系统提示词
const handleEditSystemPrompt = () => {
  router.push(`/ai-config/${config.value?.id}/system-prompt`)
}

// 失败说明：有错误信息时按类别给出原因，没有时只说哪项测试失败了
const failureView = (fallback: string, error?: unknown): MobileAIErrorView => (error
  ? describeMobileAIError(error, t)
  : { kind: 'generic', summary: fallback, detail: '' })

// 测试连接：结果和耗时显示在头部状态里
const handleTestConnection = async () => {
  if (!config.value) return
  testFailure.value = null
  const status = await testSavedConfigConnection(config.value)
  if (status.state === 'ok') {
    showToast(t('aiConfig.connectionTestSuccess'))
  } else {
    testFailure.value = failureView(t('aiConfig.connectionTestFailed'), status.error)
    showToast(describeMobileAIFailure(t('mobileModels.connectionFailedShort'), status.error || '', t), 'danger')
  }
}

// 请求测试：发一条真实请求，在页面上展示回复和耗时
const handleIntelligentTest = async () => {
  if (!config.value) return

  testingIntelligent.value = true
  requestResult.value = null
  testFailure.value = null
  const started = performance.now()

  try {
    // 测试提示词跟随界面语言，和桌面端的请求测试是同一句
    const result = await api.aiConfigs.intelligentTest.mutate(config.value.id!, t('models.requestTestDefaultPrompt'))

    if (result.success) {
      requestResult.value = {
        inputPrompt: result.inputPrompt,
        response: result.response,
        elapsed: Math.round(performance.now() - started)
      }
      showToast(t('aiConfig.testSuccessTitle'))
    } else {
      testFailure.value = failureView(t('mobileModels.requestTestFailed'), result.error)
      showToast(describeMobileAIFailure(t('mobileModels.requestTestFailed'), result.error || '', t), 'danger')
    }
  } catch (error) {
    console.error('智能测试失败:', error)
    testFailure.value = describeMobileAIError(error, t)
    showToast(describeMobileAIFailure(t('mobileModels.requestTestFailed'), error, t), 'danger')
  } finally {
    testingIntelligent.value = false
  }
}

// 删除配置
const handleDelete = async () => {
  if (!config.value) return
  if (await actions.deleteConfig(config.value)) {
    router.back()
  }
}

// 遮罩 API Key：只露出最后 4 位
const maskApiKey = (apiKey: string): string => {
  if (apiKey.length <= 8) return '••••••••'
  return `••••${apiKey.substring(apiKey.length - 4)}`
}

// 显示提示
const showToast = async (message: string, color: string = 'success') => {
  await presentMobileToast(message, color)
}

// 初始化
onMounted(() => {
  initialLoadPromise = loadConfig()
  initialLoadPromise.finally(() => {
    initialLoadPromise = null
  })
})

// 页面进入时刷新
onIonViewWillEnter(() => {
  if (initialLoadPromise) return
  // 可能刚改过地址或凭据，上一次的失败说明不再适用
  testFailure.value = null
  loadConfig({ showLoading: !config.value })
})
</script>

<style scoped>
.detail-nav__edit {
  color: var(--accent-primary);
  font-weight: 600;
}

.detail-nav__edit:disabled {
  opacity: 0.45;
}

.detail-state {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
}

.detail-body {
  gap: 18px;
  padding-top: 4px;
}

.detail-head {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 0 4px;
}

.detail-head__text {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.detail-head__name {
  margin: 0;
  overflow: hidden;
  color: var(--content-primary);
  font-size: var(--m-font-block);
  font-weight: 600;
  letter-spacing: -0.01em;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-head__provider {
  color: var(--content-tertiary);
  font-size: var(--m-font-sub);
}

.detail-head__pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 4px;
}

.detail-head__pills ion-icon {
  font-size: 12px;
}

.detail-dot {
  width: 6px;
  height: 6px;
  border-radius: 3px;
}

.detail-dot--ok {
  background: var(--indicator-success);
}

.detail-dot--err {
  background: var(--indicator-error);
}

.detail-dot--warn {
  background: var(--indicator-warning);
}

.detail-note {
  margin-top: -6px;
}

.detail-failure {
  padding: 14px 16px;
}

.detail-mono {
  font-family: var(--font-family-mono);
  font-size: var(--m-font-caption);
}

.detail-actions {
  display: flex;
  gap: 10px;
}

.detail-actions__btn {
  flex: 1;
  height: 48px;
  min-width: 0;
  font-size: var(--m-font-sub);
}

.detail-actions__btn ion-icon {
  flex: none;
  font-size: 18px;
}

.detail-actions__btn ion-spinner {
  width: 18px;
  height: 18px;
}

.detail-reply {
  gap: 8px;
  padding: 14px 16px;
}

.detail-reply__meta {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--content-secondary);
  font-size: var(--m-font-sub);
  font-weight: 600;
}

.detail-reply__meta .m-tile {
  width: 24px;
  height: 24px;
  border-radius: 7px;
  font-size: 14px;
}

.detail-reply__prompt {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding-top: 8px;
  border-top: 1px solid var(--border-subtle);
  color: var(--content-tertiary);
  font-size: var(--m-font-caption);
  line-height: 1.6;
}

.detail-reply__prompt strong {
  font-weight: 600;
}

.detail-reply__text {
  margin: 0;
  max-height: 240px;
  overflow-y: auto;
  color: var(--content-primary);
  font-size: var(--m-font-sub);
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
