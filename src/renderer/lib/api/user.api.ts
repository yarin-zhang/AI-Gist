/**
 * 用户API客户端
 * 提供用户相关的API调用接口
 */

import { UserService } from '../services/user.service';
import { User } from '../types/database';

/**
 * 用户API客户端类
 * 封装用户服务，提供统一的API调用接口
 */
export class UserApiClient {
  private userService: UserService;

  constructor() {
    this.userService = UserService.getInstance();
  }

  /**
   * 用户相关的API接口
   */
  users = {
    /**
     * 创建用户
     */
    create: {
      /**
       * 创建新用户
       * @param input 用户创建数据
       * @returns Promise<User> 创建的用户记录
       */
      mutate: async (input: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): Promise<User> => {
        return this.userService.createUser(input);
      }
    },

    /**
     * 查询所有用户
     */
    getAll: {
      /**
       * 获取所有用户列表
       * @returns Promise<User[]> 用户列表
       */
      query: async (): Promise<User[]> => {
        return this.userService.getAllUsers();
      }
    },

    /**
     * 根据ID查询用户
     */
    getById: {
      /**
       * 根据ID获取用户信息
       * @param id 用户ID
       * @returns Promise<User | null> 用户信息
       */
      query: async (id: number): Promise<User | null> => {
        return this.userService.getUserById(id);
      }
    },

    /**
     * 根据邮箱查询用户
     */
    getByEmail: {
      /**
       * 根据邮箱获取用户信息
       * @param email 用户邮箱
       * @returns Promise<User | null> 用户信息
       */
      query: async (email: string): Promise<User | null> => {
        return this.userService.getUserByEmail(email);
      }
    },

    /**
     * 更新用户
     */
    update: {
      /**
       * 更新用户信息
       * @param input 更新数据，包含id和要更新的字段
       * @returns Promise<User> 更新后的用户记录
       */
      mutate: async (input: { 
        id: number; 
        data: Partial<Omit<User, 'id' | 'createdAt' | 'updatedAt'>> 
      }): Promise<User> => {
        const { id, data } = input;
        return this.userService.updateUser(id, data);
      }
    },

    /**
     * 删除用户
     */
    delete: {
      /**
       * 删除用户
       * @param id 用户ID
       * @returns Promise<{ id: number }> 删除的用户ID
       */
      mutate: async (id: number): Promise<{ id: number }> => {
        await this.userService.deleteUser(id);
        return { id };
      }
    },

    /**
     * 检查邮箱是否存在
     */
    checkEmail: {
      /**
       * 检查邮箱是否已被使用
       * @param email 邮箱地址
       * @returns Promise<boolean> 是否已存在
       */
      query: async (email: string): Promise<boolean> => {
        return this.userService.isEmailExists(email);
      }
    },

    /**
     * 搜索用户
     */
    search: {
      /**
       * 根据用户名搜索用户
       * @param query 搜索关键词
       * @returns Promise<User[]> 匹配的用户列表
       */
      query: async (query: string): Promise<User[]> => {
        return this.userService.searchUsersByName(query);
      }
    },

    /**
     * 获取用户统计信息
     */
    getStats: {
      /**
       * 获取用户统计数据
       * @returns Promise<{ totalUsers: number; recentUsers: User[] }> 统计信息
       */
      query: async (): Promise<{ totalUsers: number; recentUsers: User[] }> => {
        return this.userService.getUserStats();
      }
    }
  };
}

/**
 * 创建用户API客户端实例的工厂函数
 * @returns UserApiClient 用户API客户端实例
 */
export function createUserApiClient(): UserApiClient {
  return new UserApiClient();
}
