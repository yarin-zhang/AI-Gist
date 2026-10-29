import { watch } from 'vue'
import type { SupportedLocale } from '@shared/types/preferences'
import i18n from '~/i18n'

/**
 * 把当前界面语言告诉桌面端主进程：托盘菜单、关闭确认框、文件选择框和系统通知不经过
 * vue-i18n，要靠主进程自己的文案表，跟着这里上报的语言切换。
 * Web 和移动端没有这个接口，直接跳过。
 */
export function startUiLocaleSync(): void {
  const report = (locale: string) => {
    const setUiLocale = window.electronAPI?.preferences?.setUiLocale
    if (typeof setUiLocale !== 'function') return
    setUiLocale(locale as SupportedLocale).catch(error => {
      console.warn('同步界面语言到主进程失败:', error)
    })
  }
  watch(() => i18n.global.locale.value, report, { immediate: true })
}
