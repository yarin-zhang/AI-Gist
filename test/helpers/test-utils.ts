/**
 * 测试辅助工具
 * 提供通用的测试工具函数和 Mock 对象
 */

import { vi } from 'vitest'

// Mock Electron APIs
export const mockElectron = {
  ipcRenderer: {
    invoke: vi.fn(),
    send: vi.fn(),
    on: vi.fn(),
    removeAllListeners: vi.fn()
  },
  app: {
    getPath: vi.fn(() => '/mock/path'),
    getVersion: vi.fn(() => '1.0.0')
  },
  BrowserWindow: vi.fn(),
  Menu: {
    buildFromTemplate: vi.fn(),
    setApplicationMenu: vi.fn()
  }
}

// Mock IndexedDB
export const mockIndexedDB = {
  open: vi.fn().mockReturnValue({
    onerror: null,
    onsuccess: null,
    onupgradeneeded: null,
    result: {
      transaction: vi.fn().mockReturnValue({
        objectStore: vi.fn().mockReturnValue({
          get: vi.fn().mockReturnValue({ onsuccess: null, result: null }),
          put: vi.fn().mockReturnValue({ onsuccess: null }),
          delete: vi.fn().mockReturnValue({ onsuccess: null }),
          getAll: vi.fn().mockReturnValue({ onsuccess: null, result: [] }),
          createIndex: vi.fn(),
          index: vi.fn().mockReturnValue({
            get: vi.fn().mockReturnValue({ onsuccess: null, result: null })
          })
        })
      }),
      createObjectStore: vi.fn(),
      close: vi.fn()
    }
  }),
  deleteDatabase: vi.fn()
}

// Mock 数据库服务
export const mockDatabaseService = {
  initialize: vi.fn(),
  waitForInitialization: vi.fn(),
  getHealthStatus: vi.fn(),
  repairDatabase: vi.fn(),
  checkAndRepairDatabase: vi.fn(),
  user: {
    getAllUsers: vi.fn()
  },
  post: {
    getAllPosts: vi.fn()
  },
  category: {
    getAllCategories: vi.fn()
  },
  prompt: {
    getAllPrompts: vi.fn()
  },
  aiConfig: {
    getAllAIConfigs: vi.fn()
  },
  aiGenerationHistory: {
    getAllAIGenerationHistory: vi.fn()
  },
  appSettings: {
    createSetting: vi.fn()
  }
}

// Mock API 客户端
export const mockApi = {
  users: {
    getAll: vi.fn()
  },
  posts: {
    getAll: vi.fn()
  },
  categories: {
    getAll: vi.fn()
  },
  prompts: {
    getAll: vi.fn()
  },
  aiConfigs: {
    getAll: vi.fn()
  },
  aiGenerationHistory: {
    getAll: vi.fn()
  },
  appSettings: {
    create: vi.fn()
  }
}

// Mock Electron API
export const mockElectronAPI = {
  preferences: {
    get: vi.fn(),
    set: vi.fn(),
    reset: vi.fn()
  },
  window: {
    show: vi.fn(),
    hideToTray: vi.fn(),
    getSize: vi.fn(),
    getContentSize: vi.fn()
  },
  theme: {
    getCurrent: vi.fn(),
    getInfo: vi.fn(),
    setSource: vi.fn(),
    isDark: vi.fn(),
    onThemeChanged: vi.fn()
  },
  ai: {
    getConfigs: vi.fn(),
    getEnabledConfigs: vi.fn(),
    addConfig: vi.fn(),
    updateConfig: vi.fn(),
    removeConfig: vi.fn(),
    testConfig: vi.fn(),
    getModels: vi.fn(),
    generatePrompt: vi.fn(),
    generatePromptStream: vi.fn(),
    intelligentTest: vi.fn(),
    stopGeneration: vi.fn(),
    debugPrompt: vi.fn()
  },
  data: {
    createBackup: vi.fn(),
    getBackupList: vi.fn(),
    restoreBackup: vi.fn(),
    restoreBackupWithReplace: vi.fn(),
    deleteBackup: vi.fn(),
    export: vi.fn(),
    import: vi.fn(),
    exportSelected: vi.fn(),
    exportFullBackup: vi.fn(),
    importFullBackup: vi.fn(),
    selectImportFile: vi.fn(),
    selectExportPath: vi.fn(),
    getStats: vi.fn(),
    getBackupDirectory: vi.fn()
  },
  app: {
    getVersion: vi.fn(),
    checkUpdates: vi.fn(),
    openDownloadPage: vi.fn(),
    onUpdateAvailable: vi.fn()
  },
  shell: {
    openPath: vi.fn(),
    openExternal: vi.fn()
  }
}

// 测试数据生成器
export const testDataGenerators = {
  createMockCategory: (overrides = {}) => ({
    id: 1,
    uuid: overrides.uuid || `cat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name: '测试分类',
    description: '测试分类描述',
    color: '#FF0000',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides
  }),

  createMockPrompt: (overrides = {}) => ({
    id: 1,
    uuid: overrides.uuid || `prompt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    title: '测试提示词',
    content: '测试提示词内容',
    categoryId: 1,
    tags: ['test'],
    variables: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides
  }),

  createMockAIConfig: (overrides = {}) => ({
    id: 1,
    uuid: overrides.uuid || `ai-config-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name: '测试AI配置',
    provider: 'openai',
    model: 'gpt-3.5-turbo',
    apiKey: 'test-api-key',
    baseUrl: 'https://api.openai.com/v1',
    isDefault: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides
  }),

  createMockSyncMetadata: (overrides = {}) => ({
    lastSyncTime: new Date().toISOString(),
    deviceId: 'test-device-001',
    syncCount: 1,
    totalRecords: 0,
    localVersion: '1.0.0',
    remoteVersion: '1.0.0',
    dataHash: 'test-hash',
    appVersion: '1.0.0',
    lastModifiedTime: new Date().toISOString(),
    syncStrategy: 'auto_merge',
    ...overrides
  }),

  // 创建具有冲突的数据对
  createConflictingDataPair: (uuid: string, baseTime: number) => {
    const localTime = new Date(baseTime).toISOString()
    const remoteTime = new Date(baseTime + 60000).toISOString() // 远程晚1分钟
    
    return {
      local: {
        uuid,
        title: `本地版本 - ${uuid}`,
        content: '本地内容',
        updatedAt: localTime,
        createdAt: localTime
      },
      remote: {
        uuid,
        title: `远程版本 - ${uuid}`,
        content: '远程内容',
        updatedAt: remoteTime,
        createdAt: localTime
      }
    }
  },

  // 创建大量测试数据
  createBulkTestData: (prefix: string, count: number, options: any = {}) => {
    const baseTime = options.baseTime || Date.now()
    const timeIncrement = options.timeIncrement || 1000
    
    return {
      prompts: Array.from({ length: count }, (_, i) => ({
        ...testDataGenerators.createMockPrompt({
          uuid: `${prefix}-prompt-${i.toString().padStart(4, '0')}`,
          title: `${prefix} 提示词 ${i}`,
          content: `${prefix} 内容 ${i}`,
          updatedAt: new Date(baseTime + i * timeIncrement).toISOString()
        })
      })),
      categories: Array.from({ length: Math.floor(count / 10) }, (_, i) => ({
        ...testDataGenerators.createMockCategory({
          uuid: `${prefix}-cat-${i.toString().padStart(3, '0')}`,
          name: `${prefix} 分类 ${i}`,
          description: `${prefix} 分类描述 ${i}`,
          updatedAt: new Date(baseTime + i * timeIncrement * 10).toISOString()
        })
      }))
    }
  },

  // 创建模拟的同步冲突场景
  createSyncConflictScenario: (scenarioType: 'timestamp_conflict' | 'content_conflict' | 'mixed_conflict') => {
    const baseTime = Date.now()
    const uuid = `conflict-${Date.now()}`
    
    switch (scenarioType) {
      case 'timestamp_conflict': {
        return {
          local: testDataGenerators.createMockPrompt({
            uuid,
            title: '本地标题',
            content: '相同内容',
            updatedAt: new Date(baseTime + 1000).toISOString()
          }),
          remote: testDataGenerators.createMockPrompt({
            uuid,
            title: '远程标题',
            content: '相同内容',
            updatedAt: new Date(baseTime + 2000).toISOString()
          })
        }
      }
      
      case 'content_conflict': {
        const sameTime = new Date(baseTime).toISOString()
        return {
          local: testDataGenerators.createMockPrompt({
            uuid,
            title: '本地标题',
            content: '本地内容',
            updatedAt: sameTime
          }),
          remote: testDataGenerators.createMockPrompt({
            uuid,
            title: '远程标题',
            content: '远程内容',
            updatedAt: sameTime
          })
        }
      }
      
      case 'mixed_conflict': {
        return {
          local: testDataGenerators.createMockPrompt({
            uuid,
            title: '本地标题',
            content: '本地内容',
            tags: ['local', 'test'],
            updatedAt: new Date(baseTime + 1000).toISOString()
          }),
          remote: testDataGenerators.createMockPrompt({
            uuid,
            title: '远程标题',
            content: '远程内容',
            tags: ['remote', 'test'],
            updatedAt: new Date(baseTime + 2000).toISOString()
          })
        }
      }
      
      default:
        throw new Error(`未知的冲突场景类型: ${scenarioType}`)
    }
  }
}

// 异步测试辅助函数
export const asyncTestHelpers = {
  // 等待异步操作完成
  waitFor: async (fn: () => boolean, timeout = 5000) => {
    const start = Date.now()
    while (Date.now() - start < timeout) {
      if (fn()) return
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    throw new Error(`等待超时 (${timeout}ms)`)
  },

  // 模拟延迟
  delay: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),

  // 创建可控的 Promise
  createDeferredPromise: <T>() => {
    let resolve: (value: T) => void
    let reject: (reason?: any) => void
    const promise = new Promise<T>((res, rej) => {
      resolve = res
      reject = rej
    })
    return { promise, resolve: resolve!, reject: reject! }
  }
}

// 全局测试设置
export const setupTestEnvironment = () => {
  // 设置全局 Mock
  global.indexedDB = mockIndexedDB as any
  global.IDBKeyRange = {} as any
  
  // Mock window 对象
  Object.defineProperty(window, 'electron', {
    value: mockElectron,
    writable: true
  })
  
  // Mock location
  Object.defineProperty(window, 'location', {
    value: {
      href: 'http://localhost:8080',
      origin: 'http://localhost:8080'
    },
    writable: true
  })
  
  // Mock crypto
  Object.defineProperty(global, 'crypto', {
    value: {
      getRandomValues: (arr: any) => {
        for (let i = 0; i < arr.length; i++) {
          arr[i] = Math.floor(Math.random() * 256)
        }
        return arr
      }
    }
  })
}

// 清理测试环境
export const cleanupTestEnvironment = () => {
  vi.clearAllMocks()
  vi.resetAllMocks()
  vi.restoreAllMocks()
}
