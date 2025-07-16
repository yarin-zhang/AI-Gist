/**
 * Electron 模块统一导出
 */

import { ShortcutManager } from './shortcut-manager';

export * from '@shared/types';
export * from './ipc-handlers';
export * from './utils';
export * from './preferences-manager';
export * from './tray-manager';
export * from './window-manager';
export * from './theme-manager';
export * from './single-instance-manager';

// 导出快捷键管理器实例，但不在这里初始化
export { ShortcutManager };
