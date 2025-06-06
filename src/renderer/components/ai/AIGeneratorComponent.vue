<template>
  <div class="ai-generator">
    <n-card title="AI 提示词生成器" class="generator-card">
      <n-form
        ref="formRef"
        :model="formData"
        :rules="formRules"
        label-placement="top"
      >
        <n-form-item label="要求" path="topic">
          <n-input 
            v-model:value="formData.topic" 
            type="textarea"
            :rows="4"
            placeholder="描述你想要生成的提示词，例如：写作助手、代码审查、翻译工具等"
          />
        </n-form-item>
        
        <n-form-item>
          <n-space justify="space-between" style="width: 100%;">
            <n-space>
              <n-button 
                type="primary" 
                @click="generatePrompt" 
                :loading="generating"
                :disabled="!defaultConfig"
                size="large"
              >
                {{ generating ? '生成中...' : '确定' }}
              </n-button>
              
              <n-dropdown 
                :options="modelDropdownOptions" 
                @select="onModelSelect"
                trigger="click"
                v-if="defaultConfig"
              >
                <n-button size="large" quaternary>
                  {{ currentModel || '默认模型' }}
                  <template #icon>
                    <n-icon><ChevronDown /></n-icon>
                  </template>
                </n-button>
              </n-dropdown>
            </n-space>
            
            <n-space>
              <!-- 生成进度提示 -->
              <n-text v-if="generating && streamStats.charCount > 0" type="info">
                已生成 {{ streamStats.charCount }} 字符
              </n-text>
              
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
    </n-card>

    <!-- 历史记录（可切换显示） -->
    <n-card v-if="showHistory" title="生成历史" class="history-card">
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
    useMessage 
} from 'naive-ui'
import { ChevronDown, History, Refresh, Check, AlertCircle, X } from '@vicons/tabler'
import { api } from '~/lib/api'
import PromptEditModal from '~/components/prompt-management/PromptEditModal.vue'
import type { AIConfig, AIGenerationHistory } from '~/lib/db'
import { databaseService } from '~/lib/db'

const message = useMessage()

// 数据状态
const configs = ref<AIConfig[]>([])
const history = ref<AIGenerationHistory[]>([])
const defaultConfig = ref<AIConfig | null>(null)
const currentModel = ref<string>('')
const generating = ref(false)
const showHistory = ref(false)
const showSaveModal = ref(false)
const promptToSave = ref<any>(null)
const categories = ref<any[]>([])

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
  if (!defaultConfig.value) return []
  
  const models = Array.isArray(defaultConfig.value.models) 
    ? defaultConfig.value.models 
    : []
  
  const options = models.map(model => ({
    label: model,
    key: model
  }))
  
  // 添加默认模型
  if (defaultConfig.value.defaultModel) {
    options.unshift({
      label: `${defaultConfig.value.defaultModel} (默认)`,
      key: defaultConfig.value.defaultModel
    })
  }
  
  // 添加自定义模型
  if (defaultConfig.value.customModel && !models.includes(defaultConfig.value.customModel)) {
    options.push({
      label: `${defaultConfig.value.customModel} (自定义)`,
      key: defaultConfig.value.customModel
    })
  }
  
  return options
})

// 加载 AI 配置
const loadConfigs = async () => {
  try {
    console.log('开始加载 AI 配置')
    const result = await databaseService.getEnabledAIConfigs()
    console.log('成功获取到启用的 AI 配置:', result)
    configs.value = result
    
    // 自动选择第一个启用的配置作为默认配置
    if (result && result.length > 0) {
      defaultConfig.value = result[0]
      currentModel.value = defaultConfig.value.defaultModel || ''
      console.log('自动选择默认配置:', defaultConfig.value.name)
    } else {
      message.info('没有找到启用的 AI 配置，请先在 AI 配置页面添加并启用至少一个配置')
    }
  } catch (error) {
    console.error('加载 AI 配置失败:', error)
    message.error('加载 AI 配置失败: ' + (error as Error).message)
  }
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
  currentModel.value = modelKey
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
    
    if (!defaultConfig.value) {
      throw new Error('没有可用的 AI 配置')
    }
    
    const request = {
      configId: defaultConfig.value.configId,
      model: currentModel.value || defaultConfig.value.defaultModel,
      topic: formData.topic
    }
    
    // 序列化配置对象以确保可以通过 IPC 传递
    const serializedConfig = serializeConfig(defaultConfig.value)
    
    // 检查是否支持流式传输
    let result
    if (window.electronAPI.ai.generatePromptStream) {
      // 使用流式传输
      result = await window.electronAPI.ai.generatePromptStream(
        request, 
        serializedConfig,
        (charCount: number) => {
          streamStats.charCount = charCount;
        }
      );
    } else {
      // 使用普通生成
      result = await window.electronAPI.ai.generatePrompt(request, serializedConfig)
      // 模拟字数增长
      await simulateStreamProgress(result.generatedPrompt)
    }
    
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
    
    // 清空输入框
    formData.topic = ''
    
    // 刷新历史记录（如果正在显示）
    if (showHistory.value) {
      loadHistory()
    }
  } catch (error) {
    message.error('生成失败: ' + (error as Error).message)
    
    // 保存错误记录
    try {
      await api.aiGenerationHistory.create.mutate({
        historyId: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        configId: defaultConfig.value?.configId || 'unknown',
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
  const steps = 20 // 分20步显示
  const stepSize = Math.ceil(totalChars / steps)
  
  for (let i = 0; i < steps; i++) {
    if (!generating.value) break // 如果已取消，停止模拟
    
    streamStats.charCount = Math.min((i + 1) * stepSize, totalChars)
    await new Promise(resolve => setTimeout(resolve, 100)) // 每100ms更新一次
  }
  
  streamStats.charCount = totalChars
}

// 直接保存生成的提示词
const saveGeneratedPrompt = async (result: any) => {
  try {
    const promptData = {
      title: `AI生成: ${result.topic}`,
      content: result.generatedPrompt,
      description: `由 AI 生成的提示词，主题：${result.topic}`,
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
onMounted(() => {
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

<style scoped>
.ai-generator {
  padding: 20px;
  width: 100%;
  max-width: none;
  margin: 0;
  display: block;
}

.generator-card {
  border: 1px solid var(--border-color);
  width: 100%;
}

.history-card {
  border: 1px solid var(--border-color);
  width: 100%;
  margin-top: 20px;
}

.history-content {
  margin-top: 8px;
  color: var(--text-color-2);
  font-size: 14px;
}

.error-message {
  margin-top: 8px;
  color: var(--error-color);
  font-size: 14px;
}

/* 确保表单元素也全宽 */
.n-form {
  width: 100%;
}

.n-form-item {
  width: 100%;
}

/* 确保按钮组合也能正确布局 */
.n-space {
  width: 100%;
}
</style>
