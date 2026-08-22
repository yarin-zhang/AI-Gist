// @vitest-environment node

// 覆盖 issue #149 里"CLI 桥接的存活状态必须和 closeAction 绑定成一个清晰、
// 可测试的契约"这一半：closeAction === 'minimize'（关闭后台常驻）时，窗口
// 关闭只会隐藏到托盘，绝不能触碰 cliBridgeManager——CLI 桥接必须继续存活。
// closeAction === 'quit' 那一半（退出必须停止 CLI 桥接并清理运行时文件）
// 在 test/electron/quit-flush-coordinator.test.ts 里覆盖：window-manager.ts
// 本身并不直接调用 cliBridgeManager.stop()，真正的停止逻辑统一收敛在
// main.ts 的 before-quit -> quitFlushCoordinator，这里只验证
// window-manager 在 closeAction === 'quit' 时确实会触发 app.quit()。

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

const electronMock = vi.hoisted(() => {
  class FakeBrowserWindow {
    static instances: FakeBrowserWindow[] = []
    handlers: Record<string, (...args: any[]) => any> = {}
    webContents: {
      handlers: Record<string, (...args: any[]) => any>
      on: (event: string, cb: (...args: any[]) => any) => void
      once: (event: string, cb: (...args: any[]) => any) => void
      send: (...args: any[]) => void
      isDestroyed: () => boolean
    }
    hideCalls = 0
    showCalls = 0

    constructor(public options: any) {
      const webContentsHandlers: Record<string, (...args: any[]) => any> = {}
      this.webContents = {
        handlers: webContentsHandlers,
        on: (event, cb) => { webContentsHandlers[event] = cb },
        once: (event, cb) => { webContentsHandlers[event] = cb },
        send: () => undefined,
        isDestroyed: () => false,
      }
      FakeBrowserWindow.instances.push(this)
    }
    on(event: string, cb: (...args: any[]) => any) { this.handlers[event] = cb }
    once(event: string, cb: (...args: any[]) => any) { this.handlers[event] = cb }
    show() { this.showCalls += 1 }
    hide() { this.hideCalls += 1 }
    focus() { /* no-op */ }
    destroy() { /* no-op */ }
    restore() { /* no-op */ }
    isMinimized() { return false }
    isVisible() { return true }
    isDestroyed() { return false }
    loadURL() { /* no-op */ }
    loadFile() { /* no-op */ }
    getSize(): [number, number] { return [1080, 720] }
    getContentSize(): [number, number] { return [1080, 720] }
  }

  return {
    userDataDir: '',
    FakeBrowserWindow,
    appQuit: vi.fn(),
    appFocus: vi.fn(),
    showMessageBox: vi.fn().mockResolvedValue({ response: 2, checkboxChecked: false }),
    showErrorBox: vi.fn(),
  }
})

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => (name === 'userData' ? electronMock.userDataDir : os.tmpdir()),
    getAppPath: () => os.tmpdir(),
    getVersion: () => '0.0.0-test',
    getName: () => 'ai-gist-test',
    quit: electronMock.appQuit,
    focus: electronMock.appFocus,
  },
  dialog: {
    showMessageBox: electronMock.showMessageBox,
    showErrorBox: electronMock.showErrorBox,
  },
  BrowserWindow: electronMock.FakeBrowserWindow,
  nativeTheme: { shouldUseDarkColors: false },
  ipcMain: {
    on: () => undefined,
    removeListener: () => undefined,
    removeAllListeners: () => undefined,
  },
}))

type WindowManagerModule = typeof import('../../src/main/electron/window-manager')
type PreferencesManagerModule = typeof import('../../src/main/electron/preferences-manager')
type CliBridgeManagerModule = typeof import('../../src/main/electron/cli-bridge-manager')

let windowManager: WindowManagerModule['windowManager']
let preferencesManager: PreferencesManagerModule['preferencesManager']
let cliBridgeManager: CliBridgeManagerModule['cliBridgeManager']
let runtimeDir: string

beforeAll(async () => {
  electronMock.userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-gist-test-userdata-'))
  runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-gist-test-runtime-'))
  process.env.AI_GIST_CLI_BRIDGE_DIR = runtimeDir
  // 同 quit-flush-coordinator.test.ts：utils.ts 在模块顶层用到
  // process.resourcesPath，只有真正的 Electron 进程才会自动填充它。
  if (!process.resourcesPath) {
    (process as unknown as { resourcesPath: string }).resourcesPath = os.tmpdir()
  }

  const windowManagerModule = await import('../../src/main/electron/window-manager')
  const preferencesModule = await import('../../src/main/electron/preferences-manager')
  const cliBridgeModule = await import('../../src/main/electron/cli-bridge-manager')
  windowManager = windowManagerModule.windowManager
  preferencesManager = preferencesModule.preferencesManager
  cliBridgeManager = cliBridgeModule.cliBridgeManager
})

afterAll(async () => {
  await cliBridgeManager.stop()
  fs.rmSync(electronMock.userDataDir, { recursive: true, force: true })
  fs.rmSync(runtimeDir, { recursive: true, force: true })
  delete process.env.AI_GIST_CLI_BRIDGE_DIR
})

beforeEach(() => {
  electronMock.FakeBrowserWindow.instances = []
  windowManager.setQuitting(false)
})

afterEach(async () => {
  await cliBridgeManager.stop()
  preferencesManager.updatePreferences({ cliBridge: { enabled: false } })
})

/** 创建一个窗口并返回捕获到的 FakeBrowserWindow 实例，方便触发 'close' 事件。 */
function createWindow() {
  windowManager.createMainWindow()
  const instances = electronMock.FakeBrowserWindow.instances
  return instances[instances.length - 1]
}

describe('windowManager close behavior vs. CLI bridge lifecycle', () => {
  it("closeAction='minimize': hides to tray and never touches the CLI bridge", async () => {
    await cliBridgeManager.setEnabled(true)
    expect(cliBridgeManager.isRunning()).toBe(true)

    const stopSpy = vi.spyOn(cliBridgeManager, 'stop')

    preferencesManager.updatePreferences({ closeBehaviorMode: 'fixed', closeAction: 'minimize' })
    const win = createWindow()

    await win.handlers['close']({ preventDefault: () => undefined })

    expect(win.hideCalls).toBe(1)
    expect(electronMock.appQuit).not.toHaveBeenCalled()
    expect(stopSpy).not.toHaveBeenCalled()
    expect(cliBridgeManager.isRunning()).toBe(true)

    stopSpy.mockRestore()
  })

  it("closeAction='quit': triggers app.quit() and does not just hide the window", async () => {
    const stopSpy = vi.spyOn(cliBridgeManager, 'stop')

    preferencesManager.updatePreferences({ closeBehaviorMode: 'fixed', closeAction: 'quit' })
    const win = createWindow()

    await win.handlers['close']({ preventDefault: () => undefined })

    expect(electronMock.appQuit).toHaveBeenCalledTimes(1)
    expect(win.hideCalls).toBe(0)
    // window-manager 本身不直接管 CLI 桥接；真正停止 CLI 桥接的责任在
    // main.ts 的 before-quit -> quitFlushCoordinator（见另一份测试文件），
    // 这里只确认 window-manager 确实把"退出"这件事情交给了 app.quit()。
    expect(stopSpy).not.toHaveBeenCalled()

    stopSpy.mockRestore()
  })
})
