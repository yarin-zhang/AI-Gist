/**
 * 分类API客户端
 * 提供分类相关的API调用接口
 */

import { CategoryService } from '../services/category.service';
import { Category, CategoryWithRelations } from '@shared/types/database';

/**
 * 分类API客户端类
 * 封装分类服务，提供统一的API调用接口
 */
export class CategoryApiClient {
  private categoryService: CategoryService;

  constructor() {
    this.categoryService = CategoryService.getInstance();
  }

  /**
   * 分类相关的API接口
   */
  categories = {
    /**
     * 创建分类
     */
    create: {
      /**
       * 创建新分类
       * @param input 分类创建数据
       * @returns Promise<Category> 创建的分类记录
       */
      mutate: async (input: Omit<Category, 'id' | 'createdAt' | 'updatedAt'>): Promise<Category> => {
        return this.categoryService.createCategory(input);
      }
    },

    /**
     * 查询所有分类（包含关联数据）
     */
    getAll: {
      /**
       * 获取所有分类列表，包含每个分类下的提示词
       * @returns Promise<CategoryWithRelations[]> 分类列表（包含关联数据）
       */
      query: async (): Promise<CategoryWithRelations[]> => {
        return this.categoryService.getAllCategories();
      }
    },

    /**
     * 获取基本分类列表
     */
    getBasic: {
      /**
       * 获取基本分类列表，不包含关联数据
       * @returns Promise<Category[]> 基本分类列表
       */
      query: async (): Promise<Category[]> => {
        return this.categoryService.getBasicCategories();
      }
    },

    /**
     * 根据ID查询分类
     */
    getById: {
      /**
       * 根据ID获取分类信息
       * @param id 分类ID
       * @returns Promise<Category | null> 分类信息
       */
      query: async (id: number): Promise<Category | null> => {
        return this.categoryService.getCategoryById(id);
      }
    },

    /**
     * 根据ID查询分类（包含关联数据）
     */
    getByIdWithPrompts: {
      /**
       * 根据ID获取分类信息，包含该分类下的所有提示词
       * @param id 分类ID
       * @returns Promise<CategoryWithRelations | null> 分类信息（包含关联数据）
       */
      query: async (id: number): Promise<CategoryWithRelations | null> => {
        return this.categoryService.getCategoryWithPromptsById(id);
      }
    },

    /**
     * 根据名称查询分类
     */
    getByName: {
      /**
       * 根据名称获取分类信息
       * @param name 分类名称
       * @returns Promise<Category | null> 分类信息
       */
      query: async (name: string): Promise<Category | null> => {
        return this.categoryService.getCategoryByName(name);
      }
    },

    /**
     * 更新分类
     */
    update: {
      /**
       * 更新分类信息
       * @param input 更新数据，包含id和要更新的字段
       * @returns Promise<Category> 更新后的分类记录
       */
      mutate: async (input: { 
        id: number; 
        data: Partial<Omit<Category, 'id' | 'createdAt' | 'updatedAt'>> 
      }): Promise<Category> => {
        const { id, data } = input;
        return this.categoryService.updateCategory(id, data);
      }
    },

    /**
     * 删除分类
     */
    delete: {
      /**
       * 删除分类
       * @param id 分类ID
       * @returns Promise<{ id: number }> 删除的分类ID
       */
      mutate: async (id: number): Promise<{ id: number }> => {
        await this.categoryService.deleteCategory(id);
        return { id };
      }
    },

    /**
     * 检查分类名称是否存在
     */
    checkName: {
      /**
       * 检查分类名称是否已被使用
       * @param input 检查参数
       * @returns Promise<boolean> 是否已存在
       */
      query: async (input: { name: string; excludeId?: number }): Promise<boolean> => {
        const { name, excludeId } = input;
        return this.categoryService.isCategoryNameExists(name, excludeId);
      }
    },

    /**
     * 搜索分类
     */
    search: {
      /**
       * 根据分类名称搜索分类
       * @param query 搜索关键词
       * @returns Promise<Category[]> 匹配的分类列表
       */
      query: async (query: string): Promise<Category[]> => {
        return this.categoryService.searchCategories(query);
      }
    },

    /**
     * 批量创建分类
     */
    batchCreate: {
      /**
       * 批量创建分类
       * @param input 分类数据数组
       * @returns Promise<{ created: Category[], skipped: string[] }> 创建结果
       */
      mutate: async (input: Omit<Category, 'id' | 'createdAt' | 'updatedAt'>[]): Promise<{ 
        created: Category[], 
        skipped: string[] 
      }> => {
        return this.categoryService.batchCreateCategories(input);
      }
    },

    /**
     * 获取分类使用统计
     */
    getUsageStats: {
      /**
       * 获取每个分类下的提示词数量统计
       * @returns Promise<Array<{ categoryId: number; categoryName: string; promptCount: number }>> 使用统计
       */
      query: async (): Promise<{
        categoryId: number;
        categoryName: string;
        promptCount: number;
      }[]> => {
        return this.categoryService.getCategoryUsageStats();
      }
    },

    /**
     * 获取未分类提示词数量
     */
    getUncategorizedCount: {
      /**
       * 获取没有分类的提示词数量
       * @returns Promise<number> 未分类提示词数量
       */
      query: async (): Promise<number> => {
        return this.categoryService.getUncategorizedPromptCount();
      }
    },

    /**
     * 获取颜色统计
     */
    getColorStats: {
      /**
       * 获取分类颜色使用统计
       * @returns Promise<Record<string, number>> 颜色使用统计
       */
      query: async (): Promise<Record<string, number>> => {
        return this.categoryService.getCategoryColorStats();
      }
    }
  };
}

/**
 * 创建分类API客户端实例的工厂函数
 * @returns CategoryApiClient 分类API客户端实例
 */
export function createCategoryApiClient(): CategoryApiClient {
  return new CategoryApiClient();
}
