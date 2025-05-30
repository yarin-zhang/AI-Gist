import { initTRPC } from '@trpc/server';
import { z } from 'zod';
import { DatabaseService } from './database';

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

// 输入验证 schemas
const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
});

const updateUserSchema = z.object({
  id: z.number(),
  data: z.object({
    email: z.string().email().optional(),
    name: z.string().optional(),
  }),
});

const createPostSchema = z.object({
  title: z.string().min(1),
  content: z.string().optional(),
  authorId: z.number(),
});

const updatePostSchema = z.object({
  id: z.number(),
  data: z.object({
    title: z.string().optional(),
    content: z.string().optional(),
    published: z.boolean().optional(),
  }),
});

// tRPC 路由定义
export const appRouter = router({
  // 用户相关路由
  users: router({
    create: publicProcedure
      .input(createUserSchema)
      .mutation(async ({ input }) => {
        if (!dbService) throw new Error('Database not initialized');
        return await dbService.createUser(input.email, input.name);
      }),

    getAll: publicProcedure
      .query(async () => {
        if (!dbService) throw new Error('Database not initialized');
        return await dbService.getAllUsers();
      }),

    getById: publicProcedure
      .input(z.number())
      .query(async ({ input }) => {
        if (!dbService) throw new Error('Database not initialized');
        return await dbService.getUserById(input);
      }),

    update: publicProcedure
      .input(updateUserSchema)
      .mutation(async ({ input }) => {
        if (!dbService) throw new Error('Database not initialized');
        return await dbService.updateUser(input.id, input.data);
      }),

    delete: publicProcedure
      .input(z.number())
      .mutation(async ({ input }) => {
        if (!dbService) throw new Error('Database not initialized');
        return await dbService.deleteUser(input);
      }),
  }),

  // 文章相关路由
  posts: router({
    create: publicProcedure
      .input(createPostSchema)
      .mutation(async ({ input }) => {
        if (!dbService) throw new Error('Database not initialized');
        return await dbService.createPost(input.title, input.content, input.authorId);
      }),

    getAll: publicProcedure
      .query(async () => {
        if (!dbService) throw new Error('Database not initialized');
        return await dbService.getAllPosts();
      }),

    getById: publicProcedure
      .input(z.number())
      .query(async ({ input }) => {
        if (!dbService) throw new Error('Database not initialized');
        return await dbService.getPostById(input);
      }),

    update: publicProcedure
      .input(updatePostSchema)
      .mutation(async ({ input }) => {
        if (!dbService) throw new Error('Database not initialized');
        return await dbService.updatePost(input.id, input.data);
      }),

    delete: publicProcedure
      .input(z.number())
      .mutation(async ({ input }) => {
        if (!dbService) throw new Error('Database not initialized');
        return await dbService.deletePost(input);
      }),
  }),
});

// 导出类型定义
export type AppRouter = typeof appRouter;
