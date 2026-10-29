import type { AIConfig } from '@shared/types/ai'

/**
 * AI 请求失败时，后端、主进程和服务商给出的报错五花八门（fetch failed、整段 JSON、HTML 页面、
 * 服务商英文原文）。这里把常见失败归成几类，给出用户能看懂的说明和下一步，原始信息只作为次要细节保留。
 */
export type AIErrorKind =
  | 'auth' // Key 不对或没有权限
  | 'quota' // 余额或额度不足
  | 'rateLimit' // 请求太频繁，被限流
  | 'unreachable' // 地址连不上：域名、网络、证书
  | 'localService' // 本机的模型服务没有启动（Ollama、LM Studio）
  | 'timeout' // 等太久没有响应
  | 'model' // 模型不存在或账户不能用
  | 'endpoint' // 能连上，但地址不是 AI 接口（返回 404 页面、HTML）
  | 'server' // 服务商出错
  | 'generic'

export interface AIErrorDiagnosis {
  kind: AIErrorKind
  title: string
  message: string
  /** 去掉包装、解析过 JSON / HTML 的原始报错，界面里折叠在「技术详情」里 */
  detail: string
  /** 稍后重试有可能成功；Key、额度、模型、地址这几类要先改配置 */
  retryable: boolean
}

export interface AIErrorContext {
  /** 请求的是本机服务：本机连不上时提示「服务没有启动」而不是「地址错误」 */
  local?: boolean
}

type Translate = (key: string, named?: Record<string, unknown>) => string

/** 连接测试、模型测试、获取模型列表的默认超时 */
export const AI_TEST_TIMEOUT_MS = 45_000
export const AI_MODEL_LIST_TIMEOUT_MS = 20_000

/** 等太久没有响应。报错原文是英文技术信息，只出现在「技术详情」里 */
export class AIRequestTimeoutError extends Error {
  constructor(public readonly timeoutMs: number) {
    super(`Request timed out after ${Math.round(timeoutMs / 1000)}s`)
    this.name = 'AIRequestTimeoutError'
  }
}

/**
 * 给一次 AI 请求加超时。底层请求可能停不下来（主进程、Web 后端都没有取消接口），
 * 这里只保证界面不再一直等它；超时后迟到的结果由调用方丢弃。
 */
export function withAIRequestTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new AIRequestTimeoutError(timeoutMs)), timeoutMs)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

const LOCAL_PROVIDER_TYPES = new Set(['ollama', 'lmstudio'])
const LOCAL_HOST = /^(?:localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|\[?::1\]?|[\w-]+\.local)$/i

/** 配置指向本机服务：Ollama / LM Studio，或者地址是 localhost */
export function isLocalAIConfig(config: Pick<AIConfig, 'type' | 'baseURL'> | null | undefined): boolean {
  if (!config) return false
  if (LOCAL_PROVIDER_TYPES.has(config.type)) return true
  try {
    return LOCAL_HOST.test(new URL(config.baseURL || '').hostname)
  } catch {
    return false
  }
}

const toRawMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message || error.name
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && 'error' in error) return String((error as { error: unknown }).error ?? '')
  return error == null ? '' : String(error)
}

const stripHtml = (html: string): string => {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]
  const text = title || html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')
  return text.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
}

/** 服务商常见的 JSON 报错：{ error: { message } }、{ message }、{ error: "..." }、{ detail } */
const readJsonMessage = (text: string): string | null => {
  const start = text.indexOf('{')
  if (start < 0) return null
  try {
    const data = JSON.parse(text.slice(start))
    const error = data?.error
    const message = (typeof error === 'object' && error ? error.message || error.msg || error.type : error)
      || data?.message || data?.msg || data?.detail
    if (!message) return null
    const prefix = text.slice(0, start).trim()
    return [prefix, typeof message === 'string' ? message : JSON.stringify(message)].filter(Boolean).join(' ')
  } catch {
    return null
  }
}

/** 隐去报错里可能带出来的密钥：sk-xxx、Bearer xxx、?key=xxx */
const redactSecrets = (text: string): string => text
  .replace(/\b(sk-(?:ant-|proj-)?)[A-Za-z0-9_-]{8,}/g, '$1****')
  .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9+/_=.-]{8,}/gi, '$1 ****')
  .replace(/([?&](?:api[_-]?key|key|token)=)[^&#\s]+/gi, '$1****')

const STATUS_PATTERNS = [
  /\bHTTP\s*(\d{3})\b/i,
  /\bstatus(?:\s*code)?\s*[:=]?\s*(\d{3})\b/i,
  /"status"\s*:\s*(\d{3})/,
  /^\s*(\d{3})\b/,
  /\b(\d{3})\s+(?:Not Found|Unauthorized|Forbidden|Payment Required|Too Many Requests|Internal Server Error|Bad Gateway|Service Unavailable|Gateway Timeout)\b/i,
]

const readStatus = (text: string): number | null => {
  for (const pattern of STATUS_PATTERNS) {
    const match = text.match(pattern)
    if (match) {
      const status = Number(match[1])
      if (status >= 400 && status <= 599) return status
    }
  }
  return null
}

/**
 * 去掉后端 / 主进程套的包装（Electron IPC 的「Error invoking remote method」、「xx 请求失败（HTTP 401）：」、
 * 「❌ 模型 x 测试失败:」、一层层叠起来的「生成失败:」），只留服务商的原话
 */
const unwrap = (text: string): string => text
  .replace(/^Error invoking remote method '[^']*':\s*(?:\w*Error:\s*)?/i, '')
  .replace(/^❌\s*/, '')
  .replace(/^模型\s+\S+\s+测试失败[:：]\s*/, '')
  .replace(/^(?:(?:生成失败|连接测试失败|模型列表请求失败|连接失败)[:：]\s*)+/, '')
  .replace(/^[^（(]{0,40}请求失败[（(]HTTP\s*\d{3}[）)][:：]?\s*/, '')
  .replace(/^Request failed with status code \d{3}[:：]?\s*/i, '')
  .trim()

/** 状态码可能在包装里（「请求失败（HTTP 401）」），也可能在去掉包装后的开头（「401 Unauthorized」） */
const readRawStatus = (raw: string): number | null => readStatus(raw) ?? readStatus(unwrap(raw))

/** 把原始报错整理成一行能读的细节：解析 JSON、HTML，带上 HTTP 状态码，隐去密钥 */
export function extractAIErrorDetail(error: unknown): string {
  const raw = toRawMessage(error).trim()
  if (!raw) return ''
  const status = readRawStatus(raw)
  let text = unwrap(raw)
  if (/<(?:!doctype|html|body|head|h1|title)\b/i.test(text)) text = stripHtml(text)
  else text = readJsonMessage(text) ?? text
  text = redactSecrets(text.replace(/\s+/g, ' ').trim())
  if (text.length > 300) text = `${text.slice(0, 300)}…`
  if (status && !text.includes(String(status))) text = text ? `HTTP ${status} · ${text}` : `HTTP ${status}`
  return text
}

const CONNECTION_FAILURE = /ECONNREFUSED|ENOTFOUND|EAI_AGAIN|EHOSTUNREACH|ENETUNREACH|ECONNRESET|getaddrinfo|fetch failed|failed to fetch|load failed|network ?error|networkerror|socket hang up|ERR_NAME_NOT_RESOLVED|ERR_CONNECTION|ERR_INTERNET_DISCONNECTED|certificate|CERT_|self[- ]signed|\bSSL\b|\bTLS\b|EPROTO|invalid url|ERR_INVALID_URL|无法连接/i

/** 只按报错内容归类，不依赖界面语言 */
export function classifyAIError(error: unknown, context: AIErrorContext = {}): AIErrorKind {
  if (error instanceof AIRequestTimeoutError) return 'timeout'
  const raw = toRawMessage(error)
  const text = `${raw} ${extractAIErrorDetail(raw)}`
  const status = readRawStatus(raw)

  // 「每分钟配额用完」这类按时间窗口的限制算限流，不算余额不足
  if (/insufficient[_ ]?(?:quota|balance|credit|funds)|credit balance|exceeded your current quota|billing|payment required|余额|额度不足|欠费|arrearage/i.test(text) || status === 402) return 'quota'
  if (status === 401 || status === 403
    || /unauthori[sz]ed|forbidden|invalid[_ ]?(?:api[_ ]?)?key|incorrect api key|api[_ -]?key.{0,20}(?:invalid|not valid|missing|required|expired)|authentication|permission[_ ]denied|access denied|API Key\s*(?:无效|不能为空)|未提供API密钥|访问被拒绝/i.test(text)) return 'auth'
  if (status === 429 || /rate[_ ]?limit|too many requests|resource[_ ]exhausted|quota exceeded|请求频率|频率超限/i.test(text)) return 'rateLimit'
  if (/model[_ ]?not[_ ]?found|no such model|unknown model|invalid model|model not exist|model\b.{0,80}\b(?:does not exist|not found|not available|not supported|is not a valid)|does not exist.{0,40}model|模型不存在|未指定模型|未设置默认模型/i.test(text)) return 'model'
  if (/AIRequestTimeoutError|ETIMEDOUT|timed? ?out|timeout|deadline exceeded|超时/i.test(text) || status === 408 || status === 504) return 'timeout'
  if (CONNECTION_FAILURE.test(text)) {
    const localTarget = context.local || /localhost|127\.0\.0\.1|\[::1\]|:11434|:1234\b/i.test(text)
    return localTarget && !/ENOTFOUND|certificate|CERT_|invalid url/i.test(text) ? 'localService' : 'unreachable'
  }
  if (status === 404 || status === 405 || /<(?:!doctype|html|body)\b|not found|unexpected token.{0,40}json|is not valid json|服务端点不存在|Base URL 不能为空|未提供基础URL/i.test(text)) return 'endpoint'
  if ((status && status >= 500) || /server[_ ]error|internal (?:server )?error|bad gateway|service unavailable|overloaded|服务器内部错误|服务暂时不可用/i.test(text)) return 'server'
  return 'generic'
}

const RETRYABLE = new Set<AIErrorKind>(['rateLimit', 'unreachable', 'localService', 'timeout', 'server', 'generic'])

/**
 * 归类并给出本地化的标题和说明。t 由调用方传入（组件里的 useI18n().t），
 * 这个文件不直接依赖 i18n 实例，纯逻辑的地方也能引用。
 */
export function describeAIError(error: unknown, context: AIErrorContext, t: Translate): AIErrorDiagnosis {
  const kind = classifyAIError(error, context)
  const detail = extractAIErrorDetail(error)
  return {
    kind,
    title: t(`aiError.${kind}.title`),
    // 认不出原因、也没有原始报错可看（服务只回了「失败」）：不提「见技术详情」，直接说该检查什么
    message: kind === 'generic' && !detail ? t('aiError.generic.messageNoDetail') : t(`aiError.${kind}.message`),
    detail,
    retryable: RETRYABLE.has(kind),
  }
}
