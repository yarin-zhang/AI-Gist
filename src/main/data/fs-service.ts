import { promises as fs } from 'fs';

/**
 * 文件系统服务
 * 负责所有文件操作相关的功能
 */
export class FSService {
  constructor() {
    console.log('FSService: 正在初始化...');
  }

  /**
   * 读取文件内容
   */
  async readFile(filePath: string): Promise<string> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return content;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      throw new Error(`读取文件失败: ${errorMessage}`);
    }
  }

  /**
   * 写入文件内容
   */
  async writeFile(filePath: string, content: string): Promise<{ success: boolean }> {
    try {
      await fs.writeFile(filePath, content, 'utf-8');
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      throw new Error(`写入文件失败: ${errorMessage}`);
    }
  }

  /**
   * 确保目录存在
   */
  async ensureDir(dirPath: string): Promise<{ success: boolean }> {
    try {
      await fs.mkdir(dirPath, { recursive: true });
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      throw new Error(`创建目录失败: ${errorMessage}`);
    }
  }

  /**
   * 获取文件状态
   */
  async stat(filePath: string): Promise<{ size: number; mtime: Date }> {
    try {
      const stats = await fs.stat(filePath);
      return { 
        size: stats.size, 
        mtime: stats.mtime 
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      throw new Error(`获取文件状态失败: ${errorMessage}`);
    }
  }

  /**
   * 读取目录
   */
  async readDir(dirPath: string): Promise<string[]> {
    try {
      const files = await fs.readdir(dirPath);
      return files;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      throw new Error(`读取目录失败: ${errorMessage}`);
    }
  }

  /**
   * 删除文件
   */
  async unlink(filePath: string): Promise<{ success: boolean }> {
    try {
      await fs.unlink(filePath);
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      throw new Error(`删除文件失败: ${errorMessage}`);
    }
  }
}

// 单例模式
export const fsService = new FSService();
