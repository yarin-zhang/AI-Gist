import type { CloudSyncProgressPhase } from '../services/cloud-sync.service';

/** 同步按这个顺序走；上传只在需要时发生，走到哪一步就显示到哪一步 */
const SYNC_PROGRESS_STEPS: CloudSyncProgressPhase[] = ['export', 'read-remote', 'merge', 'apply-local', 'write-remote'];

const SYNC_PROGRESS_LABEL_KEYS: Record<CloudSyncProgressPhase, string> = {
  'export': 'syncConflict.progress.export',
  'read-remote': 'syncConflict.progress.readRemote',
  'merge': 'syncConflict.progress.merge',
  'apply-local': 'syncConflict.progress.applyLocal',
  'write-remote': 'syncConflict.progress.writeRemote'
};

/**
 * 冲突弹窗点了「应用选择」之后显示的进度：当前这一步的说明和进度条的百分比。
 * 还没收到进度（例如在等正在跑的自动同步结束）时按第一步显示。
 */
export function describeSyncProgress(phase?: CloudSyncProgressPhase): { labelKey: string; percent: number } {
  const current = phase && SYNC_PROGRESS_STEPS.includes(phase) ? phase : SYNC_PROGRESS_STEPS[0];
  const index = SYNC_PROGRESS_STEPS.indexOf(current);
  return {
    labelKey: SYNC_PROGRESS_LABEL_KEYS[current],
    // 最后一步也不到 100%：做完才关弹窗
    percent: Math.round(((index + 1) / (SYNC_PROGRESS_STEPS.length + 1)) * 100)
  };
}
