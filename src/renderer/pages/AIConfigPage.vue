<template>
  <div class="ai-config-page">
    <NFlex vertical size="large">
      <!-- 页面标题 -->
      <NFlex justify="space-between" align="center">
        <div>
          <NText strong style="font-size: 28px;">AI 配置管理</NText>
          <NText depth="3" style="display: block; margin-top: 4px;">
            管理和测试你的 AI 服务连接配置
          </NText>
        </div>
        <NFlex>
          <NButton type="primary" @click="showAddModal = true">
            <template #icon>
              <NIcon>
                <Plus />
              </NIcon>
            </template>
            添加配置
          </NButton>
        </NFlex>
      </NFlex>      <!-- 配置卡片列表 -->
      <div class="config-list">
        <div v-if="configs.length === 0" style="text-align: center; padding: 40px;">
          <NEmpty description="暂无AI配置，快来添加第一个吧！">
            <template #extra>
              <NButton type="primary" @click="showAddModal = true">
                <template #icon>
                  <NIcon>
                    <Plus />
                  </NIcon>
                </template>
                添加配置
              </NButton>
            </template>
          </NEmpty>
        </div>
        <n-card v-for="config in configs" :key="config.id" class="config-card">
          <template #header>
            <div class="config-header">
              <div class="config-info">
                <NIcon size="24">
                  <Server v-if="config.type === 'openai'" />
                  <Robot v-else />
                </NIcon>
                <h3>{{ config.name }}</h3>
                <n-tag :type="config.type === 'openai' ? 'success' : 'info'">
                  {{ config.type === 'openai' ? 'OpenAI 兼容' : 'Ollama' }}
                </n-tag>
                <n-tag :type="config.enabled ? 'success' : 'warning'">
                  {{ config.enabled ? '已启用' : '已禁用' }}
                </n-tag>
              </div>
              <div class="config-actions">
                <n-switch 
                  v-model:value="config.enabled" 
                  @update:value="(value) => toggleConfig(config.id!, value)"
                />
                <n-button size="small" @click="editConfig(config)">
                  <template #icon>
                    <NIcon><Settings /></NIcon>
                  </template>
                  编辑
                </n-button>
                <n-button size="small" @click="testConfig(config)" :loading="testingConfigs.has(config.id!)">
                  测试连接
                </n-button>
                <n-button size="small" @click="intelligentTest(config)" :loading="intelligentTestingConfigs.has(config.id!)" type="info">
                  <template #icon>
                    <NIcon><Robot /></NIcon>
                  </template>
                  智能测试
                </n-button>
                <n-button size="small" type="error" @click="deleteConfig(config.id!)">
                  <template #icon>
                    <NIcon><DatabaseOff /></NIcon>
                  </template>
                  删除
                </n-button>
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
    </NFlex>    <!-- 添加/编辑配置弹窗 -->    <CommonModal 
      ref="modalRef" 
      :show="showAddModal" 
      @update:show="showAddModal = $event" 
      @close="closeModal"
      :header-height="headerHeight" 
      :footer-height="footerHeight" 
      :content-padding="contentPadding"
    >
      <!-- 顶部固定区域 -->
      <template #header>
        <NFlex vertical size="medium" style="padding: 16px;">
          <NFlex align="center" style="gap: 8px">
            <NIcon size="24">
              <Settings />
            </NIcon>
            <NText :style="{ fontSize: '20px', fontWeight: 600 }">
              {{ editingConfig ? '编辑配置' : '添加配置' }}
            </NText>
          </NFlex>
          <NText depth="3">
            {{ editingConfig ? '修改现有的 AI 配置信息' : '添加新的 AI 服务配置，支持 OpenAI 兼容接口和 Ollama' }}
          </NText>
        </NFlex>
      </template>      <!-- 中间可操作区域 -->
      <template #content>
        <NScrollbar :style="{ height: `${contentHeight}px` }">
          <n-form
            ref="formRef"
            :model="formData"
            :rules="formRules"
            label-placement="top"
            require-mark-placement="right-hanging"
          >
            <NGrid :cols="gridCols" :x-gap="16">
              <!-- 左侧：基本配置和连接配置 -->
              <NGridItem :span="leftSpan">
                <NFlex vertical size="medium">
                  <!-- 基本信息 -->
                  <NCard title="基本信息" size="small">
                    <NFlex vertical size="medium">
                      <n-form-item label="类型" path="type">
                        <n-select 
                          v-model:value="formData.type" 
                          :options="typeOptions"
                          @update:value="onTypeChange"
                        />
                      </n-form-item>
                      <n-form-item label="配置名称" path="name">
                        <n-input v-model:value="formData.name" placeholder="输入配置名称" />
                      </n-form-item>
                      
                    </NFlex>
                  </NCard>

                  <!-- 连接配置 -->
                  <NCard title="连接配置" size="small">
                    <NFlex vertical size="medium">
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
                    </NFlex>
                  </NCard>
                </NFlex>
              </NGridItem>

              <!-- 右侧：模型配置和测试 -->
              <NGridItem :span="rightSpan">
                <NScrollbar :style="{ height: `${contentAreaHeight}px` }">
                  <NFlex vertical size="medium">
                    <!-- 连接测试 -->
                    <NCard title="连接测试" size="small">
                      <NFlex vertical size="medium">
                        <n-button 
                          @click="testFormConnection" 
                          :loading="testingFormConnection"
                          :disabled="!formData.baseURL || (formData.type === 'openai' && !formData.apiKey)"
                          type="info"
                          block
                        >
                          <template #icon>
                            <NIcon><Server /></NIcon>
                          </template>
                          测试连接并获取模型列表
                        </n-button>
                        
                        <!-- 测试结果显示 -->
                        <n-alert 
                          v-if="formTestResult" 
                          :type="formTestResult.success ? 'success' : 'error'"
                          :title="formTestResult.success ? '连接成功' : '连接失败'"
                        >
                          {{ formTestResult.success 
                            ? `发现 ${formTestResult.models?.length || 0} 个可用模型` 
                            : formTestResult.error 
                          }}
                        </n-alert>
                      </NFlex>
                    </NCard>

                    <!-- 模型配置 -->
                    <NCard title="模型配置" size="small">
                      <NFlex vertical size="medium">
                        <n-form-item label="模型列表" path="models">
                          <n-dynamic-tags v-model:value="formData.models" />
                        </n-form-item>
                        
                        <n-form-item label="默认模型" path="defaultModel">
                          <n-select 
                            v-model:value="formData.defaultModel" 
                            :options="modelOptions"
                            placeholder="选择默认模型"
                            filterable
                            tag
                            clearable
                          />
                        </n-form-item>
                        
                        <n-form-item label="自定义模型" path="customModel">
                          <n-input v-model:value="formData.customModel" placeholder="输入自定义模型名称（可选）" />
                        </n-form-item>
                      </NFlex>
                    </NCard>
                  </NFlex>
                </NScrollbar>
              </NGridItem>
            </NGrid>
          </n-form>
        </NScrollbar>
      </template>      <!-- 底部固定区域 -->
      <template #footer>
        <NFlex justify="space-between" style="padding: 16px; height: 100%;">
          <div>
            <!-- 左侧可以放置一些辅助信息或操作 -->
          </div>
          <NFlex>
            <n-button @click="closeModal">取消</n-button>
            <n-button type="primary" @click="saveConfig" :loading="saving">
              {{ editingConfig ? '更新配置' : '添加配置' }}
            </n-button>
          </NFlex>
        </NFlex>
      </template>
    </CommonModal>

    <!-- 智能测试结果弹窗 -->
    <n-modal v-model:show="showIntelligentTestResult" preset="dialog" style="width: 600px">
      <template #header>
        <NFlex align="center" style="gap: 8px">
          <NIcon size="24">
            <Robot />
          </NIcon>
          <NText strong>智能测试结果</NText>
        </NFlex>
      </template>

      <div v-if="intelligentTestResult">
        <n-alert v-if="intelligentTestResult.success" type="success" title="测试成功">
          <div style="margin-top: 12px;">
            <div style="margin-bottom: 16px;">
              <strong>输入 Prompt:</strong>
              <div style="background: var(--code-color); padding: 12px; border-radius: 6px; margin-top: 8px; white-space: pre-wrap; font-family: monospace;">
                {{ intelligentTestResult.inputPrompt }}
              </div>
            </div>
            <div>
              <strong>AI 回复:</strong>
              <div style="background: var(--code-color); padding: 12px; border-radius: 6px; margin-top: 8px; white-space: pre-wrap;">
                {{ intelligentTestResult.response }}
              </div>
            </div>
          </div>
        </n-alert>
        <n-alert v-else type="error" title="测试失败">
          <div v-if="intelligentTestResult.inputPrompt" style="margin-bottom: 12px;">
            <strong>尝试发送的 Prompt:</strong>
            <div style="background: var(--code-color); padding: 12px; border-radius: 6px; margin-top: 8px; white-space: pre-wrap; font-family: monospace;">
              {{ intelligentTestResult.inputPrompt }}
            </div>
          </div>
          <div>
            <strong>错误信息:</strong> {{ intelligentTestResult.error }}
          </div>
        </n-alert>
      </div>
      
      <template #action>
        <n-button @click="showIntelligentTestResult = false">关闭</n-button>
      </template>
    </n-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch, defineExpose } from 'vue'
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
    NAlert,
    NEmpty,
    NGrid,
    NGridItem,
    useMessage 
} from 'naive-ui'
import { Plus, Robot, DatabaseOff, Server, Settings } from '@vicons/tabler'
import type { AIConfig } from '~/lib/db'
import { databaseService } from '~/lib/db'
import { useDatabase } from '~/composables/useDatabase'
import { useWindowSize } from '~/composables/useWindowSize'
import CommonModal from '~/components/common/CommonModal.vue'

const message = useMessage()
const { isDatabaseReady, safeDbOperation, waitForDatabase } = useDatabase()
const { modalWidth } = useWindowSize()

// 布局高度常量
const headerHeight = 120
const footerHeight = 80
const contentPadding = 24

// 数据状态
const configs = ref<AIConfig[]>([])
const showAddModal = ref(false)
const editingConfig = ref<AIConfig | null>(null)
const saving = ref(false)
const testingConfigs = ref(new Set<number>())
const intelligentTestingConfigs = ref(new Set<number>())
const testingFormConnection = ref(false)
const formTestResult = ref<{ success: boolean; models?: string[]; error?: string } | null>(null)
const showIntelligentTestResult = ref(false)
const intelligentTestResult = ref<{ success: boolean; response?: string; error?: string; inputPrompt?: string } | null>(null)
const autoShowAddModal = ref(false)

// 表单数据
const formData = reactive({
  type: 'openai' as 'openai' | 'ollama',
  name: '',
  baseURL: '',
  apiKey: '',
  models: [] as string[],
  defaultModel: '',
  customModel: ''
})

// 表单校验规则
const formRules = {
  type: [
    { required: true, message: '请选择类型', trigger: 'change' }
  ],
  name: [
    { required: true, message: '请输入配置名称', trigger: 'blur' }
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
const modalRef = ref<InstanceType<typeof CommonModal> | null>(null)

// 网格布局计算
const gridCols = computed(() => {
  return modalWidth.value > 1000 ? 12 : 12
})

// 左侧网格大小（基本配置）
const leftSpan = computed(() => {
  return modalWidth.value > 1000 ? 7 : 12
})

// 右侧网格大小（模型配置）
const rightSpan = computed(() => {
  return modalWidth.value > 1000 ? 5 : 12
})

// 获取内容高度
const contentHeight = computed(() => {
  return modalRef.value?.contentHeight || 400
})

// 计算内容区域高度
const contentAreaHeight = computed(() => {
  const modalHeight = modalRef.value?.contentHeight || 500
  return modalHeight - 48 // 减去一些内边距
})

// 计算属性：模型选项
const modelOptions = computed(() => {
  return formData.models.map(model => ({
    label: model,
    value: model
  }))
})

// 加载配置列表
const loadConfigs = async () => {
  const result = await safeDbOperation(
    () => databaseService.getAllAIConfigs(),
    []
  )
  if (result) {
    configs.value = result
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
        type: formData.type,
        name: formData.name,
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
        type: formData.type,
        name: formData.name,
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

// 表单内测试连接并获取模型
const testFormConnection = async () => {
  testingFormConnection.value = true
  formTestResult.value = null
  
  try {
    // 构建临时配置对象进行测试
    const tempConfig = {
      configId: 'temp_test',
      name: formData.name || 'Test',
      type: formData.type,
      baseURL: formData.baseURL,
      apiKey: formData.apiKey,
      models: [],
      enabled: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    
    const result = await window.electronAPI.ai.testConfig(tempConfig)
    formTestResult.value = result
    
    if (result.success) {
      message.success('连接测试成功')
      
      // 自动填充模型列表
      if (result.models && result.models.length > 0) {
        formData.models = [...result.models]
        
        // 如果还没有设置默认模型，自动设置第一个
        if (!formData.defaultModel && result.models.length > 0) {
          formData.defaultModel = result.models[0]
        }
        
        message.info(`已自动填充 ${result.models.length} 个可用模型`)
      }
    } else {
      message.error(`连接测试失败: ${result.error}`)
    }
  } catch (error) {
    message.error('测试失败: ' + (error as Error).message)
    formTestResult.value = { success: false, error: (error as Error).message }
  } finally {
    testingFormConnection.value = false
  }
}

// 智能测试 - 发送真实提示词
const intelligentTest = async (config: AIConfig) => {
  if (!config.id) return
  
  intelligentTestingConfigs.value.add(config.id)
  try {
    // 序列化配置对象以确保可以通过 IPC 传递
    const serializedConfig = serializeConfig(config)
    
    const result = await window.electronAPI.ai.intelligentTest(serializedConfig)
    intelligentTestResult.value = result
    showIntelligentTestResult.value = true
    
    if (result.success) {
      message.success('智能测试完成，AI已成功响应')
    } else {
      message.error(`智能测试失败: ${result.error}`)
    }
  } catch (error) {
    message.error('智能测试失败: ' + (error as Error).message)
    intelligentTestResult.value = { success: false, error: (error as Error).message }
    showIntelligentTestResult.value = true
  } finally {
    intelligentTestingConfigs.value.delete(config.id)
  }
}

// 关闭弹窗
const closeModal = () => {
  showAddModal.value = false
  editingConfig.value = null
  formTestResult.value = null
  resetForm()
}

// 重置表单
const resetForm = () => {
  formData.name = 'OpenAI 兼容' // 默认为 OpenAI 兼容
  formData.type = 'openai'
  formData.baseURL = 'https://api.openai.com/v1' // 默认填充 baseURL
  formData.apiKey = ''
  formData.models = []
  formData.defaultModel = ''
  formData.customModel = ''
  formTestResult.value = null
}

// 类型变化处理
const onTypeChange = (type: 'openai' | 'ollama') => {
  if (type === 'ollama') {
    formData.baseURL = 'http://localhost:11434'
    formData.apiKey = ''
  } else {
    formData.baseURL = 'https://api.openai.com/v1'
  }
  
  // 自动填充配置名称（仅在新建模式下，且名称为空或为之前的自动名称时）
  if (!editingConfig.value) {
    const currentName = formData.name.trim()
    const isAutoGeneratedName = currentName === '' || 
                               currentName === 'Ollama' || 
                               currentName === 'OpenAI 兼容'
    
    if (isAutoGeneratedName) {
      formData.name = type === 'ollama' ? 'Ollama' : 'OpenAI 兼容'
    }
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
onMounted(async () => {
  // 等待数据库就绪后再加载数据
  await waitForDatabase()
  loadConfigs()
})

// 监听自动显示添加配置弹窗
watch(autoShowAddModal, (show) => {
  if (show) {
    showAddModal.value = true
    autoShowAddModal.value = false // 重置状态
  }
})

// 导出方法供父组件调用
const openAddConfigModal = () => {
  autoShowAddModal.value = true
}

defineExpose({
  openAddConfigModal
})
</script>

<style scoped>
.ai-config-page {
  padding: 24px;
  overflow-y: auto;
}

.config-list {
  display: grid;
  gap: 16px;
  margin-top: 16px;
}

.config-card {
  border: 1px solid var(--border-color);
  transition: all 0.3s ease;
}

.config-card:hover {
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
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
  padding-top: 12px;
  border-top: 1px solid var(--border-color-1);
}

.config-details p {
  margin: 4px 0;
  color: var(--text-color-2);
}
</style>
