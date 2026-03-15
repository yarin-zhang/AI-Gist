/**
 * DatabaseServiceManager 备份/恢复测试
 * 覆盖：本地备份恢复、桌面备份数据结构、图片序列化
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { testDataGenerators } from '../helpers/test-utils'

// ---- mock 所有外部依赖 ----

vi.mock('~/lib/utils/uuid', () => ({ generateUUID: () => 'mock-uuid-1234' }))

// mock 各子服务
const mockCategoryService = {
  getInstance: vi.fn(),
  initialize: vi.fn().mockResolvedValue(undefined),
  waitForInitialization: vi.fn().mockResolvedValue(undefined),
  getBasicCategories: vi.fn(),
  createCategory: vi.fn(),
  checkObjectStoreExists: vi.fn().mockResolvedValue(true),
  repairDatabase: vi.fn().mockResolvedValue({ success: true }),
  close: vi.fn(),
  upsertCategory: vi.fn(),
  // mock db 对象，供 forceCleanAllTables 使用
  db: {
    objectStoreNames: { contains: vi.fn().mockReturnValue(false) },
    transaction: vi.fn(),
    version: 1,
  },
}
const mockPromptService = {
  getInstance: vi.fn(),
  getAllPromptsForTags: vi.fn(),
  createPrompt: vi.fn(),
  upsertPrompt: vi.fn(),
}
const mockAIConfigService = {
  getInstance: vi.fn(),
  getAllAIConfigs: vi.fn(),
  createAIConfig: vi.fn(),
  upsertAIConfig: vi.fn(),
}
const mockAIHistoryService = {
  getInstance: vi.fn(),
  getAllAIGenerationHistory: vi.fn(),
  createAIGenerationHistory: vi.fn(),
}
const mockAppSettingsService = {
  getInstance: vi.fn(),
  getAllSettings: vi.fn(),
  updateSettingByKey: vi.fn(),
  getSettingByKey: vi.fn().mockResolvedValue(null),
}
const mockQuickOptService = { getInstance: vi.fn() }

vi.mock('~/lib/services/category.service', () => ({
  CategoryService: { getInstance: () => mockCategoryService }
}))
vi.mock('~/lib/services/prompt.service', () => ({
  PromptService: { getInstance: () => mockPromptService }
}))
vi.mock('~/lib/services/ai-config.service', () => ({
  AIConfigService: { getInstance: () => mockAIConfigService }
}))
vi.mock('~/lib/services/ai-generation-history.service', () => ({
  AIGenerationHistoryService: { getInstance: () => mockAIHistoryService }
}))
vi.mock('~/lib/services/app-settings.service', () => ({
  AppSettingsService: { getInstance: () => mockAppSettingsService }
}))
vi.mock('~/lib/services/quick-optimization.service', () => ({
  QuickOptimizationService: { getInstance: () => mockQuickOptService }
}))

// mock FileReader for blobToBase64
global.FileReader = class {
  result: any = null
  onload: ((e: any) => void) | null = null
  onerror: ((e: any) => void) | null = null
  readAsDataURL(blob: Blob) {
    setTimeout(() => {
      this.result = 'data:image/png;base64,mockbase64data'
      this.onload?.({ target: this })
    }, 0)
  }
} as any

// mock fetch for base64ToBlob
global.fetch = vi.fn().mockResolvedValue({
  blob: () => Promise.resolve(new Blob(['mock'], { type: 'image/png' }))
}) as any

import { DatabaseServiceManager } from '~/lib/services/database-manager.service'

// 测试数据
const mockCategory = testDataGenerators.createMockCategory({ id: 1, name: '分类A' })
const mockPrompt = testDataGenerators.createMockPrompt({ id: 1, categoryId: 1, title: '提示词A' })
const mockAIConfig = testDataGenerators.createMockAIConfig({ id: 1 })
const mockSetting = { key: 'theme', value: 'dark', type: 'string', description: '' }

function makeExportData() {
  return {
    categories: [mockCategory],
    prompts: [mockPrompt],
    aiConfigs: [mockAIConfig],
    aiHistory: [],
    settings: [mockSetting],
  }
}

describe('DatabaseServiceManager', () => {
  let manager: DatabaseServiceManager

  beforeEach(() => {
    // 重置单例
    ;(DatabaseServiceManager as any).instance = undefined
    manager = DatabaseServiceManager.getInstance()

    // clearMocks 会清除 mockReturnValue，需要在每个 beforeEach 重新设置
    mockCategoryService.checkObjectStoreExists.mockResolvedValue(true)
    mockCategoryService.repairDatabase.mockResolvedValue({ success: true })
    mockCategoryService.waitForInitialization.mockResolvedValue(undefined)
    mockCategoryService.initialize.mockResolvedValue(undefined)

    // 重设 fetch mock（clearMocks 会清除）
    global.fetch = vi.fn().mockResolvedValue({
      blob: () => Promise.resolve(new Blob(['mock'], { type: 'image/png' }))
    }) as any

    mockCategoryService.getBasicCategories.mockResolvedValue([mockCategory])
    mockPromptService.getAllPromptsForTags.mockResolvedValue([mockPrompt])
    mockAIConfigService.getAllAIConfigs.mockResolvedValue([mockAIConfig])
    mockAIHistoryService.getAllAIGenerationHistory.mockResolvedValue([])
    mockAppSettingsService.getAllSettings.mockResolvedValue([mockSetting])

    mockCategoryService.createCategory.mockResolvedValue({ ...mockCategory, id: 10 })
    mockPromptService.createPrompt.mockResolvedValue({ ...mockPrompt, id: 20 })
    mockAIConfigService.createAIConfig.mockResolvedValue({ ...mockAIConfig, id: 30 })
    mockAIHistoryService.createAIGenerationHistory.mockResolvedValue({})
    mockAppSettingsService.updateSettingByKey.mockResolvedValue({})
  })

  // ---- exportAllData ----

  describe('exportAllData', () => {
    it('导出所有数据，返回正确结构', async () => {
      const result = await manager.exportAllData()

      expect(result.success).toBe(true)
      expect(result.data).toBeDefined()
      expect(result.data!.categories).toHaveLength(1)
      expect(result.data!.prompts).toHaveLength(1)
      expect(result.data!.aiConfigs).toHaveLength(1)
      expect(result.data!.settings).toHaveLength(1)
    })

    it('某个子服务失败时，其他数据仍然导出', async () => {
      mockAIConfigService.getAllAIConfigs.mockRejectedValue(new Error('DB error'))

      const result = await manager.exportAllData()

      expect(result.success).toBe(true)
      expect(result.data!.categories).toHaveLength(1)
      expect(result.data!.aiConfigs).toEqual([]) // 失败的返回空数组
    })
  })

  // ---- exportAllDataForBackup（图片序列化）----

  describe('exportAllDataForBackup', () => {
    it('prompt 有 imageBlobs 时序列化为 base64', async () => {
      const blob = new Blob(['img'], { type: 'image/png' })
      mockPromptService.getAllPromptsForTags.mockResolvedValue([
        { ...mockPrompt, imageBlobs: [blob] }
      ])

      const result = await manager.exportAllDataForBackup()

      expect(result.success).toBe(true)
      const serializedPrompt = result.data!.prompts[0]
      expect(serializedPrompt.imageBlobs[0]).toMatch(/^data:/)
    })

    it('prompt 没有 imageBlobs 时正常导出', async () => {
      const result = await manager.exportAllDataForBackup()

      expect(result.success).toBe(true)
      expect(result.data!.prompts[0].imageBlobs).toBeUndefined()
    })
  })

  // ---- importData ----

  describe('importData', () => {
    it('导入完整数据，所有记录被创建', async () => {
      const result = await manager.importData(makeExportData())

      expect(result.success).toBe(true)
      expect(mockCategoryService.createCategory).toHaveBeenCalledTimes(1)
      expect(mockPromptService.createPrompt).toHaveBeenCalledTimes(1)
      expect(mockAIConfigService.createAIConfig).toHaveBeenCalledTimes(1)
      expect(mockAppSettingsService.updateSettingByKey).toHaveBeenCalledTimes(1)
    })

    it('分类 ID 映射正确传递给提示词', async () => {
      const result = await manager.importData(makeExportData())

      expect(result.success).toBe(true)
      // createPrompt 被调用时，categoryId 应该是新 ID (10)，而不是旧 ID (1)
      const promptArg = mockPromptService.createPrompt.mock.calls[0][0]
      expect(promptArg.categoryId).toBe(10)
    })

    it('数据格式无效时返回失败', async () => {
      const result = await manager.importData(null)
      expect(result.success).toBe(false)
    })

    it('base64 imageBlobs 被反序列化为 Blob', async () => {
      const dataWithBase64 = {
        ...makeExportData(),
        prompts: [{ ...mockPrompt, imageBlobs: ['data:image/png;base64,abc123'] }]
      }

      const result = await manager.importData(dataWithBase64)
      expect(result.success).toBe(true)

      expect(mockPromptService.createPrompt).toHaveBeenCalledTimes(1)
      const promptArg = mockPromptService.createPrompt.mock.calls[0][0]
      expect(promptArg.imageBlobs[0]).toBeInstanceOf(Blob)
    })
  })

  // ---- replaceAllData ----

  describe('replaceAllData', () => {
    it('先清空再恢复数据', async () => {
      // mock forceCleanAllTables
      const cleanSpy = vi.spyOn(manager, 'forceCleanAllTables').mockResolvedValue()

      const result = await manager.replaceAllData(makeExportData())

      expect(cleanSpy).toHaveBeenCalled()
      expect(result.success).toBe(true)
    })
  })
})
