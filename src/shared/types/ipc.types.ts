/**
 * IPC 通信相关的类型定义
 */

// IPC 通道名称
export const IPC_CHANNELS = {
  // 偏好设置
  PREFERENCES_GET: 'preferences:get',
  PREFERENCES_SET: 'preferences:set',
  PREFERENCES_RESET: 'preferences:reset',
  
  // 主题管理
  THEME_SET_SOURCE: 'theme:setSource',
  
  // WebDAV 服务
  WEBDAV_TEST_CONNECTION: 'webdav:testConnection',
  WEBDAV_SYNC_NOW: 'webdav:syncNow',
  WEBDAV_GET_SYNC_STATUS: 'webdav:getSyncStatus',
  WEBDAV_SET_CONFIG: 'webdav:setConfig',
  WEBDAV_GET_CONFIG: 'webdav:getConfig',
  
  // 应用管理
  APP_QUIT: 'app:quit',
  APP_RESTART: 'app:restart',
  APP_SHOW_WINDOW: 'app:showWindow',
  APP_HIDE_WINDOW: 'app:hideWindow',
  APP_TOGGLE_WINDOW: 'app:toggleWindow',
  APP_GET_VERSION: 'app:getVersion',
  
  // 系统托盘
  TRAY_UPDATE_MENU: 'tray:updateMenu',
  
  // AI 服务
  AI_SERVICE_INVOKE: 'ai-service:invoke',
  
  // 数据管理
  DATA_EXPORT: 'data:export',
  DATA_IMPORT: 'data:import',
  DATA_BACKUP: 'data:backup',
  DATA_RESTORE: 'data:restore',
} as const;

// IPC 调用结果类型
export interface IpcResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// 数据导出/导入相关类型
export interface DataExportResult {
  success: boolean;
  data?: {
    users: any[];
    posts: any[];
    categories: any[];
    prompts: any[];
    aiConfigs: any[];
    aiHistory: any[];
    settings: any[];
  };
  message?: string;
  error?: string;
}

export interface DataImportResult {
  success: boolean;
  message?: string;
  error?: string;
  details?: {
    users?: number;
    posts?: number;
    categories?: number;
    prompts?: number;
    aiConfigs?: number;
    aiHistory?: number;
    settings?: number;
  };
}

// WebDAV 配置类型
export interface WebDAVConfig {
  server?: string;
  username?: string;
  password?: string;
  enabled?: boolean;
  autoSync?: boolean;
  syncInterval?: number;
}

// 偏好设置类型
export interface AppPreferences {
  theme?: string;
  language?: string;
  autoStart?: boolean;
  minimizeToTray?: boolean;
  webdav?: WebDAVConfig;
  [key: string]: any;
}

// AI 服务配置类型
export interface AIServiceConfig {
  provider: string;
  apiKey: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  [key: string]: any;
}
