/**
 * IPC 重构测试
 * 验证所有 IPC 相关功能是否正常工作
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mockIpcUtils, setupTestEnvironment, cleanupTestEnvironment } from './helpers/test-utils'

// Mock IPC 模块
vi.mock('../src/renderer/lib/ipc', () => ({
  IpcUtils: mockIpcUtils,
  ipcInvoke: mockIpcUtils.invoke
}))

describe('IPC 重构测试', () => {
  beforeEach(() => {
    setupTestEnvironment()
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanupTestEnvironment()
  })

  describe('IpcUtils 类', () => {
    it('应该存在所有必要的方法', () => {
      expect(mockIpcUtils).toBeDefined()
      expect(typeof mockIpcUtils.invoke).toBe('function')
      expect(typeof mockIpcUtils.safeInvoke).toBe('function')
      expect(typeof mockIpcUtils.isElectronAvailable).toBe('function')
    })

    it('invoke 方法应该正常工作', async () => {
      // 准备测试数据
      const mockResult = { success: true, data: 'test data' }
      mockIpcUtils.invoke.mockResolvedValue(mockResult)

      // 执行测试
      const result = await mockIpcUtils.invoke('test-channel', 'test-arg')

      // 验证结果
      expect(mockIpcUtils.invoke).toHaveBeenCalledWith('test-channel', 'test-arg')
      expect(result).toEqual(mockResult)
    })

    it('safeInvoke 方法应该处理错误', async () => {
      // 准备测试数据
      const mockError = new Error('IPC 调用失败')
      mockIpcUtils.safeInvoke.mockRejectedValue(mockError)

      // 执行测试并验证错误处理
      await expect(mockIpcUtils.safeInvoke('test-channel')).rejects.toThrow('IPC 调用失败')
    })

    it('isElectronAvailable 方法应该返回布尔值', () => {
      // 测试 Electron 可用性检查
      const isAvailable = mockIpcUtils.isElectronAvailable()
      expect(typeof isAvailable).toBe('boolean')
    })
  })

  describe('向后兼容性', () => {
    it('向后兼容的 ipcInvoke 函数应该存在', () => {
      const { ipcInvoke } = require('../src/renderer/lib/ipc')
      expect(ipcInvoke).toBeDefined()
      expect(typeof ipcInvoke).toBe('function')
    })

    it('ipcInvoke 应该委托给 IpcUtils.invoke', async () => {
      const { ipcInvoke } = require('../src/renderer/lib/ipc')
      
      // 准备测试数据
      const mockResult = { data: 'legacy test' }
      mockIpcUtils.invoke.mockResolvedValue(mockResult)

      // 执行测试
      const result = await ipcInvoke('legacy-channel', 'legacy-arg')

      // 验证调用
      expect(mockIpcUtils.invoke).toHaveBeenCalledWith('legacy-channel', 'legacy-arg')
      expect(result).toEqual(mockResult)
    })
  })

  describe('错误处理', () => {
    it('应该正确处理网络错误', async () => {
      // 准备测试数据
      const networkError = new Error('网络连接失败')
      mockIpcUtils.invoke.mockRejectedValue(networkError)

      // 执行测试并验证错误处理
      await expect(mockIpcUtils.invoke('network-test')).rejects.toThrow('网络连接失败')
    })

    it('应该正确处理超时错误', async () => {
      // 准备测试数据
      const timeoutError = new Error('请求超时')
      mockIpcUtils.safeInvoke.mockRejectedValue(timeoutError)

      // 执行测试并验证错误处理
      await expect(mockIpcUtils.safeInvoke('timeout-test')).rejects.toThrow('请求超时')
    })
  })

  describe('Electron 环境检测', () => {
    it('在 Electron 环境中应该返回 true', () => {
      // 设置 Electron 环境
      mockIpcUtils.isElectronAvailable.mockReturnValue(true)

      // 执行测试
      const result = mockIpcUtils.isElectronAvailable()

      // 验证结果
      expect(result).toBe(true)
    })

    it('在浏览器环境中应该返回 false', () => {
      // 设置浏览器环境
      mockIpcUtils.isElectronAvailable.mockReturnValue(false)

      // 执行测试
      const result = mockIpcUtils.isElectronAvailable()

      // 验证结果
      expect(result).toBe(false)
    })
  })
})
