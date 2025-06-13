/**
 * 数据库相关类型定义
 * 包含所有数据模型的接口定义
 */

/**
 * 用户数据模型
 * 用于存储用户基本信息
 */
export interface User {
  /** 用户唯一标识符 */
  id?: number;
  /** 用户邮箱地址 */
  email: string;
  /** 用户显示名称 */
  name?: string;
  /** 记录创建时间 */
  createdAt: Date;
  /** 记录最后更新时间 */
  updatedAt: Date;
}

/**
 * 文章数据模型
 * 用于存储文章内容和元数据
 */
export interface Post {
  /** 文章唯一标识符 */
  id?: number;
  /** 文章标题 */
  title: string;
  /** 文章内容 */
  content?: string;
  /** 是否已发布 */
  published: boolean;
  /** 作者用户ID */
  authorId: number;
  /** 记录创建时间 */
  createdAt: Date;
  /** 记录最后更新时间 */
  updatedAt: Date;
}

/**
 * 分类数据模型
 * 用于组织和分类提示词
 */
export interface Category {
  /** 分类唯一标识符 */
  id?: number;
  /** 分类名称 */
  name: string;
  /** 分类标识颜色 */
  color?: string;
  /** 记录创建时间 */
  createdAt: Date;
  /** 记录最后更新时间 */
  updatedAt: Date;
}

/**
 * 提示词数据模型
 * 核心业务数据，存储AI提示词内容和元数据
 */
export interface Prompt {
  /** 提示词唯一标识符 */
  id?: number;
  /** 提示词标题 */
  title: string;
  /** 提示词内容 */
  content: string;
  /** 提示词描述 */
  description?: string;
  /** 所属分类ID */
  categoryId?: number;
  /** 标签字符串，多个标签用逗号分隔 */
  tags?: string;
  /** 是否收藏 */
  isFavorite: boolean;
  /** 使用次数统计 */
  useCount: number;
  /** 记录创建时间 */
  createdAt: Date;
  /** 记录最后更新时间 */
  updatedAt: Date;
}

/**
 * 提示词变量数据模型
 * 用于定义提示词中的可变参数
 */
export interface PromptVariable {
  /** 变量唯一标识符 */
  id?: number;
  /** 变量名称，用于模板替换 */
  name: string;
  /** 变量显示标签 */
  label: string;
  /** 变量类型（text, number, select等） */
  type: string;
  /** 选择项选项，JSON字符串格式 */
  options?: string;
  /** 默认值 */
  defaultValue?: string;
  /** 是否必填 */
  required: boolean;
  /** 输入框占位符 */
  placeholder?: string;
  /** 所属提示词ID */
  promptId: number;
  /** 记录创建时间 */
  createdAt: Date;
  /** 记录最后更新时间 */
  updatedAt: Date;
}

/**
 * 提示词历史记录数据模型
 * 用于追踪提示词的修改历史
 */
export interface PromptHistory {
  /** 历史记录唯一标识符 */
  id?: number;
  /** 关联的提示词ID */
  promptId: number;
  /** 版本号 */
  version: number;
  /** 历史版本的标题 */
  title: string;
  /** 历史版本的内容 */
  content: string;
  /** 历史版本的描述 */
  description?: string;
  /** 历史版本的分类ID */
  categoryId?: number;
  /** 历史版本的标签 */
  tags?: string;
  /** 历史版本的变量配置，JSON字符串格式 */
  variables?: string;
  /** 变更描述说明 */
  changeDescription?: string;
  /** 记录创建时间 */
  createdAt: Date;
}

/**
 * AI配置数据模型
 * 用于存储各种AI服务的连接配置
 */
export interface AIConfig {
  /** 配置唯一标识符 */
  id?: number;
  /** 配置的唯一标识符，用于业务逻辑识别 */
  configId: string;
  /** 配置显示名称 */
  name: string;
  /** AI服务类型 */
  type: 'openai' | 'ollama' | 'anthropic' | 'google' | 'azure' | 'lmstudio' | 'deepseek' | 'cohere' | 'mistral';
  /** API服务基础URL */
  baseURL: string;
  /** API密钥 */
  apiKey?: string;
  /** 密钥（某些服务需要） */
  secretKey?: string;
  /** 支持的模型列表 */
  models: string[];
  /** 默认使用的模型 */
  defaultModel?: string;
  /** 自定义模型名称 */
  customModel?: string;
  /** 是否启用此配置 */
  enabled: boolean;
  /** 是否为全局首选配置 */
  isPreferred?: boolean;
  /** 自定义的生成提示词的系统提示词 */
  systemPrompt?: string;
  /** 记录创建时间 */
  createdAt: Date;
  /** 记录最后更新时间 */
  updatedAt: Date;
}

/**
 * AI生成历史记录数据模型
 * 用于记录AI生成的历史数据和结果
 */
export interface AIGenerationHistory {
  /** 历史记录唯一标识符 */
  id?: number;
  /** 历史记录的业务唯一标识符 */
  historyId: string;
  /** 使用的AI配置ID */
  configId: string;
  /** 生成主题 */
  topic: string;
  /** 生成的提示词结果 */
  generatedPrompt: string;
  /** 使用的模型名称 */
  model: string;
  /** 自定义提示词 */
  customPrompt?: string;
  /** 生成状态 */
  status: 'success' | 'error';
  /** 错误信息（如果生成失败） */
  errorMessage?: string;
  /** 调试结果（AI对提示词的响应结果） */
  debugResult?: string;
  /** 调试状态 */
  debugStatus?: 'success' | 'error' | 'pending';
  /** 调试错误信息 */
  debugErrorMessage?: string;
  /** 记录创建时间 */
  createdAt: Date;
}

/**
 * 应用设置数据模型
 * 用于存储应用的全局配置信息
 */
export interface AppSettings {
  /** 设置唯一标识符 */
  id?: number;
  /** 设置键名 */
  key: string;
  /** 设置值 */
  value: string;
  /** 值类型 */
  type: 'string' | 'number' | 'boolean' | 'json';
  /** 设置描述 */
  description?: string;
  /** 记录创建时间 */
  createdAt: Date;
  /** 记录最后更新时间 */
  updatedAt: Date;
}

/**
 * 扩展的提示词数据模型
 * 包含关联的分类和变量信息
 */
export interface PromptWithRelations extends Prompt {
  /** 关联的分类信息 */
  category?: Category;
  /** 关联的变量列表 */
  variables?: PromptVariable[];
}

/**
 * 扩展的分类数据模型
 * 包含该分类下的所有提示词
 */
export interface CategoryWithRelations extends Category {
  /** 该分类下的提示词列表 */
  prompts?: Prompt[];
}

/**
 * 提示词查询过滤条件
 */
export interface PromptFilters {
  /** 分类ID过滤 */
  categoryId?: number | null;
  /** 搜索关键词 */
  search?: string;
  /** 标签过滤 */
  tags?: string;
  /** 是否只显示收藏 */
  isFavorite?: boolean;
  /** 页码 */
  page?: number;
  /** 每页数量 */
  limit?: number;
  /** 排序方式 */
  sortBy?: string;
}

/**
 * 分页查询结果
 */
export interface PaginatedResult<T> {
  /** 数据列表 */
  data: T[];
  /** 总记录数 */
  total: number;
  /** 是否还有更多数据 */
  hasMore: boolean;
}

/**
 * AI生成历史查询选项
 */
export interface AIGenerationHistoryOptions {
  /** 配置ID过滤 */
  configId?: string;
  /** 状态过滤 */
  status?: 'success' | 'error';
  /** 页码 */
  page?: number;
  /** 每页数量 */
  limit?: number;
}

/**
 * AI生成历史统计信息
 */
export interface AIGenerationHistoryStats {
  /** 总记录数 */
  total: number;
  /** 成功记录数 */
  success: number;
  /** 失败记录数 */
  error: number;
  /** 按配置分组的统计信息 */
  byConfig: Record<string, {
    total: number;
    success: number;
    error: number;
  }>;
}

/**
 * 提示词变量填充结果
 */
export interface PromptFillResult {
  /** 原始提示词内容 */
  originalContent: string;
  /** 填充变量后的内容 */
  filledContent: string;
  /** 使用的变量值 */
  variables: Record<string, string>;
  /** 提示词的变量定义 */
  promptVariables: PromptVariable[];
}
