import { AIConfig, AIGenerationRequest, AIGenerationResult } from '@shared/types/ai';
import { BaseAIProvider, AITestResult, AIIntelligentTestResult } from './base-provider';

/**
 * Google Gemini 供应商实现
 * 直接使用 Google Gemini REST API，避免 LangChain 的代理问题
 */
export class GoogleProvider extends BaseAIProvider {
  
  /**
   * 测试配置连接
   */
  async testConfig(config: AIConfig): Promise<AITestResult> {
    console.log(`测试 Google Gemini 连接，使用 baseURL: ${config.baseURL}`);
    
    try {
      // 首先尝试获取可用模型列表
      const models = await this.getAvailableModels(config);
      console.log(`Google Gemini 获取到模型列表:`, models);
      
      // 如果有可用模型，尝试找到一个合适的测试模型
      if (models.length > 0) {
        const testModel = this.findSuitableTestModel(models);
        console.log(`使用模型 ${testModel} 进行连接测试`);
        
        // 使用 Google Gemini API 进行测试
        const testResponse = await this.makeGoogleRequest(config, testModel, 'Hello');
        console.log(`Google Gemini 连接测试成功，使用模型: ${testModel}`);
        return { success: true, models };
      } else {
        // 如果没有获取到模型列表，使用默认模型进行测试
        const defaultModel = 'gemini-1.5-pro';
        console.log(`使用默认模型 ${defaultModel} 进行连接测试`);
        
        const testResponse = await this.makeGoogleRequest(config, defaultModel, 'Hello');
        console.log(`Google Gemini 连接测试成功，使用默认模型: ${defaultModel}`);
        return { success: true, models: this.getDefaultModels() };
      }
    } catch (error: any) {
      console.error(`Google Gemini 连接测试失败:`, error);
      const errorMessage = this.handleCommonError(error, 'google');
      return { success: false, error: errorMessage };
    }
  }

  /**
   * 获取可用模型列表
   */
  async getAvailableModels(config: AIConfig): Promise<string[]> {
    console.log(`获取 Google Gemini 模型列表 - baseURL: ${config.baseURL}`);
    
    try {
      if (!config.apiKey) {
        throw new Error('API Key 未设置');
      }
      
      const baseUrl = config.baseURL || 'https://generativelanguage.googleapis.com';
      const url = `${baseUrl}/v1beta/models?key=${config.apiKey}`;
      console.log(`Google Gemini 请求URL: ${url.replace(config.apiKey, config.apiKey.substring(0, 10) + '...')}`);
      
      const timeoutFetch = this.createTimeoutFetch(20000);
      const response = await timeoutFetch(url, {
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      console.log(`Google Gemini 响应状态: ${response.status}`);
      
      if (response.ok) {
        const data = await response.json();
        console.log(`Google Gemini 响应数据:`, data);
        
        const models = data.models?.map((model: any) => {
          // 提取模型名称，去掉路径前缀 "models/"
          const name = model.name || '';
          return name.replace('models/', '');
        }).filter((name: string) => {
          // 只返回 Gemini 模型
          return name.startsWith('gemini');
        }) || [];
        
        console.log(`Google Gemini 解析出的模型列表:`, models);
        
        // 如果获取到了模型列表，返回；否则返回默认模型列表
        if (models.length > 0) {
          return models;
        }
      } else {
        console.error(`Google Gemini API 响应错误: ${response.status} ${response.statusText}`);
        const errorData = await response.text().catch(() => 'Unknown error');
        console.error(`Google Gemini API 错误详情:`, errorData);
        
        // 特殊处理常见错误
        if (response.status === 403) {
          throw new Error('API Key 无效或权限不足，请检查 API Key 是否正确');
        } else if (response.status === 401) {
          throw new Error('API Key 认证失败，请检查 API Key 是否有效');
        }
      }
    } catch (error) {
      console.error(`获取 Google Gemini 模型列表失败，使用默认列表:`, error);
      
      // 详细的错误分析和诊断
      if (error instanceof Error) {
        if (error.message.includes('401') || error.message.includes('Unauthorized')) {
          console.error('Google Gemini API 认证失败，请检查 API Key 是否正确');
        } else if (error.message.includes('403') || error.message.includes('Forbidden')) {
          console.error('Google Gemini API 权限不足，请检查 API Key 权限');
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

    const model = config.defaultModel || config.customModel || 'gemini-1.5-pro';
    const testPrompt = '请用一句话简单介绍一下你自己。';

    try {
      const response = await this.makeGoogleRequest(config, model, testPrompt);
      
      return {
        success: true,
        response: response,
        inputPrompt: testPrompt
      };
    } catch (error: any) {
      console.error(`Google Gemini 智能测试失败:`, error);
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

    const model = request.model || config.defaultModel || config.customModel || 'gemini-1.5-pro';
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
    const model = request.model || config.defaultModel || config.customModel || 'gemini-1.5-pro';
    
    if (!model) {
      throw new Error('未指定模型');
    }

    if (!config.enabled) {
      throw new Error('配置已禁用');
    }

    const { systemPrompt, userPrompt } = this.buildPrompts(request, config);

    try {
      let accumulatedContent = '';
      let lastContentUpdate = Date.now();
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
        throw new Error(`生成失败: ${requestError.message}`);
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
      throw new Error(`生成失败: ${error.message}`);
    }
  }

  /**
   * 创建 Google Gemini API 请求
   */
  private async makeGoogleRequest(config: AIConfig, model: string, userPrompt: string, systemPrompt?: string): Promise<string> {
    const baseUrl = config.baseURL || 'https://generativelanguage.googleapis.com';
    const url = `${baseUrl}/v1beta/models/${model}:generateContent?key=${config.apiKey}`;
    
    const requestBody = {
      contents: [
        ...(systemPrompt ? [{
          role: 'user',
          parts: [{ text: systemPrompt }]
        }] : []),
        {
          role: 'user',
          parts: [{ text: userPrompt }]
        }
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 4096
      }
    };

    const timeoutFetch = this.createTimeoutFetch(60000); // Google Gemini 可能需要更长时间
    const response = await timeoutFetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  /**
   * 查找适合测试的模型
   */
  private findSuitableTestModel(models: string[]): string {
    // Google Gemini 的推荐测试模型优先级
    const recommendedModels = [
      'gemini-1.5-pro',
      'gemini-1.5-flash',
      'gemini-2.0-flash',
      'gemini-2.5-flash',
      'gemini-2.5-pro',
      'gemini-pro'
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