/**
 * IPC 通信工具类 - 已迁移到上级目录
 * @deprecated 请使用 ../ipc.ts 中的 IpcUtils 类
 * 保留此文件仅为向后兼容
 */

// 重新导出新的 IPC 工具
export { IpcUtils, ipcInvoke } from '../ipc';
export type { IpcResult, IpcInvokeOptions } from '../../../shared/types';

// 兼容性警告
console.warn('utils/ipc.utils.ts is deprecated, please use ../ipc.ts instead');
