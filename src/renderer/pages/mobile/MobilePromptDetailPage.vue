<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/tabs/prompts"></ion-back-button>
        </ion-buttons>
        <ion-title>{{ t('promptManagement.detailModal.detail') }}</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="toggleFavorite">
            <ion-icon :icon="prompt?.isFavorite ? heart : heartOutline"></ion-icon>
          </ion-button>
          <ion-button @click="showActionMenu">
            <ion-icon :icon="ellipsisVertical"></ion-icon>
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

        <!-- 提示词内容 -->
        <div class="content-section">
          <div class="section-header">
            <h2>{{ t('promptManagement.detailModal.promptContent') }}</h2>
          </div>
          <div class="prompt-content-wrapper">
            <div class="prompt-content">{{ prompt.content }}</div>
          </div>
        </div>

        <!-- 图片 -->
        <div v-if="imageUrls.length > 0" class="content-section">
          <div class="section-header">
            <h2>{{ t('promptManagement.images') }}</h2>
          </div>
          <div class="images-grid">
            <img
              v-for="(url, index) in imageUrls"
              :key="index"
              :src="url"
              class="prompt-image"
              @click="openImagePreview(url)"
            />
          </div>
        </div>

        <!-- 操作按钮 -->
        <div class="action-buttons">
          <ion-button expand="block" @click="copyContent">
            <ion-icon slot="start" :icon="copyOutline"></ion-icon>
            {{ t('promptManagement.detailModal.copyContent') }}
          </ion-button>
        </div>
      </div>
    </ion-content>

    <!-- 图片全屏预览 -->
    <ion-modal :is-open="!!previewUrl" @didDismiss="previewUrl = null" css-class="image-preview-modal">
      <ion-content @click="previewUrl = null" class="preview-content">
        <img v-if="previewUrl" :src="previewUrl" class="preview-image" />
      </ion-content>
    </ion-modal>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonButton,
  IonBackButton,
  IonIcon,
  IonList,
  IonItem,
  IonLabel,
  IonChip,
  IonSpinner,
  IonModal,
  toastController,
  alertController,
  actionSheetController,
  onIonViewWillEnter
} from '@ionic/vue'
import {
  heart,
  heartOutline,
  createOutline,
  documentTextOutline,
  copyOutline,
  trashOutline,
  ellipsisVertical
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
const imageUrls = ref<string[]>([])
const previewUrl = ref<string | null>(null)

const openImagePreview = (url: string) => {
  previewUrl.value = url
}

const updateImageUrls = () => {
  imageUrls.value.forEach(url => URL.revokeObjectURL(url))
  imageUrls.value = []
  if (prompt.value?.imageBlobs?.length) {
    imageUrls.value = prompt.value.imageBlobs.map((blob: Blob) => URL.createObjectURL(blob))
  }
}

// 加载提示词详情
const loadPrompt = async () => {
  loading.value = true
  try {
    const promptId = parseInt(route.params.id as string, 10)
    if (isNaN(promptId)) {
      throw new Error('Invalid prompt ID')
    }
    prompt.value = await api.prompts.getById.query(promptId)
    updateImageUrls()
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

// 显示操作菜单
const showActionMenu = async () => {
  if (!prompt.value) return

  const actionSheet = await actionSheetController.create({
    header: t('common.actions'),
    buttons: [
      {
        text: t('common.edit'),
        icon: createOutline,
        handler: () => {
          handleEdit()
        }
      },
      {
        text: t('common.delete'),
        icon: trashOutline,
        role: 'destructive',
        handler: () => {
          handleDelete()
        }
      },
      {
        text: t('common.cancel'),
        role: 'cancel'
      }
    ]
  })

  await actionSheet.present()
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

// 每次页面进入（含从编辑页返回）都重新加载，保证数据实时
onIonViewWillEnter(async () => {
  await loadPrompt()
})

onUnmounted(() => {
  imageUrls.value.forEach(url => URL.revokeObjectURL(url))
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

.prompt-content-wrapper {
  background: var(--ion-color-light);
  border-radius: 8px;
  padding: 16px;
  border: 1px solid var(--ion-color-light-shade);
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

.images-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.prompt-image {
  width: calc(50% - 4px);
  border-radius: 8px;
  object-fit: cover;
  aspect-ratio: 1;
  background: var(--ion-color-light);
  cursor: pointer;
}

.preview-content {
  --background: rgba(0, 0, 0, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
}

.preview-image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: 4px;
}
</style>