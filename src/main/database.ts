import { PrismaClient } from "@prisma/client";
import { app, dialog } from "electron";
import { join, dirname } from "path";
import { existsSync, mkdirSync, copyFileSync, promises as fs } from "fs";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

/**
 * 数据库环境类型
 */
export type DatabaseEnvironment = "development" | "production";

/**
 * 数据库状态类型
 */
export type DatabaseStatus =
  | "not_initialized"
  | "initialized"
  | "migrating"
  | "ready"
  | "error";

/**
 * 数据库配置接口
 */
interface DatabaseConfig {
  environment: DatabaseEnvironment;
  databasePath: string;
  databaseUrl: string;
  migrationsPath: string;
  starterDbPath?: string;
  backupEnabled: boolean;
  autoMigrate: boolean;
}

/**
 * 数据库管理器类
 * 负责 Prisma 数据库的完整生命周期管理
 */
class DatabaseManager {
  private prisma: PrismaClient | null = null;
  private config: DatabaseConfig;
  private status: DatabaseStatus = "not_initialized";
  private isInitializing = false;

  constructor() {
    this.config = this.createConfig();
  }
  /**
   * 创建数据库配置
   */
  private createConfig(): DatabaseConfig {
    const environment: DatabaseEnvironment = app.isPackaged
      ? "production"
      : "development";
    const databasePath = this.getDatabasePath(environment);
    const databaseUrl = `file:${databasePath}`;

    return {
      environment,
      databasePath,
      databaseUrl,
      migrationsPath: this.getMigrationsPath(environment),
      starterDbPath: this.getStarterDbPath(),
      backupEnabled: environment === "production",
      autoMigrate: true,
    };
  }

  /**
   * 获取数据库文件路径
   */
  private getDatabasePath(env: DatabaseEnvironment): string {
    if (env === "development") {
      // 开发环境：使用项目根目录下的 dev.db
      return join(process.cwd(), "prisma", "dev.db");
    } else {
      // 生产环境：使用用户数据目录下的 app.db
      const userDataPath = app.getPath("userData");
      this.ensureDirectoryExists(userDataPath);
      return join(userDataPath, "app.db");
    }
  }
  /**
   * 获取迁移文件路径
   */
  private getMigrationsPath(environment?: DatabaseEnvironment): string {
    const env = environment || this.config?.environment || "development";
    
    if (env === "production") {
      // 生产环境：从资源目录或可执行文件目录查找
      const possiblePaths = [
        join(process.resourcesPath, "prisma", "migrations"),
        join(__dirname, "..", "..", "prisma", "migrations"),
        join(__dirname, "..", "prisma", "migrations"),
      ];

      for (const path of possiblePaths) {
        if (existsSync(path)) {
          return path;
        }
      }

      // 如果找不到，使用默认路径
      return join(process.resourcesPath, "prisma", "migrations");
    } else {
      // 开发环境：使用项目目录
      return join(process.cwd(), "prisma", "migrations");
    }
  }

  /**
   * 获取初始数据库模板路径
   */
  private getStarterDbPath(): string | undefined {
    const possiblePaths = [
      join(process.resourcesPath, "prisma", "starter.db"),
      join(__dirname, "..", "..", "resources", "prisma", "starter.db"),
      join(process.cwd(), "resources", "prisma", "starter.db"),
    ];

    for (const path of possiblePaths) {
      if (existsSync(path)) {
        return path;
      }
    }

    return undefined;
  }

  /**
   * 确保目录存在
   */
  private ensureDirectoryExists(dirPath: string): void {
    if (!existsSync(dirPath)) {
      mkdirSync(dirPath, { recursive: true });
    }
  }

  /**
   * 记录日志
   */
  private log(
    message: string,
    level: "info" | "warn" | "error" = "info"
  ): void {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [DATABASE ${level.toUpperCase()}] ${message}`;
    console.log(logMessage);
  }

  /**
   * 检查是否为首次安装
   */
  private isFirstInstall(): boolean {
    return !existsSync(this.config.databasePath);
  }

  /**
   * 检查是否存在迁移文件
   */
  private hasMigrations(): boolean {
    return existsSync(this.config.migrationsPath);
  }

  /**
   * 创建数据库备份
   */
  private async createBackup(): Promise<string | null> {
    if (!this.config.backupEnabled || this.isFirstInstall()) {
      return null;
    }

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const backupDir = join(app.getPath("userData"), "backups");
      this.ensureDirectoryExists(backupDir);

      const backupPath = join(backupDir, `database-backup-${timestamp}.db`);
      await fs.copyFile(this.config.databasePath, backupPath);

      this.log(`数据库备份完成: ${backupPath}`);
      return backupPath;
    } catch (error) {
      this.log(`创建备份失败: ${error}`, "error");
      return null;
    }
  }

  /**
   * 从备份恢复数据库
   */
  private async restoreFromBackup(backupPath: string): Promise<boolean> {
    try {
      await fs.copyFile(backupPath, this.config.databasePath);
      this.log(`从备份恢复数据库: ${backupPath}`);
      return true;
    } catch (error) {
      this.log(`恢复备份失败: ${error}`, "error");
      return false;
    }
  }

  /**
   * 初始化生产环境数据库
   */
  private async initProductionDatabase(): Promise<void> {
    if (!this.isFirstInstall()) {
      return;
    }

    this.log("首次安装，初始化生产环境数据库");

    // 确保数据库目录存在
    this.ensureDirectoryExists(dirname(this.config.databasePath));

    // 如果有初始数据库模板，复制它
    if (this.config.starterDbPath) {
      try {
        await fs.copyFile(this.config.starterDbPath, this.config.databasePath);
        this.log(`从模板初始化数据库: ${this.config.starterDbPath}`);
        return;
      } catch (error) {
        this.log(`复制初始数据库失败: ${error}`, "warn");
      }
    }

    this.log("未找到初始数据库模板，将通过迁移创建数据库");
  }
  /**
   * 检查迁移状态
   */
  private async checkMigrationStatus(): Promise<{
    hasPending: boolean;
    needsBaseline: boolean;
  }> {
    if (!this.hasMigrations()) {
      return { hasPending: false, needsBaseline: false };
    }

    try {
      // 检测包管理器
      const hasYarnLock = existsSync(join(process.cwd(), "yarn.lock"));
      const packageManager = hasYarnLock ? "yarn" : "npx";
      
      const command = `${packageManager} prisma migrate status`;

      const result = await execAsync(command, {
        cwd: process.cwd(),
        env: {
          ...process.env,
          DATABASE_URL: this.config.databaseUrl,
        },
      });

      const output = result.stdout + result.stderr;

      return {
        hasPending: output.includes("pending") || output.includes("unapplied"),
        needsBaseline: output.includes("baseline") || output.includes("shadow"),
      };
    } catch (error) {
      this.log(`检查迁移状态失败: ${error}`, "warn");

      // 如果是首次安装，认为需要迁移
      if (this.isFirstInstall()) {
        return { hasPending: true, needsBaseline: false };
      }

      return { hasPending: false, needsBaseline: false };
    }
  }

  /**
   * 应用数据库迁移
   */
  private async applyMigrations(): Promise<void> {
    this.status = "migrating";

    try {
      const { hasPending, needsBaseline } = await this.checkMigrationStatus();

      if (!hasPending) {
        this.log("无待应用的迁移");
        return;
      }      this.log("开始应用数据库迁移");

      // 检测包管理器
      const hasYarnLock = existsSync(join(process.cwd(), "yarn.lock"));
      const packageManager = hasYarnLock ? "yarn" : "npx";

      let command: string;

      if (this.config.environment === "development") {
        // 开发环境：使用 migrate dev 或 migrate deploy
        command = this.isFirstInstall()
          ? `${packageManager} prisma migrate dev --name init`
          : `${packageManager} prisma migrate dev`;
      } else {
        // 生产环境：使用 migrate deploy
        command = `${packageManager} prisma migrate deploy`;
      }

      const result = await execAsync(command, {
        cwd: process.cwd(),
        env: {
          ...process.env,
          DATABASE_URL: this.config.databaseUrl,
        },
      });

      this.log("数据库迁移完成");

      if (result.stderr) {
        this.log(`迁移警告: ${result.stderr}`, "warn");
      }
    } catch (error) {
      this.status = "error";
      this.log(`数据库迁移失败: ${error}`, "error");
      throw new Error(`数据库迁移失败: ${error}`);
    }
  }
  /**
   * 执行数据库推送（开发环境回退方案）
   */
  private async pushDatabase(): Promise<void> {
    try {
      this.log("执行数据库结构推送");

      // 检测包管理器
      const hasYarnLock = existsSync(join(process.cwd(), "yarn.lock"));
      const packageManager = hasYarnLock ? "yarn" : "npx";
      
      const command = `${packageManager} prisma db push --accept-data-loss`;

      const result = await execAsync(command, {
        cwd: process.cwd(),
        env: {
          ...process.env,
          DATABASE_URL: this.config.databaseUrl,
        },
      });

      this.log("数据库结构推送完成");

      if (result.stderr) {
        this.log(`推送警告: ${result.stderr}`, "warn");
      }
    } catch (error) {
      this.log(`数据库推送失败: ${error}`, "error");
      throw new Error(`数据库推送失败: ${error}`);
    }
  }
  /**
   * 生成 Prisma 客户端
   */
  private async generatePrismaClient(): Promise<void> {
    try {
      this.log("生成 Prisma 客户端");

      // 检测包管理器
      const hasYarnLock = existsSync(join(process.cwd(), "yarn.lock"));
      const packageManager = hasYarnLock ? "yarn" : "npx";
      
      const command = `${packageManager} prisma generate`;

      await execAsync(command, {
        cwd: process.cwd(),
        env: {
          ...process.env,
          DATABASE_URL: this.config.databaseUrl,
        },
      });

      this.log("Prisma 客户端生成完成");
    } catch (error) {
      this.log(`生成 Prisma 客户端失败: ${error}`, "warn");
      // 客户端生成失败不应该阻止应用启动，因为可能已经存在预生成的客户端
    }
  }

  /**
   * 验证数据库连接和结构
   */
  private async validateDatabase(): Promise<void> {
    if (!this.prisma) {
      throw new Error("Prisma 客户端未初始化");
    }

    try {
      // 测试数据库连接
      await this.prisma.$connect();
      this.log("数据库连接验证成功");

      // 查询数据库表结构
      const tables = (await this.prisma.$queryRaw`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma%';
      `) as Array<{ name: string }>;

      const tableNames = tables.map((table) => table.name);
      this.log(`数据库表: [${tableNames.join(", ")}]`);

      // 验证必要的表是否存在
      const expectedTables = ["User", "Post", "Category", "Prompt"];
      const missingTables = expectedTables.filter(
        (table) =>
          !tableNames.some((name) => name.toLowerCase() === table.toLowerCase())
      );

      if (missingTables.length > 0) {
        this.log(`缺少数据库表: [${missingTables.join(", ")}]`, "warn");
      }
    } catch (error) {
      this.log(`数据库验证失败: ${error}`, "error");
      throw new Error(`数据库验证失败: ${error}`);
    }
  }

  /**
   * 初始化数据库
   */
  public async initialize(): Promise<PrismaClient> {
    if (this.isInitializing) {
      throw new Error("数据库正在初始化中");
    }

    if (this.prisma && this.status === "ready") {
      return this.prisma;
    }

    this.isInitializing = true;
    this.status = "not_initialized";

    try {
      this.log(`开始初始化数据库 - 环境: ${this.config.environment}`);
      this.log(`数据库路径: ${this.config.databasePath}`);

      // 1. 生产环境初始化数据库文件
      if (this.config.environment === "production") {
        await this.initProductionDatabase();
      }

      // 2. 设置环境变量
      process.env.DATABASE_URL = this.config.databaseUrl;

      // 3. 创建 Prisma 客户端
      this.prisma = new PrismaClient({
        datasources: {
          db: {
            url: this.config.databaseUrl,
          },
        },
      });

      this.status = "initialized";

      // 4. 如果启用自动迁移，应用数据库迁移
      if (this.config.autoMigrate) {
        // 创建备份（仅生产环境且非首次安装）
        const backupPath = await this.createBackup();

        try {
          // 尝试应用迁移
          await this.applyMigrations();
        } catch (migrationError) {
          this.log(`迁移失败，尝试数据库推送`, "warn");

          // 如果迁移失败，尝试从备份恢复
          if (backupPath) {
            await this.restoreFromBackup(backupPath);
          }

          // 在开发环境，尝试使用 db push 作为回退
          if (this.config.environment === "development") {
            try {
              await this.pushDatabase();
            } catch (pushError) {
              this.status = "error";
              throw new Error(
                `迁移和推送都失败: ${migrationError}, ${pushError}`
              );
            }
          } else {
            this.status = "error";

            // 生产环境迁移失败，显示错误对话框
            dialog.showErrorBox(
              "数据库更新失败",
              `数据库迁移失败，请尝试以下解决方案：\n\n1. 重启应用\n2. 检查是否有其他程序占用数据库\n3. 联系技术支持\n\n错误详情: ${migrationError}`
            );

            throw migrationError;
          }
        }
      }

      // 5. 生成 Prisma 客户端（如果需要）
      await this.generatePrismaClient();

      // 6. 验证数据库
      await this.validateDatabase();

      this.status = "ready";
      this.log("数据库初始化完成");

      return this.prisma;
    } catch (error) {
      this.status = "error";
      this.log(`数据库初始化失败: ${error}`, "error");

      // 清理资源
      if (this.prisma) {
        try {
          await this.prisma.$disconnect();
        } catch {}
        this.prisma = null;
      }

      throw error;
    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * 获取数据库客户端实例
   */
  public getClient(): PrismaClient {
    if (!this.prisma || this.status !== "ready") {
      throw new Error("数据库未初始化或未就绪，请先调用 initialize()");
    }
    return this.prisma;
  }

  /**
   * 获取数据库状态
   */
  public getStatus(): DatabaseStatus {
    return this.status;
  }

  /**
   * 获取数据库配置
   */
  public getConfig(): Readonly<DatabaseConfig> {
    return { ...this.config };
  }

  /**
   * 关闭数据库连接
   */
  public async close(): Promise<void> {
    if (this.prisma) {
      try {
        await this.prisma.$disconnect();
        this.log("数据库连接已关闭");
      } catch (error) {
        this.log(`关闭数据库连接时出错: ${error}`, "error");
      } finally {
        this.prisma = null;
        this.status = "not_initialized";
      }
    }
  }

  /**
   * 手动触发数据库迁移
   */
  public async migrate(): Promise<void> {
    if (this.status !== "ready") {
      throw new Error("数据库未就绪，无法执行迁移");
    }

    const backupPath = await this.createBackup();

    try {
      await this.applyMigrations();
    } catch (error) {
      if (backupPath) {
        await this.restoreFromBackup(backupPath);
      }
      throw error;
    }
  }

  /**
   * 手动创建备份
   */
  public async backup(): Promise<string | null> {
    return await this.createBackup();
  }
}

// 全局数据库管理器实例
const databaseManager = new DatabaseManager();

// 导出的公共 API
export const initDatabase = () => databaseManager.initialize();
export const getDatabase = () => databaseManager.getClient();
export const closeDatabase = () => databaseManager.close();
export const getDatabaseStatus = () => databaseManager.getStatus();
export const getDatabaseConfig = () => databaseManager.getConfig();
export const migrateDatabase = () => databaseManager.migrate();
export const backupDatabase = () => databaseManager.backup();

// 向后兼容的别名
export const ensureDatabaseExists = initDatabase;
