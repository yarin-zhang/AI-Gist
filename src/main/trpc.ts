import { initTRPC } from '@trpc/server';

// 初始化 tRPC
const t = initTRPC.create();

// 导出基础构建块
export const router = t.router;
export const publicProcedure = t.procedure;