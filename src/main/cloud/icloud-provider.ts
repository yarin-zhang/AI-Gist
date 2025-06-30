import { CloudStorageProvider, CloudFileInfo, ICloudConfig } from '@shared/types/cloud-backup';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

export class ICloudProvider implements CloudStorageProvider {
  private config: ICloudConfig;
  private basePath: string;

  constructor(config: ICloudConfig) {
    this.config = config;
    // 验证路径不能为空
    if (!config.path || config.path.trim() === '') {
      throw new Error('iCloud 路径不能为空');
    }
    this.basePath = this.getICloudBasePath();
  }

  /**
   * 检测 iCloud 是否可用
   */
  static async isICloudAvailable(): Promise<{ available: boolean; reason?: string }> {
    const platform = os.platform();
    const homedir = os.homedir();
    console.log(`检测 iCloud 可用性，平台: ${platform}, 用户主目录: ${homedir}`);
    
    if (platform === 'linux') {
      return { available: false, reason: 'Linux 系统不支持 iCloud Drive' };
    }
    
    if (platform === 'darwin') {
      // macOS - 检查多个可能的 iCloud Drive 路径
      const possiblePaths = [
        path.join(homedir, 'Library', 'Mobile Documents', 'com~apple~CloudDocs'),
        path.join(homedir, 'iCloud Drive'),
        path.join(homedir, 'iCloudDrive'),
        path.join(homedir, 'Library', 'CloudStorage', 'iCloud Drive'),
      ];
      
      console.log('macOS iCloud 可能路径:', possiblePaths);
      
      try {
        const fsSync = require('fs');
        
        for (const basePath of possiblePaths) {
          console.log(`检查路径: ${basePath}`);
          if (fsSync.existsSync(basePath)) {
            console.log(`macOS iCloud 路径存在: ${basePath}`);
            return { available: true };
          } else {
            console.log(`路径不存在: ${basePath}`);
          }
        }
        
        console.log('macOS 未找到 iCloud 路径');
        return { available: false, reason: 'iCloud Drive 未启用或不可访问' };
      } catch (error) {
        console.error('检测 macOS iCloud 路径失败:', error);
        return { available: false, reason: 'iCloud Drive 检测失败' };
      }
    }
    
    if (platform === 'win32') {
      // Windows
      const possiblePaths = [
        path.join(homedir, 'iCloudDrive'),
        path.join(homedir, 'iCloud Drive'),
        path.join(homedir, 'OneDrive', 'iCloud Drive'),
      ];
      
      console.log('Windows iCloud 可能路径:', possiblePaths);
      
      for (const basePath of possiblePaths) {
        try {
          // 使用同步方法检查路径是否存在
          const fsSync = require('fs');
          if (fsSync.existsSync(basePath)) {
            console.log(`Windows iCloud 路径存在: ${basePath}`);
            return { available: true };
          }
        } catch (error) {
          console.warn(`检查 Windows iCloud 路径失败: ${basePath}`, error);
          continue;
        }
      }
      
      console.log('Windows 未找到 iCloud 路径');
      return { available: false, reason: '未检测到 iCloud Drive 目录，请先安装 iCloud for Windows。如已配置完毕，请重启本应用。' };
    }
    
    return { available: false, reason: '不支持的操作系统' };
  }

  /**
   * 获取 iCloud 基础路径
   */
  private getICloudBasePath(): string {
    const platform = os.platform();
    
    if (platform === 'darwin') {
      // macOS - 检查多个可能的路径
      const possiblePaths = [
        path.join(os.homedir(), 'Library', 'Mobile Documents', 'com~apple~CloudDocs'),
        path.join(os.homedir(), 'iCloud Drive'),
        path.join(os.homedir(), 'iCloudDrive'),
        path.join(os.homedir(), 'Library', 'CloudStorage', 'iCloud Drive'),
      ];
      
      for (const basePath of possiblePaths) {
        try {
          const fsSync = require('fs');
          if (fsSync.existsSync(basePath)) {
            return basePath;
          }
        } catch {
          continue;
        }
      }
      
      // 如果都找不到，使用默认路径
      return path.join(os.homedir(), 'Library', 'Mobile Documents', 'com~apple~CloudDocs');
    }
    
    if (platform === 'win32') {
      // Windows - 尝试多个可能的路径
      const possiblePaths = [
        path.join(os.homedir(), 'iCloudDrive'),
        path.join(os.homedir(), 'iCloud Drive'),
        path.join(os.homedir(), 'OneDrive', 'iCloud Drive'),
      ];
      
      for (const basePath of possiblePaths) {
        try {
          // 同步检查路径是否存在
          const fsSync = require('fs');
          if (fsSync.existsSync(basePath)) {
            return basePath;
          }
        } catch {
          continue;
        }
      }
      
      // 如果都找不到，使用默认路径
      return path.join(os.homedir(), 'iCloudDrive');
    }
    
    throw new Error('不支持的操作系统');
  }

  async testConnection(): Promise<boolean> {
    try {
      const fullPath = path.join(this.basePath, this.config.path);
      // 尝试访问目录，如果不存在则创建
      try {
        await fs.access(fullPath);
      } catch {
        // 目录不存在，创建它
        await fs.mkdir(fullPath, { recursive: true });
      }
      return true;
    } catch (error) {
      console.error('iCloud Drive 连接测试失败:', error);
      return false;
    }
  }

  async listFiles(dirPath?: string): Promise<CloudFileInfo[]> {
    try {
      // 所有操作都在用户设置的目录下进行
      const targetPath = path.join(this.basePath, this.config.path);
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
      const fullPath = path.join(this.basePath, this.config.path, filePath);
      return await fs.readFile(fullPath);
    } catch (error) {
      console.error('iCloud Drive 读取文件失败:', error);
      throw new Error(`读取文件失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  async writeFile(filePath: string, data: Buffer): Promise<void> {
    try {
      const fullPath = path.join(this.basePath, this.config.path, filePath);
      const dirPath = path.dirname(fullPath);
      
      // 确保目录存在（如果文件名包含路径）
      if (dirPath !== path.join(this.basePath, this.config.path)) {
        await fs.mkdir(dirPath, { recursive: true });
      }
      
      // 写入文件
      await fs.writeFile(fullPath, data);
    } catch (error) {
      console.error('iCloud Drive 写入文件失败:', error);
      throw new Error(`写入文件失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  async deleteFile(filePath: string): Promise<void> {
    try {
      const fullPath = path.join(this.basePath, this.config.path, filePath);
      await fs.unlink(fullPath);
    } catch (error) {
      console.error('iCloud Drive 删除文件失败:', error);
      throw new Error(`删除文件失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  async createDirectory(dirPath: string): Promise<void> {
    try {
      const fullPath = path.join(this.basePath, this.config.path, dirPath);
      
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