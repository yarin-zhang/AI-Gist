/**
 * Electron API 类型定义
 * 用于 Main 进程和 Renderer 进程之间的类型共享
 */

// 导入共享的 AI 类型
import type { 
  AIConfig, 
  AIGenerationRequest, 
  AIGenerationResult, 
  AIConfigTestResult 
} from './ai';

// 导入云端备份类型
import type {
  CloudStorageConfig,
  CloudBackupInfo,
  CloudBackupCreateOptions
} from './cloud-backup';
import type {
  CloudSyncManifest,
  CloudSyncManifestSaveOptions,
  CloudSyncManifestSaveResult
} from '../cloud-sync-manifest';
import type {
  CloudSyncRemoteSnapshotInfo
} from '../cloud-sync-snapshots';
import type {
  CloudSyncSnapshot
} from '../cloud-sync-engine';
import type {
  PasteCapability,
  PromptShortcutBinding,
  ShortcutCommandId,
  ShortcutExecutionRequest,
  ShortcutInvocation,
  ShortcutState,
} from './preferences';
import type {
  CloudSyncV2ObjectWriteOptions,
  CloudSyncV2ObjectWriteResult,
  CloudSyncV2StoredObject,
  CloudSyncV2StoredObjectInfo
} from '../cloud-sync-v2-repository';

/**
 * Electron API 接口定义
 */
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

  lifecycle: {
    onFlushRequested: (callback: (options: { reason: string; timeoutMs: number }) => Promise<any>) => () => void
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
    testModel: (config: AIConfig, model: string) => Promise<{ success: boolean; error?: string; model?: string; response?: string }>
    getModels: (config: AIConfig) => Promise<string[]>
    generatePrompt: (request: AIGenerationRequest, config: AIConfig) => Promise<AIGenerationResult>
    generatePromptStream: (request: AIGenerationRequest, config: AIConfig, onProgress: (charCount: number, partialContent?: string) => boolean) => Promise<AIGenerationResult>
    intelligentTest: (config: AIConfig) => Promise<AIConfigTestResult>
    stopGeneration: () => Promise<{ success: boolean; message: string }>
    debugPrompt: (prompt: string, config: AIConfig) => Promise<AIGenerationResult>
  }

  data: {
    selectImportFile: (format: string) => Promise<string | null>
    selectExportPath: (defaultName: string) => Promise<string | null>
    writeFile: (filePath: string, content: string) => Promise<{ success: boolean; error?: string }>
    readFile: (filePath: string) => Promise<{ success: boolean; content?: string; error?: string }>
  }

  // 文件操作
  fs: {
    readFile: (filePath: string) => Promise<string>
    writeFile: (filePath: string, content: string) => Promise<{ success: boolean }>
    ensureDir: (dirPath: string) => Promise<{ success: boolean }>
    stat: (filePath: string) => Promise<{ size: number; mtime: Date }>
    readdir: (dirPath: string) => Promise<string[]>
    unlink: (filePath: string) => Promise<{ success: boolean }>
  }

  // 云端备份功能
  cloud: {
    checkICloudAvailability: () => Promise<{ available: boolean; reason?: string }>
    getStorageConfigs: () => Promise<CloudStorageConfig[]>
    addStorageConfig: (config: Omit<CloudStorageConfig, 'id' | 'createdAt' | 'updatedAt'>) => Promise<{ success: boolean; config?: CloudStorageConfig; error?: string }>
    updateStorageConfig: (id: string, config: Partial<CloudStorageConfig>) => Promise<{ success: boolean; config?: CloudStorageConfig; error?: string }>
    deleteStorageConfig: (id: string) => Promise<{ success: boolean; error?: string }>
    testStorageConnection: (config: CloudStorageConfig) => Promise<{ success: boolean; error?: string }>
    getBackupList: (storageId: string) => Promise<CloudBackupInfo[]>
    createBackup: (storageId: string, options?: string | CloudBackupCreateOptions) => Promise<{ success: boolean; message: string; backupInfo?: CloudBackupInfo; error?: string }>
    restoreBackup: (storageId: string, backupId: string) => Promise<{ success: boolean; message: string; backupInfo?: CloudBackupInfo; error?: string }>
    deleteBackup: (storageId: string, backupId: string) => Promise<{ success: boolean; message?: string; error?: string }>
    getSyncManifest: (storageId: string) => Promise<
      CloudSyncManifest |
      { success: true; manifest: CloudSyncManifest } |
      { success: false; error?: string }
    >
    saveSyncManifest: (
      storageId: string,
      manifest: CloudSyncManifest,
      options?: CloudSyncManifestSaveOptions
    ) => Promise<CloudSyncManifestSaveResult>
    listSyncSnapshots: (storageId: string) => Promise<
      { success: true; snapshots: CloudSyncRemoteSnapshotInfo[] } |
      { success: false; error?: string }
    >
    readSyncSnapshot: (
      storageId: string,
      snapshot: CloudSyncRemoteSnapshotInfo | string
    ) => Promise<
      { success: true; snapshot: CloudSyncSnapshot } |
      { success: false; error?: string }
    >
    saveSyncSnapshot: (
      storageId: string,
      snapshot: CloudSyncSnapshot
    ) => Promise<{ success: boolean; error?: string }>
    readCloudSyncV2Object: (storageId: string, path: string) => Promise<CloudSyncV2StoredObject | null>
    writeCloudSyncV2Object: (
      storageId: string,
      path: string,
      data: Uint8Array,
      options?: CloudSyncV2ObjectWriteOptions
    ) => Promise<CloudSyncV2ObjectWriteResult>
    listCloudSyncV2Objects: (storageId: string, prefix: string) => Promise<CloudSyncV2StoredObjectInfo[]>
    deleteCloudSyncV2Object: (storageId: string, path: string) => Promise<void>
  }

  // 应用信息和更新
  app: {
    getVersion: () => Promise<string>
    getPath: (name: string) => Promise<string>
    checkUpdates: () => Promise<{ success: boolean; data?: any; error?: string }>
    openDownloadPage: (url: string) => Promise<{ success: boolean; error?: string }>
    onUpdateAvailable: (callback: (updateInfo: any) => void) => () => void
  }
  
  // Shell 功能
  shell: {
    openPath: (path: string) => Promise<{ success: boolean; error?: string }>
    openExternal: (url: string) => Promise<{ success: boolean; error?: string }>
  }

  // 网络代理管理
  proxy: {
    getSystemProxyInfo: () => Promise<{
      hasProxy: boolean;
      proxyConfig?: string;
      proxyAddress?: string;
    }>
    refreshSystemProxyInfo: () => Promise<{
      hasProxy: boolean;
      proxyConfig?: string;
      proxyAddress?: string;
      lastRefreshTime: string;
    }>
    testConnectionRealTime: (proxyConfig?: {
      mode: 'direct' | 'system' | 'manual';
      manualConfig?: {
        httpProxy?: string;
        httpsProxy?: string;
        noProxy?: string;
      };
    }) => Promise<{
      overall: {
        success: boolean;
        totalSites: number;
        successSites: number;
        failedSites: number;
      };
      results: {
        name: string;
        url: string;
        description: string;
        success: boolean;
        responseTime?: number;
        error?: string;
      }[];
    }>
    getProxyInfo: (url?: string) => Promise<string>
    setProxyMode: (mode: 'direct' | 'system' | 'manual', config?: any) => Promise<{
      success: boolean;
      error?: string;
    }>
    onTestProgress: (callback: (result: {
      name: string;
      url: string;
      description: string;
      success: boolean;
      responseTime?: number;
      error?: string;
    }) => void) => () => void
  }

  // 快捷键管理
  shortcuts: ShortcutsAPI
}

export interface ShortcutsAPI {
  getState: () => Promise<ShortcutState>;
  validate: (accelerator: string, excludeId?: string) => Promise<{ valid: boolean; error?: string }>;
  updateCommand: (commandId: ShortcutCommandId, patch: { accelerator?: string; enabled?: boolean }) => Promise<ShortcutState>;
  upsertPromptBinding: (binding: Omit<PromptShortcutBinding, 'id'> & { id?: string }) => Promise<ShortcutState>;
  removePromptBinding: (id: string) => Promise<ShortcutState>;
  resolveLegacyBinding: (id: string, promptUUID: string) => Promise<void>;
  markInvalidTarget: (id: string) => Promise<void>;
  launcherReady: () => void;
  showLauncher: () => Promise<void>;
  hideLauncher: () => Promise<void>;
  executeText: (request: ShortcutExecutionRequest) => Promise<{ success: boolean; pasted: boolean; warning?: string }>;
  navigateMain: (target: 'home' | 'new-prompt' | 'shortcuts', promptUUID?: string) => Promise<void>;
  requestPastePermission: () => Promise<PasteCapability>;
  onLauncherInvocation: (callback: (invocation: ShortcutInvocation) => void) => () => void;
  onNavigateMain: (callback: (payload: { target: 'home' | 'new-prompt' | 'shortcuts'; promptUUID?: string }) => void) => () => void;
  // 注册默认快捷键
  registerDefaults: () => Promise<{ success: boolean; error?: string }>;
  
  // 重新注册快捷键
  reregister: () => Promise<{ success: boolean; error?: string }>;
  
  // 临时禁用快捷键
  temporarilyDisable: () => Promise<{ success: boolean; error?: string }>;
  
  // 恢复快捷键
  restore: () => Promise<{ success: boolean; error?: string }>;
  
  // 检查快捷键是否已注册
  isRegistered: (accelerator: string) => Promise<boolean>;
  
  // 检查快捷键是否可用
  isAvailable: (accelerator: string) => Promise<boolean>;
  
  // 获取已注册的快捷键列表
  getRegistered: () => Promise<string[]>;
  
  // 检查权限并尝试注册快捷键
  checkPermissions: () => Promise<{ hasPermission: boolean; message?: string }>;
  
  // 监听快捷键事件
  onInsertData: (callback: (promptId?: number) => void) => () => void;
  
  // 监听提示词触发器事件
  onTriggerPrompt: (callback: (promptId: number) => void) => () => void;
}

/**
 * 全局 Window 接口扩展
 */
declare global {
  interface Window {
    electronAPI: ElectronApi,
  }
}
