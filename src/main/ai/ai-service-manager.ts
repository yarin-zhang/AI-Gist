import { 
  AIGenerationRequest, 
  AIGenerationResult, 
  AIConfig,
  AIConfigTestResult
} from '@shared/types/ai';
import { AIProviderFactory } from './providers/provider-factory';
import { AITestResult, AIIntelligentTestResult } from './providers/base-provider';

// 使用共享的 AIConfig 类型，添加一个别名用于处理后的配置
type ProcessedAIConfig = AIConfig;

/**
 * 常量定义
 */
const CONSTANTS = {
  TIMEOUT: {
    DEFAULT: 15000,
    LONG: 60000,
    STREAM: 90000
  },
  ACTIVITY_CHECK: {
    INTERVAL: 5000,
    STREAM_INTERVAL: 2000
  },
  ERROR_MESSAGES: {
    CONFIG_DISABLED: '配置已禁用',
    NO_MODEL: '未指定模型',
    UNSUPPORTED_PROVIDER: '不支持的AI供应商类型',
    GENERATION_TIMEOUT: '生成超时，请检查网络连接或服务状态',
    GENERATION_FAILED: '生成失败',
    USER_INTERRUPTED: '用户中断生成'
  },
  LOG_MESSAGES: {
    TEST_START: '开始测试配置连接',
    TEST_SUCCESS: '配置连接测试成功',
    TEST_FAILED: '配置连接测试失败',
    GENERATION_START: '开始生成提示词',
    GENERATION_SUCCESS: '提示词生成成功',
    GENERATION_FAILED: '提示词生成失败',
    STREAM_INTERRUPTED: '检测到中断信号，停止流式生成',
    STREAM_FALLBACK: '流式传输失败，回退到普通调用'
  }
} as const;

/**
 * AI 服务管理器
 * 负责协调不同AI供应商的服务，提供统一的API接口
 */
class AIServiceManager {
  // 私有属性
  private activeGenerations = new Map<string, AbortController>(); // 存储活跃的生成请求
  
  // ==================== IPC 相关方法 ====================

  /**
   * 处理 AI 配置添加请求
   * @param config 原始配置
   * @returns 处理后的配置
   */
  processAddConfig(config: any): any {
    // 确保日期字段正确处理
    const processedConfig = {
      ...config,
      createdAt: config.createdAt ? new Date(config.createdAt) : new Date(),
      updatedAt: config.updatedAt ? new Date(config.updatedAt) : new Date()
    };
    return processedConfig;
  }

  /**
   * 处理 AI 配置更新请求
   * @param id 配置ID
   * @param config 原始配置
   * @returns 处理后的配置
   */
  processUpdateConfig(id: string, config: any): any {
    // 确保日期字段正确处理
    const processedConfig = {
      ...config,
      updatedAt: new Date()
    };
    return processedConfig;
  }

  /**
   * 处理 AI 配置测试请求
   * @param config 原始配置
   * @returns 测试结果
   */
  async processTestConfig(config: any): Promise<{ success: boolean; error?: string; models?: string[] }> {
    // 将配置转换为内部格式
    const processedConfig = {
      ...config,
      models: Array.isArray(config.models) ? config.models : [],
      createdAt: new Date(config.createdAt),
      updatedAt: new Date(config.updatedAt)
    };
    
    return await this.testConfig(processedConfig);
  }

  /**
   * 处理获取模型列表请求
   * @param config 原始配置
   * @returns 模型列表
   */
  async processGetModels(config: any): Promise<string[]> {
    // 将配置转换为内部格式
    const processedConfig = {
      ...config,
      models: Array.isArray(config.models) ? config.models : [],
      createdAt: new Date(config.createdAt),
      updatedAt: new Date(config.updatedAt)
    };
    
    return await this.getAvailableModels(processedConfig);
  }

  /**
   * 处理生成提示词请求
   * @param request 生成请求
   * @param config 原始配置
   * @returns 生成结果
   */
  async processGeneratePrompt(request: AIGenerationRequest, config: any): Promise<AIGenerationResult> {
    // 将配置转换为内部格式
    const processedConfig = {
      ...config,
      models: Array.isArray(config.models) ? config.models : [],
      createdAt: new Date(config.createdAt),
      updatedAt: new Date(config.updatedAt)
    };
    
    // 调试：打印配置信息
    console.log('AI服务管理器 - 原始配置 systemPrompt:', config.systemPrompt);
    console.log('AI服务管理器 - 处理后配置 systemPrompt:', processedConfig.systemPrompt);
    
    const requestWithConfig = {
      ...request,
      config: processedConfig
    };
    
    return await this.generatePrompt(requestWithConfig);
  }

  /**
   * 处理智能测试请求
   * @param config 原始配置
   * @returns 测试结果
   */
  async processIntelligentTest(config: any): Promise<{ success: boolean; response?: string; error?: string; inputPrompt?: string }> {
    // 将配置转换为内部格式
    const processedConfig = {
      ...config,
      models: Array.isArray(config.models) ? config.models : [],
      createdAt: new Date(config.createdAt),
      updatedAt: new Date(config.updatedAt)
    };
    
    return await this.intelligentTest(processedConfig);
  }

  /**
   * 处理流式生成提示词请求
   * @param request 生成请求
   * @param config 原始配置
   * @param onProgress 进度回调函数
   * @returns 生成结果
   */
  async processGeneratePromptWithStream(
    request: AIGenerationRequest,
    config: any,
    onProgress: (charCount: number, partialContent?: string) => boolean
  ): Promise<AIGenerationResult> {
    // 生成唯一的请求ID
    const requestId = `gen_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // 创建 AbortController
    const abortController = new AbortController();
    this.activeGenerations.set(requestId, abortController);
    
    try {
      // 将配置转换为内部格式
      const processedConfig = {
        ...config,
        models: Array.isArray(config.models) ? config.models : [],
        createdAt: new Date(config.createdAt),
        updatedAt: new Date(config.updatedAt)
      };
      
      // 调试：打印配置信息
      console.log('AI服务管理器流式生成 - 原始配置 systemPrompt:', config.systemPrompt);
      console.log('AI服务管理器流式生成 - 处理后配置 systemPrompt:', processedConfig.systemPrompt);
      console.log('AI服务管理器流式生成 - 请求ID:', requestId);
      
      const result = await this.generatePromptWithStream(
        request,
        processedConfig,
        (charCount: number, partialContent?: string) => {
          // 检查是否已被中断
          if (abortController.signal.aborted) {
            console.log('AI服务管理器: 检测到中断信号，停止发送进度');
            return false;
          }
          
          // 调用进度回调
          return onProgress(charCount, partialContent);
        },
        abortController.signal
      );
      
      return result;
    } catch (error: any) {
      if (error.message?.includes('中断生成') || abortController.signal.aborted) {
        console.log('AI服务管理器: 生成被中断');
        throw new Error('生成已被中断');
      }
      throw error;
    } finally {
      // 清理
      this.activeGenerations.delete(requestId);
    }
  }

  /**
   * 停止所有活跃的生成请求
   * @returns 停止结果
   */
  stopAllGenerations(): { success: boolean; message: string } {
    console.log('AI服务管理器: 收到停止生成请求，活跃请求数:', this.activeGenerations.size);
    
    // 中断所有活跃的生成请求
    for (const [requestId, abortController] of this.activeGenerations) {
      console.log(`AI服务管理器: 中断生成请求 ${requestId}`);
      abortController.abort();
    }
    
    // 清空活跃请求
    this.activeGenerations.clear();
    
    return { success: true, message: '已停止所有生成请求' };
  }

  /**
   * 处理调试提示词请求
   * @param prompt 提示词
   * @param config 原始配置
   * @returns 调试结果
   */
  async processDebugPrompt(prompt: string, config: any): Promise<{
    success: boolean;
    result: string | null;
    model: string | null;
    error: string | null;
  }> {
    // 将配置转换为内部格式
    const processedConfig = {
      ...config,
      models: Array.isArray(config.models) ? config.models : [],
      createdAt: new Date(config.createdAt),
      updatedAt: new Date(config.updatedAt)
    };
    
    // 创建调试请求
    const debugRequest = {
      configId: config.configId,
      topic: prompt,
      customPrompt: prompt,
      model: config.defaultModel || config.customModel,
      config: processedConfig
    };
    
    try {
      console.log('AI服务管理器调试提示词 - 配置:', processedConfig);
      console.log('AI服务管理器调试提示词 - 请求:', debugRequest);
      
      const result = await this.generatePrompt(debugRequest);
      return {
        success: true,
        result: result.generatedPrompt,
        model: result.model,
        error: null
      };
    } catch (error: any) {
      console.error('AI服务管理器调试提示词失败:', error);
      return {
        success: false,
        result: null,
        model: null,
        error: error.message || '调试失败'
      };
    }
  }

  // ==================== 配置测试 ====================

  /**
   * 测试配置连接
   * @param config AI配置
   * @returns 测试结果
   */
  async testConfig(config: ProcessedAIConfig): Promise<{ success: boolean; error?: string; models?: string[] }> {
    console.log(`${CONSTANTS.LOG_MESSAGES.TEST_START} - 供应商: ${config.type}, baseURL: ${config.baseURL}, 配置ID: ${config.configId}`);
    
    try {
      const provider = AIProviderFactory.getProvider(config);
      const result = await provider.testConfig(config);
      
      if (result.success) {
        console.log(`${CONSTANTS.LOG_MESSAGES.TEST_SUCCESS} - 供应商: ${config.type}`);
      } else {
        console.log(`${CONSTANTS.LOG_MESSAGES.TEST_FAILED} - 供应商: ${config.type}, 错误: ${result.error}`);
      }
      
      return result;
    } catch (error: any) {
      console.error(`配置测试异常 - 供应商: ${config.type}`, error);
      return { 
        success: false, 
        error: error.message || CONSTANTS.ERROR_MESSAGES.UNSUPPORTED_PROVIDER 
      };
    }
  }

  /**
   * 获取可用模型列表
   * @param config AI配置
   * @returns 模型列表
   */
  async getAvailableModels(config: ProcessedAIConfig): Promise<string[]> {
    console.log(`获取模型列表 - 供应商: ${config.type}, baseURL: ${config.baseURL}`);
    
    try {
      const provider = AIProviderFactory.getProvider(config);
      return await provider.getAvailableModels(config);
    } catch (error: any) {
      console.error(`获取模型列表失败 - 供应商: ${config.type}`, error);
      return config.models || [];
    }
  }

  // ==================== 智能测试 ====================

  /**
   * 智能测试 - 发送真实提示词并获取AI响应
   * @param config AI配置
   * @returns 测试结果
   */
  async intelligentTest(config: ProcessedAIConfig): Promise<{ success: boolean; response?: string; error?: string; inputPrompt?: string }> {
    try {
      const provider = AIProviderFactory.getProvider(config);
      return await provider.intelligentTest(config);
    } catch (error: any) {
      console.error(`智能测试失败 - 供应商: ${config.type}`, error);
      return { 
        success: false, 
        error: error.message || '智能测试失败',
        inputPrompt: '请用一句话简单介绍一下你自己。'
      };
    }
  }

  // ==================== 提示词生成 ====================

  /**
   * 生成提示词
   * @param request 生成请求
   * @returns 生成结果
   */
  async generatePrompt(request: AIGenerationRequest & { config: ProcessedAIConfig }): Promise<AIGenerationResult> {
    const { config } = request;
    
    console.log(`${CONSTANTS.LOG_MESSAGES.GENERATION_START} - 供应商: ${config.type}, 主题: ${request.topic}`);
    
    try {
      const provider = AIProviderFactory.getProvider(config);
      const result = await provider.generatePrompt(request);
      
      console.log(`${CONSTANTS.LOG_MESSAGES.GENERATION_SUCCESS} - 供应商: ${config.type}, 生成字符数: ${result.generatedPrompt.length}`);
      return result;
    } catch (error: any) {
      console.error(`${CONSTANTS.LOG_MESSAGES.GENERATION_FAILED} - 供应商: ${config.type}`, error);
      
      if (error.message?.includes('请求超时')) {
        throw new Error(CONSTANTS.ERROR_MESSAGES.GENERATION_TIMEOUT);
      }
      throw new Error(`${CONSTANTS.ERROR_MESSAGES.GENERATION_FAILED}: ${error.message}`);
    }
  }

  /**
   * 流式生成提示词（支持实时返回字符数统计和部分内容）
   * @param request 生成请求
   * @param config AI配置
   * @param onProgress 进度回调函数
   * @param abortSignal 中断信号
   * @returns 生成结果
   */
  async generatePromptWithStream(
    request: AIGenerationRequest,
    config: ProcessedAIConfig, 
    onProgress: (charCount: number, partialContent?: string) => boolean,
    abortSignal?: AbortSignal
  ): Promise<AIGenerationResult> {
    console.log(`${CONSTANTS.LOG_MESSAGES.GENERATION_START} (流式) - 供应商: ${config.type}, 主题: ${request.topic}`);
    
    try {
      const provider = AIProviderFactory.getProvider(config);
      const result = await provider.generatePromptWithStream(request, config, onProgress, abortSignal);
      
      console.log(`${CONSTANTS.LOG_MESSAGES.GENERATION_SUCCESS} (流式) - 供应商: ${config.type}, 生成字符数: ${result.generatedPrompt.length}`);
      return result;
    } catch (error: any) {
      console.error(`${CONSTANTS.LOG_MESSAGES.GENERATION_FAILED} (流式) - 供应商: ${config.type}`, error);
      
      if (error.message?.includes('用户中断')) {
        throw new Error(CONSTANTS.ERROR_MESSAGES.USER_INTERRUPTED);
      }
      if (error.message?.includes('请求超时')) {
        throw new Error(CONSTANTS.ERROR_MESSAGES.GENERATION_TIMEOUT);
      }
      throw new Error(`${CONSTANTS.ERROR_MESSAGES.GENERATION_FAILED}: ${error.message}`);
    }
  }

  // ==================== 工具方法 ====================

  /**
   * 获取支持的供应商类型列表
   * @returns 支持的供应商类型数组
   */
  getSupportedProviderTypes(): string[] {
    return AIProviderFactory.getSupportedProviderTypes();
  }

  /**
   * 清除所有缓存的供应商实例
   */
  clearProviders(): void {
    AIProviderFactory.clearProviders();
  }

  /**
   * 验证配置是否有效
   * @param config AI配置
   * @returns 验证结果
   */
  validateConfig(config: ProcessedAIConfig): { valid: boolean; error?: string } {
    if (!config.type) {
      return { valid: false, error: '未指定供应商类型' };
    }

    if (!AIProviderFactory.getSupportedProviderTypes().includes(config.type)) {
      return { valid: false, error: `不支持的供应商类型: ${config.type}` };
    }

    if (!config.apiKey && config.type !== 'ollama' && config.type !== 'lmstudio') {
      return { valid: false, error: '未提供API密钥' };
    }

    if (!config.baseURL && config.type !== 'openai') {
      return { valid: false, error: '未提供基础URL' };
    }

    return { valid: true };
  }
}

// 单例模式导出
export const aiServiceManager = new AIServiceManager();
