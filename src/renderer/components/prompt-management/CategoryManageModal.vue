<template>
    <CommonModal ref="modalRef" :show="show" @update:show="$emit('update:show', $event)" @close="handleClose"
        :content-padding="contentPadding">
        <!-- 顶部固定区域 -->
        <template #header>
            <NFlex vertical size="medium" style="padding: 16px;">
                <NText :style="{ fontSize: '20px', fontWeight: 600 }">分类管理</NText>
                <NText depth="3">管理您的提示词分类，创建、编辑或删除分类</NText>
            </NFlex>
        </template> <!-- 中间可操作区域 -->
        <template #content>
            <NScrollbar >
                <NGrid :cols="gridCols" :x-gap="16">
                    <!-- 左侧：创建新分类 -->
                    <NGridItem :span="leftSpan">
                        <NCard title="创建分类" size="small" :style="{ height: '100%' }">
                            <NForm :model="newCategory">
                                <NFlex vertical size="medium">
                                    <NFormItem label="分类名称">
                                        <NInput v-model:value="newCategory.name" placeholder="请输入分类名称"
                                            @keyup.enter="handleCreate" />
                                    </NFormItem>
                                    <NFormItem label="颜色">
                                        <NColorPicker v-model:value="newCategory.color" :modes="['hex']"
                                            :swatches="COLOR_SWATCHES" style="width: 100%;" />
                                    </NFormItem>
                                    <NFormItem>
                                        <NButton type="primary" @click="handleCreate" :loading="creating">
                                            创建
                                            <!-- ICON -->
                                            <template #icon>
                                                <NIcon>
                                                    <Edit />
                                                </NIcon>
                                            </template>
                                        </NButton>
                                    </NFormItem>
                                </NFlex>
                            </NForm>
                        </NCard>
                    </NGridItem>

                    <!-- 右侧：分类列表 -->
                    <NGridItem :span="rightSpan">
                        <NCard title="现有分类" size="small" :style="{ height: '100%' }">
                            <div v-if="categories.length === 0">
                                <NEmpty description="暂无分类" />
                            </div>

                            <NScrollbar v-else :style="{ maxHeight: `${categoryListHeight}px` }">
                                <NFlex vertical size="small">
                                    <NCard v-for="category in categories" :key="category.id" size="small"
                                        class="category-item">
                                        <NFlex justify="space-between" align="center">
                                            <NFlex align="center">
                                                <div class="color-indicator"
                                                    :style="{ backgroundColor: category.color || '#18A05880' }">
                                                </div>
                                                <div v-if="editingCategory?.id === category.id"
                                                    style="min-width: 200px;">
                                                    <NFlex vertical size="small">
                                                        <NInput v-model:value="editingCategory.name" size="small" />
                                                        <NColorPicker v-model:value="editingCategory.color"
                                                            :modes="['hex']" :swatches="COLOR_SWATCHES" size="small"
                                                            style="width: 100%;" />
                                                    </NFlex>
                                                </div>
                                                <div v-else>
                                                    <NFlex vertical size="small">
                                                        <NText strong>{{ category.name }}</NText>
                                                        <NText depth="3" style="font-size: 12px;">
                                                            {{ category._count?.prompts || 0 }} 个提示词
                                                        </NText>
                                                    </NFlex>
                                                </div>
                                            </NFlex>

                                            <NFlex size="small">
                                                <div v-if="editingCategory?.id === category.id">
                                                    <NFlex size="small">
                                                        <NButton size="small" @click="handleSaveEdit"
                                                            :loading="updating">
                                                            保存
                                                        </NButton>
                                                        <NButton size="small" @click="handleCancelEdit">
                                                            取消
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
                                                        </NButton>
                                                        <NButton size="small" text type="error"
                                                            @click="handleDelete(category)"
                                                            :disabled="category._count?.prompts > 0">
                                                            <template #icon>
                                                                <NIcon>
                                                                    <Trash />
                                                                </NIcon>
                                                            </template>
                                                        </NButton>
                                                    </NFlex>
                                                </div>
                                            </NFlex>
                                        </NFlex>
                                    </NCard>
                                </NFlex>
                            </NScrollbar>
                        </NCard>
                    </NGridItem>
                </NGrid>
            </NScrollbar>
        </template>

        <!-- 底部固定区域 -->
        <template #footer>

        </template>
    </CommonModal>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
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
    NGrid,
    NGridItem,
    useMessage
} from 'naive-ui'
import { Edit, Trash } from '@vicons/tabler'
import { api } from '@/lib/api'
import { useTagColors } from '@/composables/useTagColors'
import { useWindowSize } from '@/composables/useWindowSize'
import CommonModal from '@/components/common/CommonModal.vue'

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

// 使用统一的颜色配置
const { COLOR_SWATCHES } = useTagColors()

// 使用窗口尺寸 composable
const { modalWidth } = useWindowSize()

// 布局高度常量
const headerHeight = 120
const footerHeight = 1
const contentPadding = 24

// 网格布局计算
const gridCols = computed(() => {
    return modalWidth.value > 1000 ? 12 : 12
})

// 左侧网格大小（创建分类）
const leftSpan = computed(() => {
    return modalWidth.value > 1000 ? 5 : 12
})

// 右侧网格大小（分类列表）
const rightSpan = computed(() => {
    return modalWidth.value > 1000 ? 7 : 12
})

// 模板引用
const modalRef = ref<InstanceType<typeof CommonModal> | null>(null)

// 获取内容高度
const contentHeight = computed(() => {
    return modalRef.value?.contentHeight || 400
})

// 计算分类列表的最大高度
const categoryListHeight = computed(() => {
    // 在网格布局中，调整高度计算
    // 减去标题、间距等，使用更多的可用高度
    const availableHeight = contentHeight.value - 48 // 减去一些间距

    // 最小高度 300px，最大使用大部分可用高度
    return Math.max(300, Math.min(availableHeight * 0.85, 400))
})

// 响应式数据
const newCategory = ref({
    name: '',
    color: '#18A05833'
})

const editingCategory = ref(null)
const creating = ref(false)
const updating = ref(false)

// 方法
const handleCreate = async () => {
    if (!newCategory.value.name.trim()) {
        message.warning('请输入分类名称')
        return
    }

    try {
        creating.value = true
        await api.categories.create.mutate({
            name: newCategory.value.name,
            color: newCategory.value.color
        })

        newCategory.value = {
            name: '',
            color: '#18A05833'
        }

        message.success('分类创建成功')
        emit('updated')
    } catch (error) {
        message.error('创建分类失败')
        console.error(error)
    } finally {
        creating.value = false
    }
}

const handleEdit = (category) => {
    editingCategory.value = {
        id: category.id,
        name: category.name,
        color: category.color || '#18A05833'
    }
}

const handleSaveEdit = async () => {
    if (!editingCategory.value?.name.trim()) {
        message.warning('请输入分类名称')
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
        message.success('分类更新成功')
        emit('updated')
    } catch (error) {
        message.error('更新分类失败')
        console.error(error)
    } finally {
        updating.value = false
    }
}

const handleCancelEdit = () => {
    editingCategory.value = null
}

const handleDelete = async (category) => {
    if (category._count?.prompts > 0) {
        message.warning('该分类下还有提示词，无法删除')
        return
    }

    if (!confirm(`确定要删除分类 "${category.name}" 吗？`)) {
        return
    }

    try {
        await api.categories.delete.mutate(category.id)
        message.success('分类删除成功')
        emit('updated')
    } catch (error) {
        message.error('删除分类失败')
        console.error(error)
    }
}

const handleClose = () => {
    editingCategory.value = null
    emit('update:show', false)
}

// 监听显示状态，重置编辑状态
watch(() => props.show, (show) => {
    if (!show) {
        editingCategory.value = null
    }
})
</script>

<style scoped>
.color-indicator {
    width: 16px;
    height: 16px;
    border-radius: 50%;
}
</style>
