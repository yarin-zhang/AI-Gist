// @vitest-environment node

// 回归测试：Gitea issue #149 "如果之前的 CLI 没关掉，再次打开时就会报错"。
//
// 根因之一：本地 CLI 桥接默认关闭，是绝大多数用户的开箱状态。只要 AI Gist
// 应用本身已经在跑（不管前台还是隐藏在托盘），bin/lib/bridge-client.js 的
// invoke() 都会因为读不到 ~/.ai-gist/cli-bridge.json 而认为"应用没在运行"，
// 在 macOS 上执行 `open -a "AI Gist" --args --ai-gist-cli-autolaunch` 尝试
// 自动拉起。因为应用其实已经在跑，这会短暂拉起一个新的 Electron 进程，它在
// requestSingleInstanceLock() 时输给已运行的实例，把自己的命令行参数通过
// 'second-instance' 事件转交过去——已运行的实例过去会弹出"AI-Gist 已在运行"
// 的对话框，这个对话框和用户执行的 CLI 命令毫无关系。
//
// 修复：single-instance-manager.ts 的 handleSecondInstance() 在 commandLine
// 里检测到这个标记时直接静默返回，不弹窗，也不强制显示/聚焦主窗口。这里验证
// 这条分支，并确认没有标记时（真正的用户重复启动）原有的弹窗行为不受影响。

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
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
    showCalls = 0
    focusCalls = 0

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
    hide() { /* no-op */ }
    focus() { this.focusCalls += 1 }
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
    appOnHandlers: new Map<string, (...args: any[]) => any>(),
    requestSingleInstanceLock: vi.fn(() => true),
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
    requestSingleInstanceLock: electronMock.requestSingleInstanceLock,
    on: (event: string, cb: (...args: any[]) => any) => {
      electronMock.appOnHandlers.set(event, cb)
    },
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

type SingleInstanceManagerModule = typeof import('../../src/main/electron/single-instance-manager')
type WindowManagerModule = typeof import('../../src/main/electron/window-manager')

let singleInstanceManager: SingleInstanceManagerModule['singleInstanceManager']
let windowManager: WindowManagerModule['windowManager']
const CLI_AUTO_LAUNCH_MARKER = '--ai-gist-cli-autolaunch'

beforeAll(async () => {
  electronMock.userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-gist-test-userdata-'))
  // 同其它 electron 单测：process.resourcesPath 只有真正的 Electron 进程才会
  // 自动填充，纯 Node 环境下跑 vitest 需要手动垫一个值。
  if (!process.resourcesPath) {
    (process as unknown as { resourcesPath: string }).resourcesPath = os.tmpdir()
  }

  const singleInstanceModule = await import('../../src/main/electron/single-instance-manager')
  const windowManagerModule = await import('../../src/main/electron/window-manager')
  singleInstanceManager = singleInstanceModule.singleInstanceManager
  windowManager = windowManagerModule.windowManager
})

beforeEach(() => {
  electronMock.FakeBrowserWindow.instances = []
  electronMock.requestSingleInstanceLock.mockReturnValue(true)
  singleInstanceManager.initialize()
})

afterEach(() => {
  electronMock.showMessageBox.mockClear()
  electronMock.showErrorBox.mockClear()
  electronMock.appQuit.mockClear()
  electronMock.appOnHandlers.clear()
})

function getSecondInstanceHandler() {
  const handler = electronMock.appOnHandlers.get('second-instance')
  if (!handler) throw new Error("'second-instance' handler was not registered")
  return handler
}

describe('singleInstanceManager — CLI auto-launch probe vs. a genuine second launch', () => {
  it('shows the "already running" dialog and focuses the window for a genuine second launch (no CLI marker)', () => {
    windowManager.createMainWindow()
    const win = electronMock.FakeBrowserWindow.instances[electronMock.FakeBrowserWindow.instances.length - 1]

    getSecondInstanceHandler()({}, ['/path/to/AI Gist', '--some-unrelated-flag'], '/tmp')

    expect(electronMock.showMessageBox).toHaveBeenCalledTimes(1)
    expect(electronMock.showErrorBox).not.toHaveBeenCalled()
    // FakeBrowserWindow.isVisible() 恒为 true，所以 windowManager.showMainWindow()
    // 只会调用 focus()（不会调用 show()，那只在窗口真的不可见时才触发）。
    expect(win.focusCalls).toBeGreaterThan(0)
  })

  it('silently ignores a CLI auto-launch probe: no dialog, no forced show/focus of the window', () => {
    windowManager.createMainWindow()
    const win = electronMock.FakeBrowserWindow.instances[electronMock.FakeBrowserWindow.instances.length - 1]
    const showCallsBefore = win.showCalls
    const focusCallsBefore = win.focusCalls

    getSecondInstanceHandler()({}, ['/path/to/AI Gist', CLI_AUTO_LAUNCH_MARKER], '/tmp')

    expect(electronMock.showMessageBox).not.toHaveBeenCalled()
    expect(electronMock.showErrorBox).not.toHaveBeenCalled()
    expect(win.showCalls).toBe(showCallsBefore)
    expect(win.focusCalls).toBe(focusCallsBefore)
  })

  it('also silently ignores a CLI auto-launch probe when there is no main window yet (system-level dialog suppressed too)', () => {
    // 不创建窗口，模拟 mainWindow 还不存在的极端情况。
    getSecondInstanceHandler()({}, ['/path/to/AI Gist', CLI_AUTO_LAUNCH_MARKER], '/tmp')

    expect(electronMock.showMessageBox).not.toHaveBeenCalled()
    expect(electronMock.showErrorBox).not.toHaveBeenCalled()
  })
})
