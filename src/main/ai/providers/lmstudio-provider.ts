import { ChatOpenAI } from '@langchain/openai';
import { AIConfig, AIGenerationRequest, AIGenerationResult } from '@shared/types/ai';
import { BaseAIProvider, AITestResult, AIIntelligentTestResult, AIModelTestResult } from './base-provider';

/**
 * LM Studio 供应商实现
 */
export class LMStudioProvider extends BaseAIProvider {
  
  /**
   * 测试配置连接
   */
  async testConfig(config: AIConfig): Promise<AITestResult> {
    console.log(`测试 LM Studio 连接，使用 baseURL: ${config.baseURL}`);
    
    try {
      const timeoutFetch = this.createTimeoutFetch(15000);
      const baseUrl = config.baseURL || 'http://localhost:1234';
      const testUrl = baseUrl.endsWith('/v1') ? `${baseUrl}/models` : `${baseUrl}/v1/models`;
      console.log(`LM Studio 连接测试URL: ${testUrl}`);
      
      const response = await timeoutFetch(testUrl);
      if (response.ok) {
        const models = await this.getAvailableModels(config);
        console.log('LM Studio 连接测试成功，获取到模型:', models);
        return { success: true, models };
      } else {
        console.log(`LM Studio models 端点响应状态: ${response.status}`);
        return { success: false, error: '无法连接到 LM Studio 服务，请确保服务已启动并加载了模型' };
      }
    } catch (error: any) {
      console.error('LM Studio 连接测试失败:', error);
      const errorMessage = this.handleCommonError(error, 'lmstudio');
      return { success: false, error: errorMessage };
    }
  }

  /**
   * 获取可用模型列表
   */
  async getAvailableModels(config: AIConfig): Promise<string[]> {
    console.log(`获取 LM Studio 模型列表 - baseURL: ${config.baseURL}`);
    
    try {
      const baseUrl = config.baseURL || 'http://localhost:1234';
      const url = baseUrl.endsWith('/v1') ? `${baseUrl}/models` : `${baseUrl}/v1/models`;
      console.log(`LM Studio 请求URL: ${url}`);
      
      const timeoutFetch = this.createTimeoutFetch(10000);
      const response = await timeoutFetch(url);
      console.log(`LM Studio 响应状态: ${response.status}`);
      
      if (response.ok) {
        const data = await response.json();
        console.log('LM Studio 响应数据:', data);
        
        const models = data.data?.map((model: any) => model.id) || [];
        console.log(`LM Studio 解析出的模型列表:`, models);
        
        if (models.length > 0) {
          return models;
        } else {
          console.warn('LM Studio 返回空模型列表，可能未加载模型');
          return ['请在 LM Studio 中加载模型'];
        }
      } else {
        console.warn(`LM Studio API 响应异常: ${response.status} ${response.statusText}`);
        return ['请检查 LM Studio 服务状态'];
      }
    } catch (error) {
      console.error('获取 LM Studio 模型列表失败:', error);
      if (error instanceof Error && error.message?.includes('请求超时')) {
        return ['连接超时，请检查 LM Studio 状态'];
      }
      return ['无法连接到 LM Studio'];
    }
  }

  /**
   * 测试特定模型
   */
  async testModel(config: AIConfig, model: string): Promise<AIModelTestResult> {
    console.log(`测试 LM Studio 模型: ${model}`);
    
    try {
      const testPrompt = '请用一句话简单介绍一下你自己。';
      
      const baseUrl = config.baseURL || 'http://localhost:1234';
      const finalBaseUrl = baseUrl.endsWith('/v1') ? baseUrl : `${baseUrl}/v1`;
      
      const llm = new ChatOpenAI({
        openAIApiKey: 'not-needed', // LM Studio 本地不需要 API key
        modelName: model,
        configuration: {
          baseURL: finalBaseUrl
        }
      });

      const response = await this.withTimeout(llm.invoke(testPrompt), 20000);
      const responseText = typeof response === 'string' ? response : (response as any)?.content || '测试成功';
      
      console.log(`LM Studio 模型 ${model} 测试成功`);
      return {
        success: true,
        model,
        response: responseText,
        error: `✅ 模型 ${model} 测试成功！AI 响应正常`
      };
    } catch (error: any) {
      console.error(`LM Studio 模型 ${model} 测试失败:`, error);
      const errorMessage = this.handleCommonError(error, 'lmstudio');
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
      const baseUrl = config.baseURL || 'http://localhost:1234';
      const finalBaseUrl = baseUrl.endsWith('/v1') ? baseUrl : `${baseUrl}/v1`;
      
      const llm = new ChatOpenAI({
        openAIApiKey: 'not-needed', // LM Studio 本地不需要 API key
        modelName: model,
        configuration: {
          baseURL: finalBaseUrl
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
      console.error('LM Studio 智能测试失败:', error);
      const errorMessage = this.handleCommonError(error, 'lmstudio');
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
      const baseUrl = config.baseURL || 'http://localhost:1234';
      const finalBaseUrl = baseUrl.endsWith('/v1') ? baseUrl : `${baseUrl}/v1`;
      
      const llm = new ChatOpenAI({
        openAIApiKey: 'not-needed', // LM Studio 本地不需要 API key
        modelName: model,
        configuration: {
          baseURL: finalBaseUrl
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
      console.error('LM Studio 生成提示词失败:', error);
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
      const baseUrl = config.baseURL || 'http://localhost:1234';
      const finalBaseUrl = baseUrl.endsWith('/v1') ? baseUrl : `${baseUrl}/v1`;
      
      const llm = new ChatOpenAI({
        openAIApiKey: 'not-needed', // LM Studio 本地不需要 API key
        modelName: model,
        configuration: {
          baseURL: finalBaseUrl
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
      console.error('LM Studio 流式生成提示词失败:', error);
      if (error.message?.includes('请求超时')) {
        throw new Error('生成超时，请检查网络连接或服务状态');
      }
      throw new Error(`生成失败: ${error.message}`);
    }
  }


} 