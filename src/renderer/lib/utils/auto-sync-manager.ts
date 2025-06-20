/**
 * 自动同步管理器
 * 负责在数据变更后自动触发 WebDAV 和 iCloud 同步，以及监听网络状态变化进行离线补同步
 */

import { WebDAVAPI } from '../api/webdav.api';
import { ICloudAPI } from '../api/icloud.api';

export interface AutoSyncConfig {
  enabled: boolean;
  debounceMs: number; // 防抖时间，避免频繁同步
  maxRetries: number;
  retryDelayMs: number;
}

export interface SyncStatus {
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncTime: string | null;
  lastSyncError: string | null;
  pendingSyncCount: number;
}

class AutoSyncManager {
  private static instance: AutoSyncManager;
  private config: AutoSyncConfig = {
    enabled: true,
    debounceMs: 3000, // 3秒防抖
    maxRetries: 3,
    retryDelayMs: 5000
  };
  
  private status: SyncStatus = {
    isOnline: navigator.onLine,
    isSyncing: false,
    lastSyncTime: null,
    lastSyncError: null,
    pendingSyncCount: 0
  };
  
  private debounceTimer: NodeJS.Timeout | null = null;
  private retryTimer: NodeJS.Timeout | null = null;
  private retryCount = 0;
  private statusListeners: Array<(status: SyncStatus) => void> = [];

  private constructor() {
    this.initNetworkStatusMonitoring();
    // 延迟初始化用户设置，确保 electronAPI 已经准备好
    setTimeout(() => {
      this.initializeFromUserSettings().catch(console.error);
    }, 1000);
  }

  static getInstance(): AutoSyncManager {
    if (!AutoSyncManager.instance) {
      AutoSyncManager.instance = new AutoSyncManager();
    }
    return AutoSyncManager.instance;
  }

  /**
   * 初始化网络状态监听
   */
  private initNetworkStatusMonitoring() {
    // 监听网络状态变化
    window.addEventListener('online', this.handleNetworkOnline.bind(this));
    window.addEventListener('offline', this.handleNetworkOffline.bind(this));
  }

  /**
   * 网络恢复在线时的处理
   */
  private handleNetworkOnline() {
    console.log('自动同步管理器: 网络已恢复在线，准备执行离线补同步');
    this.status.isOnline = true;
    this.notifyStatusChange();
    
    // 网络恢复时立即执行一次同步
    this.triggerImmediateSync('网络恢复自动同步');
  }

  /**
   * 网络离线时的处理
   */
  private handleNetworkOffline() {
    console.log('自动同步管理器: 网络已离线');
    this.status.isOnline = false;
    this.notifyStatusChange();
    
    // 清除待执行的同步任务
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  /**
   * 触发数据变更后的自动同步
   * 使用防抖机制，避免频繁同步
   */
  triggerAutoSync(reason = '数据变更自动同步') {
    if (!this.config.enabled || !this.status.isOnline) {
      console.log('自动同步跳过:', !this.config.enabled ? '未启用' : '网络离线');
      return;
    }

    // 清除之前的防抖定时器
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.status.pendingSyncCount++;
    this.notifyStatusChange();

    // 设置新的防抖定时器
    this.debounceTimer = setTimeout(() => {
      this.performSync(reason);
    }, this.config.debounceMs);
  }

  /**
   * 强制触发同步（不检查是否启用，用于手动同步）
   */
  forceTriggerSync(reason = '强制同步') {
    if (!this.status.isOnline) {
      console.log('强制同步跳过: 网络离线');
      return;
    }

    // 清除防抖定时器
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    this.performSync(reason);
  }

  /**
   * 立即触发同步（无防抖）
   */
  triggerImmediateSync(reason = '立即同步') {
    if (!this.config.enabled) {
      console.log('自动同步已禁用，跳过立即同步');
      return;
    }

    // 清除防抖定时器
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    this.performSync(reason);
  }

  /**
   * 执行实际的同步操作
   */
  private async performSync(reason: string) {
    if (this.status.isSyncing) {
      console.log('正在同步中，跳过本次同步请求');
      return;
    }

    this.status.isSyncing = true;
    this.status.pendingSyncCount = 0;
    this.notifyStatusChange();

    try {
      console.log(`自动同步管理器: 开始执行同步 - ${reason}`);
      
      // 尝试同步到所有启用的服务
      const results = await this.performAllSyncs();
      
      // 只要有一个成功就认为同步成功
      const hasSuccess = results.some(r => r.success);
      if (hasSuccess) {
        const successResults = results.filter(r => r.success);
        console.log('自动同步成功:', successResults.map(r => r.service + ': ' + r.message).join(', '));
        this.status.lastSyncTime = new Date().toISOString();
        this.status.lastSyncError = null;
        this.retryCount = 0; // 重置重试计数
      } else {
        const errorMessages = results.map(r => r.service + ': ' + r.message).join(', ');
        throw new Error('所有同步服务都失败: ' + errorMessages);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      console.error('自动同步失败:', errorMessage);
      this.status.lastSyncError = errorMessage;
      
      // 如果是网络相关错误，尝试重试
      if (this.shouldRetry(errorMessage)) {
        this.scheduleRetry(reason);
      }
    } finally {
      this.status.isSyncing = false;
      this.notifyStatusChange();
    }
  }

  /**
   * 执行所有启用的同步服务
   */
  private async performAllSyncs(): Promise<Array<{service: string, success: boolean, message: string}>> {
    const results: Array<{service: string, success: boolean, message: string}> = [];
    
    try {
      // 获取用户设置
      const userPrefs = await window.electronAPI?.preferences?.get();
      
      // WebDAV 同步
      if (userPrefs?.webdav?.enabled && userPrefs?.webdav?.autoSync) {
        try {
          const result = await WebDAVAPI.syncNow();
          results.push({
            service: 'WebDAV',
            success: result.success,
            message: result.message
          });
        } catch (error) {
          results.push({
            service: 'WebDAV',
            success: false,
            message: error instanceof Error ? error.message : '未知错误'
          });
        }
      }
      
      // iCloud 同步
      if (userPrefs?.icloud?.enabled && userPrefs?.icloud?.autoSync) {
        try {
          const result = await ICloudAPI.syncNow();
          results.push({
            service: 'iCloud',
            success: result.success,
            message: result.message
          });
        } catch (error) {
          results.push({
            service: 'iCloud',
            success: false,
            message: error instanceof Error ? error.message : '未知错误'
          });
        }
      }
      
      // 如果没有启用任何同步服务
      if (results.length === 0) {
        results.push({
          service: 'None',
          success: false,
          message: '没有启用的同步服务'
        });
      }
      
    } catch (error) {
      console.error('获取同步配置失败:', error);
      results.push({
        service: 'Config',
        success: false,
        message: '获取同步配置失败'
      });
    }
    
    return results;
  }

  /**
   * 判断是否应该重试
   */
  private shouldRetry(errorMessage: string): boolean {
    if (this.retryCount >= this.config.maxRetries) {
      return false;
    }

    // 检查是否是可重试的错误类型
    const retryableErrors = [
      '连接超时',
      '网络错误',
      'ECONNREFUSED',
      'ENOTFOUND',
      'timeout'
    ];

    return retryableErrors.some(error => 
      errorMessage.toLowerCase().includes(error.toLowerCase())
    );
  }

  /**
   * 安排重试
   */
  private scheduleRetry(reason: string) {
    this.retryCount++;
    const delay = this.config.retryDelayMs * this.retryCount; // 递增延迟

    console.log(`自动同步管理器: 安排第 ${this.retryCount} 次重试，${delay}ms 后执行`);

    this.retryTimer = setTimeout(() => {
      this.performSync(`${reason} (重试 ${this.retryCount})`);
    }, delay);
  }

  /**
   * 获取当前同步状态
   */
  getStatus(): SyncStatus {
    return { ...this.status };
  }

  /**
   * 添加状态变化监听器
   */
  addStatusListener(listener: (status: SyncStatus) => void) {
    this.statusListeners.push(listener);
  }

  /**
   * 移除状态变化监听器
   */
  removeStatusListener(listener: (status: SyncStatus) => void) {
    const index = this.statusListeners.indexOf(listener);
    if (index > -1) {
      this.statusListeners.splice(index, 1);
    }
  }

  /**
   * 通知状态变化
   */
  private notifyStatusChange() {
    this.statusListeners.forEach(listener => {
      try {
        listener(this.getStatus());
      } catch (error) {
        console.error('自动同步状态监听器执行错误:', error);
      }
    });
  }

  /**
   * 更新配置
   */
  updateConfig(newConfig: Partial<AutoSyncConfig>) {
    this.config = { ...this.config, ...newConfig };
    console.log('自动同步配置已更新:', this.config);
  }

  /**
   * 手动触发一次完整的同步检查
   */
  async manualSync(): Promise<void> {
    return new Promise((resolve, reject) => {
      const originalListener = (status: SyncStatus) => {
        if (!status.isSyncing) {
          this.removeStatusListener(originalListener);
          if (status.lastSyncError) {
            reject(new Error(status.lastSyncError));
          } else {
            resolve();
          }
        }
      };

      this.addStatusListener(originalListener);
      this.triggerImmediateSync('手动同步');
    });
  }

  /**
   * 停用自动同步
   */
  disable() {
    this.config.enabled = false;
    
    // 清除所有定时器
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    
    this.status.pendingSyncCount = 0;
    this.notifyStatusChange();
    
    console.log('自动同步已禁用');
  }

  /**
   * 从用户设置初始化配置
   */
  async initializeFromUserSettings() {
    try {
      // 获取用户设置中的同步配置
      const userPrefs = await window.electronAPI?.preferences?.get();
      if (userPrefs) {
        const wasEnabled = this.config.enabled;
        
        // 检查是否有任何同步服务启用了自动同步
        const webdavAutoSync = userPrefs.webdav?.enabled && userPrefs.webdav?.autoSync;
        const icloudAutoSync = userPrefs.icloud?.enabled && userPrefs.icloud?.autoSync;
        
        this.config.enabled = webdavAutoSync || icloudAutoSync;
        
        console.log('自动同步配置已从用户设置更新:', {
          enabled: this.config.enabled,
          webdavEnabled: userPrefs.webdav?.enabled,
          webdavAutoSync: userPrefs.webdav?.autoSync,
          icloudEnabled: userPrefs.icloud?.enabled,
          icloudAutoSync: userPrefs.icloud?.autoSync,
          webdavSyncInterval: userPrefs.webdav?.syncInterval,
          icloudSyncInterval: userPrefs.icloud?.syncInterval
        });
        
        // 如果状态发生变化，通知监听器
        if (wasEnabled !== this.config.enabled) {
          this.notifyStatusChange();
        }
      } else {
        console.log('未找到 WebDAV 配置，禁用自动同步');
        this.config.enabled = false;
      }
    } catch (error) {
      console.warn('无法从用户设置读取自动同步配置:', error);
      this.config.enabled = false;
    }
  }

  /**
   * 启用自动同步
   */
  enable() {
    this.config.enabled = true;
    this.notifyStatusChange();
    console.log('自动同步已启用');
  }

  /**
   * 重新从用户设置初始化配置（用于设置变更后的更新）
   */
  async reinitializeFromSettings() {
    await this.initializeFromUserSettings();
  }

  /**
   * 清理资源
   */
  destroy() {
    this.disable();
    window.removeEventListener('online', this.handleNetworkOnline.bind(this));
    window.removeEventListener('offline', this.handleNetworkOffline.bind(this));
    this.statusListeners.length = 0;
  }
}

// 导出单例实例
export const autoSyncManager = AutoSyncManager.getInstance();
