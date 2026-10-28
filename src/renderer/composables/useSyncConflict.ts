import { ref } from 'vue'
import { cloudSyncService } from '~/lib/services/cloud-sync.service'

// 冲突弹窗在主界面只挂一份：状态栏、同步设置页都通过这里打开它
const visible = ref(false)
const storageId = ref<string>()

export function useSyncConflict() {
  const open = (id?: string) => {
    storageId.value = id || cloudSyncService.getPendingConflict()?.storageId
    visible.value = true
  }

  const close = () => {
    visible.value = false
  }

  return { visible, storageId, open, close }
}
