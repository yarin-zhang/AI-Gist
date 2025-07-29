// 标准库导入
import path from 'path';

// 本地模块导入
import { CloudStorageProvider, CloudFileInfo, WebDAVConfig } from '@shared/types/cloud-backup';

/**
 * 常量定义
 */
const CONSTANTS = {
  DEFAULT_PATHS: {
    ROOT: '/',
    DEFAULT_DIR: '/'
  },
  ERROR_MESSAGES: {
    CLIENT_INIT_FAILED: 'WebDAV 客户端初始化失败',
    CONNECTION_TEST_FAILED: 'WebDAV 连接测试失败',
    LIST_FILES_FAILED: '列出文件失败',
    READ_FILE_FAILED: '读取文件失败',
    WRITE_FILE_FAILED: '写入文件失败',
    DELETE_FILE_FAILED: '删除文件失败',
    CREATE_DIRECTORY_FAILED: '创建目录失败',
    MODULE_EXPORT_ERROR: 'webdav 模块没有导出 createClient 方法'
  },
  LOG_MESSAGES: {
    CLIENT_INIT_FAILED: 'WebDAV 客户端初始化失败:',
    CONNECTION_TEST_FAILED: 'WebDAV 连接测试失败:',
    LIST_FILES_FAILED: 'WebDAV 列出文件失败:',
    READ_FILE_FAILED: 'WebDAV 读取文件失败:',
    WRITE_FILE_FAILED: 'WebDAV 写入文件失败:',
    DELETE_FILE_FAILED: 'WebDAV 删除文件失败:',
    CREATE_DIRECTORY_FAILED: 'WebDAV 创建目录失败:'
  }
} as const;

/**
 * WebDAV 云存储提供者
 * 实现 WebDAV 协议的云存储功能，包括文件上传、下载、删除等操作
 */
export class WebDAVProvider implements CloudStorageProvider {
  // ==================== 私有属性 ====================
  private client: any;
  private config: WebDAVConfig;
  private clientReady: Promise<void>;

  // ==================== 构造函数和初始化 ====================

  /**
   * 构造函数
   * @param config WebDAV 配置信息
   */
  constructor(config: WebDAVConfig) {
    this.config = config;
    this.clientReady = this.initClient();
  }

  /**
   * 初始化 WebDAV 客户端
   * 动态导入 webdav 模块并创建客户端实例
   */
  private async initClient(): Promise<void> {
    try {
      // 使用 eval 来动态导入 webdav 模块，避免 TypeScript 编译时的模块解析问题
      const webdavModule = await eval('import("webdav")');
      
      // webdav 模块直接导出 createClient 方法
      const { createClient } = webdavModule as any;
      
      if (typeof createClient !== 'function') {
        throw new Error(CONSTANTS.ERROR_MESSAGES.MODULE_EXPORT_ERROR);
      }

      this.client = createClient(this.config.url, {
        username: this.config.username,
        password: this.config.password,
      });
    } catch (error) {
      console.error(CONSTANTS.LOG_MESSAGES.CLIENT_INIT_FAILED, error);
      throw new Error(`${CONSTANTS.ERROR_MESSAGES.CLIENT_INIT_FAILED}: ${this.getErrorMessage(error)}`);
    }
  }

  /**
   * 确保客户端已准备就绪
   */
  private async ensureClient(): Promise<void> {
    await this.clientReady;
  }

  /**
   * 初始化目录结构
   * 为坚果云等服务创建必要的目录
   */
  async initializeDirectories(): Promise<void> {
    await this.ensureClient();
    try {
      // 创建默认的备份目录
      const defaultBackupDir = '/AI-Gist-Backup';
      await this.createDirectory(defaultBackupDir);
      console.log('WebDAV 目录初始化成功');
    } catch (error) {
      console.warn('WebDAV 目录初始化失败，可能目录已存在:', error);
      // 不抛出错误，因为目录可能已经存在
    }
  }

  // ==================== 连接测试 ====================

  /**
   * 测试 WebDAV 连接
   * @returns 连接是否成功
   */
  async testConnection(): Promise<boolean> {
    await this.ensureClient();
    try {
      // 首先尝试访问根目录
      try {
        await this.client.getDirectoryContents(CONSTANTS.DEFAULT_PATHS.ROOT);
        return true;
      } catch (rootError) {
        // 如果根目录访问失败，尝试创建默认目录（适用于坚果云等服务）
        console.log('根目录访问失败，尝试创建默认目录...');
        
        // 创建默认的备份目录
        const defaultBackupDir = '/AI-Gist-Backup';
        try {
          await this.createDirectory(defaultBackupDir);
          console.log('默认备份目录创建成功');
          return true;
        } catch (createError) {
          console.error('创建默认目录失败:', createError);
          // 如果创建目录也失败，返回false
          return false;
        }
      }
    } catch (error) {
      console.error(CONSTANTS.LOG_MESSAGES.CONNECTION_TEST_FAILED, error);
      return false;
    }
  }

  // ==================== 文件操作 ====================

  /**
   * 列出指定目录下的文件
   * @param dirPath 目录路径，默认为根目录
   * @returns 文件信息列表
   */
  async listFiles(dirPath?: string): Promise<CloudFileInfo[]> {
    await this.ensureClient();
    try {
      // 如果没有指定路径，使用默认路径 /
      const targetPath = dirPath || CONSTANTS.DEFAULT_PATHS.DEFAULT_DIR;
      const contents = await this.client.getDirectoryContents(targetPath);
      const files = Array.isArray(contents) ? contents : contents.data || [];
      return files.map((item: any) => this.mapFileInfo(item));
    } catch (error) {
      console.error(CONSTANTS.LOG_MESSAGES.LIST_FILES_FAILED, error);
      throw new Error(`${CONSTANTS.ERROR_MESSAGES.LIST_FILES_FAILED}: ${this.getErrorMessage(error)}`);
    }
  }

  /**
   * 读取文件内容
   * @param filePath 文件路径
   * @returns 文件内容缓冲区
   */
  async readFile(filePath: string): Promise<Buffer> {
    await this.ensureClient();
    try {
      const stream = await this.client.createReadStream(filePath);
      return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        stream.on('data', (chunk: Buffer) => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
      });
    } catch (error) {
      console.error(CONSTANTS.LOG_MESSAGES.READ_FILE_FAILED, error);
      throw new Error(`${CONSTANTS.ERROR_MESSAGES.READ_FILE_FAILED}: ${this.getErrorMessage(error)}`);
    }
  }

  /**
   * 写入文件内容
   * @param filePath 文件路径
   * @param data 文件数据
   */
  async writeFile(filePath: string, data: Buffer): Promise<void> {
    await this.ensureClient();
    try {
      const dirPath = path.dirname(filePath);
      await this.createDirectory(dirPath);
      await this.client.putFileContents(filePath, data);
    } catch (error) {
      console.error(CONSTANTS.LOG_MESSAGES.WRITE_FILE_FAILED, error);
      throw new Error(`${CONSTANTS.ERROR_MESSAGES.WRITE_FILE_FAILED}: ${this.getErrorMessage(error)}`);
    }
  }

  /**
   * 删除文件
   * @param filePath 文件路径
   */
  async deleteFile(filePath: string): Promise<void> {
    await this.ensureClient();
    try {
      await this.client.deleteFile(filePath);
    } catch (error) {
      console.error(CONSTANTS.LOG_MESSAGES.DELETE_FILE_FAILED, error);
      throw new Error(`${CONSTANTS.ERROR_MESSAGES.DELETE_FILE_FAILED}: ${this.getErrorMessage(error)}`);
    }
  }

  // ==================== 目录操作 ====================

  /**
   * 创建目录
   * 支持递归创建多级目录结构
   * @param dirPath 目录路径
   */
  async createDirectory(dirPath: string): Promise<void> {
    await this.ensureClient();
    try {
      // 首先检查目录是否已存在
      if (await this.directoryExists(dirPath)) {
        return;
      }

      // 递归创建目录结构
      await this.createDirectoryRecursively(dirPath);
    } catch (error) {
      console.error(CONSTANTS.LOG_MESSAGES.CREATE_DIRECTORY_FAILED, error);
      throw new Error(`${CONSTANTS.ERROR_MESSAGES.CREATE_DIRECTORY_FAILED}: ${this.getErrorMessage(error)}`);
    }
  }

  /**
   * 检查目录是否存在
   * @param dirPath 目录路径
   * @returns 目录是否存在
   */
  private async directoryExists(dirPath: string): Promise<boolean> {
    try {
      await this.client.getDirectoryContents(dirPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 递归创建目录结构
   * @param dirPath 目录路径
   */
  private async createDirectoryRecursively(dirPath: string): Promise<void> {
    const parts = dirPath.split('/').filter(Boolean);
    let currentPath = '';
    
    for (const part of parts) {
      currentPath += '/' + part;
      try {
        await this.client.createDirectory(currentPath);
      } catch (error: any) {
        // 忽略目录已存在的错误
        if (!error.message?.includes('already exists') && 
            !error.message?.includes('405') && // Method Not Allowed
            !error.message?.includes('409')) { // Conflict
          console.warn(`创建目录失败: ${currentPath}`, error);
          // 对于坚果云等服务，可能需要特殊处理
          // 尝试继续，因为目录可能已经存在
        }
      }
    }
  }

  // ==================== 工具方法 ====================

  /**
   * 映射文件信息
   * @param item 原始文件项
   * @returns 标准化的文件信息
   */
  private mapFileInfo(item: any): CloudFileInfo {
    return {
      name: item.basename,
      path: item.filename,
      size: item.size || 0,
      isDirectory: item.type === 'directory',
      modifiedAt: item.lastmod || new Date().toISOString(),
    };
  }

  /**
   * 获取错误信息
   * @param error 错误对象
   * @returns 格式化的错误信息
   */
  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : '未知错误';
  }
}