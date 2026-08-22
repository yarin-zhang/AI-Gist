<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <!-- 默认状态：左上角的搜索图标，点击后原地展开为搜索框 -->
        <ion-buttons v-if="!isSearchActive" slot="start">
          <ion-button :aria-label="t('promptManagement.searchPrompt')" @click="openSearch">
            <ion-icon :icon="searchOutline" slot="icon-only"></ion-icon>
          </ion-button>
        </ion-buttons>

        <ion-title v-if="!isSearchActive" :style="{ opacity: headerProgress }">{{ t('mainPage.menu.prompts') }}</ion-title>

        <!--
          展开态：直接用 ion-searchbar 自带的 show-cancel-button="always" 提供收起入口，
          不必自己监听 blur / 手写取消按钮；animated 启用 Ionic 内置的图标与取消按钮过渡动画。
          注意 closeSearch 里仍要显式清空 searchText——ion-searchbar 内部清空输入的动作
          有一个短延时，我们一收起就把它卸载，延时来不及触发，细节见 closeSearch 的注释。
        -->
        <ion-searchbar
          v-else
          ref="searchbarRef"
          v-model="searchText"
          :placeholder="t('promptManagement.searchPrompt')"
          show-cancel-button="always"
          animated
          @ionInput="handleSearch"
          @ionClear="handleSearch"
          @ionCancel="closeSearch"
        ></ion-searchbar>

        <ion-buttons v-if="!isSearchActive" slot="end">
          <ion-button v-if="hasAIConfig" @click="navigateToAIGenerator">
            <ion-icon :icon="sparklesOutline"></ion-icon>
          </ion-button>
          <ion-button @click="showFilterModal = true">
            <ion-icon :icon="funnelOutline"></ion-icon>
          </ion-button>
          <ion-button @click="handleCreate">
            <ion-icon :icon="add"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content ref="ionContentRef" :fullscreen="true" :scroll-events="true" @ionScroll="onIonScroll">
      <!-- 下拉刷新 -->
      <ion-refresher slot="fixed" @ionRefresh="handleRefresh">
        <ion-refresher-content></ion-refresher-content>
      </ion-refresher>

      <!-- 大标题：静止时展开，向下滚动时收起为工具栏小标题 -->
      <div class="mobile-large-title-bar" :style="{ '--collapse-progress': headerProgress }">
        <h1 class="mobile-large-title-text" aria-hidden="true">{{ t('mainPage.menu.prompts') }}</h1>
      </div>

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

      <div v-if="!loading && prompts.length > 0" class="mobile-list-toolbar">
        <span>{{ t('promptManagement.mobileResultCount', { count: totalCount }) }}</span>
        <ion-segment v-model="viewMode" class="view-mode-segment">
          <ion-segment-button value="list" :aria-label="t('promptManagement.viewModeList')">
            <ion-icon :icon="listOutline"></ion-icon>
          </ion-segment-button>
          <ion-segment-button value="waterfall" :aria-label="t('promptManagement.viewModeWaterfall')">
            <ion-icon :icon="gridOutline"></ion-icon>
          </ion-segment-button>
        </ion-segment>
      </div>

      <!-- 加载状态 -->
      <div v-if="loading" class="loading-container">
        <ion-spinner></ion-spinner>
      </div>

      <!-- 空状态：完全没有提示词（首次使用） -->
      <div v-else-if="prompts.length === 0 && !isSearchOrFilterActive" class="empty-container">
        <EmptyPromptsIllustration />
        <p class="empty-text">{{ t('promptManagement.noPrompts') }}</p>
        <p class="empty-description">{{ t('promptManagement.noPromptsDescription') }}</p>
        <ion-button @click="handleCreate">
          {{ t('promptManagement.create') }}
        </ion-button>
      </div>

      <!-- 空状态：搜索/筛选后没有匹配结果，与「完全没有数据」区分开 -->
      <div v-else-if="prompts.length === 0" class="empty-container">
        <NoSearchResultsIllustration />
        <p class="empty-text">{{ t('promptManagement.noSearchResults') }}</p>
        <p class="empty-description">{{ t('promptManagement.noSearchResultsDescription') }}</p>
        <ion-button fill="outline" @click="clearSearchAndFilters">
          {{ t('promptManagement.clearSearchAndFilters') }}
        </ion-button>
      </div>

      <!-- 提示词列表（列表视图） -->
      <div v-else-if="viewMode === 'list'" class="mobile-grouped-card">
        <ion-list>
          <ion-item-sliding v-for="prompt in prompts" :key="prompt.id">
            <ion-item button @click="handleView(prompt)">
              <ion-label>
                <h2 class="prompt-title">{{ prompt.title || getFirstLineOfContent(prompt.content) }}</h2>
                <p v-if="prompt.description" class="prompt-description">{{ prompt.description }}</p>
                <div class="prompt-meta">
                  <ion-chip v-if="prompt.categoryId" size="small" outline>
                    <ion-label>{{ getCategoryName(prompt.categoryId) }}</ion-label>
                  </ion-chip>
                  <ion-chip v-for="tag in getTagsArray(prompt.tags).slice(0, 2)" :key="tag" size="small">
                    <ion-label>{{ tag }}</ion-label>
                  </ion-chip>
                  <ion-chip v-if="getTagsArray(prompt.tags).length > 2" size="small">
                    <ion-label>+{{ getTagsArray(prompt.tags).length - 2 }}</ion-label>
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
      </div>

      <!-- 瀑布流视图 -->
      <mobile-waterfall-view
        v-else
        :prompts="prompts"
        :categories="categories"
        @view="handleView"
      ></mobile-waterfall-view>

      <!-- 加载更多 -->
      <ion-infinite-scroll
        v-if="hasNextPage"
        @ionInfinite="loadMore"
        threshold="100px"
      >
        <ion-infinite-scroll-content></ion-infinite-scroll-content>
      </ion-infinite-scroll>
    </ion-content>

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
          <!-- 视图模式选择 -->
          <ion-list-header>
            <ion-label>{{ t('promptManagement.viewMode') }}</ion-label>
          </ion-list-header>
          <ion-item button @click="viewMode = 'list'">
            <ion-icon :icon="listOutline" slot="start"></ion-icon>
            <ion-label>{{ t('promptManagement.viewModeList') }}</ion-label>
            <ion-icon v-if="viewMode === 'list'" :icon="checkmark" slot="end" color="primary"></ion-icon>
          </ion-item>
          <ion-item button @click="viewMode = 'waterfall'">
            <ion-icon :icon="gridOutline" slot="start"></ion-icon>
            <ion-label>{{ t('promptManagement.viewModeWaterfall') }}</ion-label>
            <ion-icon v-if="viewMode === 'waterfall'" :icon="checkmark" slot="end" color="primary"></ion-icon>
          </ion-item>

          <!-- 收藏筛选：长期存在的筛选项，置于分类筛选之前 -->
          <ion-list-header>
            <ion-label>{{ t('promptManagement.favorites') }}</ion-label>
          </ion-list-header>
          <ion-item>
            <ion-label>{{ t('promptManagement.favoritesOnly') }}</ion-label>
            <ion-toggle v-model="showFavoritesOnly" slot="end"></ion-toggle>
          </ion-item>

          <!-- 排序：长期存在的筛选项，置于分类筛选之前 -->
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
        </ion-list>
      </ion-content>
    </ion-modal>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, onActivated, onUnmounted, nextTick } from 'vue'
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
  IonRefresher,
  IonRefresherContent,
  IonInfiniteScroll,
  IonInfiniteScrollContent,
  IonSpinner,
  IonModal,
  IonListHeader,
  IonToggle,
  IonSegment,
  IonSegmentButton,
  IonItemSliding,
  IonItemOptions,
  IonItemOption,
  alertController,
  onIonViewWillEnter,
  onIonViewWillLeave,
  onIonViewDidEnter
} from '@ionic/vue'
import {
  add,
  heart,
  funnelOutline,
  closeCircle,
  checkmark,
  createOutline,
  trashOutline,
  sparklesOutline,
  listOutline,
  gridOutline,
  searchOutline
} from 'ionicons/icons'
import { useI18n } from '~/composables/useI18n'
import { useAIConfigStatus } from '~/composables/useAIConfigStatus'
import { api } from '~/lib/api'
import { onDataChange } from '~/lib/services/data-change-events'
import { presentMobileToast } from '~/lib/utils/mobile-toast'
import { getTagsArray } from '~/lib/utils/tag-colors'
import type { Prompt, Category } from '@shared/types'
import { useRouter } from 'vue-router'
import MobileWaterfallView from '~/components/mobile/MobileWaterfallView.vue'
import EmptyPromptsIllustration from '~/components/mobile/illustrations/EmptyPromptsIllustration.vue'
import NoSearchResultsIllustration from '~/components/mobile/illustrations/NoSearchResultsIllustration.vue'
import { useCollapsingHeader } from '~/composables/useCollapsingHeader'

const { t } = useI18n()
const router = useRouter()
const { progress: headerProgress, onIonScroll } = useCollapsingHeader()

// 滚动位置相关
const ionContentRef = ref<any>(null)
let savedScrollTop = 0
let lastNavIntent: 'view' | 'mutation' | null = null
let didReloadOnEnter = false
let isPageActive = true
let pendingRealtimeRefresh = false
let realtimeRefreshTimer: ReturnType<typeof setTimeout> | null = null
let realtimeRefreshRunning = false
let searchTimer: ReturnType<typeof setTimeout> | null = null
let promptLoadSequence = 0

// 状态
const prompts = ref<Prompt[]>([])
const categories = ref<Category[]>([])
const loading = ref(true)
const searchText = ref('')
// 搜索栏展开状态：默认收起为左上角图标，点击后原地展开为 ion-searchbar
const isSearchActive = ref(false)
const searchbarRef = ref<any>(null)
const selectedCategory = ref<number | null>(null)
const selectedTag = ref<string | null>(null)
const showFavoritesOnly = ref(false)
const sortType = ref('updatedAt')
const showFilterModal = ref(false)
const currentPage = ref(1)
const pageSize = 20
const hasNextPage = ref(false)
const totalCount = ref(0)
// 是否存在已启用的 AI 配置：跨组件共享状态，另见底部浮动导航的两态按钮布局
// （src/renderer/pages/MobileMainPage.vue），两处依赖同一份数据，不再各自查库。
const { hasAIConfig, refreshAIConfigStatus } = useAIConfigStatus()
const viewMode = ref<'list' | 'waterfall'>(
  (localStorage.getItem('mobilePromptViewMode') as 'list' | 'waterfall') || 'list'
)

watch(viewMode, val => {
  localStorage.setItem('mobilePromptViewMode', val)
})

// 排序选项
const sortOptions = computed(() => [
  { label: t('promptManagement.sortByUpdatedAt'), value: 'updatedAt' },
  { label: t('promptManagement.sortByCreatedAt'), value: 'createdAt' },
  { label: t('promptManagement.sortByTitle'), value: 'title' }
])

// 是否有激活的筛选
const hasActiveFilters = computed(() => {
  return selectedCategory.value !== null || showFavoritesOnly.value || selectedTag.value !== null
})

// 是否处于搜索或筛选状态：用于区分「完全没有数据」与「搜索/筛选后没有匹配结果」两种空状态
const isSearchOrFilterActive = computed(() => {
  return hasActiveFilters.value || searchText.value.trim().length > 0
})

// 加载提示词列表
const loadPrompts = async (append = false, options: { showLoading?: boolean } = {}) => {
  const showLoading = options.showLoading ?? true
  const loadId = ++promptLoadSequence

  if (!append) {
    if (showLoading) {
      loading.value = true
    }
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

    if (loadId !== promptLoadSequence) {
      return
    }

    if (append) {
      prompts.value = [...prompts.value, ...(result.data || [])]
    } else {
      prompts.value = result.data || []
    }
    hasNextPage.value = result.hasNextPage || false
    totalCount.value = result.total || 0
  } catch (error) {
    if (loadId !== promptLoadSequence) {
      return
    }
    console.error('加载提示词失败:', error)
    await showToast(t('promptManagement.loadFailed'), 'danger')
  } finally {
    if (loadId === promptLoadSequence && !append && showLoading) {
      loading.value = false
    }
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
const getCategoryName = (categoryId: number | null) => {
  if (!categoryId) return t('promptManagement.noCategory')
  const category = categories.value.find(c => c.id === categoryId)
  return category?.name || t('promptManagement.noCategory')
}

// 获取内容的第一行
const getFirstLineOfContent = (content: string | undefined) => {
  if (!content) return t('promptManagement.detailModal.noDescription')
  const firstLine = content.split('\n')[0].trim()
  return firstLine.length > 50 ? firstLine.substring(0, 50) + '...' : firstLine
}

// 展开搜索框：先切到展开态渲染出 ion-searchbar，再等它挂载后调用官方的 setFocus()
// 自动聚焦，避免手写 CSS 展开动画——过渡效果交给 ion-searchbar 自身的 animated 属性。
const openSearch = async () => {
  isSearchActive.value = true
  await nextTick()
  await searchbarRef.value?.$el?.setFocus?.()
}

// 收起搜索框：由 ion-searchbar 内置的取消按钮（show-cancel-button="always"）触发。
// 取消按钮本身会清空输入，但它的清空逻辑内部有一个 64ms 的 setTimeout（见 @ionic/core
// 的 onClearInput 实现），而这里一收起就用 v-if 把 ion-searchbar 卸载，
// disconnectedCallback 会提前清掉那个 setTimeout，导致清空动作根本来不及执行——
// 结果是搜索词和筛选结果都会原样留在收起前的状态。因此这里仍需和
// clearSearchAndFilters 一样，显式清空 searchText 并重新加载一次列表。
const closeSearch = () => {
  isSearchActive.value = false
  if (searchTimer) {
    clearTimeout(searchTimer)
    searchTimer = null
  }
  if (searchText.value) {
    searchText.value = ''
    loadPrompts()
  }
}

// 搜索处理
const handleSearch = () => {
  if (searchTimer) {
    clearTimeout(searchTimer)
  }

  searchTimer = setTimeout(() => {
    searchTimer = null
    loadPrompts()
  }, 260)
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
const handleCategoryFilter = (categoryId: number | null) => {
  selectedCategory.value = categoryId
  showFilterModal.value = false
  loadPrompts()
}

// 清除分类筛选
const clearCategory = () => {
  selectedCategory.value = null
  loadPrompts()
}

// 清除搜索词和全部筛选条件（搜索/筛选后无匹配结果时的空状态操作）
const clearSearchAndFilters = () => {
  if (searchTimer) {
    clearTimeout(searchTimer)
    searchTimer = null
  }
  searchText.value = ''
  selectedCategory.value = null
  selectedTag.value = null
  showFavoritesOnly.value = false
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
  lastNavIntent = 'view'
  router.push(`/prompt/detail/${prompt.id}`)
}

// 编辑提示词
const handleEdit = (prompt: Prompt) => {
  lastNavIntent = 'mutation'
  router.push(`/prompt/edit/${prompt.id}`)
}

// 创建提示词
const handleCreate = () => {
  lastNavIntent = 'mutation'
  router.push('/prompt/create')
}

// 导航到AI生成器
const navigateToAIGenerator = () => {
  router.push('/ai-generator')
}

// 删除提示词
const handleDelete = async (prompt: Prompt) => {
  const alert = await alertController.create({
    header: t('common.confirm'),
    message: t('promptManagement.confirmDeletePrompt', { title: prompt.title }),
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
            prompts.value = prompts.value.filter(item => item.id !== prompt.id)
            totalCount.value = Math.max(0, totalCount.value - 1)
            await showToast(t('promptManagement.deleteSuccess'))
            scheduleRealtimeRefresh()
          } catch (error) {
            console.error('删除提示词失败:', error)
            await showToast(t('promptManagement.deleteFailed'), 'danger')
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

const showToast = async (message: string, color: string = 'success') => {
  await presentMobileToast(message, color)
}

const reloadRealtimeData = async (showLoading = false) => {
  await Promise.all([
    loadCategories(),
    loadPrompts(false, { showLoading }),
    refreshAIConfigStatus()
  ])
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
      await reloadRealtimeData(showLoading)
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

const unsubscribeDataChanges = onDataChange(['prompts', 'categories', 'ai_configs'], scheduleRealtimeRefresh)

// 初始化
onMounted(async () => {
  await loadCategories()
  await loadPrompts()
  await refreshAIConfigStatus()
})

// 离开页面时保存滚动位置
onIonViewWillLeave(async () => {
  isPageActive = false
  const scrollEl = await ionContentRef.value?.$el?.getScrollElement?.()
  savedScrollTop = scrollEl?.scrollTop ?? 0
})

// 进入页面：优先消费数据层变更；保留 mutation 意图作为旧路径兜底
onIonViewWillEnter(() => {
  const isMutation = lastNavIntent === 'mutation'
  lastNavIntent = null
  isPageActive = true

  const shouldReload = pendingRealtimeRefresh || isMutation
  didReloadOnEnter = shouldReload
  if (shouldReload) {
    runRealtimeRefresh(isMutation || prompts.value.length === 0)
  } else {
    refreshAIConfigStatus()
  }
})

// 进入页面后恢复滚动位置（仅查看详情返回时）
onIonViewDidEnter(async () => {
  if (!didReloadOnEnter && savedScrollTop > 0) {
    await ionContentRef.value?.$el?.scrollToPoint?.(0, savedScrollTop, 0)
  }
})

// keep-alive 激活时仅检查 AI 配置
onActivated(() => {
  isPageActive = true
  if (pendingRealtimeRefresh) {
    runRealtimeRefresh(false)
  } else {
    refreshAIConfigStatus()
  }
})

onUnmounted(() => {
  if (searchTimer) {
    clearTimeout(searchTimer)
  }
  if (realtimeRefreshTimer) {
    clearTimeout(realtimeRefreshTimer)
  }
  unsubscribeDataChanges()
})
</script>

<style scoped>
/*
 * 搜索框展开态顶部间距（issue #146）：
 * ion-toolbar 一旦检测到内部有 ion-searchbar，会自动加上内置的
 * `toolbar-searchbar` class，该类会把 .toolbar-container 的
 * padding-top/padding-bottom 清零，并让插槽内容 align-self: start——
 * 这是 Ionic 为「搜索框独占一个 toolbar，紧贴在标题栏正下方」的常见用法
 * 设计的（比如 MobilePromptEditPage.vue 里的标签选择弹层，标题和搜索框
 * 各占一个 toolbar），此时清零并不显眼，因为上方还有标题栏的分割线。
 * 但这里的搜索框是原地替换掉第一个、也是唯一一个 toolbar 里的 ion-title，
 * 这个 toolbar 同时还承担着 Ionic 默认的安全区适配
 * （`ion-header ion-toolbar:first-of-type { padding-top: var(--ion-safe-area-top) }`）。
 * 清零后的搜索框会直接贴住安全区下边缘——在没有安全区的设备上则是直接贴住
 * 屏幕物理顶边，跟收起态大标题的呼吸空间（.mobile-large-title-bar 同样用了
 * --spacing-sm 作为顶部留白）不一致，视觉上过于拥挤。
 * 这里补回的 padding-top 加在 ion-searchbar 自身而不是 toolbar 上，
 * 是叠加在安全区之上的固定呼吸空间，不会替代安全区适配：有安全区的设备上
 * 两者相加，没有安全区的设备上只有这一份，不会出现间距过大的问题。
 */
ion-toolbar:first-of-type ion-searchbar {
  padding-top: var(--spacing-sm);
}

.filter-chips {
  padding: 8px 16px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  background: var(--ion-background-color);
}

.mobile-list-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 44px;
  padding: 8px 16px;
  margin-bottom: 12px;
  color: var(--ion-color-medium);
  font-size: var(--mobile-font-size-footnote);
}

.view-mode-segment {
  flex: 0 0 auto;
  width: 84px;
  min-width: 84px;
}

/*
 * 纯图标分段控件：解除 Ionic iOS 模式的 min-width / line-height 约束，
 * 否则轨道被撑破（ion-segment 是 overflow: hidden 的 grid），图标会偏移。
 * 通用部分见 assets/styles/mobile.css。
 */
.view-mode-segment ion-segment-button {
  --padding-start: 0;
  --padding-end: 0;
  min-width: 0;
  min-height: 30px;
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

.empty-text {
  color: var(--ion-color-medium);
  margin-bottom: 4px;
}

.prompt-description {
  color: var(--ion-color-medium);
  font-size: var(--mobile-font-size-footnote);
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.prompt-title {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  text-overflow: ellipsis;
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

ion-content {
  /* 让列表底部留出浮动导航（AI 入口条 + 标签栏）的空间，避免最后一项被遮挡 */
  --padding-bottom: calc(env(safe-area-inset-bottom, 0px) + var(--mobile-nav-clearance));
}
</style>
