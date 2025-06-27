<template>
    <div class="ai-generator">
        <!-- 没有AI 配置时显示的空状态 -->
        <n-empty v-if="configs.length === 0 && !loading" description="暂无可用的 AI 配置" size="large" style="margin: 40px 0;">
            <template #icon>
                <n-icon size="48" :color="'var(--text-color-3)'">
                    <Robot />
                </n-icon>
            </template>
            <template #extra>
                <n-space vertical align="center">
                    <n-text depth="3" style="margin-bottom: 16px;">
                        请先添加并启用至少一个 AI 配置才能使用生成功能
                    </n-text>
                    <n-button type="primary" @click="navigateToAIConfig">
                        <template #icon>
                            <n-icon>
                                <Plus />
                            </n-icon>
                        </template>
                        添加 AI 配置
                    </n-button>
                </n-space>
            </template>
        </n-empty> <!-- 有AI 配置时显示的生成工具 -->
        <div v-if="configs.length > 0" class="ai-generator-layout">
            <!-- 主要内容区 -->
            <div class="main-content">
                <n-card title="AI 提示词生成器" class="generator-card">
                    <n-form ref="formRef" :model="formData" :rules="formRules" label-placement="top">
                        <n-form-item label="要求" path="topic">
                            <n-split v-model:size="splitSize" direction="horizontal" :min="0.3" :max="1"
                                :default-size="1" :disabled="true" :style="{ height: '120px', width: '100%' }">
                                <template #1>
                                    <n-input v-model:value="formData.topic" type="textarea" :rows="4"
                                        placeholder="描述你想要生成的提示词，例如：写作助手、代码审查、翻译工具等" :style="{ height: '100%' }" />
                                </template> <template #2>
                                    <div style="height: 100%; position: relative;">
                                        <n-input v-model:value="generatedResult" type="textarea" :rows="4"
                                            placeholder="生成的提示词将在这里显示..." :readonly="autoSaveEnabled" show-count :style="{
                                                height: '100%',
                                                backgroundColor: 'var(--code-color)',
                                                opacity: generatedResult ? 1 : 0.7
                                            }" />
                                    </div>
                                </template>
                            </n-split>
                        </n-form-item>
                        <n-form-item>
                            <n-space vertical style="width: 100%;">
                            <n-space justify="space-between" align="center" style="width: 100%;">
                                <n-space>
                                    <n-button type="primary" @click="generatePrompt" :loading="generating"
                                        :disabled="configs.length === 0 || generating">
                                        <template #icon>
                                            <n-icon>
                                                <Bolt />
                                            </n-icon>
                                        </template>
                                        生成
                                    </n-button>
                                    
                                    <!-- 停止生成按钮 -->
                                    <n-button v-if="generating" @click="stopGeneration" type="error" ghost>
                                        <template #icon>
                                            <n-icon>
                                                <X />
                                            </n-icon>
                                        </template>
                                        停止
                                    </n-button>
                                    <!-- 模型选择器 -->
                                    <AIModelSelector 
                                        ref="modelSelectorRef"
                                        v-model:modelKey="selectedModelKey"
                                        placeholder="选择模型"
                                        :disabled="generating"
                                        style="min-width: 300px;"
                                        @configChange="onModelSelect"
                                    />
                                    <n-button @click="toggleHistory" quaternary>
                                        <template #icon>
                                            <n-icon>
                                                <History />
                                            </n-icon>
                                        </template>
                                        历史记录
                                    </n-button>
                                </n-space>
                                <n-space align="center">
                                    <n-checkbox v-model:checked="autoSaveEnabled">
                                        自动保存
                                    </n-checkbox>
                                    <n-button v-if="!autoSaveEnabled && generatedResult" type="primary"
                                        @click="manualSavePrompt">
                                        <template #icon>
                                            <n-icon>
                                                <DeviceFloppy />
                                            </n-icon>
                                        </template>
                                        保存
                                    </n-button>
                                </n-space>
                            </n-space>
                            
                            <!-- 生成状态显示栏 - 放置在按钮下方 -->
                            <!-- <div v-if="generating" class="generation-status-bar" style="margin-top: 12px;">
                                <n-space align="center">
                                    <n-icon size="16" :color="'var(--primary-color)'" class="rotating">
                                        <Bolt />
                                    </n-icon>
                                    <n-text>{{ getGenerationStatusText() }}</n-text>
                                </n-space>
                            </div> -->
                            </n-space>
                        </n-form-item>
                    </n-form>
                </n-card>
            </div>

            <!-- 历史记录区（在下方，可切换显示） -->
            <div v-if="showHistory" class="history-section">
                <n-card title="生成历史" class="history-card">
                    <template #header-extra>
                        <n-space>
                            <n-button size="small" @click="loadHistory">
                                <template #icon>
                                    <n-icon>
                                        <Refresh />
                                    </n-icon>
                                </template>
                                刷新
                            </n-button>
                            <n-button size="small" @click="toggleHistory">
                                <template #icon>
                                    <n-icon>
                                        <X />
                                    </n-icon>
                                </template>
                                关闭
                            </n-button>
                        </n-space>
                    </template>

                    <n-list>
                        <n-list-item v-for="item in paginatedHistory" :key="item.id">
                            <template #prefix>
                                <n-icon :color="item.status === 'success' ? '#18a058' : '#d03050'">
                                    <Check v-if="item.status === 'success'" />
                                    <AlertCircle v-else />
                                </n-icon>
                            </template>

                            <n-thing>
                                <template #header>{{ item.topic }}</template>
                                <template #description>
                                    <n-space align="center">
                                        <n-space align="center" :size="4">
                                            <n-icon v-if="isConfigPreferred(item.configId)" size="14" color="#f0c674">
                                                <Star />
                                            </n-icon>
                                            <span>{{ getConfigNameOnly(item.configId) }}</span>
                                        </n-space>
                                        <span>{{ item.model }}</span>
                                        <span>{{ formatDate(item.createdAt) }}</span>
                                    </n-space>
                                </template>
                                <div v-if="item.status === 'success'" class="history-content">
                                    {{ item.generatedPrompt.substring(0, 100) }}...
                                </div>
                                <div v-else class="error-message">
                                    错误: {{ item.errorMessage }}
                                </div>
                            </n-thing>

                            <template #suffix>
                               <n-space vertical>
                                    <n-space v-if="item.status === 'success'">
                                        <n-button size="small" @click="copyHistoryItem(item)">复制</n-button>

                                        <n-button size="small" @click="rewriteRequirement(item)" >
                                            重写
                                        </n-button>
                                        <n-popconfirm @positive-click="deleteHistoryItem(item.id)">
                                            <template #trigger>
                                                <n-button size="small">
                                                    删除
                                                </n-button>
                                            </template>
                                            确定删除这条生成记录吗？
                                        </n-popconfirm>
                                    </n-space>
                                </n-space>
                            </template>
                        </n-list-item>
                    </n-list>

                    <n-empty v-if="history.length === 0" description="暂无生成历史" />

                    <!-- 分页组件 -->
                    <div v-if="history.length > 0" style="margin-top: 16px; display: flex; justify-content: center;">
                        <n-pagination v-model:page="currentPage" :page-count="totalPages" :page-size="pageSize"
                            show-size-picker :page-sizes="[3, 5, 10]" @update:page-size="handlePageSizeChange"
                            size="small" />
                    </div>
                </n-card>
            </div>
        </div>

        <!-- 保存提示词弹窗 -->
        <PromptEditModal v-model:show="showSaveModal" :prompt="promptToSave" :categories="categories"
            @saved="onPromptSaved" />
    </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue'
import {
    NList,
    NListItem,
    NCard,
    NForm,
    NFormItem,
    NInput,
    NButton,
    NIcon,
    NTag,
    NSpace,
    NThing,
    NSelect,
    NEmpty,
    NText,
    NSplit,
    NCheckbox,
    NPagination,
    useMessage,
    NPopconfirm
} from 'naive-ui'
import { History, Refresh, Check, AlertCircle, X, Robot, Plus, Bolt, DeviceFloppy, Star } from '@vicons/tabler'
import { api } from '~/lib/api'
import PromptEditModal from '~/components/prompt-management/PromptEditModal.vue'
import AIModelSelector from '~/components/common/AIModelSelector.vue'
import type { AIConfig, AIGenerationHistory } from '~/lib/db'
import { databaseService } from '~/lib/db'
import { useDatabase } from '~/composables/useDatabase'

const message = useMessage()
const { isDatabaseReady, waitForDatabase, safeDbOperation } = useDatabase()

// 事件定义
interface Emits {
    (e: 'navigate-to-ai-config'): void
    (e: 'prompt-generated', prompt: any): void
    (e: 'prompt-saved'): void
}

const emit = defineEmits<Emits>()

// 数据状态
const configs = ref<AIConfig[]>([])
const preferredConfig = ref<AIConfig | null>(null)
const history = ref<AIGenerationHistory[]>([])
const defaultConfig = ref<AIConfig | null>(null)
const currentModel = ref<string>('')
const currentConfigId = ref<string>('')
const modelSelectorRef = ref()
const selectedModelKey = ref<string>('') // 选中的模型key，格式为 "configId:model"
const generating = ref(false)
const loading = ref(true)
const showHistory = ref(false)
const showSaveModal = ref(false)
const promptToSave = ref<any>(null)
const categories = ref<any[]>([])
const splitSize = ref<number>(1) // 分隔大小，1表示全宽显示要求输入框
const generatedResult = ref<string>('') // 存储生成的结果
const autoSaveEnabled = ref<boolean>(true) // 立即保存开关

// 分页相关状态
const currentPage = ref<number>(1)
const pageSize = ref<number>(3)
const totalPages = computed(() => Math.ceil(history.value.length / pageSize.value))
const paginatedHistory = computed(() => {
    const start = (currentPage.value - 1) * pageSize.value
    const end = start + pageSize.value
    return history.value.slice(start, end)
})

// 流式传输状态
const streamStats = reactive({
    charCount: 0,
    isStreaming: false,
    lastCharCount: 0,  // 记录上次的字符数
    noContentUpdateCount: 0,  // 记录没有内容更新的次数
    lastUpdateTime: 0, // 记录最后一次更新的时间
    isGenerationActive: false, // 标记生成是否活跃
    contentGrowthRate: 0 // 内容增长速率（字符/秒）
})

// 生成控制状态
const generationControl = reactive({
    shouldStop: false, // 是否应该停止生成
    abortController: null as AbortController | null // 用于取消请求的控制器
})

// 表单数据
const formData = reactive({
    topic: ''
})

// 表单校验规则
const formRules = {
    topic: [
        { required: true, message: '请输入要求', trigger: 'blur' },
        { min: 1, message: '要求至少 1 个字符', trigger: 'blur' }
    ]
}

// 表单引用
const formRef = ref()

// 加载 AI 配置
const loadConfigs = async () => {
    loading.value = true
    await safeDbOperation(async () => {
        console.log('开始加载 AI 配置')
        const result = await databaseService.aiConfig.getEnabledAIConfigs()
        console.log('成功获取到启用的 AI 配置:', result)
        configs.value = result

        // 加载首选配置
        const preferred = await databaseService.aiConfig.getPreferredAIConfig()
        preferredConfig.value = preferred
        console.log('首选配置:', preferred?.name || '无')

        // 自动选择首选配置作为默认配置，如果没有首选则选择第一个启用的配置
        if (result && result.length > 0) {
            defaultConfig.value = preferred || result[0]
            
            // 设置默认选中的模型和配置
            const defaultModel = defaultConfig.value.defaultModel || ''
            if (defaultModel) {
                currentModel.value = defaultModel
                currentConfigId.value = defaultConfig.value.configId
                selectedModelKey.value = `${defaultConfig.value.configId}:${defaultModel}`
            }
            
            const configLabel = defaultConfig.value === preferred ? '首选配置' : '默认配置'
            console.log(`自动选择${configLabel}:`, defaultConfig.value.name)
        } else {
            defaultConfig.value = null
            preferredConfig.value = null
            currentModel.value = ''
            currentConfigId.value = ''
            selectedModelKey.value = ''
            console.log('没有找到启用的 AI 配置')
        }
    })
    loading.value = false
}

// 导航到AI 配置页面
const navigateToAIConfig = () => {
    emit('navigate-to-ai-config')
}

// 加载历史记录
const loadHistory = async () => {
    try {
        const result = await api.aiGenerationHistory.getPaginated.query({ limit: 100 }) // 增加总数量限制
        history.value = result.data
        // 重置到第一页
        currentPage.value = 1
    } catch (error) {
        message.error('加载历史记录失败: ' + (error as Error).message)
    }
}

// 处理分页大小变化
const handlePageSizeChange = (newPageSize: number) => {
    pageSize.value = newPageSize
    currentPage.value = 1 // 重置到第一页
}

// 切换历史记录显示
const toggleHistory = () => {
    showHistory.value = !showHistory.value
    if (showHistory.value) {
        loadHistory()
    }
}

// 模型选择处理 - 更新为使用AIModelSelector的事件
const onModelSelect = (config: AIConfig | null) => {
    if (!config) return
    
    // 更新当前使用的配置
    currentConfigId.value = config.configId
    currentModel.value = config.defaultModel || ''
    
    console.log('切换到配置:', config.name, '模型:', currentModel.value)
}

// 停止生成
const stopGeneration = async () => {
    console.log('用户请求停止生成')
    
    try {
        // 调用后端API停止生成
        const result = await window.electronAPI.ai.stopGeneration()
        console.log('后端停止生成结果:', result)
        
        // 设置前端停止标志
        generating.value = false
        generationControl.shouldStop = true
        
        // 如果有 AbortController，则取消请求
        if (generationControl.abortController) {
            generationControl.abortController.abort()
            generationControl.abortController = null
        }
        
        // 重置所有状态
        streamStats.isStreaming = false
        streamStats.charCount = 0
        streamStats.lastCharCount = 0
        streamStats.noContentUpdateCount = 0
        streamStats.lastUpdateTime = 0
        streamStats.isGenerationActive = false
        streamStats.contentGrowthRate = 0
        
        // 恢复布局
        animateSplit(splitSize.value, 1)
        
        message.info('已停止生成')
    } catch (error) {
        console.error('停止生成失败:', error)
        // 即使API调用失败，也要重置前端状态
        generating.value = false
        generationControl.shouldStop = true
        animateSplit(splitSize.value, 1)
        message.warning('停止生成时出现错误，但已重置界面状态')
    }
}

// 手动保存提示词
const manualSavePrompt = async () => {
    if (!generatedResult.value.trim()) {
        message.warning('没有内容可以保存')
        return
    }

    try {
        const promptData = {
            title: `AI生成: ${formData.topic || '提示词生成'}`,
            content: generatedResult.value,
            description: ``,
            tags: ['AI生成', '手动保存'],
            categoryId: null,
            isFavorite: false,
            useCount: 0
        }

        await api.prompts.create.mutate(promptData)
        message.success('提示词已保存')
        emit('prompt-saved')
    } catch (error) {
        console.error('保存提示词失败:', error)
        message.error('保存提示词失败: ' + (error as Error).message)
    }
}

// 生成提示词
const generatePrompt = async () => {
    try {
        await formRef.value?.validate()
        generating.value = true
        
        // 重置生成控制状态
        generationControl.shouldStop = false
        generationControl.abortController = new AbortController()
        
        // 重置流式传输状态
        streamStats.charCount = 0
        streamStats.isStreaming = true
        streamStats.lastCharCount = 0
        streamStats.noContentUpdateCount = 0
        streamStats.lastUpdateTime = Date.now()
        streamStats.isGenerationActive = true
        streamStats.contentGrowthRate = 0
        generatedResult.value = '' // 清空之前的结果

        // 立即开始分隔动画，让用户看到右侧面板
        animateSplit(1, 0.5)

        // 获取当前选中的配置 - 使用AIModelSelector组件
        const selectedConfig = modelSelectorRef.value?.selectedConfig
        const selectedModel = modelSelectorRef.value?.selectedModel

        if (!selectedConfig) {
            throw new Error('没有可用的 AI 配置')
        }

        if (!selectedModel) {
            throw new Error('请选择一个模型')
        }

        const request = {
            configId: selectedConfig.configId,
            model: selectedModel,
            topic: formData.topic
        }

        // 序列化配置对象以确保可以通过 IPC 传递
        const serializedConfig = serializeConfig(selectedConfig)    // 检查是否支持流式传输
        let result
        if (window.electronAPI.ai.generatePromptStream) {
            console.log('使用流式传输模式')      // 使用流式传输
            result = await window.electronAPI.ai.generatePromptStream(
                request,
                serializedConfig,
                (charCount: number, partialContent?: string) => {
                    // 检查是否应该停止
                    if (generationControl.shouldStop) {
                        console.log('检测到停止信号，中断流式传输')
                        return false // 返回 false 表示停止流式传输
                    }
                    
                    const now = Date.now();
                    console.log('流式传输回调:', {
                        charCount,
                        hasContent: !!partialContent,
                        contentLength: partialContent?.length || 0,
                        contentPreview: partialContent?.substring(0, 50) || 'null',
                        contentType: typeof partialContent,
                        isEmptyString: partialContent === '',
                        isNull: partialContent === null,
                        isUndefined: partialContent === undefined,
                        timeSinceLastUpdate: now - streamStats.lastUpdateTime
                    });

                    // 更新时间统计
                    const prevCharCount = streamStats.charCount;
                    const prevUpdateTime = streamStats.lastUpdateTime;
                    streamStats.charCount = charCount;
                    streamStats.lastUpdateTime = now;
                    
                    // 计算内容增长速率
                    if (prevUpdateTime > 0 && charCount > prevCharCount) {
                        const timeDiff = (now - prevUpdateTime) / 1000; // 转换为秒
                        const charDiff = charCount - prevCharCount;
                        streamStats.contentGrowthRate = timeDiff > 0 ? charDiff / timeDiff : 0;
                    }

                    // 检测是否有真实内容
                    const hasRealContent = typeof partialContent === 'string' && partialContent.length > 0;
                    
                    // 判断生成是否活跃
                    const isActiveGeneration = hasRealContent || 
                        (charCount > prevCharCount && (now - prevUpdateTime) < 2000); // 2秒内有字符增长认为是活跃的
                    
                    streamStats.isGenerationActive = isActiveGeneration;

                    if (hasRealContent) {
                        // 有真实内容时直接显示
                        generatedResult.value = partialContent;
                        streamStats.noContentUpdateCount = 0; // 重置计数器
                        console.log('✅ 内容已更新，当前长度:', partialContent.length, '增长速率:', streamStats.contentGrowthRate.toFixed(2), '字符/秒');
                    } else {
                        // 没有内容时的处理
                        streamStats.noContentUpdateCount++;
                        
                        if (charCount > prevCharCount) {
                            // 字符数在增长，说明正在生成
                            const timeSinceUpdate = now - prevUpdateTime;
                            
                            if (streamStats.noContentUpdateCount > 15 && timeSinceUpdate > 3000) {
                                // 很久没有内容更新，但字符还在增长，可能有问题
                                console.warn('⚠️ 检测到可能的流式传输问题：字符数持续增长但长时间没有内容传递');
                                const warningText = `生成中，请稍候... (已生成 ${charCount} 字符，正在等待内容传输完成)`;
                                if (!generatedResult.value || generatedResult.value.includes('生成中') || generatedResult.value.includes('正在生成中')) {
                                    generatedResult.value = warningText;
                                    console.log('⚠️ 显示长时间等待提示:', warningText);
                                }
                            } else if (streamStats.noContentUpdateCount > 5) {
                                // 中等时间没有内容，但字符在增长
                                const estimatedTimeRemaining = streamStats.contentGrowthRate > 0 ? 
                                    Math.ceil((charCount * 0.1) / streamStats.contentGrowthRate) : '未知';
                                const statusText = `正在生成中... (已生成 ${charCount} 字符，预计还需 ${estimatedTimeRemaining} 秒)`;
                                if (!generatedResult.value || generatedResult.value.includes('生成中') || generatedResult.value.includes('正在生成中')) {
                                    generatedResult.value = statusText;
                                    console.log('📝 显示进度预估:', statusText);
                                }
                            } else {
                                // 正常的初期占位符
                                const placeholderText = `正在生成中... (已生成 ${charCount} 字符)`;
                                if (!generatedResult.value || generatedResult.value.includes('正在生成中')) {
                                    generatedResult.value = placeholderText;
                                    console.log('📝 显示基础占位符:', placeholderText);
                                }
                            }
                        } else {
                            // 字符数没有增长，可能生成已完成或出现问题
                            if (charCount > 0) {
                                console.log('🔄 字符数未增长，但已有内容，可能生成完成');
                            }
                        }
                    }
                }
            );
            console.log('流式传输完成，最终结果:', {
                success: !!result,
                contentLength: result?.generatedPrompt?.length || 0
            });

            // 如果流式传输过程中没有获得内容，但最终结果有内容，则立即显示
            if (result && result.generatedPrompt &&
                (!generatedResult.value || generatedResult.value.startsWith('正在生成中...'))) {
                console.log('🔧 流式传输未提供内容，使用最终结果');
                generatedResult.value = result.generatedPrompt;

                // 模拟一个快速的显示过程，让用户看到内容"出现"
                await new Promise(resolve => setTimeout(resolve, 300));
            }

        } else {
            console.log('使用普通生成模式')
            // 使用普通生成
            result = await window.electronAPI.ai.generatePrompt(request, serializedConfig)
            // 模拟字数增长和内容显示
            await simulateStreamProgress(result.generatedPrompt)
        }
        // 确保最终结果正确显示
        generatedResult.value = result.generatedPrompt

        // 让用户看到完整结果几秒钟
        await new Promise(resolve => setTimeout(resolve, 2000))
        // 保存到历史记录
        await api.aiGenerationHistory.create.mutate({
            historyId: result.id,
            configId: result.configId,
            topic: result.topic,
            generatedPrompt: result.generatedPrompt,
            model: result.model,
            status: 'success'
        })

        // 根据自动保存开关决定是否立即保存
        if (autoSaveEnabled.value) {
            await saveGeneratedPrompt(result)
            message.success('提示词生成并保存成功')
            emit('prompt-saved')
        } else {
            message.success('提示词生成成功，您可以编辑后手动保存')
        }

        // 清空输入框，但保持结果显示
        formData.topic = ''
        // 刷新历史记录
        if (showHistory.value) {
            loadHistory()
        }

        // 保持分隔状态，让用户继续查看结果
        // 用户可以通过手动调整分隔条来改变布局

    } catch (error) {
        console.error('生成失败:', error)
        
        // 检查是否是用户中断错误
        if (error instanceof Error && 
            (error.message?.includes('中断生成') || 
             error.message?.includes('用户中断') || 
             generationControl.shouldStop)) {
            console.log('用户主动中断生成，不显示错误消息')
            // 用户主动中断，不显示错误消息，只是清理状态
            generatedResult.value = ''
            await animateSplit(splitSize.value, 1)
            return
        }
        
        // 真正的错误才显示错误消息
        message.error('生成失败: ' + (error as Error).message)

        // 失败时恢复分隔为1，清空结果
        await animateSplit(splitSize.value, 1)
        generatedResult.value = ''

        // 保存错误记录
        try {
            const selectedConfig = modelSelectorRef.value?.selectedConfig
            const selectedModel = modelSelectorRef.value?.selectedModel
            await api.aiGenerationHistory.create.mutate({
                historyId: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                configId: selectedConfig?.configId || 'unknown',
                topic: formData.topic,
                generatedPrompt: '', 
                model: selectedModel || 'unknown',
                status: 'error',
                errorMessage: (error as Error).message
            })
            if (showHistory.value) {
                loadHistory()
            }
        } catch (saveError) {
            console.error('保存错误记录失败:', saveError)
        }
    } finally {
        generating.value = false
        
        // 清理生成控制状态
        generationControl.shouldStop = false
        if (generationControl.abortController) {
            generationControl.abortController = null
        }
        
        // 清理流式传输状态
        streamStats.isStreaming = false
        streamStats.charCount = 0
        streamStats.lastCharCount = 0
        streamStats.noContentUpdateCount = 0
        streamStats.lastUpdateTime = 0
        streamStats.isGenerationActive = false
        streamStats.contentGrowthRate = 0
    }
}

// 模拟流式进度（在不支持真正流式传输时使用）
const simulateStreamProgress = async (finalContent: string) => {
    const totalChars = finalContent.length
    const steps = Math.min(50, totalChars) // 最多50步，或者按字符数
    const stepSize = Math.ceil(totalChars / steps)

    console.log('开始模拟流式进度:', { totalChars, steps, stepSize })

    for (let i = 0; i < steps; i++) {
        // 检查是否应该停止
        if (!generating.value || generationControl.shouldStop) {
            console.log('生成已取消，停止模拟')
            break
        }

        const currentCharCount = Math.min((i + 1) * stepSize, totalChars)
        streamStats.charCount = currentCharCount

        // 模拟渐进显示内容
        const partialContent = finalContent.substring(0, currentCharCount)
        generatedResult.value = partialContent

        console.log(`模拟进度 ${i + 1}/${steps}:`, {
            currentCharCount,
            contentLength: partialContent.length,
            preview: partialContent.substring(0, 30) + '...'
        })

        // 动态调整延迟 - 开始快一些，后面慢一些
        const delay = i < steps / 2 ? 50 : 150
        await new Promise(resolve => setTimeout(resolve, delay))
    }

    // 确保显示完整内容
    streamStats.charCount = totalChars
    generatedResult.value = finalContent
    console.log('模拟流式进度完成，最终内容长度:', finalContent.length)
}

// 直接保存生成的提示词
const saveGeneratedPrompt = async (result: any) => {
    try {
        const promptData = {
            title: `AI生成: ${result.topic}`,
            content: result.generatedPrompt,
            description: ``,
            tags: ['AI生成', '自动保存'],
            categoryId: null, // 可以根据需要设置默认分类
            isFavorite: false,
            useCount: 0
        }

        await api.prompts.create.mutate(promptData)
    } catch (error) {
        console.error('保存提示词失败:', error)
        throw new Error('保存提示词失败: ' + (error as Error).message)
    }
}

// 复制历史项
const copyHistoryItem = async (item: AIGenerationHistory) => {
    try {
        await navigator.clipboard.writeText(item.generatedPrompt)
        message.success('已复制到剪贴板')
    } catch (error) {
        message.error('复制失败')
    }
}
//重写历史要求
const rewriteRequirement = (item: AIGenerationHistory) => {
    //将之前的要求写入表单
    formData.topic = item.topic || ''
    //清空之前生成的prompt
    generatedResult.value = ''
    message.success('要求已填充到输入框，请修改后重新生成')
    setTimeout(() => {
        const input = document.querySelector('.ai-generator .n-input textarea')
        if (input) {
            input.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }
    }, 100)
}

const deleteHistoryItem = async (id: string) => {
    try {
        const result = await api.aiGenerationHistory.delete.mutate(Number(id));
        console.log('删除结果:', result); // 添加日志输出
        message.success('删除成功');
        loadHistory(); // 刷新历史记录
    } catch (error) {
        console.error('删除失败详情:', error); // 打印详细错误
        message.error('删除失败: ' + (error as Error).message);
    }
};
// 分隔动画函数
const animateSplit = async (from: number, to: number) => {
    const duration = 600 // 动画持续时间
    const steps = 20
    const stepDuration = duration / steps
    const stepSize = (to - from) / steps

    for (let i = 0; i <= steps; i++) {
        splitSize.value = Number((from + stepSize * i).toFixed(3)) // 保持3位小数精度
        await new Promise(resolve => setTimeout(resolve, stepDuration))
    }

    splitSize.value = to
}

// 获取显示的模型名称
const getDisplayModelName = () => {
    if (!currentModel.value) {
        return '选择模型'
    }

    const selectedConfig = configs.value.find(c => c.configId === currentConfigId.value)
    if (selectedConfig) {
        const prefix = selectedConfig.isPreferred ? '★ ' : ''
        return `${prefix}${currentModel.value} (${selectedConfig.name})`
    }

    return currentModel.value || '选择模型'
}

// 获取配置名称
const getConfigName = (configId: string) => {
    const config = configs.value.find(c => c.configId === configId)
    if (!config) return '未知配置'
    
    const prefix = config.isPreferred ? '★ ' : ''
    return `${prefix}${config.name}`
}

// 获取配置名称（不带星标，用于图标显示）
const getConfigNameOnly = (configId: string) => {
    const config = configs.value.find(c => c.configId === configId)
    return config ? config.name : '未知配置'
}

// 检查配置是否为首选
const isConfigPreferred = (configId: string) => {
    const config = configs.value.find(c => c.configId === configId)
    return config?.isPreferred || false
}

// 格式化日期
const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleString('zh-CN')
}

// 序列化配置对象以确保可以通过 IPC 传递
const serializeConfig = (config: AIConfig) => {
    const serialized = {
        id: config.id,
        configId: config.configId,
        name: config.name,
        type: config.type,
        baseURL: config.baseURL,
        apiKey: config.apiKey,
        secretKey: config.secretKey,
        models: [...(config.models || [])],
        defaultModel: config.defaultModel,
        customModel: config.customModel,
        enabled: config.enabled,
        systemPrompt: config.systemPrompt, // 添加自定义系统提示词
        createdAt: config.createdAt instanceof Date ? config.createdAt.toISOString() : config.createdAt,
        updatedAt: config.updatedAt instanceof Date ? config.updatedAt.toISOString() : config.updatedAt
    }
    
    console.log('前端序列化配置 - 原始 systemPrompt:', config.systemPrompt);
    console.log('前端序列化配置 - 序列化后 systemPrompt:', serialized.systemPrompt);
    
    return serialized;
}

// 获取生成状态文本
const getGenerationStatusText = () => {
    if (!generating.value) {
        return ''
    }
    
    if (streamStats.isStreaming && streamStats.charCount > 0) {
        if (streamStats.isGenerationActive && streamStats.contentGrowthRate > 0) {
            // 显示生成速率
            return `正在生成... 已生成 ${streamStats.charCount} 字符 (${streamStats.contentGrowthRate.toFixed(1)} 字符/秒)`
        } else if (streamStats.charCount > 0) {
            // 显示已生成字符数
            return `正在生成... 已生成 ${streamStats.charCount} 字符`
        }
    }
    
    return '正在生成...'
}

// 提示词保存完成（保留此函数以防Modal组件需要）
const onPromptSaved = () => {
    message.success('提示词已保存')
    showSaveModal.value = false
    promptToSave.value = null
}

// 组件挂载时加载数据
onMounted(async () => {
    await waitForDatabase()
    loadConfigs()
    loadCategories()
    // 不再自动加载历史记录，只在用户点击时加载
})

// 加载分类数据
const loadCategories = async () => {
    try {
        console.log('开始加载分类数据')
        const result = await api.categories.getAll.query()
        console.log('成功获取到分类数据:', result)
        categories.value = result
    } catch (error) {
        console.error('加载分类数据失败:', error)
        message.error('加载分类数据失败: ' + (error as Error).message)
        categories.value = []
    }
}
</script>

<style scoped>
/* 尽可能采用 NaiveUI 默认组件 */

.ai-generator-layout {
    display: flex;
    flex-direction: column;
    height: 100%;
}

.main-content {
    flex: none;
    width: 100%;
}

.history-section {
    flex: none;
    width: 100%;
}

.generator-card,
.history-card {
    height: fit-content;
}

.history-content {
    font-size: 12px;
    color: var(--text-color-3);
    line-height: 1.4;
    word-break: break-word;
}

.error-message {
    font-size: 12px;
    color: var(--error-color);
    line-height: 1.4;
}

.generation-status-bar {
    background-color: var(--primary-color-suppl);
    border: 1px solid var(--primary-color);
    border-radius: 6px;
    padding: 8px 12px;
    font-size: 13px;
}

.rotating {
    animation: rotate 2s linear infinite;
}

@keyframes rotate {
    from {
        transform: rotate(0deg);
    }
    to {
        transform: rotate(360deg);
    }
}

.generation-status-bar {
    background: var(--info-color-suppl);
    border: 1px solid var(--info-color);
    border-radius: 6px;
    padding: 8px 12px;
    margin-bottom: 16px;
    font-size: 14px;
}

.rotating {
    animation: rotate 2s linear infinite;
}

@keyframes rotate {
    from {
        transform: rotate(0deg);
    }
    to {
        transform: rotate(360deg);
    }
}
</style>
