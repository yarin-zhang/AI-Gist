<template>
    <div class="ai-generator">
        <div v-if="loading" class="generator-state-shell">
            <NSpin size="medium" />
        </div>

        <div v-else-if="configs.length === 0" class="generator-state-shell">
            <NEmpty :description="t('aiGenerator.noConfigAvailable')" size="large">
                <template #icon>
                    <NIcon size="40" color="var(--content-tertiary)"><Robot /></NIcon>
                </template>
                <template #extra>
                    <div class="generator-empty-actions">
                        <NText depth="3">{{ t('aiGenerator.addConfigFirst') }}</NText>
                        <NButton type="primary" @click="navigateToAIConfig">
                            <template #icon><NIcon size="16"><Plus /></NIcon></template>
                            {{ t('aiGenerator.addAIConfig') }}
                        </NButton>
                    </div>
                </template>
            </NEmpty>
        </div>

        <NForm v-else ref="formRef" :model="formData" :rules="formRules" label-placement="top"
            class="generator-workspace-form">
            <div class="generator-workspace-grid">
                <NCard size="small" class="generator-panel requirement-panel">
                    <template #header>
                        <div class="panel-heading">
                            <NText strong>{{ t('aiGenerator.requirement') }}</NText>
                            <NText depth="3" class="panel-description">{{ t('aiGenerator.requirementHint') }}</NText>
                        </div>
                    </template>

                    <NFormItem path="topic" :show-label="false" :show-feedback="false"
                        class="requirement-form-item">
                        <NInput v-model:value="formData.topic" type="textarea"
                            :placeholder="t('aiGenerator.requirementPlaceholder')" class="workspace-textarea"
                            :readonly="generating" />
                    </NFormItem>

                    <div class="generator-control-panel">
                        <AIModelSelector ref="modelSelectorRef" v-model:modelKey="selectedModelKey"
                            :placeholder="t('aiGenerator.selectModel')" :disabled="generating"
                            class="generator-model-selector" @configChange="onModelSelect" />
                        <div class="generator-action-row">
                            <NTooltip trigger="hover">
                                <template #trigger>
                                    <NCheckbox v-model:checked="autoSaveEnabled" :disabled="generating">
                                        {{ t('aiGenerator.autoSave') }}
                                    </NCheckbox>
                                </template>
                                {{ t('aiGenerator.autoSaveHint') }}
                            </NTooltip>
                            <NFlex justify="end" align="center" size="small">
                                <NButton v-if="generating" type="error" secondary @click="stopGeneration">
                                    <template #icon><NIcon size="16"><X /></NIcon></template>
                                    {{ t('aiGenerator.stop') }}
                                </NButton>
                                <NButton type="primary" :loading="generating"
                                    :disabled="configs.length === 0 || generating" @click="generatePrompt">
                                    <template #icon><NIcon size="16"><Bolt /></NIcon></template>
                                    {{ t('aiGenerator.generate') }}
                                </NButton>
                            </NFlex>
                        </div>
                    </div>
                </NCard>

                <NCard size="small" class="generator-panel result-panel">
                    <template #header>
                        <div class="result-panel-header">
                            <div class="panel-heading">
                                <NText strong>
                                    {{ showHistory ? t('aiGenerator.generationHistory') : t('aiGenerator.result') }}
                                </NText>
                                <NText v-if="!showHistory" depth="3" class="panel-description">
                                    {{ t('aiGenerator.resultHint') }}
                                </NText>
                            </div>
                            <NFlex align="center" size="small">
                                <NTag v-if="generating && !showHistory" size="small" type="info">
                                    {{ getGenerationStatusText() }}
                                </NTag>
                                <NButton v-if="showHistory" size="small" secondary @click="loadHistory">
                                    <template #icon><NIcon size="16"><Refresh /></NIcon></template>
                                    {{ t('common.refresh') }}
                                </NButton>
                                <NButton size="small" secondary @click="toggleHistory">
                                    <template #icon>
                                        <NIcon size="16"><X v-if="showHistory" /><History v-else /></NIcon>
                                    </template>
                                    {{ showHistory ? t('common.close') : t('aiGenerator.history') }}
                                </NButton>
                            </NFlex>
                        </div>
                    </template>

                    <template v-if="showHistory">
                        <NScrollbar class="history-scroll">
                            <NList v-if="history.length > 0" class="history-list">
                                <NListItem v-for="item in paginatedHistory" :key="item.id">
                                    <template #prefix>
                                        <NIcon size="16"
                                            :color="item.status === 'success' ? 'var(--accent-success)' : 'var(--accent-error)'">
                                            <Check v-if="item.status === 'success'" />
                                            <AlertCircle v-else />
                                        </NIcon>
                                    </template>
                                    <NThing>
                                        <template #header>{{ item.topic }}</template>
                                        <template #description>
                                            <div class="history-meta">
                                                <span class="history-config">
                                                    <NIcon v-if="isConfigPreferred(item.configId)" size="14"
                                                        color="var(--accent-warning)"><Star /></NIcon>
                                                    {{ getConfigNameOnly(item.configId) }}
                                                </span>
                                                <span>{{ item.model }}</span>
                                                <span>{{ formatDate(item.createdAt) }}</span>
                                            </div>
                                        </template>
                                        <div v-if="item.status === 'success'" class="history-content">
                                            {{ item.generatedPrompt.substring(0, 100) }}...
                                        </div>
                                        <div v-else class="error-message">
                                            {{ t('aiGenerator.error') }}: {{ item.errorMessage }}
                                        </div>
                                    </NThing>
                                    <template #suffix>
                                        <NFlex v-if="item.status === 'success'" size="small">
                                            <NButton size="tiny" @click="copyHistoryItem(item)">{{ t('common.copy') }}</NButton>
                                            <NButton size="tiny" @click="rewriteRequirement(item)">{{ t('aiGenerator.rewrite') }}</NButton>
                                            <NPopconfirm @positive-click="deleteHistoryItem(item.id?.toString() || '')">
                                                <template #trigger>
                                                    <NButton size="tiny" type="error" tertiary>{{ t('common.delete') }}</NButton>
                                                </template>
                                                {{ t('aiGenerator.confirmDeleteHistory') }}
                                            </NPopconfirm>
                                        </NFlex>
                                    </template>
                                </NListItem>
                            </NList>
                            <div v-else class="history-empty">
                                <NEmpty :description="t('aiGenerator.noHistory')" size="small" />
                            </div>
                        </NScrollbar>
                        <div v-if="history.length > 0" class="history-pagination">
                            <NPagination v-model:page="currentPage" :page-count="totalPages" :page-size="pageSize"
                                show-size-picker :page-sizes="[3, 5, 10]" size="small"
                                @update:page-size="handlePageSizeChange" />
                        </div>
                    </template>

                    <div v-else class="result-content">
                        <NInput v-model:value="generatedResult" type="textarea" readonly show-count
                            :placeholder="t('aiGenerator.resultPlaceholder')"
                            class="workspace-textarea result-textarea" />
                    </div>
                </NCard>
            </div>
        </NForm>
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
    NThing,
    NEmpty,
    NText,
    NCheckbox,
    NPagination,
    useMessage,
    NPopconfirm,
    NScrollbar,
    NSpin,
    NFlex,
    NTooltip,
} from 'naive-ui'
import { History, Refresh, Check, AlertCircle, X, Robot, Plus, Bolt, Star } from '@vicons/tabler'
import { api } from '~/lib/api'
import AIModelSelector from '~/components/common/AIModelSelector.vue'
import type { AIConfig, AIGenerationHistory } from '~/lib/db'
import { databaseService } from '~/lib/db'
import { useDatabase } from '~/composables/useDatabase'
import { useI18n } from 'vue-i18n'

const message = useMessage()
const { waitForDatabase, safeDbOperation } = useDatabase()
const { t } = useI18n()

const props = withDefaults(defineProps<{
    defaultAutoSave?: boolean
}>(), {
    defaultAutoSave: true,
})

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
const generatedResult = ref<string>('') // 存储生成的结果
const autoSaveEnabled = ref<boolean>(props.defaultAutoSave) // 立即保存开关

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
                // 确保模型名称包含冒号时也能正确处理
                selectedModelKey.value = `${defaultConfig.value.configId}:${defaultModel}`
                console.log('设置默认模型 key:', selectedModelKey.value)
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
    // 从 selectedModelKey 中正确解析模型名称
    if (selectedModelKey.value) {
        const firstColonIndex = selectedModelKey.value.indexOf(':')
        if (firstColonIndex !== -1) {
            currentModel.value = selectedModelKey.value.substring(firstColonIndex + 1)
        } else {
            currentModel.value = config.defaultModel || ''
        }
    } else {
        currentModel.value = config.defaultModel || ''
    }
    
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
        
        message.info('已停止生成')
    } catch (error) {
        console.error('停止生成失败:', error)
        // 即使API调用失败，也要重置前端状态
        generating.value = false
        generationControl.shouldStop = true
        message.warning('停止生成时出现错误，但已重置界面状态')
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

        // 获取当前选中的配置 - 使用AIModelSelector组件
        const selectedConfig = modelSelectorRef.value?.selectedConfig
        const selectedModel = modelSelectorRef.value?.selectedModel

        console.log('🔍 生成请求调试信息:', {
            selectedConfig: selectedConfig ? {
                configId: selectedConfig.configId,
                name: selectedConfig.name,
                type: selectedConfig.type,
                defaultModel: selectedConfig.defaultModel,
                customModel: selectedConfig.customModel,
                models: selectedConfig.models
            } : null,
            selectedModel,
            modelSelectorRef: !!modelSelectorRef.value
        })

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
                    
                    return true; // 继续生成
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
            status: 'success',
            uuid: `history_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        })

        // 根据自动保存开关决定是否立即保存
        if (autoSaveEnabled.value) {
            await saveGeneratedPrompt(result)
            message.success('提示词生成并保存成功')
            emit('prompt-saved')
        } else {
            message.success('提示词生成成功，您可以编辑后手动保存')
            emit('prompt-generated', {
                topic: result.topic || request.topic,
                title: `AI生成: ${result.topic || request.topic || '提示词生成'}`,
                content: result.generatedPrompt,
                generatedPrompt: result.generatedPrompt,
                tags: ['AI生成']
            })
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
            return
        }
        
        // 真正的错误才显示错误消息
        message.error('生成失败: ' + (error as Error).message)

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
                errorMessage: (error as Error).message,
                uuid: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
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
            categoryId: undefined, // 可以根据需要设置默认分类
            isFavorite: false,
            useCount: 0,
            uuid: `prompt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            isActive: true
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
    } as unknown as AIConfig
    
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

// 组件挂载时加载数据
onMounted(async () => {
    await waitForDatabase()
    loadConfigs()
    // 不再自动加载历史记录，只在用户点击时加载
})


</script>

<style scoped>
.ai-generator { width: 100%; height: 100%; min-height: 0; }
.generator-state-shell { box-sizing: border-box; width: 100%; height: 100%; min-height: 0; display: grid; place-items: center; padding: var(--content-padding); border: 1px solid var(--border-default); border-radius: var(--radius-panel); background: var(--surface-primary); }
.generator-empty-actions { max-width: 460px; display: flex; flex-direction: column; align-items: center; gap: var(--section-gap); text-align: center; }
.generator-workspace-form { width: 100%; height: 100%; min-height: 0; }
.generator-workspace-grid { width: 100%; height: 100%; min-height: 0; display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(320px, 0.85fr); gap: var(--section-gap); }
.generator-panel { height: 100%; min-height: 0; display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--border-default); border-radius: var(--radius-panel); background: var(--surface-primary); box-shadow: none; }
.generator-panel :deep(> .n-card-header) { min-height: 64px; flex: 0 0 auto; padding: 10px var(--content-padding); border-bottom: 1px solid var(--border-default); background: var(--surface-secondary); }
.generator-panel :deep(> .n-card-header .n-card-header__main) { min-width: 0; }
.generator-panel :deep(> .n-card-content) { flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; padding: var(--content-padding); }
.panel-heading { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.panel-heading > :first-child { font-size: var(--font-size-base); font-weight: var(--font-weight-semibold); }
.panel-description { display: block; font-size: var(--font-size-xs); line-height: 1.45; }
.result-panel-header { width: 100%; min-width: 0; display: flex; align-items: center; justify-content: space-between; gap: var(--section-gap); }
.requirement-form-item { flex: 1 1 0; height: 0; min-height: 220px; }
.requirement-form-item :deep(.n-form-item-blank) { height: 100%; min-height: 0; }
.workspace-textarea { width: 100%; height: 100%; min-height: 0; }
.workspace-textarea :deep(.n-input-wrapper),
.workspace-textarea :deep(.n-input__textarea),
.workspace-textarea :deep(.n-input__textarea-el) { height: 100%; min-height: 0; }
.workspace-textarea :deep(.n-input__textarea-el) { resize: none; }
.generator-control-panel { flex: 0 0 auto; display: flex; flex-direction: column; gap: var(--compact-padding); margin-top: var(--section-gap); padding-top: var(--section-gap); border-top: 1px solid var(--border-default); }
.generator-model-selector { width: 100%; min-width: 0; }
.generator-action-row { display: flex; align-items: center; justify-content: space-between; gap: var(--section-gap); }
.result-content { flex: 1 1 0; height: 0; min-height: 0; }
.result-textarea :deep(.n-input-wrapper) { background: var(--surface-secondary); }
.history-scroll { flex: 1 1 0; height: 0; min-height: 0; }
:deep(.history-scroll .n-scrollbar-content) { min-height: 100%; display: flex; flex-direction: column; }
.history-list { background: transparent; }
.history-list :deep(.n-list-item) { padding: var(--compact-padding) 0; }
.history-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 10px; color: var(--content-tertiary); font-size: var(--font-size-xs); }
.history-config { display: inline-flex; align-items: center; gap: 4px; }
.history-content { margin-top: 6px; color: var(--content-secondary); font-size: var(--font-size-xs); line-height: 1.5; word-break: break-word; }
.error-message { margin-top: 6px; color: var(--error-color); font-size: var(--font-size-xs); line-height: 1.5; }
.history-empty { flex: 1 1 0; min-height: 100%; display: grid; place-items: center; }
.history-pagination { flex: 0 0 auto; display: flex; justify-content: center; margin-top: var(--compact-padding); padding-top: var(--compact-padding); border-top: 1px solid var(--border-default); }

@media (max-width: 760px) {
    .generator-workspace-form { overflow: auto; }
    .generator-workspace-grid { height: auto; grid-template-columns: 1fr; }
    .generator-panel { min-height: 480px; }
    .result-panel-header, .generator-action-row { align-items: flex-start; flex-direction: column; }
    .generator-action-row > :last-child { width: 100%; justify-content: flex-end; }
}
</style>
