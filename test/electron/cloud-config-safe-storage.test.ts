// @vitest-environment node

/**
 * 桌面端 WebDAV 密码用 Electron safeStorage 加密保存 (#491)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import type { WebDAVConfig } from '../../src/shared/types/cloud-backup'

const electronMock = vi.hoisted(() => {
  const state = {
    available: true,
    backend: 'gnome_libsecret',
    failEncrypt: false,
    windows: [] as unknown[]
  }
  return {
    state,
    handlers: new Map<string, (...args: any[]) => any>(),
    safeStorage: {
      isEncryptionAvailable: () => state.available,
      // 测试用的可逆「加密」：前缀加十六进制，保证文件里看不到明文
      encryptString: (plainText: string) => {
        if (state.failEncrypt) throw new Error('encryption backend failed')
        return Buffer.from(`enc:${Buffer.from(plainText, 'utf-8').toString('hex')}`, 'utf-8')
      },
      decryptString: (encrypted: Buffer) => {
        const text = encrypted.toString('utf-8')
        if (!text.startsWith('enc:')) throw new Error('Error while decrypting the ciphertext provided to safeStorage.decryptString.')
        return Buffer.from(text.slice(4), 'hex').toString('utf-8')
      },
      getSelectedStorageBackend: () => state.backend
    }
  }
})

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: any[]) => any) => {
      electronMock.handlers.set(channel, handler)
    }
  },
  BrowserWindow: {
    getAllWindows: () => electronMock.state.windows
  },
  safeStorage: electronMock.safeStorage
}))

import { CloudBackupManager } from '../../src/main/cloud/cloud-backup-manager'
import {
  ENCRYPTED_PASSWORD_FIELD,
  getPasswordEncryptionUnavailableReason,
  resetStorageConfigSecretWarnings,
  type SafeStorageLike
} from '../../src/main/cloud/storage-config-secrets'

const SECRET = 'jianguoyun-app-password'

function webdavConfig(overrides: Partial<WebDAVConfig> = {}): WebDAVConfig {
  return {
    id: 'storage-1',
    name: '坚果云',
    type: 'webdav',
    enabled: true,
    url: 'https://dav.jianguoyun.com/dav/',
    username: 'user@example.com',
    password: SECRET,
    createdAt: '2026-07-12T00:00:00.000Z',
    updatedAt: '2026-07-12T00:00:00.000Z',
    ...overrides
  }
}

describe('云存储配置文件里的 WebDAV 密码', () => {
  let tempDir: string
  let configPath: string
  let manager: CloudBackupManager
  let warn: ReturnType<typeof vi.spyOn>

  const invoke = (channel: string, ...args: unknown[]) => {
    const handler = electronMock.handlers.get(channel)
    if (!handler) throw new Error(`missing handler ${channel}`)
    return handler({}, ...args)
  }
  const readFile = () => fs.readFileSync(configPath, 'utf-8')
  const readRecords = () => JSON.parse(readFile()) as Record<string, unknown>[]
  const writeRecords = (records: unknown[]) => fs.writeFileSync(configPath, JSON.stringify(records, null, 2))

  beforeEach(() => {
    electronMock.handlers.clear()
    Object.assign(electronMock.state, { available: true, backend: 'gnome_libsecret', failEncrypt: false, windows: [] })
    resetStorageConfigSecretWarnings()
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-gist-cloud-config-'))
    configPath = path.join(tempDir, '.ai-gist', 'cloud-config.json')
    manager = new CloudBackupManager({} as any)
    const internal = manager as any
    internal.configPath = configPath
    internal.checkProviderConnection = async () => ({ success: true })
    internal.createProvider = () => ({})
  })

  afterEach(() => {
    warn.mockRestore()
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('加密可用时文件里只有密文，读取后内存和 IPC 返回的配置仍带明文密码', async () => {
    const { id, createdAt, updatedAt, ...input } = webdavConfig()
    const added = await invoke('cloud:add-storage-config', input)
    expect(added.success, JSON.stringify(added)).toBe(true)

    const raw = readFile()
    expect(raw).not.toContain(SECRET)
    const [record] = readRecords()
    expect(record).not.toHaveProperty('password')
    expect(record[ENCRYPTED_PASSWORD_FIELD]).toEqual(expect.any(String))
    expect(record).toMatchObject({ url: input.url, username: input.username })
    if (process.platform !== 'win32') {
      expect(fs.statSync(configPath).mode & 0o777).toBe(0o600)
    }

    // 换一个实例从磁盘重新读取，模拟重启
    electronMock.handlers.clear()
    const reloaded = new CloudBackupManager({} as any)
    ;(reloaded as any).configPath = configPath
    const configs = await electronMock.handlers.get('cloud:get-storage-configs')!({})
    expect(configs).toHaveLength(1)
    expect(configs[0]).toMatchObject({ id: added.config.id, password: SECRET, username: input.username })
    expect(configs[0]).not.toHaveProperty(ENCRYPTED_PASSWORD_FIELD)
  })

  it('旧版本的明文配置在读取时自动迁移成加密保存', async () => {
    fs.mkdirSync(path.dirname(configPath), { recursive: true })
    writeRecords([webdavConfig(), { id: 'icloud-1', name: 'iCloud', type: 'icloud', enabled: true, path: 'AI-Gist' }])

    const configs = await invoke('cloud:get-storage-configs')

    expect(configs.find((config: any) => config.id === 'storage-1')).toMatchObject({ password: SECRET })
    expect(readFile()).not.toContain(SECRET)
    const records = readRecords()
    expect(records[0]).toHaveProperty(ENCRYPTED_PASSWORD_FIELD)
    expect(records[0]).not.toHaveProperty('password')
    expect(records[1]).toEqual({ id: 'icloud-1', name: 'iCloud', type: 'icloud', enabled: true, path: 'AI-Gist' })
  })

  it('safeStorage 不可用时退回明文保存并记录原因，读写和同步照常进行', async () => {
    electronMock.state.available = false
    const { id, createdAt, updatedAt, ...input } = webdavConfig()

    const added = await invoke('cloud:add-storage-config', input)
    const configs = await invoke('cloud:get-storage-configs')

    expect(added.success).toBe(true)
    expect(readRecords()[0]).toMatchObject({ password: SECRET })
    expect(readRecords()[0]).not.toHaveProperty(ENCRYPTED_PASSWORD_FIELD)
    expect(configs[0]).toMatchObject({ password: SECRET })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('WebDAV 密码以明文保存在配置文件中'))

    // 钥匙串恢复以后，下一次读取自动改成加密保存
    electronMock.state.available = true
    await invoke('cloud:get-storage-configs')
    expect(readFile()).not.toContain(SECRET)
  })

  it('safeStorage 不可用时旧的明文配置照常读取，不重写文件，并记录原因', async () => {
    electronMock.state.available = false
    fs.mkdirSync(path.dirname(configPath), { recursive: true })
    writeRecords([webdavConfig()])
    const before = readFile()

    const configs = await invoke('cloud:get-storage-configs')

    expect(configs[0]).toMatchObject({ password: SECRET })
    expect(readFile()).toBe(before)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('系统钥匙串 / 密钥环不可用'))
  })

  it('加密出错时退回明文，不让保存失败', async () => {
    electronMock.state.failEncrypt = true
    const { id, createdAt, updatedAt, ...input } = webdavConfig()

    const added = await invoke('cloud:add-storage-config', input)

    expect(added.success).toBe(true)
    expect(readRecords()[0]).toMatchObject({ password: SECRET })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('WebDAV 密码加密失败'))
  })

  it('密文解不开时配置照常加载（密码为空），保存其他配置时保留原来的密文', async () => {
    fs.mkdirSync(path.dirname(configPath), { recursive: true })
    const unreadable = Buffer.from('v11-from-another-keyring').toString('base64')
    const { password, ...withoutPassword } = webdavConfig()
    writeRecords([{ ...withoutPassword, [ENCRYPTED_PASSWORD_FIELD]: unreadable }])

    const configs = await invoke('cloud:get-storage-configs')
    expect(configs[0]).toMatchObject({ id: 'storage-1', password: '' })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('WebDAV 密码解密失败'))

    const { id, createdAt, updatedAt, ...input } = webdavConfig({ name: 'NAS', password: 'nas-password' })
    const added = await invoke('cloud:add-storage-config', input)
    expect(added.success).toBe(true)

    const records = readRecords()
    expect(records.find(record => record.id === 'storage-1')).toMatchObject({ [ENCRYPTED_PASSWORD_FIELD]: unreadable })
    expect(records.find(record => record.id === 'storage-1')).not.toHaveProperty('password')
    expect(readFile()).not.toContain('nas-password')
  })

  it('云端备份带着模型配置的 API Key，换设备恢复后能直接用', async () => {
    fs.mkdirSync(path.dirname(configPath), { recursive: true })
    writeRecords([webdavConfig()])
    const written: string[] = []
    ;(manager as any).createProvider = () => ({
      writeFile: async (_path: string, content: Buffer) => {
        written.push(content.toString('utf-8'))
      }
    })
    electronMock.state.windows = [{}]
    await invoke('cloud:get-storage-configs')

    const result = await invoke('cloud:create-backup', 'storage-1', {
      description: '手动备份',
      data: {
        categories: [],
        prompts: [],
        aiConfigs: [{ id: 1, uuid: 'ai-1', configId: 'openai', type: 'openai', name: 'OpenAI', apiKey: 'sk-cloud-backup', secretKey: 'secret-cloud-backup' }],
        settings: []
      }
    })

    expect(result.success, JSON.stringify(result)).toBe(true)
    expect(written).toHaveLength(1)
    expect(JSON.parse(written[0]).data.aiConfigs[0]).toMatchObject({
      uuid: 'ai-1',
      name: 'OpenAI',
      apiKey: 'sk-cloud-backup',
      secretKey: 'secret-cloud-backup'
    })
  })
})

describe('getPasswordEncryptionUnavailableReason', () => {
  const store = (available: boolean, backend = 'gnome_libsecret'): SafeStorageLike => ({
    isEncryptionAvailable: () => available,
    encryptString: plainText => Buffer.from(plainText),
    decryptString: encrypted => encrypted.toString(),
    getSelectedStorageBackend: () => backend
  })

  it('macOS、Windows 上钥匙串可用就加密', () => {
    expect(getPasswordEncryptionUnavailableReason(store(true), 'darwin')).toBeNull()
    expect(getPasswordEncryptionUnavailableReason(store(true), 'win32')).toBeNull()
  })

  it('Linux 没有系统密钥环（basic_text）时不加密，有 libsecret / KWallet 时加密', () => {
    expect(getPasswordEncryptionUnavailableReason(store(true, 'basic_text'), 'linux')).toContain('basic_text')
    expect(getPasswordEncryptionUnavailableReason(store(true, 'gnome_libsecret'), 'linux')).toBeNull()
    expect(getPasswordEncryptionUnavailableReason(store(true, 'kwallet5'), 'linux')).toBeNull()
  })

  it('safeStorage 不可用或检查出错时给出原因', () => {
    expect(getPasswordEncryptionUnavailableReason(null)).toContain('safeStorage')
    expect(getPasswordEncryptionUnavailableReason(store(false), 'darwin')).toContain('不可用')
    expect(getPasswordEncryptionUnavailableReason({
      ...store(true),
      isEncryptionAvailable: () => { throw new Error('app not ready') }
    }, 'darwin')).toContain('app not ready')
  })
})
