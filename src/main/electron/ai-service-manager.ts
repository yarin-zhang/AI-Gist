import { ChatOpenAI } from '@langchain/openai';
import { Ollama } from '@langchain/ollama';
import { AIGenerationRequest, AIGenerationResult } from './types';

// 定义配置接口，适配前端数据库的结构
interface ProcessedAIConfig {
  id?: number;
  configId: string;
  name: string;
  type: 'openai' | 'ollama';
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
class AIServiceManager {

  /**
   * 测试配置连接
   */
  async testConfig(config: ProcessedAIConfig): Promise<{ success: boolean; error?: string; models?: string[] }> {
    try {
      if (config.type === 'openai') {
        const llm = new ChatOpenAI({
          openAIApiKey: config.apiKey,
          configuration: {
            baseURL: config.baseURL || undefined
          }
        });

        // 尝试发送一个简单的测试请求
        try {
          await llm.invoke('test');
          return { success: true };
        } catch (error: any) {
          if (error.message?.includes('API key') || error.message?.includes('authentication')) {
            return { success: false, error: 'API Key 无效或已过期' };
          }
          if (error.message?.includes('network') || error.message?.includes('ECONNREFUSED')) {
            return { success: false, error: '无法连接到服务器，请检查 baseURL' };
          }
          // 其他错误可能是正常的（比如模型不存在等），但连接是成功的
          return { success: true };
        }
      } else if (config.type === 'ollama') {
        try {
          // 尝试获取模型列表
          const response = await fetch(`${config.baseURL}/api/tags`);
          if (response.ok) {
            const data = await response.json();
            const models = data.models?.map((model: any) => model.name) || [];
            return { success: true, models };
          } else {
            return { success: false, error: `无法连接到 Ollama 服务器: ${response.statusText}` };
          }
        } catch (error: any) {
          if (error.message?.includes('ECONNREFUSED') || error.message?.includes('fetch')) {
            return { success: false, error: '无法连接到 Ollama 服务器，请确保服务已启动' };
          }
          return { success: false, error: error.message };
        }
      }

      return { success: false, error: '不支持的配置类型' };
    } catch (error: any) {
      return { success: false, error: error.message || '未知错误' };
    }
  }

  /**
   * 获取可用模型列表
   */
  async getAvailableModels(config: ProcessedAIConfig): Promise<string[]> {
    try {
      if (config.type === 'ollama') {
        const response = await fetch(`${config.baseURL}/api/tags`);
        if (response.ok) {
          const data = await response.json();
          return data.models?.map((model: any) => model.name) || [];
        }
      } else if (config.type === 'openai') {
        // OpenAI 兼容的 API 通常有固定的模型列表，或者通过配置指定
        return config.models || [];
      }
      return [];
    } catch (error) {
      console.error('获取模型列表失败:', error);
      return [];
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

请生成一个完整、可直接使用的提示词。`;

    try {
      let llm: any;
      
      if (config.type === 'openai') {
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
}

// 单例模式
export const aiServiceManager = new AIServiceManager();
