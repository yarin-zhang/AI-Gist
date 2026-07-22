import { describe, expect, it } from 'vitest';
import { getCloudSyncV2ArtifactPath, getCloudSyncV2ManifestBackupPath, getCloudSyncV2ManifestPath } from '@shared/cloud-backup-paths';
import { createCloudSyncV2MigrationArtifacts } from '@shared/cloud-sync-v2-migration';
import { encodeCloudSyncV2Canonical } from '@shared/cloud-sync-protocol-v2';
import {
  CloudSyncV2RepositoryError,
  cleanupArtifacts,
  cleanupArtifactsUsingRetention,
  publishMigrationArtifacts,
  readManifest,
  type CloudSyncV2ObjectStorageAdapter,
  type CloudSyncV2ObjectWriteOptions,
  type CloudSyncV2ObjectWriteResult,
  type CloudSyncV2StoredObject,
  type CloudSyncV2StoredObjectInfo
} from '@shared/cloud-sync-v2-repository';

const EMPTY_DATA = {
  categories: [], prompts: [], promptVariables: [], promptHistories: [], aiConfigs: [],
  quickOptimizationConfigs: [], aiHistory: [], settings: [], syncTombstones: []
};

class MemoryObjectStorage implements CloudSyncV2ObjectStorageAdapter {
  objects = new Map<string, CloudSyncV2StoredObject>();
  operations: string[] = [];
  private version = 0;

  async read(path: string): Promise<CloudSyncV2StoredObject | null> {
    this.operations.push(`read:${path}`);
    const object = this.objects.get(path);
    return object ? { data: object.data.slice(), etag: object.etag } : null;
  }

  async write(path: string, data: Uint8Array, options: CloudSyncV2ObjectWriteOptions = {}): Promise<CloudSyncV2ObjectWriteResult> {
    this.operations.push(`write:${path}`);
    const current = this.objects.get(path);
    if ((options.ifAbsent && current) || (options.expectedEtag !== undefined && current?.etag !== options.expectedEtag)) {
      return { status: 'precondition_failed', etag: current?.etag };
    }
    const etag = `etag-${++this.version}`;
    this.objects.set(path, { data: data.slice(), etag });
    return { status: 'written', etag };
  }

  async delete(path: string): Promise<void> {
    this.operations.push(`delete:${path}`);
    this.objects.delete(path);
  }

  async list(prefix: string): Promise<CloudSyncV2StoredObjectInfo[]> {
    return [...this.objects.entries()]
      .filter(([path]) => path.startsWith(prefix))
      .map(([path, object]) => ({ path, etag: object.etag, byteLength: object.data.byteLength }));
  }

  putRaw(path: string, data: Uint8Array): void {
    this.objects.set(path, { data, etag: `etag-${++this.version}` });
  }
}

async function migration(revision: string, image?: string) {
  return createCloudSyncV2MigrationArtifacts({
    data: {
      ...EMPTY_DATA,
      prompts: [{ id: 1, uuid: `prompt-${revision}`, title: revision, content: revision, ...(image ? { imageBlobs: [image] } : {}) }]
    },
    revision,
    deviceId: 'device-a',
    createdAt: '2026-07-11T00:00:00.000Z'
  });
}

describe('cloud sync v2 repository', () => {
  it('writes immutable artifacts in dependency order and publishes the manifest last', async () => {
    const storage = new MemoryObjectStorage();
    const artifacts = await migration('revision-1', 'data:image/png;base64,aGVsbG8=');
    const result = await publishMigrationArtifacts(storage, artifacts);

    expect(result.status).toBe('published');
    const writes = storage.operations.filter(operation => operation.startsWith('write:'));
    expect(writes.map(operation => operation.split('/').slice(-2, -1)[0])).toEqual([
      'blobs', 'checkpoints', 'commits', 'sync-v2', 'sync-v2'
    ]);
    expect(writes.at(-2)).toBe(`write:${getCloudSyncV2ManifestPath()}`);
    expect(writes.at(-1)).toBe(`write:${getCloudSyncV2ManifestBackupPath()}`);
  });

  it('makes retries idempotent without replacing immutable objects', async () => {
    const storage = new MemoryObjectStorage();
    const artifacts = await migration('revision-1');
    await publishMigrationArtifacts(storage, artifacts);
    const writesBefore = storage.operations.length;
    const result = await publishMigrationArtifacts(storage, artifacts);

    expect(result).toMatchObject({ status: 'published', manifestAlreadyPublished: true });
    expect(result.status === 'published' && result.reusedPaths).toEqual(expect.arrayContaining([
      getCloudSyncV2ArtifactPath('checkpoints', artifacts.checkpoint.checkpointId),
      getCloudSyncV2ArtifactPath('commits', artifacts.commit.commitId),
      getCloudSyncV2ManifestPath()
    ]));
    expect(storage.operations.length).toBeGreaterThan(writesBefore);
  });

  it('fails when an immutable path already contains different content', async () => {
    const storage = new MemoryObjectStorage();
    const artifacts = await migration('revision-1');
    const path = getCloudSyncV2ArtifactPath('checkpoints', artifacts.checkpoint.checkpointId);
    storage.putRaw(path, new TextEncoder().encode('{"corrupt":true}'));

    await expect(publishMigrationArtifacts(storage, artifacts)).rejects.toMatchObject<Partial<CloudSyncV2RepositoryError>>({
      code: 'artifact_content_conflict', path
    });
    expect(storage.objects.has(getCloudSyncV2ManifestPath())).toBe(false);
  });

  it('returns a structured conflict instead of overwriting a newer manifest', async () => {
    const storage = new MemoryObjectStorage();
    const first = await migration('revision-1');
    const second = await migration('revision-2');
    await publishMigrationArtifacts(storage, first);
    const result = await publishMigrationArtifacts(storage, second, { headId: null });

    expect(result).toMatchObject({
      status: 'conflict', code: 'manifest_cas_conflict', reason: 'head_mismatch',
      expectedHeadId: null, actualHeadId: first.commit.commitId
    });
    expect((await readManifest(storage))?.manifest.head?.id).toBe(first.commit.commitId);
  });

  it('reports primary publication as successful when only the backup manifest write fails', async () => {
    const base = new MemoryObjectStorage();
    const storage: CloudSyncV2ObjectStorageAdapter = {
      read: path => base.read(path),
      list: prefix => base.list(prefix),
      delete: path => base.delete(path),
      write: (path, data, options) => {
        if (path === getCloudSyncV2ManifestBackupPath()) throw new Error('backup unavailable');
        return base.write(path, data, options);
      }
    };
    const artifacts = await migration('revision-backup-failure');

    const result = await publishMigrationArtifacts(storage, artifacts);

    expect(result).toMatchObject({ status: 'published', manifestAlreadyPublished: false });
    expect(result.status === 'published' && result.backupWarning).toContain('manifest_backup_failed');
    expect((await readManifest(storage))?.manifest.head?.id).toBe(artifacts.commit.commitId);
  });

  it('falls back to a valid backup manifest when the primary is corrupt', async () => {
    const storage = new MemoryObjectStorage();
    const artifacts = await migration('revision-1');
    await publishMigrationArtifacts(storage, artifacts);
    storage.putRaw(getCloudSyncV2ManifestPath(), new TextEncoder().encode('not-json'));

    const result = await readManifest(storage);
    expect(result).toMatchObject({ source: 'backup', manifest: { head: { id: artifacts.commit.commitId } } });
    expect(result?.primaryError?.code).toBe('manifest_invalid');
  });

  it('cleans unretained artifacts while preserving quarantine artifacts', async () => {
    const storage = new MemoryObjectStorage();
    const kept = await migration('kept');
    const stale = await migration('stale');
    await publishMigrationArtifacts(storage, kept);
    storage.putRaw(
      getCloudSyncV2ArtifactPath('commits', stale.commit.commitId),
      new TextEncoder().encode(JSON.stringify(stale.commit))
    );
    storage.putRaw(
      getCloudSyncV2ArtifactPath('checkpoints', stale.checkpoint.checkpointId),
      new TextEncoder().encode(JSON.stringify(stale.checkpoint))
    );
    const quarantined = await createCloudSyncV2MigrationArtifacts({
      data: {
        ...EMPTY_DATA,
        promptVariables: [{ id: 3, uuid: 'orphan-variable', promptUuid: 'missing-prompt' }]
      },
      revision: 'quarantined', deviceId: 'device-a', createdAt: '2026-07-11T00:00:00.000Z'
    });
    const quarantinePath = getCloudSyncV2ArtifactPath('quarantine', quarantined.quarantine!.quarantineId);
    storage.putRaw(quarantinePath, encodeCloudSyncV2Canonical(quarantined.quarantine));

    const result = await cleanupArtifacts(storage, {
      commitIds: [kept.commit.commitId],
      checkpointIds: [kept.checkpoint.checkpointId],
      activeDeviceIds: [], reasons: {}
    });
    expect(result.deletedPaths).toEqual(expect.arrayContaining([
      getCloudSyncV2ArtifactPath('commits', stale.commit.commitId),
      getCloudSyncV2ArtifactPath('checkpoints', stale.checkpoint.checkpointId)
    ]));
    expect(storage.objects.has(quarantinePath)).toBe(true);
  });

  it('aborts retention cleanup when the manifest head commit is missing', async () => {
    const storage = new MemoryObjectStorage();
    const artifacts = await migration('missing-head');
    await publishMigrationArtifacts(storage, artifacts);
    storage.objects.delete(getCloudSyncV2ArtifactPath('commits', artifacts.commit.commitId));

    await expect(cleanupArtifactsUsingRetention(storage, artifacts.manifest, {
      recentCommitCount: 1
    })).rejects.toMatchObject<Partial<CloudSyncV2RepositoryError>>({
      code: 'artifact_readback_failed'
    });
    expect(storage.objects.has(
      getCloudSyncV2ArtifactPath('checkpoints', artifacts.checkpoint.checkpointId)
    )).toBe(true);
  });
});
