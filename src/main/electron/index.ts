/**
 * Electron 模块统一导出
 */

export * from '../../shared/types';
export * from './utils';
export * from './preferences-manager';
export * from './tray-manager';
export * from './window-manager';
export * from './ipc-handlers';
export * from './theme-manager';
export * from './single-instance-manager';
// 使用真实的 WebDAV 服务
export { WebDAVService } from './webdav-service';
export * from './data-management-service';
