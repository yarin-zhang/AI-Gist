export const AUTO_BACKUP_RETENTION_SETTING_KEY = 'cloud.backup.auto.retention';
export const DEFAULT_AUTO_BACKUP_RETENTION = 20;
export const MIN_AUTO_BACKUP_RETENTION = 1;
export const MAX_AUTO_BACKUP_RETENTION = 100;

export function normalizeAutomaticBackupRetention(retention: number): number {
  if (!Number.isFinite(retention)) return DEFAULT_AUTO_BACKUP_RETENTION;
  return Math.min(
    MAX_AUTO_BACKUP_RETENTION,
    Math.max(MIN_AUTO_BACKUP_RETENTION, Math.round(retention))
  );
}
