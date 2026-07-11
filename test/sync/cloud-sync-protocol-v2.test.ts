import { describe, expect, it } from 'vitest';
import {
  CLOUD_SYNC_V2_NAMESPACE,
  CLOUD_SYNC_V2_PROTOCOL_VERSION,
  canCompactCloudSyncV2Tombstone,
  createCloudSyncV2BlobRef,
  createCloudSyncV2Checkpoint,
  createCloudSyncV2CheckpointRef,
  createCloudSyncV2Commit,
  createCloudSyncV2CommitRef,
  createCloudSyncV2DeltaRef,
  createCloudSyncV2DeltaSegment,
  createCloudSyncV2Manifest,
  createCloudSyncV2QuarantineBundle,
  createCloudSyncV2QuarantineRef,
  encodeCloudSyncV2Canonical,
  evaluateCloudSyncV2TombstoneCompaction,
  isCloudSyncV2WriterAllowed,
  selectCloudSyncV2Retention,
  sha256CloudSyncV2,
  validateCloudSyncV2ArtifactBytes,
  validateCloudSyncV2Checkpoint,
  validateCloudSyncV2CheckpointRef,
  validateCloudSyncV2Commit,
  validateCloudSyncV2CommitRef,
  validateCloudSyncV2DeltaRef,
  validateCloudSyncV2DeltaSegment,
  validateCloudSyncV2Manifest,
  validateCloudSyncV2QuarantineBundle,
  validateCloudSyncV2QuarantineRef,
  type CloudSyncV2CommitRef,
  type CloudSyncV2DeviceAck,
  type CloudSyncV2RetentionCommit,
  type CloudSyncV2Tombstone
} from '@shared/cloud-sync-protocol-v2';

const NOW = '2026-07-11T12:00:00.000Z';

function hexId(prefix: 'commit' | 'checkpoint', value: number): `${typeof prefix}:${string}` {
  return `${prefix}:${value.toString(16).padStart(64, '0')}`;
}

function artifactHash(value: number): `sha256:${string}` {
  return `sha256:${value.toString(16).padStart(64, '0')}`;
}

function deviceAck(
  deviceId: string,
  lastSeenAt: string,
  acknowledgedCommitId?: `commit:${string}`,
  acknowledgedRevision?: string
): CloudSyncV2DeviceAck {
  return {
    deviceId,
    epoch: 1,
    lastSeenAt,
    acknowledgedAt: acknowledgedCommitId ? lastSeenAt : undefined,
    acknowledgedCommitId,
    acknowledgedRevision,
    minWriterProtocol: 2
  };
}

async function createCheckpoint(revision: string, records: Record<string, any>[] = []) {
  return createCloudSyncV2Checkpoint({
    revision,
    createdAt: NOW,
    collections: { prompts: records },
    tombstones: [],
    blobs: []
  });
}

describe('cloud sync protocol v2', () => {
  it('uses an isolated sync-v2 namespace and keeps the manifest as a lightweight head pointer', async () => {
    const checkpoint = await createCheckpoint('rev-1');
    const checkpointRef = await createCloudSyncV2CheckpointRef(checkpoint);
    const commit = await createCloudSyncV2Commit({
      revision: 'rev-1',
      parents: [],
      createdAt: NOW,
      deviceId: 'device-a',
      epoch: 3,
      minWriterProtocol: 2,
      checkpoint: checkpointRef,
      deltas: [],
      blobs: [],
      quarantine: []
    });
    const head = await createCloudSyncV2CommitRef(commit);
    const manifest = createCloudSyncV2Manifest({
      epoch: 3,
      updatedAt: NOW,
      head,
      minWriterProtocol: 3,
      deviceAcks: {
        'device-a': deviceAck('device-a', NOW, commit.commitId, commit.revision)
      }
    });

    expect(CLOUD_SYNC_V2_NAMESPACE).toBe('sync-v2');
    expect(manifest).toMatchObject({
      namespace: 'sync-v2',
      protocolVersion: CLOUD_SYNC_V2_PROTOCOL_VERSION,
      head: { id: commit.commitId, revision: 'rev-1' }
    });
    expect(manifest).not.toHaveProperty('latestSnapshot');
    expect(manifest).not.toHaveProperty('data');
    expect(validateCloudSyncV2CheckpointRef(checkpointRef).valid).toBe(true);
    expect(validateCloudSyncV2CommitRef(head).valid).toBe(true);
    expect(validateCloudSyncV2Manifest(manifest).valid).toBe(true);
    expect(isCloudSyncV2WriterAllowed(manifest, 2)).toBe(false);
    expect(isCloudSyncV2WriterAllowed(manifest, 3)).toBe(true);
  });

  it('rejects mismatched device-map keys, partial acknowledgements, and epochs beyond the manifest', () => {
    const manifest = createCloudSyncV2Manifest({ updatedAt: NOW, epoch: 1 });
    const invalid = {
      ...manifest,
      deviceAcks: {
        alias: {
          ...deviceAck('real-device', NOW),
          epoch: 2,
          acknowledgedRevision: 'rev-1'
        }
      }
    };

    const validation = validateCloudSyncV2Manifest(invalid);
    expect(validation.valid).toBe(false);
    expect(validation.issues.map(issue => issue.message)).toEqual(expect.arrayContaining([
      'device ID must match its map key',
      'device epoch cannot exceed manifest epoch',
      'acknowledged revision and commit ID must be provided together'
    ]));
  });

  it('computes standard SHA-256 digests and content-addresses blobs', async () => {
    expect(await sha256CloudSyncV2('abc')).toBe(
      'sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );

    const blob = await createCloudSyncV2BlobRef(new TextEncoder().encode('abc'), 'text/plain');
    expect(blob).toEqual({
      kind: 'blob',
      id: 'blob:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      sha256: 'sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      byteLength: 3,
      mediaType: 'text/plain'
    });
    expect((await validateCloudSyncV2ArtifactBytes(blob, 'abc')).valid).toBe(true);
  });

  it('detects both truncated and corrupted referenced bytes', async () => {
    const blob = await createCloudSyncV2BlobRef('expected');
    const truncated = await validateCloudSyncV2ArtifactBytes(blob, 'x');
    const sameLengthCorruption = await validateCloudSyncV2ArtifactBytes(blob, 'corrupt!');

    expect(truncated.issues.map(issue => issue.code)).toEqual(expect.arrayContaining([
      'byte_length_mismatch',
      'hash_mismatch'
    ]));
    expect(sameLengthCorruption.issues.map(issue => issue.code)).toContain('hash_mismatch');
    expect(sameLengthCorruption.issues.map(issue => issue.code)).not.toContain('byte_length_mismatch');
  });

  it('creates deterministic checkpoint IDs independent of object, record, and blob-ref ordering', async () => {
    const blobA = await createCloudSyncV2BlobRef('a');
    const blobB = await createCloudSyncV2BlobRef('b');
    const first = await createCloudSyncV2Checkpoint({
      revision: 'rev-checkpoint',
      createdAt: NOW,
      collections: {
        prompts: [{ uuid: 'z', title: 'Z' }, { title: 'A', uuid: 'a' }],
        categories: []
      },
      tombstones: [],
      blobs: [blobB, blobA]
    });
    const second = await createCloudSyncV2Checkpoint({
      revision: 'rev-checkpoint',
      createdAt: NOW,
      collections: {
        categories: [],
        prompts: [{ uuid: 'a', title: 'A' }, { title: 'Z', uuid: 'z' }]
      },
      tombstones: [],
      blobs: [blobA, blobB]
    });

    expect(first.checkpointId).toBe(second.checkpointId);
    expect(encodeCloudSyncV2Canonical(first)).toEqual(encodeCloudSyncV2Canonical(second));
    expect((await validateCloudSyncV2Checkpoint(first)).valid).toBe(true);

    const tampered = { ...first, collections: { prompts: [{ uuid: 'changed' }] } };
    const validation = await validateCloudSyncV2Checkpoint(tampered);
    expect(validation.issues).toContainEqual(expect.objectContaining({ code: 'id_mismatch', path: '$.checkpointId' }));
  });

  it('creates deterministic delta IDs and validates delete identity and revision movement', async () => {
    const tombstone: CloudSyncV2Tombstone = {
      collection: 'prompts',
      recordKey: 'uuid:p-1',
      deletedAt: NOW,
      deletionRevision: 'rev-2',
      deletionCommitId: hexId('commit', 2)
    };
    const operations = [
      { operationId: 'op-b', type: 'delete' as const, collection: 'prompts', recordKey: 'uuid:p-1', tombstone },
      { operationId: 'op-a', type: 'upsert' as const, collection: 'categories', recordKey: 'uuid:c-1', record: { uuid: 'c-1' } }
    ];
    const first = await createCloudSyncV2DeltaSegment({
      baseRevision: 'rev-1', targetRevision: 'rev-2', createdAt: NOW, operations, blobs: []
    });
    const second = await createCloudSyncV2DeltaSegment({
      baseRevision: 'rev-1', targetRevision: 'rev-2', createdAt: NOW, operations: [...operations].reverse(), blobs: []
    });
    expect(first.segmentId).toBe(second.segmentId);
    expect((await validateCloudSyncV2DeltaSegment(first)).valid).toBe(true);
    expect(validateCloudSyncV2DeltaRef(await createCloudSyncV2DeltaRef(first)).valid).toBe(true);

    const invalid = {
      ...first,
      baseRevision: 'rev-2',
      operations: [{ ...operations[0], recordKey: 'uuid:different' }]
    };
    const validation = await validateCloudSyncV2DeltaSegment(invalid);
    expect(validation.issues.map(issue => issue.code)).toEqual(expect.arrayContaining([
      'invalid_revision',
      'invalid_reference'
    ]));
  });

  it('content-addresses complete quarantine groups and validates quarantine references', async () => {
    const bundle = await createCloudSyncV2QuarantineBundle({
      createdAt: NOW,
      sourceRevisions: ['rev-2', 'rev-1'],
      reasonCodes: ['unresolved_relation'],
      groups: [{
        groupId: 'group-1',
        records: [{ collection: 'promptVariables', recordKey: 'uuid:v-1', payload: { uuid: 'v-1' } }],
        issues: [{ code: 'unresolved_relation', collection: 'promptVariables', recordKey: 'uuid:v-1' }]
      }],
      blobs: []
    });
    const ref = await createCloudSyncV2QuarantineRef(bundle);

    expect(bundle.sourceRevisions).toEqual(['rev-1', 'rev-2']);
    expect((await validateCloudSyncV2QuarantineBundle(bundle)).valid).toBe(true);
    expect(validateCloudSyncV2QuarantineRef(ref).valid).toBe(true);
    expect((await validateCloudSyncV2ArtifactBytes(ref, encodeCloudSyncV2Canonical(bundle))).valid).toBe(true);
  });

  it('supports genesis, single-parent, and deterministic dual-parent merge commits', async () => {
    const genesisCheckpoint = await createCheckpoint('rev-1');
    const genesis = await createCloudSyncV2Commit({
      revision: 'rev-1', parents: [], createdAt: NOW, deviceId: 'device-a', epoch: 1,
      minWriterProtocol: 2, checkpoint: await createCloudSyncV2CheckpointRef(genesisCheckpoint),
      deltas: [], blobs: [], quarantine: []
    });
    const genesisRef = await createCloudSyncV2CommitRef(genesis);
    const childDelta = await createCloudSyncV2DeltaSegment({
      baseRevision: 'rev-1', targetRevision: 'rev-2a', createdAt: NOW,
      operations: [{ operationId: 'op-a', type: 'upsert', collection: 'prompts', recordKey: 'uuid:a', record: { uuid: 'a' } }],
      blobs: []
    });
    const child = await createCloudSyncV2Commit({
      revision: 'rev-2a', parents: [genesisRef], createdAt: NOW, deviceId: 'device-a', epoch: 1,
      minWriterProtocol: 2, deltas: [await createCloudSyncV2DeltaRef(childDelta)], blobs: [], quarantine: []
    });
    const branchDelta = await createCloudSyncV2DeltaSegment({
      baseRevision: 'rev-1', targetRevision: 'rev-2b', createdAt: NOW,
      operations: [{ operationId: 'op-b', type: 'upsert', collection: 'prompts', recordKey: 'uuid:b', record: { uuid: 'b' } }],
      blobs: []
    });
    const branch = await createCloudSyncV2Commit({
      revision: 'rev-2b', parents: [genesisRef], createdAt: NOW, deviceId: 'device-b', epoch: 1,
      minWriterProtocol: 2, deltas: [await createCloudSyncV2DeltaRef(branchDelta)], blobs: [], quarantine: []
    });
    const parents = [await createCloudSyncV2CommitRef(child), await createCloudSyncV2CommitRef(branch)];
    const mergeCheckpoint = await createCheckpoint('rev-3');
    const mergeInput = {
      revision: 'rev-3', createdAt: NOW, deviceId: 'device-a', epoch: 1, minWriterProtocol: 2,
      checkpoint: await createCloudSyncV2CheckpointRef(mergeCheckpoint), deltas: [], blobs: [], quarantine: []
    };
    const mergeA = await createCloudSyncV2Commit({ ...mergeInput, parents });
    const mergeB = await createCloudSyncV2Commit({ ...mergeInput, parents: [...parents].reverse() });

    expect(mergeA.commitId).toBe(mergeB.commitId);
    expect(mergeA.parents).toHaveLength(2);
    expect((await validateCloudSyncV2Commit(genesis)).valid).toBe(true);
    expect((await validateCloudSyncV2Commit(child)).valid).toBe(true);
    expect((await validateCloudSyncV2Commit(mergeA)).valid).toBe(true);
  });

  it('rejects commits whose delta base is not a parent or whose checkpoint targets another revision', async () => {
    const checkpoint = await createCheckpoint('rev-wrong');
    const delta = await createCloudSyncV2DeltaSegment({
      baseRevision: 'rev-other', targetRevision: 'rev-new', createdAt: NOW,
      operations: [{ operationId: 'op', type: 'upsert', collection: 'prompts', recordKey: 'uuid:p', record: { uuid: 'p' } }],
      blobs: []
    });
    const parent = {
      kind: 'commit', id: hexId('commit', 1), revision: 'rev-parent', sha256: artifactHash(1), byteLength: 1
    } satisfies CloudSyncV2CommitRef;
    const invalid = {
      kind: 'ai-gist-sync-v2-commit', protocolVersion: 2, commitId: hexId('commit', 9),
      revision: 'rev-new', parents: [parent], createdAt: NOW, deviceId: 'device-a', epoch: 1,
      minWriterProtocol: 2, checkpoint: await createCloudSyncV2CheckpointRef(checkpoint),
      deltas: [await createCloudSyncV2DeltaRef(delta)], blobs: [], quarantine: []
    };

    const validation = await validateCloudSyncV2Commit(invalid);
    expect(validation.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: '$.checkpoint.revision', code: 'invalid_reference' }),
      expect.objectContaining({ path: '$.deltas[0].baseRevision', code: 'invalid_parent' })
    ]));
  });

  it('retains the current head, latest 50 commits, all active-device unacknowledged commits, and one checkpoint per UTC day', () => {
    const commits: CloudSyncV2RetentionCommit[] = Array.from({ length: 60 }, (_, index) => ({
      commitId: hexId('commit', index + 1),
      revision: `rev-${index + 1}`,
      createdAt: new Date(Date.parse(NOW) - (59 - index) * 60_000).toISOString(),
      parents: index === 0 ? [] : [{ commitId: hexId('commit', index), revision: `rev-${index}` }],
      checkpointIds: index === 59 ? [hexId('checkpoint', 99)] : []
    }));
    const result = selectCloudSyncV2Retention({
      now: NOW,
      head: { commitId: hexId('commit', 60), revision: 'rev-60' },
      commits,
      checkpoints: [
        { checkpointId: hexId('checkpoint', 1), revision: 'rev-50', createdAt: '2026-07-10T01:00:00.000Z' },
        { checkpointId: hexId('checkpoint', 2), revision: 'rev-51', createdAt: '2026-07-10T22:00:00.000Z' },
        { checkpointId: hexId('checkpoint', 3), revision: 'rev-10', createdAt: '2026-04-01T00:00:00.000Z' },
        { checkpointId: hexId('checkpoint', 99), revision: 'rev-60', createdAt: '2026-01-01T00:00:00.000Z' }
      ],
      deviceAcks: [
        deviceAck('active', NOW, hexId('commit', 55), 'rev-55'),
        deviceAck('inactive', '2025-01-01T00:00:00.000Z')
      ]
    });

    expect(result.commitIds).toHaveLength(50);
    expect(result.commitIds).toContain(hexId('commit', 60));
    expect(result.commitIds).toContain(hexId('commit', 11));
    expect(result.commitIds).not.toContain(hexId('commit', 10));
    expect(result.activeDeviceIds).toEqual(['active']);
    expect(result.checkpointIds).toEqual(expect.arrayContaining([
      hexId('checkpoint', 2),
      hexId('checkpoint', 99)
    ]));
    expect(result.checkpointIds).not.toContain(hexId('checkpoint', 1));
    expect(result.checkpointIds).not.toContain(hexId('checkpoint', 3));
  });

  it('conservatively retains every known commit when an active device has no acknowledgement', () => {
    const commits: CloudSyncV2RetentionCommit[] = [1, 2, 3].map((value, index) => ({
      commitId: hexId('commit', value),
      revision: `rev-${value}`,
      createdAt: new Date(Date.parse(NOW) - index * 1000).toISOString(),
      parents: []
    }));
    const result = selectCloudSyncV2Retention({
      now: NOW,
      recentCommitCount: 0,
      commits,
      checkpoints: [],
      deviceAcks: [deviceAck('new-device', NOW)]
    });
    expect(result.commitIds).toEqual(commits.map(commit => commit.commitId).sort());
  });

  it('compacts tombstones only after 30 days and acknowledgement by every active device', () => {
    const deletionCommit = hexId('commit', 1);
    const descendantCommit = hexId('commit', 2);
    const otherBranch = hexId('commit', 3);
    const commits: CloudSyncV2RetentionCommit[] = [
      { commitId: deletionCommit, revision: 'rev-delete', createdAt: '2026-06-01T00:00:00.000Z', parents: [] },
      { commitId: descendantCommit, revision: 'rev-after', createdAt: '2026-06-02T00:00:00.000Z', parents: [{ commitId: deletionCommit, revision: 'rev-delete' }] },
      { commitId: otherBranch, revision: 'rev-other', createdAt: '2026-06-02T00:00:00.000Z', parents: [] }
    ];
    const tombstone: CloudSyncV2Tombstone = {
      collection: 'prompts', recordKey: 'uuid:p-1', deletedAt: '2026-06-01T00:00:00.000Z',
      deletionRevision: 'rev-delete', deletionCommitId: deletionCommit
    };
    const acknowledged = deviceAck('device-a', NOW, descendantCommit, 'rev-after');

    expect(canCompactCloudSyncV2Tombstone({ tombstone, commits, deviceAcks: [acknowledged], now: NOW })).toBe(true);

    const young = evaluateCloudSyncV2TombstoneCompaction({
      tombstone: { ...tombstone, deletedAt: '2026-07-01T00:00:00.000Z' },
      commits,
      deviceAcks: [acknowledged],
      now: NOW
    });
    expect(young.compactable).toBe(false);
    expect(young.reasons).toContain('minimum-age-not-reached');

    const unacknowledged = evaluateCloudSyncV2TombstoneCompaction({
      tombstone,
      commits,
      deviceAcks: [
        acknowledged,
        deviceAck('device-b', NOW, otherBranch, 'rev-other'),
        deviceAck('inactive', '2025-01-01T00:00:00.000Z')
      ],
      now: NOW
    });
    expect(unacknowledged.compactable).toBe(false);
    expect(unacknowledged.blockingDeviceIds).toEqual(['device-b']);
  });
});
