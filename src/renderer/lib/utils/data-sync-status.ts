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
    | 'conflict'
    | 'restorePaused'
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
    /** 是否有已启用的云端存储；没有时其他状态都不作数，只显示「未开启同步」。 */
    hasStorageConfigs: boolean;
    /** 两边都改过的数据在等用户选择处理方式（同步已暂停发布）。 */
    hasPendingConflict?: boolean;
    /** 从备份恢复后，在等用户选择覆盖云端还是与云端合并；选好之前不会同步。 */
    hasRestoreDecision?: boolean;
}

export function resolveDataSyncStatusKind(input: DataSyncStatusInput): DataSyncStatusKind {
    // 没有可用的存储时什么都不会同步：本地变更、下次检查、上次同步结果都不该再露出来 (#425)
    if (!input.hasStorageConfigs) return 'notConfigured';
    // 恢复后同步整个停着：之前的失败、重试和下次检查都不作数，只等用户选择
    if (input.hasRestoreDecision) return 'restorePaused';
    if (input.hasScheduledRetry) return 'retryScheduled';
    if (input.isError) return 'error';
    if (input.hasPendingConflict) return 'conflict';
    if (!input.autoSyncEnabled) return 'paused';
    if (input.isSyncing) return 'syncing';
    if (input.pendingChanges) return 'pending';
    if (input.hasSucceededBefore) return 'current';
    return 'ready';
}

/** 同步服务状态里参与判断的字段（结构类型，这里不依赖整个同步服务） */
export interface DataSyncStatusSnapshot {
    status: string;
    pending?: boolean;
    nextSyncAt?: string;
    lastSyncAt?: string;
    lastResult?: { success?: boolean };
    pendingChanges?: boolean;
    autoSyncEnabled?: boolean;
    hasEnabledStorage?: boolean;
    restoreDecisionPending?: boolean;
}

/**
 * 设置页的状态卡片和窗口底部的状态栏都从这里把同步服务的状态转成判断输入，
 * 两处对「有没有存储」「本地变更算不算待同步」的理解必须一致，不能各写一份 (#425)。
 * 调用方手里有更新的存储列表或自动同步开关时，以调用方传入的为准。
 */
export function createDataSyncStatusInput(
    snapshot: DataSyncStatusSnapshot,
    context: {
        canAutoRetryError: boolean;
        /** 失败是应用自己会恢复、用户做不了什么的那类（诊断的 quiet）：显示成等待下次同步，不报失败 */
        quietError?: boolean;
        hasStorageConfigs?: boolean;
        autoSyncEnabled?: boolean;
    },
): DataSyncStatusInput {
    const failed = snapshot.status === 'error';
    const isError = failed && !context.quietError;
    return {
        hasScheduledRetry: isError && !!snapshot.pending && !!snapshot.nextSyncAt,
        isError,
        canAutoRetryError: context.canAutoRetryError,
        autoSyncEnabled: context.autoSyncEnabled ?? snapshot.autoSyncEnabled ?? true,
        isSyncing: snapshot.status === 'syncing',
        pendingChanges: !!snapshot.pendingChanges || (failed && !isError),
        hasSucceededBefore: !!(snapshot.lastSyncAt || snapshot.lastResult?.success),
        // 还没查过存储列表时按「有存储」处理，避免启动瞬间闪一下「未开启同步」
        hasStorageConfigs: context.hasStorageConfigs ?? snapshot.hasEnabledStorage ?? true,
        hasPendingConflict: snapshot.status === 'conflict',
        hasRestoreDecision: !!snapshot.restoreDecisionPending,
    };
}

const ALERT_TYPE_BY_KIND: Record<Exclude<DataSyncStatusKind, 'error'>, 'success' | 'info' | 'warning'> = {
    retryScheduled: 'warning',
    conflict: 'warning',
    restorePaused: 'warning',
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

/**
 * 诊断失败原因时用的来源：最近一次失败的同步结果优先（带错误码和结构化诊断），
 * 否则用状态里记下的错误文字。自动重试安排好之后 lastResult 可能还是更早的成功结果，
 * 不能拿它来诊断。状态卡片和状态栏都用这一个来源，判断出的严重程度才会一致。
 */
export function getDataSyncErrorSource<TResult extends { success?: boolean; error?: string }>(
    snapshot: { error?: string; lastResult?: TResult },
): TResult | string | undefined {
    if (snapshot.lastResult && snapshot.lastResult.success === false) return snapshot.lastResult;
    return snapshot.error || snapshot.lastResult?.error;
}
