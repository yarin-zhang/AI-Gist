const isMacPlatform = (): boolean => typeof navigator !== 'undefined' && navigator.platform.includes('Mac')

/** 把 Electron 的 accelerator 写法转成界面上显示的按键，macOS 用符号，其他平台用 Ctrl/Alt */
export function displayAccelerator(accelerator: string, isMac = isMacPlatform()): string {
  if (!accelerator) return ''
  if (!isMac) {
    return accelerator
      .replace(/CommandOrControl/g, 'Ctrl')
      .replace(/Control/g, 'Ctrl')
  }

  return accelerator
    .replace(/CommandOrControl|Command/g, '⌘')
    .replace(/Control/g, '⌃')
    .replace(/Alt|Option/g, '⌥')
    .replace(/Shift/g, '⇧')
    .replace(/\+/g, '')
}

/** 界面里写死的组合键提示（⌘↵、⌘S 等）在非 macOS 上换成 Ctrl 写法 */
export function displayShortcutHint(macHint: string, otherHint: string, isMac = isMacPlatform()): string {
  return isMac ? macHint : otherHint
}
