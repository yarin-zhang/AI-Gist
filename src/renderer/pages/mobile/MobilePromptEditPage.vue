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
          <ion-button @click="handleSave" :disabled="saving">
            {{ t('common.save') }}
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <form @submit.prevent="handleSave">
        <ion-list>
          <!-- 内容 - 放在最前面 -->
          <ion-item>
            <ion-textarea
              v-model="formData.content"
              :label="t('promptManagement.content')"
              label-placement="stacked"
              :placeholder="t('promptManagement.contentPlaceholder')"
              :rows="8"
              :auto-grow="true"
              required
            ></ion-textarea>
          </ion-item>

          <!-- 收藏 -->
          <ion-item>
            <ion-label>{{ t('promptManagement.detailModal.favorite') }}</ion-label>
            <ion-toggle v-model="formData.isFavorite" slot="end"></ion-toggle>
          </ion-item>

          <!-- 其他信息折叠区域 -->
          <ion-item button @click="showMoreOptions = !showMoreOptions" lines="full">
            <ion-label>{{ t('promptManagement.moreOptions') }}</ion-label>
            <ion-icon :icon="showMoreOptions ? chevronUp : chevronDown" slot="end"></ion-icon>
          </ion-item>

          <div v-show="showMoreOptions">
            <!-- 标题 -->
            <ion-item>
              <ion-input
                v-model="formData.title"
                :label="t('promptManagement.title')"
                label-placement="stacked"
                :placeholder="t('promptManagement.titlePlaceholder')"
              ></ion-input>
            </ion-item>

            <!-- 描述 -->
            <ion-item>
              <ion-textarea
                v-model="formData.description"
                :label="t('promptManagement.description')"
                label-placement="stacked"
                :placeholder="t('promptManagement.descriptionPlaceholder')"
                :rows="3"
                :auto-grow="true"
              ></ion-textarea>
            </ion-item>

            <!-- 分类 -->
            <ion-item button @click="showCategoryPicker = true">
              <ion-label>{{ t('promptManagement.category') }}</ion-label>
              <ion-note slot="end">
                {{ selectedCategoryName || t('promptManagement.noCategory') }}
              </ion-note>
            </ion-item>

            <!-- 标签 -->
            <ion-item button @click="showTagsModal = true">
              <ion-label>{{ t('promptManagement.tags') }}</ion-label>
              <ion-note slot="end">
                {{ formData.tags?.length || 0 }} {{ t('promptManagement.tags') }}
              </ion-note>
            </ion-item>
          </div>
        </ion-list>
      </form>
    </ion-content>

    <!-- 分类选择器 -->
    <ion-modal :is-open="showCategoryPicker" @didDismiss="showCategoryPicker = false">
      <ion-header>
        <ion-toolbar>
          <ion-title>{{ t('promptManagement.selectCategory') }}</ion-title>
          <ion-buttons slot="end">
            <ion-button @click="showCategoryPicker = false">
              {{ t('common.close') }}
            </ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>
      <ion-content>
        <ion-list>
          <ion-item button @click="selectCategory(null)">
            <ion-label>{{ t('promptManagement.noCategory') }}</ion-label>
            <ion-icon
              v-if="!formData.categoryId"
              :icon="checkmark"
              slot="end"
              color="primary"
            ></ion-icon>
          </ion-item>
          <ion-item
            v-for="category in categories"
            :key="category.id"
            button
            @click="selectCategory(category.id)"
          >
            <ion-label>{{ category.name }}</ion-label>
            <ion-icon
              v-if="formData.categoryId === category.id"
              :icon="checkmark"
              slot="end"
              color="primary"
            ></ion-icon>
          </ion-item>
        </ion-list>
      </ion-content>
    </ion-modal>

    <!-- 标签选择器 -->
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
import { ref, computed, onMounted } from 'vue'
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
  IonInput,
  IonTextarea,
  IonToggle,
  IonNote,
  IonModal,
  IonSearchbar,
  IonChip,
  IonCheckbox,
  IonListHeader,
  toastController,
  alertController
} from '@ionic/vue'
import {
  arrowBack,
  checkmark,
  closeCircle,
  add,
  chevronDown,
  chevronUp
} from 'ionicons/icons'
import { useI18n } from '~/composables/useI18n'
import { api } from '~/lib/api'
import type { Prompt, Category } from '@shared/types'

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
const showCategoryPicker = ref(false)
const showTagsModal = ref(false)
const tagSearchText = ref('')
const showMoreOptions = ref(false)

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

// 选中的分类名称
const selectedCategoryName = computed(() => {
  if (!formData.value.categoryId) return ''
  const category = categories.value.find(c => c.id === formData.value.categoryId)
  return category?.name || ''
})

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
      console.log('成功加载提示词:', prompt)
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
    }
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
const selectCategory = (categoryId: string | null) => {
  formData.value.categoryId = categoryId
  showCategoryPicker.value = false
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
    if (isEdit.value && promptId.value) {
      // 更新
      await api.prompts.update.mutate({
        id: promptId.value,
        data: formData.value as Prompt
      })
      showToast(t('promptManagement.updateSuccess'))
    } else {
      // 创建
      await api.prompts.create.mutate(formData.value as any)
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
  // 检查是否有未保存的更改
  const hasChanges = formData.value.title || formData.value.content

  if (hasChanges) {
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
onMounted(() => {
  loadData()
})
</script>

<style scoped>
.selected-tags {
  padding: 16px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  background: var(--ion-background-color);
  border-bottom: 1px solid var(--ion-border-color);
}

ion-textarea {
  --padding-top: 12px;
  --padding-bottom: 12px;
}
</style>
