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
 * 负责检查应用更新、获取版本信息、显示更新通知等功能
 */
class UpdateService {
  // 私有属性
  private readonly repoOwner = 'yarin-zhang';
  private readonly repoName = 'AI-Gist';
  private readonly githubApiUrl = `https://api.github.com/repos/${this.repoOwner}/${this.repoName}/releases/latest`;

  // ==================== IPC 相关方法 ====================

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
   * 检查更新并返回结果
   * @returns 更新检查结果
   */
  async checkForUpdatesWithResult(): Promise<{
    success: boolean;
    data: UpdateInfo | null;
    error: string | null;
  }> {
    try {
      const updateInfo = await this.checkForUpdates();
      return {
        success: true,
        data: updateInfo,
        error: null
      };
    } catch (error: any) {
      console.error('检查更新失败:', error);
      return {
        success: false,
        data: null,
        error: error.message || CONSTANTS.ERROR_MESSAGES.CHECK_UPDATE_ERROR
      };
    }
  }

  /**
   * 打开下载页面并返回结果
   * @param url 下载页面URL
   * @returns 操作结果
   */
  async openDownloadPageWithResult(url: string): Promise<{
    success: boolean;
    error: string | null;
  }> {
    try {
      await this.openDownloadPage(url);
      return { success: true, error: null };
    } catch (error: any) {
      console.error('打开下载页面失败:', error);
      return { 
        success: false, 
        error: error.message || CONSTANTS.ERROR_MESSAGES.OPEN_DOWNLOAD_ERROR 
      };
    }
  }

  // ==================== 公共方法 ====================

  /**
   * 检查是否有可用更新
   * @returns 更新信息对象
   */
  async checkForUpdates(): Promise<UpdateInfo> {
    try {
      const currentVersion = this.getCurrentVersion();
      const release = await this.fetchLatestReleaseInfo();

      // 跳过预发布版本和草稿版本
      if (release.prerelease || release.draft) {
        throw new Error(CONSTANTS.ERROR_MESSAGES.PRERELEASE_VERSION);
      }

      const latestVersion = release.tag_name;
      const hasUpdate = this.compareVersions(currentVersion, latestVersion);

      return {
        currentVersion,
        latestVersion,
        hasUpdate,
        releaseNotes: release.body || CONSTANTS.NO_RELEASE_NOTES,
        downloadUrl: release.html_url,
        publishedAt: release.published_at
      };
    } catch (error) {
      console.error(CONSTANTS.ERROR_MESSAGES.CHECK_UPDATE_ERROR, error);
      throw error;
    }
  }

  /**
   * 打开下载页面
   * @param url 下载页面URL
   */
  async openDownloadPage(url: string): Promise<void> {
    const { shell } = await import('electron');
    await shell.openExternal(url);
  }

  /**
   * 显示更新通知
   * @param updateInfo 更新信息
   */
  showUpdateNotification(updateInfo: UpdateInfo): void {
    if (!updateInfo.hasUpdate) return;

    const mainWindow = windowManager.getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send('update-available', updateInfo);
    }
  }

  // ==================== 私有方法 ====================

  /**
   * 从 GitHub API 获取最新版本信息
   * @returns GitHub Release 信息
   */
  private async fetchLatestReleaseInfo(): Promise<GitHubRelease> {
    try {
      const response = await fetch(this.githubApiUrl, {
        headers: {
          'User-Agent': `${this.repoName}/${this.getCurrentVersion()}`,
          'Accept': CONSTANTS.GITHUB_API_ACCEPT
        }
      });

      if (!response.ok) {
        throw new Error(`${CONSTANTS.ERROR_MESSAGES.GITHUB_API_FAILED}: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error(CONSTANTS.ERROR_MESSAGES.FETCH_RELEASE_ERROR, error);
      throw error;
    }
  }

  /**
   * 比较版本号
   * @param current 当前版本
   * @param latest 最新版本
   * @returns 如果最新版本大于当前版本返回 true
   */
  private compareVersions(current: string, latest: string): boolean {
    // 移除版本号前的 'v' 前缀
    const cleanCurrent = current.replace(/^v/, '');
    const cleanLatest = latest.replace(/^v/, '');

    const currentParts = cleanCurrent.split('.').map(Number);
    const latestParts = cleanLatest.split('.').map(Number);

    // 确保数组长度一致
    const maxLength = Math.max(currentParts.length, latestParts.length);
    while (currentParts.length < maxLength) currentParts.push(0);
    while (latestParts.length < maxLength) latestParts.push(0);

    for (let i = 0; i < maxLength; i++) {
      if (latestParts[i] > currentParts[i]) return true;
      if (latestParts[i] < currentParts[i]) return false;
    }

    return false;
  }
}

// 单例模式导出
export const updateService = new UpdateService();
