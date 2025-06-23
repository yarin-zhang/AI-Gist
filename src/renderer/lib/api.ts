/**
 * API客户端主入口
 * 汇总所有API客户端相关的功能
 */

// 导出所有API客户端类和工厂函数
export * from './api/index';

// 为了保持向后兼容，导出传统的API客户端
export { api } from './api/index';

// 类型定义（为了兼容性保留）
export type { AppRouter, DatabaseClient } from './api/index';
