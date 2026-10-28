import type { PromptWithRelations } from '@shared/types/database'
import { api } from '@/lib/api'
import { buildHistoryRecord, createEditorForm, historyMatchesPrompt, serializeVariablesForSave } from './prompt-editor'

/**
 * 写版本历史（桌面提示词页和移动端编辑页共用）：每一版记的是保存后的完整内容，
 * 最新一版就是当前版本，新建时记下 v1。
 * 保存前的内容不在历史里时（升级前没有版本记录，或在命令行、别的设备上改过），
 * 先把保存前的内容补记成一版，保证任何一次保存之前的内容都能找回来。
 *
 * 只在保存成功后调用，保存失败不会留下一条没生效的版本。写入失败不影响保存本身。
 */
export async function writePromptHistory(
  prompt: PromptWithRelations,
  variables: unknown[],
  changeDescription: string,
  options: {
    /** 保存前的提示词；新建时不传 */
    previous?: PromptWithRelations
    /** 补记「保存前的内容」那一版时的说明（界面语言） */
    beforeEditDescription: string
  },
): Promise<void> {
  if (!prompt.id) return
  const { previous, beforeEditDescription } = options
  try {
    const histories = await api.promptHistories.getByPromptId.query(prompt.id)
    let version = histories.reduce((max, item) => Math.max(max, item.version || 0), 0)
    const latest = histories.find(item => item.version === version)
    if (previous && !historyMatchesPrompt(latest, previous)) {
      version += 1
      const savedAt = new Date(previous.updatedAt)
      await api.promptHistories.create.mutate(buildHistoryRecord(
        { ...previous, id: prompt.id },
        serializeVariablesForSave(createEditorForm(previous)),
        version,
        beforeEditDescription,
        Number.isNaN(savedAt.getTime()) ? new Date() : savedAt,
      ))
    }
    await api.promptHistories.create.mutate(buildHistoryRecord(
      { ...prompt, id: prompt.id },
      variables,
      version + 1,
      changeDescription,
    ))
  } catch (error) {
    // 版本表缺失或写入失败不影响保存本身
    console.warn('创建历史记录失败，但不影响主流程', error)
  }
}
