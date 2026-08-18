/**
 * 移动端设置页面共用的格式化与提示工具。
 *
 * 这些页面都遵循同一条规则：所有云端读写都走 `CloudBackupAPI`，
 * 由它按平台分发到 Electron / 移动端 / Web 后端，页面本身不直接
 * 引用某个平台的实现，避免不同入口写到不同的存储里。
 *
 * 弹窗文案一律使用纯文本：项目没有开启 Ionic 的 innerHTMLTemplatesEnabled，
 * 在 alert 的 message 里写 HTML 只会把标签原样显示给用户。
 */
import { alertController, loadingController } from '@ionic/vue'
import { Capacitor } from '@capacitor/core'
import { presentMobileToast } from '~/lib/utils/mobile-toast'
import {
  getCloudSyncErrorDiagnosis,
  type CloudSyncResult
} from '~/lib/services/cloud-sync.service'
import i18n from '~/i18n'

const translate = (key: string, named?: Record<string, unknown>) =>
  (i18n.global.t as (key: string, named?: Record<string, unknown>) => string)(key, named)

export const showToast = async (message: string, color = 'success') => {
  await presentMobileToast(message, color)
}

/** 让出一个宏任务，等 Ionic 的 overlay 队列把上一个弹窗的退出动画走完再叠下一个。 */
const settleOverlays = () => new Promise<void>(resolve => setTimeout(resolve, 0))

/**
 * Ionic 偶尔会卡住 overlay 的退出动画，让 dismiss() 永远不 resolve，
 * 结果就是一个再也点不掉的加载遮罩。这里加超时兜底并强制摘除元素。
 */
const dismissOverlay = async (overlay: { dismiss(): Promise<boolean>; remove(): void; isConnected: boolean }) => {
  await Promise.race([
    overlay.dismiss().catch(() => undefined),
    new Promise(resolve => setTimeout(resolve, 2000))
  ])
  if (overlay.isConnected) overlay.remove()
}

/**
 * 统一的「加载遮罩 + 异步任务」包装：无论任务成功、失败还是抛错，遮罩都会消失。
 */
export const withLoading = async <T>(message: string, task: () => Promise<T>): Promise<T> => {
  await settleOverlays()
  const loading = await loadingController.create({ message })
  await loading.present()
  try {
    return await task()
  } finally {
    await dismissOverlay(loading as unknown as Parameters<typeof dismissOverlay>[0])
  }
}

export const formatDateTime = (value?: string | null) => {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString()
}

export const formatSize = (size?: number) => {
  if (!size || Number.isNaN(size) || size <= 0) return '0 B'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

export const getDeviceLabel = () => {
  const language = typeof navigator !== 'undefined' ? navigator.language : 'unknown-locale'
  return `${Capacitor.getPlatform()}-${language || 'unknown-locale'}`
}

/**
 * 同步失败时展示结构化诊断：先弹一条简短提示，再提供完整详情、复制和重试入口。
 */
export const presentSyncErrorDetails = async (
  error: string | CloudSyncResult | undefined,
  options: { storageId?: string; onRetry?: () => void } = {}
) => {
  const diagnosis = getCloudSyncErrorDiagnosis(error, {
    storageId: options.storageId,
    reason: 'manual',
    status: 'error',
    timestamp: new Date().toISOString()
  })

  await showToast(diagnosis.message, 'danger')

  const buttons: Parameters<typeof alertController.create>[0]['buttons'] = [
    {
      text: translate('common.copy'),
      handler: () => {
        void copyText(diagnosis.copyText)
        return false
      }
    }
  ]
  if (options.onRetry) {
    buttons.push({
      text: translate('dataSync.retrySync'),
      handler: () => { options.onRetry?.() }
    })
  }
  buttons.push({ text: translate('common.close'), role: 'cancel' })

  const alert = await alertController.create({
    header: diagnosis.title,
    message: [
      diagnosis.message,
      '',
      `${translate('dataSync.suggestedActions')}:`,
      ...diagnosis.suggestedActions.map(action => `· ${action}`)
    ].join('\n'),
    cssClass: 'mobile-alert-preserve-lines',
    buttons
  })
  await alert.present()
}

const copyText = async (value: string) => {
  try {
    await navigator.clipboard.writeText(value)
    await showToast(translate('dataSync.errorDetailsCopied'))
  } catch {
    await showToast(translate('dataSync.errorDetailsCopyFailed'), 'danger')
  }
}

/**
 * 统一的确认框，避免每个页面重复搭 alertController。
 */
export const confirmAction = async (options: {
  header: string
  message: string
  confirmText?: string
  destructive?: boolean
}): Promise<boolean> => {
  const alert = await alertController.create({
    header: options.header,
    message: options.message,
    cssClass: 'mobile-alert-preserve-lines',
    buttons: [
      { text: translate('common.cancel'), role: 'cancel' },
      {
        text: options.confirmText || translate('common.confirm'),
        role: options.destructive ? 'destructive' : 'confirm'
      }
    ]
  })

  await alert.present()
  const { role } = await alert.onDidDismiss()
  await settleOverlays()
  return role !== 'cancel' && role !== 'backdrop'
}
