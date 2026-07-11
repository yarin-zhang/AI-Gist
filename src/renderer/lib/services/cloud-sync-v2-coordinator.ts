import type { CloudSyncDataSet } from '@shared/cloud-sync-engine';
import {
  CLOUD_SYNC_V2_DEFAULT_ACTIVE_DEVICE_DAYS,
  CLOUD_SYNC_V2_PROTOCOL_VERSION,
  isCloudSyncV2WriterAllowed,
  type CloudSyncV2DeviceAck,
  type CloudSyncV2Manifest
} from '@shared/cloud-sync-protocol-v2';
import { getCloudSyncV2ArtifactPath } from '@shared/cloud-backup-paths';
import { createCloudSyncV2MigrationArtifacts } from '@shared/cloud-sync-v2-migration';
import {
  publishMigrationArtifacts,
  repairManifestBackup,
  readManifest,
  type CloudSyncV2ObjectStorageAdapter
} from '@shared/cloud-sync-v2-repository';

const DAY_MS = 24 * 60 * 60 * 1000;
const ROLLOUT_METADATA_PREFIX = 'cloud-sync-v2-rollout:';
const QUARANTINE_METADATA_PREFIX = 'cloud-sync-v2-quarantine-index:';

export type CloudSyncV2RolloutMode = 'off' | 'shadow' | 'read-write';

export interface CloudSyncV2RolloutState {
  mode: CloudSyncV2RolloutMode;
  migrationState?: 'pending' | 'verified' | 'rebase-required' | 'failed';
  verifiedHead?: `commit:${string}`;
  lastSourceRevision?: string;
  lastV2SeenAt?: string;
  lastErrorCode?: string;
  localEpoch?: number;
  baseCommitId?: `commit:${string}`;
  backupRepairRequired?: boolean;
  updatedAt: string;
}

export interface CloudSyncV2QuarantineIndexEntry {
  quarantineId: `quarantine:${string}`;
  createdAt: string;
  sourceRevisions: string[];
  reasonCodes: string[];
  groupCount: number;
  recordCount: number;
  status: 'active' | 'replayed' | 'removed';
}

export interface CloudSyncV2MetadataStore {
  getLocalSyncMetadata?<T = unknown>(key: string): Promise<T | null>;
  setLocalSyncMetadata?<T = unknown>(key: string, value: T): Promise<void>;
}

export interface CloudSyncV2MirrorResult {
  status: 'skipped' | 'published' | 'already-current' | 'rebase-required' | 'failed';
  warning?: string;
  headId?: `commit:${string}`;
}

export interface CloudSyncV2DeviceFreshnessResult {
  safe: boolean;
  reason?: 'device-inactive' | 'epoch-behind' | 'base-unavailable';
  inactiveDays?: number;
}

export interface CloudSyncV2CoordinatorDeps {
  database: CloudSyncV2MetadataStore;
  storageFactory: (storageId: string) => CloudSyncV2ObjectStorageAdapter | null;
  now?: () => Date;
}

export function evaluateCloudSyncV2DeviceFreshness(input: {
  manifest: CloudSyncV2Manifest;
  deviceId: string;
  localEpoch?: number;
  baseCommitAvailable?: boolean;
  now?: Date;
  activeDeviceDays?: number;
}): CloudSyncV2DeviceFreshnessResult {
  if (input.localEpoch !== undefined && input.localEpoch < input.manifest.epoch) {
    return { safe: false, reason: 'epoch-behind' };
  }
  if (input.baseCommitAvailable === false) {
    return { safe: false, reason: 'base-unavailable' };
  }

  const ack: CloudSyncV2DeviceAck | undefined = input.manifest.deviceAcks[input.deviceId];
  if (!ack && input.manifest.head) return { safe: false, reason: 'device-inactive' };
  if (!ack) return { safe: true };
  const nowMs = (input.now || new Date()).getTime();
  const lastSeenMs = Date.parse(ack.lastSeenAt);
  if (!Number.isFinite(lastSeenMs)) return { safe: false, reason: 'device-inactive' };
  const inactiveDays = (nowMs - lastSeenMs) / DAY_MS;
  if (inactiveDays > (input.activeDeviceDays ?? CLOUD_SYNC_V2_DEFAULT_ACTIVE_DEVICE_DAYS)) {
    return { safe: false, reason: 'device-inactive', inactiveDays };
  }
  return { safe: true, inactiveDays: Math.max(0, inactiveDays) };
}

export class CloudSyncV2Coordinator {
  private readonly database: CloudSyncV2MetadataStore;
  private readonly storageFactory: CloudSyncV2CoordinatorDeps['storageFactory'];
  private readonly now: () => Date;

  constructor(deps: CloudSyncV2CoordinatorDeps) {
    this.database = deps.database;
    this.storageFactory = deps.storageFactory;
    this.now = deps.now || (() => new Date());
  }

  async getRolloutState(storageId: string): Promise<CloudSyncV2RolloutState> {
    const stored = await this.database.getLocalSyncMetadata?.<CloudSyncV2RolloutState>(
      `${ROLLOUT_METADATA_PREFIX}${storageId}`
    );
    return normalizeRolloutState(stored, this.now().toISOString());
  }

  async setRolloutMode(storageId: string, mode: CloudSyncV2RolloutMode): Promise<CloudSyncV2RolloutState> {
    if (mode === 'read-write') {
      throw new Error('协议 v2 read-write 尚未开放；请先完成安全重建和全链读取验证');
    }
    const current = await this.getRolloutState(storageId);
    const next = { ...current, mode, updatedAt: this.now().toISOString() };
    await this.saveRolloutState(storageId, next);
    return next;
  }

  async getQuarantineIndex(storageId: string): Promise<CloudSyncV2QuarantineIndexEntry[]> {
    return await this.database.getLocalSyncMetadata?.<CloudSyncV2QuarantineIndexEntry[]>(
      `${QUARANTINE_METADATA_PREFIX}${storageId}`
    ) || [];
  }

  async mirrorSuccessfulV1Sync(input: {
    storageId: string;
    revision: string;
    deviceId: string;
    exportData: () => Promise<CloudSyncDataSet>;
  }): Promise<CloudSyncV2MirrorResult> {
    const rollout = await this.getRolloutState(input.storageId);
    if (rollout.mode === 'off') return { status: 'skipped' };
    const storage = this.storageFactory(input.storageId);
    if (!storage) {
      return this.recordFailure(input.storageId, rollout, 'transport_unavailable', 'v2 存储传输层不可用');
    }

    if (rollout.lastSourceRevision === input.revision && rollout.verifiedHead) {
      if (!rollout.backupRepairRequired) {
        return { status: 'already-current', headId: rollout.verifiedHead };
      }
      try {
        const repair = await repairManifestBackup(storage);
        if (repair.repaired) {
          await this.saveRolloutState(input.storageId, {
            ...rollout,
            backupRepairRequired: false,
            updatedAt: this.now().toISOString()
          });
          return { status: 'already-current', headId: rollout.verifiedHead };
        }
        return {
          status: 'already-current',
          headId: rollout.verifiedHead,
          warning: 'v2 主 manifest 已提交，但备用 manifest 修复仍未完成'
        };
      } catch {
        return {
          status: 'already-current',
          headId: rollout.verifiedHead,
          warning: 'v2 主 manifest 已提交，但备用 manifest 修复仍未完成'
        };
      }
    }

    try {
      const current = await readManifest(storage);
      if (current) {
        if (!isCloudSyncV2WriterAllowed(current.manifest, CLOUD_SYNC_V2_PROTOCOL_VERSION)) {
          return this.recordFailure(
            input.storageId,
            rollout,
            'unsupported_writer_protocol',
            `v2 云端要求 writer protocol ${current.manifest.minWriterProtocol}，当前版本已拒绝写入`
          );
        }
        const baseCommitAvailable = rollout.baseCommitId
          ? !!(await storage.read(getCloudSyncV2ArtifactPath('commits', rollout.baseCommitId)))
          : false;
        const freshness = evaluateCloudSyncV2DeviceFreshness({
          manifest: current.manifest,
          deviceId: input.deviceId,
          localEpoch: rollout.localEpoch,
          baseCommitAvailable
        });
        if (!freshness.safe) {
          await this.saveRolloutState(input.storageId, {
            ...rollout,
            migrationState: 'rebase-required',
            lastV2SeenAt: this.now().toISOString(),
            updatedAt: this.now().toISOString()
          });
          return {
            status: 'rebase-required',
            warning: `v2 已拒绝旧基线发布：${freshness.reason || '需要安全重建'}`
          };
        }
      }

      const createdAt = this.now().toISOString();
      const data = await input.exportData();
      const artifacts = await createCloudSyncV2MigrationArtifacts({
        data,
        revision: input.revision,
        deviceId: input.deviceId,
        epoch: current?.manifest.epoch || 1,
        createdAt,
        parents: current?.manifest.head ? [current.manifest.head] : []
      });
      if (current) {
        artifacts.manifest.deviceAcks = {
          ...current.manifest.deviceAcks,
          ...artifacts.manifest.deviceAcks
        };
        artifacts.manifest.minWriterProtocol = current.manifest.minWriterProtocol;
      }
      const publishResult = await publishMigrationArtifacts(storage, artifacts, {
        headId: current?.manifest.head?.id || null,
        manifestEtag: current?.source === 'primary' ? current.etag : undefined
      });
      if (publishResult.status === 'conflict') {
        return this.recordFailure(
          input.storageId,
          rollout,
          'manifest_cas_conflict',
          'v2 manifest 被其他设备并发更新，本次影子发布已安全取消'
        );
      }

      const verified = await readManifest(storage);
      if (!verified?.manifest.head || verified.manifest.head.id !== artifacts.commit.commitId) {
        return this.recordFailure(input.storageId, rollout, 'readback_mismatch', 'v2 发布后读回校验失败');
      }

      await this.saveRolloutState(input.storageId, {
        ...rollout,
        migrationState: 'verified',
        verifiedHead: artifacts.commit.commitId,
        lastSourceRevision: input.revision,
        lastV2SeenAt: createdAt,
        lastErrorCode: undefined,
        localEpoch: artifacts.manifest.epoch,
        baseCommitId: artifacts.commit.commitId,
        backupRepairRequired: !!publishResult.backupWarning,
        updatedAt: createdAt
      });
      if (artifacts.quarantine) {
        await this.upsertQuarantineIndex(input.storageId, {
          quarantineId: artifacts.quarantine.quarantineId,
          createdAt: artifacts.quarantine.createdAt,
          sourceRevisions: artifacts.quarantine.sourceRevisions,
          reasonCodes: artifacts.quarantine.reasonCodes,
          groupCount: artifacts.quarantine.groups.length,
          recordCount: artifacts.quarantine.groups.reduce((sum, group) => sum + group.records.length, 0),
          status: 'active'
        });
      }
      return {
        status: 'published',
        headId: artifacts.commit.commitId,
        warning: publishResult.backupWarning
          ? 'v2 主 manifest 已提交，但备用 manifest 尚未修复；下次影子同步会重试'
          : undefined
      };
    } catch (error) {
      const code = typeof error === 'object' && error && 'code' in error
        ? String((error as any).code)
        : 'v2_shadow_failed';
      return this.recordFailure(
        input.storageId,
        rollout,
        code,
        `v2 影子发布失败（${code}）；v1 同步结果不受影响，可稍后重试`
      );
    }
  }

  private async upsertQuarantineIndex(
    storageId: string,
    entry: CloudSyncV2QuarantineIndexEntry
  ): Promise<void> {
    const current = await this.getQuarantineIndex(storageId);
    const next = [entry, ...current.filter(item => item.quarantineId !== entry.quarantineId)];
    await this.database.setLocalSyncMetadata?.(`${QUARANTINE_METADATA_PREFIX}${storageId}`, next);
  }

  private async recordFailure(
    storageId: string,
    rollout: CloudSyncV2RolloutState,
    code: string,
    warning: string
  ): Promise<CloudSyncV2MirrorResult> {
    try {
      await this.saveRolloutState(storageId, {
        ...rollout,
        migrationState: 'failed',
        lastErrorCode: code,
        updatedAt: this.now().toISOString()
      });
    } catch {
      // A failure to record shadow state must never escape into the v1 result.
    }
    return { status: 'failed', warning };
  }

  private async saveRolloutState(storageId: string, state: CloudSyncV2RolloutState): Promise<void> {
    await this.database.setLocalSyncMetadata?.(`${ROLLOUT_METADATA_PREFIX}${storageId}`, state);
  }
}

function normalizeRolloutState(
  value: CloudSyncV2RolloutState | null | undefined,
  now: string
): CloudSyncV2RolloutState {
  if (!value || !['off', 'shadow'].includes(value.mode)) {
    return { mode: 'off', updatedAt: now };
  }
  return { ...value, updatedAt: value.updatedAt || now };
}
