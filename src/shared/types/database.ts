/**
 * 数据库相关类型定义 - 统一管理
 * 从各个分散的类型定义文件整合而来
 */

// 导入 AI 相关类型
import type { AIConfig, AIGenerationHistory } from './ai';

// 重新导出 AI 类型，保持向后兼容
export type { AIConfig, AIGenerationHistory };

/**
 * 分类数据模型
 */
export interface Category {
  id?: number;
  uuid: string; // 全局唯一标识符，用于WebDAV同步
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
  uuid: string; // 全局唯一标识符，用于WebDAV同步
  title: string;
  content: string;
  description?: string;
  categoryId?: number;
  tags: string[] | string; // 支持数组或字符串格式
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
  uuid: string; // 全局唯一标识符，用于WebDAV同步
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
  categoryId?: number | null;
  tags?: string;
  isFavorite?: boolean;
  isActive?: boolean;
  search?: string;
  searchText?: string;
  sortBy?: 'timeDesc' | 'timeAsc' | 'useCount' | 'favorite' | 'title' | 'createdAt' | 'updatedAt';
  page?: number;
  limit?: number;
}

/**
 * 分页查询结果
 */
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  hasMore: boolean;
  page?: number;
  pageSize?: number;
  totalPages?: number;
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

/**
 * 提示词历史记录数据模型
 */
export interface PromptHistory {
  id?: number;
  uuid: string; // 全局唯一标识符，用于WebDAV同步
  promptId: number;
  title: string;
  content: string;
  description?: string;
  tags?: string;
  version: number;
  changeDescription?: string; // 变更描述
  createdAt: Date;
}

/**
 * 提示词填充结果
 */
export interface PromptFillResult {
  originalContent: string;
  filledContent: string;
  variables: Record<string, string>;
  promptVariables: PromptVariable[];
}

/**
 * AI生成历史查询选项
 */
export interface AIGenerationHistoryOptions {
  configId?: string;
  topic?: string;
  status?: 'success' | 'error' | 'pending';
  sortBy?: 'createdAt' | 'topic' | 'status';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
  search?: string;
}

/**
 * AI生成历史统计信息
 */
export interface AIGenerationHistoryStats {
  total: number;
  successful: number;
  failed: number;
  pending: number;
  totalByConfig: Record<string, number>;
  mostUsedConfigs: {
    configId: string;
    count: number;
  }[];
}

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
