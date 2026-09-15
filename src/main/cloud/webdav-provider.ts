// 本地模块导入
import {
  CloudStorageProvider,
  CloudFileInfo,
  CloudFileWriteOptions,
  CloudFileWriteResult,
  WebDAVConfig
} from '@shared/types/cloud-backup';

type WebDAVClientFactory = (url: string, options: {
  username?: string;
  password?: string;
}) => any;

interface WebDAVModule {
  createClient?: WebDAVClientFactory;
  default?: {
    createClient?: WebDAVClientFactory;
  };
}

type RuntimeImporter = <T>(specifier: string) => Promise<T>;

declare global {
  var __AI_GIST_WEB_DAV_IMPORT__: RuntimeImporter | undefined;
}

// TypeScript 会把 CommonJS 目标里的原生动态导入编译成 CommonJS require 调用。
// 这里保留真正的运行时 import()，用于加载 webdav 5.x 这类 ESM-only 包。
const preservedRuntimeImport = new Function('specifier', 'return import(specifier)') as RuntimeImporter;

function runtimeImport<T>(specifier: string): Promise<T> {
  const importOverride = globalThis.__AI_GIST_WEB_DAV_IMPORT__;
  if (typeof importOverride === 'function') {
    return importOverride<T>(specifier);
  }

  return preservedRuntimeImport<T>(specifier);
}

function getWebDAVCreateClient(webdavModule: WebDAVModule): WebDAVClientFactory {
  const createClient = webdavModule.createClient || webdavModule.default?.createClient;
  if (typeof createClient !== 'function') {
    throw new Error(CONSTANTS.ERROR_MESSAGES.MODULE_EXPORT_ERROR);
  }

  return createClient;
}

/**
 * 常量定义
 */
const CONSTANTS = {
  DEFAULT_PATHS: {
    ROOT: '/',
    DEFAULT_DIR: '/'
  },
  BACKUP_DIR: 'AI-Gist-Backup',
  REQUEST_TIMEOUT_MS: 30_000,
  ERROR_MESSAGES: {
    CLIENT_INIT_FAILED: 'WebDAV 客户端初始化失败',
    CONNECTION_TEST_FAILED: 'WebDAV 连接测试失败',
    LIST_FILES_FAILED: '列出文件失败',
    READ_FILE_FAILED: '读取文件失败',
    WRITE_FILE_FAILED: '写入文件失败',
    DELETE_FILE_FAILED: '删除文件失败',
    CREATE_DIRECTORY_FAILED: '创建目录失败',
    WRITE_VERIFY_FAILED: '写入后远端校验失败',
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
  private requestTimeoutMs: number;

  // ==================== 构造函数和初始化 ====================

  /**
   * 构造函数
   * @param config WebDAV 配置信息
   */
  constructor(config: WebDAVConfig) {
    this.config = config;
    this.requestTimeoutMs = this.normalizeRequestTimeout(config.requestTimeoutMs);
    this.clientReady = this.initClient();
  }

  /**
   * 初始化 WebDAV 客户端
   * 动态导入 webdav 模块并创建客户端实例
   */
  private async initClient(): Promise<void> {
    try {
      const webdavModule = await runtimeImport<WebDAVModule>('webdav');
      const createClient = getWebDAVCreateClient(webdavModule);

      this.client = createClient(this.config.url, {
        username: this.config.username,
        password: this.config.password,
      });
    } catch (error) {
      this.logOperationError(CONSTANTS.LOG_MESSAGES.CLIENT_INIT_FAILED, error);
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
    const defaultBackupDir = this.getDefaultBackupDirectory();
    if (!defaultBackupDir) {
      return;
    }

    await this.createDirectory(defaultBackupDir);
    this.debugLog('WebDAV 目录初始化成功');
  }

  // ==================== 连接测试 ====================

  /**
   * 测试 WebDAV 连接
   * @returns 连接是否成功
   */
  async testConnection(): Promise<boolean> {
    await this.ensureClient();
    try {
      await this.initializeDirectories();

      const probeDir = this.getDefaultBackupDirectory();
      const probePath = this.joinRemotePath(
        probeDir,
        `.ai-gist-webdav-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
      );
      const probeData = Buffer.from(JSON.stringify({ ok: true, createdAt: new Date().toISOString() }), 'utf-8');

      await this.writeFile(probePath, probeData);
      const remoteData = await this.readFile(probePath);
      await this.deleteFile(probePath);

      return Buffer.compare(remoteData, probeData) === 0;
    } catch (error) {
      this.logOperationError(CONSTANTS.LOG_MESSAGES.CONNECTION_TEST_FAILED, error);
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
      const targetPath = this.normalizeRemotePath(dirPath || CONSTANTS.DEFAULT_PATHS.DEFAULT_DIR, true);
      const contents: any = await this.withRequestTimeout(
        signal => this.client.getDirectoryContents(targetPath, { signal, details: true }),
        '列出文件'
      );
      const files = Array.isArray(contents) ? contents : contents.data || [];
      return files.map((item: any) => this.mapFileInfo(item));
    } catch (error) {
      this.logOperationError(CONSTANTS.LOG_MESSAGES.LIST_FILES_FAILED, error);
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
      const data = await this.withRequestTimeout(
        signal => this.client.getFileContents(this.normalizeRemotePath(filePath), {
          format: 'binary',
          signal
        }),
        '读取文件'
      );
      if (Buffer.isBuffer(data)) {
        return data;
      }
      if (data instanceof ArrayBuffer) {
        return Buffer.from(data);
      }
      if (ArrayBuffer.isView(data)) {
        return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
      }
      return Buffer.from(String(data), 'utf-8');
    } catch (error) {
      this.logOperationError(CONSTANTS.LOG_MESSAGES.READ_FILE_FAILED, error);
      throw new Error(`${CONSTANTS.ERROR_MESSAGES.READ_FILE_FAILED}: ${this.getErrorMessage(error)}`);
    }
  }

  /**
   * 写入文件内容
   * @param filePath 文件路径
   * @param data 文件数据
   */
  async writeFile(
    filePath: string,
    data: Buffer,
    options: CloudFileWriteOptions = {}
  ): Promise<CloudFileWriteResult> {
    await this.ensureClient();
    try {
      const targetPath = this.normalizeRemotePath(filePath);
      const dirPath = this.dirnameRemotePath(targetPath);
      if (dirPath) {
        await this.createDirectory(dirPath);
      }

      const headers = this.createConditionalWriteHeaders(options);
      const uploaded = await this.withRequestTimeout(
        signal => this.client.putFileContents(targetPath, data, {
          overwrite: options.overwrite ?? true,
          contentLength: data.length,
          headers,
          signal
        }),
        '写入文件'
      );

      if (uploaded !== true) {
        throw new Error('WebDAV PUT 未返回成功状态');
      }

      return await this.verifyRemoteWrite(targetPath, data);
    } catch (error) {
      this.logOperationError(CONSTANTS.LOG_MESSAGES.WRITE_FILE_FAILED, error);
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
      await this.withRequestTimeout(
        signal => this.client.deleteFile(this.normalizeRemotePath(filePath), { signal }),
        '删除文件'
      );
    } catch (error) {
      this.logOperationError(CONSTANTS.LOG_MESSAGES.DELETE_FILE_FAILED, error);
      throw new Error(`${CONSTANTS.ERROR_MESSAGES.DELETE_FILE_FAILED}: ${this.getErrorMessage(error)}`);
    }
  }

  async getFileInfo(filePath: string): Promise<CloudFileInfo | null> {
    await this.ensureClient();
    try {
      const response: any = await this.withRequestTimeout(
        // Request detailed properties so we retain the wire ETag. webdav's
        // shorthand `etag` field strips quotes; If-Match needs the server's
        // original representation, whether quoted or unquoted.
        signal => this.client.stat(this.normalizeRemotePath(filePath), { signal, details: true }),
        '获取文件信息'
      );
      const stat = response?.data ?? response;
      if (!stat) {
        return null;
      }
      return this.mapFileInfo(stat);
    } catch (error) {
      if (this.isNotFoundError(error)) {
        return null;
      }
      throw error;
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
      const targetPath = this.normalizeRemotePath(dirPath, true);
      if (!targetPath || targetPath === CONSTANTS.DEFAULT_PATHS.ROOT) {
        return;
      }

      // 首先检查目录是否已存在
      if (await this.directoryExists(targetPath)) {
        return;
      }

      // 递归创建目录结构
      await this.createDirectoryRecursively(targetPath);
    } catch (error) {
      this.logOperationError(CONSTANTS.LOG_MESSAGES.CREATE_DIRECTORY_FAILED, error);
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
      const stat: any = await this.withRequestTimeout(
        signal => this.client.stat(this.normalizeRemotePath(dirPath, true), { signal }),
        '检查目录'
      );
      return stat?.type === 'directory';
    } catch (error) {
      if (this.isRequestTimeoutError(error)) {
        throw error;
      }
      return false;
    }
  }

  /**
   * 递归创建目录结构
   * @param dirPath 目录路径
   */
  private async createDirectoryRecursively(dirPath: string): Promise<void> {
    const parts = this.normalizeRemotePath(dirPath, true).split('/').filter(Boolean);
    let currentPath = '';
    
    for (const part of parts) {
      currentPath += '/' + part;
      if (await this.directoryExists(currentPath)) {
        continue;
      }

      try {
        await this.withRequestTimeout(
          signal => this.client.createDirectory(currentPath, { signal }),
          '创建目录'
        );
      } catch (error: any) {
        if (await this.directoryExists(currentPath) || this.isDirectoryAlreadyExistsError(error)) {
          continue;
        }

        throw error;
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
    const filename = this.normalizeRemotePath(item.filename || item.path || item.basename || '');
    const name = item.basename || filename.split('/').filter(Boolean).pop() || '';

    return {
      name,
      path: filename,
      size: item.size || 0,
      isDirectory: item.type === 'directory',
      modifiedAt: item.lastmod || new Date().toISOString(),
      etag: typeof item.props?.getetag === 'string'
        ? item.props.getetag
        : (typeof item.etag === 'string' ? item.etag : undefined),
    };
  }

  /**
   * 如果配置 URL 已经指向 AI-Gist-Backup，就直接在该 URL 下写入；否则使用子目录。
   */
  getDefaultBackupDirectory(): string {
    try {
      const pathname = new URL(this.config.url).pathname.replace(/\/+$/, '');
      if (pathname.split('/').filter(Boolean).pop() === CONSTANTS.BACKUP_DIR) {
        return '';
      }
    } catch {
      // URL 格式错误会在 webdav 客户端请求阶段暴露。
    }

    return `/${CONSTANTS.BACKUP_DIR}`;
  }

  private async verifyRemoteWrite(filePath: string, expectedData: Buffer): Promise<CloudFileWriteResult> {
    try {
      const response: any = await this.withRequestTimeout(
        signal => this.client.stat(filePath, { signal, details: true }),
        '校验远端文件'
      );
      const stat = response?.data ?? response;
      if (stat?.type === 'directory') {
        throw new Error('远端路径是目录，不是文件');
      }

      const remoteData = await this.readFile(filePath);
      if (remoteData.length !== expectedData.length || Buffer.compare(remoteData, expectedData) !== 0) {
        throw new Error('远端文件内容与本地备份不一致');
      }

      return {
        etag: stat ? this.mapFileInfo(stat).etag : undefined,
        modifiedAt: typeof stat?.lastmod === 'string' ? stat.lastmod : undefined
      };
    } catch (error) {
      throw new Error(`${CONSTANTS.ERROR_MESSAGES.WRITE_VERIFY_FAILED}: ${this.getErrorMessage(error)}`);
    }
  }

  private createConditionalWriteHeaders(options: CloudFileWriteOptions): Record<string, string> | undefined {
    const headers: Record<string, string> = {};
    if (options.ifMatch) {
      headers['If-Match'] = this.normalizeIfMatchHeaderValue(options.ifMatch);
    }
    if (options.ifNoneMatch) {
      headers['If-None-Match'] = '*';
    }
    return Object.keys(headers).length > 0 ? headers : undefined;
  }

  private normalizeIfMatchHeaderValue(etag: string): string {
    const value = etag.trim();
    // WebDAV servers are expected to quote ETags, but Jianguoyun returns the
    // token without quotes. The webdav package also strips quotes while
    // parsing PROPFIND responses. Preserve the server representation so the
    // conditional request matches both standard and non-standard servers.
    return value;
  }

  private normalizeRemotePath(remotePath: string, allowRoot = false): string {
    const segments = (remotePath || '')
      .split('/')
      .filter(Boolean);

    if (segments.length === 0) {
      return allowRoot ? CONSTANTS.DEFAULT_PATHS.ROOT : '';
    }

    return `/${segments.join('/')}`;
  }

  private dirnameRemotePath(remotePath: string): string {
    const normalized = this.normalizeRemotePath(remotePath);
    const segments = normalized.split('/').filter(Boolean);
    segments.pop();
    return segments.length > 0 ? `/${segments.join('/')}` : '';
  }

  private joinRemotePath(...parts: string[]): string {
    const segments = parts.flatMap(part => (part || '').split('/')).filter(Boolean);
    return segments.length > 0 ? `/${segments.join('/')}` : '';
  }

  private normalizeRequestTimeout(timeoutMs: number | undefined): number {
    return typeof timeoutMs === 'number' && Number.isFinite(timeoutMs) && timeoutMs > 0
      ? Math.floor(timeoutMs)
      : CONSTANTS.REQUEST_TIMEOUT_MS;
  }

  private async withRequestTimeout<T>(
    operation: (signal: AbortSignal) => Promise<T>,
    operationName: string
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs);

    try {
      return await operation(controller.signal);
    } catch (error) {
      if (controller.signal.aborted || this.isAbortError(error)) {
        throw new Error(`${operationName}超时（${this.formatRequestTimeout()}）`);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private formatRequestTimeout(): string {
    if (this.requestTimeoutMs >= 1000) {
      return `${Math.ceil(this.requestTimeoutMs / 1000)} 秒`;
    }
    return `${this.requestTimeoutMs} 毫秒`;
  }

  /**
   * 获取错误信息
   * @param error 错误对象
   * @returns 格式化的错误信息
   */
  private getErrorMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : '未知错误';
    const code = typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: string }).code || '')
      : '';
    return code && !message.includes(code) ? `${message} (${code})` : message;
  }

  private isDirectoryAlreadyExistsError(error: unknown): boolean {
    return /already exists|405|409/i.test(this.getErrorMessage(error));
  }

  private isNotFoundError(error: unknown): boolean {
    return /404|not\s*found|does not exist|ENOENT|不存在|未找到/i.test(this.getErrorMessage(error));
  }

  private isAbortError(error: unknown): boolean {
    const name = error instanceof Error ? error.name : '';
    const message = this.getErrorMessage(error);
    return name === 'AbortError' ||
      message.includes('AbortError') ||
      message.toLowerCase().includes('aborted');
  }

  private isRequestTimeoutError(error: unknown): boolean {
    return this.getErrorMessage(error).includes('超时');
  }

  private debugLog(...args: unknown[]): void {
    if (!this.isDebugLoggingEnabled()) {
      return;
    }
    console.debug(...args);
  }

  private isDebugLoggingEnabled(): boolean {
    return process.env.AI_GIST_DEBUG_CLOUD === '1' ||
      (process.env.DEBUG || '').split(',').some(scope => scope.trim() === 'ai-gist:cloud');
  }

  private logOperationError(message: string, error: unknown): void {
    if (!this.isDebugLoggingEnabled()) {
      return;
    }
    console.debug(message, error);
  }
}
