/**
 * 全局快捷键管理器
 * 负责注册和管理全局快捷键，包括显示界面和插入数据的快捷键
 */

import { globalShortcut, BrowserWindow } from 'electron';
import { ipcMain } from 'electron';

export class ShortcutManager {
  private static instance: ShortcutManager;
  private registeredShortcuts: Set<string> = new Set();
  private currentShortcutTrigger: string | null = null;

  static getInstance(): ShortcutManager {
    if (!ShortcutManager.instance) {
      ShortcutManager.instance = new ShortcutManager();
    }
    return ShortcutManager.instance;
  }

  /**
   * 注册默认快捷键
   */
  registerDefaultShortcuts(): void {
    // 注册显示界面的快捷键
    this.registerShortcut('CommandOrControl+Shift+G', () => {
      this.showMainWindow();
    });

    // 注册插入数据的快捷键
    this.registerShortcut('CommandOrControl+Shift+I', () => {
      this.insertData();
    });
  }

  /**
   * 注册单个快捷键
   */
  private registerShortcut(accelerator: string, callback: () => void): boolean {
    if (this.registeredShortcuts.has(accelerator)) {
      console.log(`快捷键 ${accelerator} 已经注册`);
      return false;
    }

    const success = globalShortcut.register(accelerator, callback);
    if (success) {
      this.registeredShortcuts.add(accelerator);
      console.log(`快捷键 ${accelerator} 注册成功`);
    } else {
      console.error(`快捷键 ${accelerator} 注册失败`);
    }
    return success;
  }

  /**
   * 注册快捷键触发器
   * 只注册一个快捷键触发器，避免重复注册
   */
  registerShortcutTrigger(promptId: string, content: string): void {
    // 先取消之前的快捷键触发器
    this.unregisterShortcutTrigger();

    const accelerator = 'CommandOrControl+Shift+P';
    const success = this.registerShortcut(accelerator, () => {
      this.triggerShortcutPrompt(promptId, content);
    });

    if (success) {
      this.currentShortcutTrigger = promptId;
      console.log(`快捷键触发器注册成功: ${promptId}`);
    }
  }

  /**
   * 取消快捷键触发器
   */
  unregisterShortcutTrigger(): void {
    const accelerator = 'CommandOrControl+Shift+P';
    if (this.registeredShortcuts.has(accelerator)) {
      globalShortcut.unregister(accelerator);
      this.registeredShortcuts.delete(accelerator);
      this.currentShortcutTrigger = null;
      console.log('快捷键触发器已取消');
    }
  }

  /**
   * 显示主窗口
   */
  private showMainWindow(): void {
    const windows = BrowserWindow.getAllWindows();
    const mainWindow = windows.find(win => !win.isDestroyed());
    
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.show();
      mainWindow.focus();
    }
  }

  /**
   * 插入数据
   */
  private insertData(): void {
    const windows = BrowserWindow.getAllWindows();
    const mainWindow = windows.find(win => !win.isDestroyed());
    
    if (mainWindow) {
      mainWindow.webContents.send('shortcut:insert-data');
    }
  }

  /**
   * 触发快捷键提示词
   */
  private triggerShortcutPrompt(promptId: string, content: string): void {
    const windows = BrowserWindow.getAllWindows();
    const mainWindow = windows.find(win => !win.isDestroyed());
    
    if (mainWindow) {
      // 显示窗口
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.show();
      mainWindow.focus();
      
      // 发送快捷键触发事件
      mainWindow.webContents.send('shortcut:trigger-prompt', { promptId, content });
    }
  }

  /**
   * 注销所有快捷键
   */
  unregisterAllShortcuts(): void {
    globalShortcut.unregisterAll();
    this.registeredShortcuts.clear();
    this.currentShortcutTrigger = null;
    console.log('所有快捷键已注销');
  }

  /**
   * 检查快捷键是否已注册
   */
  isRegistered(accelerator: string): boolean {
    return this.registeredShortcuts.has(accelerator);
  }

  /**
   * 获取当前快捷键触发器
   */
  getCurrentShortcutTrigger(): string | null {
    return this.currentShortcutTrigger;
  }
} 