import { z } from 'zod';
import { publicProcedure, router } from '../trpc';
import { getDatabase } from '../database';

// 输入验证 schemas
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
  categoryId: z.number().nullable().optional(),
  tags: z.string().optional(),
  variables: z.array(createPromptVariableSchema).optional(),
});

const updatePromptSchema = z.object({
  id: z.number(),
  data: z.object({
    title: z.string().optional(),
    content: z.string().optional(),
    description: z.string().optional(),
    categoryId: z.number().nullable().optional(),
    tags: z.string().optional(),
    isFavorite: z.boolean().optional(),
    variables: z.array(createPromptVariableSchema).optional(),
  }),
});

const fillPromptSchema = z.object({
  promptId: z.number(),
  variables: z.record(z.string(), z.string()), // key-value pairs for variables
});

// Prompt 相关路由
export const promptsRouter = router({
  create: publicProcedure
    .input(createPromptSchema)
    .mutation(async ({ input }) => {
      const db = getDatabase();
      return await db.prompt.create({
        data: {
          title: input.title,
          content: input.content,
          description: input.description,
          categoryId: input.categoryId,
          tags: input.tags,
          variables: input.variables ? {
            create: input.variables
          } : undefined,
        },
        include: {
          category: true,
          variables: true,
        },
      });
    }),

  getAll: publicProcedure
    .input(z.object({
      categoryId: z.number().nullable().optional(),
      search: z.string().optional(),
      tags: z.string().optional(),
      isFavorite: z.boolean().optional(),
    }).optional())
    .query(async ({ input }) => {
      const db = getDatabase();
      
      const where: any = {};
      
      if (input?.categoryId) {
        where.categoryId = input.categoryId;
      }
      
      if (input?.search) {
        where.OR = [
          { title: { contains: input.search, mode: 'insensitive' } },
          { description: { contains: input.search, mode: 'insensitive' } },
          { content: { contains: input.search, mode: 'insensitive' } },
        ];
      }
      
      if (input?.tags) {
        where.tags = { contains: input.tags, mode: 'insensitive' };
      }
      
      if (input?.isFavorite !== undefined) {
        where.isFavorite = input.isFavorite;
      }

      return await db.prompt.findMany({
        where,
        include: {
          category: true,
          variables: true,
        },
        orderBy: [
          { isFavorite: 'desc' },
          { useCount: 'desc' },
          { updatedAt: 'desc' },
        ],
      });
    }),

  getById: publicProcedure
    .input(z.number())
    .query(async ({ input }) => {
      const db = getDatabase();
      return await db.prompt.findUnique({
        where: { id: input },
        include: {
          category: true,
          variables: true,
        },
      });
    }),

  update: publicProcedure
    .input(updatePromptSchema)
    .mutation(async ({ input }) => {
      const db = getDatabase();
      
      const updateData: any = { ...input.data };
      
      // 处理 variables 的更新
      if (updateData.variables) {
        const variables = updateData.variables;
        delete updateData.variables;
        
        // 先删除现有的 variables，然后创建新的
        await db.promptVariable.deleteMany({
          where: { promptId: input.id }
        });
        
        updateData.variables = {
          create: variables
        };
      }
      
      return await db.prompt.update({
        where: { id: input.id },
        data: updateData,
        include: {
          category: true,
          variables: true,
        },
      });
    }),

  delete: publicProcedure
    .input(z.number())
    .mutation(async ({ input }) => {
      const db = getDatabase();
      return await db.prompt.delete({
        where: { id: input },
      });
    }),

  incrementUseCount: publicProcedure
    .input(z.number())
    .mutation(async ({ input }) => {
      const db = getDatabase();
      return await db.prompt.update({
        where: { id: input },
        data: {
          useCount: { increment: 1 },
        },
      });
    }),

  fillVariables: publicProcedure
    .input(fillPromptSchema)
    .mutation(async ({ input }) => {
      const db = getDatabase();
      
      // 获取 prompt 和其变量
      const prompt = await db.prompt.findUnique({
        where: { id: input.promptId },
        include: {
          variables: true,
        },
      });
      
      if (!prompt) {
        throw new Error('Prompt not found');
      }
      
      let content = prompt.content;
      
      // 替换变量
      Object.entries(input.variables).forEach(([key, value]) => {
        const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
        content = content.replace(regex, value);
      });
      
      // 增加使用次数
      await db.prompt.update({
        where: { id: input.promptId },
        data: {
          useCount: { increment: 1 },
        },
      });
      
      return {
        originalContent: prompt.content,
        filledContent: content,
        variables: input.variables,
        promptVariables: prompt.variables,
      };
    }),

  getFavorites: publicProcedure
    .query(async () => {
      const db = getDatabase();
      return await db.prompt.findMany({
        where: { isFavorite: true },
        include: {
          category: true,
          variables: true,
        },
        orderBy: [
          { useCount: 'desc' },
          { updatedAt: 'desc' },
        ],
      });
    }),

  toggleFavorite: publicProcedure
    .input(z.number())
    .mutation(async ({ input }) => {
      const db = getDatabase();
      
      const prompt = await db.prompt.findUnique({
        where: { id: input },
      });
      
      if (!prompt) {
        throw new Error('Prompt not found');
      }
      
      return await db.prompt.update({
        where: { id: input },
        data: {
          isFavorite: !prompt.isFavorite,
        },
        include: {
          category: true,
          variables: true,
        },
      });
    }),
});
