/**
 * Storage-independent cloud sync v2 protocol primitives.
 *
 * This module deliberately performs no cloud or database I/O. Every artifact
 * is JSON-safe, content-addressable, and can be validated before a provider is
 * allowed to publish a new manifest head.
 */

export const CLOUD_SYNC_V2_NAMESPACE = 'sync-v2' as const;
export const CLOUD_SYNC_V2_PROTOCOL_VERSION = 2 as const;

export const CLOUD_SYNC_V2_MANIFEST_KIND = 'ai-gist-sync-v2-manifest' as const;
export const CLOUD_SYNC_V2_COMMIT_KIND = 'ai-gist-sync-v2-commit' as const;
export const CLOUD_SYNC_V2_CHECKPOINT_KIND = 'ai-gist-sync-v2-checkpoint' as const;
export const CLOUD_SYNC_V2_DELTA_KIND = 'ai-gist-sync-v2-delta' as const;
export const CLOUD_SYNC_V2_QUARANTINE_KIND = 'ai-gist-sync-v2-quarantine' as const;

export const CLOUD_SYNC_V2_DEFAULT_RECENT_COMMIT_COUNT = 50;
export const CLOUD_SYNC_V2_DEFAULT_ACTIVE_DEVICE_DAYS = 90;
export const CLOUD_SYNC_V2_DEFAULT_DAILY_CHECKPOINT_DAYS = 90;
export const CLOUD_SYNC_V2_MIN_TOMBSTONE_AGE_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;
const ID_PATTERNS = {
  commit: /^commit:[a-f0-9]{64}$/,
  checkpoint: /^checkpoint:[a-f0-9]{64}$/,
  delta: /^delta:[a-f0-9]{64}$/,
  quarantine: /^quarantine:[a-f0-9]{64}$/,
  blob: /^blob:[a-f0-9]{64}$/
} as const;

export type CloudSyncV2JsonPrimitive = string | number | boolean | null;
export type CloudSyncV2JsonValue =
  | CloudSyncV2JsonPrimitive
  | CloudSyncV2JsonValue[]
  | CloudSyncV2JsonObject;
export interface CloudSyncV2JsonObject {
  [key: string]: CloudSyncV2JsonValue;
}
export type CloudSyncV2Sha256 = `sha256:${string}`;
export type CloudSyncV2ArtifactId = `${'commit' | 'checkpoint' | 'delta' | 'quarantine' | 'blob'}:${string}`;
export type CloudSyncV2ArtifactKind = 'commit' | 'checkpoint' | 'delta' | 'quarantine' | 'blob';

export interface CloudSyncV2ValidationIssue {
  code:
    | 'invalid_type'
    | 'invalid_kind'
    | 'unsupported_protocol'
    | 'invalid_value'
    | 'invalid_date'
    | 'invalid_hash'
    | 'invalid_byte_length'
    | 'invalid_id'
    | 'invalid_revision'
    | 'invalid_parent'
    | 'invalid_reference'
    | 'duplicate_reference'
    | 'id_mismatch'
    | 'hash_mismatch'
    | 'byte_length_mismatch';
  path: string;
  message: string;
}

export interface CloudSyncV2ValidationResult<T> {
  valid: boolean;
  value?: T;
  issues: CloudSyncV2ValidationIssue[];
}

export interface CloudSyncV2ArtifactRef<
  TKind extends CloudSyncV2ArtifactKind = CloudSyncV2ArtifactKind,
  TId extends CloudSyncV2ArtifactId = CloudSyncV2ArtifactId
> {
  kind: TKind;
  id: TId;
  sha256: CloudSyncV2Sha256;
  byteLength: number;
}

export interface CloudSyncV2CommitRef extends CloudSyncV2ArtifactRef<'commit', `commit:${string}`> {
  revision: string;
}

export interface CloudSyncV2CheckpointRef extends CloudSyncV2ArtifactRef<'checkpoint', `checkpoint:${string}`> {
  revision: string;
}

export interface CloudSyncV2DeltaRef extends CloudSyncV2ArtifactRef<'delta', `delta:${string}`> {
  baseRevision: string | null;
  targetRevision: string;
}

export interface CloudSyncV2BlobRef extends CloudSyncV2ArtifactRef<'blob', `blob:${string}`> {
  mediaType?: string;
}

export interface CloudSyncV2QuarantineRef
  extends CloudSyncV2ArtifactRef<'quarantine', `quarantine:${string}`> {
  sourceRevisions: string[];
}

export interface CloudSyncV2DeviceAck {
  deviceId: string;
  epoch: number;
  lastSeenAt: string;
  acknowledgedAt?: string;
  acknowledgedRevision?: string;
  acknowledgedCommitId?: `commit:${string}`;
  minWriterProtocol: number;
}

export interface CloudSyncV2Manifest {
  kind: typeof CLOUD_SYNC_V2_MANIFEST_KIND;
  namespace: typeof CLOUD_SYNC_V2_NAMESPACE;
  protocolVersion: typeof CLOUD_SYNC_V2_PROTOCOL_VERSION;
  minWriterProtocol: number;
  epoch: number;
  updatedAt: string;
  head?: CloudSyncV2CommitRef;
  deviceAcks: Record<string, CloudSyncV2DeviceAck>;
}

export interface CloudSyncV2Tombstone {
  collection: string;
  recordKey: string;
  deletedAt: string;
  deletionRevision: string;
  deletionCommitId: `commit:${string}`;
}

export interface CloudSyncV2Checkpoint {
  kind: typeof CLOUD_SYNC_V2_CHECKPOINT_KIND;
  protocolVersion: typeof CLOUD_SYNC_V2_PROTOCOL_VERSION;
  checkpointId: `checkpoint:${string}`;
  revision: string;
  createdAt: string;
  collections: Record<string, CloudSyncV2JsonValue[]>;
  tombstones: CloudSyncV2Tombstone[];
  blobs: CloudSyncV2BlobRef[];
}

export type CloudSyncV2CheckpointInput = Omit<CloudSyncV2Checkpoint, 'kind' | 'protocolVersion' | 'checkpointId'>;

export interface CloudSyncV2DeltaUpsertOperation {
  operationId: string;
  type: 'upsert';
  collection: string;
  recordKey: string;
  record: CloudSyncV2JsonObject;
}

export interface CloudSyncV2DeltaDeleteOperation {
  operationId: string;
  type: 'delete';
  collection: string;
  recordKey: string;
  tombstone: CloudSyncV2Tombstone;
}

export type CloudSyncV2DeltaOperation = CloudSyncV2DeltaUpsertOperation | CloudSyncV2DeltaDeleteOperation;

export interface CloudSyncV2DeltaSegment {
  kind: typeof CLOUD_SYNC_V2_DELTA_KIND;
  protocolVersion: typeof CLOUD_SYNC_V2_PROTOCOL_VERSION;
  segmentId: `delta:${string}`;
  baseRevision: string | null;
  targetRevision: string;
  createdAt: string;
  operations: CloudSyncV2DeltaOperation[];
  blobs: CloudSyncV2BlobRef[];
}

export type CloudSyncV2DeltaSegmentInput = Omit<
  CloudSyncV2DeltaSegment,
  'kind' | 'protocolVersion' | 'segmentId'
>;

export interface CloudSyncV2QuarantineRecord {
  collection: string;
  recordKey: string;
  payload: CloudSyncV2JsonValue;
}

export interface CloudSyncV2QuarantineIssue {
  code: string;
  collection?: string;
  recordKey?: string;
  relation?: string;
}

export interface CloudSyncV2QuarantineGroup {
  groupId: string;
  records: CloudSyncV2QuarantineRecord[];
  issues: CloudSyncV2QuarantineIssue[];
}

export interface CloudSyncV2QuarantineBundle {
  kind: typeof CLOUD_SYNC_V2_QUARANTINE_KIND;
  protocolVersion: typeof CLOUD_SYNC_V2_PROTOCOL_VERSION;
  quarantineId: `quarantine:${string}`;
  createdAt: string;
  sourceRevisions: string[];
  reasonCodes: string[];
  groups: CloudSyncV2QuarantineGroup[];
  blobs: CloudSyncV2BlobRef[];
}

export type CloudSyncV2QuarantineBundleInput = Omit<
  CloudSyncV2QuarantineBundle,
  'kind' | 'protocolVersion' | 'quarantineId'
>;

export interface CloudSyncV2Commit {
  kind: typeof CLOUD_SYNC_V2_COMMIT_KIND;
  protocolVersion: typeof CLOUD_SYNC_V2_PROTOCOL_VERSION;
  commitId: `commit:${string}`;
  revision: string;
  parents: CloudSyncV2CommitRef[];
  createdAt: string;
  deviceId: string;
  epoch: number;
  minWriterProtocol: number;
  checkpoint?: CloudSyncV2CheckpointRef;
  deltas: CloudSyncV2DeltaRef[];
  blobs: CloudSyncV2BlobRef[];
  quarantine: CloudSyncV2QuarantineRef[];
}

export type CloudSyncV2CommitInput = Omit<CloudSyncV2Commit, 'kind' | 'protocolVersion' | 'commitId'>;

export type CloudSyncV2HashInput = string | Uint8Array | ArrayBuffer | Blob;

export interface CloudSyncV2RetentionCommit {
  commitId: `commit:${string}`;
  revision: string;
  createdAt: string;
  parents: { commitId: `commit:${string}`; revision: string }[];
  checkpointIds?: `checkpoint:${string}`[];
}

export interface CloudSyncV2RetentionCheckpoint {
  checkpointId: `checkpoint:${string}`;
  revision: string;
  createdAt: string;
}

export interface CloudSyncV2RetentionOptions {
  now?: Date | string;
  recentCommitCount?: number;
  activeDeviceDays?: number;
  dailyCheckpointDays?: number;
}

export interface CloudSyncV2RetentionInput extends CloudSyncV2RetentionOptions {
  head?: { commitId: `commit:${string}`; revision: string };
  commits: CloudSyncV2RetentionCommit[];
  checkpoints: CloudSyncV2RetentionCheckpoint[];
  deviceAcks: CloudSyncV2DeviceAck[] | Record<string, CloudSyncV2DeviceAck>;
}

export interface CloudSyncV2RetentionResult {
  commitIds: `commit:${string}`[];
  checkpointIds: `checkpoint:${string}`[];
  activeDeviceIds: string[];
  reasons: Record<string, string[]>;
}

export interface CloudSyncV2TombstoneCompactionInput {
  tombstone: CloudSyncV2Tombstone;
  commits: CloudSyncV2RetentionCommit[];
  deviceAcks: CloudSyncV2DeviceAck[] | Record<string, CloudSyncV2DeviceAck>;
  now?: Date | string;
  minAgeDays?: number;
  activeDeviceDays?: number;
}

export interface CloudSyncV2TombstoneCompactionResult {
  compactable: boolean;
  ageDays: number;
  activeDeviceIds: string[];
  blockingDeviceIds: string[];
  reasons: string[];
}

export function createCloudSyncV2Manifest(
  input: Partial<Omit<CloudSyncV2Manifest, 'kind' | 'namespace' | 'protocolVersion'>> = {}
): CloudSyncV2Manifest {
  const manifest: CloudSyncV2Manifest = {
    kind: CLOUD_SYNC_V2_MANIFEST_KIND,
    namespace: CLOUD_SYNC_V2_NAMESPACE,
    protocolVersion: CLOUD_SYNC_V2_PROTOCOL_VERSION,
    minWriterProtocol: input.minWriterProtocol ?? CLOUD_SYNC_V2_PROTOCOL_VERSION,
    epoch: input.epoch ?? 0,
    updatedAt: input.updatedAt ?? new Date().toISOString(),
    head: input.head,
    deviceAcks: input.deviceAcks ? { ...input.deviceAcks } : {}
  };

  const validation = validateCloudSyncV2Manifest(manifest);
  if (!validation.valid) throw validationError('manifest', validation.issues);
  return manifest;
}

export function validateCloudSyncV2Manifest(input: unknown): CloudSyncV2ValidationResult<CloudSyncV2Manifest> {
  const issues: CloudSyncV2ValidationIssue[] = [];
  if (!isRecord(input)) {
    addIssue(issues, 'invalid_type', '$', 'manifest must be an object');
    return result<CloudSyncV2Manifest>(undefined, issues);
  }

  expectExact(input.kind, CLOUD_SYNC_V2_MANIFEST_KIND, '$.kind', 'invalid_kind', issues);
  expectExact(input.namespace, CLOUD_SYNC_V2_NAMESPACE, '$.namespace', 'invalid_value', issues);
  expectProtocol(input.protocolVersion, '$.protocolVersion', issues);
  expectProtocolFloor(input.minWriterProtocol, '$.minWriterProtocol', issues);
  expectNonNegativeInteger(input.epoch, '$.epoch', issues);
  expectDate(input.updatedAt, '$.updatedAt', issues);

  if (input.head !== undefined) validateCommitRef(input.head, '$.head', issues);
  if (!isRecord(input.deviceAcks)) {
    addIssue(issues, 'invalid_type', '$.deviceAcks', 'deviceAcks must be an object');
  } else {
    for (const [deviceId, ack] of Object.entries(input.deviceAcks)) {
      validateDeviceAck(ack, `$.deviceAcks.${escapePath(deviceId)}`, issues);
      if (isRecord(ack) && ack.deviceId !== deviceId) {
        addIssue(issues, 'invalid_reference', `$.deviceAcks.${escapePath(deviceId)}.deviceId`, 'device ID must match its map key');
      }
      if (isRecord(ack) && isNonNegativeInteger(ack.epoch) && isNonNegativeInteger(input.epoch) && ack.epoch > input.epoch) {
        addIssue(issues, 'invalid_value', `$.deviceAcks.${escapePath(deviceId)}.epoch`, 'device epoch cannot exceed manifest epoch');
      }
    }
  }

  return result(input as unknown as CloudSyncV2Manifest, issues);
}

export function isCloudSyncV2WriterAllowed(
  manifest: Pick<CloudSyncV2Manifest, 'minWriterProtocol'>,
  supportedProtocol = CLOUD_SYNC_V2_PROTOCOL_VERSION
): boolean {
  return Number.isSafeInteger(supportedProtocol) && supportedProtocol >= manifest.minWriterProtocol;
}

export async function createCloudSyncV2Checkpoint(
  input: CloudSyncV2CheckpointInput
): Promise<CloudSyncV2Checkpoint> {
  const normalized = normalizeCheckpointInput(input);
  const checkpointId = `checkpoint:${stripHashPrefix(await sha256CloudSyncV2(normalized))}` as const;
  const checkpoint: CloudSyncV2Checkpoint = {
    kind: CLOUD_SYNC_V2_CHECKPOINT_KIND,
    protocolVersion: CLOUD_SYNC_V2_PROTOCOL_VERSION,
    checkpointId,
    ...normalized
  };
  const validation = await validateCloudSyncV2Checkpoint(checkpoint);
  if (!validation.valid) throw validationError('checkpoint', validation.issues);
  return checkpoint;
}

export async function validateCloudSyncV2Checkpoint(
  input: unknown
): Promise<CloudSyncV2ValidationResult<CloudSyncV2Checkpoint>> {
  const issues: CloudSyncV2ValidationIssue[] = [];
  if (!isRecord(input)) {
    addIssue(issues, 'invalid_type', '$', 'checkpoint must be an object');
    return result<CloudSyncV2Checkpoint>(undefined, issues);
  }

  expectExact(input.kind, CLOUD_SYNC_V2_CHECKPOINT_KIND, '$.kind', 'invalid_kind', issues);
  expectProtocol(input.protocolVersion, '$.protocolVersion', issues);
  expectArtifactId(input.checkpointId, 'checkpoint', '$.checkpointId', issues);
  expectRevision(input.revision, '$.revision', issues);
  expectDate(input.createdAt, '$.createdAt', issues);
  validateCollections(input.collections, '$.collections', issues);
  validateArray(input.tombstones, '$.tombstones', issues, validateTombstone);
  validateArray(input.blobs, '$.blobs', issues, validateBlobRef);
  validateUniqueRefs(input.blobs, '$.blobs', issues);

  if (issues.length === 0) {
    const value = input as unknown as CloudSyncV2Checkpoint;
    const expectedId = `checkpoint:${stripHashPrefix(await sha256CloudSyncV2(normalizeCheckpointInput(value)))}`;
    if (value.checkpointId !== expectedId) {
      addIssue(issues, 'id_mismatch', '$.checkpointId', 'checkpoint ID does not match its canonical content');
    }
  }
  return result(input as unknown as CloudSyncV2Checkpoint, issues);
}

export async function createCloudSyncV2DeltaSegment(
  input: CloudSyncV2DeltaSegmentInput
): Promise<CloudSyncV2DeltaSegment> {
  const normalized = normalizeDeltaInput(input);
  const segmentId = `delta:${stripHashPrefix(await sha256CloudSyncV2(normalized))}` as const;
  const segment: CloudSyncV2DeltaSegment = {
    kind: CLOUD_SYNC_V2_DELTA_KIND,
    protocolVersion: CLOUD_SYNC_V2_PROTOCOL_VERSION,
    segmentId,
    ...normalized
  };
  const validation = await validateCloudSyncV2DeltaSegment(segment);
  if (!validation.valid) throw validationError('delta segment', validation.issues);
  return segment;
}

export async function validateCloudSyncV2DeltaSegment(
  input: unknown
): Promise<CloudSyncV2ValidationResult<CloudSyncV2DeltaSegment>> {
  const issues: CloudSyncV2ValidationIssue[] = [];
  if (!isRecord(input)) {
    addIssue(issues, 'invalid_type', '$', 'delta segment must be an object');
    return result<CloudSyncV2DeltaSegment>(undefined, issues);
  }
  expectExact(input.kind, CLOUD_SYNC_V2_DELTA_KIND, '$.kind', 'invalid_kind', issues);
  expectProtocol(input.protocolVersion, '$.protocolVersion', issues);
  expectArtifactId(input.segmentId, 'delta', '$.segmentId', issues);
  if (input.baseRevision !== null) expectRevision(input.baseRevision, '$.baseRevision', issues);
  expectRevision(input.targetRevision, '$.targetRevision', issues);
  if (input.baseRevision !== null && input.baseRevision === input.targetRevision) {
    addIssue(issues, 'invalid_revision', '$.targetRevision', 'target revision must differ from base revision');
  }
  expectDate(input.createdAt, '$.createdAt', issues);
  validateArray(input.operations, '$.operations', issues, validateDeltaOperation);
  validateUniqueOperationIds(input.operations, '$.operations', issues);
  validateArray(input.blobs, '$.blobs', issues, validateBlobRef);
  validateUniqueRefs(input.blobs, '$.blobs', issues);

  if (issues.length === 0) {
    const value = input as unknown as CloudSyncV2DeltaSegment;
    const expectedId = `delta:${stripHashPrefix(await sha256CloudSyncV2(normalizeDeltaInput(value)))}`;
    if (value.segmentId !== expectedId) {
      addIssue(issues, 'id_mismatch', '$.segmentId', 'delta ID does not match its canonical content');
    }
  }
  return result(input as unknown as CloudSyncV2DeltaSegment, issues);
}

export async function createCloudSyncV2QuarantineBundle(
  input: CloudSyncV2QuarantineBundleInput
): Promise<CloudSyncV2QuarantineBundle> {
  const normalized = normalizeQuarantineInput(input);
  const quarantineId = `quarantine:${stripHashPrefix(await sha256CloudSyncV2(normalized))}` as const;
  const bundle: CloudSyncV2QuarantineBundle = {
    kind: CLOUD_SYNC_V2_QUARANTINE_KIND,
    protocolVersion: CLOUD_SYNC_V2_PROTOCOL_VERSION,
    quarantineId,
    ...normalized
  };
  const validation = await validateCloudSyncV2QuarantineBundle(bundle);
  if (!validation.valid) throw validationError('quarantine bundle', validation.issues);
  return bundle;
}

export async function validateCloudSyncV2QuarantineBundle(
  input: unknown
): Promise<CloudSyncV2ValidationResult<CloudSyncV2QuarantineBundle>> {
  const issues: CloudSyncV2ValidationIssue[] = [];
  if (!isRecord(input)) {
    addIssue(issues, 'invalid_type', '$', 'quarantine bundle must be an object');
    return result<CloudSyncV2QuarantineBundle>(undefined, issues);
  }
  expectExact(input.kind, CLOUD_SYNC_V2_QUARANTINE_KIND, '$.kind', 'invalid_kind', issues);
  expectProtocol(input.protocolVersion, '$.protocolVersion', issues);
  expectArtifactId(input.quarantineId, 'quarantine', '$.quarantineId', issues);
  expectDate(input.createdAt, '$.createdAt', issues);
  validateStringArray(input.sourceRevisions, '$.sourceRevisions', issues, true, expectRevision);
  validateStringArray(input.reasonCodes, '$.reasonCodes', issues, true);
  validateArray(input.groups, '$.groups', issues, validateQuarantineGroup);
  validateArray(input.blobs, '$.blobs', issues, validateBlobRef);
  validateUniqueRefs(input.blobs, '$.blobs', issues);

  if (issues.length === 0) {
    const value = input as unknown as CloudSyncV2QuarantineBundle;
    const expectedId = `quarantine:${stripHashPrefix(await sha256CloudSyncV2(normalizeQuarantineInput(value)))}`;
    if (value.quarantineId !== expectedId) {
      addIssue(issues, 'id_mismatch', '$.quarantineId', 'quarantine ID does not match its canonical content');
    }
  }
  return result(input as unknown as CloudSyncV2QuarantineBundle, issues);
}

export async function createCloudSyncV2Commit(input: CloudSyncV2CommitInput): Promise<CloudSyncV2Commit> {
  const normalized = normalizeCommitInput(input);
  const commitId = `commit:${stripHashPrefix(await sha256CloudSyncV2(normalized))}` as const;
  const commit: CloudSyncV2Commit = {
    kind: CLOUD_SYNC_V2_COMMIT_KIND,
    protocolVersion: CLOUD_SYNC_V2_PROTOCOL_VERSION,
    commitId,
    ...normalized
  };
  const validation = await validateCloudSyncV2Commit(commit);
  if (!validation.valid) throw validationError('commit', validation.issues);
  return commit;
}

export async function validateCloudSyncV2Commit(
  input: unknown
): Promise<CloudSyncV2ValidationResult<CloudSyncV2Commit>> {
  const issues: CloudSyncV2ValidationIssue[] = [];
  if (!isRecord(input)) {
    addIssue(issues, 'invalid_type', '$', 'commit must be an object');
    return result<CloudSyncV2Commit>(undefined, issues);
  }
  expectExact(input.kind, CLOUD_SYNC_V2_COMMIT_KIND, '$.kind', 'invalid_kind', issues);
  expectProtocol(input.protocolVersion, '$.protocolVersion', issues);
  expectArtifactId(input.commitId, 'commit', '$.commitId', issues);
  expectRevision(input.revision, '$.revision', issues);
  expectDate(input.createdAt, '$.createdAt', issues);
  expectNonEmptyString(input.deviceId, '$.deviceId', issues);
  expectNonNegativeInteger(input.epoch, '$.epoch', issues);
  expectProtocolFloor(input.minWriterProtocol, '$.minWriterProtocol', issues);
  validateArray(input.parents, '$.parents', issues, validateCommitRef);
  validateUniqueRefs(input.parents, '$.parents', issues);
  if (Array.isArray(input.parents) && input.parents.length > 2) {
    addIssue(issues, 'invalid_parent', '$.parents', 'a commit may have at most two parents');
  }
  if (Array.isArray(input.parents)) {
    for (let index = 0; index < input.parents.length; index += 1) {
      const parent = input.parents[index];
      if (isRecord(parent) && (parent.revision === input.revision || parent.id === input.commitId)) {
        addIssue(issues, 'invalid_parent', `$.parents[${index}]`, 'a commit cannot reference itself as a parent');
      }
    }
  }
  if (input.checkpoint !== undefined) validateCheckpointRef(input.checkpoint, '$.checkpoint', issues);
  validateArray(input.deltas, '$.deltas', issues, validateDeltaRef);
  validateUniqueRefs(input.deltas, '$.deltas', issues);
  validateArray(input.blobs, '$.blobs', issues, validateBlobRef);
  validateUniqueRefs(input.blobs, '$.blobs', issues);
  validateArray(input.quarantine, '$.quarantine', issues, validateQuarantineRef);
  validateUniqueRefs(input.quarantine, '$.quarantine', issues);

  const parentRevisions = new Set(
    Array.isArray(input.parents)
      ? input.parents.filter(isRecord).map(parent => parent.revision).filter((revision): revision is string => typeof revision === 'string')
      : []
  );
  if (isRecord(input.checkpoint) && input.checkpoint.revision !== input.revision) {
    addIssue(issues, 'invalid_reference', '$.checkpoint.revision', 'checkpoint revision must equal commit revision');
  }
  if (Array.isArray(input.deltas)) {
    input.deltas.forEach((delta, index) => {
      if (!isRecord(delta)) return;
      if (delta.targetRevision !== input.revision) {
        addIssue(issues, 'invalid_reference', `$.deltas[${index}].targetRevision`, 'delta target must equal commit revision');
      }
      if (delta.baseRevision === null && parentRevisions.size > 0) {
        addIssue(issues, 'invalid_parent', `$.deltas[${index}].baseRevision`, 'a non-genesis delta must reference a parent revision');
      } else if (typeof delta.baseRevision === 'string' && !parentRevisions.has(delta.baseRevision)) {
        addIssue(issues, 'invalid_parent', `$.deltas[${index}].baseRevision`, 'delta base must reference one of the commit parents');
      }
    });
  }
  if (
    input.checkpoint === undefined &&
    (!Array.isArray(input.deltas) || input.deltas.length === 0) &&
    (!Array.isArray(input.quarantine) || input.quarantine.length === 0)
  ) {
    addIssue(issues, 'invalid_reference', '$', 'commit must reference a checkpoint, delta, or quarantine bundle');
  }

  if (issues.length === 0) {
    const value = input as unknown as CloudSyncV2Commit;
    const expectedId = `commit:${stripHashPrefix(await sha256CloudSyncV2(normalizeCommitInput(value)))}`;
    if (value.commitId !== expectedId) {
      addIssue(issues, 'id_mismatch', '$.commitId', 'commit ID does not match its canonical content');
    }
  }
  return result(input as unknown as CloudSyncV2Commit, issues);
}

export async function createCloudSyncV2CheckpointRef(
  checkpoint: CloudSyncV2Checkpoint
): Promise<CloudSyncV2CheckpointRef> {
  assertValid(await validateCloudSyncV2Checkpoint(checkpoint), 'checkpoint');
  const bytes = encodeCloudSyncV2Canonical(checkpoint);
  return {
    kind: 'checkpoint',
    id: checkpoint.checkpointId,
    revision: checkpoint.revision,
    sha256: await sha256CloudSyncV2(bytes),
    byteLength: bytes.byteLength
  };
}

export async function createCloudSyncV2DeltaRef(delta: CloudSyncV2DeltaSegment): Promise<CloudSyncV2DeltaRef> {
  assertValid(await validateCloudSyncV2DeltaSegment(delta), 'delta segment');
  const bytes = encodeCloudSyncV2Canonical(delta);
  return {
    kind: 'delta',
    id: delta.segmentId,
    baseRevision: delta.baseRevision,
    targetRevision: delta.targetRevision,
    sha256: await sha256CloudSyncV2(bytes),
    byteLength: bytes.byteLength
  };
}

export async function createCloudSyncV2QuarantineRef(
  bundle: CloudSyncV2QuarantineBundle
): Promise<CloudSyncV2QuarantineRef> {
  assertValid(await validateCloudSyncV2QuarantineBundle(bundle), 'quarantine bundle');
  const bytes = encodeCloudSyncV2Canonical(bundle);
  return {
    kind: 'quarantine',
    id: bundle.quarantineId,
    sourceRevisions: [...bundle.sourceRevisions],
    sha256: await sha256CloudSyncV2(bytes),
    byteLength: bytes.byteLength
  };
}

export async function createCloudSyncV2CommitRef(commit: CloudSyncV2Commit): Promise<CloudSyncV2CommitRef> {
  assertValid(await validateCloudSyncV2Commit(commit), 'commit');
  const bytes = encodeCloudSyncV2Canonical(commit);
  return {
    kind: 'commit',
    id: commit.commitId,
    revision: commit.revision,
    sha256: await sha256CloudSyncV2(bytes),
    byteLength: bytes.byteLength
  };
}

export async function createCloudSyncV2BlobRef(
  data: CloudSyncV2HashInput,
  mediaType?: string
): Promise<CloudSyncV2BlobRef> {
  const bytes = await toBytes(data);
  const sha256 = await sha256CloudSyncV2(bytes);
  return {
    kind: 'blob',
    id: `blob:${stripHashPrefix(sha256)}`,
    sha256,
    byteLength: bytes.byteLength,
    ...(mediaType ? { mediaType } : {})
  };
}

export function validateCloudSyncV2CommitRef(input: unknown): CloudSyncV2ValidationResult<CloudSyncV2CommitRef> {
  const issues: CloudSyncV2ValidationIssue[] = [];
  validateCommitRef(input, '$', issues);
  return result(input as CloudSyncV2CommitRef, issues);
}

export function validateCloudSyncV2CheckpointRef(
  input: unknown
): CloudSyncV2ValidationResult<CloudSyncV2CheckpointRef> {
  const issues: CloudSyncV2ValidationIssue[] = [];
  validateCheckpointRef(input, '$', issues);
  return result(input as CloudSyncV2CheckpointRef, issues);
}

export function validateCloudSyncV2DeltaRef(input: unknown): CloudSyncV2ValidationResult<CloudSyncV2DeltaRef> {
  const issues: CloudSyncV2ValidationIssue[] = [];
  validateDeltaRef(input, '$', issues);
  return result(input as CloudSyncV2DeltaRef, issues);
}

export function validateCloudSyncV2BlobRef(input: unknown): CloudSyncV2ValidationResult<CloudSyncV2BlobRef> {
  const issues: CloudSyncV2ValidationIssue[] = [];
  validateBlobRef(input, '$', issues);
  return result(input as CloudSyncV2BlobRef, issues);
}

export function validateCloudSyncV2QuarantineRef(
  input: unknown
): CloudSyncV2ValidationResult<CloudSyncV2QuarantineRef> {
  const issues: CloudSyncV2ValidationIssue[] = [];
  validateQuarantineRef(input, '$', issues);
  return result(input as CloudSyncV2QuarantineRef, issues);
}

export async function validateCloudSyncV2ArtifactBytes(
  reference: CloudSyncV2ArtifactRef,
  data: CloudSyncV2HashInput
): Promise<CloudSyncV2ValidationResult<CloudSyncV2ArtifactRef>> {
  const issues: CloudSyncV2ValidationIssue[] = [];
  validateArtifactRef(reference, '$', issues, reference.kind);
  if (issues.length > 0) return result(reference, issues);

  const bytes = await toBytes(data);
  if (bytes.byteLength !== reference.byteLength) {
    addIssue(issues, 'byte_length_mismatch', '$.byteLength', `expected ${reference.byteLength} bytes but received ${bytes.byteLength}`);
  }
  const digest = await sha256CloudSyncV2(bytes);
  if (digest !== reference.sha256) {
    addIssue(issues, 'hash_mismatch', '$.sha256', 'artifact bytes do not match the referenced SHA-256');
  }
  if (reference.kind === 'blob' && reference.id !== `blob:${stripHashPrefix(digest)}`) {
    addIssue(issues, 'id_mismatch', '$.id', 'blob ID must be derived from the content SHA-256');
  }
  return result(reference, issues);
}

export async function sha256CloudSyncV2(input: CloudSyncV2HashInput | unknown): Promise<CloudSyncV2Sha256> {
  const bytes = isHashInput(input) ? await toBytes(input) : encodeCloudSyncV2Canonical(input);
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    const digest = await subtle.digest('SHA-256', new Uint8Array(bytes).buffer);
    return `sha256:${bytesToHex(new Uint8Array(digest))}`;
  }

  // Kept behind a dynamic import so browser bundles never execute the Node
  // path, while Electron main and test processes still have a reliable fallback.
  const { createHash } = await import('node:crypto');
  const digest = createHash('sha256').update(bytes).digest('hex');
  return `sha256:${digest}`;
}

export function encodeCloudSyncV2Canonical(input: unknown): Uint8Array {
  return new TextEncoder().encode(canonicalSerialize(input));
}

export function selectCloudSyncV2Retention(input: CloudSyncV2RetentionInput): CloudSyncV2RetentionResult {
  const now = parseNow(input.now);
  const recentCommitCount = normalizeRetentionCount(input.recentCommitCount, CLOUD_SYNC_V2_DEFAULT_RECENT_COMMIT_COUNT);
  const activeDeviceDays = normalizeRetentionCount(input.activeDeviceDays, CLOUD_SYNC_V2_DEFAULT_ACTIVE_DEVICE_DAYS);
  const dailyCheckpointDays = normalizeRetentionCount(input.dailyCheckpointDays, CLOUD_SYNC_V2_DEFAULT_DAILY_CHECKPOINT_DAYS);
  const activeAcks = getActiveDeviceAcks(input.deviceAcks, now, activeDeviceDays);
  const commitById = new Map(input.commits.map(commit => [commit.commitId, commit]));
  const keepCommits = new Set<`commit:${string}`>();
  const keepCheckpoints = new Set<`checkpoint:${string}`>();
  const reasons: Record<string, string[]> = {};

  const keepCommit = (commitId: `commit:${string}`, reason: string) => {
    keepCommits.add(commitId);
    addRetentionReason(reasons, commitId, reason);
  };
  const keepCheckpoint = (checkpointId: `checkpoint:${string}`, reason: string) => {
    keepCheckpoints.add(checkpointId);
    addRetentionReason(reasons, checkpointId, reason);
  };

  if (input.head) keepCommit(input.head.commitId, 'current-head');

  const commitsNewestFirst = [...input.commits].sort(compareCreatedAtThenIdDesc);
  for (const commit of commitsNewestFirst.slice(0, recentCommitCount)) {
    keepCommit(commit.commitId, 'recent-commit');
  }

  if (activeAcks.length > 0) {
    const acknowledgedByDevice = new Map<string, Set<string>>();
    for (const ack of activeAcks) {
      acknowledgedByDevice.set(
        ack.deviceId,
        ack.acknowledgedCommitId
          ? collectAncestorsAndSelf(ack.acknowledgedCommitId, commitById)
          : new Set<string>()
      );
    }
    for (const commit of input.commits) {
      const blockingDevices = activeAcks.filter(ack => !acknowledgedByDevice.get(ack.deviceId)!.has(commit.commitId));
      if (blockingDevices.length > 0) {
        keepCommit(commit.commitId, `unacknowledged-by:${blockingDevices.map(ack => ack.deviceId).sort().join(',')}`);
      }
    }
  }

  for (const commitId of keepCommits) {
    const commit = commitById.get(commitId);
    for (const checkpointId of commit?.checkpointIds || []) {
      keepCheckpoint(checkpointId, `referenced-by:${commitId}`);
    }
  }

  const checkpointCutoff = now - dailyCheckpointDays * DAY_MS;
  const newestByUtcDay = new Map<string, CloudSyncV2RetentionCheckpoint>();
  for (const checkpoint of input.checkpoints) {
    const createdAt = Date.parse(checkpoint.createdAt);
    if (!Number.isFinite(createdAt) || createdAt < checkpointCutoff || createdAt > now) continue;
    const day = new Date(createdAt).toISOString().slice(0, 10);
    const current = newestByUtcDay.get(day);
    if (!current || compareCreatedAtThenIdDesc(checkpoint, current) < 0) newestByUtcDay.set(day, checkpoint);
  }
  for (const checkpoint of newestByUtcDay.values()) {
    keepCheckpoint(checkpoint.checkpointId, 'daily-checkpoint');
  }

  return {
    commitIds: [...keepCommits].sort(),
    checkpointIds: [...keepCheckpoints].sort(),
    activeDeviceIds: activeAcks.map(ack => ack.deviceId).sort(),
    reasons
  };
}

export function evaluateCloudSyncV2TombstoneCompaction(
  input: CloudSyncV2TombstoneCompactionInput
): CloudSyncV2TombstoneCompactionResult {
  const now = parseNow(input.now);
  const minAgeDays = normalizeRetentionCount(input.minAgeDays, CLOUD_SYNC_V2_MIN_TOMBSTONE_AGE_DAYS);
  const activeDeviceDays = normalizeRetentionCount(input.activeDeviceDays, CLOUD_SYNC_V2_DEFAULT_ACTIVE_DEVICE_DAYS);
  const deletedAt = Date.parse(input.tombstone.deletedAt);
  const ageDays = Number.isFinite(deletedAt) ? (now - deletedAt) / DAY_MS : Number.NaN;
  const reasons: string[] = [];
  if (!Number.isFinite(ageDays) || ageDays < 0) reasons.push('invalid-deletion-time');
  else if (ageDays < minAgeDays) reasons.push('minimum-age-not-reached');

  const activeAcks = getActiveDeviceAcks(input.deviceAcks, now, activeDeviceDays);
  const commitById = new Map(input.commits.map(commit => [commit.commitId, commit]));
  const blockingDeviceIds: string[] = [];
  for (const ack of activeAcks) {
    if (
      !ack.acknowledgedCommitId ||
      !collectAncestorsAndSelf(ack.acknowledgedCommitId, commitById).has(input.tombstone.deletionCommitId)
    ) {
      blockingDeviceIds.push(ack.deviceId);
    }
  }
  blockingDeviceIds.sort();
  if (blockingDeviceIds.length > 0) reasons.push('active-device-has-not-acknowledged-deletion');

  return {
    compactable: reasons.length === 0,
    ageDays,
    activeDeviceIds: activeAcks.map(ack => ack.deviceId).sort(),
    blockingDeviceIds,
    reasons
  };
}

export function canCompactCloudSyncV2Tombstone(input: CloudSyncV2TombstoneCompactionInput): boolean {
  return evaluateCloudSyncV2TombstoneCompaction(input).compactable;
}

function normalizeCheckpointInput(input: CloudSyncV2CheckpointInput | CloudSyncV2Checkpoint): CloudSyncV2CheckpointInput {
  const collections: Record<string, CloudSyncV2JsonValue[]> = {};
  for (const key of Object.keys(input.collections || {}).sort()) {
    collections[key] = [...input.collections[key]].sort(compareCanonical);
  }
  return {
    revision: input.revision,
    createdAt: input.createdAt,
    collections,
    tombstones: [...(input.tombstones || [])].sort((left, right) =>
      `${left.collection}\u0000${left.recordKey}`.localeCompare(`${right.collection}\u0000${right.recordKey}`)
    ),
    blobs: [...(input.blobs || [])].sort(compareRefs)
  };
}

function normalizeDeltaInput(input: CloudSyncV2DeltaSegmentInput | CloudSyncV2DeltaSegment): CloudSyncV2DeltaSegmentInput {
  return {
    baseRevision: input.baseRevision,
    targetRevision: input.targetRevision,
    createdAt: input.createdAt,
    operations: [...(input.operations || [])].sort((left, right) => left.operationId.localeCompare(right.operationId)),
    blobs: [...(input.blobs || [])].sort(compareRefs)
  };
}

function normalizeQuarantineInput(
  input: CloudSyncV2QuarantineBundleInput | CloudSyncV2QuarantineBundle
): CloudSyncV2QuarantineBundleInput {
  return {
    createdAt: input.createdAt,
    sourceRevisions: [...(input.sourceRevisions || [])].sort(),
    reasonCodes: [...(input.reasonCodes || [])].sort(),
    groups: [...(input.groups || [])].map(group => ({
      ...group,
      records: [...group.records].sort((left, right) =>
        `${left.collection}\u0000${left.recordKey}`.localeCompare(`${right.collection}\u0000${right.recordKey}`)
      ),
      issues: [...group.issues].sort(compareCanonical)
    })).sort((left, right) => left.groupId.localeCompare(right.groupId)),
    blobs: [...(input.blobs || [])].sort(compareRefs)
  };
}

function normalizeCommitInput(input: CloudSyncV2CommitInput | CloudSyncV2Commit): CloudSyncV2CommitInput {
  return {
    revision: input.revision,
    parents: [...(input.parents || [])].sort(compareRefs),
    createdAt: input.createdAt,
    deviceId: input.deviceId,
    epoch: input.epoch,
    minWriterProtocol: input.minWriterProtocol,
    checkpoint: input.checkpoint,
    deltas: [...(input.deltas || [])].sort(compareRefs),
    blobs: [...(input.blobs || [])].sort(compareRefs),
    quarantine: [...(input.quarantine || [])].sort(compareRefs)
  };
}

function validateDeviceAck(input: unknown, path: string, issues: CloudSyncV2ValidationIssue[]): void {
  if (!isRecord(input)) {
    addIssue(issues, 'invalid_type', path, 'device ack must be an object');
    return;
  }
  expectNonEmptyString(input.deviceId, `${path}.deviceId`, issues);
  expectNonNegativeInteger(input.epoch, `${path}.epoch`, issues);
  expectDate(input.lastSeenAt, `${path}.lastSeenAt`, issues);
  if (input.acknowledgedAt !== undefined) expectDate(input.acknowledgedAt, `${path}.acknowledgedAt`, issues);
  const hasRevision = input.acknowledgedRevision !== undefined;
  const hasCommit = input.acknowledgedCommitId !== undefined;
  if (hasRevision !== hasCommit) {
    addIssue(issues, 'invalid_reference', path, 'acknowledged revision and commit ID must be provided together');
  }
  if (hasRevision) expectRevision(input.acknowledgedRevision, `${path}.acknowledgedRevision`, issues);
  if (hasCommit) expectArtifactId(input.acknowledgedCommitId, 'commit', `${path}.acknowledgedCommitId`, issues);
  expectProtocolFloor(input.minWriterProtocol, `${path}.minWriterProtocol`, issues);
}

function validateCommitRef(input: unknown, path: string, issues: CloudSyncV2ValidationIssue[]): void {
  validateArtifactRef(input, path, issues, 'commit');
  if (isRecord(input)) expectRevision(input.revision, `${path}.revision`, issues);
}

function validateCheckpointRef(input: unknown, path: string, issues: CloudSyncV2ValidationIssue[]): void {
  validateArtifactRef(input, path, issues, 'checkpoint');
  if (isRecord(input)) expectRevision(input.revision, `${path}.revision`, issues);
}

function validateDeltaRef(input: unknown, path: string, issues: CloudSyncV2ValidationIssue[]): void {
  validateArtifactRef(input, path, issues, 'delta');
  if (!isRecord(input)) return;
  if (input.baseRevision !== null) expectRevision(input.baseRevision, `${path}.baseRevision`, issues);
  expectRevision(input.targetRevision, `${path}.targetRevision`, issues);
}

function validateBlobRef(input: unknown, path: string, issues: CloudSyncV2ValidationIssue[]): void {
  validateArtifactRef(input, path, issues, 'blob');
  if (!isRecord(input)) return;
  if (typeof input.sha256 === 'string' && typeof input.id === 'string' && input.id !== `blob:${stripHashPrefix(input.sha256)}`) {
    addIssue(issues, 'invalid_reference', `${path}.id`, 'blob ID must equal its SHA-256 content address');
  }
  if (input.mediaType !== undefined) expectNonEmptyString(input.mediaType, `${path}.mediaType`, issues);
}

function validateQuarantineRef(input: unknown, path: string, issues: CloudSyncV2ValidationIssue[]): void {
  validateArtifactRef(input, path, issues, 'quarantine');
  if (isRecord(input)) validateStringArray(input.sourceRevisions, `${path}.sourceRevisions`, issues, true, expectRevision);
}

function validateArtifactRef(
  input: unknown,
  path: string,
  issues: CloudSyncV2ValidationIssue[],
  expectedKind: CloudSyncV2ArtifactKind
): void {
  if (!isRecord(input)) {
    addIssue(issues, 'invalid_type', path, 'artifact reference must be an object');
    return;
  }
  expectExact(input.kind, expectedKind, `${path}.kind`, 'invalid_kind', issues);
  expectArtifactId(input.id, expectedKind, `${path}.id`, issues);
  if (typeof input.sha256 !== 'string' || !SHA256_PATTERN.test(input.sha256)) {
    addIssue(issues, 'invalid_hash', `${path}.sha256`, 'SHA-256 must use sha256:<64 lowercase hex>');
  }
  if (!isNonNegativeInteger(input.byteLength)) {
    addIssue(issues, 'invalid_byte_length', `${path}.byteLength`, 'byte length must be a non-negative safe integer');
  }
}

function validateTombstone(input: unknown, path: string, issues: CloudSyncV2ValidationIssue[]): void {
  if (!isRecord(input)) {
    addIssue(issues, 'invalid_type', path, 'tombstone must be an object');
    return;
  }
  expectNonEmptyString(input.collection, `${path}.collection`, issues);
  expectNonEmptyString(input.recordKey, `${path}.recordKey`, issues);
  expectDate(input.deletedAt, `${path}.deletedAt`, issues);
  expectRevision(input.deletionRevision, `${path}.deletionRevision`, issues);
  expectArtifactId(input.deletionCommitId, 'commit', `${path}.deletionCommitId`, issues);
}

function validateCollections(input: unknown, path: string, issues: CloudSyncV2ValidationIssue[]): void {
  if (!isRecord(input)) {
    addIssue(issues, 'invalid_type', path, 'collections must be an object');
    return;
  }
  for (const [collection, records] of Object.entries(input)) {
    if (!collection.trim()) addIssue(issues, 'invalid_value', path, 'collection names must not be empty');
    if (!Array.isArray(records)) {
      addIssue(issues, 'invalid_type', `${path}.${escapePath(collection)}`, 'collection value must be an array');
      continue;
    }
    records.forEach((record, index) => validateJsonValue(record, `${path}.${escapePath(collection)}[${index}]`, issues));
  }
}

function validateDeltaOperation(input: unknown, path: string, issues: CloudSyncV2ValidationIssue[]): void {
  if (!isRecord(input)) {
    addIssue(issues, 'invalid_type', path, 'delta operation must be an object');
    return;
  }
  expectNonEmptyString(input.operationId, `${path}.operationId`, issues);
  expectNonEmptyString(input.collection, `${path}.collection`, issues);
  expectNonEmptyString(input.recordKey, `${path}.recordKey`, issues);
  if (input.type === 'upsert') {
    if (!isRecord(input.record)) addIssue(issues, 'invalid_type', `${path}.record`, 'upsert record must be an object');
    else validateJsonValue(input.record, `${path}.record`, issues);
  } else if (input.type === 'delete') {
    validateTombstone(input.tombstone, `${path}.tombstone`, issues);
    if (isRecord(input.tombstone)) {
      if (input.tombstone.collection !== input.collection || input.tombstone.recordKey !== input.recordKey) {
        addIssue(issues, 'invalid_reference', `${path}.tombstone`, 'tombstone identity must match the delete operation');
      }
    }
  } else {
    addIssue(issues, 'invalid_value', `${path}.type`, 'operation type must be upsert or delete');
  }
}

function validateQuarantineGroup(input: unknown, path: string, issues: CloudSyncV2ValidationIssue[]): void {
  if (!isRecord(input)) {
    addIssue(issues, 'invalid_type', path, 'quarantine group must be an object');
    return;
  }
  expectNonEmptyString(input.groupId, `${path}.groupId`, issues);
  validateArray(input.records, `${path}.records`, issues, (record, recordPath, recordIssues) => {
    if (!isRecord(record)) {
      addIssue(recordIssues, 'invalid_type', recordPath, 'quarantine record must be an object');
      return;
    }
    expectNonEmptyString(record.collection, `${recordPath}.collection`, recordIssues);
    expectNonEmptyString(record.recordKey, `${recordPath}.recordKey`, recordIssues);
    validateJsonValue(record.payload, `${recordPath}.payload`, recordIssues);
  });
  validateArray(input.issues, `${path}.issues`, issues, (issue, issuePath, issueList) => {
    if (!isRecord(issue)) {
      addIssue(issueList, 'invalid_type', issuePath, 'quarantine issue must be an object');
      return;
    }
    expectNonEmptyString(issue.code, `${issuePath}.code`, issueList);
    for (const field of ['collection', 'recordKey', 'relation']) {
      if (issue[field] !== undefined) expectNonEmptyString(issue[field], `${issuePath}.${field}`, issueList);
    }
  });
}

function validateJsonValue(input: unknown, path: string, issues: CloudSyncV2ValidationIssue[], seen = new Set<object>()): void {
  if (input === null || typeof input === 'string' || typeof input === 'boolean') return;
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) addIssue(issues, 'invalid_value', path, 'JSON numbers must be finite');
    return;
  }
  if (typeof input !== 'object') {
    addIssue(issues, 'invalid_type', path, 'value must be JSON-safe');
    return;
  }
  if (seen.has(input)) {
    addIssue(issues, 'invalid_value', path, 'cyclic values are not supported');
    return;
  }
  seen.add(input);
  if (Array.isArray(input)) {
    input.forEach((value, index) => validateJsonValue(value, `${path}[${index}]`, issues, seen));
  } else if (Object.getPrototypeOf(input) === Object.prototype || Object.getPrototypeOf(input) === null) {
    for (const [key, value] of Object.entries(input)) validateJsonValue(value, `${path}.${escapePath(key)}`, issues, seen);
  } else {
    addIssue(issues, 'invalid_type', path, 'value must be a plain JSON object');
  }
  seen.delete(input);
}

function validateArray(
  input: unknown,
  path: string,
  issues: CloudSyncV2ValidationIssue[],
  validator: (value: unknown, path: string, issues: CloudSyncV2ValidationIssue[]) => void
): void {
  if (!Array.isArray(input)) {
    addIssue(issues, 'invalid_type', path, 'value must be an array');
    return;
  }
  input.forEach((value, index) => validator(value, `${path}[${index}]`, issues));
}

function validateStringArray(
  input: unknown,
  path: string,
  issues: CloudSyncV2ValidationIssue[],
  requireNonEmpty: boolean,
  validator?: (value: unknown, path: string, issues: CloudSyncV2ValidationIssue[]) => void
): void {
  if (!Array.isArray(input)) {
    addIssue(issues, 'invalid_type', path, 'value must be an array');
    return;
  }
  if (requireNonEmpty && input.length === 0) addIssue(issues, 'invalid_value', path, 'array must not be empty');
  const seen = new Set<string>();
  input.forEach((value, index) => {
    if (validator) validator(value, `${path}[${index}]`, issues);
    else expectNonEmptyString(value, `${path}[${index}]`, issues);
    if (typeof value === 'string') {
      if (seen.has(value)) addIssue(issues, 'duplicate_reference', `${path}[${index}]`, 'duplicate value');
      seen.add(value);
    }
  });
}

function validateUniqueRefs(input: unknown, path: string, issues: CloudSyncV2ValidationIssue[]): void {
  if (!Array.isArray(input)) return;
  const ids = new Set<string>();
  input.forEach((reference, index) => {
    if (!isRecord(reference) || typeof reference.id !== 'string') return;
    if (ids.has(reference.id)) addIssue(issues, 'duplicate_reference', `${path}[${index}].id`, 'duplicate artifact reference');
    ids.add(reference.id);
  });
}

function validateUniqueOperationIds(input: unknown, path: string, issues: CloudSyncV2ValidationIssue[]): void {
  if (!Array.isArray(input)) return;
  const ids = new Set<string>();
  input.forEach((operation, index) => {
    if (!isRecord(operation) || typeof operation.operationId !== 'string') return;
    if (ids.has(operation.operationId)) addIssue(issues, 'duplicate_reference', `${path}[${index}].operationId`, 'duplicate operation ID');
    ids.add(operation.operationId);
  });
}

function expectProtocol(input: unknown, path: string, issues: CloudSyncV2ValidationIssue[]): void {
  if (input !== CLOUD_SYNC_V2_PROTOCOL_VERSION) {
    addIssue(issues, 'unsupported_protocol', path, `protocol version must be ${CLOUD_SYNC_V2_PROTOCOL_VERSION}`);
  }
}

function expectProtocolFloor(input: unknown, path: string, issues: CloudSyncV2ValidationIssue[]): void {
  if (!Number.isSafeInteger(input) || (input as number) < CLOUD_SYNC_V2_PROTOCOL_VERSION) {
    addIssue(issues, 'invalid_value', path, `minimum writer protocol must be at least ${CLOUD_SYNC_V2_PROTOCOL_VERSION}`);
  }
}

function expectRevision(input: unknown, path: string, issues: CloudSyncV2ValidationIssue[]): void {
  if (typeof input !== 'string' || input.length > 200 || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(input)) {
    addIssue(issues, 'invalid_revision', path, 'revision must be a non-empty portable token');
  }
}

function expectArtifactId(
  input: unknown,
  kind: CloudSyncV2ArtifactKind,
  path: string,
  issues: CloudSyncV2ValidationIssue[]
): void {
  if (typeof input !== 'string' || !ID_PATTERNS[kind].test(input)) {
    addIssue(issues, 'invalid_id', path, `${kind} ID must contain a lowercase SHA-256 digest`);
  }
}

function expectDate(input: unknown, path: string, issues: CloudSyncV2ValidationIssue[]): void {
  if (typeof input !== 'string' || !Number.isFinite(Date.parse(input))) {
    addIssue(issues, 'invalid_date', path, 'value must be a valid date string');
  }
}

function expectNonEmptyString(input: unknown, path: string, issues: CloudSyncV2ValidationIssue[]): void {
  if (typeof input !== 'string' || !input.trim()) addIssue(issues, 'invalid_value', path, 'value must be a non-empty string');
}

function expectNonNegativeInteger(input: unknown, path: string, issues: CloudSyncV2ValidationIssue[]): void {
  if (!isNonNegativeInteger(input)) addIssue(issues, 'invalid_value', path, 'value must be a non-negative safe integer');
}

function expectExact(
  input: unknown,
  expected: string,
  path: string,
  code: CloudSyncV2ValidationIssue['code'],
  issues: CloudSyncV2ValidationIssue[]
): void {
  if (input !== expected) addIssue(issues, code, path, `value must be ${expected}`);
}

function result<T>(value: T | undefined, issues: CloudSyncV2ValidationIssue[]): CloudSyncV2ValidationResult<T> {
  return issues.length === 0 ? { valid: true, value, issues } : { valid: false, issues };
}

function addIssue(
  issues: CloudSyncV2ValidationIssue[],
  code: CloudSyncV2ValidationIssue['code'],
  path: string,
  message: string
): void {
  issues.push({ code, path, message });
}

function validationError(name: string, issues: CloudSyncV2ValidationIssue[]): Error {
  return new Error(`invalid cloud sync v2 ${name}: ${issues.map(issue => `${issue.path} ${issue.message}`).join('; ')}`);
}

function assertValid<T>(validation: CloudSyncV2ValidationResult<T>, name: string): asserts validation is CloudSyncV2ValidationResult<T> & { value: T } {
  if (!validation.valid) throw validationError(name, validation.issues);
}

function canonicalSerialize(input: unknown, seen = new Set<object>()): string {
  if (input === null) return 'null';
  if (typeof input === 'string' || typeof input === 'boolean') return JSON.stringify(input);
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw new TypeError('cloud sync v2 canonical data cannot contain non-finite numbers');
    return JSON.stringify(Object.is(input, -0) ? 0 : input);
  }
  if (typeof input !== 'object') throw new TypeError(`cloud sync v2 canonical data cannot contain ${typeof input}`);
  if (seen.has(input)) throw new TypeError('cloud sync v2 canonical data cannot contain cycles');
  seen.add(input);
  let serialized: string;
  if (Array.isArray(input)) {
    serialized = `[${input.map(value => canonicalSerialize(value, seen)).join(',')}]`;
  } else {
    if (Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null) {
      seen.delete(input);
      throw new TypeError('cloud sync v2 canonical data must use plain objects');
    }
    const entries = Object.entries(input as Record<string, unknown>)
      .filter(([, value]) => value !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    serialized = `{${entries.map(([key, value]) => `${JSON.stringify(key)}:${canonicalSerialize(value, seen)}`).join(',')}}`;
  }
  seen.delete(input);
  return serialized;
}

async function toBytes(input: CloudSyncV2HashInput): Promise<Uint8Array> {
  if (typeof input === 'string') return new TextEncoder().encode(input);
  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength) as ArrayBuffer);
  }
  if (isArrayBuffer(input)) return new Uint8Array(input);
  if (isBlobLike(input)) return new Uint8Array(await input.arrayBuffer());
  throw new TypeError('unsupported SHA-256 input');
}

function isHashInput(input: unknown): input is CloudSyncV2HashInput {
  return typeof input === 'string' || ArrayBuffer.isView(input) || isArrayBuffer(input) || isBlobLike(input);
}

function isArrayBuffer(input: unknown): input is ArrayBuffer {
  return Object.prototype.toString.call(input) === '[object ArrayBuffer]';
}

function isBlobLike(input: unknown): input is Blob {
  return !!input && typeof input === 'object' &&
    typeof (input as Blob).arrayBuffer === 'function' &&
    typeof (input as Blob).size === 'number' &&
    typeof (input as Blob).type === 'string';
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function stripHashPrefix(hash: string): string {
  return hash.startsWith('sha256:') ? hash.slice(7) : hash;
}

function compareCanonical(left: unknown, right: unknown): number {
  return canonicalSerialize(left).localeCompare(canonicalSerialize(right));
}

function compareRefs(left: { id: string }, right: { id: string }): number {
  return left.id.localeCompare(right.id);
}

function compareCreatedAtThenIdDesc(
  left: { createdAt: string; commitId?: string; checkpointId?: string },
  right: { createdAt: string; commitId?: string; checkpointId?: string }
): number {
  const timeDifference = Date.parse(right.createdAt) - Date.parse(left.createdAt);
  if (timeDifference !== 0) return timeDifference;
  const leftId = left.commitId || left.checkpointId || '';
  const rightId = right.commitId || right.checkpointId || '';
  return rightId.localeCompare(leftId);
}

function collectAncestorsAndSelf(
  commitId: string,
  commitById: Map<`commit:${string}`, CloudSyncV2RetentionCommit>
): Set<string> {
  const visited = new Set<string>();
  const pending = [commitId];
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (visited.has(current)) continue;
    visited.add(current);
    const commit = commitById.get(current as `commit:${string}`);
    if (commit) pending.push(...commit.parents.map(parent => parent.commitId));
  }
  return visited;
}

function getActiveDeviceAcks(
  deviceAcks: CloudSyncV2DeviceAck[] | Record<string, CloudSyncV2DeviceAck>,
  now: number,
  activeDeviceDays: number
): CloudSyncV2DeviceAck[] {
  const values = Array.isArray(deviceAcks) ? deviceAcks : Object.values(deviceAcks);
  const cutoff = now - activeDeviceDays * DAY_MS;
  return values.filter(ack => {
    const lastSeenAt = Date.parse(ack.lastSeenAt);
    return Number.isFinite(lastSeenAt) && lastSeenAt >= cutoff && lastSeenAt <= now;
  });
}

function parseNow(now?: Date | string): number {
  const value = now instanceof Date ? now.getTime() : now ? Date.parse(now) : Date.now();
  if (!Number.isFinite(value)) throw new TypeError('retention now must be a valid date');
  return value;
}

function normalizeRetentionCount(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError('retention counts must be non-negative safe integers');
  return value;
}

function addRetentionReason(reasons: Record<string, string[]>, id: string, reason: string): void {
  const values = reasons[id] || [];
  if (!values.includes(reason)) values.push(reason);
  reasons[id] = values.sort();
}

function isRecord(input: unknown): input is Record<string, any> {
  return !!input && typeof input === 'object' && !Array.isArray(input);
}

function isNonNegativeInteger(input: unknown): input is number {
  return Number.isSafeInteger(input) && (input as number) >= 0;
}

function escapePath(value: string): string {
  return value.split('.').join('\\.');
}
