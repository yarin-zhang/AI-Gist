import type { CloudSyncDataSet } from './cloud-sync-engine';
import {
  pruneCloudSyncTombstonedPromptChildren,
  quarantineCloudSyncContractIssues,
  reconcileCloudSyncDataContract,
  type CloudSyncBusinessKeyMerge,
  type CloudSyncContractIssue,
  type CloudSyncRelationRepair
} from './cloud-sync-contract';
import {
  CLOUD_SYNC_V2_PROTOCOL_VERSION,
  createCloudSyncV2BlobRef,
  createCloudSyncV2Checkpoint,
  createCloudSyncV2CheckpointRef,
  createCloudSyncV2Commit,
  createCloudSyncV2CommitRef,
  createCloudSyncV2Manifest,
  createCloudSyncV2QuarantineBundle,
  createCloudSyncV2QuarantineRef,
  type CloudSyncV2BlobRef,
  type CloudSyncV2Checkpoint,
  type CloudSyncV2Commit,
  type CloudSyncV2CommitRef,
  type CloudSyncV2JsonObject,
  type CloudSyncV2JsonValue,
  type CloudSyncV2Manifest,
  type CloudSyncV2QuarantineBundle,
  type CloudSyncV2QuarantineGroup
} from './cloud-sync-protocol-v2';

export interface CloudSyncV2BlobArtifact {
  ref: CloudSyncV2BlobRef;
  bytes: Uint8Array;
}

export interface CloudSyncV2MigrationInput {
  data: CloudSyncDataSet;
  baseData?: CloudSyncDataSet;
  revision: string;
  deviceId: string;
  epoch?: number;
  createdAt?: string;
  parents?: CloudSyncV2CommitRef[];
}

export interface CloudSyncV2MigrationArtifacts {
  manifest: CloudSyncV2Manifest;
  commit: CloudSyncV2Commit;
  checkpoint: CloudSyncV2Checkpoint;
  quarantine?: CloudSyncV2QuarantineBundle;
  blobs: CloudSyncV2BlobArtifact[];
  contractIssues: CloudSyncContractIssue[];
  businessKeyMerges: CloudSyncBusinessKeyMerge[];
  relationRepairs: CloudSyncRelationRepair[];
}

/**
 * Builds a complete first v2 commit without performing cloud I/O. Invalid
 * dependency groups are preserved in a quarantine artifact while valid data
 * is emitted as the initial checkpoint.
 */
export async function createCloudSyncV2MigrationArtifacts(
  input: CloudSyncV2MigrationInput
): Promise<CloudSyncV2MigrationArtifacts> {
  const createdAt = input.createdAt || new Date().toISOString();
  const epoch = input.epoch ?? 1;
  const tombstonePruned = pruneCloudSyncTombstonedPromptChildren(input.data, input.baseData);
  const contract = reconcileCloudSyncDataContract(tombstonePruned, input.baseData);
  const quarantineResult = contract.valid
    ? { data: contract.data, groups: [] }
    : quarantineCloudSyncContractIssues(contract.data, contract.issues);
  const blobArtifacts = new Map<string, CloudSyncV2BlobArtifact>();
  const collections: Record<string, CloudSyncV2JsonValue[]> = {};

  for (const [collection, records] of Object.entries(quarantineResult.data)) {
    if (!Array.isArray(records) || collection === 'syncTombstones') continue;
    collections[collection] = await Promise.all(
      records.map(record => externalizeJsonValue(record, blobArtifacts))
    );
  }

  const tombstones = ((quarantineResult.data.syncTombstones || []) as any[]).map(tombstone => ({
    collection: String(tombstone.collectionName),
    recordKey: String(tombstone.recordKey),
    deletedAt: new Date(tombstone.deletedAt).toISOString(),
    deletionRevision: input.revision,
    // v1 tombstones have no causal v2 commit. The zero sentinel prevents
    // premature compaction until a later v2 commit rewrites their provenance.
    deletionCommitId: ('commit:' + '0'.repeat(64)) as `commit:${string}`
  }));

  let quarantine: CloudSyncV2QuarantineBundle | undefined;
  if (quarantineResult.groups.length > 0) {
    const groups: CloudSyncV2QuarantineGroup[] = [];
    for (const group of quarantineResult.groups) {
      groups.push({
        groupId: group.groupId,
        issues: group.issues.map(issue => ({
          code: issue.code,
          collection: issue.collection,
          recordKey: issue.recordIdentity,
          relation: issue.relation
        })),
        records: await Promise.all(group.records.map(async record => ({
          collection: record.collection,
          recordKey: record.recordIdentity,
          payload: await externalizeJsonValue(record.payload, blobArtifacts)
        })))
      });
    }
    quarantine = await createCloudSyncV2QuarantineBundle({
      createdAt,
      sourceRevisions: [input.revision],
      reasonCodes: Array.from(new Set(contract.issues.map(issue => issue.code))).sort(),
      groups,
      blobs: Array.from(blobArtifacts.values()).map(artifact => artifact.ref)
    });
  }

  const checkpoint = await createCloudSyncV2Checkpoint({
    revision: input.revision,
    createdAt,
    collections,
    tombstones,
    blobs: Array.from(blobArtifacts.values()).map(artifact => artifact.ref)
  });
  const checkpointRef = await createCloudSyncV2CheckpointRef(checkpoint);
  const quarantineRefs = quarantine
    ? [await createCloudSyncV2QuarantineRef(quarantine)]
    : [];
  const commit = await createCloudSyncV2Commit({
    revision: input.revision,
    parents: input.parents || [],
    createdAt,
    deviceId: input.deviceId,
    epoch,
    minWriterProtocol: CLOUD_SYNC_V2_PROTOCOL_VERSION,
    checkpoint: checkpointRef,
    deltas: [],
    blobs: Array.from(blobArtifacts.values()).map(artifact => artifact.ref),
    quarantine: quarantineRefs
  });

  return finalizeMigrationArtifacts(
    input,
    epoch,
    createdAt,
    checkpoint,
    commit,
    quarantine,
    blobArtifacts,
    contract
  );
}

async function finalizeMigrationArtifacts(
  input: CloudSyncV2MigrationInput,
  epoch: number,
  createdAt: string,
  checkpoint: CloudSyncV2Checkpoint,
  commit: CloudSyncV2Commit,
  quarantine: CloudSyncV2QuarantineBundle | undefined,
  blobs: Map<string, CloudSyncV2BlobArtifact>,
  contract: ReturnType<typeof reconcileCloudSyncDataContract>
): Promise<CloudSyncV2MigrationArtifacts> {
  const head = await createCloudSyncV2CommitRef(commit);
  const manifest = createCloudSyncV2Manifest({
    epoch,
    updatedAt: createdAt,
    minWriterProtocol: CLOUD_SYNC_V2_PROTOCOL_VERSION,
    head,
    deviceAcks: {
      [input.deviceId]: {
        deviceId: input.deviceId,
        epoch,
        lastSeenAt: createdAt,
        acknowledgedAt: createdAt,
        acknowledgedRevision: input.revision,
        acknowledgedCommitId: commit.commitId,
        minWriterProtocol: CLOUD_SYNC_V2_PROTOCOL_VERSION
      }
    }
  });
  return {
    manifest,
    commit,
    checkpoint,
    quarantine,
    blobs: Array.from(blobs.values()).sort((left, right) => left.ref.id.localeCompare(right.ref.id)),
    contractIssues: contract.issues,
    businessKeyMerges: contract.merges,
    relationRepairs: contract.repairs
  };
}

async function externalizeJsonValue(
  value: any,
  blobs: Map<string, CloudSyncV2BlobArtifact>
): Promise<CloudSyncV2JsonValue> {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (isBlob(value)) return externalizeBlob(value, blobs);
  if (Array.isArray(value)) return Promise.all(value.map(item => externalizeJsonValue(item, blobs)));
  if (typeof value === 'string') {
    if (value.startsWith('data:')) {
      const decoded = decodeDataUrl(value);
      if (decoded) return externalizeBytes(decoded.bytes, decoded.mediaType, blobs);
    }
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'object') {
    const result: CloudSyncV2JsonObject = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] !== undefined && typeof value[key] !== 'function') {
        result[key] = await externalizeJsonValue(value[key], blobs);
      }
    }
    return result;
  }
  return String(value);
}

async function externalizeBlob(
  blob: Blob,
  blobs: Map<string, CloudSyncV2BlobArtifact>
): Promise<CloudSyncV2JsonObject> {
  return externalizeBytes(new Uint8Array(await blob.arrayBuffer()), blob.type || undefined, blobs);
}

async function externalizeBytes(
  bytes: Uint8Array,
  mediaType: string | undefined,
  blobs: Map<string, CloudSyncV2BlobArtifact>
): Promise<CloudSyncV2JsonObject> {
  const ref = await createCloudSyncV2BlobRef(bytes, mediaType);
  if (!blobs.has(ref.id)) blobs.set(ref.id, { ref, bytes });
  return {
    $blob: ref.id,
    sha256: ref.sha256,
    byteLength: ref.byteLength,
    ...(ref.mediaType ? { mediaType: ref.mediaType } : {})
  };
}

function decodeDataUrl(value: string): { bytes: Uint8Array; mediaType?: string } | null {
  const match = value.match(/^data:([^;,]*)(;base64)?,([\s\S]*)$/);
  if (!match) return null;
  const mediaType = match[1] || undefined;
  try {
    if (match[2]) {
      const nodeBuffer = (globalThis as any).Buffer;
      const binary = typeof atob === 'function'
        ? atob(match[3])
        : nodeBuffer?.from(match[3], 'base64').toString('binary');
      if (typeof binary !== 'string') return null;
      return {
        bytes: Uint8Array.from(binary, character => character.charCodeAt(0)),
        mediaType
      };
    }
    return { bytes: new TextEncoder().encode(decodeURIComponent(match[3])), mediaType };
  } catch {
    return null;
  }
}

function isBlob(value: unknown): value is Blob {
  return typeof Blob !== 'undefined' && value instanceof Blob;
}
