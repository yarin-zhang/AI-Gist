<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ t('mainPage.menu.prompts') }}</ion-title>
        <ion-buttons slot="end">
          <ion-button @click="showFilterModal = true">
            <ion-icon :icon="funnelOutline"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>

      <!-- 搜索栏 -->
      <ion-toolbar>
        <ion-searchbar
          v-model="searchText"
          :placeholder="t('promptManagement.searchPrompt')"
          @ionInput="handleSearch"
          @ionClear="handleSearch"
        ></ion-searchbar>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="true">
      <!-- 下拉刷新 -->
      <ion-refresher slot="fixed" @ionRefresh="handleRefresh">
        <ion-refresher-content></ion-refresher-content>
      </ion-refresher>

      <!-- 筛选标签 -->
      <div v-if="hasActiveFilters" class="filter-chips">
        <ion-chip v-if="selectedCategory" @click="clearCategory">
          <ion-label>{{ getCategoryName(selectedCategory) }}</ion-label>
          <ion-icon :icon="closeCircle"></ion-icon>
        </ion-chip>
        <ion-chip v-if="showFavoritesOnly" @click="showFavoritesOnly = false">
          <ion-label>{{ t('promptManagement.favorites') }}</ion-label>
          <ion-icon :icon="closeCircle"></ion-icon>
        </ion-chip>
        <ion-chip v-if="selectedTag" @click="selectedTag = null">
          <ion-label>{{ selectedTag }}</ion-label>
          <ion-icon :icon="closeCircle"></ion-icon>
        </ion-chip>
      </div>

      <!-- 加载状态 -->
      <div v-if="loading" class="loading-container">
        <ion-spinner></ion-spinner>
      </div>

      <!-- 空状态 -->
      <div v-else-if="prompts.length === 0" class="empty-container">
        <ion-icon :icon="documentTextOutline" class="empty-icon"></ion-icon>
        <p class="empty-text">{{ t('promptManagement.noPrompts') }}</p>
        <ion-button @click="handleCreate">
          {{ t('promptManagement.createPrompt') }}
        </ion-button>
      </div>

      <!-- 提示词列表 -->
      <ion-list v-else>
        <ion-item-sliding v-for="prompt in prompts" :key="prompt.id">
          <ion-item button @click="handleView(prompt)">
            <ion-label>
              <h2>{{ prompt.title }}</h2>
              <p class="prompt-description">{{ prompt.description || t('promptManagement.noDescription') }}</p>
              <div class="prompt-meta">
                <ion-chip v-if="prompt.categoryId" size="small" outline>
                  <ion-label>{{ getCategoryName(prompt.categoryId) }}</ion-label>
                </ion-chip>
                <ion-chip v-for="tag in (prompt.tags || []).slice(0, 2)" :key="tag" size="small">
                  <ion-label>{{ tag }}</ion-label>
                </ion-chip>
                <ion-chip v-if="(prompt.tags || []).length > 2" size="small">
                  <ion-label>+{{ (prompt.tags || []).length - 2 }}</ion-label>
                </ion-chip>
              </div>
            </ion-label>
            <ion-icon
              v-if="prompt.isFavorite"
              :icon="heart"
              slot="end"
              color="danger"
            ></ion-icon>
          </ion-item>

          <ion-item-options side="end">
            <ion-item-option color="primary" @click="handleEdit(prompt)">
              <ion-icon :icon="createOutline"></ion-icon>
              {{ t('common.edit') }}
            </ion-item-option>
            <ion-item-option color="danger" @click="handleDelete(prompt)">
              <ion-icon :icon="trashOutline"></ion-icon>
              {{ t('common.delete') }}
            </ion-item-option>
          </ion-item-options>
        </ion-item-sliding>
      </ion-list>

      <!-- 加载更多 -->
      <ion-infinite-scroll
        v-if="hasNextPage"
        @ionInfinite="loadMore"
        threshold="100px"
      >
        <ion-infinite-scroll-content></ion-infinite-scroll-content>
      </ion-infinite-scroll>
    </ion-content>

    <!-- 浮动操作按钮 -->
    <ion-fab slot="fixed" vertical="bottom" horizontal="end">
      <ion-fab-button @click="handleCreate">
        <ion-icon :icon="add"></ion-icon>
      </ion-fab-button>
    </ion-fab>

    <!-- 筛选模态框 -->
    <ion-modal :is-open="showFilterModal" @didDismiss="showFilterModal = false">
      <ion-header>
        <ion-toolbar>
          <ion-title>{{ t('promptManagement.advancedFilter') }}</ion-title>
          <ion-buttons slot="end">
            <ion-button @click="showFilterModal = false">
              {{ t('common.close') }}
            </ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>
      <ion-content>
        <ion-list>
          <!-- 分类筛选 -->
          <ion-list-header>
            <ion-label>{{ t('promptManagement.categoryFilterTitle') }}</ion-label>
          </ion-list-header>
          <ion-item button @click="handleCategoryFilter(null)">
            <ion-label>{{ t('promptManagement.allCategories') }}</ion-label>
            <ion-icon v-if="!selectedCategory" :icon="checkmark" slot="end" color="primary"></ion-icon>
          </ion-item>
          <ion-item
            v-for="category in categories"
            :key="category.id"
            button
            @click="handleCategoryFilter(category.id)"
          >
            <ion-label>{{ category.name }}</ion-label>
            <ion-icon
              v-if="selectedCategory === category.id"
              :icon="checkmark"
              slot="end"
              color="primary"
            ></ion-icon>
          </ion-item>

          <!-- 收藏筛选 -->
          <ion-list-header>
            <ion-label>{{ t('promptManagement.favorites') }}</ion-label>
          </ion-list-header>
          <ion-item>
            <ion-label>{{ t('promptManagement.favoritesOnly') }}</ion-label>
            <ion-toggle v-model="showFavoritesOnly"></ion-toggle>
          </ion-item>

          <!-- 排序 -->
          <ion-list-header>
            <ion-label>{{ t('promptManagement.sortBy') }}</ion-label>
          </ion-list-header>
          <ion-item
            v-for="option in sortOptions"
            :key="option.value"
            button
            @click="handleSortChange(option.value)"
          >
            <ion-label>{{ option.label }}</ion-label>
            <ion-icon
              v-if="sortType === option.value"
              :icon="checkmark"
              slot="end"
              color="primary"
            ></ion-icon>
          </ion-item>
        </ion-list>
      </ion-content>
    </ion-modal>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonSearchbar,
  IonList,
  IonItem,
  IonLabel,
  IonChip,
  IonIcon,
  IonButton,
  IonButtons,
  IonFab,
  IonFabButton,
  IonRefresher,
  IonRefresherContent,
  IonInfiniteScroll,
  IonInfiniteScrollContent,
  IonSpinner,
  IonModal,
  IonListHeader,
  IonToggle,
  IonItemSliding,
  IonItemOptions,
  IonItemOption,
  alertController,
  toastController
} from '@ionic/vue'
import {
  add,
  heart,
  documentTextOutline,
  funnelOutline,
  closeCircle,
  checkmark,
  createOutline,
  trashOutline
} from 'ionicons/icons'
import { useI18n } from '~/composables/useI18n'
import { api } from '~/lib/api'
import type { Prompt, Category } from '@shared/types'
import { useRouter } from 'vue-router'

const { t } = useI18n()
const router = useRouter()

// 状态
const prompts = ref<Prompt[]>([])
const categories = ref<Category[]>([])
const loading = ref(true)
const searchText = ref('')
const selectedCategory = ref<string | null>(null)
const selectedTag = ref<string | null>(null)
const showFavoritesOnly = ref(false)
const sortType = ref('updatedAt')
const showFilterModal = ref(false)
const currentPage = ref(1)
const pageSize = 20
const hasNextPage = ref(false)
const totalCount = ref(0)

// 排序选项
const sortOptions = computed(() => [
  { label: t('promptManagement.sortByUpdatedAt'), value: 'updatedAt' },
  { label: t('promptManagement.sortByCreatedAt'), value: 'createdAt' },
  { label: t('promptManagement.sortByTitle'), value: 'title' }
])

// 是否有激活的筛选
const hasActiveFilters = computed(() => {
  return selectedCategory.value || showFavoritesOnly.value || selectedTag.value
})

// 加载提示词列表
const loadPrompts = async (append = false) => {
  if (!append) {
    loading.value = true
    currentPage.value = 1
  }

  try {
    const filters = {
      page: currentPage.value,
      limit: pageSize,
      search: searchText.value.trim() || undefined,
      categoryId: selectedCategory.value || undefined,
      tags: selectedTag.value || undefined,
      isFavorite: showFavoritesOnly.value || undefined,
      sortBy: sortType.value as any
    }

    const result = await api.prompts.getAll.query(filters)

    if (append) {
      prompts.value = [...prompts.value, ...(result.data || [])]
    } else {
      prompts.value = result.data || []
    }
    hasNextPage.value = result.hasMore || false
    totalCount.value = result.total || 0
  } catch (error) {
    console.error('加载提示词失败:', error)
    const toast = await toastController.create({
      message: t('promptManagement.loadFailed'),
      duration: 2000,
      color: 'danger'
    })
    await toast.present()
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
  if (!categoryId) return t('promptManagement.uncategorized')
  const category = categories.value.find(c => c.id === categoryId)
  return category?.name || t('promptManagement.uncategorized')
}

// 搜索处理
const handleSearch = () => {
  loadPrompts()
}

// 下拉刷新
const handleRefresh = async (event: any) => {
  await loadPrompts()
  event.target.complete()
}

// 加载更多
const loadMore = async (event: any) => {
  currentPage.value++
  await loadPrompts(true)
  event.target.complete()
}

// 分类筛选
const handleCategoryFilter = (categoryId: string | null) => {
  selectedCategory.value = categoryId
  showFilterModal.value = false
  loadPrompts()
}

// 清除分类筛选
const clearCategory = () => {
  selectedCategory.value = null
  loadPrompts()
}

// 排序变更
const handleSortChange = (value: string) => {
  sortType.value = value
  showFilterModal.value = false
  loadPrompts()
}

// 查看提示词
const handleView = (prompt: Prompt) => {
  // TODO: 导航到详情页
  console.log('View prompt:', prompt)
}

// 编辑提示词
const handleEdit = (prompt: Prompt) => {
  router.push(`/prompt/edit/${prompt.id}`)
}

// 创建提示词
const handleCreate = () => {
  router.push('/prompt/create')
}

// 删除提示词
const handleDelete = async (prompt: Prompt) => {
  const alert = await alertController.create({
    header: t('common.confirm'),
    message: t('promptManagement.deleteConfirm', { title: prompt.title }),
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
            await api.prompts.delete.mutate(prompt.id!)

            const toast = await toastController.create({
              message: t('promptManagement.deleteSuccess'),
              duration: 2000,
              color: 'success'
            })
            await toast.present()
            loadPrompts()
          } catch (error) {
            console.error('删除提示词失败:', error)
            const toast = await toastController.create({
              message: t('promptManagement.deleteFailed'),
              duration: 2000,
              color: 'danger'
            })
            await toast.present()
          }
        }
      }
    ]
  })

  await alert.present()
}

// 监听筛选变化
watch([showFavoritesOnly, selectedTag], () => {
  loadPrompts()
})

// 初始化
onMounted(async () => {
  await loadCategories()
  await loadPrompts()
})
</script>

<style scoped>
.filter-chips {
  padding: 8px 16px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  background: var(--ion-background-color);
}

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

.prompt-description {
  color: var(--ion-color-medium);
  font-size: 14px;
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.prompt-meta {
  margin-top: 8px;
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

ion-chip {
  margin: 0;
}
</style>
