/**
 * 全局快捷键管理器
 * 负责注册和管理全局快捷键，包括显示界面和插入数据的快捷键
 */

import { globalShortcut, BrowserWindow, app, dialog } from 'electron';
import { ipcMain } from 'electron';
import { preferencesManager } from './preferences-manager';

export class ShortcutManager {
  private static instance: ShortcutManager;
  private registeredShortcuts: Set<string> = new Set();
  private mainWindow: BrowserWindow | null = null;
  private isInitialized = false;

  static getInstance(): ShortcutManager {
    if (!ShortcutManager.instance) {
      ShortcutManager.instance = new ShortcutManager();
    }
    return ShortcutManager.instance;
  }

  /**
   * 设置主窗口引用
   */
  setMainWindow(window: BrowserWindow) {
    this.mainWindow = window;
  }

  /**
   * 初始化快捷键管理器
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('快捷键管理器已经初始化');
      return;
    }

    console.log('开始初始化快捷键管理器...');
    
    // 注册用户配置的快捷键（不检查权限，让应用正常启动）
    await this.registerUserShortcuts();
    
    this.isInitialized = true;
    console.log('快捷键管理器初始化完成');
  }

  /**
   * 检查权限并尝试注册快捷键
   * 这个方法应该在用户访问快捷键设置页面时调用
   */
  async checkPermissionsAndRegister(): Promise<{ hasPermission: boolean; message?: string }> {
    if (process.platform !== 'darwin') {
      return { hasPermission: true };
    }

    console.log('检查 macOS 辅助功能权限...');
    
    try {
      // 尝试注册一个测试快捷键来检查权限
      const testAccelerator = 'Cmd+Shift+T';
      const success = globalShortcut.register(testAccelerator, () => {});
      
      if (success) {
        globalShortcut.unregister(testAccelerator);
        console.log('辅助功能权限检查通过');
        return { hasPermission: true };
      } else {
        console.log('需要辅助功能权限来使用全局快捷键');
        return { 
          hasPermission: false, 
          message: 'AI-Gist 需要辅助功能权限来使用全局快捷键。请在系统偏好设置 > 安全性与隐私 > 隐私 > 辅助功能中启用 AI-Gist。' 
        };
      }
    } catch (error) {
      console.error('检查辅助功能权限时发生错误:', error);
      return { 
        hasPermission: false, 
        message: '检查辅助功能权限时发生错误，请手动在系统偏好设置中启用 AI-Gist。' 
      };
    }
  }



  /**
   * 转换快捷键格式为 Electron 支持的格式
   */
  private convertShortcutFormat(shortcut: string): string {
    // 将用户友好的格式转换为 Electron 支持的格式
    let converted = shortcut;
    
    // 替换平台特定的修饰键
    if (process.platform === 'darwin') {
      // macOS: Ctrl -> Cmd, Meta -> Cmd
      converted = converted.replace(/Ctrl\+/g, 'Cmd+');
      converted = converted.replace(/Meta\+/g, 'Cmd+');
    } else {
      // Windows/Linux: Meta -> Ctrl
      converted = converted.replace(/Meta\+/g, 'Ctrl+');
    }
    
    // 处理 CommandOrControl 格式
    converted = converted.replace(/CommandOrControl\+/g, process.platform === 'darwin' ? 'Cmd+' : 'Ctrl+');
    
    return converted;
  }

  /**
   * 注册用户配置的快捷键
   */
  async registerUserShortcuts(): Promise<void> {
    // 先注销所有现有快捷键
    this.unregisterAllShortcuts();

    const userPrefs = preferencesManager.getPreferences();
    const shortcuts = userPrefs.shortcuts;

    if (!shortcuts) {
      console.log('没有找到快捷键配置，使用默认配置');
      this.registerDefaultShortcuts();
      return;
    }

    console.log('开始注册用户配置的快捷键...');

    // 注册显示界面快捷键
    if (shortcuts.showInterface?.enabled) {
      const accelerator = this.convertShortcutFormat(shortcuts.showInterface.key);
      const success = this.registerShortcut(accelerator, () => {
        console.log('快捷键触发：切换界面显示');
        this.toggleMainWindow();
      });
      console.log(`显示界面快捷键注册结果: ${success ? '成功' : '失败'} (${accelerator})`);
    }

    // 注册插入数据快捷键
    if (shortcuts.insertData?.enabled) {
      const accelerator = this.convertShortcutFormat(shortcuts.insertData.key);
      const success = this.registerShortcut(accelerator, () => {
        console.log('快捷键触发：插入数据');
        this.insertData();
      });
      console.log(`插入数据快捷键注册结果: ${success ? '成功' : '失败'} (${accelerator})`);
    }

    // 注册提示词触发器快捷键
    if (shortcuts.promptTriggers) {
      for (const trigger of shortcuts.promptTriggers) {
        if (trigger.enabled) {
          const accelerator = this.convertShortcutFormat(trigger.key);
          const success = this.registerShortcut(accelerator, () => {
            console.log(`快捷键触发：提示词触发器 ${trigger.promptId}`);
            this.triggerPrompt(trigger.promptId);
          });
          console.log(`提示词触发器快捷键注册结果: ${success ? '成功' : '失败'} (${accelerator})`);
        }
      }
    }
  }

  /**
   * 注册默认快捷键
   */
  registerDefaultShortcuts(): void {
    console.log('注册默认快捷键...');
    
    // 注册显示界面的快捷键
    const showInterfaceAccelerator = process.platform === 'darwin' ? 'Cmd+Shift+G' : 'Ctrl+Shift+G';
    const showInterfaceSuccess = this.registerShortcut(showInterfaceAccelerator, () => {
      console.log('快捷键触发：切换界面显示');
      this.toggleMainWindow();
    });

    // 注册插入数据的快捷键
    const insertDataAccelerator = process.platform === 'darwin' ? 'Cmd+Shift+I' : 'Ctrl+Shift+I';
    const insertDataSuccess = this.registerShortcut(insertDataAccelerator, () => {
      console.log('快捷键触发：插入数据');
      this.insertData();
    });

    console.log(`默认快捷键注册结果：显示界面=${showInterfaceSuccess} (${showInterfaceAccelerator}), 插入数据=${insertDataSuccess} (${insertDataAccelerator})`);
  }

  /**
   * 注册单个快捷键
   */
  private registerShortcut(accelerator: string, callback: () => void): boolean {
    if (this.registeredShortcuts.has(accelerator)) {
      console.log(`快捷键 ${accelerator} 已经注册`);
      return false;
    }

    try {
      const success = globalShortcut.register(accelerator, callback);
      if (success) {
        this.registeredShortcuts.add(accelerator);
        console.log(`快捷键 ${accelerator} 注册成功`);
      } else {
        console.error(`快捷键 ${accelerator} 注册失败 - 可能被其他应用占用`);
      }
      return success;
    } catch (error) {
      console.error(`注册快捷键 ${accelerator} 时发生错误:`, error);
      return false;
    }
  }

  /**
   * 切换主窗口显示/隐藏状态
   */
  private toggleMainWindow(): void {
    if (!this.mainWindow) {
      const windows = BrowserWindow.getAllWindows();
      this.mainWindow = windows.find(win => !win.isDestroyed()) || null;
    }
    
    if (this.mainWindow) {
      if (this.mainWindow.isVisible()) {
        console.log('隐藏主窗口');
        this.mainWindow.hide();
      } else {
        console.log('显示主窗口');
        if (this.mainWindow.isMinimized()) {
          this.mainWindow.restore();
        }
        this.mainWindow.show();
        this.mainWindow.focus();
        
        // 在 macOS 下，确保应用出现在前台
        if (process.platform === 'darwin') {
          app.focus({ steal: true });
        }
      }
    } else {
      console.error('找不到主窗口');
    }
  }

  /**
   * 插入数据
   */
  private async insertData(): Promise<void> {
    if (!this.mainWindow) {
      const windows = BrowserWindow.getAllWindows();
      this.mainWindow = windows.find(win => !win.isDestroyed()) || null;
    }
    
    if (this.mainWindow) {
      console.log('发送插入数据事件');
      
      // 获取用户设置的提示词ID
      const userPrefs = preferencesManager.getPreferences();
      const selectedPromptId = userPrefs.shortcuts?.insertData?.selectedPromptId;
      
      this.mainWindow.webContents.send('shortcut:insert-data', selectedPromptId);
      
      // 确保窗口可见
      if (!this.mainWindow.isVisible()) {
        this.mainWindow.show();
        this.mainWindow.focus();
      }
    } else {
      console.error('找不到主窗口，无法发送插入数据事件');
    }
  }

  /**
   * 触发提示词
   */
  private triggerPrompt(promptId?: number): void {
    if (!this.mainWindow) {
      const windows = BrowserWindow.getAllWindows();
      this.mainWindow = windows.find(win => !win.isDestroyed()) || null;
    }
    
    if (this.mainWindow && promptId) {
      console.log(`发送提示词触发器事件: ${promptId}`);
      this.mainWindow.webContents.send('shortcut:trigger-prompt', promptId);
    } else {
      console.error('找不到主窗口或提示词ID，无法发送提示词触发器事件');
    }
  }

  /**
   * 注销所有快捷键
   */
  unregisterAllShortcuts(): void {
    globalShortcut.unregisterAll();
    this.registeredShortcuts.clear();
    console.log('所有快捷键已注销');
  }

  /**
   * 检查快捷键是否已注册
   */
  isRegistered(accelerator: string): boolean {
    return this.registeredShortcuts.has(accelerator);
  }

  /**
   * 获取已注册的快捷键列表
   */
  getRegisteredShortcuts(): string[] {
    return Array.from(this.registeredShortcuts);
  }

  /**
   * 检查快捷键是否可用
   */
  isShortcutAvailable(accelerator: string): boolean {
    return !globalShortcut.isRegistered(accelerator);
  }

  /**
   * 重新注册快捷键（当用户设置更改时调用）
   */
  async reregisterShortcuts(): Promise<void> {
    console.log('重新注册快捷键...');
    await this.registerUserShortcuts();
  }
} 