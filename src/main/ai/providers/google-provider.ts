import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { AIConfig, AIGenerationRequest, AIGenerationResult } from '@shared/types/ai';
import { BaseAIProvider, AITestResult, AIIntelligentTestResult } from './base-provider';

/**
 * Google 供应商实现
 */
export class GoogleProvider extends BaseAIProvider {
  

  
  /**
   * 测试配置连接
   */
  async testConfig(config: AIConfig): Promise<AITestResult> {
    console.log(`测试 Google 连接，API Key: ${config.apiKey ? config.apiKey.substring(0, 10) + '...' : '未设置'}`);
    
    try {
      // 首先尝试获取可用模型列表
      const models = await this.getAvailableModels(config);
      console.log(`Google 获取模型列表成功:`, models);
      
      // 如果获取模型列表失败（返回默认列表），但仍要尝试模型调用
      const isUsingDefaultModels = models.length === this.getDefaultModels().length && 
        models.every((model, index) => model === this.getDefaultModels()[index]);
      
      if (isUsingDefaultModels) {
        console.log('注意：使用默认模型列表，可能存在网络连接问题');
      }
      
      // 然后测试模型调用
      const testModel = models.includes('gemini-1.5-flash') ? 'gemini-1.5-flash' : 'gemini-pro';
      const llm = new ChatGoogleGenerativeAI({
        apiKey: config.apiKey,
        model: testModel,
        ...(config.baseURL && { baseURL: config.baseURL })
      });

      await this.withTimeout(llm.invoke('Hi'), 15000);
      
      console.log(`Google 连接测试成功，使用模型: ${testModel}`);
      return { success: true, models };
    } catch (error: any) {
      console.error(`Google 连接测试失败:`, error);
      
             // 检查是否是网络连接问题
       if (error.message?.includes('ECONNRESET') || 
           error.message?.includes('TIMEOUT') || 
           error.message?.includes('ConnectTimeoutError') ||
           error.message?.includes('fetch failed')) {
         return { 
           success: false, 
           error: '网络连接失败：无法访问 Google API 服务器。\n\n应用已自动配置使用系统代理设置。如果问题仍然存在，请检查：\n• 网络连接是否正常\n• 代理软件（如 Clash）是否正确配置并启用系统代理\n• 防火墙是否阻止了应用的网络访问\n\n如需帮助，请重启应用后重试。'
         };
       }
      
      const errorMessage = this.handleCommonError(error, 'google');
      return { success: false, error: errorMessage };
    }
  }

  /**
   * 获取可用模型列表
   */
  async getAvailableModels(config: AIConfig): Promise<string[]> {
    console.log(`获取 Google 模型列表`);
    
    try {
      if (!config.apiKey) {
        throw new Error('API Key 未设置');
      }
      
      const baseUrl = config.baseURL || 'https://generativelanguage.googleapis.com';
      const url = `${baseUrl}/v1beta/models?key=${config.apiKey}`;
      console.log(`Google 请求URL: ${url.replace(config.apiKey, config.apiKey.substring(0, 10) + '...')}`);
      
      const timeoutFetch = this.createTimeoutFetch(20000); // 增加超时时间
      const response = await timeoutFetch(url, {
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      console.log(`Google 响应状态: ${response.status}`);
      
      if (response.ok) {
        const data = await response.json();
        console.log(`Google 响应数据:`, data);
        
        const models = data.models?.map((model: any) => {
          // 提取模型名称，去掉路径前缀 "models/"
          const name = model.name || '';
          return name.replace('models/', '');
        }).filter((name: string) => {
          // 只返回 Gemini 模型
          return name.startsWith('gemini');
        }) || [];
        
        console.log(`Google 解析出的模型列表:`, models);
        
        // 如果获取到了模型列表，返回；否则返回默认模型列表
        if (models.length > 0) {
          return models;
        }
             } else {
         console.error(`Google API 响应错误: ${response.status} ${response.statusText}`);
         const errorData = await response.text().catch(() => 'Unknown error');
         console.error(`Google API 错误详情:`, errorData);
         
         // 特殊处理常见错误
         if (response.status === 403) {
           throw new Error('API Key 无效或权限不足，请检查 API Key 是否正确');
         } else if (response.status === 401) {
           throw new Error('API Key 认证失败，请检查 API Key 是否有效');
         }
       }
         } catch (error) {
       console.error(`获取 Google 模型列表失败，使用默认列表:`, error);
       
       // 详细的错误分析和诊断
        if (error instanceof Error) {
          if (error.message.includes('401') || error.message.includes('Unauthorized')) {
            console.error('Google API 认证失败，请检查 API Key 是否正确');
          } else if (error.message.includes('403') || error.message.includes('Forbidden')) {
            console.error('Google API 权限不足，请检查 API Key 权限');
          } else if (error.message.includes('ECONNRESET')) {
            console.error('网络连接被重置，可能是防火墙或网络策略阻止了连接');
          } else if (error.message.includes('ConnectTimeoutError') || error.message.includes('timeout')) {
            console.error('连接超时，可能是网络问题或 Google 服务不可达');
          } else if (error.message.includes('fetch failed')) {
            console.error('网络请求失败，请检查网络连接和 DNS 解析');
          } else {
            console.error('未知网络错误:', error.message);
          }
        }
     }
    
    // 返回默认模型列表作为后备
    return this.getDefaultModels();
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
      const llm = new ChatGoogleGenerativeAI({
        apiKey: config.apiKey,
        model: model,
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
      console.error(`Google 智能测试失败:`, error);
      const errorMessage = this.handleCommonError(error, 'google');
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
      const llm = new ChatGoogleGenerativeAI({
        apiKey: config.apiKey,
        model: model,
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
      console.error(`Google 生成提示词失败:`, error);
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
      const llm = new ChatGoogleGenerativeAI({
        apiKey: config.apiKey,
        model: model,
        streaming: true,
        ...(config.baseURL && { baseURL: config.baseURL })
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
        console.error('Google 流式传输失败，回退到普通调用:', streamError);
        
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
      console.error(`Google 流式生成提示词失败:`, error);
      if (error.message?.includes('请求超时')) {
        throw new Error('生成超时，请检查网络连接或服务状态');
      }
      throw new Error(`生成失败: ${error.message}`);
    }
  }



  /**
   * 获取默认模型列表
   */
  private getDefaultModels(): string[] {
    return [
      // Gemini 2.5 系列 (最新)
      'gemini-2.5-pro',
      'gemini-2.5-flash',
      'gemini-2.5-flash-lite',
      
      // Gemini 2.0 系列
      'gemini-2.0-flash',
      
      // Gemini 1.5 系列 (仍可用)
      'gemini-1.5-pro',
      'gemini-1.5-flash',
      
      // Gemini 1.0 系列 (legacy)
      'gemini-pro',
      'gemini-pro-vision'
    ];
  }
} 