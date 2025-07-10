// 标准库导入
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// 本地模块导入
import { CloudStorageProvider, CloudFileInfo, ICloudConfig } from '@shared/types/cloud-backup';

/**
 * 常量定义
 */
const CONSTANTS = {
  PLATFORMS: {
    DARWIN: 'darwin',
    WIN32: 'win32',
    LINUX: 'linux'
  },
  ICLOUD_PATHS: {
    MACOS: [
      'Library/Mobile Documents/com~apple~CloudDocs',
      'iCloud Drive',
      'iCloudDrive',
      'Library/CloudStorage/iCloud Drive'
    ],
    WINDOWS: [
      'iCloudDrive',
      'iCloud Drive',
      'OneDrive/iCloud Drive'
    ]
  },
  ERROR_MESSAGES: {
    EMPTY_PATH: 'iCloud 路径不能为空',
    UNSUPPORTED_OS: '不支持的操作系统',
    LINUX_NOT_SUPPORTED: 'Linux 系统不支持 iCloud Drive',
    MACOS_NOT_FOUND: 'iCloud Drive 未启用或不可访问',
    MACOS_DETECTION_FAILED: 'iCloud Drive 检测失败',
    WINDOWS_NOT_FOUND: '未检测到 iCloud Drive 目录，请先安装 iCloud for Windows。如已配置完毕，请重启本应用。',
    CONNECTION_TEST_FAILED: 'iCloud Drive 连接测试失败',
    LIST_FILES_FAILED: 'iCloud Drive 列出文件失败',
    READ_FILE_FAILED: 'iCloud Drive 读取文件失败',
    WRITE_FILE_FAILED: 'iCloud Drive 写入文件失败',
    DELETE_FILE_FAILED: 'iCloud Drive 删除文件失败',
    CREATE_DIRECTORY_FAILED: 'iCloud Drive 创建目录失败'
  },
  LOG_MESSAGES: {
    DETECTING_ICLOUD: '检测 iCloud 可用性，平台: {platform}, 用户主目录: {homedir}',
    CHECKING_PATH: '检查路径: {path}',
    PATH_EXISTS: '{platform} iCloud 路径存在: {path}',
    PATH_NOT_EXISTS: '路径不存在: {path}',
    MACOS_NOT_FOUND: 'macOS 未找到 iCloud 路径',
    WINDOWS_PATHS: 'Windows iCloud 可能路径: {paths}',
    WINDOWS_NOT_FOUND: 'Windows 未找到 iCloud 路径',
    DETECTION_FAILED: '检测 {platform} iCloud 路径失败: {error}',
    PATH_CHECK_FAILED: '检查 {platform} iCloud 路径失败: {path}',
    CONNECTION_TEST_FAILED: 'iCloud Drive 连接测试失败: {error}',
    LIST_FILES_FAILED: 'iCloud Drive 列出文件失败: {error}',
    READ_FILE_FAILED: 'iCloud Drive 读取文件失败: {error}',
    WRITE_FILE_FAILED: 'iCloud Drive 写入文件失败: {error}',
    DELETE_FILE_FAILED: 'iCloud Drive 删除文件失败: {error}',
    CREATE_DIRECTORY_FAILED: 'iCloud Drive 创建目录失败: {error}',
    GET_FILE_INFO_FAILED: '无法获取文件信息: {path}'
  }
} as const;

/**
 * iCloud 存储提供者
 * 负责与 iCloud Drive 进行文件操作交互
 */
export class ICloudProvider implements CloudStorageProvider {
  // ==================== 私有属性 ====================
  private config: ICloudConfig;
  private basePath: string;

  // ==================== 构造函数 ====================

  /**
   * 构造函数
   * @param config iCloud 配置信息
   */
  constructor(config: ICloudConfig) {
    this.config = config;
    this.validateConfig();
    this.basePath = '';
  }

  // ==================== 静态方法 ====================

  /**
   * 检测 iCloud 是否可用
   * @returns 可用性检测结果
   */
  static async isICloudAvailable(): Promise<{ available: boolean; reason?: string }> {
    const platform = os.platform();
    const homedir = os.homedir();
    
    console.log(CONSTANTS.LOG_MESSAGES.DETECTING_ICLOUD
      .replace('{platform}', platform)
      .replace('{homedir}', homedir));
    
    // Linux 系统不支持
    if (platform === CONSTANTS.PLATFORMS.LINUX) {
      return { available: false, reason: CONSTANTS.ERROR_MESSAGES.LINUX_NOT_SUPPORTED };
    }
    
    // macOS 系统检测
    if (platform === CONSTANTS.PLATFORMS.DARWIN) {
      return await this.checkMacOSAvailability(homedir);
    }
    
    // Windows 系统检测
    if (platform === CONSTANTS.PLATFORMS.WIN32) {
      return await this.checkWindowsAvailability(homedir);
    }
    
    return { available: false, reason: CONSTANTS.ERROR_MESSAGES.UNSUPPORTED_OS };
  }

  // ==================== 私有方法 ====================

  /**
   * 验证配置
   */
  private validateConfig(): void {
    if (!this.config.path || this.config.path.trim() === '') {
      throw new Error(CONSTANTS.ERROR_MESSAGES.EMPTY_PATH);
    }
  }

  /**
   * 检测 macOS iCloud 可用性
   * @param homedir 用户主目录
   * @returns 可用性检测结果
   */
  private static async checkMacOSAvailability(homedir: string): Promise<{ available: boolean; reason?: string }> {
    const possiblePaths = CONSTANTS.ICLOUD_PATHS.MACOS.map(p => path.join(homedir, p));
    
    try {
      const fsSync = await import('fs');
      
      for (const basePath of possiblePaths) {
        console.log(CONSTANTS.LOG_MESSAGES.CHECKING_PATH.replace('{path}', basePath));
        
        if (fsSync.default.existsSync(basePath)) {
          console.log(CONSTANTS.LOG_MESSAGES.PATH_EXISTS
            .replace('{platform}', 'macOS')
            .replace('{path}', basePath));
          return { available: true };
        } else {
          console.log(CONSTANTS.LOG_MESSAGES.PATH_NOT_EXISTS.replace('{path}', basePath));
        }
      }
      
      console.log(CONSTANTS.LOG_MESSAGES.MACOS_NOT_FOUND);
      return { available: false, reason: CONSTANTS.ERROR_MESSAGES.MACOS_NOT_FOUND };
    } catch (error) {
      console.error(CONSTANTS.LOG_MESSAGES.DETECTION_FAILED
        .replace('{platform}', 'macOS')
        .replace('{error}', String(error)));
      return { available: false, reason: CONSTANTS.ERROR_MESSAGES.MACOS_DETECTION_FAILED };
    }
  }

  /**
   * 检测 Windows iCloud 可用性
   * @param homedir 用户主目录
   * @returns 可用性检测结果
   */
  private static async checkWindowsAvailability(homedir: string): Promise<{ available: boolean; reason?: string }> {
    const possiblePaths = CONSTANTS.ICLOUD_PATHS.WINDOWS.map(p => path.join(homedir, p));
    
    console.log(CONSTANTS.LOG_MESSAGES.WINDOWS_PATHS.replace('{paths}', JSON.stringify(possiblePaths)));
    
    for (const basePath of possiblePaths) {
      try {
        const fsSync = await import('fs');
        if (fsSync.default.existsSync(basePath)) {
          console.log(CONSTANTS.LOG_MESSAGES.PATH_EXISTS
            .replace('{platform}', 'Windows')
            .replace('{path}', basePath));
          return { available: true };
        }
      } catch (error) {
        console.warn(CONSTANTS.LOG_MESSAGES.PATH_CHECK_FAILED
          .replace('{platform}', 'Windows')
          .replace('{path}', basePath), error);
        continue;
      }
    }
    
    console.log(CONSTANTS.LOG_MESSAGES.WINDOWS_NOT_FOUND);
    return { available: false, reason: CONSTANTS.ERROR_MESSAGES.WINDOWS_NOT_FOUND };
  }

  /**
   * 获取 iCloud 基础路径
   * @returns iCloud 基础路径
   */
  private async getICloudBasePath(): Promise<string> {
    const platform = os.platform();
    const homedir = os.homedir();
    
    if (platform === CONSTANTS.PLATFORMS.DARWIN) {
      return await this.getMacOSBasePath(homedir);
    }
    
    if (platform === CONSTANTS.PLATFORMS.WIN32) {
      return await this.getWindowsBasePath(homedir);
    }
    
    throw new Error(CONSTANTS.ERROR_MESSAGES.UNSUPPORTED_OS);
  }

  /**
   * 获取 macOS iCloud 基础路径
   * @param homedir 用户主目录
   * @returns iCloud 基础路径
   */
  private async getMacOSBasePath(homedir: string): Promise<string> {
    const possiblePaths = CONSTANTS.ICLOUD_PATHS.MACOS.map(p => path.join(homedir, p));
    
    for (const basePath of possiblePaths) {
      try {
        const fsSync = await import('fs');
        if (fsSync.default.existsSync(basePath)) {
          return basePath;
        }
      } catch {
        continue;
      }
    }
    
    // 如果都找不到，使用默认路径
    return path.join(homedir, CONSTANTS.ICLOUD_PATHS.MACOS[0]);
  }

  /**
   * 获取 Windows iCloud 基础路径
   * @param homedir 用户主目录
   * @returns iCloud 基础路径
   */
  private async getWindowsBasePath(homedir: string): Promise<string> {
    const possiblePaths = CONSTANTS.ICLOUD_PATHS.WINDOWS.map(p => path.join(homedir, p));
    
    for (const basePath of possiblePaths) {
      try {
        const fsSync = await import('fs');
        if (fsSync.default.existsSync(basePath)) {
          return basePath;
        }
      } catch {
        continue;
      }
    }
    
    // 如果都找不到，使用默认路径
    return path.join(homedir, CONSTANTS.ICLOUD_PATHS.WINDOWS[0]);
  }

  /**
   * 构建完整路径
   * @param basePath 基础路径
   * @param filePath 文件路径
   * @returns 完整路径
   */
  private buildFullPath(basePath: string, filePath?: string): string {
    const configPath = path.join(basePath, this.config.path);
    return filePath ? path.join(configPath, filePath) : configPath;
  }

  /**
   * 处理文件操作错误
   * @param operation 操作名称
   * @param error 错误对象
   * @returns 格式化的错误消息
   */
  private handleFileOperationError(operation: string, error: unknown): string {
    const errorMessage = error instanceof Error ? error.message : '未知错误';
    return `${operation}失败: ${errorMessage}`;
  }

  // ==================== 公共方法 ====================

  /**
   * 测试连接
   * @returns 连接是否成功
   */
  async testConnection(): Promise<boolean> {
    try {
      const basePath = await this.getICloudBasePath();
      const fullPath = this.buildFullPath(basePath);
      
      // 尝试访问目录，如果不存在则创建
      try {
        await fs.access(fullPath);
      } catch {
        // 目录不存在，创建它
        await fs.mkdir(fullPath, { recursive: true });
      }
      
      return true;
    } catch (error) {
      console.error(CONSTANTS.LOG_MESSAGES.CONNECTION_TEST_FAILED.replace('{error}', String(error)));
      return false;
    }
  }

  /**
   * 列出文件
   * @param dirPath 目录路径（可选）
   * @returns 文件信息列表
   */
  async listFiles(dirPath?: string): Promise<CloudFileInfo[]> {
    try {
      const basePath = await this.getICloudBasePath();
      const targetPath = this.buildFullPath(basePath, dirPath);
      const entries = await fs.readdir(targetPath, { withFileTypes: true });
      
      const files: CloudFileInfo[] = [];
      
      for (const entry of entries) {
        const fullPath = path.join(targetPath, entry.name);
        
        try {
          const stats = await fs.stat(fullPath);
          files.push({
            name: entry.name,
            path: entry.name, // 相对路径就是文件名
            size: stats.size,
            isDirectory: entry.isDirectory(),
            modifiedAt: stats.mtime.toISOString(),
          });
        } catch (error) {
          console.warn(CONSTANTS.LOG_MESSAGES.GET_FILE_INFO_FAILED.replace('{path}', fullPath), error);
        }
      }
      
      return files;
    } catch (error) {
      console.error(CONSTANTS.LOG_MESSAGES.LIST_FILES_FAILED.replace('{error}', String(error)));
      throw new Error(this.handleFileOperationError('列出文件', error));
    }
  }

  /**
   * 读取文件
   * @param filePath 文件路径
   * @returns 文件内容缓冲区
   */
  async readFile(filePath: string): Promise<Buffer> {
    try {
      const basePath = await this.getICloudBasePath();
      const fullPath = this.buildFullPath(basePath, filePath);
      return await fs.readFile(fullPath);
    } catch (error) {
      console.error(CONSTANTS.LOG_MESSAGES.READ_FILE_FAILED.replace('{error}', String(error)));
      throw new Error(this.handleFileOperationError('读取文件', error));
    }
  }

  /**
   * 写入文件
   * @param filePath 文件路径
   * @param data 文件数据
   */
  async writeFile(filePath: string, data: Buffer): Promise<void> {
    try {
      const basePath = await this.getICloudBasePath();
      const fullPath = this.buildFullPath(basePath, filePath);
      const dirPath = path.dirname(fullPath);
      
      // 确保目录存在（如果文件名包含路径）
      if (dirPath !== this.buildFullPath(basePath)) {
        await fs.mkdir(dirPath, { recursive: true });
      }
      
      // 写入文件
      await fs.writeFile(fullPath, data);
    } catch (error) {
      console.error(CONSTANTS.LOG_MESSAGES.WRITE_FILE_FAILED.replace('{error}', String(error)));
      throw new Error(this.handleFileOperationError('写入文件', error));
    }
  }

  /**
   * 删除文件
   * @param filePath 文件路径
   */
  async deleteFile(filePath: string): Promise<void> {
    try {
      const basePath = await this.getICloudBasePath();
      const fullPath = this.buildFullPath(basePath, filePath);
      await fs.unlink(fullPath);
    } catch (error) {
      console.error(CONSTANTS.LOG_MESSAGES.DELETE_FILE_FAILED.replace('{error}', String(error)));
      throw new Error(this.handleFileOperationError('删除文件', error));
    }
  }

  /**
   * 创建目录
   * @param dirPath 目录路径
   */
  async createDirectory(dirPath: string): Promise<void> {
    try {
      const basePath = await this.getICloudBasePath();
      const fullPath = this.buildFullPath(basePath, dirPath);
      
      // 检查目录是否已存在
      try {
        const stats = await fs.stat(fullPath);
        if (stats.isDirectory()) {
          return; // 目录已存在
        }
      } catch {
        // 目录不存在，创建它
      }

      // 递归创建目录
      await fs.mkdir(fullPath, { recursive: true });
    } catch (error) {
      console.error(CONSTANTS.LOG_MESSAGES.CREATE_DIRECTORY_FAILED.replace('{error}', String(error)));
      throw new Error(this.handleFileOperationError('创建目录', error));
    }
  }
} 