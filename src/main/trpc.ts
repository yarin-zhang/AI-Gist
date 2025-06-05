/**
 * tRPC 服务器端模块
 * 由于数据存储已迁移到渲染进程的 IndexedDB，不再需要 tRPC 服务器
 * 保留此文件以维护API兼容性
 */

console.log('tRPC 服务器已被移除，数据处理已迁移到 IndexedDB');

// 空的路由器以维护兼容性
export const appRouter = {
  createCaller: () => ({})
};