// 标准库导入
import * as path from 'path';
import * as fs from 'fs';

// 第三方库导入
import { app } from 'electron';

/**
 * 应用更新服务
 */
class UpdateManager {
  /**
   * 获取当前应用版本
   * @returns 当前版本号
   */
  getCurrentVersion(): string {
    try {
      // 在开发环境中使用相对路径
      if (process.env.NODE_ENV === 'development') {
        const packageJsonPath = path.join(__dirname, '../../../package.json');
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        return packageJson.version;
      }
      
      // 在生产环境中，先尝试使用 app.getVersion()
      const appVersion = app.getVersion();
      if (appVersion) {
        return appVersion;
      }
      
      // 如果 app.getVersion() 不可用，尝试从应用根目录读取 package.json
      const appPath = app.getAppPath();
      const packageJsonPath = path.join(appPath, 'package.json');
      
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        return packageJson.version;
      }
      
      // 最后的备选方案，使用 process.env.npm_package_version
      return process.env.npm_package_version || '0.0.0';
    } catch (error) {
      console.error('获取应用版本失败', error);
      return '0.0.0';
    }
  }

  /**
   * 获取应用路径
   * @param name 路径名称
   * @returns 应用路径
   */
  getAppPath(name: 'home' | 'appData' | 'userData' | 'sessionData' | 'temp' | 'exe' | 'module' | 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos' | 'recent' | 'logs' | 'crashDumps'): string {
    return app.getPath(name);
  }

  /**
   * 打开下载页面
   * @param url 下载页面URL
   */
  async openDownloadPage(url: string): Promise<void> {
    const { shell } = await import('electron');
    await shell.openExternal(url);
  }
}

// 单例模式导出
export const updateManager = new UpdateManager();
