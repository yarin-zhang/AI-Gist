/**
 * UUID 功能测试
 * 验证UUID生成和数据库操作是否正常
 */

import { test, expect, describe, beforeAll, afterAll } from 'vitest';
import { DatabaseServiceManager } from '../src/renderer/lib/services/database-manager.service';
import { generateUUID, isValidUUID } from '../src/renderer/lib/utils/uuid';

describe('UUID 功能测试', () => {
  let databaseManager: DatabaseServiceManager;

  beforeAll(async () => {
    databaseManager = DatabaseServiceManager.getInstance();
    await databaseManager.initialize();
  });

  afterAll(() => {
    databaseManager.close();
  });

  describe('UUID 工具函数', () => {
    test('应该生成有效的UUID', () => {
      const uuid = generateUUID();
      expect(typeof uuid).toBe('string');
      expect(uuid.length).toBe(36);
      expect(isValidUUID(uuid)).toBe(true);
    });

    test('应该验证UUID格式', () => {
      expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
      expect(isValidUUID('invalid-uuid')).toBe(false);
      expect(isValidUUID('123')).toBe(false);
      expect(isValidUUID('')).toBe(false);
    });

    test('连续生成的UUID应该不同', () => {
      const uuid1 = generateUUID();
      const uuid2 = generateUUID();
      expect(uuid1).not.toBe(uuid2);
    });
  });

  describe('分类UUID功能', () => {
    test('创建分类时应该自动生成UUID', async () => {
      const category = await databaseManager.category.createCategory({
        name: 'UUID测试分类',
        description: '用于测试UUID功能的分类',
        isActive: true
      });

      expect(category.uuid).toBeDefined();
      expect(isValidUUID(category.uuid)).toBe(true);
    });

    test('应该能根据UUID查找分类', async () => {
      // 创建分类
      const createdCategory = await databaseManager.category.createCategory({
        name: 'UUID查找测试',
        description: '测试根据UUID查找',
        isActive: true
      });

      // 根据UUID查找
      const foundCategory = await databaseManager.category.getCategoryByUUID(createdCategory.uuid);
      expect(foundCategory).not.toBeNull();
      expect(foundCategory!.id).toBe(createdCategory.id);
      expect(foundCategory!.name).toBe(createdCategory.name);
    });

    test('应该能根据UUID更新分类', async () => {
      // 创建分类
      const category = await databaseManager.category.createCategory({
        name: 'UUID更新测试',
        description: '原始描述',
        isActive: true
      });

      // 根据UUID更新
      const updatedCategory = await databaseManager.category.updateCategoryByUUID(category.uuid, {
        description: '更新后的描述'
      });

      expect(updatedCategory).not.toBeNull();
      expect(updatedCategory!.description).toBe('更新后的描述');
    });

    test('应该能根据UUID删除分类', async () => {
      // 创建分类
      const category = await databaseManager.category.createCategory({
        name: 'UUID删除测试',
        description: '待删除的分类',
        isActive: true
      });

      // 根据UUID删除
      const deleteResult = await databaseManager.category.deleteCategoryByUUID(category.uuid);
      expect(deleteResult).toBe(true);

      // 验证已删除
      const foundCategory = await databaseManager.category.getCategoryByUUID(category.uuid);
      expect(foundCategory).toBeNull();
    });
  });

  describe('提示词UUID功能', () => {
    test('创建提示词时应该自动生成UUID', async () => {
      const prompt = await databaseManager.prompt.createPrompt({
        title: 'UUID测试提示词',
        content: '这是一个测试提示词的内容',
        tags: ['测试'],
        isFavorite: false,
        useCount: 0,
        isActive: true
      });

      expect(prompt.uuid).toBeDefined();
      expect(isValidUUID(prompt.uuid)).toBe(true);
    });

    test('创建提示词变量时应该自动生成UUID', async () => {
      const prompt = await databaseManager.prompt.createPrompt({
        title: '带变量的提示词',
        content: '您好，{{name}}！',
        tags: ['测试'],
        isFavorite: false,
        useCount: 0,
        isActive: true,
        variables: [{
          name: 'name',
          label: '姓名',
          type: 'text',
          required: true
        }]
      });

      expect(prompt.variables).toBeDefined();
      expect(prompt.variables!.length).toBe(1);
      expect(prompt.variables![0].uuid).toBeDefined();
      expect(isValidUUID(prompt.variables![0].uuid)).toBe(true);
    });

    test('应该能根据UUID查找提示词', async () => {
      const createdPrompt = await databaseManager.prompt.createPrompt({
        title: 'UUID查找测试提示词',
        content: '测试内容',
        tags: ['测试'],
        isFavorite: false,
        useCount: 0,
        isActive: true
      });

      const foundPrompt = await databaseManager.prompt.getPromptByUUID(createdPrompt.uuid);
      expect(foundPrompt).not.toBeNull();
      expect(foundPrompt!.id).toBe(createdPrompt.id);
      expect(foundPrompt!.title).toBe(createdPrompt.title);
    });
  });

  describe('AI配置UUID功能', () => {
    test('创建AI配置时应该自动生成UUID', async () => {
      const config = await databaseManager.aiConfig.createAIConfig({
        configId: 'test-config-uuid',
        name: 'UUID测试配置',
        type: 'openai',
        baseURL: 'https://api.openai.com/v1',
        apiKey: 'test-key',
        models: ['gpt-3.5-turbo'],
        enabled: true
      });

      expect(config.uuid).toBeDefined();
      expect(isValidUUID(config.uuid)).toBe(true);
    });

    test('应该能根据UUID查找AI配置', async () => {
      const createdConfig = await databaseManager.aiConfig.createAIConfig({
        configId: 'test-config-uuid-find',
        name: 'UUID查找测试配置',
        type: 'openai',
        baseURL: 'https://api.openai.com/v1',
        models: ['gpt-3.5-turbo'],
        enabled: true
      });

      const foundConfig = await databaseManager.aiConfig.getAIConfigByUUID(createdConfig.uuid);
      expect(foundConfig).not.toBeNull();
      expect(foundConfig!.id).toBe(createdConfig.id);
      expect(foundConfig!.name).toBe(createdConfig.name);
    });
  });

  describe('AI生成历史UUID功能', () => {
    test('创建AI生成历史时应该自动生成UUID', async () => {
      const history = await databaseManager.aiGenerationHistory.createAIGenerationHistory({
        historyId: 'test-history-uuid',
        configId: 'test-config',
        topic: 'UUID测试主题',
        generatedPrompt: '生成的提示词内容',
        model: 'gpt-3.5-turbo',
        status: 'success'
      });

      expect(history.uuid).toBeDefined();
      expect(isValidUUID(history.uuid)).toBe(true);
    });

    test('应该能根据UUID查找生成历史', async () => {
      const createdHistory = await databaseManager.aiGenerationHistory.createAIGenerationHistory({
        historyId: 'test-history-uuid-find',
        configId: 'test-config',
        topic: 'UUID查找测试',
        generatedPrompt: '测试内容',
        model: 'gpt-3.5-turbo',
        status: 'success'
      });

      const foundHistory = await databaseManager.aiGenerationHistory.getAIGenerationHistoryByUUID(createdHistory.uuid);
      expect(foundHistory).not.toBeNull();
      expect(foundHistory!.id).toBe(createdHistory.id);
      expect(foundHistory!.topic).toBe(createdHistory.topic);
    });
  });

  describe('UUID迁移功能', () => {
    test('应该能检查UUID迁移需求', async () => {
      const migrationCheck = await databaseManager.checkUUIDMigrationNeeded();
      expect(migrationCheck).toBeDefined();
      expect(typeof migrationCheck.needsMigration).toBe('boolean');
      expect(migrationCheck.details).toBeDefined();
    });

    test('应该能执行UUID迁移', async () => {
      const migrationResult = await databaseManager.executeUUIDMigration();
      expect(migrationResult).toBeDefined();
      expect(typeof migrationResult.success).toBe('boolean');
      expect(migrationResult.message).toBeDefined();
    });
  });
});
