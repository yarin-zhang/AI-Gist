import { z } from 'zod';
import { publicProcedure, router } from '../trpc';
import { getDatabase } from '../database';

// 输入验证 schemas
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

// 文章相关路由
export const postsRouter = router({
  create: publicProcedure
    .input(createPostSchema)
    .mutation(async ({ input }) => {
      const db = getDatabase();
      return await db.post.create({
        data: {
          title: input.title,
          content: input.content,
          authorId: input.authorId,
        },
      });
    }),

  getAll: publicProcedure
    .query(async () => {
      const db = getDatabase();
      return await db.post.findMany({
        include: { author: true },
      });
    }),

  getById: publicProcedure
    .input(z.number())
    .query(async ({ input }) => {
      const db = getDatabase();
      return await db.post.findUnique({
        where: { id: input },
        include: { author: true },
      });
    }),

  update: publicProcedure
    .input(updatePostSchema)
    .mutation(async ({ input }) => {
      const db = getDatabase();
      return await db.post.update({
        where: { id: input.id },
        data: input.data,
      });
    }),

  delete: publicProcedure
    .input(z.number())
    .mutation(async ({ input }) => {
      const db = getDatabase();
      return await db.post.delete({
        where: { id: input },
      });
    }),
});
