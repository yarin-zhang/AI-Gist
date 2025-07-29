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
        // 智谱AI暂时使用普通请求，因为流式请求在代理环境下有问题
        console.log('智谱AI使用普通请求模式');
        const response = await this.makeZhipuRequest(config, model, messages);
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
        
        console.error('智谱AI请求失败:', requestError);
        throw new Error(`生成失败: ${requestError.message}`);
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

    const timeoutFetch = this.createTimeoutFetch(60000); // 智谱AI可能需要更长时间
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

    const timeoutFetch = this.createTimeoutFetch(60000); // 智谱AI可能需要更长时间
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

    // 处理流式响应 - 适配 Electron net 模块
    if (!response.body) {
      throw new Error('无法获取响应流');
    }

    return {
      [Symbol.asyncIterator]: async function* () {
        try {
          let buffer = '';
          
          // 对于 Electron net 模块，我们需要手动处理响应流
          const responseText = await response.text();
          const lines = responseText.split('\n');
          
          for (const line of lines) {
            if (abortSignal?.aborted) {
              break;
            }
            
            if (line.trim() === '') continue;
            
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
                // 忽略解析错误，继续处理下一行
                console.warn('智谱AI流式响应解析错误:', e, '原始数据:', data);
              }
            }
          }
        } catch (error) {
          console.error('智谱AI流式响应处理错误:', error);
          throw error;
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