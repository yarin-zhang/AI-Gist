import zhCN from '../../i18n/locales/zh-CN.json'
import zhTW from '../../i18n/locales/zh-TW.json'
import enUS from '../../i18n/locales/en-US.json'
import jaJP from '../../i18n/locales/ja-JP.json'
import itIT from '../../i18n/locales/it-IT.json'

type Translate = (key: string, named?: Record<string, unknown>) => string

/**
 * 保存时自动写进版本历史的说明（「编辑更新」「恢复自 v1」「采纳 AI 修改：…」等）。
 * 说明按写入时的界面语言存成了文字，换了语言照样显示原文；显示时按这些 key 认出来，再用当前语言重新翻译。
 * 历史数据（包括其他设备、移动端写的）都能认出来，不需要改存储格式。
 */
const AUTO_DESCRIPTION_KEYS = [
  'promptManagement.editUpdate',
  'promptHistory.createdVersion',
  'promptHistory.beforeEdit',
  'promptHistory.restoredFrom',
  'promptHistory.adoptedAI',
  'promptHistory.aiSummary',
] as const

// 旧版本写入的说法，同样换成现在的译文
const LEGACY_TEMPLATES: Record<string, string[]> = {
  'promptManagement.editUpdate': ['Edit Update', '編集・更新', 'Modifica aggiornamento'],
}

const LOCALE_MESSAGES: unknown[] = [zhCN, zhTW, enUS, jaJP, itIT]

const lookup = (messages: unknown, key: string): unknown => key.split('.')
  .reduce<unknown>((node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined), messages)

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// 「恢复自 v{version}」→ /^恢复自 v(?<version>.+?)$/
const toPattern = (template: string) => new RegExp(
  `^${escapeRegExp(template.trim()).replace(/\\\{(\w+)\\\}/g, '(?<$1>[\\s\\S]+?)')}$`,
)

let patterns: { key: string; pattern: RegExp }[] | null = null

const getPatterns = () => {
  if (patterns) return patterns
  patterns = AUTO_DESCRIPTION_KEYS.flatMap(key => {
    const templates = new Set<string>(LEGACY_TEMPLATES[key] || [])
    LOCALE_MESSAGES.forEach(messages => {
      const template = lookup(messages, key)
      if (typeof template === 'string' && template.trim()) templates.add(template)
    })
    return [...templates].map(template => ({ key, pattern: toPattern(template) }))
  })
  return patterns
}

/** 版本说明按当前界面语言显示：自动写入的说明换成当前语言，用户自己写的原样返回 */
export function localizeHistoryDescription(text: string | undefined | null, t: Translate): string {
  const value = (text || '').trim()
  if (!value) return ''
  for (const { key, pattern } of getPatterns()) {
    const match = pattern.exec(value)
    if (match) return t(key, { ...match.groups })
  }
  return value
}

export type VersionFieldKey = 'title' | 'description' | 'category' | 'tags' | 'variables'

export interface VersionFieldChange {
  key: VersionFieldKey
  before: string
  after: string
  /** tags：新增、去掉的标签；variables：设置改过的变量名（放在 added 里） */
  added: string[]
  removed: string[]
}

interface VersionSnapshot {
  title?: string | null
  description?: string | null
  categoryId?: number | null
  /** 版本记录里是逗号分隔的字符串，提示词里是数组 */
  tags?: string[] | string | null
  /** 版本记录里是 JSON 字符串，提示词里是数组 */
  variables?: unknown[] | string | null
}

const toTags = (tags: VersionSnapshot['tags']) => (
  Array.isArray(tags) ? tags : String(tags || '').split(',')
).map(tag => tag.trim()).filter(Boolean)

const toVariableMap = (variables: VersionSnapshot['variables']) => {
  let list: unknown[] = []
  if (Array.isArray(variables)) list = variables
  else if (variables) {
    try { list = JSON.parse(variables) } catch { list = [] }
  }
  const map = new Map<string, string>()
  list.forEach(item => {
    if (!item || typeof item !== 'object') return
    const { name, type, options, defaultValue, required, placeholder, description } = item as Record<string, unknown>
    if (typeof name !== 'string' || !name) return
    // 空值统一成 undefined，存储时省略和空字符串算同一个设置
    const normalized = {
      type: type || 'text',
      options: Array.isArray(options) && options.length ? options : undefined,
      defaultValue: defaultValue || undefined,
      required: Boolean(required),
      placeholder: placeholder || undefined,
      description: description || undefined,
    }
    map.set(name, JSON.stringify(normalized))
  })
  return map
}

/**
 * 版本对比里正文以外的改动：标题、描述、分类、标签，以及两边都有的变量改了哪些设置。
 * 只改了描述、标签的版本也能看出改了什么，不会只剩「+0 行 −0 行」。
 */
export function compareVersionFields(
  before: VersionSnapshot,
  after: VersionSnapshot,
  categoryName: (categoryId: number | null) => string,
): VersionFieldChange[] {
  const changes: VersionFieldChange[] = []
  const push = (key: VersionFieldKey, from: string, to: string, added: string[] = [], removed: string[] = []) => {
    changes.push({ key, before: from, after: to, added, removed })
  }

  const title = [before.title || '', after.title || ''] as const
  if (title[0].trim() !== title[1].trim()) push('title', title[0], title[1])
  const description = [before.description || '', after.description || ''] as const
  if (description[0].trim() !== description[1].trim()) push('description', description[0], description[1])

  const category = [before.categoryId ?? null, after.categoryId ?? null] as const
  if (category[0] !== category[1]) push('category', categoryName(category[0]), categoryName(category[1]))

  const beforeTags = toTags(before.tags)
  const afterTags = toTags(after.tags)
  const addedTags = afterTags.filter(tag => !beforeTags.includes(tag))
  const removedTags = beforeTags.filter(tag => !afterTags.includes(tag))
  if (addedTags.length || removedTags.length) push('tags', beforeTags.join(', '), afterTags.join(', '), addedTags, removedTags)

  // 新增、删掉的变量在正文统计里已经列出，这里只看两边都有、设置不一样的
  const beforeVariables = toVariableMap(before.variables)
  const afterVariables = toVariableMap(after.variables)
  const changedNames = [...afterVariables.keys()]
    .filter(name => beforeVariables.has(name) && beforeVariables.get(name) !== afterVariables.get(name))
  if (changedNames.length) push('variables', '', '', changedNames)

  return changes
}
