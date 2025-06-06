import { ChatOpenAI } from '@langchain/openai';
import { Ollama } from '@langchain/ollama';
import { AIConfig, AIGenerationRequest, AIGenerationResult, AIGenerationHistory } from './types';

/**
 * AI 服务管理器
 */
class AIServiceManager {
  private configs: Map<string, AIConfig> = new Map();

  /**
   * 添加 AI 配置
   */
  addConfig(config: AIConfig): void {
    this.configs.set(config.id, config);
  }

  /**
   * 更新 AI 配置
   */
  updateConfig(id: string, config: Partial<AIConfig>): AIConfig | null {
    const existingConfig = this.configs.get(id);
    if (!existingConfig) return null;

    const updatedConfig = {
      ...existingConfig,
      ...config,
      updatedAt: new Date()
    };
    this.configs.set(id, updatedConfig);
    return updatedConfig;
  }

  /**
   * 删除 AI 配置
   */
  removeConfig(id: string): boolean {
    return this.configs.delete(id);
  }

  /**
   * 获取所有配置
   */
  getAllConfigs(): AIConfig[] {
    return Array.from(this.configs.values());
  }

  /**
   * 获取启用的配置
   */
  getEnabledConfigs(): AIConfig[] {
    return this.getAllConfigs().filter(config => config.enabled);
  }

  /**
   * 根据 ID 获取配置
   */
  getConfig(id: string): AIConfig | null {
    return this.configs.get(id) || null;
  }

  /**
   * 测试配置连接
   */
  async testConfig(config: AIConfig): Promise<{ success: boolean; error?: string; models?: string[] }> {
    try {
      if (config.type === 'openai') {
        const llm = new ChatOpenAI({
          openAIApiKey: config.apiKey,
          configuration: {
            baseURL: config.baseURL || undefined
          }
        });

        // 尝试获取模型列表（如果支持）
        try {
          // 简单测试：发送一个小的请求
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
        const llm = new Ollama({
          baseUrl: config.baseURL,
          model: config.defaultModel || 'llama2'
        });

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
  async getAvailableModels(config: AIConfig): Promise<string[]> {
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
   */
  async generatePrompt(request: AIGenerationRequest): Promise<AIGenerationResult> {
    const config = this.getConfig(request.configId);
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
        configId: request.configId,
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
