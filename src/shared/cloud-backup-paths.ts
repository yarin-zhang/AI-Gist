/**
 * Shared cloud backup layout helpers.
 * Keep WebDAV, iCloud, desktop, and mobile code on one directory convention.
 */

export const CLOUD_BACKUP_DIR = 'AI-Gist-Backup';
export const CLOUD_BACKUP_MANIFEST_FILE = 'backup-manifest.json';
export const CLOUD_SYNC_MANIFEST_FILE = 'sync-manifest.json';
export const CLOUD_SYNC_MANIFEST_BACKUP_FILE = 'sync-manifest.backup.json';
export const CLOUD_SYNC_DIR = 'sync';
export const CLOUD_SYNC_SNAPSHOTS_DIR = 'snapshots';
export const CLOUD_SYNC_SNAPSHOT_FILE_EXTENSION = '.json';
export const CLOUD_SYNC_V2_DIR = 'sync-v2';
export const CLOUD_SYNC_V2_MANIFEST_FILE = 'manifest.json';
export const CLOUD_SYNC_V2_MANIFEST_BACKUP_FILE = 'manifest.backup.json';
export const CLOUD_BACKUP_FILE_PREFIX = 'backup-';
export const CLOUD_BACKUP_FILE_EXTENSION = '.json';

export function normalizeCloudPath(input = ''): string {
  const trimmed = input.trim().replace(/\\/g, '/');
  const parts = trimmed.split('/').filter(Boolean);
  return parts.length > 0 ? `/${parts.join('/')}` : '/';
}

export function joinCloudPath(...parts: (string | undefined | null)[]): string {
  return normalizeCloudPath(parts.filter(Boolean).join('/'));
}

export function getCloudBackupDirectoryPath(): string {
  return joinCloudPath(CLOUD_BACKUP_DIR);
}

export function getCloudBackupFilePath(fileName: string): string {
  return joinCloudPath(CLOUD_BACKUP_DIR, fileName);
}

export function getCloudBackupManifestPath(): string {
  return getCloudBackupFilePath(CLOUD_BACKUP_MANIFEST_FILE);
}

export function getCloudSyncManifestPath(): string {
  return getCloudBackupFilePath(CLOUD_SYNC_MANIFEST_FILE);
}

export function getCloudSyncManifestBackupPath(): string {
  return getCloudBackupFilePath(CLOUD_SYNC_MANIFEST_BACKUP_FILE);
}

export function getCloudSyncDirectoryRelativePath(): string {
  return joinCloudPath(CLOUD_SYNC_DIR).replace(/^\/+/, '');
}

export function getCloudSyncSnapshotsDirectoryRelativePath(): string {
  return joinCloudPath(CLOUD_SYNC_DIR, CLOUD_SYNC_SNAPSHOTS_DIR).replace(/^\/+/, '');
}

export function getCloudSyncSnapshotsDirectoryPath(): string {
  return joinCloudPath(CLOUD_BACKUP_DIR, CLOUD_SYNC_DIR, CLOUD_SYNC_SNAPSHOTS_DIR);
}

export function encodeCloudSyncSnapshotRevision(revision: string): string {
  return encodeURIComponent(revision).replace(/%/g, '~');
}

export function decodeCloudSyncSnapshotRevision(encodedRevision: string): string {
  return decodeURIComponent(encodedRevision.replace(/~/g, '%'));
}

export function getCloudSyncSnapshotFileName(revision: string): string {
  return `${encodeCloudSyncSnapshotRevision(revision)}${CLOUD_SYNC_SNAPSHOT_FILE_EXTENSION}`;
}

export function getCloudSyncSnapshotPath(revision: string): string {
  return joinCloudPath(
    CLOUD_BACKUP_DIR,
    CLOUD_SYNC_DIR,
    CLOUD_SYNC_SNAPSHOTS_DIR,
    getCloudSyncSnapshotFileName(revision)
  );
}

export type CloudSyncV2ArtifactDirectory = 'commits' | 'checkpoints' | 'deltas' | 'blobs' | 'quarantine';

export function getCloudSyncV2DirectoryPath(): string {
  return joinCloudPath(CLOUD_BACKUP_DIR, CLOUD_SYNC_V2_DIR);
}

export function getCloudSyncV2ManifestPath(): string {
  return joinCloudPath(getCloudSyncV2DirectoryPath(), CLOUD_SYNC_V2_MANIFEST_FILE);
}

export function getCloudSyncV2ManifestBackupPath(): string {
  return joinCloudPath(getCloudSyncV2DirectoryPath(), CLOUD_SYNC_V2_MANIFEST_BACKUP_FILE);
}

export function getCloudSyncV2ArtifactPath(
  directory: CloudSyncV2ArtifactDirectory,
  artifactId: string,
  binary = directory === 'blobs'
): string {
  const safeId = encodeURIComponent(artifactId).replace(/%/g, '~');
  return joinCloudPath(getCloudSyncV2DirectoryPath(), directory, `${safeId}${binary ? '.bin' : '.json'}`);
}

export function isCloudSyncSnapshotFileName(name: string): boolean {
  return name.endsWith(CLOUD_SYNC_SNAPSHOT_FILE_EXTENSION) &&
    name.length > CLOUD_SYNC_SNAPSHOT_FILE_EXTENSION.length;
}

export function getCloudSyncSnapshotRevisionFromFileName(name: string): string | null {
  if (!isCloudSyncSnapshotFileName(name)) {
    return null;
  }

  const encodedRevision = name.slice(0, -CLOUD_SYNC_SNAPSHOT_FILE_EXTENSION.length);
  try {
    return decodeCloudSyncSnapshotRevision(encodedRevision);
  } catch {
    return null;
  }
}

export function isCloudBackupFileName(name: string): boolean {
  return (
    name.startsWith(CLOUD_BACKUP_FILE_PREFIX) &&
    name.endsWith(CLOUD_BACKUP_FILE_EXTENSION) &&
    name !== CLOUD_BACKUP_MANIFEST_FILE
  );
}
