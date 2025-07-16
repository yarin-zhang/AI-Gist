/**
 * Preferences 相关类型定义
 */

/**
 * 支持的语言类型
 */
export type SupportedLocale = 'zh-CN' | 'zh-TW' | 'en-US' | 'ja-JP';

/**
 * 快捷键配置
 */
export interface ShortcutConfig {
  /** 快捷键组合，如 "Ctrl+Shift+G" */
  key: string;
  /** 快捷键描述 */
  description: string;
  /** 是否启用 */
  enabled: boolean;
  /** 快捷键类型 */
  type: 'show-interface' | 'insert-data' | 'prompt-trigger';
  /** 关联的提示词ID（仅用于prompt-trigger类型） */
  promptId?: number;
  /** 选择的提示词ID（仅用于insert-data类型） */
  selectedPromptId?: number;
}

/**
 * 用户偏好设置
 */
export interface UserPreferences {
  theme: 'system' | 'light' | 'dark';
  language: SupportedLocale;
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
  dataSync?: {
    lastSyncTime: string | null;
    autoBackup: boolean;
    backupInterval: number;
  };
  // 新增：快捷键配置
  shortcuts?: {
    showInterface: ShortcutConfig;
    insertData: ShortcutConfig;
    promptTriggers: ShortcutConfig[];
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


