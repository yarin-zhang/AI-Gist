/**
 * WebDAV 同步服务测试
 * 测试各种复杂的同步场景和边界情况
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { testDataGenerators, asyncTestHelpers } from '@root/test/helpers/test-utils'

import { WebDAVService } from '../../../src/main/sync/webdav-service'
import os from 'os'
import path from 'path'
import crypto from 'crypto'

// Mock dependencies
vi.mock('webdav', () => ({
  createClient: vi.fn()
}))

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/mock/userdata'),
    getVersion: vi.fn(() => '1.0.0')
  },
  ipcMain: {
    handle: vi.fn()
  }
}))

vi.mock('fs', () => ({
  promises: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    access: vi.fn(),
    mkdir: vi.fn()
  },
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn()
}))

vi.mock('os')
vi.mock('path')
vi.mock('crypto')

describe('WebDAVService', () => {
  let service: WebDAVService
  let mockPreferencesManager: any
  let mockDataManagementService: any
  let mockWebDAVClient: any

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks()
    
    // Setup mock preferences manager
    mockPreferencesManager = {
      get: vi.fn(),
      set: vi.fn()
    }
    
    // Setup mock data management service
    mockDataManagementService = {
      exportData: vi.fn(),
      importData: vi.fn(),
      getAllData: vi.fn()
    }
    
    // Setup mock WebDAV client
    mockWebDAVClient = {
      exists: vi.fn(),
      getDirectoryContents: vi.fn(),
      getFileContents: vi.fn(),
      putFileContents: vi.fn(),
      createDirectory: vi.fn(),
      deleteFile: vi.fn()
    }
    
    // Mock crypto
    vi.mocked(crypto.createHash).mockReturnValue({
      update: vi.fn().mockReturnThis(),
      digest: vi.fn(() => 'mock-hash')
    } as any)
    
    // Mock os
    vi.mocked(os.hostname).mockReturnValue('test-host')
    
    // Mock path
    vi.mocked(path.join).mockImplementation((...args) => args.join('/'))
    
    service = new WebDAVService(mockPreferencesManager, mockDataManagementService)
  })

  afterEach(() => {
    service.cleanup()
  })

  describe('初始化', () => {
    it('应该正确初始化设备ID', () => {
      expect(service).toBeDefined()
      // 检查设备ID是否包含平台信息
      const deviceId = (service as any).deviceId
      expect(deviceId).toContain(process.platform)
      expect(deviceId).toContain('test-host')
    })

    it('应该在配置无效时抛出错误', async () => {
      mockPreferencesManager.get.mockResolvedValue(null)
      
      await expect(service.initialize()).rejects.toThrow('WebDAV 配置未找到')
    })
  })

  describe('数据转换', () => {
    it('应该正确转换传统数据格式', async () => {
      const legacyData = {
        categories: [{ id: '1', name: '测试分类' }],
        prompts: [{ id: '2', title: '测试提示词', content: '测试内容' }],
        aiConfigs: [{ id: '3', name: '测试AI配置', model: 'gpt-4' }]
      }
      
      const modernData = await (service as any).convertToModernFormat(legacyData)
      
      expect(modernData).toHaveLength(3)
      expect(modernData[0].type).toBe('category')
      expect(modernData[1].type).toBe('prompt')
      expect(modernData[2].type).toBe('aiConfig')
      
      // 验证元数据
      modernData.forEach(item => {
        expect(item.metadata.createdAt).toBeDefined()
        expect(item.metadata.updatedAt).toBeDefined()
        expect(item.metadata.version).toBe(1)
        expect(item.metadata.deviceId).toBeDefined()
        expect(item.metadata.checksum).toBeDefined()
      })
    })

    it('应该处理空数据', async () => {
      const result = await (service as any).convertToModernFormat({})
      expect(result).toEqual([])
    })

    it('应该处理损坏的数据', async () => {
      const result = await (service as any).convertToModernFormat({
        categories: 'invalid',
        prompts: null
      })
      expect(result).toEqual([])
    })
  })

  describe('校验和计算', () => {
    it('应该为相同内容产生相同的校验和', () => {
      const content1 = { title: '测试', content: '内容' }
      const content2 = { title: '测试', content: '内容' }
      
      const hash1 = (service as any).calculateItemChecksum(content1)
      const hash2 = (service as any).calculateItemChecksum(content2)
      
      expect(hash1).toBe(hash2)
    })

    it('应该为不同内容产生不同的校验和', () => {
      const content1 = { title: '测试1', content: '内容1' }
      const content2 = { title: '测试2', content: '内容2' }
      
      const hash1 = (service as any).calculateItemChecksum(content1)
      const hash2 = (service as any).calculateItemChecksum(content2)
      
      expect(hash1).not.toBe(hash2)
    })
  })

  describe('冲突解决', () => {
    it('应该选择较新的项目', async () => {
      const oldItem = {
        id: '1',
        type: 'prompt',
        content: { title: '旧标题' },
        metadata: {
          updatedAt: '2023-01-01T00:00:00.000Z',
          version: 1,
          checksum: 'old-hash'
        }
      }
      
      const newItem = {
        id: '1',
        type: 'prompt',
        content: { title: '新标题' },
        metadata: {
          updatedAt: '2023-01-02T00:00:00.000Z',
          version: 2,
          checksum: 'new-hash'
        }
      }
      
      const result = await (service as any).mergeItems(oldItem, newItem)
      
      expect(result.mergedItem.content.title).toBe('新标题')
      expect(result.needsLocalUpdate).toBe(true)
    })

    it('应该处理删除标记', async () => {
      const activeItem = {
        id: '1',
        type: 'prompt',
        content: { title: '活跃项目' },
        metadata: {
          updatedAt: '2023-01-01T00:00:00.000Z',
          version: 1,
          deleted: false,
          checksum: 'active-hash'
        }
      }
      
      const deletedItem = {
        id: '1',
        type: 'prompt',
        content: { title: '删除项目' },
        metadata: {
          updatedAt: '2023-01-02T00:00:00.000Z',
          version: 2,
          deleted: true,
          checksum: 'deleted-hash'
        }
      }
      
      const result = await (service as any).mergeItems(activeItem, deletedItem)
      
      expect(result.mergedItem.metadata.deleted).toBe(true)
      expect(result.needsLocalUpdate).toBe(true)
    })

    it('应该处理相同项目', async () => {
      const item1 = {
        id: '1',
        type: 'prompt',
        content: { title: '相同项目' },
        metadata: {
          updatedAt: '2023-01-01T00:00:00.000Z',
          version: 1,
          checksum: 'same-hash'
        }
      }
      
      const item2 = { ...item1 }
      
      const result = await (service as any).mergeItems(item1, item2)
      
      expect(result.hasChanges).toBe(false)
      expect(result.needsLocalUpdate).toBe(false)
      expect(result.type).toBe('keep')
    })
  })

  describe('快照合并', () => {
    it('应该正确合并本地和远程快照', async () => {
      const localSnapshot = {
        items: [
          { id: '1', type: 'prompt', content: { title: '本地1' }, metadata: { updatedAt: '2023-01-01T00:00:00.000Z', checksum: 'local1' } },
          { id: '2', type: 'prompt', content: { title: '共同' }, metadata: { updatedAt: '2023-01-01T00:00:00.000Z', checksum: 'same' } }
        ],
        metadata: { syncId: 'local-sync-1' }
      }
      
      const remoteSnapshot = {
        items: [
          { id: '2', type: 'prompt', content: { title: '共同' }, metadata: { updatedAt: '2023-01-01T00:00:00.000Z', checksum: 'same' } },
          { id: '3', type: 'prompt', content: { title: '远程3' }, metadata: { updatedAt: '2023-01-01T00:00:00.000Z', checksum: 'remote3' } }
        ],
        metadata: { syncId: 'remote-sync-1' }
      }
      
      const result = await (service as any).mergeSnapshots(localSnapshot, remoteSnapshot)
      
      expect(result.mergedSnapshot.items).toHaveLength(3)
      expect(result.itemsCreated).toBe(1) // 远程3
      expect(result.hasChanges).toBe(true)
    })

    it('应该处理空快照', async () => {
      const emptySnapshot = { items: [], metadata: { syncId: 'empty' } }
      const fullSnapshot = {
        items: [{ id: '1', type: 'prompt', content: { title: '测试' }, metadata: { checksum: 'test' } }],
        metadata: { syncId: 'full' }
      }
      
      const result = await (service as any).mergeSnapshots(emptySnapshot, fullSnapshot)
      
      expect(result.mergedSnapshot.items).toHaveLength(1)
      expect(result.itemsCreated).toBe(1)
    })
  })

  describe('同步锁', () => {
    it('应该正确获取和释放同步锁', async () => {
      const lockId = 'test-lock'
      const mockLock = {
        id: lockId,
        deviceId: (service as any).deviceId,
        timestamp: new Date().toISOString(),
        type: 'sync',
        ttl: 300000
      }
      
      mockWebDAVClient.exists.mockResolvedValue(false)
      mockWebDAVClient.putFileContents.mockResolvedValue(true)
      mockWebDAVClient.deleteFile.mockResolvedValue(true)
      
      await (service as any).acquireSyncLock(mockWebDAVClient)
      expect(mockWebDAVClient.putFileContents).toHaveBeenCalled()
      
      await (service as any).releaseSyncLock(mockWebDAVClient)
      expect(mockWebDAVClient.deleteFile).toHaveBeenCalled()
    })

    it('应该处理锁冲突', async () => {
      const existingLock = {
        id: 'other-lock',
        deviceId: 'other-device',
        timestamp: new Date().toISOString(),
        type: 'sync',
        ttl: 300000
      }
      
      mockWebDAVClient.exists.mockResolvedValue(true)
      mockWebDAVClient.getFileContents.mockResolvedValue(JSON.stringify(existingLock))
      
      await expect((service as any).acquireSyncLock(mockWebDAVClient))
        .rejects.toThrow('同步锁被其他设备占用')
    })
  })

  describe('错误处理', () => {
    it('应该正确分类配置错误', () => {
      const configErrors = [
        'unauthorized access',
        'forbidden resource',
        'authentication failed',
        'invalid credentials'
      ]
      
      configErrors.forEach(error => {
        expect((service as any).isConfigurationError(error)).toBe(true)
      })
    })

    it('应该正确分类网络错误', () => {
      const networkErrors = [
        'network timeout',
        'connection refused',
        'ENOTFOUND',
        'ECONNRESET'
      ]
      
      networkErrors.forEach(error => {
        expect((service as any).isNetworkError(error)).toBe(true)
      })
    })

    it('应该处理重试逻辑', async () => {
      let attempts = 0
      const failingOperation = async () => {
        attempts++
        if (attempts < 3) {
          throw new Error('temporary failure')
        }
        return 'success'
      }
      
      const result = await (service as any).executeWithRetry(
        failingOperation,
        'test-operation',
        { maxRetries: 3, baseDelay: 10 }
      )
      
      expect(result).toBe('success')
      expect(attempts).toBe(3)
    })
  })

  describe('边界情况', () => {
    it('应该处理同步进行中的情况', async () => {
      // 设置同步进行中状态
      (service as any).syncInProgress = true
      
      const result = await service.performIntelligentSync()
      
      expect(result.success).toBe(false)
      expect(result.message).toContain('同步正在进行中')
    })

    it('应该处理设备ID生成失败', () => {
      vi.mocked(os.hostname).mockImplementation(() => {
        throw new Error('hostname failed')
      })
      
      // 创建新的服务实例来测试设备ID生成
      const newService = new WebDAVService(mockPreferencesManager)
      const deviceId = (newService as any).deviceId
      
      // 应该有回退方案
      expect(deviceId).toBeDefined()
      expect(deviceId.length).toBeGreaterThan(0)
    })

    it('应该处理大量数据项', async () => {
      // 生成大量测试数据
      const largeDataset = {
        categories: Array.from({ length: 1000 }, (_, i) => ({
          id: `cat-${i}`,
          name: `分类${i}`
        })),
        prompts: Array.from({ length: 5000 }, (_, i) => ({
          id: `prompt-${i}`,
          title: `提示词${i}`,
          content: `内容${i}`
        }))
      }
      
      const result = await (service as any).convertToModernFormat(largeDataset)
      
      expect(result).toHaveLength(6000)
      expect(result.filter(item => item.type === 'category')).toHaveLength(1000)
      expect(result.filter(item => item.type === 'prompt')).toHaveLength(5000)
    })

    it('应该处理特殊字符和Unicode', async () => {
      const specialData = {
        categories: [{
          id: '1',
          name: '测试分类 🚀 with émojis & spëcial chars'
        }],
        prompts: [{
          id: '2',
          title: '多语言测试: 中文 English العربية 日本語',
          content: 'Special chars: <>&"\'`\n\t\r\0'
        }]
      }
      
      const result = await (service as any).convertToModernFormat(specialData)
      
      expect(result).toHaveLength(2)
      expect(result[0].content.name).toContain('🚀')
      expect(result[1].content.title).toContain('العربية')
    })
  })
})

