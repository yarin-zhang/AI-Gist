/**
 * Adversarial full-restore tests backed by a transactional IndexedDB double.
 *
 * Unlike the global IndexedDB mock, this double enforces the production
 * unique indexes and rolls a multi-store transaction back on request errors.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DatabaseServiceManager } from '~/lib/services/database-manager.service'
import {
  createTransactionalIndexedDB,
  type StoreDefinition,
  type TransactionalIndexedDB
} from '../helpers/transactional-indexeddb'

const STORE_DEFINITIONS: Record<string, StoreDefinition> = {
  categories: {
    indexes: {
      name: { keyPath: 'name', unique: true },
      uuid: { keyPath: 'uuid', unique: true }
    }
  },
  prompts: {
    indexes: {
      uuid: { keyPath: 'uuid', unique: true }
    }
  },
  promptVariables: {
    indexes: {
      uuid: { keyPath: 'uuid', unique: true }
    }
  },
  promptHistories: {
    indexes: {
      uuid: { keyPath: 'uuid', unique: true }
    }
  },
  ai_configs: {
    indexes: {
      configId: { keyPath: 'configId', unique: true },
      uuid: { keyPath: 'uuid', unique: true }
    }
  },
  quick_optimization_configs: {
    indexes: {
      uuid: { keyPath: 'uuid', unique: true }
    }
  },
  ai_generation_history: {
    indexes: {
      historyId: { keyPath: 'historyId', unique: true },
      uuid: { keyPath: 'uuid', unique: true }
    }
  },
  settings: {
    indexes: {
      key: { keyPath: 'key', unique: true }
    }
  },
  syncTombstones: {
    indexes: {}
  }
}

const ALL_STORES = Object.keys(STORE_DEFINITIONS)
const T0 = '2026-07-11T00:00:00.000Z'
const T1 = '2026-07-11T01:00:00.000Z'

function emptyRestoreData() {
  return {
    categories: [],
    prompts: [],
    promptVariables: [],
    promptHistories: [],
    aiConfigs: [],
    quickOptimizationConfigs: [],
    aiHistory: [],
    settings: [],
    syncTombstones: []
  }
}

function category(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    uuid: 'category-1',
    name: 'Category 1',
    createdAt: T0,
    updatedAt: T0,
    ...overrides
  }
}

function prompt(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    uuid: 'prompt-1',
    title: 'Prompt 1',
    content: 'content',
    categoryId: 1,
    categoryUuid: 'category-1',
    createdAt: T0,
    updatedAt: T0,
    ...overrides
  }
}

function aiConfig(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    uuid: 'ai-config-1',
    configId: 'openai-main',
    name: 'OpenAI',
    type: 'openai',
    enabled: true,
    createdAt: T0,
    updatedAt: T0,
    ...overrides
  }
}

function aiHistory(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    uuid: 'ai-history-1',
    historyId: 'generation-1',
    configId: 'openai-main',
    topic: 'topic',
    generatedPrompt: 'generated',
    status: 'success',
    createdAt: T0,
    updatedAt: T0,
    ...overrides
  }
}

function snapshotAll(indexedDb: TransactionalIndexedDB) {
  return Object.fromEntries(ALL_STORES.map(storeName => [storeName, indexedDb.snapshot(storeName)]))
}

describe('DatabaseServiceManager full restore against IndexedDB constraints', () => {
  let manager: DatabaseServiceManager
  let indexedDb: TransactionalIndexedDB

  beforeEach(() => {
    ;(DatabaseServiceManager as any).instance = undefined
    manager = DatabaseServiceManager.getInstance()
    indexedDb = createTransactionalIndexedDB(STORE_DEFINITIONS)
    ;(manager.category as any).db = indexedDb.db
    vi.spyOn(manager, 'waitForInitialization').mockResolvedValue(undefined)
  })

  afterEach(() => {
    ;(DatabaseServiceManager as any).instance = undefined
  })

  it('不同 UUID 的同名分类会确定性归并，并把两端子记录重映射到规范分类', async () => {
    const data = {
      ...emptyRestoreData(),
      categories: [
        category({ id: 7, uuid: 'category-device-a', name: 'Production', createdAt: T0 }),
        category({ id: 93, uuid: 'category-device-b', name: 'Production', createdAt: T1 })
      ],
      prompts: [
        prompt({
          id: 10,
          uuid: 'prompt-device-a',
          categoryId: 7,
          categoryUuid: 'category-device-a'
        }),
        prompt({
          id: 20,
          uuid: 'prompt-device-b',
          categoryId: 93,
          categoryUuid: 'category-device-b'
        })
      ]
    }

    const result = await manager.replaceAllData(data)

    expect(result, JSON.stringify(result, null, 2)).toMatchObject({ success: true, totalErrors: 0 })
    const restoredCategories = indexedDb.snapshot('categories')
    const restoredPrompts = indexedDb.snapshot('prompts')
    expect(restoredCategories).toHaveLength(1)
    expect(restoredCategories[0].name).toBe('Production')
    expect(restoredPrompts).toHaveLength(2)
    expect(new Set(restoredPrompts.map(item => item.categoryId))).toEqual(
      new Set([restoredCategories[0].id])
    )
  })

  it('不同 UUID 但相同 ai_configs.configId 的配置只落地一个业务身份', async () => {
    const data = {
      ...emptyRestoreData(),
      aiConfigs: [
        aiConfig({ id: 4, uuid: 'config-device-a', configId: 'shared-config', updatedAt: T0 }),
        aiConfig({ id: 99, uuid: 'config-device-b', configId: 'shared-config', updatedAt: T1 })
      ]
    }

    const result = await manager.replaceAllData(data)

    expect(result, JSON.stringify(result, null, 2)).toMatchObject({ success: true, totalErrors: 0 })
    expect(indexedDb.snapshot('ai_configs')).toEqual([
      expect.objectContaining({ configId: 'shared-config' })
    ])
  })

  it('不同 UUID 但相同 ai_generation_history.historyId 的历史只落地一个业务身份', async () => {
    const data = {
      ...emptyRestoreData(),
      aiHistory: [
        aiHistory({ id: 8, uuid: 'history-device-a', historyId: 'shared-history', updatedAt: T0 }),
        aiHistory({ id: 81, uuid: 'history-device-b', historyId: 'shared-history', updatedAt: T1 })
      ]
    }

    const result = await manager.replaceAllData(data)

    expect(result, JSON.stringify(result, null, 2)).toMatchObject({ success: true, totalErrors: 0 })
    expect(indexedDb.snapshot('ai_generation_history')).toEqual([
      expect.objectContaining({ historyId: 'shared-history' })
    ])
  })

  it('跨设备数字 ID 碰撞时以 UUID 关系为准，变量不会串到另一个提示词', async () => {
    const data = {
      ...emptyRestoreData(),
      categories: [
        category({ id: 7, uuid: 'category-a', name: 'Category A' }),
        category({ id: 7, uuid: 'category-b', name: 'Category B' })
      ],
      prompts: [
        prompt({ id: 11, uuid: 'prompt-a', title: 'Prompt A', categoryId: 7, categoryUuid: 'category-a' }),
        prompt({ id: 11, uuid: 'prompt-b', title: 'Prompt B', categoryId: 7, categoryUuid: 'category-b' })
      ],
      promptVariables: [
        {
          id: 21,
          uuid: 'variable-a',
          promptId: 11,
          promptUuid: 'prompt-a',
          name: 'tone-a',
          type: 'text',
          createdAt: T0,
          updatedAt: T0
        },
        {
          id: 22,
          uuid: 'variable-b',
          promptId: 11,
          promptUuid: 'prompt-b',
          name: 'tone-b',
          type: 'text',
          createdAt: T0,
          updatedAt: T0
        }
      ]
    }

    const result = await manager.replaceAllData(data)

    expect(result, JSON.stringify(result, null, 2)).toMatchObject({ success: true, totalErrors: 0 })
    const categoriesByUuid = new Map(indexedDb.snapshot('categories').map(item => [item.uuid, item]))
    const promptsByUuid = new Map(indexedDb.snapshot('prompts').map(item => [item.uuid, item]))
    const variablesByUuid = new Map(indexedDb.snapshot('promptVariables').map(item => [item.uuid, item]))

    expect(promptsByUuid.get('prompt-a')?.categoryId).toBe(categoriesByUuid.get('category-a')?.id)
    expect(promptsByUuid.get('prompt-b')?.categoryId).toBe(categoriesByUuid.get('category-b')?.id)
    expect(variablesByUuid.get('variable-a')?.promptId).toBe(promptsByUuid.get('prompt-a')?.id)
    expect(variablesByUuid.get('variable-b')?.promptId).toBe(promptsByUuid.get('prompt-b')?.id)
  })

  it('恢复中途写入失败时保留完整旧状态，不留下已清空或部分新数据', async () => {
    indexedDb.seed('categories', [category({ id: 1, uuid: 'old-category', name: 'Old category' })])
    indexedDb.seed('prompts', [prompt({
      id: 1,
      uuid: 'old-prompt',
      title: 'Old prompt',
      categoryId: 1,
      categoryUuid: 'old-category'
    })])
    indexedDb.seed('settings', [{ id: 1, key: 'theme', value: 'dark', type: 'string' }])
    const before = snapshotAll(indexedDb)

    indexedDb.injectWriteFailure({
      storeName: 'prompts',
      writeNumber: 2,
      error: new DOMException('Injected disk quota failure', 'QuotaExceededError')
    })

    const result = await manager.replaceAllData({
      ...emptyRestoreData(),
      categories: [category({ id: 8, uuid: 'new-category', name: 'New category' })],
      prompts: [
        prompt({ id: 18, uuid: 'new-prompt-1', title: 'New prompt 1', categoryId: 8, categoryUuid: 'new-category' }),
        prompt({ id: 19, uuid: 'new-prompt-2', title: 'New prompt 2', categoryId: 8, categoryUuid: 'new-category' })
      ],
      settings: [{ id: 2, key: 'theme', value: 'light', type: 'string' }]
    })

    expect(result).toMatchObject({
      success: false,
      phase: 'write',
      errorCode: 'QUOTA_EXCEEDED',
      retryable: false
    })
    expect(result.failures).toEqual(expect.arrayContaining([
      expect.objectContaining({
        collection: 'prompts',
        recordKey: 'uuid:new-prompt-2',
        errorName: 'QuotaExceededError'
      })
    ]))
    expect(snapshotAll(indexedDb)).toEqual(before)
  })
})
