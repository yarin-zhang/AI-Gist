import { onMounted, onUnmounted } from 'vue'
import {
  cloudSyncService,
  type CloudSyncResult
} from '~/lib/services/cloud-sync.service'
import { getCloudSyncResultNotices } from '~/lib/utils/cloud-sync-merge-notices'

// 同一次同步结果只提醒一次：状态推送会反复带着同一个 lastResult，界面重新挂载也不再提醒
const notifiedResults = new WeakSet<CloudSyncResult>()

/**
 * 同步后要让用户知道的变化（本机删除过的记录恢复了 (#489)、提示词移到了「未分类」、同名分类保留了哪一边、
 * 覆盖云端前做了备份），每次同步结果提醒一次。自动同步和手动同步都会走到这里：
 * 桌面端挂在状态栏的同步状态上，手机端挂在底部导航所在的主页面上，各自用平台已有的提示方式显示。
 */
export function useCloudSyncResultNotices(present: (messages: string[]) => void) {
  let unsubscribe: (() => void) | null = null

  onMounted(() => {
    unsubscribe = cloudSyncService.onStatusChange(status => {
      const result = status.lastResult
      if (!result || notifiedResults.has(result)) return
      notifiedResults.add(result)
      const messages = getCloudSyncResultNotices(result)
      if (messages.length > 0) present(messages)
    })
  })

  onUnmounted(() => unsubscribe?.())
}
