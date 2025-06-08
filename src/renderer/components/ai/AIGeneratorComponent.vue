<template>
  <div class="ai-generator">    <!-- 没有AI 配置时显示的空状态 -->
    <n-empty v-if="configs.length === 0 && !loading" 
             description="暂无可用的 AI 配置" 
             size="large"
             style="margin: 40px 0;">
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
              <n-icon><Plus /></n-icon>
            </template>
            添加 AI 配置
          </n-button>
        </n-space>
      </template>
    </n-empty>

    <!-- 有AI 配置时显示的生成工具 -->
    <n-card v-if="configs.length > 0" title="AI 提示词生成器" class="generator-card">
      <n-form
        ref="formRef"
        :model="formData"
        :rules="formRules"
        label-placement="top"
      >
      <n-form-item label="要求" path="topic">
          <n-split
            v-model:size="splitSize"
            direction="horizontal"
            :min="0.3"
            :max="1"
            :default-size="1"
            :disabled="!generating && !generatedResult"
            :style="{ height: '120px', width: '100%' }"
          >
            <template #1>
              <n-input 
                v-model:value="formData.topic" 
                type="textarea"
                :rows="4"
                placeholder="描述你想要生成的提示词，例如：写作助手、代码审查、翻译工具等"
                :style="{ height: '100%' }"
              />
            </template>
            <template #2>
              <n-input
                v-model:value="generatedResult"
                type="textarea"
                :rows="4"
                placeholder="生成的提示词将在这里显示..."
                readonly
                :style="{ 
                  height: '100%',
                  backgroundColor: 'var(--code-color)',
                  opacity: generatedResult ? 1 : 0.7
                }"
              />
            </template>
          </n-split>
        </n-form-item>
        
        <n-form-item>
          <n-space justify="space-between" >
            <n-space>
                <n-button 
                type="primary" 
                @click="generatePrompt" 
                :loading="generating"
                :disabled="configs.length === 0"
                size="large"
              >
                {{ generating ? '生成中...' : '确定' }}
              </n-button>
                <n-dropdown 
                :options="modelDropdownOptions" 
                @select="onModelSelect"
                trigger="click"
                v-if="configs.length > 0"
              >
                <n-button size="large" quaternary>
                  {{ getDisplayModelName() }}
                  <template #icon>
                    <n-icon><ChevronDown /></n-icon>
                  </template>
                </n-button>
              </n-dropdown>
            </n-space>
              <n-space align="center">
              <!-- 生成进度提示 -->
              <div v-if="generating && streamStats.charCount > 0" class="progress-indicator">
                <n-text type="info" strong>
                  <n-icon size="16" style="margin-right: 4px;">
                    <History />
                  </n-icon>
                  已生成 {{ streamStats.charCount }} 字符
                </n-text>
              </div>
              
              <n-button 
                @click="toggleHistory" 
                quaternary
                size="large"
              >
                <template #icon>
                  <n-icon><History /></n-icon>
                </template>
                历史记录
              </n-button>
            </n-space>
          </n-space>
        </n-form-item>
      </n-form>
    </n-card>    <!-- 历史记录（可切换显示） -->
    <n-card v-if="showHistory && configs.length > 0" title="生成历史" class="history-card">
      <template #header-extra>
        <n-space>
          <n-button size="small" @click="loadHistory">
            <template #icon>
              <n-icon><Refresh /></n-icon>
            </template>
            刷新
          </n-button>
          <n-button size="small" @click="toggleHistory">
            <template #icon>
              <n-icon><X /></n-icon>
            </template>
            关闭
          </n-button>
        </n-space>
      </template>
      
      <n-list>
        <n-list-item v-for="item in history" :key="item.id">
          <template #prefix>
            <n-icon :color="item.status === 'success' ? '#18a058' : '#d03050'">
              <Check v-if="item.status === 'success'" />
              <AlertCircle v-else />
            </n-icon>
          </template>
          
          <n-thing>
            <template #header>{{ item.topic }}</template>
            <template #description>
              <n-space>
                <span>{{ getConfigName(item.configId) }}</span>
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
            <n-space v-if="item.status === 'success'">
              <n-button size="small" @click="copyHistoryItem(item)">复制</n-button>
            </n-space>
          </template>
        </n-list-item>
      </n-list>
      
      <n-empty v-if="history.length === 0" description="暂无生成历史" />
    </n-card>

    <!-- 保存提示词弹窗 -->
    <PromptEditModal 
      v-model:show="showSaveModal"
      :prompt="promptToSave"
      :categories="categories"
      @saved="onPromptSaved"
    />
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
    NDropdown,
    NEmpty,
    NText,
    NSplit,
    useMessage 
} from 'naive-ui'
import { ChevronDown, History, Refresh, Check, AlertCircle, X, Robot, Plus } from '@vicons/tabler'
import { api } from '~/lib/api'
import PromptEditModal from '~/components/prompt-management/PromptEditModal.vue'
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
const history = ref<AIGenerationHistory[]>([])
const defaultConfig = ref<AIConfig | null>(null)
const currentModel = ref<string>('')
const currentConfigId = ref<string>('')
const generating = ref(false)
const loading = ref(true)
const showHistory = ref(false)
const showSaveModal = ref(false)
const promptToSave = ref<any>(null)
const categories = ref<any[]>([])
const splitSize = ref<number>(1) // 分隔大小，1表示全宽显示要求输入框
const generatedResult = ref<string>('') // 存储生成的结果

// 流式传输状态
const streamStats = reactive({
  charCount: 0,
  isStreaming: false
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

// 计算属性
const modelDropdownOptions = computed(() => {
  if (!configs.value || configs.value.length === 0) return []
  
  const options: Array<{ label: string; key: string; configId: string; configName: string }> = []
  
  // 遍历所有启用的配置
  configs.value.forEach(config => {
    const models = Array.isArray(config.models) ? config.models : []
    
    // 添加默认模型
    if (config.defaultModel) {
      options.push({
        label: `${config.defaultModel} (${config.name} - 默认)`,
        key: `${config.configId}:${config.defaultModel}`,
        configId: config.configId,
        configName: config.name
      })
    }
    
    // 添加其他模型
    models.forEach(model => {
      if (model !== config.defaultModel) { // 避免重复添加默认模型
        options.push({
          label: `${model} (${config.name})`,
          key: `${config.configId}:${model}`,
          configId: config.configId,
          configName: config.name
        })
      }
    })
    
    // 添加自定义模型
    if (config.customModel && !models.includes(config.customModel) && config.customModel !== config.defaultModel) {
      options.push({
        label: `${config.customModel} (${config.name} - 自定义)`,
        key: `${config.configId}:${config.customModel}`,
        configId: config.configId,
        configName: config.name
      })
    }
  })
  
  return options
})

// 加载 AI 配置
const loadConfigs = async () => {
  loading.value = true
  await safeDbOperation(async () => {
    console.log('开始加载 AI 配置')
    const result = await databaseService.getEnabledAIConfigs()
    console.log('成功获取到启用的 AI 配置:', result)
    configs.value = result
    
    // 自动选择第一个启用的配置作为默认配置
    if (result && result.length > 0) {
      defaultConfig.value = result[0]
      // 设置默认选中的模型和配置
      const defaultModel = defaultConfig.value.defaultModel || ''
      if (defaultModel) {
        currentModel.value = defaultModel
        currentConfigId.value = defaultConfig.value.configId
      }
      console.log('自动选择默认配置:', defaultConfig.value.name)
    } else {
      defaultConfig.value = null
      currentModel.value = ''
      currentConfigId.value = ''
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
    const result = await api.aiGenerationHistory.getPaginated.query({ limit: 20 })
    history.value = result.data
  } catch (error) {
    message.error('加载历史记录失败: ' + (error as Error).message)
  }
}

// 模型选择处理
const onModelSelect = (modelKey: string) => {
  // 解析选择的模型key，格式为 "configId:model"
  const [configId, model] = modelKey.split(':')
  currentModel.value = model
  currentConfigId.value = configId
  
  // 更新当前使用的配置
  const selectedConfig = configs.value.find(c => c.configId === configId)
  if (selectedConfig) {
    console.log('切换到配置:', selectedConfig.name, '模型:', model)
  }
}

// 切换历史记录显示
const toggleHistory = () => {
  showHistory.value = !showHistory.value
  if (showHistory.value) {
    loadHistory()
  }
}

// 生成提示词
const generatePrompt = async () => {
  try {
    await formRef.value?.validate()
    generating.value = true
      // 重置流式传输状态
    streamStats.charCount = 0
    streamStats.isStreaming = true
    generatedResult.value = '' // 清空之前的结果
    
    // 立即开始分隔动画，让用户看到右侧面板
    animateSplit(1, 0.5)
    
    // 获取当前选中的配置
    const selectedConfig = currentConfigId.value 
      ? configs.value.find(c => c.configId === currentConfigId.value)
      : defaultConfig.value
    
    if (!selectedConfig) {
      throw new Error('没有可用的 AI 配置')
    }
    
    const request = {
      configId: selectedConfig.configId,
      model: currentModel.value || selectedConfig.defaultModel,
      topic: formData.topic
    }
    
    // 序列化配置对象以确保可以通过 IPC 传递
    const serializedConfig = serializeConfig(selectedConfig)
      // 检查是否支持流式传输
    let result
    if (window.electronAPI.ai.generatePromptStream) {
      console.log('使用流式传输模式')
      // 使用流式传输
      result = await window.electronAPI.ai.generatePromptStream(
        request, 
        serializedConfig,
        (charCount: number, partialContent?: string) => {
          console.log('流式传输回调:', { charCount, hasContent: !!partialContent });
          streamStats.charCount = charCount;
          if (partialContent !== undefined) {
            generatedResult.value = partialContent; // 实时更新结果显示
          }
        }
      );
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
      // 直接保存为提示词
    await saveGeneratedPrompt(result)
    
    message.success('提示词生成并保存成功')
    
    // 通知父组件刷新提示词列表
    emit('prompt-saved')
      // 清空输入框，但保持结果显示
    formData.topic = ''
    
    // 刷新历史记录（如果正在显示）
    if (showHistory.value) {
      loadHistory()
    }
    
    // 保持分隔状态，让用户继续查看结果
    // 用户可以通过手动调整分隔条来改变布局} catch (error) {
    console.error('生成失败:', error)
    message.error('生成失败: ' + (error as Error).message)
    
    // 失败时恢复分隔为1
    await animateSplit(splitSize.value, 1)
    generatedResult.value = ''
    
    // 保存错误记录
    try {
      await api.aiGenerationHistory.create.mutate({
        historyId: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        configId: currentConfigId.value || defaultConfig.value?.configId || 'unknown',
        topic: formData.topic,
        generatedPrompt: '',
        model: currentModel.value || 'unknown',
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
    streamStats.isStreaming = false
    streamStats.charCount = 0
  }
}

// 模拟流式进度（在不支持真正流式传输时使用）
const simulateStreamProgress = async (finalContent: string) => {
  const totalChars = finalContent.length
  const steps = Math.min(50, totalChars) // 最多50步，或者按字符数
  const stepSize = Math.ceil(totalChars / steps)
  
  for (let i = 0; i < steps; i++) {
    if (!generating.value) break // 如果已取消，停止模拟
    
    const currentCharCount = Math.min((i + 1) * stepSize, totalChars)
    streamStats.charCount = currentCharCount
    
    // 模拟渐进显示内容
    generatedResult.value = finalContent.substring(0, currentCharCount)
    
    // 动态调整延迟 - 开始快一些，后面慢一些
    const delay = i < steps / 2 ? 50 : 150
    await new Promise(resolve => setTimeout(resolve, delay))
  }
  
  // 确保显示完整内容
  streamStats.charCount = totalChars
  generatedResult.value = finalContent
}

// 直接保存生成的提示词
const saveGeneratedPrompt = async (result: any) => {
  try {
    const promptData = {
      title: `AI生成: ${result.topic}`,
      content: result.generatedPrompt,
      description: ``,
      tags: ['AI生成'],
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
    return `${currentModel.value} (${selectedConfig.name})`
  }
  
  return currentModel.value || '选择模型'
}

// 获取配置名称
const getConfigName = (configId: string) => {
  const config = configs.value.find(c => c.configId === configId)
  return config ? config.name : '未知配置'
}

// 格式化日期
const formatDate = (date: Date | string) => {
  return new Date(date).toLocaleString('zh-CN')
}

// 序列化配置对象以确保可以通过 IPC 传递
const serializeConfig = (config: AIConfig) => {
  return {
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
    createdAt: config.createdAt instanceof Date ? config.createdAt.toISOString() : config.createdAt,
    updatedAt: config.updatedAt instanceof Date ? config.updatedAt.toISOString() : config.updatedAt
  }
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
