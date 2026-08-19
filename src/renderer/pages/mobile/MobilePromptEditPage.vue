<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button @click="handleCancel">
            <ion-icon :icon="arrowBack"></ion-icon>
          </ion-button>
        </ion-buttons>
        <ion-title>{{ isEdit ? t('promptManagement.edit') : t('promptManagement.createPrompt') }}</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="toggleFavorite" :aria-label="t('promptManagement.detailModal.favorite')">
            <ion-icon :icon="formData.isFavorite ? heart : heartOutline"></ion-icon>
          </ion-button>
          <ion-button @click="handleSave" :disabled="saving" strong>
            {{ t('common.save') }}
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <form class="editor-flow" @submit.prevent="handleSave">
        <!-- 核心内容：标题 -> 正文 -> 描述，一个连续的创作区域 -->
        <section class="content-card">
          <div class="field-block">
            <ion-input
              v-model="formData.title"
              class="title-input"
              :placeholder="t('promptManagement.titlePlaceholder')"
            ></ion-input>
          </div>

          <div class="field-block">
            <ion-textarea
              v-model="formData.content"
              class="content-textarea"
              :placeholder="t('promptManagement.contentPlaceholder')"
              :rows="6"
              :auto-grow="true"
              required
            ></ion-textarea>
            <div class="field-meta-row">
              <span class="field-hint">{{ t('promptManagement.variableSyntaxHint') }}</span>
              <span class="char-count">{{ contentLength }} {{ t('promptManagement.characters') }}</span>
            </div>
          </div>

          <div class="field-block">
            <span class="field-caption">{{ t('promptManagement.description') }}</span>
            <ion-textarea
              v-model="formData.description"
              class="description-textarea"
              :placeholder="t('promptManagement.descriptionPlaceholder')"
              :rows="2"
              :auto-grow="true"
            ></ion-textarea>
          </div>
        </section>

        <!-- 元信息：分类 / 标签 / 图片，以内联 chip 呈现，无需跳转即可看到当前选择 -->
        <section class="metadata-card">
          <div class="metadata-group">
            <span class="field-caption">{{ t('promptManagement.category') }}</span>
            <div class="chip-scroll">
              <button
                type="button"
                class="pill"
                :class="{ active: !formData.categoryId }"
                @click="selectCategory(null)"
              >
                {{ t('promptManagement.noCategory') }}
              </button>
              <button
                v-for="category in categories"
                :key="category.id"
                type="button"
                class="pill"
                :class="{ active: formData.categoryId === category.id }"
                :style="categoryChipStyle(category)"
                @click="selectCategory(category.id)"
              >
                <span class="pill-dot" :style="{ background: category.color || 'var(--content-tertiary)' }"></span>
                {{ category.name }}
              </button>
            </div>
          </div>

          <div class="metadata-group">
            <span class="field-caption">{{ t('promptManagement.tags') }}</span>
            <div class="chip-wrap">
              <span
                v-for="tag in formData.tags"
                :key="tag"
                class="pill pill-removable"
                :style="tagChipStyle(tag)"
                @click="removeTag(tag)"
              >
                {{ tag }}
                <ion-icon :icon="closeCircle"></ion-icon>
              </span>
              <button type="button" class="pill pill-add" @click="showTagsModal = true">
                <ion-icon :icon="add"></ion-icon>
                {{ t('promptManagement.addTags') }}
              </button>
            </div>
          </div>

          <div class="metadata-group">
            <span class="field-caption">{{ t('promptManagement.images') }}</span>
            <div class="image-grid">
              <div
                v-for="(url, index) in imagePreviewUrls"
                :key="index"
                class="image-preview-item"
              >
                <img :src="url" class="image-thumb" />
                <ion-button
                  fill="clear"
                  size="small"
                  color="danger"
                  class="image-remove-btn"
                  @click="removeImage(index)"
                >
                  <ion-icon :icon="closeCircle" slot="icon-only"></ion-icon>
                </ion-button>
              </div>
              <button
                type="button"
                class="image-add-tile"
                :aria-label="t('promptManagement.addImage')"
                @click="triggerImagePicker"
              >
                <ion-icon :icon="add"></ion-icon>
              </button>
            </div>
            <input
              ref="fileInputRef"
              type="file"
              accept="image/*"
              multiple
              class="hidden-file-input"
              @change="handleImageFilesSelected"
            />
          </div>
        </section>
      </form>
    </ion-content>

    <!-- 标签选择器：搜索、新增与快速勾选热门标签 -->
    <ion-modal :is-open="showTagsModal" @didDismiss="showTagsModal = false">
      <ion-header>
        <ion-toolbar>
          <ion-title>{{ t('promptManagement.selectTags') }}</ion-title>
          <ion-buttons slot="end">
            <ion-button @click="showTagsModal = false">
              {{ t('common.close') }}
            </ion-button>
          </ion-buttons>
        </ion-toolbar>
        <ion-toolbar>
          <ion-searchbar
            v-model="tagSearchText"
            :placeholder="t('promptManagement.searchOrAddTag')"
            @ionInput="handleTagSearch"
          ></ion-searchbar>
        </ion-toolbar>
      </ion-header>
      <ion-content>
        <!-- 已选标签 -->
        <div v-if="formData.tags && formData.tags.length > 0" class="selected-tags">
          <ion-chip
            v-for="tag in formData.tags"
            :key="tag"
            :style="tagChipStyle(tag)"
            @click="removeTag(tag)"
          >
            <ion-label>{{ tag }}</ion-label>
            <ion-icon :icon="closeCircle"></ion-icon>
          </ion-chip>
        </div>

        <!-- 添加新标签 -->
        <ion-list v-if="tagSearchText.trim()">
          <ion-item
            button
            @click="addTag(tagSearchText.trim())"
            v-if="!formData.tags?.includes(tagSearchText.trim())"
          >
            <ion-icon :icon="add" slot="start"></ion-icon>
            <ion-label>{{ t('promptManagement.addTag', { tag: tagSearchText.trim() }) }}</ion-label>
          </ion-item>
        </ion-list>

        <!-- 热门标签 -->
        <ion-list>
          <ion-list-header>
            <ion-label>{{ t('promptManagement.popularTags') }}</ion-label>
          </ion-list-header>
          <ion-item
            v-for="tag in filteredPopularTags"
            :key="tag"
            button
            @click="toggleTag(tag)"
          >
            <ion-label>{{ tag }}</ion-label>
            <ion-checkbox
              :checked="formData.tags?.includes(tag)"
              slot="end"
            ></ion-checkbox>
          </ion-item>
        </ion-list>
      </ion-content>
    </ion-modal>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
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
  IonInput,
  IonTextarea,
  IonModal,
  IonSearchbar,
  IonChip,
  IonCheckbox,
  IonList,
  IonItem,
  IonLabel,
  IonListHeader,
  alertController,
  useBackButton
} from '@ionic/vue'
import {
  arrowBack,
  closeCircle,
  add,
  heart,
  heartOutline
} from 'ionicons/icons'
import { useI18n } from '~/composables/useI18n'
import { api } from '~/lib/api'
import { presentMobileToast } from '~/lib/utils/mobile-toast'
import { getTagColor, getCategoryTagColor } from '~/lib/utils/tag-colors'
import type { Prompt, Category } from '@shared/types'
import { Camera, CameraSource, CameraResultType } from '@capacitor/camera'
import { Capacitor } from '@capacitor/core'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()

// 状态
const isEdit = computed(() => !!route.params.id)
const promptId = computed(() => {
  const id = route.params.id as string
  return id ? parseInt(id, 10) : null
})
const saving = ref(false)
const categories = ref<Category[]>([])
const popularTags = ref<string[]>([])
const showTagsModal = ref(false)
const tagSearchText = ref('')

// 图片相关
const imageBlobs = ref<Blob[]>([])
const imagePreviewUrls = ref<string[]>([])

const triggerImagePicker = async () => {
  if (Capacitor.isNativePlatform()) {
    try {
      const result = await Camera.pickImages({
        quality: 90,
        limit: 10
      })
      for (const photo of result.photos) {
        if (!photo.webPath) continue
        const response = await fetch(photo.webPath)
        const blob = await response.blob()
        if (blob.size > 5 * 1024 * 1024) {
          showToast(t('promptManagement.imageTooLarge'), 'warning')
          continue
        }
        imageBlobs.value.push(blob)
        imagePreviewUrls.value.push(URL.createObjectURL(blob))
      }
    } catch (err: any) {
      // 用户取消选择时不提示错误
      if (!String(err).includes('cancel') && !String(err).includes('Cancel')) {
        showToast(t('promptManagement.imageUploadFailed'), 'danger')
      }
    }
  } else {
    fileInputRef.value?.click()
  }
}
const fileInputRef = ref<HTMLInputElement | null>(null)

const handleImageFilesSelected = (event: Event) => {
  const input = event.target as HTMLInputElement
  if (!input.files) return
  for (const file of Array.from(input.files)) {
    if (!file.type.startsWith('image/')) continue
    if (file.size > 5 * 1024 * 1024) {
      showToast(t('promptManagement.imageTooLarge'), 'warning')
      continue
    }
    imageBlobs.value.push(file)
    imagePreviewUrls.value.push(URL.createObjectURL(file))
  }
  input.value = ''
}

const removeImage = (index: number) => {
  URL.revokeObjectURL(imagePreviewUrls.value[index])
  imageBlobs.value.splice(index, 1)
  imagePreviewUrls.value.splice(index, 1)
}

const loadExistingImages = (blobs: Blob[]) => {
  imagePreviewUrls.value.forEach(url => URL.revokeObjectURL(url))
  imageBlobs.value = [...blobs]
  imagePreviewUrls.value = blobs.map(blob => URL.createObjectURL(blob))
}

// 表单数据
const formData = ref<Partial<Prompt>>({
  title: '',
  description: '',
  content: '',
  categoryId: null,
  tags: [],
  isFavorite: false,
  isActive: true,
  useCount: 0
})

const contentLength = computed(() => formData.value.content?.length || 0)

// 收藏（与详情页头部的爱心图标交互保持一致，保存前仅更新本地状态）
const toggleFavorite = () => {
  formData.value.isFavorite = !formData.value.isFavorite
}

// 分类 chip 的选中态着色：沿用桌面端“分类自带颜色”的视觉语言
const categoryChipStyle = (category: Category) => {
  if (formData.value.categoryId !== category.id) return undefined
  const { color, textColor } = getCategoryTagColor(category)
  return {
    backgroundColor: `${color}1f`,
    borderColor: color,
    color: textColor
  }
}

// 标签 chip 沿用桌面端按标签名哈希取色的方案，保持跨端视觉一致
const tagChipStyle = (tag: string) => {
  const { color, textColor, borderColor } = getTagColor(tag)
  return {
    backgroundColor: color,
    borderColor,
    color: textColor
  }
}

// 用于判断是否有真实改动（编辑模式下记录原始值）
const originalSnapshot = ref<string>('')
const originalImageSignature = ref('')

const getImageSignature = () => {
  return imageBlobs.value.map(blob => `${blob.size}:${blob.type}`).join('|')
}

const takeSnapshot = () => {
  const { imageBlobs: _blobs, ...rest } = formData.value as any
  originalSnapshot.value = JSON.stringify(rest)
  originalImageSignature.value = getImageSignature()
}

const hasRealChanges = (): boolean => {
  // 新建模式：有内容就算有改动
  if (!isEdit.value) {
    return !!(formData.value.title || formData.value.content)
  }
  // 编辑模式：与快照比较
  const { imageBlobs: _blobs, ...rest } = formData.value as any
  const currentSnapshot = JSON.stringify(rest)
  return currentSnapshot !== originalSnapshot.value || getImageSignature() !== originalImageSignature.value
}

// 过滤后的热门标签
const filteredPopularTags = computed(() => {
  if (!tagSearchText.value.trim()) return popularTags.value
  return popularTags.value.filter(tag =>
    tag.toLowerCase().includes(tagSearchText.value.toLowerCase())
  )
})

// 加载数据
const loadData = async () => {
  try {
    // 加载分类
    categories.value = await api.categories.getAll.query()

    // 加载热门标签
    const allPrompts = await api.prompts.getAllForTags.query()
    const tagCounts = new Map<string, number>()
    allPrompts.forEach(prompt => {
      // 处理 tags 字段，支持字符串和数组两种格式
      let promptTags: string[] = []
      if (prompt.tags) {
        if (Array.isArray(prompt.tags)) {
          promptTags = prompt.tags
        } else if (typeof prompt.tags === 'string') {
          promptTags = prompt.tags.split(',').map(tag => tag.trim()).filter(tag => tag)
        }
      }
      promptTags.forEach(tag => {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1)
      })
    })
    popularTags.value = Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([tag]) => tag)

    // 如果是编辑模式，加载提示词数据
    if (isEdit.value && promptId.value) {
      const prompt = await api.prompts.getById.query(promptId.value)
      if (!prompt) {
        console.error('提示词不存在，ID:', promptId.value)
        showToast(t('promptManagement.loadFailed'), 'danger')
        router.back()
        return
      }
      // 确保 tags 是数组格式
      let normalizedTags: string[] = []
      if (prompt.tags) {
        if (Array.isArray(prompt.tags)) {
          normalizedTags = prompt.tags
        } else if (typeof prompt.tags === 'string') {
          normalizedTags = prompt.tags.split(',').map(tag => tag.trim()).filter(tag => tag)
        }
      }
      formData.value = {
        ...prompt,
        tags: normalizedTags,
        // 确保必需字段存在
        isActive: prompt.isActive ?? true,
        isFavorite: prompt.isFavorite ?? false,
        useCount: prompt.useCount ?? 0
      }
      // 加载已有图片
      if (prompt.imageBlobs?.length) {
        loadExistingImages(prompt.imageBlobs)
      }
    }
    // 加载完成后记录快照，用于判断是否有真实改动
    takeSnapshot()
  } catch (error) {
    console.error('加载数据失败:', error)
    showToast(t('promptManagement.loadFailed'), 'danger')
    // 如果是编辑模式且加载失败，返回上一页
    if (isEdit.value) {
      router.back()
    }
  }
}

// 选择分类
const selectCategory = (categoryId: number | null) => {
  formData.value.categoryId = categoryId
}

// 切换标签
const toggleTag = (tag: string) => {
  if (!formData.value.tags) {
    formData.value.tags = []
  }
  const index = formData.value.tags.indexOf(tag)
  if (index > -1) {
    formData.value.tags.splice(index, 1)
  } else {
    formData.value.tags.push(tag)
  }
}

// 添加标签
const addTag = (tag: string) => {
  if (!tag.trim()) return
  if (!formData.value.tags) {
    formData.value.tags = []
  }
  if (!formData.value.tags.includes(tag)) {
    formData.value.tags.push(tag)
  }
  tagSearchText.value = ''
}

// 移除标签
const removeTag = (tag: string) => {
  if (!formData.value.tags) return
  const index = formData.value.tags.indexOf(tag)
  if (index > -1) {
    formData.value.tags.splice(index, 1)
  }
}

// 标签搜索
const handleTagSearch = () => {
  // 搜索逻辑已在 computed 中处理
}

// 保存
const handleSave = async () => {
  // 验证
  if (!formData.value.content?.trim()) {
    showToast(t('promptManagement.contentRequired'), 'warning')
    return
  }

  saving.value = true

  try {
    const dataToSave = {
      ...formData.value,
      imageBlobs: imageBlobs.value
    }
    if (isEdit.value && promptId.value) {
      // 更新
      await api.prompts.update.mutate({
        id: promptId.value,
        data: dataToSave as Prompt
      })
      showToast(t('promptManagement.updateSuccess'))
    } else {
      // 创建
      await api.prompts.create.mutate(dataToSave as any)
      showToast(t('promptManagement.createSuccess'))
    }

    router.back()
  } catch (error) {
    console.error('保存失败:', error)
    showToast(t('promptManagement.saveFailed'), 'danger')
  } finally {
    saving.value = false
  }
}

// 取消
const handleCancel = async () => {
  if (hasRealChanges()) {
    const alert = await alertController.create({
      header: t('common.confirm'),
      message: t('promptManagement.unsavedChanges'),
      buttons: [
        {
          text: t('common.cancel'),
          role: 'cancel'
        },
        {
          text: t('promptManagement.discardChanges'),
          role: 'destructive',
          handler: () => {
            router.back()
          }
        }
      ]
    })
    await alert.present()
  } else {
    router.back()
  }
}

// 处理 Android 物理返回键（与屏幕取消按钮逻辑一致）
useBackButton(10, () => {
  handleCancel()
})

// 显示提示
const showToast = async (message: string, color: string = 'success') => {
  await presentMobileToast(message, color)
}

// 初始化
onMounted(() => {
  loadData()
})

onUnmounted(() => {
  imagePreviewUrls.value.forEach(url => URL.revokeObjectURL(url))
})
</script>

<style scoped>
/*
 * 单一连续流：核心创作内容（标题/正文/描述）与元信息（分类/标签/图片）
 * 分为两张卡片，靠留白和卡片背景区分层级，但都在同一个可滚动区域内，
 * 不再使用“更多选项”折叠区隐藏字段。
 */
.editor-flow {
  display: flex;
  flex-direction: column;
  gap: var(--section-gap);
  padding: var(--content-padding);
  padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 32px);
}

.content-card {
  background: var(--surface-primary);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: var(--content-padding);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
}

.metadata-card {
  background: var(--surface-secondary);
  border-radius: var(--radius-lg);
  padding: var(--content-padding);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
}

.field-block {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
}

.field-caption {
  font-size: var(--mobile-font-size-footnote);
  font-weight: 600;
  color: var(--content-secondary);
}

/* 标题：像笔记标题一样醒目、无边框、无浮动 label */
.title-input {
  --padding-start: 0;
  --padding-end: 0;
  --placeholder-color: var(--content-tertiary);
  --placeholder-opacity: 1;
  --color: var(--content-primary);
  font-size: var(--mobile-font-size-heading);
  font-weight: 600;
}

/* 正文：全篇最重要的输入区域，占据最大空间 */
.content-textarea {
  --padding-start: 0;
  --padding-end: 0;
  --padding-top: 0;
  --padding-bottom: 0;
  --placeholder-color: var(--content-tertiary);
  --placeholder-opacity: 1;
  --color: var(--content-primary);
  font-size: var(--mobile-font-size-body);
  line-height: var(--mobile-line-height-relaxed);
  min-height: 132px;
}

.field-meta-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--spacing-sm);
}

.field-hint {
  font-size: var(--mobile-font-size-caption);
  color: var(--content-tertiary);
}

.char-count {
  flex: 0 0 auto;
  font-size: var(--mobile-font-size-caption);
  color: var(--content-tertiary);
  white-space: nowrap;
}

.description-textarea {
  --padding-start: 0;
  --padding-end: 0;
  --padding-top: 0;
  --padding-bottom: 0;
  --placeholder-color: var(--content-tertiary);
  --placeholder-opacity: 1;
  --color: var(--content-secondary);
  font-size: var(--mobile-font-size-footnote);
}

.metadata-group {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-sm);
}

.chip-scroll {
  display: flex;
  gap: var(--spacing-sm);
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  padding-bottom: 2px;
}

.chip-scroll::-webkit-scrollbar {
  display: none;
}

.chip-wrap {
  display: flex;
  gap: var(--spacing-sm);
  flex-wrap: wrap;
}

.pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: 0 0 auto;
  height: 30px;
  padding: 0 var(--spacing-md);
  border-radius: 999px;
  border: 1px solid var(--border-default);
  background: var(--surface-primary);
  color: var(--content-secondary);
  font-size: var(--mobile-font-size-footnote);
  white-space: nowrap;
}

.pill.active {
  border-color: var(--accent-primary);
  background: var(--interactive-focus);
  color: var(--accent-primary);
  font-weight: 600;
}

.pill-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex: 0 0 auto;
}

.pill-removable {
  font-weight: 500;
}

.pill-removable ion-icon {
  font-size: 14px;
}

.pill-add {
  border-style: dashed;
  color: var(--content-secondary);
  background: transparent;
}

.pill-add ion-icon {
  font-size: 14px;
}

.hidden-file-input {
  display: none;
}

.image-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.image-preview-item {
  position: relative;
  width: calc(33.333% - 6px);
}

.image-thumb {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  border-radius: var(--radius-image, 8px);
  background: var(--surface-secondary);
  display: block;
}

.image-remove-btn {
  position: absolute;
  top: -6px;
  right: -6px;
  --padding-start: 0;
  --padding-end: 0;
  width: 24px;
  height: 24px;
}

.image-add-tile {
  width: calc(33.333% - 6px);
  aspect-ratio: 1;
  border-radius: var(--radius-image, 8px);
  border: 1px dashed var(--border-strong);
  background: var(--surface-primary);
  color: var(--content-tertiary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--mobile-icon-size-lg);
}

.selected-tags {
  padding: 16px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  background: var(--ion-background-color);
  border-bottom: 1px solid var(--ion-border-color);
}
</style>
