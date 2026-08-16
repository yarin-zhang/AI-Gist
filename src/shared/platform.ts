/**
 * 平台检测模块
 * 用于检测当前运行环境（Electron/iOS/Android/Web）
 */

export type Platform = 'electron' | 'ios' | 'android' | 'web';
export type RuntimeShell = 'desktop' | 'mobile';
export type BuildPlatform = 'electron' | 'mobile' | 'web' | 'unknown';

export interface PlatformCapabilities {
  desktopShell: boolean;
  mobileShell: boolean;
  localDatabase: boolean;
  preferences: boolean;
  fileImport: boolean;
  fileExport: boolean;
  localBackupDirectory: boolean;
  externalLinks: boolean;
  globalShortcuts: boolean;
  tray: boolean;
  startup: boolean;
  systemProxy: boolean;
  electronUpdates: boolean;
  cloudBackup: boolean;
  webdavSync: boolean;
  icloud: boolean;
  aiGeneration: boolean;
  aiProxy: boolean;
  nativeAI: boolean;
  webBackend: boolean;
}

declare const __APP_PLATFORM__: BuildPlatform | undefined;
declare const __PLATFORM__: BuildPlatform | undefined;

export class PlatformDetector {
  private static _platform: Platform | null = null;

  /**
   * 获取当前平台
   */
  static getPlatform(): Platform {
    if (this._platform) {
      return this._platform;
    }

    const buildPlatform = this.getBuildPlatform();
    if (buildPlatform === 'web') {
      this._platform = 'web';
      return this._platform;
    }

    // 检测 Electron 环境
    if (
      (buildPlatform === 'electron' || buildPlatform === 'unknown') &&
      typeof window !== 'undefined' &&
      (window as any).electronAPI
    ) {
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

  static getBuildPlatform(): BuildPlatform {
    if (typeof __APP_PLATFORM__ !== 'undefined') {
      return __APP_PLATFORM__;
    }

    if (typeof __PLATFORM__ !== 'undefined') {
      return __PLATFORM__;
    }

    return 'unknown';
  }

  static getShell(): RuntimeShell {
    if (this.getBuildPlatform() === 'mobile') {
      return 'mobile';
    }

    const platform = this.getPlatform();
    if (platform === 'ios' || platform === 'android') {
      return 'mobile';
    }

    if (platform === 'web' && this.isWebMobileShell()) {
      return 'mobile';
    }

    return 'desktop';
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

  static isDesktopShell(): boolean {
    return this.getShell() === 'desktop';
  }

  static isMobileShell(): boolean {
    return this.getShell() === 'mobile';
  }

  private static isWebMobileShell(): boolean {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      return false;
    }

    const userAgent = navigator.userAgent || '';
    const isMobileUserAgent = /Android|iPhone|iPad|iPod|Mobile|IEMobile|BlackBerry|Opera Mini/i.test(userAgent);
    const isIPadDesktopMode = /Macintosh/i.test(userAgent) && (navigator.maxTouchPoints || 0) > 1;

    if (isMobileUserAgent || isIPadDesktopMode) {
      return true;
    }

    const isSmallViewport = typeof window.matchMedia === 'function'
      ? window.matchMedia('(max-width: 768px)').matches
      : window.innerWidth <= 768;
    const hasCoarsePointer = typeof window.matchMedia === 'function'
      ? window.matchMedia('(pointer: coarse)').matches || window.matchMedia('(hover: none)').matches
      : false;

    return isSmallViewport && hasCoarsePointer;
  }

  static getCapabilities(): PlatformCapabilities {
    const platform = this.getPlatform();

    if (platform === 'electron') {
      const isMacAppStore = typeof window !== 'undefined'
        && window.electronAPI?.app?.isMacAppStore === true;

      return {
        desktopShell: true,
        mobileShell: false,
        localDatabase: true,
        preferences: true,
        fileImport: true,
        fileExport: true,
        localBackupDirectory: true,
        externalLinks: true,
        globalShortcuts: true,
        tray: true,
        startup: true,
        systemProxy: true,
        electronUpdates: !isMacAppStore,
        cloudBackup: true,
        webdavSync: true,
        icloud: !isMacAppStore,
        aiGeneration: true,
        aiProxy: false,
        nativeAI: true,
        webBackend: false
      };
    }

    if (platform === 'ios' || platform === 'android') {
      return {
        desktopShell: false,
        mobileShell: true,
        localDatabase: true,
        preferences: true,
        fileImport: true,
        fileExport: true,
        localBackupDirectory: false,
        externalLinks: true,
        globalShortcuts: false,
        tray: false,
        startup: false,
        systemProxy: false,
        electronUpdates: false,
        cloudBackup: true,
        webdavSync: true,
        icloud: platform === 'ios',
        aiGeneration: true,
        aiProxy: false,
        nativeAI: false,
        webBackend: false
      };
    }

    const shell = this.getShell();

    return {
      desktopShell: shell === 'desktop',
      mobileShell: shell === 'mobile',
      localDatabase: true,
      preferences: true,
      fileImport: true,
      fileExport: true,
      localBackupDirectory: false,
      externalLinks: true,
      globalShortcuts: false,
      tray: false,
      startup: false,
      systemProxy: false,
      electronUpdates: false,
      cloudBackup: true,
      webdavSync: true,
      icloud: false,
      aiGeneration: true,
      aiProxy: true,
      nativeAI: false,
      webBackend: true
    };
  }
}
