import type { SupportedLocale } from '@shared/types/preferences'
import { isSupportedLocale, pickSupportedLocale, SUPPORTED_LOCALES } from '@shared/locale'

export { isSupportedLocale, SUPPORTED_LOCALES }

export const LOCALE_STORAGE_KEY = 'locale'
/** 标记 locale 是用户显式选择的，而不是自动探测的结果 */
export const LOCALE_SOURCE_STORAGE_KEY = 'locale-source'

/** 按系统语言偏好顺序探测语言，全部不支持时回退到英文 */
export function detectPreferredLocale(): SupportedLocale {
  const candidates = navigator.languages?.length ? navigator.languages : [navigator.language]
  return pickSupportedLocale(candidates)
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
  'ja-JP': 'ja',
  'it-IT': 'it'
}

/** 同步 <html lang>，用于 :lang() 选择 CJK 回退字体，同时改善断行与无障碍朗读 */
export function applyDocumentLocale(locale: SupportedLocale): void {
  document.documentElement.lang = HTML_LANG_BY_LOCALE[locale]
}
