/**
 * AI 摘要生成的纯逻辑：构建发送给 AI 的总结指令、解析模型返回的 JSON。
 *
 * 供提示词页 AI 面板的「生成标题和描述」使用，方便单独覆盖
 * “模型没有严格返回 JSON 时如何兜底”这一类边界情况的单元测试。
 */

const TITLE_MAX_LENGTH = 60
const DESCRIPTION_MAX_LENGTH = 200

export interface AISummaryResult {
  title: string
  description: string
  /** 只有调用方给了候选分类时才有；模型没挑出合适的分类时为空字符串 */
  category?: string
}

/**
 * 构建发送给 AI 的总结指令。
 *
 * 指令文本本身使用英文书写以获得更稳定的指令遵循效果，但明确要求模型必须
 * 按提示词内容本身使用的语言作答（不受指令语言影响），并严格返回 JSON。
 */
export function buildAISummaryPrompt(content: string, categories: string[] = []): string {
  const categoryRules = categories.length
    ? [
      `- Also pick the single best matching category for this prompt from this list: ${JSON.stringify(categories)}. Use the category name exactly as written, or an empty string if none fits.`,
      '- Respond with strictly valid JSON only, in exactly this shape: {"title": "...", "description": "...", "category": "..."}',
    ]
    : ['- Respond with strictly valid JSON only, in exactly this shape: {"title": "...", "description": "..."}']
  return [
    'You are a concise naming assistant for a prompt library tool.',
    'Read the prompt content below and produce a very short title and a short description that summarize what it does.',
    '',
    'Rules:',
    '- Detect the primary language used in the prompt content below, and write both the title and the description in that same language — regardless of the language used in these instructions.',
    '- The title must be extremely short (a few words, or a short phrase for CJK languages) and must not simply repeat the content verbatim.',
    '- The description must be one short sentence that adds context the title does not already cover.',
    '- Do not wrap the response in Markdown, code fences, or add any explanation before or after it.',
    ...categoryRules,
    '',
    'Prompt content:',
    '"""',
    content,
    '"""',
  ].join('\n')
}

/**
 * 从任意文本中扫描每一个 `{` 作为候选起点，对每个起点做花括号深度匹配
 * （支持嵌套花括号），返回所有能配对出完整花括号范围的候选子串，按起点
 * 在原文中的先后顺序排列。
 *
 * 之所以不是只取“第一个 `{`”：本工具的核心场景是变量化/Jinja 提示词，AI
 * 回复里经常会在真正的 JSON 对象之前提到 `{{variableName}}` 这类装饰性、
 * 不配对或语义上并非 JSON 的花括号。如果只信任第一个 `{`，深度匹配会在这些
 * 花括号上就地配对出一段无效子串，导致后面真正合法的 JSON 对象永远不会被
 * 尝试。调用方需要逐个候选尝试 JSON.parse，直到找到第一个真正合法且可用的
 * 候选为止。
 */
function extractJsonObjectCandidates(text: string): string[] {
  const candidates: string[] = []
  for (let start = 0; start < text.length; start++) {
    if (text[start] !== '{') continue

    let depth = 0
    for (let i = start; i < text.length; i++) {
      if (text[i] === '{') depth++
      else if (text[i] === '}') {
        depth--
        if (depth === 0) {
          candidates.push(text.slice(start, i + 1))
          break
        }
      }
    }
  }
  return candidates
}

function truncate(value: string, maxLength: number): string {
  const trimmed = value.trim()
  if (trimmed.length <= maxLength) return trimmed
  return `${trimmed.slice(0, maxLength - 1).trimEnd()}…`
}

/** 模型的回复里解析不出可用的标题；调用方据此提示「没能生成标题」，不改动原有数据 */
export class AISummaryParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AISummaryParseError'
  }
}

/**
 * 解析 AI 返回的总结内容。
 *
 * 按 JSON 解析（允许模型用 ```json ... ``` 代码块包裹、前后带几句说明）。
 * 模型没有返回带标题的 JSON 时抛出 AISummaryParseError：拒答、道歉之类的
 * 纯文本不能当成标题写进提示词。
 */
export function parseAISummaryResponse(raw: string): AISummaryResult {
  const text = (raw || '').trim()
  if (!text) {
    throw new AISummaryParseError('AI summary response was empty')
  }

  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  const candidate = fenceMatch ? fenceMatch[1].trim() : text

  // 依次尝试每一个候选花括号范围：深度匹配可能因为文本里更早出现的、和真正
  // JSON 无关的花括号（例如 `{{variable}}`）而配对到错误的 `}`，导致
  // JSON.parse 失败或解析出一个没有可用 title 的对象——这两种情况都应该
  // 跳过，继续尝试下一个候选起点，而不是直接放弃转向纯文本兜底。
  for (const jsonSlice of extractJsonObjectCandidates(candidate)) {
    try {
      const parsed = JSON.parse(jsonSlice)
      const title = typeof parsed?.title === 'string' ? parsed.title.trim() : ''
      const description = typeof parsed?.description === 'string' ? parsed.description.trim() : ''
      if (title) {
        const result: AISummaryResult = {
          title: truncate(title, TITLE_MAX_LENGTH),
          description: truncate(description, DESCRIPTION_MAX_LENGTH),
        }
        if (typeof parsed?.category === 'string') result.category = parsed.category.trim()
        return result
      }
    } catch {
      // 这个候选范围不是合法 JSON，继续尝试下一个候选起点
    }
  }

  throw new AISummaryParseError('Could not parse a title and description from the AI response')
}
