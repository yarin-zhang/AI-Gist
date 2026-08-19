/**
 * 数据同步横幅（NAlert）的标题和颜色语义共享的判断逻辑。
 *
 * 之前 DataSyncSettings.vue 里 statusTitle 和 statusAlertType 是两份各自维护的
 * if/else 分支，容易在改动其中一份时忘记同步另一份——例如 pendingChanges 的
 * 检查曾经只在 statusAlertType 里被限定为"仅当 status === 'scheduled' 时才生效"，
 * 而 statusTitle 里是无条件检查。结果是：如果用户同时启用了多个云存储（比如
 * WebDAV + iCloud），针对其中一个存储点"Sync Now"成功后 status 会变成
 * 'success'，但只要还有其他存储没同步完，pendingChanges 仍然是 true——此时标题
 * 显示"等待同步"，横幅颜色却错误地显示成功绿色，很容易让用户误以为已经全部
 * 同步完成。
 *
 * 这里把"当前属于哪一类状态"统一成一个 kind，标题文案和横幅颜色都必须从这个
 * 唯一的 kind 派生，不能各自维护一份判断顺序，从结构上避免两者再次出现分歧。
 */
export type DataSyncStatusKind =
    | 'retryScheduled'
    | 'error'
    | 'paused'
    | 'syncing'
    | 'pending'
    | 'current'
    | 'ready'
    | 'notConfigured';

export interface DataSyncStatusInput {
    /** 同步失败后已被安排自动重试（error 状态的一个子情形，优先级最高）。 */
    hasScheduledRetry: boolean;
    /** 当前 syncStatus.status 是否为 'error'。 */
    isError: boolean;
    /** error 诊断是否判定为"会自动恢复的临时状况"（警告色而不是错误色）。 */
    canAutoRetryError: boolean;
    autoSyncEnabled: boolean;
    /** 当前 syncStatus.status 是否为 'syncing'。 */
    isSyncing: boolean;
    /** 是否存在尚未同步的本地变更——必须无条件参与判断，不能只在某个 status 下才生效。 */
    pendingChanges: boolean;
    /** 是否存在过至少一次成功的同步（lastSyncAt 或 lastResult.success）。 */
    hasSucceededBefore: boolean;
    hasStorageConfigs: boolean;
}

export function resolveDataSyncStatusKind(input: DataSyncStatusInput): DataSyncStatusKind {
    if (input.hasScheduledRetry) return 'retryScheduled';
    if (input.isError) return 'error';
    if (!input.autoSyncEnabled) return 'paused';
    if (input.isSyncing) return 'syncing';
    if (input.pendingChanges) return 'pending';
    if (input.hasSucceededBefore) return 'current';
    return input.hasStorageConfigs ? 'ready' : 'notConfigured';
}

const ALERT_TYPE_BY_KIND: Record<Exclude<DataSyncStatusKind, 'error'>, 'success' | 'info' | 'warning'> = {
    retryScheduled: 'warning',
    paused: 'warning',
    syncing: 'info',
    pending: 'info',
    current: 'success',
    ready: 'info',
    notConfigured: 'info',
};

export function resolveDataSyncAlertType(
    kind: DataSyncStatusKind,
    canAutoRetryError: boolean,
): 'success' | 'info' | 'warning' | 'error' {
    if (kind === 'error') return canAutoRetryError ? 'warning' : 'error';
    return ALERT_TYPE_BY_KIND[kind];
}
