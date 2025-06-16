/**
 * 渲染进程数据库操作接口
 * 通过 window 对象暴露方法供主进程调用
 */

import { databaseServiceManager } from './db';

/**
 * 数据库操作接口类
 */
export class DatabaseIpcHandlers {
  private static instance: DatabaseIpcHandlers;
  private isInitialized = false;

  private constructor() {}

  static getInstance(): DatabaseIpcHandlers {
    if (!DatabaseIpcHandlers.instance) {
      DatabaseIpcHandlers.instance = new DatabaseIpcHandlers();
    }
    return DatabaseIpcHandlers.instance;
  }

  /**
   * 初始化数据库操作接口
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // 确保数据库服务已初始化
      await databaseServiceManager.waitForInitialization();
      
      // 将数据库操作方法暴露到 window 对象
      this.exposeToWindow();
      this.isInitialized = true;
      
      console.log('数据库操作接口已初始化');
    } catch (error) {
      console.error('初始化数据库操作接口失败:', error);
      throw error;
    }
  }

  /**
   * 将数据库操作方法暴露到 window 对象
   */
  private exposeToWindow(): void {
    // 扩展现有的 databaseAPI
    (window as any).databaseAPI = {
      ...((window as any).databaseAPI || {}),
      databaseServiceManager,
      
      // 数据导出方法
      exportAllData: async () => {
        try {
          console.log('渲染进程: 开始导出数据库数据...');
          
          // 首先检查数据库健康状态
          console.log('正在检查数据库健康状态...');
          const healthStatus = await databaseServiceManager.getHealthStatus();
          
          if (!healthStatus.healthy) {
            console.warn('检测到数据库异常，缺失的对象存储:', healthStatus.missingStores);
            
            // 尝试修复数据库
            console.log('正在尝试修复数据库...');
            const repairResult = await databaseServiceManager.user.repairDatabase();
            
            if (!repairResult.success) {
              throw new Error(`数据库修复失败: ${repairResult.message}`);
            }
            
            console.log('数据库修复成功，继续导出数据...');
          }
          
          // 安全地获取所有数据
          const results = await Promise.allSettled([
            databaseServiceManager.user.getAllUsers(),
            databaseServiceManager.post.getAllPosts(),
            databaseServiceManager.category.getBasicCategories(),
            databaseServiceManager.prompt.getAllPromptsForTags(),
            databaseServiceManager.aiConfig.getAllAIConfigs(),
            databaseServiceManager.aiGenerationHistory.getAllAIGenerationHistory(),
            databaseServiceManager.appSettings.getAllSettings()
          ]);
          
          // 处理结果，对失败的操作返回空数组
          const [
            users,
            posts,
            categories,
            prompts,
            aiConfigs,
            aiHistory,
            settings
          ] = results.map((result, index) => {
            if (result.status === 'fulfilled') {
              return result.value || [];
            } else {
              const tableNames = ['users', 'posts', 'categories', 'prompts', 'aiConfigs', 'aiHistory', 'settings'];
              console.warn(`获取 ${tableNames[index]} 数据失败:`, result.reason);
              return [];
            }
          });
          
          const totalRecords = (users?.length || 0) + (posts?.length || 0) + (categories?.length || 0) + 
                              (prompts?.length || 0) + (aiConfigs?.length || 0) + (aiHistory?.length || 0) + 
                              (settings?.length || 0);
          
          console.log(`渲染进程: 数据导出完成，总记录数: ${totalRecords}`);
          
          return {
            success: true,
            data: {
              users: users || [],
              posts: posts || [],
              categories: categories || [],
              prompts: prompts || [],
              aiConfigs: aiConfigs || [],
              aiHistory: aiHistory || [],
              settings: settings || [],
              exportTime: new Date().toISOString(),
              version: '1.0.0',
              totalRecords
            }
          };
        } catch (error) {
          console.error('渲染进程: 导出数据失败:', error);
          return {
            success: false,
            error: error instanceof Error ? error.message : '未知错误'
          };
        }
      },
      
      // 数据恢复方法
      restoreAllData: async (data: any) => {
        try {
          console.log('渲染进程: 开始恢复数据到数据库...');
          
          const restorePromises: Promise<any>[] = [];
          let totalErrors = 0;
          
          // 恢复用户数据
          if (data.users && data.users.length > 0) {
            console.log(`恢复用户数据: ${data.users.length} 条`);
            for (const user of data.users) {
              restorePromises.push(
                databaseServiceManager.user.addUser(user).catch(err => {
                  console.warn('恢复用户数据失败:', user.id, err.message);
                  totalErrors++;
                })
              );
            }
          }
          
          // 恢复分类数据
          if (data.categories && data.categories.length > 0) {
            console.log(`恢复分类数据: ${data.categories.length} 条`);
            for (const category of data.categories) {
              restorePromises.push(
                databaseServiceManager.category.addCategory(category).catch(err => {
                  console.warn('恢复分类数据失败:', category.id, err.message);
                  totalErrors++;
                })
              );
            }
          }
          
          // 恢复提示词数据
          if (data.prompts && data.prompts.length > 0) {
            console.log(`恢复提示词数据: ${data.prompts.length} 条`);
            for (const prompt of data.prompts) {
              restorePromises.push(
                databaseServiceManager.prompt.addPrompt(prompt).catch(err => {
                  console.warn('恢复提示词数据失败:', prompt.id, err.message);
                  totalErrors++;
                })
              );
            }
          }
          
          // 恢复文章数据
          if (data.posts && data.posts.length > 0) {
            console.log(`恢复文章数据: ${data.posts.length} 条`);
            for (const post of data.posts) {
              restorePromises.push(
                databaseServiceManager.post.addPost(post).catch(err => {
                  console.warn('恢复文章数据失败:', post.id, err.message);
                  totalErrors++;
                })
              );
            }
          }
          
          // 恢复AI配置数据
          if (data.aiConfigs && data.aiConfigs.length > 0) {
            console.log(`恢复AI配置数据: ${data.aiConfigs.length} 条`);
            for (const config of data.aiConfigs) {
              restorePromises.push(
                databaseServiceManager.aiConfig.addAIConfig(config).catch(err => {
                  console.warn('恢复AI配置数据失败:', config.id, err.message);
                  totalErrors++;
                })
              );
            }
          }
          
          // 恢复AI历史数据
          if (data.aiHistory && data.aiHistory.length > 0) {
            console.log(`恢复AI历史数据: ${data.aiHistory.length} 条`);
            for (const history of data.aiHistory) {
              restorePromises.push(
                databaseServiceManager.aiGenerationHistory.addAIGenerationHistory(history).catch(err => {
                  console.warn('恢复AI历史数据失败:', history.id, err.message);
                  totalErrors++;
                })
              );
            }
          }
          
          // 恢复设置数据
          if (data.settings && data.settings.length > 0) {
            console.log(`恢复设置数据: ${data.settings.length} 条`);
            for (const setting of data.settings) {
              restorePromises.push(
                databaseServiceManager.appSettings.setSetting(setting.key, setting.value).catch(err => {
                  console.warn('恢复设置数据失败:', setting.key, err.message);
                  totalErrors++;
                })
              );
            }
          }
          
          // 等待所有恢复操作完成
          await Promise.all(restorePromises);
          
          const totalRestored = (data.users?.length || 0) + 
                              (data.categories?.length || 0) + 
                              (data.prompts?.length || 0) + 
                              (data.posts?.length || 0) + 
                              (data.aiConfigs?.length || 0) + 
                              (data.aiHistory?.length || 0) + 
                              (data.settings?.length || 0);
          
          console.log(`渲染进程: 数据恢复完成，总计恢复记录数: ${totalRestored}, 错误数: ${totalErrors}`);
          
          return {
            success: true,
            totalRestored: totalRestored,
            totalErrors: totalErrors,
            details: {
              users: data.users?.length || 0,
              categories: data.categories?.length || 0,
              prompts: data.prompts?.length || 0,
              posts: data.posts?.length || 0,
              aiConfigs: data.aiConfigs?.length || 0,
              aiHistory: data.aiHistory?.length || 0,
              settings: data.settings?.length || 0
            }
          };
        } catch (error) {
          console.error('渲染进程: 恢复数据失败:', error);
          return {
            success: false,
            error: error instanceof Error ? error.message : '未知错误'
          };
        }
      },
      
      // 数据对象导入方法
      importDataObject: async (data: any) => {
        try {
          console.log('渲染进程: 开始导入数据对象...');
          
          const importPromises: Promise<any>[] = [];
          let totalErrors = 0;
          
          // 导入分类数据
          if (data.categories && data.categories.length > 0) {
            console.log(`导入分类数据: ${data.categories.length} 条`);
            for (const category of data.categories) {
              importPromises.push(
                databaseServiceManager.category.addCategory(category).catch(err => {
                  console.warn('导入分类数据失败:', category.id, err.message);
                  totalErrors++;
                })
              );
            }
          }
          
          // 导入提示词数据
          if (data.prompts && data.prompts.length > 0) {
            console.log(`导入提示词数据: ${data.prompts.length} 条`);
            for (const prompt of data.prompts) {
              importPromises.push(
                databaseServiceManager.prompt.addPrompt(prompt).catch(err => {
                  console.warn('导入提示词数据失败:', prompt.id, err.message);
                  totalErrors++;
                })
              );
            }
          }
          
          // 导入AI历史数据
          if (data.aiHistory && data.aiHistory.length > 0) {
            console.log(`导入AI历史数据: ${data.aiHistory.length} 条`);
            for (const history of data.aiHistory) {
              importPromises.push(
                databaseServiceManager.aiGenerationHistory.addAIGenerationHistory(history).catch(err => {
                  console.warn('导入AI历史数据失败:', history.id, err.message);
                  totalErrors++;
                })
              );
            }
          }
          
          // 导入设置数据
          if (data.settings && data.settings.length > 0) {
            console.log(`导入设置数据: ${data.settings.length} 条`);
            for (const setting of data.settings) {
              importPromises.push(
                databaseServiceManager.appSettings.setSetting(setting.key, setting.value).catch(err => {
                  console.warn('导入设置数据失败:', setting.key, err.message);
                  totalErrors++;
                })
              );
            }
          }
          
          // 等待所有导入操作完成
          await Promise.all(importPromises);
          
          const totalImported = (data.categories?.length || 0) + 
                               (data.prompts?.length || 0) + 
                               (data.aiHistory?.length || 0) + 
                               (data.settings?.length || 0);
          
          console.log(`渲染进程: 数据导入完成，总计导入记录数: ${totalImported}, 错误数: ${totalErrors}`);
          
          return {
            success: true,
            totalImported: totalImported,
            totalErrors: totalErrors,
            details: {
              categories: data.categories?.length || 0,
              prompts: data.prompts?.length || 0,
              aiHistory: data.aiHistory?.length || 0,
              settings: data.settings?.length || 0
            }
          };
        } catch (error) {
          console.error('渲染进程: 导入数据对象失败:', error);
          return {
            success: false,
            error: error instanceof Error ? error.message : '未知错误'
          };
        }
      },
      
      // 获取数据统计方法
      getStats: async () => {
        try {
          console.log('渲染进程: 开始获取数据库统计信息...');
          
          const stats = await databaseServiceManager.getDatabaseStats();
          
          // 获取最后一次备份时间（如果有的话）
          const lastBackupTime = new Date().toISOString(); // 这里可以从设置中获取真实的备份时间
          
          const result = {
            ...stats,
            totalSize: (stats.users + stats.posts + stats.categories + stats.prompts + 
                       stats.aiConfigs + stats.aiHistory + stats.settings) * 1024, // 估算大小
            lastBackupTime: lastBackupTime
          };
          
          console.log('渲染进程: 数据库统计信息获取完成:', result);
          
          return {
            success: true,
            stats: result
          };
        } catch (error) {
          console.error('渲染进程: 获取数据库统计信息失败:', error);
          return {
            success: false,
            error: error instanceof Error ? error.message : '未知错误'
          };
        }
      }
    };
    
    console.log('数据库操作方法已暴露到 window.databaseAPI');
  }
}
