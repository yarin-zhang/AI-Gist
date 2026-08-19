/**
 * AI 摘要生成的纯逻辑：构建发送给 AI 的总结指令、解析模型返回的 JSON。
 *
 * 从 PromptWorkspace 的“一键 AI 生成标题/描述”按钮中抽出，方便单独覆盖
 * “模型没有严格返回 JSON 时如何兜底”这一类边界情况的单元测试。
 */

const TITLE_MAX_LENGTH = 60
const DESCRIPTION_MAX_LENGTH = 200

export interface AISummaryResult {
  title: string
  description: string
}

/**
 * 构建发送给 AI 的总结指令。
 *
 * 指令文本本身使用英文书写以获得更稳定的指令遵循效果，但明确要求模型必须
 * 按提示词内容本身使用的语言作答（不受指令语言影响），并严格返回 JSON。
 */
export function buildAISummaryPrompt(content: string): string {
  return [
    'You are a concise naming assistant for a prompt library tool.',
    'Read the prompt content below and produce a very short title and a short description that summarize what it does.',
    '',
    'Rules:',
    '- Detect the primary language used in the prompt content below, and write both the title and the description in that same language — regardless of the language used in these instructions.',
    '- The title must be extremely short (a few words, or a short phrase for CJK languages) and must not simply repeat the content verbatim.',
    '- The description must be one short sentence that adds context the title does not already cover.',
    '- Do not wrap the response in Markdown, code fences, or add any explanation before or after it.',
    '- Respond with strictly valid JSON only, in exactly this shape: {"title": "...", "description": "..."}',
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

/**
 * 解析 AI 返回的总结内容。
 *
 * 优先按 JSON 解析（允许模型用 ```json ... ``` 代码块包裹）；如果模型没有
 * 遵循 JSON 格式，但返回的是一段可以直接当标题用的简短纯文本，则把它当作
 * 标题使用（fallback，描述留空）；彻底无法识别时抛出错误，交给调用方走
 * 统一的失败提示。
 */
export function parseAISummaryResponse(raw: string): AISummaryResult {
  const text = (raw || '').trim()
  if (!text) {
    throw new Error('AI summary response was empty')
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
        return {
          title: truncate(title, TITLE_MAX_LENGTH),
          description: truncate(description, DESCRIPTION_MAX_LENGTH),
        }
      }
    } catch {
      // 这个候选范围不是合法 JSON，继续尝试下一个候选起点
    }
  }

  // Fallback：模型没有返回合法 JSON，但给出的是一段简短纯文本时，直接当标题使用
  const firstLine = candidate.split(/\r?\n/)[0].trim()
  if (firstLine && firstLine.length <= TITLE_MAX_LENGTH && !firstLine.includes('{')) {
    return { title: firstLine, description: '' }
  }

  throw new Error('Could not parse a title and description from the AI response')
}
