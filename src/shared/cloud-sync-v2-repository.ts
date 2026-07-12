import {
  getCloudSyncV2ArtifactPath,
  getCloudSyncV2DirectoryPath,
  getCloudSyncV2ManifestBackupPath,
  getCloudSyncV2ManifestPath,
  type CloudSyncV2ArtifactDirectory
} from './cloud-backup-paths';
import type { CloudSyncV2MigrationArtifacts } from './cloud-sync-v2-migration';
import {
  encodeCloudSyncV2Canonical,
  validateCloudSyncV2ArtifactBytes,
  validateCloudSyncV2Checkpoint,
  validateCloudSyncV2Commit,
  validateCloudSyncV2DeltaSegment,
  validateCloudSyncV2Manifest,
  validateCloudSyncV2QuarantineBundle,
  type CloudSyncV2ArtifactRef,
  type CloudSyncV2Checkpoint,
  type CloudSyncV2Commit,
  type CloudSyncV2DeltaSegment,
  type CloudSyncV2Manifest,
  type CloudSyncV2QuarantineBundle,
  type CloudSyncV2RetentionResult
} from './cloud-sync-protocol-v2';

export interface CloudSyncV2StoredObject {
  data: Uint8Array;
  etag?: string;
}

export interface CloudSyncV2StoredObjectInfo {
  path: string;
  etag?: string;
  byteLength?: number;
}

export interface CloudSyncV2ObjectWriteOptions {
  /** Create only. The write must fail atomically when the path already exists. */
  ifAbsent?: boolean;
  /** Replace only when the current object has this ETag. */
  expectedEtag?: string;
}

export type CloudSyncV2ObjectWriteResult =
  | { status: 'written'; etag?: string }
  | { status: 'precondition_failed'; etag?: string };

/** Minimal provider-neutral object store used by the v2 publishing protocol. */
export interface CloudSyncV2ObjectStorageAdapter {
  read(path: string): Promise<CloudSyncV2StoredObject | null>;
  write(
    path: string,
    data: Uint8Array,
    options?: CloudSyncV2ObjectWriteOptions
  ): Promise<CloudSyncV2ObjectWriteResult>;
  delete(path: string): Promise<void>;
  list(prefix: string): Promise<CloudSyncV2StoredObjectInfo[]>;
}

export type CloudSyncV2RepositoryErrorCode =
  | 'artifact_invalid'
  | 'artifact_content_conflict'
  | 'artifact_readback_failed'
  | 'manifest_invalid'
  | 'manifest_read_failed'
  | 'manifest_backup_failed';

export class CloudSyncV2RepositoryError extends Error {
  readonly code: CloudSyncV2RepositoryErrorCode;
  readonly path?: string;
  readonly details?: unknown;

  constructor(
    code: CloudSyncV2RepositoryErrorCode,
    message: string,
    options: { path?: string; details?: unknown; cause?: unknown } = {}
  ) {
    super(message);
    this.name = 'CloudSyncV2RepositoryError';
    this.code = code;
    this.path = options.path;
    this.details = options.details;
    if (options.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = options.cause;
    }
  }
}

export interface CloudSyncV2ArtifactValidationIssue {
  code: 'invalid_bytes' | 'invalid_json' | 'invalid_schema' | 'reference_mismatch';
  message: string;
  details?: unknown;
}

export interface CloudSyncV2ArtifactValidationResult {
  valid: boolean;
  value?: CloudSyncV2Checkpoint | CloudSyncV2Commit | CloudSyncV2DeltaSegment | CloudSyncV2QuarantineBundle | Uint8Array;
  issues: CloudSyncV2ArtifactValidationIssue[];
}

export interface CloudSyncV2ManifestReadResult {
  manifest: CloudSyncV2Manifest;
  source: 'primary' | 'backup';
  path: string;
  etag?: string;
  primaryError?: CloudSyncV2RepositoryError;
}

export interface CloudSyncV2PublishExpectation {
  /** null means that no v2 head is expected (the migration/genesis case). */
  headId: `commit:${string}` | null;
  /** ETag observed while reading the primary manifest, when one existed. */
  manifestEtag?: string;
}

export interface CloudSyncV2PublishSuccess {
  status: 'published';
  manifest: CloudSyncV2Manifest;
  etag?: string;
  manifestAlreadyPublished: boolean;
  writtenPaths: string[];
  reusedPaths: string[];
  /** Primary head is committed; backup repair should be retried separately. */
  backupWarning?: string;
}

export interface CloudSyncV2PublishConflict {
  status: 'conflict';
  code: 'manifest_cas_conflict';
  reason: 'head_mismatch' | 'etag_mismatch' | 'etag_unavailable' | 'write_precondition_failed';
  expectedHeadId: `commit:${string}` | null;
  actualHeadId: `commit:${string}` | null;
  expectedEtag?: string;
  actualEtag?: string;
}

export type CloudSyncV2PublishResult = CloudSyncV2PublishSuccess | CloudSyncV2PublishConflict;

export interface CloudSyncV2CleanupResult {
  deletedPaths: string[];
  retainedPaths: string[];
  skippedPaths: string[];
}

export interface CloudSyncV2ManifestBackupRepairResult {
  repaired: boolean;
  warning?: string;
}

type JsonArtifact = CloudSyncV2Checkpoint | CloudSyncV2Commit | CloudSyncV2DeltaSegment | CloudSyncV2QuarantineBundle;

interface ImmutableArtifact {
  ref: CloudSyncV2ArtifactRef;
  path: string;
  bytes: Uint8Array;
}

/**
 * Validates both the referenced bytes and, for JSON artifacts, the artifact's
 * own content-derived ID and schema. This is intentionally usable before and
 * after provider I/O.
 */
export async function validateArtifact(
  reference: CloudSyncV2ArtifactRef,
  data: Uint8Array
): Promise<CloudSyncV2ArtifactValidationResult> {
  const byteValidation = await validateCloudSyncV2ArtifactBytes(reference, data);
  if (!byteValidation.valid) {
    return {
      valid: false,
      issues: [{ code: 'invalid_bytes', message: 'Artifact bytes do not match their reference', details: byteValidation.issues }]
    };
  }

  if (reference.kind === 'blob') {
    return { valid: true, value: data, issues: [] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data));
  } catch (error) {
    return {
      valid: false,
      issues: [{ code: 'invalid_json', message: 'Artifact is not valid UTF-8 JSON', details: error }]
    };
  }

  const validation = await validateJsonArtifact(reference.kind, parsed);
  if (!validation.valid) {
    return {
      valid: false,
      issues: [{ code: 'invalid_schema', message: `Invalid ${reference.kind} artifact`, details: validation.issues }]
    };
  }

  const artifact = parsed as JsonArtifact;
  if (getArtifactId(artifact) !== reference.id) {
    return {
      valid: false,
      issues: [{ code: 'reference_mismatch', message: 'Artifact ID does not match the supplied reference' }]
    };
  }
  return { valid: true, value: artifact, issues: [] };
}

/** Reads the primary manifest, falling back to the backup when absent/corrupt. */
export async function readManifest(
  storage: CloudSyncV2ObjectStorageAdapter
): Promise<CloudSyncV2ManifestReadResult | null> {
  const primaryPath = getCloudSyncV2ManifestPath();
  const backupPath = getCloudSyncV2ManifestBackupPath();
  let primaryError: CloudSyncV2RepositoryError | undefined;

  try {
    const primary = await storage.read(primaryPath);
    if (primary) return parseManifestObject(primary, 'primary', primaryPath);
  } catch (error) {
    primaryError = normalizeManifestReadError(error, primaryPath);
  }

  try {
    const backup = await storage.read(backupPath);
    if (backup) {
      const result = parseManifestObject(backup, 'backup', backupPath);
      return primaryError ? { ...result, primaryError } : result;
    }
  } catch (error) {
    const backupError = normalizeManifestReadError(error, backupPath);
    throw new CloudSyncV2RepositoryError(
      'manifest_read_failed',
      'Neither the primary nor backup v2 manifest could be read safely',
      { details: { primaryError, backupError }, cause: backupError }
    );
  }

  if (primaryError) throw primaryError;
  return null;
}

/**
 * Publishes a migration as immutable objects followed by one atomic manifest
 * pointer update. A retry is idempotent even after the primary manifest write
 * succeeded but its response (or the backup write) was lost.
 */
export async function publishMigrationArtifacts(
  storage: CloudSyncV2ObjectStorageAdapter,
  artifacts: CloudSyncV2MigrationArtifacts,
  expectation: CloudSyncV2PublishExpectation = { headId: null }
): Promise<CloudSyncV2PublishResult> {
  assertManifestMatchesArtifacts(artifacts);
  const immutableArtifacts = getMigrationImmutableArtifacts(artifacts);
  const writtenPaths: string[] = [];
  const reusedPaths: string[] = [];

  for (const artifact of immutableArtifacts) {
    await publishImmutableArtifact(storage, artifact, writtenPaths, reusedPaths);
  }

  const desiredBytes = encodeCloudSyncV2Canonical(artifacts.manifest);
  const primaryPath = getCloudSyncV2ManifestPath();
  const primary = await readPrimaryManifest(storage);
  const actualHeadId = primary?.manifest.head?.id || null;
  const desiredHeadId = artifacts.manifest.head?.id || null;

  if (actualHeadId === desiredHeadId && primary) {
    const backupWarning = await tryWriteAndVerifyManifestBackup(storage, desiredBytes, artifacts.manifest);
    reusedPaths.push(primaryPath);
    return {
      status: 'published',
      manifest: artifacts.manifest,
      etag: primary.etag,
      manifestAlreadyPublished: true,
      writtenPaths,
      reusedPaths,
      backupWarning
    };
  }

  if (actualHeadId !== expectation.headId) {
    return publishConflict('head_mismatch', expectation, actualHeadId, primary?.etag);
  }
  if (primary && !primary.etag) {
    return publishConflict('etag_unavailable', expectation, actualHeadId, undefined);
  }
  if (primary && expectation.manifestEtag !== primary.etag) {
    return publishConflict('etag_mismatch', expectation, actualHeadId, primary.etag);
  }

  const writeResult = await storage.write(
    primaryPath,
    desiredBytes,
    primary ? { expectedEtag: expectation.manifestEtag } : { ifAbsent: true }
  );
  if (writeResult.status === 'precondition_failed') {
    const latest = await readPrimaryManifest(storage).catch(() => null);
    return publishConflict(
      'write_precondition_failed',
      expectation,
      latest?.manifest.head?.id || null,
      latest?.etag || writeResult.etag
    );
  }

  const verifiedPrimary = await readPrimaryManifest(storage);
  if (!verifiedPrimary || !bytesEqual(verifiedPrimary.object.data, desiredBytes)) {
    throw new CloudSyncV2RepositoryError(
      'manifest_read_failed',
      'The primary manifest did not match after a successful CAS write',
      { path: primaryPath }
    );
  }
  writtenPaths.push(primaryPath);
  const backupWarning = await tryWriteAndVerifyManifestBackup(storage, desiredBytes, artifacts.manifest);
  if (!backupWarning) writtenPaths.push(getCloudSyncV2ManifestBackupPath());

  return {
    status: 'published',
    manifest: artifacts.manifest,
    etag: verifiedPrimary.etag || writeResult.etag,
    manifestAlreadyPublished: false,
    writtenPaths,
    reusedPaths,
    backupWarning
  };
}

/** Repairs the backup pointer from the already-published primary head. */
export async function repairManifestBackup(
  storage: CloudSyncV2ObjectStorageAdapter
): Promise<CloudSyncV2ManifestBackupRepairResult> {
  const primary = await readPrimaryManifest(storage);
  if (!primary) {
    return { repaired: false, warning: 'primary_manifest_missing' };
  }
  const warning = await tryWriteAndVerifyManifestBackup(
    storage,
    primary.object.data,
    primary.manifest
  );
  return warning ? { repaired: false, warning } : { repaired: true };
}

/**
 * Deletes artifacts that are not reachable from the retention result. All
 * quarantine bundles, and all blobs referenced by them, are retained.
 */
export async function cleanupArtifacts(
  storage: CloudSyncV2ObjectStorageAdapter,
  retention: CloudSyncV2RetentionResult
): Promise<CloudSyncV2CleanupResult> {
  const objects = await storage.list(getCloudSyncV2DirectoryPath());
  const byPath = new Map(objects.map(object => [object.path, object]));
  const keep = new Set<string>();
  const skipped = new Set<string>();

  for (const commitId of retention.commitIds) {
    const path = getCloudSyncV2ArtifactPath('commits', commitId);
    keep.add(path);
    const commit = await readListedJsonArtifact(storage, byPath, path, 'commit') as CloudSyncV2Commit | null;
    if (!commit) continue;
    if (commit.checkpoint) keep.add(getCloudSyncV2ArtifactPath('checkpoints', commit.checkpoint.id));
    commit.deltas.forEach(ref => keep.add(getCloudSyncV2ArtifactPath('deltas', ref.id)));
    commit.blobs.forEach(ref => keep.add(getCloudSyncV2ArtifactPath('blobs', ref.id)));
    commit.quarantine.forEach(ref => keep.add(getCloudSyncV2ArtifactPath('quarantine', ref.id)));
  }
  retention.checkpointIds.forEach(id => keep.add(getCloudSyncV2ArtifactPath('checkpoints', id)));

  // Quarantine is never garbage-collected automatically. Its blob references
  // must remain reachable as well, even when no retained commit points at it.
  for (const object of objects.filter(item => classifyArtifactPath(item.path)?.directory === 'quarantine')) {
    keep.add(object.path);
    const bundle = await readListedJsonArtifact(storage, byPath, object.path, 'quarantine') as CloudSyncV2QuarantineBundle | null;
    bundle?.blobs.forEach(ref => keep.add(getCloudSyncV2ArtifactPath('blobs', ref.id)));
  }

  for (const path of [...keep]) {
    const classified = classifyArtifactPath(path);
    if (!classified || (classified.directory !== 'checkpoints' && classified.directory !== 'deltas')) continue;
    const artifact = await readListedJsonArtifact(storage, byPath, path, classified.directory === 'checkpoints' ? 'checkpoint' : 'delta');
    artifact?.blobs.forEach(ref => keep.add(getCloudSyncV2ArtifactPath('blobs', ref.id)));
  }

  const deletedPaths: string[] = [];
  const retainedPaths: string[] = [];
  for (const object of objects.sort((left, right) => left.path.localeCompare(right.path))) {
    const classified = classifyArtifactPath(object.path);
    if (!classified) {
      skipped.add(object.path);
      continue;
    }
    if (classified.directory === 'quarantine' || keep.has(object.path)) {
      retainedPaths.push(object.path);
      continue;
    }
    await storage.delete(object.path);
    deletedPaths.push(object.path);
  }

  return { deletedPaths, retainedPaths, skippedPaths: [...skipped].sort() };
}

export const publishCloudSyncV2MigrationArtifacts = publishMigrationArtifacts;
export const readCloudSyncV2Manifest = readManifest;
export const validateCloudSyncV2Artifact = validateArtifact;
export const cleanupCloudSyncV2Artifacts = cleanupArtifacts;

async function publishImmutableArtifact(
  storage: CloudSyncV2ObjectStorageAdapter,
  artifact: ImmutableArtifact,
  writtenPaths: string[],
  reusedPaths: string[]
): Promise<void> {
  const localValidation = await validateArtifact(artifact.ref, artifact.bytes);
  if (!localValidation.valid) {
    throw new CloudSyncV2RepositoryError('artifact_invalid', 'Refusing to publish an invalid artifact', {
      path: artifact.path,
      details: localValidation.issues
    });
  }

  const result = await storage.write(artifact.path, artifact.bytes, { ifAbsent: true });
  const stored = await storage.read(artifact.path);
  if (!stored) {
    throw new CloudSyncV2RepositoryError('artifact_readback_failed', 'Artifact was missing after write', {
      path: artifact.path
    });
  }
  const readbackValidation = await validateArtifact(artifact.ref, stored.data);
  if (!readbackValidation.valid || !bytesEqual(stored.data, artifact.bytes)) {
    const code = result.status === 'precondition_failed' ? 'artifact_content_conflict' : 'artifact_readback_failed';
    throw new CloudSyncV2RepositoryError(code, 'An immutable artifact path contains different content', {
      path: artifact.path,
      details: readbackValidation.issues
    });
  }
  (result.status === 'written' ? writtenPaths : reusedPaths).push(artifact.path);
}

function getMigrationImmutableArtifacts(artifacts: CloudSyncV2MigrationArtifacts): ImmutableArtifact[] {
  const result: ImmutableArtifact[] = artifacts.blobs
    .map(blob => ({
      ref: blob.ref,
      path: getCloudSyncV2ArtifactPath('blobs', blob.ref.id),
      bytes: blob.bytes
    }))
    .sort((left, right) => left.path.localeCompare(right.path));

  if (artifacts.quarantine) {
    const ref = artifacts.commit.quarantine.find(item => item.id === artifacts.quarantine!.quarantineId);
    if (!ref) throw new CloudSyncV2RepositoryError('artifact_invalid', 'Commit is missing its quarantine reference');
    result.push({
      ref,
      path: getCloudSyncV2ArtifactPath('quarantine', ref.id),
      bytes: encodeCloudSyncV2Canonical(artifacts.quarantine)
    });
  }
  if (!artifacts.commit.checkpoint) {
    throw new CloudSyncV2RepositoryError('artifact_invalid', 'Migration commit is missing its checkpoint reference');
  }
  result.push({
    ref: artifacts.commit.checkpoint,
    path: getCloudSyncV2ArtifactPath('checkpoints', artifacts.checkpoint.checkpointId),
    bytes: encodeCloudSyncV2Canonical(artifacts.checkpoint)
  });
  if (!artifacts.manifest.head) {
    throw new CloudSyncV2RepositoryError('manifest_invalid', 'Migration manifest is missing its head reference');
  }
  result.push({
    ref: artifacts.manifest.head,
    path: getCloudSyncV2ArtifactPath('commits', artifacts.commit.commitId),
    bytes: encodeCloudSyncV2Canonical(artifacts.commit)
  });
  return result;
}

function assertManifestMatchesArtifacts(artifacts: CloudSyncV2MigrationArtifacts): void {
  const validation = validateCloudSyncV2Manifest(artifacts.manifest);
  if (!validation.valid || artifacts.manifest.head?.id !== artifacts.commit.commitId) {
    throw new CloudSyncV2RepositoryError('manifest_invalid', 'Manifest does not point at the supplied commit', {
      details: validation.issues
    });
  }
  if (artifacts.commit.checkpoint?.id !== artifacts.checkpoint.checkpointId) {
    throw new CloudSyncV2RepositoryError('artifact_invalid', 'Commit does not point at the supplied checkpoint');
  }
}

async function writeAndVerifyManifestBackup(
  storage: CloudSyncV2ObjectStorageAdapter,
  bytes: Uint8Array,
  manifest: CloudSyncV2Manifest
): Promise<void> {
  const path = getCloudSyncV2ManifestBackupPath();
  try {
    const result = await storage.write(path, bytes);
    if (result.status === 'precondition_failed') throw new Error('Unexpected backup precondition failure');
    const stored = await storage.read(path);
    if (!stored || !bytesEqual(stored.data, bytes)) throw new Error('Backup manifest readback mismatch');
    const parsed = parseManifestObject(stored, 'backup', path);
    if (parsed.manifest.head?.id !== manifest.head?.id) throw new Error('Backup manifest head mismatch');
  } catch (error) {
    throw new CloudSyncV2RepositoryError('manifest_backup_failed', 'Primary manifest was published but its backup could not be verified', {
      path,
      cause: error
    });
  }
}

async function tryWriteAndVerifyManifestBackup(
  storage: CloudSyncV2ObjectStorageAdapter,
  bytes: Uint8Array,
  manifest: CloudSyncV2Manifest
): Promise<string | undefined> {
  try {
    await writeAndVerifyManifestBackup(storage, bytes, manifest);
    return undefined;
  } catch (error) {
    return error instanceof CloudSyncV2RepositoryError
      ? `${error.code}:${error.path || 'manifest.backup'}`
      : 'manifest_backup_failed';
  }
}

async function readPrimaryManifest(
  storage: CloudSyncV2ObjectStorageAdapter
): Promise<(CloudSyncV2ManifestReadResult & { object: CloudSyncV2StoredObject }) | null> {
  const path = getCloudSyncV2ManifestPath();
  const object = await storage.read(path);
  if (!object) return null;
  return { ...parseManifestObject(object, 'primary', path), object };
}

function parseManifestObject(
  object: CloudSyncV2StoredObject,
  source: 'primary' | 'backup',
  path: string
): CloudSyncV2ManifestReadResult {
  try {
    const parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(object.data));
    const validation = validateCloudSyncV2Manifest(parsed);
    if (!validation.valid) {
      throw new CloudSyncV2RepositoryError('manifest_invalid', `Invalid ${source} v2 manifest`, {
        path,
        details: validation.issues
      });
    }
    return { manifest: validation.value!, source, path, etag: object.etag };
  } catch (error) {
    if (error instanceof CloudSyncV2RepositoryError) throw error;
    throw new CloudSyncV2RepositoryError('manifest_invalid', `Invalid ${source} v2 manifest JSON`, {
      path,
      cause: error
    });
  }
}

function normalizeManifestReadError(error: unknown, path: string): CloudSyncV2RepositoryError {
  return error instanceof CloudSyncV2RepositoryError
    ? error
    : new CloudSyncV2RepositoryError('manifest_read_failed', 'Failed to read v2 manifest', { path, cause: error });
}

function publishConflict(
  reason: CloudSyncV2PublishConflict['reason'],
  expectation: CloudSyncV2PublishExpectation,
  actualHeadId: `commit:${string}` | null,
  actualEtag?: string
): CloudSyncV2PublishConflict {
  return {
    status: 'conflict',
    code: 'manifest_cas_conflict',
    reason,
    expectedHeadId: expectation.headId,
    actualHeadId,
    expectedEtag: expectation.manifestEtag,
    actualEtag
  };
}

async function validateJsonArtifact(kind: CloudSyncV2ArtifactRef['kind'], value: unknown) {
  switch (kind) {
    case 'checkpoint': return validateCloudSyncV2Checkpoint(value);
    case 'commit': return validateCloudSyncV2Commit(value);
    case 'delta': return validateCloudSyncV2DeltaSegment(value);
    case 'quarantine': return validateCloudSyncV2QuarantineBundle(value);
    case 'blob': throw new Error('Blob validation does not parse JSON');
  }
}

function getArtifactId(artifact: JsonArtifact): string {
  if ('commitId' in artifact) return artifact.commitId;
  if ('checkpointId' in artifact) return artifact.checkpointId;
  if ('segmentId' in artifact) return artifact.segmentId;
  return artifact.quarantineId;
}

async function readListedJsonArtifact(
  storage: CloudSyncV2ObjectStorageAdapter,
  byPath: Map<string, CloudSyncV2StoredObjectInfo>,
  path: string,
  kind: 'commit' | 'checkpoint' | 'delta' | 'quarantine'
): Promise<JsonArtifact | null> {
  if (!byPath.has(path)) return null;
  const object = await storage.read(path);
  if (!object) {
    throw new CloudSyncV2RepositoryError('artifact_readback_failed', 'Listed artifact disappeared during cleanup', { path });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(object.data));
  } catch (error) {
    throw new CloudSyncV2RepositoryError('artifact_invalid', 'Retained artifact is not valid JSON', { path, cause: error });
  }
  const validation = await validateJsonArtifact(kind, parsed);
  if (!validation.valid) {
    throw new CloudSyncV2RepositoryError('artifact_invalid', 'Retained artifact failed validation; cleanup aborted', {
      path,
      details: validation.issues
    });
  }
  return parsed as JsonArtifact;
}

function classifyArtifactPath(path: string): { directory: CloudSyncV2ArtifactDirectory } | null {
  const root = `${getCloudSyncV2DirectoryPath()}/`;
  if (!path.startsWith(root)) return null;
  const relative = path.slice(root.length);
  const match = relative.match(/^(commits|checkpoints|deltas|blobs|quarantine)\/[^/]+\.(json|bin)$/);
  return match ? { directory: match[1] as CloudSyncV2ArtifactDirectory } : null;
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}
