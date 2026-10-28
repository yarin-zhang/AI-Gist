<template>
  <ion-page>
    <ion-content ref="ionContentRef" class="m-page-content" :fullscreen="true">
      <!-- 下拉刷新 -->
      <ion-refresher slot="fixed" @ionRefresh="handleRefresh">
        <ion-refresher-content></ion-refresher-content>
      </ion-refresher>

      <div class="m-wash" aria-hidden="true" />

      <MobileLargeTitle :title="t('mobileNav.prompts')" :subtitle="subtitle">
        <button type="button" class="m-btn-c filter-button" :aria-label="t('mobilePrompt.filterTitle')"
          @click="openFilterSheet">
          <ion-icon :icon="optionsOutline" />
          <span v-if="filterBadge" class="filter-button__badge" aria-hidden="true" />
        </button>
      </MobileLargeTitle>

      <div class="m-body m-body--tabbed m-body--fab list-body">
        <label class="m-input">
          <ion-icon :icon="searchOutline" aria-hidden="true" />
          <input v-model="searchText" type="search" enterkeyhint="search" :aria-label="t('promptManagement.searchPrompt')"
            :placeholder="t('mobilePrompt.searchPlaceholder')" @input="handleSearch" @keydown.enter="blurTarget" />
          <button v-if="searchText" type="button" class="search-clear" :aria-label="t('common.clear')" @click="clearSearch">
            <ion-icon :icon="closeCircle" />
          </button>
        </label>

        <!-- AI 入口：没有可用模型时进入生成页会提示先添加配置 -->
        <button v-if="!searchText" type="button" class="ai-entry" @click="navigateToAIGenerator">
          <span class="ai-entry__glow" aria-hidden="true" />
          <span class="ai-entry__text">
            <span class="ai-entry__title">{{ t('mobilePrompt.aiEntryTitle') }}</span>
            <span class="ai-entry__desc">{{ t('mobilePrompt.aiEntryDescription') }}</span>
          </span>
          <span class="m-tile m-tile-lg ai-entry__tile" aria-hidden="true"><ion-icon :icon="sparkles" /></span>
        </button>

        <!-- 快捷筛选：全部 / 收藏 / 分类，当前标签筛选也在这里显示，可以直接移除 -->
        <div class="m-chips quick-chips">
          <button type="button" class="m-chip" :class="{ on: selectedCategory === null && !showFavoritesOnly }"
            :aria-pressed="selectedCategory === null && !showFavoritesOnly" @click="showAll">
            {{ t('promptLibrary.scopeAll') }}
          </button>
          <button type="button" class="m-chip" :class="{ on: showFavoritesOnly }" :aria-pressed="showFavoritesOnly"
            @click="showFavoritesOnly = !showFavoritesOnly">
            <ion-icon :icon="showFavoritesOnly ? star : starOutline" aria-hidden="true" />
            {{ t('promptLibrary.scopeFavorites') }}
          </button>
          <button v-for="category in categories" :key="category.id" type="button" class="m-chip"
            :class="{ on: selectedCategory === category.id }" :aria-pressed="selectedCategory === category.id"
            @click="toggleCategory(category.id ?? null)">
            <span class="chip-dot"
              :style="{ background: selectedCategory === category.id ? 'currentColor' : categoryColor(category) }" />
            {{ category.name }}
          </button>
          <button v-if="selectedCategory === 'none'" type="button" class="m-chip on" @click="selectedCategory = null">
            {{ t('promptLibrary.uncategorized') }}
            <ion-icon :icon="closeCircle" :aria-label="t('promptBrowse.removeFilter')" />
          </button>
          <button v-if="selectedTag" type="button" class="m-chip on" @click="selectedTag = null">
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

        <!-- 列表显示：左滑出现编辑、删除 -->
        <div v-else-if="viewMode === 'list'" class="prompt-list">
          <ion-item-sliding v-for="prompt in prompts" :key="prompt.id" class="prompt-slide">
            <ion-item button :detail="false" lines="none" class="prompt-card" @click="handleView(prompt)">
              <div class="prompt-card__inner">
                <span class="m-tile m-tile-lg" :style="categoryTileStyle(categoryOf(prompt))" aria-hidden="true">
                  <ion-icon :icon="documentTextOutline" />
                </span>
                <span class="prompt-card__text">
                  <span class="prompt-card__title-row">
                    <span class="prompt-card__title">{{ promptDisplayTitle(prompt, t('promptLibrary.untitled')) }}</span>
                    <ion-icon v-if="prompt.isFavorite" :icon="star" class="prompt-card__star"
                      :aria-label="t('promptLibrary.favorited')" />
                  </span>
                  <span v-if="promptSnippet(prompt)" class="prompt-card__desc">{{ promptSnippet(prompt) }}</span>
                  <span class="prompt-card__meta">
                    <span v-if="variableCountOf(prompt)" class="m-pill m-pill-var">
                      {{ t('promptLibrary.variableCount', { count: variableCountOf(prompt) }) }}
                    </span>
                    <span v-if="prompt.isJinjaTemplate" class="m-pill m-pill-blue">Jinja</span>
                    <span v-for="tag in getTagsArray(prompt.tags).slice(0, 2)" :key="tag" class="m-pill prompt-card__tag">#{{ tag }}</span>
                    <span v-if="getTagsArray(prompt.tags).length > 2" class="m-pill">+{{ getTagsArray(prompt.tags).length - 2 }}</span>
                    <span class="prompt-card__caption">{{ metaCaption(prompt) }}</span>
                  </span>
                </span>
              </div>
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

        <!-- 瀑布流显示 -->
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

    <button type="button" class="m-fab" :aria-label="t('promptLibrary.create')" @click="handleCreate">
      <ion-icon :icon="add" />
    </button>

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
import { ref, computed, onMounted, watch, onActivated, onUnmounted } from 'vue'
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
  documentTextOutline,
  optionsOutline,
  pricetagOutline,
  searchOutline,
  sparkles,
  star,
  starOutline,
  trashOutline
} from 'ionicons/icons'
import { useI18n } from '~/composables/useI18n'
import { useAIConfigStatus } from '~/composables/useAIConfigStatus'
import { api } from '~/lib/api'
import { onDataChange } from '~/lib/services/data-change-events'
import { presentMobileToast } from '~/lib/utils/mobile-toast'
import { formatFriendlyDate } from '~/lib/utils/date'
import { countPromptUsageToday } from '~/lib/utils/prompt-usage'
import { collectPromptTags } from '~/lib/utils/prompt-library'
import { getActivePromptVariables } from '~/lib/utils/prompt-template'
import { getTagsArray } from '~/lib/utils/tag-colors'
import type { Prompt, Category } from '@shared/types'
import type { PromptWithRelations } from '@shared/types/database'
import { useRouter } from 'vue-router'
import MobileLargeTitle from '~/components/mobile/ui/MobileLargeTitle.vue'
import MobileWaterfallView from '~/components/mobile/MobileWaterfallView.vue'
import MobilePromptFilterSheet from '~/components/mobile/prompt/MobilePromptFilterSheet.vue'
import EmptyPromptsIllustration from '~/components/mobile/illustrations/EmptyPromptsIllustration.vue'
import NoSearchResultsIllustration from '~/components/mobile/illustrations/NoSearchResultsIllustration.vue'
import {
  categoryColor,
  categoryTileStyle,
  promptDisplayTitle,
  promptSnippet,
  type MobileCategoryFilter,
  type MobilePromptSort
} from '~/components/mobile/prompt/prompt-meta'

const DEFAULT_SORT: MobilePromptSort = 'updatedAt'
const VIEW_MODE_KEY = 'mobilePromptViewMode'

const { t, locale } = useI18n()
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
const currentPage = ref(1)
const pageSize = 20
const hasNextPage = ref(false)
// 当前搜索/筛选下的结果数，以及整个提示词库的条数（副标题用）
const totalCount = ref(0)
const libraryTotal = ref(0)
const usedToday = ref(countPromptUsageToday())
// 是否存在已启用的 AI 配置：跨组件共享状态，进入页面和配置变化时刷新
const { refreshAIConfigStatus } = useAIConfigStatus()

const readViewMode = (): 'list' | 'waterfall' => {
  try {
    return localStorage.getItem(VIEW_MODE_KEY) === 'waterfall' ? 'waterfall' : 'list'
  } catch {
    return 'list'
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

const subtitle = computed(() => [
  t('mobilePrompt.listCount', { count: libraryTotal.value }),
  t('mobilePrompt.usedToday', { count: usedToday.value })
].join(' · '))

// 是否有激活的筛选
const hasActiveFilters = computed(() => {
  return selectedCategory.value !== null || showFavoritesOnly.value || selectedTag.value !== null
})

// 筛选按钮上的小圆点：有筛选条件或改过排序
const filterBadge = computed(() => hasActiveFilters.value || sortType.value !== DEFAULT_SORT)

// 是否处于搜索或筛选状态：用于区分「完全没有数据」与「搜索/筛选后没有匹配结果」两种空状态
const isSearchOrFilterActive = computed(() => {
  return hasActiveFilters.value || searchText.value.trim().length > 0
})

const categoryById = computed(() => new Map(categories.value.map(category => [category.id, category])))
const categoryOf = (prompt: Prompt) => (prompt.categoryId ? categoryById.value.get(prompt.categoryId) : undefined)

const variableCountOf = (prompt: Prompt) => getActivePromptVariables(prompt as PromptWithRelations).length

const metaCaption = (prompt: Prompt) => {
  const category = categoryOf(prompt)?.name || t('promptLibrary.uncategorized')
  const date = prompt.updatedAt ? formatFriendlyDate(prompt.updatedAt, locale.value, { withTime: false }) : ''
  return date ? `${category} · ${date}` : category
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
    const filtered = isSearchOrFilterActive.value

    const [result, library] = await Promise.all([
      api.prompts.getAll.query(filters),
      // 有搜索或筛选时，副标题的总条数要另查一次整个库
      filtered && !append ? api.prompts.getAll.query({ page: 1, limit: 1 }) : Promise.resolve(null)
    ])

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
    if (library) libraryTotal.value = library.total || 0
    else if (!filtered) libraryTotal.value = totalCount.value
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

// 下拉刷新
const handleRefresh = async (event: any) => {
  usedToday.value = countPromptUsageToday()
  await Promise.all([loadCategories(), loadPrompts()])
  event.target.complete()
}

// 加载更多
const loadMore = async (event: any) => {
  currentPage.value++
  await loadPrompts(true)
  event.target.complete()
}

// 快捷筛选
const showAll = () => {
  selectedCategory.value = null
  showFavoritesOnly.value = false
}

const toggleCategory = (categoryId: number | null) => {
  selectedCategory.value = selectedCategory.value === categoryId ? null : categoryId
}

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
            libraryTotal.value = Math.max(0, libraryTotal.value - 1)
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
  usedToday.value = countPromptUsageToday()
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
  // 从使用页复制回来后，「今天用了几次」要跟着变
  usedToday.value = countPromptUsageToday()

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
  gap: 14px;
  padding-top: 14px;
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

/* AI 入口卡片：品牌渐变实底，白字 */
.ai-entry {
  position: relative;
  display: flex;
  align-items: center;
  gap: 14px;
  overflow: hidden;
  width: 100%;
  padding: 16px 16px 16px 18px;
  border: 0;
  border-radius: 20px;
  background: linear-gradient(135deg, var(--accent-brand), var(--accent-primary));
  box-shadow: var(--shadow-floating);
  color: var(--content-inverse);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.ai-entry:active {
  opacity: 0.9;
}

.ai-entry__glow {
  position: absolute;
  top: -36px;
  right: -28px;
  width: 120px;
  height: 120px;
  border-radius: 60px;
  background: color-mix(in srgb, var(--content-inverse) 10%, transparent);
}

.ai-entry__text {
  position: relative;
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.ai-entry__title {
  font-size: var(--m-font-body);
  font-weight: 600;
}

.ai-entry__desc {
  font-size: var(--m-font-sub);
  opacity: 0.86;
}

.ai-entry__tile {
  position: relative;
  background: color-mix(in srgb, var(--content-inverse) 18%, transparent);
  color: var(--accent-favorite);
}

.quick-chips .chip-dot {
  width: 8px;
  height: 8px;
  flex: none;
  border-radius: 2px;
}

.quick-chips ion-icon {
  font-size: 15px;
}

.prompt-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* 每条提示词是一张圆角卡片，左滑露出操作按钮 */
.prompt-slide {
  overflow: hidden;
  border-radius: var(--m-radius-card);
  box-shadow: var(--shadow-card);
}

.prompt-card {
  --background: var(--surface-primary);
  --background-activated: var(--surface-secondary);
  --background-activated-opacity: 1;
  --padding-start: 14px;
  --padding-end: 0;
  --inner-padding-end: 14px;
  --padding-top: 14px;
  --padding-bottom: 14px;
  --min-height: 0;
  --border-width: 0;
  --inner-border-width: 0;
}

.prompt-card__inner {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  width: 100%;
  min-width: 0;
}

.prompt-card__text {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.prompt-card__title-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.prompt-card__title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  color: var(--content-primary);
  font-size: var(--m-font-body);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.prompt-card__star {
  flex: none;
  color: var(--accent-favorite);
  font-size: 16px;
}

.prompt-card__desc {
  overflow: hidden;
  color: var(--content-secondary);
  font-size: var(--m-font-sub);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.prompt-card__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 6px;
  min-width: 0;
  margin-top: 4px;
}

/* m-pill 是 flex 容器，省略号不生效；标签胶囊改成行内块，超长时以省略号结尾 */
.m-pill.prompt-card__tag {
  display: inline-block;
  max-width: 96px;
  overflow: hidden;
  line-height: 22px;
  text-overflow: ellipsis;
}

.prompt-card__caption {
  min-width: 0;
  overflow: hidden;
  color: var(--content-tertiary);
  font-size: var(--m-font-caption);
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
