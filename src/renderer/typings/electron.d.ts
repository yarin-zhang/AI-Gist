/**
 * Should match main/preload.ts for typescript support in renderer
 */

// AI 相关类型定义
export interface AIConfig {
  id?: number;
  configId: string; // 唯一标识符
  name: string;
  type: 'openai' | 'ollama' | 'anthropic' | 'google' | 'azure' | 'lmstudio' | 'deepseek' | 'cohere' | 'mistral';
  baseURL: string;
  apiKey?: string;
  secretKey?: string;
  models: string[];
  defaultModel?: string;
  customModel?: string;
  enabled: boolean;
  systemPrompt?: string; // 自定义的生成提示词的系统提示词
  createdAt: Date;
  updatedAt: Date;
}

export interface AIGenerationRequest {
  configId: string;
  model?: string;
  topic: string;
  customPrompt?: string;
  systemPrompt?: string;
}

export interface AIGenerationResult {
  id: string;
  configId: string;
  topic: string;
  generatedPrompt: string;
  model: string;
  customPrompt?: string;
  createdAt: Date;
}

// WebDAV 相关类型定义
export interface WebDAVConfig {
  enabled: boolean;
  serverUrl: string;
  username: string;
  password: string;
  autoSync: boolean;
  syncInterval: number;
  encryptData?: boolean;
  maxRetries?: number;
  conflictResolution?: 'ask' | 'local_wins' | 'remote_wins' | 'merge';
}

export interface SyncResult {
  success: boolean;
  message: string;
  timestamp: string;
  itemsProcessed: number;
  itemsUpdated: number;
  itemsCreated: number;
  itemsDeleted: number;
  conflictsResolved: number;
  conflictDetails: any[];
  errors: string[];
}

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
    testConfig: (config: AIConfig) => Promise<{ success: boolean; error?: string; models?: string[] }>
    getModels: (config: AIConfig) => Promise<string[]>
    generatePrompt: (request: AIGenerationRequest, config: AIConfig) => Promise<AIGenerationResult>
    generatePromptStream: (request: AIGenerationRequest, config: AIConfig, onProgress: (charCount: number, partialContent?: string) => boolean) => Promise<AIGenerationResult>    intelligentTest: (config: AIConfig) => Promise<{ success: boolean; response?: string; error?: string }>
    stopGeneration: () => Promise<{ success: boolean; message: string }>
  }
  
  webdav: {
    testConnection: (config: WebDAVConfig) => Promise<{ success: boolean; message: string; serverInfo?: any }>
    syncNow: () => Promise<{ success: boolean; data?: SyncResult; error?: string }>
    manualUpload: () => Promise<{ success: boolean; data?: SyncResult; error?: string }>
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
