// 标准库导入
import { app, dialog } from 'electron';

// 本地模块导入
import { windowManager } from './window-manager';

/**
 * 常量定义
 */
const CONSTANTS = {
  DIALOG_MESSAGES: {
    TITLE: 'AI-Gist 已在运行',
    MESSAGE: 'AI-Gist 程序已经在运行了！',
    DETAIL: '不能同时打开多个 AI-Gist 程序。现有窗口已被打开。',
    SYSTEM_MESSAGE: 'AI-Gist 程序已经在运行了！\n\n请在任务栏或系统托盘中找到 AI-Gist 图标。'
  },
  BUTTONS: {
    OK: '知道了'
  },
  LOG_MESSAGES: {
    INIT_START: '正在初始化单实例管理器...',
    ENVIRONMENT: '当前环境:',
    LOCK_RESULT: '单实例锁定结果:',
    APP_RUNNING: '应用已在运行，退出当前实例',
    DEV_DUPLICATE: '开发环境：检测到重复实例',
    LOCK_ACQUIRED: '获得单实例锁定，继续启动应用',
    SECOND_INSTANCE: '检测到第二个实例尝试启动，显示现有窗口',
    COMMAND_LINE: '命令行参数:',
    WORKING_DIR: '工作目录:',
    WINDOW_STATUS: '主窗口状态:',
    WINDOW_EXISTS: '存在',
    WINDOW_NOT_EXISTS: '不存在'
  }
} as const;

/**
 * 单实例管理器
 * 负责确保应用程序只运行一个实例，处理重复启动的情况
 */
class SingleInstanceManager {
  // ==================== 私有属性 ====================
  private isQuitting = false;

  // ==================== 初始化和事件处理 ====================

  /**
   * 初始化单实例管理器
   * 检查是否已有实例运行，如果有则退出当前实例
   */
  public initialize(): void {
    console.log(CONSTANTS.LOG_MESSAGES.INIT_START);
    console.log(CONSTANTS.LOG_MESSAGES.ENVIRONMENT, process.env.NODE_ENV);
    
    // 在开发环境下，由于热重载可能导致误判，稍微放宽检查
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    const gotTheLock = app.requestSingleInstanceLock();
    console.log(CONSTANTS.LOG_MESSAGES.LOCK_RESULT, gotTheLock);

    if (!gotTheLock) {
      // 如果没有获得锁，说明已经有实例在运行
      console.log(CONSTANTS.LOG_MESSAGES.APP_RUNNING);
      
      if (!isDevelopment) {
        // 生产环境下显示提示对话框
        this.showSystemErrorDialog();
      } else {
        console.log(CONSTANTS.LOG_MESSAGES.DEV_DUPLICATE);
      }
      
      // 强制退出
      process.exit(0);
    } else {
      console.log(CONSTANTS.LOG_MESSAGES.LOCK_ACQUIRED);
      // 监听第二个实例启动事件
      app.on('second-instance', this.handleSecondInstance.bind(this));
    }
  }

  /**
   * 处理第二个实例启动事件
   * @param event 事件对象
   * @param commandLine 命令行参数
   * @param workingDirectory 工作目录
   */
  private handleSecondInstance(event: Electron.Event, commandLine: string[], workingDirectory: string): void {
    console.log(CONSTANTS.LOG_MESSAGES.SECOND_INSTANCE);
    console.log(CONSTANTS.LOG_MESSAGES.COMMAND_LINE, commandLine);
    console.log(CONSTANTS.LOG_MESSAGES.WORKING_DIR, workingDirectory);
    
    // 显示提示对话框
    const mainWindow = windowManager.getMainWindow();
    console.log(CONSTANTS.LOG_MESSAGES.WINDOW_STATUS, mainWindow ? CONSTANTS.LOG_MESSAGES.WINDOW_EXISTS : CONSTANTS.LOG_MESSAGES.WINDOW_NOT_EXISTS);
    
    if (mainWindow) {
      this.showWindowDialog(mainWindow);
    } else {
      // 如果主窗口不存在，显示系统级对话框
      this.showSystemErrorDialog();
    }
    
    // 聚焦并显示现有窗口
    windowManager.showMainWindow();
  }

  // ==================== 对话框显示 ====================

  /**
   * 显示窗口级对话框
   * @param mainWindow 主窗口实例
   */
  private showWindowDialog(mainWindow: Electron.BrowserWindow): void {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: CONSTANTS.DIALOG_MESSAGES.TITLE,
      message: CONSTANTS.DIALOG_MESSAGES.MESSAGE,
      detail: CONSTANTS.DIALOG_MESSAGES.DETAIL,
      buttons: [CONSTANTS.BUTTONS.OK]
    });
  }

  /**
   * 显示系统级错误对话框
   */
  private showSystemErrorDialog(): void {
    dialog.showErrorBox(
      CONSTANTS.DIALOG_MESSAGES.TITLE, 
      CONSTANTS.DIALOG_MESSAGES.SYSTEM_MESSAGE
    );
  }

  // ==================== 状态管理 ====================

  /**
   * 设置应用退出状态
   * @param quitting 是否正在退出
   */
  public setQuitting(quitting: boolean): void {
    this.isQuitting = quitting;
  }

  /**
   * 获取应用退出状态
   * @returns 是否正在退出
   */
  public isAppQuitting(): boolean {
    return this.isQuitting;
  }

  // ==================== 资源清理 ====================

  /**
   * 清理资源
   */
  public cleanup(): void {
    // 当前没有需要清理的资源，保留此方法以备将来使用
  }
}

// 导出单例实例
export const singleInstanceManager = new SingleInstanceManager();
