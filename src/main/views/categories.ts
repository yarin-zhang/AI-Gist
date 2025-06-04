import { z } from 'zod';
import { publicProcedure, router } from '../trpc';
import { getDatabase } from '../database';

// 输入验证 schemas
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

// 分类相关路由
export const categoriesRouter = router({
  create: publicProcedure
    .input(createCategorySchema)
    .mutation(async ({ input }) => {
      const db = getDatabase();
      return await db.category.create({
        data: {
          name: input.name,
          color: input.color,
        },
      });
    }),

  getAll: publicProcedure
    .query(async () => {
      const db = getDatabase();
      return await db.category.findMany({
        include: { prompts: true },
      });
    }),

  update: publicProcedure
    .input(updateCategorySchema)
    .mutation(async ({ input }) => {
      const db = getDatabase();
      return await db.category.update({
        where: { id: input.id },
        data: input.data,
      });
    }),

  delete: publicProcedure
    .input(z.number())
    .mutation(async ({ input }) => {
      const db = getDatabase();
      return await db.category.delete({
        where: { id: input },
      });
    }),
});
