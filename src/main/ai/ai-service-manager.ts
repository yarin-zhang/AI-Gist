import { ChatOpenAI } from '@langchain/openai';
import { Ollama } from '@langchain/ollama';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { CohereClient } from 'cohere-ai';
import { 
  AIGenerationRequest, 
  AIGenerationResult, 
  AIConfig,
  AIConfigTestResult
} from '@shared/types/ai';

// 使用共享的 AIConfig 类型，添加一个别名用于处理后的配置
type ProcessedAIConfig = AIConfig;

/**
 * AI 服务管理器
 * 不再维护内存中的配置存储，而是直接处理传入的配置
 */
class AIServiceManager {
  
  /**
   * 创建带超时的 fetch 请求
   */
  private createTimeoutFetch(timeoutMs: number = 15000) {
    return (url: string, options: any = {}) => {
      return Promise.race([
        fetch(url, options),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('请求超时')), timeoutMs)
        )
      ]);
    };
  }

  /**
   * 创建带超时的 LangChain 调用
   */
  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number = 15000): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('请求超时')), timeoutMs)
      )
    ]);
  }

  /**
   * 创建智能超时 - 基于活动状态的超时判断
   * 如果有持续的活动（通过回调函数检测），则不会超时
   */
  private async withSmartTimeout<T>(
    promise: Promise<T>, 
    timeoutMs: number = 60000,
    activityCheckMs: number = 5000, // 检查活动的间隔
    onActivityCheck?: () => boolean // 返回true表示有活动，false表示无活动
  ): Promise<T> {
    let isActive = true;
    let lastActivityTime = Date.now();
    
    // 定期检查活动状态
    const activityChecker = setInterval(() => {
      const now = Date.now();
      const hasActivity = onActivityCheck ? onActivityCheck() : true;
      
      if (hasActivity) {
        lastActivityTime = now;
      }
      
      // 如果超过指定时间没有活动，标记为不活跃
      if (now - lastActivityTime > timeoutMs) {
        isActive = false;
      }
    }, activityCheckMs);

    const timeoutPromise = new Promise<never>((_, reject) => {
      const checkTimeout = () => {
        if (!isActive) {
          clearInterval(activityChecker);
          reject(new Error('请求超时'));
          return;
        }
        setTimeout(checkTimeout, activityCheckMs);
      };
      setTimeout(checkTimeout, activityCheckMs);
    });

    try {
      const result = await Promise.race([promise, timeoutPromise]);
      clearInterval(activityChecker);
      return result;
    } catch (error) {
      clearInterval(activityChecker);
      throw error;
    }
  }

  /**
   * 测试配置连接
   */
  async testConfig(config: ProcessedAIConfig): Promise<{ success: boolean; error?: string; models?: string[] }> {
    console.log(`测试配置连接 - 供应商: ${config.type}, baseURL: ${config.baseURL}, 配置ID: ${config.configId}`);
    
    try {      if (config.type === 'openai' || config.type === 'deepseek' || config.type === 'mistral') {
        console.log(`测试 ${config.type} 连接，使用 baseURL: ${config.baseURL}`);
        
        const llm = new ChatOpenAI({
          openAIApiKey: config.apiKey,
          configuration: {
            baseURL: config.baseURL || undefined
          }
        });

        // 尝试发送一个简单的测试请求，添加超时
        try {
          await this.withTimeout(llm.invoke('test'), 15000);
          // 连接成功，获取模型列表
          const models = await this.getAvailableModels(config);
          console.log(`${config.type} 连接测试成功，获取到模型:`, models);
          return { success: true, models };
        } catch (error: any) {
          console.error(`${config.type} 连接测试失败:`, error);
          if (error.message?.includes('请求超时')) {
            return { success: false, error: '连接超时，请检查网络或服务器状态' };
          }
          if (error.message?.includes('API key') || error.message?.includes('authentication')) {
            return { success: false, error: 'API Key 无效或已过期' };
          }
          if (error.message?.includes('network') || error.message?.includes('ECONNREFUSED')) {
            return { success: false, error: '无法连接到服务器，请检查 baseURL' };
          }
          // 其他错误可能是正常的（比如模型不存在等），但连接是成功的
          const models = await this.getAvailableModels(config);
          return { success: true, models };
        }      } else if (config.type === 'ollama') {
        try {
          // 尝试获取模型列表来测试连接，添加超时
          const timeoutFetch = this.createTimeoutFetch(15000);
          const response = await timeoutFetch(`${config.baseURL}/api/tags`);
          if (response.ok) {
            const models = await this.getAvailableModels(config);
            return { success: true, models };
          } else {
            return { success: false, error: '无法连接到 Ollama 服务，请确保服务已启动' };
          }
        } catch (error: any) {
          if (error.message?.includes('请求超时')) {
            return { success: false, error: '连接超时，请检查 Ollama 服务是否正常运行' };
          }
          if (error.message?.includes('ECONNREFUSED') || error.message?.includes('fetch')) {
            return { success: false, error: '无法连接到 Ollama 服务，请确保服务已启动并检查 baseURL' };
          }
          return { success: false, error: error.message };
        }      } else if (config.type === 'lmstudio') {
        try {
          // LM Studio 使用 OpenAI 兼容的端点测试连接
          const timeoutFetch = this.createTimeoutFetch(15000);
          // 如果 baseURL 已经包含 /v1，直接使用；否则添加 /v1
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
          if (error.message?.includes('请求超时')) {
            return { success: false, error: '连接超时，请检查 LM Studio 服务是否正常运行' };
          }
          if (error.message?.includes('ECONNREFUSED') || error.message?.includes('fetch')) {
            return { success: false, error: '无法连接到 LM Studio 服务，请确保服务已启动并检查 baseURL（默认: http://localhost:1234）' };
          }
          return { success: false, error: error.message };
        }      } else if (config.type === 'anthropic') {
        try {
          // 使用原生API测试Anthropic连接，添加超时
          const apiUrl = config.baseURL || 'https://api.anthropic.com';
          const timeoutFetch = this.createTimeoutFetch(15000);
          const response = await timeoutFetch(`${apiUrl}/v1/messages`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': config.apiKey || '',
              'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
              model: 'claude-3-haiku-20240307',
              max_tokens: 5,
              messages: [{ role: 'user', content: 'test' }]
            })
          });
          
          if (response.ok || response.status === 400) { // 400可能是因为消息太短，但API key有效
            const models = await this.getAvailableModels(config);
            return { success: true, models };
          } else if (response.status === 401) {
            return { success: false, error: 'API Key 无效或已过期' };
          } else {
            return { success: false, error: `连接失败: ${response.statusText}` };
          }
        } catch (error: any) {
          if (error.message?.includes('请求超时')) {
            return { success: false, error: '连接超时，请检查网络连接' };
          }
          return { success: false, error: error.message };
        }      } else if (config.type === 'google') {
        try {
          // 使用原生API测试Google AI连接，添加超时
          const timeoutFetch = this.createTimeoutFetch(15000);
          const response = await timeoutFetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${config.apiKey}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              contents: [{ parts: [{ text: 'test' }] }]
            })
          });
          
          if (response.ok || response.status === 400) {
            const models = await this.getAvailableModels(config);
            return { success: true, models };
          } else if (response.status === 401 || response.status === 403) {
            return { success: false, error: 'API Key 无效或已过期' };
          } else {
            return { success: false, error: `连接失败: ${response.statusText}` };
          }
        } catch (error: any) {
          if (error.message?.includes('请求超时')) {
            return { success: false, error: '连接超时，请检查网络连接' };
          }
          return { success: false, error: error.message };
        }      } else if (config.type === 'cohere') {
        try {
          const cohere = new CohereClient({
            token: config.apiKey,
          });
          
          // 测试生成，添加超时
          await this.withTimeout(
            cohere.generate({
              model: 'command',
              prompt: 'test',
              maxTokens: 5
            }),
            15000
          );
          
          const models = await this.getAvailableModels(config);
          return { success: true, models };
        } catch (error: any) {
          if (error.message?.includes('请求超时')) {
            return { success: false, error: '连接超时，请检查网络连接' };
          }
          if (error.message?.includes('API key') || error.message?.includes('authentication')) {
            return { success: false, error: 'API Key 无效或已过期' };
          }
          return { success: false, error: error.message };
        }      } else if (config.type === 'azure') {
        try {
          // Azure OpenAI使用不同的配置方式，添加超时
          const azureConfig: any = {
            openAIApiKey: config.apiKey,
            modelName: 'gpt-35-turbo',
          };

          // 如果baseURL包含Azure格式，解析相关信息
          if (config.baseURL && config.baseURL.includes('openai.azure.com')) {
            azureConfig.configuration = {
              baseURL: config.baseURL
            };
          }
          
          const llm = new ChatOpenAI(azureConfig);
          await this.withTimeout(llm.invoke('test'), 15000);
          const models = await this.getAvailableModels(config);
          return { success: true, models };
        } catch (error: any) {
          if (error.message?.includes('请求超时')) {
            return { success: false, error: '连接超时，请检查 Azure 服务状态' };
          }
          if (error.message?.includes('API key') || error.message?.includes('authentication')) {
            return { success: false, error: 'API Key 无效或已过期' };
          }
          return { success: false, error: error.message };
        }
      }

      return { success: false, error: '不支持的配置类型' };
    } catch (error: any) {
      return { success: false, error: error.message || '未知错误' };
    }
  }  /**
   * 获取可用模型列表
   */
  async getAvailableModels(config: ProcessedAIConfig): Promise<string[]> {
    console.log(`获取模型列表 - 供应商: ${config.type}, baseURL: ${config.baseURL}`);
    
    try {      if (config.type === 'ollama') {
        // Ollama 通过 /api/tags 端点获取模型列表
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
          }        } catch (error) {
          console.error('获取 Ollama 模型列表失败:', error);
          if (error instanceof Error && error.message?.includes('请求超时')) {
            console.warn('Ollama 请求超时');
          }
        }
        return [];      } else if (config.type === 'lmstudio') {
        // LM Studio 使用 OpenAI 兼容的 /models 端点
        try {
          // 如果 baseURL 已经包含 /v1，直接使用；否则添加 /v1
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
          }} catch (error) {
          console.error('获取 LM Studio 模型列表失败:', error);
          if (error instanceof Error && error.message?.includes('请求超时')) {
            return ['连接超时，请检查 LM Studio 状态'];
          }
          return ['无法连接到 LM Studio'];
        }} else if (config.type === 'openai') {
        // OpenAI 官方 API 获取模型列表
        try {
          const url = `${config.baseURL}/models`;
          console.log(`OpenAI 请求URL: ${url}`);
          
          const timeoutFetch = this.createTimeoutFetch(10000);
          const response = await timeoutFetch(url, {
            headers: {
              'Authorization': `Bearer ${config.apiKey}`,
              'Content-Type': 'application/json'
            }
          });
          console.log(`OpenAI 响应状态: ${response.status}`);
          
          if (response.ok) {
            const data = await response.json();
            console.log('OpenAI 响应数据:', data);
            
            const models = data.data?.map((model: any) => model.id) || [];
            console.log(`OpenAI 解析出的模型列表:`, models);
            
            // 如果获取到了模型列表，返回；否则返回常见模型
            return models.length > 0 ? models : [
              'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo', 
              'gpt-3.5-turbo-16k', 'text-davinci-003', 'text-davinci-002'
            ];
          }        } catch (error) {
          console.error('获取 OpenAI 模型列表失败，使用默认列表:', error);
          if (error instanceof Error && error.message?.includes('请求超时')) {
            console.warn('OpenAI 请求超时');
          }
        }
        // 返回常见的 OpenAI 模型作为后备
        return [
          'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo', 
          'gpt-3.5-turbo-16k', 'text-davinci-003', 'text-davinci-002'
        ];      } else if (config.type === 'deepseek') {
        // DeepSeek 通过 API 获取模型列表
        try {
          const url = `${config.baseURL}/models`;
          console.log(`DeepSeek 请求URL: ${url}`);
          
          const timeoutFetch = this.createTimeoutFetch(10000);
          const response = await timeoutFetch(url, {
            headers: {
              'Authorization': `Bearer ${config.apiKey}`,
              'Content-Type': 'application/json'
            }
          });
          console.log(`DeepSeek 响应状态: ${response.status}`);
          
          if (response.ok) {
            const data = await response.json();
            console.log('DeepSeek 响应数据:', data);
            
            const models = data.data?.map((model: any) => model.id) || [];
            console.log(`DeepSeek 解析出的模型列表:`, models);
            return models.length > 0 ? models : ['deepseek-chat', 'deepseek-coder'];
          }        } catch (error) {
          console.error('获取 DeepSeek 模型列表失败，使用默认列表:', error);
          if (error instanceof Error && error.message?.includes('请求超时')) {
            console.warn('DeepSeek 请求超时');
          }
        }
        // 返回常见的 DeepSeek 模型作为后备
        return ['deepseek-chat', 'deepseek-coder'];} else if (config.type === 'anthropic') {
        // Anthropic 模型列表（官方文档中的可用模型）
        // 尝试通过API验证可用性，但API不直接提供模型列表
        try {
          const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': config.apiKey || '',
              'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
              model: 'claude-3-haiku-20240307',
              max_tokens: 1,
              messages: [{ role: 'user', content: 'test' }]
            })
          });
          
          // 如果API key有效，返回已知可用模型
          if (response.ok || response.status === 400) {
            return [
              'claude-3-5-sonnet-20241022',
              'claude-3-5-haiku-20241022', 
              'claude-3-opus-20240229',
              'claude-3-sonnet-20240229',
              'claude-3-haiku-20240307'
            ];
          }
        } catch (error) {
          console.error('Anthropic API 连接测试失败:', error);
        }
        
        // 返回基础模型列表作为后备
        return [
          'claude-3-5-sonnet-20241022',
          'claude-3-5-haiku-20241022', 
          'claude-3-opus-20240229',
          'claude-3-sonnet-20240229',
          'claude-3-haiku-20240307'
        ];
      } else if (config.type === 'google') {
        // Google AI 尝试获取模型列表
        try {
          const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${config.apiKey}`);
          if (response.ok) {
            const data = await response.json();
            const models = data.models?.map((model: any) => model.name?.replace('models/', '')) || [];
            if (models.length > 0) {
              return models.filter((model: string) => model.includes('gemini'));
            }
          }
        } catch (error) {
          console.error('获取 Google AI 模型列表失败:', error);
        }
        
        // 返回常见的 Google AI 模型作为后备
        return [
          'gemini-1.5-pro-latest',
          'gemini-1.5-flash-latest',
          'gemini-pro',
          'gemini-pro-vision',
          'gemini-1.0-pro',
          'gemini-1.0-pro-001'
        ];
      } else if (config.type === 'cohere') {
        // Cohere 模型列表（通过API获取或返回已知模型）
        try {
          const cohere = new CohereClient({
            token: config.apiKey,
          });
          
          // Cohere SDK可能不直接提供模型列表API，返回已知模型
          return [
            'command-r-plus',
            'command-r',
            'command',
            'command-nightly',
            'command-light',
            'command-light-nightly'
          ];
        } catch (error) {
          console.error('Cohere 连接测试失败:', error);
        }
        
        // 返回基础模型列表
        return [
          'command-r-plus',
          'command-r',
          'command',
          'command-nightly',
          'command-light',
          'command-light-nightly'
        ];      } else if (config.type === 'mistral') {
        // Mistral AI 通过 API 获取模型列表
        try {
          const url = `${config.baseURL}/models`;
          console.log(`Mistral 请求URL: ${url}`);
          
          const response = await fetch(url, {
            headers: {
              'Authorization': `Bearer ${config.apiKey}`,
              'Content-Type': 'application/json'
            }
          });
          console.log(`Mistral 响应状态: ${response.status}`);
          
          if (response.ok) {
            const data = await response.json();
            console.log('Mistral 响应数据:', data);
            
            const models = data.data?.map((model: any) => model.id) || [];
            console.log(`Mistral 解析出的模型列表:`, models);
            
            return models.length > 0 ? models : [
              'mistral-large-latest',
              'mistral-medium-latest', 
              'mistral-small-latest',
              'codestral-latest',
              'open-mistral-7b',
              'open-mixtral-8x7b',
              'open-mixtral-8x22b'
            ];
          }
        } catch (error) {
          console.error('获取 Mistral 模型列表失败，使用默认列表:', error);
        }
        // 返回常见的 Mistral 模型作为后备
        return [
          'mistral-large-latest',
          'mistral-medium-latest', 
          'mistral-small-latest',
          'codestral-latest',
          'open-mistral-7b',
          'open-mixtral-8x7b',
          'open-mixtral-8x22b'
        ];} else if (config.type === 'azure') {
        // Azure OpenAI 的模型通常是用户部署的，尝试通过API获取
        try {
          if (config.baseURL) {
            // 构建Azure的模型列表API端点
            const modelsUrl = config.baseURL.includes('/deployments/') 
              ? config.baseURL.replace(/\/deployments\/.*$/, '/deployments')
              : `${config.baseURL}/deployments`;
              
            const response = await fetch(`${modelsUrl}?api-version=2023-12-01-preview`, {
              headers: {
                'api-key': config.apiKey || '',
                'Content-Type': 'application/json'
              }
            });
            
            if (response.ok) {
              const data = await response.json();
              const deployments = data.data || [];
              const models = deployments.map((deployment: any) => deployment.id || deployment.model);
              if (models.length > 0) {
                return models;
              }
            }
          }
        } catch (error) {
          console.error('获取 Azure OpenAI 部署列表失败:', error);
        }
        
        // 如果有配置中的模型，返回配置的模型
        if (config.models && config.models.length > 0) {
          return config.models;
        }
        
        // 返回常见的 Azure OpenAI 部署名称
        return ['gpt-4', 'gpt-35-turbo', 'gpt-4-32k', 'text-davinci-003'];
      }
      
      return config.models || [];
    } catch (error) {
      console.error('获取模型列表失败:', error);
      return config.models || [];
    }
  }  /**
   * 智能测试 - 发送真实提示词并获取AI响应
   */
  async intelligentTest(config: ProcessedAIConfig): Promise<{ success: boolean; response?: string; error?: string; inputPrompt?: string }> {
    try {
      if (!config.enabled) {
        return { success: false, error: '配置已禁用' };
      }

      const model = config.defaultModel || config.customModel;
      if (!model) {
        return { success: false, error: '未设置默认模型' };
      }

      // 简单的测试提示词
      const testPrompt = '请用一句话简单介绍一下你自己。';

      let llm: any;
      
      if (config.type === 'openai' || config.type === 'deepseek' || config.type === 'mistral') {
        llm = new ChatOpenAI({
          openAIApiKey: config.apiKey,
          modelName: model,
          configuration: {
            baseURL: config.baseURL || undefined
          }
        });
      } else if (config.type === 'ollama') {
        llm = new Ollama({
          baseUrl: config.baseURL,
          model: model
        });      } else if (config.type === 'lmstudio') {
        // LM Studio 使用 ChatOpenAI 而不是 Ollama，因为它是 OpenAI 兼容的
        const baseUrl = config.baseURL || 'http://localhost:1234';
        const finalBaseUrl = baseUrl.endsWith('/v1') ? baseUrl : `${baseUrl}/v1`;
        
        llm = new ChatOpenAI({
          openAIApiKey: 'not-needed', // LM Studio 本地不需要 API key
          modelName: model,
          configuration: {
            baseURL: finalBaseUrl
          }
        });
      } else if (config.type === 'anthropic') {
        // 使用原生API调用，添加超时
        try {
          const timeoutFetch = this.createTimeoutFetch(20000);
          const response = await timeoutFetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': config.apiKey || '',
              'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
              model: model,
              max_tokens: 100,
              messages: [{ role: 'user', content: testPrompt }]
            })
          });
          
          if (response.ok) {
            const data = await response.json();
            return {
              success: true,
              response: data.content?.[0]?.text || '测试成功',
              inputPrompt: testPrompt
            };
          } else {
            return { 
              success: false, 
              error: `API调用失败: ${response.statusText}`,
              inputPrompt: testPrompt
            };
          }
        } catch (error: any) {
          if (error.message?.includes('请求超时')) {
            return { 
              success: false, 
              error: '连接超时，请检查网络连接',
              inputPrompt: testPrompt
            };
          }
          return { 
            success: false, 
            error: error.message || '未知错误',
            inputPrompt: testPrompt
          };
        }
      } else if (config.type === 'google') {
        // 使用原生API调用，添加超时
        try {
          const timeoutFetch = this.createTimeoutFetch(20000);
          const response = await timeoutFetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.apiKey}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              contents: [{ parts: [{ text: testPrompt }] }]
            })
          });
          
          if (response.ok) {
            const data = await response.json();
            return {
              success: true,
              response: data.candidates?.[0]?.content?.parts?.[0]?.text || '测试成功',
              inputPrompt: testPrompt
            };
          } else {
            return { 
              success: false, 
              error: `API调用失败: ${response.statusText}`,
              inputPrompt: testPrompt
            };
          }
        } catch (error: any) {
          if (error.message?.includes('请求超时')) {
            return { 
              success: false, 
              error: '连接超时，请检查网络连接',
              inputPrompt: testPrompt
            };
          }
          return { 
            success: false, 
            error: error.message || '未知错误',
            inputPrompt: testPrompt
          };
        }
      } else if (config.type === 'cohere') {
        const cohere = new CohereClient({
          token: config.apiKey,
        });
          try {
          const response = await this.withTimeout(
            cohere.generate({
              model: model,
              prompt: testPrompt,
              maxTokens: 100
            }),
            20000
          ) as any; // 临时类型断言来解决 Cohere 类型问题
          
          return {
            success: true,
            response: response.generations?.[0]?.text || '测试成功',
            inputPrompt: testPrompt
          };
        } catch (error: any) {
          if (error.message?.includes('请求超时')) {
            return { 
              success: false, 
              error: '连接超时，请检查网络连接',
              inputPrompt: testPrompt
            };
          }
          return { 
            success: false, 
            error: error.message || '未知错误',
            inputPrompt: testPrompt
          };
        }
      } else if (config.type === 'azure') {
        const azureConfig: any = {
          openAIApiKey: config.apiKey,
          modelName: model,
        };

        // 如果baseURL包含Azure格式，解析相关信息
        if (config.baseURL && config.baseURL.includes('openai.azure.com')) {
          azureConfig.azureOpenAIBasePath = config.baseURL;
          azureConfig.azureOpenAIApiVersion = '2023-12-01-preview';
        }
        
        llm = new ChatOpenAI(azureConfig);
      } else {
        return { success: false, error: '不支持的配置类型' };
      }      if (llm) {
        const response = await this.withTimeout(llm.invoke(testPrompt), 20000);
        const responseText = typeof response === 'string' ? response : (response as any)?.content || '测试成功';

        return {
          success: true,
          response: responseText,
          inputPrompt: testPrompt
        };
      }

      return { success: false, error: '未知错误' };
    } catch (error: any) {
      console.error('智能测试失败:', error);
      if (error.message?.includes('请求超时')) {
        return { 
          success: false, 
          error: '连接超时，请检查服务状态或网络连接',
          inputPrompt: '请用一句话简单介绍一下你自己。'
        };
      }
      return { 
        success: false, 
        error: error.message || '未知错误',
        inputPrompt: '请用一句话简单介绍一下你自己。'
      };
    }
  }

  /**
   * 生成 Prompt
   * 现在需要传入配置，因为不再有内存中的配置存储
   */
  async generatePrompt(request: AIGenerationRequest & { config: ProcessedAIConfig }): Promise<AIGenerationResult> {
    const { config } = request;
    
    if (!config) {
      throw new Error('配置不存在');
    }

    if (!config.enabled) {
      throw new Error('配置已禁用');
    }

    const model = request.model || config.defaultModel || config.customModel;
    if (!model) {
      throw new Error('未指定模型');
    }

    // 构建系统提示词 - 优先使用配置中的自定义系统提示词
    console.log('生成提示词 - 配置中的 systemPrompt:', config.systemPrompt);
    console.log('生成提示词 - 请求中的 systemPrompt:', request.systemPrompt);
    
    const systemPrompt = config.systemPrompt || request.systemPrompt || 
      `你是一个专业的 AI 提示词工程师。请根据用户提供的主题，生成一个高质量、结构化的 AI 提示词。

要求：
1. 提示词应该清晰、具体、可操作
2. 包含必要的上下文和约束条件
3. 使用适当的格式和结构
4. 考虑不同的使用场景
5. 提供具体的输出格式要求

请直接返回优化后的提示词内容，不需要额外的解释。`;

    console.log('生成提示词 - 最终使用的 systemPrompt:', systemPrompt);

    // 构建用户提示词
    // 如果用户自定义了系统提示词，则用户提示词应该简化，避免与系统提示词冲突
    const userPrompt = request.customPrompt || (config.systemPrompt ? 
      `主题：${request.topic}` : // 如果有自定义系统提示词，只传递主题
      `请为以下主题生成一个专业的 AI 提示词：

主题：${request.topic}

请生成一个完整、可直接使用的提示词。`);

    console.log('生成提示词 - 用户提示词内容:', userPrompt);
    console.log('生成提示词 - 请求主题:', request.topic);

    try {
      let llm: any;
      
      if (config.type === 'openai' || config.type === 'deepseek') {
        llm = new ChatOpenAI({
          openAIApiKey: config.apiKey,
          modelName: model,
          configuration: {
            baseURL: config.baseURL || undefined
          }
        });
      } else if (config.type === 'ollama') {
        llm = new Ollama({
          baseUrl: config.baseURL,
          model: model
        });      } else if (config.type === 'lmstudio') {
        // LM Studio 使用 ChatOpenAI，因为它是 OpenAI 兼容的
        const baseUrl = config.baseURL || 'http://localhost:1234';
        const finalBaseUrl = baseUrl.endsWith('/v1') ? baseUrl : `${baseUrl}/v1`;
        llm = new ChatOpenAI({
          openAIApiKey: 'not-needed', // LM Studio 本地不需要 API key
          modelName: model,
          configuration: {
            baseURL: finalBaseUrl
          }
        });
      } else if (config.type === 'anthropic') {
        llm = new ChatAnthropic({
          anthropicApiKey: config.apiKey,
          modelName: model
        });
      } else if (config.type === 'google') {
        llm = new ChatGoogleGenerativeAI({
          apiKey: config.apiKey,
          model: model
        });
      } else if (config.type === 'cohere') {
        const cohere = new CohereClient({
          token: config.apiKey,
        });
          // Cohere 使用不同的API格式，添加超时
        const prompt = `${systemPrompt}\n\nUser: ${userPrompt}\n\nAssistant:`;
        const response = await this.withSmartTimeout(
          cohere.generate({
            model: model,
            prompt: prompt,
            maxTokens: 2000,
            temperature: 0.7
          }),
          90000, // 90秒总超时，生成较长的内容
          5000,  // 每5秒检查一次
          () => true // 对于Cohere API，我们也无法检测活动状态
        ) as any; // 临时类型断言来解决 Cohere 类型问题
        
        const generatedPrompt = response.generations?.[0]?.text || '';
        
        const result: AIGenerationResult = {
          id: `gen_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          configId: config.configId,
          topic: request.topic,
          generatedPrompt: generatedPrompt,
          model: model,
          customPrompt: request.customPrompt,
          createdAt: new Date()
        };

        return result;
      } else if (config.type === 'azure') {
        llm = new ChatOpenAI({
          openAIApiKey: config.apiKey,
          modelName: model,
          configuration: config.baseURL ? {
            baseURL: config.baseURL
          } : undefined
        });
      } else if (config.type === 'mistral') {
        llm = new ChatOpenAI({
          openAIApiKey: config.apiKey,
          modelName: model,
          configuration: {
            baseURL: config.baseURL || 'https://api.mistral.ai/v1'
          }
        });
      } else {
        throw new Error('不支持的配置类型');
      }

      // 构建消息
      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ];      const response = await this.withSmartTimeout(
        llm.invoke(messages), 
        90000, // 90秒总超时
        5000,  // 每5秒检查一次
        () => true // 对于非流式生成，我们无法检测活动状态，所以使用固定超时
      );
      const generatedPrompt = typeof response === 'string' ? response : (response as any)?.content || '';

      const result: AIGenerationResult = {
        id: `gen_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        configId: config.configId, // 使用 configId 而不是 id
        topic: request.topic,
        generatedPrompt: generatedPrompt,
        model: model,
        customPrompt: request.customPrompt,
        createdAt: new Date()
      };

      return result;
    } catch (error: any) {
      console.error('生成 Prompt 失败:', error);
      if (error.message?.includes('请求超时')) {
        throw new Error('生成超时，请检查网络连接或服务状态');
      }
      throw new Error(`生成失败: ${error.message}`);
    }
  }
  /**
   * 流式生成 Prompt（支持实时返回字符数统计和部分内容）
   */
  async generatePromptWithStream(
    request: AIGenerationRequest,
    config: ProcessedAIConfig, 
    onProgress: (charCount: number, partialContent?: string) => boolean, // 修改返回类型为boolean，false表示应该停止
    abortSignal?: AbortSignal // 添加 AbortSignal 支持
  ): Promise<AIGenerationResult> {
    const model = request.model || config.defaultModel || config.customModel;
    
    if (!model) {
      throw new Error('未指定模型');
    }

    if (!config.enabled) {
      throw new Error('配置已禁用');
    }

    // 系统提示词
    console.log('流式生成提示词 - 配置中的 systemPrompt:', config.systemPrompt);
    
    const systemPrompt = config.systemPrompt || `你是一个专业的 AI 提示词工程师，专门帮助用户创建高质量的 AI 提示词。你需要根据用户提供的主题和要求，生成一个结构清晰、逻辑严密、实用性强的提示词。

要求：
1. 提示词应该清晰、具体、可操作
2. 包含必要的上下文和约束条件
3. 使用适当的格式和结构
4. 考虑不同的使用场景
5. 提供具体的输出格式要求

请直接返回优化后的提示词内容，不需要额外的解释。`;

    console.log('流式生成提示词 - 最终使用的 systemPrompt:', systemPrompt);

    // 构建用户提示词
    // 如果用户自定义了系统提示词，则用户提示词应该简化，避免与系统提示词冲突
    const userPrompt = request.customPrompt || (config.systemPrompt ? 
      `主题：${request.topic}` : // 如果有自定义系统提示词，只传递主题
      `请为以下主题生成一个专业的 AI 提示词：

主题：${request.topic}

请生成一个完整、可直接使用的提示词。`);

    console.log('流式生成提示词 - 用户提示词内容:', userPrompt);
    console.log('流式生成提示词 - 请求主题:', request.topic);

    try {
      let llm: any;
      
      if (config.type === 'openai' || config.type === 'deepseek') {
        llm = new ChatOpenAI({
          openAIApiKey: config.apiKey,
          modelName: model,
          configuration: {
            baseURL: config.baseURL || undefined
          },
          streaming: true // 启用流式传输
        });
      } else if (config.type === 'ollama') {
        llm = new Ollama({
          baseUrl: config.baseURL,
          model: model
        });      } else if (config.type === 'lmstudio') {
        // LM Studio 使用 ChatOpenAI，因为它是 OpenAI 兼容的
        const baseUrl = config.baseURL || 'http://localhost:1234';
        const finalBaseUrl = baseUrl.endsWith('/v1') ? baseUrl : `${baseUrl}/v1`;
        
        llm = new ChatOpenAI({
          openAIApiKey: 'not-needed', // LM Studio 本地不需要 API key
          modelName: model,
          configuration: {
            baseURL: finalBaseUrl
          },
          streaming: true
        });
      } else if (config.type === 'anthropic') {
        llm = new ChatAnthropic({
          anthropicApiKey: config.apiKey,
          modelName: model,
          streaming: true
        });
      } else if (config.type === 'google') {
        llm = new ChatGoogleGenerativeAI({
          apiKey: config.apiKey,
          model: model,
          streaming: true
        });
      } else if (config.type === 'cohere') {
        // Cohere 目前不支持LangChain流式，使用常规调用，添加超时
        const cohere = new CohereClient({
          token: config.apiKey,
        });
          const prompt = `${systemPrompt}\n\nUser: ${userPrompt}\n\nAssistant:`;
        const response = await this.withSmartTimeout(
          cohere.generate({
            model: model,
            prompt: prompt,
            maxTokens: 2000,
            temperature: 0.7
          }),
          90000, // 90秒总超时
          5000,  // 每5秒检查一次
          () => true // Cohere不支持真正的流式，所以无法检测活动状态
        ) as any; // 临时类型断言来解决 Cohere 类型问题
        
        const accumulatedContent = response.generations?.[0]?.text || '';
        
        // 模拟流式进度
        const totalChars = accumulatedContent.length;
        for (let i = 0; i <= totalChars; i += Math.ceil(totalChars / 20)) {
          // 检查中断信号
          if (abortSignal?.aborted) {
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
        
        const result: AIGenerationResult = {
          id: `gen_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          configId: config.configId,
          topic: request.topic,
          generatedPrompt: accumulatedContent,
          model: model,
          customPrompt: request.customPrompt,
          createdAt: new Date()
        };

        return result;
      } else if (config.type === 'azure') {
        llm = new ChatOpenAI({
          openAIApiKey: config.apiKey,
          modelName: model,
          configuration: config.baseURL ? {
            baseURL: config.baseURL
          } : undefined,
          streaming: true
        });
      } else if (config.type === 'mistral') {
        llm = new ChatOpenAI({
          openAIApiKey: config.apiKey,
          modelName: model,
          configuration: {
            baseURL: config.baseURL || 'https://api.mistral.ai/v1'
          },
          streaming: true
        });
      } else {        throw new Error('不支持的配置类型');
      }

      // 构建消息
      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ];
      
      let accumulatedContent = '';
      let lastContentUpdate = Date.now();
      let shouldStop = false; // 添加停止标志
      
      // 检查是否已经被中断
      if (abortSignal?.aborted) {
        throw new Error('生成已被中断');
      }
      
      // 尝试使用流式传输，添加智能超时
      try {
        const streamPromise = (async () => {
          const stream = await llm.stream(messages);
          for await (const chunk of stream) {
            // 检查中断信号
            if (abortSignal?.aborted || shouldStop) {
              console.log('检测到中断信号，停止流式生成');
              break;
            }
            
            const content = typeof chunk === 'string' ? chunk : chunk.content;
            if (content) {
              accumulatedContent += content;
              lastContentUpdate = Date.now(); // 更新最后内容更新时间
              
              // 调用进度回调，如果返回false则停止
              const continueGeneration = onProgress(accumulatedContent.length, accumulatedContent);
              if (continueGeneration === false) {
                console.log('前端请求停止生成');
                shouldStop = true;
                break;
              }
            }
          }
        })();
        
        // 使用智能超时：如果有内容持续更新，就不会超时
        await this.withSmartTimeout(
          streamPromise, 
          60000, // 总超时时间60秒
          2000,  // 每2秒检查一次活动状态
          () => {
            // 如果已经标记为停止，不继续等待
            if (shouldStop || abortSignal?.aborted) {
              return false;
            }
            
            const now = Date.now();
            const timeSinceLastUpdate = now - lastContentUpdate;
            // 如果5秒内有内容更新，认为还在活动中
            return timeSinceLastUpdate < 5000;
          }
        );
        
      } catch (streamError) {
        // 如果是用户中断或中止信号，直接抛出中断错误
        if (shouldStop || abortSignal?.aborted) {
          throw new Error('用户中断生成');
        }
        
        // 如果流式传输失败，回退到普通调用
        console.warn('流式传输失败，回退到普通调用:', streamError);
        if (streamError instanceof Error && streamError.message?.includes('请求超时')) {
          // 检查是否是真正的超时还是无响应超时
          const now = Date.now();
          const timeSinceLastUpdate = now - lastContentUpdate;
          if (timeSinceLastUpdate > 10000 && accumulatedContent.length === 0) {
            // 超过10秒没有任何内容，真正的超时
            throw new Error('生成超时，AI服务可能无响应，请检查网络连接或服务状态');
          } else if (timeSinceLastUpdate > 30000) {
            // 超过30秒没有新内容，但已有内容，可能是生成完成但连接未正常关闭
            console.warn('检测到生成可能已完成，但连接未正常关闭，使用已有内容');
          } else {
            // 正在生成中被中断，抛出用户友好的错误
            throw new Error(`生成中断，已生成${accumulatedContent.length}字符，请重试或检查网络连接`);
          }
        }
        
        // 如果已有部分内容，尝试使用现有内容
        if (accumulatedContent.length > 0) {
          console.log(`使用流式传输生成的部分内容，长度: ${accumulatedContent.length}`);
        } else {
          // 完全回退到普通调用
          // 但在普通调用前也要检查中断信号
          if (abortSignal?.aborted || shouldStop) {
            throw new Error('用户中断生成');
          }
          
          const response = await this.withSmartTimeout(
            llm.invoke(messages), 
            90000, // 90秒总超时
            5000,  // 每5秒检查一次
            () => true // 在fallback中无法检测活动状态
          );
          accumulatedContent = typeof response === 'string' ? response : (response as any)?.content || '';
          // 模拟流式进度
          const totalChars = accumulatedContent.length;
          for (let i = 0; i <= totalChars; i += Math.ceil(totalChars / 20)) {
            // 检查中断信号
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

      // 检查是否被中断
      if (shouldStop || abortSignal?.aborted) {
        throw new Error('用户中断生成');
      }

      const result: AIGenerationResult = {
        id: `gen_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        configId: config.configId,
        topic: request.topic,
        generatedPrompt: accumulatedContent,
        model: model,
        customPrompt: request.customPrompt,
        createdAt: new Date()
      };

      return result;
    } catch (error: any) {
      console.error('流式生成 Prompt 失败:', error);
      if (error.message?.includes('请求超时')) {
        throw new Error('生成超时，请检查网络连接或服务状态');
      }
      throw new Error(`生成失败: ${error.message}`);
    }
  }
}

// 单例模式
export const aiServiceManager = new AIServiceManager();
