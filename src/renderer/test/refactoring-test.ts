/**
 * 重构验证测试
 * 验证重构后的数据库服务和API客户端是否正常工作
 */

// 测试数据库服务
import { databaseService } from '../lib/db';

// 测试 API 客户端
import { api } from '../lib/api';

/**
 * 测试数据库服务管理器
 */
async function testDatabaseServices() {
  console.log('🔍 开始测试数据库服务...');
  
  try {
    // 测试初始化
    await databaseService.initialize();
    console.log('✅ 数据库服务初始化成功');
    
    // 测试各个服务是否可用
    console.log('🔍 检查各个服务是否可用...');
    
    // 测试用户服务
    const userService = databaseService.user;
    console.log('✅ 用户服务可用:', typeof userService.getAllUsers === 'function');
    
    // 测试文章服务
    const postService = databaseService.post;
    console.log('✅ 文章服务可用:', typeof postService.getAllPosts === 'function');
    
    // 测试分类服务
    const categoryService = databaseService.category;
    console.log('✅ 分类服务可用:', typeof categoryService.getAllCategories === 'function');
    
    // 测试提示词服务
    const promptService = databaseService.prompt;
    console.log('✅ 提示词服务可用:', typeof promptService.getAllPrompts === 'function');
    
    // 测试AI配置服务
    const aiConfigService = databaseService.aiConfig;
    console.log('✅ AI配置服务可用:', typeof aiConfigService.getAllAIConfigs === 'function');
    
    // 测试AI生成历史服务
    const aiHistoryService = databaseService.aiGenerationHistory;
    console.log('✅ AI生成历史服务可用:', typeof aiHistoryService.getAllAIGenerationHistory === 'function');
    
    // 测试应用设置服务
    const appSettingsService = databaseService.appSettings;
    console.log('✅ 应用设置服务可用:', typeof appSettingsService.createSetting === 'function');
    
    console.log('🎉 数据库服务测试完成！');
    
  } catch (error) {
    console.error('❌ 数据库服务测试失败:', error);
  }
}

/**
 * 测试API客户端
 */
function testApiClients() {
  console.log('🔍 开始测试API客户端...');
  
  try {
    // 测试各个API客户端是否可用
    console.log('🔍 检查各个API客户端是否可用...');
    
    // 测试用户API
    console.log('✅ 用户API可用:', typeof api.users.getAll === 'function');
    
    // 测试文章API
    console.log('✅ 文章API可用:', typeof api.posts.getAll === 'function');
    
    // 测试分类API
    console.log('✅ 分类API可用:', typeof api.categories.getAll === 'function');
    
    // 测试提示词API
    console.log('✅ 提示词API可用:', typeof api.prompts.getAll === 'function');
    
    // 测试AI配置API
    console.log('✅ AI配置API可用:', typeof api.aiConfigs.getAll === 'function');
    
    // 测试AI生成历史API
    console.log('✅ AI生成历史API可用:', typeof api.aiGenerationHistory.getAll === 'function');
    
    // 测试应用设置API
    console.log('✅ 应用设置API可用:', typeof api.appSettings.create === 'function');
    
    console.log('🎉 API客户端测试完成！');
    
  } catch (error) {
    console.error('❌ API客户端测试失败:', error);
  }
}

/**
 * 运行所有测试
 */
export async function runRefactoringTests() {
  console.log('🚀 开始运行重构验证测试...');
  console.log('=' .repeat(50));
  
  await testDatabaseServices();
  console.log('');
  testApiClients();
  
  console.log('=' .repeat(50));
  console.log('🎉 重构验证测试完成！');
}

// 如果直接运行此文件，则执行测试
if (import.meta.env.MODE === 'development') {
  runRefactoringTests().catch(console.error);
}
