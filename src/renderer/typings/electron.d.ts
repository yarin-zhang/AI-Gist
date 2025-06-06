/**
 * Should match main/preload.ts for typescript support in renderer
 */

// AI 相    intelligentTest: (config: AIConfig) => Promise<{ success: boolean; response?: string; error?: string; inputPrompt?: string }>类型定义
export interface AIConfig {
  id?: number;
  configId: string; // 唯一标识符
  name: string;
  type: 'openai' | 'ollama';
  baseURL: string;
  apiKey?: string;
  secretKey?: string;
  models: string[];
  defaultModel?: string;
  customModel?: string;
  enabled: boolean;
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
    intelligentTest: (config: AIConfig) => Promise<{ success: boolean; response?: string; error?: string }>
  }
}

declare global {
  interface Window {
    electronAPI: ElectronApi,
  }
}
