/**
 * Should match main/preload.ts for typescript support in renderer
 */

// 导入共享的 AI 类型
import type { 
  AIConfig, 
  AIGenerationRequest, 
  AIGenerationResult, 
  AIConfigTestResult 
} from '../../shared/types/ai';

// 重新导出以保持向后兼容
export type { 
  AIConfig, 
  AIGenerationRequest, 
  AIGenerationResult, 
  AIConfigTestResult 
};

// 导入共享的 WebDAV 类型
import type { 
  WebDAVConfig, 
  WebDAVTestResult, 
  WebDAVSyncResult 
} from '../../shared/types/webdav';

// 重新导出以保持向后兼容
export type { 
  WebDAVConfig, 
  WebDAVTestResult, 
  WebDAVSyncResult 
};

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
    generatePromptStream: (request: AIGenerationRequest, config: AIConfig, onProgress: (charCount: number, partialContent?: string) => boolean) => Promise<AIGenerationResult>    intelligentTest: (config: AIConfig) => Promise<AIConfigTestResult>
    stopGeneration: () => Promise<{ success: boolean; message: string }>
  }
  
  webdav: {
    testConnection: (config: WebDAVConfig) => Promise<WebDAVTestResult>
    syncNow: () => Promise<{ success: boolean; data?: WebDAVSyncResult; error?: string }>
    manualUpload: () => Promise<{ success: boolean; data?: WebDAVSyncResult; error?: string }>
    manualDownload: () => Promise<{ success: boolean; data?: any; error?: string }>
    applyDownloadedData: (resolution: any) => Promise<{ success: boolean; message?: string; error?: string }>
    compareData: () => Promise<{ success: boolean; data?: any; error?: string }>
    getConfig: () => Promise<WebDAVConfig>
    setConfig: (config: WebDAVConfig) => Promise<{ success: boolean; message?: string; error?: string }>
  }
}

declare global {
  interface Window {
    electronAPI: ElectronApi,
  }
}
