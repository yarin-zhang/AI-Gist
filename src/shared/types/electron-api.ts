/**
 * Electron API 类型定义
 * 用于 Main 进程和 Renderer 进程之间的类型共享
 */

// 导入共享的 AI 类型
import type { 
  AIConfig, 
  AIGenerationRequest, 
  AIGenerationResult, 
  AIConfigTestResult 
} from './ai';

// 导入云端备份类型
import type {
  CloudStorageConfig,
  CloudBackupInfo
} from './cloud-backup';

/**
 * Electron API 接口定义
 */
export default interface ElectronApi {
  sendMessage: (message: string) => void
  
  preferences: {
    get: () => Promise<any>
    set: (prefs: any) => Promise<any>
    reset: () => Promise<any>
  }
  
  window: {
    show: () => Promise<void>
    hideToTray: () => Promise<void>
    getSize: () => Promise<{ width: number; height: number } | null>
    getContentSize: () => Promise<{ width: number; height: number } | null>
  }
  
  theme: {
    getCurrent: () => Promise<'light' | 'dark' | 'system'>
    getInfo: () => Promise<{
      currentTheme: 'light' | 'dark' | 'system'
      isDarkTheme: boolean
      isHighContrastTheme: boolean
      themeSource: string
      shouldUseDarkColors: boolean
      shouldUseHighContrastColors: boolean
      shouldUseInvertedColorScheme: boolean
    }>
    setSource: (source: 'system' | 'light' | 'dark') => Promise<'light' | 'dark' | 'system'>
    isDark: () => Promise<boolean>
    onThemeChanged: (callback: (data: {
      theme: 'light' | 'dark' | 'system'
      themeInfo: any
    }) => void) => () => void
  }
  
  ai: {
    getConfigs: () => Promise<AIConfig[]>
    getEnabledConfigs: () => Promise<AIConfig[]>
    addConfig: (config: AIConfig) => Promise<AIConfig>
    updateConfig: (id: string, config: Partial<AIConfig>) => Promise<AIConfig | null>
    removeConfig: (id: string) => Promise<boolean>
    testConfig: (config: AIConfig) => Promise<AIConfigTestResult>
    getModels: (config: AIConfig) => Promise<string[]>
    generatePrompt: (request: AIGenerationRequest, config: AIConfig) => Promise<AIGenerationResult>
    generatePromptStream: (request: AIGenerationRequest, config: AIConfig, onProgress: (charCount: number, partialContent?: string) => boolean) => Promise<AIGenerationResult>
    intelligentTest: (config: AIConfig) => Promise<AIConfigTestResult>
    stopGeneration: () => Promise<{ success: boolean; message: string }>
    debugPrompt: (prompt: string, config: AIConfig) => Promise<AIGenerationResult>
  }

  data: {
    selectImportFile: (format: string) => Promise<string | null>
    selectExportPath: (defaultName: string) => Promise<string | null>
    writeFile: (filePath: string, content: string) => Promise<{ success: boolean; error?: string }>
    readFile: (filePath: string) => Promise<{ success: boolean; content?: string; error?: string }>
  }

  // 文件操作
  fs: {
    readFile: (filePath: string) => Promise<string>
    writeFile: (filePath: string, content: string) => Promise<{ success: boolean }>
    ensureDir: (dirPath: string) => Promise<{ success: boolean }>
    stat: (filePath: string) => Promise<{ size: number; mtime: Date }>
    readdir: (dirPath: string) => Promise<string[]>
    unlink: (filePath: string) => Promise<{ success: boolean }>
  }

  // 云端备份功能
  cloud: {
    checkICloudAvailability: () => Promise<{ available: boolean; reason?: string }>
    getStorageConfigs: () => Promise<CloudStorageConfig[]>
    addStorageConfig: (config: Omit<CloudStorageConfig, 'id' | 'createdAt' | 'updatedAt'>) => Promise<{ success: boolean; config?: CloudStorageConfig; error?: string }>
    updateStorageConfig: (id: string, config: Partial<CloudStorageConfig>) => Promise<{ success: boolean; config?: CloudStorageConfig; error?: string }>
    deleteStorageConfig: (id: string) => Promise<{ success: boolean; error?: string }>
    testStorageConnection: (config: CloudStorageConfig) => Promise<{ success: boolean; error?: string }>
    getBackupList: (storageId: string) => Promise<CloudBackupInfo[]>
    createBackup: (storageId: string, description?: string) => Promise<{ success: boolean; message: string; backupInfo?: CloudBackupInfo; error?: string }>
    restoreBackup: (storageId: string, backupId: string) => Promise<{ success: boolean; message: string; backupInfo?: CloudBackupInfo; error?: string }>
    deleteBackup: (storageId: string, backupId: string) => Promise<{ success: boolean; message?: string; error?: string }>
  }

  // 应用信息和更新
  app: {
    getVersion: () => Promise<string>
    getPath: (name: string) => Promise<string>
    checkUpdates: () => Promise<{ success: boolean; data?: any; error?: string }>
    openDownloadPage: (url: string) => Promise<{ success: boolean; error?: string }>
    onUpdateAvailable: (callback: (updateInfo: any) => void) => () => void
  }
  
  // Shell 功能
  shell: {
    openPath: (path: string) => Promise<{ success: boolean; error?: string }>
    openExternal: (url: string) => Promise<{ success: boolean; error?: string }>
  }

  // 快捷键管理
  shortcuts: ShortcutsAPI
}

export interface ShortcutsAPI {
  // 注册默认快捷键
  registerDefaults: () => Promise<{ success: boolean; error?: string }>;
  
  // 检查快捷键是否已注册
  isRegistered: (accelerator: string) => Promise<boolean>;
  
  // 监听快捷键事件
  onInsertData: (callback: () => void) => () => void;
}

/**
 * 全局 Window 接口扩展
 */
declare global {
  interface Window {
    electronAPI: ElectronApi,
  }
} 