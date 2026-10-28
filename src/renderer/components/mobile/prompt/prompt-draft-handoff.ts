/**
 * AI 生成页「编辑后保存」把生成结果交给新建页：只放在内存里，不经过路由参数。
 * 新建页打开时取走草稿；保存成功后回写新提示词的 id，生成页返回时据此标记为已保存。
 */
export interface PromptDraftHandoff {
  title: string
  description: string
  content: string
  tags: string[]
  categoryId: number | null
}

let pendingDraft: PromptDraftHandoff | null = null
let savedPromptId: number | null = null

export function offerPromptDraft(draft: PromptDraftHandoff) {
  pendingDraft = { ...draft, tags: [...draft.tags] }
  savedPromptId = null
}

/** 新建页调用：取走待编辑的草稿（只能取一次） */
export function takePromptDraft(): PromptDraftHandoff | null {
  const draft = pendingDraft
  pendingDraft = null
  return draft
}

/** 新建页保存了交接来的草稿 */
export function reportDraftSaved(promptId: number) {
  savedPromptId = promptId
}

/** 生成页调用：取走刚保存的提示词 id（只能取一次） */
export function takeSavedDraftId(): number | null {
  const id = savedPromptId
  savedPromptId = null
  return id
}
