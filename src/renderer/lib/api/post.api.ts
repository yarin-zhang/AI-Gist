/**
 * 文章API客户端
 * 提供文章相关的API调用接口
 */

import { PostService } from '../services/post.service';
import { Post } from '../types/database';

/**
 * 文章API客户端类
 * 封装文章服务，提供统一的API调用接口
 */
export class PostApiClient {
  private postService: PostService;

  constructor() {
    this.postService = PostService.getInstance();
  }

  /**
   * 文章相关的API接口
   */
  posts = {
    /**
     * 创建文章
     */
    create: {
      /**
       * 创建新文章
       * @param input 文章创建数据
       * @returns Promise<Post> 创建的文章记录
       */
      mutate: async (input: Omit<Post, 'id' | 'createdAt' | 'updatedAt'>): Promise<Post> => {
        return this.postService.createPost(input);
      }
    },

    /**
     * 查询所有文章
     */
    getAll: {
      /**
       * 获取所有文章列表
       * @returns Promise<Post[]> 文章列表
       */
      query: async (): Promise<Post[]> => {
        return this.postService.getAllPosts();
      }
    },

    /**
     * 根据ID查询文章
     */
    getById: {
      /**
       * 根据ID获取文章信息
       * @param id 文章ID
       * @returns Promise<Post | null> 文章信息
       */
      query: async (id: number): Promise<Post | null> => {
        return this.postService.getPostById(id);
      }
    },

    /**
     * 根据作者ID查询文章
     */
    getByAuthorId: {
      /**
       * 根据作者ID获取文章列表
       * @param authorId 作者ID
       * @returns Promise<Post[]> 文章列表
       */
      query: async (authorId: number): Promise<Post[]> => {
        return this.postService.getPostsByAuthorId(authorId);
      }
    },

    /**
     * 获取已发布文章
     */
    getPublished: {
      /**
       * 获取所有已发布的文章
       * @returns Promise<Post[]> 已发布文章列表
       */
      query: async (): Promise<Post[]> => {
        return this.postService.getPublishedPosts();
      }
    },

    /**
     * 获取草稿文章
     */
    getDrafts: {
      /**
       * 获取所有草稿文章
       * @returns Promise<Post[]> 草稿文章列表
       */
      query: async (): Promise<Post[]> => {
        return this.postService.getDraftPosts();
      }
    },

    /**
     * 更新文章
     */
    update: {
      /**
       * 更新文章信息
       * @param input 更新数据，包含id和要更新的字段
       * @returns Promise<Post> 更新后的文章记录
       */
      mutate: async (input: { 
        id: number; 
        data: Partial<Omit<Post, 'id' | 'createdAt' | 'updatedAt'>> 
      }): Promise<Post> => {
        const { id, data } = input;
        return this.postService.updatePost(id, data);
      }
    },

    /**
     * 删除文章
     */
    delete: {
      /**
       * 删除文章
       * @param id 文章ID
       * @returns Promise<{ id: number }> 删除的文章ID
       */
      mutate: async (id: number): Promise<{ id: number }> => {
        await this.postService.deletePost(id);
        return { id };
      }
    },

    /**
     * 发布文章
     */
    publish: {
      /**
       * 发布文章
       * @param id 文章ID
       * @returns Promise<Post> 发布后的文章记录
       */
      mutate: async (id: number): Promise<Post> => {
        return this.postService.publishPost(id);
      }
    },

    /**
     * 取消发布文章
     */
    unpublish: {
      /**
       * 取消发布文章
       * @param id 文章ID
       * @returns Promise<Post> 更新后的文章记录
       */
      mutate: async (id: number): Promise<Post> => {
        return this.postService.unpublishPost(id);
      }
    },

    /**
     * 搜索文章
     */
    search: {
      /**
       * 搜索文章（标题和内容）
       * @param query 搜索关键词
       * @returns Promise<Post[]> 匹配的文章列表
       */
      query: async (query: string): Promise<Post[]> => {
        return this.postService.searchPosts(query);
      }
    },

    /**
     * 根据标题搜索文章
     */
    searchByTitle: {
      /**
       * 根据标题搜索文章
       * @param query 搜索关键词
       * @returns Promise<Post[]> 匹配的文章列表
       */
      query: async (query: string): Promise<Post[]> => {
        return this.postService.searchPostsByTitle(query);
      }
    },

    /**
     * 根据内容搜索文章
     */
    searchByContent: {
      /**
       * 根据内容搜索文章
       * @param query 搜索关键词
       * @returns Promise<Post[]> 匹配的文章列表
       */
      query: async (query: string): Promise<Post[]> => {
        return this.postService.searchPostsByContent(query);
      }
    },

    /**
     * 获取文章统计信息
     */
    getStats: {
      /**
       * 获取文章统计数据
       * @returns Promise<文章统计信息> 统计信息
       */
      query: async (): Promise<{
        totalPosts: number;
        publishedPosts: number;
        draftPosts: number;
        recentPosts: Post[];
      }> => {
        return this.postService.getPostStats();
      }
    },

    /**
     * 获取作者文章统计
     */
    getAuthorStats: {
      /**
       * 获取指定作者的文章统计
       * @param authorId 作者ID
       * @returns Promise<作者文章统计信息> 统计信息
       */
      query: async (authorId: number): Promise<{
        totalPosts: number;
        publishedPosts: number;
        draftPosts: number;
      }> => {
        return this.postService.getAuthorPostStats(authorId);
      }
    }
  };
}

/**
 * 创建文章API客户端实例的工厂函数
 * @returns PostApiClient 文章API客户端实例
 */
export function createPostApiClient(): PostApiClient {
  return new PostApiClient();
}
