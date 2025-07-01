import { useI18n as useVueI18n } from 'vue-i18n'
import { ref } from 'vue'

export function useI18n() {
  const { t, locale } = useVueI18n()
  
  // 支持的语言列表
  const supportedLocales = [
    { code: 'zh-CN' as const, name: '中文' },
    { code: 'en-US' as const, name: 'English' }
  ]
  
  // 当前语言
  const currentLocale = ref(locale.value)
  
  // 切换语言
  const switchLocale = (newLocale: 'zh-CN' | 'en-US') => {
    locale.value = newLocale
    currentLocale.value = newLocale
    // 保存到本地存储
    localStorage.setItem('locale', newLocale)
  }
  
  // 初始化语言设置
  const initLocale = () => {
    const savedLocale = localStorage.getItem('locale')
    if (savedLocale && ['zh-CN', 'en-US'].includes(savedLocale)) {
      switchLocale(savedLocale as 'zh-CN' | 'en-US')
    } else {
      // 如果没有保存的语言设置，使用系统语言或默认语言
      const systemLocale = navigator.language
      if (systemLocale.startsWith('zh')) {
        switchLocale('zh-CN')
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