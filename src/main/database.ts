import { PrismaClient } from '@prisma/client';
import { app } from 'electron';
import { join } from 'path';

let prisma: PrismaClient | null = null;

export function initDatabase(): PrismaClient {
  if (prisma) {
    return prisma;
  }

  // 在生产环境中，数据库文件应该存储在用户数据目录中
  const isDev = process.env.NODE_ENV === 'development';
  const databasePath = isDev 
    ? join(process.cwd(), 'prisma', 'dev.db')
    : join(app.getPath('userData'), 'app.db');

  prisma = new PrismaClient({
    datasources: {
      db: {
        url: `file:${databasePath}`
      }
    }
  });

  return prisma;
}

export function getDatabase(): PrismaClient {
  if (!prisma) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return prisma;
}

export async function closeDatabase(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
}

// 数据库操作示例
export class DatabaseService {
  private db: PrismaClient;

  constructor() {
    this.db = getDatabase();
  }

  // 用户相关操作
  async createUser(email: string, name?: string) {
    return await this.db.user.create({
      data: { email, name }
    });
  }

  async getAllUsers() {
    return await this.db.user.findMany({
      include: { posts: true }
    });
  }

  async getUserById(id: number) {
    return await this.db.user.findUnique({
      where: { id },
      include: { posts: true }
    });
  }

  async updateUser(id: number, data: { email?: string; name?: string }) {
    return await this.db.user.update({
      where: { id },
      data
    });
  }

  async deleteUser(id: number) {
    return await this.db.user.delete({
      where: { id }
    });
  }

  // 文章相关操作
  async createPost(title: string, content?: string, authorId?: number) {
    if (!authorId) {
      throw new Error('Author ID is required');
    }
    return await this.db.post.create({
      data: { title, content, authorId }
    });
  }

  async getAllPosts() {
    return await this.db.post.findMany({
      include: { author: true }
    });
  }

  async getPostById(id: number) {
    return await this.db.post.findUnique({
      where: { id },
      include: { author: true }
    });
  }

  async updatePost(id: number, data: { title?: string; content?: string; published?: boolean }) {
    return await this.db.post.update({
      where: { id },
      data
    });
  }

  async deletePost(id: number) {
    return await this.db.post.delete({
      where: { id }
    });
  }

  // 分类相关操作
  async createCategory(name: string, color?: string) {
    return await this.db.category.create({
      data: { name, color }
    });
  }

  async getAllCategories() {
    return await this.db.category.findMany({
      include: { _count: { select: { prompts: true } } }
    });
  }

  async updateCategory(id: number, data: { name?: string; color?: string }) {
    return await this.db.category.update({
      where: { id },
      data
    });
  }

  async deleteCategory(id: number) {
    return await this.db.category.delete({
      where: { id }
    });
  }

  // Prompt 相关操作
  async createPrompt(data: {
    title: string;
    content: string;
    description?: string;
    categoryId?: number;
    tags?: string;
    variables?: Array<{
      name: string;
      label: string;
      type?: string;
      options?: string;
      defaultValue?: string;
      required?: boolean;
      placeholder?: string;
    }>;
  }) {
    const { variables, ...promptData } = data;
    
    return await this.db.prompt.create({
      data: {
        ...promptData,
        variables: variables ? {
          create: variables
        } : undefined
      },
      include: {
        category: true,
        variables: true
      }
    });
  }

  async getAllPrompts(filters?: {
    categoryId?: number;
    search?: string;
    tags?: string;
    isFavorite?: boolean;
  }) {
    const where: any = {};
    
    if (filters?.categoryId) {
      where.categoryId = filters.categoryId;
    }
    
    if (filters?.search) {
      where.OR = [
        { title: { contains: filters.search } },
        { description: { contains: filters.search } },
        { content: { contains: filters.search } }
      ];
    }
    
    if (filters?.tags) {
      where.tags = { contains: filters.tags };
    }
    
    if (filters?.isFavorite !== undefined) {
      where.isFavorite = filters.isFavorite;
    }

    return await this.db.prompt.findMany({
      where,
      include: {
        category: true,
        variables: true,
        _count: true
      },
      orderBy: [
        { isFavorite: 'desc' },
        { useCount: 'desc' },
        { updatedAt: 'desc' }
      ]
    });
  }

  async getPromptById(id: number) {
    return await this.db.prompt.findUnique({
      where: { id },
      include: {
        category: true,
        variables: true
      }
    });
  }

  async updatePrompt(id: number, data: {
    title?: string;
    content?: string;
    description?: string;
    categoryId?: number;
    tags?: string;
    isFavorite?: boolean;
    variables?: Array<{
      name: string;
      label: string;
      type: string;
      options?: string;
      defaultValue?: string;
      required: boolean;
      placeholder?: string;
    }>;
  }) {
    const { variables, ...promptData } = data;
    
    return await this.db.prompt.update({
      where: { id },
      data: {
        ...promptData,
        variables: variables ? {
          deleteMany: {},
          create: variables
        } : undefined
      },
      include: {
        category: true,
        variables: true
      }
    });
  }

  async deletePrompt(id: number) {
    return await this.db.prompt.delete({
      where: { id }
    });
  }

  async incrementPromptUseCount(id: number) {
    return await this.db.prompt.update({
      where: { id },
      data: {
        useCount: { increment: 1 }
      }
    });
  }

  async fillPromptVariables(promptId: number, variables: Record<string, string>) {
    const prompt = await this.getPromptById(promptId);
    if (!prompt) {
      throw new Error('Prompt not found');
    }

    let filledContent = prompt.content;
    
    // 替换变量占位符
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      filledContent = filledContent.replace(regex, value);
    }

    // 增加使用次数
    await this.incrementPromptUseCount(promptId);

    return {
      ...prompt,
      filledContent
    };
  }

  async getFavoritePrompts() {
    return await this.db.prompt.findMany({
      where: { isFavorite: true },
      include: {
        category: true,
        variables: true
      },
      orderBy: { updatedAt: 'desc' }
    });
  }

  async togglePromptFavorite(id: number) {
    const prompt = await this.db.prompt.findUnique({
      where: { id },
      select: { isFavorite: true }
    });

    if (!prompt) {
      throw new Error('Prompt not found');
    }

    return await this.db.prompt.update({
      where: { id },
      data: { isFavorite: !prompt.isFavorite },
      include: {
        category: true,
        variables: true
      }
    });
  }
}
