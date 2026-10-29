import { ChatAnthropic } from '@langchain/anthropic';
import { AIConfig, AIGenerationRequest, AIGenerationResult, AIModelListResult } from '@shared/types/ai';
import { getDefaultModels as getProviderDefaultModels } from '@shared/ai-provider-metadata';
import { BaseAIProvider, AITestResult, AIIntelligentTestResult, AIModelTestResult } from './base-provider';
import { resolveTestPrompt } from '@shared/ai-default-prompts';

/**
 * Anthropic 供应商实现
 */
export class AnthropicProvider extends BaseAIProvider {
  private getBaseURL(config: AIConfig): string {
    return (config.baseURL || 'https://api.anthropic.com').replace(/\/+$/, '');
  }

  private async fetchRemoteModels(config: AIConfig): Promise<string[]> {
    const url = `${this.getBaseURL(config)}/v1/models`;
    console.log(`Anthropic 请求URL: ${url}`);

    const timeoutFetch = this.createTimeoutFetch(10000);
    const response = await timeoutFetch(url, {
      headers: {
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      }
    });
    console.log(`Anthropic 响应状态: ${response.status}`);

    if (!response.ok) {
      const errorData = await response.text().catch(() => response.statusText);
      throw new Error(`模型列表请求失败: HTTP ${response.status} ${errorData}`);
    }

    const data = await response.json();
    console.log(`Anthropic 响应数据:`, data);

    return data.data
      ?.map((model: any) => model.id)
      .filter((id: unknown): id is string => typeof id === 'string' && id.trim().length > 0) || [];
  }
  
  /**
   * 测试配置连接
   */
  async testConfig(config: AIConfig): Promise<AITestResult> {
    console.log(`测试 Anthropic 连接，使用 baseURL: ${config.baseURL}`);
    
    try {
      const models = await this.fetchRemoteModels(config);
      console.log(`Anthropic 获取到模型列表:`, models);
      
      if (models.length > 0) {
        console.log(`Anthropic 连接测试成功，获取到 ${models.length} 个模型`);
        return { 
          success: true, 
          models,
          modelSource: 'remote',
          modelListMessage: `已从远端获取到 ${models.length} 个可用模型`,
          error: `✅ 连接成功！获取到 ${models.length} 个可用模型`
        };
      } else {
        const defaultModels = this.getDefaultModels();
        console.log(`Anthropic 连接成功但未获取到模型，使用默认模型列表`);
        return { 
          success: true, 
          models: defaultModels,
          modelSource: defaultModels.length > 0 ? 'default' : 'unavailable',
          modelListMessage: defaultModels.length > 0 ? '远端模型列表为空，已使用内置默认模型' : '远端模型列表为空，请手动添加模型',
          error: `✅ 连接成功！但未获取到模型列表，使用默认模型`
        };
      }
    } catch (error: any) {
      console.error(`Anthropic 连接测试失败:`, error);
      const errorMessage = this.handleCommonError(error, 'anthropic');
      return { success: false, error: errorMessage };
    }
  }

  /**
   * 获取可用模型列表
   */
  async getAvailableModels(config: AIConfig): Promise<AIModelListResult> {
    console.log(`获取 Anthropic 模型列表 - baseURL: ${config.baseURL}`);
    // 拿不到时不再直接返回内置列表，常见模型只作为备选交给界面
    return this.resolveModelList(() => this.fetchRemoteModels(config), this.getDefaultModels());
  }

  /**
   * 测试特定模型
   */
  async testModel(config: AIConfig, model: string, prompt?: string): Promise<AIModelTestResult> {
    console.log(`测试 Anthropic 模型: ${model}`);
    
    try {
      const testPrompt = resolveTestPrompt(prompt);
      
      const llm = new ChatAnthropic({
        anthropicApiKey: config.apiKey,
        modelName: model,
        ...(config.baseURL && { baseURL: config.baseURL })
      });

      const response = await this.withTimeout(llm.invoke(testPrompt), 20000);
      const responseText = typeof response === 'string' ? response : (response as any)?.content || '测试成功';
      
      console.log(`Anthropic 模型 ${model} 测试成功`);
      return {
        success: true,
        model,
        response: responseText,
        error: `✅ 模型 ${model} 测试成功！AI 响应正常`
      };
    } catch (error: any) {
      console.error(`Anthropic 模型 ${model} 测试失败:`, error);
      const errorMessage = this.handleCommonError(error, 'anthropic');
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
      const llm = new ChatAnthropic({
        anthropicApiKey: config.apiKey,
        modelName: model,
        ...(config.baseURL && { baseURL: config.baseURL })
      });

      const response = await this.withTimeout(llm.invoke(testPrompt), 20000);
      const responseText = typeof response === 'string' ? response : (response as any)?.content || '测试成功';

      return {
        success: true,
        response: responseText,
        inputPrompt: testPrompt
      };
    } catch (error: any) {
      console.error(`Anthropic 智能测试失败:`, error);
      const errorMessage = this.handleCommonError(error, 'anthropic');
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
      const llm = new ChatAnthropic({
        anthropicApiKey: config.apiKey,
        modelName: model,
        ...(config.baseURL && { baseURL: config.baseURL })
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
      console.error(`Anthropic 生成提示词失败:`, error);
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
      const llm = new ChatAnthropic({
        anthropicApiKey: config.apiKey,
        modelName: model,
        ...(config.baseURL && { baseURL: config.baseURL }),
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
        
      } catch (streamError: any) {
        console.error('Anthropic 流式传输失败，回退到普通调用:', streamError);
        
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
      console.error(`Anthropic 流式生成提示词失败:`, error);
      if (error.message?.includes('请求超时')) {
        throw new Error('生成超时，请检查网络连接或服务状态');
      }
      throw error;
    }
  }



  /**
   * 获取默认模型列表
   */
  private getDefaultModels(): string[] {
    return getProviderDefaultModels('anthropic');
  }
} 
