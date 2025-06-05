import { app, dialog } from 'electron';
import { windowManager } from './window-manager';

class SingleInstanceManager {
  private isQuitting = false;

  /**
   * 初始化单实例管理器
   * 检查是否已有实例运行，如果有则退出当前实例
   */
  public initialize(): void {
    console.log('正在初始化单实例管理器...');
    console.log('当前环境:', process.env.NODE_ENV);
    
    // 在开发环境下，由于热重载可能导致误判，稍微放宽检查
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    const gotTheLock = app.requestSingleInstanceLock();
    console.log('单实例锁定结果:', gotTheLock);

    if (!gotTheLock) {
      // 如果没有获得锁，说明已经有实例在运行
      console.log('应用已在运行，退出当前实例');
      
      if (!isDevelopment) {
        // 生产环境下显示提示对话框
        dialog.showErrorBox(
          'AI-Gist 已在运行', 
          'AI-Gist 程序已经在运行了！\n\n请在任务栏或系统托盘中找到 AI-Gist 图标。'
        );
      } else {
        console.log('开发环境：检测到重复实例');
      }
      
      // 强制退出
      process.exit(0);
    } else {
      console.log('获得单实例锁定，继续启动应用');
      // 监听第二个实例启动事件
      app.on('second-instance', this.handleSecondInstance.bind(this));
    }
  }

  /**
   * 处理第二个实例启动事件
   */
  private handleSecondInstance(event: Electron.Event, commandLine: string[], workingDirectory: string): void {
    console.log('检测到第二个实例尝试启动，显示现有窗口');
    console.log('命令行参数:', commandLine);
    console.log('工作目录:', workingDirectory);
    
    // 显示提示对话框
    const mainWindow = windowManager.getMainWindow();
    console.log('主窗口状态:', mainWindow ? '存在' : '不存在');
    
    if (mainWindow) {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'AI-Gist 已在运行',
        message: 'AI-Gist 程序已经在运行了！',
        detail: '不能同时打开多个 AI-Gist 程序。现有窗口已被打开。',
        buttons: ['知道了']
      });
    } else {
      // 如果主窗口不存在，显示系统级对话框
      dialog.showErrorBox(
        'AI-Gist 已在运行', 
        'AI-Gist 程序已经在运行了！\n\n请在任务栏或系统托盘中找到 AI-Gist 图标。'
      );
    }
    
    // 聚焦并显示现有窗口
    windowManager.showMainWindow();
  }

  /**
   * 设置应用退出状态
   */
  public setQuitting(quitting: boolean): void {
    this.isQuitting = quitting;
  }

  /**
   * 获取应用退出状态
   */
  public isAppQuitting(): boolean {
    return this.isQuitting;
  }

  /**
   * 清理资源
   */
  public cleanup(): void {
    // 当前没有需要清理的资源，保留此方法以备将来使用
  }
}

// 导出单例实例
export const singleInstanceManager = new SingleInstanceManager();
