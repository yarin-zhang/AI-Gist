/**
 * IndexedDB 数据库服务主入口
 * 汇总所有数据库相关的服务和类型定义
 */

// 导出所有类型定义
export * from './types/database';

// 导出所有服务类和服务管理器
export * from './services';

// 为了保持向后兼容，导出传统的数据库服务实例
export { databaseService, initDatabase } from './services';
