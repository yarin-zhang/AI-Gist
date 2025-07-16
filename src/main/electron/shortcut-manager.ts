/**
 * 全局快捷键管理器
 * 负责注册和管理全局快捷键，包括显示界面和插入数据的快捷键
 */

import { globalShortcut, BrowserWindow, app } from 'electron';
import { ipcMain } from 'electron';

export class ShortcutManager {
  private static instance: ShortcutManager;
  private registeredShortcuts: Set<string> = new Set();
  private mainWindow: BrowserWindow | null = null;

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
   * 注册默认快捷键
   */
  registerDefaultShortcuts(): void {
    console.log('开始注册全局快捷键...');
    
    // 检查是否有权限注册全局快捷键
    // 在 macOS 上，全局快捷键需要特殊权限
    if (process.platform === 'darwin') {
      console.log('在 macOS 上注册全局快捷键，可能需要权限');
    }

    // 注册显示界面的快捷键
    const showInterfaceSuccess = this.registerShortcut('CommandOrControl+Shift+G', () => {
      console.log('快捷键触发：显示界面');
      this.showMainWindow();
    });

    // 注册插入数据的快捷键
    const insertDataSuccess = this.registerShortcut('CommandOrControl+Shift+I', () => {
      console.log('快捷键触发：插入数据');
      this.insertData();
    });

    console.log(`快捷键注册结果：显示界面=${showInterfaceSuccess}, 插入数据=${insertDataSuccess}`);
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
   * 显示主窗口
   */
  private showMainWindow(): void {
    if (!this.mainWindow) {
      const windows = BrowserWindow.getAllWindows();
      this.mainWindow = windows.find(win => !win.isDestroyed()) || null;
    }
    
    if (this.mainWindow) {
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
    } else {
      console.error('找不到主窗口');
    }
  }

  /**
   * 插入数据
   */
  private insertData(): void {
    if (!this.mainWindow) {
      const windows = BrowserWindow.getAllWindows();
      this.mainWindow = windows.find(win => !win.isDestroyed()) || null;
    }
    
    if (this.mainWindow) {
      console.log('发送插入数据事件');
      this.mainWindow.webContents.send('shortcut:insert-data');
    } else {
      console.error('找不到主窗口，无法发送插入数据事件');
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
} 