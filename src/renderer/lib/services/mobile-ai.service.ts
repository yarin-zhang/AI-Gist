/**
 * 移动端 AI 服务
 * 直接在前端调用 AI API，不依赖 Electron
 * 针对 iOS/Capacitor 环境优化
 */

import type { AIConfig, AIConfigTestResult } from '@shared/types/ai'

/**
 * 智能测试 AI 配置
 * 发送真实的测试请求到 AI 服务
 */
export async function intelligentTestAIConfig(config: AIConfig): Promise<{
  success: boolean
  error?: string
  response?: string
  inputPrompt?: string
}> {
  const testPrompt = '请用一句话简单介绍一下你自己。'

  try {
    console.log('[AI Service] 开始智能测试:', {
      type: config.type,
      model: config.defaultModel || config.customModel,
      hasApiKey: !!config.apiKey
    })

    const model = config.defaultModel || config.customModel
    if (!model) {
      return {
        success: false,
        error: '未设置默认模型',
        inputPrompt: testPrompt
      }
    }

    // 根据不同的服务类型调用不同的 API
    switch (config.type) {
      case 'openai':
      case 'deepseek':
      case 'siliconflow':
      case 'openrouter':
      case 'mistral':
      case 'zhipu':
      case 'tencent':
      case 'aliyun':
        return await intelligentTestOpenAICompatible(config, model, testPrompt)

      case 'anthropic':
        return await intelligentTestAnthropic(config, model, testPrompt)

      case 'google':
        return await intelligentTestGoogle(config, model, testPrompt)

      default:
        return {
          success: false,
          error: `暂不支持 ${config.type} 的智能测试`,
          inputPrompt: testPrompt
        }
    }
  } catch (error) {
    console.error('[AI Service] 智能测试失败:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      inputPrompt: testPrompt
    }
  }
}

/**
 * 智能测试 OpenAI 兼容的 API
 */
async function intelligentTestOpenAICompatible(
  config: AIConfig,
  model: string,
  testPrompt: string
): Promise<{
  success: boolean
  error?: string
  response?: string
  inputPrompt?: string
}> {
  try {
    const url = `${config.baseURL}/chat/completions`

    console.log('[AI Service] 智能测试请求 URL:', url)
    console.log('[AI Service] 使用模型:', model)

    const fetchPromise = fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [
          {
            role: 'user',
            content: testPrompt
          }
        ],
        max_tokens: 100
      }),
      mode: 'cors',
      cache: 'no-cache'
    })

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('请求超时')), 30000)
    })

    const response = await Promise.race([fetchPromise, timeoutPromise])

    console.log('[AI Service] 智能测试响应状态:', response.status)

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('[AI Service] 智能测试失败:', errorData)
      return {
        success: false,
        error: errorData.error?.message || `HTTP ${response.status}`,
        inputPrompt: testPrompt
      }
    }

    const data = await response.json()
    console.log('[AI Service] 智能测试响应数据:', data)

    const responseText = data.choices?.[0]?.message?.content || '测试成功'

    return {
      success: true,
      response: responseText,
      inputPrompt: testPrompt
    }
  } catch (error) {
    console.error('[AI Service] 智能测试 OpenAI 兼容失败:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      inputPrompt: testPrompt
    }
  }
}

/**
 * 智能测试 Anthropic API
 */
async function intelligentTestAnthropic(
  config: AIConfig,
  model: string,
  testPrompt: string
): Promise<{
  success: boolean
  error?: string
  response?: string
  inputPrompt?: string
}> {
  try {
    const fetchPromise = fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey || '',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: model,
        max_tokens: 100,
        messages: [
          {
            role: 'user',
            content: testPrompt
          }
        ]
      }),
      mode: 'cors',
      cache: 'no-cache'
    })

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('请求超时')), 30000)
    })

    const response = await Promise.race([fetchPromise, timeoutPromise])

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      return {
        success: false,
        error: errorData.error?.message || `HTTP ${response.status}`,
        inputPrompt: testPrompt
      }
    }

    const data = await response.json()
    const responseText = data.content?.[0]?.text || '测试成功'

    return {
      success: true,
      response: responseText,
      inputPrompt: testPrompt
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      inputPrompt: testPrompt
    }
  }
}

/**
 * 智能测试 Google Gemini API
 */
async function intelligentTestGoogle(
  config: AIConfig,
  model: string,
  testPrompt: string
): Promise<{
  success: boolean
  error?: string
  response?: string
  inputPrompt?: string
}> {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.apiKey}`

    const fetchPromise = fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: testPrompt
              }
            ]
          }
        ]
      }),
      mode: 'cors',
      cache: 'no-cache'
    })

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('请求超时')), 30000)
    })

    const response = await Promise.race([fetchPromise, timeoutPromise])

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      return {
        success: false,
        error: errorData.error?.message || `HTTP ${response.status}`,
        inputPrompt: testPrompt
      }
    }

    const data = await response.json()
    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '测试成功'

    return {
      success: true,
      response: responseText,
      inputPrompt: testPrompt
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      inputPrompt: testPrompt
    }
  }
}

/**
 * 获取默认模型列表
 */
function getDefaultModels(providerType: string): string[] {
  switch (providerType) {
    case 'openai':
      return [
        'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo',
        'gpt-3.5-turbo-16k', 'text-davinci-003', 'text-davinci-002'
      ]
    case 'deepseek':
      return ['deepseek-chat', 'deepseek-coder']
    case 'siliconflow':
      return [
        'Qwen/Qwen2.5-7B-Instruct',
        'THUDM/glm-4-9b-chat',
        'Qwen/Qwen2.5-14B-Instruct',
        'Qwen/Qwen2.5-32B-Instruct'
      ]
    case 'tencent':
      return ['tencent/Hunyuan-A13B-Instruct']
    case 'aliyun':
      return ['qwen-turbo', 'qwen-plus', 'qwen-max', 'qwen-max-longcontext']
    case 'mistral':
      return [
        'mistral-large-latest',
        'mistral-medium-latest',
        'mistral-small-latest',
        'codestral-latest',
        'open-mistral-7b',
        'open-mixtral-8x7b',
        'open-mixtral-8x22b'
      ]
    case 'zhipu':
      return ['glm-4', 'glm-4-air', 'glm-4-flash']
    case 'openrouter':
      return ['openai/gpt-4o', 'anthropic/claude-3.5-sonnet', 'google/gemini-pro']
    default:
      return ['gpt-4', 'gpt-3.5-turbo']
  }
}

/**
 * 测试 AI 配置连接
 */
export async function testAIConfig(config: {
  type: AIConfig['type']
  baseURL: string
  apiKey?: string
}): Promise<AIConfigTestResult> {
  try {
    const { type, baseURL, apiKey } = config

    console.log('[AI Service] 开始测试连接:', {
      type,
      baseURL: baseURL?.substring(0, 30),
      hasApiKey: !!apiKey,
      apiKeyLength: apiKey?.length || 0
    })

    // 根据不同的服务类型调用不同的 API
    switch (type) {
      case 'openai':
      case 'deepseek':
      case 'siliconflow':
      case 'openrouter':
      case 'mistral':
      case 'zhipu':
      case 'tencent':
      case 'aliyun':
        return await testOpenAICompatible(baseURL, apiKey, type)

      case 'anthropic':
        return await testAnthropic(apiKey)

      case 'google':
        return await testGoogle(apiKey)

      case 'ollama':
      case 'lmstudio':
        return await testLocalService(baseURL)

      default:
        return {
          success: false,
          error: `不支持的服务类型: ${type}`
        }
    }
  } catch (error) {
    console.error('[AI Service] 测试连接失败:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

/**
 * 测试 OpenAI 兼容的 API
 */
async function testOpenAICompatible(
  baseURL: string,
  apiKey?: string,
  providerType: string = 'openai'
): Promise<AIConfigTestResult> {
  try {
    // 验证和清理 URL
    if (!baseURL || typeof baseURL !== 'string') {
      return {
        success: false,
        error: 'Base URL 不能为空'
      }
    }

    const cleanURL = baseURL.trim()
    const url = `${cleanURL}/models`

    console.log('[AI Service] 请求 URL:', url)

    // 构建请求头
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    }

    if (apiKey && typeof apiKey === 'string' && apiKey.trim()) {
      headers['Authorization'] = `Bearer ${apiKey.trim()}`
      console.log('[AI Service] 已添加 Authorization 头')
    } else {
      console.log('[AI Service] 警告：没有 API Key')
    }

    console.log('[AI Service] 请求头:', Object.keys(headers))

    // 使用 Promise.race 实现超时
    const fetchPromise = fetch(url, {
      method: 'GET',
      headers: headers,
      mode: 'cors',
      cache: 'no-cache'
    })

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('请求超时')), 15000)
    })

    const response = await Promise.race([fetchPromise, timeoutPromise])

    console.log('[AI Service] 响应状态:', response.status)
    console.log('[AI Service] 响应头 Content-Type:', response.headers.get('content-type'))

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}`
      try {
        const contentType = response.headers.get('content-type')
        if (contentType && contentType.includes('application/json')) {
          const errorData = await response.json()
          console.log('[AI Service] 错误响应数据:', errorData)
          errorMessage = errorData.error?.message || errorData.message || errorMessage
        } else {
          const errorText = await response.text()
          console.log('[AI Service] 错误响应文本:', errorText.substring(0, 200))
          if (errorText && errorText.length < 200) {
            errorMessage = `${errorMessage}: ${errorText}`
          }
        }
      } catch (e) {
        console.error('[AI Service] 解析错误响应失败:', e)
      }
      return {
        success: false,
        error: errorMessage
      }
    }

    const data = await response.json()
    console.log('[AI Service] 响应数据结构:', {
      hasData: !!data,
      dataKeys: data ? Object.keys(data) : [],
      dataType: typeof data,
      dataDataExists: !!data?.data,
      dataDataType: data?.data ? typeof data.data : 'undefined',
      dataDataIsArray: Array.isArray(data?.data),
      dataDataLength: data?.data?.length || 0
    })

    // 详细打印前几个模型
    if (data?.data && Array.isArray(data.data) && data.data.length > 0) {
      console.log('[AI Service] 前3个模型数据:', data.data.slice(0, 3))
    }

    const models = data.data?.map((m: any) => m.id) || []
    console.log('[AI Service] 解析出的模型列表:', models)
    console.log('[AI Service] 获取到模型数量:', models.length)

    if (models.length === 0) {
      console.log('[AI Service] 警告：响应成功但模型列表为空，使用默认模型列表')
      const defaultModels = getDefaultModels(providerType)
      console.log('[AI Service] 默认模型列表:', defaultModels)

      return {
        success: true,
        models: defaultModels
      }
    }

    return {
      success: true,
      models
    }
  } catch (error) {
    console.error('[AI Service] OpenAI 兼容测试失败:', error)

    let errorMessage = '连接失败'
    if (error instanceof Error) {
      if (error.message === '请求超时') {
        errorMessage = '请求超时，请检查网络连接'
      } else if (error.message.includes('Failed to fetch') || error.message.includes('Network')) {
        errorMessage = '无法连接到服务器，请检查 Base URL 和网络连接'
      } else {
        errorMessage = error.message
      }
    }

    return {
      success: false,
      error: errorMessage
    }
  }
}

/**
 * 测试 Anthropic API
 */
async function testAnthropic(apiKey?: string): Promise<AIConfigTestResult> {
  try {
    if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
      return {
        success: false,
        error: '缺少 API Key'
      }
    }

    console.log('[AI Service] 测试 Anthropic API')

    const fetchPromise = fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey.trim(),
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'test' }]
      }),
      mode: 'cors',
      cache: 'no-cache'
    })

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('请求超时')), 15000)
    })

    const response = await Promise.race([fetchPromise, timeoutPromise])

    console.log('[AI Service] Anthropic 响应状态:', response.status)

    if (response.ok || response.status === 400) {
      return {
        success: true,
        models: [
          'claude-3-5-sonnet-20241022',
          'claude-3-5-haiku-20241022',
          'claude-3-opus-20240229',
          'claude-3-sonnet-20240229',
          'claude-3-haiku-20240307'
        ]
      }
    }

    let errorMessage = `HTTP ${response.status}`
    try {
      const contentType = response.headers.get('content-type')
      if (contentType && contentType.includes('application/json')) {
        const errorData = await response.json()
        errorMessage = errorData.error?.message || errorMessage
      }
    } catch (e) {
      console.error('[AI Service] 解析 Anthropic 错误响应失败:', e)
    }

    return {
      success: false,
      error: errorMessage
    }
  } catch (error) {
    console.error('[AI Service] Anthropic 测试失败:', error)

    let errorMessage = '连接失败'
    if (error instanceof Error) {
      if (error.message === '请求超时') {
        errorMessage = '请求超时'
      } else if (error.message.includes('Failed to fetch') || error.message.includes('Network')) {
        errorMessage = '无法连接到 Anthropic 服务器'
      } else {
        errorMessage = error.message
      }
    }

    return {
      success: false,
      error: errorMessage
    }
  }
}

/**
 * 测试 Google Gemini API
 */
async function testGoogle(apiKey?: string): Promise<AIConfigTestResult> {
  try {
    if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
      return {
        success: false,
        error: '缺少 API Key'
      }
    }

    console.log('[AI Service] 测试 Google API')

    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey.trim())}`

    const fetchPromise = fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      mode: 'cors',
      cache: 'no-cache'
    })

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('请求超时')), 15000)
    })

    const response = await Promise.race([fetchPromise, timeoutPromise])

    console.log('[AI Service] Google 响应状态:', response.status)

    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}`
      try {
        const contentType = response.headers.get('content-type')
        if (contentType && contentType.includes('application/json')) {
          const errorData = await response.json()
          errorMessage = errorData.error?.message || errorMessage
        }
      } catch (e) {
        console.error('[AI Service] 解析 Google 错误响应失败:', e)
      }
      return {
        success: false,
        error: errorMessage
      }
    }

    const data = await response.json()
    const models = data.models
      ?.filter((m: any) => m.name && m.name.includes('gemini'))
      .map((m: any) => m.name.split('/').pop()) || []

    console.log('[AI Service] Google 获取到模型数量:', models.length)

    return {
      success: true,
      models
    }
  } catch (error) {
    console.error('[AI Service] Google 测试失败:', error)

    let errorMessage = '连接失败'
    if (error instanceof Error) {
      if (error.message === '请求超时') {
        errorMessage = '请求超时'
      } else if (error.message.includes('Failed to fetch') || error.message.includes('Network')) {
        errorMessage = '无法连接到 Google 服务器'
      } else {
        errorMessage = error.message
      }
    }

    return {
      success: false,
      error: errorMessage
    }
  }
}

/**
 * 测试本地服务（Ollama/LM Studio）
 */
async function testLocalService(baseURL: string): Promise<AIConfigTestResult> {
  try {
    if (!baseURL || typeof baseURL !== 'string') {
      return {
        success: false,
        error: 'Base URL 不能为空'
      }
    }

    const cleanURL = baseURL.trim()
    console.log('[AI Service] 测试本地服务:', cleanURL)

    // 尝试 Ollama API
    try {
      const ollamaURL = `${cleanURL}/api/tags`
      console.log('[AI Service] 尝试 Ollama API:', ollamaURL)

      const fetchPromise = fetch(ollamaURL, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        },
        mode: 'cors',
        cache: 'no-cache'
      })

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('请求超时')), 15000)
      })

      const response = await Promise.race([fetchPromise, timeoutPromise])

      console.log('[AI Service] Ollama 响应状态:', response.status)

      if (response.ok) {
        const data = await response.json()
        const models = data.models?.map((m: any) => m.name) || []
        console.log('[AI Service] Ollama 获取到模型数量:', models.length)
        return {
          success: true,
          models
        }
      }
    } catch (ollamaError) {
      console.log('[AI Service] Ollama API 失败，尝试 LM Studio API')
    }

    // 尝试 LM Studio API
    try {
      const lmstudioURL = `${cleanURL}/v1/models`
      console.log('[AI Service] 尝试 LM Studio API:', lmstudioURL)

      const fetchPromise = fetch(lmstudioURL, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        },
        mode: 'cors',
        cache: 'no-cache'
      })

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('请求超时')), 15000)
      })

      const response = await Promise.race([fetchPromise, timeoutPromise])

      console.log('[AI Service] LM Studio 响应状态:', response.status)

      if (response.ok) {
        const data = await response.json()
        const models = data.data?.map((m: any) => m.id) || []
        console.log('[AI Service] LM Studio 获取到模型数量:', models.length)
        return {
          success: true,
          models
        }
      }
    } catch (lmstudioError) {
      console.error('[AI Service] LM Studio API 也失败')
    }

    return {
      success: false,
      error: '无法连接到本地服务，请确保服务已启动'
    }
  } catch (error) {
    console.error('[AI Service] 本地服务测试失败:', error)

    let errorMessage = '连接失败'
    if (error instanceof Error) {
      if (error.message === '请求超时') {
        errorMessage = '请求超时，请确保本地服务已启动'
      } else if (error.message.includes('Failed to fetch') || error.message.includes('Network')) {
        errorMessage = '无法连接到本地服务，请检查 Base URL'
      } else {
        errorMessage = error.message
      }
    }

    return {
      success: false,
      error: errorMessage
    }
  }
}
