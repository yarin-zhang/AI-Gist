import { app } from 'electron';
import { windowManager } from './window-manager';
import * as path from 'path';
import * as fs from 'fs';

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
 */
class UpdateService {
  private readonly repoOwner = 'yarin-zhang';
  private readonly repoName = 'AI-Gist';
  private readonly githubApiUrl = `https://api.github.com/repos/${this.repoOwner}/${this.repoName}/releases/latest`;

  /**
   * 获取当前应用版本
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
      console.error('Error getting app version:', error);
      return '0.0.0';
    }
  }

  /**
   * 从 GitHub API 获取最新版本信息
   */
  private async fetchLatestReleaseInfo(): Promise<GitHubRelease> {
    try {
      const response = await fetch(this.githubApiUrl, {
        headers: {
          'User-Agent': `${this.repoName}/${this.getCurrentVersion()}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      if (!response.ok) {
        throw new Error(`GitHub API 请求失败: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('获取最新版本信息失败:', error);
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

  /**
   * 检查是否有可用更新
   */
  async checkForUpdates(): Promise<UpdateInfo> {
    try {
      const currentVersion = this.getCurrentVersion();
      const release = await this.fetchLatestReleaseInfo();

      // 跳过预发布版本和草稿版本
      if (release.prerelease || release.draft) {
        throw new Error('最新发布版本是预发布版本或草稿版本');
      }

      const latestVersion = release.tag_name;
      const hasUpdate = this.compareVersions(currentVersion, latestVersion);

      return {
        currentVersion,
        latestVersion,
        hasUpdate,
        releaseNotes: release.body || '暂无更新说明',
        downloadUrl: release.html_url,
        publishedAt: release.published_at
      };
    } catch (error) {
      console.error('检查更新失败:', error);
      throw error;
    }
  }

  /**
   * 打开下载页面
   */
  async openDownloadPage(url: string): Promise<void> {
    const { shell } = await import('electron');
    await shell.openExternal(url);
  }

  /**
   * 显示更新通知
   */
  showUpdateNotification(updateInfo: UpdateInfo): void {
    if (!updateInfo.hasUpdate) return;

    const mainWindow = windowManager.getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send('update-available', updateInfo);
    }
  }
}

// 单例模式
export const updateService = new UpdateService();
