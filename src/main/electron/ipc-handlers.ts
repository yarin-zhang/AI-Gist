import { ipcMain } from 'electron';
import { appRouter } from '../views/index';
import { preferencesManager } from './preferences-manager';
import { windowManager } from './window-manager';
import { UserPreferences } from './types';

/**
 * IPC 处理器管理器
 */
class IpcHandlers {
  /**
   * 初始化所有 IPC 处理器
   */
  initialize() {
    this.setupMessageHandler();
    this.setupTrpcHandler();
    this.setupPreferencesHandlers();
    this.setupWindowHandlers();
  }

  /**
   * 设置简单消息处理器
   */
  private setupMessageHandler() {
    ipcMain.on('message', (event, message) => {
      console.log('收到渲染进程消息:', message);
    });
  }

  /**
   * 设置 tRPC 处理器
   */
  private setupTrpcHandler() {
    ipcMain.handle('trpc', async (_, input: { path: string; input?: any; type: 'query' | 'mutation' }) => {
      try {
        console.log('tRPC 调用:', input);
        
        // 解析 tRPC 路径 (格式: "router.procedure")
        const pathParts = input.path.split('.');
        
        if (pathParts.length !== 2) {
          throw new Error(`无效的 tRPC 路径: ${input.path}。期望格式: "router.procedure"`);
        }
        
        const [routerName, procedureName] = pathParts;
        
        // 创建 tRPC 调用器
        const caller = appRouter.createCaller({});
        
        // 动态访问路由器和过程
        const router = (caller as any)[routerName];
        if (!router) {
          throw new Error(`未知的路由器: ${routerName}`);
        }
        
        const procedure = router[procedureName];
        if (!procedure) {
          throw new Error(`未知的过程: ${procedureName} 在 ${routerName} 路由器中`);
        }
        
        // 调用过程并返回结果
        const result = await procedure(input.input);
        
        console.log('tRPC 结果:', result);
        return result;
        
      } catch (error) {
        console.error('tRPC 调用失败:', error);
        
        // 处理 tRPC 特定错误，提供更友好的错误信息
        if (error && typeof error === 'object' && 'code' in error) {
          const trpcError = error as any;
          if (trpcError.code === 'BAD_REQUEST' && trpcError.cause) {
            // 这是输入验证错误
            const validationErrors = trpcError.cause.errors || trpcError.cause.issues || [];
            const errorMessages = validationErrors.map((err: any) => {
              const field = err.path ? err.path.join('.') : 'unknown';
              return `${field}: ${err.message}`;
            }).join('; ');
            
            throw new Error(`输入验证失败: ${errorMessages}`);
          }
        }
        
        throw error;
      }
    });
  }

  /**
   * 设置用户偏好设置处理器
   */
  private setupPreferencesHandlers() {
    // 获取用户偏好设置
    ipcMain.handle('get-user-preferences', (): UserPreferences => {
      return preferencesManager.getPreferences();
    });

    // 设置用户偏好
    ipcMain.handle('set-user-preferences', (_, newPrefs: Partial<UserPreferences>): UserPreferences => {
      return preferencesManager.updatePreferences(newPrefs);
    });
  }

  /**
   * 设置窗口管理处理器
   */
  private setupWindowHandlers() {
    // 显示主窗口
    ipcMain.handle('show-window', () => {
      windowManager.showMainWindow();
    });

    // 隐藏窗口到托盘
    ipcMain.handle('hide-to-tray', () => {
      windowManager.hideMainWindow();
    });
  }

  /**
   * 清理所有处理器
   */
  cleanup() {
    ipcMain.removeAllListeners('message');
    ipcMain.removeHandler('trpc');
    ipcMain.removeHandler('get-user-preferences');
    ipcMain.removeHandler('set-user-preferences');
    ipcMain.removeHandler('show-window');
    ipcMain.removeHandler('hide-to-tray');
  }
}

// 单例模式
export const ipcHandlers = new IpcHandlers();
