// @vitest-environment node

// 覆盖 issue #149 里"CLI 桥接的存活状态必须和 closeAction 绑定成一个清晰、
// 可测试的契约"这一半：只要应用真的要退出（不管是从哪条路径触发
// quitFlushCoordinator.begin()），本地 CLI 桥接必须被停止，并且
// ~/.ai-gist/cli-bridge.json 必须被清理干净，不给下一次 CLI 调用留下
// 过期的端口/token 信息。另一半（closeAction === 'minimize' 时隐藏到
// 托盘不应停止 CLI 桥接）见 test/electron/window-manager-close-behavior.test.ts。

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'

const electronMock = vi.hoisted(() => ({
  onHandlers: new Map<string, (...args: any[]) => any>(),
  userDataDir: '',
}))

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => (name === 'userData' ? electronMock.userDataDir : os.tmpdir()),
    getAppPath: () => os.tmpdir(),
    getVersion: () => '0.0.0-test',
    getName: () => 'ai-gist-test',
  },
  ipcMain: {
    on: (channel: string, listener: (...args: any[]) => any) => {
      electronMock.onHandlers.set(channel, listener)
    },
    removeListener: (channel: string) => {
      electronMock.onHandlers.delete(channel)
    },
    removeAllListeners: () => undefined,
  },
  dialog: {
    showMessageBox: vi.fn().mockResolvedValue({ response: 2, checkboxChecked: false }),
    showErrorBox: vi.fn(),
  },
  BrowserWindow: class {},
  nativeTheme: { shouldUseDarkColors: false },
}))

type CliBridgeManagerModule = typeof import('../../src/main/electron/cli-bridge-manager')
type PreferencesManagerModule = typeof import('../../src/main/electron/preferences-manager')
type QuitFlushCoordinatorModule = typeof import('../../src/main/electron/quit-flush-coordinator')

let cliBridgeManager: CliBridgeManagerModule['cliBridgeManager']
let preferencesManager: PreferencesManagerModule['preferencesManager']
let quitFlushCoordinator: QuitFlushCoordinatorModule['quitFlushCoordinator']
let runtimeDir: string

function runtimeFileExists(): boolean {
  return fs.existsSync(path.join(runtimeDir, 'cli-bridge.json'))
}

beforeAll(async () => {
  electronMock.userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-gist-test-userdata-'))
  runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-gist-test-runtime-'))
  process.env.AI_GIST_CLI_BRIDGE_DIR = runtimeDir
  // 只有在真正的（哪怕是未打包的）Electron 进程里，process.resourcesPath 才会被
  // 自动填充；在这里用 vitest 跑纯 Node 环境时它是 undefined，会导致
  // window-manager.ts 间接引入的 utils.ts 在模块顶层 join() 时直接抛错。
  if (!process.resourcesPath) {
    (process as unknown as { resourcesPath: string }).resourcesPath = os.tmpdir()
  }

  const cliBridgeModule = await import('../../src/main/electron/cli-bridge-manager')
  const preferencesModule = await import('../../src/main/electron/preferences-manager')
  const coordinatorModule = await import('../../src/main/electron/quit-flush-coordinator')
  cliBridgeManager = cliBridgeModule.cliBridgeManager
  preferencesManager = preferencesModule.preferencesManager
  quitFlushCoordinator = coordinatorModule.quitFlushCoordinator
})

afterAll(async () => {
  await cliBridgeManager.stop()
  fs.rmSync(electronMock.userDataDir, { recursive: true, force: true })
  fs.rmSync(runtimeDir, { recursive: true, force: true })
  delete process.env.AI_GIST_CLI_BRIDGE_DIR
})

beforeEach(() => {
  quitFlushCoordinator.reset()
})

afterEach(async () => {
  await cliBridgeManager.stop()
  preferencesManager.updatePreferences({ cliBridge: { enabled: false } })
  quitFlushCoordinator.reset()
})

describe('quitFlushCoordinator.begin()', () => {
  it('stops a running CLI bridge and removes the runtime file before signalling done', async () => {
    await cliBridgeManager.setEnabled(true)
    expect(cliBridgeManager.isRunning()).toBe(true)
    expect(runtimeFileExists()).toBe(true)

    const onDone = vi.fn()
    quitFlushCoordinator.begin(500, 'test: 彻底退出', onDone)

    await vi.waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))

    expect(cliBridgeManager.isRunning()).toBe(false)
    expect(runtimeFileExists()).toBe(false)
    expect(quitFlushCoordinator.isFlushCompleted()).toBe(true)
  })

  it('is idempotent — a second begin() after completion does not stop/flush again or re-signal onDone', async () => {
    const firstOnDone = vi.fn()
    quitFlushCoordinator.begin(200, 'first quit', firstOnDone)
    await vi.waitFor(() => expect(firstOnDone).toHaveBeenCalledTimes(1))

    const secondOnDone = vi.fn()
    quitFlushCoordinator.begin(200, 'second quit (should be a no-op)', secondOnDone)

    // 给足够时间让"如果它真的又跑了一遍"的异步流程有机会完成，
    // 确认 onDone 没有被（哪怕迟一点）调用。
    await new Promise(resolve => setTimeout(resolve, 100))
    expect(secondOnDone).not.toHaveBeenCalled()
  })

  it('completes cleanly (and calls onDone) even when the CLI bridge was never running', async () => {
    expect(cliBridgeManager.isRunning()).toBe(false)

    const onDone = vi.fn()
    quitFlushCoordinator.begin(200, 'quit without cli bridge enabled', onDone)

    await vi.waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
    expect(cliBridgeManager.isRunning()).toBe(false)
  })
})
