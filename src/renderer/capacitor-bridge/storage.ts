/**
 * 存储适配层
 * 统一 Electron 和 Capacitor 的键值存储 API
 */

import { PlatformDetector } from '@shared/platform';

export interface StorageAdapter {
  /**
   * 获取存储值
   */
  get(key: string): Promise<string | null>;

  /**
   * 设置存储值
   */
  set(key: string, value: string): Promise<void>;

  /**
   * 删除存储值
   */
  remove(key: string): Promise<void>;

  /**
   * 清空所有存储
   */
  clear(): Promise<void>;

  /**
   * 获取所有键
   */
  keys(): Promise<string[]>;
}

/**
 * Electron 存储适配器（使用 localStorage）
 */
class ElectronStorageAdapter implements StorageAdapter {
  async get(key: string): Promise<string | null> {
    return localStorage.getItem(key);
  }

  async set(key: string, value: string): Promise<void> {
    localStorage.setItem(key, value);
  }

  async remove(key: string): Promise<void> {
    localStorage.removeItem(key);
  }

  async clear(): Promise<void> {
    localStorage.clear();
  }

  async keys(): Promise<string[]> {
    return Object.keys(localStorage);
  }
}

/**
 * Capacitor 存储适配器
 */
class CapacitorStorageAdapter implements StorageAdapter {
  private preferencesPromise: Promise<any>;

  constructor() {
    if (typeof window !== 'undefined' && (window as any).Capacitor) {
      this.preferencesPromise = import('@capacitor/preferences').then(({ Preferences }) => Preferences);
    } else {
      // 降级到 localStorage
      this.preferencesPromise = Promise.resolve(null);
    }
  }

  async get(key: string): Promise<string | null> {
    const Preferences = await this.preferencesPromise;
    if (!Preferences) {
      return localStorage.getItem(key);
    }
    const result = await Preferences.get({ key });
    return result.value;
  }

  async set(key: string, value: string): Promise<void> {
    const Preferences = await this.preferencesPromise;
    if (!Preferences) {
      localStorage.setItem(key, value);
      return;
    }
    await Preferences.set({ key, value });
  }

  async remove(key: string): Promise<void> {
    const Preferences = await this.preferencesPromise;
    if (!Preferences) {
      localStorage.removeItem(key);
      return;
    }
    await Preferences.remove({ key });
  }

  async clear(): Promise<void> {
    const Preferences = await this.preferencesPromise;
    if (!Preferences) {
      localStorage.clear();
      return;
    }
    await Preferences.clear();
  }

  async keys(): Promise<string[]> {
    const Preferences = await this.preferencesPromise;
    if (!Preferences) {
      return Object.keys(localStorage);
    }
    const result = await Preferences.keys();
    return result.keys;
  }
}

/**
 * 获取存储适配器实例
 */
export function getStorageAdapter(): StorageAdapter {
  if (PlatformDetector.isElectron()) {
    return new ElectronStorageAdapter();
  } else {
    return new CapacitorStorageAdapter();
  }
}

// 导出单例
export const storage = getStorageAdapter();
