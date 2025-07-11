// 标准库导入
import * as path from 'path';
import * as fs from 'fs';

// 第三方库导入
import { app } from 'electron';

// 本地模块导入
import { windowManager } from './window-manager';

/**
 * 常量定义
 */
const CONSTANTS = {
  DEFAULT_VERSION: '0.0.0',
  GITHUB_API_ACCEPT: 'application/vnd.github.v3+json',
  NO_RELEASE_NOTES: '暂无更新说明',
  ERROR_MESSAGES: {
    GITHUB_API_FAILED: 'GitHub API 请求失败',
    PRERELEASE_VERSION: '最新发布版本是预发布版本或草稿版本',
    VERSION_ERROR: '获取应用版本失败',
    FETCH_RELEASE_ERROR: '获取最新版本信息失败',
    CHECK_UPDATE_ERROR: '检查更新失败',
    OPEN_DOWNLOAD_ERROR: '打开下载页面失败'
  }
} as const;

/**
 * 更新信息接口
 */
interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  releaseNotes: string;
  downloadUrl: string;
  publishedAt: string;
}

/**
 * GitHub Release 信息接口
 */
interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string;
  html_url: string;
  published_at: string;
  prerelease: boolean;
  draft: boolean;
}

/**
 * 应用更新服务
 * 简化版本：只保留必要的 Electron API 功能
 */
class UpdateService {
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
      return process.env.npm_package_version || CONSTANTS.DEFAULT_VERSION;
    } catch (error) {
      console.error(CONSTANTS.ERROR_MESSAGES.VERSION_ERROR, error);
      return CONSTANTS.DEFAULT_VERSION;
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
export const updateService = new UpdateService();
