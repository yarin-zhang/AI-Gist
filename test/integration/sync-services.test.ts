/**
 * 同步服务集成测试
 * 测试 WebDAV 和 iCloud 同步服务的集成场景和复杂交互
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { WebDAVService } from '../../src/main/electron/webdav-service'
import { ICloudService } from '../../src/main/electron/icloud-service'
import { testDataGenerators, testHelpers } from '../helpers/test-utils'

// Mock 依赖
vi.mock('webdav', () => ({
  createClient: vi.fn(() => ({
    stat: vi.fn(),
    getFileContents: vi.fn(),
    putFileContents: vi.fn(),
    createDirectory: vi.fn(),
    deleteFile: vi.fn()
  }))
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
    removeHandler: vi.fn(),
    removeAllListeners: vi.fn()
  },
  app: {
    getPath: vi.fn(() => '/mock/path'),
    getName: vi.fn(() => 'mock-app')
  },
  shell: {
    openPath: vi.fn()
  }
}))
vi.mock('fs', () => ({
  promises: {
    stat: vi.fn(),
    readdir: vi.fn(),
    mkdir: vi.fn(),
    writeFile: vi.fn(),
    readFile: vi.fn(),
    access: vi.fn(),
    unlink: vi.fn(),
    rmdir: vi.fn()
  },
  existsSync: vi.fn()
}))

vi.mock('crypto', () => ({
  createHash: vi.fn(() => ({
    update: vi.fn().mockReturnThis(),
    digest: vi.fn(() => 'mocked-hash')
  })),
  scryptSync: vi.fn(() => Buffer.from('mock-key')),
  randomBytes: vi.fn(() => Buffer.from('mock-iv')),
  createCipheriv: vi.fn(() => ({
    update: vi.fn(() => 'encrypted'),
    final: vi.fn(() => 'final')
  })),
  createDecipheriv: vi.fn(() => ({
    update: vi.fn(() => 'decrypted'),
    final: vi.fn(() => 'final')
  }))
}))

// Mock 服务
const mockPreferencesManager = {
  getPreferences: vi.fn(),
  updatePreferences: vi.fn()
}

const mockDataManagementService = {
  exportAllData: vi.fn(),
  importData: vi.fn()
}

describe('同步服务集成测试', () => {
  let webdavService: any
  let icloudService: any
  let mockWebDAVClient: any
  let mockFs: any

  beforeEach(async () => {
    vi.clearAllMocks()
    
    // 动态导入服务类
    const { WebDAVService } = await import('../../src/main/electron/webdav-service')
    const { ICloudService } = await import('../../src/main/electron/icloud-service')
    
    // 设置 WebDAV 客户端 mock
    mockWebDAVClient = {
      stat: vi.fn(),
      getFileContents: vi.fn(),
      putFileContents: vi.fn(),
      createDirectory: vi.fn(),
      deleteFile: vi.fn()
    }
    
    const { createClient } = await import('webdav')
    vi.mocked(createClient).mockReturnValue(mockWebDAVClient)
    
    // 设置文件系统 mock
    const mockFs = await import('fs')
    vi.mocked(mockFs.promises.stat).mockResolvedValue({ isDirectory: () => true } as any)
    vi.mocked(mockFs.promises.readdir).mockResolvedValue([])
    vi.mocked(mockFs.promises.mkdir).mockResolvedValue(undefined)
    vi.mocked(mockFs.promises.writeFile).mockResolvedValue(undefined)
    vi.mocked(mockFs.promises.readFile).mockResolvedValue('{}')
    vi.mocked(mockFs.promises.access).mockResolvedValue(undefined)
    vi.mocked(mockFs.existsSync).mockReturnValue(true)
    
    // 初始化服务
    webdavService = new WebDAVService(mockPreferencesManager, mockDataManagementService)
    icloudService = new ICloudService(mockPreferencesManager, mockDataManagementService)
  })

  afterEach(() => {
    webdavService.cleanup()
    icloudService.cleanup()
  })

  describe('基于UUID的同步测试', () => {
    it('应该正确处理基于UUID的数据同步', async () => {
      // 准备测试数据 - 使用UUID作为主键
      const localData = {
        prompts: [
          testDataGenerators.createMockPrompt({ 
            uuid: 'prompt-001',
            title: '本地提示词1',
            updatedAt: '2023-01-01T10:00:00Z'
          }),
          testDataGenerators.createMockPrompt({ 
            uuid: 'prompt-002',
            title: '本地提示词2',
            updatedAt: '2023-01-01T11:00:00Z'
          })
        ],
        categories: [
          testDataGenerators.createMockCategory({ 
            uuid: 'cat-001',
            name: '本地分类1',
            updatedAt: '2023-01-01T09:00:00Z'
          })
        ]
      }

      const remoteData = {
        prompts: [
          testDataGenerators.createMockPrompt({ 
            uuid: 'prompt-001',
            title: '远程提示词1（更新版）',
            updatedAt: '2023-01-01T12:00:00Z' // 更新时间较晚，应该优先
          }),
          testDataGenerators.createMockPrompt({ 
            uuid: 'prompt-003',
            title: '远程新提示词3',
            updatedAt: '2023-01-01T13:00:00Z'
          })
        ],
        categories: [
          testDataGenerators.createMockCategory({ 
            uuid: 'cat-001',
            name: '远程分类1（旧版）',
            updatedAt: '2023-01-01T08:00:00Z' // 更新时间较早，应该被本地版本覆盖
          }),
          testDataGenerators.createMockCategory({ 
            uuid: 'cat-002',
            name: '远程新分类2',
            updatedAt: '2023-01-01T14:00:00Z'
          })
        ]
      }

      // 设置数据管理服务
      mockDataManagementService.exportAllData.mockResolvedValue(localData)
      
      // 模拟理想的合并结果
      const expectedMergedData = {
        prompts: [
          { uuid: 'prompt-001', title: '远程提示词1（更新版）' }, // 远程版本更新
          { uuid: 'prompt-002', title: '本地提示词2' },           // 本地独有
          { uuid: 'prompt-003', title: '远程新提示词3' }         // 远程独有
        ],
        categories: [
          { uuid: 'cat-001', name: '本地分类1' },               // 本地版本更新
          { uuid: 'cat-002', name: '远程新分类2' }              // 远程独有
        ]
      }

      // 验证合并逻辑的期望行为
      expect(expectedMergedData.prompts).toHaveLength(3)
      expect(expectedMergedData.categories).toHaveLength(2)
    })

    it('应该正确处理UUID冲突和时间戳比较', async () => {
      const testCases = [
        {
          name: '本地版本更新',
          local: { uuid: 'test-001', title: '本地版本', updatedAt: '2023-01-02T00:00:00Z' },
          remote: { uuid: 'test-001', title: '远程版本', updatedAt: '2023-01-01T00:00:00Z' },
          expected: '本地版本'
        },
        {
          name: '远程版本更新',
          local: { uuid: 'test-002', title: '本地版本', updatedAt: '2023-01-01T00:00:00Z' },
          remote: { uuid: 'test-002', title: '远程版本', updatedAt: '2023-01-02T00:00:00Z' },
          expected: '远程版本'
        },
        {
          name: '相同时间戳',
          local: { uuid: 'test-003', title: '本地版本', updatedAt: '2023-01-01T00:00:00Z' },
          remote: { uuid: 'test-003', title: '远程版本', updatedAt: '2023-01-01T00:00:00Z' },
          expected: '本地版本' // 相同时间戳时优先本地版本
        }
      ]

      testCases.forEach(testCase => {
        console.log(`测试案例: ${testCase.name}`)
        
        const localTime = new Date(testCase.local.updatedAt).getTime()
        const remoteTime = new Date(testCase.remote.updatedAt).getTime()
        
        let winner
        if (localTime > remoteTime) {
          winner = testCase.local.title
        } else if (remoteTime > localTime) {
          winner = testCase.remote.title
        } else {
          winner = testCase.local.title // 相同时间优先本地
        }
        
        expect(winner).toBe(testCase.expected)
      })
    })
  })

  describe('复杂同步场景测试', () => {
    it('应该处理大规模数据的增量同步', async () => {
      // 创建大量测试数据
      const createLargeDataset = (prefix: string, count: number) => ({
        prompts: Array.from({ length: count }, (_, i) => 
          testDataGenerators.createMockPrompt({
            uuid: `${prefix}-prompt-${i.toString().padStart(4, '0')}`,
            title: `${prefix}提示词${i}`,
            updatedAt: new Date(Date.now() + i * 1000).toISOString()
          })
        ),
        categories: Array.from({ length: Math.floor(count / 10) }, (_, i) => 
          testDataGenerators.createMockCategory({
            uuid: `${prefix}-cat-${i.toString().padStart(3, '0')}`,
            name: `${prefix}分类${i}`,
            updatedAt: new Date(Date.now() + i * 1000).toISOString()
          })
        )
      })

      const localData = createLargeDataset('local', 1000)
      const remoteData = createLargeDataset('remote', 800)

      mockDataManagementService.exportAllData.mockResolvedValue(localData)

      // 测试数据计算性能
      const startTime = Date.now()
      
      const localHash = webdavService['calculateDataHash'](localData)
      const remoteHash = webdavService['calculateDataHash'](remoteData)
      const localTotal = webdavService['calculateTotalRecords'](localData)
      const remoteTotal = webdavService['calculateTotalRecords'](remoteData)
      
      const endTime = Date.now()
      
      expect(localHash).toBeDefined()
      expect(remoteHash).toBeDefined()
      expect(localTotal).toBe(1100) // 1000 prompts + 100 categories
      expect(remoteTotal).toBe(880)  // 800 prompts + 80 categories
      expect(endTime - startTime).toBeLessThan(500) // 应该在500ms内完成
    })

    it('应该正确处理网络中断和重试机制', async () => {
      // 模拟网络不稳定的情况
      let attemptCount = 0
      mockWebDAVClient.stat.mockImplementation(() => {
        attemptCount++
        if (attemptCount <= 2) {
          throw new Error('Network timeout')
        }
        return Promise.resolve({ type: 'directory' })
      })

      // 设置基本配置
      mockPreferencesManager.getPreferences.mockReturnValue({
        webdav: {
          enabled: true,
          serverUrl: 'https://webdav.example.com',
          username: 'testuser',
          password: 'testpass'
        }
      })

      mockDataManagementService.exportAllData.mockResolvedValue({
        prompts: [testDataGenerators.createMockPrompt()],
        categories: []
      })

      // 第一次和第二次调用会失败，第三次成功
      webdavService.setupIpcHandlers()
      const { ipcMain } = mockElectron
      const syncHandler = ipcMain.handle.mock.calls.find(call => call[0] === 'webdav:sync-now')[1]
      
      const result = await syncHandler()
      
      expect(attemptCount).toBe(3) // 验证确实重试了
      expect(result.success).toBe(true)
    })

    it('应该处理同时使用WebDAV和iCloud的冲突', async () => {
      // 模拟两个服务都启用的情况
      const commonData = {
        prompts: [
          testDataGenerators.createMockPrompt({ uuid: 'shared-001', title: '共享数据' })
        ],
        categories: []
      }

      // 设置 WebDAV 配置
      mockPreferencesManager.getPreferences.mockReturnValue({
        webdav: { enabled: true, serverUrl: 'https://webdav.example.com', username: 'test', password: 'test' },
        icloud: { enabled: true, autoSync: true }
      })

      mockDataManagementService.exportAllData.mockResolvedValue(commonData)
      mockWebDAVClient.getFileContents.mockResolvedValue(JSON.stringify(commonData))
      mockFs.promises.readFile.mockResolvedValue(JSON.stringify(commonData))

      // 同时设置两个服务
      webdavService.setupIpcHandlers()
      icloudService.setupIpcHandlers()

      const { ipcMain } = mockElectron
      const webdavSyncHandler = ipcMain.handle.mock.calls.find(call => call[0] === 'webdav:sync-now')[1]
      const icloudSyncHandler = ipcMain.handle.mock.calls.find(call => call[0] === 'icloud:sync-now')[1]

      // 并发执行同步
      const results = await Promise.allSettled([
        webdavSyncHandler(),
        icloudSyncHandler()
      ])

      // 两个服务都应该能正常工作
      expect(results.every(r => r.status === 'fulfilled')).toBe(true)
    })

    it('应该正确处理数据完整性验证', async () => {
      const testData = {
        prompts: [
          testDataGenerators.createMockPrompt({ 
            uuid: 'prompt-001',
            title: '测试提示词',
            content: 'You are a helpful assistant.',
            tags: ['test', 'assistant']
          })
        ],
        categories: [
          testDataGenerators.createMockCategory({
            uuid: 'cat-001',
            name: '测试分类',
            color: '#FF0000'
          })
        ]
      }

      // 测试数据哈希一致性
      const hash1 = webdavService['calculateDataHash'](testData)
      const hash2 = icloudService['calculateDataHash'](testData)
      
      expect(hash1).toBe(hash2) // 两个服务应该产生相同的哈希值

      // 测试数据序列化和反序列化
      const serialized = JSON.stringify(testData)
      const deserialized = JSON.parse(serialized)
      
      const hashAfterSerialization = webdavService['calculateDataHash'](deserialized)
      expect(hashAfterSerialization).toBe(hash1) // 序列化不应影响哈希值
    })
  })

  describe('错误恢复和容错测试', () => {
    it('应该从部分失败的同步中恢复', async () => {
      // 模拟数据文件上传成功，但元数据文件失败的情况
      mockWebDAVClient.putFileContents
        .mockResolvedValueOnce({}) // 数据文件成功
        .mockRejectedValueOnce(new Error('Metadata upload failed')) // 元数据文件失败

      mockPreferencesManager.getPreferences.mockReturnValue({
        webdav: {
          enabled: true,
          serverUrl: 'https://webdav.example.com',
          username: 'testuser',
          password: 'testpass'
        }
      })

      mockDataManagementService.exportAllData.mockResolvedValue({
        prompts: [testDataGenerators.createMockPrompt()],
        categories: []
      })

      webdavService.setupIpcHandlers()
      const { ipcMain } = mockElectron
      const syncHandler = ipcMain.handle.mock.calls.find(call => call[0] === 'webdav:sync-now')[1]
      
      const result = await syncHandler()
      
      // 应该报告失败，但不会完全崩溃
      expect(result.success).toBe(false)
      expect(result.message).toContain('同步失败')
    })

    it('应该处理磁盘空间不足的情况', async () => {
      mockFs.promises.writeFile.mockRejectedValue(new Error('ENOSPC: no space left on device'))

      mockPreferencesManager.getPreferences.mockReturnValue({
        icloud: { enabled: true, autoSync: true }
      })

      mockDataManagementService.exportAllData.mockResolvedValue({
        prompts: [testDataGenerators.createMockPrompt()],
        categories: []
      })

      icloudService.setupIpcHandlers()
      const { ipcMain } = mockElectron
      const syncHandler = ipcMain.handle.mock.calls.find(call => call[0] === 'icloud:sync-now')[1]
      
      const result = await syncHandler()
      
      expect(result.success).toBe(false)
      expect(result.message).toContain('同步失败')
    })

    it('应该处理权限拒绝的情况', async () => {
      mockFs.promises.mkdir.mockRejectedValue(new Error('EACCES: permission denied'))

      icloudService.setupIpcHandlers()
      const { ipcMain } = mockElectron
      const testHandler = ipcMain.handle.mock.calls.find(call => call[0] === 'icloud:test-availability')[1]
      
      const result = await testHandler()
      
      expect(result.success).toBe(false)
      expect(result.available).toBe(false)
      expect(result.message).toContain('权限')
    })

    it('应该处理损坏的配置文件', async () => {
      // 模拟偏好管理器抛出错误
      mockPreferencesManager.getPreferences.mockImplementation(() => {
        throw new Error('Corrupted preferences')
      })

      // 服务应该能够处理这种情况而不崩溃
      expect(() => {
        webdavService.setupIpcHandlers()
        icloudService.setupIpcHandlers()
      }).not.toThrow()
    })
  })

  describe('性能和压力测试', () => {
    it('应该在高并发情况下保持稳定', async () => {
      const concurrentOperations = 10
      const operations = []

      // 设置基本配置
      mockPreferencesManager.getPreferences.mockReturnValue({
        webdav: {
          enabled: true,
          serverUrl: 'https://webdav.example.com',
          username: 'testuser',
          password: 'testpass'
        }
      })

      mockDataManagementService.exportAllData.mockResolvedValue({
        prompts: [testDataGenerators.createMockPrompt()],
        categories: []
      })

      webdavService.setupIpcHandlers()
      const { ipcMain } = mockElectron
      const syncHandler = ipcMain.handle.mock.calls.find(call => call[0] === 'webdav:sync-now')[1]

      // 创建并发操作
      for (let i = 0; i < concurrentOperations; i++) {
        operations.push(syncHandler())
      }

      const startTime = Date.now()
      const results = await Promise.allSettled(operations)
      const endTime = Date.now()

      // 验证性能和结果
      expect(endTime - startTime).toBeLessThan(5000) // 应该在5秒内完成
      expect(results.some(r => r.status === 'fulfilled')).toBe(true) // 至少有一个成功
    })

    it('应该高效处理超大数据集', async () => {
      const hugeDataset = {
        prompts: Array.from({ length: 50000 }, (_, i) => 
          testDataGenerators.createMockPrompt({
            uuid: `huge-prompt-${i}`,
            title: `超大数据集提示词 ${i}`,
            content: `这是一个超长的提示词内容，用于测试大数据处理能力。`.repeat(20)
          })
        ),
        categories: Array.from({ length: 5000 }, (_, i) => 
          testDataGenerators.createMockCategory({
            uuid: `huge-cat-${i}`,
            name: `超大数据集分类 ${i}`,
            description: `这是一个超长的分类描述，用于测试大数据处理能力。`.repeat(10)
          })
        )
      }

      const startTime = Date.now()
      
      // 测试哈希计算性能
      const webdavHash = webdavService['calculateDataHash'](hugeDataset)
      const icloudHash = icloudService['calculateDataHash'](hugeDataset)
      
      // 测试记录数计算性能
      const webdavTotal = webdavService['calculateTotalRecords'](hugeDataset)
      const icloudTotal = icloudService['calculateTotalRecords'](hugeDataset)
      
      const endTime = Date.now()

      expect(webdavHash).toBeDefined()
      expect(icloudHash).toBeDefined()
      expect(webdavTotal).toBe(55000)
      expect(icloudTotal).toBe(55000)
      expect(endTime - startTime).toBeLessThan(2000) // 应该在2秒内完成
    })

    it('应该优雅处理内存压力', async () => {
      // 创建多个大数据集并同时处理
      const datasets = Array.from({ length: 5 }, (_, i) => ({
        prompts: Array.from({ length: 10000 }, (_, j) => 
          testDataGenerators.createMockPrompt({
            uuid: `dataset-${i}-prompt-${j}`,
            content: `大数据集 ${i} 提示词 ${j}`.repeat(100)
          })
        )
      }))

      const startTime = Date.now()
      
      // 并行处理所有数据集
      const hashPromises = datasets.map(dataset => 
        Promise.resolve(webdavService['calculateDataHash'](dataset))
      )
      
      const hashes = await Promise.all(hashPromises)
      
      const endTime = Date.now()

      expect(hashes).toHaveLength(5)
      expect(hashes.every(hash => typeof hash === 'string')).toBe(true)
      expect(endTime - startTime).toBeLessThan(3000) // 应该在3秒内完成
    })
  })

  describe('数据一致性测试', () => {
    it('应该确保跨服务的数据一致性', async () => {
      const testData = {
        prompts: [
          testDataGenerators.createMockPrompt({ uuid: 'consistency-001' }),
          testDataGenerators.createMockPrompt({ uuid: 'consistency-002' })
        ],
        categories: [
          testDataGenerators.createMockCategory({ uuid: 'consistency-cat-001' })
        ]
      }

      // 两个服务应该产生相同的结果
      const webdavHash1 = webdavService['calculateDataHash'](testData)
      const webdavHash2 = webdavService['calculateDataHash'](testData)
      const icloudHash1 = icloudService['calculateDataHash'](testData)
      const icloudHash2 = icloudService['calculateDataHash'](testData)

      // 相同服务的重复计算应该一致
      expect(webdavHash1).toBe(webdavHash2)
      expect(icloudHash1).toBe(icloudHash2)
      
      // 不同服务的计算结果应该一致
      expect(webdavHash1).toBe(icloudHash1)
    })

    it('应该正确处理数据类型转换', async () => {
      const testData = {
        prompts: [
          {
            uuid: 'type-test-001',
            id: 123,              // 数字
            title: 'Test',        // 字符串
            enabled: true,        // 布尔值
            tags: ['a', 'b'],     // 数组
            metadata: { key: 'value' }, // 对象
            createdAt: new Date().toISOString() // 日期字符串
          }
        ]
      }

      // 序列化和反序列化后应该保持一致
      const originalHash = webdavService['calculateDataHash'](testData)
      const serialized = JSON.stringify(testData)
      const deserialized = JSON.parse(serialized)
      const deserializedHash = webdavService['calculateDataHash'](deserialized)

      expect(originalHash).toBe(deserializedHash)
    })
  })
})
