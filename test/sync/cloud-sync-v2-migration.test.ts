import { describe, expect, it } from 'vitest';
import { createCloudSyncV2MigrationArtifacts } from '@shared/cloud-sync-v2-migration';
import {
  validateCloudSyncV2Checkpoint,
  validateCloudSyncV2Commit,
  validateCloudSyncV2Manifest,
  validateCloudSyncV2QuarantineBundle
} from '@shared/cloud-sync-protocol-v2';

const EMPTY_DATA = {
  categories: [],
  prompts: [],
  promptVariables: [],
  promptHistories: [],
  aiConfigs: [],
  quickOptimizationConfigs: [],
  aiHistory: [],
  settings: [],
  syncTombstones: []
};

describe('cloud sync v2 migration artifacts', () => {
  it('builds a validated first checkpoint, commit, and lightweight manifest', async () => {
    const artifacts = await createCloudSyncV2MigrationArtifacts({
      data: {
        ...EMPTY_DATA,
        categories: [{ id: 1, uuid: 'category-1', name: 'Production' }],
        prompts: [{ id: 1, uuid: 'prompt-1', title: 'Hello', content: 'world', categoryUuid: 'category-1' }]
      },
      revision: 'revision-1',
      deviceId: 'device-a',
      createdAt: '2026-07-11T00:00:00.000Z'
    });

    expect((await validateCloudSyncV2Checkpoint(artifacts.checkpoint)).valid).toBe(true);
    expect((await validateCloudSyncV2Commit(artifacts.commit)).valid).toBe(true);
    expect(validateCloudSyncV2Manifest(artifacts.manifest).valid).toBe(true);
    expect(artifacts.manifest).not.toHaveProperty('latestSnapshot');
    expect(artifacts.manifest.head?.revision).toBe('revision-1');
  });

  it('deduplicates image payloads into content-addressed blob artifacts', async () => {
    const image = 'data:image/png;base64,aGVsbG8=';
    const artifacts = await createCloudSyncV2MigrationArtifacts({
      data: {
        ...EMPTY_DATA,
        prompts: [
          { id: 1, uuid: 'prompt-1', title: 'A', content: 'A', imageBlobs: [image] },
          { id: 2, uuid: 'prompt-2', title: 'B', content: 'B', imageBlobs: [image] }
        ]
      },
      revision: 'revision-images',
      deviceId: 'device-a'
    });

    expect(artifacts.blobs).toHaveLength(1);
    expect(artifacts.checkpoint.blobs).toHaveLength(1);
    expect(JSON.stringify(artifacts.checkpoint.collections.prompts)).not.toContain('aGVsbG8=');
    expect(JSON.stringify(artifacts.checkpoint.collections.prompts)).toContain('$blob');
  });

  it('preserves unresolved dependency groups in a validated quarantine bundle', async () => {
    const artifacts = await createCloudSyncV2MigrationArtifacts({
      data: {
        ...EMPTY_DATA,
        prompts: [{ id: 10, uuid: 'prompt-orphan', title: 'Orphan', categoryUuid: 'missing-category' }],
        promptVariables: [{ id: 20, uuid: 'variable-orphan', promptId: 10, promptUuid: 'prompt-orphan' }]
      },
      revision: 'revision-quarantine',
      deviceId: 'device-a'
    });

    expect(artifacts.quarantine).toBeDefined();
    expect((await validateCloudSyncV2QuarantineBundle(artifacts.quarantine)).valid).toBe(true);
    expect(artifacts.quarantine?.groups[0].records.map(record => record.recordKey)).toEqual([
      'uuid:prompt-orphan',
      'uuid:variable-orphan'
    ]);
    expect(artifacts.checkpoint.collections.prompts).toEqual([]);
    expect(artifacts.commit.quarantine).toHaveLength(1);
  });
});
