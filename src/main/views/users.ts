import { z } from 'zod';
import { publicProcedure, router } from '../trpc';
import { getDatabase } from '../database';

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

// 用户相关路由
export const usersRouter = router({
  create: publicProcedure
    .input(createUserSchema)
    .mutation(async ({ input }) => {
      const db = getDatabase();
      return await db.user.create({
        data: {
          email: input.email,
          name: input.name,
        },
      });
    }),

  getAll: publicProcedure
    .query(async () => {
      const db = getDatabase();
      return await db.user.findMany({
        include: { posts: true },
      });
    }),

  getById: publicProcedure
    .input(z.number())
    .query(async ({ input }) => {
      const db = getDatabase();
      return await db.user.findUnique({
        where: { id: input },
        include: { posts: true },
      });
    }),

  update: publicProcedure
    .input(updateUserSchema)
    .mutation(async ({ input }) => {
      const db = getDatabase();
      return await db.user.update({
        where: { id: input.id },
        data: input.data,
      });
    }),

  delete: publicProcedure
    .input(z.number())
    .mutation(async ({ input }) => {
      const db = getDatabase();
      return await db.user.delete({
        where: { id: input },
      });
    }),
});
