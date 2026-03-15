/**
 * 平台检测模块
 * 用于检测当前运行环境（Electron/iOS/Android/Web）
 */

export type Platform = 'electron' | 'ios' | 'android' | 'web';

export class PlatformDetector {
  private static _platform: Platform | null = null;

  /**
   * 获取当前平台
   */
  static getPlatform(): Platform {
    if (this._platform) {
      return this._platform;
    }

    // 检测 Electron 环境
    if (typeof window !== 'undefined' && (window as any).electronAPI) {
      this._platform = 'electron';
      return this._platform;
    }

    // 检测 Capacitor 环境
    if (typeof window !== 'undefined' && (window as any).Capacitor) {
      const capacitor = (window as any).Capacitor;
      if (capacitor.getPlatform) {
        const platform = capacitor.getPlatform();
        if (platform === 'ios') {
          this._platform = 'ios';
        } else if (platform === 'android') {
          this._platform = 'android';
        } else {
          this._platform = 'web';
        }
        return this._platform;
      }
    }

    // 默认为 Web 环境
    this._platform = 'web';
    return this._platform;
  }

  /**
   * 是否为 Electron 环境
   */
  static isElectron(): boolean {
    return this.getPlatform() === 'electron';
  }

  /**
   * 是否为移动端环境
   */
  static isMobile(): boolean {
    const platform = this.getPlatform();
    return platform === 'ios' || platform === 'android';
  }

  /**
   * 是否为 iOS 环境
   */
  static isIOS(): boolean {
    return this.getPlatform() === 'ios';
  }

  /**
   * 是否为 Android 环境
   */
  static isAndroid(): boolean {
    return this.getPlatform() === 'android';
  }

  /**
   * 是否为 Web 环境
   */
  static isWeb(): boolean {
    return this.getPlatform() === 'web';
  }

  /**
   * 是否为桌面端环境
   */
  static isDesktop(): boolean {
    return this.isElectron();
  }
}
