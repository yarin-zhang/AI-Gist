/**
 * WebDAV 同步核心引擎
 * 基于 Joplin 同步策略的现代化实现
 */

import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';
import { 
  WebDAVConfig, 
  WebDAVSyncResult, 
  WebDAVConflictDetail 
} from '@shared/types/webdav';

// 同步项接口
export interface SyncItem {
  id: string; // UUID
  type: 'category' | 'prompt' | 'aiConfig' | 'setting';
  title?: string;
  content: any;
  metadata: SyncItemMetadata;
}

// 同步项元数据
export interface SyncItemMetadata {
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  version: number;
  deviceId: string;
  lastModifiedBy: string;
  checksum: string;
  deleted?: boolean;
  syncStatus?: 'synced' | 'pending' | 'conflict';
  syncTime?: string; // 上次同步时间
}

// 同步快照
export interface SyncSnapshot {
  timestamp: string;
  version: string;
  deviceId: string;
  items: SyncItem[];
  metadata: SnapshotMetadata;
}

// 快照元数据
export interface SnapshotMetadata {
  totalItems: number;
  checksum: string;
  syncId: string;
  previousSyncId?: string;
  conflictsResolved: ConflictResolution[];
  deviceInfo: {
    id: string;
    name: string;
    platform: string;
    appVersion: string;
  };
}

// 冲突解决记录
export interface ConflictResolution {
  itemId: string;
  strategy: 'local_wins' | 'remote_wins' | 'merge' | 'create_duplicate';
  timestamp: string;
  reason: string;
}

// 同步结果
export interface SyncResult {
  success: boolean;
  message: string;
  timestamp: string;
  itemsProcessed: number;
  itemsUpdated: number;
  itemsCreated: number;
  itemsDeleted: number;
  conflictsResolved: number;
  conflictDetails: WebDAVConflictDetail[];
  errors: string[];
  phases: {
    upload: { completed: boolean; itemsProcessed: number; errors: string[] };
    deleteRemote: { completed: boolean; itemsProcessed: number; errors: string[] };
    download: { completed: boolean; itemsProcessed: number; errors: string[] };
  };
}

// 同步操作类型
export enum SyncAction {
  CreateLocal = 'createLocal',
  CreateRemote = 'createRemote',
  UpdateLocal = 'updateLocal',
  UpdateRemote = 'updateRemote',
  DeleteLocal = 'deleteLocal',
  DeleteRemote = 'deleteRemote',
  NoteConflict = 'noteConflict',
  ResourceConflict = 'resourceConflict',
  ItemConflict = 'itemConflict'
}

// 同步项比较结果
export interface ItemComparison {
  localItem?: SyncItem;
  remoteItem?: SyncItem;
  action: SyncAction;
  reason: string;
  needsDownload: boolean;
  needsUpload: boolean;
  isConflict: boolean;
}

/**
 * WebDAV 同步核心引擎
 * 实现基于时间戳的乐观合并和冲突检测
 */
export class WebDAVSyncCore {
  private deviceId: string;
  private dataManagementService: any;
  private logger: any;

  constructor(deviceId: string, dataManagementService: any, logger?: any) {
    this.deviceId = deviceId;
    this.dataManagementService = dataManagementService;
    this.logger = logger || console;
  }

  /**
   * 执行完整的同步流程
   */
  async performSync(client: any, config: WebDAVConfig): Promise<SyncResult> {
    this.logger.info('[WebDAV Sync] 开始执行同步流程');

    const result: SyncResult = {
      success: false,
      message: '',
      timestamp: new Date().toISOString(),
      itemsProcessed: 0,
      itemsUpdated: 0,
      itemsCreated: 0,
      itemsDeleted: 0,
      conflictsResolved: 0,
      conflictDetails: [],
      errors: [],
      phases: {
        upload: { completed: false, itemsProcessed: 0, errors: [] },
        deleteRemote: { completed: false, itemsProcessed: 0, errors: [] },
        download: { completed: false, itemsProcessed: 0, errors: [] }
      }
    };

    try {
      // 1. 获取本地和远程快照
      const localSnapshot = await this.getLocalSnapshot();
      let remoteSnapshot = await this.getRemoteSnapshot(client);

      // 2. 如果是首次同步，执行初始上传
      if (!remoteSnapshot) {
        this.logger.info('[WebDAV Sync] 检测到首次同步，执行初始上传');
        return await this.performInitialUpload(client, localSnapshot);
      }

      // 3. 执行三阶段同步
      await this.performUploadPhase(client, localSnapshot, remoteSnapshot, result);
      await this.performDeleteRemotePhase(client, localSnapshot, remoteSnapshot, result);
      await this.performDownloadPhase(client, localSnapshot, remoteSnapshot, result);

      result.success = true;
      result.message = '同步完成';
      this.logger.info('[WebDAV Sync] 同步完成', result);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      this.logger.error('[WebDAV Sync] 同步失败:', error);
      result.success = false;
      result.message = errorMessage;
      result.errors.push(errorMessage);
    }

    return result;
  }

  /**
   * 获取本地快照
   */
  public async getLocalSnapshot(): Promise<SyncSnapshot> {
    this.logger.info('[WebDAV Sync] 获取本地数据快照');
    
    const exportResult = await this.dataManagementService.generateExportData();
    
    // 检查导出结果
    if (!exportResult || !exportResult.success) {
      throw new Error(`获取本地数据失败: ${exportResult?.error || '未知错误'}`);
    }
    
    // 确保数据存在
    if (!exportResult.data) {
      throw new Error('导出数据为空');
    }
    
    this.logger.info('[WebDAV Sync] 导出数据结构:', {
      hasCategories: !!exportResult.data.categories,
      hasPrompts: !!exportResult.data.prompts,
      hasAiConfigs: !!exportResult.data.aiConfigs,
      hasSettings: !!exportResult.data.settings,
      categoriesCount: exportResult.data.categories?.length || 0,
      promptsCount: exportResult.data.prompts?.length || 0,
      aiConfigsCount: exportResult.data.aiConfigs?.length || 0,
      settingsCount: exportResult.data.settings?.length || 0
    });
    
    const items = this.convertToSyncItems(exportResult.data);
    
    const metadata: SnapshotMetadata = {
      totalItems: items.length,
      checksum: this.calculateChecksum(items),
      syncId: uuidv4(),
      conflictsResolved: [],
      deviceInfo: {
        id: this.deviceId,
        name: 'AI-Gist',
        platform: process.platform,
        appVersion: '1.0.0'
      }
    };

    return {
      timestamp: new Date().toISOString(),
      version: '2.0.0',
      deviceId: this.deviceId,
      items,
      metadata
    };
  }

  /**
   * 获取远程快照
   */
  public async getRemoteSnapshot(client: any): Promise<SyncSnapshot | null> {
    try {
      const exists = await this.remoteFileExists(client, '/ai-gist-sync/snapshot.json');
      if (!exists) {
        return null;
      }

      const content = await client.getFileContents('/ai-gist-sync/snapshot.json');
      return JSON.parse(content);
    } catch (error) {
      this.logger.warn('[WebDAV Sync] 获取远程快照失败:', error);
      return null;
    }
  }

  /**
   * 执行初始上传
   */
  public async performInitialUpload(client: any, localSnapshot: SyncSnapshot): Promise<SyncResult> {
    this.logger.info('[WebDAV Sync] 执行初始上传');
    
    await this.ensureRemoteDirectory(client, '/ai-gist-sync');
    await client.putFileContents('/ai-gist-sync/snapshot.json', JSON.stringify(localSnapshot, null, 2));

    return {
      success: true,
      message: '初始同步完成',
      timestamp: new Date().toISOString(),
      itemsProcessed: localSnapshot.items.length,
      itemsUpdated: 0,
      itemsCreated: localSnapshot.items.length,
      itemsDeleted: 0,
      conflictsResolved: 0,
      conflictDetails: [],
      errors: [],
      phases: {
        upload: { completed: true, itemsProcessed: localSnapshot.items.length, errors: [] },
        deleteRemote: { completed: true, itemsProcessed: 0, errors: [] },
        download: { completed: true, itemsProcessed: 0, errors: [] }
      }
    };
  }

  /**
   * 执行上传阶段 - 上传本地变更到远程
   */
  private async performUploadPhase(
    client: any, 
    localSnapshot: SyncSnapshot, 
    remoteSnapshot: SyncSnapshot, 
    result: SyncResult
  ): Promise<void> {
    this.logger.info('[WebDAV Sync] 开始上传阶段');
    
    const localItems = new Map(localSnapshot.items.map(item => [item.id, item]));
    const remoteItems = new Map(remoteSnapshot.items.map(item => [item.id, item]));
    
    const itemsToUpload: SyncItem[] = [];
    let hasChanges = false;

    // 找出需要上传的项目
    for (const [id, localItem] of localItems) {
      const remoteItem = remoteItems.get(id);
      
      if (!remoteItem) {
        // 本地新增项目
        itemsToUpload.push(localItem);
        result.itemsCreated++;
        hasChanges = true;
      } else if (this.needsUpload(localItem, remoteItem)) {
        // 本地更新项目
        itemsToUpload.push(localItem);
        result.itemsUpdated++;
        hasChanges = true;
      }
    }

    // 上传变更
    if (hasChanges) {
      const newRemoteItems = new Map(remoteItems);
      for (const item of itemsToUpload) {
        newRemoteItems.set(item.id, item);
      }

      const newRemoteSnapshot: SyncSnapshot = {
        ...remoteSnapshot,
        items: Array.from(newRemoteItems.values()),
        timestamp: new Date().toISOString(),
        metadata: {
          ...remoteSnapshot.metadata,
          totalItems: newRemoteItems.size,
          checksum: this.calculateChecksum(Array.from(newRemoteItems.values())),
          syncId: uuidv4()
        }
      };

      await client.putFileContents('/ai-gist-sync/snapshot.json', JSON.stringify(newRemoteSnapshot, null, 2));
    }

    result.phases.upload.completed = true;
    result.phases.upload.itemsProcessed = itemsToUpload.length;
    this.logger.info('[WebDAV Sync] 上传阶段完成', { uploaded: itemsToUpload.length });
  }

  /**
   * 执行删除远程阶段 - 处理本地删除的项目
   */
  private async performDeleteRemotePhase(
    client: any, 
    localSnapshot: SyncSnapshot, 
    remoteSnapshot: SyncSnapshot, 
    result: SyncResult
  ): Promise<void> {
    this.logger.info('[WebDAV Sync] 开始删除远程阶段');
    
    const localItems = new Map(localSnapshot.items.map(item => [item.id, item]));
    const remoteItems = new Map(remoteSnapshot.items.map(item => [item.id, item]));
    
    const itemsToDelete: string[] = [];

    // 找出需要删除的远程项目
    for (const [id, remoteItem] of remoteItems) {
      if (!localItems.has(id)) {
        // 本地快照中没有这个项目，说明本地已经删除了
        itemsToDelete.push(id);
        result.itemsDeleted++;
        this.logger.info(`[WebDAV Sync] 标记删除远程项目: ${id} (${remoteItem.type})`);
      }
    }

    // 删除远程项目
    if (itemsToDelete.length > 0) {
      const newRemoteItems = new Map(remoteItems);
      for (const id of itemsToDelete) {
        newRemoteItems.delete(id);
      }

      const newRemoteSnapshot: SyncSnapshot = {
        ...remoteSnapshot,
        items: Array.from(newRemoteItems.values()),
        timestamp: new Date().toISOString(),
        metadata: {
          ...remoteSnapshot.metadata,
          totalItems: newRemoteItems.size,
          checksum: this.calculateChecksum(Array.from(newRemoteItems.values())),
          syncId: uuidv4()
        }
      };

      await client.putFileContents('/ai-gist-sync/snapshot.json', JSON.stringify(newRemoteSnapshot, null, 2));
      this.logger.info(`[WebDAV Sync] 已删除 ${itemsToDelete.length} 个远程项目`);
    }

    result.phases.deleteRemote.completed = true;
    result.phases.deleteRemote.itemsProcessed = itemsToDelete.length;
    this.logger.info('[WebDAV Sync] 删除远程阶段完成', { deleted: itemsToDelete.length });
  }

  /**
   * 执行下载阶段 - 下载远程变更到本地
   */
  private async performDownloadPhase(
    client: any, 
    localSnapshot: SyncSnapshot, 
    remoteSnapshot: SyncSnapshot, 
    result: SyncResult
  ): Promise<void> {
    this.logger.info('[WebDAV Sync] 开始下载阶段');
    
    const localItems = new Map(localSnapshot.items.map(item => [item.id, item]));
    const remoteItems = new Map(remoteSnapshot.items.map(item => [item.id, item]));
    
    const itemsToDownload: SyncItem[] = [];
    const conflicts: ItemComparison[] = [];

    // 比较本地和远程项目
    for (const [id, remoteItem] of remoteItems) {
      const localItem = localItems.get(id);
      
      if (!localItem) {
        // 远程有但本地没有的项目
        // 这可能是远程新增的项目，也可能是本地删除后远程还没有同步删除的项目
        // 我们需要检查本地快照的时间戳来判断
        
        const localSnapshotTime = new Date(localSnapshot.timestamp);
        const remoteItemTime = new Date(remoteItem.metadata.updatedAt);
        
        // 如果远程项目的更新时间早于本地快照时间，说明这个项目在本地快照生成时就已经不存在了
        // 这种情况下，我们应该尊重本地的删除操作，不下载这个项目
        if (remoteItemTime < localSnapshotTime) {
          this.logger.info(`[WebDAV Sync] 跳过下载远程项目 ${id} (${remoteItem.type})，因为本地已删除且远程项目较旧`);
          continue;
        } else {
          // 远程项目比本地快照新，说明是远程新增的项目
          itemsToDownload.push(remoteItem);
          result.itemsCreated++;
          this.logger.info(`[WebDAV Sync] 下载远程新增项目: ${id} (${remoteItem.type})`);
        }
      } else {
        // 检查是否需要下载
        const comparison = this.compareItems(localItem, remoteItem);
        if (comparison.needsDownload) {
          if (comparison.isConflict) {
            conflicts.push(comparison);
            result.conflictsResolved++;
          } else {
            itemsToDownload.push(remoteItem);
            result.itemsUpdated++;
          }
        }
      }
    }

    // 处理冲突
    for (const conflict of conflicts) {
      const resolution = await this.resolveConflict(conflict.localItem!, conflict.remoteItem!);
      result.conflictDetails.push({
        id: conflict.remoteItem!.id,
        type: conflict.remoteItem!.type,
        localVersion: conflict.localItem!.content,
        remoteVersion: conflict.remoteItem!.content,
        resolution: 'remote_wins', // 默认远程优先
        resolvedAt: resolution.timestamp
      });
      
      if (resolution.strategy === 'remote_wins') {
        itemsToDownload.push(conflict.remoteItem!);
      }
    }

    // 应用下载的变更
    if (itemsToDownload.length > 0) {
      await this.applyLocalChanges(itemsToDownload);
    }

    result.phases.download.completed = true;
    result.phases.download.itemsProcessed = itemsToDownload.length;
    this.logger.info('[WebDAV Sync] 下载阶段完成', { 
      downloaded: itemsToDownload.length, 
      conflicts: conflicts.length 
    });
  }

  /**
   * 比较两个项目，决定同步操作
   */
  private compareItems(localItem: SyncItem, remoteItem: SyncItem): ItemComparison {
    // 如果内容相同，无需操作
    if (localItem.metadata.checksum === remoteItem.metadata.checksum) {
      return {
        localItem,
        remoteItem,
        action: SyncAction.UpdateLocal,
        reason: '内容相同，无需操作',
        needsDownload: false,
        needsUpload: false,
        isConflict: false
      };
    }

    const localTime = new Date(localItem.metadata.updatedAt);
    const remoteTime = new Date(remoteItem.metadata.updatedAt);

    // 检查是否为冲突（两端都修改了）
    const lastSyncTime = localItem.metadata.syncTime ? new Date(localItem.metadata.syncTime) : new Date(0);
    const localModifiedAfterSync = localTime > lastSyncTime;
    const remoteModifiedAfterSync = remoteTime > lastSyncTime;

    if (localModifiedAfterSync && remoteModifiedAfterSync) {
      // 冲突：两端都在上次同步后修改了
      return {
        localItem,
        remoteItem,
        action: SyncAction.ItemConflict,
        reason: '两端都在上次同步后修改了',
        needsDownload: true,
        needsUpload: false,
        isConflict: true
      };
    }

    // 非冲突情况：基于时间戳决定
    if (remoteTime > localTime) {
      return {
        localItem,
        remoteItem,
        action: SyncAction.UpdateLocal,
        reason: '远程版本更新',
        needsDownload: true,
        needsUpload: false,
        isConflict: false
      };
    } else {
      return {
        localItem,
        remoteItem,
        action: SyncAction.UpdateRemote,
        reason: '本地版本更新',
        needsDownload: false,
        needsUpload: true,
        isConflict: false
      };
    }
  }

  /**
   * 检查是否需要上传
   */
  private needsUpload(localItem: SyncItem, remoteItem: SyncItem): boolean {
    if (localItem.metadata.checksum === remoteItem.metadata.checksum) {
      return false;
    }

    const localTime = new Date(localItem.metadata.updatedAt);
    const remoteTime = new Date(remoteItem.metadata.updatedAt);
    
    return localTime > remoteTime;
  }

  /**
   * 解决冲突
   */
  private async resolveConflict(localItem: SyncItem, remoteItem: SyncItem): Promise<ConflictResolution> {
    // 默认策略：远程优先
    // 在实际应用中，这里可以弹出对话框让用户选择
    return {
      itemId: localItem.id,
      strategy: 'remote_wins',
      timestamp: new Date().toISOString(),
      reason: '自动解决冲突：远程版本优先'
    };
  }

  /**
   * 应用本地变更
   */
  public async applyLocalChanges(items: SyncItem[]): Promise<void> {
    if (items.length === 0) return;

    const importData = this.convertFromSyncItems(items);
    await this.dataManagementService.syncImportDataObject(importData);
  }

  /**
   * 转换导出数据为同步项
   */
  private convertToSyncItems(exportData: any): SyncItem[] {
    const items: SyncItem[] = [];
    const now = new Date().toISOString();

    this.logger.info('[WebDAV Sync] 开始转换数据为同步项', {
      exportDataType: typeof exportData,
      hasCategories: !!exportData?.categories,
      hasPrompts: !!exportData?.prompts,
      hasAiConfigs: !!exportData?.aiConfigs,
      hasSettings: !!exportData?.settings
    });

    // 转换分类
    if (exportData?.categories && Array.isArray(exportData.categories)) {
      this.logger.info(`[WebDAV Sync] 转换 ${exportData.categories.length} 个分类`);
      for (const category of exportData.categories) {
        if (!category) continue;
        
        // 使用uuid字段，如果没有则使用id，都没有则生成新的
        const categoryUuid = String(category.uuid || category.id || uuidv4());
        items.push({
          id: categoryUuid,
          type: 'category',
          title: category.name || '未命名分类',
          content: category,
          metadata: {
            createdAt: category.createdAt || now,
            updatedAt: category.updatedAt || now,
            version: 1,
            deviceId: this.deviceId,
            lastModifiedBy: this.deviceId,
            checksum: this.calculateItemChecksum(category)
          }
        });
      }
    } else {
      this.logger.warn('[WebDAV Sync] 分类数据为空或格式不正确');
    }

    // 转换提示词
    if (exportData?.prompts && Array.isArray(exportData.prompts)) {
      this.logger.info(`[WebDAV Sync] 转换 ${exportData.prompts.length} 个提示词`);
      for (const prompt of exportData.prompts) {
        if (!prompt) continue;
        
        // 使用uuid字段，如果没有则使用id，都没有则生成新的
        const promptUuid = String(prompt.uuid || prompt.id || uuidv4());
        items.push({
          id: promptUuid,
          type: 'prompt',
          title: prompt.title || '未命名提示词',
          content: prompt,
          metadata: {
            createdAt: prompt.createdAt || now,
            updatedAt: prompt.updatedAt || now,
            version: 1,
            deviceId: this.deviceId,
            lastModifiedBy: this.deviceId,
            checksum: this.calculateItemChecksum(prompt)
          }
        });
      }
    } else {
      this.logger.warn('[WebDAV Sync] 提示词数据为空或格式不正确');
    }

    // 转换AI配置
    if (exportData?.aiConfigs && Array.isArray(exportData.aiConfigs)) {
      this.logger.info(`[WebDAV Sync] 转换 ${exportData.aiConfigs.length} 个AI配置`);
      for (const config of exportData.aiConfigs) {
        if (!config) continue;
        
        // 使用uuid字段，如果没有则使用id，都没有则生成新的
        const configUuid = String(config.uuid || config.id || uuidv4());
        items.push({
          id: configUuid,
          type: 'aiConfig',
          title: config.name || '未命名AI配置',
          content: config,
          metadata: {
            createdAt: config.createdAt || now,
            updatedAt: config.updatedAt || now,
            version: 1,
            deviceId: this.deviceId,
            lastModifiedBy: this.deviceId,
            checksum: this.calculateItemChecksum(config)
          }
        });
      }
    } else {
      this.logger.warn('[WebDAV Sync] AI配置数据为空或格式不正确');
    }

    // 转换设置
    if (exportData?.settings) {
      this.logger.info('[WebDAV Sync] 转换设置数据');
      items.push({
        id: 'settings',
        type: 'setting',
        title: '应用设置',
        content: exportData.settings,
        metadata: {
          createdAt: now,
          updatedAt: now,
          version: 1,
          deviceId: this.deviceId,
          lastModifiedBy: this.deviceId,
          checksum: this.calculateItemChecksum(exportData.settings)
        }
      });
    } else {
      this.logger.warn('[WebDAV Sync] 设置数据为空');
    }

    // 注意：history数据不参与同步，因为它们是临时性的生成记录
    // 如果需要同步history，可以在这里添加处理逻辑

    this.logger.info(`[WebDAV Sync] 数据转换完成，共生成 ${items.length} 个同步项`);
    return items;
  }

  /**
   * 转换同步项为导入数据
   */
  private convertFromSyncItems(items: SyncItem[]): any {
    const importData: any = {};

    for (const item of items) {
      switch (item.type) {
        case 'category':
          if (!importData.categories) importData.categories = [];
          importData.categories.push(item.content);
          break;
        case 'prompt':
          if (!importData.prompts) importData.prompts = [];
          importData.prompts.push(item.content);
          break;
        case 'aiConfig':
          if (!importData.aiConfigs) importData.aiConfigs = [];
          importData.aiConfigs.push(item.content);
          break;
        case 'setting':
          importData.settings = item.content;
          break;
      }
    }

    return importData;
  }

  /**
   * 计算项目校验和
   */
  private calculateItemChecksum(item: any): string {
    const normalized = this.normalizeForChecksum(item);
    return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
  }

  /**
   * 计算项目列表校验和
   */
  private calculateChecksum(items: SyncItem[]): string {
    // 确保所有项目都有有效的字符串UUID
    const validItems = items.filter(item => {
      if (!item || !item.content) {
        this.logger.warn('[WebDAV Sync] 跳过无效项目（缺少content）:', item);
        return false;
      }
      
      // 检查content中的uuid字段
      const uuid = item.content.uuid || item.content.id;
      if (!uuid) {
        this.logger.warn('[WebDAV Sync] 跳过无效项目（缺少UUID）:', item.content);
        return false;
      }
      if (typeof uuid !== 'string') {
        this.logger.warn('[WebDAV Sync] 跳过无效项目（UUID不是字符串）:', uuid, typeof uuid);
        return false;
      }
      return true;
    });

    if (validItems.length === 0) {
      this.logger.warn('[WebDAV Sync] 没有有效的项目用于计算校验和');
      return crypto.createHash('sha256').update('empty').digest('hex');
    }

    // 按UUID排序
    const sortedItems = validItems.sort((a, b) => {
      const uuidA = String(a.content.uuid || a.content.id || '');
      const uuidB = String(b.content.uuid || b.content.id || '');
      return uuidA.localeCompare(uuidB);
    });

    const checksums = sortedItems.map(item => item.metadata.checksum);
    return crypto.createHash('sha256').update(checksums.join('')).digest('hex');
  }

  /**
   * 标准化数据用于校验和计算
   */
  private normalizeForChecksum(data: any): any {
    if (data === null || data === undefined) return data;
    if (typeof data === 'string' || typeof data === 'number' || typeof data === 'boolean') return data;
    
    if (Array.isArray(data)) {
      return data.map(item => this.normalizeForChecksum(item));
    }
    
    if (typeof data === 'object') {
      const normalized: any = {};
      const keys = Object.keys(data).sort();
      for (const key of keys) {
        // 跳过不需要参与校验和的字段
        if (['id', 'createdAt', 'updatedAt', 'syncTime'].includes(key)) continue;
        normalized[key] = this.normalizeForChecksum(data[key]);
      }
      return normalized;
    }
    
    return data;
  }

  /**
   * 检查远程文件是否存在
   */
  private async remoteFileExists(client: any, filePath: string): Promise<boolean> {
    try {
      await client.stat(filePath);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * 确保远程目录存在
   */
  private async ensureRemoteDirectory(client: any, dirPath: string): Promise<void> {
    try {
      await client.createDirectory(dirPath);
    } catch (error) {
      // 目录可能已存在，忽略错误
    }
  }
} 