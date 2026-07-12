<template>
    <div class="prompt-list">
        <!-- 搜索和过滤器 -->
        <section class="prompt-filter-bar ui-toolbar">
            <NFlex vertical :size="getCardSpacing()">
                <NFlex wrap align="center" class="prompt-toolbar-row">
                    <NInput v-model:value="searchText" :placeholder="t('promptManagement.searchPrompt')" class="prompt-search-input"
                        @input="handleSearch" clearable>
                        <template #prefix>
                            <NIcon>
                                <Search />
                            </NIcon>
                        </template>
                    </NInput>
                    <NSelect v-model:value="sortType" :options="sortOptions" :placeholder="t('promptManagement.sortBy')"
                        class="prompt-sort-select" />
                    <NButton secondary :type="showAdvancedFilter ? 'primary' : 'default'" @click="toggleAdvancedFilter">
                        <template #icon>
                            <NIcon>
                                <Tag />
                            </NIcon>
                        </template>
                        {{ t('promptManagement.advancedFilter') }}
                    </NButton>
                    <NButton secondary :type="showFavoritesOnly ? 'primary' : 'default'" @click="toggleFavoritesFilter">
                        <template #icon>
                            <NIcon>
                                <Heart />
                            </NIcon>
                        </template>
                        {{ t('promptManagement.favorites') }}
                    </NButton>
                    <NButton secondary @click="$emit('manage-categories')">
                        <template #icon>
                            <NIcon>
                                <Folder />
                            </NIcon>
                        </template>
                        {{ t('promptManagement.categories') }}
                    </NButton>
                    <NButtonGroup v-if="!hideViewSwitcher">
                        <NButton :type="viewMode === 'grid' ? 'primary' : 'default'" @click="setViewMode('grid')">
                            <template #icon>
                                <NIcon>
                                    <GridDots />
                                </NIcon>
                            </template>
                        </NButton>
                        <NButton :type="viewMode === 'table' ? 'primary' : 'default'" @click="setViewMode('table')">
                            <template #icon>
                                <NIcon>
                                    <List />
                                </NIcon>
                            </template>
                        </NButton>
                        <NButton :type="viewMode === 'tree' ? 'primary' : 'default'" @click="setViewMode('tree')">
                            <template #icon>
                                <NIcon>
                                    <Folder />
                                </NIcon>
                            </template>
                        </NButton>
                    </NButtonGroup>
                </NFlex>
                <!-- 搜索提示信息 -->
                <div v-if="searchText.trim() || selectedTag || selectedCategory || showFavoritesOnly"
                    class="active-filter-summary">
                    <NFlex justify="space-between" align="center">
                        <NFlex align="center">
                            <NIcon size="14" style="margin-right: 4px; vertical-align: middle;">
                                <Search />
                            </NIcon>
                            <span v-if="searchText.trim()">{{ t('promptManagement.searchingFor', {
                                text: searchText.trim() }) }}</span>
                            <span v-if="selectedTag && !searchText.trim()">{{ t('promptManagement.searchingForTag', {
                                tag: selectedTag }) }}</span>
                            <span v-if="selectedTag && searchText.trim()">{{ t('promptManagement.searchingForTag', {
                                tag: selectedTag }) }} + {{ t('promptManagement.searchingFor', {
                                text: searchText.trim() }) }}</span>
                            <span v-if="selectedCategory"> {{ t('promptManagement.categoryFilter', {
                                name: getCategoryName(selectedCategory) }) }}</span>
                            <span v-if="showFavoritesOnly">{{ t('promptManagement.favoritesOnly') }}</span>
                            <span v-if="!initialLoading" style="margin-left: 8px; color: var(--n-color-primary);">
                                ({{ t('promptManagement.foundResults', { count: totalCount }) }}{{ hasNextPage || prompts.length
                                    < totalCount ? `，${t('promptManagement.showingResults', { count: prompts.length })}` : '' }})
                            </span>
                        </NFlex>
                        <NButton text size="small" @click="clearAllFilters">
                            {{ t('common.clear') }}
                        </NButton>
                    </NFlex>
                </div>

                <!-- 分类和标签筛选区域 (仅在高级筛选开启时显示) -->
                <div v-if="showAdvancedFilter" class="advanced-filter-panel">
                    <!-- 分类快捷筛选 -->
                    <div v-if="categories.length > 0" :style="{ padding: categoriesExpanded ? '4px 0' : '2px 0' }">
                        <NFlex justify="space-between" align="center" style="margin-bottom: 6px;">
                            <NText depth="2" style="font-size: 14px; font-weight: 500;">{{
                                t('promptManagement.categoryFilterTitle') }}
                            </NText>
                            <NButton text size="small" @click="toggleCategoriesExpanded">
                                <template #icon>
                                    <NIcon>
                                        <ChevronDown v-if="!categoriesExpanded" />
                                        <ChevronUp v-else />
                                    </NIcon>
                                </template>
                                {{ categoriesExpanded ? t('promptManagement.collapse') : t('promptManagement.expand') }}
                            </NButton>
                        </NFlex>
                        <div v-show="categoriesExpanded">
                            <NFlex size="small" wrap>
                                <NTag size="small" :bordered="false" :checked="!selectedCategory" checkable
                                    @click="handleCategoryQuickFilter(null)" style="cursor: pointer;">
                                    <template #icon>
                                        <NIcon>
                                            <Box />
                                        </NIcon>
                                    </template>
                                    {{ t('promptManagement.allCategories') }} ({{ statistics.totalCount }})
                                </NTag>
                                <NTag v-for="category in categories" :key="category.id" size="small" :bordered="false"
                                    :checked="selectedCategory === category.id" checkable
                                    :color="getCategoryTagColor(category)"
                                    @click="handleCategoryQuickFilter(category.id || null)" style="cursor: pointer;">
                                    <template #icon>
                                        <NIcon>
                                            <Box />
                                        </NIcon>
                                    </template>
                                    {{ category.name }} ({{ getCategoryPromptCount(category.id || null) }})
                                </NTag>
                            </NFlex>
                        </div>
                    </div>

                    <!-- 热门标签快捷搜索 -->
                    <div v-if="popularTags.length > 0" :style="{ padding: tagsExpanded ? '4px 0' : '2px 0' }">
                        <NFlex justify="space-between" align="center" style="margin-bottom: 6px;">
                            <NText depth="2" style="font-size: 14px; font-weight: 500;">{{
                                t('promptManagement.popularTags') }}</NText>
                            <NButton text size="small" @click="toggleTagsExpanded">
                                <template #icon>
                                    <NIcon>
                                        <ChevronDown v-if="!tagsExpanded" />
                                        <ChevronUp v-else />
                                    </NIcon>
                                </template>
                                {{ tagsExpanded ? t('promptManagement.collapse') : t('promptManagement.expand') }}
                            </NButton>
                        </NFlex>
                        <div v-show="tagsExpanded">
                            <NFlex size="small" wrap>
                                <NTag v-for="tag in (tagsExpanded ? popularTags : popularTags.slice(0, 6))"
                                    :key="tag.name" size="small" :bordered="false" clickable
                                    :color="getTagColor(tag.name)" @click="handleTagQuickSearch(tag.name)"
                                    :checked="selectedTag === tag.name"
                                    style="cursor: pointer;" :class="{ 'highlighted-tag': isTagMatched(tag.name) }">
                                    <template #icon>
                                        <NIcon>
                                            <Tag />
                                        </NIcon>
                                    </template>
                                    {{ tag.name }} ({{ tag.count }})
                                </NTag>
                            </NFlex>
                        </div>
                    </div>
                </div>
            </NFlex>
        </section>

        <div class="prompt-list-body">
            <div v-if="initialLoading" class="prompt-list-state">
                <NSpin size="large" />
            </div>
            <div v-else-if="(viewMode === 'grid' && prompts.length === 0 && !hasNextPage) ||
                (viewMode === 'tree' && treeData.length === 0) ||
                (viewMode === 'table' && prompts.length === 0)" class="prompt-list-state">
                <NEmpty :description="t('promptManagement.noPrompts')" />
            </div>
            <div v-else class="prompt-list-results">
            <!-- 批量操作工具栏 (仅在表格视图且有选中项时显示) -->
            <div v-if="viewMode === 'table' && selectedRows.length > 0" class="batch-action-bar">
                <NCard size="small">
                    <NFlex justify="space-between" align="center">
                        <NText>{{ t('promptManagement.selectedPrompts', { count: selectedRows.length }) }}</NText>
                        <NFlex size="small">
                            <NPopconfirm @positive-click="handleBatchDelete">
                                <template #trigger>
                                    <NButton type="error" size="small">
                                        <template #icon>
                                            <NIcon>
                                                <Trash />
                                            </NIcon>
                                        </template>
                                        {{ t('promptManagement.batchDelete') }}
                                    </NButton>
                                </template>
                                {{ t('promptManagement.confirmBatchDelete', { count: selectedRows.length }) }}
                            </NPopconfirm>
                            <NButton size="small" @click="clearSelection">{{ t('promptManagement.cancelSelection') }}
                            </NButton>
                        </NFlex>
                    </NFlex>
                </NCard>
            </div>

            <!-- 树形表格视图 -->
            <div v-if="viewMode === 'tree'" class="data-view-surface folder-view-table">
                <NDataTable :columns="redesignedTreeTableColumns" :data="treeData" :loading="initialLoading"
                    :row-key="(row: TreeNode) => row.type === 'category' ? `category-${(row.data as CategoryWithRelations).id}` : `prompt-${(row.data as PromptWithRelations).id}`"
                    v-model:checked-row-keys="selectedRowKeys" flex-height style="height: 100%" :scroll-x="900"
                    :row-props="getTreeRowProps"
                    :tree-props="{ children: 'children', hasChildren: 'hasChildren' }" default-expand-all />
            </div>

            <!-- 表格视图 -->
            <div v-else-if="viewMode === 'table'" class="data-view-surface table-view-table">
                <NDataTable :columns="redesignedTableColumns" :data="prompts" :loading="initialLoading || loadingMore"
                    :row-key="(row: PromptWithRelations) => row.id!" v-model:checked-row-keys="selectedRowKeys"
                    :pagination="tablePagination" flex-height style="height: 100%" :scroll-x="980"
                    :row-props="getTableRowProps" remote />
            </div>

            <!-- 网格视图 (原有的无限滚动) -->
            <div v-else class="grid-scroll-region"> <!-- 无限滚动容器 -->
                <NInfiniteScroll :distance="100" @load="handleLoadMore" :style="{ minHeight: '400px' }">
                    <div class="prompt-grid">
                        <NCard v-for="prompt in prompts" :key="prompt.id" class="prompt-card" size="small"
                            @click="$emit('view', prompt)">
                            <template #header>
                                <div class="prompt-card-title-block">
                                    <NText strong class="prompt-card-title">{{ prompt.title }}</NText>
                                    <NText depth="3" class="prompt-card-kind">
                                        {{ prompt.isJinjaTemplate ? 'Jinja' : t('promptManagement.regularMode') }}
                                    </NText>
                                </div>
                            </template>

                            <template #header-extra>
                                <NFlex size="small">
                                    <NButton size="small" text @click.stop="handleCopyPrompt(prompt)"
                                        type="default">
                                        <template #icon>
                                            <NIcon>
                                                <Copy />
                                            </NIcon>
                                        </template>
                                    </NButton>
                                    <NButton size="small" text @click.stop="toggleFavorite(prompt.id!)"
                                        :type="prompt.isFavorite ? 'error' : 'default'">
                                        <template #icon>
                                            <NIcon>
                                                <Heart />
                                            </NIcon>
                                        </template>
                                    </NButton>

                                    <NDropdown :options="getPromptActions(prompt)" :icon-size="16"
                                        @select="(key) => handlePromptAction(key, prompt)">
                                        <NButton size="small" text @click.stop>
                                            <template #icon>
                                                <NIcon>
                                                    <DotsVertical />
                                                </NIcon>
                                            </template>
                                        </NButton>
                                    </NDropdown>
                                </NFlex>
                            </template>

                            <NFlex align="center" size="medium" class="prompt-card-main">
                                <!-- 左侧：描述或内容预览 -->
                                <div style="flex: 1; min-width: 0;">
                                    <NText depth="3" v-if="prompt.description" class="description-text">
                                        {{ prompt.description }}
                                    </NText>
                                    <NText depth="3" v-if="!prompt.description"
                                        class="content-preview-text">
                                        {{ prompt.content.substring(0, 100) }}{{ prompt.content.length > 100 ? '...' : '' }}
                                    </NText>
                                </div>
                                
                                <!-- 右侧：图片预览 -->
                                <div v-if="hasValidImage(prompt)" class="prompt-card-thumbnail" @click.stop>
                                    <NImage
                                        :src="getImageUrl(prompt.imageBlobs)"
                                        width="72"
                                        height="72"
                                        object-fit="cover"
                                        style="border-radius: var(--radius-image);"
                                        :preview-disabled="false"
                                        :lazy="true"
                                        @error="handleImageError"
                                        fallback-src=""
                                        @click.stop
                                    />
                                </div>
                            </NFlex>

                            <template #footer>
                                <div class="prompt-card-footer">
                                    <div class="prompt-card-taxonomy">
                                        <NTag v-if="supportsGlobalShortcuts && shortcutBindingFor(prompt.uuid)" size="small" type="success" :bordered="false">
                                            <template #icon><NIcon><Keyboard /></NIcon></template>
                                            {{ displayAccelerator(shortcutBindingFor(prompt.uuid)!.accelerator) }}
                                        </NTag>
                                        <span v-if="prompt.category" class="prompt-card-category">
                                            <span class="category-color-dot" :style="{ background: prompt.category.color || 'var(--content-secondary)' }" />
                                            {{ prompt.category.name }}
                                        </span>
                                        <span v-else class="prompt-card-category">{{ t('promptManagement.noCategory') }}</span>
                                    </div>
                                    <NText depth="3" class="prompt-card-date">{{ formatDate(prompt.updatedAt) }}</NText>
                                </div>
                            </template>
                        </NCard>
                    </div>

                    <!-- 加载更多状态 -->
                    <template #footer>
                        <div v-if="loadingMore" style="text-align: center; padding: 20px;">
                            <NSpin size="medium" />
                            <NText depth="3" style="margin-left: 12px;">{{ t('promptManagement.loadingMore') }}</NText>
                        </div>
                        <div v-else-if="!hasNextPage && prompts.length > 0" style="text-align: center; padding: 20px;">
                            <NText depth="3">{{ t('promptManagement.loadedAllPrompts', { count: totalCount }) }}</NText>
                        </div>
                    </template>
                </NInfiniteScroll>
            </div>
            </div>
        </div>
    </div>
    <ShortcutBindingModal
        v-if="supportsGlobalShortcuts && shortcutBindingPrompt"
        :show="showShortcutBindingModal"
        :prompt-uuid="shortcutBindingPrompt.uuid"
        :prompt-title="shortcutBindingPrompt.title"
        :existing-binding="shortcutBindingFor(shortcutBindingPrompt.uuid)"
        @close="showShortcutBindingModal = false"
        @saved="handleShortcutBindingSaved"
    />
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, h, watch } from 'vue'
import {
    NCard,
    NFlex,
    NText,
    NButton,
    NInput,
    NSelect,
    NIcon,
    NTag,
    NSpin,
    NEmpty,
    NDropdown,
    NInfiniteScroll,
    NDataTable,
    NPopconfirm,
    NButtonGroup,
    NImage,
    NCarousel,
    useMessage
} from 'naive-ui'
import {
    Search,
    Heart,
    DotsVertical,
    Edit,
    Trash,
    Copy,
    Tag,
    Box,
    ChevronDown,
    ChevronUp,
    Folder,
    List,
    GridDots,
    Keyboard,
    FileText
} from '@vicons/tabler'
import { api } from '@/lib/api'
import { useI18n } from 'vue-i18n'
import { useTagColors } from '@/composables/useTagColors'
import { useDatabase } from '@/composables/useDatabase'
import { jinjaService } from '@/lib/utils/jinja.service'
import type { PromptWithRelations, CategoryWithRelations } from '@shared/types/database'
import type { PromptShortcutBinding, ShortcutState } from '@shared/types/preferences'
import ShortcutBindingModal from '@/components/shortcuts/ShortcutBindingModal.vue'
import { PlatformDetector } from '@shared/platform'

interface Emits {
    (e: 'edit', prompt: any): void
    (e: 'view', prompt: any): void
    (e: 'refresh'): void
    (e: 'manage-categories'): void
    (e: 'view-mode-change', mode: 'grid' | 'table' | 'tree'): void
}

interface Props {
    forcedViewMode?: 'grid' | 'table' | 'tree'
    hideViewSwitcher?: boolean
}

const props = withDefaults(defineProps<Props>(), {
    forcedViewMode: 'grid',
    hideViewSwitcher: false,
})

// 树形数据结构类型
interface TreeNode {
    type: 'category' | 'prompt';
    data: CategoryWithRelations | PromptWithRelations;
    children?: TreeNode[];
}

const emit = defineEmits<Emits>()
const message = useMessage()
const { t } = useI18n()
const { waitForDatabase } = useDatabase()
const supportsGlobalShortcuts = PlatformDetector.getCapabilities().globalShortcuts

// 使用标签颜色 composable
const { getTagColor, getTagsArray, getCategoryTagColor } = useTagColors()

// 响应式数据
const prompts = ref<PromptWithRelations[]>([])
const shortcutState = ref<ShortcutState | null>(null)
const shortcutBindingPrompt = ref<PromptWithRelations | null>(null)
const showShortcutBindingModal = ref(false)
const categories = ref<CategoryWithRelations[]>([])
const treeData = ref<TreeNode[]>([])
const statistics = ref<{
    totalCount: number;
    categoryStats: Array<{ id: string | null, name: string, count: number }>;
    popularTags: Array<{ name: string, count: number }>;
}>({
    totalCount: 0,
    categoryStats: [],
    popularTags: []
})
const initialLoading = ref(false) // 首次加载状态
const loadingMore = ref(false) // 加载更多状态
const searchText = ref('')
const selectedCategory = ref<number | null>(null)
const showFavoritesOnly = ref(false)
const selectedTag = ref<string>('') // 添加专门的标签搜索状态

// 排序相关状态
const sortType = ref<'timeDesc' | 'timeAsc' | 'useCount' | 'favorite'>('timeDesc') // 默认按时间倒序排序
const sortOptions = [
    { label: t('promptManagement.sortOptions.latestFirst'), value: 'timeDesc' },
    { label: t('promptManagement.sortOptions.earliestFirst'), value: 'timeAsc' },
    { label: t('promptManagement.sortOptions.useCount'), value: 'useCount' },
    { label: t('promptManagement.sortOptions.favoriteFirst'), value: 'favorite' }
]

// 分页相关状态
const currentPage = ref(1)
const pageSize = ref(10) // 表格视图每页显示数量
const gridPageSize = ref(18) // 网格视图每次加载数量（增加到18，确保充足的内容）
const hasNextPage = ref(true)
const totalCount = ref(0)

// 高级筛选开关
const showAdvancedFilter = ref(false)

// 折叠展开状态
const categoriesExpanded = ref(true) // 高级筛选开启时默认展开
const tagsExpanded = ref(true) // 高级筛选开启时默认展开

// 视图模式状态
const viewMode = ref<'grid' | 'table' | 'tree'>(props.forcedViewMode) // 'grid' | 'table' | 'tree'

// 表格多选相关状态
const selectedRowKeys = ref<(string | number)[]>([])
const selectedRows = computed(() => {
    return prompts.value.filter(prompt => selectedRowKeys.value.includes(prompt.id!))
})

// 表格分页配置
const tablePagination = computed(() => ({
    page: currentPage.value,
    pageSize: pageSize.value,
    itemCount: totalCount.value,
    showSizePicker: true,
    pageSizes: [10, 20, 50, 100],
    showQuickJumper: true,
    pageSlot: 7,
    prefix: ({ itemCount }: { itemCount: number | undefined }) => t('promptManagement.totalItems', { count: itemCount || 0 }),
    onUpdatePage: (page: number) => {
        console.log('Table pagination page changed to:', page)
        currentPage.value = page
        loadPromptsForTable()
    },
    onUpdatePageSize: (size: number) => {
        console.log('Table pagination page size changed to:', size)
        pageSize.value = size
        currentPage.value = 1
        loadPromptsForTable()
    }
}))

// 计算属性
const categoryOptions = computed(() => [
    { label: t('promptManagement.allCategories'), value: null },
    ...categories.value.map(cat => ({
        label: `${cat.name} (${cat.prompts?.length || 0})`,
        value: cat.id
    }))
])

// 获取分类名称
const getCategoryName = (categoryId: number | null) => {
    if (!categoryId) return t('promptManagement.allCategories')
    const category = categories.value.find(cat => cat.id === categoryId)
    return category?.name || t('promptManagement.unknownCategory')
}

// 获取分类下的提示词数量
const getCategoryPromptCount = (categoryId: number | null) => {
    // 首先尝试从统计信息中获取
    const categoryStats = statistics.value.categoryStats.find(stat => stat.id === categoryId?.toString())
    if (categoryStats) {
        return categoryStats.count
    }

    // 如果统计信息中没有，则从分类数据中获取
    if (categoryId === null) {
        // 未分类的数量
        return prompts.value.filter(p => !p.categoryId).length
    } else {
        // 特定分类的数量
        return prompts.value.filter(p => p.categoryId === categoryId).length
    }
}

// 计算卡片间距 - 根据展开状态动态调整
const getCardSpacing = () => {
    // 如果显示高级筛选且有任何区域展开，使用正常间距，否则使用紧凑间距
    if (showAdvancedFilter.value && (categoriesExpanded.value || tagsExpanded.value)) {
        return 'small'
    }
    return 4 // 使用数字表示更小的间距
}

// 计算热门标签
const popularTags = computed(() => {
    return statistics.value.popularTags || []
})

const formatDate = (date: Date | string) => new Date(date).toLocaleDateString()

const renderPromptThumbnail = (prompt: PromptWithRelations) => {
    if (!hasValidImage(prompt)) {
        return h('span', { class: 'table-prompt-placeholder' }, [
            h(NIcon, { size: 17 }, { default: () => h(FileText) })
        ])
    }
    return h(NImage, {
        src: getImageUrl(prompt.imageBlobs),
        width: 40,
        height: 40,
        objectFit: 'cover',
        previewDisabled: true,
        lazy: true,
        onError: handleImageError,
        fallbackSrc: '',
        class: 'table-prompt-thumbnail'
    })
}

const renderPromptIdentity = (prompt: PromptWithRelations) => h(
    'div',
    { class: 'table-prompt-cell' },
    [
        renderPromptThumbnail(prompt),
        h('div', { class: 'table-prompt-copy' }, [
            h(NText, { strong: true, class: 'table-prompt-title' }, { default: () => prompt.title }),
            h(NText, { depth: 3, class: 'table-prompt-description' }, {
                default: () => prompt.description || prompt.content?.slice(0, 90) || '-'
            })
        ])
    ]
)

const renderCategoryCell = (prompt: PromptWithRelations) => {
    if (!prompt.category) return h(NText, { depth: 3 }, { default: () => t('promptManagement.noCategory') })
    return h('span', { class: 'table-category-cell' }, [
        h('span', {
            class: 'category-color-dot',
            style: { background: prompt.category.color || 'var(--content-secondary)' }
        }),
        prompt.category.name
    ])
}

const renderTagsCell = (prompt: PromptWithRelations) => {
    const tags = getTagsArray(prompt.tags || '')
    if (!tags.length) return '-'
    return h(NFlex, { size: 5, wrap: false, class: 'table-tags' }, {
        default: () => [
            ...tags.slice(0, 2).map(tag => h(NTag, {
                size: 'small',
                bordered: false,
                color: getTagColor(tag)
            }, { default: () => tag })),
            ...(tags.length > 2
                ? [h(NText, { depth: 3, class: 'table-tag-overflow' }, { default: () => `+${tags.length - 2}` })]
                : [])
        ]
    })
}

const renderRowActions = (prompt: PromptWithRelations) => h(NFlex, { size: 3, justify: 'end', wrap: false }, {
    default: () => [
        h(NButton, {
            size: 'small', quaternary: true, circle: true,
            onClick: (event: Event) => { event.stopPropagation(); handleCopyPrompt(prompt) }
        }, { icon: () => h(NIcon, { size: 16 }, { default: () => h(Copy) }) }),
        h(NButton, {
            size: 'small', quaternary: true, circle: true,
            type: prompt.isFavorite ? 'error' : 'default',
            onClick: (event: Event) => { event.stopPropagation(); toggleFavorite(prompt.id!) }
        }, { icon: () => h(NIcon, { size: 16 }, { default: () => h(Heart) }) }),
        h(NDropdown, {
            options: getPromptActions(prompt),
            iconSize: 16,
            onSelect: (key: string) => handlePromptAction(key, prompt)
        }, {
            default: () => h(NButton, {
                size: 'small', quaternary: true, circle: true,
                onClick: (event: Event) => event.stopPropagation()
            }, { icon: () => h(NIcon, { size: 16 }, { default: () => h(DotsVertical) }) })
        })
    ]
})

const isInteractiveRowTarget = (event: MouseEvent) => {
    const target = event.target
    return target instanceof HTMLElement && Boolean(target.closest('button, a, input, .n-checkbox, .n-dropdown, .n-image'))
}

const getTableRowProps = (row: PromptWithRelations) => ({
    class: 'prompt-data-row',
    onClick: (event: MouseEvent) => {
        if (!isInteractiveRowTarget(event)) emit('view', row)
    }
})

const getTreeRowProps = (row: TreeNode) => ({
    class: row.type === 'category' ? 'folder-category-row' : 'prompt-data-row folder-prompt-row',
    onClick: (event: MouseEvent) => {
        if (row.type === 'prompt' && !isInteractiveRowTarget(event)) {
            emit('view', row.data as PromptWithRelations)
        }
    }
})

// 树形表格列定义
const treeTableColumns = computed(() => [
    {
        type: 'selection' as const
    },
    {
        title: t('promptManagement.title'),
        key: 'name',
        width: 300,
        ellipsis: {
            tooltip: true
        },
        render: (row: TreeNode) => {
            if (row.type === 'category') {
                const category = row.data as CategoryWithRelations
                return h(
                    NFlex,
                    { align: 'center', size: 'small' },
                    {
                        default: () => [
                            h(NIcon, { size: 16, color: category.color }, { default: () => h(Folder) }),
                            h(NText, { strong: true }, { default: () => category.name }),
                            h(NTag, { size: 'small', type: 'info' }, { default: () => t('promptManagement.categoryPromptCount', { count: category.prompts?.length || 0 }) })
                        ]
                    }
                )
            } else {
                const prompt = row.data as PromptWithRelations
                return h(
                    NButton,
                    {
                        text: true,
                        type: 'primary',
                        onClick: () => emit('view', prompt)
                    },
                    { default: () => prompt.title }
                )
            }
        }
    },
    {
        title: t('promptManagement.preview'),
        key: 'preview',
        width: 80,
        render: (row: TreeNode) => {
            if (row.type === 'category') {
                return '-'
            } else {
                const prompt = row.data as PromptWithRelations
                if (!hasValidImage(prompt)) {
                    return '-'
                }
                
                if (prompt.imageBlobs && Array.isArray(prompt.imageBlobs) && prompt.imageBlobs.length > 1) {
                    return h(
                        NCarousel,
                        {
                            autoplay: true,
                            showDots: false,
                            touchable: true,
                            mousewheel: true,
                            direction: 'vertical',
                            dotPlacement: 'bottom',
                            style: 'width: 50px; height: 50px; border-radius: var(--radius-image); overflow: hidden;'
                        },
                        {
                            default: () => prompt.imageBlobs!.map((blob: Blob, index: number) =>
                                h(
                                    NImage,
                                    {
                                        src: getImageUrlFromBlob(blob),
                                        width: 50,
                                        height: 50,
                                        objectFit: 'cover',
                                        style: 'border-radius: var(--radius-image);',
                                        previewDisabled: false,
                                        lazy: true,
                                        onError: handleImageError,
                                        fallbackSrc: ''
                                    }
                                )
                            )
                        }
                    )
                } else if (prompt.imageBlobs && Array.isArray(prompt.imageBlobs) && prompt.imageBlobs.length === 1) {
                    return h(
                        NImage,
                        {
                            src: getImageUrl(prompt.imageBlobs),
                            width: 50,
                            height: 50,
                            objectFit: 'cover',
                            style: 'border-radius: var(--radius-image);',
                            previewDisabled: false,
                            lazy: true,
                            onError: handleImageError,
                            fallbackSrc: ''
                        }
                    )
                }
                
                return '-'
            }
        }
    },
    {
        title: t('promptManagement.description'),
        key: 'description',
        width: 300,
        ellipsis: {
            tooltip: true
        },
        render: (row: TreeNode) => {
            if (row.type === 'category') {
                const category = row.data as CategoryWithRelations
                return category.description || '-'
            } else {
                const prompt = row.data as PromptWithRelations
                if (prompt.description) {
                    return prompt.description
                }
                const preview = prompt.content?.substring(0, 100) || ''
                return preview + (prompt.content?.length > 100 ? '...' : '')
            }
        }
    },
    {
        title: t('promptManagement.tags'),
        key: 'tags',
        width: 200,
        render: (row: TreeNode) => {
            if (row.type === 'category') {
                return '-'
            } else {
                const prompt = row.data as PromptWithRelations
                if (!prompt.tags) return '-'
                const tags = getTagsArray(prompt.tags)
                if (tags.length === 0) return '-'
                return h(
                    NFlex,
                    { size: 'small', wrap: true },
                    {
                        default: () => tags.slice(0, 3).map(tag =>
                            h(
                                NTag,
                                {
                                    size: 'small',
                                    bordered: false,
                                    color: getTagColor(tag),
                                    class: isTagMatched(tag) ? 'highlighted-tag' : ''
                                },
                                {
                                    default: () => tag,
                                    icon: () => h(NIcon, null, { default: () => h(Tag) })
                                }
                            )
                        ).concat(
                            tags.length > 3 ? [h(NText, { depth: 3, style: { fontSize: '12px' } }, { default: () => `+${tags.length - 3}` })] : []
                        )
                    }
                )
            }
        }
    },
    {
        title: t('promptManagement.variable'),
        key: 'variables',
        width: 80,
        render: (row: TreeNode) => {
            if (row.type === 'category') {
                return '-'
            } else {
                const prompt = row.data as PromptWithRelations
                const count = prompt.variables?.length || 0
                return count > 0 ? h(
                    NTag,
                    { size: 'small', type: 'info' },
                    { default: () => t('promptManagement.variableCount', { count }) }
                ) : '-'
            }
        }
    },
    {
        title: t('common.copy'),
        key: 'copy',
        width: 80,
        render: (row: TreeNode) => {
            if (row.type === 'category') {
                return '-'
            } else {
                const prompt = row.data as PromptWithRelations
                return h(
                    NButton,
                    {
                        size: 'small',
                        text: true,
                        type: 'default',
                        onClick: (e: Event) => {
                            e.stopPropagation()
                            handleCopyPrompt(prompt)
                        }
                    },
                    {
                        icon: () => h(NIcon, null, { default: () => h(Copy) })
                    }
                )
            }
        }
    },
    {
        title: t('promptManagement.favorites'),
        key: 'isFavorite',
        width: 80,
        render: (row: TreeNode) => {
            if (row.type === 'category') {
                return '-'
            } else {
                const prompt = row.data as PromptWithRelations
                return h(
                    NButton,
                    {
                        size: 'small',
                        text: true,
                        type: prompt.isFavorite ? 'error' : 'default',
                        onClick: (e: Event) => {
                            e.stopPropagation()
                            toggleFavorite(prompt.id!)
                        }
                    },
                    {
                        icon: () => h(NIcon, null, { default: () => h(Heart) })
                    }
                )
            }
        }
    },
    {
        title: t('promptManagement.sortOptions.useCount'),
        key: 'useCount',
        width: 100,
        render: (row: TreeNode) => {
            if (row.type === 'category') {
                return '-'
            } else {
                const prompt = row.data as PromptWithRelations
                return t('promptManagement.useCount', { count: prompt.useCount || 0 })
            }
        }
    },
    {
        title: t('promptManagement.update'),
        key: 'updatedAt',
        width: 120,
        render: (row: TreeNode) => {
            if (row.type === 'category') {
                const category = row.data as CategoryWithRelations
                return new Date(category.updatedAt).toLocaleDateString()
            } else {
                const prompt = row.data as PromptWithRelations
                return new Date(prompt.updatedAt).toLocaleDateString()
            }
        }
    },
    {
        title: t('promptManagement.select'),
        key: 'actions',
        width: 120,
        render: (row: TreeNode) => {
            if (row.type === 'category') {
                return '-'
            } else {
                const prompt = row.data as PromptWithRelations
                return h(
                    NDropdown,
                    {
                        options: getPromptActions(prompt),
                        onSelect: (key: string) => handlePromptAction(key, prompt)
                    },
                    {
                        default: () => h(
                            NButton,
                            {
                                size: 'small',
                                text: true,
                                onClick: (e: Event) => e.stopPropagation()
                            },
                            {
                                icon: () => h(NIcon, null, { default: () => h(DotsVertical) })
                            }
                        )
                    }
                )
            }
        }
    }
])

// 表格列定义
const tableColumns = computed(() => [
    {
        type: 'selection' as const
    },
    {
        title: t('promptManagement.title'),
        key: 'title',
        width: 200,
        ellipsis: {
            tooltip: true
        },
        render: (row: PromptWithRelations) => {
            return h(
                NButton,
                {
                    text: true,
                    type: 'primary',
                    onClick: () => emit('view', row)
                },
                { default: () => row.title }
            )
        }
    },
    {
        title: t('promptManagement.preview'),
        key: 'preview',
        width: 80,
        render: (row: PromptWithRelations) => {
            if (!hasValidImage(row)) {
                return '-'
            }
            
            if (row.imageBlobs && Array.isArray(row.imageBlobs) && row.imageBlobs.length > 1) {
                return h(
                    NCarousel,
                    {
                        autoplay: true,
                        showDots: false,
                        touchable: true,
                        mousewheel: true,
                        direction: 'vertical',
                        dotPlacement: 'bottom',
                        style: 'width: 50px; height: 50px; border-radius: var(--radius-image); overflow: hidden;'
                    },
                    {
                        default: () => row.imageBlobs!.map((blob: Blob, index: number) =>
                            h(
                                NImage,
                                {
                                    src: getImageUrlFromBlob(blob),
                                    width: 50,
                                    height: 50,
                                    objectFit: 'cover',
                                    style: 'border-radius: var(--radius-image);',
                                    previewDisabled: false,
                                    lazy: true,
                                    onError: handleImageError,
                                    fallbackSrc: ''
                                }
                            )
                        )
                    }
                )
            } else if (row.imageBlobs && Array.isArray(row.imageBlobs) && row.imageBlobs.length === 1) {
                return h(
                    NImage,
                    {
                        src: getImageUrl(row.imageBlobs),
                        width: 50,
                        height: 50,
                        objectFit: 'cover',
                        style: 'border-radius: var(--radius-image);',
                        previewDisabled: false,
                        lazy: true,
                        onError: handleImageError,
                        fallbackSrc: ''
                    }
                )
            }
            
            return '-'
        }
    },
    {
        title: t('promptManagement.description'),
        key: 'description',
        width: 300,
        ellipsis: {
            tooltip: true
        },
        render: (row: PromptWithRelations) => {
            if (row.description) {
                return row.description
            }
            const preview = row.content?.substring(0, 100) || ''
            return preview + (row.content?.length > 100 ? '...' : '')
        }
    },
    {
        title: t('promptManagement.category'),
        key: 'category',
        width: 120,
        render: (row: PromptWithRelations) => {
            if (!row.category) return '-'
            return h(
                NTag,
                {
                    size: 'small',
                    color: getCategoryTagColor(row.category)
                },
                {
                    default: () => row.category!.name,
                    icon: () => h(NIcon, null, { default: () => h(Box) })
                }
            )
        }
    },
    {
        title: t('promptManagement.tags'),
        key: 'tags',
        width: 200,
        render: (row: PromptWithRelations) => {
            if (!row.tags) return '-'
            const tags = getTagsArray(row.tags)
            if (tags.length === 0) return '-'
            return h(
                NFlex,
                { size: 'small', wrap: true },
                {
                    default: () => tags.slice(0, 3).map(tag =>
                        h(
                            NTag,
                            {
                                size: 'small',
                                bordered: false,
                                color: getTagColor(tag),
                                class: isTagMatched(tag) ? 'highlighted-tag' : ''
                            },
                            {
                                default: () => tag,
                                icon: () => h(NIcon, null, { default: () => h(Tag) })
                            }
                        )
                    ).concat(
                        tags.length > 3 ? [h(NText, { depth: 3, style: { fontSize: '12px' } }, { default: () => `+${tags.length - 3}` })] : []
                    )
                }
            )
        }
    },
    {
        title: t('promptManagement.variable'),
        key: 'variables',
        width: 80,
        render: (row: PromptWithRelations) => {
            const count = row.variables?.length || 0
            return count > 0 ? h(
                NTag,
                { size: 'small', type: 'info' },
                { default: () => t('promptManagement.variableCount', { count }) }
            ) : '-'
        }
    },
    {
        title: t('common.copy'),
        key: 'copy',
        width: 80,
        render: (row: PromptWithRelations) => {
            return h(
                NButton,
                {
                    size: 'small',
                    text: true,
                    type: 'default',
                    onClick: (e: Event) => {
                        e.stopPropagation()
                        handleCopyPrompt(row)
                    }
                },
                {
                    icon: () => h(NIcon, null, { default: () => h(Copy) })
                }
            )
        }
    },
    {
        title: t('promptManagement.favorites'),
        key: 'isFavorite',
        width: 80,
        render: (row: PromptWithRelations) => {
            return h(
                NButton,
                {
                    size: 'small',
                    text: true,
                    type: row.isFavorite ? 'error' : 'default',
                    onClick: (e: Event) => {
                        e.stopPropagation()
                        toggleFavorite(row.id!)
                    }
                },
                {
                    icon: () => h(NIcon, null, { default: () => h(Heart) })
                }
            )
        }
    },
    ...(supportsGlobalShortcuts ? [{
        title: t('promptManagement.shortcutTrigger'),
        key: 'isShortcutTrigger',
        width: 100,
        render: (row: PromptWithRelations) => {
            const binding = shortcutBindingFor(row.uuid)
            return h(
                NButton,
                {
                    size: 'small',
                    text: true,
                    type: binding ? 'primary' : 'default',
                    onClick: (event: Event) => {
                        event.stopPropagation()
                        openShortcutBinding(row)
                    }
                },
                { default: () => binding ? displayAccelerator(binding.accelerator) : t('shortcuts.assign') }
            )
        }
    }] : []),
    {
        title: t('promptManagement.sortOptions.useCount'),
        key: 'useCount',
        width: 100,
        sorter: true,
        render: (row: PromptWithRelations) => t('promptManagement.useCount', { count: row.useCount || 0 })
    },
    {
        title: t('promptManagement.update'),
        key: 'updatedAt',
        width: 120,
        sorter: true,
        render: (row: PromptWithRelations) => new Date(row.updatedAt).toLocaleDateString()
    },
    {
        title: t('promptManagement.select'),
        key: 'actions',
        width: 120,
        render: (row: PromptWithRelations) => {
            return h(
                NDropdown,
                {
                    options: getPromptActions(row),
                    onSelect: (key: string) => handlePromptAction(key, row)
                },
                {
                    default: () => h(
                        NButton,
                        {
                            size: 'small',
                            text: true,
                            onClick: (e: Event) => e.stopPropagation()
                        },
                        {
                            icon: () => h(NIcon, null, { default: () => h(DotsVertical) })
                        }
                    )
                }
            )
        }
    }
])

const redesignedTreeTableColumns = computed(() => {
    const source = treeTableColumns.value
    const titleFor = (key: string, fallback: string) => source.find(column => column.key === key)?.title || fallback
    return [
        { type: 'selection' as const, width: 42 },
        {
            title: titleFor('name', t('promptManagement.title')),
            key: 'name',
            tree: true,
            width: 460,
            render: (row: TreeNode) => {
                if (row.type === 'prompt') return renderPromptIdentity(row.data as PromptWithRelations)
                const category = row.data as CategoryWithRelations
                return h('div', { class: 'folder-category-cell' }, [
                    h('span', { class: 'folder-category-icon', style: { color: category.color } }, [
                        h(NIcon, { size: 18 }, { default: () => h(Folder) })
                    ]),
                    h('div', { class: 'folder-category-copy' }, [
                        h(NText, { strong: true }, { default: () => category.name }),
                        h(NText, { depth: 3, class: 'folder-category-description' }, {
                            default: () => category.description || t('promptManagement.categoryPromptCount', {
                                count: category.prompts?.length || row.children?.length || 0
                            })
                        })
                    ])
                ])
            }
        },
        {
            title: titleFor('tags', t('promptManagement.tags')),
            key: 'tags',
            width: 210,
            render: (row: TreeNode) => row.type === 'prompt'
                ? renderTagsCell(row.data as PromptWithRelations)
                : '-'
        },
        {
            title: titleFor('updatedAt', t('promptManagement.update')),
            key: 'updatedAt',
            width: 120,
            render: (row: TreeNode) => formatDate(row.data.updatedAt)
        },
        {
            title: '',
            key: 'actions',
            width: 126,
            render: (row: TreeNode) => row.type === 'prompt'
                ? renderRowActions(row.data as PromptWithRelations)
                : null
        }
    ]
})

const redesignedTableColumns = computed(() => {
    const source = tableColumns.value
    const titleFor = (key: string, fallback: string) => source.find(column => column.key === key)?.title || fallback
    return [
        { type: 'selection' as const, width: 42 },
        {
            title: titleFor('title', t('promptManagement.title')),
            key: 'title',
            width: 420,
            render: renderPromptIdentity
        },
        {
            title: titleFor('category', t('promptManagement.category')),
            key: 'category',
            width: 160,
            render: renderCategoryCell
        },
        {
            title: titleFor('tags', t('promptManagement.tags')),
            key: 'tags',
            width: 190,
            render: renderTagsCell
        },
        {
            title: titleFor('updatedAt', t('promptManagement.update')),
            key: 'updatedAt',
            width: 120,
            render: (row: PromptWithRelations) => formatDate(row.updatedAt)
        },
        {
            title: '',
            key: 'actions',
            width: 126,
            render: renderRowActions
        }
    ]
})

// 加载树形数据
const loadTreeData = async () => {
    try {
        initialLoading.value = true
        treeData.value = await api.categories.getTreeWithPrompts.query()
        // 同时更新统计信息
        statistics.value = await api.prompts.getStatistics.query()
        totalCount.value = statistics.value.totalCount || 0
    } catch (error) {
        message.error(t('promptManagement.loadTreeDataFailed'))
        console.error(error)
    } finally {
        initialLoading.value = false
    }
}

// 加载数据
const loadPrompts = async (reset = true) => {
    try {
        if (reset) {
            initialLoading.value = true
            currentPage.value = 1
            prompts.value = []
        } else {
            loadingMore.value = true
        }        // 加载统计信息（仅在首次加载时）
        if (reset) {
            statistics.value = await api.prompts.getStatistics.query()
        }// 根据过滤条件加载显示的提示词（分页）
        const filters = {
            categoryId: selectedCategory.value || undefined,
            search: searchText.value || undefined, // 文本搜索和标签搜索可以同时使用
            tags: selectedTag.value || undefined, // 使用专门的标签搜索
            isFavorite: showFavoritesOnly.value || undefined,
            page: currentPage.value,
            limit: gridPageSize.value, // 网格视图使用专门的页面大小
            sortBy: sortType.value // 添加排序参数
        }

        const result = await api.prompts.getAll.query(filters)

        // 调试信息
        console.log('loadPrompts result:', {
            filters,
            dataLength: result.data?.length || 0,
            total: result.total,
            hasNextPage: result.hasNextPage,
            currentPage: currentPage.value,
            reset,
            selectedTag: selectedTag.value,
            searchText: searchText.value
        })        // 如果是重置加载，直接替换数据；否则追加数据
        if (reset) {
            prompts.value = result.data || []
        } else {
            prompts.value = [...prompts.value, ...(result.data || [])]
        }

        // 始终更新总数和分页状态（因为过滤条件可能导致总数变化）
        totalCount.value = result.total || 0
        hasNextPage.value = result.hasNextPage || false

    } catch (error) {
        message.error(t('promptManagement.loadPromptsFailed'))
        console.error(error)
    } finally {
        initialLoading.value = false
        loadingMore.value = false
    }
}

// 切换视图模式
const setViewMode = (mode: 'grid' | 'table' | 'tree') => {
    viewMode.value = mode
    emit('view-mode-change', mode)
    // 切换到表格视图时清除选择并重新加载数据
    if (mode === 'table') {
        clearSelection()
        // 重置页码并加载表格数据
        currentPage.value = 1
        loadPromptsForTable()
    } else if (mode === 'tree') {
        // 切换到树形视图时加载树形数据
        loadTreeData()
    } else {
        // 切换到网格视图时重新加载数据
        loadPrompts(true)
    }
}

watch(() => props.forcedViewMode, (mode) => {
    if (mode !== viewMode.value) setViewMode(mode)
})

// 清除选择
const clearSelection = () => {
    selectedRowKeys.value = []
}

// 批量删除
const handleBatchDelete = async () => {
    if (selectedRows.value.length === 0) return

    try {
        // 使用批量删除API，只触发一次同步
        const ids = selectedRows.value.map(prompt => prompt.id!)
        const result = await api.prompts.batchDelete.mutate(ids)

        if (result.success > 0) {
            message.success(t('promptManagement.batchDeleteSuccess', { count: result.success }))
        }

        if (result.failed > 0) {
            console.error('Batch delete partially failed:', result)
            message.warning(t('promptManagement.batchDeletePartialFailed', { count: result.failed }))
        }

        clearSelection()
        if (viewMode.value === 'table') {
            await loadPromptsForTable()
        } else if (viewMode.value === 'tree') {
            await loadTreeData()
        } else {
            await loadPrompts(true) // 重新加载数据
        }
        await loadStatistics() // 重新加载统计信息
        emit('refresh')
    } catch (error) {
        message.error(t('promptManagement.batchDeleteFailed'))
        console.error(error)
    }
}

// 处理无限滚动加载更多
const handleLoadMore = () => {
    if (!hasNextPage.value || loadingMore.value) {
        return Promise.resolve()
    }

    currentPage.value++
    return loadPrompts(false)
}

// 专门为表格视图加载数据的函数
const loadPromptsForTable = async () => {
    try {
        loadingMore.value = true

        // 根据过滤条件加载显示的提示词（分页）
        const filters = {
            categoryId: selectedCategory.value || undefined,
            search: searchText.value || undefined, // 文本搜索和标签搜索可以同时使用
            tags: selectedTag.value || undefined, // 使用专门的标签搜索
            isFavorite: showFavoritesOnly.value || undefined,
            page: currentPage.value,
            limit: pageSize.value,
            sortBy: sortType.value
        }

        const result = await api.prompts.getAll.query(filters)

        // 直接替换数据（表格视图不需要追加）
        prompts.value = result.data || []
        totalCount.value = result.total || 0

        // 清除选择状态
        clearSelection()

        console.log('Table view loaded:', {
            page: currentPage.value,
            pageSize: pageSize.value,
            dataLength: prompts.value.length,
            totalCount: totalCount.value,
            filters,
            selectedTag: selectedTag.value,
            searchText: searchText.value
        })

    } catch (error) {
        message.error(t('promptManagement.loadPromptsFailed'))
        console.error(error)
    } finally {
        loadingMore.value = false
    }
}

const loadCategories = async () => {
    try {
        categories.value = await api.categories.getAll.query()
        // 每次加载分类时都同时更新统计信息，确保计数准确
        await loadStatistics()
    } catch (error) {
        message.error(t('promptManagement.loadCategoriesFailed'))
        console.error(error)
    }
}

// 事件处理
const handleSearch = () => {
    // 重置页码
    currentPage.value = 1
    if (viewMode.value === 'table') {
        loadPromptsForTable()
    } else if (viewMode.value === 'tree') {
        loadTreeData()
    } else {
        loadPrompts(true) // 重置加载
    }
}

// 监听排序方式变化
watch(sortType, () => {
    // 重置页码
    currentPage.value = 1
    if (viewMode.value === 'table') {
        loadPromptsForTable()
    } else if (viewMode.value === 'tree') {
        loadTreeData()
    } else {
        loadPrompts(true) // 排序方式变化时重新加载数据
    }
})

const handleCategoryFilter = () => {
    // 重置页码
    currentPage.value = 1
    if (viewMode.value === 'table') {
        loadPromptsForTable()
    } else if (viewMode.value === 'tree') {
        loadTreeData()
    } else {
        loadPrompts(true) // 重置加载
    }
}

const handleCategoryQuickFilter = (categoryId: number | null) => {
    selectedCategory.value = categoryId
    // 重置页码
    currentPage.value = 1
    if (viewMode.value === 'table') {
        loadPromptsForTable()
    } else if (viewMode.value === 'tree') {
        loadTreeData()
    } else {
        loadPrompts(true) // 重置加载
    }
}

const toggleCategoriesExpanded = () => {
    categoriesExpanded.value = !categoriesExpanded.value
}

const toggleTagsExpanded = () => {
    tagsExpanded.value = !tagsExpanded.value
}

const toggleFavoritesFilter = () => {
    showFavoritesOnly.value = !showFavoritesOnly.value
    // 重置页码
    currentPage.value = 1
    if (viewMode.value === 'table') {
        loadPromptsForTable()
    } else if (viewMode.value === 'tree') {
        loadTreeData()
    } else {
        loadPrompts(true) // 重置加载
    }
}

const toggleAdvancedFilter = () => {
    showAdvancedFilter.value = !showAdvancedFilter.value
    // 当开启高级筛选时，默认展开分类和标签区域
    if (showAdvancedFilter.value) {
        categoriesExpanded.value = true
        tagsExpanded.value = true
    }
}

// 清除所有筛选条件
const clearAllFilters = () => {
    searchText.value = ''
    selectedTag.value = ''
    selectedCategory.value = null
    showFavoritesOnly.value = false
    handleSearch()
}

const toggleFavorite = async (promptId: number) => {
    try {
        // 先乐观更新UI
        const prompt = prompts.value.find(p => p.id === promptId)
        if (prompt) {
            prompt.isFavorite = !prompt.isFavorite
        }

        await api.prompts.toggleFavorite.mutate(promptId)
        message.success(t('promptManagement.updateFavoriteSuccess'))
        emit('refresh')
    } catch (error) {
        // 如果API调用失败，回滚UI状态
        const prompt = prompts.value.find(p => p.id === promptId)
        if (prompt) {
            prompt.isFavorite = !prompt.isFavorite
        }
        message.error(t('promptManagement.updateFavoriteFailed'))
        console.error(error)
    }
}



// 检查标签是否匹配搜索关键词
const isTagMatched = (tag: string) => {
    // 如果是当前选中的标签，高亮显示
    if (selectedTag.value && tag.toLowerCase() === selectedTag.value.toLowerCase()) {
        return true
    }
    // 如果是文本搜索匹配，也高亮显示
    if (searchText.value.trim() && tag.toLowerCase().includes(searchText.value.toLowerCase())) {
        return true
    }
    return false
}

// 快速标签搜索
const handleTagQuickSearch = (tagName: string) => {
    // 如果点击的是当前选中的标签，则取消选择
    if (selectedTag.value === tagName) {
        selectedTag.value = ''
    } else {
        selectedTag.value = tagName
    }
    // 不清除文本搜索，允许同时使用
    handleSearch()
}

const getPromptActions = (prompt: PromptWithRelations) => [
    {
        label: t('promptManagement.edit'),
        key: 'edit',
        icon: () => h(NIcon, { size: 16 }, { default: () => h(Edit) })
    },
    {
        label: t('promptManagement.copyOriginalContent'),
        key: 'copyOriginal',
        icon: () => h(NIcon, { size: 16 }, { default: () => h(Copy) })
    },
    ...(supportsGlobalShortcuts ? [{
        label: shortcutBindingFor(prompt.uuid) ? t('shortcuts.editPromptBinding') : t('shortcuts.assignPromptBinding'),
        key: 'shortcut',
        icon: () => h(NIcon, { size: 16 }, { default: () => h(Keyboard) })
    }] : []),
    {
        label: () => h(NText, { type: 'error' }, { default: () => t('promptManagement.delete') }),
        key: 'delete',
        icon: () => h(NIcon, { size: 16, color: 'var(--error-color)' }, { default: () => h(Trash) })
    }
]

const handlePromptAction = (action: string, prompt: PromptWithRelations) => {
    switch (action) {
        case 'edit':
            console.log('🔄 PromptList 发送编辑事件:', {
                promptId: prompt.id,
                hasImageBlobs: !!prompt.imageBlobs,
                imageBlobsCount: prompt.imageBlobs?.length || 0,
                imageBlobsType: typeof prompt.imageBlobs
            });
            emit('edit', prompt)
            break
        case 'copyOriginal':
            handleCopyOriginalPrompt(prompt)
            break
        case 'shortcut':
            openShortcutBinding(prompt)
            break
        case 'delete':
            handleDeletePrompt(prompt)
            break
    }
}

const shortcutBindingFor = (promptUUID: string): PromptShortcutBinding | undefined =>
    shortcutState.value?.preferences.promptBindings.find(binding => binding.promptUUID === promptUUID)

const displayAccelerator = (accelerator: string) => {
    if (!navigator.platform.includes('Mac')) return accelerator.replace(/CommandOrControl/g, 'Ctrl').replace(/Control/g, 'Ctrl')
    return accelerator.replace(/CommandOrControl|Command/g, '⌘').replace(/Control/g, '⌃').replace(/Alt|Option/g, '⌥').replace(/Shift/g, '⇧').replace(/\+/g, '')
}

const openShortcutBinding = (prompt: PromptWithRelations) => {
    shortcutBindingPrompt.value = prompt
    showShortcutBindingModal.value = true
}

const handleShortcutBindingSaved = async () => {
    showShortcutBindingModal.value = false
    shortcutState.value = await window.electronAPI.shortcuts.getState()
}

const handleCopyPrompt = async (prompt: PromptWithRelations) => {
    try {
        let contentToCopy = prompt.content;

        // 检查是否为 Jinja 模板
        if (prompt.isJinjaTemplate) {
            try {
                // 生成默认变量值
                const defaultVariables: Record<string, any> = {};
                if (prompt.variables && prompt.variables.length > 0) {
                    // 使用存储的变量配置
                    prompt.variables.forEach((variable: any) => {
                        defaultVariables[variable.name] = variable.defaultValue || `[${variable.name}]`;
                    });
                } else {
                    // 从模板内容中提取变量
                    const templateVariables = jinjaService.extractVariables(prompt.content);
                    templateVariables.forEach(variableName => {
                        defaultVariables[variableName] = `[${variableName}]`;
                    });
                }
                
                // 使用 Jinja 服务渲染模板
                contentToCopy = jinjaService.render(prompt.content, defaultVariables);
            } catch (error) {
                console.error('Jinja 模板渲染失败:', error);
                // 渲染失败时返回原始内容
                contentToCopy = prompt.content;
            }
        } else {
            // 变量模式：检查是否有变量配置
            if (prompt.variables && prompt.variables.length > 0) {
                // 变量替换逻辑
                Object.entries(prompt.variables).forEach(([key, variable]: [string, any]) => {
                    const regex = new RegExp(`\\{\\{${variable.name}\\}\\}`, "g");
                    // 使用默认值替换变量，如果没有默认值则使用变量名
                    const replacement = variable.defaultValue || `[${variable.name}]`;
                    contentToCopy = contentToCopy.replace(regex, replacement);
                });
            }
        }

        await navigator.clipboard.writeText(contentToCopy)
        message.success(t('promptManagement.copyPromptSuccess'))
    } catch (error) {
        message.error(t('promptManagement.copyFailed'))
        console.error('复制提示词失败:', error)
    }
}

const handleCopyOriginalPrompt = async (prompt: PromptWithRelations) => {
    try {
        await navigator.clipboard.writeText(prompt.content)
        message.success(t('promptManagement.copyOriginalContentSuccess'))
    } catch (error) {
        message.error(t('promptManagement.copyFailed'))
        console.error('复制原始提示词失败:', error)
    }
}

const handleDeletePrompt = async (prompt: PromptWithRelations) => {
    if (confirm(t('promptManagement.confirmDeletePrompt', { title: prompt.title }))) {
        try {
            await api.prompts.delete.mutate(prompt.id!)
            if (viewMode.value === 'table') {
                await loadPromptsForTable()
            } else if (viewMode.value === 'tree') {
                await loadTreeData()
            } else {
                await loadPrompts(true) // 重置加载
            }
            await loadStatistics() // 重新加载统计信息
            message.success(t('promptManagement.deleteSuccess'))
            emit('refresh')
        } catch (error) {
            message.error(t('promptManagement.deleteFailed'))
            console.error(error)
        }
    }
}

// 加载统计信息
const loadStatistics = async () => {
    try {
        statistics.value = await api.prompts.getStatistics.query()
        // 同时更新总数，确保表格分页显示正确
        if (!totalCount.value) {
            totalCount.value = statistics.value.totalCount || 0
        }
        console.log('Statistics loaded:', {
            totalCount: statistics.value.totalCount,
            currentTotalCount: totalCount.value
        })
    } catch (error) {
        message.error(t('promptManagement.loadStatisticsFailed'))
        console.error(error)
    }
}

// 组件挂载时加载数据
onMounted(async () => {
    if (supportsGlobalShortcuts && window.electronAPI?.shortcuts) shortcutState.value = await window.electronAPI.shortcuts.getState()
    await waitForDatabase()
    // 先加载统计信息和分类，确保 totalCount 有正确值
    await loadStatistics()
    await loadCategories()
    // 然后根据初始视图模式选择正确的加载方法
    if (viewMode.value === 'table') {
        await loadPromptsForTable()
    } else if (viewMode.value === 'tree') {
        await loadTreeData()
    } else {
        await loadPrompts(true) // 初始加载
    }
})

// 图片处理函数
const imageUrlCache = new Map<Blob, string>();

const getImageUrl = (imageBlobs: any) => {
    // 检查是否为有效的Blob数组
    if (!imageBlobs || 
        !Array.isArray(imageBlobs) ||
        imageBlobs.length === 0) {
        return '';
    }
    
    // 获取第一张图片用于显示
    const firstImage = imageBlobs[0];
    if (!firstImage || 
        typeof firstImage !== 'object' ||
        !(firstImage instanceof Blob) ||
        firstImage.size === 0) {
        return '';
    }
    
    // 使用缓存避免重复创建URL
    if (imageUrlCache.has(firstImage)) {
        return imageUrlCache.get(firstImage)!;
    }
    
    try {
        const url = URL.createObjectURL(firstImage);
        imageUrlCache.set(firstImage, url);
        return url;
    } catch (error) {
        console.error('创建图片URL失败:', error, firstImage);
        return '';
    }
};

const getImageUrlFromBlob = (blob: Blob) => {
    if (!blob || 
        !(blob instanceof Blob) ||
        blob.size === 0) {
        return '';
    }

    if (imageUrlCache.has(blob)) {
        return imageUrlCache.get(blob)!;
    }

    try {
        const url = URL.createObjectURL(blob);
        imageUrlCache.set(blob, url);
        return url;
    } catch (error) {
        console.error('创建图片URL失败:', error, blob);
        return '';
    }
};

const handleImageError = (event: Event) => {
    console.warn('图片加载失败:', event);
    // 可以设置默认图片或其他错误处理
};

const hasValidImage = (prompt: PromptWithRelations) => {
    if (!prompt.imageBlobs || !Array.isArray(prompt.imageBlobs) || prompt.imageBlobs.length === 0) {
        return false;
    }
    
    // 检查第一张图片是否有效
    const firstImage = prompt.imageBlobs[0];
    if (!firstImage || !(firstImage instanceof Blob)) {
        console.warn('提示词包含无效的图片数据:', {
            promptId: prompt.id,
            imageBlobs: prompt.imageBlobs,
            type: typeof prompt.imageBlobs,
            constructor: (prompt.imageBlobs as any)?.constructor?.name
        });
        return false;
    }
    
    return firstImage instanceof Blob && firstImage.size > 0;
};

// 组件卸载时清理URL缓存
onBeforeUnmount(() => {
    // 清理所有创建的Blob URL
    imageUrlCache.forEach(url => {
        URL.revokeObjectURL(url);
    });
    imageUrlCache.clear();
});

// 暴露方法给父组件
defineExpose({
    loadPrompts: () => {
        currentPage.value = 1 // 重置页码
        if (viewMode.value === 'table') {
            loadPromptsForTable()
        } else if (viewMode.value === 'tree') {
            loadTreeData()
        } else {
            loadPrompts(true)
        }
    },
    loadCategories,
    loadStatistics,
    setViewMode,
})
</script>

<style scoped>
.prompt-list {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    overflow: hidden;
}

.prompt-filter-bar {
    flex: 0 0 auto;
    padding: var(--compact-padding);
    background: var(--surface-secondary);
}

.prompt-filter-bar :deep(.n-button),
.prompt-filter-bar :deep(.n-input),
.prompt-filter-bar :deep(.n-base-selection) {
    font-size: 14px;
}

.prompt-filter-bar :deep(.n-button__icon) {
    font-size: 16px;
}

.prompt-toolbar-row { gap: 8px !important; }
.prompt-search-input { flex: 1 1 320px; min-width: 240px; }
.prompt-sort-select { width: 164px; }
.active-filter-summary { padding: 7px 10px; border-top: 1px solid var(--border-default); color: var(--content-secondary); font-size: 12px; }
.advanced-filter-panel { max-height: min(30vh, 260px); margin-top: 4px; padding: 10px 6px 2px 2px; overflow-y: auto; border-top: 1px solid var(--border-default); }
.batch-action-bar { margin-top: 12px; }
.batch-action-bar :deep(.n-card) { box-shadow: none; }

.prompt-list-body,
.prompt-list-results {
    flex: 1 1 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.prompt-list-state {
    flex: 1;
    min-height: 0;
    display: grid;
    place-items: center;
    padding: 40px;
    text-align: center;
}

.grid-scroll-region {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
}

.prompt-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(286px, 1fr));
    gap: 12px;
    margin-top: 12px;
}

.prompt-card {
    min-height: 176px;
    border-radius: var(--radius-panel);
    min-width: 0;
    transition: border-color .16s ease, background-color .16s ease;
    cursor: pointer;
    box-shadow: none;
}

.prompt-card:hover {
    border-color: var(--border-strong);
    background: var(--surface-secondary);
    box-shadow: none;
}

.prompt-card :deep(.n-card-header) {
    padding: 13px 13px 9px;
    flex-wrap: nowrap;
    overflow: hidden;
    border-bottom: 0;
}

.prompt-card :deep(.n-card-header__main) {
    flex: 1 1 auto;
    overflow: hidden;
    font-size: var(--font-size-base);
    min-width: 0;
}

.prompt-card :deep(.n-card-header__extra) {
    flex: 0 0 auto;
    min-width: 0;
}

.prompt-card :deep(.n-card__content) {
    padding: 10px 13px 12px;
    font-size: var(--font-size-base);
}

.prompt-card :deep(.n-card__footer) {
    padding: 9px 13px 11px;
    border-top: 0;
}

.prompt-card :deep(.n-button__icon) { font-size: var(--font-size-lg); }

.prompt-card-title-block { width: 100%; min-width: 0; overflow: hidden; }
.prompt-card-title { display: block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--font-size-base); }
.prompt-card-kind { display: block; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--font-size-xs); font-weight: var(--font-weight-normal); }
.prompt-card-main { min-height: 76px; }
.prompt-card-thumbnail { width: 72px; height: 72px; flex: 0 0 72px; overflow: hidden; border-radius: var(--radius-image); }
.prompt-card-footer { min-height: 22px; display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.prompt-card-taxonomy { min-width: 0; display: flex; align-items: center; gap: 7px; }
.prompt-card-category, .table-category-cell { min-width: 0; display: inline-flex; align-items: center; gap: 6px; overflow: hidden; color: var(--content-secondary); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.category-color-dot { width: 7px; height: 7px; flex: 0 0 7px; border-radius: 50%; }
.prompt-card-date { flex: 0 0 auto; font-size: 12px; font-variant-numeric: tabular-nums; }

.data-view-surface { flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; margin-top: 12px; overflow: hidden; border-radius: var(--radius-panel); }
.data-view-surface :deep(.n-data-table) { flex: 1 1 0; min-height: 0; overflow: hidden; }
.data-view-surface :deep(.n-data-table-wrapper),
.data-view-surface :deep(.n-data-table-base-table),
.data-view-surface :deep(.n-data-table-base-table-body) { min-height: 0; }
.data-view-surface :deep(.n-data-table-wrapper),
.data-view-surface :deep(.n-data-table-base-table) { flex: 1 1 0; }
.data-view-surface :deep(.n-data-table-th) { height: 40px; background: var(--surface-secondary); font-size: var(--font-size-sm); font-weight: var(--font-weight-medium); }
.data-view-surface :deep(.n-data-table-td) { height: 58px; font-size: var(--font-size-base); }
.data-view-surface :deep(.prompt-data-row) { cursor: pointer; }
.data-view-surface :deep(.prompt-data-row:hover .n-data-table-td) { background: var(--interactive-hover); }
.folder-view-table :deep(.folder-category-row .n-data-table-td) { height: 54px; background: var(--surface-secondary); }
.data-view-surface :deep(.table-prompt-cell) { width: 100%; min-width: 0; display: inline-flex; align-items: center; gap: 11px; vertical-align: middle; }
.data-view-surface :deep(.table-prompt-thumbnail), .data-view-surface :deep(.table-prompt-placeholder) { width: 40px; height: 40px; flex: 0 0 40px; border-radius: var(--radius-image); }
.data-view-surface :deep(.table-prompt-placeholder) { display: grid; place-items: center; border: 1px solid var(--border-default); color: var(--content-secondary); background: var(--surface-secondary); }
.data-view-surface :deep(.table-prompt-copy) { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.data-view-surface :deep(.table-prompt-title) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; }
.data-view-surface :deep(.table-prompt-description) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
.data-view-surface :deep(.table-category-cell) { max-width: 140px; min-width: 0; display: inline-flex; align-items: center; gap: 6px; overflow: hidden; color: var(--content-secondary); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.data-view-surface :deep(.category-color-dot) { width: 7px; height: 7px; flex: 0 0 7px; border-radius: 50%; }
.data-view-surface :deep(.table-tags) { overflow: hidden; }
.data-view-surface :deep(.table-tags .n-tag) { max-width: 82px; }
.data-view-surface :deep(.table-tags .n-tag__content) { overflow: hidden; text-overflow: ellipsis; }
.data-view-surface :deep(.table-tag-overflow) { font-size: 12px; }
.data-view-surface :deep(.folder-category-cell) { max-width: 100%; min-width: 0; display: inline-flex; align-items: center; gap: 10px; vertical-align: middle; }
.data-view-surface :deep(.folder-category-icon) { width: 32px; height: 32px; flex: 0 0 32px; display: grid; place-items: center; border: 1px solid var(--border-default); border-radius: var(--radius-control); background: var(--surface-secondary); }
.data-view-surface :deep(.folder-category-copy) { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.data-view-surface :deep(.folder-category-description) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }

/* 高亮匹配的标签 */
.highlighted-tag {
    background: var(--interactive-active) !important;
    font-weight: var(--font-weight-medium);
}

/* 描述文本和内容预览的多行截断样式 */
.description-text,
.content-preview-text {
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: var(--line-height-normal);
    word-break: break-word;
}

@media (max-width: 900px) {
    .prompt-sort-select { width: 140px; }
    .prompt-grid { grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }
}

/* 轮播图样式 - 已移除，现在使用NImage组件 */
</style>
