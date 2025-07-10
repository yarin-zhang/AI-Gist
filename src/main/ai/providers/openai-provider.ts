import { ChatOpenAI } from '@langchain/openai';
import { AIConfig, AIGenerationRequest, AIGenerationResult } from '@shared/types/ai';
import { BaseAIProvider, AITestResult, AIIntelligentTestResult } from './base-provider';

/**
 * OpenAI 兼容供应商（OpenAI、DeepSeek、Mistral等）
 */
export class OpenAICompatibleProvider extends BaseAIProvider {
  
  /**
   * 测试配置连接
   */
  async testConfig(config: AIConfig): Promise<AITestResult> {
    console.log(`测试 ${config.type} 连接，使用 baseURL: ${config.baseURL}`);
    
    try {
      const llm = new ChatOpenAI({
        openAIApiKey: config.apiKey,
        configuration: {
          baseURL: config.baseURL || undefined
        }
      });

      await this.withTimeout(llm.invoke('test'), 15000);
      const models = await this.getAvailableModels(config);
      console.log(`${config.type} 连接测试成功，获取到模型:`, models);
      return { success: true, models };
    } catch (error: any) {
      console.error(`${config.type} 连接测试失败:`, error);
      const errorMessage = this.handleCommonError(error, config.type);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * 获取可用模型列表
   */
  async getAvailableModels(config: AIConfig): Promise<string[]> {
    console.log(`获取 ${config.type} 模型列表 - baseURL: ${config.baseURL}`);
    
    try {
      const url = `${config.baseURL}/models`;
      console.log(`${config.type} 请求URL: ${url}`);
      
      const timeoutFetch = this.createTimeoutFetch(10000);
      const response = await timeoutFetch(url, {
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json'
        }
      });
      console.log(`${config.type} 响应状态: ${response.status}`);
      
      if (response.ok) {
        const data = await response.json();
        console.log(`${config.type} 响应数据:`, data);
        
        const models = data.data?.map((model: any) => model.id) || [];
        console.log(`${config.type} 解析出的模型列表:`, models);
        
        // 如果获取到了模型列表，返回；否则返回常见模型
        if (models.length > 0) {
          return models;
        }
      }
    } catch (error) {
      console.error(`获取 ${config.type} 模型列表失败，使用默认列表:`, error);
    }
    
    // 返回常见的模型作为后备
    return this.getDefaultModels(config.type);
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
          baseURL: config.baseURL || undefined
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
          baseURL: config.baseURL || undefined
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
          baseURL: config.baseURL || undefined
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
      throw new Error(`生成失败: ${error.message}`);
    }
  }



  /**
   * 获取默认模型列表
   */
  private getDefaultModels(providerType: string): string[] {
    switch (providerType) {
      case 'openai':
        return [
          'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo', 
          'gpt-3.5-turbo-16k', 'text-davinci-003', 'text-davinci-002'
        ];
      case 'deepseek':
        return ['deepseek-chat', 'deepseek-coder'];
      case 'mistral':
        return [
          'mistral-large-latest',
          'mistral-medium-latest', 
          'mistral-small-latest',
          'codestral-latest',
          'open-mistral-7b',
          'open-mixtral-8x7b',
          'open-mixtral-8x22b'
        ];
      default:
        return ['gpt-4', 'gpt-3.5-turbo'];
    }
  }
} 