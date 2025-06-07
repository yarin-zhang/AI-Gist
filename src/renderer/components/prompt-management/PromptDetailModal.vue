<template>
    <CommonModal 
        v-if="prompt"
        ref="modalRef"
        :show="show" 
        @update:show="$emit('update:show', $event)"
        @close="handleClose"
        :header-height="headerHeight"
        :footer-height="footerHeight"
        :content-padding="contentPadding"
    >
        <!-- 顶部固定区域 -->
        <template #header>
            <NFlex vertical size="medium" style="padding: 16px;">
                <NFlex justify="start" align="center">
                    <NFlex align="center">
                        <NText strong size="large">{{ prompt?.title }}</NText>
                        <NText depth="3">{{ formatDate(prompt.updatedAt) }}</NText>
                    </NFlex>
                </NFlex>

                <NText v-if="prompt.description">{{ prompt.description }}</NText>

                <!-- 标签区域 - 与 PromptList 保持一致的结构 -->
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
                            :color="getTagColor(tag)">
                            <template #icon>
                                <NIcon>
                                    <Tag />
                                </NIcon>
                            </template>
                            {{ tag }}
                        </NTag>
                    </template>
                </NFlex>
            </NFlex>
        </template>

        <!-- 中间可操作区域 -->
        <template #content>
                <!-- 详情页面 -->
                <NGrid v-show="!showHistoryPage" :cols="gridCols" :x-gap="16">
                    <!-- 左侧：变量输入区 -->
                    <NGridItem :span="leftSpan">
                        <NCard size="small">
                            <template #header>
                                <NFlex justify="space-between" align="center">
                                    <NText strong>变量设置</NText>
                                    <NButton v-if="prompt.variables && prompt.variables.length > 0" size="small"
                                        @click="clearVariables">清空</NButton>
                                </NFlex>
                            </template>

                            <NScrollbar :style="{ height: `${contentHeight}px` }">
                                <NFlex vertical size="medium" style="padding-right: 12px;"
                                    v-if="prompt.variables && prompt.variables.length > 0">
                                    <NFormItem v-for="variable in prompt.variables" :key="variable.id"
                                        :label="variable.label" :required="variable.required">
                                        <NInput v-if="variable.type === 'text'"
                                            v-model:value="variableValues[variable.name]" type="textarea"
                                            :placeholder="variable.placeholder || `请输入${variable.label}`" :rows="1"
                                            :autosize="{ minRows: 1, maxRows: 5 }" />
                                        <NSelect v-else-if="variable.type === 'select'"
                                            v-model:value="variableValues[variable.name]"
                                            :options="getSelectOptions(variable.options)"
                                            :placeholder="variable.placeholder || `请选择${variable.label}`" />
                                    </NFormItem>
                                </NFlex>
                                <NEmpty v-else description="此提示词没有可配置的变量">
                                    <template #icon>
                                        <NIcon>
                                            <Wand />
                                        </NIcon>
                                    </template>
                                </NEmpty>
                            </NScrollbar>
                        </NCard>
                    </NGridItem>

                    <!-- 右侧：结果预览区 -->
                    <NGridItem :span="rightSpan">
                        <NCard size="small">
                            <template #header>
                                <NFlex justify="space-between" align="center">
                                    <NText strong>提示词内容</NText>
                                    <NFlex>
                                        <NButton size="small" @click="copyToClipboard(filledContent)">
                                            <template #icon>
                                                <NIcon>
                                                    <Copy />
                                                </NIcon>
                                            </template>
                                            复制内容
                                        </NButton>
                                        <NButton size="small" type="primary" @click="usePrompt">
                                            <template #icon>
                                                <NIcon>
                                                    <Check />
                                                </NIcon>
                                            </template>
                                            使用此提示词
                                        </NButton>
                                    </NFlex>
                                </NFlex>
                            </template>

                            <NScrollbar :style="{ height: `${contentHeight}px` }">
                                <NFlex vertical size="medium" style="padding-right: 12px;">
                                    <NInput :value="filledContent" type="textarea" readonly
                                        :style="{ height: `${contentHeight - 50}px`, fontFamily: 'Monaco, Menlo, Ubuntu Mono, monospace' }"
                                        :placeholder="!filledContent ? '内容为空' : ''" />

                                    <!-- 如果有未填写的变量，显示提示 -->
                                    <NFlex v-if="hasUnfilledVariables" align="center">
                                        <NIcon color="#fa8c16">
                                            <Wand />
                                        </NIcon>
                                        <NText>检测到未填写的变量，请在左侧填写以生成完整的提示词</NText>
                                    </NFlex>
                                </NFlex>
                            </NScrollbar>
                        </NCard>
                    </NGridItem>
                </NGrid>

                <!-- 历史记录页面 -->
                <NGrid v-show="showHistoryPage" :cols="gridCols" :x-gap="16">
                    <!-- 左侧：历史记录列表 -->
                    <NGridItem :span="leftSpan">
                        <NCard size="small">
                            <template #header>
                                <NFlex justify="space-between" align="center" :style="{ height: `30px` }">
                                    <NText strong>使用历史记录</NText>
                                    <NText depth="3">{{ useHistory.length }} 条记录</NText>
                                </NFlex>
                            </template>

                            <template #action>
                                <NFlex justify="center" :style="{ height: `30px` }">
                                    <NPagination v-model:page="currentPage" :page-count="totalPages"
                                        :page-size="pageSize" size="small" show-quick-jumper show-size-picker
                                        :page-sizes="[1, 3, 5, 10, 20]" :page-slot="7"
                                        @update:page-size="handlePageSizeChange" />
                                </NFlex>
                            </template>

                            <NScrollbar :style="{ height: `${contentHeight - 60}px` }">
                                <NFlex vertical size="medium" style="padding-right: 12px;"
                                    v-if="paginatedHistory.length > 0">
                                    <NCard v-for="(record, index) in paginatedHistory"
                                        :key="(currentPage - 1) * pageSize + index" size="small" hoverable>
                                        <template #header>
                                            <NFlex justify="space-between" align="center">
                                                <NText depth="3">{{ record.date }}</NText>
                                                <NFlex size="small">
                                                    <NButton size="small" text type="info"
                                                        @click.stop="selectHistoryRecord((currentPage - 1) * pageSize + index)">
                                                        预览
                                                    </NButton>
                                                    <NButton size="small" text type="primary"
                                                        @click.stop="loadHistoryRecord(record)">
                                                        重新加载
                                                    </NButton>
                                                </NFlex>
                                            </NFlex>
                                        </template>

                                        <NFlex vertical size="small">
                                            <NText>{{ record.content.substring(0, 120) }}{{ record.content.length > 120
                                                ? '...' : ''
                                                }}</NText>

                                            <NFlex v-if="record.variables && Object.keys(record.variables).length > 0"
                                                size="small">
                                                <NText depth="3">包含变量：</NText>
                                                <NTag v-for="key in Object.keys(record.variables).slice(0, 3)"
                                                    :key="key" size="small" type="primary" :bordered="false">
                                                    {{ key }}
                                                </NTag>
                                                <NText v-if="Object.keys(record.variables).length > 3" depth="3">
                                                    +{{ Object.keys(record.variables).length - 3 }}...
                                                </NText>
                                            </NFlex>
                                        </NFlex>
                                    </NCard>
                                </NFlex>

                                <NEmpty v-else description="暂无使用历史记录">
                                    <template #icon>
                                        <NIcon>
                                            <History />
                                        </NIcon>
                                    </template>
                                </NEmpty>
                            </NScrollbar>
                        </NCard>
                    </NGridItem>

                    <!-- 右侧：历史记录预览 -->
                    <NGridItem :span="rightSpan">
                        <NCard size="small">
                            <template #header>
                                <NText strong>历史记录预览</NText>
                            </template>

                            <NScrollbar :style="{ height: `${contentHeight}px` }">
                                <NFlex vertical size="medium" style="padding-right: 12px;" v-if="selectedHistory">
                                    <!-- 变量信息 -->
                                    <div
                                        v-if="selectedHistory.variables && Object.keys(selectedHistory.variables).length > 0">
                                        <NText strong>包含变量：</NText>
                                        <NFlex vertical size="small">
                                            <NFlex v-for="(value, key) in selectedHistory.variables" :key="key"
                                                align="center" size="small">
                                                <NTag size="small" type="primary" :bordered="false">{{ key }}</NTag>
                                                <NInput :value="value" readonly size="small" />
                                            </NFlex>
                                        </NFlex>
                                    </div>

                                    <!-- 完整内容 -->
                                    <div>
                                        <NText strong>完整内容：</NText>
                                        <NInput :value="selectedHistory.content" type="textarea" readonly
                                            :style="{ height: '200px', fontFamily: 'Monaco, Menlo, Ubuntu Mono, monospace' }" />
                                    </div>

                                    <!-- 操作按钮 -->
                                    <NFlex justify="space-between">
                                        <NPopconfirm @positive-click="deleteHistoryRecord">
                                            <template #trigger>
                                                <NButton type="error" secondary>
                                                    <template #icon>
                                                        <NIcon>
                                                            <Trash />
                                                        </NIcon>
                                                    </template>
                                                    删除
                                                </NButton>
                                            </template>
                                            确定要删除这条历史记录吗？删除后将无法恢复。
                                        </NPopconfirm>
                                        <NButton type="primary" @click="copyToClipboard(selectedHistory.content)">
                                            <template #icon>
                                                <NIcon>
                                                    <Copy />
                                                </NIcon>
                                            </template>
                                            复制记录
                                        </NButton>
                                    </NFlex>
                                </NFlex>
                                <NEmpty v-else description="请选择一条历史记录查看详情">
                                    <template #icon>
                                        <NIcon>
                                            <FileText />
                                        </NIcon>
                                    </template>
                                </NEmpty>
                            </NScrollbar>
                        </NCard>
                    </NGridItem>
                </NGrid>        </template>

        <!-- 底部固定区域 -->
        <template #footer>
            <NFlex justify="space-between" align="center" style="padding: 16px; height: 100%;">
                <NFlex>
                    <!-- 历史记录按钮（主页面左下角） -->
                    <NButton v-show="!showHistoryPage" @click="showHistoryPage = true"
                        :disabled="useHistory.length === 0">
                        <template #icon>
                            <NIcon>
                                <History />
                            </NIcon>
                        </template>
                        查看历史记录 ({{ useHistory.length }})
                    </NButton>

                    <!-- 返回按钮（历史记录页面左下角） -->
                    <NButton v-show="showHistoryPage" @click="showHistoryPage = false">
                        <template #icon>
                            <NIcon>
                                <ArrowLeft />
                            </NIcon>
                        </template>
                        返回
                    </NButton>
                </NFlex>

                <NFlex>
                    <!-- 收藏和编辑按钮移到右下角 -->
                    <NButton type="primary" secondary @click="toggleFavorite"
                        :type="prompt.isFavorite ? 'error' : 'default'">
                        <template #icon>
                            <NIcon>
                                <Heart />
                            </NIcon>
                        </template>
                        {{ prompt.isFavorite ? '取消收藏' : '收藏' }}
                    </NButton>
                    <NButton type="primary" @click="$emit('edit', prompt)">
                        <template #icon>
                            <NIcon>
                                <Edit />
                            </NIcon>
                        </template>
                        编辑
                    </NButton>
                </NFlex>
            </NFlex>
        </template>
    </CommonModal>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import {
    NCard,
    NFlex,
    NText,
    NTag,
    NButton,
    NIcon,
    NInput,
    NFormItem,
    NSelect,
    NEmpty,
    NScrollbar,
    NPagination,
    NPopconfirm,
    NGrid,
    NGridItem,
    useMessage
} from 'naive-ui'
import { Heart, Edit, Copy, Wand, Check, History, ArrowLeft, FileText, Trash, Tag, Box } from '@vicons/tabler'
import { api } from '@/lib/api'
import { useTagColors } from '@/composables/useTagColors'
import { useWindowSize } from '@/composables/useWindowSize'
import CommonModal from '@/components/common/CommonModal.vue'

interface Props {
    show: boolean
    prompt?: any
}

interface Emits {
    (e: 'update:show', value: boolean): void
    (e: 'use'): void
    (e: 'edit', prompt: any): void
    (e: 'updated'): void // 添加数据更新事件
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const message = useMessage()

// 使用标签颜色 composable
const { getTagColor, getTagsArray, getCategoryTagColor } = useTagColors()

// 使用窗口尺寸 composable
const { modalWidth } = useWindowSize()

// 布局高度常量
const headerHeight = 180
const footerHeight = 60
const contentPadding = 16

// 网格列数计算
const gridCols = computed(() => {
    return modalWidth.value > 1000 ? 12 : 12
})

// 左侧网格大小
const leftSpan = computed(() => {
    return modalWidth.value > 1000 ? 5 : 5
})

// 右侧网格大小
const rightSpan = computed(() => {
    return modalWidth.value > 1000 ? 7 : 7
})

// 模板引用
const modalRef = ref<InstanceType<typeof CommonModal> | null>(null)

// 获取内容高度
const contentHeight = computed(() => {
    return modalRef.value?.contentHeight || 400
})

// 响应式数据
const variableValues = ref({})
const useHistory = ref([])
const showHistoryPage = ref(false)
const selectedHistoryIndex = ref(-1)

// 分页相关
const currentPage = ref(1)
const pageSize = ref(3)

// 分页计算属性
const totalPages = computed(() => Math.ceil(useHistory.value.length / pageSize.value))

const paginatedHistory = computed(() => {
    const start = (currentPage.value - 1) * pageSize.value
    const end = start + pageSize.value
    return useHistory.value.slice(start, end)
})

// 处理页面大小变化
const handlePageSizeChange = (newPageSize) => {
    pageSize.value = newPageSize
    currentPage.value = 1
    selectedHistoryIndex.value = -1
}

// 初始化变量值
const initializeVariables = () => {
    if (!props.prompt?.variables) {
        variableValues.value = {}
        return
    }

    const values = {}
    props.prompt.variables.forEach(variable => {
        // 确保每个变量都有初始值，即使是空字符串
        values[variable.name] = variable.defaultValue || ''
    })
    variableValues.value = values

    console.log('初始化变量:', values) // 调试用
    console.log('Prompt 内容:', props.prompt.content) // 调试用
}

// 获取选择框选项
const getSelectOptions = (options) => {
    if (!options) return []
    // 如果是数组，直接使用；如果是字符串，按逗号分割
    const optionsArray = Array.isArray(options) ? options : options.split(',').map(opt => opt.trim()).filter(opt => opt)
    return optionsArray.map(option => ({
        label: option,
        value: option
    }))
}

// 生成填充后的 Prompt - 改为计算属性，自动生成
const filledContent = computed(() => {
    if (!props.prompt?.content) return ''

    let content = props.prompt.content

    // 如果没有变量，直接返回原始内容
    if (!props.prompt.variables || props.prompt.variables.length === 0) {
        return content
    }

    // 替换变量
    Object.entries(variableValues.value).forEach(([key, value]) => {
        const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g')
        // 如果变量有值，就替换；如果没有值，保留原始的 {{key}} 格式
        if (value !== undefined && value !== null && value.toString().trim() !== '') {
            content = content.replace(regex, value.toString())
        }
    })

    console.log('计算填充内容:', {
        original: props.prompt.content,
        variables: variableValues.value,
        result: content
    }) // 调试用

    return content
})

// 是否有变量
const hasVariables = computed(() => {
    return props.prompt?.variables && props.prompt.variables.length > 0
})

// 是否有未填写的变量
const hasUnfilledVariables = computed(() => {
    if (!hasVariables.value) return false

    // 检查是否还有未替换的变量占位符
    const content = filledContent.value
    const hasPlaceholders = /\{\{[^}]+\}\}/.test(content)

    return hasPlaceholders
})

// 选中的历史记录
const selectedHistory = computed(() => {
    if (selectedHistoryIndex.value >= 0 && selectedHistoryIndex.value < useHistory.value.length) {
        return useHistory.value[selectedHistoryIndex.value]
    }
    return null
})

// 清空变量
const clearVariables = () => {
    initializeVariables()
}

// 复制到剪贴板
const copyToClipboard = async (text) => {
    try {
        await navigator.clipboard.writeText(text)
        message.success('已复制到剪贴板')
    } catch (error) {
        message.error('复制失败')
    }
}

// 使用 Prompt
const usePrompt = async () => {
    try {
        // 保存使用记录到本地存储
        const record = {
            date: formatDate(new Date()),
            content: filledContent.value,
            variables: { ...variableValues.value }
        }

        useHistory.value.unshift(record)
        if (useHistory.value.length > 50) {
            useHistory.value = useHistory.value.slice(0, 50)
        }

        // 保存到本地存储
        localStorage.setItem(`prompt_history_${props.prompt.id}`, JSON.stringify(useHistory.value))

        // 增加使用计数
        await api.prompts.incrementUseCount.mutate(props.prompt.id)

        // 立即更新当前 prompt 对象的使用计数
        if (props.prompt) {
            props.prompt.useCount = (props.prompt.useCount || 0) + 1
        }

        // 直接复制到剪贴板，不显示单独的复制消息
        await navigator.clipboard.writeText(filledContent.value)

        message.success('提示词已复制到剪贴板，使用计数已更新')
        emit('use')
        emit('updated') // 通知父组件重新加载数据以更新使用计数
    } catch (error) {
        message.error('操作失败')
        console.error(error)
    }
}

// 切换收藏状态
const toggleFavorite = async () => {
    try {
        await api.prompts.toggleFavorite.mutate(props.prompt.id)

        // 立即更新当前 prompt 对象的收藏状态
        if (props.prompt) {
            props.prompt.isFavorite = !props.prompt.isFavorite
        }

        message.success('收藏状态已更新')
        emit('updated') // 通知父组件重新加载数据
    } catch (error) {
        message.error('更新收藏状态失败')
        console.error(error)
    }
}

// 加载历史记录
const loadHistoryRecord = (record) => {
    variableValues.value = { ...record.variables }
    showHistoryPage.value = false // 回到主页面
    message.success('已加载历史记录')
}

// 选择历史记录
const selectHistoryRecord = (index) => {
    selectedHistoryIndex.value = index
}

// 删除历史记录
const deleteHistoryRecord = async () => {
    if (selectedHistoryIndex.value >= 0) {
        try {
            // 删除历史记录
            useHistory.value.splice(selectedHistoryIndex.value, 1)

            // 更新本地存储
            localStorage.setItem(`prompt_history_${props.prompt.id}`, JSON.stringify(useHistory.value))

            // 减少数据库中的使用计数
            await api.prompts.decrementUseCount.mutate(props.prompt.id)

            // 重置选择
            selectedHistoryIndex.value = -1

            // 如果当前页面没有记录了，回到第一页
            if (paginatedHistory.value.length === 0 && currentPage.value > 1) {
                currentPage.value = 1
            }

            // 发出更新事件，通知父组件刷新数据
            emit('updated')

            message.success('历史记录已删除')
        } catch (error) {
            console.error('删除历史记录失败:', error)
            message.error('删除历史记录失败')
        }
    }
}

// 格式化日期
const formatDate = (date) => {
    return new Date(date).toLocaleString('zh-CN')
}

// 关闭弹窗
const handleClose = () => {
    emit('update:show', false)
}

// 监听 prompt 变化
watch(() => props.prompt, (newPrompt) => {
    console.log('Prompt 变化:', newPrompt) // 调试用
    if (newPrompt) {
        initializeVariables()

        // 加载使用历史
        const history = localStorage.getItem(`prompt_history_${newPrompt.id}`)
        if (history) {
            try {
                useHistory.value = JSON.parse(history)
            } catch {
                useHistory.value = []
            }
        } else {
            useHistory.value = []
        }
    }
}, { immediate: true })

// 监听变量值变化，用于调试
watch(() => variableValues.value, (newValues) => {
    console.log('变量值变化:', newValues)
    console.log('填充后内容:', filledContent.value)
}, { deep: true })

// 监听显示状态
watch(() => props.show, (show) => {
    if (!show) {
        // 关闭弹窗时重置状态
        showHistoryPage.value = false
        selectedHistoryIndex.value = -1
        currentPage.value = 1
    }
})

// 监听历史记录页面显示状态
watch(() => showHistoryPage.value, (show) => {
    if (show) {
        // 进入历史记录页面时重置选择
        selectedHistoryIndex.value = -1
        currentPage.value = 1
    }
})
</script>

<style scoped>
/* 完全移除自定义样式，仅依赖 NaiveUI 原生组件和属性 */
</style>
