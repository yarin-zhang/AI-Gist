import { ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMessage } from 'naive-ui'
import type { QuickOptimizationConfig } from '@shared/types/ai'
import { api } from '@/lib/api'
import { AISummaryParseError, buildAISummaryPrompt, parseAISummaryResponse, type AISummaryResult } from '@/lib/utils/ai-summary'
import { GenerationStoppedError, stopGeneration, streamGeneration } from '@/lib/utils/ai-request'
import { describeAIError } from '@/lib/utils/ai-error'
import { useAIModels } from './useAIModels'

export interface AISessionMessage {
  id: number
  role: 'user' | 'assistant'
  /** run：试运行的回答；note：说明文字；error：失败原因 */
  kind: 'text' | 'run' | 'note' | 'error'
  text: string
  streaming?: boolean
  /**
   * 试运行没有正常跑完：stopped 是用户点了停止，failed 是出错了。
   * 这时 text 只是已经收到的部分（可能为空），界面要标出没完成并给重试
   */
  outcome?: 'stopped' | 'failed'
  /** 出错时的原始报错，界面按原因给出说明 */
  error?: string
  /** 失败的改写建议、生成标题可以从卡片上重试 */
  retry?: 'suggestion' | 'summarize'
  meta?: { durationMs: number; model: string }
}

export interface AISuggestion {
  label: string
  original: string
  proposed: string
  streaming: boolean
}

type SuggestionRequest =
  | { type: 'optimize'; config: QuickOptimizationConfig }
  | { type: 'adjust'; instruction: string }

interface SessionSource {
  /** 当前正文（编辑中的模板） */
  content: () => string
  /** 按当前填写值渲染后的文本，试运行用 */
  rendered: () => string
  title: () => string
}

/**
 * 提示词页右侧「AI」页签的会话：试运行、快速优化和按指令修改。
 * 修改类请求不直接覆盖正文，而是生成一份建议，由正文下方的建议栏采纳或放弃。
 */
export function usePromptAISession(source: SessionSource) {
  const { t } = useI18n()
  const message = useMessage()
  const models = useAIModels()

  const messages = ref<AISessionMessage[]>([])
  const suggestion = shallowRef<AISuggestion | null>(null)
  const running = ref(false)
  let stopRequested = false
  let lastRequest: SuggestionRequest | null = null
  let nextId = 1
  // 「已生成修改建议，在正文下方采纳或放弃」「已生成标题和描述…」这两条说明：
  // 采纳、放弃或被新结果替换后改写成结果，会话里不再留着让人去处理的提示
  let suggestionNoteId: number | null = null
  let summaryNoteId: number | null = null

  const push = (entry: Omit<AISessionMessage, 'id'>) => {
    const item = { ...entry, id: nextId++ }
    messages.value = [...messages.value, item]
    return item.id
  }

  const patch = (id: number, changes: Partial<AISessionMessage>) => {
    messages.value = messages.value.map(item => item.id === id ? { ...item, ...changes } : item)
  }

  const requireModel = () => {
    const selected = models.selected.value
    if (!selected) message.warning(t('promptWorkspace.selectModelFirst'))
    return selected
  }

  const resolveNote = (id: number | null, text: string) => {
    if (id !== null) patch(id, { text })
  }

  const reset = () => {
    messages.value = []
    suggestion.value = null
    lastRequest = null
    suggestionNoteId = null
    summaryNoteId = null
  }

  const stop = async () => {
    stopRequested = true
    await stopGeneration()
  }

  /** 把填好的提示词发给模型，回答以卡片形式出现在会话里 */
  const run = async () => {
    const selected = requireModel()
    const prompt = source.rendered().trim()
    if (!selected || !prompt || running.value) return
    running.value = true
    stopRequested = false
    push({ role: 'user', kind: 'text', text: t('promptAI.runRequest') })
    const answerId = push({ role: 'assistant', kind: 'run', text: '', streaming: true })
    const started = Date.now()
    try {
      const result = await streamGeneration({
        config: selected.config,
        model: selected.model,
        prompt,
        topic: source.title(),
        onPartial: text => patch(answerId, { text }),
        shouldStop: () => stopRequested,
      })
      patch(answerId, {
        text: result.generatedPrompt,
        streaming: false,
        meta: { durationMs: Date.now() - started, model: selected.model },
      })
      void api.aiGenerationHistory.create.mutate({
        historyId: `use_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        configId: selected.config.configId,
        topic: source.title(),
        generatedPrompt: prompt,
        model: selected.model,
        status: 'success',
        debugResult: result.generatedPrompt,
        debugStatus: 'success',
        customPrompt: prompt,
        uuid: `use_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      } as never).catch(() => undefined)
    } catch (error) {
      // 停止或出错时保留已经收到的部分，记下实际耗时，由卡片标出「没完成」
      const meta = { durationMs: Date.now() - started, model: selected.model }
      if (error instanceof GenerationStoppedError) patch(answerId, { streaming: false, outcome: 'stopped', meta })
      else patch(answerId, { streaming: false, outcome: 'failed', meta, error: error instanceof Error ? error.message : String(error) })
    } finally {
      running.value = false
    }
  }

  const buildRequestPrompt = (request: SuggestionRequest, content: string) => {
    if (request.type === 'optimize') return request.config.prompt.replace('{{content}}', content)
    return [
      t('promptManagement.adjustPromptInstruction'),
      '',
      t('promptManagement.originalPrompt'),
      content,
      '',
      t('promptManagement.adjustmentInstruction'),
      request.instruction.trim(),
      '',
      t('promptManagement.outputImprovedPrompt'),
    ].join('\n')
  }

  const requestSuggestion = async (request: SuggestionRequest, echo = true) => {
    const selected = requireModel()
    const original = source.content()
    if (!selected || running.value) return
    if (!original.trim()) {
      message.warning(t('promptManagement.enterPromptContentFirst'))
      return
    }
    const label = request.type === 'optimize' ? request.config.name : request.instruction.trim()
    lastRequest = request
    running.value = true
    stopRequested = false
    if (echo) push({ role: 'user', kind: 'text', text: label })
    // 上一条还没处理的建议会被这次的结果替换
    resolveNote(suggestionNoteId, t('promptAI.suggestionReplacedNote'))
    suggestionNoteId = null
    suggestion.value = { label, original, proposed: '', streaming: true }
    try {
      const result = await streamGeneration({
        config: selected.config,
        model: selected.model,
        prompt: buildRequestPrompt(request, original),
        onPartial: proposed => { suggestion.value = { label, original, proposed, streaming: true } },
        shouldStop: () => stopRequested,
      })
      const proposed = result.generatedPrompt.trim()
      if (!proposed) throw new Error(t('promptAI.emptySuggestion'))
      suggestion.value = { label, original, proposed, streaming: false }
      suggestionNoteId = push({ role: 'assistant', kind: 'note', text: t('promptAI.suggestionReady') })
    } catch (error) {
      suggestion.value = null
      if (!(error instanceof GenerationStoppedError)) {
        const raw = error instanceof Error ? error.message : String(error)
        // 模型回了空内容不是请求错误，直接说明；其余的原始报错交给界面按原因解释
        if (raw === t('promptAI.emptySuggestion')) push({ role: 'assistant', kind: 'error', text: raw, retry: 'suggestion' })
        else push({ role: 'assistant', kind: 'error', text: t('promptAI.suggestionFailed'), error: raw, retry: 'suggestion' })
      }
    } finally {
      running.value = false
    }
  }

  const optimize = (config: QuickOptimizationConfig) => requestSuggestion({ type: 'optimize', config })
  const adjust = (instruction: string) => {
    if (!instruction.trim()) return
    return requestSuggestion({ type: 'adjust', instruction })
  }
  const regenerate = () => lastRequest ? requestSuggestion(lastRequest, false) : undefined

  /** 采纳建议：返回新正文，由提示词页写回编辑器 */
  const adopt = (): AISuggestion | null => {
    const current = suggestion.value
    if (!current || current.streaming) return null
    suggestion.value = null
    resolveNote(suggestionNoteId, t('promptAI.suggestionAdoptedNote'))
    suggestionNoteId = null
    return current
  }

  const discard = () => {
    if (running.value) void stop()
    suggestion.value = null
    resolveNote(suggestionNoteId, t('promptAI.suggestionDiscardedNote'))
    suggestionNoteId = null
  }

  /** 标题和描述的预览被采纳或放弃后，把会话里那条说明改成结果 */
  const resolveSummary = (adopted: boolean) => {
    resolveNote(summaryNoteId, adopted ? t('promptAI.summaryAdoptedNote') : t('promptAI.summaryDiscardedNote'))
    summaryNoteId = null
  }

  /**
   * 让模型根据正文给出标题、描述，并从现有分类里挑一个。只返回结果，由提示词页决定预览还是补空白字段。
   * echo 为 true 时（用户在 AI 页签或菜单里点的）把这次操作和结果记进会话。
   */
  const summarize = async (categories: string[] = [], options: { echo?: boolean } = {}): Promise<AISummaryResult | null> => {
    const selected = requireModel()
    const content = source.content().trim()
    if (!selected || !content || running.value) return null
    running.value = true
    stopRequested = false
    if (options.echo) push({ role: 'user', kind: 'text', text: t('promptAI.summarize') })
    try {
      const result = await streamGeneration({
        config: selected.config,
        model: selected.model,
        prompt: buildAISummaryPrompt(content, categories),
        topic: content,
        shouldStop: () => stopRequested,
      })
      const summary = parseAISummaryResponse(result.generatedPrompt)
      if (options.echo) {
        resolveNote(summaryNoteId, t('promptAI.summaryReplacedNote'))
        summaryNoteId = push({ role: 'assistant', kind: 'note', text: t('promptAI.summaryReady') })
      }
      return summary
    } catch (error) {
      if (!(error instanceof GenerationStoppedError)) {
        // 回复里解析不出标题时只说没能生成，不把模型的原话当标题；请求失败时提示里只放原因，原始报错留在会话卡片里
        if (error instanceof AISummaryParseError) {
          message.error(t('promptAI.summaryUnparsable'))
          if (options.echo) push({ role: 'assistant', kind: 'error', text: t('promptAI.summaryUnparsable'), retry: 'summarize' })
        } else {
          const raw = error instanceof Error ? error.message : String(error)
          message.error(`${t('promptWorkspace.aiSummarizeFailed')}: ${describeAIError(raw, {}, t).title}`)
          if (options.echo) push({ role: 'assistant', kind: 'error', text: t('promptWorkspace.aiSummarizeFailed'), error: raw, retry: 'summarize' })
        }
      }
      return null
    } finally {
      running.value = false
    }
  }

  return {
    messages,
    suggestion,
    running,
    models,
    run,
    optimize,
    adjust,
    regenerate,
    adopt,
    discard,
    stop,
    summarize,
    resolveSummary,
    reset,
  }
}

export type PromptAISession = ReturnType<typeof usePromptAISession>
