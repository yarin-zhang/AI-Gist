import { PrismaClient } from '@prisma/client';
import { app } from 'electron';
import { join } from 'path';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import path from 'path';

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

  prisma = new PrismaClient({
    datasources: {
      db: {
        url: `file:${databasePath}`
      }
    }
  });

  return prisma;
}

// 替换原有的迁移函数
export async function runDatabaseMigrations(): Promise<void> {
  if (!prisma) {
    throw new Error('Database not initialized');
  }

  try {
    console.log('Running database migrations...');
    
    // 确定迁移文件的路径
    const isDev = !app.isPackaged;
    let migrationsDir: string;
    
    if (isDev) {
      // 开发环境：使用项目根目录下的迁移文件
      migrationsDir = join(process.cwd(), 'prisma', 'migrations');
    } else {
      // 生产环境：使用打包到应用中的迁移文件
      migrationsDir = join(process.resourcesPath, 'prisma', 'migrations');
    }
    
    console.log('Migrations directory:', migrationsDir);
    
    if (!existsSync(migrationsDir)) {
      console.warn('Migrations directory not found. Skipping migrations.');
      return;
    }
    
    // 获取所有迁移文件夹，按命名顺序排序
    const migrationDirs = getMigrationDirectories(migrationsDir);
    
    // 保持对 prisma 的引用以确保它在函数执行期间不会变为 null
    const db = prisma;
    
    // 获取已应用的迁移列表 - 内部自己检查 prisma 是否为 null
    const appliedMigrations = await getAppliedMigrations();
    
    // 应用每个迁移
    for (const migrationDir of migrationDirs) {
      const migrationName = path.basename(migrationDir);
      
      // 如果迁移已经应用过，跳过
      if (appliedMigrations.includes(migrationName)) {
        console.log(`Migration ${migrationName} already applied, skipping`);
        continue;
      }
      
      // 读取并执行迁移SQL
      const sqlPath = path.join(migrationDir, 'migration.sql');
      if (existsSync(sqlPath)) {
        const sql = readFileSync(sqlPath, 'utf8');
        console.log(`Applying migration: ${migrationName}`);
        
        // 将SQL语句按分号分割并执行
        const statements = sql
          .split(';')
          .map(s => s.trim())
          .filter(s => s.length > 0);
        
        for (const statement of statements) {
          await db.$executeRawUnsafe(statement);
        }
        
        // 记录已应用的迁移 - 内部自己检查 prisma 是否为 null
        await recordAppliedMigration(migrationName);
      }
    }
    
    console.log('Database migrations completed successfully');
  } catch (error) {
    console.error('Database migration failed:', error);
    throw error;
  }
}

// 获取迁移目录列表并排序
function getMigrationDirectories(migrationsDir: string): string[] {
  if (!existsSync(migrationsDir)) {
    return [];
  }
  
  // 读取目录
  const entries = require('fs').readdirSync(migrationsDir, { withFileTypes: true });
  
  // 过滤出目录并按名称排序（Prisma的迁移文件夹格式为：20220101000000_migration_name）
  return entries
    .filter((entry: any) => entry.isDirectory())
    .map((entry: any) => path.join(migrationsDir, entry.name))
    .sort();
}

// 获取已应用的迁移列表
async function getAppliedMigrations(): Promise<string[]> {
  if (!prisma) {
    console.warn('Prisma client is not initialized, cannot get applied migrations');
    return [];
  }

  try {
    // 确保_prisma_migrations表存在
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
        "id" TEXT PRIMARY KEY,
        "checksum" TEXT NOT NULL,
        "finished_at" DATETIME,
        "migration_name" TEXT NOT NULL,
        "logs" TEXT,
        "rolled_back_at" DATETIME,
        "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "applied_steps_count" INTEGER NOT NULL DEFAULT 0
      );
    `;
    
    // 查询已应用的迁移
    const appliedMigrations = await prisma.$queryRaw<Array<{migration_name: string}>>`
      SELECT migration_name FROM "_prisma_migrations" WHERE rolled_back_at IS NULL;
    `;
    
    return appliedMigrations.map(m => m.migration_name);
  } catch (error) {
    console.error('Failed to get applied migrations:', error);
    return [];
  }
}

// 记录已应用的迁移
async function recordAppliedMigration(migrationName: string): Promise<void> {
  if (!prisma) {
    console.error('Prisma client is not initialized, cannot record migration');
    return;
  }

  const id = generateUuid();
  const checksum = generateMigrationChecksum(migrationName);
  
  await prisma.$executeRaw`
    INSERT INTO "_prisma_migrations" (
      "id", "checksum", "finished_at", "migration_name", "applied_steps_count"
    ) VALUES (
      ${id}, ${checksum}, CURRENT_TIMESTAMP, ${migrationName}, 1
    );
  `;
}

// 生成UUID
function generateUuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0,
        v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// 生成迁移检查和
function generateMigrationChecksum(migrationName: string): string {
  // 简单实现，实际应用中可能需要更复杂的检查和算法
  return Buffer.from(migrationName).toString('base64');
}

// 添加数据库初始化函数
export async function ensureDatabaseExists(): Promise<void> {
  if (!prisma) {
    throw new Error('Database not initialized');
  }
  
  try {
    console.log('Ensuring database exists and is properly structured...');
    
    // 尝试连接数据库
    await prisma.$connect();
    
    // 运行数据库迁移
    await runDatabaseMigrations();
    
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
