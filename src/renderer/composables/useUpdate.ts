/**
 * 更新服务 Composable
 * 将大部分更新逻辑迁移到前端，只保留必要的 Electron API 调用
 */

import { ref, computed, readonly } from 'vue';
import { PlatformDetector } from '@shared/platform';
import { openExternalUrl } from '~/lib/platform/shell';
import { preferencesClient } from '~/lib/platform/preferences';
import i18n from '~/i18n';

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

/**
 * 检查更新的结果。失败的原因（断网、GitHub 限流、接口出错）用户都只能「检查网络后再试」，
 * 所以不往界面传原始报错：界面看 checkFailed 显示一句固定的说明，原因记在控制台。
 */
export interface UpdateCheckResult {
  success: boolean;
  data: UpdateInfo | null;
  /** 上一次检查还没结束，这次什么也没做（连点了按钮），界面不用提示 */
  skipped?: boolean;
}

export interface UpdateCheckOptions {
  /** 后台自动检查：失败只记控制台，不让关于页显示 about.checkFailed */
  silent?: boolean;
}

/** 拿不到具体版本的 Release 地址时，打开最新版本的 Release 页 */
export const LATEST_RELEASE_URL = 'https://github.com/yarin-zhang/AI-Gist/releases/latest';

/** 启动后等数据库初始化和首次同步跑完再检查 */
export const AUTO_CHECK_DELAY = 10 * 1000;
/** 检查成功后，隔一天切回窗口时再查一次 */
export const AUTO_CHECK_INTERVAL = 24 * 60 * 60 * 1000;
/** 没连上 GitHub 或自动检查被关掉时，一小时后切回窗口再看 */
export const AUTO_CHECK_RETRY_INTERVAL = 60 * 60 * 1000;

// 检查结果放在模块里：状态栏和关于页用同一份，任何一处查到新版本，另一处都能看到
const currentVersion = ref('');
const updateInfo = ref<UpdateInfo | null>(null);
const checking = ref(false);
/** 最近一次手动检查没成功，界面显示 about.checkFailed */
const checkFailed = ref(false);
/** 下一次自动检查的时间，0 表示这次启动还没自动检查过 */
let nextAutoCheckAt = 0;

export function useUpdate() {
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
    
    // 在非 Electron 环境中，使用编译时注入的版本号
    try {
      return typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';
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
        throw new Error(`GitHub API ${response.status} ${response.statusText}`.trim());
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
  const checkForUpdates = async (options: UpdateCheckOptions = {}): Promise<UpdateCheckResult> => {
    // 正在检查时再点一次：等上一次的结果就好，不提示
    if (checking.value) {
      return { success: false, data: null, skipped: true };
    }

    checking.value = true;
    if (!options.silent) checkFailed.value = false;

    try {
      const currentVersionValue = await getCurrentVersion();
      const release = await fetchLatestReleaseInfo();

      // 最新的是预发布或草稿版本：正式版里没有更新的，按「已是最新」处理
      const stable = !release.prerelease && !release.draft;
      const latestVersion = stable ? release.tag_name : currentVersionValue;
      const hasUpdate = stable && compareVersions(currentVersionValue, latestVersion);

      const updateInfoValue: UpdateInfo = {
        currentVersion: currentVersionValue,
        latestVersion,
        hasUpdate,
        // 没写更新说明就留空，界面不显示「查看更新说明」
        releaseNotes: stable ? (release.body || '').trim() : '',
        downloadUrl: stable ? release.html_url : '',
        publishedAt: stable ? release.published_at : ''
      };

      // 更新状态
      currentVersion.value = currentVersionValue;
      updateInfo.value = updateInfoValue;
      checkFailed.value = false;

      return { success: true, data: updateInfoValue };
    } catch (error) {
      console.error('检查更新失败:', error);
      if (!options.silent) checkFailed.value = true;
      return { success: false, data: null };
    } finally {
      checking.value = false;
    }
  };

  /**
   * 打开下载页面
   */
  /** 打开下载页面。失败时界面显示 about.openDownloadFailed，系统给的原因只记在控制台 */
  const openDownloadPage = async (url: string): Promise<{ success: boolean }> => {
    try {
      const result = await openExternalUrl(url);
      if (!result.success) console.error('打开下载页面失败:', result.error);
      return { success: result.success };
    } catch (error) {
      console.error('打开下载页面失败:', error);
      return { success: false };
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
    return new Date(dateString).toLocaleDateString(String(i18n.global.locale.value), {
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
    checkFailed: readonly(checkFailed),
    
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

/** 自动检查更新默认打开；读不到偏好设置时按默认处理 */
async function isAutoCheckEnabled(): Promise<boolean> {
  try {
    return (await preferencesClient.get()).checkUpdates !== false;
  } catch (error) {
    console.error('读取自动检查更新设置失败:', error);
    return true;
  }
}

async function runAutoCheck(): Promise<void> {
  // 先把下一次的时间占住，检查还没结束时切回窗口不会再发一次请求
  nextAutoCheckAt = Date.now() + AUTO_CHECK_RETRY_INTERVAL;
  if (!(await isAutoCheckEnabled())) return;

  const result = await useUpdate().checkForUpdates({ silent: true });
  if (result.success) nextAutoCheckAt = Date.now() + AUTO_CHECK_INTERVAL;
}

/**
 * 在后台自动检查更新：启动后等 AUTO_CHECK_DELAY 查一次，之后窗口重新获得焦点、
 * 并且到了下一次检查的时间才再查。GitHub 未登录的接口每个 IP 每小时只有 60 次，不能每次切回窗口都请求。
 * Mac App Store 版由商店负责更新，Web 端和移动端没有这项能力，都不检查。
 * 返回停止函数，组件卸载时调用。
 */
export function startAutoUpdateCheck(): () => void {
  if (!PlatformDetector.getCapabilities().electronUpdates) return () => undefined;

  const timer = setTimeout(() => {
    if (nextAutoCheckAt === 0) void runAutoCheck();
  }, AUTO_CHECK_DELAY);
  // 启动时那次检查跑之前，窗口获得焦点不提前检查
  const handleFocus = () => {
    if (nextAutoCheckAt !== 0 && Date.now() >= nextAutoCheckAt) void runAutoCheck();
  };
  window.addEventListener('focus', handleFocus);

  return () => {
    clearTimeout(timer);
    window.removeEventListener('focus', handleFocus);
  };
}
