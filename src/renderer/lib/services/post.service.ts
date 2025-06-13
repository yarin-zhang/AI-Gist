/**
 * 文章数据服务
 * 提供文章相关的数据库操作功能
 */

import { BaseDatabaseService } from './base-database.service';
import { Post } from '../types/database';

/**
 * 文章数据服务类
 * 继承基础数据库服务，提供文章特定的数据操作方法
 */
export class PostService extends BaseDatabaseService {
  private static instance: PostService;

  /**
   * 获取文章服务单例实例
   * @returns PostService 文章服务实例
   */
  static getInstance(): PostService {
    if (!PostService.instance) {
      PostService.instance = new PostService();
    }
    return PostService.instance;
  }

  /**
   * 创建新文章
   * 向数据库中添加新的文章记录
   * @param data Omit<Post, 'id' | 'createdAt' | 'updatedAt'> 文章数据（不包含自动生成的字段）
   * @returns Promise<Post> 创建成功的文章记录（包含生成的ID和时间戳）
   */
  async createPost(data: Omit<Post, 'id' | 'createdAt' | 'updatedAt'>): Promise<Post> {
    return this.add<Post>('posts', data);
  }

  /**
   * 获取所有文章
   * 查询数据库中的所有文章记录
   * @returns Promise<Post[]> 所有文章记录的数组
   */
  async getAllPosts(): Promise<Post[]> {
    return this.getAll<Post>('posts');
  }

  /**
   * 根据ID获取文章
   * 通过文章ID查询特定文章的详细信息
   * @param id number 文章的唯一标识符
   * @returns Promise<Post | null> 文章记录，如果不存在则返回null
   */
  async getPostById(id: number): Promise<Post | null> {
    return this.getById<Post>('posts', id);
  }

  /**
   * 根据作者ID获取文章
   * 查询指定作者的所有文章
   * @param authorId number 作者的用户ID
   * @returns Promise<Post[]> 该作者的所有文章列表
   */
  async getPostsByAuthorId(authorId: number): Promise<Post[]> {
    return this.getByIndex<Post>('posts', 'authorId', authorId);
  }

  /**
   * 获取已发布的文章
   * 查询所有已发布状态的文章
   * @returns Promise<Post[]> 已发布的文章列表
   */
  async getPublishedPosts(): Promise<Post[]> {
    return this.getByIndex<Post>('posts', 'published', true);
  }

  /**
   * 获取草稿文章
   * 查询所有未发布状态的文章
   * @returns Promise<Post[]> 草稿文章列表
   */
  async getDraftPosts(): Promise<Post[]> {
    return this.getByIndex<Post>('posts', 'published', false);
  }

  /**
   * 更新文章信息
   * 更新指定文章的部分或全部信息
   * @param id number 文章ID
   * @param data Partial<Omit<Post, 'id' | 'createdAt' | 'updatedAt'>> 要更新的文章数据
   * @returns Promise<Post> 更新后的完整文章记录
   */
  async updatePost(id: number, data: Partial<Omit<Post, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Post> {
    return this.update<Post>('posts', id, data);
  }

  /**
   * 删除文章
   * 从数据库中永久删除指定文章
   * @param id number 要删除的文章ID
   * @returns Promise<void> 删除完成的Promise
   */
  async deletePost(id: number): Promise<void> {
    return this.delete('posts', id);
  }

  /**
   * 发布文章
   * 将草稿文章状态更改为已发布
   * @param id number 文章ID
   * @returns Promise<Post> 更新后的文章记录
   */
  async publishPost(id: number): Promise<Post> {
    return this.updatePost(id, { published: true });
  }

  /**
   * 取消发布文章
   * 将已发布文章状态更改为草稿
   * @param id number 文章ID
   * @returns Promise<Post> 更新后的文章记录
   */
  async unpublishPost(id: number): Promise<Post> {
    return this.updatePost(id, { published: false });
  }

  /**
   * 根据标题搜索文章
   * 通过标题关键词进行模糊匹配搜索
   * @param titleQuery string 搜索关键词
   * @returns Promise<Post[]> 匹配的文章列表
   */
  async searchPostsByTitle(titleQuery: string): Promise<Post[]> {
    const allPosts = await this.getAllPosts();
    const query = titleQuery.toLowerCase();
    
    return allPosts.filter(post => 
      post.title.toLowerCase().includes(query)
    );
  }

  /**
   * 根据内容搜索文章
   * 通过内容关键词进行模糊匹配搜索
   * @param contentQuery string 搜索关键词
   * @returns Promise<Post[]> 匹配的文章列表
   */
  async searchPostsByContent(contentQuery: string): Promise<Post[]> {
    const allPosts = await this.getAllPosts();
    const query = contentQuery.toLowerCase();
    
    return allPosts.filter(post => 
      post.content && post.content.toLowerCase().includes(query)
    );
  }

  /**
   * 综合搜索文章
   * 在标题和内容中同时搜索关键词
   * @param query string 搜索关键词
   * @returns Promise<Post[]> 匹配的文章列表
   */
  async searchPosts(query: string): Promise<Post[]> {
    const allPosts = await this.getAllPosts();
    const searchQuery = query.toLowerCase();
    
    return allPosts.filter(post => 
      post.title.toLowerCase().includes(searchQuery) ||
      (post.content && post.content.toLowerCase().includes(searchQuery))
    );
  }

  /**
   * 获取文章统计信息
   * 返回文章相关的统计数据
   * @returns Promise<{ totalPosts: number; publishedPosts: number; draftPosts: number; recentPosts: Post[] }> 文章统计信息
   */
  async getPostStats(): Promise<{
    totalPosts: number;
    publishedPosts: number;
    draftPosts: number;
    recentPosts: Post[];
  }> {
    const allPosts = await this.getAllPosts();
    const publishedPosts = allPosts.filter(post => post.published);
    const draftPosts = allPosts.filter(post => !post.published);
    
    // 按创建时间排序，获取最近的文章
    const recentPosts = allPosts
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);

    return {
      totalPosts: allPosts.length,
      publishedPosts: publishedPosts.length,
      draftPosts: draftPosts.length,
      recentPosts
    };
  }

  /**
   * 获取作者的文章统计
   * 返回指定作者的文章统计信息
   * @param authorId number 作者ID
   * @returns Promise<{ totalPosts: number; publishedPosts: number; draftPosts: number }> 作者文章统计信息
   */
  async getAuthorPostStats(authorId: number): Promise<{
    totalPosts: number;
    publishedPosts: number;
    draftPosts: number;
  }> {
    const authorPosts = await this.getPostsByAuthorId(authorId);
    const publishedPosts = authorPosts.filter(post => post.published);
    const draftPosts = authorPosts.filter(post => !post.published);

    return {
      totalPosts: authorPosts.length,
      publishedPosts: publishedPosts.length,
      draftPosts: draftPosts.length
    };
  }
}
