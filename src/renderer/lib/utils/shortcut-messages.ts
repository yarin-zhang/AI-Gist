import type { PasteUnavailableReason } from '@shared/types/preferences'
import { readShortcutErrorCode } from '@shared/shortcut-errors'

type Translate = (key: string) => string

/**
 * 保存快捷键失败时给用户看的话。
 * 主进程只抛错误码；认不出来的错误（IPC 断开等）用户没法处理，只提示再试一次，原始报错写日志。
 */
export function describeShortcutError(error: unknown, t: Translate): string {
  const code = readShortcutErrorCode(error)
  switch (code) {
    case 'empty':
      return t('shortcuts.errors.empty')
    case 'modifier-required':
      return t('shortcuts.errors.modifierRequired')
    case 'reserved-key':
      return t('shortcuts.errors.reservedKey')
    case 'duplicate':
      return t('shortcuts.errors.duplicate')
    case 'in-use':
      return t('shortcuts.errors.inUse')
    default:
      console.error('保存快捷键失败:', error)
      return t('shortcuts.errors.saveFailed')
  }
}

/** 自动粘贴不可用时的说明：能处理的（授权、安装 xdotool）说怎么办，处理不了的只说会改为复制 */
export function describePasteUnavailable(reason: PasteUnavailableReason | undefined, t: Translate): string {
  switch (reason) {
    case 'accessibility-permission':
      return t('shortcuts.pasteUnavailable.accessibility')
    case 'xdotool-missing':
      return t('shortcuts.pasteUnavailable.xdotool')
    default:
      return t('shortcuts.pasteUnavailable.copyOnly')
  }
}
