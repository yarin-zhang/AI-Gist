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
}
