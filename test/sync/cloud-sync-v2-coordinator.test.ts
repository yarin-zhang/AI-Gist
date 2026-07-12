import { describe, expect, it } from 'vitest';
import {
  CloudSyncV2Coordinator,
  evaluateCloudSyncV2DeviceFreshness
} from '../../src/renderer/lib/services/cloud-sync-v2-coordinator';
import type { CloudSyncV2ObjectStorageAdapter } from '../../src/shared/cloud-sync-v2-repository';
import {
  createCloudSyncV2Manifest,
  encodeCloudSyncV2Canonical
} from '../../src/shared/cloud-sync-protocol-v2';
import {
  getCloudSyncV2ManifestBackupPath,
  getCloudSyncV2ManifestPath
} from '../../src/shared/cloud-backup-paths';

function memoryStorage(failWrites = new Set<string>()): CloudSyncV2ObjectStorageAdapter {
  const objects = new Map<string, { data: Uint8Array; etag: string }>();
  let version = 0;
  return {
    async read(path) {
      const item = objects.get(path);
      return item ? { data: item.data.slice(), etag: item.etag } : null;
    },
    async write(path, data, options = {}) {
      if (failWrites.has(path)) throw new Error(`write failed: ${path}`);
      const current = objects.get(path);
      if (options.ifAbsent && current) return { status: 'precondition_failed', etag: current.etag };
      if (options.expectedEtag && current?.etag !== options.expectedEtag) {
        return { status: 'precondition_failed', etag: current?.etag };
      }
      const etag = `etag-${++version}`;
      objects.set(path, { data: data.slice(), etag });
      return { status: 'written', etag };
    },
    async delete(path) { objects.delete(path); },
    async list(prefix) {
      return [...objects.entries()]
        .filter(([path]) => path.startsWith(prefix))
        .map(([path, item]) => ({ path, etag: item.etag, byteLength: item.data.byteLength }));
    }
  };
}

function metadataStore() {
  const values = new Map<string, unknown>();
  return {
    values,
    async getLocalSyncMetadata<T>(key: string) { return (values.get(key) as T) || null; },
    async setLocalSyncMetadata<T>(key: string, value: T) { values.set(key, value); }
  };
}

describe('CloudSyncV2Coordinator', () => {
  it('默认关闭，完全不触碰远端或导出数据', async () => {
    const metadata = metadataStore();
    let exported = false;
    const coordinator = new CloudSyncV2Coordinator({ database: metadata, storageFactory: () => memoryStorage() });
    const result = await coordinator.mirrorSuccessfulV1Sync({
      storageId: 'cfg', revision: 'r1', deviceId: 'd1',
      exportData: async () => { exported = true; return {}; }
    });
    expect(result.status).toBe('skipped');
    expect(exported).toBe(false);
  });

  it('当前构建未启用内部实验开关时忽略历史 shadow 状态', async () => {
    const metadata = metadataStore();
    metadata.values.set('cloud-sync-v2-rollout:cfg', {
      mode: 'shadow',
      updatedAt: '2026-07-11T00:00:00.000Z'
    });
    let exported = false;
    const coordinator = new CloudSyncV2Coordinator({
      database: metadata,
      storageFactory: () => memoryStorage(),
      allowExperimentalShadow: false
    });

    const result = await coordinator.mirrorSuccessfulV1Sync({
      storageId: 'cfg', revision: 'r1', deviceId: 'd1',
      exportData: async () => { exported = true; return {}; }
    });

    expect(result.status).toBe('skipped');
    expect(exported).toBe(false);
    expect((await coordinator.getRolloutState('cfg')).mode).toBe('off');
  });

  it('shadow 模式发布完整 v2 链并记录已验证 head，重复 revision 幂等跳过', async () => {
    const metadata = metadataStore();
    const storage = memoryStorage();
    const coordinator = new CloudSyncV2Coordinator({
      database: metadata,
      storageFactory: () => storage,
      now: () => new Date('2026-07-11T00:00:00.000Z')
    });
    await coordinator.setRolloutMode('cfg', 'shadow');
    const input = {
      storageId: 'cfg', revision: 'r1', deviceId: 'd1',
      exportData: async () => ({ categories: [], prompts: [], settings: [] })
    };
    const first = await coordinator.mirrorSuccessfulV1Sync(input);
    const second = await coordinator.mirrorSuccessfulV1Sync(input);
    expect(first.status).toBe('published');
    expect(second).toMatchObject({ status: 'already-current', headId: first.headId });
    expect((await coordinator.getRolloutState('cfg')).migrationState).toBe('verified');
  });

  it('备用 manifest 写失败后会在相同 revision 的下一次影子同步修复', async () => {
    const metadata = metadataStore();
    const failWrites = new Set([getCloudSyncV2ManifestBackupPath()]);
    const storage = memoryStorage(failWrites);
    const coordinator = new CloudSyncV2Coordinator({ database: metadata, storageFactory: () => storage });
    await coordinator.setRolloutMode('cfg', 'shadow');
    const input = { storageId: 'cfg', revision: 'r1', deviceId: 'd1', exportData: async () => ({}) };

    const first = await coordinator.mirrorSuccessfulV1Sync(input);
    expect(first).toMatchObject({ status: 'published' });
    expect(first.warning).toContain('备用索引');
    expect((await coordinator.getRolloutState('cfg')).backupRepairRequired).toBe(true);

    failWrites.clear();
    const second = await coordinator.mirrorSuccessfulV1Sync(input);
    expect(second.status).toBe('already-current');
    expect(second.warning).toBeUndefined();
    expect((await coordinator.getRolloutState('cfg')).backupRepairRequired).toBe(false);
    expect(await storage.read(getCloudSyncV2ManifestBackupPath())).not.toBeNull();
  });

  it('真实发布链在设备超过 90 天后要求安全重建', async () => {
    const metadata = metadataStore();
    const storage = memoryStorage();
    const first = new CloudSyncV2Coordinator({
      database: metadata, storageFactory: () => storage,
      now: () => new Date('2026-01-01T00:00:00.000Z')
    });
    await first.setRolloutMode('cfg', 'shadow');
    await first.mirrorSuccessfulV1Sync({
      storageId: 'cfg', revision: 'r1', deviceId: 'd1', exportData: async () => ({})
    });

    const stale = new CloudSyncV2Coordinator({
      database: metadata, storageFactory: () => storage,
      now: () => new Date('2026-04-02T00:00:00.000Z')
    });
    const result = await stale.mirrorSuccessfulV1Sync({
      storageId: 'cfg', revision: 'r2', deviceId: 'd1', exportData: async () => ({})
    });
    expect(result.status).toBe('rebase-required');
    expect((await stale.getRolloutState('cfg')).migrationState).toBe('rebase-required');
  });

  it('拒绝低于云端 minWriterProtocol 的 writer，且不降低协议门槛', async () => {
    const metadata = metadataStore();
    const storage = memoryStorage();
    const coordinator = new CloudSyncV2Coordinator({ database: metadata, storageFactory: () => storage });
    await coordinator.setRolloutMode('cfg', 'shadow');
    await coordinator.mirrorSuccessfulV1Sync({
      storageId: 'cfg', revision: 'r1', deviceId: 'd1', exportData: async () => ({})
    });
    const path = getCloudSyncV2ManifestPath();
    const current = await storage.read(path);
    const manifest = JSON.parse(new TextDecoder().decode(current!.data));
    manifest.minWriterProtocol = 3;
    await storage.write(path, encodeCloudSyncV2Canonical(manifest), { expectedEtag: current!.etag });

    const result = await coordinator.mirrorSuccessfulV1Sync({
      storageId: 'cfg', revision: 'r2', deviceId: 'd1', exportData: async () => ({})
    });
    expect(result.status).toBe('failed');
    expect((await coordinator.getRolloutState('cfg')).lastErrorCode).toBe('unsupported_writer_protocol');
  });

  it('影子失败状态写入也失败时仍返回失败结果而不是抛出', async () => {
    const coordinator = new CloudSyncV2Coordinator({
      database: {
        async getLocalSyncMetadata() { return { mode: 'shadow', updatedAt: '2026-01-01T00:00:00.000Z' }; },
        async setLocalSyncMetadata() { throw new DOMException('quota', 'QuotaExceededError'); }
      },
      storageFactory: () => null
    });
    await expect(coordinator.mirrorSuccessfulV1Sync({
      storageId: 'cfg', revision: 'r1', deviceId: 'd1', exportData: async () => ({})
    })).resolves.toMatchObject({ status: 'failed' });
  });

  it('read-write 模式在全链读取切换完成前被硬阻断', async () => {
    const coordinator = new CloudSyncV2Coordinator({ database: metadataStore(), storageFactory: () => memoryStorage() });
    await expect(coordinator.setRolloutMode('cfg', 'read-write')).rejects.toThrow(/尚未开放/);
  });

  it.each([
    [89, true],
    [90, true],
    [91, false]
  ])('%d 天未活跃边界安全性为 %s', (days, safe) => {
    const now = new Date('2026-07-11T00:00:00.000Z');
    const lastSeenAt = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
    const manifest = createCloudSyncV2Manifest({
      epoch: 2,
      updatedAt: now.toISOString(),
      deviceAcks: { d1: { deviceId: 'd1', epoch: 2, lastSeenAt, minWriterProtocol: 2 } }
    });
    expect(evaluateCloudSyncV2DeviceFreshness({ manifest, deviceId: 'd1', localEpoch: 2, now }).safe).toBe(safe);
  });

  it('epoch 落后或 base 已被清理时强制安全重建', () => {
    const manifest = createCloudSyncV2Manifest({
      epoch: 3,
      updatedAt: '2026-07-11T00:00:00.000Z',
      deviceAcks: {}
    });
    expect(evaluateCloudSyncV2DeviceFreshness({ manifest, deviceId: 'd1', localEpoch: 2 }).reason).toBe('epoch-behind');
    expect(evaluateCloudSyncV2DeviceFreshness({ manifest, deviceId: 'd1', localEpoch: 3, baseCommitAvailable: false }).reason).toBe('base-unavailable');
  });
});
