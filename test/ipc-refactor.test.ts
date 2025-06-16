/**
 * IPC 重构测试
 * 验证所有 IPC 相关功能是否正常工作
 */

import { 
  IpcUtils, 
  ipcInvoke
} from '../src/renderer/lib/ipc';

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

  test('IpcUtils 方法应该正常工作', () => {
    expect(typeof IpcUtils.isElectronAvailable()).toBe('boolean');
  });
});
