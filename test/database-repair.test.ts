/**
 * 数据库修复功能测试
 * 用于验证数据库健康检查和修复功能
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mockDatabaseService, setupTestEnvironment, cleanupTestEnvironment } from './helpers/test-utils'

// Mock 数据库服务管理器
vi.mock('../src/renderer/lib/services', () => ({
  databaseServiceManager: mockDatabaseService
}))

describe('数据库修复功能', () => {
  beforeEach(() => {
    setupTestEnvironment()
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanupTestEnvironment()
  })

  describe('数据库健康状态检查', () => {
    it('应该返回健康状态信息', async () => {
      // 准备测试数据
      const mockHealthStatus = {
        healthy: true,
        missingStores: [],
        message: '数据库状态正常'
      }

      mockDatabaseService.getHealthStatus.mockResolvedValue(mockHealthStatus)

      // 执行测试
      const healthStatus = await mockDatabaseService.getHealthStatus()

      // 验证结果
      expect(mockDatabaseService.getHealthStatus).toHaveBeenCalledOnce()
      expect(healthStatus).toEqual(mockHealthStatus)
      expect(healthStatus.healthy).toBe(true)
      expect(healthStatus.missingStores).toEqual([])
    })

    it('应该检测到数据库问题', async () => {
      // 准备测试数据
      const mockHealthStatus = {
        healthy: false,
        missingStores: ['prompts', 'categories'],
        message: '数据库存在问题'
      }

      mockDatabaseService.getHealthStatus.mockResolvedValue(mockHealthStatus)

      // 执行测试
      const healthStatus = await mockDatabaseService.getHealthStatus()

      // 验证结果
      expect(healthStatus.healthy).toBe(false)
      expect(healthStatus.missingStores).toContain('prompts')
      expect(healthStatus.missingStores).toContain('categories')
    })

    it('应该处理健康检查错误', async () => {
      // 准备测试数据
      const mockError = new Error('数据库连接失败')
      mockDatabaseService.getHealthStatus.mockRejectedValue(mockError)

      // 执行测试并验证错误
      await expect(mockDatabaseService.getHealthStatus()).rejects.toThrow('数据库连接失败')
    })
  })

  describe('数据库修复功能', () => {
    it('应该成功修复数据库', async () => {
      // 准备测试数据
      const mockRepairResult = {
        success: true,
        message: '数据库修复成功',
        repairedStores: ['prompts', 'categories']
      }

      mockDatabaseService.repairDatabase.mockResolvedValue(mockRepairResult)

      // 执行测试
      const repairResult = await mockDatabaseService.repairDatabase()

      // 验证结果
      expect(mockDatabaseService.repairDatabase).toHaveBeenCalledOnce()
      expect(repairResult.success).toBe(true)
      expect(repairResult.message).toBe('数据库修复成功')
      expect(repairResult.repairedStores).toContain('prompts')
    })

    it('应该处理修复失败情况', async () => {
      // 准备测试数据
      const mockRepairResult = {
        success: false,
        message: '数据库修复失败：权限不足',
        repairedStores: []
      }

      mockDatabaseService.repairDatabase.mockResolvedValue(mockRepairResult)

      // 执行测试
      const repairResult = await mockDatabaseService.repairDatabase()

      // 验证结果
      expect(repairResult.success).toBe(false)
      expect(repairResult.message).toContain('修复失败')
    })

    it('应该处理修复过程中的异常', async () => {
      // 准备测试数据
      const mockError = new Error('修复过程中发生异常')
      mockDatabaseService.repairDatabase.mockRejectedValue(mockError)

      // 执行测试并验证错误
      await expect(mockDatabaseService.repairDatabase()).rejects.toThrow('修复过程中发生异常')
    })
  })

  describe('检查并修复功能', () => {
    it('应该在数据库正常时不执行修复', async () => {
      // 准备测试数据
      const mockResult = {
        healthy: true,
        repaired: false,
        message: '数据库状态正常，无需修复',
        missingStores: []
      }

      mockDatabaseService.checkAndRepairDatabase.mockResolvedValue(mockResult)

      // 执行测试
      const result = await mockDatabaseService.checkAndRepairDatabase()

      // 验证结果
      expect(result.healthy).toBe(true)
      expect(result.repaired).toBe(false)
      expect(result.message).toContain('正常')
    })

    it('应该在数据库有问题时执行修复', async () => {
      // 准备测试数据
      const mockResult = {
        healthy: true,
        repaired: true,
        message: '数据库已成功修复',
        missingStores: [],
        repairedStores: ['prompts']
      }

      mockDatabaseService.checkAndRepairDatabase.mockResolvedValue(mockResult)

      // 执行测试
      const result = await mockDatabaseService.checkAndRepairDatabase()

      // 验证结果
      expect(result.healthy).toBe(true)
      expect(result.repaired).toBe(true)
      expect(result.message).toContain('修复')
    })

    it('应该处理无法修复的情况', async () => {
      // 准备测试数据
      const mockResult = {
        healthy: false,
        repaired: false,
        message: '数据库仍有问题，无法自动修复',
        missingStores: ['corrupted_store']
      }

      mockDatabaseService.checkAndRepairDatabase.mockResolvedValue(mockResult)

      // 执行测试
      const result = await mockDatabaseService.checkAndRepairDatabase()

      // 验证结果
      expect(result.healthy).toBe(false)
      expect(result.repaired).toBe(false)
      expect(result.missingStores).toContain('corrupted_store')
    })
  })

  describe('初始化等待', () => {
    it('应该等待数据库初始化完成', async () => {
      // Mock 初始化方法
      mockDatabaseService.waitForInitialization.mockResolvedValue(undefined)

      // 执行测试
      await mockDatabaseService.waitForInitialization()

      // 验证调用
      expect(mockDatabaseService.waitForInitialization).toHaveBeenCalledOnce()
    })

    it('应该处理初始化超时', async () => {
      // 准备测试数据
      const mockError = new Error('初始化超时')
      mockDatabaseService.waitForInitialization.mockRejectedValue(mockError)

      // 执行测试并验证错误
      await expect(mockDatabaseService.waitForInitialization()).rejects.toThrow('初始化超时')
    })
  })
})
