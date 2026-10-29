/**
 * AI 相关类型定义 - 统一管理
 * 用于 Main 进程和 Renderer 进程之间的类型共享
 */

// 导入通用类型
import type { ValidationResult, ValidationError } from './common';

/**
 * AI 服务提供商类型
 */
export type AIProviderType = 'openai' | 'ollama' | 'anthropic' | 'google' | 'azure' | 'lmstudio' | 'deepseek' | 'mistral' | 'siliconflow' | 'tencent' | 'aliyun' | 'zhipu' | 'openrouter';

/**
 * AI 配置数据模型
 * 统一的 AI 配置接口，用于所有 AI 相关的服务
 */
export interface AIConfig {
  id?: number;
  uuid?: string; // 全局唯一标识符，用于 WebDAV 同步
  configId: string; // 业务唯一标识符
  name: string;
  type: AIProviderType;
  baseURL: string;
  apiKey?: string;
  secretKey?: string;
  models: string[];
  defaultModel?: string;
  customModel?: string;
  enabled: boolean;
  isPreferred?: boolean; // 是否为首选配置
  systemPrompt?: string; // 自定义的生成提示词的系统提示词
  temperature?: number;
  maxTokens?: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * AI 生成请求参数
 */
export interface AIGenerationRequest {
  configId: string;
  model?: string;
  topic: string;
  customPrompt?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * AI 生成结果
 */
export interface AIGenerationResult {
  id: string;
  configId: string;
  topic: string;
  generatedPrompt: string;
  model: string;
  customPrompt?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  createdAt: Date;
}

/**
 * AI 生成历史记录数据模型
 */
export interface AIGenerationHistory {
  id?: number;
  uuid: string; // 全局唯一标识符，用于 WebDAV 同步
  historyId: string; // 历史记录的业务ID
  configId: string;
  topic: string;
  generatedPrompt: string;
  model: string;
  customPrompt?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  status: 'success' | 'error' | 'pending';
  errorMessage?: string;
  debugResult?: string;
  debugStatus?: 'success' | 'error' | 'pending';
  debugErrorMessage?: string;
  createdAt: Date;
}

/**
 * AI 配置测试结果
 */
export interface AIConfigTestResult {
  success: boolean;
  error?: string;
  message?: string;
  models?: string[];
  modelSource?: 'remote' | 'default' | 'unavailable';
  modelListMessage?: string;
  response?: string;
}

/**
 * 「获取模型列表」的结果。
 * - remote：models 是从服务实际拿到的列表
 * - default：服务本身不提供模型列表接口，models 是内置的常见模型名
 * - unavailable：没拿到（请求失败时 error 是原因，服务返回空列表时没有 error），models 为空；
 *   内置常见模型放在 fallbackModels，由用户明确选择是否使用，不能冒充成功
 */
export interface AIModelListResult {
  models: string[];
  modelSource: 'remote' | 'default' | 'unavailable';
  fallbackModels?: string[];
  error?: string;
}

/**
 * AI 模型信息
 */
export interface AIModelInfo {
  id: string;
  name: string;
  description?: string;
  contextLength?: number;
  supportedFeatures?: string[];
}

/**
 * AI 生成进度信息
 */
export interface AIGenerationProgress {
  configId: string;
  topic: string;
  progress: number; // 0-100
  status: 'starting' | 'generating' | 'completed' | 'error';
  charCount?: number;
  partialContent?: string;
  error?: string;
}

/**
 * AI 服务状态
 */
export interface AIServiceStatus {
  configId: string;
  name: string;
  type: AIProviderType;
  enabled: boolean;
  isOnline: boolean;
  lastCheck?: Date;
  errorMessage?: string;
}

/**
 * AI 配置验证结果 - 使用通用的验证类型
 */
export interface AIConfigValidation extends ValidationResult {
  warnings?: ValidationError[];
}

/**
 * 快速优化提示词配置数据模型
 */
export interface QuickOptimizationConfig {
  id?: number;
  uuid: string; // 全局唯一标识符，用于 WebDAV 同步
  name: string; // 优化类型名称，如"更简短"、"更丰富"等
  description?: string; // 优化类型描述
  prompt: string; // 优化提示词模板
  enabled: boolean; // 是否启用
  sortOrder: number; // 排序顺序
  /** 内置默认动作的标识（shorter、richer……）；用户自己建的或改过的动作没有 */
  builtinKey?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 快速优化提示词配置创建数据
 */
export interface CreateQuickOptimizationConfig {
  name: string;
  description?: string;
  prompt: string;
  enabled?: boolean;
  sortOrder?: number;
  /** 只在预置默认动作时传 */
  builtinKey?: string;
}

/**
 * 快速优化提示词配置更新数据
 */
export interface UpdateQuickOptimizationConfig {
  name?: string;
  description?: string;
  prompt?: string;
  enabled?: boolean;
  sortOrder?: number;
}
