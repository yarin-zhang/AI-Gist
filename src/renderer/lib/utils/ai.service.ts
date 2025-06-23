/**
 * AI 服务管理器
 * 统一管理 AI 相关的功能调用
 */

import { IpcUtils, type IpcResult } from '../ipc.ts';
import type { 
  AIConfig, 
  AIGenerationRequest, 
  AIGenerationResult,
  AIConfigTestResult 
} from '../../../shared/types/ai';

export class AIService {
  private static instance: AIService;

  private constructor() {}

  static getInstance(): AIService {
    if (!AIService.instance) {
      AIService.instance = new AIService();
    }
    return AIService.instance;
  }

  /**
   * 测试 AI 配置连接
   */
  async testConfig(config: AIConfig): Promise<IpcResult<any>> {
    return await IpcUtils.safeInvoke('ai:test-config', config);
  }

  /**
   * 获取可用模型列表
   */
  async getAvailableModels(config: AIConfig): Promise<IpcResult<string[]>> {
    return await IpcUtils.safeInvoke<string[]>('ai:get-models', config);
  }

  /**
   * 生成提示词
   */
  async generatePrompt(request: AIGenerationRequest, config: AIConfig): Promise<IpcResult<string>> {
    return await IpcUtils.safeInvoke<string>('ai:generate-prompt', request, config);
  }

  /**
   * 智能测试 - 发送真实提示词并获取AI响应
   */
  async intelligentTest(config: AIConfig): Promise<IpcResult<any>> {
    return await IpcUtils.safeInvoke('ai:intelligent-test', config);
  }

  /**
   * 流式生成提示词
   */
  async generatePromptStream(
    request: AIGenerationRequest, 
    config: AIConfig,
    onChunk?: (chunk: string) => void,
    onComplete?: () => void,
    onError?: (error: string) => void
  ): Promise<IpcResult<string>> {
    try {
      // 由于流式调用的复杂性，这里使用标准的IPC调用
      // 如果需要真正的流式处理，需要在主进程中实现事件监听
      const result = await IpcUtils.invoke('ai:generate-prompt-stream', request, config);
      
      if (onComplete) {
        onComplete();
      }
      
      return { success: true, data: result };
    } catch (error) {
      if (onError) {
        onError(error instanceof Error ? error.message : String(error));
      }
      
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * 停止生成
   */
  async stopGeneration(): Promise<IpcResult<void>> {
    return await IpcUtils.safeInvoke<void>('ai:stop-generation');
  }

  /**
   * 调试提示词 - 使用提示词获取AI响应
   */
  async debugPrompt(prompt: string, config: AIConfig): Promise<IpcResult<any>> {
    return await IpcUtils.safeInvoke('ai:debug-prompt', prompt, config);
  }

  /**
   * 处理配置数据，确保日期字段正确
   */
  processConfig(config: any): AIConfig {
    return {
      ...config,
      createdAt: config.createdAt ? new Date(config.createdAt) : new Date(),
      updatedAt: config.updatedAt ? new Date(config.updatedAt) : new Date(),
      models: Array.isArray(config.models) ? config.models : []
    };
  }
}

// 导出单例实例
export const aiService = AIService.getInstance();
