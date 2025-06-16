/**
 * IPC 重构测试
 * 验证所有 IPC 相关功能是否正常工作
 */

import { 
  IpcUtils, 
  ipcInvoke,
  DatabaseIpcHandler,
  ElectronAppIpcHandler,
  databaseIpcHandler,
  electronAppIpcHandler
} from '../renderer/ipc';

describe('IPC 重构测试', () => {
  test('IpcUtils 类应该存在', () => {
    expect(IpcUtils).toBeDefined();
    expect(typeof IpcUtils.invoke).toBe('function');
    expect(typeof IpcUtils.safeInvoke).toBe('function');
    expect(typeof IpcUtils.isElectronAvailable).toBe('function');
  });

  test('向后兼容的 ipcInvoke 函数应该存在', () => {
    expect(ipcInvoke).toBeDefined();
    expect(typeof ipcInvoke).toBe('function');
  });

  test('DatabaseIpcHandler 类应该存在', () => {
    expect(DatabaseIpcHandler).toBeDefined();
    expect(typeof DatabaseIpcHandler.getInstance).toBe('function');
  });

  test('ElectronAppIpcHandler 类应该存在', () => {
    expect(ElectronAppIpcHandler).toBeDefined();
    expect(typeof ElectronAppIpcHandler.getInstance).toBe('function');
  });

  test('单例实例应该存在', () => {
    expect(databaseIpcHandler).toBeDefined();
    expect(electronAppIpcHandler).toBeDefined();
  });

  test('单例实例应该是正确的类型', () => {
    expect(databaseIpcHandler).toBeInstanceOf(DatabaseIpcHandler);
    expect(electronAppIpcHandler).toBeInstanceOf(ElectronAppIpcHandler);
  });

  test('单例实例应该是同一个对象', () => {
    const handler1 = DatabaseIpcHandler.getInstance();
    const handler2 = DatabaseIpcHandler.getInstance();
    expect(handler1).toBe(handler2);
    expect(handler1).toBe(databaseIpcHandler);
  });
});
