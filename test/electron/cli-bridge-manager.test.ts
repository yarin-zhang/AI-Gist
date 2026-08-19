// @vitest-environment node

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import http from 'http'

const electronMock = vi.hoisted(() => ({
  onHandlers: new Map<string, (...args: any[]) => any>(),
  userDataDir: '',
}))

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => (name === 'userData' ? electronMock.userDataDir : os.tmpdir()),
    getVersion: () => '0.0.0-test',
    getName: () => 'ai-gist-test',
  },
  ipcMain: {
    on: (channel: string, listener: (...args: any[]) => any) => {
      electronMock.onHandlers.set(channel, listener)
    },
    removeAllListeners: () => undefined,
  },
  BrowserWindow: class {},
  nativeTheme: {},
}))

type CliBridgeManagerModule = typeof import('../../src/main/electron/cli-bridge-manager')
type PreferencesManagerModule = typeof import('../../src/main/electron/preferences-manager')

let cliBridgeManager: CliBridgeManagerModule['cliBridgeManager']
let preferencesManager: PreferencesManagerModule['preferencesManager']
let runtimeDir: string

function createFakeWindow(options: { destroyed?: boolean; onSend?: (channel: string, payload: any) => void } = {}) {
  return {
    isDestroyed: () => Boolean(options.destroyed),
    webContents: {
      isDestroyed: () => Boolean(options.destroyed),
      send: (channel: string, payload: any) => options.onSend?.(channel, payload),
    },
  } as any
}

function readRuntimeFile(): any {
  const filePath = path.join(runtimeDir, 'cli-bridge.json')
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function runtimeFileExists(): boolean {
  return fs.existsSync(path.join(runtimeDir, 'cli-bridge.json'))
}

function postInvoke(port: number, token: string | undefined, body: any): Promise<{ status: number; json: any }> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body)
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: '/invoke',
        method: 'POST',
        // 每个测试都会起停一个绑定同一端口的新 server；禁用连接池，
        // 避免 Node 复用上一个测试遗留下来的 keep-alive socket。
        agent: false,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          Connection: 'close',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
      res => {
        const chunks: Buffer[] = []
        res.on('data', chunk => chunks.push(chunk))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          resolve({ status: res.statusCode || 0, json: text ? JSON.parse(text) : null })
        })
      }
    )
    req.on('error', reject)
    req.end(payload)
  })
}

/** 模拟渲染进程收到 cli-bridge:invoke-request 后回复 cli-bridge:invoke-response */
function respondAsRenderer(id: string, response: { ok: true; result: any } | { ok: false; error: { message: string; code?: string } }) {
  const handler = electronMock.onHandlers.get('cli-bridge:invoke-response')
  if (!handler) throw new Error('cli-bridge:invoke-response handler was not registered')
  handler({} as any, { id, ...response })
}

beforeAll(async () => {
  electronMock.userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-gist-test-userdata-'))
  runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-gist-test-runtime-'))
  process.env.AI_GIST_CLI_BRIDGE_DIR = runtimeDir

  const cliBridgeModule = await import('../../src/main/electron/cli-bridge-manager')
  const preferencesModule = await import('../../src/main/electron/preferences-manager')
  cliBridgeManager = cliBridgeModule.cliBridgeManager
  preferencesManager = preferencesModule.preferencesManager
})

afterAll(async () => {
  await cliBridgeManager.stop()
  fs.rmSync(electronMock.userDataDir, { recursive: true, force: true })
  fs.rmSync(runtimeDir, { recursive: true, force: true })
  delete process.env.AI_GIST_CLI_BRIDGE_DIR
})

afterEach(async () => {
  await cliBridgeManager.stop()
  preferencesManager.updatePreferences({ cliBridge: { enabled: false } })
})

describe('cliBridgeManager', () => {
  it('does not start the server while disabled', async () => {
    await cliBridgeManager.start()
    expect(cliBridgeManager.isRunning()).toBe(false)
    expect(runtimeFileExists()).toBe(false)
  })

  it('starts on 127.0.0.1 and writes the runtime file once enabled', async () => {
    const status = await cliBridgeManager.setEnabled(true)

    expect(status.enabled).toBe(true)
    expect(status.running).toBe(true)
    expect(status.port).toBeTypeOf('number')

    const runtimeInfo = readRuntimeFile()
    expect(runtimeInfo.port).toBe(status.port)
    expect(runtimeInfo.token).toBeTypeOf('string')
    expect(runtimeInfo.appVersion).toBe('0.0.0-test')
  })

  it('rejects requests without a valid bearer token', async () => {
    const status = await cliBridgeManager.setEnabled(true)
    cliBridgeManager.setMainWindow(createFakeWindow())

    const noAuth = await postInvoke(status.port!, undefined, { action: 'system.ping' })
    expect(noAuth.status).toBe(401)

    const wrongAuth = await postInvoke(status.port!, 'not-the-real-token', { action: 'system.ping' })
    expect(wrongAuth.status).toBe(401)
  })

  it('forwards an authenticated request to the renderer and relays its response', async () => {
    const status = await cliBridgeManager.setEnabled(true)
    const runtimeInfo = readRuntimeFile()

    let capturedRequest: { id: string; action: string; params: any } | undefined
    cliBridgeManager.setMainWindow(
      createFakeWindow({
        onSend: (channel, payload) => {
          if (channel === 'cli-bridge:invoke-request') {
            capturedRequest = payload
            respondAsRenderer(payload.id, { ok: true, result: { echoed: payload.params } })
          }
        },
      })
    )

    const response = await postInvoke(status.port!, runtimeInfo.token, {
      action: 'prompt.list',
      params: { search: 'hello' },
    })

    expect(capturedRequest?.action).toBe('prompt.list')
    expect(capturedRequest?.params).toEqual({ search: 'hello' })
    expect(response.status).toBe(200)
    expect(response.json).toEqual({ echoed: { search: 'hello' } })
  })

  it('maps a renderer-reported error to a 400 with the same message/code', async () => {
    const status = await cliBridgeManager.setEnabled(true)
    const runtimeInfo = readRuntimeFile()

    cliBridgeManager.setMainWindow(
      createFakeWindow({
        onSend: (channel, payload) => {
          if (channel === 'cli-bridge:invoke-request') {
            respondAsRenderer(payload.id, { ok: false, error: { message: 'Prompt not found: 999', code: 'NOT_FOUND' } })
          }
        },
      })
    )

    const response = await postInvoke(status.port!, runtimeInfo.token, { action: 'prompt.get', params: { ref: '999' } })

    expect(response.status).toBe(400)
    expect(response.json.error).toEqual({ message: 'Prompt not found: 999', code: 'NOT_FOUND' })
  })

  it('returns 503 when there is no usable renderer window', async () => {
    const status = await cliBridgeManager.setEnabled(true)
    const runtimeInfo = readRuntimeFile()
    cliBridgeManager.setMainWindow(createFakeWindow({ destroyed: true }))

    const response = await postInvoke(status.port!, runtimeInfo.token, { action: 'system.ping' })

    expect(response.status).toBe(503)
    expect(response.json.error.code).toBe('NO_WINDOW')
  })

  it('stop() closes the server and removes the runtime file', async () => {
    await cliBridgeManager.setEnabled(true)
    expect(cliBridgeManager.isRunning()).toBe(true)
    expect(runtimeFileExists()).toBe(true)

    await cliBridgeManager.stop()

    expect(cliBridgeManager.isRunning()).toBe(false)
    expect(runtimeFileExists()).toBe(false)
  })
})
