export interface PromptUsageRecord {
  date: string
  content: string
  variables: Record<string, any>
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

const performRecordPromptUsage = async <T>(options: RecordPromptUsageOptions<T>): Promise<T> => {
  const key = historyKey(options.promptId)
  const previousValue = localStorage.getItem(key)
  const record: PromptUsageRecord = {
    date: (options.now?.() || new Date()).toISOString(),
    content: options.content,
    variables: { ...(options.variables || {}) },
  }

  localStorage.setItem(key, JSON.stringify([
    record,
    ...parseHistory(previousValue),
  ].slice(0, 50)))

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
