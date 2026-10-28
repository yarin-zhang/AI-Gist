export interface PromptUsageRecord {
  date: string
  content: string
  variables: Record<string, any>
  /** 同样的值连续复制时合并成一条，记下一共复制了几次；没有这个字段就是一次 */
  count?: number
}

interface RecordPromptUsageOptions<T> {
  promptId: number
  content: string
  variables?: Record<string, any>
  incrementUseCount: (promptId: number) => Promise<T>
  now?: () => Date
}

const usageQueues = new Map<number, Promise<unknown>>()

const historyKey = (promptId: number) => `prompt_history_${promptId}`

const parseHistory = (value: string | null): PromptUsageRecord[] => {
  if (!value) return []
  try {
    const records = JSON.parse(value)
    return Array.isArray(records) ? records : []
  } catch {
    return []
  }
}

export const readPromptUsageHistory = (promptId: number): PromptUsageRecord[] => (
  parseHistory(localStorage.getItem(historyKey(promptId)))
)

const valuesKey = (values: Record<string, any> = {}) => JSON.stringify(
  Object.keys(values).sort().map(name => [name, values[name]]),
)

/** 和最近一条的正文、填写值都一样：连续复制同一组值，合并成一条 */
const isRepeatOf = (record: PromptUsageRecord, latest: PromptUsageRecord | undefined) => (
  latest !== undefined && latest.content === record.content && valuesKey(latest.variables) === valuesKey(record.variables)
)

const performRecordPromptUsage = async <T>(options: RecordPromptUsageOptions<T>): Promise<T> => {
  const key = historyKey(options.promptId)
  const previousValue = localStorage.getItem(key)
  const record: PromptUsageRecord = {
    date: (options.now?.() || new Date()).toISOString(),
    content: options.content,
    variables: { ...(options.variables || {}) },
  }

  const history = parseHistory(previousValue)
  const next = isRepeatOf(record, history[0])
    ? [{ ...record, count: (history[0].count || 1) + 1 }, ...history.slice(1)]
    : [record, ...history]
  localStorage.setItem(key, JSON.stringify(next.slice(0, 50)))

  try {
    return await options.incrementUseCount(options.promptId)
  } catch (error) {
    if (previousValue === null) localStorage.removeItem(key)
    else localStorage.setItem(key, previousValue)
    throw error
  }
}

export const recordPromptUsage = <T>(options: RecordPromptUsageOptions<T>): Promise<T> => {
  const previous = (usageQueues.get(options.promptId) || Promise.resolve()).catch(() => undefined)
  const operation = previous.then(() => performRecordPromptUsage(options))
  usageQueues.set(options.promptId, operation)
  void operation.finally(() => {
    if (usageQueues.get(options.promptId) === operation) usageQueues.delete(options.promptId)
  }).catch(() => undefined)
  return operation
}

/** 删除一条使用记录（按记录时间找），返回剩下的记录 */
export const deletePromptUsageRecord = (promptId: number, date: string): PromptUsageRecord[] => {
  const next = readPromptUsageHistory(promptId).filter(record => record.date !== date)
  if (next.length) localStorage.setItem(historyKey(promptId), JSON.stringify(next))
  else localStorage.removeItem(historyKey(promptId))
  return next
}

/** 清空这条提示词的全部使用记录；使用次数不变 */
export const clearPromptUsageHistory = (promptId: number): void => {
  localStorage.removeItem(historyKey(promptId))
}

/** 最近一次复制时的填写值，打开提示词时用来预填 */
export const getLastUsedValues = (promptId: number): Record<string, any> => (
  readPromptUsageHistory(promptId)[0]?.variables || {}
)

const HISTORY_KEY_PATTERN = /^prompt_history_\d+$/

/** 今天一共复制了多少次（所有提示词合计），用于移动端列表的副标题 */
export const countPromptUsageToday = (now = new Date()): number => {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  let count = 0
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index)
    if (!key || !HISTORY_KEY_PATTERN.test(key)) continue
    count += parseHistory(localStorage.getItem(key))
      .filter(record => new Date(record.date).getTime() >= start)
      .reduce((total, record) => total + (record.count || 1), 0)
  }
  return count
}
