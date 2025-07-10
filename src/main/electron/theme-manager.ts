// 标准库导入
import { nativeTheme, BrowserWindow } from 'electron';

// 本地模块导入
import { SystemTheme } from '@shared/types';

/**
 * 常量定义
 */
const CONSTANTS = {
  THEME_SOURCES: {
    SYSTEM: 'system',
    LIGHT: 'light',
    DARK: 'dark'
  },
  BACKGROUND_COLORS: {
    DARK: '#101014',
    LIGHT: '#ffffff'
  },
  LOG_MESSAGES: {
    INIT_START: '初始化主题管理器...',
    INIT_COMPLETE: '主题管理器初始化完成',
    CLEANUP_COMPLETE: '主题管理器已清理',
    THEME_UPDATED: '系统主题已更新:',
    BACKGROUND_UPDATED: '窗口背景色已更新为:',
    THEME_SOURCE_SET: '主题来源已设置为:',
    RENDERER_NOTIFY_ERROR: '通知渲染进程主题变化失败:',
    CALLBACK_ERROR: '主题变化回调执行出错:'
  }
} as const;

/**
 * 主题变化回调函数类型
 */
export type ThemeChangeCallback = (theme: SystemTheme) => void;

/**
 * 系统主题管理器
 * 负责检测和管理系统主题，提供主题变化监听功能
 */
class ThemeManager {
  // ==================== 私有属性 ====================
  private mainWindow: BrowserWindow | null = null;
  private themeChangeCallbacks = new Set<ThemeChangeCallback>();

  // ==================== 生命周期方法 ====================
  
  /**
   * 初始化主题管理器
   * 设置主题监听器并输出当前主题信息
   */
  initialize(): void {
    console.log(CONSTANTS.LOG_MESSAGES.INIT_START);
    
    this.setupThemeListener();
    
    // 输出当前主题信息
    console.log('当前系统主题:', this.getCurrentTheme());
    console.log('系统是否为暗色主题:', this.isDarkTheme());
    
    console.log(CONSTANTS.LOG_MESSAGES.INIT_COMPLETE);
  }

  /**
   * 清理资源
   * 移除事件监听器并清空回调函数集合
   */
  cleanup(): void {
    // 移除所有事件监听器
    nativeTheme.removeAllListeners('updated');
    
    // 清空回调函数集合
    this.themeChangeCallbacks.clear();
    
    // 清空窗口引用
    this.mainWindow = null;
    
    console.log(CONSTANTS.LOG_MESSAGES.CLEANUP_COMPLETE);
  }

  // ==================== 窗口管理方法 ====================
  
  /**
   * 设置主窗口引用
   * @param window 主窗口实例
   */
  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  // ==================== 主题状态查询方法 ====================
  
  /**
   * 获取当前系统主题
   * @returns 当前主题：'light' | 'dark'
   */
  getCurrentTheme(): SystemTheme {
    if (nativeTheme.shouldUseDarkColors) {
      return 'dark';
    } else if (nativeTheme.shouldUseHighContrastColors) {
      // 高对比度通常基于暗色主题
      return 'dark';
    } else {
      return 'light';
    }
  }

  /**
   * 检查当前是否为暗色主题
   * @returns 是否为暗色主题
   */
  isDarkTheme(): boolean {
    return nativeTheme.shouldUseDarkColors;
  }

  /**
   * 检查当前是否为高对比度主题
   * @returns 是否为高对比度主题
   */
  isHighContrastTheme(): boolean {
    return nativeTheme.shouldUseHighContrastColors;
  }

  /**
   * 获取主题来源
   * @returns 主题来源：'system' | 'light' | 'dark'
   */
  getThemeSource(): string {
    return nativeTheme.themeSource;
  }

  /**
   * 获取详细的主题信息
   * @returns 包含所有主题相关信息的对象
   */
  getThemeInfo() {
    return {
      currentTheme: this.getCurrentTheme(),
      isDarkTheme: this.isDarkTheme(),
      isHighContrastTheme: this.isHighContrastTheme(),
      themeSource: this.getThemeSource(),
      shouldUseDarkColors: nativeTheme.shouldUseDarkColors,
      shouldUseHighContrastColors: nativeTheme.shouldUseHighContrastColors,
      shouldUseInvertedColorScheme: nativeTheme.shouldUseInvertedColorScheme
    };
  }

  // ==================== 主题控制方法 ====================
  
  /**
   * 设置主题来源
   * @param source 主题来源：'system' | 'light' | 'dark'
   */
  setThemeSource(source: 'system' | 'light' | 'dark'): void {
    nativeTheme.themeSource = source;
    console.log(CONSTANTS.LOG_MESSAGES.THEME_SOURCE_SET, source);
    
    // 立即更新窗口背景色
    const currentTheme = this.getCurrentTheme();
    this.updateWindowBackgroundColor(currentTheme);
  }

  // ==================== 事件监听器管理 ====================
  
  /**
   * 添加主题变化监听器
   * @param callback 主题变化时的回调函数
   */
  addThemeChangeListener(callback: ThemeChangeCallback): void {
    this.themeChangeCallbacks.add(callback);
  }

  /**
   * 移除主题变化监听器
   * @param callback 要移除的回调函数
   */
  removeThemeChangeListener(callback: ThemeChangeCallback): void {
    this.themeChangeCallbacks.delete(callback);
  }

  /**
   * 手动触发主题变化通知
   * 用于初始化时通知渲染进程当前主题
   */
  notifyCurrentTheme(): void {
    if (this.isWindowValid()) {
      const currentTheme = this.getCurrentTheme();
      this.notifyRendererThemeChange(currentTheme);
    }
  }

  // ==================== 私有方法 ====================
  
  /**
   * 设置系统主题监听器
   * 监听系统主题变化并通知所有注册的回调函数
   */
  private setupThemeListener(): void {
    nativeTheme.on('updated', () => {
      const currentTheme = this.getCurrentTheme();
      console.log(CONSTANTS.LOG_MESSAGES.THEME_UPDATED, currentTheme);
      
      // 更新窗口背景色
      this.updateWindowBackgroundColor(currentTheme);
      
      // 通知所有注册的回调函数
      this.notifyThemeChangeCallbacks(currentTheme);

      // 通知渲染进程
      if (this.isWindowValid()) {
        this.notifyRendererThemeChange(currentTheme);
      }
    });
  }

  /**
   * 更新窗口背景色
   * @param theme 当前主题
   */
  private updateWindowBackgroundColor(theme: SystemTheme): void {
    if (this.isWindowValid()) {
      const backgroundColor = theme === 'dark' ? CONSTANTS.BACKGROUND_COLORS.DARK : CONSTANTS.BACKGROUND_COLORS.LIGHT;
      this.mainWindow!.setBackgroundColor(backgroundColor);
      console.log(CONSTANTS.LOG_MESSAGES.BACKGROUND_UPDATED, backgroundColor);
    }
  }

  /**
   * 通知渲染进程主题变化
   * @param theme 当前主题
   */
  private notifyRendererThemeChange(theme: SystemTheme): void {
    try {
      this.mainWindow?.webContents.send('theme-changed', {
        theme,
        themeInfo: this.getThemeInfo()
      });
    } catch (error) {
      console.error(CONSTANTS.LOG_MESSAGES.RENDERER_NOTIFY_ERROR, error);
    }
  }

  /**
   * 通知所有主题变化回调函数
   * @param theme 当前主题
   */
  private notifyThemeChangeCallbacks(theme: SystemTheme): void {
    this.themeChangeCallbacks.forEach(callback => {
      try {
        callback(theme);
      } catch (error) {
        console.error(CONSTANTS.LOG_MESSAGES.CALLBACK_ERROR, error);
      }
    });
  }

  /**
   * 检查窗口是否有效
   * @returns 窗口是否有效且未销毁
   */
  private isWindowValid(): boolean {
    return this.mainWindow !== null && !this.mainWindow.isDestroyed();
  }
}

// 单例模式导出
export const themeManager = new ThemeManager();
