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
  open: vi.fn(),
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

// Mock IPC 工具
export const mockIpcUtils = {
  invoke: vi.fn(),
  safeInvoke: vi.fn(),
  isElectronAvailable: vi.fn(() => true)
}

// 测试数据生成器
export const testDataGenerators = {
  createMockCategory: (overrides = {}) => ({
    id: 1,
    name: '测试分类',
    description: '测试分类描述',
    color: '#FF0000',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides
  }),

  createMockPrompt: (overrides = {}) => ({
    id: 1,
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
    ...overrides
  })
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
