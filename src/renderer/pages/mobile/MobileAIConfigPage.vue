<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title :style="{ opacity: headerProgress }">{{ t('mainPage.menu.aiConfig') }}</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="handleCreate">
            <ion-icon :icon="add"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true" :scroll-events="true" @ionScroll="onIonScroll">
      <!-- 下拉刷新 -->
      <ion-refresher slot="fixed" @ionRefresh="handleRefresh">
        <ion-refresher-content></ion-refresher-content>
      </ion-refresher>

      <!-- 大标题：静止时展开，向下滚动时收起为工具栏小标题 -->
      <div class="mobile-large-title-bar" :style="{ '--collapse-progress': headerProgress }">
        <h1 class="mobile-large-title-text" aria-hidden="true">{{ t('mainPage.menu.aiConfig') }}</h1>
      </div>

      <!-- 加载状态 -->
      <div v-if="loading" class="loading-container">
        <ion-spinner></ion-spinner>
      </div>

      <!-- 空状态 -->
      <div v-else-if="configs.length === 0" class="empty-container">
        <EmptyAIConfigIllustration />
        <p class="empty-text">{{ t('aiConfig.noConfigs') }}</p>
        <p class="empty-description">{{ t('aiConfig.noConfigsDescription') }}</p>
        <ion-button @click="handleCreate">
          {{ t('aiConfig.addConfig') }}
        </ion-button>
      </div>

      <!-- 配置内容 -->
      <div v-else>
        <!-- 全局首选项状态显示 -->
        <ion-card v-if="preferredConfig" class="status-card preferred-status">
          <ion-card-content>
            <div class="preferred-alert">
              <div class="preferred-info">
                <ion-icon :icon="starOutline"></ion-icon>
                <div>
                  <strong>{{ t('aiConfig.currentPreferredConfig') }}</strong>
                  <p>{{ preferredConfig.name }}</p>
                </div>
              </div>
              <ion-button fill="clear" size="small" @click="handleClearPreferred">
                {{ t('aiConfig.cancelPreferred') }}
              </ion-button>
            </div>
          </ion-card-content>
        </ion-card>

        <!-- 多配置无首选项警告 -->
        <ion-card v-else-if="configs.length > 1" class="status-card warning-status">
          <ion-card-content>
            <div class="warning-alert">
              <ion-icon :icon="warningOutline"></ion-icon>
              <p>{{ t('aiConfig.multipleConfigsWarning') }}</p>
            </div>
          </ion-card-content>
        </ion-card>

        <!-- AI 配置列表 -->
        <div class="mobile-grouped-card">
          <ion-list>
            <ion-item-sliding v-for="config in configs" :key="config.id">
              <ion-item button @click="handleView(config)">
                <span class="provider-icon" slot="start" aria-hidden="true">
                  <component :is="getProviderIcon(config)" />
                </span>
                <ion-label>
                  <h2>{{ config.name }}</h2>
                  <p class="config-description">
                    {{ config.provider }} {{ config.model }}
                  </p>
                  <div class="config-meta">
                    <ion-chip size="small" :color="config.isPreferred ? 'primary' : 'medium'">
                      <ion-label>
                        {{ config.isPreferred ? t('aiConfig.globalPreferred') : t('aiConfig.normalConfig') }}
                      </ion-label>
                    </ion-chip>
                  </div>
                </ion-label>
                <ion-toggle
                  slot="end"
                  :checked="config.enabled"
                  @ionChange="handleToggle(config, $event)"
                  @click.stop
                ></ion-toggle>
              </ion-item>

              <ion-item-options side="end">
                <ion-item-option color="primary" @click="handleEdit(config)">
                  <ion-icon :icon="createOutline"></ion-icon>
                  {{ t('common.edit') }}
                </ion-item-option>
                <ion-item-option
                  v-if="!config.isPreferred"
                  color="danger"
                  @click="handleDelete(config)"
                >
                  <ion-icon :icon="trashOutline"></ion-icon>
                  {{ t('common.delete') }}
                </ion-item-option>
              </ion-item-options>
            </ion-item-sliding>
          </ion-list>
        </div>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, type Component } from 'vue'
import { useRouter } from 'vue-router'
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonList,
  IonItem,
  IonLabel,
  IonChip,
  IonIcon,
  IonButton,
  IonButtons,
  IonRefresher,
  IonRefresherContent,
  IonSpinner,
  IonToggle,
  IonItemSliding,
  IonItemOptions,
  IonItemOption,
  IonCard,
  IonCardContent,
  alertController,
  onIonViewWillEnter,
  onIonViewWillLeave
} from '@ionic/vue'
import {
  add,
  createOutline,
  trashOutline,
  starOutline,
  warningOutline
} from 'ionicons/icons'
import {
  Api, Atom, BrandGoogle, BrandOpenSource, BrandWindows, Circles, Cloud, DeviceDesktop,
  LetterA, LetterD, LetterM, LetterT, LetterZ, Route
} from '@vicons/tabler'
import { useI18n } from '~/composables/useI18n'
import { api } from '~/lib/api'
import { onDataChange } from '~/lib/services/data-change-events'
import { presentMobileToast } from '~/lib/utils/mobile-toast'
import type { AIConfig, AIProviderType } from '@shared/types'
import EmptyAIConfigIllustration from '~/components/mobile/illustrations/EmptyAIConfigIllustration.vue'
import { useCollapsingHeader } from '~/composables/useCollapsingHeader'

const { t } = useI18n()
const router = useRouter()
const { progress: headerProgress, onIonScroll } = useCollapsingHeader()

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

const normalizeURL = (value?: string) => (value || '').trim().replace(/\/+$/, '')
const getProviderIcon = (config: AIConfig) => {
  const isCustom = (config.type === 'openai'
    && normalizeURL(config.baseURL) !== 'https://api.openai.com/v1')
    || (config.type === 'anthropic' && Boolean(normalizeURL(config.baseURL)))
  return isCustom ? Api : providerIcons[config.type] || Atom
}

// 状态
const configs = ref<AIConfig[]>([])
const preferredConfig = ref<AIConfig | null>(null)
const loading = ref(true)
let isPageActive = true
let pendingRealtimeRefresh = false
let realtimeRefreshTimer: ReturnType<typeof setTimeout> | null = null
let realtimeRefreshRunning = false

// 加载 AI 配置列表
const loadConfigs = async (options: { showLoading?: boolean } = {}) => {
  const showLoading = options.showLoading ?? true

  if (showLoading) {
    loading.value = true
  }

  try {
    configs.value = await api.aiConfigs.getAll.query()
    // 查找首选配置
    preferredConfig.value = configs.value.find(c => c.isPreferred) || null
  } catch (error) {
    console.error('加载 AI 配置失败:', error)
    showToast(t('aiConfig.loadFailed'), 'danger')
  } finally {
    if (showLoading) {
      loading.value = false
    }
  }
}

// 下拉刷新
const handleRefresh = async (event: any) => {
  await loadConfigs()
  event.target.complete()
}

// 切换启用状态
const handleToggle = async (config: AIConfig, event: any) => {
  const enabled = event.detail.checked

  try {
    await api.aiConfigs.update.mutate({
      id: config.id!,
      data: {
        ...config,
        enabled,
        isPreferred: enabled ? config.isPreferred : false
      }
    })

    config.enabled = enabled
    if (!enabled && config.isPreferred) {
      await api.aiConfigs.clearPreferred.mutate()
      config.isPreferred = false
    }
    await loadConfigs({ showLoading: false })
    const message = enabled
      ? t('aiConfig.configEnabled')
      : t('aiConfig.configDisabled')
    showToast(message)
  } catch (error) {
    console.error('更新 AI 配置失败:', error)
    // 恢复状态
    event.target.checked = !enabled
    showToast(t('aiConfig.updateFailed'), 'danger')
  }
}

// 查看配置
const handleView = (config: AIConfig) => {
  router.push(`/ai-config/${config.id}`)
}

// 编辑配置
const handleEdit = (config: AIConfig) => {
  router.push(`/ai-config/edit/${config.id}`)
}

// 创建配置
const handleCreate = () => {
  router.push('/ai-config/create')
}

// 清除首选配置
const handleClearPreferred = async () => {
  const alert = await alertController.create({
    header: t('common.confirm'),
    message: t('aiConfig.preferredCleared'),
    buttons: [
      {
        text: t('common.cancel'),
        role: 'cancel'
      },
      {
        text: t('common.confirm'),
        handler: async () => {
          try {
            await api.aiConfigs.clearPreferred.mutate()
            await loadConfigs({ showLoading: false })
            showToast(t('aiConfig.globalPreferredCleared'))
          } catch (error) {
            console.error('清除首选配置失败:', error)
            showToast(t('aiConfig.clearFailed'), 'danger')
          }
        }
      }
    ]
  })

  await alert.present()
}

// 删除配置
const handleDelete = async (config: AIConfig) => {
  const alert = await alertController.create({
    header: t('common.confirm'),
    message: t('aiConfig.deleteConfirm', { name: config.name }),
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
            await api.aiConfigs.delete.mutate(config.id!)
            configs.value = configs.value.filter(item => item.id !== config.id)
            if (preferredConfig.value?.id === config.id) {
              preferredConfig.value = null
            }
            showToast(t('aiConfig.configDeleteSuccess'))
          } catch (error) {
            console.error('删除 AI 配置失败:', error)
            showToast(t('aiConfig.deleteFailed'), 'danger')
          }
        }
      }
    ]
  })

  await alert.present()
}

// 显示提示
const showToast = async (message: string, color: string = 'success') => {
  await presentMobileToast(message, color)
}

const runRealtimeRefresh = async (showLoading = false) => {
  if (realtimeRefreshRunning) {
    pendingRealtimeRefresh = true
    return
  }

  realtimeRefreshRunning = true
  try {
    do {
      pendingRealtimeRefresh = false
      await loadConfigs({ showLoading })
      showLoading = false
    } while (pendingRealtimeRefresh && isPageActive)
  } finally {
    realtimeRefreshRunning = false
  }
}

const scheduleRealtimeRefresh = () => {
  pendingRealtimeRefresh = true

  if (!isPageActive || realtimeRefreshTimer) return

  realtimeRefreshTimer = setTimeout(() => {
    realtimeRefreshTimer = null
    if (!isPageActive) return
    runRealtimeRefresh(false)
  }, 80)
}

const unsubscribeDataChanges = onDataChange('ai_configs', scheduleRealtimeRefresh)

// 初始化
onMounted(async () => {
  await loadConfigs()
})

// 页面进入时刷新，并消费后台期间发生的数据层变更
onIonViewWillEnter(() => {
  isPageActive = true
  if (pendingRealtimeRefresh) {
    runRealtimeRefresh(configs.value.length === 0)
  } else {
    loadConfigs({ showLoading: configs.value.length === 0 })
  }
})

onIonViewWillLeave(() => {
  isPageActive = false
})

onUnmounted(() => {
  if (realtimeRefreshTimer) {
    clearTimeout(realtimeRefreshTimer)
  }
  unsubscribeDataChanges()
})
</script>

<style scoped>
.loading-container {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 200px;
}

.empty-container {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  padding: 60px 20px;
  text-align: center;
}

.empty-text {
  color: var(--ion-color-medium);
  margin-bottom: 4px;
}

.config-description {
  color: var(--ion-color-medium);
  font-size: var(--mobile-font-size-footnote);
  margin-top: 4px;
}

.provider-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  flex: 0 0 30px;
  border: 1px solid var(--border-default);
  border-radius: 50%;
  background: var(--surface-secondary);
  color: var(--content-secondary);
}

.provider-icon :deep(svg) {
  width: 16px;
  height: 16px;
}

.config-meta {
  margin-top: 8px;
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

ion-chip {
  margin: 0;
}

ion-card {
  margin: 16px;
}

.status-card {
  color: var(--content-primary);
  box-shadow: none;
}

.preferred-status {
  --background: color-mix(in srgb, var(--accent-primary) 8%, var(--surface-primary));
  border-color: color-mix(in srgb, var(--accent-primary) 28%, var(--border-default));
}

.warning-status {
  --background: color-mix(in srgb, var(--accent-warning) 10%, var(--surface-primary));
  border-color: color-mix(in srgb, var(--accent-warning) 28%, var(--border-default));
}

ion-content {
  /* 让列表底部留出浮动导航（AI 入口条 + 标签栏）的空间，避免最后一项被遮挡 */
  --padding-bottom: calc(env(safe-area-inset-bottom, 0px) + var(--mobile-nav-clearance));
}

.preferred-alert {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.preferred-info {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
}

.preferred-info ion-icon {
  font-size: var(--mobile-icon-size-lg);
}

.preferred-info p {
  margin: 4px 0 0 0;
  font-size: var(--mobile-font-size-footnote);
  opacity: 0.9;
}

.warning-alert {
  display: flex;
  align-items: center;
  gap: 12px;
}

.warning-alert ion-icon {
  font-size: var(--mobile-icon-size-lg);
  flex-shrink: 0;
}

.warning-alert p {
  margin: 0;
  font-size: var(--mobile-font-size-footnote);
  line-height: var(--mobile-line-height-normal);
}
</style>
