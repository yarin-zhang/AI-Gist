/**
 * IPC 通信相关类型定义
 */

/**
 * IPC 调用结果基础接口
 */
export interface IpcResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * IPC 频道枚举
 */
export enum IpcChannels {
  // 用户偏好设置
  GET_USER_PREFERENCES = 'get-user-preferences',
  SET_USER_PREFERENCES = 'set-user-preferences',
  RESET_USER_PREFERENCES = 'reset-user-preferences',

  // 窗口管理
  SHOW_WINDOW = 'show-window',
  HIDE_TO_TRAY = 'hide-to-tray',
  GET_WINDOW_SIZE = 'get-window-size',
  GET_CONTENT_SIZE = 'get-content-size',

  // 主题管理
  THEME_GET_CURRENT = 'theme:get-current',
  THEME_GET_INFO = 'theme:get-info',
  THEME_SET_SOURCE = 'theme:set-source',
  THEME_IS_DARK = 'theme:is-dark',

  // AI 服务
  AI_GET_CONFIGS = 'ai:get-configs',
  AI_GET_ENABLED_CONFIGS = 'ai:get-enabled-configs',
  AI_ADD_CONFIG = 'ai:add-config',
  AI_UPDATE_CONFIG = 'ai:update-config',
  AI_REMOVE_CONFIG = 'ai:remove-config',
  AI_TEST_CONFIG = 'ai:test-config',
  AI_GET_MODELS = 'ai:get-models',
  AI_GENERATE_PROMPT = 'ai:generate-prompt',
  AI_GENERATE_PROMPT_STREAM = 'ai:generate-prompt-stream',
  AI_INTELLIGENT_TEST = 'ai:intelligent-test',
  AI_STOP_GENERATION = 'ai:stop-generation',
  AI_DEBUG_PROMPT = 'ai:debug-prompt',

  // WebDAV
  WEBDAV_TEST_CONNECTION = 'webdav:test-connection',
  WEBDAV_SYNC_NOW = 'webdav:sync-now',
  WEBDAV_GET_SYNC_STATUS = 'webdav:get-sync-status',
  WEBDAV_SET_CONFIG = 'webdav:set-config',
  WEBDAV_GET_CONFIG = 'webdav:get-config',
  WEBDAV_ENCRYPT_PASSWORD = 'webdav:encrypt-password',
  WEBDAV_DECRYPT_PASSWORD = 'webdav:decrypt-password',

  // 数据管理
  DATA_CREATE_BACKUP = 'data:create-backup',
  DATA_GET_BACKUP_LIST = 'data:get-backup-list',
  DATA_RESTORE_BACKUP = 'data:restore-backup',
  DATA_DELETE_BACKUP = 'data:delete-backup',
  DATA_EXPORT = 'data:export',
  DATA_IMPORT = 'data:import',
  DATA_SELECT_IMPORT_FILE = 'data:select-import-file',
  DATA_SELECT_EXPORT_PATH = 'data:select-export-path',
  DATA_GET_STATS = 'data:get-stats',
}

/**
 * IPC 事件类型
 */
export enum IpcEvents {
  // AI 流式生成进度
  AI_STREAM_PROGRESS = 'ai:stream-progress',
  
  // 主题变化
  THEME_CHANGED = 'theme-changed',
  
  // WebDAV 同步状态变化
  WEBDAV_SYNC_STATUS_CHANGED = 'webdav:sync-status-changed',
}

/**
 * 数据库服务接口定义
 */
export interface DatabaseService {
  getHealthStatus(): Promise<IpcResult<{ healthy: boolean; missingStores?: string[]; }>>;
  exportAllData(): Promise<IpcResult<any>>;
  importData(data: any): Promise<IpcResult<{ totalImported: number; totalErrors: number; details: Record<string, number>; }>>;
  backupData(): Promise<IpcResult<any>>;
  restoreData(backupData: any): Promise<IpcResult<{ totalRestored: number; totalErrors: number; details: Record<string, number>; }>>;
  getStats(): Promise<IpcResult<Record<string, number>>>;
}

/**
 * IPC 错误类型
 */
export class IpcError extends Error {
  constructor(
    message: string,
    public channel: string,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'IpcError';
  }
}

/**
 * IPC 调用选项
 */
export interface IpcInvokeOptions {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}
