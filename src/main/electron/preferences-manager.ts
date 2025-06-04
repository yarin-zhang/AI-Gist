import { UserPreferences } from './types';

/**
 * 用户偏好设置管理器
 */
class PreferencesManager {
  private userPrefs: UserPreferences = {
    dontShowCloseDialog: false,
    closeAction: 'quit'
  };

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
    this.userPrefs = { ...this.userPrefs, ...newPrefs };
    return this.getPreferences();
  }

  /**
   * 重置偏好设置为默认值
   */
  resetPreferences(): UserPreferences {
    this.userPrefs = {
      dontShowCloseDialog: false,
      closeAction: 'quit'
    };
    return this.getPreferences();
  }
}

// 单例模式
export const preferencesManager = new PreferencesManager();
