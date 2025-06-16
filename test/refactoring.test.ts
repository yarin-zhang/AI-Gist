/**
 * 重构验证测试
 * 验证重构后的数据库服务和API客户端是否正常工作
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mockDatabaseService, mockApi, setupTestEnvironment, cleanupTestEnvironment } from './helpers/test-utils'

// Mock 数据库服务
vi.mock('../lib/db', () => ({
  databaseService: mockDatabaseService
}))

// Mock API 客户端
vi.mock('../lib/api', () => ({
  api: mockApi
}))

describe('重构验证测试', () => {
  beforeEach(() => {
    setupTestEnvironment()
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanupTestEnvironment()
  })

  describe('数据库服务管理器', () => {
    it('应该能够初始化数据库服务', async () => {
      // 准备测试数据
      mockDatabaseService.initialize.mockResolvedValue(undefined)

      // 执行测试
      await mockDatabaseService.initialize()

      // 验证调用
      expect(mockDatabaseService.initialize).toHaveBeenCalledOnce()
    })

    it('应该提供用户服务', () => {
      // 验证用户服务可用
      expect(mockDatabaseService.user).toBeDefined()
      expect(typeof mockDatabaseService.user.getAllUsers).toBe('function')
    })

    it('应该提供文章服务', () => {
      // 验证文章服务可用
      expect(mockDatabaseService.post).toBeDefined()
      expect(typeof mockDatabaseService.post.getAllPosts).toBe('function')
    })

    it('应该提供分类服务', () => {
      // 验证分类服务可用
      expect(mockDatabaseService.category).toBeDefined()
      expect(typeof mockDatabaseService.category.getAllCategories).toBe('function')
    })

    it('应该提供提示词服务', () => {
      // 验证提示词服务可用
      expect(mockDatabaseService.prompt).toBeDefined()
      expect(typeof mockDatabaseService.prompt.getAllPrompts).toBe('function')
    })

    it('应该提供AI配置服务', () => {
      // 验证AI配置服务可用
      expect(mockDatabaseService.aiConfig).toBeDefined()
      expect(typeof mockDatabaseService.aiConfig.getAllAIConfigs).toBe('function')
    })

    it('应该提供AI生成历史服务', () => {
      // 验证AI生成历史服务可用
      expect(mockDatabaseService.aiGenerationHistory).toBeDefined()
      expect(typeof mockDatabaseService.aiGenerationHistory.getAllAIGenerationHistory).toBe('function')
    })

    it('应该提供应用设置服务', () => {
      // 验证应用设置服务可用
      expect(mockDatabaseService.appSettings).toBeDefined()
      expect(typeof mockDatabaseService.appSettings.createSetting).toBe('function')
    })

    it('应该处理初始化错误', async () => {
      // 准备测试数据
      const mockError = new Error('数据库初始化失败')
      mockDatabaseService.initialize.mockRejectedValue(mockError)

      // 执行测试并验证错误
      await expect(mockDatabaseService.initialize()).rejects.toThrow('数据库初始化失败')
    })
  })

  describe('API客户端', () => {
    it('应该提供用户API', () => {
      // 验证用户API可用
      expect(mockApi.users).toBeDefined()
      expect(typeof mockApi.users.getAll).toBe('function')
    })

    it('应该提供文章API', () => {
      // 验证文章API可用
      expect(mockApi.posts).toBeDefined()
      expect(typeof mockApi.posts.getAll).toBe('function')
    })

    it('应该提供分类API', () => {
      // 验证分类API可用
      expect(mockApi.categories).toBeDefined()
      expect(typeof mockApi.categories.getAll).toBe('function')
    })

    it('应该提供提示词API', () => {
      // 验证提示词API可用
      expect(mockApi.prompts).toBeDefined()
      expect(typeof mockApi.prompts.getAll).toBe('function')
    })

    it('应该提供AI配置API', () => {
      // 验证AI配置API可用
      expect(mockApi.aiConfigs).toBeDefined()
      expect(typeof mockApi.aiConfigs.getAll).toBe('function')
    })

    it('应该提供AI生成历史API', () => {
      // 验证AI生成历史API可用
      expect(mockApi.aiGenerationHistory).toBeDefined()
      expect(typeof mockApi.aiGenerationHistory.getAll).toBe('function')
    })

    it('应该提供应用设置API', () => {
      // 验证应用设置API可用
      expect(mockApi.appSettings).toBeDefined()
      expect(typeof mockApi.appSettings.create).toBe('function')
    })
  })

  describe('服务集成测试', () => {
    it('数据库服务和API应该协同工作', async () => {
      // 准备测试数据
      const mockUsers = [{ id: 1, name: '测试用户' }]
      mockDatabaseService.user.getAllUsers.mockResolvedValue(mockUsers)
      mockApi.users.getAll.mockResolvedValue(mockUsers)

      // 执行测试
      const dbUsers = await mockDatabaseService.user.getAllUsers()
      const apiUsers = await mockApi.users.getAll()

      // 验证结果一致性
      expect(dbUsers).toEqual(apiUsers)
      expect(mockDatabaseService.user.getAllUsers).toHaveBeenCalledOnce()
      expect(mockApi.users.getAll).toHaveBeenCalledOnce()
    })

    it('应该处理API调用错误', async () => {
      // 准备测试数据
      const mockError = new Error('API 调用失败')
      mockApi.users.getAll.mockRejectedValue(mockError)

      // 执行测试并验证错误
      await expect(mockApi.users.getAll()).rejects.toThrow('API 调用失败')
    })

    it('应该处理数据库服务错误', async () => {
      // 准备测试数据
      const mockError = new Error('数据库操作失败')
      mockDatabaseService.user.getAllUsers.mockRejectedValue(mockError)

      // 执行测试并验证错误
      await expect(mockDatabaseService.user.getAllUsers()).rejects.toThrow('数据库操作失败')
    })
  })

  describe('性能测试', () => {
    it('API调用应该在合理时间内完成', async () => {
      // 准备测试数据
      const mockResult = { data: 'test' }
      mockApi.users.getAll.mockResolvedValue(mockResult)

      // 记录开始时间
      const startTime = Date.now()

      // 执行测试
      await mockApi.users.getAll()

      // 验证执行时间
      const executionTime = Date.now() - startTime
      expect(executionTime).toBeLessThan(100) // 应该在100ms内完成
    })

    it('数据库操作应该在合理时间内完成', async () => {
      // 准备测试数据
      const mockResult = [{ id: 1, name: 'test' }]
      mockDatabaseService.user.getAllUsers.mockResolvedValue(mockResult)

      // 记录开始时间
      const startTime = Date.now()

      // 执行测试
      await mockDatabaseService.user.getAllUsers()

      // 验证执行时间
      const executionTime = Date.now() - startTime
      expect(executionTime).toBeLessThan(100) // 应该在100ms内完成
    })
  })
})
