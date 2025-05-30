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

// Prompt 相关 schemas
const createCategorySchema = z.object({
  name: z.string().min(1),
  color: z.string().optional(),
});

const updateCategorySchema = z.object({
  id: z.number(),
  data: z.object({
    name: z.string().optional(),
    color: z.string().optional(),
  }),
});

const createPromptVariableSchema = z.object({
  name: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(['text', 'textarea', 'select']).default('text'),
  options: z.string().optional(),
  defaultValue: z.string().optional(),
  required: z.boolean().default(true),
  placeholder: z.string().optional(),
});

const createPromptSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
  description: z.string().optional(),
  categoryId: z.number().optional(),
  tags: z.string().optional(),
  variables: z.array(createPromptVariableSchema).optional(),
});

const updatePromptSchema = z.object({
  id: z.number(),
  data: z.object({
    title: z.string().optional(),
    content: z.string().optional(),
    description: z.string().optional(),
    categoryId: z.number().optional(),
    tags: z.string().optional(),
    isFavorite: z.boolean().optional(),
    variables: z.array(createPromptVariableSchema).optional(),
  }),
});

const fillPromptSchema = z.object({
  promptId: z.number(),
  variables: z.record(z.string(), z.string()), // key-value pairs for variables
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

  // Prompt 分类管理路由
  categories: router({
    create: publicProcedure
      .input(createCategorySchema)
      .mutation(async ({ input }) => {
        if (!dbService) throw new Error('Database not initialized');
        return await dbService.createCategory(input.name, input.color);
      }),

    getAll: publicProcedure
      .query(async () => {
        if (!dbService) throw new Error('Database not initialized');
        return await dbService.getAllCategories();
      }),

    update: publicProcedure
      .input(updateCategorySchema)
      .mutation(async ({ input }) => {
        if (!dbService) throw new Error('Database not initialized');
        return await dbService.updateCategory(input.id, input.data);
      }),

    delete: publicProcedure
      .input(z.number())
      .mutation(async ({ input }) => {
        if (!dbService) throw new Error('Database not initialized');
        return await dbService.deleteCategory(input);
      }),
  }),

  // Prompt 管理路由
  prompts: router({
    create: publicProcedure
      .input(createPromptSchema)
      .mutation(async ({ input }) => {
        if (!dbService) throw new Error('Database not initialized');
        return await dbService.createPrompt(input);
      }),

    getAll: publicProcedure
      .input(z.object({
        categoryId: z.number().optional(),
        search: z.string().optional(),
        tags: z.string().optional(),
        isFavorite: z.boolean().optional(),
      }).optional())
      .query(async ({ input }) => {
        if (!dbService) throw new Error('Database not initialized');
        return await dbService.getAllPrompts(input);
      }),

    getById: publicProcedure
      .input(z.number())
      .query(async ({ input }) => {
        if (!dbService) throw new Error('Database not initialized');
        return await dbService.getPromptById(input);
      }),

    update: publicProcedure
      .input(updatePromptSchema)
      .mutation(async ({ input }) => {
        if (!dbService) throw new Error('Database not initialized');
        return await dbService.updatePrompt(input.id, input.data);
      }),

    delete: publicProcedure
      .input(z.number())
      .mutation(async ({ input }) => {
        if (!dbService) throw new Error('Database not initialized');
        return await dbService.deletePrompt(input);
      }),

    incrementUseCount: publicProcedure
      .input(z.number())
      .mutation(async ({ input }) => {
        if (!dbService) throw new Error('Database not initialized');
        return await dbService.incrementPromptUseCount(input);
      }),

    fillVariables: publicProcedure
      .input(fillPromptSchema)
      .mutation(async ({ input }) => {
        if (!dbService) throw new Error('Database not initialized');
        return await dbService.fillPromptVariables(input.promptId, input.variables);
      }),

    getFavorites: publicProcedure
      .query(async () => {
        if (!dbService) throw new Error('Database not initialized');
        return await dbService.getFavoritePrompts();
      }),

    toggleFavorite: publicProcedure
      .input(z.number())
      .mutation(async ({ input }) => {
        if (!dbService) throw new Error('Database not initialized');
        return await dbService.togglePromptFavorite(input);
      }),
  }),
});

// 导出类型定义
export type AppRouter = typeof appRouter;
