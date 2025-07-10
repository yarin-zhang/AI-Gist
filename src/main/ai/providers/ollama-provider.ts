import { Ollama } from '@langchain/ollama';
import { AIConfig, AIGenerationRequest, AIGenerationResult } from '@shared/types/ai';
import { BaseAIProvider, AITestResult, AIIntelligentTestResult } from './base-provider';

/**
 * Ollama 供应商实现
 */
export class OllamaProvider extends BaseAIProvider {
  
  /**
   * 测试配置连接
   */
  async testConfig(config: AIConfig): Promise<AITestResult> {
    console.log(`测试 Ollama 连接，使用 baseURL: ${config.baseURL}`);
    
    try {
      const timeoutFetch = this.createTimeoutFetch(15000);
      const response = await timeoutFetch(`${config.baseURL}/api/tags`);
      
      if (response.ok) {
        const models = await this.getAvailableModels(config);
        return { success: true, models };
      } else {
        return { success: false, error: '无法连接到 Ollama 服务，请确保服务已启动' };
      }
    } catch (error: any) {
      console.error('Ollama 连接测试失败:', error);
      const errorMessage = this.handleCommonError(error, 'ollama');
      return { success: false, error: errorMessage };
    }
  }

  /**
   * 获取可用模型列表
   */
  async getAvailableModels(config: AIConfig): Promise<string[]> {
    console.log(`获取 Ollama 模型列表 - baseURL: ${config.baseURL}`);
    
    try {
      const url = `${config.baseURL}/api/tags`;
      console.log(`Ollama 请求URL: ${url}`);
      
      const timeoutFetch = this.createTimeoutFetch(10000);
      const response = await timeoutFetch(url);
      console.log(`Ollama 响应状态: ${response.status}`);
      
      if (response.ok) {
        const data = await response.json();
        console.log('Ollama 响应数据:', data);
        
        const models = data.models?.map((model: any) => model.name) || [];
        console.log(`Ollama 解析出的模型列表:`, models);
        return models.length > 0 ? models : [];
      }
    } catch (error) {
      console.error('获取 Ollama 模型列表失败:', error);
      if (error instanceof Error && error.message?.includes('请求超时')) {
        console.warn('Ollama 请求超时');
      }
    }
    return [];
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
      const llm = new Ollama({
        baseUrl: config.baseURL,
        model: model
      });

      const response = await this.withTimeout(llm.invoke(testPrompt), 20000);
      const responseText = typeof response === 'string' ? response : (response as any)?.content || '测试成功';

      return {
        success: true,
        response: responseText,
        inputPrompt: testPrompt
      };
    } catch (error: any) {
      console.error('Ollama 智能测试失败:', error);
      const errorMessage = this.handleCommonError(error, 'ollama');
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
      const llm = new Ollama({
        baseUrl: config.baseURL,
        model: model
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
      console.error('Ollama 生成提示词失败:', error);
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
      const llm = new Ollama({
        baseUrl: config.baseURL,
        model: model
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
      console.error('Ollama 流式生成提示词失败:', error);
      if (error.message?.includes('请求超时')) {
        throw new Error('生成超时，请检查网络连接或服务状态');
      }
      throw new Error(`生成失败: ${error.message}`);
    }
  }

  /**
   * 构建系统提示词和用户提示词
   */
  private buildPrompts(request: AIGenerationRequest, config: AIConfig): { systemPrompt: string; userPrompt: string } {
    const isDebugRequest = request.topic.includes('请直接回应') || 
                          request.topic.includes('调试') ||
                          request.customPrompt;
    
    let systemPrompt: string;
    let userPrompt: string;

    if (isDebugRequest) {
      systemPrompt = config.systemPrompt || '你是一个有用的AI助手。请直接回应用户的请求。';
      userPrompt = request.customPrompt || request.topic;
    } else {
      systemPrompt = config.systemPrompt || request.systemPrompt || 
        `你是一个专业的 AI 提示词工程师。请根据用户提供的主题，生成一个高质量、结构化的 AI 提示词。

要求：
1. 提示词应该清晰、具体、可操作
2. 包含必要的上下文和约束条件
3. 使用适当的格式和结构
4. 考虑不同的使用场景
5. 提供具体的输出格式要求

请直接返回优化后的提示词内容，不需要额外的解释。`;

      userPrompt = request.customPrompt || (config.systemPrompt ? 
        `主题：${request.topic}` :
        `请为以下主题生成一个专业的 AI 提示词：

主题：${request.topic}

请生成一个完整、可直接使用的提示词。`);
    }

    return { systemPrompt, userPrompt };
  }

  /**
   * 创建生成结果
   */
  private createGenerationResult(
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
} 