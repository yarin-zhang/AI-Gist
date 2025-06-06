<template>
  <div class="ai-config-page">
    <div class="page-header">
      <h2>AI 配置管理</h2>
      <n-button type="primary" @click="showAddModal = true">
        <template #icon>
          <n-icon><Plus /></n-icon>
        </template>
        添加配置
      </n-button>
    </div>

    <div class="config-list">
      <n-card v-for="config in configs" :key="config.id" class="config-card">
        <template #header>
          <div class="config-header">
            <div class="config-info">
              <h3>{{ config.name }}</h3>
              <n-tag :type="config.type === 'openai' ? 'success' : 'info'">
                {{ config.type === 'openai' ? 'OpenAI 兼容' : 'Ollama' }}
              </n-tag>
            </div>
            <div class="config-actions">
              <n-switch 
                v-model:value="config.enabled" 
                @update:value="(value) => toggleConfig(config.id!, value)"
              />
              <n-button size="small" @click="editConfig(config)">编辑</n-button>
              <n-button size="small" @click="testConfig(config)" :loading="testingConfigs.has(String(config.id!))">
                测试连接
              </n-button>
              <n-button size="small" type="error" @click="deleteConfig(config.id!)">删除</n-button>
            </div>
          </div>
        </template>
        
        <div class="config-details">
          <p><strong>Base URL:</strong> {{ config.baseURL }}</p>
          <p v-if="config.defaultModel"><strong>默认模型:</strong> {{ config.defaultModel }}</p>
          <p v-if="config.customModel"><strong>自定义模型:</strong> {{ config.customModel }}</p>
          <p><strong>创建时间:</strong> {{ formatDate(config.createdAt) }}</p>
        </div>
      </n-card>
    </div>

    <!-- 添加/编辑配置弹窗 -->
    <n-modal v-model:show="showAddModal" preset="dialog" title="AI 配置">
      <template #header>
        <div>{{ editingConfig ? '编辑配置' : '添加配置' }}</div>
      </template>
      
      <n-form
        ref="formRef"
        :model="formData"
        :rules="formRules"
        label-placement="top"
        require-mark-placement="right-hanging"
      >
        <n-form-item label="配置名称" path="name">
          <n-input v-model:value="formData.name" placeholder="输入配置名称" />
        </n-form-item>
        
        <n-form-item label="类型" path="type">
          <n-select 
            v-model:value="formData.type" 
            :options="typeOptions"
            @update:value="onTypeChange"
          />
        </n-form-item>
        
        <n-form-item label="Base URL" path="baseURL">
          <n-input v-model:value="formData.baseURL" placeholder="例如: https://api.openai.com/v1" />
        </n-form-item>
        
        <n-form-item v-if="formData.type === 'openai'" label="API Key" path="apiKey">
          <n-input 
            v-model:value="formData.apiKey" 
            type="password" 
            show-password-on="click"
            placeholder="输入 API Key"
          />
        </n-form-item>
        
        <n-form-item label="模型列表" path="models">
          <n-dynamic-tags v-model:value="formData.models" />
        </n-form-item>
        
        <n-form-item label="默认模型" path="defaultModel">
          <n-input v-model:value="formData.defaultModel" placeholder="输入默认模型名称" />
        </n-form-item>
        
        <n-form-item label="自定义模型" path="customModel">
          <n-input v-model:value="formData.customModel" placeholder="输入自定义模型名称（可选）" />
        </n-form-item>
      </n-form>
      
      <template #action>
        <n-space>
          <n-button @click="closeModal">取消</n-button>
          <n-button type="primary" @click="saveConfig" :loading="saving">
            {{ editingConfig ? '更新' : '添加' }}
          </n-button>
        </n-space>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { 
    NButton,
    NCard,
    NForm,
    NFormItem,
    NInput,
    NSelect,
    NTag,
    NModal,
    NSwitch,
    NDynamicTags,
    NIcon,
    NSpace,
    NDropdown,
    NScrollbar,
    NFlex,
    NText,
    NFormRules,
    NMessage,
    useMessage 
} from 'naive-ui'
import { Plus } from '@vicons/tabler'
import type { AIConfig } from '~/lib/db'
import { databaseService } from '~/lib/db'

const message = useMessage()

// 数据状态
const configs = ref<AIConfig[]>([])
const showAddModal = ref(false)
const editingConfig = ref<AIConfig | null>(null)
const saving = ref(false)
const testingConfigs = ref(new Set<number>())

// 表单数据
const formData = reactive({
  name: '',
  type: 'openai' as 'openai' | 'ollama',
  baseURL: '',
  apiKey: '',
  models: [] as string[],
  defaultModel: '',
  customModel: ''
})

// 表单校验规则
const formRules = {
  name: [
    { required: true, message: '请输入配置名称', trigger: 'blur' }
  ],
  type: [
    { required: true, message: '请选择类型', trigger: 'change' }
  ],
  baseURL: [
    { required: true, message: '请输入 Base URL', trigger: 'blur' }
  ],
  apiKey: [
    { 
      required: true, 
      message: '请输入 API Key', 
      trigger: 'blur',
      validator: (rule: any, value: string) => {
        if (formData.type === 'openai' && !value) {
          return new Error('OpenAI 类型需要 API Key')
        }
        return true
      }
    }
  ]
}

// 类型选项
const typeOptions = [
  { label: 'OpenAI 兼容', value: 'openai' },
  { label: 'Ollama', value: 'ollama' }
]

// 表单引用
const formRef = ref()

// 加载配置列表
const loadConfigs = async () => {
  try {
    const result = await databaseService.getAllAIConfigs()
    configs.value = result
  } catch (error) {
    message.error('加载配置失败: ' + (error as Error).message)
  }
}

// 添加配置
const saveConfig = async () => {
  try {
    await formRef.value?.validate()
    saving.value = true
    
    if (editingConfig.value) {
      // 更新配置
      const updateData = {
        name: formData.name,
        type: formData.type,
        baseURL: formData.baseURL,
        apiKey: formData.apiKey || undefined,
        models: [...formData.models], // 创建新数组确保可序列化
        defaultModel: formData.defaultModel || undefined,
        customModel: formData.customModel || undefined,
      }
      await databaseService.updateAIConfig(editingConfig.value.id!, updateData)
      message.success('配置更新成功')
    } else {
      // 添加新配置
      const configData = {
        configId: `config_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: formData.name,
        type: formData.type,
        baseURL: formData.baseURL,
        apiKey: formData.apiKey || undefined,
        models: [...formData.models], // 创建新数组确保可序列化
        defaultModel: formData.defaultModel || undefined,
        customModel: formData.customModel || undefined,
        enabled: true,
      }
      await databaseService.createAIConfig(configData)
      message.success('配置添加成功')
    }
    
    closeModal()
    loadConfigs()
  } catch (error) {
    message.error('保存失败: ' + (error as Error).message)
  } finally {
    saving.value = false
  }
}

// 编辑配置
const editConfig = (config: AIConfig) => {
  editingConfig.value = config
  formData.name = config.name
  formData.type = config.type
  formData.baseURL = config.baseURL
  formData.apiKey = config.apiKey || ''
  formData.models = Array.isArray(config.models) ? config.models : []
  formData.defaultModel = config.defaultModel || ''
  formData.customModel = config.customModel || ''
  showAddModal.value = true
}

// 删除配置
const deleteConfig = async (id: number) => {
  try {
    await databaseService.deleteAIConfig(id)
    message.success('配置删除成功')
    loadConfigs()
  } catch (error) {
    message.error('删除失败: ' + (error as Error).message)
  }
}

// 切换配置状态
const toggleConfig = async (id: number, enabled: boolean) => {
  try {
    await databaseService.updateAIConfig(id, { enabled })
    message.success(enabled ? '配置已启用' : '配置已禁用')
  } catch (error) {
    message.error('更新失败: ' + (error as Error).message)
  }
}

// 测试配置
const testConfig = async (config: AIConfig) => {
  if (!config.id) return
  
  testingConfigs.value.add(config.id)
  try {
    // 序列化配置对象以确保可以通过 IPC 传递
    const serializedConfig = serializeConfig(config)
    
    const result = await window.electronAPI.ai.testConfig(serializedConfig)
    if (result.success) {
      message.success('连接测试成功')
      if (result.models && result.models.length > 0) {
        message.info(`发现 ${result.models.length} 个可用模型`)
      }
    } else {
      message.error(`连接测试失败: ${result.error}`)
    }
  } catch (error) {
    message.error('测试失败: ' + (error as Error).message)
  } finally {
    testingConfigs.value.delete(config.id)
  }
}

// 关闭弹窗
const closeModal = () => {
  showAddModal.value = false
  editingConfig.value = null
  resetForm()
}

// 重置表单
const resetForm = () => {
  formData.name = ''
  formData.type = 'openai'
  formData.baseURL = ''
  formData.apiKey = ''
  formData.models = []
  formData.defaultModel = ''
  formData.customModel = ''
}

// 类型变化处理
const onTypeChange = (type: 'openai' | 'ollama') => {
  if (type === 'ollama') {
    formData.baseURL = 'http://localhost:11434'
    formData.apiKey = ''
  } else {
    formData.baseURL = 'https://api.openai.com/v1'
  }
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
    models: [...(config.models || [])], // 创建新数组
    defaultModel: config.defaultModel,
    customModel: config.customModel,
    enabled: config.enabled,
    createdAt: config.createdAt instanceof Date ? config.createdAt.toISOString() : config.createdAt,
    updatedAt: config.updatedAt instanceof Date ? config.updatedAt.toISOString() : config.updatedAt
  }
}

// 组件挂载时加载数据
onMounted(() => {
  loadConfigs()
})
</script>

<style scoped>
.ai-config-page {
  padding: 20px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.page-header h2 {
  margin: 0;
}

.config-list {
  display: grid;
  gap: 16px;
}

.config-card {
  border: 1px solid var(--border-color);
}

.config-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.config-info {
  display: flex;
  align-items: center;
  gap: 12px;
}

.config-info h3 {
  margin: 0;
  font-size: 16px;
}

.config-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.config-details {
  margin-top: 12px;
}

.config-details p {
  margin: 4px 0;
  color: var(--text-color-2);
}
</style>
