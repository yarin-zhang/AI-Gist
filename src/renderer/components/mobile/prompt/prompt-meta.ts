import type { Category, Prompt } from '@shared/types'
import { CATEGORY_COLORS, getTagsArray } from '~/lib/utils/tag-colors'
import { generateAutoTitle, plainTemplateText } from '~/lib/utils/prompt-editor'

/** 列表排序：对应 PromptService.getAllPrompts 的 sortBy */
export type MobilePromptSort = 'updatedAt' | 'createdAt' | 'useCount' | 'title'

/** null 不按分类筛选；'none' 只看未分类 */
export type MobileCategoryFilter = number | 'none' | null

/** CATEGORY_COLORS 的顺序与设计令牌 --category-* 一一对应 */
const CATEGORY_TOKENS = ['blue', 'orange', 'pink', 'violet', 'green', 'teal', 'amber', 'grey'] as const

const HEX_PATTERN = /^#([0-9a-f]{6})/i

/**
 * 分类色转成可直接写进样式的颜色：落在 V5 固定色板上时换成对应的 --category-* 令牌，
 * 深色主题下会跟着切换；用户自定义的其他颜色原样使用。没有分类时返回灰色令牌。
 */
export function categoryColor(category: Pick<Category, 'color'> | null | undefined): string {
  const raw = category?.color?.trim()
  if (!raw) return 'var(--category-grey)'
  const hex = HEX_PATTERN.exec(raw)?.[0]?.toUpperCase()
  const index = hex ? CATEGORY_COLORS.findIndex(color => color === hex) : -1
  if (index >= 0) return `var(--category-${CATEGORY_TOKENS[index]})`
  return hex || raw
}

/** 卡片里的分类图标方块：分类色 14% 的浅底 + 分类色图标 */
export function categoryTileStyle(category: Pick<Category, 'color'> | null | undefined) {
  const color = categoryColor(category)
  return {
    background: `color-mix(in srgb, ${color} 14%, var(--surface-primary))`,
    color,
  }
}

/** 没有标题时用正文第一行代替 */
export function promptDisplayTitle(prompt: Pick<Prompt, 'title' | 'content'>, fallback: string, max = 50): string {
  if (prompt.title?.trim()) return prompt.title
  const firstLine = (prompt.content || '').split('\n').find(line => line.trim())?.trim() || ''
  if (!firstLine) return fallback
  return firstLine.length > max ? `${firstLine.slice(0, max)}…` : firstLine
}

// 自动标题和桌面端共用同一套规则
export { plainTemplateText, generateAutoTitle as autoPromptTitle }

/**
 * 标题是不是由正文这一行自动生成的：包括上面去掉变量语法的标题、截短后带省略号的标题，
 * 以及早先直接用原文（带 {{变量}}）当标题的旧数据。
 */
function isTitleFromLine(title: string, line: string): boolean {
  if (!line) return false
  const plainLine = plainTemplateText(line)
  if (title === line || title === plainLine) return true
  const truncated = title.replace(/(\.\.\.|…)$/, '')
  return truncated !== title && truncated.length > 0 && (line.startsWith(truncated) || plainLine.startsWith(truncated))
}

/** 卡片第二行：优先描述，没有描述时取正文开头 */
export function promptSnippet(prompt: Pick<Prompt, 'description' | 'content' | 'title'>): string {
  if (prompt.description?.trim()) return prompt.description.trim()
  const lines = (prompt.content || '').split('\n').map(line => line.trim()).filter(Boolean)
  // 第一行已经当作标题显示（没填标题，或标题就是从第一行自动生成的）时，摘要从第二行开始，
  // 免得卡片上标题和摘要是同一句
  const title = prompt.title?.trim() || ''
  const firstLineIsTitle = !title || isTitleFromLine(title, lines[0] || '')
  return (firstLineIsTitle ? lines.slice(1) : lines).join(' ')
}

export { getTagsArray }
