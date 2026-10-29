/**
 * Preferences 相关类型定义
 */

/**
 * 支持的语言类型
 */
export type SupportedLocale = 'zh-CN' | 'zh-TW' | 'en-US' | 'ja-JP' | 'it-IT';

export type ShortcutAction = 'copy' | 'paste';

export type ShortcutCommandId = 'launcher' | 'showMainWindow';

export interface ShortcutCommandBinding {
  accelerator: string;
  enabled: boolean;
}

export interface PromptShortcutBinding {
  id: string;
  promptUUID: string;
  accelerator: string;
  action: ShortcutAction;
  enabled: boolean;
}

export interface ShortcutPreferences {
  version: 2;
  defaultAction: ShortcutAction;
  commands: Record<ShortcutCommandId, ShortcutCommandBinding>;
  promptBindings: PromptShortcutBinding[];
  recentPromptUUIDs: string[];
}

export type ShortcutRegistrationState =
  | 'registered'
  | 'disabled'
  | 'conflict'
  | 'unsupported'
  | 'invalid-target';

export interface ShortcutRegistrationStatus {
  id: string;
  accelerator: string;
  state: ShortcutRegistrationState;
  /** 诊断信息（错误码或 Electron 原始报错），只用于排查，不显示给用户 */
  message?: string;
}

/**
 * 自动粘贴不可用的原因，由渲染进程翻译：
 * - accessibility-permission：macOS 还没授予辅助功能权限，用户可以去授权
 * - xdotool-missing：Linux 没装 xdotool，用户可以安装
 * - wayland / unsupported-platform：这台电脑上做不到，只会复制到剪贴板
 */
export type PasteUnavailableReason =
  | 'accessibility-permission'
  | 'xdotool-missing'
  | 'wayland'
  | 'unsupported-platform';

export interface PasteCapability {
  supported: boolean;
  permissionGranted: boolean;
  reason?: PasteUnavailableReason;
}

export interface ShortcutInvocation {
  kind: 'launcher' | 'prompt';
  bindingId?: string;
  promptUUID?: string;
  action?: ShortcutAction;
}

export interface ShortcutExecutionRequest {
  promptUUID: string;
  title: string;
  content: string;
  action: ShortcutAction;
}

export interface ShortcutState {
  preferences: ShortcutPreferences;
  registrations: ShortcutRegistrationStatus[];
  pasteCapability: PasteCapability;
}

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
  type: 'show-interface' | 'copy-prompt' | 'prompt-trigger';
  /** 关联的提示词ID（仅用于prompt-trigger类型） */
  promptId?: number;
  /** 选择的提示词ID（仅用于copy-prompt类型） */
  selectedPromptId?: number;
  /** 选择的提示词UUID（用于数据同步和备份） */
  selectedPromptUUID?: string;
}

/**
 * 用户偏好设置
 */
export interface UserPreferences {
  theme: 'system' | 'light' | 'dark';
  language: SupportedLocale;
  /**
   * 渲染进程上报的当前界面语言，桌面端主进程据此决定托盘、系统对话框和通知的语言。
   * language 字段的默认值 zh-CN 早已写进所有旧配置文件，分不清是用户选的还是默认值，
   * 所以单独用这个字段；没上报过时主进程按系统语言选。
   */
  uiLocale?: SupportedLocale;
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
  shortcuts?: ShortcutPreferences;
  // 新增：网络代理配置
  networkProxy?: {
    mode: 'direct' | 'system' | 'manual';
    manualConfig?: {
      httpProxy?: string;
      httpsProxy?: string;
      noProxy?: string;
    };
  };
  // 新增：本地 CLI 桥接配置
  cliBridge?: {
    /** 是否允许本地 CLI（回环 HTTP + token 鉴权）访问本机数据 */
    enabled: boolean;
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
