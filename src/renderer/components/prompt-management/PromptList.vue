<template>
    <div class="prompt-list">
        <!-- 搜索和过滤器 -->
        <NCard>
            <NFlex vertical :size="getCardSpacing()">
                <NFlex>
                    <NInput v-model:value="searchText" placeholder="搜索提示词" style="flex: 1" @input="handleSearch"
                        clearable>
                        <template #prefix>
                            <NIcon>
                                <Search />
                            </NIcon>
                        </template>
                    </NInput>
                    <NSelect v-model:value="sortType" :options="sortOptions" placeholder="排序方式" style="width: 160px; margin-right: 8px" />
                    <NButton :type="showAdvancedFilter ? 'primary' : 'default'" @click="toggleAdvancedFilter">
                        <template #icon>
                            <NIcon>
                                <Tag />
                            </NIcon>
                        </template>
                        高级筛选
                    </NButton>
                    <NButton :type="showFavoritesOnly ? 'primary' : 'default'" @click="toggleFavoritesFilter">
                        <template #icon>
                            <NIcon>
                                <Heart />
                            </NIcon>
                        </template>
                        收藏
                    </NButton>                    <NButton @click="$emit('manage-categories')">
                        <template #icon>
                            <NIcon>
                                <Folder />
                            </NIcon>
                        </template>
                        分类
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
                    </NButtonGroup>
                </NFlex>
                <!-- 搜索提示信息 -->
                <div v-if="searchText.trim() || selectedCategory || showFavoritesOnly"
                    style="padding: 6px 12px; border-radius: 6px; font-size: 12px; color: var(--n-text-color-disabled);">
                    <NIcon size="14" style="margin-right: 4px; vertical-align: middle;">
                        <Search />
                    </NIcon>
                    <span v-if="searchText.trim()">正在搜索: 包含 "{{ searchText.trim() }}" 的提示词</span>
                    <span v-if="selectedCategory"> 分类: {{ getCategoryName(selectedCategory) }}</span>
                    <span v-if="showFavoritesOnly">仅显示收藏</span>
                    <span v-if="!isLoading" style="margin-left: 8px; color: var(--n-color-primary);">
                        (找到 {{ prompts.length }} 个结果)
                    </span>
                </div>

                <!-- 分类和标签筛选区域 (仅在高级筛选开启时显示) -->
                <div v-if="showAdvancedFilter">
                    <!-- 分类快捷筛选 -->
                    <div v-if="categories.length > 0" :style="{ padding: categoriesExpanded ? '4px 0' : '2px 0' }">
                        <NFlex justify="space-between" align="center" style="margin-bottom: 6px;">
                            <NText depth="2" style="font-size: 14px; font-weight: 500;">分类筛选</NText>
                            <NButton text size="small" @click="toggleCategoriesExpanded">
                                <template #icon>
                                    <NIcon>
                                        <ChevronDown v-if="!categoriesExpanded" />
                                        <ChevronUp v-else />
                                    </NIcon>
                                </template>
                                {{ categoriesExpanded ? '收起' : '展开' }}
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
                                    全部分类 ({{ allPrompts.length }})
                                </NTag>
                                <NTag v-for="category in categories" :key="category.id" size="small" :bordered="false"
                                    :checked="selectedCategory === category.id" checkable
                                    :color="getCategoryTagColor(category)"
                                    @click="handleCategoryQuickFilter(category.id)" style="cursor: pointer;">
                                    <template #icon>
                                        <NIcon>
                                            <Box />
                                        </NIcon>
                                    </template>
                                    {{ category.name }} ({{ getCategoryPromptCount(category.id) }})
                                </NTag>
                            </NFlex>
                        </div>
                    </div>

                    <!-- 热门标签快捷搜索 -->
                    <div v-if="popularTags.length > 0" :style="{ padding: tagsExpanded ? '4px 0' : '2px 0' }">
                        <NFlex justify="space-between" align="center" style="margin-bottom: 6px;">
                            <NText depth="2" style="font-size: 14px; font-weight: 500;">热门标签</NText>
                            <NButton text size="small" @click="toggleTagsExpanded">
                                <template #icon>
                                    <NIcon>
                                        <ChevronDown v-if="!tagsExpanded" />
                                        <ChevronUp v-else />
                                    </NIcon>
                                </template>
                                {{ tagsExpanded ? '收起' : '展开' }}
                            </NButton>
                        </NFlex>
                        <div v-show="tagsExpanded">
                            <NFlex size="small" wrap>
                                <NTag v-for="tag in (tagsExpanded ? popularTags : popularTags.slice(0, 6))"
                                    :key="tag.name" size="small" :bordered="false" clickable
                                    :color="getTagColor(tag.name)" @click="handleTagQuickSearch(tag.name)"
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
        </NCard>        <!-- 提示词列表 -->
        <div v-if="initialLoading" style="text-align: center; padding: 40px;">
            <NSpin size="large" />
        </div>
        <div v-else-if="prompts.length === 0 && !hasNextPage" style="text-align: center; padding: 40px;">
            <NEmpty description="暂无提示词，快来创建第一个吧！" />
        </div>        <div v-else>
            <!-- 批量操作工具栏 (仅在表格视图且有选中项时显示) -->
            <div v-if="viewMode === 'table' && selectedRows.length > 0" style="margin-bottom: 16px;">
                <NCard>
                    <NFlex justify="space-between" align="center">
                        <NText>已选择 {{ selectedRows.length }} 个提示词</NText>
                        <NFlex size="small">
                            <NPopconfirm @positive-click="handleBatchDelete">
                                <template #trigger>
                                    <NButton type="error" size="small">
                                        <template #icon>
                                            <NIcon>
                                                <Trash />
                                            </NIcon>
                                        </template>
                                        批量删除
                                    </NButton>
                                </template>
                                确定要删除这 {{ selectedRows.length }} 个提示词吗？此操作不可撤销。
                            </NPopconfirm>
                            <NButton size="small" @click="clearSelection">取消选择</NButton>
                        </NFlex>
                    </NFlex>
                </NCard>
            </div>            <!-- 表格视图 -->
            <div v-if="viewMode === 'table'" style="margin-top: 16px;">
                <NDataTable
                    :columns="tableColumns"
                    :data="prompts"
                    :loading="initialLoading"
                    :row-key="(row: any) => row.id"
                    v-model:checked-row-keys="selectedRowKeys"
                    :pagination="false"
                    :max-height="600"
                    :scroll-x="1200"
                />
                
                <!-- 表格视图的加载更多 -->
                <div v-if="hasNextPage" style="text-align: center; padding: 20px;">
                    <NButton @click="handleLoadMore" :loading="loadingMore">
                        加载更多
                    </NButton>
                </div>
                <div v-else-if="prompts.length > 0" style="text-align: center; padding: 20px;">
                    <NText depth="3">已加载全部 {{ totalCount }} 个提示词</NText>
                </div>
            </div>

            <!-- 网格视图 (原有的无限滚动) -->
            <div v-else>
                <!-- 无限滚动容器 -->
                <NInfiniteScroll 
                    :distance="10" 
                    @load="handleLoadMore"
                    :style="{ minHeight: '400px' }"
                >
                    <div class="prompt-grid">
                        <NCard v-for="prompt in prompts" :key="prompt.id" class="prompt-card" hoverable
                            @click="$emit('view', prompt)">
                            <template #header>
                                <NText strong>{{ prompt.title }}</NText>
                            </template>

                            <template #header-extra>
                                <NFlex size="small">
                                    <NButton size="small" text @click.stop="toggleFavorite(prompt.id)"
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
                                <NText 
                                    depth="3" 
                                    v-if="prompt.description" 
                                    class="description-text"
                                >
                                    {{ prompt.description }}
                                </NText>
                                <NText 
                                    depth="3" 
                                    v-if="!prompt.description" 
                                    style="font-size: 12px;" 
                                    class="content-preview-text"
                                >
                                    {{ prompt.content.substring(0, 100) }}{{ prompt.content.length > 100 ? '...' : '' }}
                                </NText>

                            </NFlex>

                            <template #footer>
                                <NFlex justify="space-between" align="center">
                                    <!-- 标签区域 -->
                                    <NFlex size="small" align="center" wrap style="flex: 1; min-width: 0;">
                                        <NTag v-if="prompt.variables?.length > 0" size="small" type="info">
                                            {{ prompt.variables.length }} 个变量
                                        </NTag>
                                        <NTag v-if="prompt.category" size="small" :color="getCategoryTagColor(prompt.category)">
                                            <template #icon>
                                                <NIcon>
                                                    <Box />
                                                </NIcon>
                                            </template>
                                            {{ prompt.category.name }}
                                        </NTag>
                                        <template v-if="prompt.tags">
                                            <NTag v-for="tag in getTagsArray(prompt.tags)" :key="tag" size="small" :bordered="false"
                                                :color="getTagColor(tag)" :class="{ 'highlighted-tag': isTagMatched(tag) }">
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
                                        使用 {{ prompt.useCount }} 次
                                    </NText>
                                </NFlex>
                            </template>
                        </NCard>
                    </div>

                    <!-- 加载更多状态 -->
                    <template #footer>
                        <div v-if="loadingMore" style="text-align: center; padding: 20px;">
                            <NSpin size="medium" />
                            <NText depth="3" style="margin-left: 12px;">加载更多中...</NText>
                        </div>
                        <div v-else-if="!hasNextPage && prompts.length > 0" style="text-align: center; padding: 20px;">
                            <NText depth="3">已加载全部 {{ totalCount }} 个提示词</NText>
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
    GridDots
} from '@vicons/tabler'
import { api } from '@/lib/api'
import { useTagColors } from '@/composables/useTagColors'
import { useDatabase } from '@/composables/useDatabase'

interface Emits {
    (e: 'edit', prompt: any): void
    (e: 'view', prompt: any): void
    (e: 'refresh'): void
    (e: 'manage-categories'): void
}

const emit = defineEmits<Emits>()
const message = useMessage()
const { waitForDatabase } = useDatabase()

// 使用标签颜色 composable
const { getTagColor, getTagsArray, getCategoryTagColor } = useTagColors()

// 响应式数据
const prompts = ref([])
const categories = ref([])
const allPrompts = ref([]) // 保存所有提示词，用于计算热门标签
const initialLoading = ref(false) // 首次加载状态
const loadingMore = ref(false) // 加载更多状态
const searchText = ref('')
const selectedCategory = ref(null)
const showFavoritesOnly = ref(false)

// 排序相关状态
const sortType = ref('timeDesc') // 默认按时间倒序排序
const sortOptions = [
    { label: '最新优先', value: 'timeDesc' },
    { label: '最早优先', value: 'timeAsc' },
    { label: '使用次数', value: 'useCount' },
    { label: '收藏优先', value: 'favorite' }
]

// 分页相关状态
const currentPage = ref(1)
const pageSize = ref(12) // 每页加载12个
const hasNextPage = ref(true)
const totalCount = ref(0)

// 高级筛选开关
const showAdvancedFilter = ref(false)

// 折叠展开状态
const categoriesExpanded = ref(true) // 高级筛选开启时默认展开
const tagsExpanded = ref(true) // 高级筛选开启时默认展开

// 视图模式状态
const viewMode = ref('grid') // 'grid' | 'table'

// 表格多选相关状态
const selectedRowKeys = ref([])
const selectedRows = computed(() => {
    return prompts.value.filter(prompt => selectedRowKeys.value.includes(prompt.id))
})

// 计算属性
const categoryOptions = computed(() => [
    { label: '全部分类', value: null },
    ...categories.value.map(cat => ({
        label: `${cat.name} (${cat._count?.prompts || 0})`,
        value: cat.id
    }))
])

// 获取分类名称
const getCategoryName = (categoryId: string | null) => {
    if (!categoryId) return '全部分类'
    const category = categories.value.find(cat => cat.id === categoryId)
    return category?.name || '未知分类'
}

// 获取分类下的提示词数量
const getCategoryPromptCount = (categoryId: string | null) => {
    if (!categoryId) return allPrompts.value.length
    return allPrompts.value.filter(prompt => prompt.categoryId === categoryId).length
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
    const tagCounts = new Map()

    allPrompts.value.forEach(prompt => {
        if (prompt.tags) {
            const tags = getTagsArray(prompt.tags)
            tags.forEach(tag => {
                const trimmedTag = tag.trim()
                if (trimmedTag) {
                    tagCounts.set(trimmedTag, (tagCounts.get(trimmedTag) || 0) + 1)
                }
            })
        }
    })

    return Array.from(tagCounts.entries())
        .map(([name, count]) => ({ name, count }))        .sort((a, b) => b.count - a.count)
})

// 表格列定义
const tableColumns = computed(() => [
    {
        type: 'selection'
    },
    {
        title: '标题',
        key: 'title',
        width: 200,
        ellipsis: {
            tooltip: true
        },
        render: (row: any) => {
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
        title: '描述',
        key: 'description',
        width: 300,
        ellipsis: {
            tooltip: true
        },
        render: (row: any) => {
            if (row.description) {
                return row.description
            }
            const preview = row.content?.substring(0, 100) || ''
            return preview + (row.content?.length > 100 ? '...' : '')
        }
    },
    {
        title: '分类',
        key: 'category',
        width: 120,
        render: (row: any) => {
            if (!row.category) return '-'
            return h(
                NTag,
                {
                    size: 'small',
                    color: getCategoryTagColor(row.category)
                },
                {
                    default: () => row.category.name,
                    icon: () => h(NIcon, null, { default: () => h(Box) })
                }
            )
        }
    },
    {
        title: '标签',
        key: 'tags',
        width: 200,
        render: (row: any) => {
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
                        tags.length > 3 ? [h(NText, { depth:3, style: { fontSize: '12px' } }, { default: () => `+${tags.length - 3}` })] : []
                    )
                }
            )
        }
    },
    {
        title: '变量',
        key: 'variables',
        width: 80,
        render: (row: any) => {
            const count = row.variables?.length || 0
            return count > 0 ? h(
                NTag,
                { size: 'small', type: 'info' },
                { default: () => `${count}个` }
            ) : '-'
        }
    },
    {
        title: '收藏',
        key: 'isFavorite',
        width: 80,
        render: (row: any) => {
            return h(
                NButton,
                {
                    size: 'small',
                    text: true,
                    type: row.isFavorite ? 'error' : 'default',
                    onClick: (e: Event) => {
                        e.stopPropagation()
                        toggleFavorite(row.id)
                    }
                },
                {
                    icon: () => h(NIcon, null, { default: () => h(Heart) })
                }
            )
        }
    },
    {
        title: '使用次数',
        key: 'useCount',
        width: 100,
        sorter: true,
        render: (row: any) => `${row.useCount || 0} 次`
    },
    {
        title: '更新时间',
        key: 'updatedAt',
        width: 120,
        sorter: true,
        render: (row: any) => new Date(row.updatedAt).toLocaleDateString()
    },
    {
        title: '操作',
        key: 'actions',
        width: 120,
        render: (row: any) => {
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

// 加载数据
const loadPrompts = async (reset = true) => {
    try {
        if (reset) {
            initialLoading.value = true
            currentPage.value = 1
            prompts.value = []
        } else {
            loadingMore.value = true
        }

        // 加载所有提示词用于计算热门标签（仅在首次加载时）
        if (reset) {
            allPrompts.value = await api.prompts.getAllForTags.query()
        }

        // 根据过滤条件加载显示的提示词（分页）
        const filters = {
            categoryId: selectedCategory.value || undefined,
            search: searchText.value || undefined,
            isFavorite: showFavoritesOnly.value || undefined,
            page: currentPage.value,
            limit: pageSize.value,
            sortBy: sortType.value // 添加排序参数
        }
        
        const result = await api.prompts.getAll.query(filters)
        
        // 如果是重置加载，直接替换数据；否则追加数据
        if (reset) {
            prompts.value = result.data || []
            totalCount.value = result.total || 0
        } else {
            prompts.value = [...prompts.value, ...(result.data || [])]
        }
        
        // 更新分页状态
        hasNextPage.value = result.hasMore || false
        
    } catch (error) {
        message.error('加载提示词失败')
        console.error(error)    } finally {
        initialLoading.value = false
        loadingMore.value = false
    }
}

// 切换视图模式
const setViewMode = (mode: 'grid' | 'table') => {
    viewMode.value = mode
    // 切换到表格视图时清除选择
    if (mode === 'table') {
        clearSelection()
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
        // 批量删除所有选中的提示词
        for (const prompt of selectedRows.value) {
            await api.prompts.delete.mutate(prompt.id)
        }
        
        message.success(`成功删除 ${selectedRows.value.length} 个提示词`)
        clearSelection()
        await loadPrompts(true) // 重新加载数据
        emit('refresh')
    } catch (error) {
        message.error('批量删除失败')
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

const loadCategories = async () => {
    try {
        categories.value = await api.categories.getAll.query()
    } catch (error) {
        message.error('加载分类失败')
        console.error(error)
    }
}

// 事件处理
const handleSearch = () => {
    loadPrompts(true) // 重置加载
}

// 监听排序方式变化
watch(sortType, () => {
    loadPrompts(true) // 排序方式变化时重新加载数据
})

const handleCategoryFilter = () => {
    loadPrompts(true) // 重置加载
}

const handleCategoryQuickFilter = (categoryId: string | null) => {
    selectedCategory.value = categoryId
    loadPrompts(true) // 重置加载
}

const toggleCategoriesExpanded = () => {
    categoriesExpanded.value = !categoriesExpanded.value
}

const toggleTagsExpanded = () => {
    tagsExpanded.value = !tagsExpanded.value
}

const toggleFavoritesFilter = () => {
    showFavoritesOnly.value = !showFavoritesOnly.value
    loadPrompts(true) // 重置加载
}

const toggleAdvancedFilter = () => {
    showAdvancedFilter.value = !showAdvancedFilter.value
    // 当开启高级筛选时，默认展开分类和标签区域
    if (showAdvancedFilter.value) {
        categoriesExpanded.value = true
        tagsExpanded.value = true
    }
}

const toggleFavorite = async (promptId) => {
    try {
        // 先乐观更新UI
        const prompt = prompts.value.find(p => p.id === promptId)
        if (prompt) {
            prompt.isFavorite = !prompt.isFavorite
        }

        await api.prompts.toggleFavorite.mutate(promptId)
        message.success('收藏状态已更新')
        emit('refresh')
    } catch (error) {
        // 如果API调用失败，回滚UI状态
        const prompt = prompts.value.find(p => p.id === promptId)
        if (prompt) {
            prompt.isFavorite = !prompt.isFavorite
        }
        message.error('更新收藏状态失败')
        console.error(error)
    }
}

// 检查标签是否匹配搜索关键词
const isTagMatched = (tag: string) => {
    if (!searchText.value.trim()) return false
    return tag.toLowerCase().includes(searchText.value.toLowerCase())
}

// 快速标签搜索
const handleTagQuickSearch = (tagName: string) => {
    searchText.value = tagName
    handleSearch()
}

const getPromptActions = (prompt) => [
    {
        label: '编辑',
        key: 'edit',
        icon: () => h(NIcon, null, { default: () => h(Edit) })
    },
    {
        label: '复制',
        key: 'copy',
        icon: () => h(NIcon, null, { default: () => h(Copy) })
    },
    {
        label: '删除',
        key: 'delete',
        icon: () => h(NIcon, null, { default: () => h(Trash) })
    }
]

const handlePromptAction = (action, prompt) => {
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

const handleCopyPrompt = async (prompt) => {
    try {
        await navigator.clipboard.writeText(prompt.content)
        message.success('提示词内容已复制到剪贴板')
    } catch (error) {
        message.error('复制失败')
    }
}

const handleDeletePrompt = async (prompt) => {
    if (confirm(`确定要删除 "${prompt.title}" 吗？`)) {
        try {
            await api.prompts.delete.mutate(prompt.id)
            await loadPrompts(true) // 重置加载
            message.success('提示词已删除')
            emit('refresh')
        } catch (error) {
            message.error('删除失败')
            console.error(error)
        }
    }
}

// 组件挂载时加载数据
onMounted(async () => {
    await waitForDatabase()
    loadPrompts(true) // 初始加载
    loadCategories()
})

// 暴露方法给父组件
defineExpose({
    loadPrompts: () => loadPrompts(true),
    loadCategories
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
    max-height: calc(1.4em * 3); /* 限制最大高度为3行 */
    word-break: break-word;
}
</style>
