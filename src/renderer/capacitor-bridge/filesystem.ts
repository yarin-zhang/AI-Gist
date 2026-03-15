/**
 * 文件系统适配层
 * 统一 Electron 和 Capacitor 的文件系统 API
 */

import { PlatformDetector } from '@shared/platform';

export interface FileSystemAdapter {
  /**
   * 读取文件内容
   */
  readFile(path: string): Promise<string>;

  /**
   * 写入文件内容
   */
  writeFile(path: string, content: string): Promise<void>;

  /**
   * 删除文件
   */
  deleteFile(path: string): Promise<void>;

  /**
   * 检查文件是否存在
   */
  exists(path: string): Promise<boolean>;

  /**
   * 创建目录
   */
  mkdir(path: string): Promise<void>;

  /**
   * 列出目录内容
   */
  readdir(path: string): Promise<string[]>;

  /**
   * 获取应用数据目录
   */
  getDataPath(): Promise<string>;
}

/**
 * Electron 文件系统适配器
 */
class ElectronFileSystemAdapter implements FileSystemAdapter {
  async readFile(path: string): Promise<string> {
    return await (window as any).electronAPI.fs.readFile(path);
  }

  async writeFile(path: string, content: string): Promise<void> {
    await (window as any).electronAPI.fs.writeFile(path, content);
  }

  async deleteFile(path: string): Promise<void> {
    await (window as any).electronAPI.fs.deleteFile(path);
  }

  async exists(path: string): Promise<boolean> {
    return await (window as any).electronAPI.fs.exists(path);
  }

  async mkdir(path: string): Promise<void> {
    await (window as any).electronAPI.fs.mkdir(path);
  }

  async readdir(path: string): Promise<string[]> {
    return await (window as any).electronAPI.fs.readdir(path);
  }

  async getDataPath(): Promise<string> {
    return await (window as any).electronAPI.path.getDataPath();
  }
}

/**
 * Capacitor 文件系统适配器
 */
class CapacitorFileSystemAdapter implements FileSystemAdapter {
  private Filesystem: any;
  private dataDirectory: string = '';

  constructor() {
    if (typeof window !== 'undefined' && (window as any).Capacitor) {
      import('@capacitor/filesystem').then(({ Filesystem, Directory }) => {
        this.Filesystem = Filesystem;
        // 使用 Data 目录作为应用数据目录
        this.dataDirectory = Directory.Data;
      });
    }
  }

  async readFile(path: string): Promise<string> {
    const result = await this.Filesystem.readFile({
      path: path,
      directory: this.dataDirectory,
      encoding: 'utf8'
    });
    return result.data;
  }

  async writeFile(path: string, content: string): Promise<void> {
    await this.Filesystem.writeFile({
      path: path,
      data: content,
      directory: this.dataDirectory,
      encoding: 'utf8'
    });
  }

  async deleteFile(path: string): Promise<void> {
    await this.Filesystem.deleteFile({
      path: path,
      directory: this.dataDirectory
    });
  }

  async exists(path: string): Promise<boolean> {
    try {
      await this.Filesystem.stat({
        path: path,
        directory: this.dataDirectory
      });
      return true;
    } catch {
      return false;
    }
  }

  async mkdir(path: string): Promise<void> {
    await this.Filesystem.mkdir({
      path: path,
      directory: this.dataDirectory,
      recursive: true
    });
  }

  async readdir(path: string): Promise<string[]> {
    const result = await this.Filesystem.readdir({
      path: path,
      directory: this.dataDirectory
    });
    return result.files.map((file: any) => file.name || file);
  }

  async getDataPath(): Promise<string> {
    // Capacitor 使用相对路径，返回空字符串
    return '';
  }
}

/**
 * 获取文件系统适配器实例
 */
export function getFileSystemAdapter(): FileSystemAdapter {
  if (PlatformDetector.isElectron()) {
    return new ElectronFileSystemAdapter();
  } else {
    return new CapacitorFileSystemAdapter();
  }
}

// 导出单例
export const fileSystem = getFileSystemAdapter();
