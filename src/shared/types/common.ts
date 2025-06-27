/**
 * 通用类型定义
 */

/**
 * 基础实体接口
 */
export interface BaseEntity {
  id?: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 响应基础接口
 */
export interface BaseResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * 分页参数
 */
export interface PaginationParams {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * 分页结果
 */
export interface PaginationResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

/**
 * 搜索参数
 */
export interface SearchParams {
  query?: string;
  filters?: Record<string, any>;
  pagination?: PaginationParams;
}

/**
 * 操作结果 - 扩展 BaseResponse，添加错误代码
 */
export interface OperationResult<T = any> extends BaseResponse<T> {
  code?: string;
}

/**
 * 验证错误
 */
export interface ValidationError {
  field: string;
  message: string;
  code?: string;
}

/**
 * 验证结果
 */
export interface ValidationResult {
  valid: boolean;
  errors?: ValidationError[];
}

/**
 * 文件信息
 */
export interface FileInfo {
  name: string;
  size: number;
  type: string;
  lastModified: Date;
  path?: string;
}

/**
 * 键值对
 */
export interface KeyValuePair<T = any> {
  key: string;
  value: T;
}

/**
 * 选择项
 */
export interface SelectOption<T = any> {
  label: string;
  value: T;
  disabled?: boolean;
  group?: string;
}

/**
 * 树形节点
 */
export interface TreeNode<T = any> {
  id: string | number;
  label: string;
  data?: T;
  children?: TreeNode<T>[];
  parent?: TreeNode<T>;
  expanded?: boolean;
  selected?: boolean;
  disabled?: boolean;
}

/**
 * 事件处理器
 */
export type EventHandler<T = any> = (event: T) => void;

/**
 * 取消函数
 */
export type CancelFunction = () => void;

/**
 * 异步操作状态
 */
export type AsyncStatus = 'idle' | 'loading' | 'success' | 'error';

/**
 * 异步操作结果
 */
export interface AsyncResult<T = any> {
  status: AsyncStatus;
  data?: T;
  error?: string;
  loading: boolean;
}
