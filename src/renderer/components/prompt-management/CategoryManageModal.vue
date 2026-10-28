<template>
    <UiModal :show="show" width="var(--overlay-width-form)" :title="t('promptManagement.categoryManageTitle')"
        :subtitle="t('promptManagement.totalCategories', { count: categories.length })" :close-label="t('common.close')"
        @close="handleClose">
        <div class="category-manage">
            <section class="category-create">
                <span class="category-create__label">{{ t('promptManagement.createCategory') }}</span>
                <div class="category-create__row">
                    <span class="category-swatch-preview" :style="{ backgroundColor: newCategory.color }" aria-hidden="true" />
                    <NInput v-model:value="newCategory.name" :placeholder="t('promptManagement.categoryNamePlaceholder')"
                        :status="createConflict ? 'error' : undefined"
                        :input-props="{ 'aria-label': t('promptManagement.categoryName'), 'aria-invalid': Boolean(createConflict), 'aria-describedby': createConflict ? 'category-create-error' : undefined }"
                        @keydown.enter="handleEnterKey($event, handleCreate)" />
                    <NButton type="primary" :loading="creating" :disabled="!newCategory.name.trim() || Boolean(createConflict)" @click="handleCreate">
                        {{ t('categoryManage.create') }}
                    </NButton>
                </div>
                <!-- 重名直接在输入框下面说清楚，不再只弹「创建分类失败」 -->
                <span v-if="createConflict" id="category-create-error" class="category-error" role="alert">
                    {{ t('categoryManage.duplicateName', { name: createConflict.name }) }}
                </span>
                <div class="category-swatches" role="radiogroup" :aria-label="t('promptManagement.color')">
                    <button v-for="swatch in swatchOptions" :key="swatch.value" type="button" role="radio"
                        class="category-swatch" :class="{ 'is-selected': sameColor(newCategory.color, swatch.value) }"
                        :aria-checked="sameColor(newCategory.color, swatch.value)" :aria-label="swatch.label"
                        @click="newCategory.color = swatch.value">
                        <span :style="{ backgroundColor: swatch.value }" />
                    </button>
                </div>
            </section>

            <hr class="category-divider" />

            <div class="category-list">
                <div v-for="category in orderedCategories" :key="category.id" class="category-order-item"
                    :data-category-id="category.id"
                    :class="{
                        'is-editing': editingCategory?.id === category.id,
                        dragging: draggingCategoryId === category.id,
                        'drop-before': dropTargetCategoryId === category.id && dropPosition === 'before',
                        'drop-after': dropTargetCategoryId === category.id && dropPosition === 'after',
                    }" @dragover.prevent="handleCategoryDragOver($event, category)"
                    @drop.prevent="handleCategoryDrop(category)">
                    <NButton size="tiny" quaternary class="category-drag-handle"
                        :draggable="orderedCategories.length > 1 && !reordering && editingCategory === null && !isCreating"
                        :aria-label="t('promptManagement.categoryDragHandle', { name: category.name })"
                        :disabled="orderedCategories.length < 2 || reordering || editingCategory !== null"
                        @dragstart="handleCategoryDragStart($event, category)" @dragend="handleCategoryDragEnd">
                        <template #icon><NIcon :size="14"><GripVertical /></NIcon></template>
                    </NButton>

                    <template v-if="editingCategory?.id === category.id">
                        <!-- 受控显示：Esc 先收起这个气泡，而不是关掉整个弹窗 -->
                        <NPopover trigger="click" placement="bottom-start" :show-arrow="false" :show="colorPopoverShow"
                            @update:show="value => (colorPopoverShow = value)">
                            <template #trigger>
                                <button type="button" class="category-swatch-button" :aria-label="t('promptManagement.color')"
                                    :aria-expanded="colorPopoverShow">
                                    <span :style="{ backgroundColor: editingCategory!.color }" />
                                </button>
                            </template>
                            <div class="category-swatches">
                                <button v-for="swatch in swatchOptions" :key="swatch.value" type="button" class="category-swatch"
                                    :class="{ 'is-selected': sameColor(editingCategory!.color, swatch.value) }" :aria-label="swatch.label"
                                    @click="editingCategory!.color = swatch.value">
                                    <span :style="{ backgroundColor: swatch.value }" />
                                </button>
                            </div>
                        </NPopover>
                        <NInput v-model:value="editingCategory!.name" class="category-row__input"
                            :status="editConflict ? 'error' : undefined"
                            :input-props="{ 'aria-label': t('promptManagement.categoryName'), 'aria-invalid': Boolean(editConflict), 'aria-describedby': editConflict ? 'category-edit-error' : undefined }"
                            @keydown.enter="handleEnterKey($event, handleSaveEdit)" />
                        <NButton size="tiny" :disabled="updating" @click="handleCancelEdit">{{ t('common.cancel') }}</NButton>
                        <NButton size="tiny" type="primary" :loading="updating" :disabled="!editingCategory!.name.trim() || Boolean(editConflict)"
                            @click="handleSaveEdit">{{ t('common.save') }}</NButton>
                        <span v-if="editConflict" id="category-edit-error" class="category-error category-row__error" role="alert">
                            {{ t('categoryManage.duplicateName', { name: editConflict.name }) }}
                        </span>
                    </template>
                    <template v-else>
                        <UiCategoryDot :color="category.color" />
                        <span class="category-row__name">{{ category.name }}</span>
                        <span class="category-row__count">
                            {{ t('promptManagement.categoryPromptCount', { count: getCategoryPromptCount(category.id!) }) }}
                        </span>
                        <NTooltip :show-arrow="false">
                            <template #trigger>
                                <NButton size="tiny" quaternary class="category-row__icon category-row__edit" :aria-label="t('categoryManage.editNamed', { name: category.name })"
                                    :disabled="editingCategory !== null" @click="handleEdit(category)">
                                    <template #icon><NIcon :size="14"><Edit /></NIcon></template>
                                </NButton>
                            </template>
                            {{ t('common.edit') }}
                        </NTooltip>
                        <NTooltip :show-arrow="false">
                            <template #trigger>
                                <NButton size="tiny" quaternary type="error" class="category-row__icon"
                                    :aria-label="t('categoryManage.deleteNamed', { name: category.name })"
                                    :disabled="editingCategory !== null"
                                    @click="handleDelete(category)">
                                    <template #icon><NIcon :size="14"><Trash /></NIcon></template>
                                </NButton>
                            </template>
                            {{ t('common.delete') }}
                        </NTooltip>
                    </template>
                </div>

                <div v-if="!orderedCategories.length" class="category-empty">{{ t('promptManagement.categoryManageEmpty') }}</div>
            </div>
        </div>

        <template #footer-start>{{ t('categoryManage.deleteHint') }}</template>
        <template #footer>
            <NButton @click="handleClose">{{ t('common.close') }}</NButton>
        </template>
    </UiModal>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { NButton, NIcon, NInput, NPopover, NTooltip, useMessage, useDialog } from 'naive-ui'
import { Edit, GripVertical, Trash } from '@vicons/tabler'
import { api } from '@/lib/api'
import { useTagColors } from '@/composables/useTagColors'
import UiCategoryDot from '@/components/ui/UiCategoryDot.vue'
import UiModal from '@/components/ui/UiModal.vue'
import { useI18n } from 'vue-i18n'
import type { Category } from '@shared/types/database'
import {
    reorderCategoriesByDrop,
    sortCategoriesByOrder,
    type CategoryDropPosition,
} from '@/lib/utils/category-order'
import { findCategoryNameConflict, isCategoryNameConflictError, normalizeCategoryName } from '@/lib/utils/category-name'
import { handleEnterKey, isImeComposing } from '@/lib/utils/ime'

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
const { CATEGORY_COLORS } = useTagColors()

const DEFAULT_CATEGORY_COLOR: string = CATEGORY_COLORS[0]
const SWATCH_LABEL_KEYS = ['blue', 'orange', 'pink', 'violet', 'green', 'teal', 'amber', 'grey'] as const
const swatchOptions = computed(() => CATEGORY_COLORS.map((value, index) => ({
    value: value as string,
    label: t(`categoryManage.colors.${SWATCH_LABEL_KEYS[index]}`),
})))
const sameColor = (a?: string | null, b?: string | null) => (a || '').toLowerCase() === (b || '').toLowerCase()

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
const colorPopoverShow = ref(false)
const confirmingClose = ref(false)

// 输入时就判重：去掉首尾空格、不区分大小写，和服务层的规则一致
const createConflict = computed(() => findCategoryNameConflict(props.categories, newCategory.value.name))
const editConflict = computed(() => (
    editingCategory.value
        ? findCategoryNameConflict(props.categories, editingCategory.value.name, editingCategory.value.id)
        : undefined
))
const editingOriginal = computed(() => props.categories.find(category => category.id === editingCategory.value?.id))
const isEditDirty = computed(() => {
    const editing = editingCategory.value
    const original = editingOriginal.value
    if (!editing || !original) return false
    return normalizeCategoryName(editing.name) !== original.name
        || !sameColor(editing.color, original.color || DEFAULT_CATEGORY_COLOR)
})
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
    const name = normalizeCategoryName(newCategory.value.name)
    if (!name) {
        message.warning(t('promptManagement.enterCategoryName'))
        return
    }
    if (createConflict.value || creating.value) return

    try {
        creating.value = true
        await api.categories.create.mutate({
            name,
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
        // 列表还没刷新时服务层也会拦下重名，同样说清楚原因
        if (isCategoryNameConflictError(error)) message.error(t('categoryManage.duplicateName', { name: error.existingName }))
        else message.error(t('promptManagement.categoryCreatedFailed'))
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
    const editing = editingCategory.value
    if (!editing) return
    const name = normalizeCategoryName(editing.name)
    if (!name) {
        message.warning(t('promptManagement.enterCategoryName'))
        return
    }
    if (editConflict.value || updating.value) return

    // 回车保存时焦点还在输入框里：先让它失焦再收起这一行。输入框带着焦点被卸载时，
    // Naive 弹窗的过渡层会单独重渲染一次，把 v-show 重复挂到弹窗根节点上，整个弹窗随之报错卡死
    const focused = document.activeElement as HTMLElement | null
    if (focused?.closest('.category-order-item.is-editing')) focused.blur()

    try {
        updating.value = true
        await api.categories.update.mutate({
            id: editing.id,
            data: {
                name,
                color: editing.color
            }
        })

        editingCategory.value = null
        colorPopoverShow.value = false
        message.success(t('promptManagement.categoryUpdatedSuccess'))
        // 重新加载统计信息
        await loadStatistics()
        emit('updated')
    } catch (error) {
        if (isCategoryNameConflictError(error)) message.error(t('categoryManage.duplicateName', { name: error.existingName }))
        else message.error(t('promptManagement.categoryUpdatedFailed'))
        console.error(error)
    } finally {
        updating.value = false
    }
}

/** 取消这一行的编辑，焦点回到这一行的编辑按钮，下一次 Esc 才关弹窗 */
const handleCancelEdit = () => {
    const id = editingCategory.value?.id
    // 同保存：先让编辑行里的输入框失焦再卸载，避免弹窗过渡层报错
    const focused = document.activeElement as HTMLElement | null
    if (focused?.closest('.category-order-item.is-editing')) focused.blur()
    editingCategory.value = null
    colorPopoverShow.value = false
    if (id === undefined) return
    void nextTick(() => {
        document.querySelector<HTMLElement>(`.category-order-item[data-category-id="${id}"] .category-row__edit`)?.focus()
    })
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

// 分类里还有提示词时也能删：提示词移到「未分类」，确认框里写清楚会移走几个
const handleDelete = (category: any) => {
    const promptCount = getCategoryPromptCount(category.id)

    dialog.error({
        title: t('promptManagement.confirmDeleteCategory', { name: category.name }),
        content: promptCount > 0
            ? t('categoryManage.deleteMovesPrompts', { count: promptCount }, promptCount)
            : t('promptPage.deleteContent'),
        positiveText: t('common.delete'),
        negativeText: t('common.cancel'),
        onPositiveClick: async () => {
            try {
                const result = await api.categories.delete.mutate(category.id, { movePromptsToUncategorized: promptCount > 0 })
                message.success(result.movedPrompts > 0
                    ? t('categoryManage.deletedAndMoved', { count: result.movedPrompts }, result.movedPrompts)
                    : t('promptManagement.categoryDeletedSuccess'))
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

const closeNow = () => {
    editingCategory.value = null
    colorPopoverShow.value = false
    cancelCreating()
    resetCategoryDragState()
    emit('update:show', false)
}

// 关弹窗（×、关闭按钮）时行内编辑改过还没保存，先确认
const handleClose = () => {
    if (!isEditDirty.value) {
        closeNow()
        return
    }
    confirmingClose.value = true
    dialog.warning({
        title: t('categoryManage.unsavedEditTitle'),
        content: t('categoryManage.unsavedEditMessage', { name: editingOriginal.value?.name || '' }),
        positiveText: t('promptWorkspace.discardChanges'),
        negativeText: t('promptWorkspace.continueEditing'),
        maskClosable: false,
        onPositiveClick: closeNow,
        onAfterLeave: () => { confirmingClose.value = false },
    })
}

// ---------- Esc 分层 ----------
// UiModal 用 Naive 默认的 Esc 关闭，不管里面还有没有气泡和行内编辑。这里在捕获阶段先看一眼：
// 颜色气泡开着就只收起气泡；正在改某一行就只取消这一行；新建框里打了字就先清空；都没有才放行，由弹窗自己关闭。
// 上面叠着确认框时不拦，Esc 交给确认框。
const handleEscapeCapture = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || isImeComposing(event) || confirmingClose.value) return
    const target = event.target as HTMLElement | null

    if (colorPopoverShow.value) {
        colorPopoverShow.value = false
        // 焦点可能在气泡里的色块上，气泡收起后回到编辑行的颜色按钮
        document.querySelector<HTMLElement>('.category-order-item.is-editing .category-swatch-button')?.focus()
    } else if (editingCategory.value) {
        handleCancelEdit()
    } else if (newCategory.value.name && target?.closest('.category-create')) {
        newCategory.value.name = ''
    } else {
        return
    }
    event.preventDefault()
    event.stopPropagation()
}

const stopEscapeCapture = () => window.removeEventListener('keydown', handleEscapeCapture, true)
watch(() => props.show, show => {
    if (show) window.addEventListener('keydown', handleEscapeCapture, true)
    else stopEscapeCapture()
}, { immediate: true })
onBeforeUnmount(stopEscapeCapture)

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
    gap: 16px;
}

.category-create {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.category-create__label {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
}

.category-create__row {
    display: flex;
    align-items: center;
    gap: 8px;
}

.category-swatch-preview {
    flex: none;
    width: 14px;
    height: 14px;
    margin: 0 7px;
    border-radius: 4px;
}

.category-swatches {
    display: flex;
    gap: 6px;
    padding-left: 2px;
}

.category-swatch,
.category-swatch-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: var(--radius-control);
    background: transparent;
    cursor: pointer;
}

.category-swatch:hover,
.category-swatch-button:hover {
    background: var(--surface-tertiary);
}

.category-swatch.is-selected {
    border-color: var(--content-secondary);
}

.category-swatch > span,
.category-swatch-button > span {
    width: 14px;
    height: 14px;
    border-radius: 4px;
}

.category-divider {
    height: 1px;
    margin: 0;
    border: 0;
    background: var(--border-default);
}

.category-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.category-order-item {
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
    height: 44px;
    padding: 0 6px 0 2px;
    border-bottom: 1px solid var(--border-subtle);
}

.category-order-item:last-child {
    border-bottom: 0;
}

.category-order-item.dragging {
    opacity: 0.45;
}

.category-order-item.drop-before::before,
.category-order-item.drop-after::after {
    position: absolute;
    right: 0;
    left: 0;
    height: 2px;
    border-radius: 1px;
    background: var(--accent-primary);
    content: "";
}

.category-order-item.drop-before::before {
    top: -1px;
}

.category-order-item.drop-after::after {
    bottom: -1px;
}

.category-drag-handle {
    width: 22px;
    padding: 0;
    color: var(--content-tertiary);
    cursor: grab;
}

.category-row__name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-medium);
    text-overflow: ellipsis;
    white-space: nowrap;
}

.category-row__input {
    flex: 1;
}

/* 编辑行出现重名提示时换成两行，提示和输入框左边对齐 */
.category-order-item.is-editing {
    flex-wrap: wrap;
    height: auto;
    min-height: 44px;
    padding-block: 7px;
    row-gap: 4px;
}

.category-error {
    color: var(--accent-error);
    font-size: var(--font-size-xs);
}

.category-create .category-error {
    padding-left: 36px;
}

.category-row__error {
    flex-basis: 100%;
    padding-left: 64px;
}

.category-row__count {
    color: var(--content-tertiary);
    font-size: var(--font-size-xs);
}

.category-row__icon {
    width: 22px;
    padding: 0;
}

.category-empty {
    padding: 24px 0;
    color: var(--content-tertiary);
    font-size: var(--font-size-sm);
    text-align: center;
}
</style>
