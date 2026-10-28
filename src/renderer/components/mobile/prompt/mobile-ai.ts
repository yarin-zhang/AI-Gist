/**
 * 移动端页面共用的 AI 小工具：模型列表、首选模型，以及把一段内容原样发给模型的对话请求。
 *
 * 「按描述生成提示词」仍然走 AIGeneratorService（会套用配置里的系统提示词）；
 * 试运行、快速优化和继续调整需要把内容原样发给模型，桌面端走主进程，移动端没有主进程，
 * 这里直接请求服务商接口，支持的服务类型与 AIGeneratorService 的移动端分支一致。
 */
import type { AIConfig } from '@shared/types/ai'
import { getConfiguredBaseURL, getDefaultModels, getProviderMetadata } from '@shared/ai-provider-metadata'
import { describeAIError, type AIErrorKind } from '~/lib/utils/ai-error'

export interface MobileModelOption {
  key: string
  config: AIConfig
  model: string
}

export interface MobileChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface MobileChatOptions {
  config: AIConfig
  model: string
  messages: MobileChatMessage[]
  systemPrompt?: string
  onPartial?: (content: string) => void
  signal?: AbortSignal
}

/** 服务商不在移动端直连支持范围内时抛出，页面据此给出本地化提示 */
export class UnsupportedProviderError extends Error {
  constructor(public readonly providerType: string) {
    super(`unsupported provider: ${providerType}`)
    this.name = 'UnsupportedProviderError'
  }
}

/** 服务商返回非 2xx 时抛出：保留状态码和原始响应体，页面据此给出本地化说明 */
export class MobileAIHttpError extends Error {
  constructor(public readonly status: number, public readonly body: string) {
    super(`HTTP ${status}${body ? ` ${body}` : ''}`)
    this.name = 'MobileAIHttpError'
  }
}

const OPENAI_COMPATIBLE = new Set<AIConfig['type']>([
  'openai', 'deepseek', 'siliconflow', 'tencent', 'aliyun', 'zhipu', 'mistral', 'openrouter',
])

/**
 * 移动端能直连的服务类型，与 runMobileChat 和 AIGeneratorService 的移动端分支一致。
 * Ollama、LM Studio 跑在电脑上，Azure OpenAI 需要部署名，这几类只能在桌面版使用。
 */
export const isMobileSupportedProvider = (type: AIConfig['type']) => (
  OPENAI_COMPATIBLE.has(type) || type === 'anthropic' || type === 'google'
)

const GOOGLE_BASE_URL = 'https://generativelanguage.googleapis.com'

/** 默认模型排第一，再列远端模型和自定义模型，去重 */
export const getConfigModels = (config: AIConfig): string[] => [...new Set([
  config.defaultModel,
  ...(Array.isArray(config.models) ? config.models : []),
  config.customModel,
].filter((model): model is string => Boolean(model)))]

export const modelKeyOf = (config: AIConfig, model: string) => `${config.configId}:${model}`

/** 只按第一个冒号拆分：Ollama 一类的模型名本身可能带冒号（llama3:latest） */
export const parseModelKey = (key: string): { configId: string; model: string } => {
  const separator = key.indexOf(':')
  if (separator === -1) return { configId: key, model: '' }
  return { configId: key.slice(0, separator), model: key.slice(separator + 1) }
}

/** 首选配置在前，每个配置下按 getConfigModels 的顺序列出模型 */
export const buildMobileModelOptions = (configs: AIConfig[]): MobileModelOption[] => (
  [...configs]
    .sort((a, b) => Number(Boolean(b.isPreferred)) - Number(Boolean(a.isPreferred)))
    .flatMap(config => getConfigModels(config).map(model => ({ key: modelKeyOf(config, model), config, model })))
)

/** 首选配置（没有就取第一个）的默认模型 */
export const pickDefaultModelKey = (configs: AIConfig[]): string => {
  const preferred = configs.find(config => config.isPreferred) ?? configs[0]
  const model = preferred ? getConfigModels(preferred)[0] : ''
  return preferred?.configId && model ? modelKeyOf(preferred, model) : ''
}

export const resolveModelKey = (configs: AIConfig[], key: string): MobileModelOption | null => {
  if (!key) return null
  const { configId, model } = parseModelKey(key)
  const config = configs.find(item => item.configId === configId)
  return config && model ? { key, config, model } : null
}

const openAIHeaders = (config: AIConfig): Record<string, string> => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (config.apiKey?.trim()) headers.Authorization = `Bearer ${config.apiKey.trim()}`
  if (config.type === 'openrouter') {
    headers['HTTP-Referer'] = 'https://getaigist.com'
    headers['X-OpenRouter-Title'] = 'AI Gist'
    headers['X-Title'] = 'AI Gist'
  }
  return headers
}

const readError = async (response: Response) => {
  let body = ''
  try {
    body = (await response.text()).slice(0, 2000)
  } catch {
    body = ''
  }
  return new MobileAIHttpError(response.status, body)
}

/** 逐行读取 SSE 流，每个 data: 负载交给 pick 取出新增文本 */
const readEventStream = async (
  response: Response,
  pick: (payload: any) => string,
  onPartial?: (content: string) => void,
): Promise<string> => {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let content = ''
  const handleLine = (line: string) => {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data:')) return
    const data = trimmed.slice(5).trim()
    if (!data || data === '[DONE]') return
    try {
      const delta = pick(JSON.parse(data))
      if (delta) {
        content += delta
        onPartial?.(content)
      }
    } catch {
      // 半截或非 JSON 的事件行直接跳过
    }
  }
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      lines.forEach(handleLine)
    }
    buffer += decoder.decode()
    handleLine(buffer)
  } finally {
    reader.releaseLock()
  }
  return content
}

/**
 * 把消息原样发给模型并返回完整回答；提供 onPartial 时流式回传不断变长的内容。
 * 通过 signal 中断时抛出 AbortError。
 */
export async function runMobileChat(options: MobileChatOptions): Promise<string> {
  const { config, model, messages, systemPrompt, onPartial, signal } = options

  if (OPENAI_COMPATIBLE.has(config.type)) {
    const url = `${getConfiguredBaseURL(config.type, config.baseURL)}/chat/completions`
    const response = await fetch(url, {
      method: 'POST',
      headers: openAIHeaders(config),
      signal,
      body: JSON.stringify({
        model,
        messages: [...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []), ...messages],
        stream: Boolean(onPartial),
      }),
    })
    if (!response.ok) throw await readError(response)
    if (onPartial && response.body) {
      return readEventStream(response, payload => payload?.choices?.[0]?.delta?.content || '', onPartial)
    }
    const data = await response.json()
    return data?.choices?.[0]?.message?.content || ''
  }

  if (config.type === 'anthropic') {
    const baseURL = (config.baseURL || 'https://api.anthropic.com').replace(/\/+$/, '')
    const response = await fetch(`${baseURL}/v1/messages`, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey || '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: model || getDefaultModels('anthropic')[0],
        max_tokens: 4000,
        ...(systemPrompt ? { system: systemPrompt } : {}),
        messages,
        stream: Boolean(onPartial),
      }),
    })
    if (!response.ok) throw await readError(response)
    if (onPartial && response.body) {
      return readEventStream(response, payload => (payload?.type === 'content_block_delta' ? payload.delta?.text || '' : ''), onPartial)
    }
    const data = await response.json()
    return data?.content?.[0]?.text || ''
  }

  if (config.type === 'google') {
    const baseURL = (config.baseURL || GOOGLE_BASE_URL).replace(/\/+$/, '')
    const target = model || getDefaultModels('google')[0]
    const response = await fetch(`${baseURL}/v1beta/models/${target}:generateContent?key=${config.apiKey || ''}`, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(systemPrompt ? { systemInstruction: { parts: [{ text: systemPrompt }] } } : {}),
        contents: messages.map(message => ({
          role: message.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: message.content }],
        })),
      }),
    })
    if (!response.ok) throw await readError(response)
    const data = await response.json()
    const text = data?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || '').join('') || ''
    onPartial?.(text)
    return text
  }

  throw new UnsupportedProviderError(config.type)
}

export const isAbortError = (error: unknown) => error instanceof DOMException
  ? error.name === 'AbortError'
  : (error as Error)?.name === 'AbortError'

// ---------- 出错时给用户看的说明 ----------

type Translate = (key: string, named?: Record<string, unknown>) => string

export interface MobileAIErrorView {
  kind: AIErrorKind | 'unsupported'
  /** 一句话的原因 */
  summary: string
  /** 怎么处理，可能为空 */
  hint?: string
  /** 原始信息（服务商的错误说明或异常文本），界面上收进「技术详情」，可能为空 */
  detail: string
}

/** 移动端生成服务的报错是「API 调用失败: 401 {...}」，换成共用归类认得的「HTTP 401 …」 */
const normalizeMobileError = (error: unknown): unknown => {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  const match = /^API 调用失败:\s*(\d{3})\s*([\s\S]*)$/.exec(message)
  return match ? `HTTP ${match[1]} ${match[2]}` : error
}

/**
 * 归类和文案与桌面端共用 lib/utils/ai-error（auth / quota / rateLimit / unreachable…），
 * 这里只补上移动端自己的情况：不支持的服务类型，以及手机上没有「本机模型服务」一说。
 */
export function describeMobileAIError(error: unknown, t: Translate): MobileAIErrorView {
  if (error instanceof UnsupportedProviderError) {
    const type = error.providerType as AIConfig['type']
    return {
      kind: 'unsupported',
      summary: t('mobilePrompt.providerUnsupported', { type: getProviderMetadata(type)?.displayName || type }),
      detail: '',
    }
  }
  const diagnosis = describeAIError(normalizeMobileError(error), { local: false }, t)
  // 手机连不上 localhost 一类的地址时，说明「检查地址和网络」比「启动 Ollama」更合适
  const kind = diagnosis.kind === 'localService' ? 'unreachable' : diagnosis.kind
  return {
    kind,
    summary: t(`aiError.${kind}.title`),
    hint: t(`aiError.${kind}.message`),
    detail: diagnosis.detail,
  }
}

/**
 * toast 这类放不下说明和详情的地方：认得的错误给一句原因，认不出的给原始文本，
 * 前面都加上「连接失败：」之类的上下文。
 */
export function describeMobileAIFailure(context: string, error: unknown, t: Translate): string {
  if (!error) return context
  const view = describeMobileAIError(error, t)
  const reason = view.kind === 'generic' ? view.detail || view.summary : view.summary
  return reason ? t('mobileAI.failedWith', { context, reason }) : context
}
