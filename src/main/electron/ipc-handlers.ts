import { ipcMain } from 'electron';
import { promises as fs } from 'fs';
import { shell } from 'electron';
import { preferencesManager } from './preferences-manager';
import { windowManager } from './window-manager';
import { themeManager } from './theme-manager';
import { aiServiceManager } from '../ai/ai-service-manager';
import { updateService } from './update-service';
import { UserPreferences, SystemTheme, AIConfig, AIGenerationRequest } from '@shared/types';

/**
 * IPC 处理器管理器
 */
class IpcHandlers {
  private activeGenerations = new Map<string, AbortController>(); // 存储活跃的生成请求
  
  /**
   * 初始化所有 IPC 处理器
   */
  initialize() {
    this.setupMessageHandler();
    this.setupPreferencesHandlers();
    this.setupWindowHandlers();
    this.setupThemeHandlers();
    this.setupAIHandlers();
    this.setupUpdateHandlers();
    this.setupShellHandlers();
    this.setupDataHandlers();
  }

  /**
   * 设置简单消息处理器
   */
  private setupMessageHandler() {
    ipcMain.on('message', (event, message) => {
      console.log('收到渲染进程消息:', message);
    });
  }

  /**
   * 设置用户偏好设置处理器
   */
  private setupPreferencesHandlers() {
    // 获取用户偏好设置
    ipcMain.handle('get-user-preferences', (): UserPreferences => {
      return preferencesManager.getPreferences();
    });

    // 设置用户偏好
    ipcMain.handle('set-user-preferences', (_, newPrefs: Partial<UserPreferences>): UserPreferences => {
      return preferencesManager.updatePreferences(newPrefs);
    });

    // 重置用户偏好设置
    ipcMain.handle('reset-user-preferences', (): UserPreferences => {
      return preferencesManager.resetPreferences();
    });
  }

  /**
   * 设置窗口管理处理器
   */
  private setupWindowHandlers() {
    // 显示主窗口
    ipcMain.handle('show-window', () => {
      windowManager.showMainWindow();
    });

    // 隐藏窗口到托盘
    ipcMain.handle('hide-to-tray', () => {
      windowManager.hideMainWindow();
    });

    // 获取窗口尺寸
    ipcMain.handle('get-window-size', () => {
      return windowManager.getWindowSize();
    });

    // 获取窗口内容尺寸
    ipcMain.handle('get-content-size', () => {
      return windowManager.getContentSize();
    });
  }

  /**
   * 设置主题管理处理器
   */
  private setupThemeHandlers() {
    // 获取当前主题
    ipcMain.handle('theme:get-current', () => {
      return themeManager.getCurrentTheme();
    });

    // 获取主题详细信息
    ipcMain.handle('theme:get-info', () => {
      return themeManager.getThemeInfo();
    });

    // 设置主题来源
    ipcMain.handle('theme:set-source', (_, source: 'system' | 'light' | 'dark') => {
      themeManager.setThemeSource(source);
      // 同时保存到用户偏好设置中
      preferencesManager.updatePreferences({ themeSource: source });
      return themeManager.getCurrentTheme();
    });

    // 检查是否为暗色主题
    ipcMain.handle('theme:is-dark', () => {
      return themeManager.isDarkTheme();
    });
  }

  /**
   * 设置 AI 服务处理器
   */
  private setupAIHandlers() {
    // 获取所有 AI 配置 - 由前端数据库处理
    ipcMain.handle('ai:get-configs', async () => {
      // 这里应该从前端数据库读取，暂时返回空数组
      return [];
    });

    // 获取启用的 AI 配置 - 由前端数据库处理
    ipcMain.handle('ai:get-enabled-configs', async () => {
      // 这里应该从前端数据库读取，暂时返回空数组
      return [];
    });

    // 添加 AI 配置 - 返回配置数据，实际存储由前端处理
    ipcMain.handle('ai:add-config', (_, config: any) => {
      // 确保日期字段正确处理
      const processedConfig = {
        ...config,
        createdAt: config.createdAt ? new Date(config.createdAt) : new Date(),
        updatedAt: config.updatedAt ? new Date(config.updatedAt) : new Date()
      };
      return processedConfig;
    });

    // 更新 AI 配置 - 返回配置数据，实际存储由前端处理
    ipcMain.handle('ai:update-config', (_, id: string, config: any) => {
      // 确保日期字段正确处理
      const processedConfig = {
        ...config,
        updatedAt: new Date()
      };
      return processedConfig;
    });

    // 删除 AI 配置 - 返回成功标志，实际删除由前端处理
    ipcMain.handle('ai:remove-config', (_, id: string) => {
      return true;
    });

    // 测试 AI 配置
    ipcMain.handle('ai:test-config', async (_, config: any) => {
      // 将配置转换为内部格式
      const processedConfig = {
        ...config,
        models: Array.isArray(config.models) ? config.models : [],
        createdAt: new Date(config.createdAt),
        updatedAt: new Date(config.updatedAt)
      };
      
      return await aiServiceManager.testConfig(processedConfig);
    });

    // 获取可用模型列表
    ipcMain.handle('ai:get-models', async (_, config: any) => {
      // 将配置转换为内部格式
      const processedConfig = {
        ...config,
        models: Array.isArray(config.models) ? config.models : [],
        createdAt: new Date(config.createdAt),
        updatedAt: new Date(config.updatedAt)
      };
      
      return await aiServiceManager.getAvailableModels(processedConfig);
    });

    // 生成 Prompt
    ipcMain.handle('ai:generate-prompt', async (_, request: AIGenerationRequest, config: any) => {
      // 将配置转换为内部格式
      const processedConfig = {
        ...config,
        models: Array.isArray(config.models) ? config.models : [],
        createdAt: new Date(config.createdAt),
        updatedAt: new Date(config.updatedAt)
      };
      
      // 调试：打印配置信息
      console.log('IPC生成提示词 - 原始配置 systemPrompt:', config.systemPrompt);
      console.log('IPC生成提示词 - 处理后配置 systemPrompt:', processedConfig.systemPrompt);
      
      const requestWithConfig = {
        ...request,
        config: processedConfig
      };
      
      return await aiServiceManager.generatePrompt(requestWithConfig);
    });

    // 智能测试 - 发送真实提示词并获取AI响应
    ipcMain.handle('ai:intelligent-test', async (_, config: any) => {
      // 将配置转换为内部格式
      const processedConfig = {
        ...config,
        models: Array.isArray(config.models) ? config.models : [],
        createdAt: new Date(config.createdAt),
        updatedAt: new Date(config.updatedAt)
      };
      
      return await aiServiceManager.intelligentTest(processedConfig);
    });

    // 流式生成 Prompt
    ipcMain.handle('ai:generate-prompt-stream', async (event, request: AIGenerationRequest, config: any) => {
      // 生成唯一的请求ID
      const requestId = `gen_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // 创建 AbortController
      const abortController = new AbortController();
      this.activeGenerations.set(requestId, abortController);
      
      try {
        // 将配置转换为内部格式
        const processedConfig = {
          ...config,
          models: Array.isArray(config.models) ? config.models : [],
          createdAt: new Date(config.createdAt),
          updatedAt: new Date(config.updatedAt)
        };
        
        // 调试：打印配置信息
        console.log('IPC流式生成提示词 - 原始配置 systemPrompt:', config.systemPrompt);
        console.log('IPC流式生成提示词 - 处理后配置 systemPrompt:', processedConfig.systemPrompt);
        console.log('IPC流式生成提示词 - 请求ID:', requestId);
        
        const result = await aiServiceManager.generatePromptWithStream(
          request,
          processedConfig,
          (charCount: number, partialContent?: string) => {
            // 检查是否已被中断
            if (abortController.signal.aborted) {
              console.log('IPC: 检测到中断信号，停止发送进度');
              return false;
            }
            
            // 发送进度更新到渲染进程，包括字符数和部分内容
            event.sender.send('ai:stream-progress', charCount, partialContent);
            return true; // 继续生成
          },
          abortController.signal
        );
        
        return result;
      } catch (error: any) {
        if (error.message?.includes('中断生成') || abortController.signal.aborted) {
          console.log('IPC: 生成被中断');
          throw new Error('生成已被中断');
        }
        throw error;
      } finally {
        // 清理
        this.activeGenerations.delete(requestId);
      }
    });

    // 停止生成
    ipcMain.handle('ai:stop-generation', async (event) => {
      console.log('IPC: 收到停止生成请求，活跃请求数:', this.activeGenerations.size);
      
      // 中断所有活跃的生成请求
      for (const [requestId, abortController] of this.activeGenerations) {
        console.log(`IPC: 中断生成请求 ${requestId}`);
        abortController.abort();
      }
      
      // 清空活跃请求
      this.activeGenerations.clear();
      
      return { success: true, message: '已停止所有生成请求' };
    });

    // 调试提示词 - 使用提示词获取AI响应
    ipcMain.handle('ai:debug-prompt', async (_, prompt: string, config: any) => {
      // 将配置转换为内部格式
      const processedConfig = {
        ...config,
        models: Array.isArray(config.models) ? config.models : [],
        createdAt: new Date(config.createdAt),
        updatedAt: new Date(config.updatedAt)
      };
      
      // 创建调试请求
      const debugRequest = {
        configId: config.configId,
        topic: prompt,
        customPrompt: prompt,
        model: config.defaultModel || config.customModel,
        config: processedConfig
      };
      
      try {
        console.log('IPC调试提示词 - 配置:', processedConfig);
        console.log('IPC调试提示词 - 请求:', debugRequest);
        
        const result = await aiServiceManager.generatePrompt(debugRequest);
        return {
          success: true,
          result: result.generatedPrompt,
          model: result.model,
          error: null
        };
      } catch (error: any) {
        console.error('IPC调试提示词失败:', error);
        return {
          success: false,
          result: null,
          model: null,
          error: error.message || '调试失败'
        };
      }
    });
  }

  /**
   * 设置更新检查处理器
   */
  private setupUpdateHandlers() {
    // 获取当前版本
    ipcMain.handle('app:get-version', () => {
      return updateService.getCurrentVersion();
    });

    // 获取应用路径
    ipcMain.handle('app:get-path', (_, name: string) => {
      const { app } = require('electron');
      return app.getPath(name);
    });

    // 检查更新
    ipcMain.handle('app:check-updates', async () => {
      try {
        const updateInfo = await updateService.checkForUpdates();
        return {
          success: true,
          data: updateInfo,
          error: null
        };
      } catch (error: any) {
        console.error('检查更新失败:', error);
        return {
          success: false,
          data: null,
          error: error.message || '检查更新失败'
        };
      }
    });

    // 打开下载页面
    ipcMain.handle('app:open-download-page', async (_, url: string) => {
      try {
        await updateService.openDownloadPage(url);
        return { success: true, error: null };
      } catch (error: any) {
        console.error('打开下载页面失败:', error);
        return { success: false, error: error.message || '打开下载页面失败' };
      }
    });
  }

  /**
   * 设置 Shell 功能处理器
   */
  private setupShellHandlers() {
    // 打开路径
    ipcMain.handle('shell:open-path', (_, path: string) => {
      return shell.openPath(path);
    });

    // 打开外部链接
    ipcMain.handle('shell:open-external', (_, url: string) => {
      return shell.openExternal(url);
    });

    // 文件操作
    // 读取文件
    ipcMain.handle('fs:read-file', async (_, { filePath }) => {
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        return content;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : '未知错误';
        throw new Error(`读取文件失败: ${errorMessage}`);
      }
    });

    // 写入文件
    ipcMain.handle('fs:write-file', async (_, { filePath, content }) => {
      try {
        await fs.writeFile(filePath, content, 'utf-8');
        return { success: true };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : '未知错误';
        throw new Error(`写入文件失败: ${errorMessage}`);
      }
    });

    // 确保目录存在
    ipcMain.handle('fs:ensure-dir', async (_, { dirPath }) => {
      try {
        await fs.mkdir(dirPath, { recursive: true });
        return { success: true };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : '未知错误';
        throw new Error(`创建目录失败: ${errorMessage}`);
      }
    });

    // 获取文件状态
    ipcMain.handle('fs:stat', async (_, { filePath }) => {
      try {
        const stats = await fs.stat(filePath);
        return { 
          size: stats.size, 
          mtime: stats.mtime 
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : '未知错误';
        throw new Error(`获取文件状态失败: ${errorMessage}`);
      }
    });

    // 读取目录
    ipcMain.handle('fs:readdir', async (_, { dirPath }) => {
      try {
        const files = await fs.readdir(dirPath);
        return files;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : '未知错误';
        throw new Error(`读取目录失败: ${errorMessage}`);
      }
    });

    // 删除文件
    ipcMain.handle('fs:unlink', async (_, { filePath }) => {
      try {
        await fs.unlink(filePath);
        return { success: true };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : '未知错误';
        throw new Error(`删除文件失败: ${errorMessage}`);
      }
    });
  }

  /**
   * 设置数据管理处理器
   */
  private setupDataHandlers() {
    // 选择导入文件
    ipcMain.handle('data:select-import-file', async (event, { format }) => {
      const { dialog } = require('electron');
      const result = await dialog.showOpenDialog({
        title: '选择导入文件',
        filters: [
          { name: `${format.toUpperCase()} 文件`, extensions: [format] },
          { name: '所有文件', extensions: ['*'] },
        ],
        properties: ['openFile'],
      });

      return result.canceled ? null : result.filePaths[0];
    });

    // 选择导出路径
    ipcMain.handle('data:select-export-path', async (event, { defaultName }) => {
      const { dialog } = require('electron');
      const fileExtension = defaultName.split('.').pop()?.toLowerCase();
      let filters;
      
      if (fileExtension === 'csv') {
        filters = [
          { name: 'CSV 文件', extensions: ['csv'] },
          { name: '所有文件', extensions: ['*'] },
        ];
      } else if (fileExtension === 'json') {
        filters = [
          { name: 'JSON 文件', extensions: ['json'] },
          { name: '所有文件', extensions: ['*'] },
        ];
      } else {
        filters = [
          { name: 'CSV 文件', extensions: ['csv'] },
          { name: 'JSON 文件', extensions: ['json'] },
          { name: '所有文件', extensions: ['*'] },
        ];
      }
      
      const result = await dialog.showSaveDialog({
        title: '选择导出路径',
        defaultPath: defaultName,
        filters: filters,
      });

      return result.canceled ? null : result.filePath;
    });

    // 写入文件
    ipcMain.handle('data:write-file', async (event, { filePath, content }) => {
      try {
        await fs.writeFile(filePath, content, 'utf-8');
        return { success: true };
      } catch (error) {
        console.error('写入文件失败:', error);
        return { 
          success: false, 
          error: error instanceof Error ? error.message : '写入文件失败' 
        };
      }
    });

    // 读取文件
    ipcMain.handle('data:read-file', async (event, { filePath }) => {
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        return { success: true, content };
      } catch (error) {
        console.error('读取文件失败:', error);
        return { 
          success: false, 
          error: error instanceof Error ? error.message : '读取文件失败' 
        };
      }
    });
  }

  /**
   * 清理所有处理器
   */
  cleanup() {
    ipcMain.removeAllListeners('message');
    // 清理偏好设置处理器
    ipcMain.removeHandler('get-user-preferences');
    ipcMain.removeHandler('set-user-preferences');
    ipcMain.removeHandler('reset-user-preferences');
    // 清理窗口处理器
    ipcMain.removeHandler('show-window');
    ipcMain.removeHandler('hide-to-tray');
    ipcMain.removeHandler('get-window-size');
    ipcMain.removeHandler('get-content-size');
    // 清理主题处理器
    ipcMain.removeHandler('theme:get-current');
    ipcMain.removeHandler('theme:get-info');
    ipcMain.removeHandler('theme:set-source');
    ipcMain.removeHandler('theme:is-dark');
    // 清理 AI 处理器
    ipcMain.removeHandler('ai:get-configs');
    ipcMain.removeHandler('ai:get-enabled-configs');
    ipcMain.removeHandler('ai:add-config');
    ipcMain.removeHandler('ai:update-config');
    ipcMain.removeHandler('ai:remove-config');
    ipcMain.removeHandler('ai:test-config');
    ipcMain.removeHandler('ai:get-models');
    ipcMain.removeHandler('ai:generate-prompt');
    ipcMain.removeHandler('ai:intelligent-test');
    ipcMain.removeHandler('ai:generate-prompt-stream');
    ipcMain.removeHandler('ai:stop-generation');
    
    // 清理更新处理器
    ipcMain.removeHandler('app:get-version');
    ipcMain.removeHandler('app:get-path');
    ipcMain.removeHandler('app:check-updates');
    ipcMain.removeHandler('app:open-download-page');
    
    // 清理 Shell 处理器
    ipcMain.removeHandler('shell:open-path');
    ipcMain.removeHandler('shell:open-external');
    ipcMain.removeHandler('fs:read-file');
    ipcMain.removeHandler('fs:write-file');
    ipcMain.removeHandler('fs:ensure-dir');
    ipcMain.removeHandler('fs:stat');
    ipcMain.removeHandler('fs:readdir');
    ipcMain.removeHandler('fs:unlink');
    
    // 清理数据管理处理器
    ipcMain.removeHandler('data:select-import-file');
    ipcMain.removeHandler('data:select-export-path');
    ipcMain.removeHandler('data:write-file');
    ipcMain.removeHandler('data:read-file');
    
    // 清理活跃的生成请求
    for (const abortController of this.activeGenerations.values()) {
      abortController.abort();
    }
    this.activeGenerations.clear();
  }
}

// 单例模式
export const ipcHandlers = new IpcHandlers();
