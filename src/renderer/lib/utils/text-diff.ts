import { diffArrays, diffLines } from 'diff'
import type { DiffSegment } from '@/components/ui/types'
import { parsePromptTemplate } from './prompt-template'

/**
 * 把文本切成「词」。中文、日文没有空格，按字符级 diff 会把一句改写拆成碎片，
 * 按空格切又会把整句当成一个词，所以交给 Intl.Segmenter 按语言规则断词；
 * `{{变量}}` 占位符整体算一个词，避免变量名被拆开对比。
 */
export function tokenizeForDiff(text: string): string[] {
  const tokens: string[] = []
  const placeholder = /\{\{[^{}\r\n]*\}\}/g
  let cursor = 0
  let match: RegExpExecArray | null
  const pushWords = (chunk: string) => {
    if (!chunk) return
    if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
      const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' })
      for (const { segment } of segmenter.segment(chunk)) tokens.push(segment)
      return
    }
    tokens.push(...Array.from(chunk))
  }

  while ((match = placeholder.exec(text))) {
    pushWords(text.slice(cursor, match.index))
    tokens.push(match[0])
    cursor = match.index + match[0].length
  }
  pushWords(text.slice(cursor))
  return tokens
}

/** 逐词对比两段文本，相邻同类片段合并，供 UiDiffText 直接渲染 */
export function diffText(before: string, after: string): DiffSegment[] {
  const segments: DiffSegment[] = []
  for (const change of diffArrays(tokenizeForDiff(before), tokenizeForDiff(after))) {
    const type: DiffSegment['type'] = change.added ? 'insert' : change.removed ? 'delete' : 'equal'
    const value = change.value.join('')
    if (!value) continue
    const last = segments[segments.length - 1]
    if (last?.type === type) last.value += value
    else segments.push({ type, value })
  }
  return segments
}

export interface PromptChangeSummary {
  addedLines: number
  removedLines: number
  addedChars: number
  removedChars: number
  addedVariables: string[]
  removedVariables: string[]
}

/** 版本对比和 AI 建议栏上的统计：增删了几行、几个字，新增或删掉了哪些变量 */
export function summarizePromptChange(before: string, after: string): PromptChangeSummary {
  let addedLines = 0
  let removedLines = 0
  for (const change of diffLines(before, after)) {
    if (change.added) addedLines += change.count ?? 0
    if (change.removed) removedLines += change.count ?? 0
  }

  let addedChars = 0
  let removedChars = 0
  for (const segment of diffText(before, after)) {
    if (segment.type === 'insert') addedChars += segment.value.length
    if (segment.type === 'delete') removedChars += segment.value.length
  }

  const beforeNames = new Set(parsePromptTemplate(before).variableNames)
  const afterNames = new Set(parsePromptTemplate(after).variableNames)
  return {
    addedLines,
    removedLines,
    addedChars,
    removedChars,
    addedVariables: [...afterNames].filter(name => !beforeNames.has(name)),
    removedVariables: [...beforeNames].filter(name => !afterNames.has(name)),
  }
}
