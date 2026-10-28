<template>
  <ion-page>
    <ion-content class="m-page-content" :fullscreen="true">
      <!-- 下拉刷新 -->
      <ion-refresher slot="fixed" @ionRefresh="handleRefresh">
        <ion-refresher-content></ion-refresher-content>
      </ion-refresher>

      <MobileLargeTitle :title="t('mobileNav.models')">
        <button type="button" class="m-btn-c" :aria-label="t('aiConfig.addConfig')" @click="handleCreate">
          <ion-icon :icon="add" />
        </button>
      </MobileLargeTitle>

      <div class="m-body m-body--tabbed models-body">
        <!-- 加载状态 -->
        <div v-if="loading" class="models-state">
          <ion-spinner name="crescent" />
        </div>

        <!-- 空状态 -->
        <div v-else-if="configs.length === 0" class="models-empty">
          <EmptyAIConfigIllustration />
          <h2 class="models-empty__title">{{ t('models.emptyTitle') }}</h2>
          <p class="models-empty__desc">{{ t('aiConfig.noConfigsDescription') }}</p>
          <button type="button" class="m-cta models-empty__cta" @click="handleCreate">
            <ion-icon :icon="add" aria-hidden="true" />
            {{ t('aiConfig.addConfig') }}
          </button>
        </div>

        <template v-else>
          <!-- 全局首选：单独一张卡片，显示默认模型和连接状态，点进详情页 -->
          <PreferredConfigCard v-if="preferredConfig" :config="preferredConfig"
            :visual="visualForConfig(preferredConfig)" :status="statusForConfig(preferredConfig)"
            @open="handleView(preferredConfig)" />

          <!-- 多个已启用配置但没有首选：提醒去设一个，并直接给出入口 -->
          <div v-else-if="enabledCount > 1" class="m-card models-hint" role="note">
            <span class="m-tile m-tile--warning" aria-hidden="true"><ion-icon :icon="warningOutline" /></span>
            <span class="models-hint__body">
              <p>{{ t('aiConfig.multipleConfigsWarning') }}</p>
              <button type="button" class="models-hint__action" @click="handlePickPreferred">
                <ion-icon :icon="starOutline" aria-hidden="true" />
                {{ t('aiConfig.setAsPreferred') }}
              </button>
            </span>
          </div>

          <!-- 全部配置：左滑可编辑、启用/禁用、删除 -->
          <MobileGroup :title="`${t('aiConfig.workspace.allConfigs')} · ${configs.length}`">
            <ion-item-sliding v-for="config in configs" :key="config.id" class="models-slide">
              <ion-item button :detail="false" lines="none" class="models-row" @click="handleView(config)">
                <span class="models-row__content">
                  <ProviderTile :visual="visualForConfig(config)" :variant="config.enabled ? 'soft' : 'muted'" />
                  <span class="models-row__text">
                    <span class="models-row__name" :class="{ 'is-disabled': !config.enabled }">{{ config.name }}</span>
                    <span class="models-row__sub">{{ getRowSubtitle(config) }}</span>
                  </span>
                  <span class="models-row__end">
                    <span class="m-pill" :class="statusPillOf(config).tone">{{ statusPillOf(config).label }}</span>
                    <ion-icon :icon="chevronForward" class="models-row__chev" aria-hidden="true" />
                  </span>
                </span>
              </ion-item>

              <ion-item-options side="end">
                <ion-item-option color="medium" @click="handleToggle(config, !config.enabled, $event)">
                  <ion-icon slot="top" :icon="config.enabled ? pauseCircleOutline : playCircleOutline" />
                  {{ config.enabled ? t('mobileModels.disable') : t('mobileModels.enable') }}
                </ion-item-option>
                <ion-item-option color="primary" @click="handleEdit(config, $event)">
                  <ion-icon slot="top" :icon="createOutline" />
                  {{ t('common.edit') }}
                </ion-item-option>
                <ion-item-option color="danger" @click="handleDelete(config, $event)">
                  <ion-icon slot="top" :icon="trashOutline" />
                  {{ t('common.delete') }}
                </ion-item-option>
              </ion-item-options>
            </ion-item-sliding>
          </MobileGroup>
        </template>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  IonPage,
  IonContent,
  IonIcon,
  IonRefresher,
  IonRefresherContent,
  IonSpinner,
  IonItem,
  IonItemSliding,
  IonItemOptions,
  IonItemOption,
  actionSheetController,
  onIonViewWillEnter,
  onIonViewWillLeave
} from '@ionic/vue'
import {
  add,
  chevronForward,
  createOutline,
  pauseCircleOutline,
  playCircleOutline,
  starOutline,
  trashOutline,
  warningOutline
} from 'ionicons/icons'
import { useI18n } from '~/composables/useI18n'
import { api } from '~/lib/api'
import { onDataChange } from '~/lib/services/data-change-events'
import { presentMobileToast } from '~/lib/utils/mobile-toast'
import type { AIConfig } from '@shared/types'
import EmptyAIConfigIllustration from '~/components/mobile/illustrations/EmptyAIConfigIllustration.vue'
import MobileLargeTitle from '~/components/mobile/ui/MobileLargeTitle.vue'
import MobileGroup from '~/components/mobile/ui/MobileGroup.vue'
import ProviderTile from '~/components/mobile/models/ProviderTile.vue'
import PreferredConfigCard from '~/components/mobile/models/PreferredConfigCard.vue'
import { useMobileProviderCatalog } from '~/components/mobile/models/provider-catalog'
import { connectionBadgeView, statusForConfig } from '~/components/mobile/models/connection-status'
import { isMobileSupportedProvider } from '~/components/mobile/prompt/mobile-ai'
import { useConfigActions } from '~/components/mobile/models/useConfigActions'

const { t } = useI18n()
const router = useRouter()
const { visualForConfig } = useMobileProviderCatalog()
const actions = useConfigActions()

// 状态
const configs = ref<AIConfig[]>([])
const preferredConfig = ref<AIConfig | null>(null)
const loading = ref(true)
let isPageActive = true
let pendingRealtimeRefresh = false
let realtimeRefreshTimer: ReturnType<typeof setTimeout> | null = null
let realtimeRefreshRunning = false

const enabledCount = computed(() => configs.value.filter(config => config.enabled).length)

// 行副标题：模型数量，首选的加「首选」，禁用的直接写「已禁用」
const getRowSubtitle = (config: AIConfig) => {
  if (!config.enabled) return t('models.disabled')
  const count = t('aiConfig.workspace.modelCount', { count: config.models?.length || 0 })
  return config.isPreferred ? `${count} · ${t('models.preferred')}` : count
}

// 行尾状态：和首选卡片、详情页同一套判断（未测试显示「未验证」，不再默认「可用」）
const statusPillOf = (config: AIConfig) => connectionBadgeView(config, t)

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

// 左滑操作执行后收起滑块
const closeSlidingItem = (event?: Event) => {
  const sliding = (event?.target as HTMLElement | null)?.closest('ion-item-sliding')
  sliding?.close()
}

// 切换启用状态
const handleToggle = async (config: AIConfig, enabled: boolean, event?: Event) => {
  closeSlidingItem(event)
  if (await actions.setEnabled(config, enabled)) {
    await loadConfigs({ showLoading: false })
  }
}

// 查看配置
const handleView = (config: AIConfig) => {
  router.push(`/ai-config/${config.id}`)
}

// 编辑配置
const handleEdit = (config: AIConfig, event?: Event) => {
  closeSlidingItem(event)
  router.push(`/ai-config/edit/${config.id}`)
}

// 创建配置
const handleCreate = () => {
  router.push('/ai-config/create')
}

// 没有首选时：从移动端能用的已启用配置里挑一个设为首选
const handlePickPreferred = async () => {
  const candidates = configs.value.filter(config => config.enabled && isMobileSupportedProvider(config.type))
  const sheet = await actionSheetController.create({
    header: t('aiConfig.setAsPreferred'),
    buttons: [
      ...candidates.map(config => ({
        text: config.name,
        handler: () => {
          void actions.setPreferred(config).then(changed => {
            if (changed) void loadConfigs({ showLoading: false })
          })
        }
      })),
      { text: t('common.cancel'), role: 'cancel' }
    ]
  })
  await sheet.present()
}

// 删除配置
const handleDelete = async (config: AIConfig, event?: Event) => {
  closeSlidingItem(event)
  if (await actions.deleteConfig(config)) {
    configs.value = configs.value.filter(item => item.id !== config.id)
    if (preferredConfig.value?.id === config.id) {
      preferredConfig.value = null
    }
  }
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
.models-body {
  padding-top: 16px;
}

.models-state {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
}

/* 空状态：插图 + 标题 + 说明 + 主按钮 */
.models-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 48px 12px 0;
  text-align: center;
}

.models-empty__title {
  margin: 8px 0 0;
  color: var(--content-primary);
  font-size: var(--m-font-block);
  font-weight: 600;
}

.models-empty__desc {
  max-width: 300px;
  margin: 0 0 16px;
  color: var(--content-tertiary);
  font-size: var(--m-font-sub);
  line-height: 1.6;
}

.models-empty__cta {
  max-width: 280px;
}

.models-empty__cta ion-icon {
  font-size: 20px;
}

/* 加上 .m-card 提高优先级，否则会被 m-card 的纵向排列覆盖 */
.m-card.models-hint {
  flex-direction: row;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
}

.models-hint__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  min-width: 0;
}

.models-hint p {
  margin: 0;
  color: var(--content-secondary);
  font-size: var(--m-font-sub);
  line-height: 1.6;
}

/* 文字按钮：看起来是一行链接，点按区域撑到 44px */
.models-hint__action {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 44px;
  margin: -8px 0 -12px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--accent-primary);
  font: inherit;
  font-size: var(--m-font-sub);
  font-weight: 600;
  cursor: pointer;
}

/* 分组里的可滑动行：ion-item 换成 m-row 的样子（≥64 高、行间细线从图标右侧开始） */
.models-slide {
  position: relative;
}

.models-slide + .models-slide::before {
  position: absolute;
  top: 0;
  right: 0;
  left: 64px;
  z-index: 2;
  height: 1px;
  background: var(--border-subtle);
  content: "";
}

.models-row {
  --background: var(--surface-primary);
  --background-activated: var(--surface-secondary);
  --background-activated-opacity: 1;
  --background-focused: var(--surface-secondary);
  --background-focused-opacity: 1;
  --color: var(--content-primary);
  --padding-start: 16px;
  --padding-end: 0;
  --inner-padding-end: 16px;
  --inner-border-width: 0;
  --border-width: 0;
  --min-height: 64px;
  font-size: var(--m-font-body);
}

.models-row__content {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-width: 0;
  padding: 10px 0;
}

.models-row__text {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.models-row__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.models-row__name.is-disabled {
  color: var(--content-tertiary);
}

.models-row__sub {
  overflow: hidden;
  color: var(--content-tertiary);
  font-size: var(--m-font-caption);
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 状态标记最多占一半宽度，长语言里（Connessione non riuscita）省略结尾，配置名不会被挤没 */
.models-row__end {
  display: flex;
  flex: 0 1 auto;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: 55%;
}

.models-row__end .m-pill {
  display: block;
  min-width: 0;
  overflow: hidden;
  line-height: 22px;
  text-overflow: ellipsis;
}

.models-row__chev {
  flex: none;
  color: var(--border-strong);
  font-size: 18px;
}

.models-slide ion-item-option {
  min-width: 72px;
  font-size: var(--m-font-caption);
  font-weight: 600;
}

.models-slide ion-item-option ion-icon {
  margin-bottom: 4px;
  font-size: 20px;
}
</style>
