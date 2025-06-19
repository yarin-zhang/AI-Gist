/**
 * 分类数据服务
 * 提供分类相关的数据库操作功能
 */

import { BaseDatabaseService } from './base-database.service';
import { Category, CategoryWithRelations, Prompt } from '../types/database';
import { generateUUID } from '../utils/uuid';

/**
 * 分类数据服务类
 * 继承基础数据库服务，提供分类特定的数据操作方法
 */
export class CategoryService extends BaseDatabaseService {
  private static instance: CategoryService;

  /**
   * 获取分类服务单例实例
   * @returns CategoryService 分类服务实例
   */
  static getInstance(): CategoryService {
    if (!CategoryService.instance) {
      CategoryService.instance = new CategoryService();
    }
    return CategoryService.instance;
  }

  /**
   * 创建新分类
   * 向数据库中添加新的分类记录
   * @param data Omit<Category, 'id' | 'uuid' | 'createdAt' | 'updatedAt'> 分类数据（不包含自动生成的字段）
   * @returns Promise<Category> 创建成功的分类记录（包含生成的ID、UUID和时间戳）
   */
  async createCategory(data: Omit<Category, 'id' | 'uuid' | 'createdAt' | 'updatedAt'>): Promise<Category> {
    const categoryWithUUID = {
      ...data,
      uuid: generateUUID()
    };
    return this.add<Category>('categories', categoryWithUUID);
  }

  /**
   * 获取所有分类（包含关联的提示词）
   * 查询所有分类及其包含的提示词数量和列表
   * @returns Promise<CategoryWithRelations[]> 包含关联数据的分类列表
   */
  async getAllCategories(): Promise<CategoryWithRelations[]> {
    const categories = await this.getAll<Category>('categories');
    const prompts = await this.getAll<Prompt>('prompts');
    
    return categories.map(category => ({
      ...category,
      prompts: prompts.filter(prompt => prompt.categoryId === category.id)
    }));
  }

  /**
   * 获取基本分类列表（不包含关联数据）
   * 查询所有分类的基本信息，不加载关联的提示词数据
   * @returns Promise<Category[]> 分类基本信息列表
   */
  async getBasicCategories(): Promise<Category[]> {
    return this.getAll<Category>('categories');
  }

  /**
   * 根据ID获取分类
   * 通过分类ID查询特定分类的详细信息
   * @param id number 分类的唯一标识符
   * @returns Promise<Category | null> 分类记录，如果不存在则返回null
   */
  async getCategoryById(id: number): Promise<Category | null> {
    return this.getById<Category>('categories', id);
  }

  /**
   * 根据ID获取分类（包含关联的提示词）
   * 通过分类ID查询分类及其包含的所有提示词
   * @param id number 分类的唯一标识符
   * @returns Promise<CategoryWithRelations | null> 包含关联数据的分类记录
   */
  async getCategoryWithPromptsById(id: number): Promise<CategoryWithRelations | null> {
    const category = await this.getCategoryById(id);
    if (!category) return null;

    const prompts = await this.getByIndex<Prompt>('prompts', 'categoryId', id);
    
    return {
      ...category,
      prompts
    };
  }

  /**
   * 根据名称获取分类
   * 通过分类名称查询分类信息（名称是唯一索引）
   * @param name string 分类名称
   * @returns Promise<Category | null> 分类记录，如果不存在则返回null
   */
  async getCategoryByName(name: string): Promise<Category | null> {
    const categories = await this.getByIndex<Category>('categories', 'name', name);
    return categories.length > 0 ? categories[0] : null;
  }

  /**
   * 更新分类信息
   * 更新指定分类的部分或全部信息
   * @param id number 分类ID
   * @param data Partial<Omit<Category, 'id' | 'createdAt' | 'updatedAt'>> 要更新的分类数据
   * @returns Promise<Category> 更新后的完整分类记录
   */
  async updateCategory(id: number, data: Partial<Omit<Category, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Category> {
    return this.update<Category>('categories', id, data);
  }

  /**
   * 删除分类
   * 从数据库中永久删除指定分类
   * 注意：删除分类前应确保没有提示词关联到此分类
   * @param id number 要删除的分类ID
   * @returns Promise<void> 删除完成的Promise
   */
  async deleteCategory(id: number): Promise<void> {
    return this.delete('categories', id);
  }

  /**
   * 检查分类名称是否已存在
   * 验证分类名称的唯一性，用于创建前的重复检查
   * @param name string 要检查的分类名称
   * @param excludeId number 排除的分类ID（用于更新时的检查）
   * @returns Promise<boolean> 如果名称已存在返回true，否则返回false
   */
  async isCategoryNameExists(name: string, excludeId?: number): Promise<boolean> {
    const category = await this.getCategoryByName(name);
    if (!category) return false;
    
    // 如果提供了excludeId，且找到的分类ID与excludeId相同，则不算重复
    if (excludeId && category.id === excludeId) {
      return false;
    }
    
    return true;
  }

  /**
   * 获取分类使用统计
   * 返回每个分类下的提示词数量统计
   * @returns Promise<{ categoryId: number; categoryName: string; promptCount: number }[]> 分类使用统计列表
   */
  async getCategoryUsageStats(): Promise<Array<{
    categoryId: number;
    categoryName: string;
    promptCount: number;
  }>> {
    const categoriesWithPrompts = await this.getAllCategories();
    
    return categoriesWithPrompts.map(category => ({
      categoryId: category.id!,
      categoryName: category.name,
      promptCount: category.prompts?.length || 0
    }));
  }

  /**
   * 获取未分类的提示词数量
   * 统计没有指定分类的提示词数量
   * @returns Promise<number> 未分类提示词数量
   */
  async getUncategorizedPromptCount(): Promise<number> {
    const allPrompts = await this.getAll<Prompt>('prompts');
    return allPrompts.filter(prompt => !prompt.categoryId).length;
  }

  /**
   * 搜索分类
   * 通过分类名称进行模糊匹配搜索
   * @param query string 搜索关键词
   * @returns Promise<Category[]> 匹配的分类列表
   */
  async searchCategories(query: string): Promise<Category[]> {
    const allCategories = await this.getBasicCategories();
    const searchQuery = query.toLowerCase();
    
    return allCategories.filter(category => 
      category.name.toLowerCase().includes(searchQuery)
    );
  }

  /**
   * 批量创建分类
   * 一次性创建多个分类，跳过已存在的分类名称
   * @param categories Array<Omit<Category, 'id' | 'createdAt' | 'updatedAt'>> 要创建的分类数据数组
   * @returns Promise<{ created: Category[], skipped: string[] }> 创建结果，包含成功创建的分类和跳过的分类名称
   */
  async batchCreateCategories(
    categories: Array<Omit<Category, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<{ created: Category[], skipped: string[] }> {
    const created: Category[] = [];
    const skipped: string[] = [];

    for (const categoryData of categories) {
      const exists = await this.isCategoryNameExists(categoryData.name);
      if (exists) {
        skipped.push(categoryData.name);
      } else {
        const newCategory = await this.createCategory(categoryData);
        created.push(newCategory);
      }
    }

    return { created, skipped };
  }

  /**
   * 获取分类的颜色统计
   * 统计各种颜色的使用频率
   * @returns Promise<Record<string, number>> 颜色使用统计，键为颜色值，值为使用次数
   */
  async getCategoryColorStats(): Promise<Record<string, number>> {
    const categories = await this.getBasicCategories();
    const colorStats: Record<string, number> = {};

    categories.forEach(category => {
      if (category.color) {
        colorStats[category.color] = (colorStats[category.color] || 0) + 1;
      }
    });

    return colorStats;
  }

  /**
   * 根据UUID获取分类
   * 通过分类UUID查询特定分类的详细信息，包含关联数据
   * @param uuid string 分类的UUID
   * @returns Promise<CategoryWithRelations | null> 分类记录，如果不存在则返回null
   */
  async getCategoryByUUID(uuid: string): Promise<CategoryWithRelations | null> {
    const category = await this.getByUUID<Category>('categories', uuid);
    if (!category) return null;

    const prompts = await this.getAll<Prompt>('prompts');
    
    return {
      ...category,
      prompts: prompts.filter(prompt => prompt.categoryId === category.id)
    };
  }

  /**
   * 根据UUID更新分类
   * 通过UUID更新指定分类的信息
   * @param uuid string 分类UUID
   * @param data 更新数据
   * @returns Promise<Category | null> 更新后的分类记录
   */
  async updateCategoryByUUID(uuid: string, data: Partial<Omit<Category, 'id' | 'uuid' | 'createdAt' | 'updatedAt'>>): Promise<Category | null> {
    return this.updateByUUID<Category>('categories', uuid, data);
  }

  /**
   * 根据UUID删除分类
   * 通过UUID删除指定分类
   * @param uuid string 要删除的分类UUID
   * @returns Promise<boolean> 删除是否成功
   */
  async deleteCategoryByUUID(uuid: string): Promise<boolean> {
    return this.deleteByUUID('categories', uuid);
  }

  /**
   * 检查分类UUID是否已存在
   * 验证UUID的唯一性
   * @param uuid string 要检查的UUID
   * @returns Promise<boolean> 如果UUID已存在返回true，否则返回false
   */
  async isCategoryUUIDExists(uuid: string): Promise<boolean> {
    const category = await this.getByUUID<Category>('categories', uuid);
    return category !== null;
  }
}
