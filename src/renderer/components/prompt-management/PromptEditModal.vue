<template>    <NModal :show="show" @update:show="$emit('update:show', $event)" :mask-closable="false" preset="card"
        style="max-width:1800px; min-width: 800px; height: 90%; max-height: 100%" title="提示词编辑">
        <div style="height: 100%; display: flex; flex-direction: column;">
            <NForm ref="formRef" :model="formData" :rules="rules" label-placement="top"
                style="flex: 1; overflow: hidden;">
                <div style="height: 100%; display: flex; gap: 20px;">
                    <!-- 左侧内容区 -->
                    <div style="flex: 2; display: flex; flex-direction: column; overflow: hidden;">                        <!-- 第一步：提示词内容 -->
                        <div v-show="!showExtraInfo" style="flex: 1; display: flex; flex-direction: column;">
                            <NScrollbar style="max-height: 75vh;">
                                <NFormItem label="提示词内容" path="content">
                                    <NInput v-model:value="formData.content" type="textarea"
                                        placeholder="请输入提示词内容，使用 {{变量名}} 来定义变量" :rows="12" show-count />
                                </NFormItem>

                                <NAlert type="info" style="margin-top: 8px;">
                                    <NText depth="3">
                                        使用 <code v-pre>{{变量名}}</code> 来定义可替换的变量，右侧会自动识别并显示变量配置
                                    </NText>
                                </NAlert>
                            </NScrollbar>
                        </div>

                        <!-- 第二步：额外信息 -->
                        <div v-show="showExtraInfo" style="flex: 1;">
                            <NScrollbar style="max-height: 75vh;">
                                <NCard title="基本信息" size="small">
                                    <NFlex vertical size="medium">                                        <NFormItem label="标题" path="title">
                                            <NInput v-model:value="formData.title" placeholder="请输入提示词标题（可选）" />
                                        </NFormItem>

                                        <NFormItem label="描述" path="description">
                                            <NInput v-model:value="formData.description" type="textarea"
                                                placeholder="请输入提示词描述（可选）" :rows="8" />
                                        </NFormItem>

                                    </NFlex>
                                </NCard>
                            </NScrollbar>
                        </div>
                    </div>

                    <!-- 右侧配置/预览区 -->
                    <div style="flex: 1; display: flex; flex-direction: column; overflow: hidden;">
                        <!-- 变量识别和配置区（第一步显示） -->
                        <div v-show="!showExtraInfo" style="flex: 1; display: flex; flex-direction: column;">
                            <NScrollbar style="max-height: 75vh;">
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

                                    <div v-if="formData.variables.length === 0" style="padding: 20px 0;">
                                        <NEmpty description="在左侧输入内容时使用 {{变量名}} 格式，会自动识别变量" size="small" />
                                    </div>
                                    <NFlex v-else vertical size="medium" style="padding: 8px 0;">
                                        <NCard v-for="(variable, index) in formData.variables" :key="index" size="small"
                                            class="variable-card">
                                            <template #header>
                                                <NFlex justify="space-between" align="center">
                                                    <NText>{{ variable.name || '变量' + (index + 1) }}</NText>
                                                    <NButton size="small" text type="error"
                                                        @click="removeVariable(index)">
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
                                                        <NInput v-model:value="variable.name" placeholder="变量名"
                                                            size="small" />
                                                    </NFormItem>
                                                    <NFormItem label="显示名" style="flex: 1">
                                                        <NInput v-model:value="variable.label" placeholder="显示名称"
                                                            size="small" />
                                                    </NFormItem>
                                                </NFlex>

                                                <NFlex>
                                                    <NFormItem label="类型" style="flex: 1">
                                                        <NSelect v-model:value="variable.type"
                                                            :options="variableTypeOptions" size="small" />
                                                    </NFormItem>
                                                    <NFormItem label="必填" style="width: 80px">
                                                        <NSwitch v-model:value="variable.required" size="small" />
                                                    </NFormItem>
                                                </NFlex>

                                                <NFormItem label="默认值">
                                                    <NInput 
                                                        v-if="variable.type === 'text'"
                                                        v-model:value="variable.defaultValue" 
                                                        placeholder="默认值（可选）"
                                                        size="small" 
                                                    />
                                                    <NSelect
                                                        v-else-if="variable.type === 'select'"
                                                        v-model:value="variable.defaultValue"
                                                        :options="getVariableDefaultOptions(variable.options)"
                                                        placeholder="选择默认选项（可选）"
                                                        size="small"
                                                        clearable
                                                    />
                                                </NFormItem>

                                                <NFormItem v-if="variable.type === 'select'" label="选项">
                                                    <NDynamicInput 
                                                        v-model:value="variable.options" 
                                                        show-sort-button
                                                        placeholder="请输入选项"
                                                        :min="1"
                                                    />
                                                </NFormItem>
                                            </NFlex>
                                        </NCard>
                                    </NFlex>
                                </NCard>
                            </NScrollbar>
                        </div>

                        <!-- 标签区（第二步显示） -->
                        <div v-show="showExtraInfo" style="flex: 1; display: flex; flex-direction: column;">
                            <NScrollbar style="max-height: 75vh;">
                                <NCard title="分类与标签" size="small">
                                    <NFlex vertical size="medium">
                                        <NFormItem label="分类">
                                            <NSelect v-model:value="formData.categoryId" :options="categoryOptions"
                                                placeholder="选择分类" clearable />
                                        </NFormItem>
                                        <NFormItem label="标签" path="tags">
                                            <NDynamicTags v-model:value="formData.tags" placeholder="按回车添加标签"
                                                :max="5" />
                                        </NFormItem>

                                    </NFlex>
                                </NCard>
                            </NScrollbar>
                        </div>
                    </div>
                </div>
            </NForm>
        </div>

        <template #footer>
            <NFlex justify="space-between">
                <div>
                    <NButton v-if="showExtraInfo" @click="showExtraInfo = false" ghost>
                        <template #icon>
                            <NIcon>
                                <ArrowLeft />
                            </NIcon>
                        </template>
                        返回编辑
                    </NButton>
                    <NButton v-if="!showExtraInfo" @click="handleShowExtraInfo" :disabled="!formData.content.trim()"
                        ghost>
                        <template #icon>
                            <NIcon>
                                <InfoCircle />
                            </NIcon>
                        </template>
                        补充信息
                    </NButton>
                </div>
                <NFlex>
                    <NButton @click="handleCancel">取消</NButton>
                    <NButton type="primary" @click="handleSave" :loading="saving" :disabled="!formData.content.trim()">
                        {{ isEdit ? '更新' : '创建' }}
                    </NButton>
                </NFlex>
            </NFlex>
        </template>
    </NModal>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
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
    NScrollbar,
    NDynamicInput,
    useMessage
} from 'naive-ui'
import { Plus, Trash, InfoCircle, ArrowLeft } from '@vicons/tabler'
import { api } from '@/lib/api'

interface Variable {
    name: string
    label: string
    type: string
    options?: string[]
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

// 防抖相关
const debounceTimer = ref<number | null>(null)
const DEBOUNCE_DELAY = 500 // 500ms 防抖延迟

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
    }    return '未命名提示词'
})

const variableTypeOptions = [
    { label: '文本', value: 'text' },
    { label: '选项', value: 'select' }
]

// 表单验证规则
const rules = {
    content: {
        required: true,
        message: '请输入提示词内容',
        trigger: 'blur, focus'
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
    // 清理防抖定时器
    if (debounceTimer.value) {
        clearTimeout(debounceTimer.value)
        debounceTimer.value = null
    }
    
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

// 提取变量的方法 - 优化版本：去重并只保留实际存在的变量
const extractVariables = (content: string) => {
    const variableRegex = /\{\{([^}]+)\}\}/g
    const matches = content.match(variableRegex)
    
    // 提取当前内容中的所有变量名
    const currentVariableNames = new Set<string>()
    if (matches) {
        matches.forEach(match => {
            const variableName = match.replace(/[{}]/g, '').trim()
            if (variableName) {
                currentVariableNames.add(variableName)
            }
        })
    }
    
    // 保留现有变量的配置信息
    const existingVariableConfigs = new Map()
    formData.value.variables.forEach(variable => {
        if (variable.name) {
            existingVariableConfigs.set(variable.name, variable)
        }
    })
    
    // 重新构建变量列表：只包含当前内容中实际存在的变量
    formData.value.variables = Array.from(currentVariableNames).map(variableName => {
        // 如果已有配置，保留原配置；否则创建新配置
        return existingVariableConfigs.get(variableName) || {
            name: variableName,
            label: variableName,
            type: 'text',
            options: [],
            defaultValue: '',
            required: true,
            placeholder: ''
        }
    })
}

// 防抖的变量提取方法
const debouncedExtractVariables = (content: string) => {
    // 清除之前的定时器
    if (debounceTimer.value) {
        clearTimeout(debounceTimer.value)
    }
    
    // 设置新的定时器
    debounceTimer.value = setTimeout(() => {
        extractVariables(content)
        debounceTimer.value = null
    }, DEBOUNCE_DELAY) as unknown as number
}

// 自动生成标题的函数
const generateAutoTitle = () => {
    if (!formData.value.content) return ''
    
    const firstLine = formData.value.content.split('\n')[0].trim()
    if (firstLine.length > 30) {
        return firstLine.substring(0, 30) + '...'
    }
    return firstLine || `提示词 ${new Date().toLocaleString()}`
}

// 处理进入补充信息页面
const handleShowExtraInfo = () => {
    // 如果标题为空，自动填充生成的标题
    if (!formData.value.title.trim()) {
        formData.value.title = generateAutoTitle()
    }
    showExtraInfo.value = true
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
                options: Array.isArray(v.options) ? v.options : (typeof v.options === 'string' ? v.options.split(',').map(opt => opt.trim()).filter(opt => opt) : []),
                defaultValue: v.defaultValue || '',
                required: v.required !== false,
                placeholder: v.placeholder || ''
            })) || []
        }
        
        // 如果有内容但没有变量配置，立即提取变量
        if (newPrompt.content && (!newPrompt.variables || newPrompt.variables.length === 0)) {
            nextTick(() => {
                extractVariables(newPrompt.content)
            })
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
        // 弹窗从显示变为隐藏时，清理定时器并延迟重置表单
        if (debounceTimer.value) {
            clearTimeout(debounceTimer.value)
            debounceTimer.value = null
        }
        setTimeout(() => {
            if (!props.show && !isEdit.value) {
                // 只在新建模式下且弹窗确实关闭时重置表单
                resetForm()
            }
        }, 100)
    }
})

// 监听内容变化，自动提取变量（使用防抖）
watch(() => formData.value.content, (newContent) => {
    if (newContent) {
        debouncedExtractVariables(newContent)
    } else {
        // 如果内容为空，立即清空变量列表
        if (debounceTimer.value) {
            clearTimeout(debounceTimer.value)
            debounceTimer.value = null
        }
        formData.value.variables = []
    }
})

// 监听变量类型变化，清理不匹配的默认值
watch(() => formData.value.variables, (newVariables) => {
    newVariables.forEach(variable => {
        // 当变量类型为选项时，检查默认值是否在选项中
        if (variable.type === 'select' && variable.defaultValue) {
            const validOptions = Array.isArray(variable.options) ? variable.options.filter(opt => opt && opt.trim()) : []
            if (!validOptions.includes(variable.defaultValue)) {
                variable.defaultValue = ''
            }
        }
        // 当变量类型为文本且选项不为空时，清空选项
        if (variable.type === 'text' && Array.isArray(variable.options) && variable.options.length > 0) {
            variable.options = []
        }
        // 当变量类型切换到选项但没有选项时，提供默认选项
        if (variable.type === 'select' && (!Array.isArray(variable.options) || variable.options.length === 0)) {
            variable.options = ['选项1', '选项2', '选项3']
        }
    })
}, { deep: true })

// 生成唯一变量名的辅助方法
const generateUniqueVariableName = () => {
    const existingNames = new Set(formData.value.variables.map(v => v.name))
    let counter = 1
    let variableName = `变量${counter}`
    
    while (existingNames.has(variableName)) {
        counter++
        variableName = `变量${counter}`
    }
    
    return variableName
}

// 获取变量默认值选项
const getVariableDefaultOptions = (options) => {
    if (!Array.isArray(options) || options.length === 0) return []
    return options.filter(opt => opt && opt.trim()).map(option => ({
        label: option,
        value: option
    }))
}

// 方法
const addVariable = () => {
    const variableName = generateUniqueVariableName()
    
    // 添加变量配置
    formData.value.variables.push({
        name: variableName,
        label: variableName,
        type: 'text',
        options: [],
        defaultValue: '',
        required: true,
        placeholder: ''
    })
    
    // 在左侧内容中自动添加对应的占位符
    const placeholder = `{{${variableName}}}`
    
    // 如果内容为空，直接添加占位符
    if (!formData.value.content.trim()) {
        formData.value.content = placeholder
    } else {
        // 如果内容不为空，在末尾添加占位符（换行后添加）
        const content = formData.value.content.trim()
        formData.value.content = content + '\n' + placeholder
    }
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
            finalTitle = generateAutoTitle()
        }

        // 检查标题是否重复，如果重复则自动添加时间戳
        try {
            const existingPrompts = await api.prompts.getAll.query({ search: finalTitle })
            let duplicatePrompt = existingPrompts.find(p =>
                p.title === finalTitle &&
                (!isEdit.value || p.id !== props.prompt?.id)
            )
            
            // 如果标题重复，自动添加时间戳
            if (duplicatePrompt) {
                const timestamp = new Date().toLocaleString('zh-CN', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                }).replace(/[/:]/g, '-').replace(/,?\s+/g, '_')
                
                finalTitle = `${finalTitle}_${timestamp}`
                
                // 再次检查新标题是否重复（极低概率）
                const newCheck = existingPrompts.find(p =>
                    p.title === finalTitle &&
                    (!isEdit.value || p.id !== props.prompt?.id)
                )
                
                // 如果还是重复，添加随机后缀
                if (newCheck) {
                    const randomSuffix = Math.random().toString(36).substring(2, 8)
                    finalTitle = `${finalTitle}_${randomSuffix}`
                }
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
                options: v.type === 'select' && Array.isArray(v.options) && v.options.length > 0 ? v.options.filter(opt => opt.trim()) : undefined,
                defaultValue: v.defaultValue || undefined,
                required: v.required,
                placeholder: v.placeholder || undefined
            }))
        }

        if (isEdit.value) {
            await api.prompts.update.mutate({
                id: props.prompt.id,
                data            })
            message.success('提示词更新成功')
        } else {
            await api.prompts.create.mutate(data)
            message.success('提示词创建成功')
        }

        // 立即发送 saved 事件，通知父组件刷新数据
        emit('saved')
        
        // 短暂延迟后关闭弹窗，确保数据已经刷新
        setTimeout(() => {
            emit('update:show', false)
        }, 100)

    } catch (error) {
        message.error(isEdit.value ? '更新失败' : '创建失败')
        console.error(error)
    } finally {
        saving.value = false
    }
}
</script>

<style scoped></style>
