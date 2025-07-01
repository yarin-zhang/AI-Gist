import { useI18n as useVueI18n } from 'vue-i18n'
import { ref } from 'vue'

export function useI18n() {
  const { t, locale } = useVueI18n()
  
  // 支持的语言列表
  const supportedLocales = [
    { code: 'zh-CN', name: '中文' },
    { code: 'en-US', name: 'English' }
  ]
  
  // 当前语言
  const currentLocale = ref(locale.value)
  
  // 切换语言
  const switchLocale = (newLocale: string) => {
    locale.value = newLocale
    currentLocale.value = newLocale
    // 保存到本地存储
    localStorage.setItem('locale', newLocale)
  }
  
  // 初始化语言设置
  const initLocale = () => {
    const savedLocale = localStorage.getItem('locale')
    if (savedLocale && supportedLocales.some(l => l.code === savedLocale)) {
      switchLocale(savedLocale)
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