// @vitest-environment node

// 回归测试：Gitea issue #149 "如果之前的 CLI 没关掉，再次打开时就会报错"。
//
// 根因（在 bin/lib/bridge-client.js 里确认到的）：~/.ai-gist/cli-bridge.json
// 只要文件存在，invoke() 就认为"应用在跑"，直接尝试连接，完全跳过自动拉起。
// 但如果上一次 AI Gist 没有正常退出（崩溃、被强制杀死、断电），这份文件里的
// 端口早就没有进程在监听了——之前的实现在这种情况下只会报错，让用户"请重新
// 打开 AI Gist"，而不会像"文件完全不存在"时那样自动拉起一个新实例。
//
// 修复后：invoke() 在遇到 ECONNREFUSED 时，会先删除这份过期文件，再走一次和
// "文件不存在"完全相同的自动拉起 + 等待流程，成功后用新端口重试原始请求。
//
// 注意：bin/lib/bridge-client.js 是一个独立于 src/ 的纯 CommonJS 脚本，Vitest
// 会把它当作外部依赖用 Node 原生 require 加载，vi.mock('child_process', ...)
// 对它内部的 require('child_process') 不生效（已经用一个最小复现确认过：
// 从 ESM 侧看 vi.mock 替身确实生效，但 bin/ 脚本内部拿到的仍是真实的
// child_process.spawn）。所以这里改用 Node 内建模块 CJS 导出对象本身是可写属性
// 这一点：通过 createRequire 拿到同一个 child_process 模块对象，直接把它的
// spawn 属性换成 vi.fn()，两边（测试代码和 bin/ 脚本）require 到的是同一个
// 模块单例，因此这样替换总能生效，且测试结束后会还原。

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import http from 'http'
import os from 'os'
import path from 'path'
import { createRequire } from 'module'

const nodeRequire = createRequire(import.meta.url)
const childProcess = nodeRequire('child_process') as { spawn: (...args: any[]) => any }

let runtimeDir: string
let runtimeFile: string
let bridgeClient: typeof import('../../bin/lib/bridge-client.js')
let originalSpawn: (...args: any[]) => any
let originalPlatform: PropertyDescriptor | undefined
let spawnMock: ReturnType<typeof vi.fn>

function writeRuntimeFile(info: { port: number; token: string }) {
  fs.mkdirSync(runtimeDir, { recursive: true })
  fs.writeFileSync(runtimeFile, JSON.stringify({ pid: 1234, appVersion: '0.0.0-test', ...info }))
}

/** 起一个一次性的假 AI Gist 桥接服务器，返回端口和用于鉴权的 token。 */
function startFakeBridgeServer(): Promise<{ port: number; token: string; close: () => Promise<void> }> {
  const token = 'fresh-token'
  return new Promise(resolve => {
    const server = http.createServer((req, res) => {
      const chunks: Buffer[] = []
      req.on('data', chunk => chunks.push(chunk))
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, via: 'fresh-instance' }))
      })
    })
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      resolve({
        port,
        token,
        close: () => new Promise<void>(closeResolve => server.close(() => closeResolve())),
      })
    })
  })
}

/** 分配一个端口，然后立刻关闭它，保证连接到它一定会拿到 ECONNREFUSED。 */
function allocateDeadPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = http.createServer()
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close(err => {
        if (err) reject(err)
        else resolve(port)
      })
    })
  })
}

beforeEach(async () => {
  runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-gist-cli-test-'))
  runtimeFile = path.join(runtimeDir, 'cli-bridge.json')
  process.env.AI_GIST_CLI_BRIDGE_DIR = runtimeDir

  originalSpawn = childProcess.spawn
  spawnMock = vi.fn(() => ({ unref: () => undefined }))
  childProcess.spawn = spawnMock

  originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')
  Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })

  vi.resetModules()
  bridgeClient = await import('../../bin/lib/bridge-client.js')
})

afterEach(() => {
  childProcess.spawn = originalSpawn
  if (originalPlatform) {
    Object.defineProperty(process, 'platform', originalPlatform)
  }
  delete process.env.AI_GIST_CLI_BRIDGE_DIR
  fs.rmSync(runtimeDir, { recursive: true, force: true })
})

describe('bridge-client invoke() — stale runtime file recovery (issue #149)', () => {
  it('treats a stale runtime file (dead port) the same as "not running": clears it and auto-launches instead of erroring out', async () => {
    const deadPort = await allocateDeadPort()
    writeRuntimeFile({ port: deadPort, token: 'stale-token' })

    const freshServer = await startFakeBridgeServer()
    // 模拟 `open -a "AI Gist"` 唤醒了一个新的应用实例：新实例启动后会覆盖
    // 写入一份全新的、真正在监听的端口/token 信息。这里同步完成，让
    // waitForRuntimeInfo() 的第一次轮询就能读到，测试不需要真的等待。
    spawnMock.mockImplementation((_cmd: string, args: string[]) => {
      expect(args).toEqual(['-a', 'AI Gist', '--args', bridgeClient.AUTO_LAUNCH_MARKER])
      writeRuntimeFile({ port: freshServer.port, token: freshServer.token })
      return { unref: () => undefined }
    })

    const result = await bridgeClient.invoke('system.ping', {})

    expect(result).toEqual({ ok: true, via: 'fresh-instance' })
    expect(spawnMock).toHaveBeenCalledTimes(1)

    // 运行时文件应该是自动拉起后写入的那份新信息，不再是最初的过期数据。
    const finalInfo = JSON.parse(fs.readFileSync(runtimeFile, 'utf8'))
    expect(finalInfo.port).toBe(freshServer.port)
    expect(finalInfo.token).toBe(freshServer.token)

    await freshServer.close()
  })

  it('auto-launches (with the CLI marker) exactly like the "no runtime file at all" case when nothing has ever run', async () => {
    expect(fs.existsSync(runtimeFile)).toBe(false)

    const freshServer = await startFakeBridgeServer()
    spawnMock.mockImplementation((_cmd: string, args: string[]) => {
      expect(args).toEqual(['-a', 'AI Gist', '--args', bridgeClient.AUTO_LAUNCH_MARKER])
      writeRuntimeFile({ port: freshServer.port, token: freshServer.token })
      return { unref: () => undefined }
    })

    const result = await bridgeClient.invoke('system.ping', {})

    expect(result).toEqual({ ok: true, via: 'fresh-instance' })
    expect(spawnMock).toHaveBeenCalledTimes(1)

    await freshServer.close()
  })

  it('does not spawn anything and reports the stale-connection error immediately when auto-launch is disabled', async () => {
    const deadPort = await allocateDeadPort()
    writeRuntimeFile({ port: deadPort, token: 'stale-token' })

    await expect(bridgeClient.invoke('system.ping', {}, { autoLaunch: false })).rejects.toMatchObject({
      code: 'APP_NOT_RUNNING',
    })
    expect(spawnMock).not.toHaveBeenCalled()

    // 过期文件在这个分支不应该被自动清理——用户没有要求自动拉起，
    // 我们不应该悄悄改变磁盘上的状态。
    expect(fs.existsSync(runtimeFile)).toBe(true)
  })

  it('surfaces the "please reopen manually" message if auto-launch itself fails to bring the bridge back up', async () => {
    const deadPort = await allocateDeadPort()
    writeRuntimeFile({ port: deadPort, token: 'stale-token' })

    // spawn "成功"了（比如系统确实拉起了一个进程），但它从来没有写出一份新的
    // 运行时文件（例如本地 CLI 开关其实是关着的）——等待应该超时并报错，
    // 而不是挂起或者抛出别的奇怪异常。
    spawnMock.mockImplementation(() => ({ unref: () => undefined }))

    await expect(bridgeClient.invoke('system.ping', {})).rejects.toMatchObject({
      code: 'APP_NOT_RUNNING',
    })
    expect(spawnMock).toHaveBeenCalledTimes(1)
  }, 20000)
})
