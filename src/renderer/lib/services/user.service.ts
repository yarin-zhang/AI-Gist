/**
 * 用户数据服务
 * 提供用户相关的数据库操作功能
 */

import { BaseDatabaseService } from './base-database.service';
import { User } from '../types/database';

/**
 * 用户数据服务类
 * 继承基础数据库服务，提供用户特定的数据操作方法
 */
export class UserService extends BaseDatabaseService {
  private static instance: UserService;

  /**
   * 获取用户服务单例实例
   * @returns UserService 用户服务实例
   */
  static getInstance(): UserService {
    if (!UserService.instance) {
      UserService.instance = new UserService();
    }
    return UserService.instance;
  }

  /**
   * 创建新用户
   * 向数据库中添加新的用户记录
   * @param data Omit<User, 'id' | 'createdAt' | 'updatedAt'> 用户数据（不包含自动生成的字段）
   * @returns Promise<User> 创建成功的用户记录（包含生成的ID和时间戳）
   */
  async createUser(data: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): Promise<User> {
    return this.add<User>('users', data);
  }

  /**
   * 获取所有用户
   * 查询数据库中的所有用户记录
   * @returns Promise<User[]> 所有用户记录的数组
   */
  async getAllUsers(): Promise<User[]> {
    return this.getAll<User>('users');
  }

  /**
   * 根据ID获取用户
   * 通过用户ID查询特定用户的详细信息
   * @param id number 用户的唯一标识符
   * @returns Promise<User | null> 用户记录，如果不存在则返回null
   */
  async getUserById(id: number): Promise<User | null> {
    return this.getById<User>('users', id);
  }

  /**
   * 根据邮箱获取用户
   * 通过邮箱地址查询用户信息（邮箱是唯一索引）
   * @param email string 用户邮箱地址
   * @returns Promise<User | null> 用户记录，如果不存在则返回null
   */
  async getUserByEmail(email: string): Promise<User | null> {
    const users = await this.getByIndex<User>('users', 'email', email);
    return users.length > 0 ? users[0] : null;
  }

  /**
   * 更新用户信息
   * 更新指定用户的部分或全部信息
   * @param id number 用户ID
   * @param data Partial<Omit<User, 'id' | 'createdAt' | 'updatedAt'>> 要更新的用户数据
   * @returns Promise<User> 更新后的完整用户记录
   */
  async updateUser(id: number, data: Partial<Omit<User, 'id' | 'createdAt' | 'updatedAt'>>): Promise<User> {
    return this.update<User>('users', id, data);
  }

  /**
   * 删除用户
   * 从数据库中永久删除指定用户
   * @param id number 要删除的用户ID
   * @returns Promise<void> 删除完成的Promise
   */
  async deleteUser(id: number): Promise<void> {
    return this.delete('users', id);
  }

  /**
   * 检查邮箱是否已存在
   * 验证邮箱地址的唯一性，用于注册前的重复检查
   * @param email string 要检查的邮箱地址
   * @returns Promise<boolean> 如果邮箱已存在返回true，否则返回false
   */
  async isEmailExists(email: string): Promise<boolean> {
    const user = await this.getUserByEmail(email);
    return user !== null;
  }

  /**
   * 根据名称模糊搜索用户
   * 通过用户名称进行模糊匹配搜索
   * @param nameQuery string 搜索关键词
   * @returns Promise<User[]> 匹配的用户列表
   */
  async searchUsersByName(nameQuery: string): Promise<User[]> {
    const allUsers = await this.getAllUsers();
    const query = nameQuery.toLowerCase();
    
    return allUsers.filter(user => 
      user.name && user.name.toLowerCase().includes(query)
    );
  }

  /**
   * 获取用户统计信息
   * 返回用户相关的统计数据
   * @returns Promise<{ totalUsers: number; recentUsers: User[] }> 用户统计信息
   */
  async getUserStats(): Promise<{ totalUsers: number; recentUsers: User[] }> {
    const allUsers = await this.getAllUsers();
    
    // 按创建时间排序，获取最近的用户
    const recentUsers = allUsers
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);

    return {
      totalUsers: allUsers.length,
      recentUsers
    };
  }
}
