import type { PromptWithRelations } from '@shared/types/database'
import { getTagsArray } from './tag-colors'
import type { EditablePromptVariable } from './prompt-template'

/** 原地编辑一条提示词时的表单状态；新建草稿也用同一份结构 */
export interface PromptEditorForm {
  title: string
  description: string
  content: string
  categoryId: number | null
  tags: string[]
  variables: EditablePromptVariable[]
  isJinjaTemplate: boolean
  imageBlobs: Blob[]
}

const cloneVariable = (variable: EditablePromptVariable): EditablePromptVariable => ({
  ...variable,
  options: variable.options ? [...variable.options] : [],
})

const normalizeOptions = (options: unknown): string[] => {
  if (Array.isArray(options)) return options.map(String)
  if (typeof options === 'string') return options.split(',').map(option => option.trim()).filter(Boolean)
  return []
}

export function createEditorForm(prompt?: Partial<PromptWithRelations> | null): PromptEditorForm {
  return {
    title: prompt?.title || '',
    description: prompt?.description || '',
    content: prompt?.content || '',
    categoryId: prompt?.categoryId || null,
    tags: getTagsArray(prompt?.tags as string | string[] | undefined),
    variables: (prompt?.variables || []).map(variable => ({
      name: variable.name || '',
      type: variable.type || 'text',
      options: normalizeOptions(variable.options),
      defaultValue: variable.defaultValue || '',
      required: variable.required !== false,
      placeholder: variable.placeholder || '',
      description: variable.description || '',
    })),
    isJinjaTemplate: Boolean(prompt?.isJinjaTemplate),
    imageBlobs: Array.isArray(prompt?.imageBlobs) ? [...prompt.imageBlobs] : [],
  }
}

export function cloneEditorForm(form: PromptEditorForm): PromptEditorForm {
  return {
    ...form,
    tags: [...form.tags],
    variables: form.variables.map(cloneVariable),
    imageBlobs: [...form.imageBlobs],
  }
}

/** 用来判断有没有未保存修改的快照；includeVariables=false 用于识别「只是自动补全了变量」 */
export function snapshotEditorForm(form: PromptEditorForm, includeVariables = true): string {
  return JSON.stringify({
    title: form.title,
    description: form.description,
    content: form.content,
    categoryId: form.categoryId ?? null,
    tags: [...form.tags].sort(),
    variables: includeVariables
      ? form.variables.map(variable => ({
        name: variable.name || '',
        type: variable.type || 'text',
        options: (variable.options || []).map(option => option || ''),
        defaultValue: variable.defaultValue || '',
        required: variable.required !== false,
        placeholder: variable.placeholder || '',
        description: variable.description || '',
      }))
      : undefined,
    isJinjaTemplate: form.isJinjaTemplate,
    images: form.imageBlobs.map(blob => ({ size: blob.size, type: blob.type })),
  })
}

/** 模板语法换成纯文字：{{变量}} 只留变量名，Jinja 的 {% … %}、{# … #} 标记去掉 */
export function plainTemplateText(text: string): string {
  return text
    .replace(/\{\{\s*([^{}]*?)\s*\}\}/g, '$1')
    .replace(/\{%[\s\S]*?%\}|\{#[\s\S]*?#\}/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const AUTO_TITLE_MAX = 30

/** 没填标题时取正文第一行有字的内容，去掉变量语法，最多 30 个字；桌面和移动端共用 */
export function generateAutoTitle(content: string, fallback: string): string {
  const line = (content || '').split('\n').map(plainTemplateText).find(Boolean) || ''
  if (!line) return fallback
  return line.length > AUTO_TITLE_MAX ? `${line.slice(0, AUTO_TITLE_MAX)}…` : line
}

/** 和这个标题相同（忽略首尾空白）的其他提示词；标题允许重复，只用来在保存前提醒 */
export function findDuplicateTitle<T extends { id?: number; title: string }>(
  title: string,
  existing: T[],
  selfId?: number,
): T | undefined {
  const normalized = title.trim()
  if (!normalized) return undefined
  return existing.find(prompt => prompt.id !== selfId && (prompt.title || '').trim() === normalized)
}

/** 保存时写入的变量定义：去掉空名字，只有选项类型才保留选项 */
export function serializeVariablesForSave(form: PromptEditorForm) {
  return form.variables
    .filter(variable => variable.name)
    .map(variable => ({
      name: variable.name,
      type: variable.type,
      options: !form.isJinjaTemplate && variable.type === 'select' && variable.options?.length
        ? variable.options.filter(option => option.trim())
        : undefined,
      defaultValue: variable.defaultValue || undefined,
      required: variable.required,
      placeholder: variable.placeholder || undefined,
      description: variable.description || undefined,
    }))
}

interface HistoryComparable {
  title: string
  content: string
  description?: string | null
  isJinjaTemplate?: boolean
}

/**
 * 版本记录和提示词的标题、描述、正文、模板类型是否一致。
 * 每一版记的是保存后的内容，最新一版和提示词一致时它就是当前版本；不一致说明提示词在别处改过
 * （命令行、移动端 AI 生成、升级前没有版本记录等），当前内容还没有记成版本。
 */
export function historyMatchesPrompt(history: HistoryComparable | null | undefined, prompt: HistoryComparable | null | undefined): boolean {
  if (!history || !prompt) return false
  return history.content === prompt.content
    && history.title === prompt.title
    && (history.description || '') === (prompt.description || '')
    && Boolean(history.isJinjaTemplate) === Boolean(prompt.isJinjaTemplate)
}

/** 版本历史记录：某一次保存时的完整快照 */
export function buildHistoryRecord(
  prompt: { id: number; title: string; content: string; description?: string; categoryId?: number; tags?: string[] | string; isJinjaTemplate?: boolean },
  variables: unknown[],
  version: number,
  changeDescription: string,
  now = new Date(),
) {
  return {
    promptId: prompt.id,
    version,
    title: prompt.title,
    content: prompt.content,
    description: prompt.description,
    categoryId: prompt.categoryId,
    tags: Array.isArray(prompt.tags) ? prompt.tags.join(',') : prompt.tags,
    variables: JSON.stringify(variables || []),
    isJinjaTemplate: prompt.isJinjaTemplate || false,
    changeDescription,
    uuid: `history_${now.getTime()}_${Math.random().toString(36).slice(2, 11)}`,
    createdAt: now,
  }
}
