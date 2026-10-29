import { reactive } from 'vue'
import { api } from '~/lib/api'
import type { AIConfig } from '@shared/types'
import { getConfigModels, isMobileSupportedProvider } from '~/components/mobile/prompt/mobile-ai'

export interface ConnectionStatus {
  state: 'testing' | 'ok' | 'error'
  /** 连接成功时的耗时（毫秒） */
  elapsed?: number
  error?: string
  /** 测试时的服务类型、地址和凭据指纹；配置改过以后旧结果不再算数 */
  fingerprint?: string
}

const STORAGE_KEY = 'mobile_ai_connection_status'

/** 只用来判断连接信息有没有变，不保存 API Key 本身 */
export const connectionFingerprint = (config: Pick<AIConfig, 'type' | 'baseURL' | 'apiKey'>) => {
  const text = `${config.type}|${(config.baseURL || '').trim()}|${(config.apiKey || '').trim()}`
  let hash = 5381
  for (let index = 0; index < text.length; index += 1) hash = ((hash << 5) + hash + text.charCodeAt(index)) | 0
  return (hash >>> 0).toString(36)
}

const readStored = (): Record<number, ConnectionStatus> => {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

/**
 * 每个配置最近一次「测试连接」的结果。模型页的首选卡片、列表和配置详情页读同一份；
 * 测完的结果（不含进行中的状态）存在本机，重开 App 后仍然显示上次的结果。
 */
export const connectionStatuses = reactive<Record<number, ConnectionStatus>>(readStored())

const persist = () => {
  try {
    const finished = Object.fromEntries(Object.entries(connectionStatuses).filter(([, status]) => status.state !== 'testing'))
    localStorage.setItem(STORAGE_KEY, JSON.stringify(finished))
  } catch {
    // 本机存储不可用时只影响重开 App 后的显示
  }
}

export const forgetConnectionStatus = (id?: number) => {
  if (id === undefined) return
  delete connectionStatuses[id]
  persist()
}

/** 记下一次测试结果（编辑页测完再保存时也走这里） */
export const rememberConnectionStatus = (config: Pick<AIConfig, 'id' | 'type' | 'baseURL' | 'apiKey'>, status: ConnectionStatus) => {
  if (config.id === undefined) return
  connectionStatuses[config.id] = { ...status, fingerprint: connectionFingerprint(config) }
  persist()
}

/** 这个配置当前有效的测试结果：配置的地址或凭据改过以后返回 undefined */
export const statusForConfig = (config: AIConfig): ConnectionStatus | undefined => {
  if (config.id === undefined) return undefined
  const status = connectionStatuses[config.id]
  if (!status) return undefined
  if (status.fingerprint && status.fingerprint !== connectionFingerprint(config)) return undefined
  return status
}

/** 用已保存的地址和凭据测试连接，记下结果和耗时 */
export const testSavedConfigConnection = async (config: AIConfig): Promise<ConnectionStatus> => {
  const id = config.id
  const started = performance.now()
  if (id !== undefined) connectionStatuses[id] = { state: 'testing' }

  let status: ConnectionStatus
  try {
    const result = await api.aiConfigs.test.mutate({
      type: config.type,
      baseURL: config.baseURL,
      apiKey: config.apiKey
    })
    status = result.success
      ? { state: 'ok', elapsed: Math.round(performance.now() - started) }
      : { state: 'error', error: result.error }
  } catch (error) {
    console.error('测试连接失败:', error)
    status = { state: 'error', error: error instanceof Error ? error.message : String(error) }
  }

  rememberConnectionStatus(config, status)
  return status
}

/**
 * 配置在列表、详情和首选卡片上显示的状态，三处用同一套判断：
 * 禁用 > 仅桌面版 > 测试中 > 连接失败 > 未选择模型 > 连接成功 > 未验证。
 */
export type ConnectionBadge = 'disabled' | 'desktopOnly' | 'testing' | 'error' | 'noModel' | 'ok' | 'untested'

export const connectionBadgeOf = (config: AIConfig, status = statusForConfig(config)): ConnectionBadge => {
  if (!config.enabled) return 'disabled'
  if (!isMobileSupportedProvider(config.type)) return 'desktopOnly'
  if (status?.state === 'testing') return 'testing'
  if (status?.state === 'error') return 'error'
  if (!getConfigModels(config).length) return 'noModel'
  if (status?.state === 'ok') return 'ok'
  return 'untested'
}

type Translate = (key: string, named?: Record<string, unknown>) => string

export interface ConnectionBadgeView {
  badge: ConnectionBadge
  label: string
  /** m-pill 的色调类 */
  tone: string
  /** 圆点颜色：ok / err / warn，空表示不显示 */
  dot: '' | 'ok' | 'err' | 'warn'
}

/** withElapsed：详情页和首选卡片在「连接成功」后面带上耗时 */
export const connectionBadgeView = (
  config: AIConfig,
  t: Translate,
  options: { withElapsed?: boolean } = {}
): ConnectionBadgeView => {
  const status = statusForConfig(config)
  const badge = connectionBadgeOf(config, status)
  switch (badge) {
    case 'disabled':
      return { badge, label: t('models.disabled'), tone: '', dot: '' }
    case 'desktopOnly':
      return { badge, label: t('mobileModels.desktopOnly'), tone: '', dot: '' }
    case 'testing':
      return { badge, label: t('mobileModels.testing'), tone: 'm-pill-blue', dot: '' }
    case 'error':
      return { badge, label: t('mobileModels.connectionFailedShort'), tone: 'm-pill-err', dot: 'err' }
    case 'noModel':
      return { badge, label: t('mobileModels.noModelSelected'), tone: 'm-pill-warn', dot: 'warn' }
    case 'ok':
      return {
        badge,
        label: options.withElapsed && status?.elapsed !== undefined
          ? `${t('models.connectionOk')} · ${t('models.elapsed', { ms: status.elapsed })}`
          : t('mobileModels.statusAvailable'),
        tone: 'm-pill-ok',
        dot: 'ok'
      }
    default:
      return { badge, label: t('models.connectionUnverifiedTag'), tone: '', dot: '' }
  }
}
