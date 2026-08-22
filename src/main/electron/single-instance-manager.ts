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
    CLI_AUTO_LAUNCH_PROBE: '检测到本地 CLI 的自动拉起探测，应用已在运行，静默忽略（不弹窗、不抢占窗口焦点）',
    COMMAND_LINE: '命令行参数:',
    WORKING_DIR: '工作目录:',
    WINDOW_STATUS: '主窗口状态:',
    WINDOW_EXISTS: '存在',
    WINDOW_NOT_EXISTS: '不存在'
  }
} as const;

/**
 * bin/lib/bridge-client.js 的 tryAutoLaunchOnMac() 在通过 `open -a "AI Gist" --args ...`
 * 拉起/唤醒应用时会带上这个命令行标记。如果应用其实已经在运行（例如常驻托盘），
 * `open -a` 会短暂拉起一个新的 Electron 进程，这个新进程会在 requestSingleInstanceLock()
 * 时输给已经在运行的实例，并把自己的命令行参数通过 'second-instance' 事件转交过来——
 * 也就是这里的 handleSecondInstance()。带着这个标记说明这次触发只是 CLI 想确认应用是否
 * 在跑的一次探测性拉起，而不是用户手动又打开了一次应用，因此不应该弹出"已在运行"的
 * 对话框（这个对话框和 CLI 本身要执行的操作毫无关系，只会让用户困惑，这正是
 * Gitea issue #149 里"再次打开时就会报错"的根因之一）。必须和
 * bin/lib/bridge-client.js 里的 AUTO_LAUNCH_MARKER 保持完全一致（两边运行时环境不同，
 * 无法共享同一个 import，只能约定字面量一致）。
 */
const CLI_AUTO_LAUNCH_MARKER = '--ai-gist-cli-autolaunch';

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

      if (isDevelopment) {
        console.log(CONSTANTS.LOG_MESSAGES.DEV_DUPLICATE);
      }

      // 静默优雅退出。已运行实例会收到 second-instance 事件，
      // 由它负责弹出提示并聚焦现有窗口（见 handleSecondInstance）。
      // 这里不能用 process.exit()：此时 Chromium 尚未初始化完成，
      // 硬退出会触发 SIGTRAP，让 macOS 记录崩溃报告并弹出
      // "AI Gist quit unexpectedly" 对话框。
      app.quit();
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

    // 本地 CLI 的自动拉起探测：应用已经在运行（否则根本不会走到 second-instance），
    // 用户此时只是在跑一条 CLI 命令，不是想再打开一个应用窗口。直接静默返回，
    // 既不弹出"已在运行"对话框，也不强制显示/聚焦主窗口（例如用户特意把窗口
    // 常驻在托盘里，CLI 命令不应该把它弹出来）。
    if (commandLine.includes(CLI_AUTO_LAUNCH_MARKER)) {
      console.log(CONSTANTS.LOG_MESSAGES.CLI_AUTO_LAUNCH_PROBE);
      return;
    }

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
