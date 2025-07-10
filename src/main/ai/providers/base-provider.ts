import { AIConfig, AIGenerationRequest, AIGenerationResult } from '@shared/types/ai';
import { buildPrompts } from './prompt-templates';

/**
 * AI供应商测试结果
 */
export interface AITestResult {
  success: boolean;
  error?: string;
  models?: string[];
}

/**
 * AI供应商智能测试结果
 */
export interface AIIntelligentTestResult {
  success: boolean;
  response?: string;
  error?: string;
  inputPrompt?: string;
}

/**
 * AI供应商基础接口
 */
export interface AIProvider {
  /**
   * 测试配置连接
   */
  testConfig(config: AIConfig): Promise<AITestResult>;
  
  /**
   * 获取可用模型列表
   */
  getAvailableModels(config: AIConfig): Promise<string[]>;
  
  /**
   * 智能测试 - 发送真实提示词并获取AI响应
   */
  intelligentTest(config: AIConfig): Promise<AIIntelligentTestResult>;
  
  /**
   * 生成提示词
   */
  generatePrompt(request: AIGenerationRequest & { config: AIConfig }): Promise<AIGenerationResult>;
  
  /**
   * 流式生成提示词
   */
  generatePromptWithStream(
    request: AIGenerationRequest,
    config: AIConfig,
    onProgress: (charCount: number, partialContent?: string) => boolean,
    abortSignal?: AbortSignal
  ): Promise<AIGenerationResult>;
}

/**
 * AI供应商基础抽象类
 * 提供通用的超时处理和错误处理功能
 */
export abstract class BaseAIProvider implements AIProvider {
  
  /**
   * 创建带超时的 fetch 请求
   */
  protected createTimeoutFetch(timeoutMs = 15000) {
    return (url: string, options: any = {}) => {
      return Promise.race([
        fetch(url, options),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('请求超时')), timeoutMs)
        )
      ]);
    };
  }

  /**
   * 创建带超时的 Promise 调用
   */
  protected async withTimeout<T>(promise: Promise<T>, timeoutMs = 15000): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('请求超时')), timeoutMs)
      )
    ]);
  }

  /**
   * 创建智能超时 - 基于活动状态的超时判断
   */
  protected async withSmartTimeout<T>(
    promise: Promise<T>, 
    timeoutMs = 60000,
    activityCheckMs = 5000,
    onActivityCheck?: () => boolean
  ): Promise<T> {
    let isActive = true;
    let lastActivityTime = Date.now();
    
    const activityChecker = setInterval(() => {
      const now = Date.now();
      const hasActivity = onActivityCheck ? onActivityCheck() : true;
      
      if (hasActivity) {
        lastActivityTime = now;
      }
      
      if (now - lastActivityTime > timeoutMs) {
        isActive = false;
      }
    }, activityCheckMs);

    const timeoutPromise = new Promise<never>((_, reject) => {
      const checkTimeout = () => {
        if (!isActive) {
          clearInterval(activityChecker);
          reject(new Error('请求超时'));
          return;
        }
        setTimeout(checkTimeout, activityCheckMs);
      };
      setTimeout(checkTimeout, activityCheckMs);
    });

    try {
      const result = await Promise.race([promise, timeoutPromise]);
      clearInterval(activityChecker);
      return result;
    } catch (error) {
      clearInterval(activityChecker);
      throw error;
    }
  }

  /**
   * 处理常见错误并返回用户友好的错误消息
   */
  protected handleCommonError(error: any, providerName: string): string {
    if (error.message?.includes('请求超时')) {
      return '连接超时，请检查网络或服务器状态';
    }
    if (error.message?.includes('API key') || error.message?.includes('authentication')) {
      return 'API Key 无效或已过期';
    }
    if (error.message?.includes('network') || error.message?.includes('ECONNREFUSED')) {
      return '无法连接到服务器，请检查网络连接';
    }
    return error.message || '未知错误';
  }

  /**
   * 统一的提示词构建方法
   * 使用提示词模板管理器来构建系统提示词和用户提示词
   */
  protected buildPrompts(request: AIGenerationRequest, config: AIConfig): { systemPrompt: string; userPrompt: string } {
    return buildPrompts(request, config);
  }

  /**
   * 创建生成结果
   */
  protected createGenerationResult(
    request: AIGenerationRequest, 
    config: AIConfig, 
    model: string, 
    generatedPrompt: string
  ): AIGenerationResult {
    return {
      id: `gen_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      configId: config.configId,
      topic: request.topic,
      generatedPrompt: generatedPrompt,
      model: model,
      customPrompt: request.customPrompt,
      createdAt: new Date()
    };
  }

  // 抽象方法，子类必须实现
  abstract testConfig(config: AIConfig): Promise<AITestResult>;
  abstract getAvailableModels(config: AIConfig): Promise<string[]>;
  abstract intelligentTest(config: AIConfig): Promise<AIIntelligentTestResult>;
  abstract generatePrompt(request: AIGenerationRequest & { config: AIConfig }): Promise<AIGenerationResult>;
  abstract generatePromptWithStream(
    request: AIGenerationRequest,
    config: AIConfig,
    onProgress: (charCount: number, partialContent?: string) => boolean,
    abortSignal?: AbortSignal
  ): Promise<AIGenerationResult>;
} 