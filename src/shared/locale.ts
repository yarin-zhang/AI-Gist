import type { SupportedLocale } from './types/preferences';

/**
 * 界面语言匹配规则，渲染进程（navigator.languages）和主进程（系统语言列表）共用，
 * 保证托盘、系统对话框这类原生界面和应用窗口用同一套规则选语言。
 */
export const SUPPORTED_LOCALES = ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'it-IT'] as const;

/** 判定为繁体中文的子标签 */
const TRADITIONAL_CHINESE_SUBTAGS = ['hant', 'tw', 'hk', 'mo'];

export function isSupportedLocale(value: unknown): value is SupportedLocale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/**
 * 把 BCP 47 语言标签（zh-Hans-CN、zh-Hant-TW、ja、en-GB…）映射到应用支持的语言。
 * 不认识的语言返回 null，由调用方继续尝试下一个候选。
 */
export function matchSupportedLocale(tag: string): SupportedLocale | null {
  const subtags = tag.toLowerCase().split(/[-_]/);
  const language = subtags[0];

  if (language === 'zh') {
    // zh-Hant / zh-TW / zh-HK / zh-MO 以及 zh-Hant-HK 这类组合都算繁体
    return subtags.slice(1).some(subtag => TRADITIONAL_CHINESE_SUBTAGS.includes(subtag))
      ? 'zh-TW'
      : 'zh-CN';
  }
  if (language === 'ja') return 'ja-JP';
  if (language === 'en') return 'en-US';
  if (language === 'it') return 'it-IT';
  return null;
}

/** 按偏好顺序找第一个支持的语言，全部不支持时回退到英文 */
export function pickSupportedLocale(candidates: readonly (string | null | undefined)[]): SupportedLocale {
  for (const candidate of candidates) {
    const matched = matchSupportedLocale(candidate ?? '');
    if (matched) return matched;
  }
  return 'en-US';
}
