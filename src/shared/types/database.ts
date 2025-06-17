/**
 * 数据库相关类型定义 - 统一管理
 * 从各个分散的类型定义文件整合而来
 */

/**
 * 用户数据模型
 * @deprecated 不再使用，保留仅为了向后兼容
 */
export interface User {
  id?: number;
  email: string;
  name?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 文章数据模型
 * @deprecated 不再使用，保留仅为了向后兼容
 */
export interface Post {
  id?: number;
  title: string;
  content?: string;
  published: boolean;
  authorId: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 分类数据模型
 */
export interface Category {
  id?: number;
  name: string;
  description?: string;
  color?: string;  
  icon?: string;
  parentId?: number;
  isActive: boolean;
  sortOrder?: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 提示词数据模型
 */
export interface Prompt {
  id?: number;
  title: string;
  content: string;
  description?: string;
  categoryId?: number;
  tags: string[];
  variables?: PromptVariable[];
  isFavorite: boolean;
  useCount: number;
  version?: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 提示词变量数据模型
 */
export interface PromptVariable {
  id?: number;
  promptId: number;
  name: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'number' | 'boolean';
  defaultValue?: string;
  options?: string[];
  required: boolean;
  placeholder?: string;
  description?: string;
  validation?: {
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    min?: number;
    max?: number;
  };
  sortOrder?: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * AI配置数据模型
 */
export interface AIConfig {
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
  systemPrompt?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * AI生成历史记录数据模型
 */
export interface AIGenerationHistory {
  id?: number;
  configId: string;
  topic: string;
  generatedPrompt: string;
  model: string;
  customPrompt?: string;
  status: 'success' | 'error';
  errorMessage?: string;
  debugResult?: string;
  debugStatus?: 'success' | 'error' | 'pending';
  debugErrorMessage?: string;
  createdAt: Date;
}

/**
 * 应用设置数据模型
 */
export interface AppSettings {
  id?: number;
  key: string;
  value: any;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description?: string;
  category?: string;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 扩展的提示词数据模型
 */
export interface PromptWithRelations extends Prompt {
  category?: Category;
  variableValues?: Record<string, any>;
}

/**
 * 扩展的分类数据模型
 */
export interface CategoryWithRelations extends Category {
  prompts?: Prompt[];
  children?: Category[];
  parent?: Category;
}

/**
 * 提示词查询过滤条件
 */
export interface PromptFilters {
  categoryId?: number;
  tags?: string[];
  isFavorite?: boolean;
  isActive?: boolean;
  searchText?: string;
}

/**
 * 分页查询结果
 */
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * 数据库健康检查结果
 */
export interface DatabaseHealthStatus {
  healthy: boolean;
  missingStores?: string[];
  corruptedStores?: string[];
  repairSuggestions?: string[];
}

/**
 * 数据导出结果
 */
export interface DatabaseExportResult {
  success: boolean;
  data?: {
    categories: Category[];
    prompts: Prompt[];
    aiConfigs: AIConfig[];
    aiHistory: AIGenerationHistory[];
    settings: AppSettings[];
    metadata: {
      exportTime: string;
      version: string;
      totalRecords: number;
    };
  };
  error?: string;
  message?: string;
}

/**
 * 数据导入结果
 */
export interface DatabaseImportResult {
  success: boolean;
  message?: string;
  error?: string;
  totalImported?: number;
  totalErrors?: number;
  details?: {
    categories?: number;
    prompts?: number;
    aiConfigs?: number;
    aiHistory?: number;
    settings?: number;
  };
}
