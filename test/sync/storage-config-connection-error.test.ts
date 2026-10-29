/**
 * 保存存储配置时连不上存储：返回 CONNECTION_FAILED，界面按「测试连接」同一套说明告诉用户怎么改，
 * 不再把「连接测试失败: Invalid response: 401 Unauthorized」原样弹给用户
 */

// @vitest-environment node

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { TestWebDAVServer } from '../helpers/webdav-server'

const electronMock = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => any>()
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: any[]) => any) => {
      electronMock.handlers.set(channel, handler)
    }
  },
  BrowserWindow: {
    getAllWindows: () => []
  }
}))

import { CloudBackupManager } from '../../src/main/cloud/cloud-backup-manager'

let server: TestWebDAVServer

describe('保存存储配置时连不上存储 (desktop)', () => {
  beforeAll(async () => {
    server = new TestWebDAVServer({ port: 0 })
    await server.start()
  })

  afterAll(async () => {
    await server.stop()
  })

  it('账号密码不对时带回 CONNECTION_FAILED 和服务器原样返回的原因，不带中文前缀', async () => {
    const manager = new CloudBackupManager({} as any) as any
    manager.loadConfigs = async () => undefined
    const add = electronMock.handlers.get('cloud:add-storage-config')!

    const result = await add(null, {
      name: 'NAS',
      type: 'webdav',
      enabled: true,
      url: `${server.baseUrl}/`,
      username: 'testuser',
      password: 'wrong-password'
    })

    expect(result.success).toBe(false)
    expect(result.errorCode).toBe('CONNECTION_FAILED')
    expect(result.error).not.toContain('连接测试失败')
    expect(result.error).toMatch(/401|Unauthorized/)
  })
})
