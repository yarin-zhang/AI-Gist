import { useI18n as useVueI18n } from 'vue-i18n'
import { ref } from 'vue'
import type { SupportedLocale } from '@shared/types/preferences'

export function useI18n() {
  const { t, locale } = useVueI18n()
  
  // 支持的语言列表
  const supportedLocales = [
    { code: 'zh-CN' as const, name: '简体中文' },
    { code: 'zh-TW' as const, name: '繁體中文' },
    { code: 'en-US' as const, name: 'English' },
    { code: 'ja-JP' as const, name: '日本語' }
  ]
  
  // 当前语言
  const currentLocale = ref(locale.value)
  
  // 切换语言
  const switchLocale = (newLocale: SupportedLocale) => {
    locale.value = newLocale
    currentLocale.value = newLocale
    // 保存到本地存储
    localStorage.setItem('locale', newLocale)
  }
  
  // 初始化语言设置
  const initLocale = () => {
    const savedLocale = localStorage.getItem('locale')
    if (savedLocale && ['zh-CN', 'zh-TW', 'en-US', 'ja-JP'].includes(savedLocale)) {
      switchLocale(savedLocale as SupportedLocale)
    } else {
      // 如果没有保存的语言设置，使用系统语言或默认语言
      const systemLocale = navigator.language
      if (systemLocale.startsWith('zh')) {
        // 根据系统语言判断是简体还是繁体
        if (systemLocale.includes('TW') || systemLocale.includes('HK')) {
          switchLocale('zh-TW')
        } else {
          switchLocale('zh-CN')
        }
      } else if (systemLocale.startsWith('ja')) {
        switchLocale('ja-JP')
      } else {
        switchLocale('en-US')
      }
    }
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