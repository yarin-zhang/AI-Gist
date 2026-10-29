import type { ICloudAvailability, ICloudUnavailableReason } from '@shared/types/cloud-backup'

type Translate = (key: string) => string

/** iCloud Drive 用不了时告诉用户怎么做：打开 iCloud Drive、安装 iCloud for Windows，或者改用 WebDAV */
export function describeICloudUnavailable(reason: ICloudUnavailableReason, t: Translate): string {
  switch (reason) {
    case 'icloud-drive-off':
      return t('icloudAvailability.driveOff')
    case 'icloud-for-windows-missing':
      return t('icloudAvailability.windowsMissing')
    case 'unsupported-platform':
      return t('icloudAvailability.unsupported')
    default:
      return t('icloudAvailability.checkFailed')
  }
}

/** 主进程只返回原因码；在这里按当前界面语言补上 reason，界面直接显示 reason */
export function localizeICloudAvailability(result: ICloudAvailability, t: Translate): ICloudAvailability {
  if (result.available || !result.reasonCode) return result
  return { ...result, reason: describeICloudUnavailable(result.reasonCode, t) }
}
