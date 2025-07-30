import { ChatOpenAI } from '@langchain/openai';
import { AIConfig, AIGenerationRequest, AIGenerationResult } from '@shared/types/ai';
import { BaseAIProvider, AITestResult, AIIntelligentTestResult, AIModelTestResult } from './base-provider';

/**
 * OpenRouter 供应商实现
 * 基于 OpenRouter 官方 API 文档：https://openrouter.ai/docs
 */
export class OpenRouterProvider extends BaseAIProvider {
  
  /**
   * 测试配置连接
   */
  async testConfig(config: AIConfig): Promise<AITestResult> {
    console.log(`测试 OpenRouter 连接，使用 baseURL: ${config.baseURL}`);
    
    try {
      // 只测试连接和获取模型列表，不测试具体模型
      const models = await this.getAvailableModels(config);
      console.log(`OpenRouter 获取到模型列表:`, models);
      
      if (models.length > 0) {
        console.log(`OpenRouter 连接测试成功，获取到 ${models.length} 个模型`);
        return { 
          success: true, 
          models,
          error: `✅ 连接成功！获取到 ${models.length} 个可用模型`
        };
      } else {
        console.log(`OpenRouter 连接成功但未获取到模型，使用默认模型列表`);
        return { 
          success: true, 
          models: this.getDefaultModels(),
          error: `✅ 连接成功！但未获取到模型列表，使用默认模型`
        };
      }
    } catch (error: any) {
      console.error(`OpenRouter 连接测试失败:`, error);
      const errorMessage = this.handleCommonError(error, 'openrouter');
      return { success: false, error: errorMessage };
    }
  }

  /**
   * 获取可用模型列表
   */
  async getAvailableModels(config: AIConfig): Promise<string[]> {
    console.log(`获取 OpenRouter 模型列表 - baseURL: ${config.baseURL}`);
    
    try {
      const url = `${config.baseURL || 'https://openrouter.ai/api/v1'}/models`;
      console.log(`OpenRouter 请求URL: ${url}`);
      
      const timeoutFetch = this.createTimeoutFetch(10000);
      const response = await timeoutFetch(url, {
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://getaigist.com', // OpenRouter 要求提供 referer
          'X-Title': 'AI Gist' // OpenRouter 要求提供应用名称
        }
      });
      console.log(`OpenRouter 响应状态: ${response.status}`);
      
      if (response.ok) {
        const data = await response.json();
        console.log(`OpenRouter 响应数据:`, data);
        
        const models = data.data?.map((model: any) => model.id) || [];
        console.log(`OpenRouter 解析出的模型列表:`, models);
        
        // 如果获取到了模型列表，返回；否则返回常见模型
        if (models.length > 0) {
          return models;
        }
      }
    } catch (error) {
      console.error(`获取 OpenRouter 模型列表失败，使用默认列表:`, error);
    }
    
    // 返回常见的模型作为后备
    return this.getDefaultModels();
  }

  /**
   * 测试特定模型
   */
  async testModel(config: AIConfig, model: string): Promise<AIModelTestResult> {
    console.log(`测试 OpenRouter 模型: ${model}`);
    
    try {
      const testPrompt = '请用一句话简单介绍一下你自己。';
      
      const llm = new ChatOpenAI({
        openAIApiKey: config.apiKey,
        modelName: model,
        configuration: {
          baseURL: config.baseURL || 'https://openrouter.ai/api/v1',
          defaultHeaders: {
            'HTTP-Referer': 'https://getaigist.com',
            'X-Title': 'AI Gist'
          }
        }
      });

      const response = await this.withTimeout(llm.invoke(testPrompt), 20000);
      const responseText = typeof response === 'string' ? response : (response as any)?.content || '测试成功';
      
      console.log(`OpenRouter 模型 ${model} 测试成功`);
      return {
        success: true,
        model,
        response: responseText,
        error: `✅ 模型 ${model} 测试成功！AI 响应正常`
      };
    } catch (error: any) {
      console.error(`OpenRouter 模型 ${model} 测试失败:`, error);
      const errorMessage = this.handleCommonError(error, 'openrouter');
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
  async intelligentTest(config: AIConfig): Promise<AIIntelligentTestResult> {
    if (!config.enabled) {
      return { success: false, error: '配置已禁用' };
    }

    const model = config.defaultModel || config.customModel;
    if (!model) {
      return { success: false, error: '未设置默认模型' };
    }

    const testPrompt = '请用一句话简单介绍一下你自己。';

    try {
      const llm = new ChatOpenAI({
        openAIApiKey: config.apiKey,
        modelName: model,
        configuration: {
          baseURL: config.baseURL || 'https://openrouter.ai/api/v1',
          defaultHeaders: {
            'HTTP-Referer': 'https://getaigist.com',
            'X-Title': 'AI Gist'
          }
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
      console.error(`OpenRouter 智能测试失败:`, error);
      const errorMessage = this.handleCommonError(error, 'openrouter');
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
          baseURL: config.baseURL || 'https://openrouter.ai/api/v1',
          defaultHeaders: {
            'HTTP-Referer': 'https://getaigist.com',
            'X-Title': 'AI Gist'
          }
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
      console.error(`OpenRouter 生成提示词失败:`, error);
      if (error.message?.includes('请求超时')) {
        throw new Error('生成超时，请检查网络连接或服务状态');
      }
      throw new Error(`生成失败: ${error.message}`);
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
          baseURL: config.baseURL || 'https://openrouter.ai/api/v1',
          defaultHeaders: {
            'HTTP-Referer': 'https://getaigist.com',
            'X-Title': 'AI Gist'
          }
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
        
      } catch (streamError: any) {
        console.error('OpenRouter 流式传输失败，回退到普通调用:', streamError);
        
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
      console.error(`OpenRouter 流式生成提示词失败:`, error);
      if (error.message?.includes('请求超时')) {
        throw new Error('生成超时，请检查网络连接或服务状态');
      }
      throw new Error(`生成失败: ${error.message}`);
    }
  }

  /**
   * 获取默认模型列表
   * 基于 OpenRouter 官方文档中的热门模型
   */
  private getDefaultModels(): string[] {
    return [
      'openai/gpt-4o',
      'openai/gpt-4o-mini',
      'anthropic/claude-3-5-sonnet',
      'anthropic/claude-3-5-haiku',
      'meta-llama/llama-3.1-8b-instruct',
      'meta-llama/llama-3.1-70b-instruct',
      'google/gemini-pro',
      'google/gemini-flash-1.5',
      'mistralai/mistral-7b-instruct',
      'microsoft/phi-3-mini-4k-instruct'
    ];
  }
}
