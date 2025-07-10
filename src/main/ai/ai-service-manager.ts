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
