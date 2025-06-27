import path from 'path';
import { CloudStorageProvider, CloudFileInfo, WebDAVConfig } from '@shared/types/cloud-backup';

export class WebDAVProvider implements CloudStorageProvider {
  private client: any;
  private config: WebDAVConfig;
  private clientReady: Promise<void>;

  constructor(config: WebDAVConfig) {
    this.config = config;
    this.clientReady = this.initClient();
  }

  private async initClient() {
    try {
      // 使用 eval 来动态导入 webdav 模块，避免 TypeScript 编译时的模块解析问题
      const webdavModule = await eval('import("webdav")');
      
      // webdav 模块直接导出 createClient 方法
      const { createClient } = webdavModule as any;
      
      if (typeof createClient !== 'function') {
        throw new Error('webdav 模块没有导出 createClient 方法');
      }

      this.client = createClient(this.config.url, {
        username: this.config.username,
        password: this.config.password,
      });
    } catch (error) {
      console.error('WebDAV 客户端初始化失败:', error);
      throw new Error(`WebDAV 客户端初始化失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  private async ensureClient() {
    await this.clientReady;
  }

  async testConnection(): Promise<boolean> {
    await this.ensureClient();
    try {
      await this.client.getDirectoryContents('/');
      return true;
    } catch (error) {
      console.error('WebDAV 连接测试失败:', error);
      return false;
    }
  }

  async listFiles(dirPath?: string): Promise<CloudFileInfo[]> {
    await this.ensureClient();
    try {
      const targetPath = dirPath || '/';
      const contents = await this.client.getDirectoryContents(targetPath);
      const files = Array.isArray(contents) ? contents : contents.data || [];
      return files.map((item: any) => ({
        name: item.basename,
        path: item.filename,
        size: item.size || 0,
        isDirectory: item.type === 'directory',
        modifiedAt: item.lastmod || new Date().toISOString(),
      }));
    } catch (error) {
      console.error('WebDAV 列出文件失败:', error);
      throw new Error(`列出文件失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

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
      console.error('WebDAV 读取文件失败:', error);
      throw new Error(`读取文件失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  async writeFile(filePath: string, data: Buffer): Promise<void> {
    await this.ensureClient();
    try {
      const dirPath = path.dirname(filePath);
      await this.createDirectory(dirPath);
      await this.client.putFileContents(filePath, data);
    } catch (error) {
      console.error('WebDAV 写入文件失败:', error);
      throw new Error(`写入文件失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  async deleteFile(filePath: string): Promise<void> {
    await this.ensureClient();
    try {
      await this.client.deleteFile(filePath);
    } catch (error) {
      console.error('WebDAV 删除文件失败:', error);
      throw new Error(`删除文件失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  async createDirectory(dirPath: string): Promise<void> {
    await this.ensureClient();
    try {
      try {
        await this.client.getDirectoryContents(dirPath);
        return;
      } catch {
        // 目录不存在，创建它
      }
      const parts = dirPath.split('/').filter(Boolean);
      let currentPath = '';
      for (const part of parts) {
        currentPath += '/' + part;
        try {
          await this.client.createDirectory(currentPath);
        } catch (error: any) {
          if (!error.message?.includes('already exists')) {
            throw error;
          }
        }
      }
    } catch (error) {
      console.error('WebDAV 创建目录失败:', error);
      throw new Error(`创建目录失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }
} 