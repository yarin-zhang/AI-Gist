import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { UserPreferences } from './types';

/**
 * 用户偏好设置管理器
 */
class PreferencesManager {
  private userPrefs: UserPreferences;
  private configPath: string;  private readonly defaultPreferences: UserPreferences = {
    closeBehaviorMode: 'ask',
    closeAction: 'quit',
    startMinimized: false,
    autoLaunch: false,
    themeSource: 'system'
  };

  constructor() {
    // 设置配置文件路径
    this.configPath = path.join(app.getPath('userData'), 'user-preferences.json');
    // 初始化偏好设置
    const oldConfigExists = fs.existsSync(this.configPath);
    let oldConfigData = null;
    
    if (oldConfigExists) {
      try {
        oldConfigData = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
      } catch (error) {
        console.error('读取旧配置失败:', error);
      }
    }
    
    this.userPrefs = this.loadPreferences();
    
    // 如果配置发生了变化或首次运行，保存清理后的配置
    if (!oldConfigExists || (oldConfigData && JSON.stringify(oldConfigData) !== JSON.stringify(this.userPrefs))) {
      this.savePreferences();
      console.log('配置已更新并保存');
    }
    
    console.log('用户偏好设置已加载:', this.userPrefs);
  }
  /**
   * 从文件加载偏好设置
   */
  private loadPreferences(): UserPreferences {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf8');
        const loadedPrefs = JSON.parse(data);
        
        // 合并默认值，确保新增的字段有默认值，并清理已删除的字段
        const cleanedPrefs: UserPreferences = {
          closeBehaviorMode: loadedPrefs.closeBehaviorMode ?? this.defaultPreferences.closeBehaviorMode,
          closeAction: loadedPrefs.closeAction ?? this.defaultPreferences.closeAction,
          startMinimized: loadedPrefs.startMinimized ?? this.defaultPreferences.startMinimized,
          autoLaunch: loadedPrefs.autoLaunch ?? this.defaultPreferences.autoLaunch,
          themeSource: loadedPrefs.themeSource ?? this.defaultPreferences.themeSource
        };
        
        // 如果配置发生了变化（比如删除了字段），重新保存清理后的配置
        if (JSON.stringify(loadedPrefs) !== JSON.stringify(cleanedPrefs)) {
          console.log('检测到配置格式变化，正在清理...');
          return cleanedPrefs;
        }
        
        return cleanedPrefs;
      }
    } catch (error) {
      console.error('加载用户偏好设置失败:', error);
    }
    
    // 如果加载失败或文件不存在，返回默认设置
    return { ...this.defaultPreferences };
  }

  /**
   * 保存偏好设置到文件
   */
  private savePreferences(): void {
    try {
      // 确保目录存在
      const configDir = path.dirname(this.configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      
      // 保存到文件
      fs.writeFileSync(this.configPath, JSON.stringify(this.userPrefs, null, 2), 'utf8');
      console.log('用户偏好设置已保存:', this.configPath);
    } catch (error) {
      console.error('保存用户偏好设置失败:', error);
    }
  }

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
    this.userPrefs = { ...this.userPrefs, ...newPrefs };
    this.savePreferences(); // 立即保存到文件
    
    // 如果自启动设置发生变化，立即应用
    if (newPrefs.autoLaunch !== undefined && newPrefs.autoLaunch !== oldAutoLaunch) {
      this.applyAutoLaunchSetting();
    }
    
    console.log('偏好设置已更新:', newPrefs);
    return this.getPreferences();
  }

  /**
   * 重置偏好设置为默认值
   */
  resetPreferences(): UserPreferences {
    this.userPrefs = { ...this.defaultPreferences };
    this.savePreferences(); // 保存重置后的设置
    console.log('偏好设置已重置为默认值');
    return this.getPreferences();
  }

  /**
   * 获取配置文件路径
   */
  getConfigPath(): string {
    return this.configPath;
  }

  /**
   * 应用自启动设置
   */
  applyAutoLaunchSetting(): void {
    try {
      if (this.userPrefs.autoLaunch) {
        // 启用自启动
        app.setLoginItemSettings({
          openAtLogin: true,
          name: app.getName(),
          path: app.getPath('exe')
        });
        console.log('已启用开机自启动');
      } else {
        // 禁用自启动
        app.setLoginItemSettings({
          openAtLogin: false
        });
        console.log('已禁用开机自启动');
      }
    } catch (error) {
      console.error('设置自启动失败:', error);
    }
  }

  /**
   * 获取当前自启动状态
   */
  getAutoLaunchStatus(): boolean {
    try {
      const loginItemSettings = app.getLoginItemSettings();
      return loginItemSettings.openAtLogin;
    } catch (error) {
      console.error('获取自启动状态失败:', error);
      return false;
    }
  }

  /**
   * 应用主题设置
   */
  applyThemeSettings(): void {
    try {
      // 动态导入主题管理器以避免循环依赖
      const { themeManager } = require('./theme-manager');
      themeManager.setThemeSource(this.userPrefs.themeSource);
      console.log(`已应用主题设置: ${this.userPrefs.themeSource}`);
    } catch (error) {
      console.error('应用主题设置失败:', error);
    }
  }

  /**
   * 应用所有设置
   */
  applyAllSettings(): void {
    this.applyAutoLaunchSetting();
    this.applyThemeSettings();
  }
}

// 单例模式
export const preferencesManager = new PreferencesManager();
