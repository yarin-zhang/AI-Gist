import type { AIConfig, AIGenerationRequest, AIGenerationResult } from '@shared/types/ai'

const toISOString = (value: unknown): string => {
  const date = value ? new Date(value as string | number | Date) : new Date()
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString()
}

/**
 * AI 配置要经过 IPC 传给主进程，只能带可结构化克隆的值。
 * createdAt / updatedAt 经过备份恢复或云同步后可能已经是字符串（issue #37），
 * 这里统一转成 ISO 字符串。
 */
export function serializeAIConfig(config: AIConfig): AIConfig {
  return {
    ...config,
    configId: config.configId || '',
    models: Array.isArray(config.models) ? config.models.map(String) : [],
    defaultModel: config.defaultModel ? String(config.defaultModel) : '',
    customModel: config.customModel ? String(config.customModel) : '',
    systemPrompt: config.systemPrompt ? String(config.systemPrompt) : '',
    createdAt: toISOString(config.createdAt) as unknown as Date,
    updatedAt: toISOString(config.updatedAt) as unknown as Date,
  }
}

export interface StreamGenerationOptions {
  config: AIConfig
  model: string
  /**
   * raw：把 prompt 原样发给模型（试运行、快速优化、按指令修改）；
   * generate：把 prompt 当作需求，由主进程套用「提示词工程师」系统提示词生成新提示词
   */
  mode?: 'raw' | 'generate'
  /** raw 模式下发给模型的完整内容；generate 模式下是用户描述的需求 */
  prompt: string
  /** 历史记录里显示的主题，默认取 prompt */
  topic?: string
  systemPrompt?: string
  onPartial?: (content: string) => void
  /** 返回 true 时中断流式输出 */
  shouldStop?: () => boolean
}

export class GenerationStoppedError extends Error {
  constructor() {
    super('generation stopped')
    this.name = 'GenerationStoppedError'
  }
}

/**
 * 调用 AI 生成并流式回传内容。主进程不支持流式时退回一次性生成。
 * 用户中途停止时抛出 GenerationStoppedError，调用方据此区分「停止」和「失败」。
 */
export async function streamGeneration(options: StreamGenerationOptions): Promise<AIGenerationResult> {
  const ai = window.electronAPI?.ai
  if (!ai) throw new Error('AI service unavailable')

  const request: AIGenerationRequest = {
    configId: String(options.config.configId || ''),
    model: String(options.model),
    topic: String(options.topic ?? options.prompt),
    ...(options.mode === 'generate' ? {} : { customPrompt: String(options.prompt) }),
    ...(options.systemPrompt ? { systemPrompt: options.systemPrompt } : {}),
  }
  const config = serializeAIConfig(options.config)
  let latest = ''

  let result: AIGenerationResult
  try {
    result = ai.generatePromptStream
      ? await ai.generatePromptStream(request, config, (_charCount, partialContent) => {
        if (options.shouldStop?.()) return false
        if (typeof partialContent === 'string' && partialContent.length) {
          latest = partialContent
          options.onPartial?.(partialContent)
        }
        return true
      })
      : await ai.generatePrompt(request, config)
  } catch (error) {
    if (options.shouldStop?.()) throw new GenerationStoppedError()
    throw error
  }

  if (options.shouldStop?.()) throw new GenerationStoppedError()
  const finalText = result?.generatedPrompt || latest
  if (finalText && finalText !== latest) options.onPartial?.(finalText)
  return { ...result, generatedPrompt: finalText }
}

export async function stopGeneration(): Promise<void> {
  try {
    await window.electronAPI?.ai?.stopGeneration?.()
  } catch {
    // 停止失败时前端状态仍会复位
  }
}
