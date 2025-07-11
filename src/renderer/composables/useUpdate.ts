/**
 * 更新服务 Composable
 * 将大部分更新逻辑迁移到前端，只保留必要的 Electron API 调用
 */

import { ref, computed, readonly } from 'vue';

export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  releaseNotes: string;
  downloadUrl: string;
  publishedAt: string;
}

export interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string;
  html_url: string;
  published_at: string;
  prerelease: boolean;
  draft: boolean;
}

export interface UpdateCheckResult {
  success: boolean;
  data: UpdateInfo | null;
  error: string | null;
}

export function useUpdate() {
  // 状态管理
  const currentVersion = ref('');
  const updateInfo = ref<UpdateInfo | null>(null);
  const checking = ref(false);
  const checkError = ref('');

  // 私有属性
  const repoOwner = 'yarin-zhang';
  const repoName = 'AI-Gist';
  const githubApiUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/releases/latest`;

  /**
   * 检查 Electron API 是否可用
   */
  const isElectronAvailable = (): boolean => {
    return typeof window !== 'undefined' && !!window.electronAPI;
  };

  /**
   * 获取当前应用版本
   */
  const getCurrentVersion = async (): Promise<string> => {
    if (isElectronAvailable()) {
      try {
        return await window.electronAPI.app.getVersion();
      } catch (error) {
        console.error('获取版本失败:', error);
        return '0.0.0';
      }
    }
    
    // 在非 Electron 环境中，尝试从 package.json 获取版本
    try {
      // 这里可以添加从 package.json 读取版本的逻辑
      return '0.0.0';
    } catch (error) {
      console.error('获取版本失败:', error);
      return '0.0.0';
    }
  };

  /**
   * 从 GitHub API 获取最新版本信息
   */
  const fetchLatestReleaseInfo = async (): Promise<GitHubRelease> => {
    try {
      const response = await fetch(githubApiUrl, {
        headers: {
          'User-Agent': `${repoName}/${await getCurrentVersion()}`,
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
  };

  /**
   * 比较版本号
   */
  const compareVersions = (current: string, latest: string): boolean => {
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
  };

  /**
   * 检查更新
   */
  const checkForUpdates = async (): Promise<UpdateCheckResult> => {
    if (checking.value) {
      return {
        success: false,
        data: null,
        error: '正在检查更新中'
      };
    }

    checking.value = true;
    checkError.value = '';

    try {
      const currentVersionValue = await getCurrentVersion();
      const release = await fetchLatestReleaseInfo();

      // 跳过预发布版本和草稿版本
      if (release.prerelease || release.draft) {
        return {
          success: false,
          data: null,
          error: '最新发布版本是预发布版本或草稿版本'
        };
      }

      const latestVersion = release.tag_name;
      const hasUpdate = compareVersions(currentVersionValue, latestVersion);

      const updateInfoValue: UpdateInfo = {
        currentVersion: currentVersionValue,
        latestVersion,
        hasUpdate,
        releaseNotes: release.body || '暂无更新说明',
        downloadUrl: release.html_url,
        publishedAt: release.published_at
      };

      // 更新状态
      currentVersion.value = currentVersionValue;
      updateInfo.value = updateInfoValue;
      checkError.value = '';

      return {
        success: true,
        data: updateInfoValue,
        error: null
      };
    } catch (error: any) {
      console.error('检查更新失败:', error);
      const errorMessage = error.message || '检查更新失败';
      checkError.value = errorMessage;
      
      return {
        success: false,
        data: null,
        error: errorMessage
      };
    } finally {
      checking.value = false;
    }
  };

  /**
   * 打开下载页面
   */
  const openDownloadPage = async (url: string): Promise<{ success: boolean; error: string | null }> => {
    if (!isElectronAvailable()) {
      return {
        success: false,
        error: 'Electron API 不可用'
      };
    }

    try {
      await window.electronAPI.app.openDownloadPage(url);
      return { success: true, error: null };
    } catch (error: any) {
      console.error('打开下载页面失败:', error);
      return {
        success: false,
        error: error.message || '打开下载页面失败'
      };
    }
  };

  /**
   * 获取应用路径
   */
  const getAppPath = async (name: string): Promise<string> => {
    if (!isElectronAvailable()) {
      throw new Error('Electron API 不可用');
    }

    return await window.electronAPI.app.getPath(name);
  };

  /**
   * 初始化版本信息
   */
  const initVersion = async () => {
    try {
      currentVersion.value = await getCurrentVersion();
    } catch (error) {
      console.error('获取版本失败:', error);
      currentVersion.value = '0.0.0';
    }
  };

  /**
   * 格式化日期
   */
  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  // 计算属性
  const hasUpdate = computed(() => updateInfo.value?.hasUpdate || false);
  const isLatest = computed(() => !hasUpdate.value);
  const latestVersion = computed(() => updateInfo.value?.latestVersion || '');
  const releaseNotes = computed(() => updateInfo.value?.releaseNotes || '');
  const downloadUrl = computed(() => updateInfo.value?.downloadUrl || '');
  const publishedAt = computed(() => updateInfo.value?.publishedAt ? formatDate(updateInfo.value.publishedAt) : '');

  return {
    // 状态
    currentVersion: readonly(currentVersion),
    updateInfo: readonly(updateInfo),
    checking: readonly(checking),
    checkError: readonly(checkError),
    
    // 计算属性
    hasUpdate,
    isLatest,
    latestVersion,
    releaseNotes,
    downloadUrl,
    publishedAt,
    
    // 方法
    checkForUpdates,
    openDownloadPage,
    getAppPath,
    initVersion,
    formatDate
  };
} 