/**
 * 本地数据库打不开时给用户看什么。
 *
 * base-database.service 抛出的错误带 [DATABASE_OPEN_FAILED] 这类错误码和 IndexedDB 的原始报错，
 * 只适合写日志、放进折叠的「技术详情」里。用户能做的只有两种：
 * - 升级被其他窗口占着的旧连接挡住（DATABASE_UPGRADE_BLOCKED）：关掉其他 AI Gist 窗口再重试
 * - 其他情况：重试，不行就重启 AI Gist
 */
export type DatabaseErrorKind = 'upgrade-blocked' | 'unavailable'

export interface DatabaseErrorState {
  kind: DatabaseErrorKind
  /** 原始报错，只放在折叠的技术详情里 */
  detail: string
}

type Translate = (key: string) => string

export function classifyDatabaseError(error: unknown): DatabaseErrorState {
  const detail = error instanceof Error ? error.message : String(error ?? '')
  return {
    kind: /\bDATABASE_UPGRADE_BLOCKED\b/.test(detail) ? 'upgrade-blocked' : 'unavailable',
    detail
  }
}

/** 告诉用户接下来怎么做 */
export function describeDatabaseError(state: DatabaseErrorState, t: Translate): string {
  return state.kind === 'upgrade-blocked'
    ? t('databaseStatus.upgradeBlockedHint')
    : t('databaseStatus.retryHint')
}
