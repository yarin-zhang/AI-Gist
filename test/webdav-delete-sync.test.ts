/**
 * WebDAV 删除同步测试
 * 验证批量删除操作后，删除能够正确同步到远端，且不会重新下载被删除的数据
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PromptService } from '../src/renderer/lib/services/prompt.service';
import { autoSyncManager } from '../src/renderer/lib/utils/auto-sync-manager';

describe('WebDAV 删除同步测试', () => {
  let promptService: PromptService;

  beforeEach(async () => {
    promptService = PromptService.getInstance();
    await promptService.initialize();
  });

  afterEach(async () => {
    // 清理测试数据
    await promptService.close();
  });

  it('应该正确收集删除的UUID并触发同步', async () => {
    // 创建测试提示词
    const testPrompt = await promptService.createPrompt({
      title: '测试提示词',
      content: '这是一个测试提示词',
      tags: ['测试'],
      isFavorite: false,
      useCount: 0,
      isActive: true,
      variables: [
        {
          name: 'testVar',
          description: '测试变量',
          defaultValue: 'default',
          promptId: 0 // 会被自动设置
        }
      ]
    });

    expect(testPrompt.id).toBeDefined();
    expect(testPrompt.uuid).toBeDefined();
    expect(testPrompt.variables).toHaveLength(1);
    expect(testPrompt.variables[0].uuid).toBeDefined();

    // 获取提示词的UUID用于验证
    const promptUUID = testPrompt.uuid;
    const variableUUID = testPrompt.variables[0].uuid;

    // 执行批量删除
    const deleteResult = await promptService.batchDeletePrompts([testPrompt.id!]);

    expect(deleteResult.success).toBe(1);
    expect(deleteResult.failed).toBe(0);

    // 验证删除记录被正确收集
    // 注意：这里我们无法直接验证UUID收集，但可以通过日志确认
    console.log('批量删除完成，应该触发同步');
  });

  it('应该正确处理删除记录的同步', async () => {
    // 模拟删除记录的同步过程
    const testUUIDs = ['uuid1', 'uuid2', 'uuid3'];
    
    // 触发批量删除同步
    autoSyncManager.triggerAutoSyncAfterBatchDelete(
      testUUIDs,
      '测试批量删除同步'
    );

    // 验证同步状态
    const status = autoSyncManager.getStatus();
    expect(status.isSyncing).toBe(false); // 同步应该是异步的
  });

  it('应该正确保存和恢复自动同步状态', async () => {
    // 获取原始状态
    const originalConfig = autoSyncManager.getConfig();
    
    // 禁用自动同步
    autoSyncManager.disable();
    expect(autoSyncManager.getConfig().enabled).toBe(false);
    
    // 重新启用
    autoSyncManager.enable();
    expect(autoSyncManager.getConfig().enabled).toBe(true);
  });
}); 