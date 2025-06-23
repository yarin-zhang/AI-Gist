/**
 * UUID 生成工具
 * 提供用于数据同步的唯一标识符生成功能
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * 生成UUID
 * 为数据记录生成全局唯一标识符，用于WebDAV同步
 * @returns string UUID字符串
 */
export function generateUUID(): string {
  return uuidv4();
}

/**
 * 验证UUID格式
 * 检查给定字符串是否为有效的UUID格式
 * @param uuid 要验证的UUID字符串
 * @returns boolean 是否为有效UUID
 */
export function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * 生成用于测试的固定UUID
 * 仅用于测试环境，确保测试结果的一致性
 * @param seed 种子字符串，相同的种子生成相同的UUID
 * @returns string 基于种子生成的UUID
 */
export function generateTestUUID(seed: string): string {
  // 简单的伪随机UUID生成器，仅用于测试
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  return `${hex.slice(0, 8)}-${hex.slice(0, 4)}-4${hex.slice(1, 4)}-8${hex.slice(2, 5)}-${hex.slice(0, 12)}`;
}

/**
 * 确保字符串是有效的UUID，如果不是则生成新的UUID
 * @param value 可能的UUID字符串
 * @returns string 有效的UUID字符串
 */
export function ensureUUID(value?: string): string {
  if (value && isValidUUID(value)) {
    return value;
  }
  return generateUUID();
}
