import { ChatOpenAI } from '@langchain/openai';
import { AIConfig, AIGenerationRequest, AIGenerationResult, AIModelListResult } from '@shared/types/ai';
import {
  getConfiguredBaseURL,
  getDefaultModels as getProviderDefaultModels,
  getTestModelPriority
} from '@shared/ai-provider-metadata';
import { BaseAIProvider, AITestResult, AIIntelligentTestResult, AIModelTestResult } from './base-provider';
import { resolveTestPrompt } from '@shared/ai-default-prompts';

/**
 * OpenAI 兼容供应商（OpenAI、DeepSeek、Mistral等）
 */
export class OpenAICompatibleProvider extends BaseAIProvider {
  private readonly providersWithoutModelList = new Set<AIConfig['type']>(['aliyun', 'tencent']);

  private getBaseURL(config: AIConfig): string {
    return getConfiguredBaseURL(config.type, config.baseURL);
  }

  private getModelListURL(config: AIConfig): string {
    if (config.type === 'deepseek') {
      return this.getBaseURL(config).replace(/\/v1$/, '') + '/models';
    }

    return `${this.getBaseURL(config)}/models`;
  }

  private parseModelsResponse(data: any): string[] {
    const rawModels = Array.isArray(data) ? data : data?.data;
    if (!Array.isArray(rawModels)) {
      return [];
    }

    return rawModels
      .map((model: any) => model?.id)
      .filter((id: unknown): id is string => typeof id === 'string' && id.trim().length > 0);
  }

  private async fetchRemoteModels(config: AIConfig): Promise<string[]> {
    const url = this.getModelListURL(config);
    console.log(`${config.type} 请求URL: ${url}`);

    const timeoutFetch = this.createTimeoutFetch(10000);
    const response = await timeoutFetch(url, {
      headers: buildOpenAICompatibleHeaders(config)
    });
    console.log(`${config.type} 响应状态: ${response.status}`);

    if (!response.ok) {
      const errorData = await response.text().catch(() => response.statusText);
      throw new Error(`模型列表请求失败: HTTP ${response.status} ${errorData}`);
    }

    const data = await response.json();
    console.log(`${config.type} 响应数据:`, data);

    const models = this.parseModelsResponse(data);
    console.log(`${config.type} 解析出的模型列表:`, models);
    return models;
  }

  private async validateDefaultModel(config: AIConfig): Promise<void> {
    const model = this.findSuitableTestModel(this.getDefaultModels(config.type), config.type);
    const timeoutFetch = this.createTimeoutFetch(20000);
    const response = await timeoutFetch(`${this.getBaseURL(config)}/chat/completions`, {
      method: 'POST',
      headers: buildOpenAICompatibleHeaders(config),
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 1,
        stream: false
      })
    });

    if (!response.ok) {
      const errorData = await response.text().catch(() => response.statusText);
      throw new Error(`连接测试失败: HTTP ${response.status} ${errorData}`);
    }
  }

  
  /**
   * 测试配置连接
   */
  async testConfig(config: AIConfig): Promise<AITestResult> {
    console.log(`测试 ${config.type} 连接，使用 baseURL: ${config.baseURL}`);
    
    try {
      if (this.providersWithoutModelList.has(config.type)) {
        await this.validateDefaultModel(config);
        const models = this.getDefaultModels(config.type);
        return {
          success: true,
          models,
          modelSource: 'default',
          modelListMessage: `${config.type} 未提供可用的远端模型列表接口，已使用内置默认模型`,
          error: `✅ 连接成功！${config.type} 未提供可用的远端模型列表接口，已使用内置默认模型`
        };
      }

      const models = await this.fetchRemoteModels(config);
      console.log(`${config.type} 获取到模型列表:`, models);
      
      if (models.length > 0) {
        console.log(`${config.type} 连接测试成功，获取到 ${models.length} 个模型`);
        return { 
          success: true, 
          models,
          modelSource: 'remote',
          modelListMessage: `已从远端获取到 ${models.length} 个可用模型`,
          error: `✅ 连接成功！获取到 ${models.length} 个可用模型`
        };
      } else {
        const defaultModels = this.getDefaultModels(config.type);
        console.log(`${config.type} 连接成功但远端模型列表为空，使用默认模型列表`);
        return { 
          success: true, 
          models: defaultModels,
          modelSource: defaultModels.length > 0 ? 'default' : 'unavailable',
          modelListMessage: defaultModels.length > 0 ? '远端模型列表为空，已使用内置默认模型' : '远端模型列表为空，请手动添加模型',
          error: defaultModels.length > 0 ? `✅ 连接成功！远端模型列表为空，使用默认模型` : `✅ 连接成功！但未获取到模型列表`
        };
      }
    } catch (error: any) {
      console.error(`${config.type} 连接测试失败:`, error);
      const errorMessage = this.handleCommonError(error, config.type);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * 获取可用模型列表
   */
  async getAvailableModels(config: AIConfig): Promise<AIModelListResult> {
    console.log(`获取 ${config.type} 模型列表 - baseURL: ${config.baseURL}`);
    
    if (this.providersWithoutModelList.has(config.type)) {
      return { models: this.getDefaultModels(config.type), modelSource: 'default' };
    }

    // 拿不到时不再直接返回内置列表，常见模型只作为备选交给界面
    return this.resolveModelList(() => this.fetchRemoteModels(config), this.getDefaultModels(config.type));
  }

  /**
   * 测试特定模型
   */
  async testModel(config: AIConfig, model: string, prompt?: string): Promise<AIModelTestResult> {
    console.log(`测试 ${config.type} 模型: ${model}`);
    
    try {
      const testPrompt = resolveTestPrompt(prompt);
      
      const llm = new ChatOpenAI({
        openAIApiKey: config.apiKey,
        modelName: model,
        configuration: {
          baseURL: this.getBaseURL(config) || undefined
        }
      });

      const response = await this.withTimeout(llm.invoke(testPrompt), 20000);
      const responseText = typeof response === 'string' ? response : (response as any)?.content || '测试成功';
      
      console.log(`${config.type} 模型 ${model} 测试成功`);
      return {
        success: true,
        model,
        response: responseText,
        error: `✅ 模型 ${model} 测试成功！AI 响应正常`
      };
    } catch (error: any) {
      console.error(`${config.type} 模型 ${model} 测试失败:`, error);
      const errorMessage = this.handleCommonError(error, config.type);
      return {
        success: false,
        model,
        error: `❌ 模型 ${model} 测试失败: ${errorMessage}`
      };
    }
  }

  /**
   * 智能测试
   */
  async intelligentTest(config: AIConfig, prompt?: string): Promise<AIIntelligentTestResult> {
    if (!config.enabled) {
      return { success: false, error: '配置已禁用' };
    }

    const model = config.defaultModel || config.customModel;
    if (!model) {
      return { success: false, error: '未设置默认模型' };
    }

    const testPrompt = resolveTestPrompt(prompt);

    try {
      const llm = new ChatOpenAI({
        openAIApiKey: config.apiKey,
        modelName: model,
        configuration: {
          baseURL: this.getBaseURL(config) || undefined
        }
      });

      const response = await this.withTimeout(llm.invoke(testPrompt), 20000);
      const responseText = typeof response === 'string' ? response : (response as any)?.content || '测试成功';

      return {
        success: true,
        response: responseText,
        inputPrompt: testPrompt
      };
    } catch (error: any) {
      console.error(`${config.type} 智能测试失败:`, error);
      const errorMessage = this.handleCommonError(error, config.type);
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

    const model = request.model || config.defaultModel || config.customModel;
    if (!model) {
      throw new Error('未指定模型');
    }

    const { systemPrompt, userPrompt } = this.buildPrompts(request, config);

    try {
      const llm = new ChatOpenAI({
        openAIApiKey: config.apiKey,
        modelName: model,
        configuration: {
          baseURL: this.getBaseURL(config) || undefined
        }
      });

      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ];
      
      const response = await this.withSmartTimeout(
        llm.invoke(messages), 
        90000,
        5000,
        () => true
      );
      const generatedPrompt = typeof response === 'string' ? response : (response as any)?.content || '';

      return this.createGenerationResult(request, config, model, generatedPrompt);
    } catch (error: any) {
      console.error(`${config.type} 生成提示词失败:`, error);
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
    const model = request.model || config.defaultModel || config.customModel;
    
    if (!model) {
      throw new Error('未指定模型');
    }

    if (!config.enabled) {
      throw new Error('配置已禁用');
    }

    const { systemPrompt, userPrompt } = this.buildPrompts(request, config);

    try {
      const llm = new ChatOpenAI({
        openAIApiKey: config.apiKey,
        modelName: model,
        configuration: {
          baseURL: this.getBaseURL(config) || undefined
        },
        streaming: true
      });

      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ];
      
      let accumulatedContent = '';
      let lastContentUpdate = Date.now();
      let shouldStop = false;
      
      if (abortSignal?.aborted) {
        throw new Error('生成已被中断');
      }
      
      try {
        const streamPromise = (async () => {
          const stream = await llm.stream(messages);
          for await (const chunk of stream) {
            if (abortSignal?.aborted || shouldStop) {
              console.log('检测到中断信号，停止流式生成');
              break;
            }
            
            const content = typeof chunk === 'string' ? chunk : (chunk as any)?.content;
            if (content) {
              accumulatedContent += content;
              lastContentUpdate = Date.now();
              
              const continueGeneration = onProgress(accumulatedContent.length, accumulatedContent);
              if (continueGeneration === false) {
                console.log('前端请求停止生成');
                shouldStop = true;
                break;
              }
            }
          }
        })();
        
        await this.withSmartTimeout(
          streamPromise, 
          60000,
          2000,
          () => {
            if (shouldStop || abortSignal?.aborted) {
              return false;
            }
            
            const now = Date.now();
            const timeSinceLastUpdate = now - lastContentUpdate;
            return timeSinceLastUpdate < 5000;
          }
        );
        
      } catch (streamError) {
        if (shouldStop || abortSignal?.aborted) {
          throw new Error('用户中断生成');
        }
        
        console.warn('流式传输失败，回退到普通调用:', streamError);
        if (streamError instanceof Error && streamError.message?.includes('请求超时')) {
          const now = Date.now();
          const timeSinceLastUpdate = now - lastContentUpdate;
          if (timeSinceLastUpdate > 10000 && accumulatedContent.length === 0) {
            throw new Error('生成超时，AI服务可能无响应，请检查网络连接或服务状态');
          } else if (timeSinceLastUpdate > 30000) {
            console.warn('检测到生成可能已完成，但连接未正常关闭，使用已有内容');
          } else {
            throw new Error(`生成中断，已生成${accumulatedContent.length}字符，请重试或检查网络连接`);
          }
        }
        
        if (accumulatedContent.length === 0) {
          if (abortSignal?.aborted || shouldStop) {
            throw new Error('用户中断生成');
          }
          
          const response = await this.withSmartTimeout(
            llm.invoke(messages), 
            90000,
            5000,
            () => true
          );
          accumulatedContent = typeof response === 'string' ? response : (response as any)?.content || '';
          
          const totalChars = accumulatedContent.length;
          for (let i = 0; i <= totalChars; i += Math.ceil(totalChars / 20)) {
            if (abortSignal?.aborted || shouldStop) {
              throw new Error('用户中断生成');
            }
            
            const currentCharCount = Math.min(i, totalChars);
            const partialContent = accumulatedContent.substring(0, currentCharCount);
            const continueGeneration = onProgress(currentCharCount, partialContent);
            if (continueGeneration === false) {
              throw new Error('用户中断生成');
            }
            await new Promise(resolve => setTimeout(resolve, 50));
          }
        }
      }

      if (shouldStop || abortSignal?.aborted) {
        throw new Error('用户中断生成');
      }

      return this.createGenerationResult(request, config, model, accumulatedContent);
    } catch (error: any) {
      console.error(`${config.type} 流式生成提示词失败:`, error);
      if (error.message?.includes('请求超时')) {
        throw new Error('生成超时，请检查网络连接或服务状态');
      }
      throw error;
    }
  }



  /**
   * 查找适合测试的模型
   * 优先选择文本对话模型，避免图像生成等特殊模型
   */
  private findSuitableTestModel(models: string[], providerType: AIConfig['type']): string {
    // 定义适合测试的模型关键词
    const suitableKeywords = [
      'chat', 'instruct', 'text', 'gpt', 'claude', 'gemini', 'qwen', 'glm', 'deepseek', 'mistral', 'hunyuan'
    ];
    
    // 定义不适合测试的模型关键词
    const unsuitableKeywords = [
      'stable-diffusion', 'dall-e', 'midjourney', 'image', 'vision', 'embedding', 'reranker', 'speech', 'audio', 'tts', 'fish-speech', 'cosyvoice', 'moss-ttsd', 'gpt-sovits'
    ];
    
    // 首先尝试使用服务商特定的推荐模型
    const providerModels = getTestModelPriority(providerType);
    if (providerModels) {
      for (const recommendedModel of providerModels) {
        if (models.includes(recommendedModel)) {
          return recommendedModel;
        }
      }
    }
    
    // 然后尝试找到包含合适关键词的模型
    for (const model of models) {
      const lowerModel = model.toLowerCase();
      
      // 检查是否包含不适合的关键词
      const hasUnsuitableKeyword = unsuitableKeywords.some(keyword => 
        lowerModel.includes(keyword)
      );
      
      if (hasUnsuitableKeyword) {
        continue;
      }
      
      // 检查是否包含合适的关键词
      const hasSuitableKeyword = suitableKeywords.some(keyword => 
        lowerModel.includes(keyword)
      );
      
      if (hasSuitableKeyword) {
        return model;
      }
    }
    
    // 如果没有找到合适的模型，尝试找到不包含不适合关键词的模型
    for (const model of models) {
      const lowerModel = model.toLowerCase();
      const hasUnsuitableKeyword = unsuitableKeywords.some(keyword => 
        lowerModel.includes(keyword)
      );
      
      if (!hasUnsuitableKeyword) {
        return model;
      }
    }
    
    // 如果都找不到，返回第一个模型
    return models[0];
  }

  /**
   * 获取默认模型列表
   */
  private getDefaultModels(providerType: AIConfig['type']): string[] {
    return getProviderDefaultModels(providerType);
  }
} 

function buildOpenAICompatibleHeaders(config: AIConfig): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  if (config.apiKey) {
    headers.Authorization = `Bearer ${config.apiKey}`;
  }

  if (config.type === 'openrouter') {
    headers['HTTP-Referer'] = 'https://getaigist.com';
    headers['X-OpenRouter-Title'] = 'AI Gist';
    headers['X-Title'] = 'AI Gist';
  }

  return headers;
}
