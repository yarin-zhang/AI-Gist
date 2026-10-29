import type { CloudSyncConflictSide } from '@shared/cloud-sync-engine'
import { formatFriendlyDate } from './date'

/** 冲突项里和时间有关的字段（桌面弹窗、手机面板共用） */
export interface ConflictVersionTimeInput {
  localUpdatedAt?: string
  remoteUpdatedAt?: string
  localDeleted: boolean
  remoteDeleted: boolean
  localDeletedAt?: string
  remoteDeletedAt?: string
}

export interface ConflictVersionTimes {
  /** 本机这一边的时间：修改时间；已删除时是删除时间。不知道时没有 */
  local?: string
  /** 云端这一边的时间，规则同上 */
  remote?: string
  /** 两边时间都知道且不相同时，时间较晚的一边；智能合并留下的就是它 */
  newer?: CloudSyncConflictSide
}

const toTime = (value?: string): number | undefined => {
  if (!value) return undefined
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? undefined : time
}

/**
 * 冲突项两边的时间说明 (#489)：
 * - 平时显示到分钟（今天 14:28）；两边落在同一分钟、到分钟看起来一样时，两边都显示到秒；
 * - 两边时间不同时标出较新的一边，「智能合并」的说明是「冲突项选更新的版本」，用户要能对上。
 * 已删除的一边用删除标记的时间，嵌在「删除于 …」里，所以「今天」不大写。
 */
export function describeConflictVersionTimes(
  item: ConflictVersionTimeInput,
  locale: string,
  now?: Date
): ConflictVersionTimes {
  const localAt = item.localDeleted ? item.localDeletedAt : item.localUpdatedAt
  const remoteAt = item.remoteDeleted ? item.remoteDeletedAt : item.remoteUpdatedAt
  const format = (value: string | undefined, deleted: boolean, withSeconds: boolean) => (
    toTime(value) === undefined
      ? undefined
      : formatFriendlyDate(value!, locale, { withTime: true, withSeconds, now, capitalize: !deleted })
  )

  let local = format(localAt, item.localDeleted, false)
  let remote = format(remoteAt, item.remoteDeleted, false)
  if (local && remote && local.toLocaleLowerCase(locale) === remote.toLocaleLowerCase(locale)) {
    local = format(localAt, item.localDeleted, true)
    remote = format(remoteAt, item.remoteDeleted, true)
  }

  const localTime = toTime(localAt)
  const remoteTime = toTime(remoteAt)
  const newer = localTime !== undefined && remoteTime !== undefined && localTime !== remoteTime
    ? (localTime > remoteTime ? 'local' : 'remote')
    : undefined

  return { local, remote, newer }
}
