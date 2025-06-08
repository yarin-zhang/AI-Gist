import { ChatOpenAI } from '@langchain/openai';
import { Ollama } from '@langchain/ollama';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { CohereClient } from 'cohere-ai';
import { AIGenerationRequest, AIGenerationResult } from './types';

// 定义配置接口，适配前端数据库的结构
interface ProcessedAIConfig {
  id?: number;
  configId: string;
  name: string;
  type: 'openai' | 'ollama' | 'anthropic' | 'google' | 'azure' | 'lmstudio' | 'deepseek' | 'cohere' | 'mistral';
  baseURL: string;
  apiKey?: string;
  secretKey?: string;
  models: string[];
  defaultModel?: string;
  customModel?: string;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * AI 服务管理器
 * 不再维护内存中的配置存储，而是直接处理传入的配置
 */
class AIServiceManager {  /**
   * 测试配置连接
   */
  async testConfig(config: ProcessedAIConfig): Promise<{ success: boolean; error?: string; models?: string[] }> {
    try {
      if (config.type === 'openai' || config.type === 'deepseek' || config.type === 'mistral') {
        const llm = new ChatOpenAI({
          openAIApiKey: config.apiKey,
          configuration: {
            baseURL: config.baseURL || undefined
          }
        });

        // 尝试发送一个简单的测试请求
        try {
          await llm.invoke('test');
          // OpenAI 类型连接成功，返回配置中的模型列表
          return { success: true, models: config.models || [] };
        } catch (error: any) {
          if (error.message?.includes('API key') || error.message?.includes('authentication')) {
            return { success: false, error: 'API Key 无效或已过期' };
          }
          if (error.message?.includes('network') || error.message?.includes('ECONNREFUSED')) {
            return { success: false, error: '无法连接到服务器，请检查 baseURL' };
          }
          // 其他错误可能是正常的（比如模型不存在等），但连接是成功的
          return { success: true, models: config.models || [] };
        }
      } else if (config.type === 'ollama' || config.type === 'lmstudio') {
        try {
          // 尝试获取模型列表
          const response = await fetch(`${config.baseURL}/api/tags`);
          if (response.ok) {
            const data = await response.json();
            const models = data.models?.map((model: any) => model.name) || [];
            return { success: true, models };
          } else {
            return { success: false, error: `无法连接到服务器: ${response.statusText}` };
          }
        } catch (error: any) {
          if (error.message?.includes('ECONNREFUSED') || error.message?.includes('fetch')) {
            return { success: false, error: '无法连接到服务器，请确保服务已启动' };
          }
          return { success: false, error: error.message };
        }
      } else if (config.type === 'anthropic') {
        try {
          // 使用原生API测试Anthropic连接
          const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': config.apiKey || '',
              'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
              model: config.models?.[0] || 'claude-3-sonnet-20240229',
              max_tokens: 5,
              messages: [{ role: 'user', content: 'test' }]
            })
          });
          
          if (response.ok || response.status === 400) { // 400可能是因为消息太短，但API key有效
            return { success: true, models: config.models || ['claude-3-sonnet-20240229', 'claude-3-haiku-20240307'] };
          } else if (response.status === 401) {
            return { success: false, error: 'API Key 无效或已过期' };
          } else {
            return { success: false, error: `连接失败: ${response.statusText}` };
          }
        } catch (error: any) {
          return { success: false, error: error.message };
        }
      } else if (config.type === 'google') {
        try {
          // 使用原生API测试Google AI连接
          const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${config.apiKey}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              contents: [{ parts: [{ text: 'test' }] }]
            })
          });
          
          if (response.ok || response.status === 400) {
            return { success: true, models: config.models || ['gemini-pro', 'gemini-pro-vision'] };
          } else if (response.status === 401 || response.status === 403) {
            return { success: false, error: 'API Key 无效或已过期' };
          } else {
            return { success: false, error: `连接失败: ${response.statusText}` };
          }
        } catch (error: any) {
          return { success: false, error: error.message };
        }
      } else if (config.type === 'cohere') {
        try {
          const cohere = new CohereClient({
            token: config.apiKey,
          });
          
          // 测试生成
          await cohere.generate({
            model: config.models?.[0] || 'command',
            prompt: 'test',
            maxTokens: 5
          });
          
          return { success: true, models: config.models || ['command', 'command-light'] };
        } catch (error: any) {
          if (error.message?.includes('API key') || error.message?.includes('authentication')) {
            return { success: false, error: 'API Key 无效或已过期' };
          }
          return { success: false, error: error.message };
        }
      } else if (config.type === 'azure') {
        try {
          // Azure OpenAI使用不同的配置方式
          const azureConfig: any = {
            openAIApiKey: config.apiKey,
            modelName: config.models?.[0] || 'gpt-35-turbo',
          };

          // 如果baseURL包含Azure格式，解析相关信息
          if (config.baseURL && config.baseURL.includes('openai.azure.com')) {
            const urlParts = config.baseURL.split('.');
            azureConfig.azureOpenAIBasePath = config.baseURL;
            azureConfig.azureOpenAIApiVersion = '2023-12-01-preview';
          }
          
          const llm = new ChatOpenAI(azureConfig);
          await llm.invoke('test');
          return { success: true, models: config.models || [] };
        } catch (error: any) {
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
    try {
      if (config.type === 'ollama' || config.type === 'lmstudio') {
        const response = await fetch(`${config.baseURL}/api/tags`);
        if (response.ok) {
          const data = await response.json();
          return data.models?.map((model: any) => model.name) || [];
        }
      } else if (config.type === 'openai' || config.type === 'deepseek' || config.type === 'mistral') {
        // OpenAI 兼容的 API 通常有固定的模型列表，或者通过配置指定
        return config.models || [];
      } else if (config.type === 'anthropic') {
        return config.models || ['claude-3-sonnet-20240229', 'claude-3-haiku-20240307', 'claude-3-opus-20240229'];
      } else if (config.type === 'google') {
        return config.models || ['gemini-pro', 'gemini-pro-vision'];
      } else if (config.type === 'cohere') {
        return config.models || ['command', 'command-light', 'command-nightly'];
      } else if (config.type === 'azure') {
        return config.models || [];
      }
      return [];
    } catch (error) {
      console.error('获取模型列表失败:', error);
      return [];
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
      } else if (config.type === 'ollama' || config.type === 'lmstudio') {
        llm = new Ollama({
          baseUrl: config.baseURL,
          model: model
        });
      } else if (config.type === 'anthropic') {
        // 使用原生API调用
        try {
          const response = await fetch('https://api.anthropic.com/v1/messages', {
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
          return { 
            success: false, 
            error: error.message || '未知错误',
            inputPrompt: testPrompt
          };
        }
      } else if (config.type === 'google') {
        // 使用原生API调用
        try {
          const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.apiKey}`, {
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
          const response = await cohere.generate({
            model: model,
            prompt: testPrompt,
            maxTokens: 100
          });
          
          return {
            success: true,
            response: response.generations[0]?.text || '测试成功',
            inputPrompt: testPrompt
          };
        } catch (error: any) {
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
      }

      if (llm) {
        const response = await llm.invoke(testPrompt);
        const responseText = typeof response === 'string' ? response : response.content;

        return {
          success: true,
          response: responseText,
          inputPrompt: testPrompt
        };
      }

      return { success: false, error: '未知错误' };
    } catch (error: any) {
      console.error('智能测试失败:', error);
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

    // 构建系统提示词
    const systemPrompt = request.systemPrompt || 
      `你是一个专业的 AI 提示词工程师。请根据用户提供的主题，生成一个高质量、结构化的 AI 提示词。

要求：
1. 提示词应该清晰、具体、可操作
2. 包含必要的上下文和约束条件
3. 使用适当的格式和结构
4. 考虑不同的使用场景
5. 提供具体的输出格式要求

请直接返回优化后的提示词内容，不需要额外的解释。`;

    // 构建用户提示词
    const userPrompt = request.customPrompt || 
      `请为以下主题生成一个专业的 AI 提示词：

主题：${request.topic}

请生成一个完整、可直接使用的提示词。`;    try {
      let llm: any;
      
      if (config.type === 'openai' || config.type === 'deepseek') {
        llm = new ChatOpenAI({
          openAIApiKey: config.apiKey,
          modelName: model,
          configuration: {
            baseURL: config.baseURL || undefined
          }
        });
      } else if (config.type === 'ollama' || config.type === 'lmstudio') {
        llm = new Ollama({
          baseUrl: config.baseURL,
          model: model
        });      } else if (config.type === 'anthropic') {
        llm = new ChatAnthropic({
          anthropicApiKey: config.apiKey,
          modelName: model
        });} else if (config.type === 'google') {
        llm = new ChatGoogleGenerativeAI({
          apiKey: config.apiKey,
          model: model
        });
      } else if (config.type === 'cohere') {
        const cohere = new CohereClient({
          token: config.apiKey,
        });
        
        // Cohere 使用不同的API格式
        const prompt = `${systemPrompt}\n\nUser: ${userPrompt}\n\nAssistant:`;
        const response = await cohere.generate({
          model: model,
          prompt: prompt,
          maxTokens: 2000,
          temperature: 0.7
        });
        
        const generatedPrompt = response.generations[0]?.text || '';
        
        const result: AIGenerationResult = {
          id: `gen_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          configId: config.configId, // 使用 configId 而不是 id
          topic: request.topic,
          generatedPrompt: generatedPrompt,
          model: model,
          customPrompt: request.customPrompt,
          createdAt: new Date()
        };

        return result;      } else if (config.type === 'azure') {
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
      ];

      const response = await llm.invoke(messages);
      const generatedPrompt = typeof response === 'string' ? response : response.content;

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
      throw new Error(`生成失败: ${error.message}`);
    }
  }
  /**
   * 流式生成 Prompt（支持实时返回字符数统计和部分内容）
   */
  async generatePromptWithStream(
    request: AIGenerationRequest,
    config: ProcessedAIConfig, 
    onProgress: (charCount: number, partialContent?: string) => void
  ): Promise<AIGenerationResult> {
    const model = request.model || config.defaultModel || config.customModel;
    
    if (!model) {
      throw new Error('未指定模型');
    }

    if (!config.enabled) {
      throw new Error('配置已禁用');
    }

    // 系统提示词
    const systemPrompt = `你是一个专业的 AI 提示词工程师，专门帮助用户创建高质量的 AI 提示词。你需要根据用户提供的主题和要求，生成一个结构清晰、逻辑严密、实用性强的提示词。

要求：
1. 提示词应该清晰、具体、可操作
2. 包含必要的上下文和约束条件
3. 使用适当的格式和结构
4. 考虑不同的使用场景
5. 提供具体的输出格式要求

请直接返回优化后的提示词内容，不需要额外的解释。`;

    // 构建用户提示词
    const userPrompt = request.customPrompt || 
      `请为以下主题生成一个专业的 AI 提示词：

主题：${request.topic}

请生成一个完整、可直接使用的提示词。`;    try {
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
      } else if (config.type === 'ollama' || config.type === 'lmstudio') {
        llm = new Ollama({
          baseUrl: config.baseURL,
          model: model
        });      } else if (config.type === 'anthropic') {
        llm = new ChatAnthropic({
          anthropicApiKey: config.apiKey,
          modelName: model,
          streaming: true
        });} else if (config.type === 'google') {
        llm = new ChatGoogleGenerativeAI({
          apiKey: config.apiKey,
          model: model,
          streaming: true
        });
      } else if (config.type === 'cohere') {
        // Cohere 目前不支持LangChain流式，使用常规调用
        const cohere = new CohereClient({
          token: config.apiKey,
        });
        
        const prompt = `${systemPrompt}\n\nUser: ${userPrompt}\n\nAssistant:`;
        const response = await cohere.generate({
          model: model,
          prompt: prompt,
          maxTokens: 2000,
          temperature: 0.7
        });
        
        const accumulatedContent = response.generations[0]?.text || '';
        
        // 模拟流式进度
        const totalChars = accumulatedContent.length;
        for (let i = 0; i <= totalChars; i += Math.ceil(totalChars / 20)) {
          const currentCharCount = Math.min(i, totalChars);
          const partialContent = accumulatedContent.substring(0, currentCharCount);
          onProgress(currentCharCount, partialContent);
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

        return result;      } else if (config.type === 'azure') {
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
      } else {
        throw new Error('不支持的配置类型');
      }

      // 构建消息
      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ];

      let accumulatedContent = '';
      
      // 尝试使用流式传输
      try {
        const stream = await llm.stream(messages);
          for await (const chunk of stream) {
          const content = typeof chunk === 'string' ? chunk : chunk.content;
          if (content) {
            accumulatedContent += content;
            // 传递字符数和当前累积的内容
            onProgress(accumulatedContent.length, accumulatedContent);
          }
        }
      } catch (streamError) {
        // 如果流式传输失败，回退到普通调用
        console.warn('流式传输失败，回退到普通调用:', streamError);
        const response = await llm.invoke(messages);
        accumulatedContent = typeof response === 'string' ? response : response.content;
          // 模拟流式进度
        const totalChars = accumulatedContent.length;
        for (let i = 0; i <= totalChars; i += Math.ceil(totalChars / 20)) {
          const currentCharCount = Math.min(i, totalChars);
          const partialContent = accumulatedContent.substring(0, currentCharCount);
          onProgress(currentCharCount, partialContent);
          await new Promise(resolve => setTimeout(resolve, 50));
        }
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
      throw new Error(`生成失败: ${error.message}`);
    }
  }
}

// 单例模式
export const aiServiceManager = new AIServiceManager();
