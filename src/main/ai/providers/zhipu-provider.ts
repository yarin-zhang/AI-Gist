import { AIConfig, AIGenerationRequest, AIGenerationResult } from '@shared/types/ai';
import { BaseAIProvider, AITestResult, AIIntelligentTestResult } from './base-provider';

/**
 * 智谱AI提供商
 * 专门处理智谱API的特殊格式和模型名称
 */
export class ZhipuAIProvider extends BaseAIProvider {
  
  /**
   * 智谱API的模型映射
   * 将标准模型名称映射到智谱API的实际模型名称
   */
  private readonly modelMapping: Record<string, string> = {
    'glm-4': 'glm-4',
    'glm-4v': 'glm-4v',
    'glm-3-turbo': 'glm-3-turbo',
    'cogview-3': 'cogview-3',
    'chatglm_turbo': 'chatglm_turbo',
    'chatglm_pro': 'chatglm_pro',
    'chatglm_std': 'chatglm_std',
    'chatglm_lite': 'chatglm_lite'
  };

  /**
   * 测试配置连接
   */
  async testConfig(config: AIConfig): Promise<AITestResult> {
    console.log(`测试智谱AI连接，使用 baseURL: ${config.baseURL}`);
    
    try {
      // 首先尝试获取可用模型列表
      const models = await this.getAvailableModels(config);
      console.log(`智谱AI获取到模型列表:`, models);
      
      // 如果有可用模型，尝试找到一个合适的测试模型
      if (models.length > 0) {
        const testModel = this.findSuitableTestModel(models);
        console.log(`使用模型 ${testModel} 进行连接测试`);
        
        // 使用智谱API的特殊格式进行测试
        const testResponse = await this.makeZhipuRequest(config, testModel, 'Hello');
        console.log(`智谱AI连接测试成功，使用模型: ${testModel}`);
        return { success: true, models };
      } else {
        // 如果没有获取到模型列表，使用默认模型进行测试
        const defaultModel = 'glm-4';
        console.log(`使用默认模型 ${defaultModel} 进行连接测试`);
        
        const testResponse = await this.makeZhipuRequest(config, defaultModel, 'Hello');
        console.log(`智谱AI连接测试成功，使用默认模型: ${defaultModel}`);
        return { success: true, models: this.getDefaultModels() };
      }
    } catch (error: any) {
      console.error(`智谱AI连接测试失败:`, error);
      const errorMessage = this.handleCommonError(error, 'zhipu');
      return { success: false, error: errorMessage };
    }
  }

  /**
   * 获取可用模型列表
   */
  async getAvailableModels(config: AIConfig): Promise<string[]> {
    console.log(`获取智谱AI模型列表 - baseURL: ${config.baseURL}`);
    
    try {
      const url = `${config.baseURL}/models`;
      console.log(`智谱AI请求URL: ${url}`);
      
      const timeoutFetch = this.createTimeoutFetch(10000);
      const response = await timeoutFetch(url, {
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json'
        }
      });
      console.log(`智谱AI响应状态: ${response.status}`);
      
      if (response.ok) {
        const data = await response.json();
        console.log(`智谱AI响应数据:`, data);
        
        // 智谱API返回的模型格式可能不同，需要适配
        const models = data.data?.map((model: any) => model.id || model.model_id) || [];
        console.log(`智谱AI解析出的模型列表:`, models);
        
        // 如果获取到了模型列表，返回；否则返回默认模型
        if (models.length > 0) {
          return models;
        }
      }
    } catch (error) {
      console.error(`获取智谱AI模型列表失败，使用默认列表:`, error);
    }
    
    // 返回智谱AI的默认模型列表
    return this.getDefaultModels();
  }

  /**
   * 智能测试
   */
  async intelligentTest(config: AIConfig): Promise<AIIntelligentTestResult> {
    if (!config.enabled) {
      return { success: false, error: '配置已禁用' };
    }

    const model = config.defaultModel || config.customModel || 'glm-4';
    const testPrompt = '请用一句话简单介绍一下你自己。';

    try {
      const response = await this.makeZhipuRequest(config, model, testPrompt);
      
      return {
        success: true,
        response: response,
        inputPrompt: testPrompt
      };
    } catch (error: any) {
      console.error(`智谱AI智能测试失败:`, error);
      const errorMessage = this.handleCommonError(error, 'zhipu');
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

    const model = request.model || config.defaultModel || config.customModel || 'glm-4';
    const { systemPrompt, userPrompt } = this.buildPrompts(request, config);

    try {
      // 智谱API需要特殊的消息格式
      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ];
      
      const response = await this.makeZhipuRequest(config, model, messages);
      
      return this.createGenerationResult(request, config, model, response);
    } catch (error: any) {
      console.error(`智谱AI生成提示词失败:`, error);
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
    const model = request.model || config.defaultModel || config.customModel || 'glm-4';
    
    if (!model) {
      throw new Error('未指定模型');
    }

    if (!config.enabled) {
      throw new Error('配置已禁用');
    }

    const { systemPrompt, userPrompt } = this.buildPrompts(request, config);

    try {
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
        // 智谱API的流式请求
        const streamResponse = await this.makeZhipuStreamRequest(config, model, messages, abortSignal);
        
        for await (const chunk of streamResponse) {
          if (abortSignal?.aborted || shouldStop) {
            console.log('检测到中断信号，停止流式生成');
            break;
          }
          
          if (chunk.content) {
            accumulatedContent += chunk.content;
            lastContentUpdate = Date.now();
            
            const continueGeneration = onProgress(accumulatedContent.length, accumulatedContent);
            if (continueGeneration === false) {
              console.log('前端请求停止生成');
              shouldStop = true;
              break;
            }
          }
        }
        
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
          
          const response = await this.makeZhipuRequest(config, model, messages);
          accumulatedContent = response;
          
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
      console.error(`智谱AI流式生成提示词失败:`, error);
      if (error.message?.includes('请求超时')) {
        throw new Error('生成超时，请检查网络连接或服务状态');
      }
      throw new Error(`生成失败: ${error.message}`);
    }
  }

  /**
   * 创建智谱API请求
   */
  private async makeZhipuRequest(config: AIConfig, model: string, messages: any[] | string): Promise<string> {
    const url = `${config.baseURL}/chat/completions`;
    
    const requestBody = {
      model: model,
      messages: Array.isArray(messages) ? messages : [{ role: 'user', content: messages }],
      stream: false,
      temperature: 0.7,
      max_tokens: 4096
    };

    const timeoutFetch = this.createTimeoutFetch(30000);
    const response = await timeoutFetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }

  /**
   * 创建智谱API流式请求
   */
  private async makeZhipuStreamRequest(
    config: AIConfig, 
    model: string, 
    messages: any[], 
    abortSignal?: AbortSignal
  ): Promise<AsyncIterable<{ content: string }>> {
    const url = `${config.baseURL}/chat/completions`;
    
    const requestBody = {
      model: model,
      messages: messages,
      stream: true,
      temperature: 0.7,
      max_tokens: 4096
    };

    const timeoutFetch = this.createTimeoutFetch(30000);
    const response = await timeoutFetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    // 处理流式响应
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('无法获取响应流');
    }

    return {
      [Symbol.asyncIterator]: async function* () {
        try {
          while (true) {
            if (abortSignal?.aborted) {
              break;
            }

            const { done, value } = await reader.read();
            if (done) break;

            const chunk = new TextDecoder().decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                if (data === '[DONE]') {
                  return;
                }

                try {
                  const parsed = JSON.parse(data);
                  if (parsed.choices?.[0]?.delta?.content) {
                    yield { content: parsed.choices[0].delta.content };
                  }
                } catch (e) {
                  // 忽略解析错误
                }
              }
            }
          }
        } finally {
          reader.releaseLock();
        }
      }
    };
  }

  /**
   * 查找适合测试的模型
   */
  private findSuitableTestModel(models: string[]): string {
    // 智谱AI的推荐测试模型优先级
    const recommendedModels = [
      'glm-4',
      'glm-3-turbo',
      'chatglm_turbo',
      'chatglm_pro',
      'chatglm_std'
    ];
    
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
   * 获取默认模型列表
   */
  private getDefaultModels(): string[] {
    return [
      'glm-4',
      'glm-4v',
      'glm-3-turbo',
      'cogview-3',
      'chatglm_turbo',
      'chatglm_pro',
      'chatglm_std',
      'chatglm_lite'
    ];
  }
} 