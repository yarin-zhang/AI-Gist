/**
 * Electron 相关类型定义
 */

/**
 * 用户偏好设置
 */
export interface UserPreferences {
  theme: 'system' | 'light' | 'dark';
  language: string;
  autoStartup: boolean;
  minimizeToTray: boolean;
  showNotifications: boolean;
  checkUpdates: boolean;
  windowSize: {
    width: number;
    height: number;
  };
  windowPosition: {
    x: number;
    y: number;
  };
  // 原有的属性
  closeBehaviorMode: 'ask' | 'fixed'; // 关闭行为模式：'ask' 每次询问, 'fixed' 固定行为
  closeAction: 'quit' | 'minimize'; // 关闭动作：'quit' 退出应用, 'minimize' 最小化到托盘
  startMinimized: boolean; // 启动时是否最小化到托盘
  autoLaunch: boolean; // 是否开机自启动
  themeSource: 'system' | 'light' | 'dark'; // 主题设置
  webdav?: {
    enabled: boolean;
    serverUrl: string;
    username: string;
    password: string; // 原始密码字段
    encryptedPassword?: string; // 加密后的密码
    syncInterval: number;
    autoSync: boolean;
  };
  dataSync?: {
    lastSyncTime: string | null;
    autoBackup: boolean;
    backupInterval: number;
  };
}

/**
 * 系统主题类型
 */
export type SystemTheme = 'light' | 'dark' | 'system';

/**
 * 主题信息
 */
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
 * AI 生成请求
 */
export interface AIGenerationRequest {
  configId: string;
  model?: string;
  topic: string;
  customPrompt?: string;
  systemPrompt?: string;
}

/**
 * AI 生成结果
 */
export interface AIGenerationResult {
  id: string;
  configId: string;
  topic: string;
  generatedPrompt: string;
  model: string;
  customPrompt?: string;
  createdAt: Date;
}

/**
 * WebDAV 配置
 */
export interface WebDAVConfig {
  serverUrl: string;
  username: string;
  password: string;
  enabled: boolean;
  syncInterval: number;
  autoSync: boolean;
}

/**
 * WebDAV 测试结果
 */
export interface WebDAVTestResult {
  success: boolean;
  error?: string;
  message?: string;
}

/**
 * WebDAV 同步状态
 */
export interface WebDAVSyncStatus {
  isOnline: boolean;
  lastSync?: Date;
  nextSync?: Date;
  totalItems?: number;
  syncedItems?: number;
  errors?: string[];
  inProgress: boolean;
}

/**
 * 数据备份信息
 */
export interface BackupInfo {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  size: number;
  data?: any;
}

/**
 * 导出选项
 */
export interface ExportOptions {
  format: 'json' | 'csv';
  includeUsers?: boolean;
  includePosts?: boolean;
  includeCategories?: boolean;
  includePrompts?: boolean;
  includeAIConfigs?: boolean;
  includeAIHistory?: boolean;
  includeSettings?: boolean;
}

/**
 * 导入选项
 */
export interface ImportOptions {
  format: 'json' | 'csv';
  replaceExisting?: boolean;
  skipDuplicates?: boolean;
  createCategories?: boolean;
}

/**
 * 导入结果
 */
export interface ImportResult {
  success: boolean;
  message?: string;
  error?: string;
  totalImported?: number;
  totalErrors?: number;
  details?: Record<string, number>;
}
