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
import { actionSheetController, alertController, loadingController } from '@ionic/vue'
import { joinSentences as joinSentencesIn } from '~/lib/utils/join-sentences'
import { getPlatformDeviceName } from '~/lib/utils/device-name'
import {
  alertCircleOutline,
  cloudDoneOutline,
  cloudOfflineOutline,
  cloudOutline,
  cloudUploadOutline,
  gitMergeOutline,
  pauseCircleOutline,
  syncOutline,
  timeOutline,
  warningOutline
} from 'ionicons/icons'
import { presentMobileToast } from '~/lib/utils/mobile-toast'
import { formatRelativeTime } from '~/lib/utils/date'
import {
  resolveDataSyncAlertType,
  resolveDataSyncStatusKind,
  type DataSyncStatusKind
} from '~/lib/utils/data-sync-status'
import {
  getCloudSyncErrorDiagnosis,
  type CloudSyncResult,
  type CloudSyncStatus
} from '~/lib/services/cloud-sync.service'
import { getCloudSyncRecordChangeMessages } from '~/lib/utils/cloud-sync-merge-notices'
import { localBackupService } from '~/lib/services/local-backup.service'
import type { MobileTileTone } from '~/components/mobile/ui/types'
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

/** 写进云端的设备名：「iPhone 上的 AI Gist」这类用户认得出的名字，不再是「ios-zh-CN」(#489) */
export const getDeviceLabel = () => getPlatformDeviceName()

/**
 * 同步失败时展示结构化诊断：先弹一条简短提示，再提供完整详情、复制和重试入口。
 */
export const presentSyncErrorDetails = async (
  error: string | CloudSyncResult | undefined,
  options: {
    storageId?: string
    onRetry?: () => void
    /** 手动同步失败时传 true：应用自己会恢复的情况（诊断的 quiet）只提示稍后会再同步，不弹详情 */
    quietWhenRecoverable?: boolean
  } = {}
) => {
  const diagnosis = getCloudSyncErrorDiagnosis(error, {
    storageId: options.storageId,
    reason: 'manual',
    status: 'error',
    timestamp: new Date().toISOString()
  })

  if (options.quietWhenRecoverable && diagnosis.quiet) {
    await showToast(translate('dataSync.syncWillRetrySoon'))
    return
  }

  // 会自动重试的临时状况（网络波动、同步任务被更新的世代取代等）用警告色提示，
  // 避免让用户误以为遇到了需要自己处理的严重错误。
  await showToast(diagnosis.message, diagnosis.canAutoRetry ? 'warning' : 'danger')

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

  // 只放说明和建议；原始错误是写给开发者看的，放在「复制」出来的详情里，反馈问题时用
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
  cancelText?: string
  destructive?: boolean
}): Promise<boolean> => {
  const alert = await alertController.create({
    header: options.header,
    message: options.message,
    cssClass: 'mobile-alert-preserve-lines',
    buttons: [
      { text: options.cancelText || translate('common.cancel'), role: 'cancel' },
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

/**
 * 底部弹出的单选列表（间隔、保留份数等），代替 ion-select 让分组行保持 V5 的样式。
 * 选中项前面加 ✓，取消或点遮罩时返回 undefined。
 */
export const pickOption = async <T extends string | number>(options: {
  header: string
  current: T
  items: { value: T; label: string }[]
}): Promise<T | undefined> => {
  let picked: T | undefined
  const sheet = await actionSheetController.create({
    header: options.header,
    buttons: [
      ...options.items.map(item => ({
        text: item.value === options.current ? `✓ ${item.label}` : item.label,
        handler: () => { picked = item.value }
      })),
      { text: translate('common.cancel'), role: 'cancel' }
    ]
  })
  await sheet.present()
  await sheet.onDidDismiss()
  await settleOverlays()
  return picked
}

/** 自动同步 / 自动备份共用的间隔文案 */
export const formatIntervalMinutes = (minutes: number) => {
  if (minutes < 60) return translate('dataBackup.backupEveryMinutes', { count: minutes })
  if (minutes < 1440) return translate('dataBackup.backupEveryHours', { count: minutes / 60 })
  if (minutes === 1440) return translate('dataBackup.backupEveryDay')
  return translate('dataBackup.backupEveryDays', { count: minutes / 1440 })
}

export const currentLocale = () => String(i18n.global.locale.value || 'zh-CN')

/** 「2 分钟前」这类相对时间，按当前界面语言输出 */
export const formatRelative = (value?: string | null, now = new Date()) =>
  value ? formatRelativeTime(value, currentLocale(), now) : ''

/**
 * 两句说明接在一起（规则见 lib/utils/join-sentences.ts），默认按当前界面语言。
 * （桌面端共用的 statusRetryScheduledDescription 用「；」连接，诊断说明本身已带句号，会出现「。；」）
 */
export const joinSentences = (first: string, second: string, locale = currentLocale()) =>
  joinSentencesIn(first, second, locale)

export type MobileSyncStatusKind = DataSyncStatusKind | 'restorePaused'
export type MobileSyncTone = 'success' | 'info' | 'warning' | 'error'

export interface MobileSyncStatusView {
  kind: MobileSyncStatusKind
  tone: MobileSyncTone
  /** 彩色图标方块的色调，和 tone 一一对应 */
  tileTone: MobileTileTone
  icon: string
  title: string
  description: string
}

const TILE_TONE: Record<MobileSyncTone, MobileTileTone> = {
  success: 'success',
  info: 'soft',
  warning: 'warning',
  error: 'error'
}

/**
 * 设置首页的同步状态卡和数据同步页的状态卡共用同一套判断。
 *
 * 标题和颜色直接来自桌面端的 resolveDataSyncStatusKind / resolveDataSyncAlertType，
 * 保证两端对同一个状态说同样的话、用同样的颜色。移动端只在前面多两条规则：
 * - 没有任何存储配置时一律显示「尚未配置」，避免让用户以为同步已经在工作；
 * - 本地恢复后同步被挂起（等用户选择合并或覆盖云端）时显示「恢复后已暂停」，
 *   这时服务状态是 paused，桌面端的判断会落到「已是最新」，不能沿用。
 */
export const describeSyncStatus = (input: {
  status: CloudSyncStatus
  autoSyncEnabled: boolean
  storageCount: number
  restoreSuspensionCount: number
}): MobileSyncStatusView => {
  const { status } = input
  const view = (kind: MobileSyncStatusKind, tone: MobileSyncTone, icon: string, title: string, description: string) =>
    ({ kind, tone, tileTone: TILE_TONE[tone], icon, title, description })

  if (input.storageCount === 0) {
    return view('notConfigured', 'info', cloudOfflineOutline,
      translate('dataSync.statusNotConfigured'), translate('dataSync.statusNotConfiguredDescription'))
  }
  if (input.restoreSuspensionCount > 0) {
    return view('restorePaused', 'warning', pauseCircleOutline,
      translate('cloudBackup.syncStatusValues.paused'), translate('cloudBackup.restoreDecisionDescription'))
  }

  const diagnosis = getCloudSyncErrorDiagnosis(status.lastResult || status.error, {
    storageId: status.storageId,
    reason: status.reason,
    status: status.status,
    failureCount: status.failureCount,
    timestamp: status.updatedAt
  })
  // 应用自己会恢复、用户做不了什么的失败（诊断的 quiet），显示成等待下次同步，不报失败
  const failed = status.status === 'error'
  const isError = failed && !diagnosis.quiet
  const hasScheduledRetry = isError && status.pending && !!status.nextSyncAt
  const kind = resolveDataSyncStatusKind({
    hasScheduledRetry,
    isError,
    canAutoRetryError: diagnosis.canAutoRetry,
    autoSyncEnabled: input.autoSyncEnabled,
    isSyncing: status.status === 'syncing',
    pendingChanges: !!status.pendingChanges || (failed && !isError),
    hasSucceededBefore: !!(status.lastSyncAt || status.lastResult?.success),
    hasStorageConfigs: input.storageCount > 0,
    hasPendingConflict: status.status === 'conflict'
  })
  const tone = resolveDataSyncAlertType(kind, diagnosis.canAutoRetry)

  switch (kind) {
    case 'retryScheduled':
      return view(kind, tone, timeOutline, translate('dataSync.statusRetryScheduled'),
        joinSentences(diagnosis.message, translate('mobileSettings.sync.retryAt', { time: formatRelative(status.nextSyncAt) })))
    case 'error':
      return view(kind, tone, tone === 'warning' ? warningOutline : alertCircleOutline, diagnosis.title, diagnosis.message)
    case 'conflict': {
      // 两边都改过的数据在等用户选择，同步本身没有出错，不能按错误展示
      const count = status.pendingConflict?.items.length || 0
      return view(kind, tone, gitMergeOutline,
        count > 0 ? translate('mobileSettings.sync.conflictTitle', { count }) : translate('mobileSettings.sync.conflictTitleUnknown'),
        translate('mobileSettings.sync.conflictDescription'))
    }
    case 'paused':
      return view(kind, tone, pauseCircleOutline, translate('dataSync.statusPaused'), translate('dataSync.statusPausedDescription'))
    case 'syncing':
      return view(kind, tone, syncOutline, translate('dataSync.statusSyncing'), translate('dataSync.statusSyncingDescription'))
    case 'pending':
      return view(kind, tone, cloudUploadOutline, translate('dataSync.statusPending'), translate('dataSync.pendingChanges'))
    case 'current':
      // 刚恢复了本机删除过的记录、或有提示词移到了「未分类」时，状态卡上说明一下，直到下一次同步 (#489)
      return view(kind, tone, cloudDoneOutline, translate('dataSync.statusCurrent'),
        getCloudSyncRecordChangeMessages(status.lastResult).reduce((text, sentence) => joinSentences(text, sentence), '')
          || translate('mobileSettings.sync.noPendingChanges'))
    case 'ready':
      return view(kind, tone, cloudOutline, translate('dataSync.statusReady'), translate('dataSync.statusAutomaticDescription'))
    default:
      return view('notConfigured', tone, cloudOfflineOutline,
        translate('dataSync.statusNotConfigured'), translate('dataSync.statusNotConfiguredDescription'))
  }
}

/** 本机备份的摘要（版本数、最近一份的时间），设置首页和数据备份页共用 */
export const loadLocalBackupSummary = async (): Promise<{ count: number; latestAt?: string }> => {
  try {
    const backups = await localBackupService.list()
    return { count: backups.length, latestAt: backups[0]?.createdAt }
  } catch (error) {
    console.error('加载本地备份列表失败:', error)
    return { count: 0 }
  }
}

/**
 * 冲突处理面板挂在数据同步页上。其他页面（比如设置首页的状态卡）想直接打开它时，
 * 先在这里登记一次请求再跳转，同步页进入时取走请求并打开面板；只生效一次，
 * 之后从子页面返回同步页不会再次弹出。
 */
let conflictSheetRequested = false

export const requestConflictSheet = () => {
  conflictSheetRequested = true
}

export const consumeConflictSheetRequest = () => {
  const requested = conflictSheetRequested
  conflictSheetRequested = false
  return requested
}
