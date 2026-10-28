import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMessage } from 'naive-ui'
import type { AIGenerationHistory } from '@shared/types/ai'
import { api } from '@/lib/api'
import { GenerationStoppedError, stopGeneration, streamGeneration } from '@/lib/utils/ai-request'
import { useAIModels } from './useAIModels'

const AUTO_SAVE_KEY = 'prompt_generation_auto_save'

/**
 * 最近一次生成的结果。error：一个字都没写出来就失败；interrupted：写了一部分后出错断开；
 * stopped：用户点了停止。后两种情况正文里可能留着没写完的内容（见 partial）。
 */
export type PromptGenerationStatus = 'idle' | 'generating' | 'success' | 'error' | 'stopped' | 'interrupted'

/**
 * 新建提示词时右侧「AI 生成」页签：按描述生成提示词，生成过程直接写进正文。
 * 每次生成都记一条生成记录，失败也记，方便回头查看。
 */
export function usePromptGeneration() {
  const { t } = useI18n()
  const message = useMessage()
  const models = useAIModels()

  const generating = ref(false)
  const status = ref<PromptGenerationStatus>('idle')
  /** 最近一次生成用的描述，重试时用 */
  const request = ref('')
  const errorMessage = ref('')
  /** 正文里是否已经写进了这次生成的内容（停止或中断时就是没写完的部分） */
  const partial = ref(false)
  const history = ref<AIGenerationHistory[]>([])
  const autoSave = ref(localStorage.getItem(AUTO_SAVE_KEY) !== 'false')
  let stopRequested = false

  const setAutoSave = (value: boolean) => {
    autoSave.value = value
    localStorage.setItem(AUTO_SAVE_KEY, String(value))
  }

  const loadHistory = async () => {
    try {
      const result = await api.aiGenerationHistory.getPaginated.query({ limit: 10 })
      // 试运行也写在生成记录表里，这里只列真正的「生成提示词」
      history.value = result.data.filter(item => !String(item.historyId || '').startsWith('use_'))
    } catch {
      history.value = []
    }
  }

  const record = async (entry: Partial<AIGenerationHistory>) => {
    try {
      await api.aiGenerationHistory.create.mutate({
        uuid: `history_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
        ...entry,
      } as never)
    } catch (error) {
      console.error('保存生成记录失败:', error)
    }
  }

  /**
   * 按描述生成提示词。onPartial 收到不断变长的正文，由调用方写进编辑器。
   * 返回最终正文；用户停止或失败时返回 null。
   */
  const generate = async (description: string, onPartial: (content: string) => void): Promise<string | null> => {
    const selected = models.selected.value
    if (!selected) {
      message.warning(t('promptWorkspace.selectModelFirst'))
      return null
    }
    if (!description.trim() || generating.value) return null
    generating.value = true
    stopRequested = false
    status.value = 'generating'
    request.value = description.trim()
    errorMessage.value = ''
    partial.value = false
    try {
      const result = await streamGeneration({
        config: selected.config,
        model: selected.model,
        mode: 'generate',
        prompt: description.trim(),
        onPartial: content => {
          if (content) partial.value = true
          onPartial(content)
        },
        shouldStop: () => stopRequested,
      })
      if (!result.generatedPrompt?.trim()) throw new Error(t('promptGenerate.emptyResult'))
      status.value = 'success'
      partial.value = false
      await record({
        historyId: result.id || `gen_${Date.now()}`,
        configId: selected.config.configId,
        topic: description.trim(),
        generatedPrompt: result.generatedPrompt,
        model: selected.model,
        status: 'success',
      })
      return result.generatedPrompt
    } catch (error) {
      if (error instanceof GenerationStoppedError) {
        status.value = 'stopped'
        return null
      }
      const reason = error instanceof Error ? error.message : String(error)
      status.value = partial.value ? 'interrupted' : 'error'
      errorMessage.value = reason
      message.error(`${t('aiGenerator.generateFailed')}: ${reason}`)
      await record({
        historyId: `error_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
        configId: selected.config.configId,
        topic: description.trim(),
        generatedPrompt: '',
        model: selected.model,
        status: 'error',
        errorMessage: reason,
      })
      return null
    } finally {
      generating.value = false
      void loadHistory()
    }
  }

  const stop = async () => {
    stopRequested = true
    await stopGeneration()
  }

  /** 回到没有生成过的状态（撤回了这次的内容，或切换到别的提示词） */
  const reset = () => {
    status.value = 'idle'
    request.value = ''
    errorMessage.value = ''
    partial.value = false
  }

  return {
    models, generating, status, request, errorMessage, partial, history, autoSave,
    setAutoSave, loadHistory, generate, stop, reset,
  }
}
