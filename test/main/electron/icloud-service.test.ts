/**
 * iCloud 同步服务测试
 * 测试各种复杂的同步场景和边界情况
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { testDataGenerators, asyncTestHelpers } from '../../helpers/test-utils'

// Mock 依赖模块
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

vi.mock('path', () => ({
  join: vi.fn((...args) => args.join('/')),
  dirname: vi.fn()
}))

vi.mock('os', () => ({
  homedir: vi.fn(() => '/mock/home'),
  hostname: vi.fn(() => 'mock-host'),
  platform: vi.fn(() => 'darwin'),
  arch: vi.fn(() => 'x64')
}))

vi.mock('crypto', () => ({
  createHash: vi.fn(() => ({
    update: vi.fn().mockReturnThis(),
    digest: vi.fn(() => 'mocked-hash')
  }))
}))

// Mock 偏好管理器
const mockPreferencesManager = {
  getPreferences: vi.fn(),
  updatePreferences: vi.fn()
}

// Mock 数据管理服务
const mockDataManagementService = {
  exportAllData: vi.fn()
}

describe('iCloud 同步服务', () => {
  let icloudService: any
  let mockFs: any
  let mockElectron: any

  beforeEach(async () => {
    // 重置所有模拟
    vi.clearAllMocks()
    
    // 动态导入服务类
    const { ICloudService } = await import('../../../src/main/electron/icloud-service')
    
    // 设置 fs 模拟
    mockFs = await import('fs')
    vi.mocked(mockFs.promises.stat).mockResolvedValue({ isDirectory: () => true } as any)
    vi.mocked(mockFs.promises.readdir).mockResolvedValue([])
    vi.mocked(mockFs.promises.mkdir).mockResolvedValue(undefined)
    vi.mocked(mockFs.promises.writeFile).mockResolvedValue(undefined)
    vi.mocked(mockFs.promises.readFile).mockResolvedValue('{}')
    vi.mocked(mockFs.promises.access).mockResolvedValue(undefined)
    vi.mocked(mockFs.existsSync).mockReturnValue(true)
    
    // 设置 electron 模拟
    mockElectron = await import('electron')
    
    // 初始化服务
    icloudService = new ICloudService(mockPreferencesManager, mockDataManagementService)
  })

  afterEach(() => {
    icloudService.cleanup()
  })

  describe('基础功能测试', () => {
    it('应该正确初始化服务', () => {
      expect(icloudService).toBeDefined()
      expect(typeof icloudService.setupIpcHandlers).toBe('function')
      expect(typeof icloudService.cleanup).toBe('function')
    })

    it('应该正确设置和清理 IPC 处理器', () => {
      const { ipcMain } = mockElectron
      
      icloudService.setupIpcHandlers()
      expect(ipcMain.handle).toHaveBeenCalledWith('icloud:test-availability', expect.any(Function))
      expect(ipcMain.handle).toHaveBeenCalledWith('icloud:sync-now', expect.any(Function))
      
      icloudService.cleanup()
      expect(ipcMain.removeAllListeners).toHaveBeenCalledWith('icloud:test-availability')
      expect(ipcMain.removeAllListeners).toHaveBeenCalledWith('icloud:sync-now')
    })

    it('应该正确获取 iCloud 路径', () => {
      // 测试默认路径
      mockPreferencesManager.getPreferences.mockReturnValue({})
      const defaultPath = icloudService['getICloudPath']()
      expect(defaultPath).toBe('/mock/home/Library/Mobile Documents/com~apple~CloudDocs')
      
      // 测试自定义路径
      const customPath = '/custom/icloud/path'
      mockPreferencesManager.getPreferences.mockReturnValue({
        icloud: { customPath }
      })
      const customResult = icloudService['getICloudPath']()
      expect(customResult).toBe(customPath)
    })

    it('应该正确获取同步目录', () => {
      mockPreferencesManager.getPreferences.mockReturnValue({})
      const syncDir = icloudService['getSyncDirectory']()
      expect(syncDir).toBe('/mock/home/Library/Mobile Documents/com~apple~CloudDocs/AI-Gist-Sync')
    })
  })

  describe('iCloud 可用性测试', () => {
    it('应该检测 iCloud Drive 可用性', async () => {
      // Mock 成功的文件系统操作
      mockFs.promises.stat.mockResolvedValueOnce({ isDirectory: () => true })
      mockFs.promises.readdir.mockResolvedValueOnce(['file1.txt', 'folder1'])
      mockFs.promises.mkdir.mockResolvedValueOnce(undefined)
      mockFs.promises.writeFile.mockResolvedValueOnce(undefined)
      mockFs.promises.readFile.mockResolvedValueOnce('test content')
      mockFs.promises.unlink.mockResolvedValueOnce(undefined)
      mockFs.promises.rmdir.mockResolvedValueOnce(undefined)

      icloudService.setupIpcHandlers()
      const { ipcMain } = await import('electron')
      const handler = ipcMain.handle.mock.calls.find(call => call[0] === 'icloud:test-availability')[1]
      
      const result = await handler()
      
      expect(result.success).toBe(true)
      expect(result.available).toBe(true)
      expect(result.message).toContain('iCloud Drive 可用')
    })

    it('应该处理 iCloud Drive 不可用的情况', async () => {
      mockFs.promises.stat.mockRejectedValueOnce(new Error('ENOENT: no such file or directory'))

      icloudService.setupIpcHandlers()
      const { ipcMain } = await import('electron')
      const handler = ipcMain.handle.mock.calls.find(call => call[0] === 'icloud:test-availability')[1]
      
      const result = await handler()
      
      expect(result.success).toBe(false)
      expect(result.available).toBe(false)
      expect(result.message).toContain('不存在或无法访问')
    })

    it('应该处理目录权限问题', async () => {
      mockFs.promises.stat.mockResolvedValueOnce({ isDirectory: () => true })
      mockFs.promises.readdir.mockRejectedValueOnce(new Error('EACCES: permission denied'))

      icloudService.setupIpcHandlers()
      const { ipcMain } = mockElectron
      const handler = ipcMain.handle.mock.calls.find(call => call[0] === 'icloud:test-availability')[1]
      
      const result = await handler()
      
      expect(result.success).toBe(true) // 读取失败不影响整体可用性判断
      expect(result.available).toBe(true)
    })

    it('应该处理写入权限测试', async () => {
      mockFs.promises.stat.mockResolvedValueOnce({ isDirectory: () => true })
      mockFs.promises.readdir.mockResolvedValueOnce([])
      mockFs.promises.mkdir.mockRejectedValueOnce(new Error('EACCES: permission denied'))

      icloudService.setupIpcHandlers()
      const { ipcMain } = mockElectron
      const handler = ipcMain.handle.mock.calls.find(call => call[0] === 'icloud:test-availability')[1]
      
      const result = await handler()
      
      expect(result.success).toBe(false)
      expect(result.available).toBe(false)
      expect(result.message).toContain('无法创建测试目录')
    })
  })

  describe('同步决策算法测试', () => {
    it('应该在远程无数据时选择首次上传', async () => {
      const localData = { prompts: [testDataGenerators.createMockPrompt()] }
      const localMetadata = {
        ...testDataGenerators.createMockSyncMetadata(),
        totalRecords: 1
      }
      const localDataHash = 'local-hash'

      const decision = await icloudService['makeSyncDecision'](
        localData, localMetadata, localDataHash,
        null, null
      )

      expect(decision.action).toBe('upload_only')
      expect(decision.reason).toContain('首次上传')
    })

    it('应该在本地无数据时选择首次下载', async () => {
      const remoteData = { prompts: [testDataGenerators.createMockPrompt()] }
      const remoteMetadata = {
        ...testDataGenerators.createMockSyncMetadata(),
        totalRecords: 1
      }
      const localMetadata = {
        ...testDataGenerators.createMockSyncMetadata(),
        totalRecords: 0
      }

      const decision = await icloudService['makeSyncDecision'](
        {}, localMetadata, 'empty-hash',
        remoteData, remoteMetadata
      )

      expect(decision.action).toBe('download_only')
      expect(decision.reason).toContain('首次下载')
    })

    it('应该基于记录数差异做决策', async () => {
      const localData = { prompts: [testDataGenerators.createMockPrompt()] }
      const remoteData = { 
        prompts: [
          testDataGenerators.createMockPrompt({ id: 1 }),
          testDataGenerators.createMockPrompt({ id: 2 }),
          testDataGenerators.createMockPrompt({ id: 3 })
        ] 
      }
      
      const localMetadata = { ...testDataGenerators.createMockSyncMetadata(), totalRecords: 1 }
      const remoteMetadata = { ...testDataGenerators.createMockSyncMetadata(), totalRecords: 3 }

      const decision = await icloudService['makeSyncDecision'](
        localData, localMetadata, 'local-hash',
        remoteData, remoteMetadata
      )

      expect(decision.action).toBe('download_only')
      expect(decision.reason).toContain('远程多了')
    })

    it('应该处理同设备的不同同步状态', async () => {
      const sameDeviceId = 'device-123'
      const localMetadata = {
        ...testDataGenerators.createMockSyncMetadata(),
        deviceId: sameDeviceId,
        syncCount: 5,
        totalRecords: 3
      }
      const remoteMetadata = {
        ...testDataGenerators.createMockSyncMetadata(),
        deviceId: sameDeviceId,
        syncCount: 5,
        totalRecords: 2
      }

      const decision = await icloudService['makeSyncDecision'](
        { prompts: [] }, localMetadata, 'local-hash',
        { prompts: [] }, remoteMetadata
      )

      expect(decision.action).toBe('upload_only')
      expect(decision.reason).toContain('同设备本地数据有变化')
    })

    it('应该检测并发修改', async () => {
      const now = Date.now()
      const localMetadata = {
        ...testDataGenerators.createMockSyncMetadata(),
        deviceId: 'device-1',
        lastSyncTime: new Date(now).toISOString(),
        totalRecords: 2
      }
      const remoteMetadata = {
        ...testDataGenerators.createMockSyncMetadata(),
        deviceId: 'device-2',
        lastSyncTime: new Date(now + 30000).toISOString(), // 30秒差异
        totalRecords: 2
      }

      const decision = await icloudService['makeSyncDecision'](
        { prompts: [] }, localMetadata, 'local-hash',
        { prompts: [] }, remoteMetadata
      )

      expect(decision.action).toBe('merge')
      expect(decision.reason).toContain('并发修改')
    })
  })

  describe('数据哈希和标准化测试', () => {
    it('应该正确计算数据哈希', () => {
      const data = {
        prompts: [testDataGenerators.createMockPrompt({ id: 1 })],
        categories: [testDataGenerators.createMockCategory({ id: 1 })]
      }

      const hash = icloudService['calculateDataHash'](data)
      expect(hash).toBeDefined()
      expect(typeof hash).toBe('string')
      expect(hash.length).toBe(16) // 截取前16位
    })

    it('应该为相同数据生成相同哈希', () => {
      const data1 = {
        prompts: [testDataGenerators.createMockPrompt({ id: 1, title: '测试' })],
        categories: []
      }
      
      const data2 = {
        prompts: [testDataGenerators.createMockPrompt({ id: 1, title: '测试' })],
        categories: []
      }

      const hash1 = icloudService['calculateDataHash'](data1)
      const hash2 = icloudService['calculateDataHash'](data2)

      expect(hash1).toBe(hash2)
    })

    it('应该正确排序数组数据', () => {
      const unsortedData = [
        { id: 3, name: 'C' },
        { id: 1, name: 'A' },
        { id: 2, name: 'B' }
      ]

      const sorted = icloudService['sortArray'](unsortedData, 'id')
      expect(sorted.map(item => item.id)).toEqual([1, 2, 3])
    })

    it('应该正确排序对象属性', () => {
      const obj = { c: 3, a: 1, b: 2 }
      const sorted = icloudService['sortObject'](obj)
      
      const keys = Object.keys(sorted)
      expect(keys).toEqual(['a', 'b', 'c'])
    })

    it('应该过滤时间戳字段', () => {
      const dataWithTimestamps = {
        id: 1,
        title: '测试',
        createdAt: '2023-01-01T00:00:00Z',
        updatedAt: '2023-01-02T00:00:00Z',
        modifiedAt: '2023-01-03T00:00:00Z',
        lastModified: '2023-01-04T00:00:00Z',
        timestamp: '2023-01-05T00:00:00Z'
      }

      const normalized = icloudService['normalizeDataForHashing'](dataWithTimestamps)
      
      expect(normalized).toHaveProperty('id')
      expect(normalized).toHaveProperty('title')
      expect(normalized).not.toHaveProperty('createdAt')
      expect(normalized).not.toHaveProperty('updatedAt')
      expect(normalized).not.toHaveProperty('modifiedAt')
      expect(normalized).not.toHaveProperty('lastModified')
      expect(normalized).not.toHaveProperty('timestamp')
    })
  })

  describe('数据变更分析测试', () => {
    it('应该正确分析首次同步', () => {
      const newData = {
        categories: [
          testDataGenerators.createMockCategory({ id: 1 }),
          testDataGenerators.createMockCategory({ id: 2 })
        ],
        prompts: [
          testDataGenerators.createMockPrompt({ id: 1 })
        ]
      }

      const analysis = icloudService['analyzeDataChanges'](newData, null)

      expect(analysis.hasChanges).toBe(true)
      expect(analysis.categoriesAdded).toBe(2)
      expect(analysis.promptsAdded).toBe(1)
      expect(analysis.totalChanges).toBe(3)
      expect(analysis.details).toContain('新增 2 个分类')
      expect(analysis.details).toContain('新增 1 个提示词')
    })

    it('应该正确检测分类变更', () => {
      const oldData = {
        categories: [
          testDataGenerators.createMockCategory({ 
            uuid: 'cat-1', 
            name: '原始名称',
            updatedAt: '2023-01-01T00:00:00Z'
          })
        ],
        prompts: []
      }

      const newData = {
        categories: [
          testDataGenerators.createMockCategory({ 
            uuid: 'cat-1', 
            name: '修改后名称',
            updatedAt: '2023-01-02T00:00:00Z'
          }),
          testDataGenerators.createMockCategory({ 
            uuid: 'cat-2', 
            name: '新分类'
          })
        ],
        prompts: []
      }

      const analysis = icloudService['analyzeDataChanges'](newData, oldData)

      expect(analysis.hasChanges).toBe(true)
      expect(analysis.categoriesModified).toBe(1)
      expect(analysis.categoriesAdded).toBe(1)
      expect(analysis.totalChanges).toBe(2)
    })

    it('应该正确检测提示词变更', () => {
      const oldData = {
        categories: [],
        prompts: [
          testDataGenerators.createMockPrompt({ 
            uuid: 'prompt-1', 
            title: '原始标题'
          }),
          testDataGenerators.createMockPrompt({ 
            uuid: 'prompt-2', 
            title: '将被删除'
          })
        ]
      }

      const newData = {
        categories: [],
        prompts: [
          testDataGenerators.createMockPrompt({ 
            uuid: 'prompt-1', 
            title: '修改后标题'
          }),
          testDataGenerators.createMockPrompt({ 
            uuid: 'prompt-3', 
            title: '新提示词'
          })
        ]
      }

      const analysis = icloudService['analyzeDataChanges'](newData, oldData)

      expect(analysis.hasChanges).toBe(true)
      expect(analysis.promptsModified).toBe(1) // prompt-1 被修改
      expect(analysis.promptsDeleted).toBe(1)  // prompt-2 被删除
      expect(analysis.promptsAdded).toBe(1)    // prompt-3 被添加
      expect(analysis.totalChanges).toBe(3)
    })

    it('应该正确处理无变更情况', () => {
      const data = {
        categories: [testDataGenerators.createMockCategory({ uuid: 'cat-1' })],
        prompts: [testDataGenerators.createMockPrompt({ uuid: 'prompt-1' })]
      }

      const analysis = icloudService['analyzeDataChanges'](data, data)

      expect(analysis.hasChanges).toBe(false)
      expect(analysis.totalChanges).toBe(0)
      expect(analysis.details).toHaveLength(0)
    })
  })

  describe('同步执行测试', () => {
    beforeEach(() => {
      // Mock 文件系统操作
      mockFs.promises.stat.mockResolvedValue({ isDirectory: () => true })
      mockFs.promises.access.mockResolvedValue(undefined)
      mockFs.promises.mkdir.mockResolvedValue(undefined)
      mockFs.promises.writeFile.mockResolvedValue(undefined)
      mockFs.promises.readFile.mockResolvedValue('{}')
      
      // Mock 配置
      mockPreferencesManager.getPreferences.mockReturnValue({
        icloud: {
          enabled: true,
          autoSync: true,
          syncInterval: 30
        }
      })
      
      // Mock 数据导出
      mockDataManagementService.exportAllData.mockResolvedValue({
        prompts: [testDataGenerators.createMockPrompt()],
        categories: [testDataGenerators.createMockCategory()]
      })
    })

    it('应该成功执行立即同步', async () => {
      icloudService.setupIpcHandlers()
      const { ipcMain } = mockElectron
      const syncHandler = ipcMain.handle.mock.calls.find(call => call[0] === 'icloud:sync-now')[1]
      
      const result = await syncHandler()
      
      expect(result.success).toBe(true)
      expect(result.filesUploaded).toBeGreaterThan(0)
      expect(mockFs.promises.writeFile).toHaveBeenCalled()
    })

    it('应该处理同步目录创建失败', async () => {
      mockFs.promises.mkdir.mockRejectedValue(new Error('Permission denied'))
      
      icloudService.setupIpcHandlers()
      const { ipcMain } = mockElectron
      const syncHandler = ipcMain.handle.mock.calls.find(call => call[0] === 'icloud:sync-now')[1]
      
      const result = await syncHandler()
      
      expect(result.success).toBe(false)
      expect(result.message).toContain('同步失败')
    })

    it('应该正确处理手动上传', async () => {
      icloudService.setupIpcHandlers()
      const { ipcMain } = mockElectron
      const uploadHandler = ipcMain.handle.mock.calls.find(call => call[0] === 'icloud:manual-upload')[1]
      
      const result = await uploadHandler()
      
      expect(result.success).toBe(true)
      expect(result.hasConflicts).toBe(false)
      expect(mockFs.promises.writeFile).toHaveBeenCalledTimes(2) // data.json 和 metadata.json
    })

    it('应该正确处理手动下载', async () => {
      const remoteData = {
        prompts: [testDataGenerators.createMockPrompt({ id: 1, title: '远程提示词' })],
        categories: []
      }
      const remoteMetadata = testDataGenerators.createMockSyncMetadata()

      mockFs.promises.readFile
        .mockResolvedValueOnce(JSON.stringify(remoteData))
        .mockResolvedValueOnce(JSON.stringify(remoteMetadata))

      icloudService.setupIpcHandlers()
      const { ipcMain } = mockElectron
      const downloadHandler = ipcMain.handle.mock.calls.find(call => call[0] === 'icloud:manual-download')[1]
      
      const result = await downloadHandler()
      
      expect(result.success).toBe(true)
      expect(result.remoteData).toEqual(remoteData)
      expect(result.hasConflicts).toBeDefined()
    })

    it('应该处理冲突解决', async () => {
      const conflictData = {
        prompts: [testDataGenerators.createMockPrompt({ id: 1, title: '冲突数据' })],
        categories: []
      }

      icloudService['tempRemoteData'] = conflictData
      icloudService['tempRemoteMetadata'] = testDataGenerators.createMockSyncMetadata()

      const resolution = {
        strategy: 'use_remote',
        mergedData: conflictData
      }

      icloudService.setupIpcHandlers()
      const { ipcMain } = mockElectron
      const applyHandler = ipcMain.handle.mock.calls.find(call => call[0] === 'icloud:apply-downloaded-data')[1]
      
      const result = await applyHandler(null, resolution)
      
      expect(result.success).toBe(true)
      expect(result.conflictsResolved).toBeGreaterThan(0)
      // 应该调用数据导入方法
    })
  })

  describe('边界情况和错误处理', () => {
    it('应该处理空的 iCloud 目录', async () => {
      mockFs.promises.stat.mockRejectedValue(new Error('ENOENT'))
      
      const result = await icloudService['testICloudAvailability']()
      
      expect(result.success).toBe(false)
      expect(result.available).toBe(false)
      expect(result.message).toContain('不存在或无法访问')
    })

    it('应该处理损坏的同步文件', async () => {
      mockFs.promises.readFile.mockResolvedValue('invalid json {')
      mockFs.promises.stat.mockResolvedValue({ isDirectory: () => true })
      mockFs.promises.access.mockResolvedValue(undefined)
      
      icloudService.setupIpcHandlers()
      const { ipcMain } = mockElectron
      const syncHandler = ipcMain.handle.mock.calls.find(call => call[0] === 'icloud:sync-now')[1]
      
      const result = await syncHandler()
      
      expect(result.success).toBe(false)
      expect(result.message).toContain('同步失败')
    })

    it('应该处理设备 ID 生成', () => {
      const deviceId1 = icloudService['generateDeviceId']()
      const deviceId2 = icloudService['generateDeviceId']()
      
      expect(deviceId1).toBeDefined()
      expect(typeof deviceId1).toBe('string')
      expect(deviceId1.length).toBe(12) // MD5 哈希截取12位
      expect(deviceId1).toBe(deviceId2) // 同一环境应该生成相同的设备ID
    })

    it('应该处理大量数据的同步', async () => {
      const largeData = {
        prompts: Array.from({ length: 5000 }, (_, i) => 
          testDataGenerators.createMockPrompt({ id: i + 1 })
        ),
        categories: Array.from({ length: 500 }, (_, i) => 
          testDataGenerators.createMockCategory({ id: i + 1 })
        )
      }

      mockDataManagementService.exportAllData.mockResolvedValue(largeData)
      
      const hash = icloudService['calculateDataHash'](largeData)
      const totalRecords = icloudService['calculateTotalRecords'](largeData)
      
      expect(hash).toBeDefined()
      expect(totalRecords).toBe(5500)
    })

    it('应该处理同步过程中的文件系统错误', async () => {
      mockFs.promises.writeFile.mockRejectedValue(new Error('ENOSPC: no space left on device'))
      
      icloudService.setupIpcHandlers()
      const { ipcMain } = mockElectron
      const syncHandler = ipcMain.handle.mock.calls.find(call => call[0] === 'icloud:sync-now')[1]
      
      const result = await syncHandler()
      
      expect(result.success).toBe(false)
      expect(result.message).toContain('同步失败')
    })

    it('应该处理并发同步请求', async () => {
      // 设置延迟以模拟长时间运行的同步
      mockFs.promises.writeFile.mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 100))
      )
      
      icloudService.setupIpcHandlers()
      const { ipcMain } = mockElectron
      const syncHandler = ipcMain.handle.mock.calls.find(call => call[0] === 'icloud:sync-now')[1]
      
      // 同时发起多个同步请求
      const syncPromises = [
        syncHandler(),
        syncHandler(),
        syncHandler()
      ]
      
      const results = await Promise.allSettled(syncPromises)
      
      // 至少有一个成功
      expect(results.some(r => r.status === 'fulfilled' && (r.value as any).success)).toBe(true)
    })
  })

  describe('配置管理测试', () => {
    it('应该正确获取 iCloud 配置', async () => {
      const mockConfig = {
        enabled: true,
        autoSync: true,
        syncInterval: 30,
        customPath: '/custom/path'
      }

      mockPreferencesManager.getPreferences.mockReturnValue({
        icloud: mockConfig
      })

      icloudService.setupIpcHandlers()
      const { ipcMain } = mockElectron
      const getConfigHandler = ipcMain.handle.mock.calls.find(call => call[0] === 'icloud:get-config')[1]
      
      const result = await getConfigHandler()
      
      expect(result).toEqual(mockConfig)
    })

    it('应该正确设置 iCloud 配置', async () => {
      const newConfig = {
        enabled: true,
        autoSync: false,
        syncInterval: 60
      }

      icloudService.setupIpcHandlers()
      const { ipcMain } = mockElectron
      const setConfigHandler = ipcMain.handle.mock.calls.find(call => call[0] === 'icloud:set-config')[1]
      
      await setConfigHandler(null, newConfig)
      
      expect(mockPreferencesManager.updatePreferences).toHaveBeenCalledWith({
        icloud: newConfig
      })
    })

    it('应该正确打开同步目录', async () => {
      const { shell } = mockElectron
      shell.openPath = vi.fn().mockResolvedValue('')

      icloudService.setupIpcHandlers()
      const { ipcMain } = mockElectron
      const openDirHandler = ipcMain.handle.mock.calls.find(call => call[0] === 'icloud:open-sync-directory')[1]
      
      await openDirHandler()
      
      expect(shell.openPath).toHaveBeenCalledWith(
        '/mock/home/Library/Mobile Documents/com~apple~CloudDocs/AI-Gist-Sync'
      )
    })
  })

  describe('性能测试', () => {
    it('应该在合理时间内完成数据哈希计算', () => {
      const largeData = {
        prompts: Array.from({ length: 10000 }, (_, i) => 
          testDataGenerators.createMockPrompt({ 
            id: i + 1,
            content: `长内容测试 ${i}`.repeat(50)
          })
        )
      }

      const startTime = Date.now()
      const hash = icloudService['calculateDataHash'](largeData)
      const endTime = Date.now()

      expect(hash).toBeDefined()
      expect(endTime - startTime).toBeLessThan(1000) // 应该在1秒内完成
    })

    it('应该高效处理数据变更分析', () => {
      const oldData = {
        prompts: Array.from({ length: 5000 }, (_, i) => 
          testDataGenerators.createMockPrompt({ uuid: `prompt-${i}`, id: i + 1 })
        )
      }

      const newData = {
        prompts: Array.from({ length: 5000 }, (_, i) => 
          testDataGenerators.createMockPrompt({ 
            uuid: `prompt-${i}`, 
            id: i + 1,
            title: i % 2 === 0 ? `修改后-${i}` : `原始-${i}` // 50% 的数据被修改
          })
        )
      }

      const startTime = Date.now()
      const analysis = icloudService['analyzeDataChanges'](newData, oldData)
      const endTime = Date.now()

      expect(analysis).toBeDefined()
      expect(endTime - startTime).toBeLessThan(500) // 应该在500ms内完成
    })
  })
})
