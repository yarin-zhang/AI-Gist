<template>
  <div class="ai-generator">
    <n-card title="AI 提示词生成器" class="generator-card">
      <n-form
        ref="formRef"
        :model="formData"
        :rules="formRules"
        label-placement="top"
        require-mark-placement="right-hanging"
      >
        <n-form-item label="选择 AI 配置" path="configId">
          <n-select 
            v-model:value="formData.configId" 
            :options="configOptions"
            placeholder="请选择一个 AI 配置"
            @update:value="onConfigChange"
          />
        </n-form-item>
        
        <n-form-item v-if="selectedConfig" label="选择模型" path="model">
          <n-select 
            v-model:value="formData.model" 
            :options="modelOptions"
            placeholder="请选择模型"
            clearable
          />
        </n-form-item>
        
        <n-form-item label="主题描述" path="topic">
          <n-input 
            v-model:value="formData.topic" 
            type="textarea"
            :rows="3"
            placeholder="请描述你想要生成提示词的主题，例如：写作助手、代码审查、翻译工具等"
          />
        </n-form-item>
        
        <n-form-item label="自定义生成提示（可选）" path="customPrompt">
          <n-input 
            v-model:value="formData.customPrompt" 
            type="textarea"
            :rows="4"
            placeholder="可以自定义用于生成提示词的提示，留空则使用默认提示"
          />
        </n-form-item>
        
        <n-form-item>
          <n-button 
            type="primary" 
            @click="generatePrompt" 
            :loading="generating"
            :disabled="!selectedConfig"
            block
          >
            生成提示词
          </n-button>
        </n-form-item>
      </n-form>
    </n-card>

    <!-- 生成结果 -->
    <n-card v-if="generatedResult" title="生成结果" class="result-card">
      <template #header-extra>
        <n-space>
          <n-button size="small" @click="copyToClipboard">
            <template #icon>
              <n-icon><Copy /></n-icon>
            </template>
            复制
          </n-button>
          <n-button size="small" @click="saveAsPrompt">
            <template #icon>
              <n-icon><Plus /></n-icon>
            </template>
            保存为提示词
          </n-button>
        </n-space>
      </template>
      
      <div class="result-content">
        <n-input 
          :value="generatedResult.generatedPrompt" 
          type="textarea" 
          :rows="10"
          readonly
        />
        
        <div class="result-meta">
          <n-space>
            <n-tag>配置: {{ getConfigName(generatedResult.configId) }}</n-tag>
            <n-tag>模型: {{ generatedResult.model }}</n-tag>
            <n-tag>时间: {{ formatDate(generatedResult.createdAt) }}</n-tag>
          </n-space>
        </div>
      </div>
    </n-card>

    <!-- 历史记录 -->
    <n-card title="生成历史" class="history-card">
      <template #header-extra>
        <n-button size="small" @click="loadHistory">
          <template #icon>
            <n-icon><Refresh /></n-icon>
          </template>
          刷新
        </n-button>
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
              <n-button size="small" @click="viewHistoryItem(item)">查看</n-button>
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
      @saved="onPromptSaved"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue'
import { useMessage } from 'naive-ui'
import { Copy, Plus, Refresh, Check, AlertCircle } from '@vicons/tabler'
import { api } from '~/lib/api'
import PromptEditModal from '~/components/prompt-management/PromptEditModal.vue'
import type { AIConfig, AIGenerationRequest, AIGenerationResult } from '~/typings/electron'
import type { AIGenerationHistory } from '~/lib/db'

const message = useMessage()

// 数据状态
const configs = ref<AIConfig[]>([])
const history = ref<AIGenerationHistory[]>([])
const selectedConfig = ref<AIConfig | null>(null)
const generatedResult = ref<AIGenerationResult | null>(null)
const generating = ref(false)
const showSaveModal = ref(false)
const promptToSave = ref<any>(null)

// 表单数据
const formData = reactive({
  configId: '',
  model: '',
  topic: '',
  customPrompt: ''
})

// 表单校验规则
const formRules = {
  configId: [
    { required: true, message: '请选择 AI 配置', trigger: 'change' }
  ],
  topic: [
    { required: true, message: '请输入主题描述', trigger: 'blur' },
    { min: 5, message: '主题描述至少 5 个字符', trigger: 'blur' }
  ]
}

// 表单引用
const formRef = ref()

// 计算属性
const configOptions = computed(() => {
  return configs.value
    .filter(config => config.enabled)
    .map(config => ({
      label: `${config.name} (${config.type})`,
      value: config.id
    }))
})

const modelOptions = computed(() => {
  if (!selectedConfig.value) return []
  
  const models = selectedConfig.value.models || []
  const options = models.map(model => ({ label: model, value: model }))
  
  // 添加默认模型和自定义模型
  if (selectedConfig.value.defaultModel && !models.includes(selectedConfig.value.defaultModel)) {
    options.unshift({ label: `${selectedConfig.value.defaultModel} (默认)`, value: selectedConfig.value.defaultModel })
  }
  
  if (selectedConfig.value.customModel && !models.includes(selectedConfig.value.customModel)) {
    options.push({ label: `${selectedConfig.value.customModel} (自定义)`, value: selectedConfig.value.customModel })
  }
  
  return options
})

// 加载 AI 配置
const loadConfigs = async () => {
  try {
    const result = await window.electronAPI.ai.getEnabledConfigs()
    configs.value = result
  } catch (error) {
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

// 配置变化处理
const onConfigChange = (configId: string) => {
  selectedConfig.value = configs.value.find(c => c.id === configId) || null
  formData.model = selectedConfig.value?.defaultModel || ''
}

// 生成提示词
const generatePrompt = async () => {
  try {
    await formRef.value?.validate()
    generating.value = true
    
    const request: AIGenerationRequest = {
      configId: formData.configId,
      model: formData.model || undefined,
      topic: formData.topic,
      customPrompt: formData.customPrompt || undefined
    }
    
    const result = await window.electronAPI.ai.generatePrompt(request)
    generatedResult.value = result
    
    // 保存到历史记录
    await api.aiGenerationHistory.create.mutate({
      historyId: result.id,
      configId: result.configId,
      topic: result.topic,
      generatedPrompt: result.generatedPrompt,
      model: result.model,
      customPrompt: request.customPrompt,
      status: 'success'
    })
    
    message.success('提示词生成成功')
    loadHistory() // 刷新历史记录
  } catch (error) {
    message.error('生成失败: ' + (error as Error).message)
    
    // 保存错误记录
    try {
      await api.aiGenerationHistory.create.mutate({
        historyId: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        configId: formData.configId,
        topic: formData.topic,
        generatedPrompt: '',
        model: formData.model || 'unknown',
        customPrompt: formData.customPrompt || undefined,
        status: 'error',
        errorMessage: (error as Error).message
      })
      loadHistory()
    } catch (saveError) {
      console.error('保存错误记录失败:', saveError)
    }
  } finally {
    generating.value = false
  }
}

// 复制到剪贴板
const copyToClipboard = async () => {
  if (!generatedResult.value) return
  
  try {
    await navigator.clipboard.writeText(generatedResult.value.generatedPrompt)
    message.success('已复制到剪贴板')
  } catch (error) {
    message.error('复制失败')
  }
}

// 保存为提示词
const saveAsPrompt = () => {
  if (!generatedResult.value) return
  
  promptToSave.value = {
    title: `AI生成: ${generatedResult.value.topic}`,
    content: generatedResult.value.generatedPrompt,
    description: `由 AI 生成的提示词，主题：${generatedResult.value.topic}`,
    tags: 'AI生成',
    isFavorite: false,
    useCount: 0
  }
  
  showSaveModal.value = true
}

// 提示词保存完成
const onPromptSaved = () => {
  message.success('提示词已保存')
  showSaveModal.value = false
}

// 查看历史项
const viewHistoryItem = (item: AIGenerationHistory) => {
  generatedResult.value = {
    id: item.historyId,
    configId: item.configId,
    topic: item.topic,
    generatedPrompt: item.generatedPrompt,
    model: item.model,
    customPrompt: item.customPrompt,
    createdAt: item.createdAt
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
  const config = configs.value.find(c => c.id === configId)
  return config ? config.name : '未知配置'
}

// 格式化日期
const formatDate = (date: Date | string) => {
  return new Date(date).toLocaleString('zh-CN')
}

// 组件挂载时加载数据
onMounted(() => {
  loadConfigs()
  loadHistory()
})
</script>

<style scoped>
.ai-generator {
  padding: 20px;
  display: grid;
  gap: 20px;
}

.generator-card,
.result-card,
.history-card {
  border: 1px solid var(--border-color);
}

.result-content {
  display: grid;
  gap: 12px;
}

.result-meta {
  padding-top: 12px;
  border-top: 1px solid var(--border-color);
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

/* 响应式布局 */
@media (min-width: 1200px) {
  .ai-generator {
    grid-template-columns: 1fr 1fr;
    grid-template-rows: auto auto;
  }
  
  .generator-card {
    grid-column: 1;
    grid-row: 1;
  }
  
  .result-card {
    grid-column: 2;
    grid-row: 1;
  }
  
  .history-card {
    grid-column: 1 / -1;
    grid-row: 2;
  }
}
</style>
