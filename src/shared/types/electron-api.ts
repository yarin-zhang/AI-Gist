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
    createBackup: (description?: string) => Promise<{ id: string; name: string; description?: string; createdAt: string; size: number; version?: string; checksum?: string }>
    getBackupList: () => Promise<{ id: string; name: string; description?: string; createdAt: string; size: number; version?: string; checksum?: string }[]>
    restoreBackup: (backupId: string) => Promise<{ success: boolean; error?: string; message?: string }>
    restoreBackupWithReplace: (backupId: string) => Promise<{ success: boolean; error?: string; message?: string }>
    deleteBackup: (backupId: string) => Promise<{ success: boolean; error?: string }>
    export: (options: any, exportPath?: string) => Promise<{ success: boolean; error?: string; filePath?: string }>
    import: (filePath: string, options: any) => Promise<{ success: boolean; error?: string; message?: string; imported?: { categories: number; prompts: number; settings: number; history: number }; errors?: string[] }>
    exportSelected: (options: any, exportPath?: string) => Promise<{ success: boolean; error?: string; message?: string; filePath?: string }>
    exportFullBackup: () => Promise<{ success: boolean; error?: string; message?: string; filePath?: string }>
    importFullBackup: () => Promise<{ success: boolean; error?: string; message?: string }>
    selectImportFile: (format: string) => Promise<string | null>
    selectExportPath: (defaultName: string) => Promise<string | null>
    getStats: () => Promise<{ categories: number; prompts: number; history: number; aiConfigs: number; settings: number; posts: number; users: number; totalRecords: number }>
    getBackupDirectory: () => Promise<{ success: boolean; path?: string; error?: string; message?: string }>
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
    checkUpdates: () => Promise<{ success: boolean; data?: any; error?: string }>
    openDownloadPage: (url: string) => Promise<{ success: boolean; error?: string }>
    onUpdateAvailable: (callback: (updateInfo: any) => void) => () => void
  }
  
  // Shell 功能
  shell: {
    openPath: (path: string) => Promise<{ success: boolean; error?: string }>
    openExternal: (url: string) => Promise<{ success: boolean; error?: string }>
  }
}

/**
 * 全局 Window 接口扩展
 */
declare global {
  interface Window {
    electronAPI: ElectronApi,
  }
} 