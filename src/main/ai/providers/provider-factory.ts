import { AIConfig } from '@shared/types/ai';
import { AIProvider } from './base-provider';
import { OpenAICompatibleProvider } from './openai-provider';
import { OllamaProvider } from './ollama-provider';
import { LMStudioProvider } from './lmstudio-provider';
import { AnthropicProvider } from './anthropic-provider';
import { GoogleProvider } from './google-provider';
import { AzureProvider } from './azure-provider';

/**
 * AI供应商工厂
 * 根据配置类型创建对应的供应商实例
 */
export class AIProviderFactory {
  private static providers = new Map<string, AIProvider>();

  /**
   * 获取AI供应商实例
   * @param config AI配置
   * @returns AI供应商实例
   */
  static getProvider(config: AIConfig): AIProvider {
    const providerType = config.type;
    
    // 如果已经创建过该类型的供应商，直接返回
    if (this.providers.has(providerType)) {
      return this.providers.get(providerType)!;
    }

    // 根据配置类型创建对应的供应商
    let provider: AIProvider;
    
    switch (providerType) {
      case 'openai':
      case 'deepseek':
      case 'mistral':
        provider = new OpenAICompatibleProvider();
        break;
      case 'ollama':
        provider = new OllamaProvider();
        break;
      case 'lmstudio':
        provider = new LMStudioProvider();
        break;
      case 'anthropic':
        provider = new AnthropicProvider();
        break;
      case 'google':
        provider = new GoogleProvider();
        break;
      case 'azure':
        provider = new AzureProvider();
        break;
      default:
        throw new Error(`不支持的AI供应商类型: ${providerType}`);
    }

    // 缓存供应商实例
    this.providers.set(providerType, provider);
    return provider;
  }

  /**
   * 清除所有缓存的供应商实例
   */
  static clearProviders(): void {
    this.providers.clear();
  }

  /**
   * 获取支持的供应商类型列表
   */
  static getSupportedProviderTypes(): string[] {
    return [
      'openai',
      'deepseek', 
      'mistral',
      'ollama',
      'lmstudio',
      'anthropic',
      'google',
      'azure'
    ];
  }
} 