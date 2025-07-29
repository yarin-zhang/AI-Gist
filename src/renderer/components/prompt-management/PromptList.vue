<template>
    <div class="prompt-list">
        <!-- 搜索和过滤器 -->
        <NCard>
            <NFlex vertical :size="getCardSpacing()">
                <NFlex>
                    <NInput v-model:value="searchText" :placeholder="t('promptManagement.searchPrompt')" style="flex: 1"
                        @input="handleSearch" clearable>
                        <template #prefix>
                            <NIcon>
                                <Search />
                            </NIcon>
                        </template>
                    </NInput>
                    <NSelect v-model:value="sortType" :options="sortOptions" :placeholder="t('promptManagement.sortBy')"
                        style="width: 160px; margin-right: 8px" />
                    <NButton :type="showAdvancedFilter ? 'primary' : 'default'" @click="toggleAdvancedFilter">
                        <template #icon>
                            <NIcon>
                                <Tag />
                            </NIcon>
                        </template>
                        {{ t('promptManagement.advancedFilter') }}
                    </NButton>
                    <NButton :type="showFavoritesOnly ? 'primary' : 'default'" @click="toggleFavoritesFilter">
                        <template #icon>
                            <NIcon>
                                <Heart />
                            </NIcon>
                        </template>
                        {{ t('promptManagement.favorites') }}
                    </NButton>
                    <NButton @click="$emit('manage-categories')">
                        <template #icon>
                            <NIcon>
                                <Folder />
                            </NIcon>
                        </template>
                        {{ t('promptManagement.categories') }}
                    </NButton>
                    <NButtonGroup>
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
                    style="padding: 6px 12px; border-radius: 6px; font-size: 12px; color: var(--n-text-color-disabled);">
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
                <div v-if="showAdvancedFilter">
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
        </NCard> <!-- 提示词列表 -->
        <div v-if="initialLoading" style="text-align: center; padding: 40px;">
            <NSpin size="large" />
        </div>
        <div v-else-if="(viewMode === 'grid' && prompts.length === 0 && !hasNextPage) ||
            (viewMode === 'tree' && treeData.length === 0) ||
            (viewMode === 'table' && prompts.length === 0)" style="text-align: center; padding: 40px;">
            <NEmpty :description="t('promptManagement.noPrompts')" />
        </div>
        <div v-else>
            <!-- 批量操作工具栏 (仅在表格视图且有选中项时显示) -->
            <div v-if="viewMode === 'table' && selectedRows.length > 0" style="margin-bottom: 16px;">
                <NCard>
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
            <div v-if="viewMode === 'tree'" style="margin-top: 16px;">
                <NDataTable :columns="treeTableColumns" :data="treeData" :loading="initialLoading"
                    :row-key="(row: TreeNode) => row.type === 'category' ? `category-${(row.data as CategoryWithRelations).id}` : `prompt-${(row.data as PromptWithRelations).id}`"
                    v-model:checked-row-keys="selectedRowKeys" :max-height="600" :scroll-x="1200"
                    :tree-props="{ children: 'children', hasChildren: 'hasChildren' }" default-expand-all />
            </div>

            <!-- 表格视图 -->
            <div v-else-if="viewMode === 'table'" style="margin-top: 16px;">
                <NDataTable :columns="tableColumns" :data="prompts" :loading="initialLoading || loadingMore"
                    :row-key="(row: PromptWithRelations) => row.id!" v-model:checked-row-keys="selectedRowKeys"
                    :pagination="tablePagination" :max-height="600" :scroll-x="1200" remote />
            </div>

            <!-- 网格视图 (原有的无限滚动) -->
            <div v-else> <!-- 无限滚动容器 -->
                <NInfiniteScroll :distance="100" @load="handleLoadMore" :style="{ minHeight: '400px' }">
                    <div class="prompt-grid">
                        <NCard v-for="prompt in prompts" :key="prompt.id" class="prompt-card" hoverable
                            @click="$emit('view', prompt)">
                            <template #header>
                                <NText strong>{{ prompt.title }}</NText>
                            </template>

                            <template #header-extra>
                                <NFlex size="small">
                                    <NButton size="small" text @click.stop="toggleFavorite(prompt.id!)"
                                        :type="prompt.isFavorite ? 'error' : 'default'">
                                        <template #icon>
                                            <NIcon>
                                                <Heart />
                                            </NIcon>
                                        </template>
                                    </NButton>

                                    <NDropdown :options="getPromptActions(prompt)"
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

                            <NFlex vertical size="small">
                                <!-- 更新时间 -->
                                <!-- <NText depth="3" style="font-size: 12px; color: var(--n-text-color-disabled);">
                                    {{ new Date(prompt.updatedAt).toLocaleDateString() }}
                                </NText> -->
                                <!-- 描述或内容预览 -->
                                <NText depth="3" v-if="prompt.description" class="description-text">
                                    {{ prompt.description }}
                                </NText>
                                <NText depth="3" v-if="!prompt.description" style="font-size: 12px;"
                                    class="content-preview-text">
                                    {{ prompt.content.substring(0, 100) }}{{ prompt.content.length > 100 ? '...' : '' }}
                                </NText>

                            </NFlex>

                            <template #footer>
                                <NFlex justify="space-between" align="center">
                                    <!-- 标签区域 -->
                                    <NFlex size="small" align="center" wrap style="flex: 1; min-width: 0;">
                                        <NTag v-if="prompt.variables && prompt.variables.length > 0" size="small"
                                            type="info">
                                            {{ t('promptManagement.variableCount', { count: prompt.variables.length })
                                            }}
                                        </NTag>
                                        <NTag v-if="prompt.category" size="small"
                                            :color="getCategoryTagColor(prompt.category)">
                                            <template #icon>
                                                <NIcon>
                                                    <Box />
                                                </NIcon>
                                            </template>
                                            {{ prompt.category.name }}
                                        </NTag>
                                        <template v-if="prompt.tags">
                                            <NTag v-for="tag in getTagsArray(prompt.tags)" :key="tag" size="small"
                                                :bordered="false" :color="getTagColor(tag)"
                                                :class="{ 'highlighted-tag': isTagMatched(tag) }">
                                                <template #icon>
                                                    <NIcon>
                                                        <Tag />
                                                    </NIcon>
                                                </template>
                                                {{ tag }}
                                            </NTag>
                                        </template>
                                    </NFlex>
                                    <!-- 使用次数区域 -->
                                    <NText depth="3" style="font-size: 12px; flex-shrink: 0; margin-left: 12px;">
                                        {{ t('promptManagement.useCount', { count: prompt.useCount }) }}
                                    </NText>
                                </NFlex>
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
</template>

<script setup lang="ts">
import { ref, computed, onMounted, h, watch } from 'vue'
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
    Keyboard
} from '@vicons/tabler'
import { api } from '@/lib/api'
import { useI18n } from 'vue-i18n'
import { useTagColors } from '@/composables/useTagColors'
import { useDatabase } from '@/composables/useDatabase'
import type { PromptWithRelations, CategoryWithRelations } from '@shared/types/database'

interface Emits {
    (e: 'edit', prompt: any): void
    (e: 'view', prompt: any): void
    (e: 'refresh'): void
    (e: 'manage-categories'): void
}

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

// 使用标签颜色 composable
const { getTagColor, getTagsArray, getCategoryTagColor } = useTagColors()

// 响应式数据
const prompts = ref<PromptWithRelations[]>([])
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
const viewMode = ref<'grid' | 'table' | 'tree'>('grid') // 'grid' | 'table' | 'tree'

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
    {
        title: t('promptManagement.shortcutTrigger'),
        key: 'isShortcutTrigger',
        width: 100,
        render: (row: PromptWithRelations) => {

        }
    },
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
        icon: () => h(NIcon, null, { default: () => h(Edit) })
    },
    {
        label: t('common.copy'),
        key: 'copy',
        icon: () => h(NIcon, null, { default: () => h(Copy) })
    },
    {
        label: t('promptManagement.delete'),
        key: 'delete',
        icon: () => h(NIcon, null, { default: () => h(Trash) })
    }
]

const handlePromptAction = (action: string, prompt: PromptWithRelations) => {
    switch (action) {
        case 'edit':
            emit('edit', prompt)
            break
        case 'copy':
            handleCopyPrompt(prompt)
            break
        case 'delete':
            handleDeletePrompt(prompt)
            break
    }
}

const handleCopyPrompt = async (prompt: PromptWithRelations) => {
    try {
        await navigator.clipboard.writeText(prompt.content)
        message.success(t('promptManagement.copyPromptSuccess'))
    } catch (error) {
        message.error(t('promptManagement.copyFailed'))
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
    loadStatistics
})
</script>

<style scoped>
.prompt-list {
    display: flex;
    flex-direction: column;
}

.prompt-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
    gap: 16px;
    margin-top: 16px;
}

.prompt-card {
    transition: all 0.3s ease;
    cursor: pointer;
}

.prompt-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

/* 高亮匹配的标签 */
.highlighted-tag {
    border: 1px solid var(--n-color-primary) !important;
    transform: scale(1.02);
    transition: all 0.3s ease;
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
    line-height: 1.4;
    max-height: calc(1.4em * 3);
    /* 限制最大高度为3行 */
    word-break: break-word;
}
</style>
