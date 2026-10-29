// @vitest-environment node

// 快捷键保存失败、自动粘贴不可用、启动器通知：以前主进程直接抛中文报错，经 IPC 到界面上变成
// 「Error invoking remote method 'shortcuts:update-command': Error: 快捷键已被其他应用或系统占用」。
// 现在主进程只给错误码 / 原因码，界面按当前语言翻译；系统通知不再带 osascript / xdotool 的原始报错。

import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '../../src/renderer/i18n'
import { createShortcutError, readShortcutErrorCode, SHORTCUT_ERROR_CODES } from '../../src/shared/shortcut-errors'
import { describePasteUnavailable, describeShortcutError } from '../../src/renderer/lib/utils/shortcut-messages'

const electronMock = vi.hoisted(() => ({
  userDataDir: '',
  registerResult: true,
  notifications: [] as { title: string; body: string }[],
  trusted: false,
}))

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => (name === 'userData' ? electronMock.userDataDir : os.tmpdir()),
    getName: () => 'ai-gist-test',
    focus: () => undefined,
    getPreferredSystemLanguages: () => ['en-US'],
  },
  BrowserWindow: class {},
  clipboard: { writeText: () => undefined },
  globalShortcut: {
    register: () => electronMock.registerResult,
    unregister: () => undefined,
    unregisterAll: () => undefined,
    isRegistered: () => false,
  },
  Notification: class {
    static isSupported() { return true }
    constructor(private readonly options: { title: string; body: string }) {}
    show() { electronMock.notifications.push(this.options) }
  },
  nativeTheme: { shouldUseDarkColors: false, themeSource: 'system', on: () => undefined },
  screen: {},
  systemPreferences: { isTrustedAccessibilityClient: () => electronMock.trusted },
}))

const translate = (key: string) => (i18n.global.t as (key: string) => string)(key)
const ipcError = (channel: string, error: Error) =>
  new Error(`Error invoking remote method '${channel}': ${error}`)

describe('shortcut error codes', () => {
  afterEach(() => {
    i18n.global.locale.value = 'zh-CN'
  })

  it('reads the code back from an IPC-wrapped error', () => {
    for (const code of SHORTCUT_ERROR_CODES) {
      expect(readShortcutErrorCode(ipcError('shortcuts:update-command', createShortcutError(code)))).toBe(code)
    }
    expect(readShortcutErrorCode(new Error('快捷键已被其他应用或系统占用'))).toBeNull()
    expect(readShortcutErrorCode(undefined)).toBeNull()
  })

  it('shows translated text without the IPC prefix or the code', () => {
    i18n.global.locale.value = 'zh-CN'
    const zh = describeShortcutError(ipcError('shortcuts:update-command', createShortcutError('in-use')), translate)
    expect(zh).toBe('这个组合被其他应用或系统占用了，换一个试试。')

    i18n.global.locale.value = 'en-US'
    for (const code of SHORTCUT_ERROR_CODES) {
      const text = describeShortcutError(ipcError('shortcuts:upsert-prompt-binding', createShortcutError(code)), translate)
      expect(text).not.toMatch(/Error invoking|SHORTCUT_ERROR|shortcuts:/)
      expect(text).not.toMatch(/[一-鿿]/)
    }
  })

  it('falls back to "try again" for errors the user cannot act on, and logs the original', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    i18n.global.locale.value = 'en-US'
    const raw = ipcError('shortcuts:update-command', new Error('Main window is not ready yet'))

    expect(describeShortcutError(raw, translate)).toBe("Couldn't save the shortcut. Try again.")
    expect(consoleError).toHaveBeenCalledWith('保存快捷键失败:', raw)
  })

  it('explains auto-paste only in terms the user can act on', () => {
    i18n.global.locale.value = 'zh-CN'
    expect(describePasteUnavailable('accessibility-permission', translate)).toContain('辅助功能权限')
    expect(describePasteUnavailable('xdotool-missing', translate)).toContain('安装 xdotool')
    expect(describePasteUnavailable('wayland', translate)).toBe('这台电脑不支持自动粘贴，只会复制到剪贴板。')
    expect(describePasteUnavailable('unsupported-platform', translate)).toBe(describePasteUnavailable('wayland', translate))
  })
})

describe('ShortcutManager returns codes instead of Chinese messages', () => {
  type ShortcutManagerModule = typeof import('../../src/main/electron/shortcut-manager')
  let ShortcutManager: ShortcutManagerModule['ShortcutManager']
  const originalPlatform = process.platform

  beforeAll(async () => {
    electronMock.userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-gist-shortcut-test-'))
    ;({ ShortcutManager } = await import('../../src/main/electron/shortcut-manager'))
    const { initMainLocale } = await import('../../src/main/electron/main-locale')
    initMainLocale('en-US')
  })

  afterAll(() => {
    fs.rmSync(electronMock.userDataDir, { recursive: true, force: true })
  })

  beforeEach(() => {
    electronMock.registerResult = true
    electronMock.notifications = []
    electronMock.trusted = false
  })

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform })
  })

  it('validates accelerators with stable codes', () => {
    const manager = ShortcutManager.getInstance()
    expect(manager.validateAccelerator('')).toEqual({ valid: false, errorCode: 'empty' })
    expect(manager.validateAccelerator('G')).toEqual({ valid: false, errorCode: 'modifier-required' })
    expect(manager.validateAccelerator('Escape')).toEqual({ valid: false, errorCode: 'reserved-key' })
    expect(manager.validateAccelerator('F5')).toEqual({ valid: true })
    // 默认启动器快捷键已占用这个组合
    expect(manager.validateAccelerator('CommandOrControl+Shift+G', 'command:showMainWindow'))
      .toEqual({ valid: false, errorCode: 'duplicate' })
  })

  it('throws a code that the renderer can translate when another app holds the shortcut', async () => {
    const manager = ShortcutManager.getInstance()
    electronMock.registerResult = false

    const caught = await manager.updateCommand('showMainWindow', { accelerator: 'Alt+Shift+K', enabled: true })
      .then(() => null, error => error)

    expect(readShortcutErrorCode(ipcError('shortcuts:update-command', caught))).toBe('in-use')
    expect(String(caught)).not.toMatch(/[一-鿿]/)
  })

  it('reports why auto-paste is unavailable as a reason code', async () => {
    const manager = ShortcutManager.getInstance()

    Object.defineProperty(process, 'platform', { value: 'darwin' })
    expect(await manager.getPasteCapability()).toEqual({
      supported: true,
      permissionGranted: false,
      reason: 'accessibility-permission',
    })

    Object.defineProperty(process, 'platform', { value: 'freebsd' })
    expect(await manager.getPasteCapability()).toEqual({
      supported: false,
      permissionGranted: false,
      reason: 'unsupported-platform',
    })
  })

  it('notifies in the UI language without raw paste errors', async () => {
    const manager = ShortcutManager.getInstance()
    Object.defineProperty(process, 'platform', { value: 'darwin' })

    await manager.executeText({ promptUUID: 'p-1', title: 'Weekly report', content: 'Hello', action: 'copy' })
    await manager.executeText({ promptUUID: 'p-1', title: 'Weekly report', content: 'Hello', action: 'paste' })

    expect(electronMock.notifications).toEqual([
      { title: 'Prompt copied', body: 'Weekly report' },
      {
        title: 'Prompt copied',
        body: "Couldn't paste automatically without Accessibility access. Paste it yourself, or allow access in Settings → Shortcuts.",
      },
    ])
  })
})
