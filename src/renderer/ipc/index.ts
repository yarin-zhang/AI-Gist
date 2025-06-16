/**
 * IPC 模块入口文件
 * 统一导出所有 IPC 相关的类和工具
 */

// 工具类
export { IpcUtils, ipcInvoke } from './ipc-utils';

// 处理器类
export { DatabaseIpcHandler } from './database-ipc-handler';
export { ElectronAppIpcHandler } from './electron-app-ipc-handler';

// 类型定义
export * from '../../shared/types/ipc.types';
export * from '../../shared/types/database.types';

// 导入处理器类以创建单例实例
import { DatabaseIpcHandler } from './database-ipc-handler';
import { ElectronAppIpcHandler } from './electron-app-ipc-handler';

// 便捷的单例实例
export const databaseIpcHandler = DatabaseIpcHandler.getInstance();
export const electronAppIpcHandler = ElectronAppIpcHandler.getInstance();
