import { net } from 'electron';
import { AIConfig, AIGenerationRequest, AIGenerationResult } from '@shared/types/ai';
import { buildPrompts } from './prompt-templates';
import { NetworkProxyManager } from '../../electron/network-proxy';
import { preferencesManager } from '../../electron/preferences-manager';

/**
 * AI供应商测试结果
 */
export interface AITestResult {
  success: boolean;
  error?: string;
  models?: string[];
}

/**
 * AI供应商智能测试结果
 */
export interface AIIntelligentTestResult {
  success: boolean;
  response?: string;
  error?: string;
  inputPrompt?: string;
}

/**
 * 网络代理配置类型
 */
export interface NetworkProxyConfig {
  mode: 'direct' | 'system' | 'manual';
  manualConfig?: {
    httpProxy?: string;
    httpsProxy?: string;
    noProxy?: string;
  };
}

/**
 * AI模型测试结果
 */
export interface AIModelTestResult {
  success: boolean;
  error?: string;
  model?: string;
  response?: string;
}

/**
 * AI供应商基础接口
 */
export interface AIProvider {
  /**
   * 测试配置连接
   */
  testConfig(config: AIConfig): Promise<AITestResult>;
  
  /**
   * 获取可用模型列表
   */
  getAvailableModels(config: AIConfig): Promise<string[]>;
  
  /**
   * 测试特定模型
   */
  testModel(config: AIConfig, model: string): Promise<AIModelTestResult>;
  
  /**
   * 智能测试 - 发送真实提示词并获取AI响应
   */
  intelligentTest(config: AIConfig): Promise<AIIntelligentTestResult>;
  
  /**
   * 生成提示词
   */
  generatePrompt(request: AIGenerationRequest & { config: AIConfig }): Promise<AIGenerationResult>;
  
  /**
   * 流式生成提示词
   */
  generatePromptWithStream(
    request: AIGenerationRequest,
    config: AIConfig,
    onProgress: (charCount: number, partialContent?: string) => boolean,
    abortSignal?: AbortSignal
  ): Promise<AIGenerationResult>;
}

/**
 * AI供应商基础抽象类
 * 提供通用的超时处理和错误处理功能
 */
export abstract class BaseAIProvider implements AIProvider {
  
  /**
   * 获取当前网络代理配置
   */
  protected getCurrentProxyConfig(): NetworkProxyConfig {
    try {
      const userPrefs = preferencesManager.getPreferences();
      const proxyConfig = userPrefs.networkProxy;
      
      if (proxyConfig) {
        return {
          mode: proxyConfig.mode || 'system',
          manualConfig: proxyConfig.manualConfig
        };
      }
      
      // 默认使用系统代理
      return {
        mode: 'system'
      };
    } catch (error) {
      console.error('获取网络代理配置失败:', error);
      // 出错时使用系统代理作为后备
      return {
        mode: 'system'
      };
    }
  }

  /**
   * 判断是否应该使用代理
   * 根据网络代理配置和目标URL来决定
   */
  protected shouldUseProxy(url: string): boolean {
    const proxyConfig = this.getCurrentProxyConfig();
    
    // 如果是直连模式，不使用代理
    if (proxyConfig.mode === 'direct') {
      return false;
    }
    
    // 如果是本地服务，不使用代理
    const isLocalService = url.includes('localhost') || url.includes('127.0.0.1') || url.includes('::1');
    if (isLocalService) {
      return false;
    }
    
    // 检查是否在 noProxy 列表中
    if (proxyConfig.manualConfig?.noProxy) {
      const noProxyList = proxyConfig.manualConfig.noProxy.split(',').map(item => item.trim());
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;
      
      for (const noProxyItem of noProxyList) {
        if (noProxyItem && (hostname === noProxyItem || hostname.endsWith(`.${noProxyItem}`))) {
          return false;
        }
      }
    }
    
    // 其他情况使用代理
    return true;
  }

  /**
   * 创建网络请求（使用 Electron net 模块，自动支持系统代理）
   */
  protected createProxyAwareRequest(timeoutMs = 15000) {
    return (url: string, options: any = {}): Promise<Response> => {
      return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error('请求超时'));
        }, timeoutMs);

        try {
          const request = net.request({
            method: options.method || 'GET',
            url: url,
            headers: options.headers || {}
          });

          request.on('response', (response) => {
            clearTimeout(timeoutId);
            
            const chunks: Buffer[] = [];
            
            response.on('data', (chunk) => {
              chunks.push(chunk);
            });
            
            response.on('end', () => {
              const body = Buffer.concat(chunks).toString();
              
              // 创建类似 fetch Response 的对象
              const mockResponse = {
                ok: response.statusCode >= 200 && response.statusCode < 300,
                status: response.statusCode,
                statusText: response.statusMessage || '',
                headers: response.headers,
                json: () => Promise.resolve(JSON.parse(body)),
                text: () => Promise.resolve(body)
              } as unknown as Response;
              
              resolve(mockResponse);
            });
            
            response.on('error', (error) => {
              clearTimeout(timeoutId);
              reject(error);
            });
          });
          
          request.on('error', (error) => {
            clearTimeout(timeoutId);
            reject(error);
          });
          
          // 发送请求体（如果有）
          if (options.body) {
            request.write(options.body);
          }
          
          request.end();
        } catch (error) {
          clearTimeout(timeoutId);
          reject(error);
        }
      });
    };
  }

  /**
   * 创建带超时的网络请求（根据网络代理配置智能选择）
   */
  protected createTimeoutFetch(timeoutMs = 15000) {
    return (url: string, options: any = {}): Promise<Response> => {
      const proxyConfig = this.getCurrentProxyConfig();
      const shouldUseProxy = this.shouldUseProxy(url);
      
      console.log(`网络请求配置 - URL: ${url}, 代理模式: ${proxyConfig.mode}, 使用代理: ${shouldUseProxy}`);
      
      if (shouldUseProxy) {
        // 使用支持代理的 net 模块
        console.log(`使用 Electron net 模块请求远程服务（代理模式: ${proxyConfig.mode}）: ${url}`);
        return this.createProxyAwareRequest(timeoutMs)(url, options);
      } else {
        // 使用标准 fetch（直连模式或本地服务）
        console.log(`使用标准 fetch 请求（直连模式）: ${url}`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        return fetch(url, {
          ...options,
          signal: controller.signal
        }).finally(() => {
          clearTimeout(timeoutId);
        });
      }
    };
  }

  /**
   * 创建带超时的 Promise 调用
   */
  protected async withTimeout<T>(promise: Promise<T>, timeoutMs = 15000): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('请求超时')), timeoutMs)
      )
    ]);
  }

  /**
   * 创建智能超时 - 基于活动状态的超时判断
   */
  protected async withSmartTimeout<T>(
    promise: Promise<T>, 
    timeoutMs = 60000,
    activityCheckMs = 5000,
    onActivityCheck?: () => boolean
  ): Promise<T> {
    let isActive = true;
    let lastActivityTime = Date.now();
    
    const activityChecker = setInterval(() => {
      const now = Date.now();
      const hasActivity = onActivityCheck ? onActivityCheck() : true;
      
      if (hasActivity) {
        lastActivityTime = now;
      }
      
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
   * 处理常见错误并返回用户友好的错误消息
   */
  protected handleCommonError(error: any, providerName: string): string {
    const errorMessage = error.message || error.toString();
    
    if (errorMessage?.includes('请求超时') || errorMessage?.includes('timeout')) {
      return '连接超时，请检查网络或服务器状态';
    }
    if (errorMessage?.includes('API key') || errorMessage?.includes('authentication') || errorMessage?.includes('401')) {
      return 'API Key 无效或已过期';
    }
    if (errorMessage?.includes('network') || errorMessage?.includes('ECONNREFUSED') || errorMessage?.includes('ENOTFOUND')) {
      return '无法连接到服务器，请检查网络连接';
    }
    if (errorMessage?.includes('Model Not Exist') || errorMessage?.includes('model not found')) {
      return '指定的模型不存在或不支持，请检查模型名称或联系服务提供商';
    }
    if (errorMessage?.includes('rate limit') || errorMessage?.includes('quota') || errorMessage?.includes('429')) {
      return '请求频率超限或配额不足，请稍后重试';
    }
    if (errorMessage?.includes('invalid_request_error')) {
      return '请求参数错误，请检查配置信息';
    }
    if (errorMessage?.includes('server_error') || errorMessage?.includes('internal error') || errorMessage?.includes('500')) {
      return '服务器内部错误，请稍后重试';
    }
    if (errorMessage?.includes('403')) {
      return '访问被拒绝，请检查API Key权限或服务状态';
    }
    if (errorMessage?.includes('404')) {
      return '服务端点不存在，请检查Base URL配置';
    }
    if (errorMessage?.includes('502') || errorMessage?.includes('503') || errorMessage?.includes('504')) {
      return '服务暂时不可用，请稍后重试';
    }
    
    // 针对特定服务商的错误处理
    if (providerName === 'siliconflow' && errorMessage?.includes('400')) {
      return '硅基流动：模型不支持当前操作，请尝试其他模型';
    }
    if (providerName === 'tencent' && errorMessage?.includes('400')) {
      return '腾讯云：请求参数错误，请检查模型名称和API配置';
    }
    if (providerName === 'aliyun' && errorMessage?.includes('400')) {
      return '阿里云：请求参数错误，请检查模型名称和API配置';
    }
    
    return errorMessage || '未知错误';
  }

  /**
   * 统一的提示词构建方法
   * 使用提示词模板管理器来构建系统提示词和用户提示词
   */
  protected buildPrompts(request: AIGenerationRequest, config: AIConfig): { systemPrompt: string; userPrompt: string } {
    return buildPrompts(request, config);
  }

  /**
   * 创建生成结果
   */
  protected createGenerationResult(
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

  // 抽象方法，子类必须实现
  abstract testConfig(config: AIConfig): Promise<AITestResult>;
  abstract getAvailableModels(config: AIConfig): Promise<string[]>;
  abstract testModel(config: AIConfig, model: string): Promise<AIModelTestResult>;
  abstract intelligentTest(config: AIConfig): Promise<AIIntelligentTestResult>;
  abstract generatePrompt(request: AIGenerationRequest & { config: AIConfig }): Promise<AIGenerationResult>;
  abstract generatePromptWithStream(
    request: AIGenerationRequest,
    config: AIConfig,
    onProgress: (charCount: number, partialContent?: string) => boolean,
    abortSignal?: AbortSignal
  ): Promise<AIGenerationResult>;
} 