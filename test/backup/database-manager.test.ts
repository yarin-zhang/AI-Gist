/**
 * DatabaseServiceManager 备份/恢复测试
 * 覆盖：本地备份恢复、桌面备份数据结构、图片序列化
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { testDataGenerators } from '../helpers/test-utils'
import { createBackupPayload } from '../../src/shared/backup-integrity'

// ---- mock 所有外部依赖 ----

vi.mock('~/lib/utils/uuid', () => ({ generateUUID: () => 'mock-uuid-1234' }))

// mock 各子服务
const mockCategoryService = {
  getInstance: vi.fn(),
  initialize: vi.fn().mockResolvedValue(undefined),
  waitForInitialization: vi.fn().mockResolvedValue(undefined),
  getBasicCategories: vi.fn(),
  getSyncTombstones: vi.fn(),
  migrateAllRecordsToUUID: vi.fn(),
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
  getAllPromptVariables: vi.fn(),
  getAllPromptHistories: vi.fn(),
  createPrompt: vi.fn(),
  createPromptVariableFromBackup: vi.fn(),
  createPromptHistoryFromBackup: vi.fn(),
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
const mockQuickOptService = {
  getInstance: vi.fn(),
  getAllQuickOptimizationConfigs: vi.fn(),
  createQuickOptimizationConfigFromBackup: vi.fn(),
}

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
const mockPromptVariable = {
  id: 1,
  uuid: 'variable-1',
  promptId: 1,
  name: 'tone',
  type: 'text' as const,
  defaultValue: 'friendly',
  required: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}
const mockPromptHistory = {
  id: 1,
  uuid: 'history-1',
  promptId: 1,
  title: '提示词A v1',
  content: '历史内容',
  version: 1,
  createdAt: new Date().toISOString(),
}
const mockAIConfig = testDataGenerators.createMockAIConfig({ id: 1 })
const mockQuickOptimizationConfig = {
  id: 1,
  uuid: 'quick-opt-1',
  name: '更清晰',
  description: '优化表达',
  prompt: '请优化：{{content}}',
  enabled: true,
  sortOrder: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}
const mockAIHistory = {
  id: 1,
  uuid: 'ai-history-1',
  historyId: 'ai-history-business-1',
  configId: 'config-1',
  topic: '同步可靠性',
  generatedPrompt: '生成后的提示词',
  model: 'test-model',
  status: 'success' as const,
  createdAt: '2026-06-12T00:00:00.000Z',
  updatedAt: '2026-06-12T00:00:00.000Z'
}
const mockSetting = {
  id: 1,
  key: 'theme',
  value: 'dark',
  type: 'string',
  description: '主题设置',
  category: 'appearance',
  isSystem: true,
  createdAt: '2026-06-12T00:00:00.000Z',
  updatedAt: '2026-06-12T00:00:00.000Z'
}
const mockSyncTombstone = {
  id: 1,
  storeName: 'prompts',
  collectionName: 'prompts',
  recordKey: 'uuid:prompt-1',
  recordUuid: 'prompt-1',
  deletedAt: new Date().toISOString(),
}

function makeExportData() {
  return {
    categories: [mockCategory],
    prompts: [mockPrompt],
    promptVariables: [mockPromptVariable],
    promptHistories: [mockPromptHistory],
    aiConfigs: [mockAIConfig],
    quickOptimizationConfigs: [mockQuickOptimizationConfig],
    aiHistory: [mockAIHistory],
    settings: [mockSetting],
  }
}

describe('DatabaseServiceManager', () => {
  let manager: DatabaseServiceManager
  let restoredRecords: Record<string, any[]>
  let failRestoredStoreName: string | null
  let failRestoredStoreError: string

  beforeEach(() => {
    // 重置单例
    ;(DatabaseServiceManager as any).instance = undefined
    manager = DatabaseServiceManager.getInstance()
    restoredRecords = {}
    failRestoredStoreName = null
    failRestoredStoreError = 'restored record write failed'

    vi.spyOn(manager as any, 'addRestoredRecord').mockImplementation(async (storeName: string, data: any) => {
      if (storeName === failRestoredStoreName) {
        throw new Error(failRestoredStoreError)
      }

      const nextIds: Record<string, number> = {
        categories: 10,
        prompts: 20,
        promptVariables: 30,
        promptHistories: 40,
        ai_configs: 30,
        quick_optimization_configs: 50,
        ai_generation_history: 60,
        settings: 70
      }
      const restored = {
        ...data,
        id: nextIds[storeName] ?? 90
      }
      restoredRecords[storeName] = restoredRecords[storeName] || []
      restoredRecords[storeName].push(restored)
      return restored
    })

    vi.spyOn(manager as any, 'commitAtomicRestorePlan').mockImplementation(async (plan: any) => {
      for (const record of plan.records) {
        if (record.storeName === failRestoredStoreName) {
          throw new Error(failRestoredStoreError)
        }
        restoredRecords[record.storeName] = restoredRecords[record.storeName] || []
        restoredRecords[record.storeName].push(record.value)
      }
    })

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
    mockCategoryService.getSyncTombstones.mockResolvedValue([mockSyncTombstone])
    mockCategoryService.migrateAllRecordsToUUID.mockResolvedValue({
      categories: 0,
      prompts: 0,
      promptVariables: 0,
      promptHistories: 0,
      ai_configs: 0,
      quick_optimization_configs: 0,
      ai_generation_history: 0
    })
    mockPromptService.getAllPromptsForTags.mockResolvedValue([mockPrompt])
    mockPromptService.getAllPromptVariables.mockResolvedValue([mockPromptVariable])
    mockPromptService.getAllPromptHistories.mockResolvedValue([mockPromptHistory])
    mockAIConfigService.getAllAIConfigs.mockResolvedValue([mockAIConfig])
    mockQuickOptService.getAllQuickOptimizationConfigs.mockResolvedValue([mockQuickOptimizationConfig])
    mockAIHistoryService.getAllAIGenerationHistory.mockResolvedValue([mockAIHistory])
    mockAppSettingsService.getAllSettings.mockResolvedValue([mockSetting])

    mockCategoryService.createCategory.mockResolvedValue({ ...mockCategory, id: 10 })
    mockCategoryService.upsertCategory.mockResolvedValue(undefined)
    mockPromptService.createPrompt.mockResolvedValue({ ...mockPrompt, id: 20 })
    mockPromptService.createPromptVariableFromBackup.mockResolvedValue({ ...mockPromptVariable, id: 30, promptId: 20 })
    mockPromptService.createPromptHistoryFromBackup.mockResolvedValue({ ...mockPromptHistory, id: 40, promptId: 20 })
    mockPromptService.upsertPrompt.mockResolvedValue(undefined)
    mockAIConfigService.createAIConfig.mockResolvedValue({ ...mockAIConfig, id: 30 })
    mockAIConfigService.upsertAIConfig.mockResolvedValue(undefined)
    mockQuickOptService.createQuickOptimizationConfigFromBackup.mockResolvedValue({ ...mockQuickOptimizationConfig, id: 50 })
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
      expect(result.data!.promptVariables).toHaveLength(1)
      expect(result.data!.promptHistories).toHaveLength(1)
      expect(result.data!.aiConfigs).toHaveLength(1)
      expect(result.data!.quickOptimizationConfigs).toHaveLength(1)
      expect(result.data!.settings).toHaveLength(1)
    })

    it('任一子服务失败时不生成部分数据导出', async () => {
      mockAIConfigService.getAllAIConfigs.mockRejectedValue(new Error('DB error'))

      const result = await manager.exportAllData()

      expect(result.success).toBe(false)
      expect(result.error).toContain('读取数据表失败: aiConfigs')
      expect(result.data).toBeUndefined()
    })

    it('结构化导出失败不会默认写入 console.warn/error', async () => {
      mockAIConfigService.getAllAIConfigs.mockRejectedValue(new Error('DB error'))

      const result = await expectNoDefaultConsoleNoise(() => manager.exportAllData())

      expect(result.success).toBe(false)
      expect(result.error).toContain('读取数据表失败: aiConfigs')
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

    it('已序列化的 data URL 图片不会在再次备份时丢失', async () => {
      const dataUrl = 'data:image/png;base64,existingbase64'
      mockPromptService.getAllPromptsForTags.mockResolvedValue([
        { ...mockPrompt, imageBlobs: [dataUrl] }
      ])
      mockPromptService.getAllPromptHistories.mockResolvedValue([
        { ...mockPromptHistory, imageBlobs: [dataUrl] }
      ])

      const result = await manager.exportAllDataForBackup()

      expect(result.success).toBe(true)
      expect(result.data!.prompts[0].imageBlobs).toEqual([dataUrl])
      expect(result.data!.promptHistories![0].imageBlobs).toEqual([dataUrl])
    })

    it('遇到无法序列化的图片数据时不生成部分缺图备份', async () => {
      mockPromptService.getAllPromptsForTags.mockResolvedValue([
        { ...mockPrompt, imageBlobs: [{ invalid: true }] }
      ])

      const result = await manager.exportAllDataForBackup()

      expect(result.success).toBe(false)
      expect(result.error).toContain('图片数据格式无效')
    })

    it('backupData 使用备份专用图片序列化', async () => {
      const blob = new Blob(['img'], { type: 'image/png' })
      mockPromptService.getAllPromptsForTags.mockResolvedValue([
        { ...mockPrompt, imageBlobs: [blob] }
      ])

      const result = await manager.backupData()

      expect(result.success).toBe(true)
      expect(result.data!.prompts[0].imageBlobs[0]).toMatch(/^data:/)
    })
  })

  describe('exportAllDataForSync', () => {
    it('同步导出包含删除标记', async () => {
      const result = await manager.exportAllDataForSync()

      expect(result.success).toBe(true)
      expect(mockCategoryService.migrateAllRecordsToUUID).toHaveBeenCalledTimes(1)
      expect(result.data!.syncTombstones).toEqual([mockSyncTombstone])
    })

    it('同步导出为变量和历史补充稳定父级 UUID', async () => {
      mockPromptService.getAllPromptHistories.mockResolvedValueOnce([{
        ...mockPromptHistory,
        categoryId: mockCategory.id
      }])

      const result = await manager.exportAllDataForSync()

      expect(result.success).toBe(true)
      expect(result.data!.prompts[0].categoryUuid).toBe(mockCategory.uuid)
      expect(result.data!.promptVariables[0].promptUuid).toBe(mockPrompt.uuid)
      expect(result.data!.promptHistories[0].promptUuid).toBe(mockPrompt.uuid)
      expect(result.data!.promptHistories[0].categoryUuid).toBe(mockCategory.uuid)
    })

    it('UUID 迁移失败时不生成同步快照', async () => {
      mockCategoryService.migrateAllRecordsToUUID.mockResolvedValue({
        categories: 0,
        prompts: -1
      })

      const result = await manager.exportAllDataForSync()

      expect(result.success).toBe(false)
      expect(result.error).toContain('同步记录 UUID 迁移失败')
      expect(mockCategoryService.getBasicCategories).not.toHaveBeenCalled()
      expect(result.data).toBeUndefined()
    })

    it('删除标记读取失败时不生成缺删除标记快照', async () => {
      mockCategoryService.getSyncTombstones.mockRejectedValue(new Error('tombstone store failed'))

      const result = await manager.exportAllDataForSync()

      expect(result.success).toBe(false)
      expect(result.error).toContain('读取同步删除标记失败')
      expect(result.data).toBeUndefined()
    })

    it('删除标记读取失败不会默认写入 console.warn/error', async () => {
      mockCategoryService.getSyncTombstones.mockRejectedValue(new Error('tombstone store failed'))

      const result = await expectNoDefaultConsoleNoise(() => manager.exportAllDataForSync())

      expect(result.success).toBe(false)
      expect(result.error).toContain('读取同步删除标记失败')
    })
  })

  // ---- importData ----

  describe('importData', () => {
    it('导入完整数据，所有记录被创建', async () => {
      const result = await manager.importData(makeExportData())

      expect(result.success).toBe(true)
      expect(restoredRecords.categories).toHaveLength(1)
      expect(restoredRecords.prompts).toHaveLength(1)
      expect(restoredRecords.promptVariables).toHaveLength(1)
      expect(restoredRecords.promptHistories).toHaveLength(1)
      expect(restoredRecords.ai_configs).toHaveLength(1)
      expect(restoredRecords.quick_optimization_configs).toHaveLength(1)
      expect(restoredRecords.ai_generation_history).toHaveLength(1)
      expect(restoredRecords.settings).toHaveLength(1)
    })

    it('保留 UUID、设置元数据，并将本地 ID 映射正确传递给提示词和历史', async () => {
      const result = await manager.importData(makeExportData())

      expect(result.success).toBe(true)
      expect(restoredRecords.categories[0].uuid).toBe(mockCategory.uuid)
      expect(restoredRecords.prompts[0].uuid).toBe(mockPrompt.uuid)
      // 恢复提示词时，categoryId 应该是新 ID (10)，而不是旧 ID (1)
      const promptArg = restoredRecords.prompts[0]
      expect(promptArg.categoryId).toBe(10)
      const variableArg = restoredRecords.promptVariables[0]
      expect(variableArg.promptId).toBe(20)
      const historyArg = restoredRecords.promptHistories[0]
      expect(historyArg.promptId).toBe(20)
      expect(historyArg.uuid).toBe(mockPromptHistory.uuid)
      expect(restoredRecords.ai_generation_history[0]).toMatchObject({
        uuid: mockAIHistory.uuid,
        historyId: mockAIHistory.historyId,
        createdAt: mockAIHistory.createdAt
      })
      expect(restoredRecords.settings[0]).toMatchObject({
        key: mockSetting.key,
        value: mockSetting.value,
        category: mockSetting.category,
        isSystem: mockSetting.isSystem,
        createdAt: mockSetting.createdAt,
        updatedAt: mockSetting.updatedAt
      })
    })

    it('数据格式无效时返回失败', async () => {
      const result = await manager.importData(null)
      expect(result.success).toBe(false)
    })

    it('任一记录导入失败时返回失败', async () => {
      failRestoredStoreName = 'settings'
      failRestoredStoreError = 'settings import failed'

      const result = await manager.importData(makeExportData())

      expect(result.success).toBe(false)
      expect(result.totalErrors).toBe(1)
      expect(result.error).toContain('导入过程中有 1 条记录失败')
      expect(result.message).toContain('未完全完成')
    })

    it('记录导入失败不会默认写入 console.warn/error', async () => {
      failRestoredStoreName = 'settings'
      failRestoredStoreError = 'settings import failed'

      const result = await expectNoDefaultConsoleNoise(() => manager.importData(makeExportData()))

      expect(result.success).toBe(false)
      expect(result.totalErrors).toBe(1)
    })

    it('base64 imageBlobs 被反序列化为 Blob', async () => {
      const dataWithBase64 = {
        ...makeExportData(),
        prompts: [{ ...mockPrompt, imageBlobs: ['data:image/png;base64,abc123'] }]
      }

      const result = await manager.importData(dataWithBase64)
      expect(result.success).toBe(true)

      expect(restoredRecords.prompts).toHaveLength(1)
      const promptArg = restoredRecords.prompts[0]
      expect(promptArg.imageBlobs[0]).toBeInstanceOf(Blob)
    })

    it('图片数据格式无效时导入失败，避免静默丢图', async () => {
      const dataWithInvalidImage = {
        ...makeExportData(),
        prompts: [{ ...mockPrompt, imageBlobs: ['not-a-data-url'] }]
      }

      const result = await manager.importData(dataWithInvalidImage)

      expect(result.success).toBe(false)
      expect(result.totalErrors).toBe(3)
      expect(restoredRecords.prompts || []).toHaveLength(0)
      expect(restoredRecords.promptVariables || []).toHaveLength(0)
      expect(restoredRecords.promptHistories || []).toHaveLength(0)
    })

    it('base64 promptHistories.imageBlobs 被反序列化为 Blob', async () => {
      const dataWithBase64History = {
        ...makeExportData(),
        promptHistories: [{ ...mockPromptHistory, imageBlobs: ['data:image/png;base64,abc123'] }]
      }

      const result = await manager.importData(dataWithBase64History)
      expect(result.success).toBe(true)

      const historyArg = restoredRecords.promptHistories[0]
      expect(historyArg.imageBlobs[0]).toBeInstanceOf(Blob)
    })
  })

  // ---- replaceAllData ----

  describe('replaceAllData', () => {
    it('restoreData 恢复图片数据格式无效时不会先清空本地数据', async () => {
      const cleanSpy = vi.spyOn(manager, 'forceCleanAllTables').mockResolvedValue()

      const result = await manager.restoreData({
        ...makeExportData(),
        prompts: [{ ...mockPrompt, imageBlobs: ['not-a-data-url'] }]
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('图片数据格式无效')
      expect(cleanSpy).not.toHaveBeenCalled()
    })

    it('完全替换前会清空快速优化配置表，避免旧配置残留', async () => {
      const clearedStores: string[] = []
      mockCategoryService.db = createMockDbForClearing(clearedStores)

      await manager.forceCleanAllTables()

      expect(clearedStores).toContain('quick_optimization_configs')
    })

    it('清空数据表会等待事务提交完成后才返回', async () => {
      vi.useFakeTimers()
      const clearedStores: string[] = []
      mockCategoryService.db = createMockDbForClearing(clearedStores, 100, ['categories'])

      const cleanPromise = manager.forceCleanAllTables()
      await vi.advanceTimersByTimeAsync(50)
      expect(clearedStores).toEqual([])

      await vi.advanceTimersByTimeAsync(50)
      await cleanPromise
      expect(clearedStores).toContain('categories')

      vi.useRealTimers()
    })

    it('通过原子提交计划替换数据，不再提前逐表清空', async () => {
      const cleanSpy = vi.spyOn(manager, 'forceCleanAllTables').mockResolvedValue()

      const result = await manager.replaceAllData(makeExportData())

      expect(cleanSpy).not.toHaveBeenCalled()
      expect((manager as any).commitAtomicRestorePlan).toHaveBeenCalledTimes(1)
      expect(result.success).toBe(true)
    })

    it('完整替换会保留云同步身份 UUID，同时重新映射本地数字 ID', async () => {
      vi.spyOn(manager, 'forceCleanAllTables').mockResolvedValue()

      const result = await manager.replaceAllData(makeExportData())

      expect(result.success).toBe(true)
      expect(restoredRecords.categories[0]).toMatchObject({
        id: 1,
        uuid: mockCategory.uuid
      })
      expect(restoredRecords.prompts[0]).toMatchObject({
        id: 1,
        uuid: mockPrompt.uuid,
        categoryId: 1
      })
      expect(restoredRecords.promptVariables[0]).toMatchObject({
        uuid: mockPromptVariable.uuid,
        promptId: 1
      })
      expect(restoredRecords.promptHistories[0]).toMatchObject({
        uuid: mockPromptHistory.uuid,
        promptId: 1
      })
      expect(restoredRecords.ai_generation_history[0]).toMatchObject({
        id: 1,
        uuid: mockAIHistory.uuid,
        historyId: mockAIHistory.historyId
      })
      expect(restoredRecords.settings[0]).toMatchObject({
        id: 1,
        key: mockSetting.key,
        category: mockSetting.category,
        isSystem: true,
        createdAt: mockSetting.createdAt,
        updatedAt: mockSetting.updatedAt
      })
    })

    it('完整替换会用父级 UUID 修复跨端漂移的数字关系 ID', async () => {
      vi.spyOn(manager, 'forceCleanAllTables').mockResolvedValue()
      const driftedData = {
        ...makeExportData(),
        prompts: [{
          ...mockPrompt,
          categoryId: 999,
          categoryUuid: mockCategory.uuid
        }],
        promptVariables: [{
          ...mockPromptVariable,
          promptId: 999,
          promptUuid: mockPrompt.uuid
        }],
        promptHistories: [{
          ...mockPromptHistory,
          promptId: 999,
          promptUuid: mockPrompt.uuid,
          categoryId: 999,
          categoryUuid: mockCategory.uuid
        }]
      }

      const result = await manager.replaceAllData(driftedData)

      expect(result.success).toBe(true)
      expect(restoredRecords.prompts[0]).toMatchObject({
        uuid: mockPrompt.uuid,
        categoryId: 1
      })
      expect(restoredRecords.promptVariables[0]).toMatchObject({
        uuid: mockPromptVariable.uuid,
        promptId: 1,
        promptUuid: mockPrompt.uuid
      })
      expect(restoredRecords.promptHistories[0]).toMatchObject({
        uuid: mockPromptHistory.uuid,
        promptId: 1,
        promptUuid: mockPrompt.uuid,
        categoryId: 1,
        categoryUuid: mockCategory.uuid
      })
    })

    it('恢复数据格式无效时不会先清空本地数据', async () => {
      const cleanSpy = vi.spyOn(manager, 'forceCleanAllTables').mockResolvedValue()

      const result = await manager.replaceAllData(null)

      expect(result.success).toBe(false)
      expect(result.error).toContain('恢复数据格式无效')
      expect(cleanSpy).not.toHaveBeenCalled()
    })

    it('恢复数据表字段不是数组时不会先清空本地数据', async () => {
      const cleanSpy = vi.spyOn(manager, 'forceCleanAllTables').mockResolvedValue()

      const result = await manager.replaceAllData({
        prompts: { id: 1, title: 'bad shape' }
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('prompts 必须是数组')
      expect(cleanSpy).not.toHaveBeenCalled()
    })

    it('恢复图片数据格式无效时不会先清空本地数据', async () => {
      const cleanSpy = vi.spyOn(manager, 'forceCleanAllTables').mockResolvedValue()

      const result = await manager.replaceAllData({
        ...makeExportData(),
        prompts: [{ ...mockPrompt, imageBlobs: ['not-a-data-url'] }]
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('图片数据格式无效')
      expect(cleanSpy).not.toHaveBeenCalled()
    })

    it('恢复同步删除标记，避免删除记录在下次同步复活', async () => {
      const restoredTombstones: any[] = []
      const cleanSpy = vi.spyOn(manager, 'forceCleanAllTables').mockResolvedValue()
      mockCategoryService.db = createMockDbWithSyncTombstones(restoredTombstones)

      const result = await manager.replaceAllData({
        ...makeExportData(),
        syncTombstones: [mockSyncTombstone]
      })

      expect(cleanSpy).not.toHaveBeenCalled()
      expect(result.success).toBe(true)
      expect(result.details?.syncTombstones).toBe(1)
      expect(restoredRecords.syncTombstones).toHaveLength(1)
      expect(restoredRecords.syncTombstones[0]).toMatchObject({
        collectionName: 'prompts',
        recordKey: 'uuid:prompt-1',
        recordUuid: 'prompt-1'
      })
      expect(restoredRecords.syncTombstones[0].id).toBe(1)
      expect(restoredRecords.syncTombstones[0].deletedAt).toBeInstanceOf(Date)
    })

    it('同步删除标记格式无效时恢复失败，避免静默丢失删除历史', async () => {
      vi.spyOn(manager, 'forceCleanAllTables').mockResolvedValue()
      mockCategoryService.db = createMockDbWithSyncTombstones([])

      const result = await manager.replaceAllData({
        ...makeExportData(),
        syncTombstones: [{ collectionName: 'prompts' }]
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('同步删除标记格式无效')
    })

    it('数据库缺少删除标记表时恢复失败，避免误标同步成功', async () => {
      ;(manager as any).commitAtomicRestorePlan.mockRejectedValueOnce(
        new Error('数据库缺少 syncTombstones 表')
      )

      const result = await manager.replaceAllData({
        ...makeExportData(),
        syncTombstones: [mockSyncTombstone]
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('数据库缺少 syncTombstones 表')
    })

    it('任一记录恢复失败时返回失败，避免同步状态误标为成功', async () => {
      vi.spyOn(manager, 'forceCleanAllTables').mockResolvedValue()
      failRestoredStoreName = 'settings'
      failRestoredStoreError = 'settings write failed'

      const result = await manager.replaceAllData(makeExportData())

      expect(result.success).toBe(false)
      expect(result.totalErrors).toBe(1)
      expect(result.error).toContain('settings write failed')
      expect(result.failures?.[0]).toMatchObject({ phase: 'prepare' })
    })

    it('结构化恢复失败不会默认写入 console.warn/error', async () => {
      vi.spyOn(manager, 'forceCleanAllTables').mockResolvedValue()
      failRestoredStoreName = 'settings'
      failRestoredStoreError = 'settings write failed'

      const result = await expectNoDefaultConsoleNoise(() => manager.replaceAllData(makeExportData()))

      expect(result.success).toBe(false)
      expect(result.totalErrors).toBe(1)
    })

    it('备份校验失败时不会先清空本地数据', async () => {
      const data = {
        ...makeExportData(),
        prompts: [...makeExportData().prompts]
      }
      const payload = createBackupPayload({
        id: 'bad-backup',
        name: 'bad-backup',
        createdAt: '2026-06-12T00:00:00.000Z',
        data
      })
      payload.data.prompts.push({ ...mockPrompt, id: 2, title: '损坏数据' })
      const cleanSpy = vi.spyOn(manager, 'forceCleanAllTables').mockResolvedValue()

      const result = await manager.replaceAllData(payload)

      expect(result.success).toBe(false)
      expect(result.error).toContain('备份数据校验失败')
      expect(cleanSpy).not.toHaveBeenCalled()
    })
  })

  describe('syncImportData', () => {
    it('legacy 同步导入任一 upsert 失败时返回失败', async () => {
      mockPromptService.upsertPrompt.mockRejectedValueOnce(new Error('prompt upsert failed'))

      const result = await manager.syncImportData({
        categories: [mockCategory],
        prompts: [mockPrompt],
        aiConfigs: [mockAIConfig],
        settings: [mockSetting]
      })

      expect(result.success).toBe(false)
      expect(result.totalErrors).toBe(1)
      expect(result.error).toContain('同步导入过程中有 1 条记录失败')
      expect(result.errors?.[0]).toContain('prompt upsert failed')
    })

    it('legacy 同步导入失败不会默认写入 console.warn/error', async () => {
      mockPromptService.upsertPrompt.mockRejectedValueOnce(new Error('prompt upsert failed'))

      const result = await expectNoDefaultConsoleNoise(() => manager.syncImportData({
        categories: [mockCategory],
        prompts: [mockPrompt],
        aiConfigs: [mockAIConfig],
        settings: [mockSetting]
      }))

      expect(result.success).toBe(false)
      expect(result.totalErrors).toBe(1)
    })
  })
})

async function expectNoDefaultConsoleNoise<T>(operation: () => Promise<T>): Promise<T> {
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

  try {
    const result = await operation()
    expect(warnSpy).not.toHaveBeenCalled()
    expect(errorSpy).not.toHaveBeenCalled()
    return result
  } finally {
    warnSpy.mockRestore()
    errorSpy.mockRestore()
  }
}

function createMockDbWithSyncTombstones(restoredTombstones: any[]) {
  return {
    objectStoreNames: {
      contains: vi.fn((storeName: string) => storeName === 'syncTombstones')
    },
    transaction: vi.fn(() => {
      const transaction: any = {
        error: null,
        oncomplete: null,
        onerror: null,
        onabort: null,
        objectStore: vi.fn(() => ({
          add: vi.fn((record: any) => {
            restoredTombstones.push(record)
            const request = createSuccessfulRequest()
            setTimeout(() => transaction.oncomplete?.(), 0)
            return request
          })
        }))
      }
      return transaction
    }),
    version: 1
  }
}

function createMockDbWithoutSyncTombstones() {
  return {
    objectStoreNames: {
      contains: vi.fn(() => false)
    },
    transaction: vi.fn(),
    version: 1
  }
}

function createSuccessfulRequest() {
  const request: any = {}
  setTimeout(() => request.onsuccess?.(), 0)
  return request
}

function createMockDbForClearing(clearedStores: string[], completeDelay = 0, storesToClear?: string[]) {
  return {
    objectStoreNames: {
      contains: vi.fn((storeName: string) => storesToClear ? storesToClear.includes(storeName) : true)
    },
    transaction: vi.fn((stores: string[]) => {
      const [storeName] = stores
      const transaction: any = {
        oncomplete: null,
        onerror: null,
        onabort: null,
        error: null,
        objectStore: vi.fn(() => ({
          clear: vi.fn(() => {
            const request = createSuccessfulRequest()
            setTimeout(() => {
              clearedStores.push(storeName)
              transaction.oncomplete?.()
            }, completeDelay)
            return request
          })
        }))
      }
      return transaction
    }),
    version: 1
  }
}
