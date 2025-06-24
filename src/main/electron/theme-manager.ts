import { nativeTheme, BrowserWindow } from 'electron';
import { SystemTheme } from '@shared/types';

/**
 * 主题变化回调函数类型
 */
export type ThemeChangeCallback = (theme: SystemTheme) => void;

/**
 * 系统主题管理器
 * 负责检测和管理系统主题，提供主题变化监听功能
 */
class ThemeManager {
  private mainWindow: BrowserWindow | null = null;
  private themeChangeCallbacks = new Set<ThemeChangeCallback>();

  /**
   * 初始化主题管理器
   */
  initialize() {
    console.log('初始化主题管理器...');
    
    // 监听系统主题变化
    this.setupThemeListener();
    
    // 输出当前主题信息
    console.log('当前系统主题:', this.getCurrentTheme());
    console.log('系统是否为暗色主题:', this.isDarkTheme());
  }

  /**
   * 设置主窗口引用
   */
  setMainWindow(window: BrowserWindow) {
    this.mainWindow = window;
  }

  /**
   * 获取当前系统主题
   * @returns 当前主题：'light' | 'dark' | 'system'
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
   * @returns 主题来源：'system' | 'override'
   */
  getThemeSource(): string {
    return nativeTheme.themeSource;
  }

  /**
   * 设置主题来源
   * @param source 主题来源：'system' | 'light' | 'dark'
   */
  setThemeSource(source: 'system' | 'light' | 'dark') {
    nativeTheme.themeSource = source;
    console.log('主题来源已设置为:', source);
    
    // 立即更新窗口背景色
    const currentTheme = this.getCurrentTheme();
    this.updateWindowBackgroundColor(currentTheme);
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

  /**
   * 添加主题变化监听器
   * @param callback 主题变化时的回调函数
   */
  addThemeChangeListener(callback: ThemeChangeCallback) {
    this.themeChangeCallbacks.add(callback);
  }

  /**
   * 移除主题变化监听器
   * @param callback 要移除的回调函数
   */
  removeThemeChangeListener(callback: ThemeChangeCallback) {
    this.themeChangeCallbacks.delete(callback);
  }
  /**
   * 设置系统主题监听器
   * 监听系统主题变化并通知所有注册的回调函数
   */
  private setupThemeListener() {
    // 监听系统主题变化事件
    nativeTheme.on('updated', () => {
      const currentTheme = this.getCurrentTheme();
      console.log('系统主题已更新:', currentTheme);
      
      // 更新窗口背景色
      this.updateWindowBackgroundColor(currentTheme);
      
      // 通知所有注册的回调函数
      this.themeChangeCallbacks.forEach(callback => {
        try {
          callback(currentTheme);
        } catch (error) {
          console.error('主题变化回调执行出错:', error);
        }
      });

      // 如果有主窗口，通知渲染进程
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.notifyRendererThemeChange(currentTheme);
      }
    });
  }

  /**
   * 更新窗口背景色
   * @param theme 当前主题
   */
  private updateWindowBackgroundColor(theme: SystemTheme) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      const backgroundColor = theme === 'dark' ? '#101014' : '#ffffff';
      this.mainWindow.setBackgroundColor(backgroundColor);
      console.log(`窗口背景色已更新为: ${backgroundColor}`);
    }
  }

  /**
   * 通知渲染进程主题变化
   * @param theme 当前主题
   */
  private notifyRendererThemeChange(theme: SystemTheme) {
    try {
      this.mainWindow?.webContents.send('theme-changed', {
        theme,
        themeInfo: this.getThemeInfo()
      });
    } catch (error) {
      console.error('通知渲染进程主题变化失败:', error);
    }
  }

  /**
   * 手动触发主题变化通知
   * 用于初始化时通知渲染进程当前主题
   */
  notifyCurrentTheme() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      const currentTheme = this.getCurrentTheme();
      this.notifyRendererThemeChange(currentTheme);
    }
  }

  /**
   * 清理资源
   */
  cleanup() {
    // 移除所有事件监听器
    nativeTheme.removeAllListeners('updated');
    
    // 清空回调函数集合
    this.themeChangeCallbacks.clear();
    
    // 清空窗口引用
    this.mainWindow = null;
    
    console.log('主题管理器已清理');
  }
}

// 单例模式
export const themeManager = new ThemeManager();
