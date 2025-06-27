import { CloudStorageProvider, CloudFileInfo, ICloudConfig } from '@shared/types/cloud-backup';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

export class ICloudProvider implements CloudStorageProvider {
  private config: ICloudConfig;
  private basePath: string;

  constructor(config: ICloudConfig) {
    this.config = config;
    // iCloud Drive 在 macOS 上的默认路径
    this.basePath = path.join(os.homedir(), 'Library', 'Mobile Documents', 'com~apple~CloudDocs');
  }

  async testConnection(): Promise<boolean> {
    try {
      const fullPath = path.join(this.basePath, this.config.path || '');
      await fs.access(fullPath);
      return true;
    } catch (error) {
      console.error('iCloud Drive 连接测试失败:', error);
      return false;
    }
  }

  async listFiles(dirPath?: string): Promise<CloudFileInfo[]> {
    try {
      const targetPath = path.join(this.basePath, this.config.path || '', dirPath || '');
      const entries = await fs.readdir(targetPath, { withFileTypes: true });
      
      const files: CloudFileInfo[] = [];
      
      for (const entry of entries) {
        const fullPath = path.join(targetPath, entry.name);
        const relativePath = path.relative(this.basePath, fullPath);
        
        try {
          const stats = await fs.stat(fullPath);
          files.push({
            name: entry.name,
            path: relativePath,
            size: stats.size,
            isDirectory: entry.isDirectory(),
            modifiedAt: stats.mtime.toISOString(),
          });
        } catch (error) {
          console.warn(`无法获取文件信息: ${fullPath}`, error);
        }
      }
      
      return files;
    } catch (error) {
      console.error('iCloud Drive 列出文件失败:', error);
      throw new Error(`列出文件失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  async readFile(filePath: string): Promise<Buffer> {
    try {
      const fullPath = path.join(this.basePath, this.config.path || '', filePath);
      return await fs.readFile(fullPath);
    } catch (error) {
      console.error('iCloud Drive 读取文件失败:', error);
      throw new Error(`读取文件失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  async writeFile(filePath: string, data: Buffer): Promise<void> {
    try {
      const fullPath = path.join(this.basePath, this.config.path || '', filePath);
      const dirPath = path.dirname(fullPath);
      
      // 确保目录存在
      await this.createDirectory(path.relative(this.basePath, dirPath));
      
      // 写入文件
      await fs.writeFile(fullPath, data);
    } catch (error) {
      console.error('iCloud Drive 写入文件失败:', error);
      throw new Error(`写入文件失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  async deleteFile(filePath: string): Promise<void> {
    try {
      const fullPath = path.join(this.basePath, this.config.path || '', filePath);
      await fs.unlink(fullPath);
    } catch (error) {
      console.error('iCloud Drive 删除文件失败:', error);
      throw new Error(`删除文件失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  async createDirectory(dirPath: string): Promise<void> {
    try {
      const fullPath = path.join(this.basePath, this.config.path || '', dirPath);
      
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
      console.error('iCloud Drive 创建目录失败:', error);
      throw new Error(`创建目录失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }
} 