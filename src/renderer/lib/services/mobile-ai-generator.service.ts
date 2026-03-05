/**
 * AI 生成服务 - 统一的前端 AI 调用接口
 * 支持桌面端（Electron）和移动端（Capacitor）
 * 支持流式传输
 */

import type { AIConfig, AIGenerationRequest, AIGenerationResult } from '@shared/types/ai'
import { PlatformDetector } from '@shared/platform'

/**
 * 默认系统提示词
 */
const DEFAULT_SYSTEM_PROMPT = `你是一个专业的 AI 提示词工程师。你的任务是根据用户的需求，生成高质量、结构化的 AI 提示词。

要求：
1. 提示词应该清晰、具体、易于理解
2. 包含必要的上下文和约束条件
3. 使用适当的格式和结构
4. 确保提示词能够引导 AI 生成期望的输出

请直接输出生成的提示词内容，不要添加额外的解释或说明。`

/**
 * AI 生成服务类
 */
export class AIGeneratorService {
  /**
   * 生成提示词（支持流式传输）
   */
  static async generatePrompt(
    request: AIGenerationRequest,
    config: AIConfig,
    onProgress?: (content: string) => void
  ): Promise<AIGenerationResult> {
    // 检测平台
    if (PlatformDetector.isElectron()) {
      // 桌面端：使用 Electron IPC
      return await this.generateViaElectron(request, config, onProgress)
    } else {
      // 移动端：直接调用 AI API
      return await this.generateViaDirect(request, config, onProgress)
    }
  }

  /**
   * 通过 Electron IPC 生成
   */
  private static async generateViaElectron(
    request: AIGenerationRequest,
    config: AIConfig,
    onProgress?: (content: string) => void
  ): Promise<AIGenerationResult> {
    if (!window.electronAPI?.ai) {
      throw new Error('Electron API 不可用')
    }

    // 如果支持流式传输且提供了回调
    if (onProgress && window.electronAPI.ai.generatePromptStream) {
      return await window.electronAPI.ai.generatePromptStream(
        request,
        config,
        (charCount: number, partialContent?: string) => {
          if (partialContent) {
            onProgress(partialContent)
          }
          return true // 继续生成
        }
      )
    }

    return await window.electronAPI.ai.generatePrompt(request, config)
  }

  /**
   * 直接调用 AI API 生成
   */
  private static async generateViaDirect(
    request: AIGenerationRequest,
    config: AIConfig,
    onProgress?: (content: string) => void
  ): Promise<AIGenerationResult> {
    const systemPrompt = config.systemPrompt || DEFAULT_SYSTEM_PROMPT
    const userPrompt = `用户需求：${request.topic}\n\n请生成一个符合上述需求的 AI 提示词。`

    // 根据不同的 AI 服务类型调用对应的 API
    switch (config.type) {
      case 'openai':
      case 'deepseek':
      case 'siliconflow':
      case 'tencent':
      case 'aliyun':
      case 'mistral':
      case 'openrouter':
        return await this.callOpenAICompatibleAPI(request, config, systemPrompt, userPrompt, onProgress)

      case 'anthropic':
        return await this.callAnthropicAPI(request, config, systemPrompt, userPrompt, onProgress)

      case 'google':
        return await this.callGoogleAPI(request, config, systemPrompt, userPrompt, onProgress)

      default:
        throw new Error(`移动端暂不支持 ${config.type} 类型的 AI 服务`)
    }
  }

  /**
   * 调用 OpenAI 兼容的 API（支持流式传输）
   */
  private static async callOpenAICompatibleAPI(
    request: AIGenerationRequest,
    config: AIConfig,
    systemPrompt: string,
    userPrompt: string,
    onProgress?: (content: string) => void
  ): Promise<AIGenerationResult> {
    const baseURL = config.baseURL || 'https://api.openai.com/v1'
    const url = `${baseURL}/chat/completions`

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: request.model || config.defaultModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: 2000,
        stream: !!onProgress // 如果有回调函数，启用流式传输
      })
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`API 调用失败: ${response.status} ${error}`)
    }

    // 如果启用了流式传输
    if (onProgress && response.body) {
      return await this.handleStreamResponse(response, request, config, onProgress)
    }

    // 非流式传输
    const data = await response.json()
    const generatedPrompt = data.choices?.[0]?.message?.content || ''

    return {
      id: `gen_${Date.now()}`,
      configId: config.configId,
      topic: request.topic,
      model: request.model || config.defaultModel || '',
      generatedPrompt,
      createdAt: new Date()
    }
  }

  /**
   * 处理流式响应
   */
  private static async handleStreamResponse(
    response: Response,
    request: AIGenerationRequest,
    config: AIConfig,
    onProgress: (content: string) => void
  ): Promise<AIGenerationResult> {
    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let fullContent = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n').filter(line => line.trim() !== '')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') continue

            try {
              const json = JSON.parse(data)
              const content = json.choices?.[0]?.delta?.content || ''
              if (content) {
                fullContent += content
                onProgress(fullContent)
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      }
    } finally {
      reader.releaseLock()
    }

    return {
      id: `gen_${Date.now()}`,
      configId: config.configId,
      topic: request.topic,
      model: request.model || config.defaultModel || '',
      generatedPrompt: fullContent,
      createdAt: new Date()
    }
  }

  /**
   * 调用 Anthropic API（支持流式传输）
   */
  private static async callAnthropicAPI(
    request: AIGenerationRequest,
    config: AIConfig,
    systemPrompt: string,
    userPrompt: string,
    onProgress?: (content: string) => void
  ): Promise<AIGenerationResult> {
    const baseURL = config.baseURL || 'https://api.anthropic.com'
    const url = `${baseURL}/v1/messages`

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey || '',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: request.model || config.defaultModel,
        max_tokens: 2000,
        system: systemPrompt,
        messages: [
          { role: 'user', content: userPrompt }
        ],
        stream: !!onProgress
      })
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`API 调用失败: ${response.status} ${error}`)
    }

    // 如果启用了流式传输
    if (onProgress && response.body) {
      return await this.handleAnthropicStreamResponse(response, request, config, onProgress)
    }

    const data = await response.json()
    const generatedPrompt = data.content?.[0]?.text || ''

    return {
      id: `gen_${Date.now()}`,
      configId: config.configId,
      topic: request.topic,
      model: request.model || config.defaultModel || '',
      generatedPrompt,
      createdAt: new Date()
    }
  }

  /**
   * 处理 Anthropic 流式响应
   */
  private static async handleAnthropicStreamResponse(
    response: Response,
    request: AIGenerationRequest,
    config: AIConfig,
    onProgress: (content: string) => void
  ): Promise<AIGenerationResult> {
    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let fullContent = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n').filter(line => line.trim() !== '')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)

            try {
              const json = JSON.parse(data)
              if (json.type === 'content_block_delta') {
                const content = json.delta?.text || ''
                if (content) {
                  fullContent += content
                  onProgress(fullContent)
                }
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      }
    } finally {
      reader.releaseLock()
    }

    return {
      id: `gen_${Date.now()}`,
      configId: config.configId,
      topic: request.topic,
      model: request.model || config.defaultModel || '',
      generatedPrompt: fullContent,
      createdAt: new Date()
    }
  }

  /**
   * 调用 Google API（暂不支持流式传输）
   */
  private static async callGoogleAPI(
    request: AIGenerationRequest,
    config: AIConfig,
    systemPrompt: string,
    userPrompt: string,
    onProgress?: (content: string) => void
  ): Promise<AIGenerationResult> {
    const baseURL = config.baseURL || 'https://generativelanguage.googleapis.com'
    const model = request.model || config.defaultModel || 'gemini-pro'
    const url = `${baseURL}/v1/models/${model}:generateContent?key=${config.apiKey}`

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `${systemPrompt}\n\n${userPrompt}`
          }]
        }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2000
        }
      })
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`API 调用失败: ${response.status} ${error}`)
    }

    const data = await response.json()
    const generatedPrompt = data.candidates?.[0]?.content?.parts?.[0]?.text || ''

    // Google API 暂不支持流式传输，但可以模拟
    if (onProgress && generatedPrompt) {
      this.simulateStreaming(generatedPrompt, onProgress)
    }

    return {
      id: `gen_${Date.now()}`,
      configId: config.configId,
      topic: request.topic,
      model: request.model || config.defaultModel || '',
      generatedPrompt,
      createdAt: new Date()
    }
  }

  /**
   * 模拟流式传输效果
   */
  private static simulateStreaming(content: string, onProgress: (content: string) => void) {
    const words = content.split('')
    let currentContent = ''
    let index = 0

    const interval = setInterval(() => {
      if (index >= words.length) {
        clearInterval(interval)
        return
      }

      // 每次添加几个字符
      const chunkSize = Math.floor(Math.random() * 3) + 1
      for (let i = 0; i < chunkSize && index < words.length; i++) {
        currentContent += words[index]
        index++
      }

      onProgress(currentContent)
    }, 50) // 每50ms更新一次
  }
}
