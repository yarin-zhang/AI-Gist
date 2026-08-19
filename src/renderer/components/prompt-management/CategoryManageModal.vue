<template>
    <CommonModal ref="modalRef" :show="show" @update:show="$emit('update:show', $event)" @close="handleClose">
        <!-- 顶部固定区域 -->
        <template #header>
            <NText :style="{ fontSize: 'var(--font-size-xl)', fontWeight: 'var(--font-weight-semibold)' }">{{ t('promptManagement.categoryManageTitle') }}
            </NText>
            <NText depth="3">{{ t('promptManagement.categoryManageDesc') }}</NText>
        </template>

        <!-- 中间可操作区域：统一的单页分类列表管理 -->
        <template #content="{ contentHeight }">
            <div class="category-manage" :style="{ height: `${contentHeight}px` }">
                <div class="category-manage-toolbar ui-toolbar">
                    <NText depth="3" class="category-manage-count">
                        {{ t('promptManagement.totalCategories', { count: categories.length }) }}
                    </NText>
                    <NButton type="primary" size="small" :disabled="editingCategory !== null || isCreating"
                        @click="startCreating">
                        <template #icon><NIcon size="16"><Plus /></NIcon></template>
                        {{ t('promptManagement.createCategory') }}
                    </NButton>
                </div>

                <NScrollbar class="category-manage-scroll">
                    <div class="category-manage-list">
                        <!-- 新建分类：内联行，置顶方便快速录入 -->
                        <div v-if="isCreating" class="category-row category-row-editing">
                            <NPopover trigger="click" placement="bottom-start" :show-arrow="false">
                                <template #trigger>
                                    <button type="button" class="category-color-swatch"
                                        :style="{ backgroundColor: newCategory.color }"
                                        :aria-label="t('promptManagement.color')" />
                                </template>
                                <div class="category-color-picker-panel">
                                    <NColorPicker v-model:value="newCategory.color" :modes="['hex']"
                                        :swatches="COLOR_SWATCHES" />
                                </div>
                            </NPopover>
                            <NInput v-model:value="newCategory.name" size="small" class="category-row-name-input"
                                :placeholder="t('promptManagement.categoryNamePlaceholder')" autofocus
                                @keyup.enter="handleCreate" />
                            <div class="category-row-actions">
                                <NButton size="small" type="primary" @click="handleCreate" :loading="creating">
                                    {{ t('promptManagement.createCategory') }}
                                </NButton>
                                <NButton size="small" @click="cancelCreating" :disabled="creating">
                                    {{ t('common.cancel') }}
                                </NButton>
                            </div>
                        </div>

                        <!-- 现有分类：拖拽排序 + 内联编辑/删除 -->
                        <div v-for="category in orderedCategories" :key="category.id" class="category-order-item"
                            :class="{
                                dragging: draggingCategoryId === category.id,
                                'drop-before': dropTargetCategoryId === category.id && dropPosition === 'before',
                                'drop-after': dropTargetCategoryId === category.id && dropPosition === 'after',
                            }" @dragover.prevent="handleCategoryDragOver($event, category)"
                            @drop.prevent="handleCategoryDrop(category)">
                            <div class="category-row"
                                :class="{ 'category-row-editing': editingCategory?.id === category.id }">
                                <template v-if="editingCategory?.id === category.id">
                                    <NPopover trigger="click" placement="bottom-start" :show-arrow="false">
                                        <template #trigger>
                                            <button type="button" class="category-color-swatch"
                                                :style="{ backgroundColor: editingCategory!.color }"
                                                :aria-label="t('promptManagement.color')" />
                                        </template>
                                        <div class="category-color-picker-panel">
                                            <NColorPicker v-model:value="editingCategory!.color" :modes="['hex']"
                                                :swatches="COLOR_SWATCHES" />
                                        </div>
                                    </NPopover>
                                    <NInput v-model:value="editingCategory!.name" size="small"
                                        class="category-row-name-input" :placeholder="t('promptManagement.categoryName')"
                                        @keyup.enter="handleSaveEdit" />
                                    <div class="category-row-actions">
                                        <NButton size="small" type="primary" @click="handleSaveEdit"
                                            :loading="updating">
                                            {{ t('common.save') }}
                                        </NButton>
                                        <NButton size="small" @click="handleCancelEdit" :disabled="updating">
                                            {{ t('common.cancel') }}
                                        </NButton>
                                    </div>
                                </template>
                                <template v-else>
                                    <NButton size="small" quaternary circle class="category-drag-handle"
                                        :draggable="orderedCategories.length > 1 && !reordering && editingCategory === null && !isCreating"
                                        :aria-label="t('promptManagement.categoryDragHandle', { name: category.name })"
                                        :disabled="orderedCategories.length < 2 || reordering || editingCategory !== null || isCreating"
                                        @dragstart="handleCategoryDragStart($event, category)"
                                        @dragend="handleCategoryDragEnd">
                                        <template #icon><NIcon size="16"><GripVertical /></NIcon></template>
                                    </NButton>

                                    <span class="category-color-dot"
                                        :style="{ backgroundColor: category.color || 'var(--accent-success)' }" />

                                    <div class="category-row-info">
                                        <NText strong class="category-row-name">{{ category.name }}</NText>
                                        <NText depth="3" class="category-row-count">
                                            {{ t('promptManagement.categoryPromptCount', {
                                                count: getCategoryPromptCount(category.id)
                                            }) }}
                                        </NText>
                                    </div>

                                    <div class="category-row-actions">
                                        <NTooltip>
                                            <template #trigger>
                                                <NButton size="small" quaternary circle @click="handleEdit(category)"
                                                    :disabled="isCreating || (editingCategory !== null && editingCategory.id !== category.id)"
                                                    :aria-label="t('common.edit')">
                                                    <template #icon><NIcon size="16"><Edit /></NIcon></template>
                                                </NButton>
                                            </template>
                                            {{ t('common.edit') }}
                                        </NTooltip>
                                        <NTooltip>
                                            <template #trigger>
                                                <NButton size="small" quaternary circle type="error"
                                                    @click="handleDelete(category)"
                                                    :disabled="getCategoryPromptCount(category.id) > 0 || isCreating || (editingCategory !== null && editingCategory.id !== category.id)"
                                                    :aria-label="t('common.delete')">
                                                    <template #icon><NIcon size="16"><Trash /></NIcon></template>
                                                </NButton>
                                            </template>
                                            {{ t('common.delete') }}
                                        </NTooltip>
                                    </div>
                                </template>
                            </div>
                        </div>

                        <NEmpty v-if="!isCreating && orderedCategories.length === 0"
                            :description="t('promptManagement.categoryManageEmpty')" size="large" class="category-manage-empty">
                            <template #icon>
                                <NIcon size="48">
                                    <FolderPlus />
                                </NIcon>
                            </template>
                        </NEmpty>
                    </div>
                </NScrollbar>
            </div>
        </template>

        <!-- 底部固定区域 -->
        <template #footer>
            <NFlex justify="end" align="center">
                <NButton @click="handleClose">{{ t('common.close') }}</NButton>
            </NFlex>
        </template>
    </CommonModal>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import {
    NFlex,
    NText,
    NInput,
    NButton,
    NIcon,
    NColorPicker,
    NEmpty,
    NScrollbar,
    NPopover,
    NTooltip,
    useMessage,
    useDialog
} from 'naive-ui'
import { Edit, FolderPlus, GripVertical, Plus, Trash } from '@vicons/tabler'
import { api } from '@/lib/api'
import { useTagColors } from '@/composables/useTagColors'
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

const DEFAULT_CATEGORY_COLOR = '#18a058'

// 响应式数据
const newCategory = ref({
    name: '',
    color: DEFAULT_CATEGORY_COLOR
})

const isCreating = ref(false)
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
    return categoryStats ? categoryStats.count : 0
}

// 加载统计信息
const loadStatistics = async () => {
    try {
        statistics.value = await api.prompts.getStatistics.query()
    } catch (error) {
        console.error('加载统计信息失败:', error)
    }
}

// 方法
const startCreating = () => {
    if (editingCategory.value) return
    isCreating.value = true
}

const cancelCreating = () => {
    isCreating.value = false
    newCategory.value = {
        name: '',
        color: DEFAULT_CATEGORY_COLOR
    }
}

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
            color: DEFAULT_CATEGORY_COLOR
        }

        message.success(t('promptManagement.categoryCreatedSuccess'))
        // 重新加载统计信息，保持新建行展开以便连续添加
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
        color: category.color || DEFAULT_CATEGORY_COLOR
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
    if (!category.id || editingCategory.value || reordering.value || isCreating.value || !event.dataTransfer) {
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
    cancelCreating()
    resetCategoryDragState()
    emit('update:show', false)
}

// 监听显示状态，重置编辑状态并加载统计信息
watch(() => props.show, async (show) => {
    if (!show) {
        editingCategory.value = null
        cancelCreating()
        resetCategoryDragState()
    } else {
        // 当模态框显示时，加载最新的统计信息
        await loadStatistics()
    }
})

// 监听分类数据变化，重新加载统计信息
watch(() => props.categories, async (newCategories) => {
    if (!reordering.value) {
        orderedCategories.value = sortCategoriesByOrder(newCategories)
    }
    if (props.show && newCategories.length > 0) {
        await loadStatistics()
    }
}, { deep: true, immediate: true })
</script>

<style scoped>
.category-manage {
    display: flex;
    flex-direction: column;
    gap: var(--section-gap);
    min-height: 0;
}

.category-manage-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px var(--content-padding);
    flex: 0 0 auto;
}

.category-manage-count {
    font-size: 12px;
}

.category-manage-scroll {
    flex: 1;
    min-height: 0;
}

.category-manage-list {
    display: flex;
    flex-direction: column;
    padding-right: 8px;
}

.category-manage-empty {
    padding: 32px 8px;
}

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

.category-order-item::before { top: -2px; }
.category-order-item::after { bottom: -2px; }
.category-order-item.drop-before::before,
.category-order-item.drop-after::after { opacity: 1; }
.category-order-item.dragging { opacity: .46; }
.category-order-item.dragging .category-row { background: var(--surface-secondary); }

.category-row {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 52px;
    padding: 8px 10px;
    margin-bottom: 2px;
    border-radius: var(--radius-panel);
    transition: background-color .12s ease;
}

.category-row:hover { background: var(--interactive-hover); }
.category-row-editing,
.category-row-editing:hover { background: var(--surface-tertiary); }

.category-drag-handle { cursor: grab; color: var(--content-secondary); flex: 0 0 auto; }
.category-drag-handle:active { cursor: grabbing; }

.category-color-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex: 0 0 auto;
}

.category-color-swatch {
    width: 28px;
    height: 28px;
    flex: 0 0 auto;
    border: 1px solid var(--border-default);
    border-radius: var(--radius-control);
    padding: 0;
    cursor: pointer;
}

.category-color-picker-panel {
    width: 220px;
}

.category-row-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.category-row-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.category-row-count {
    font-size: 12px;
}

.category-row-name-input {
    flex: 1;
    min-width: 0;
}

.category-row-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 0 0 auto;
}
</style>
