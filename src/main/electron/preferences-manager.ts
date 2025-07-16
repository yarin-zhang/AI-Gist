// 标准库导入
import { app } from 'electron';
import * as fs from 'fs';
import path from 'path';

// 本地模块导入
import { UserPreferences } from '@shared/types';
import { themeManager } from './theme-manager';

/**
 * 常量定义
 */
const CONSTANTS = {
  CONFIG_FILE: 'user-preferences.json',
  LOG_MESSAGES: {
    CONFIG_LOADED: '用户偏好设置已加载:',
    CONFIG_UPDATED: '配置已更新并保存',
    CONFIG_SAVED: '用户偏好设置已保存:',
    CONFIG_RESET: '偏好设置已重置为默认值',
    PREFERENCES_UPDATED: '偏好设置已更新:',
    CONFIG_FORMAT_CHANGED: '检测到配置格式变化，正在清理...',
    AUTO_LAUNCH_ENABLED: '已启用开机自启动',
    AUTO_LAUNCH_DISABLED: '已禁用开机自启动',
    THEME_APPLIED: '已应用主题设置:',
    DEV_SKIP_AUTO_LAUNCH: '开发环境：跳过自启动设置以避免权限错误',
    DEV_AUTO_LAUNCH_STATUS: '开发环境：返回配置中的自启动状态',
    AUTO_LAUNCH_PERMISSION_ERROR: '自启动设置失败：权限不足。这通常发生在：',
    AUTO_LAUNCH_ERROR_REASONS: [
      '1. 应用未正确签名',
      '2. 系统安全设置阻止了操作',
      '3. 用户需要在系统偏好设置中手动授权'
    ]
  },
  ERROR_MESSAGES: {
    READ_OLD_CONFIG: '读取旧配置失败:',
    LOAD_PREFERENCES: '加载用户偏好设置失败:',
    SAVE_PREFERENCES: '保存用户偏好设置失败:',
    AUTO_LAUNCH_SETTING: '设置自启动失败:',
    GET_AUTO_LAUNCH_STATUS: '获取自启动状态失败，使用配置中的值:',
    APPLY_THEME: '应用主题设置失败:'
  }
} as const;

/**
 * 用户偏好设置管理器
 * 负责管理用户偏好设置的加载、保存、更新和应用
 */
class PreferencesManager {
  // ==================== 私有属性 ====================
  private userPrefs: UserPreferences;
  private configPath: string;

  // ==================== 默认配置 ====================
  private readonly defaultPreferences: UserPreferences = {
    // 旧属性
    closeBehaviorMode: 'ask',
    closeAction: 'quit',
    startMinimized: false,
    autoLaunch: false,
    themeSource: 'system',
    // 新属性
    theme: 'system',
    language: 'zh-CN',
    autoStartup: false,
    minimizeToTray: true,
    showNotifications: true,
    checkUpdates: true,
    windowSize: {
      width: 1200,
      height: 800,
    },
    windowPosition: {
      x: -1,
      y: -1,
    },
    dataSync: {
      lastSyncTime: null,
      autoBackup: true,
      backupInterval: 24,
    },
    // 新增：快捷键配置
    shortcuts: {
      showInterface: {
        key: 'Ctrl+Shift+G',
        description: '显示界面',
        enabled: true,
        type: 'show-interface'
      },
      insertData: {
        key: 'Ctrl+Shift+I',
        description: '插入数据',
        enabled: true,
        type: 'insert-data'
      },
      promptTriggers: []
    },
  };

  // ==================== 构造函数 ====================
  constructor() {
    this.configPath = path.join(app.getPath('userData'), CONSTANTS.CONFIG_FILE);
    this.userPrefs = this.loadPreferences();
    this.initializeConfiguration();
    console.log(CONSTANTS.LOG_MESSAGES.CONFIG_LOADED, this.userPrefs);
  }

  // ==================== 配置初始化和加载 ====================

  /**
   * 初始化配置
   */
  private initializeConfiguration(): void {
    const oldConfigExists = fs.existsSync(this.configPath);
    let oldConfigData = null;
    
    if (oldConfigExists) {
      try {
        oldConfigData = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
      } catch (error) {
        console.error(CONSTANTS.ERROR_MESSAGES.READ_OLD_CONFIG, error);
      }
    }
    
    // 如果配置发生了变化或首次运行，保存清理后的配置
    if (!oldConfigExists || (oldConfigData && JSON.stringify(oldConfigData) !== JSON.stringify(this.userPrefs))) {
      this.savePreferences();
      console.log(CONSTANTS.LOG_MESSAGES.CONFIG_UPDATED);
    }
  }

  /**
   * 从文件加载偏好设置
   */
  private loadPreferences(): UserPreferences {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf8');
        const loadedPrefs = JSON.parse(data);
        const cleanedPrefs = this.mergeWithDefaults(loadedPrefs);
        
        // 如果配置发生了变化（比如删除了字段），重新保存清理后的配置
        if (JSON.stringify(loadedPrefs) !== JSON.stringify(cleanedPrefs)) {
          console.log(CONSTANTS.LOG_MESSAGES.CONFIG_FORMAT_CHANGED);
          return cleanedPrefs;
        }
        
        return cleanedPrefs;
      }
    } catch (error) {
      console.error(CONSTANTS.ERROR_MESSAGES.LOAD_PREFERENCES, error);
    }
    
    // 如果加载失败或文件不存在，返回默认设置
    return { ...this.defaultPreferences };
  }

  /**
   * 将加载的配置与默认值合并
   */
  private mergeWithDefaults(loadedPrefs: any): UserPreferences {
    return {
      // 旧属性
      closeBehaviorMode: loadedPrefs.closeBehaviorMode ?? this.defaultPreferences.closeBehaviorMode,
      closeAction: loadedPrefs.closeAction ?? this.defaultPreferences.closeAction,
      startMinimized: loadedPrefs.startMinimized ?? this.defaultPreferences.startMinimized,
      autoLaunch: loadedPrefs.autoLaunch ?? this.defaultPreferences.autoLaunch,
      themeSource: loadedPrefs.themeSource ?? this.defaultPreferences.themeSource,
      // 新属性
      theme: loadedPrefs.theme ?? this.defaultPreferences.theme,
      language: loadedPrefs.language ?? this.defaultPreferences.language,
      autoStartup: loadedPrefs.autoStartup ?? this.defaultPreferences.autoStartup,
      minimizeToTray: loadedPrefs.minimizeToTray ?? this.defaultPreferences.minimizeToTray,
      showNotifications: loadedPrefs.showNotifications ?? this.defaultPreferences.showNotifications,
      checkUpdates: loadedPrefs.checkUpdates ?? this.defaultPreferences.checkUpdates,
      windowSize: {
        width: loadedPrefs.windowSize?.width ?? this.defaultPreferences.windowSize.width,
        height: loadedPrefs.windowSize?.height ?? this.defaultPreferences.windowSize.height,
      },
      windowPosition: {
        x: loadedPrefs.windowPosition?.x ?? this.defaultPreferences.windowPosition.x,
        y: loadedPrefs.windowPosition?.y ?? this.defaultPreferences.windowPosition.y,
      },
      dataSync: {
        lastSyncTime: loadedPrefs.dataSync?.lastSyncTime ?? this.defaultPreferences.dataSync!.lastSyncTime,
        autoBackup: loadedPrefs.dataSync?.autoBackup ?? this.defaultPreferences.dataSync!.autoBackup,
        backupInterval: loadedPrefs.dataSync?.backupInterval ?? this.defaultPreferences.dataSync!.backupInterval,
      },
      shortcuts: {
        showInterface: {
          key: loadedPrefs.shortcuts?.showInterface?.key ?? this.defaultPreferences.shortcuts!.showInterface.key,
          description: loadedPrefs.shortcuts?.showInterface?.description ?? this.defaultPreferences.shortcuts!.showInterface.description,
          enabled: loadedPrefs.shortcuts?.showInterface?.enabled ?? this.defaultPreferences.shortcuts!.showInterface.enabled,
          type: loadedPrefs.shortcuts?.showInterface?.type ?? this.defaultPreferences.shortcuts!.showInterface.type,
        },
        insertData: {
          key: loadedPrefs.shortcuts?.insertData?.key ?? this.defaultPreferences.shortcuts!.insertData.key,
          description: loadedPrefs.shortcuts?.insertData?.description ?? this.defaultPreferences.shortcuts!.insertData.description,
          enabled: loadedPrefs.shortcuts?.insertData?.enabled ?? this.defaultPreferences.shortcuts!.insertData.enabled,
          type: loadedPrefs.shortcuts?.insertData?.type ?? this.defaultPreferences.shortcuts!.insertData.type,
        },
        promptTriggers: loadedPrefs.shortcuts?.promptTriggers ?? this.defaultPreferences.shortcuts!.promptTriggers,
      },
    };
  }

  // ==================== 配置保存 ====================

  /**
   * 保存偏好设置到文件
   */
  private savePreferences(): void {
    try {
      this.ensureConfigDirectoryExists();
      fs.writeFileSync(this.configPath, JSON.stringify(this.userPrefs, null, 2), 'utf8');
      console.log(CONSTANTS.LOG_MESSAGES.CONFIG_SAVED, this.configPath);
    } catch (error) {
      console.error(CONSTANTS.ERROR_MESSAGES.SAVE_PREFERENCES, error);
    }
  }

  /**
   * 确保配置目录存在
   */
  private ensureConfigDirectoryExists(): void {
    const configDir = path.dirname(this.configPath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
  }

  // ==================== 公共接口方法 ====================

  /**
   * 获取用户偏好设置
   */
  getPreferences(): UserPreferences {
    return { ...this.userPrefs };
  }

  /**
   * 更新用户偏好设置
   */
  updatePreferences(newPrefs: Partial<UserPreferences>): UserPreferences {
    const oldAutoLaunch = this.userPrefs.autoLaunch;
    
    this.mergePreferences(newPrefs);
    this.savePreferences();
    
    // 如果自启动设置发生变化，立即应用
    if (newPrefs.autoLaunch !== undefined && newPrefs.autoLaunch !== oldAutoLaunch) {
      this.applyAutoLaunchSetting();
    }
    
    console.log(CONSTANTS.LOG_MESSAGES.PREFERENCES_UPDATED, newPrefs);
    return this.getPreferences();
  }

  /**
   * 合并偏好设置
   */
  private mergePreferences(newPrefs: Partial<UserPreferences>): void {
    // 深度合并嵌套对象
    if (newPrefs.dataSync) {
      this.userPrefs.dataSync = { ...this.userPrefs.dataSync, ...newPrefs.dataSync };
    }
    if (newPrefs.shortcuts) {
      this.userPrefs.shortcuts = { ...this.userPrefs.shortcuts, ...newPrefs.shortcuts };
    }
    
    // 合并其他属性
    for (const key in newPrefs) {
      if (key !== 'dataSync' && key !== 'shortcuts') {
        (this.userPrefs as any)[key] = (newPrefs as any)[key];
      }
    }
  }

  /**
   * 重置偏好设置为默认值
   */
  resetPreferences(): UserPreferences {
    this.userPrefs = { ...this.defaultPreferences };
    this.savePreferences();
    console.log(CONSTANTS.LOG_MESSAGES.CONFIG_RESET);
    return this.getPreferences();
  }

  /**
   * 获取配置文件路径
   */
  getConfigPath(): string {
    return this.configPath;
  }

  // ==================== 自启动管理 ====================

  /**
   * 应用自启动设置
   */
  applyAutoLaunchSetting(): void {
    if (this.isDevelopmentEnvironment()) {
      console.log(CONSTANTS.LOG_MESSAGES.DEV_SKIP_AUTO_LAUNCH);
      return;
    }

    try {
      if (this.userPrefs.autoLaunch) {
        this.enableAutoLaunch();
      } else {
        this.disableAutoLaunch();
      }
    } catch (error) {
      this.handleAutoLaunchError(error);
    }
  }

  /**
   * 启用自启动
   */
  private enableAutoLaunch(): void {
    app.setLoginItemSettings({
      openAtLogin: true,
      name: app.getName(),
      path: app.getPath('exe')
    });
    console.log(CONSTANTS.LOG_MESSAGES.AUTO_LAUNCH_ENABLED);
  }

  /**
   * 禁用自启动
   */
  private disableAutoLaunch(): void {
    app.setLoginItemSettings({
      openAtLogin: false
    });
    console.log(CONSTANTS.LOG_MESSAGES.AUTO_LAUNCH_DISABLED);
  }

  /**
   * 处理自启动错误
   */
  private handleAutoLaunchError(error: unknown): void {
    if (error instanceof Error) {
      if (error.message.includes('Operation not permitted')) {
        console.warn(CONSTANTS.LOG_MESSAGES.AUTO_LAUNCH_PERMISSION_ERROR);
        CONSTANTS.LOG_MESSAGES.AUTO_LAUNCH_ERROR_REASONS.forEach(reason => {
          console.warn(reason);
        });
      } else {
        console.error(CONSTANTS.ERROR_MESSAGES.AUTO_LAUNCH_SETTING, error.message);
      }
    } else {
      console.error(CONSTANTS.ERROR_MESSAGES.AUTO_LAUNCH_SETTING, error);
    }
  }

  /**
   * 获取当前自启动状态
   */
  getAutoLaunchStatus(): boolean {
    if (this.isDevelopmentEnvironment()) {
      console.log(CONSTANTS.LOG_MESSAGES.DEV_AUTO_LAUNCH_STATUS);
      return this.userPrefs.autoLaunch;
    }

    try {
      const loginItemSettings = app.getLoginItemSettings();
      return loginItemSettings.openAtLogin;
    } catch (error) {
      console.warn(CONSTANTS.ERROR_MESSAGES.GET_AUTO_LAUNCH_STATUS, error);
      return this.userPrefs.autoLaunch;
    }
  }

  // ==================== 主题管理 ====================

  /**
   * 应用主题设置
   */
  applyThemeSettings(): void {
    try {
      themeManager.setThemeSource(this.userPrefs.themeSource);
      console.log(CONSTANTS.LOG_MESSAGES.THEME_APPLIED, this.userPrefs.themeSource);
    } catch (error) {
      console.error(CONSTANTS.ERROR_MESSAGES.APPLY_THEME, error);
    }
  }

  // ==================== 设置应用 ====================

  /**
   * 应用所有设置
   */
  applyAllSettings(): void {
    this.applyAutoLaunchSetting();
    this.applyThemeSettings();
  }

  // ==================== 工具方法 ====================

  /**
   * 检查是否为开发环境
   */
  private isDevelopmentEnvironment(): boolean {
    return process.env.NODE_ENV === 'development';
  }
}

// 单例模式导出
export const preferencesManager = new PreferencesManager();
