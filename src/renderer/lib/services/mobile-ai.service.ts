/**
 * 移动端 AI 服务
 * 直接在前端调用 AI API，不依赖 Electron
 * 针对 iOS/Capacitor 环境优化
 */

import type { AIConfig, AIConfigTestResult } from '@shared/types/ai'
import {
  getConfiguredBaseURL,
  getDefaultModels as getProviderDefaultModels
} from '@shared/ai-provider-metadata'

const GOOGLE_BASE_URL = 'https://generativelanguage.googleapis.com'
const GOOGLE_API_VERSION = 'v1beta'
const PROVIDERS_WITHOUT_MODEL_LIST = new Set<AIConfig['type']>(['aliyun', 'tencent', 'zhipu'])

function getModelListURL(providerType: AIConfig['type'], baseURL: string): string {
  const configuredBaseURL = getConfiguredBaseURL(providerType, baseURL)
  if (providerType === 'deepseek') {
    return `${configuredBaseURL.replace(/\/v1$/, '')}/models`
  }
  return `${configuredBaseURL}/models`
}

function parseModelIds(data: any): string[] {
  const rawModels = Array.isArray(data) ? data : data?.data
  if (!Array.isArray(rawModels)) return []
  return rawModels
    .map((m: any) => m?.id)
    .filter((id: unknown): id is string => typeof id === 'string' && id.trim().length > 0)
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 15000): Promise<Response> {
  const fetchPromise = fetch(url, options)
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('请求超时')), timeoutMs)
  })
  return await Promise.race([fetchPromise, timeoutPromise])
}

/**
 * 判断异常是否为“网络层失败”（fetch 本身没有发出/收到响应）。
 *
 * 浏览器对 fetch() 网络层失败（DNS 失败、连接被拒绝/重置、CORS 拦截、
 * ATS 拦截、离线等）统一抛出 TypeError，但各引擎的 message 文案完全不同：
 *   - Chrome/Edge (Chromium)      -> "Failed to fetch"
 *   - Firefox                     -> "NetworkError when attempting to fetch resource."
 *   - Safari / WebKit（iOS WKWebView 用的正是这套引擎）
 *                                  -> "Type error"（较老版本）或 "Load failed"（新版本）
 *
 * 之前的代码只匹配了 Chrome/Firefox 的文案，导致移动端（iOS 使用 WKWebView）
 * 发生网络层失败时，WebKit 抛出的原始 "TypeError: Type error" 未被识别，
 * 从而把这个对用户毫无意义的浏览器内部错误文案直接展示了出来——这正是
 * 「测试连接」在 iOS 上显示 "Type Error" 的根本原因。
 *
 * 这里改为按错误的类型（TypeError）而不是具体文案来判断，可以覆盖所有
 * 引擎的网络层失败文案，而不需要逐一穷举每个浏览器的措辞。
 */
function isNetworkLayerError(error: unknown): boolean {
  return error instanceof TypeError
}

async function readErrorMessage(response: Response): Promise<string> {
  let errorMessage = `HTTP ${response.status}`
  try {
    const contentType = response.headers.get('content-type')
    if (contentType && contentType.includes('application/json')) {
      const errorData = await response.json()
      return errorData.error?.message || errorData.message || errorMessage
    }

    const errorText = await response.text()
    if (errorText && errorText.length < 200) {
      errorMessage = `${errorMessage}: ${errorText}`
    }
  } catch (e) {
    console.error('[AI Service] 解析错误响应失败:', e)
  }
  return errorMessage
}

async function validateDefaultOpenAICompatibleModel(
  baseURL: string,
  apiKey: string | undefined,
  providerType: AIConfig['type']
): Promise<void> {
  const model = getDefaultModels(providerType)[0]
  if (!model) {
    throw new Error('没有可用于测试的默认模型')
  }

  const url = `${getConfiguredBaseURL(providerType, baseURL)}/chat/completions`
  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: buildOpenAICompatibleHeaders({ type: providerType, apiKey }),
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: 'test' }],
      max_tokens: 1,
      stream: false
    }),
    mode: 'cors',
    cache: 'no-cache'
  }, 20000)

  if (!response.ok) {
    throw new Error(await readErrorMessage(response))
  }
}

function buildOpenAICompatibleHeaders(config: AIConfig | { type: AIConfig['type']; apiKey?: string }): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }

  if (config.apiKey && config.apiKey.trim()) {
    headers.Authorization = `Bearer ${config.apiKey.trim()}`
  }

  if (config.type === 'openrouter') {
    headers['HTTP-Referer'] = 'https://getaigist.com'
    headers['X-OpenRouter-Title'] = 'AI Gist'
    headers['X-Title'] = 'AI Gist'
  }

  return headers
}

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
    const baseURL = getConfiguredBaseURL(config.type, config.baseURL)
    const url = `${baseURL}/chat/completions`

    console.log('[AI Service] 智能测试请求 URL:', url)
    console.log('[AI Service] 使用模型:', model)

    const fetchPromise = fetch(url, {
      method: 'POST',
      headers: buildOpenAICompatibleHeaders(config),
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
    const baseURL = config.baseURL?.trim() || GOOGLE_BASE_URL
    const url = `${baseURL}/${GOOGLE_API_VERSION}/models/${model}:generateContent?key=${config.apiKey}`

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
function getDefaultModels(providerType: AIConfig['type']): string[] {
  return getProviderDefaultModels(providerType)
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
      case 'tencent':
      case 'aliyun':
      case 'zhipu':
        return await testOpenAICompatible(baseURL, apiKey, type)

      case 'anthropic':
        return await testAnthropic(apiKey)

      case 'google':
        return await testGoogle(apiKey)

      case 'ollama':
      case 'lmstudio':
        return await testLocalService(baseURL, type)

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
  providerType: AIConfig['type'] = 'openai'
): Promise<AIConfigTestResult> {
  try {
    // 验证和清理 URL
    const configuredBaseURL = getConfiguredBaseURL(providerType, baseURL)
    if (!configuredBaseURL || typeof configuredBaseURL !== 'string') {
      return {
        success: false,
        error: 'Base URL 不能为空'
      }
    }

    if (PROVIDERS_WITHOUT_MODEL_LIST.has(providerType)) {
      await validateDefaultOpenAICompatibleModel(baseURL, apiKey, providerType)
      const defaultModels = getDefaultModels(providerType)
      return {
        success: true,
        models: defaultModels,
        modelSource: 'default',
        modelListMessage: `${providerType} 未提供可用的远端模型列表接口，已使用内置默认模型`
      }
    }

    const url = getModelListURL(providerType, baseURL)

    console.log('[AI Service] 请求 URL:', url)

    // 构建请求头
    const headers = buildOpenAICompatibleHeaders({ type: providerType, apiKey })
    if (headers.Authorization) {
      console.log('[AI Service] 已添加 Authorization 头')
    } else {
      console.log('[AI Service] 警告：没有 API Key')
    }

    console.log('[AI Service] 请求头:', Object.keys(headers))

    const response = await fetchWithTimeout(url, {
      method: 'GET',
      headers: headers,
      mode: 'cors',
      cache: 'no-cache'
    })

    console.log('[AI Service] 响应状态:', response.status)
    console.log('[AI Service] 响应头 Content-Type:', response.headers.get('content-type'))

    if (!response.ok) {
      return {
        success: false,
        error: await readErrorMessage(response)
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

    const models = parseModelIds(data)
    console.log('[AI Service] 解析出的模型列表:', models)
    console.log('[AI Service] 获取到模型数量:', models.length)

    if (models.length === 0) {
      console.log('[AI Service] 警告：响应成功但模型列表为空，使用默认模型列表')
      const defaultModels = getDefaultModels(providerType)
      console.log('[AI Service] 默认模型列表:', defaultModels)

      return {
        success: true,
        models: defaultModels,
        modelSource: defaultModels.length > 0 ? 'default' : 'unavailable',
        modelListMessage: defaultModels.length > 0 ? '远端模型列表为空，已使用内置默认模型' : '远端模型列表为空，请手动添加模型'
      }
    }

    return {
      success: true,
      models,
      modelSource: 'remote',
      modelListMessage: `已从远端获取到 ${models.length} 个可用模型`
    }
  } catch (error) {
    console.error('[AI Service] OpenAI 兼容测试失败:', error)

    let errorMessage = '连接失败'
    if (error instanceof Error) {
      if (error.message === '请求超时') {
        errorMessage = '请求超时，请检查网络连接'
      } else if (isNetworkLayerError(error) || error.message.includes('Failed to fetch') || error.message.includes('Network')) {
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

    const response = await fetchWithTimeout('https://api.anthropic.com/v1/models', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey.trim(),
        'anthropic-version': '2023-06-01'
      },
      mode: 'cors',
      cache: 'no-cache'
    })

    console.log('[AI Service] Anthropic 响应状态:', response.status)

    if (response.ok) {
      const data = await response.json()
      const models = parseModelIds(data)
      const defaultModels = getDefaultModels('anthropic')
      return {
        success: true,
        models: models.length > 0 ? models : defaultModels,
        modelSource: models.length > 0 ? 'remote' : (defaultModels.length > 0 ? 'default' : 'unavailable'),
        modelListMessage: models.length > 0 ? `已从远端获取到 ${models.length} 个可用模型` : '远端模型列表为空，已使用内置默认模型'
      }
    }

    return {
      success: false,
      error: await readErrorMessage(response)
    }
  } catch (error) {
    console.error('[AI Service] Anthropic 测试失败:', error)

    let errorMessage = '连接失败'
    if (error instanceof Error) {
      if (error.message === '请求超时') {
        errorMessage = '请求超时'
      } else if (isNetworkLayerError(error) || error.message.includes('Failed to fetch') || error.message.includes('Network')) {
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

    const response = await fetchWithTimeout(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      mode: 'cors',
      cache: 'no-cache'
    })

    console.log('[AI Service] Google 响应状态:', response.status)

    if (!response.ok) {
      return {
        success: false,
        error: await readErrorMessage(response)
      }
    }

    const data = await response.json()
    const models = data.models
      ?.filter((m: any) => {
        const supportedMethods = m.supportedGenerationMethods || m.supported_actions || m.supportedActions || []
        return m.name && m.name.includes('gemini') && (
          supportedMethods.length === 0 || supportedMethods.includes('generateContent')
        )
      })
      .map((m: any) => m.name.split('/').pop()) || []

    console.log('[AI Service] Google 获取到模型数量:', models.length)

    return {
      success: true,
      models: models.length > 0 ? models : getDefaultModels('google'),
      modelSource: models.length > 0 ? 'remote' : 'default',
      modelListMessage: models.length > 0 ? `已从远端获取到 ${models.length} 个可用模型` : '远端模型列表为空，已使用内置默认模型'
    }
  } catch (error) {
    console.error('[AI Service] Google 测试失败:', error)

    let errorMessage = '连接失败'
    if (error instanceof Error) {
      if (error.message === '请求超时') {
        errorMessage = '请求超时'
      } else if (isNetworkLayerError(error) || error.message.includes('Failed to fetch') || error.message.includes('Network')) {
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
async function testLocalService(baseURL: string, providerType: 'ollama' | 'lmstudio'): Promise<AIConfigTestResult> {
  try {
    if (!baseURL || typeof baseURL !== 'string') {
      return {
        success: false,
        error: 'Base URL 不能为空'
      }
    }

    const cleanURL = baseURL.trim()
    console.log('[AI Service] 测试本地服务:', cleanURL)

    if (providerType === 'ollama') {
      const ollamaURL = `${cleanURL}/api/tags`
      console.log('[AI Service] 尝试 Ollama API:', ollamaURL)

      const response = await fetchWithTimeout(ollamaURL, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        },
        mode: 'cors',
        cache: 'no-cache'
      })

      console.log('[AI Service] Ollama 响应状态:', response.status)

      if (response.ok) {
        const data = await response.json()
        const models = data.models?.map((m: any) => m.name) || []
        console.log('[AI Service] Ollama 获取到模型数量:', models.length)
        return {
          success: true,
          models,
          modelSource: models.length > 0 ? 'remote' : 'unavailable',
          modelListMessage: models.length > 0 ? `已从本地服务获取到 ${models.length} 个可用模型` : 'Ollama 当前未返回模型，请先拉取模型'
        }
      }

      return {
        success: false,
        error: '无法连接到 Ollama 服务，请确保服务已启动'
      }
    }

    try {
      const lmstudioURL = cleanURL.endsWith('/v1') ? `${cleanURL}/models` : `${cleanURL}/v1/models`
      console.log('[AI Service] 尝试 LM Studio API:', lmstudioURL)

      const response = await fetchWithTimeout(lmstudioURL, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        },
        mode: 'cors',
        cache: 'no-cache'
      })

      console.log('[AI Service] LM Studio 响应状态:', response.status)

      if (response.ok) {
        const data = await response.json()
        const models = data.data?.map((m: any) => m.id) || []
        console.log('[AI Service] LM Studio 获取到模型数量:', models.length)
        return {
          success: true,
          models,
          modelSource: models.length > 0 ? 'remote' : 'unavailable',
          modelListMessage: models.length > 0 ? `已从本地服务获取到 ${models.length} 个可用模型` : 'LM Studio 当前未返回模型，请先加载或下载模型'
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
      } else if (isNetworkLayerError(error) || error.message.includes('Failed to fetch') || error.message.includes('Network')) {
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
