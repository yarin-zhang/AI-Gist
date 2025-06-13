/**
 * Electron 模块统一导出
 */

export * from './types';
export * from './utils';
export * from './preferences-manager';
export * from './tray-manager';
export * from './window-manager';
export * from './ipc-handlers';
export * from './theme-manager';
export * from './single-instance-manager';
// 暂时使用模拟版本避免 ES 模块问题
export { WebDAVServiceMock as WebDAVService } from './webdav-service-mock';
export * from './data-management-service';
