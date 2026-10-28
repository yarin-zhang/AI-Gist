import { ref, reactive, computed } from 'vue'
import type { AIProviderType } from '@shared/types'
import { getDefaultBaseURL, getProviderMetadata } from '@shared/ai-provider-metadata'
import { getConfigTypeLabel } from './ai/useAIProviderChoices'

export interface AIConfigFormData {
  type: AIProviderType
  name: string
  baseURL: string
  apiKey: string
  models: string[]
  defaultModel: string
}

export function useAIConfigForm() {
  // 表单数据
  const formData = reactive<AIConfigFormData>({
    type: 'openai',
    name: '',
    baseURL: '',
    apiKey: '',
    models: [],
    defaultModel: ''
  })

  // 计算属性：是否需要Base URL
  const needsBaseURL = computed(() => {
    return !['anthropic', 'google'].includes(formData.type)
  })

  // 计算属性：是否需要API Key
  const needsApiKey = computed(() => {
    return !['ollama', 'lmstudio'].includes(formData.type)
  })

  // 计算属性：是否可以测试连接
  const canTestConnection = computed(() => {
    // 检查是否需要 API Key
    if (needsApiKey.value) {
      if (!formData.apiKey || formData.apiKey.trim() === '') {
        return false
      }
    }

    // 检查是否需要 Base URL
    if (needsBaseURL.value) {
      if (!formData.baseURL || formData.baseURL.trim() === '') {
        return false
      }
    }

    return true
  })

  // 类型变化处理 - 自动填充默认值
  const handleTypeChange = (type: AIProviderType, isEditMode = false) => {
    // 自动填充 Base URL（不仅仅是 placeholder）
    if (!isEditMode || !formData.baseURL) {
      formData.baseURL = getDefaultBaseURL(type)
    }

    // 清空 API Key（切换类型时）
    if (!isEditMode) {
      formData.apiKey = ''
    }

    // 自动填充配置名称（仅在新建模式下）
    if (!isEditMode) {
      formData.name = getConfigTypeLabel(type)
    }

    // 清空模型相关数据
    formData.models = []
    formData.defaultModel = ''
  }

  // 获取 API Key 标签
  const getApiKeyLabel = computed(() => {
    const labels: Record<string, string> = {
      anthropic: 'Anthropic API Key',
      google: 'Google Gemini AI API Key',
      azure: 'Azure OpenAI API Key',
      deepseek: 'DeepSeek API Key',
      siliconflow: '硅基流动 API Key',
      tencent: '腾讯云 API Key',
      aliyun: '阿里云 API Key',
      mistral: 'Mistral API Key',
      zhipu: '智谱AI API Key',
      openrouter: 'OpenRouter API Key'
    }
    return labels[formData.type] || 'API Key'
  })

  // 获取 Base URL 信息
  const getBaseURLInfo = computed(() => {
    const info: Record<string, { label: string; placeholder: string }> = {
      ollama: {
        label: 'Ollama 服务地址',
        placeholder: 'http://localhost:11434'
      },
      lmstudio: {
        label: 'LM Studio 服务地址',
        placeholder: 'http://localhost:1234/v1'
      },
      azure: {
        label: 'Azure OpenAI 端点',
        placeholder: 'https://your-resource.openai.azure.com/openai/v1'
      },
      deepseek: {
        label: 'DeepSeek API 地址',
        placeholder: 'https://api.deepseek.com/v1'
      },
      siliconflow: {
        label: '硅基流动 API 地址',
        placeholder: 'https://api.siliconflow.cn/v1'
      },
      tencent: {
        label: '腾讯云 API 地址',
        placeholder: getDefaultBaseURL('tencent')
      },
      aliyun: {
        label: '阿里云 API 地址',
        placeholder: getDefaultBaseURL('aliyun')
      },
      mistral: {
        label: 'Mistral API 地址',
        placeholder: 'https://api.mistral.ai/v1'
      },
      zhipu: {
        label: '智谱 AI API 地址',
        placeholder: 'https://open.bigmodel.cn/api/paas/v4'
      },
      openrouter: {
        label: 'Base URL',
        placeholder: getDefaultBaseURL('openrouter')
      },
      anthropic: {
        label: '自定义端点（可选）',
        placeholder: '留空使用官方端点'
      },
      google: {
        label: '自定义端点（可选）',
        placeholder: '留空使用官方端点'
      }
    }
    return info[formData.type] || {
      label: 'Base URL',
      placeholder: getDefaultBaseURL('openai')
    }
  })

  // 获取 API Key 信息（文档和获取链接）
  const getApiKeyInfo = computed(() => {
    const metadata = getProviderMetadata(formData.type)
    return {
      apiKeyUrl: metadata.apiKeyUrl,
      docUrl: metadata.docUrl
    }
  })

  // 获取服务商信息
  const getServiceInfo = computed(() => {
    // 这里需要 i18n，所以返回 key，由组件自己翻译
    return {
      type: formData.type,
      hasDescription: true
    }
  })

  // 重置表单
  const resetForm = () => {
    formData.type = 'openai'
    formData.name = ''
    formData.baseURL = ''
    formData.apiKey = ''
    formData.models = []
    formData.defaultModel = ''
  }

  return {
    formData,
    needsBaseURL,
    needsApiKey,
    canTestConnection,
    handleTypeChange,
    getApiKeyLabel,
    getBaseURLInfo,
    getApiKeyInfo,
    getServiceInfo,
    resetForm
  }
}
