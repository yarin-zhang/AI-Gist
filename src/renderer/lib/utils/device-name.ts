/**
 * 云同步写进 manifest `devices` 里的设备名。
 *
 * 以前直接写整串 User-Agent（`Mozilla/5.0 … Electron/32.3.3 …`），用户认不出是哪台设备 (#489)。
 * 现在桌面端用主机名，取不到主机名、或者在手机和网页上，按平台生成「Mac 上的 AI Gist」
 * 「iPhone 上的 AI Gist」「Chrome 上的 AI Gist」这类名字。
 */
import { PlatformDetector, type Platform } from '@shared/platform'
import i18n from '../../i18n'

export interface DeviceNameEnvironment {
  platform: Platform
  userAgent: string
  maxTouchPoints: number
}

const readEnvironment = (): DeviceNameEnvironment => ({
  platform: PlatformDetector.getPlatform(),
  userAgent: typeof navigator !== 'undefined' ? navigator.userAgent || '' : '',
  maxTouchPoints: typeof navigator !== 'undefined' ? navigator.maxTouchPoints || 0 : 0
})

const translate = (key: string, named: Record<string, unknown>, fallback: string): string => {
  try {
    const translated = (i18n.global.t as (key: string, named: Record<string, unknown>) => string)(key, named)
    return translated && translated !== key ? translated : fallback
  } catch {
    return fallback
  }
}

const getOperatingSystemLabel = (userAgent: string): string => {
  if (/Macintosh|Mac OS X/i.test(userAgent)) return 'Mac'
  if (/Windows/i.test(userAgent)) return 'Windows'
  if (/CrOS/i.test(userAgent)) return 'ChromeOS'
  if (/Linux/i.test(userAgent)) return 'Linux'
  return 'PC'
}

const getBrowserLabel = (userAgent: string): string | undefined => {
  if (/Edg\//.test(userAgent)) return 'Edge'
  if (/OPR\//.test(userAgent)) return 'Opera'
  if (/Firefox\//.test(userAgent)) return 'Firefox'
  if (/Chrome\/|CriOS\//.test(userAgent)) return 'Chrome'
  if (/Safari\//.test(userAgent)) return 'Safari'
  return undefined
}

const getPlatformLabel = ({ platform, userAgent, maxTouchPoints }: DeviceNameEnvironment): string | undefined => {
  switch (platform) {
    case 'ios':
      // iPadOS 默认以桌面版 Safari 的身份访问，User-Agent 里是 Macintosh，要靠触点数区分
      return /iPad/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1) ? 'iPad' : 'iPhone'
    case 'android':
      return 'Android'
    case 'electron':
      return getOperatingSystemLabel(userAgent)
    default:
      return getBrowserLabel(userAgent)
  }
}

/** 按平台生成的设备名，不需要异步，手机端和兜底都用它 */
export function getPlatformDeviceName(environment: DeviceNameEnvironment = readEnvironment()): string {
  const label = getPlatformLabel(environment)
  if (!label) return translate('dataSync.deviceNameWeb', {}, '网页版 AI Gist')
  return translate('dataSync.deviceNameOnPlatform', { platform: label }, `${label} 上的 AI Gist`)
}

/** 主机名去掉 `.local`、`.lan` 这类局域网后缀；空白或只有后缀时返回空字符串 */
export function normalizeDeviceHostName(hostName: unknown): string {
  if (typeof hostName !== 'string') return ''
  return hostName.trim().replace(/\.(local|lan|localdomain|home)$/i, '').trim().slice(0, 64)
}

/**
 * 同步时使用的设备名：桌面端经主进程取主机名，取不到时退回按平台生成的名字。
 */
export async function resolveCloudSyncDeviceName(): Promise<string> {
  if (PlatformDetector.isElectron()) {
    try {
      const hostName = normalizeDeviceHostName(await window.electronAPI?.app?.getDeviceName?.())
      if (hostName) return hostName
    } catch {
      // 旧版本主进程没有这个接口：按平台生成
    }
  }
  return getPlatformDeviceName()
}
