import { AIConfig, AIGenerationRequest, AIGenerationResult, AIModelListResult } from '@shared/types/ai';
import {
  getDefaultModels as getProviderDefaultModels,
  getTestModelPriority
} from '@shared/ai-provider-metadata';
import { BaseAIProvider, AITestResult, AIIntelligentTestResult, AIModelTestResult } from './base-provider';
import { resolveTestPrompt } from '@shared/ai-default-prompts';

/**
 * Google Gemini 供应商实现
 * 直接使用 Google Gemini REST API，避免 LangChain 的代理问题
 */
export class GoogleProvider extends BaseAIProvider {
  private readonly defaultBaseURL = 'https://generativelanguage.googleapis.com';
  private readonly apiVersion = 'v1beta';

  private getDefaultModel(): string {
    return this.getDefaultModels()[0];
  }

  private getBaseURL(config: AIConfig): string {
    return config.baseURL?.trim() || this.defaultBaseURL;
  }

  private async fetchRemoteModels(config: AIConfig): Promise<string[]> {
    if (!config.apiKey) {
      throw new Error('API Key 未设置');
    }

    const baseUrl = this.getBaseURL(config);
    const url = `${baseUrl}/${this.apiVersion}/models?key=${encodeURIComponent(config.apiKey)}`;
    console.log(`Google Gemini 请求URL: ${url.replace(config.apiKey || '', (config.apiKey || '').substring(0, 10) + '...')}`);

    const timeoutFetch = this.createTimeoutFetch(20000);
    const response = await timeoutFetch(url, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    console.log(`Google Gemini 响应状态: ${response.status}`);

    if (!response.ok) {
      const errorData = await response.text().catch(() => response.statusText);
      throw new Error(`模型列表请求失败: HTTP ${response.status} ${errorData}`);
    }

    const data = await response.json();
    console.log(`Google Gemini 响应数据:`, data);

    return data.models?.map((model: any) => {
      const name = model.name || '';
      return name.replace('models/', '');
    }).filter((name: string, index: number, array: string[]) => {
      const model = data.models[index];
      const supportedMethods = model?.supportedGenerationMethods || model?.supported_actions || model?.supportedActions || [];
      return name.startsWith('gemini') && (
        supportedMethods.length === 0 || supportedMethods.includes('generateContent')
      ) && array.indexOf(name) === index;
    }) || [];
  }

  
  /**
   * 测试配置连接
   */
  async testConfig(config: AIConfig): Promise<AITestResult> {
    console.log(`测试 Google Gemini 连接，使用 baseURL: ${config.baseURL}`);
    
    try {
      const models = await this.fetchRemoteModels(config);
      console.log(`Google Gemini 获取到模型列表:`, models);
      
      if (models.length > 0) {
        console.log(`Google Gemini 连接测试成功，获取到 ${models.length} 个模型`);
        return { 
          success: true, 
          models,
          modelSource: 'remote',
          modelListMessage: `已从远端获取到 ${models.length} 个可用模型`,
          error: `✅ 连接成功！获取到 ${models.length} 个可用模型`
        };
      } else {
        const defaultModels = this.getDefaultModels();
        console.log(`Google Gemini 连接成功但未获取到模型，使用默认模型列表`);
        return { 
          success: true, 
          models: defaultModels,
          modelSource: defaultModels.length > 0 ? 'default' : 'unavailable',
          modelListMessage: defaultModels.length > 0 ? '远端模型列表为空，已使用内置默认模型' : '远端模型列表为空，请手动添加模型',
          error: `✅ 连接成功！但未获取到模型列表，使用默认模型`
        };
      }
    } catch (error: any) {
      console.error(`Google Gemini 连接测试失败:`, error);
      const errorMessage = this.handleGoogleError(error);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * 获取可用模型列表
   */
  async getAvailableModels(config: AIConfig): Promise<AIModelListResult> {
    console.log(`获取 Google Gemini 模型列表 - baseURL: ${config.baseURL}`);
    // 拿不到时不再直接返回内置列表，常见模型只作为备选交给界面
    return this.resolveModelList(() => this.fetchRemoteModels(config), this.getDefaultModels());
  }

  /**
   * 智能测试
   */
  async intelligentTest(config: AIConfig, prompt?: string): Promise<AIIntelligentTestResult> {
    if (!config.enabled) {
      return { success: false, error: '配置已禁用' };
    }

    const model = config.defaultModel || config.customModel || this.getDefaultModel();
    const testPrompt = resolveTestPrompt(prompt);

    try {
      const response = await this.makeGoogleRequest(config, model, testPrompt);
      
      return {
        success: true,
        response: response,
        inputPrompt: testPrompt
      };
    } catch (error: any) {
      console.error(`Google Gemini 智能测试失败:`, error);
      const errorMessage = this.handleGoogleError(error);
      return { 
        success: false, 
        error: errorMessage,
        inputPrompt: testPrompt
      };
    }
  }

  /**
   * 生成提示词
   */
  async generatePrompt(request: AIGenerationRequest & { config: AIConfig }): Promise<AIGenerationResult> {
    const { config } = request;
    
    if (!config.enabled) {
      throw new Error('配置已禁用');
    }

    const model = request.model || config.defaultModel || config.customModel || this.getDefaultModel();
    if (!model) {
      throw new Error('未指定模型');
    }

    const { systemPrompt, userPrompt } = this.buildPrompts(request, config);

    try {
      const response = await this.makeGoogleRequest(config, model, userPrompt, systemPrompt);
      return this.createGenerationResult(request, config, model, response);
    } catch (error: any) {
      console.error(`Google Gemini 生成提示词失败:`, error);
      if (error.message?.includes('请求超时')) {
        throw new Error('生成超时，请检查网络连接或服务状态');
      }
      throw error;
    }
  }

  /**
   * 流式生成提示词
   */
  async generatePromptWithStream(
    request: AIGenerationRequest,
    config: AIConfig,
    onProgress: (charCount: number, partialContent?: string) => boolean,
    abortSignal?: AbortSignal
  ): Promise<AIGenerationResult> {
    const model = request.model || config.defaultModel || config.customModel || this.getDefaultModel();
    
    if (!model) {
      throw new Error('未指定模型');
    }

    if (!config.enabled) {
      throw new Error('配置已禁用');
    }

    const { systemPrompt, userPrompt } = this.buildPrompts(request, config);

    try {
      let accumulatedContent = '';
      let shouldStop = false;
      
      if (abortSignal?.aborted) {
        throw new Error('生成已被中断');
      }
      
      try {
        // Google Gemini 暂时使用普通请求，因为流式请求在代理环境下有问题
        console.log('Google Gemini 使用普通请求模式');
        const response = await this.makeGoogleRequest(config, model, userPrompt, systemPrompt);
        accumulatedContent = response;
        
        // 模拟流式效果
        const totalChars = accumulatedContent.length;
        const chunkSize = Math.max(1, Math.ceil(totalChars / 50)); // 分成50个块
        
        for (let i = 0; i <= totalChars; i += chunkSize) {
          if (abortSignal?.aborted || shouldStop) {
            throw new Error('用户中断生成');
          }
          
          const currentCharCount = Math.min(i + chunkSize, totalChars);
          const partialContent = accumulatedContent.substring(0, currentCharCount);
          const continueGeneration = onProgress(currentCharCount, partialContent);
          
          if (continueGeneration === false) {
            console.log('前端请求停止生成');
            shouldStop = true;
            break;
          }
          
          // 添加小延迟模拟流式效果
          await new Promise(resolve => setTimeout(resolve, 30));
        }
        
      } catch (requestError: any) {
        if (shouldStop || abortSignal?.aborted) {
          throw new Error('用户中断生成');
        }
        
        console.error('Google Gemini 请求失败:', requestError);
        throw requestError;
      }

      if (shouldStop || abortSignal?.aborted) {
        throw new Error('用户中断生成');
      }

      return this.createGenerationResult(request, config, model, accumulatedContent);
    } catch (error: any) {
      console.error(`Google Gemini 流式生成提示词失败:`, error);
      if (error.message?.includes('请求超时')) {
        throw new Error('生成超时，请检查网络连接或服务状态');
      }
      throw error;
    }
  }

  /**
   * 创建 Google Gemini API 请求
   */
  private async makeGoogleRequest(config: AIConfig, model: string, userPrompt: string, systemPrompt?: string): Promise<string> {
    const baseUrl = this.getBaseURL(config);
    const url = `${baseUrl}/${this.apiVersion}/models/${model}:generateContent?key=${config.apiKey}`;
    
    // Google Gemini 使用不同的消息格式
    let promptText = userPrompt;
    if (systemPrompt) {
      // 将系统提示词和用户提示词合并
      promptText = `${systemPrompt}\n\n${userPrompt}`;
    }
    
    const requestBody = {
      contents: [
        {
          parts: [{ text: promptText }]
        }
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 4096
      }
    };

    console.log(`Google Gemini 请求 URL: ${url.replace(config.apiKey || '', (config.apiKey || '').substring(0, 10) + '...')}`);
    console.log(`Google Gemini 请求体:`, JSON.stringify(requestBody, null, 2));

    const timeoutFetch = this.createTimeoutFetch(60000); // Google Gemini 可能需要更长时间
    const response = await timeoutFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    console.log(`Google Gemini 响应状态: ${response.status}`);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error(`Google Gemini API 错误:`, errorData);
      
      // 更精确的错误处理
      if (response.status === 400) {
        throw new Error(`请求参数错误: ${errorData.error?.message || '请检查模型名称和请求格式'}`);
      } else if (response.status === 401) {
        throw new Error('API Key 认证失败，请检查 API Key 是否有效');
      } else if (response.status === 403) {
        throw new Error('API Key 权限不足，请检查 API Key 权限');
      } else if (response.status === 429) {
        throw new Error('请求频率超限，请稍后重试');
      } else if (response.status === 500) {
        throw new Error('Google 服务器内部错误，请稍后重试');
      } else {
        throw new Error(`HTTP ${response.status}: ${errorData.error?.message || response.statusText}`);
      }
    }

    const data = await response.json();
    console.log(`Google Gemini 响应数据:`, data);
    
    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!responseText) {
      console.warn('Google Gemini 响应中没有找到文本内容:', data);
      throw new Error('API 响应格式异常，请重试');
    }
    
    return responseText;
  }

  /**
   * 查找适合测试的模型
   */
  private findSuitableTestModel(models: string[]): string {
    // Google Gemini 的推荐测试模型优先级
    const recommendedModels = getTestModelPriority('google');
    
    // 首先尝试使用推荐的模型
    for (const recommendedModel of recommendedModels) {
      if (models.includes(recommendedModel)) {
        return recommendedModel;
      }
    }
    
    // 如果没有找到推荐模型，返回第一个模型
    return models[0];
  }

  /**
   * 处理 Google Gemini 特定错误
   */
  private handleGoogleError(error: any): string {
    const errorMessage = error.message || error.toString();
    
    // 检查是否是网络相关错误
    if (errorMessage?.includes('请求超时') || errorMessage?.includes('timeout')) {
      return '连接超时，请检查网络或服务器状态';
    }
    if (errorMessage?.includes('network') || errorMessage?.includes('ECONNREFUSED') || errorMessage?.includes('ENOTFOUND')) {
      return '无法连接到服务器，请检查网络连接';
    }
    
    // 检查是否是 API 相关错误
    if (errorMessage?.includes('API Key 认证失败')) {
      return 'API Key 认证失败，请检查 API Key 是否有效';
    }
    if (errorMessage?.includes('API Key 权限不足')) {
      return 'API Key 权限不足，请检查 API Key 权限';
    }
    if (errorMessage?.includes('请求频率超限')) {
      return '请求频率超限，请稍后重试';
    }
    if (errorMessage?.includes('请求参数错误')) {
      return '请求参数错误，请检查模型名称和请求格式';
    }
    if (errorMessage?.includes('Google 服务器内部错误')) {
      return 'Google 服务器内部错误，请稍后重试';
    }
    
    // 检查 HTTP 状态码
    if (errorMessage?.includes('HTTP 400')) {
      return '请求参数错误，请检查模型名称和请求格式';
    }
    if (errorMessage?.includes('HTTP 401')) {
      return 'API Key 认证失败，请检查 API Key 是否有效';
    }
    if (errorMessage?.includes('HTTP 403')) {
      return 'API Key 权限不足，请检查 API Key 权限';
    }
    if (errorMessage?.includes('HTTP 429')) {
      return '请求频率超限，请稍后重试';
    }
    if (errorMessage?.includes('HTTP 500')) {
      return 'Google 服务器内部错误，请稍后重试';
    }
    
    // 如果没有匹配到特定错误，返回原始错误信息
    return errorMessage || '未知错误';
  }



  /**
   * 测试特定模型
   */
  async testModel(config: AIConfig, model: string, prompt?: string): Promise<AIModelTestResult> {
    console.log(`测试 Google Gemini 模型: ${model}`);
    
    try {
      const testPrompt = resolveTestPrompt(prompt);
      const response = await this.makeGoogleRequest(config, model, testPrompt);
      
      console.log(`Google Gemini 模型 ${model} 测试成功`);
      return {
        success: true,
        model,
        response,
        error: `✅ 模型 ${model} 测试成功！AI 响应正常`
      };
    } catch (error: any) {
      console.error(`Google Gemini 模型 ${model} 测试失败:`, error);
      const errorMessage = this.handleGoogleError(error);
      return {
        success: false,
        model,
        error: `❌ 模型 ${model} 测试失败: ${errorMessage}`
      };
    }
  }

  /**
   * 获取默认模型列表
   */
  private getDefaultModels(): string[] {
    return getProviderDefaultModels('google');
  }
} 
