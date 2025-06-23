/**
 * Electron 相关类型定义
 */

// 导入 WebDAV 相关类型
import type { 
  WebDAVConfig, 
  WebDAVTestResult, 
  WebDAVSyncStatus, 
  WebDAVSyncResult 
} from './webdav';

// 导入数据管理相关类型
import type {
  BackupInfo,
  ExportOptions,
  ImportOptions,
  ImportResult
} from './data-management';

// 重新导出以保持向后兼容
export type { 
  WebDAVConfig, 
  WebDAVTestResult, 
  WebDAVSyncStatus, 
  WebDAVSyncResult,
  BackupInfo,
  ExportOptions,
  ImportOptions,
  ImportResult
};

// 导入并重新导出 AI 相关类型，保持向后兼容
import type { AIGenerationRequest, AIGenerationResult } from './ai';
export type { AIGenerationRequest, AIGenerationResult };

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
    // 连接验证状态
    connectionTested?: boolean;
    connectionValid?: boolean;
    connectionMessage?: string;
    connectionTestedAt?: string;
    configHash?: string;
  };
  icloud?: {
    enabled: boolean;
    autoSync: boolean;
    syncInterval: number; // 分钟
    customPath?: string; // 可选的自定义同步路径
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


