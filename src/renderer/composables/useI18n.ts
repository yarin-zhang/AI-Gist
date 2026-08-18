import { useI18n as useVueI18n } from 'vue-i18n'
import { computed } from 'vue'
import type { SupportedLocale } from '@shared/types/preferences'
import { applyDocumentLocale, persistUserLocale, resolveInitialLocale } from '~/i18n/locale-detection'

export function useI18n() {
  const { t, locale } = useVueI18n()

  // 支持的语言列表
  const supportedLocales = [
    { code: 'zh-CN' as const, name: '简体中文' },
    { code: 'zh-TW' as const, name: '繁體中文' },
    { code: 'en-US' as const, name: 'English' },
    { code: 'ja-JP' as const, name: '日本語' }
  ]

  // 切换语言（用户显式选择，写入本地存储）
  const switchLocale = (newLocale: SupportedLocale) => {
    locale.value = newLocale
    applyDocumentLocale(newLocale)
    persistUserLocale(newLocale)
  }

  // 当前语言：直接跟随全局 locale，避免多个组件各自持有过期副本
  const currentLocale = computed<SupportedLocale>({
    get: () => locale.value as SupportedLocale,
    set: switchLocale
  })

  // 初始化语言设置：用户选择优先，否则跟随系统语言，探测结果不落盘
  const initLocale = () => {
    const resolved = resolveInitialLocale()
    locale.value = resolved
    applyDocumentLocale(resolved)
  }

  return {
    t,
    locale,
    currentLocale,
    supportedLocales,
    switchLocale,
    initLocale
  }
}
