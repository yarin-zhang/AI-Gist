export const CLOUD_RETENTION_DELETE_GRACE_MS = 10 * 60 * 1000;

export interface CloudRetentionCandidate {
  key: string;
  createdAt?: string;
  modifiedAt?: string;
  protected?: boolean;
}

export interface CloudRetentionPlan<T extends CloudRetentionCandidate> {
  retained: T[];
  deleted: T[];
  deferred: T[];
}

export interface CloudRetentionPlanOptions {
  now?: Date | number;
  deletionGraceMs?: number;
}

export function planCloudRetention<T extends CloudRetentionCandidate>(
  candidates: T[],
  retention: number,
  options: CloudRetentionPlanOptions = {}
): CloudRetentionPlan<T> {
  const limit = Math.max(1, Math.round(retention));
  const now = options.now instanceof Date
    ? options.now.getTime()
    : typeof options.now === 'number'
      ? options.now
      : Date.now();
  const deletionGraceMs = Math.max(0, options.deletionGraceMs ?? CLOUD_RETENTION_DELETE_GRACE_MS);
  const unique = new Map<string, T>();
  const protectedKeys = new Set(
    candidates.filter(candidate => candidate.protected).map(candidate => candidate.key)
  );

  for (const candidate of candidates) {
    const existing = unique.get(candidate.key);
    if (!existing || compareCloudRetentionCandidatesDescending(candidate, existing) < 0) {
      unique.set(candidate.key, candidate);
    }
  }

  const sorted = [...unique.values()].sort(compareCloudRetentionCandidatesDescending);
  const retainedKeys = new Set(
    sorted.filter(candidate => protectedKeys.has(candidate.key)).map(candidate => candidate.key)
  );

  for (const candidate of sorted) {
    if (retainedKeys.size >= limit) break;
    retainedKeys.add(candidate.key);
  }

  const retained: T[] = [];
  const deleted: T[] = [];
  const deferred: T[] = [];
  for (const candidate of sorted) {
    if (retainedKeys.has(candidate.key)) {
      retained.push(candidate);
      continue;
    }

    const timestamp = getCloudRetentionCandidateTime(candidate);
    if (timestamp > 0 && now - timestamp < deletionGraceMs) {
      deferred.push(candidate);
      continue;
    }
    deleted.push(candidate);
  }

  return { retained, deleted, deferred };
}

export function compareCloudRetentionCandidatesDescending(
  left: CloudRetentionCandidate,
  right: CloudRetentionCandidate
): number {
  const timeDifference = getCloudRetentionCandidateTime(right) - getCloudRetentionCandidateTime(left);
  return timeDifference !== 0 ? timeDifference : right.key.localeCompare(left.key);
}

export function getCloudRetentionCandidateTime(candidate: CloudRetentionCandidate): number {
  const modifiedAt = parseCloudRetentionTime(candidate.modifiedAt);
  if (modifiedAt > 0) return modifiedAt;
  const createdAt = parseCloudRetentionTime(candidate.createdAt);
  if (createdAt > 0) return createdAt;
  return getCloudRevisionTimestamp(candidate.key);
}

export function getCloudRevisionTimestamp(revision: string): number {
  const match = String(revision || '').match(/^(\d{10,})/);
  if (!match) return 0;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function parseCloudRetentionTime(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
