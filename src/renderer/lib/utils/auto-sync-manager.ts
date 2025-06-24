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

// 新增：同步元数据接口
export interface SyncMetadata {
  deletedUUIDs?: string[]; // 被删除的项目UUID列表
  reason?: string; // 同步原因
  source?: 'manual' | 'auto' | 'batch-delete' | 'network-recovery'; // 同步来源
}

// 同步服务配置
interface SyncServiceConfig {
  enabled: boolean;
  autoSync: boolean;
  syncInterval: number; // 分钟
  lastSyncTime?: string;
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
  
  private debounceTimer: number | null = null;
  private retryTimer: number | null = null;
  private retryCount = 0;
  private statusListeners: Array<(status: SyncStatus) => void> = [];
  
  // 新增：待处理的同步元数据
  private pendingSyncMetadata: SyncMetadata | null = null;

  // 新增：同步服务配置
  private syncServices: {
    webdav: SyncServiceConfig;
    icloud: SyncServiceConfig;
  } = {
    webdav: { enabled: false, autoSync: false, syncInterval: 30 },
    icloud: { enabled: false, autoSync: false, syncInterval: 30 }
  };

  // 新增：定时同步定时器
  private scheduledSyncTimers: {
    webdav: number | null;
    icloud: number | null;
  } = {
    webdav: null,
    icloud: null
  };

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
    this.triggerImmediateSync('网络恢复自动同步', { source: 'network-recovery' });
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
  triggerAutoSync(reason = '数据变更自动同步', metadata?: SyncMetadata) {
    if (!this.status.isOnline) {
      console.log('自动同步跳过: 网络离线');
      return;
    }

    // 检查是否有启用的自动同步服务
    const hasAutoSyncEnabled = this.syncServices.webdav.autoSync || this.syncServices.icloud.autoSync;
    if (!hasAutoSyncEnabled) {
      console.log('自动同步跳过: 没有启用的自动同步服务');
      return;
    }

    // 清除之前的防抖定时器
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // 合并同步元数据
    this.mergeSyncMetadata(metadata);

    this.status.pendingSyncCount++;
    this.notifyStatusChange();

    // 设置新的防抖定时器
    this.debounceTimer = window.setTimeout(() => {
      this.performSync(reason, this.pendingSyncMetadata || undefined);
      // 清除已处理的元数据
      this.pendingSyncMetadata = null;
    }, this.config.debounceMs);
  }

  /**
   * 专门用于批量删除后的同步触发
   */
  triggerAutoSyncAfterBatchDelete(deletedUUIDs: string[], reason = '批量删除后自动同步') {
    console.log(`自动同步管理器: 触发批量删除后同步，删除项目数: ${deletedUUIDs.length}`);
    
    const metadata: SyncMetadata = {
      deletedUUIDs,
      source: 'batch-delete',
      reason
    };
    
    this.triggerAutoSync(reason, metadata);
  }

  /**
   * 强制触发同步（不检查是否启用，用于手动同步）
   */
  forceTriggerSync(reason = '强制同步', metadata?: SyncMetadata) {
    if (!this.status.isOnline) {
      console.log('强制同步跳过: 网络离线');
      return;
    }

    // 清除防抖定时器
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    this.performSync(reason, metadata);
  }

  /**
   * 立即触发同步（无防抖）
   */
  triggerImmediateSync(reason = '立即同步', metadata?: SyncMetadata) {
    // 检查是否有启用的同步服务
    const hasSyncEnabled = this.syncServices.webdav.enabled || this.syncServices.icloud.enabled;
    if (!hasSyncEnabled) {
      console.log('立即同步跳过: 没有启用的同步服务');
      return;
    }

    // 清除防抖定时器
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    this.performSync(reason, metadata);
  }

  /**
   * 合并同步元数据
   */
  private mergeSyncMetadata(newMetadata?: SyncMetadata) {
    if (!newMetadata) return;

    if (!this.pendingSyncMetadata) {
      this.pendingSyncMetadata = { ...newMetadata };
    } else {
      // 合并删除的 UUID
      if (newMetadata.deletedUUIDs && newMetadata.deletedUUIDs.length > 0) {
        if (!this.pendingSyncMetadata.deletedUUIDs) {
          this.pendingSyncMetadata.deletedUUIDs = [];
        }
        // 去重合并
        const existingUUIDs = new Set(this.pendingSyncMetadata.deletedUUIDs);
        newMetadata.deletedUUIDs.forEach(uuid => {
          if (!existingUUIDs.has(uuid)) {
            this.pendingSyncMetadata!.deletedUUIDs!.push(uuid);
          }
        });
      }
      
      // 更新原因和来源
      this.pendingSyncMetadata.reason = newMetadata.reason || this.pendingSyncMetadata.reason;
      this.pendingSyncMetadata.source = newMetadata.source || this.pendingSyncMetadata.source;
    }
  }

  /**
   * 执行实际的同步操作
   */
  private async performSync(reason: string, metadata?: SyncMetadata) {
    if (this.status.isSyncing) {
      console.log('正在同步中，跳过本次同步请求');
      return;
    }

    this.status.isSyncing = true;
    this.status.pendingSyncCount = 0;
    this.notifyStatusChange();

    try {
      console.log(`自动同步管理器: 开始执行同步 - ${reason}`, metadata);
      
      // 如果有删除的 UUID，记录删除项目（WebDAV 使用）
      if (metadata?.deletedUUIDs && metadata.deletedUUIDs.length > 0) {
        console.log(`记录删除项目，处理 ${metadata.deletedUUIDs.length} 个项目...`);
        try {
          const recordResult = await WebDAVAPI.recordDeletedItems(metadata.deletedUUIDs);
          if (!recordResult.success) {
            console.warn('记录删除项目失败:', recordResult.error);
          } else {
            console.log('删除项目记录成功');
          }
        } catch (error) {
          console.error('记录删除项目时发生错误:', error);
        }
      }
      
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
        
        // 更新各服务的最后同步时间
        this.updateServiceSyncTimes();
        
        // 如果是批量删除操作，记录成功同步的删除项目
        if (metadata?.source === 'batch-delete' && metadata.deletedUUIDs && metadata.deletedUUIDs.length > 0) {
          console.log(`批量删除同步成功，已删除 ${metadata.deletedUUIDs.length} 个项目`);
        }
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
        this.scheduleRetry(reason, metadata);
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
      // WebDAV 同步
      if (this.syncServices.webdav.enabled) {
        try {
          const result = await WebDAVAPI.syncNow();
          results.push({
            service: 'WebDAV',
            success: result.success,
            message: result.message || '同步完成'
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
      if (this.syncServices.icloud.enabled) {
        try {
          const result = await ICloudAPI.syncNow();
          results.push({
            service: 'iCloud',
            success: result.success,
            message: result.message || '同步完成'
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
   * 更新各服务的最后同步时间
   */
  private updateServiceSyncTimes() {
    const now = new Date().toISOString();
    if (this.syncServices.webdav.enabled) {
      this.syncServices.webdav.lastSyncTime = now;
    }
    if (this.syncServices.icloud.enabled) {
      this.syncServices.icloud.lastSyncTime = now;
    }
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
  private scheduleRetry(reason: string, metadata?: SyncMetadata) {
    this.retryCount++;
    const delay = this.config.retryDelayMs * this.retryCount; // 递增延迟

    console.log(`自动同步管理器: 安排第 ${this.retryCount} 次重试，${delay}ms 后执行`);

    this.retryTimer = window.setTimeout(() => {
      this.performSync(`${reason} (重试 ${this.retryCount})`, metadata);
    }, delay);
  }

  /**
   * 获取当前同步状态
   */
  getStatus(): SyncStatus {
    return { ...this.status };
  }

  /**
   * 获取当前配置状态
   */
  getConfig(): AutoSyncConfig {
    return { ...this.config };
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
    
    // 清除定时同步定时器
    this.clearScheduledSyncTimers();
    
    this.status.pendingSyncCount = 0;
    this.notifyStatusChange();
    
    console.log('自动同步已禁用');
  }

  /**
   * 清除定时同步定时器
   */
  private clearScheduledSyncTimers() {
    if (this.scheduledSyncTimers.webdav) {
      clearTimeout(this.scheduledSyncTimers.webdav);
      this.scheduledSyncTimers.webdav = null;
    }
    if (this.scheduledSyncTimers.icloud) {
      clearTimeout(this.scheduledSyncTimers.icloud);
      this.scheduledSyncTimers.icloud = null;
    }
  }

  /**
   * 从用户设置初始化配置
   */
  async initializeFromUserSettings() {
    try {
      // 获取用户设置中的同步配置
      const userPrefs = await window.electronAPI?.preferences?.get();
      if (userPrefs) {
        // 更新同步服务配置
        this.syncServices.webdav = {
          enabled: userPrefs.webdav?.enabled || false,
          autoSync: userPrefs.webdav?.autoSync || false,
          syncInterval: userPrefs.webdav?.syncInterval || 30,
          lastSyncTime: userPrefs.dataSync?.lastSyncTime || undefined
        };

        this.syncServices.icloud = {
          enabled: userPrefs.icloud?.enabled || false,
          autoSync: userPrefs.icloud?.autoSync || false,
          syncInterval: userPrefs.icloud?.syncInterval || 30,
          lastSyncTime: userPrefs.dataSync?.lastSyncTime || undefined
        };

        // 检查是否有任何同步服务启用了自动同步
        const hasAutoSyncEnabled = this.syncServices.webdav.autoSync || this.syncServices.icloud.autoSync;
        const wasEnabled = this.config.enabled;
        
        this.config.enabled = hasAutoSyncEnabled;
        
        console.log('自动同步配置已从用户设置更新:', {
          enabled: this.config.enabled,
          webdav: {
            enabled: this.syncServices.webdav.enabled,
            autoSync: this.syncServices.webdav.autoSync,
            syncInterval: this.syncServices.webdav.syncInterval
          },
          icloud: {
            enabled: this.syncServices.icloud.enabled,
            autoSync: this.syncServices.icloud.autoSync,
            syncInterval: this.syncServices.icloud.syncInterval
          }
        });
        
        // 如果状态发生变化，通知监听器
        if (wasEnabled !== this.config.enabled) {
          this.notifyStatusChange();
        }

        // 设置定时同步
        this.setupScheduledSync();
      } else {
        console.log('未找到用户设置，禁用自动同步');
        this.config.enabled = false;
      }
    } catch (error) {
      console.warn('无法从用户设置读取自动同步配置:', error);
      this.config.enabled = false;
    }
  }

  /**
   * 设置定时同步
   */
  private setupScheduledSync() {
    // 清除现有的定时器
    this.clearScheduledSyncTimers();

    // 设置 WebDAV 定时同步
    if (this.syncServices.webdav.enabled && this.syncServices.webdav.autoSync) {
      this.scheduleNextSync('webdav');
    }

    // 设置 iCloud 定时同步
    if (this.syncServices.icloud.enabled && this.syncServices.icloud.autoSync) {
      this.scheduleNextSync('icloud');
    }
  }

  /**
   * 安排下次同步
   */
  private scheduleNextSync(service: 'webdav' | 'icloud') {
    const serviceConfig = this.syncServices[service];
    if (!serviceConfig.enabled || !serviceConfig.autoSync) {
      return;
    }

    // 计算下次同步时间
    const now = new Date();
    const lastSync = serviceConfig.lastSyncTime ? new Date(serviceConfig.lastSyncTime) : null;
    const intervalMs = serviceConfig.syncInterval * 60 * 1000; // 转换为毫秒

    let nextSyncTime: Date;
    if (lastSync) {
      nextSyncTime = new Date(lastSync.getTime() + intervalMs);
      // 如果下次同步时间已过，立即同步
      if (nextSyncTime <= now) {
        this.triggerImmediateSync(`${service} 定时同步`);
        nextSyncTime = new Date(now.getTime() + intervalMs);
      }
    } else {
      // 首次同步，立即执行
      this.triggerImmediateSync(`${service} 首次定时同步`);
      nextSyncTime = new Date(now.getTime() + intervalMs);
    }

    const delayMs = nextSyncTime.getTime() - now.getTime();
    
    console.log(`${service} 下次同步时间: ${nextSyncTime.toLocaleString()}, 延迟: ${delayMs}ms`);

    // 设置定时器
    this.scheduledSyncTimers[service] = window.setTimeout(() => {
      this.triggerImmediateSync(`${service} 定时同步`);
      // 递归设置下次同步
      this.scheduleNextSync(service);
    }, delayMs);
  }

  /**
   * 启用自动同步
   */
  enable() {
    this.config.enabled = true;
    this.setupScheduledSync();
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
