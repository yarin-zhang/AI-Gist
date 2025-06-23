/**
 * WebDAV 删除同步测试
 * 验证批量删除操作后，WebDAV 同步不会将删除的数据重新下载到本地
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebDAVService } from '../../../src/main/sync/webdav-service';

// Mock 依赖
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
    removeHandler: vi.fn()
  },
  app: {
    getPath: vi.fn(() => '/mock/user/data'),
    getVersion: vi.fn(() => '1.0.0')
  }
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn()
}));

vi.mock('os', () => ({
  hostname: vi.fn(() => 'test-host')
}));

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-uuid')
}));

describe('WebDAV 删除同步测试', () => {
  let webdavService: WebDAVService;
  let mockPreferencesManager: any;
  let mockDataManagementService: any;

  beforeEach(() => {
    // 创建模拟的偏好设置管理器
    mockPreferencesManager = {
      getPreferences: vi.fn(),
      updatePreferences: vi.fn()
    };

    // 创建模拟的数据管理服务
    mockDataManagementService = {
      generateExportData: vi.fn(),
      syncImportDataObject: vi.fn()
    };

    // 创建 WebDAV 服务实例
    webdavService = new WebDAVService(mockPreferencesManager, mockDataManagementService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('本地快照生成时的删除处理', () => {
    it('应该过滤掉已删除的项目', async () => {
      // 模拟删除记录
      mockPreferencesManager.getPreferences.mockReturnValue({
        webdav: {
          deletedItems: [
            { uuid: 'deleted-uuid-1', deletedAt: '2024-01-01T00:00:00Z', deviceId: 'device1' },
            { uuid: 'deleted-uuid-2', deletedAt: '2024-01-01T00:00:00Z', deviceId: 'device1' }
          ]
        }
      });

      // 模拟本地数据
      mockDataManagementService.generateExportData.mockResolvedValue({
        data: {
          prompts: [
            { id: 'active-uuid-1', title: 'Active Prompt 1' },
            { id: 'deleted-uuid-1', title: 'Deleted Prompt 1' }, // 这个应该被过滤
            { id: 'active-uuid-2', title: 'Active Prompt 2' },
            { id: 'deleted-uuid-2', title: 'Deleted Prompt 2' }  // 这个应该被过滤
          ]
        }
      });

      // 初始化服务
      await webdavService.initialize();

      // 获取本地快照
      const snapshot = await webdavService['getLocalSnapshot']();

      // 验证删除的项目被过滤掉了
      expect(snapshot.items).toHaveLength(2);
      expect(snapshot.items.map(item => item.id)).toEqual(['active-uuid-1', 'active-uuid-2']);
      expect(snapshot.items.map(item => item.id)).not.toContain('deleted-uuid-1');
      expect(snapshot.items.map(item => item.id)).not.toContain('deleted-uuid-2');
    });
  });

  describe('合并快照时的删除处理', () => {
    it('应该跳过已删除的远程项目', async () => {
      // 模拟删除记录
      mockPreferencesManager.getPreferences.mockReturnValue({
        webdav: {
          deletedItems: [
            { uuid: 'deleted-uuid', deletedAt: '2024-01-01T00:00:00Z', deviceId: 'device1' }
          ]
        }
      });

      const localSnapshot = {
        timestamp: '2024-01-01T00:00:00Z',
        version: '2.0.0',
        deviceId: 'device1',
        items: [],
        metadata: {
          totalItems: 0,
          checksum: 'local-checksum',
          syncId: 'local-sync-id',
          conflictsResolved: [],
          deviceInfo: {
            id: 'device1',
            name: 'test-host',
            platform: 'test',
            appVersion: '1.0.0'
          }
        }
      };

      const remoteSnapshot = {
        timestamp: '2024-01-01T00:00:00Z',
        version: '2.0.0',
        deviceId: 'device2',
        items: [
          {
            id: 'deleted-uuid',
            type: 'prompt',
            title: 'Test Prompt',
            content: { title: 'Test Prompt', content: 'test content' },
            metadata: {
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:00:00Z',
              version: 1,
              deviceId: 'device2',
              lastModifiedBy: 'device2',
              checksum: 'remote-checksum',
              deleted: false
            }
          }
        ],
        metadata: {
          totalItems: 1,
          checksum: 'remote-checksum',
          syncId: 'remote-sync-id',
          conflictsResolved: [],
          deviceInfo: {
            id: 'device2',
            name: 'remote-host',
            platform: 'test',
            appVersion: '1.0.0'
          }
        }
      };

      const result = await webdavService['mergeSnapshots'](localSnapshot, remoteSnapshot);

      // 验证已删除的项目没有被添加到合并结果中
      expect(result.mergedSnapshot.items).toHaveLength(0);
      expect(result.localChanges).toHaveLength(0);
      expect(result.itemsCreated).toBe(0);
      expect(result.hasChanges).toBe(false);
    });

    it('应该正确处理删除状态的冲突', async () => {
      mockPreferencesManager.getPreferences.mockReturnValue({
        webdav: {
          deletedItems: []
        }
      });

      const localSnapshot = {
        timestamp: '2024-01-01T00:00:00Z',
        version: '2.0.0',
        deviceId: 'device1',
        items: [
          {
            id: 'conflict-uuid',
            type: 'prompt',
            title: 'Local Prompt',
            content: { title: 'Local Prompt', content: 'local content' },
            metadata: {
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-02T00:00:00Z', // 本地更新时间更晚
              version: 1,
              deviceId: 'device1',
              lastModifiedBy: 'device1',
              checksum: 'local-checksum',
              deleted: true // 本地标记为删除
            }
          }
        ],
        metadata: {
          totalItems: 1,
          checksum: 'local-checksum',
          syncId: 'local-sync-id',
          conflictsResolved: [],
          deviceInfo: {
            id: 'device1',
            name: 'test-host',
            platform: 'test',
            appVersion: '1.0.0'
          }
        }
      };

      const remoteSnapshot = {
        timestamp: '2024-01-01T00:00:00Z',
        version: '2.0.0',
        deviceId: 'device2',
        items: [
          {
            id: 'conflict-uuid',
            type: 'prompt',
            title: 'Remote Prompt',
            content: { title: 'Remote Prompt', content: 'remote content' },
            metadata: {
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:00:00Z', // 远程更新时间更早
              version: 1,
              deviceId: 'device2',
              lastModifiedBy: 'device2',
              checksum: 'remote-checksum',
              deleted: false // 远程未删除
            }
          }
        ],
        metadata: {
          totalItems: 1,
          checksum: 'remote-checksum',
          syncId: 'remote-sync-id',
          conflictsResolved: [],
          deviceInfo: {
            id: 'device2',
            name: 'remote-host',
            platform: 'test',
            appVersion: '1.0.0'
          }
        }
      };

      const result = await webdavService['mergeSnapshots'](localSnapshot, remoteSnapshot);

      // 验证本地删除状态被保持（因为本地删除时间更晚）
      expect(result.mergedSnapshot.items).toHaveLength(1);
      expect(result.mergedSnapshot.items[0].metadata.deleted).toBe(true);
      expect(result.localChanges).toHaveLength(0); // 不应该有本地变更
      expect(result.itemsUpdated).toBe(0);
    });
  });

  describe('下载阶段的删除处理', () => {
    it('应该跳过已删除的远程项目', async () => {
      // 模拟删除记录
      mockPreferencesManager.getPreferences.mockReturnValue({
        webdav: {
          deletedItems: [
            { uuid: 'deleted-uuid', deletedAt: '2024-01-01T00:00:00Z', deviceId: 'device1' }
          ]
        }
      });

      const localSnapshot = {
        timestamp: '2024-01-01T00:00:00Z',
        version: '2.0.0',
        deviceId: 'device1',
        items: [],
        metadata: {
          totalItems: 0,
          checksum: 'local-checksum',
          syncId: 'local-sync-id',
          conflictsResolved: [],
          deviceInfo: {
            id: 'device1',
            name: 'test-host',
            platform: 'test',
            appVersion: '1.0.0'
          }
        }
      };

      const remoteSnapshot = {
        timestamp: '2024-01-01T00:00:00Z',
        version: '2.0.0',
        deviceId: 'device2',
        items: [
          {
            id: 'deleted-uuid',
            type: 'prompt',
            title: 'Test Prompt',
            content: { title: 'Test Prompt', content: 'test content' },
            metadata: {
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:00:00Z',
              version: 1,
              deviceId: 'device2',
              lastModifiedBy: 'device2',
              checksum: 'remote-checksum',
              deleted: false
            }
          }
        ],
        metadata: {
          totalItems: 1,
          checksum: 'remote-checksum',
          syncId: 'remote-sync-id',
          conflictsResolved: [],
          deviceInfo: {
            id: 'device2',
            name: 'remote-host',
            platform: 'test',
            appVersion: '1.0.0'
          }
        }
      };

      const mockClient = {};
      const mockResult = {
        itemsCreated: 0,
        itemsUpdated: 0,
        itemsDeleted: 0,
        itemsProcessed: 0,
        conflictsResolved: 0,
        conflictDetails: [],
        phases: {
          download: { completed: false, itemsProcessed: 0, errors: [] }
        }
      };

      await webdavService['performDownloadAndMergePhase'](mockClient, localSnapshot, remoteSnapshot, mockResult);

      // 验证已删除的项目没有被下载
      expect(mockResult.itemsCreated).toBe(0);
      expect(mockResult.itemsUpdated).toBe(0);
    });
  });

  describe('应用本地变更时的删除处理', () => {
    it('应该过滤掉删除的项目', async () => {
      const changes = [
        {
          id: 'active-uuid',
          type: 'prompt',
          title: 'Active Prompt',
          content: { title: 'Active Prompt', content: 'active content' },
          metadata: {
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
            version: 1,
            deviceId: 'device1',
            lastModifiedBy: 'device1',
            checksum: 'active-checksum',
            deleted: false
          }
        },
        {
          id: 'deleted-uuid',
          type: 'prompt',
          title: 'Deleted Prompt',
          content: { title: 'Deleted Prompt', content: 'deleted content' },
          metadata: {
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
            version: 1,
            deviceId: 'device1',
            lastModifiedBy: 'device1',
            checksum: 'deleted-checksum',
            deleted: true // 标记为删除
          }
        }
      ];

      // 模拟数据管理服务
      mockDataManagementService.syncImportDataObject.mockResolvedValue({
        success: true,
        imported: { prompts: 1 }
      });

      await webdavService['applyLocalChanges'](changes);

      // 验证只导入了非删除的项目
      expect(mockDataManagementService.syncImportDataObject).toHaveBeenCalledWith({
        prompts: [
          {
            id: 'active-uuid',
            title: 'Active Prompt',
            content: 'active content',
            updatedAt: '2024-01-01T00:00:00Z',
            createdAt: '2024-01-01T00:00:00Z'
          }
        ]
      });
    });
  });
}); 