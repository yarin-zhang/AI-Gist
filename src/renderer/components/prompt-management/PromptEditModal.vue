<template>
    <NModal :show="show" @update:show="$emit('update:show', $event)" :mask-closable="false" preset="card"
        style="width: 1200px; height: 90%;" title="Prompt 编辑">
        <div style="height: 100%; display: flex; flex-direction: column;">
            <NForm ref="formRef" :model="formData" :rules="rules" label-placement="top" 
                style="flex: 1; overflow: hidden;">
                <div style="height: 100%; display: flex; gap: 20px;">
                    <!-- 左侧内容区 -->
                    <div style="flex: 1; display: flex; flex-direction: column; gap: 16px;">
                        <!-- 第一步：Prompt 内容 -->
                        <div v-show="!showExtraInfo" style="flex: 1; display: flex; flex-direction: column;">
                            <NFormItem label="Prompt 内容" path="content" style="flex: 1; display: flex; flex-direction: column;">
                                <NInput v-model:value="formData.content" type="textarea"
                                    placeholder="请输入 Prompt 内容，使用 {{变量名}} 来定义变量" 
                                    :rows="20" 
                                    show-count 
                                    style="flex: 1;" />
                            </NFormItem>
                            
                            <NAlert type="info" style="margin-top: 8px;">
                                <NText depth="3">
                                    使用 <code v-pre>{{变量名}}</code> 来定义可替换的变量，右侧会自动识别并显示变量配置
                                </NText>
                            </NAlert>
                        </div>

                        <!-- 第二步：额外信息 -->
                        <div v-show="showExtraInfo" style="flex: 1; display: flex; flex-direction: column; gap: 16px;">
                            <NCard title="基本信息" size="small">
                                <NFlex vertical size="medium">
                                    <NFormItem label="标题" path="title">
                                        <NInput v-model:value="formData.title" placeholder="请输入 Prompt 标题（可选）" />
                                    </NFormItem>

                                    <NFormItem label="描述" path="description">
                                        <NInput v-model:value="formData.description" type="textarea" 
                                            placeholder="请输入 Prompt 描述（可选）" :rows="3" />
                                    </NFormItem>
                                </NFlex>
                            </NCard>

                            <NCard title="分类和标签" size="small">
                                <NFlex vertical size="medium">
                                    <NFormItem label="分类">
                                        <NSelect v-model:value="formData.categoryId" :options="categoryOptions"
                                            placeholder="选择分类" clearable />
                                    </NFormItem>

                                    <NFormItem label="标签" path="tags">
                                        <NDynamicTags 
                                            v-model:value="formData.tags" 
                                            placeholder="按回车添加标签"
                                            :max="5"
                                        />
                                    </NFormItem>
                                </NFlex>
                            </NCard>
                        </div>
                    </div>

                    <!-- 右侧配置/预览区 -->
                    <div style="flex: 1; display: flex; flex-direction: column; gap: 16px;">
                        <!-- 变量识别和配置区（第一步显示） -->
                        <div v-show="!showExtraInfo" style="flex: 1; display: flex; flex-direction: column;">
                            <NCard size="small" style="flex: 1; display: flex; flex-direction: column;">
                                <template #header>
                                    <NFlex justify="space-between" align="center">
                                        <NText>检测到的变量</NText>
                                        <NButton size="small" @click="addVariable">
                                            <template #icon>
                                                <NIcon>
                                                    <Plus />
                                                </NIcon>
                                            </template>
                                            手动添加
                                        </NButton>
                                    </NFlex>
                                </template>

                                <div style="flex: 1; overflow-y: auto;">
                                    <div v-if="formData.variables.length === 0">
                                        <NEmpty description="在左侧输入内容时使用 {{变量名}} 格式，会自动识别变量" size="small" />
                                    </div>

                                    <NFlex v-else vertical size="medium">
                                        <NCard v-for="(variable, index) in formData.variables" :key="index" size="small"
                                            class="variable-card">
                                            <template #header>
                                                <NFlex justify="space-between" align="center">
                                                    <NText>{{ variable.name || '变量' + (index + 1) }}</NText>
                                                    <NButton size="small" text type="error" @click="removeVariable(index)">
                                                        <template #icon>
                                                            <NIcon>
                                                                <Trash />
                                                            </NIcon>
                                                        </template>
                                                    </NButton>
                                                </NFlex>
                                            </template>

                                            <NFlex vertical size="small">
                                                <NFlex>
                                                    <NFormItem label="变量名" style="flex: 1">
                                                        <NInput v-model:value="variable.name" placeholder="变量名" size="small" />
                                                    </NFormItem>
                                                    <NFormItem label="显示名" style="flex: 1">
                                                        <NInput v-model:value="variable.label" placeholder="显示名称" size="small" />
                                                    </NFormItem>
                                                </NFlex>
                                                
                                                <NFlex>
                                                    <NFormItem label="类型" style="flex: 1">
                                                        <NSelect v-model:value="variable.type" :options="variableTypeOptions" size="small" />
                                                    </NFormItem>
                                                    <NFormItem label="必填" style="width: 80px">
                                                        <NSwitch v-model:value="variable.required" size="small" />
                                                    </NFormItem>
                                                </NFlex>

                                                <NFormItem label="默认值">
                                                    <NInput v-model:value="variable.defaultValue" placeholder="默认值（可选）" size="small" />
                                                </NFormItem>

                                                <NFormItem v-if="variable.type === 'select'" label="选项">
                                                    <NInput v-model:value="variable.options" placeholder="选项1,选项2,选项3" size="small" />
                                                </NFormItem>
                                            </NFlex>
                                        </NCard>
                                    </NFlex>
                                </div>
                            </NCard>
                        </div>

                        <!-- 预览区（第二步显示） -->
                        <div v-show="showExtraInfo" style="flex: 1; display: flex; flex-direction: column;">
                            <NCard title="预览" size="small" style="flex: 1; display: flex; flex-direction: column;">
                                <div style="flex: 1; overflow-y: auto;">
                                    <NFlex vertical size="medium">
                                        <div>
                                            <NText strong>标题</NText>
                                            <div style="margin-top: 4px;">
                                                <NText>{{ displayTitle }}</NText>
                                            </div>
                                        </div>

                                        <div v-if="formData.description">
                                            <NText strong>描述</NText>
                                            <div style="margin-top: 4px;">
                                                <NText depth="3">{{ formData.description }}</NText>
                                            </div>
                                        </div>

                                        <div>
                                            <NText strong>内容</NText>
                                            <div style="margin-top: 4px; padding: 12px; background: var(--n-color-modal); border-radius: 6px; border: 1px solid var(--n-border-color);">
                                                <NText style="white-space: pre-wrap; font-family: monospace; font-size: 13px;">{{ formData.content }}</NText>
                                            </div>
                                        </div>

                                        <div v-if="formData.variables.length > 0">
                                            <NText strong>变量 ({{ formData.variables.length }})</NText>
                                            <div style="margin-top: 4px;">
                                                <NFlex wrap>
                                                    <NTag v-for="variable in formData.variables" :key="variable.name" size="small">
                                                        {{ variable.label || variable.name }}
                                                    </NTag>
                                                </NFlex>
                                            </div>
                                        </div>

                                        <div>
                                            <NText strong>分类</NText>
                                            <div style="margin-top: 4px;">
                                                <NText depth="3">{{ getCategoryName(formData.categoryId) }}</NText>
                                            </div>
                                        </div>

                                        <div v-if="formData.tags.length > 0">
                                            <NText strong>标签</NText>
                                            <div style="margin-top: 4px;">
                                                <NFlex wrap>
                                                    <NTag v-for="tag in formData.tags" :key="tag" size="small" type="info">
                                                        {{ tag }}
                                                    </NTag>
                                                </NFlex>
                                            </div>
                                        </div>
                                    </NFlex>
                                </div>
                            </NCard>
                        </div>
                    </div>
                </div>
            </NForm>
        </div>

        <template #footer>
            <NFlex justify="space-between">
                <div>
                    <NButton v-if="showExtraInfo" @click="showExtraInfo = false" ghost>
                        返回编辑
                    </NButton>
                </div>
                <NFlex>
                    <NButton @click="handleCancel">取消</NButton>
                    <NButton v-if="!showExtraInfo" @click="showExtraInfo = true" :disabled="!formData.content.trim()">
                        补充信息
                    </NButton>
                    <NButton type="primary" @click="handleSave" :loading="saving" :disabled="!formData.content.trim()">
                        {{ isEdit ? '更新' : '创建' }}
                    </NButton>
                </NFlex>
            </NFlex>
        </template>
    </NModal>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import {
    NModal,
    NForm,
    NFormItem,
    NInput,
    NSelect,
    NCard,
    NFlex,
    NText,
    NButton,
    NIcon,
    NAlert,
    NEmpty,
    NSwitch,
    NDynamicTags,
    NTag,
    useMessage
} from 'naive-ui'
import { Plus, Trash } from '@vicons/tabler'
import { api } from '@/lib/api'

interface Variable {
    name: string
    label: string
    type: string
    options?: string
    defaultValue?: string
    required: boolean
    placeholder?: string
}

interface Props {
    show: boolean
    prompt?: any
    categories: any[]
}

interface Emits {
    (e: 'update:show', value: boolean): void
    (e: 'saved'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const message = useMessage()
const formRef = ref()
const saving = ref(false)
const showExtraInfo = ref(false)

// 表单数据
const formData = ref({
    title: '',
    description: '',
    content: '',
    categoryId: null,
    tags: [] as string[],
    variables: [] as Variable[]
})

// 计算属性
const isEdit = computed(() => !!props.prompt?.id)

const categoryOptions = computed(() => [
    { label: '无分类', value: null },
    ...props.categories.map(cat => ({
        label: cat.name,
        value: cat.id
    }))
])

const displayTitle = computed(() => {
    if (formData.value.title) {
        return formData.value.title
    }
    // 如果没有标题，自动生成一个基于内容的简短标题
    if (formData.value.content) {
        const firstLine = formData.value.content.split('\n')[0].trim()
        return firstLine.length > 30 ? firstLine.substring(0, 30) + '...' : firstLine
    }
    return '未命名 Prompt'
})

const variableTypeOptions = [
    { label: '单行文本', value: 'text' },
    { label: '多行文本', value: 'textarea' },
    { label: '下拉选择', value: 'select' }
]

// 表单验证规则
const rules = {
    content: {
        required: true,
        message: '请输入 Prompt 内容',
        trigger: 'blur'
    },
    tags: {
        trigger: ['change'],
        validator(rule: unknown, value: string[]) {
            if (value.length > 5) {
                return new Error('不得超过5个标签')
            }
            return true
        }
    }
}

// 重置表单方法
const resetForm = () => {
    formData.value = {
        title: '',
        description: '',
        content: '',
        categoryId: null,
        tags: [],
        variables: []
    }
    showExtraInfo.value = false
}

// 获取分类名称
const getCategoryName = (categoryId: any) => {
    if (!categoryId) return '无分类'
    const category = props.categories.find(cat => cat.id === categoryId)
    return category?.name || '未知分类'
}

// 提取变量的方法
const extractVariables = (content: string) => {
    const variableRegex = /\{\{([^}]+)\}\}/g
    const matches = content.match(variableRegex)

    if (matches) {
        const newVariables = new Set()
        matches.forEach(match => {
            const variableName = match.replace(/[{}]/g, '').trim()
            if (variableName && !formData.value.variables.some(v => v.name === variableName)) {
                newVariables.add(variableName)
            }
        })

        newVariables.forEach(variableName => {
            formData.value.variables.push({
                name: variableName,
                label: variableName,
                type: 'text',
                options: '',
                defaultValue: '',
                required: true,
                placeholder: ''
            })
        })
    }
}

// 监听 prompt 变化，初始化表单
watch(() => props.prompt, (newPrompt) => {
    if (newPrompt) {
        formData.value = {
            title: newPrompt.title || '',
            description: newPrompt.description || '',
            content: newPrompt.content || '',
            categoryId: newPrompt.categoryId || null,
            tags: newPrompt.tags ? (typeof newPrompt.tags === 'string' ? newPrompt.tags.split(',').map(t => t.trim()).filter(t => t) : newPrompt.tags) : [],
            variables: newPrompt.variables?.map(v => ({
                name: v.name || '',
                label: v.label || '',
                type: v.type || 'text',
                options: v.options || '',
                defaultValue: v.defaultValue || '',
                required: v.required !== false,
                placeholder: v.placeholder || ''
            })) || []
        }
    }
}, { immediate: true })

// 监听弹窗显示状态，关闭时重置表单
watch(() => props.show, (newShow, oldShow) => {
    if (newShow && !oldShow) {
        // 弹窗从隐藏变为显示时，重置到第一步
        showExtraInfo.value = false
    }
    if (oldShow && !newShow) {
        // 弹窗从显示变为隐藏时，延迟重置表单
        setTimeout(() => {
            if (!props.show && !isEdit.value) {
                // 只在新建模式下且弹窗确实关闭时重置表单
                resetForm()
            }
        }, 100)
    }
})

// 监听内容变化，自动提取变量
watch(() => formData.value.content, (newContent) => {
    if (newContent) {
        extractVariables(newContent)
    }
})

// 方法
const addVariable = () => {
    formData.value.variables.push({
        name: '',
        label: '',
        type: 'text',
        options: '',
        defaultValue: '',
        required: true,
        placeholder: ''
    })
}

const removeVariable = (index: number) => {
    formData.value.variables.splice(index, 1)
}

const handleCancel = () => {
    emit('update:show', false)
}

const handleSave = async () => {
    try {
        await formRef.value?.validate()
        saving.value = true

        // 自动生成标题（如果没有填写）
        let finalTitle = formData.value.title
        if (!finalTitle) {
            const firstLine = formData.value.content.split('\n')[0].trim()
            finalTitle = firstLine.length > 30 ? firstLine.substring(0, 30) + '...' : firstLine
            if (!finalTitle) {
                finalTitle = `Prompt ${new Date().toLocaleString()}`
            }
        }

        // 检查标题是否重复
        try {
            const existingPrompts = await api.prompts.getAll.query({ search: finalTitle })
            const duplicatePrompt = existingPrompts.find(p =>
                p.title === finalTitle &&
                (!isEdit.value || p.id !== props.prompt?.id)
            )
            if (duplicatePrompt) {
                message.error('标题已存在，请使用不同的标题')
                return
            }
        } catch (error) {
            console.error('检查标题重复时出错:', error)
        }

        const data = {
            title: finalTitle,
            description: formData.value.description || undefined,
            content: formData.value.content,
            categoryId: formData.value.categoryId || undefined,
            tags: formData.value.tags.length > 0 ? formData.value.tags.join(',') : undefined,
            variables: formData.value.variables.filter(v => v.name && v.label).map(v => ({
                name: v.name,
                label: v.label,
                type: v.type,
                options: v.options || undefined,
                defaultValue: v.defaultValue || undefined,
                required: v.required,
                placeholder: v.placeholder || undefined
            }))
        }

        if (isEdit.value) {
            await api.prompts.update.mutate({
                id: props.prompt.id,
                data
            })
            message.success('Prompt 更新成功')
        } else {
            await api.prompts.create.mutate(data)
            message.success('Prompt 创建成功')
        }

        // 使用 nextTick 确保状态更新的顺序
        await new Promise(resolve => setTimeout(resolve, 50))
        
        // 先关闭弹窗，再通知父组件
        emit('update:show', false)
        
        // 延迟发送 saved 事件，确保弹窗已经关闭
        setTimeout(() => {
            emit('saved')
        }, 100)
        
    } catch (error) {
        message.error(isEdit.value ? '更新失败' : '创建失败')
        console.error(error)
    } finally {
        saving.value = false
    }
}
</script>

<style scoped>

</style>

