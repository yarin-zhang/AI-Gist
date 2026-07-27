<template>
    <CommonModal ref="modalRef" :show="show" @update:show="$emit('update:show', $event)" @close="handleClose">
        <!-- 顶部固定区域 -->
        <template #header>
            <NText :style="{ fontSize: 'var(--font-size-xl)', fontWeight: 'var(--font-weight-semibold)' }">{{ t('promptManagement.categoryManageTitle') }}
            </NText>
            <NText depth="3">{{ t('promptManagement.categoryManageDesc') }}</NText>
        </template><!-- 中间可操作区域 --> <template #content="{ contentHeight }">
            <NSplit direction="horizontal" :style="{ height: `${contentHeight}px` }" :default-size="0.6" :min="0.3"
                :max="0.8" :disabled="modalWidth <= 800">

                <!-- 左侧：分类列表 -->
                <template #1>
                    <NCard :title="t('promptManagement.existingCategories')" size="small" :style="{ height: '100%' }">
                        <template #header-extra>
                            <NText depth="3" style="font-size: 12px;">
                                {{ t('promptManagement.totalCategories', { count: categories.length }) }}
                            </NText>
                        </template>
                        <NScrollbar :style="{ height: `${contentHeight - 80}px` }">
                            <NFlex vertical size="medium" style="padding-right: 12px;" v-if="orderedCategories.length > 0">
                                <div v-for="category in orderedCategories" :key="category.id"
                                    class="category-order-item" :class="{
                                        dragging: draggingCategoryId === category.id,
                                        'drop-before': dropTargetCategoryId === category.id && dropPosition === 'before',
                                        'drop-after': dropTargetCategoryId === category.id && dropPosition === 'after',
                                    }" @dragover.prevent="handleCategoryDragOver($event, category)"
                                    @drop.prevent="handleCategoryDrop(category)">
                                    <NCard size="small" hoverable>
                                        <NFlex justify="space-between" align="center">
                                            <NFlex align="center" size="medium">
                                                <div class="color-indicator"
                                                    :style="{ backgroundColor: category.color || 'var(--accent-success)' }">
                                                </div>
                                                <div v-if="editingCategory?.id === category.id" style="min-width: 200px;">
                                                    <NFlex vertical size="small">
                                                        <NInput v-model:value="editingCategory!.name" size="small"
                                                            :placeholder="t('promptManagement.categoryName')" />
                                                        <NColorPicker v-model:value="editingCategory!.color"
                                                            :modes="['hex']" :swatches="COLOR_SWATCHES" size="small"
                                                            style="width: 100%;" />
                                                    </NFlex>
                                                </div>
                                                <div v-else>
                                                    <NFlex vertical size="small">
                                                        <NText strong>{{ category.name }}</NText>
                                                        <NText depth="3" style="font-size: 12px;">
                                                            {{ t('promptManagement.categoryPromptCount', {
                                                                count:
                                                            getCategoryPromptCount(category.id) }) }}
                                                        </NText>
                                                    </NFlex>
                                                </div>
                                            </NFlex>

                                            <NFlex size="small">
                                                <div v-if="editingCategory?.id === category.id">
                                                    <NFlex size="small">
                                                        <NButton size="small" type="primary" @click="handleSaveEdit"
                                                            :loading="updating">
                                                            {{ t('common.save') }}
                                                        </NButton>
                                                        <NButton size="small" @click="handleCancelEdit">
                                                            {{ t('common.cancel') }}
                                                        </NButton>
                                                    </NFlex>
                                                </div>
                                                <div v-else>
                                                    <NFlex size="small">
                                                        <NTooltip>
                                                            <template #trigger>
                                                                <NButton size="small" quaternary circle
                                                                    class="category-drag-handle"
                                                                    :draggable="orderedCategories.length > 1 && !reordering && editingCategory === null"
                                                                    :aria-label="t('promptManagement.categoryDragHandle', { name: category.name })"
                                                                    :disabled="orderedCategories.length < 2 || reordering || editingCategory !== null"
                                                                    @dragstart="handleCategoryDragStart($event, category)"
                                                                    @dragend="handleCategoryDragEnd">
                                                                    <template #icon><NIcon size="16"><GripVertical /></NIcon></template>
                                                                </NButton>
                                                            </template>
                                                            {{ t('promptManagement.categoryDragHint') }}
                                                        </NTooltip>
                                                        <NButton size="small" text @click="handleEdit(category)">
                                                            <template #icon>
                                                                <NIcon>
                                                                    <Edit />
                                                                </NIcon>
                                                            </template>
                                                            {{ t('common.edit') }}
                                                        </NButton>
                                                        <NButton size="small" text type="error"
                                                            @click="handleDelete(category)"
                                                            :disabled="getCategoryPromptCount(category.id) > 0">
                                                            <template #icon>
                                                                <NIcon>
                                                                    <Trash />
                                                                </NIcon>
                                                            </template>
                                                            {{ t('common.delete') }}
                                                        </NButton>
                                                    </NFlex>
                                                </div>
                                            </NFlex>
                                        </NFlex>
                                    </NCard>
                                </div>
                            </NFlex>
                            <NEmpty v-else :description="t('promptManagement.noCategories')" size="large">
                                <template #icon>
                                    <NIcon size="48">
                                        <Edit />
                                    </NIcon>
                                </template>
                            </NEmpty>
                        </NScrollbar>
                    </NCard>
                </template>
                <!-- 右侧：创建新分类 -->
                <template #2>
                    <NCard :title="t('promptManagement.createCategory')" size="small" :style="{ height: '100%' }">
                        <NScrollbar :style="{ height: `${contentHeight - 80}px` }">
                            <NFlex vertical size="medium" style="padding-right: 12px;">
                                <NForm :model="newCategory">
                                    <NFlex vertical size="medium">
                                        <NFormItem :label="t('promptManagement.categoryName')">
                                            <NInput v-model:value="newCategory.name"
                                                :placeholder="t('promptManagement.categoryNamePlaceholder')"
                                                @keyup.enter="handleCreate" />
                                        </NFormItem>
                                        <NFormItem :label="t('promptManagement.color')">
                                            <NColorPicker v-model:value="newCategory.color" :modes="['hex']"
                                                :swatches="COLOR_SWATCHES" style="width: 100%;" />
                                        </NFormItem>
                                        <NFormItem>
                                            <NButton type="primary" @click="handleCreate" :loading="creating" block>
                                                <template #icon>
                                                    <NIcon>
                                                        <Edit />
                                                    </NIcon>
                                                </template>
                                                {{ t('promptManagement.createCategory') }}
                                            </NButton>
                                        </NFormItem>
                                    </NFlex>
                                </NForm>
                            </NFlex>
                        </NScrollbar>
                    </NCard>
                </template>
            </NSplit>
        </template><!-- 底部固定区域 --> <template #footer>
            <NFlex justify="end" align="center">
                <NButton @click="handleClose">{{ t('common.close') }}</NButton>
            </NFlex>
        </template>
    </CommonModal>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import {
    NCard,
    NFlex,
    NText,
    NForm,
    NFormItem,
    NInput,
    NButton,
    NIcon,
    NColorPicker,
    NEmpty,
    NScrollbar,
    NSplit,
    NTooltip,
    useMessage,
    useDialog
} from 'naive-ui'
import { Edit, GripVertical, Trash } from '@vicons/tabler'
import { api } from '@/lib/api'
import { useTagColors } from '@/composables/useTagColors'
import { useWindowSize } from '@/composables/useWindowSize'
import CommonModal from '@/components/common/CommonModal.vue'
import { useI18n } from 'vue-i18n'
import type { Category } from '@shared/types/database'
import {
    reorderCategoriesByDrop,
    sortCategoriesByOrder,
    type CategoryDropPosition,
} from '@/lib/utils/category-order'

interface Props {
    show: boolean
    categories: Category[]
}

interface Emits {
    (e: 'update:show', value: boolean): void
    (e: 'updated'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const message = useMessage()
const dialog = useDialog()
const { t } = useI18n()

// 使用统一的颜色配置
const { COLOR_SWATCHES } = useTagColors()

// 获取窗口尺寸用于响应式布局
const { modalWidth } = useWindowSize()

// 响应式数据
const newCategory = ref({
    name: '',
    color: '#18a058'
})

const editingCategory = ref<{
    id: number;
    name: string;
    color: string;
} | null>(null)
const creating = ref(false)
const updating = ref(false)
const reordering = ref(false)
const orderedCategories = ref<Category[]>([])
const draggingCategoryId = ref<number | null>(null)
const dropTargetCategoryId = ref<number | null>(null)
const dropPosition = ref<CategoryDropPosition | null>(null)

// 统计信息
const statistics = ref<{
    totalCount: number;
    categoryStats: Array<{ id: string | null, name: string, count: number }>;
    popularTags: Array<{ name: string, count: number }>;
}>({
    totalCount: 0,
    categoryStats: [],
    popularTags: []
})

// 获取分类下的提示词数量
const getCategoryPromptCount = (categoryId: number) => {
    const categoryStats = statistics.value.categoryStats.find(stat => stat.id === categoryId?.toString())
    const count = categoryStats ? categoryStats.count : 0
    console.log(`CategoryManageModal - getCategoryPromptCount(${categoryId}):`, {
        categoryId,
        categoryStats,
        foundStat: categoryStats,
        count,
        allStats: statistics.value.categoryStats
    })
    return count
}

// 加载统计信息
const loadStatistics = async () => {
    try {
        statistics.value = await api.prompts.getStatistics.query()
        console.log('CategoryManageModal - Statistics loaded:', {
            totalCount: statistics.value.totalCount,
            categoryStats: statistics.value.categoryStats,
            categoryStatsLength: statistics.value.categoryStats.length
        })
    } catch (error) {
        console.error('加载统计信息失败:', error)
    }
}

// 方法
const handleCreate = async () => {
    if (!newCategory.value.name.trim()) {
        message.warning(t('promptManagement.enterCategoryName'))
        return
    }

    try {
        creating.value = true
        await api.categories.create.mutate({
            name: newCategory.value.name,
            color: newCategory.value.color,
            uuid: '', // 这个会被服务层自动生成
            isActive: true,
            description: ''
        })

        newCategory.value = {
            name: '',
            color: '#18a058'
        }

        message.success(t('promptManagement.categoryCreatedSuccess'))
        // 重新加载统计信息
        await loadStatistics()
        emit('updated')
    } catch (error) {
        message.error(t('promptManagement.categoryCreatedFailed'))
        console.error(error)
    } finally {
        creating.value = false
    }
}

const handleEdit = (category: any) => {
    editingCategory.value = {
        id: category.id,
        name: category.name,
        color: category.color || '#18a058'
    }
}

const handleSaveEdit = async () => {
    if (!editingCategory.value?.name.trim()) {
        message.warning(t('promptManagement.enterCategoryName'))
        return
    }

    try {
        updating.value = true
        await api.categories.update.mutate({
            id: editingCategory.value.id,
            data: {
                name: editingCategory.value.name,
                color: editingCategory.value.color
            }
        })

        editingCategory.value = null
        message.success(t('promptManagement.categoryUpdatedSuccess'))
        // 重新加载统计信息
        await loadStatistics()
        emit('updated')
    } catch (error) {
        message.error(t('promptManagement.categoryUpdatedFailed'))
        console.error(error)
    } finally {
        updating.value = false
    }
}

const handleCancelEdit = () => {
    editingCategory.value = null
}

const persistCategoryOrder = async (nextOrder: Category[], previousOrder: Category[]) => {
    orderedCategories.value = nextOrder
    reordering.value = true

    try {
        await api.categories.reorder.mutate(nextOrder.flatMap((item, sortOrder) => (
            item.id ? [{ id: item.id, sortOrder }] : []
        )))
        message.success(t('promptManagement.categoryOrderUpdatedSuccess'))
        emit('updated')
    } catch (error) {
        orderedCategories.value = previousOrder
        message.error(t('promptManagement.categoryOrderUpdatedFailed'))
        console.error(error)
    } finally {
        reordering.value = false
    }
}

const resetCategoryDragState = () => {
    draggingCategoryId.value = null
    dropTargetCategoryId.value = null
    dropPosition.value = null
}

const handleCategoryDragStart = (event: DragEvent, category: Category) => {
    if (!category.id || editingCategory.value || reordering.value || !event.dataTransfer) {
        event.preventDefault()
        return
    }

    draggingCategoryId.value = category.id
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(category.id))

    const item = (event.currentTarget as HTMLElement | null)?.closest('.category-order-item') as HTMLElement | null
    if (item) event.dataTransfer.setDragImage(item, 24, 24)
}

const handleCategoryDragOver = (event: DragEvent, category: Category) => {
    if (!draggingCategoryId.value || draggingCategoryId.value === category.id || !category.id) {
        dropTargetCategoryId.value = null
        dropPosition.value = null
        return
    }

    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    const item = event.currentTarget as HTMLElement
    const bounds = item.getBoundingClientRect()
    dropTargetCategoryId.value = category.id
    dropPosition.value = event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after'
}

const handleCategoryDrop = async (targetCategory: Category) => {
    const sourceId = draggingCategoryId.value
    const position = dropPosition.value
    const previousOrder = [...orderedCategories.value]
    resetCategoryDragState()

    if (!sourceId || !targetCategory.id || !position || sourceId === targetCategory.id || reordering.value) return

    const nextOrder = reorderCategoriesByDrop(
        previousOrder,
        sourceId,
        targetCategory.id,
        position,
    )

    if (nextOrder.every((category, index) => category.id === previousOrder[index]?.id)) return
    await persistCategoryOrder(nextOrder, previousOrder)
}

const handleCategoryDragEnd = () => {
    resetCategoryDragState()
}

const handleDelete = (category: any) => {
    const promptCount = getCategoryPromptCount(category.id)
    if (promptCount > 0) {
        message.warning(t('promptManagement.categoryHasPrompts'))
        return
    }

    dialog.error({
        title: t('common.confirm'),
        content: t('promptManagement.confirmDeleteCategory', { name: category.name }),
        positiveText: t('common.delete'),
        negativeText: t('common.cancel'),
        onPositiveClick: async () => {
            try {
                await api.categories.delete.mutate(category.id)
                message.success(t('promptManagement.categoryDeletedSuccess'))
                // 重新加载统计信息
                await loadStatistics()
                emit('updated')
            } catch (error) {
                message.error(t('promptManagement.categoryDeletedFailed'))
                console.error(error)
            }
        },
    })
}

const handleClose = () => {
    editingCategory.value = null
    resetCategoryDragState()
    emit('update:show', false)
}

// 监听显示状态，重置编辑状态并加载统计信息
watch(() => props.show, async (show) => {
    if (!show) {
        editingCategory.value = null
        resetCategoryDragState()
    } else {
        // 当模态框显示时，加载最新的统计信息
        console.log('CategoryManageModal - Modal opened, loading statistics...')
        await loadStatistics()
        console.log('CategoryManageModal - Statistics loaded after modal opened:', {
            totalCount: statistics.value.totalCount,
            categoryStats: statistics.value.categoryStats,
            categories: props.categories
        })
    }
})

// 监听分类数据变化，重新加载统计信息
watch(() => props.categories, async (newCategories) => {
    if (!reordering.value) {
        orderedCategories.value = sortCategoriesByOrder(newCategories)
    }
    if (props.show && newCategories.length > 0) {
        console.log('CategoryManageModal - Categories changed, reloading statistics...')
        await loadStatistics()
    }
}, { deep: true, immediate: true })
</script>

<style scoped>
.category-order-item {
    position: relative;
}

.category-order-item::before,
.category-order-item::after {
    content: '';
    position: absolute;
    z-index: 2;
    left: 8px;
    right: 8px;
    height: 2px;
    border-radius: var(--radius-control);
    background: var(--accent-primary);
    opacity: 0;
    pointer-events: none;
}

.category-order-item::before { top: -7px; }
.category-order-item::after { bottom: -7px; }
.category-order-item.drop-before::before,
.category-order-item.drop-after::after { opacity: 1; }
.category-order-item.dragging { opacity: .46; }
.category-order-item.dragging :deep(.n-card) { box-shadow: var(--shadow-popover); }
.category-drag-handle { cursor: grab; color: var(--content-secondary); }
.category-drag-handle:active { cursor: grabbing; }

.color-indicator {
    width: 16px;
    height: 16px;
    border-radius: 50%;
}
</style>
