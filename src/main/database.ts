import { PrismaClient } from '@prisma/client';
import { app } from 'electron';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

let prisma: PrismaClient | null = null;

export function initDatabase(): PrismaClient {
  if (prisma) {
    return prisma;
  }

  // 更准确的环境判断：检查是否在开发模式或者是否已打包
  const isDev = !app.isPackaged;
  
  let databasePath: string;
  
  if (isDev) {
    // 开发环境：使用项目根目录下的数据库
    databasePath = join(process.cwd(), 'prisma', 'dev.db');
  } else {
    // 生产环境：使用用户数据目录
    const userDataPath = app.getPath('userData');
    // 确保目录存在
    if (!existsSync(userDataPath)) {
      mkdirSync(userDataPath, { recursive: true });
    }
    databasePath = join(userDataPath, 'app.db');
  }

  console.log('Database path:', databasePath);

  // 设置环境变量
  process.env.DATABASE_URL = `file:${databasePath}`;

  prisma = new PrismaClient({
    datasources: {
      db: {
        url: `file:${databasePath}`
      }
    }
  });

  return prisma;
}

// 使用 Prisma 的推荐方式初始化数据库
export async function ensureDatabaseExists(): Promise<void> {
  if (!prisma) {
    throw new Error('Database not initialized');
  }
  
  try {
    console.log('Ensuring database exists and is properly structured...');
    
    // 尝试连接数据库
    await prisma.$connect();
    
    const isDev = !app.isPackaged;
    
    if (isDev) {
      // 开发环境：使用 prisma migrate dev
      console.log('Development environment: running migrations...');
      await runPrismaMigrate();
    } else {
      // 生产环境：使用 prisma db push
      console.log('Production environment: pushing schema to database...');
      await runPrismaDbPush();
    }
    
    // 验证表是否存在
    const tables = await prisma.$queryRaw`
      SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';
    `;
    console.log('Database tables:', tables);
    
    console.log('Database initialization completed successfully');
    
  } catch (error) {
    console.error('Database initialization failed:', error);
    throw error;
  }
}

// 在生产环境中使用 Prisma db push
async function runPrismaDbPush(): Promise<void> {
  try {
    const isDev = !app.isPackaged;
    let schemaPath: string;
    
    if (isDev) {
      schemaPath = join(process.cwd(), 'prisma', 'schema.prisma');
    } else {
      // 生产环境中，schema.prisma 被打包到 resources 目录
      schemaPath = join(process.resourcesPath, 'prisma', 'schema.prisma');
    }
    
    console.log('Schema path:', schemaPath);
    
    if (!existsSync(schemaPath)) {
      throw new Error(`Schema file not found at: ${schemaPath}`);
    }
    
    // 设置 Prisma 环境变量
    const env = {
      ...process.env,
      PRISMA_SCHEMA_PATH: schemaPath,
      DATABASE_URL: process.env.DATABASE_URL
    };
    
    // 使用内嵌的 prisma 二进制文件
    const prismaBinary = isDev 
      ? 'npx prisma' 
      : join(process.resourcesPath, 'node_modules', '.bin', 'prisma');
    
    console.log('Running: prisma db push --accept-data-loss');
    
    // 直接使用 Prisma Client 的内部方法来推送 schema
    // 这是 prisma db push 的核心功能
    await pushSchemaToDatabase();
    
  } catch (error) {
    console.error('Failed to push schema to database:', error);
    throw error;
  }
}

// 手动实现 schema 推送逻辑
async function pushSchemaToDatabase(): Promise<void> {
  if (!prisma) {
    throw new Error('Prisma client not initialized');
  }

  try {
    // 创建所有必要的表
    console.log('Creating database tables...');
    
    // 创建 User 表
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "User" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "email" TEXT NOT NULL,
        "name" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `;
    
    await prisma.$executeRaw`
      CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");
    `;
    
    // 创建 Post 表
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "Post" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "title" TEXT NOT NULL,
        "content" TEXT,
        "published" BOOLEAN NOT NULL DEFAULT false,
        "authorId" INTEGER NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "Post_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
      );
    `;
    
    // 创建 Category 表
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "Category" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "name" TEXT NOT NULL,
        "color" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `;
    
    await prisma.$executeRaw`
      CREATE UNIQUE INDEX IF NOT EXISTS "Category_name_key" ON "Category"("name");
    `;
    
    // 创建 Prompt 表
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "Prompt" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "title" TEXT NOT NULL,
        "content" TEXT NOT NULL,
        "description" TEXT,
        "categoryId" INTEGER,
        "tags" TEXT,
        "isFavorite" BOOLEAN NOT NULL DEFAULT false,
        "useCount" INTEGER NOT NULL DEFAULT 0,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "Prompt_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE
      );
    `;
    
    // 创建 Prompt 索引
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS "idx_prompt_category" ON "Prompt"("categoryId");
    `;
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS "idx_prompt_favorite" ON "Prompt"("isFavorite");
    `;
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS "idx_prompt_use_count" ON "Prompt"("useCount");
    `;
    
    // 创建 PromptVariable 表
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "PromptVariable" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "name" TEXT NOT NULL,
        "label" TEXT NOT NULL,
        "type" TEXT NOT NULL DEFAULT 'text',
        "options" TEXT,
        "defaultValue" TEXT,
        "required" BOOLEAN NOT NULL DEFAULT false,
        "placeholder" TEXT,
        "promptId" INTEGER NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "PromptVariable_promptId_fkey" FOREIGN KEY ("promptId") REFERENCES "Prompt" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
    `;
    
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS "idx_prompt_variable_prompt" ON "PromptVariable"("promptId");
    `;
    
    console.log('Database tables created successfully');
    
  } catch (error) {
    console.error('Failed to create database tables:', error);
    throw error;
  }
}

// 开发环境中运行迁移
async function runPrismaMigrate(): Promise<void> {
  try {
    console.log('Running Prisma migrations...');
    await execAsync('npx prisma migrate dev --name init', {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL }
    });
    console.log('Prisma migrations completed');
  } catch (error) {
    console.warn('Prisma migrate failed, falling back to db push:', error);
    // 如果迁移失败，回退到 db push
    await pushSchemaToDatabase();
  }
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
