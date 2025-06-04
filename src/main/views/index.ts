import { router } from '../trpc';
import { usersRouter } from './users';
import { postsRouter } from './posts';
import { categoriesRouter } from './categories';
import { promptsRouter } from './prompts';

// tRPC 主路由，整合所有子路由
export const appRouter = router({
  users: usersRouter,
  posts: postsRouter,
  categories: categoriesRouter,
  prompts: promptsRouter,
});

// 导出类型定义
export type AppRouter = typeof appRouter;