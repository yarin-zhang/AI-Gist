/**
 * Electron 应用相关的类型定义
 */

export interface UserPreferences {
  closeBehaviorMode: 'ask' | 'fixed'; // 关闭行为模式：'ask' 每次询问, 'fixed' 固定行为
  closeAction: 'quit' | 'minimize'; // 关闭动作：'quit' 退出应用, 'minimize' 最小化到托盘
  startMinimized: boolean; // 启动时是否最小化到托盘
  autoLaunch: boolean; // 是否开机自启动
  themeSource: 'system' | 'light' | 'dark'; // 主题设置
}

/**
 * 系统主题相关类型定义
 */
export type SystemTheme = 'light' | 'dark' | 'system';

export interface ThemeInfo {
  currentTheme: SystemTheme;
  isDarkTheme: boolean;
  isHighContrastTheme: boolean;
  themeSource: string;
  shouldUseDarkColors: boolean;
  shouldUseHighContrastColors: boolean;
  shouldUseInvertedColorScheme: boolean;
}

/**
 * AI 配置相关类型定义
 */
export interface AIConfig {
  id: string;
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

export interface AIGenerationHistory {
  id: string;
  configId: string;
  topic: string;
  generatedPrompt: string;
  model: string;
  customPrompt?: string;
  status: 'success' | 'error';
  errorMessage?: string;
  createdAt: Date;
}
