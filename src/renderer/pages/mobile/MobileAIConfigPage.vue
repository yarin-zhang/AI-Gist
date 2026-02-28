<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ t('mainPage.menu.aiConfig') }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <!-- 下拉刷新 -->
      <ion-refresher slot="fixed" @ionRefresh="handleRefresh">
        <ion-refresher-content></ion-refresher-content>
      </ion-refresher>

      <!-- 加载状态 -->
      <div v-if="loading" class="loading-container">
        <ion-spinner></ion-spinner>
      </div>

      <!-- 空状态 -->
      <div v-else-if="configs.length === 0" class="empty-container">
        <ion-icon :icon="sparklesOutline" class="empty-icon"></ion-icon>
        <p class="empty-text">{{ t('aiConfig.noConfigs') }}</p>
        <ion-button @click="handleCreate">
          {{ t('aiConfig.addConfig') }}
        </ion-button>
      </div>

      <!-- 配置内容 -->
      <div v-else>
        <!-- 全局首选项状态显示 -->
        <ion-card v-if="preferredConfig" color="primary">
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
        <ion-card v-else-if="configs.length > 1" color="warning">
          <ion-card-content>
            <div class="warning-alert">
              <ion-icon :icon="warningOutline"></ion-icon>
              <p>{{ t('aiConfig.multipleConfigsWarning') }}</p>
            </div>
          </ion-card-content>
        </ion-card>

        <!-- AI 配置列表 -->
        <ion-list>
          <ion-item-sliding v-for="config in configs" :key="config.id">
            <ion-item button @click="handleView(config)">
              <ion-label>
                <h2>{{ config.name }}</h2>
                <p class="config-description">
                  {{ config.provider }} - {{ config.model }}
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
    </ion-content>

    <!-- 浮动操作按钮 -->
    <ion-fab slot="fixed" vertical="bottom" horizontal="end">
      <ion-fab-button @click="handleCreate">
        <ion-icon :icon="add"></ion-icon>
      </ion-fab-button>
    </ion-fab>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
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
  IonFab,
  IonFabButton,
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
  toastController,
  onIonViewWillEnter
} from '@ionic/vue'
import {
  add,
  sparklesOutline,
  createOutline,
  trashOutline,
  starOutline,
  warningOutline
} from 'ionicons/icons'
import { useI18n } from '~/composables/useI18n'
import { api } from '~/lib/api'
import type { AIConfig } from '@shared/types'

const { t } = useI18n()
const router = useRouter()

// 状态
const configs = ref<AIConfig[]>([])
const preferredConfig = ref<AIConfig | null>(null)
const loading = ref(true)

// 加载 AI 配置列表
const loadConfigs = async () => {
  loading.value = true

  try {
    configs.value = await api.aiConfigs.getAll.query()
    // 查找首选配置
    preferredConfig.value = configs.value.find(c => c.isPreferred) || null
  } catch (error) {
    console.error('加载 AI 配置失败:', error)
    showToast(t('aiConfig.loadFailed'), 'danger')
  } finally {
    loading.value = false
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
        enabled
      }
    })

    config.enabled = enabled
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
            showToast(t('aiConfig.globalPreferredCleared'))
            loadConfigs()
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
            showToast(t('aiConfig.configDeleteSuccess'))
            loadConfigs()
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

// 页面进入时刷新
onIonViewWillEnter(() => {
  loadConfigs()
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

.empty-icon {
  font-size: 80px;
  color: var(--ion-color-medium);
  margin-bottom: 16px;
}

.empty-text {
  color: var(--ion-color-medium);
  margin-bottom: 24px;
  font-size: 16px;
}

.config-description {
  color: var(--ion-color-medium);
  font-size: 14px;
  margin-top: 4px;
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
  font-size: 24px;
}

.preferred-info p {
  margin: 4px 0 0 0;
  font-size: 14px;
  opacity: 0.9;
}

.warning-alert {
  display: flex;
  align-items: center;
  gap: 12px;
}

.warning-alert ion-icon {
  font-size: 24px;
  flex-shrink: 0;
}

.warning-alert p {
  margin: 0;
  font-size: 14px;
  line-height: 1.5;
}
</style>
