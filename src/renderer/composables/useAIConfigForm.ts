import { ref, reactive, computed } from 'vue'
import type { AIProviderType } from '@shared/types'

export interface AIConfigFormData {
  type: AIProviderType
  name: string
  baseURL: string
  apiKey: string
  models: string[]
  defaultModel: string
  customModel: string
}

export function useAIConfigForm() {
  // 表单数据
  const formData = reactive<AIConfigFormData>({
    type: 'openai',
    name: '',
    baseURL: '',
    apiKey: '',
    models: [],
    defaultModel: '',
    customModel: ''
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
    // 设置默认的Base URL - 只在非编辑模式或当前为空时填充
    const baseURLMap: Record<AIProviderType, string> = {
      openai: 'https://api.openai.com/v1',
      ollama: 'http://localhost:11434',
      lmstudio: 'http://localhost:1234/v1',
      anthropic: '',
      google: '',
      azure: '',
      deepseek: 'https://api.deepseek.com/v1',
      siliconflow: 'https://api.siliconflow.cn/v1',
      tencent: 'https://api.hunyuan.cloud.tencent.com/v1',
      aliyun: 'https://dashscope.aliyuncs.com/api/v1',
      mistral: 'https://api.mistral.ai/v1',
      zhipu: 'https://open.bigmodel.cn/api/paas/v4',
      openrouter: 'https://openrouter.ai/api/v1'
    }

    // 自动填充 Base URL（不仅仅是 placeholder）
    if (!isEditMode || !formData.baseURL) {
      formData.baseURL = baseURLMap[type] || ''
    }

    // 清空 API Key（切换类型时）
    if (!isEditMode) {
      formData.apiKey = ''
    }

    // 自动填充配置名称（仅在新建模式下）
    if (!isEditMode) {
      const nameMap: Record<AIProviderType, string> = {
        openai: 'OpenAI',
        ollama: 'Ollama',
        lmstudio: 'LM Studio',
        anthropic: 'Anthropic Claude',
        google: 'Google Gemini AI',
        azure: 'Azure OpenAI',
        openrouter: 'OpenRouter',
        mistral: 'Mistral AI',
        deepseek: 'DeepSeek',
        tencent: '腾讯云',
        aliyun: '阿里云',
        zhipu: '智谱AI',
        siliconflow: '硅基流动'
      }
      formData.name = nameMap[type] || ''
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
        placeholder: 'https://your-resource.openai.azure.com'
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
        placeholder: 'https://api.hunyuan.cloud.tencent.com/v1'
      },
      aliyun: {
        label: '阿里云 API 地址',
        placeholder: 'https://dashscope.aliyuncs.com/api/v1'
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
        placeholder: 'https://openrouter.ai/api/v1'
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
      placeholder: 'https://api.openai.com/v1'
    }
  })

  // 获取 API Key 信息（文档和获取链接）
  const getApiKeyInfo = computed(() => {
    const info: Record<string, { apiKeyUrl: string; docUrl: string }> = {
      openai: {
        apiKeyUrl: 'https://platform.openai.com/api-keys',
        docUrl: 'https://platform.openai.com/docs'
      },
      anthropic: {
        apiKeyUrl: 'https://console.anthropic.com/',
        docUrl: 'https://docs.anthropic.com/'
      },
      google: {
        apiKeyUrl: 'https://makersuite.google.com/app/apikey',
        docUrl: 'https://ai.google.dev/docs'
      },
      azure: {
        apiKeyUrl: 'https://portal.azure.com/',
        docUrl: 'https://learn.microsoft.com/en-us/azure/ai-services/openai/'
      },
      deepseek: {
        apiKeyUrl: 'https://platform.deepseek.com/api_keys',
        docUrl: 'https://platform.deepseek.com/docs'
      },
      siliconflow: {
        apiKeyUrl: 'https://cloud.siliconflow.cn/me/account/ak',
        docUrl: 'https://docs.siliconflow.cn/'
      },
      tencent: {
        apiKeyUrl: 'https://console.cloud.tencent.com/hunyuan',
        docUrl: 'https://cloud.tencent.com/document/product/1729'
      },
      aliyun: {
        apiKeyUrl: 'https://bailian.console.aliyun.com/',
        docUrl: 'https://bailian.console.aliyun.com/?tab=doc#/doc'
      },
      mistral: {
        apiKeyUrl: 'https://console.mistral.ai/api-keys/',
        docUrl: 'https://docs.mistral.ai/'
      },
      zhipu: {
        apiKeyUrl: 'https://open.bigmodel.cn/usercenter/apikeys',
        docUrl: 'https://docs.bigmodel.cn/cn/guide/start/model-overview'
      },
      openrouter: {
        apiKeyUrl: 'https://openrouter.ai/keys',
        docUrl: 'https://openrouter.ai/docs'
      },
      ollama: {
        apiKeyUrl: '',
        docUrl: 'https://github.com/ollama/ollama'
      },
      lmstudio: {
        apiKeyUrl: '',
        docUrl: 'https://lmstudio.ai/docs/app/basics'
      }
    }
    return info[formData.type] || { apiKeyUrl: '', docUrl: '' }
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
    formData.customModel = ''
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
