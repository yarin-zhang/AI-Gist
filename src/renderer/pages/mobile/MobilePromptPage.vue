<template>
  <ion-page>
    <ion-content ref="ionContentRef" class="m-page-content" :fullscreen="true">
      <!-- 下拉刷新 -->
      <ion-refresher slot="fixed" @ionRefresh="handleRefresh">
        <ion-refresher-content></ion-refresher-content>
      </ion-refresher>

      <MobileLargeTitle :title="t('mobileNav.prompts')">
        <button type="button" class="m-btn-c" :aria-label="t('promptLibrary.search')" :aria-expanded="searchOpen"
          @click="toggleSearch">
          <ion-icon :icon="searchOutline" />
        </button>
        <button type="button" class="m-btn-c"
          :aria-label="viewMode === 'waterfall' ? t('mobilePrompt.switchToList') : t('mobilePrompt.switchToGrid')"
          @click="viewMode = viewMode === 'waterfall' ? 'list' : 'waterfall'">
          <ion-icon :icon="viewMode === 'waterfall' ? listOutline : gridOutline" />
        </button>
        <button type="button" class="m-btn-c filter-button" :aria-label="t('mobilePrompt.filterTitle')"
          @click="openFilterSheet">
          <ion-icon :icon="optionsOutline" />
          <span v-if="filterBadge" class="filter-button__badge" aria-hidden="true" />
        </button>
      </MobileLargeTitle>

      <!-- 搜索框：点放大镜展开，「取消」清空并收起 -->
      <div v-if="searchOpen" class="search-row">
        <label class="m-input search-row__field">
          <ion-icon :icon="searchOutline" aria-hidden="true" />
          <input ref="searchInputRef" v-model="searchText" type="search" enterkeyhint="search"
            :aria-label="t('promptManagement.searchPrompt')" :placeholder="t('mobilePrompt.searchPlaceholder')"
            @input="handleSearch" @keydown.enter="blurTarget" />
          <button v-if="searchText" type="button" class="search-clear" :aria-label="t('common.clear')" @click="clearSearch">
            <ion-icon :icon="closeCircle" />
          </button>
        </label>
        <button type="button" class="m-btn search-row__cancel" @click="closeSearch">{{ t('common.cancel') }}</button>
      </div>

      <!-- 分类页签：全部 / 收藏 / 各分类；从筛选面板选了「未分类」时补一个页签 -->
      <nav ref="scopeTabsRef" class="m-tabs" :aria-label="t('promptManagement.category')">
        <button type="button" :class="{ on: activeScope === 'all' }" :aria-pressed="activeScope === 'all'"
          @click="selectScope('all')">
          {{ t('promptLibrary.scopeAll') }}
        </button>
        <button type="button" :class="{ on: activeScope === 'favorites' }" :aria-pressed="activeScope === 'favorites'"
          @click="selectScope('favorites')">
          {{ t('promptLibrary.scopeFavorites') }}
        </button>
        <button v-for="category in categories" :key="category.id" type="button"
          :class="{ on: activeScope === category.id }" :aria-pressed="activeScope === category.id"
          @click="selectScope(category.id ?? 'all')">
          {{ category.name }}
        </button>
        <button v-if="selectedCategory === 'none'" type="button" class="on" aria-pressed="true">
          {{ t('promptLibrary.uncategorized') }}
        </button>
      </nav>

      <div class="m-body m-body--tabbed m-body--acts list-body" :class="{ 'list-body--grid': viewMode === 'waterfall' }">
        <!-- 标签筛选在筛选面板里选，这里显示出来，可以直接移除 -->
        <div v-if="selectedTag" class="m-chips tag-chips">
          <button type="button" class="m-chip on" @click="selectedTag = null">
            <ion-icon :icon="pricetagOutline" aria-hidden="true" />
            {{ selectedTag }}
            <ion-icon :icon="closeCircle" :aria-label="t('promptBrowse.removeFilter')" />
          </button>
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
          <button type="button" class="m-cta empty-action" @click="handleCreate">
            {{ t('promptManagement.create') }}
          </button>
        </div>

        <!-- 空状态：搜索/筛选后没有匹配结果，与「完全没有数据」区分开 -->
        <div v-else-if="prompts.length === 0" class="empty-container">
          <NoSearchResultsIllustration />
          <p class="empty-text">{{ t('promptManagement.noSearchResults') }}</p>
          <p class="empty-description">{{ t('promptManagement.noSearchResultsDescription') }}</p>
          <button type="button" class="m-cta m-cta-2 empty-action" @click="clearSearchAndFilters">
            {{ t('promptManagement.clearSearchAndFilters') }}
          </button>
        </div>

        <!-- 列表显示（V5-M-ListRows）：一组行，有附图的带缩略图；左滑出现编辑、删除 -->
        <div v-else-if="viewMode === 'list'" class="m-group prompt-list">
          <ion-item-sliding v-for="(prompt, index) in prompts" :key="prompt.id">
            <ion-item button :detail="false" :lines="index === prompts.length - 1 ? 'none' : 'inset'" class="prompt-row"
              @click="handleView(prompt)">
              <img v-if="coverOf(prompt)" :src="coverOf(prompt)!" class="prompt-row__thumb" loading="lazy" alt="" />
              <span class="prompt-row__text">
                <span class="prompt-row__title-row">
                  <span class="prompt-row__title">{{ promptDisplayTitle(prompt, t('promptLibrary.untitled')) }}</span>
                  <ion-icon v-if="prompt.isFavorite" :icon="star" class="prompt-row__star" role="img"
                    :aria-label="t('promptLibrary.favorited')" />
                </span>
                <span class="prompt-row__caption">{{ rowCaption(prompt) }}</span>
              </span>
            </ion-item>

            <ion-item-options side="end">
              <ion-item-option color="primary" @click="closeSliding($event); handleEdit(prompt)">
                <ion-icon slot="top" :icon="createOutline"></ion-icon>
                {{ t('common.edit') }}
              </ion-item-option>
              <ion-item-option color="danger" @click="closeSliding($event); handleDelete(prompt)">
                <ion-icon slot="top" :icon="trashOutline"></ion-icon>
                {{ t('common.delete') }}
              </ion-item-option>
            </ion-item-options>
          </ion-item-sliding>
        </div>

        <!-- 双列显示（V5-M-List，默认） -->
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
      </div>
    </ion-content>

    <!-- 底部操作条：AI 生成 + 新建，内容滚到它后面时淡出 -->
    <div class="m-fade" aria-hidden="true" />
    <div class="m-acts">
      <button type="button" class="m-ai" @click="navigateToAIGenerator">
        <ion-icon :icon="sparkles" aria-hidden="true" />
        <span>{{ t('promptManagement.aiGenerate') }}</span>
      </button>
      <button type="button" class="m-add" :aria-label="t('promptLibrary.create')" @click="handleCreate">
        <ion-icon :icon="add" />
      </button>
    </div>

    <MobilePromptFilterSheet
      :open="showFilterModal"
      v-model:view-mode="viewMode"
      v-model:sort-type="sortType"
      v-model:category="selectedCategory"
      v-model:tag="selectedTag"
      v-model:favorites-only="showFavoritesOnly"
      :categories="categories"
      :tags="tagOptions"
      :result-count="totalCount"
      :has-changes="hasActiveFilters || sortType !== DEFAULT_SORT"
      @reset="resetFilters"
      @close="showFilterModal = false"
    />
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, watch, onActivated, onUnmounted } from 'vue'
import {
  IonPage,
  IonContent,
  IonItem,
  IonIcon,
  IonRefresher,
  IonRefresherContent,
  IonInfiniteScroll,
  IonInfiniteScrollContent,
  IonSpinner,
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
  closeCircle,
  createOutline,
  gridOutline,
  listOutline,
  optionsOutline,
  pricetagOutline,
  searchOutline,
  sparkles,
  star,
  trashOutline
} from 'ionicons/icons'
import { useI18n } from '~/composables/useI18n'
import { useAIConfigStatus } from '~/composables/useAIConfigStatus'
import { api } from '~/lib/api'
import { onDataChange } from '~/lib/services/data-change-events'
import { presentMobileToast } from '~/lib/utils/mobile-toast'
import { collectPromptTags } from '~/lib/utils/prompt-library'
import { getActivePromptVariables } from '~/lib/utils/prompt-template'
import type { Prompt, Category } from '@shared/types'
import type { PromptWithRelations } from '@shared/types/database'
import { useRouter } from 'vue-router'
import MobileLargeTitle from '~/components/mobile/ui/MobileLargeTitle.vue'
import MobileWaterfallView from '~/components/mobile/MobileWaterfallView.vue'
import MobilePromptFilterSheet from '~/components/mobile/prompt/MobilePromptFilterSheet.vue'
import EmptyPromptsIllustration from '~/components/mobile/illustrations/EmptyPromptsIllustration.vue'
import NoSearchResultsIllustration from '~/components/mobile/illustrations/NoSearchResultsIllustration.vue'
import {
  promptDisplayTitle,
  type MobileCategoryFilter,
  type MobilePromptSort
} from '~/components/mobile/prompt/prompt-meta'
import { usePromptCovers } from '~/components/mobile/prompt/usePromptCovers'

const DEFAULT_SORT: MobilePromptSort = 'updatedAt'
const VIEW_MODE_KEY = 'mobilePromptViewMode'

const { t } = useI18n()
const router = useRouter()

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
const tagOptions = ref<{ name: string; count: number }[]>([])
const loading = ref(true)
const searchText = ref('')
const selectedCategory = ref<MobileCategoryFilter>(null)
const selectedTag = ref<string | null>(null)
const showFavoritesOnly = ref(false)
const sortType = ref<MobilePromptSort>(DEFAULT_SORT)
const showFilterModal = ref(false)
const searchOpen = ref(false)
const searchInputRef = ref<HTMLInputElement | null>(null)
const scopeTabsRef = ref<HTMLElement | null>(null)
const currentPage = ref(1)
const pageSize = 20
const hasNextPage = ref(false)
// 当前搜索/筛选下的结果数（筛选面板底部按钮用）
const totalCount = ref(0)
const { coverOf } = usePromptCovers(() => prompts.value)
// 是否存在已启用的 AI 配置：跨组件共享状态，进入页面和配置变化时刷新
const { refreshAIConfigStatus } = useAIConfigStatus()

// 默认双列；用户切到列表后记住
const readViewMode = (): 'list' | 'waterfall' => {
  try {
    return localStorage.getItem(VIEW_MODE_KEY) === 'list' ? 'list' : 'waterfall'
  } catch {
    return 'waterfall'
  }
}

const viewMode = ref<'list' | 'waterfall'>(readViewMode())

watch(viewMode, val => {
  try {
    localStorage.setItem(VIEW_MODE_KEY, val)
  } catch {
    // 本机存储不可用时只影响下次打开的显示方式
  }
})

// 是否有激活的筛选
const hasActiveFilters = computed(() => {
  return selectedCategory.value !== null || showFavoritesOnly.value || selectedTag.value !== null
})

// 当前页签：选了分类就是那个分类，否则看是不是只看收藏
const activeScope = computed<'all' | 'favorites' | number | 'none'>(() => {
  if (selectedCategory.value !== null) return selectedCategory.value
  return showFavoritesOnly.value ? 'favorites' : 'all'
})

// 筛选按钮上的小圆点：只标页签和标签芯片上看不出来的条件（改过排序、收藏和分类同时生效）
const filterBadge = computed(() => (
  sortType.value !== DEFAULT_SORT || (showFavoritesOnly.value && selectedCategory.value !== null)
))

// 是否处于搜索或筛选状态：用于区分「完全没有数据」与「搜索/筛选后没有匹配结果」两种空状态
const isSearchOrFilterActive = computed(() => {
  return hasActiveFilters.value || searchText.value.trim().length > 0
})

const categoryById = computed(() => new Map(categories.value.map(category => [category.id, category])))
const categoryOf = (prompt: Prompt) => (prompt.categoryId ? categoryById.value.get(prompt.categoryId) : undefined)

const variableCountOf = (prompt: Prompt) => getActivePromptVariables(prompt as PromptWithRelations).length

// 列表行第二行：分类 · 变量数
const rowCaption = (prompt: Prompt) => {
  const category = categoryOf(prompt)?.name || t('promptLibrary.uncategorized')
  const count = variableCountOf(prompt)
  return count ? `${category} · ${t('promptLibrary.variableCount', { count })}` : category
}

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
      // 'none' 只看未分类：服务层约定 categoryId 为 null 时筛未分类
      categoryId: selectedCategory.value === 'none' ? null : selectedCategory.value ?? undefined,
      tags: selectedTag.value || undefined,
      isFavorite: showFavoritesOnly.value || undefined,
      sortBy: sortType.value
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

// 标签只在筛选面板里用，按使用次数排序
const loadTags = async () => {
  try {
    tagOptions.value = collectPromptTags(await api.prompts.getAllForTags.query())
  } catch (error) {
    console.error('加载标签失败:', error)
  }
}

const openFilterSheet = () => {
  showFilterModal.value = true
  void loadTags()
}

const blurTarget = (event: KeyboardEvent) => {
  (event.target as HTMLElement | null)?.blur()
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

const clearSearch = () => {
  if (searchTimer) {
    clearTimeout(searchTimer)
    searchTimer = null
  }
  searchText.value = ''
  loadPrompts()
}

const focusSearch = async () => {
  await nextTick()
  searchInputRef.value?.focus()
}

// 放大镜：没展开就展开并聚焦；已经展开、还没输入时收起
const toggleSearch = () => {
  if (searchOpen.value && !searchText.value) {
    searchOpen.value = false
    return
  }
  searchOpen.value = true
  void focusSearch()
}

// 「取消」：清空搜索词并收起
const closeSearch = () => {
  searchOpen.value = false
  if (searchText.value || searchTimer) clearSearch()
}

// 下拉刷新
const handleRefresh = async (event: any) => {
  await Promise.all([loadCategories(), loadPrompts()])
  event.target.complete()
}

// 加载更多
const loadMore = async (event: any) => {
  currentPage.value++
  await loadPrompts(true)
  event.target.complete()
}

// 页签：全部、收藏、某个分类三选一
const selectScope = (scope: 'all' | 'favorites' | number) => {
  selectedCategory.value = typeof scope === 'number' ? scope : null
  showFavoritesOnly.value = scope === 'favorites'
}

// 当前页签在横向滚动区外面时（比如从筛选面板选的分类）滚到中间
watch(activeScope, async () => {
  await nextTick()
  const nav = scopeTabsRef.value
  const tab = nav?.querySelector<HTMLElement>('.on')
  if (!nav || !tab) return
  if (tab.offsetLeft >= nav.scrollLeft && tab.offsetLeft + tab.offsetWidth <= nav.scrollLeft + nav.clientWidth) return
  nav.scrollTo({ left: tab.offsetLeft - (nav.clientWidth - tab.offsetWidth) / 2, behavior: 'smooth' })
})

// 筛选面板的「重置」：分类、标签、收藏和排序都回到默认
const resetFilters = () => {
  selectedCategory.value = null
  selectedTag.value = null
  showFavoritesOnly.value = false
  sortType.value = DEFAULT_SORT
}

// 清除搜索词和全部筛选条件（搜索/筛选后无匹配结果时的空状态操作）
const clearSearchAndFilters = () => {
  if (searchTimer) {
    clearTimeout(searchTimer)
    searchTimer = null
  }
  const filtersChanged = hasActiveFilters.value
  searchText.value = ''
  searchOpen.value = false
  selectedCategory.value = null
  selectedTag.value = null
  showFavoritesOnly.value = false
  // 筛选条件变化会由下面的 watch 重新加载；只清了搜索词时这里补一次
  if (!filtersChanged) loadPrompts()
}

// 筛选或排序变化后重新加载（同一轮里的多项改动只触发一次）
watch([selectedCategory, selectedTag, showFavoritesOnly, sortType], () => {
  loadPrompts()
})

const closeSliding = (event: Event) => {
  const sliding = (event.target as HTMLElement | null)?.closest('ion-item-sliding') as (HTMLElement & { close?: () => Promise<boolean> }) | null
  void sliding?.close?.()
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
  lastNavIntent = 'mutation'
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

const showToast = async (message: string, color: string = 'success') => {
  await presentMobileToast(message, color)
}

const reloadRealtimeData = async (showLoading = false) => {
  await Promise.all([
    loadCategories(),
    loadPrompts(false, { showLoading }),
    refreshAIConfigStatus(),
    showFilterModal.value ? loadTags() : Promise.resolve()
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
.list-body {
  gap: 12px;
  padding-top: 4px;
}

/* 双列卡片之间只留 8px，左右边距也收窄到 10px */
.list-body--grid {
  padding-right: 10px;
  padding-left: 10px;
}

.filter-button {
  position: relative;
}

.filter-button__badge {
  position: absolute;
  top: 7px;
  right: 7px;
  width: 8px;
  height: 8px;
  border-radius: 4px;
  background: var(--accent-primary);
  box-shadow: 0 0 0 2px var(--surface-primary);
}

.search-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 12px 8px 0 var(--m-gutter);
}

.search-row__field {
  flex: 1;
  min-width: 0;
}

.search-row__cancel {
  flex: none;
  color: var(--accent-text);
  font-weight: 500;
}

.m-input input::-webkit-search-cancel-button {
  display: none;
}

.search-clear {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  margin-right: -12px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--content-muted);
  font-size: 18px;
  cursor: pointer;
}

.tag-chips ion-icon {
  font-size: 15px;
}

/* 列表行：最低 68，有附图时行首是 44px 缩略图 */
.prompt-row {
  --background: var(--surface-primary);
  --background-activated: var(--surface-secondary);
  --background-activated-opacity: 1;
  --border-color: var(--border-subtle);
  --padding-start: 16px;
  --padding-end: 0;
  --inner-padding-end: 16px;
  --min-height: 68px;
}

.prompt-row__thumb {
  width: 44px;
  height: 44px;
  flex: none;
  margin-right: 12px;
  border-radius: 10px;
  object-fit: cover;
  background: var(--surface-tertiary);
}

.prompt-row__text {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: 10px 0;
}

.prompt-row__title-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.prompt-row__title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--content-primary);
  font-size: var(--m-font-body);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.prompt-row__star {
  flex: none;
  color: var(--accent-favorite);
  font-size: 14px;
}

.prompt-row__caption {
  overflow: hidden;
  color: var(--content-tertiary);
  font-size: var(--m-font-sub);
  text-overflow: ellipsis;
  white-space: nowrap;
}

ion-item-option {
  min-width: 76px;
  font-size: var(--m-font-caption);
  font-weight: 600;
}

ion-item-option ion-icon {
  margin-bottom: 4px;
  font-size: 20px;
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
  padding: 40px 20px;
  text-align: center;
}

.empty-text {
  margin: 0 0 4px;
  color: var(--content-primary);
  font-size: var(--m-font-body);
  font-weight: 600;
}

.empty-action {
  width: auto;
  padding: 0 24px;
}
</style>
