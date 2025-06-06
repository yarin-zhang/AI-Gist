<template>
    <NModal :show="show" @update:show="$emit('update:show', $event)" preset="card" class="fullscreen-modal"
        title="分类管理">
        <NFlex vertical size="large">
            <!-- 创建新分类 -->
            <NCard title="创建分类" size="small">
                <NForm :model="newCategory" >
                    <NFlex justify="space-between">
                        <NFlex>
                            <NFormItem label="分类名称">
                                <NInput v-model:value="newCategory.name" placeholder="请输入分类名称"
                                    style="width: 300px; flex-shrink: 0;" @keyup.enter="handleCreate" />
                            </NFormItem>
                            <NFormItem label="颜色">
                                <NColorPicker v-model:value="newCategory.color" :modes="['hex']"
                                    :swatches="COLOR_SWATCHES" style="width: 120px;" />
                            </NFormItem>
                        </NFlex>
                        <NFormItem>
                            <NButton type="primary" @click="handleCreate" :loading="creating">
                                创建
                            </NButton>
                        </NFormItem>
                    </NFlex>
                </NForm>
            </NCard>

            <!-- 分类列表 -->
            <NCard title="现有分类" size="small">
                <div v-if="categories.length === 0">
                    <NEmpty description="暂无分类" />
                </div>

                <NFlex v-else vertical size="small">
                    <NCard v-for="category in categories" :key="category.id" size="small" class="category-item">
                        <NFlex justify="space-between" align="center">
                            <NFlex align="center">
                                <div class="color-indicator"
                                    :style="{ backgroundColor: category.color || '#18A05880' }">
                                </div>
                                <div v-if="editingCategory?.id === category.id" style="min-width: 300px;">
                                    <NFlex :vertical="false" align="center" size="medium" :wrap="false">
                                        <NInput v-model:value="editingCategory.name" size="small"
                                            style="width: 180px; flex-shrink: 0;" />
                                        <NColorPicker v-model:value="editingCategory.color" :modes="['hex']"
                                            :swatches="COLOR_SWATCHES" size="small"
                                            style="width: 120px; flex-shrink: 0;" />
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
                                        <NButton size="small" @click="handleSaveEdit" :loading="updating">
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
                                        <NButton size="small" text type="error" @click="handleDelete(category)"
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
            </NCard>
        </NFlex>

        <template #footer>
            <NFlex justify="end">
                <NButton @click="handleClose">关闭</NButton>
            </NFlex>
        </template>
    </NModal>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import {
    NModal,
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
    useMessage
} from 'naive-ui'
import { Edit, Trash } from '@vicons/tabler'
import { api } from '@/lib/api'
import { useTagColors } from '@/composables/useTagColors'

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

// 响应式数据
const newCategory = ref({
    name: '',
    color: '#18A05880'
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
            color: '#18A05880'
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
        color: category.color || '#18A05880'
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
