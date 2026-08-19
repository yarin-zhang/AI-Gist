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
 * 从任意文本中提取第一个花括号配对完整的 JSON 对象子串（支持嵌套花括号）。
 */
function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf('{')
  if (start === -1) return null

  let depth = 0
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}') {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  return null
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

  const jsonSlice = extractFirstJsonObject(candidate)
  if (jsonSlice) {
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
      // JSON 解析失败，继续尝试下面的兜底逻辑
    }
  }

  // Fallback：模型没有返回合法 JSON，但给出的是一段简短纯文本时，直接当标题使用
  const firstLine = candidate.split(/\r?\n/)[0].trim()
  if (firstLine && firstLine.length <= TITLE_MAX_LENGTH && !firstLine.includes('{')) {
    return { title: firstLine, description: '' }
  }

  throw new Error('Could not parse a title and description from the AI response')
}
