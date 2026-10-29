/**
 * 快捷键保存失败的原因码。
 *
 * 主进程只抛错误码，由渲染进程翻译成当前界面语言：ipcRenderer.invoke 抛回来的错误只保留
 * message，并且会加上 "Error invoking remote method 'shortcuts:…': Error: " 前缀，
 * 直接显示 message 会把这段前缀和主进程写死的中文一起露给用户。
 */
export const SHORTCUT_ERROR_CODES = [
  /** 没有按下任何键 */
  'empty',
  /** 没有修饰键（Ctrl / ⌘ / Alt / Shift），也不是 F1–F24 */
  'modifier-required',
  /** Esc / Enter / Tab 这类单键不能做全局快捷键 */
  'reserved-key',
  /** AI Gist 里已经有别的功能用了这个组合 */
  'duplicate',
  /** 被其他应用或系统占用 */
  'in-use',
] as const;

export type ShortcutErrorCode = (typeof SHORTCUT_ERROR_CODES)[number];

const SHORTCUT_ERROR_PATTERN = /SHORTCUT_ERROR:([a-z-]+)/;

export function isShortcutErrorCode(value: unknown): value is ShortcutErrorCode {
  return typeof value === 'string' && (SHORTCUT_ERROR_CODES as readonly string[]).includes(value);
}

export function createShortcutError(code: ShortcutErrorCode): Error {
  return new Error(`SHORTCUT_ERROR:${code}`);
}

/** 从主进程抛回来的错误里取出错误码，认不出来时返回 null */
export function readShortcutErrorCode(error: unknown): ShortcutErrorCode | null {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const code = message.match(SHORTCUT_ERROR_PATTERN)?.[1];
  return isShortcutErrorCode(code) ? code : null;
}
