import { PrismaClient } from "@prisma/client";
import { app, dialog } from "electron";
import { join } from "path";
import { existsSync, mkdirSync, copyFileSync, writeFileSync, promises as fs } from "fs";
import { exec } from "child_process";
import { promisify } from "util";

// 将 exec 函数转换为 Promise 形式，便于使用 async/await
const execAsync = promisify(exec);

// Prisma 客户端实例，全局单例
let prisma: PrismaClient | null = null;

/**
 * 简化的日志记录函数
 * @param message 日志消息内容
 * @param level 日志级别：info(信息)、warn(警告)、error(错误)
 */
function log(message: string, level: 'info' | 'warn' | 'error' = 'info') {
  // 获取当前时间戳
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  console.log(logMessage);
  
  try {
    // 将日志写入用户数据目录下的 app.log 文件
    const logPath = join(app.getPath('userData'), 'app.log');
    writeFileSync(logPath, logMessage + '\n', { flag: 'a' });
  } catch (error) {
    console.error('Failed to write to log file:', error);
  }
}

/**
 * 获取数据库文件路径
 * 开发环境：项目根目录下的 prisma/dev.db
 * 生产环境：用户数据目录下的 app.db
 */
function getDatabasePath(): string {
  const isDev = !app.isPackaged;
  
  if (isDev) {
    // 开发环境：使用项目目录下的开发数据库
    return join(process.cwd(), "prisma", "dev.db");
  } else {
    // 生产环境：使用用户数据目录
    const userDataPath = app.getPath("userData");
    if (!existsSync(userDataPath)) {
      mkdirSync(userDataPath, { recursive: true });
    }
    return join(userDataPath, "app.db");
  }
}

/**
 * 初始化生产环境数据库
 * 如果数据库不存在，尝试从模板数据库复制，否则创建空数据库
 * @param databasePath 数据库文件路径
 */
function initProductionDatabase(databasePath: string): void {
  // 如果数据库已存在，直接返回
  if (existsSync(databasePath)) {
    return;
  }

  // 定义可能的模板数据库路径，按优先级排序
  const possiblePaths = [
    join(process.resourcesPath, "prisma", "starter.db"),        // 打包后的资源目录
    join(__dirname, "..", "..", "prisma", "starter.db"),       // 相对于当前文件的路径
    join(__dirname, "..", "prisma", "starter.db"),             // 上级目录
    join(process.cwd(), "resources", "prisma", "starter.db")   // 项目资源目录
  ];

  // 遍历可能的路径，找到模板数据库就复制
  for (const starterPath of possiblePaths) {
    if (existsSync(starterPath)) {
      copyFileSync(starterPath, databasePath);
      log(`从模板初始化数据库: ${starterPath}`);
      return;
    }
  }

  log("未找到模板数据库文件，将创建空数据库", 'warn');
}

/**
 * 创建数据库备份
 * @returns 备份文件路径
 */
async function backupDatabase(): Promise<string> {
  // 生成带时间戳的备份文件名
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = join(app.getPath('userData'), `database-backup-${timestamp}.db`);
  const dbPath = process.env.DATABASE_URL?.replace('file:', '') || getDatabasePath();
  
  // 复制数据库文件到备份路径
  await fs.copyFile(dbPath, backupPath);
  log(`数据库备份完成: ${backupPath}`);
  return backupPath;
}

/**
 * 从备份恢复数据库
 * @param backupPath 备份文件路径
 */
async function restoreDatabase(backupPath: string): Promise<void> {
  const dbPath = process.env.DATABASE_URL?.replace('file:', '') || getDatabasePath();
  await fs.copyFile(backupPath, dbPath);
  log(`数据库恢复完成`);
}

/**
 * 检查是否是首次安装（数据库文件不存在）
 * @returns 是否为首次安装
 */
function isFirstInstall(): boolean {
  const databasePath = getDatabasePath();
  return !existsSync(databasePath);
}

/**
 * 检查是否存在迁移文件夹
 * @returns 是否存在迁移文件夹
 */
function hasMigrationsFolder(): boolean {
  const migrationsPath = join(process.cwd(), "prisma", "migrations");
  return existsSync(migrationsPath);
}

/**
 * 检查是否有待应用的数据库迁移
 * @returns 是否有待应用的迁移
 */
async function hasPendingMigrations(): Promise<boolean> {
  const isDev = !app.isPackaged;
  
  // 生产环境下，如果是首次安装，不需要检查迁移
  if (!isDev && isFirstInstall()) {
    log("生产环境首次安装，跳过迁移检查");
    return false;
  }

  // 如果没有迁移文件夹，说明项目可能没有使用迁移功能
  if (!hasMigrationsFolder()) {
    log("未找到迁移文件夹，跳过迁移检查");
    return false;
  }

  try {
    // 根据环境选择合适的命令：开发环境用 yarn，生产环境用 npx
    const command = isDev ? "yarn prisma migrate status" : "npx prisma migrate status";
    
    const result = await execAsync(command, {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
    });
    
    // 检查输出中是否包含待应用的迁移标识
    return result.stdout.includes('pending') || 
           result.stdout.includes('unapplied');
  } catch (error) {
    log(`检查迁移状态失败: ${error}`, 'warn');
    
    // 生产环境下如果命令失败，保守假设不需要迁移
    if (!isDev) {
      log("生产环境检查迁移失败，假设不需要迁移");
      return false;
    }
    
    // 开发环境保守起见认为有迁移需要应用
    return true;
  }
}

/**
 * 应用数据库迁移
 * 执行所有待应用的迁移文件
 */
async function applyMigrations(): Promise<void> {
  const isDev = !app.isPackaged;
  // 根据环境选择迁移命令
  const command = isDev ? "yarn prisma migrate deploy" : "npx prisma migrate deploy";
  
  const result = await execAsync(command, {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
  });
  
  log(`数据库迁移成功`);
  // 如果有警告信息，记录下来
  if (result.stderr) {
    log(`迁移警告: ${result.stderr}`, 'warn');
  }
}

/**
 * 生产环境数据库推送处理
 * 包含备份、迁移和错误恢复逻辑
 */
async function runProductionDbPush(): Promise<void> {
  // 首次安装直接使用预构建的数据库，无需迁移
  if (isFirstInstall()) {
    log("生产环境首次安装，使用预构建数据库结构");
    return;
  }

  // 检查是否有待应用的迁移
  if (!(await hasPendingMigrations())) {
    log("无待应用的迁移，使用当前数据库结构");
    return;
  }

  log("发现待应用的迁移，开始数据库更新流程");
  
  // 创建数据库备份
  let backupPath: string;
  try {
    backupPath = await backupDatabase();
  } catch (error) {
    log("无法创建数据库备份，中止更新", 'error');
    throw error;
  }

  // 尝试应用迁移
  try {
    await applyMigrations();
  } catch (migrationError) {
    log(`数据库迁移失败: ${migrationError}`, 'error');
    
    // 迁移失败时尝试恢复数据库
    try {
      await restoreDatabase(backupPath);
      log("数据库已恢复到更新前状态");
    } catch (restoreError) {
      log(`数据库恢复失败: ${restoreError}`, 'error');
    }
    
    // 显示错误对话框，给用户提供解决建议
    dialog.showErrorBox(
      '数据库更新错误',
      '数据库更新失败，已恢复到之前的版本。\n\n建议：\n1. 检查是否有其他应用正在使用数据库\n2. 尝试重启应用\n3. 如果问题持续，请考虑回退到旧版本'
    );
    
    throw migrationError;
  }
}

/**
 * 开发环境数据库推送处理
 * 优先使用 migrate dev，失败时回退到 db push
 */
async function runDevelopmentDbPush(): Promise<void> {
  try {
    // 如果有迁移文件夹，优先使用 migrate dev 命令
    if (hasMigrationsFolder()) {
      await execAsync("yarn prisma migrate dev --name init", {
        cwd: process.cwd(),
        env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
      });
      log("Prisma 数据库迁移完成");
      return;
    }
  } catch (error) {
    log(`Prisma 迁移失败，使用 db push: ${error}`, 'warn');
  }
  
  // 回退到 db push 或没有迁移文件夹时直接使用 db push
  const result = await execAsync("yarn prisma db push --accept-data-loss", {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
  });
  
  log(`Prisma 数据结构推送完成`);
  // 记录推送过程中的警告信息
  if (result.stderr) {
    log(`数据推送警告: ${result.stderr}`, 'warn');
  }
}

/**
 * 初始化数据库连接
 * 创建 Prisma 客户端实例并设置数据库 URL
 * @returns Prisma 客户端实例
 */
export function initDatabase(): PrismaClient {
  // 如果已经初始化过，直接返回现有实例（单例模式）
  if (prisma) {
    return prisma;
  }

  const isDev = !app.isPackaged;
  const databasePath = getDatabasePath();
  
  log(`初始化数据库 - 环境: ${isDev ? '开发' : '生产'}, 路径: ${databasePath}`);

  // 生产环境需要初始化数据库文件
  if (!isDev) {
    initProductionDatabase(databasePath);
  }

  // 设置数据库连接 URL 环境变量
  process.env.DATABASE_URL = `file:${databasePath}`;

  // 创建 Prisma 客户端实例
  prisma = new PrismaClient({
    datasources: {
      db: {
        url: `file:${databasePath}`,
      },
    },
  });

  return prisma;
}

/**
 * 确保数据库存在且结构正确
 * 连接数据库、应用迁移、验证表结构
 */
export async function ensureDatabaseExists(): Promise<void> {
  if (!prisma) {
    throw new Error("数据库尚未初始化");
  }

  try {
    log("确保数据库存在且结构正确...");
    
    // 尝试连接数据库
    await prisma.$connect();
    log("数据库连接成功");

    const isDev = !app.isPackaged;
    
    // 根据环境执行不同的数据库推送策略
    if (isDev) {
      await runDevelopmentDbPush();
    } else {
      await runProductionDbPush();
    }

    // 验证数据库表结构（查询所有非系统表）
    try {
      const tables = await prisma.$queryRaw`
        SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';
      `;
      log(`数据库表: ${JSON.stringify(tables)}`);
    } catch (error) {
      log(`查询数据库表失败: ${error}`, 'warn');
    }

    log("数据库初始化完成");
  } catch (error) {
    log(`数据库初始化失败: ${error}`, 'error');
    throw error;
  }
}

/**
 * 获取数据库客户端实例
 * @returns Prisma 客户端实例
 * @throws 如果数据库未初始化则抛出错误
 */
export function getDatabase(): PrismaClient {
  if (!prisma) {
    throw new Error("数据库尚未初始化，请先调用 initDatabase()");
  }
  return prisma;
}

/**
 * 关闭数据库连接
 * 断开 Prisma 客户端连接并清理实例
 */
export async function closeDatabase(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
}

