<template>
    <CommonModal ref="modalRef" :show="show" @update:show="$emit('update:show', $event)" @close="handleClose">
        <!-- 顶部固定区域 -->
        <template #header>
            <NText :style="{ fontSize: '20px', fontWeight: 600 }">{{ t('promptManagement.categoryManageTitle') }}</NText>
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
                            <NFlex vertical size="medium" style="padding-right: 12px;" v-if="categories.length > 0">
                                <NCard v-for="category in categories" :key="category.id" size="small" hoverable>
                                    <NFlex justify="space-between" align="center">
                                        <NFlex align="center" size="medium">
                                            <div class="color-indicator"
                                                :style="{ backgroundColor: category.color || '#18A05880' }">
                                            </div>
                                            <div v-if="editingCategory?.id === category.id" style="min-width: 200px;">
                                                <NFlex vertical size="small">
                                                    <NInput v-model:value="editingCategory!.name" size="small"
                                                        :placeholder="t('promptManagement.categoryName')" />
                                                    <NColorPicker v-model:value="editingCategory!.color" :modes="['hex']"
                                                        :swatches="COLOR_SWATCHES" size="small" style="width: 100%;" />
                                                </NFlex>
                                            </div>
                                            <div v-else>
                                                <NFlex vertical size="small">
                                                    <NText strong>{{ category.name }}</NText>
                                                    <NText depth="3" style="font-size: 12px;">
                                                        {{ t('promptManagement.categoryPromptCount', { count: getCategoryPromptCount(category.id) }) }}
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
                                            <NInput v-model:value="newCategory.name" :placeholder="t('promptManagement.categoryNamePlaceholder')"
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
import { ref, computed, watch, toRef } from 'vue'
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
    useMessage
} from 'naive-ui'
import { Edit, Trash } from '@vicons/tabler'
import { api } from '@/lib/api'
import { useTagColors } from '@/composables/useTagColors'
import { useWindowSize } from '@/composables/useWindowSize'
import CommonModal from '@/components/common/CommonModal.vue'
import { useI18n } from 'vue-i18n'

interface Props {
    show: boolean
    categories: any[]
}

interface Emits {
    (e: 'update:show', value: boolean): void
    (e: 'updated'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const message = useMessage()
const { t } = useI18n()

// 使用统一的颜色配置
const { COLOR_SWATCHES } = useTagColors()

// 获取窗口尺寸用于响应式布局
const { modalWidth } = useWindowSize()

// 响应式数据
const newCategory = ref({
    name: '',
    color: '#18A05833'
})

const editingCategory = ref<{
    id: number;
    name: string;
    color: string;
} | null>(null)
const creating = ref(false)
const updating = ref(false)

// 统计信息
const statistics = ref<{
    totalCount: number;
    categoryStats: Array<{id: string | null, name: string, count: number}>;
    popularTags: Array<{name: string, count: number}>;
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
            color: '#18A05833'
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
        color: category.color || '#18A05833'
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

const handleDelete = async (category: any) => {
    const promptCount = getCategoryPromptCount(category.id)
    if (promptCount > 0) {
        message.warning(t('promptManagement.categoryHasPrompts'))
        return
    }

    if (!confirm(t('promptManagement.confirmDeleteCategory', { name: category.name }))) {
        return
    }

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
}

const handleClose = () => {
    editingCategory.value = null
    emit('update:show', false)
}

// 监听显示状态，重置编辑状态并加载统计信息
watch(() => props.show, async (show) => {
    if (!show) {
        editingCategory.value = null
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
    if (props.show && newCategories.length > 0) {
        console.log('CategoryManageModal - Categories changed, reloading statistics...')
        await loadStatistics()
    }
}, { deep: true })
</script>

<style scoped>
.color-indicator {
    width: 16px;
    height: 16px;
    border-radius: 50%;
}
</style>
