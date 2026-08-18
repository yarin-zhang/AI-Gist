import type { SupportedLocale } from '@shared/types/preferences'

export const SUPPORTED_LOCALES = ['zh-CN', 'zh-TW', 'en-US', 'ja-JP'] as const

export const LOCALE_STORAGE_KEY = 'locale'
/** 标记 locale 是用户显式选择的，而不是自动探测的结果 */
export const LOCALE_SOURCE_STORAGE_KEY = 'locale-source'

/** 判定为繁体中文的子标签 */
const TRADITIONAL_CHINESE_SUBTAGS = ['hant', 'tw', 'hk', 'mo']

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value)
}

/**
 * 把 BCP 47 语言标签（zh-Hans-CN、zh-Hant-TW、ja、en-GB…）映射到应用支持的语言。
 * 不认识的语言返回 null，由调用方继续尝试下一个候选。
 */
function matchLocale(tag: string): SupportedLocale | null {
  const subtags = tag.toLowerCase().split(/[-_]/)
  const language = subtags[0]

  if (language === 'zh') {
    // zh-Hant / zh-TW / zh-HK / zh-MO 以及 zh-Hant-HK 这类组合都算繁体
    return subtags.slice(1).some(subtag => TRADITIONAL_CHINESE_SUBTAGS.includes(subtag))
      ? 'zh-TW'
      : 'zh-CN'
  }
  if (language === 'ja') return 'ja-JP'
  if (language === 'en') return 'en-US'
  return null
}

/** 按系统语言偏好顺序探测语言，全部不支持时回退到英文 */
export function detectPreferredLocale(): SupportedLocale {
  const candidates = navigator.languages?.length ? navigator.languages : [navigator.language]

  for (const candidate of candidates) {
    const matched = matchLocale(candidate ?? '')
    if (matched) return matched
  }

  return 'en-US'
}

/**
 * 读取用户显式选择过的语言。
 *
 * 只认带来源标记的值：旧版本会把自动探测的结果写进同一个键，而 iOS WebView 在应用
 * 未声明 CFBundleLocalizations 时始终上报 en-US，中文/日文系统因此被永久锁在英文界面。
 * 没有标记的旧值一律丢弃并重新探测，用户仍可在设置里改回来。
 */
export function readStoredLocale(): SupportedLocale | null {
  if (localStorage.getItem(LOCALE_SOURCE_STORAGE_KEY) !== 'user') return null

  const stored = localStorage.getItem(LOCALE_STORAGE_KEY)
  return isSupportedLocale(stored) ? stored : null
}

/** 保存用户在设置里选择的语言 */
export function persistUserLocale(locale: SupportedLocale): void {
  localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  localStorage.setItem(LOCALE_SOURCE_STORAGE_KEY, 'user')
}

/** 启动时确定语言：用户选择优先，否则跟随系统。自动探测结果不写入存储 */
export function resolveInitialLocale(): SupportedLocale {
  return readStoredLocale() ?? detectPreferredLocale()
}

/** 界面语言对应的 <html lang> 值 */
const HTML_LANG_BY_LOCALE: Record<SupportedLocale, string> = {
  'zh-CN': 'zh-Hans',
  'zh-TW': 'zh-Hant',
  'en-US': 'en',
  'ja-JP': 'ja'
}

/** 同步 <html lang>，用于 :lang() 选择 CJK 回退字体，同时改善断行与无障碍朗读 */
export function applyDocumentLocale(locale: SupportedLocale): void {
  document.documentElement.lang = HTML_LANG_BY_LOCALE[locale]
}
