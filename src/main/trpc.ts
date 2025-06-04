import { initTRPC } from '@trpc/server';
import { DatabaseService } from './database';
import { appRouter as mainAppRouter, type AppRouter } from './views';

// 初始化 tRPC
const t = initTRPC.create();

// 创建路由器和过程
export const router = t.router;
export const publicProcedure = t.procedure;

// 数据库服务实例
let dbService: DatabaseService | null = null;

export function setDatabaseService(service: DatabaseService) {
  dbService = service;
}

// 导出主路由和类型定义
export const appRouter = mainAppRouter;
export type { AppRouter };
