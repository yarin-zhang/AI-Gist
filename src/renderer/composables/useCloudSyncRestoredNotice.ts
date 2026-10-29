import { onMounted, onUnmounted } from 'vue'
import {
  cloudSyncService,
  getCloudSyncRestoredMessage,
  type CloudSyncResult
} from '~/lib/services/cloud-sync.service'

// 同一次同步结果只提醒一次：状态推送会反复带着同一个 lastResult，界面重新挂载也不再提醒
const notifiedResults = new WeakSet<CloudSyncResult>()

/**
 * 本机删除过的记录被另一台设备保留或修改得更晚、同步后恢复了，给用户一条提醒 (#489)。
 * 自动同步和手动同步都会走到这里：桌面端挂在状态栏的同步状态上，手机端挂在底部导航所在的主页面上，
 * 各自用平台已有的提示方式（Naive UI message / Ionic toast）显示。
 */
export function useCloudSyncRestoredNotice(present: (message: string) => void) {
  let unsubscribe: (() => void) | null = null

  onMounted(() => {
    unsubscribe = cloudSyncService.onStatusChange(status => {
      const result = status.lastResult
      if (!result || notifiedResults.has(result)) return
      notifiedResults.add(result)
      const message = getCloudSyncRestoredMessage(result.restoredAfterLocalDelete)
      if (message) present(message)
    })
  })

  onUnmounted(() => unsubscribe?.())
}
