<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button @click="handleBack">
            <ion-icon :icon="arrowBack"></ion-icon>
          </ion-button>
        </ion-buttons>
        <ion-title>{{ t('promptManagement.detailModal.detail') }}</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="toggleFavorite">
            <ion-icon :icon="prompt?.isFavorite ? heart : heartOutline"></ion-icon>
          </ion-button>
          <ion-button @click="handleEdit">
            <ion-icon :icon="createOutline"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <div v-if="loading" class="loading-container">
        <ion-spinner></ion-spinner>
      </div>

      <div v-else-if="!prompt" class="empty-container">
        <ion-icon :icon="documentTextOutline" class="empty-icon"></ion-icon>
        <p class="empty-text">{{ t('promptManagement.promptNotFound') }}</p>
      </div>

      <div v-else>
        <!-- 标题和描述 -->
        <div class="prompt-header">
          <h1 class="prompt-title">{{ prompt.title }}</h1>
          <p v-if="prompt.description" class="prompt-description">{{ prompt.description }}</p>
        </div>

        <!-- 元信息 -->
        <ion-list>
          <ion-item v-if="prompt.categoryId">
            <ion-label>
              <p>{{ t('promptManagement.category') }}</p>
              <h3>{{ getCategoryName(prompt.categoryId) }}</h3>
            </ion-label>
          </ion-item>

          <ion-item v-if="prompt.tags && prompt.tags.length > 0">
            <ion-label>
              <p>{{ t('promptManagement.tags') }}</p>
              <div class="tags-container">
                <ion-chip v-for="tag in prompt.tags" :key="tag">
                  <ion-label>{{ tag }}</ion-label>
                </ion-chip>
              </div>
            </ion-label>
          </ion-item>
        </ion-list>

        <!-- 提示词内容 -->
        <div class="content-section">
          <div class="section-header">
            <h2>{{ t('promptManagement.detailModal.promptContent') }}</h2>
          </div>
          <ion-card>
            <ion-card-content>
              <div class="prompt-content">{{ prompt.content }}</div>
            </ion-card-content>
          </ion-card>
        </div>

        <!-- 操作按钮 -->
        <div class="action-buttons">
          <ion-button expand="block" @click="copyContent">
            <ion-icon slot="start" :icon="copyOutline"></ion-icon>
            {{ t('promptManagement.detailModal.copyContent') }}
          </ion-button>
          <ion-button expand="block" color="danger" @click="handleDelete">
            <ion-icon slot="start" :icon="trashOutline"></ion-icon>
            {{ t('common.delete') }}
          </ion-button>
        </div>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
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
  IonCard,
  IonCardContent,
  IonChip,
  IonSpinner,
  toastController,
  alertController
} from '@ionic/vue'
import {
  arrowBack,
  heart,
  heartOutline,
  createOutline,
  documentTextOutline,
  copyOutline,
  trashOutline
} from 'ionicons/icons'
import { useI18n } from '~/composables/useI18n'
import { api } from '~/lib/api'
import type { Prompt, Category } from '@shared/types'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()

// 状态
const prompt = ref<Prompt | null>(null)
const categories = ref<Category[]>([])
const loading = ref(true)

// 加载提示词详情
const loadPrompt = async () => {
  loading.value = true
  try {
    const promptId = parseInt(route.params.id as string, 10)
    if (isNaN(promptId)) {
      throw new Error('Invalid prompt ID')
    }
    prompt.value = await api.prompts.getById.query(promptId)
  } catch (error) {
    console.error('加载提示词失败:', error)
    showToast(t('promptManagement.loadFailed'), 'danger')
  } finally {
    loading.value = false
  }
}

// 加载分类
const loadCategories = async () => {
  try {
    categories.value = await api.categories.getAll.query()
  } catch (error) {
    console.error('加载分类失败:', error)
  }
}

// 获取分类名称
const getCategoryName = (categoryId: string | null) => {
  if (!categoryId) return t('promptManagement.noCategory')
  const category = categories.value.find(c => c.id === categoryId)
  return category?.name || t('promptManagement.noCategory')
}

// 切换收藏
const toggleFavorite = async () => {
  if (!prompt.value) return

  try {
    await api.prompts.update.mutate({
      id: prompt.value.id!,
      data: {
        ...prompt.value,
        isFavorite: !prompt.value.isFavorite
      }
    })
    prompt.value.isFavorite = !prompt.value.isFavorite
    showToast(
      prompt.value.isFavorite
        ? t('promptManagement.detailModal.favoriteSuccess')
        : t('promptManagement.detailModal.cancelFavoriteSuccess')
    )
  } catch (error) {
    console.error('切换收藏失败:', error)
    showToast(t('promptManagement.saveFailed'), 'danger')
  }
}

// 复制内容
const copyContent = async () => {
  if (!prompt.value?.content) return

  try {
    await navigator.clipboard.writeText(prompt.value.content)
    showToast(t('promptManagement.detailModal.copySuccess'))
  } catch (error) {
    console.error('复制失败:', error)
    showToast(t('promptManagement.detailModal.copyFailed'), 'danger')
  }
}

// 编辑
const handleEdit = () => {
  if (!prompt.value) return
  router.push(`/prompt/edit/${prompt.value.id}`)
}

// 删除
const handleDelete = async () => {
  if (!prompt.value) return

  const alert = await alertController.create({
    header: t('common.confirm'),
    message: t('promptManagement.confirmDeletePrompt', { title: prompt.value.title }),
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
            await api.prompts.delete.mutate(prompt.value!.id!)
            showToast(t('promptManagement.deleteSuccess'))
            router.back()
          } catch (error) {
            console.error('删除提示词失败:', error)
            showToast(t('promptManagement.deleteFailed'), 'danger')
          }
        }
      }
    ]
  })

  await alert.present()
}

// 返回
const handleBack = () => {
  router.back()
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
  await loadCategories()
  await loadPrompt()
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
  font-size: 16px;
}

.prompt-header {
  padding: 20px 16px;
  background: var(--ion-background-color);
}

.prompt-title {
  font-size: 24px;
  font-weight: 600;
  margin: 0 0 8px 0;
  color: var(--ion-text-color);
}

.prompt-description {
  font-size: 14px;
  color: var(--ion-color-medium);
  margin: 0;
  line-height: 1.5;
}

.tags-container {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 8px;
}

.content-section {
  padding: 16px;
}

.section-header {
  margin-bottom: 12px;
}

.section-header h2 {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
  color: var(--ion-text-color);
}

.prompt-content {
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 14px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-wrap: break-word;
  color: var(--ion-text-color);
}

.action-buttons {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

ion-chip {
  margin: 0;
}
</style>