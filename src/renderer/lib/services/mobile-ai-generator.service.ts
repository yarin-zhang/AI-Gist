/**
 * AI 生成服务 - 统一的前端 AI 调用接口
 * 支持桌面端（Electron）和移动端（Capacitor）
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
   * 生成提示词
   */
  static async generatePrompt(
    request: AIGenerationRequest,
    config: AIConfig
  ): Promise<AIGenerationResult> {
    // 检测平台
    if (PlatformDetector.isElectron()) {
      // 桌面端：使用 Electron IPC
      return await this.generateViaElectron(request, config)
    } else {
      // 移动端：直接调用 AI API
      return await this.generateViaDirect(request, config)
    }
  }

  /**
   * 通过 Electron IPC 生成
   */
  private static async generateViaElectron(
    request: AIGenerationRequest,
    config: AIConfig
  ): Promise<AIGenerationResult> {
    if (!window.electronAPI?.ai) {
      throw new Error('Electron API 不可用')
    }

    return await window.electronAPI.ai.generatePrompt(request, config)
  }

  /**
   * 直接调用 AI API 生成
   */
  private static async generateViaDirect(
    request: AIGenerationRequest,
    config: AIConfig
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
        return await this.callOpenAICompatibleAPI(request, config, systemPrompt, userPrompt)

      case 'anthropic':
        return await this.callAnthropicAPI(request, config, systemPrompt, userPrompt)

      case 'google':
        return await this.callGoogleAPI(request, config, systemPrompt, userPrompt)

      default:
        throw new Error(`移动端暂不支持 ${config.type} 类型的 AI 服务`)
    }
  }

  /**
   * 调用 OpenAI 兼容的 API
   */
  private static async callOpenAICompatibleAPI(
    request: AIGenerationRequest,
    config: AIConfig,
    systemPrompt: string,
    userPrompt: string
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
        max_tokens: 2000
      })
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`API 调用失败: ${response.status} ${error}`)
    }

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
   * 调用 Anthropic API
   */
  private static async callAnthropicAPI(
    request: AIGenerationRequest,
    config: AIConfig,
    systemPrompt: string,
    userPrompt: string
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
        ]
      })
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`API 调用失败: ${response.status} ${error}`)
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
   * 调用 Google API
   */
  private static async callGoogleAPI(
    request: AIGenerationRequest,
    config: AIConfig,
    systemPrompt: string,
    userPrompt: string
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

    return {
      id: `gen_${Date.now()}`,
      configId: config.configId,
      topic: request.topic,
      model: request.model || config.defaultModel || '',
      generatedPrompt,
      createdAt: new Date()
    }
  }
}
