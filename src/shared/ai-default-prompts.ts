/**
 * AI 请求用的内置默认提示词，桌面主进程、Web 后端和渲染层共用一个来源。
 *
 * scripts/web-server.js 在 Docker 里单独运行，不能引用 TypeScript，那里有一份同样的文字，
 * 由单元测试保证两边一致（test/web/web-ai-default-prompts.test.ts）。
 * 移动端浏览器里直接请求服务商时，默认系统提示词跟随界面语言（见 mobile-ai-generator.service.ts）。
 */

/**
 * 生成提示词时默认的系统提示词：配置里没有自定义时使用。
 * 桌面「系统提示词」弹窗里显示的「默认」就是这一段，用户看到的就是实际发出去的内容。
 */
export const DEFAULT_GENERATION_SYSTEM_PROMPT = `你是一个专业的 AI 提示词工程师。请根据用户提供的主题，生成一个高质量、结构化的 AI 提示词。

要求：
1. 提示词应该清晰、具体、可操作
2. 包含必要的上下文和约束条件
3. 使用适当的格式和结构
4. 考虑不同的使用场景
5. 提供具体的输出格式要求

请直接返回优化后的提示词内容，不需要额外的解释。`

/** 使用默认系统提示词时，用户的需求套进这段话发给模型（{topic} 换成需求） */
export const DEFAULT_GENERATION_USER_PROMPT = `请为以下主题生成一个专业的 AI 提示词：

主题：{topic}

请生成一个完整、可直接使用的提示词。`

/**
 * 整理要保存的自定义系统提示词：和内置默认一样（忽略首尾空白）就当作没有自定义，返回空字符串，
 * 配置继续跟随内置默认；否则去掉首尾空白后原样保留。
 * 「重置为默认」后保存不会把默认文字存成自定义内容，生成行为也不会因此改变。
 */
export function normalizeCustomSystemPrompt(value?: string | null): string {
  const text = (value || '').trim()
  return text === DEFAULT_GENERATION_SYSTEM_PROMPT.trim() ? '' : text
}

/** 模型测试、请求测试的默认提示词：渲染层没有按界面语言传入时使用 */
export const DEFAULT_TEST_PROMPT = '请用一句话简单介绍一下你自己。'

/** 渲染层传入的测试提示词优先，没有传入（或是空白）时用默认 */
export function resolveTestPrompt(prompt?: string | null): string {
  return typeof prompt === 'string' && prompt.trim() ? prompt.trim() : DEFAULT_TEST_PROMPT
}
