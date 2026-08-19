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

      <div v-else class="prompt-detail-body">
        <!-- 标题和描述 -->
        <div class="prompt-header">
          <h1 class="prompt-title">{{ prompt.title || getFirstLineOfContent(prompt.content) }}</h1>
          <p v-if="prompt.description" class="prompt-description">{{ prompt.description }}</p>
          <div class="prompt-meta-row">
            <ion-chip v-if="prompt.categoryId" size="small" outline>
              <ion-label>{{ getCategoryName(prompt.categoryId) }}</ion-label>
            </ion-chip>
            <ion-chip v-for="tag in promptTags" :key="tag" size="small">
              <ion-label>{{ tag }}</ion-label>
            </ion-chip>
          </div>
          <div class="prompt-submeta">
            <span>{{ t('promptManagement.useCount', { count: prompt.useCount || 0 }) }}</span>
            <span>{{ formatDate(prompt.updatedAt) }}</span>
          </div>
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
      </div>

      <!--
        操作按钮：使用 Ionic ion-content 官方的 slot="fixed" 机制（项目里
        ion-refresher 在其他页面也依赖同一机制），把按钮从可滚动内容流中
        摘出来，悬浮在 ion-content 可视区域的底部——也就是「窗口底部」，
        而不是「页面内容的末尾」。对应 Gitea issue #63：用户此前需要滑动到
        内容最后才能看到「复制提示词」按钮。
      -->
      <div v-if="prompt" class="action-buttons" slot="fixed">
        <ion-button expand="block" @click="copyContent">
          <ion-icon slot="start" :icon="copyOutline"></ion-icon>
          {{ t('promptManagement.detailModal.copyContent') }}
        </ion-button>
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
import { computed, ref, onMounted, onUnmounted } from 'vue'
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
import { presentMobileToast } from '~/lib/utils/mobile-toast'
import { recordPromptUsage } from '~/lib/utils/prompt-usage'
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
let initialLoadPromise: Promise<void> | null = null

const openImagePreview = (url: string) => {
  previewUrl.value = url
}

const promptTags = computed(() => {
  const tags = prompt.value?.tags
  if (!tags) return []
  if (Array.isArray(tags)) return tags
  return tags.split(',').map(tag => tag.trim()).filter(Boolean)
})

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
const getCategoryName = (categoryId: number | null | undefined) => {
  if (!categoryId) return t('promptManagement.noCategory')
  const category = categories.value.find(c => c.id === categoryId)
  return category?.name || t('promptManagement.noCategory')
}

const getFirstLineOfContent = (content: string | undefined) => {
  if (!content) return t('promptManagement.detailModal.noDescription')
  const firstLine = content.split('\n')[0].trim()
  return firstLine.length > 64 ? `${firstLine.slice(0, 64)}...` : firstLine
}

const formatDate = (date: Date | string | undefined) => {
  if (!date) return ''
  const value = new Date(date)
  if (Number.isNaN(value.getTime())) return ''
  return value.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
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
    try {
      const updated = await recordPromptUsage({
        promptId: prompt.value.id!,
        content: prompt.value.content,
        incrementUseCount: id => api.prompts.incrementUseCount.mutate(id),
      })
      prompt.value.useCount = updated.useCount
    } catch (usageError) {
      console.warn('更新提示词使用次数失败:', usageError)
    }
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
  await presentMobileToast(message, color)
}

// 初始化
onMounted(async () => {
  initialLoadPromise = Promise.all([
    loadCategories(),
    loadPrompt()
  ]).then(() => undefined)
  await initialLoadPromise
  initialLoadPromise = null
})

// 每次页面进入（含从编辑页返回）都重新加载，保证数据实时
onIonViewWillEnter(async () => {
  if (initialLoadPromise) {
    await initialLoadPromise
    return
  }
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
  color: var(--ion-color-medium);
  margin-bottom: 16px;
}

.empty-text {
  color: var(--ion-color-medium);
}

.prompt-detail-body {
  /*
   * 底部操作栏改为 slot="fixed" 悬浮后不再占用文档流高度，这里补回等量的
   * 底部内边距，保证滚动到内容真正末尾时最后一行文字不会被悬浮按钮遮挡。
   * 数值 = 操作栏自身高度（按钮 + 上下内边距，约 72px）+ 少量呼吸间距。
   */
  padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 84px);
}

.prompt-header {
  padding: 20px 16px;
  background: var(--ion-background-color);
}

.prompt-title {
  font-size: var(--mobile-font-size-heading);
  font-weight: 600;
  margin: 0 0 8px 0;
  color: var(--ion-text-color);
}

.prompt-description {
  font-size: var(--mobile-font-size-footnote);
  color: var(--ion-color-medium);
  margin: 0;
  line-height: var(--mobile-line-height-normal);
}

.prompt-meta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
}

.prompt-submeta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 10px;
  color: var(--ion-color-medium);
  font-size: var(--mobile-font-size-footnote);
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
  font-size: var(--mobile-font-size-title);
  font-weight: 600;
  margin: 0;
  color: var(--ion-text-color);
}

.prompt-content-wrapper {
  background: var(--surface-secondary);
  border-radius: var(--radius-lg);
  padding: 16px;
  border: 1px solid var(--border-default);
}

.prompt-content {
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: var(--mobile-font-size-body);
  line-height: var(--mobile-line-height-relaxed);
  white-space: pre-wrap;
  word-wrap: break-word;
  color: var(--ion-text-color);
}

/*
 * 悬浮在 ion-content 可视区域底部的操作栏（slot="fixed"）。
 * Ionic 会把 [slot=fixed] 的元素设为 position: absolute，相对 ion-content
 * 自身（充满 header 下方到窗口底部的可视区域）定位，因此 bottom: 0 精确
 * 贴在「窗口底部」，与滚动内容、内容长短完全无关。
 */
.action-buttons {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: var(--ion-background-color);
  border-top: 1px solid var(--border-default);
  padding: 12px 16px calc(env(safe-area-inset-bottom, 0px) + 12px);
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
  border-radius: var(--radius-image, 8px);
  object-fit: cover;
  aspect-ratio: 1;
  background: var(--surface-secondary);
  cursor: pointer;
}

.preview-content {
  --background: var(--overlay-preview);
  display: flex;
  align-items: center;
  justify-content: center;
}

.preview-image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: var(--radius-image, 8px);
}
</style>
