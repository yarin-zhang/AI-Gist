import { ipcMain } from 'electron';
import { shell } from 'electron';
import { preferencesManager } from './preferences-manager';
import { windowManager } from './window-manager';
import { themeManager } from './theme-manager';
import { ShortcutManager } from './shortcut-manager';
import { aiServiceManager } from '../ai/ai-service-manager';
import { updateManager } from './update-manager';
import { dataManagementService, fsService } from '../data';
import { UserPreferences, SystemTheme, AIConfig, AIGenerationRequest } from '@shared/types';

/**
 * IPC 处理器管理器
 */
class IpcHandlers {
  /**
   * 初始化所有 IPC 处理器
   */
  initialize() {
    this.setupMessageHandler();
    this.setupPreferencesHandlers();
    this.setupWindowHandlers();
    this.setupThemeHandlers();
    this.setupShortcutHandlers();
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
    // 添加 AI 配置 - 返回配置数据，实际存储由前端处理
    ipcMain.handle('ai:add-config', (_, config: any) => {
      return aiServiceManager.processAddConfig(config);
    });

    // 更新 AI 配置 - 返回配置数据，实际存储由前端处理
    ipcMain.handle('ai:update-config', (_, id: string, config: any) => {
      return aiServiceManager.processUpdateConfig(id, config);
    });

    // 测试 AI 配置
    ipcMain.handle('ai:test-config', async (_, config: any) => {
      return await aiServiceManager.processTestConfig(config);
    });

    // 获取可用模型列表
    ipcMain.handle('ai:get-models', async (_, config: any) => {
      return await aiServiceManager.processGetModels(config);
    });

    // 生成 Prompt
    ipcMain.handle('ai:generate-prompt', async (_, request: AIGenerationRequest, config: any) => {
      return await aiServiceManager.processGeneratePrompt(request, config);
    });

    // 智能测试 - 发送真实提示词并获取AI响应
    ipcMain.handle('ai:intelligent-test', async (_, config: any) => {
      return await aiServiceManager.processIntelligentTest(config);
    });

    // 流式生成 Prompt
    ipcMain.handle('ai:generate-prompt-stream', async (event, request: AIGenerationRequest, config: any) => {
      return await aiServiceManager.processGeneratePromptWithStream(
        request,
        config,
        (charCount: number, partialContent?: string) => {
          // 发送进度更新到渲染进程，包括字符数和部分内容
          event.sender.send('ai:stream-progress', charCount, partialContent);
          return true; // 继续生成
        }
      );
    });

    // 停止生成
    ipcMain.handle('ai:stop-generation', async () => {
      return aiServiceManager.stopAllGenerations();
    });

    // 调试提示词 - 使用提示词获取AI响应
    ipcMain.handle('ai:debug-prompt', async (_, prompt: string, config: any) => {
      return await aiServiceManager.processDebugPrompt(prompt, config);
    });
  }

  /**
   * 设置更新检查处理器
   */
  private setupUpdateHandlers() {
    // 获取当前版本
    ipcMain.handle('app:get-version', () => {
      return updateManager.getCurrentVersion();
    });

    // 获取应用路径
    ipcMain.handle('app:get-path', (_, name: string) => {
      return updateManager.getAppPath(name as any);
    });

    // 打开下载页面
    ipcMain.handle('app:open-download-page', async (_, url: string) => {
      try {
        await updateManager.openDownloadPage(url);
        return { success: true, error: null };
      } catch (error: any) {
        console.error('打开下载页面失败:', error);
        return { 
          success: false, 
          error: error.message || '打开下载页面失败' 
        };
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
      return await fsService.readFile(filePath);
    });

    // 写入文件
    ipcMain.handle('fs:write-file', async (_, { filePath, content }) => {
      return await fsService.writeFile(filePath, content);
    });

    // 确保目录存在
    ipcMain.handle('fs:ensure-dir', async (_, { dirPath }) => {
      return await fsService.ensureDir(dirPath);
    });

    // 获取文件状态
    ipcMain.handle('fs:stat', async (_, { filePath }) => {
      return await fsService.stat(filePath);
    });

    // 读取目录
    ipcMain.handle('fs:readdir', async (_, { dirPath }) => {
      return await fsService.readDir(dirPath);
    });

    // 删除文件
    ipcMain.handle('fs:unlink', async (_, { filePath }) => {
      return await fsService.unlink(filePath);
    });
  }

  /**
   * 设置快捷键处理器
   */
  private setupShortcutHandlers() {
    // 注册默认快捷键
    ipcMain.handle('shortcuts:register-defaults', () => {
      try {
        ShortcutManager.getInstance().registerDefaultShortcuts();
        return { success: true };
      } catch (error) {
        console.error('注册默认快捷键失败:', error);
        return { success: false, error: (error as Error).message };
      }
    });

    // 重新注册快捷键（当用户设置更改时）
    ipcMain.handle('shortcuts:reregister', async () => {
      try {
        await ShortcutManager.getInstance().reregisterShortcuts();
        return { success: true };
      } catch (error) {
        console.error('重新注册快捷键失败:', error);
        return { success: false, error: (error as Error).message };
      }
    });

    // 临时禁用快捷键
    ipcMain.handle('shortcuts:temporarily-disable', () => {
      try {
        ShortcutManager.getInstance().temporarilyDisableShortcuts();
        return { success: true };
      } catch (error) {
        console.error('临时禁用快捷键失败:', error);
        return { success: false, error: (error as Error).message };
      }
    });

    // 恢复快捷键
    ipcMain.handle('shortcuts:restore', () => {
      try {
        ShortcutManager.getInstance().restoreShortcuts();
        return { success: true };
      } catch (error) {
        console.error('恢复快捷键失败:', error);
        return { success: false, error: (error as Error).message };
      }
    });

    // 检查快捷键是否已注册
    ipcMain.handle('shortcuts:is-registered', (_, accelerator: string) => {
      return ShortcutManager.getInstance().isRegistered(accelerator);
    });

    // 检查快捷键是否可用
    ipcMain.handle('shortcuts:is-available', (_, accelerator: string) => {
      return ShortcutManager.getInstance().isShortcutAvailable(accelerator);
    });

    // 获取已注册的快捷键列表
    ipcMain.handle('shortcuts:get-registered', () => {
      return ShortcutManager.getInstance().getRegisteredShortcuts();
    });

    // 检查权限并尝试注册快捷键
    ipcMain.handle('shortcuts:check-permissions', async () => {
      try {
        return await ShortcutManager.getInstance().checkPermissionsAndRegister();
      } catch (error) {
        console.error('检查快捷键权限失败:', error);
        return { hasPermission: false, message: '检查权限时发生错误' };
      }
    });

    // 获取提示词内容
    ipcMain.handle('shortcuts:get-prompt-content', async (_, promptId: number) => {
      try {
        // 这里应该调用数据库服务来获取提示词内容
        // 临时返回示例内容
        return { success: true, content: `示例提示词内容 (ID: ${promptId})` };
      } catch (error) {
        console.error('获取提示词内容失败:', error);
        return { success: false, error: (error as Error).message };
      }
    });
  }

  /**
   * 设置数据管理处理器
   */
  private setupDataHandlers() {
    // 选择导入文件
    ipcMain.handle('data:select-import-file', async (event, { format }) => {
      return await dataManagementService.selectImportFile(format);
    });

    // 选择导出路径
    ipcMain.handle('data:select-export-path', async (event, { defaultName }) => {
      return await dataManagementService.selectExportPath(defaultName);
    });

    // 写入文件
    ipcMain.handle('data:write-file', async (event, { filePath, content }) => {
      return await dataManagementService.writeFile(filePath, content);
    });

    // 读取文件
    ipcMain.handle('data:read-file', async (event, { filePath }) => {
      return await dataManagementService.readFile(filePath);
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
    ipcMain.removeHandler('ai:add-config');
    ipcMain.removeHandler('ai:update-config');
    ipcMain.removeHandler('ai:test-config');
    ipcMain.removeHandler('ai:get-models');
    ipcMain.removeHandler('ai:generate-prompt');
    ipcMain.removeHandler('ai:intelligent-test');
    ipcMain.removeHandler('ai:generate-prompt-stream');
    ipcMain.removeHandler('ai:stop-generation');
    ipcMain.removeHandler('ai:debug-prompt');
    
    // 清理更新处理器
    ipcMain.removeHandler('app:get-version');
    ipcMain.removeHandler('app:get-path');
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
    
    // 清理快捷键处理器
    ipcMain.removeHandler('shortcuts:register-defaults');
    ipcMain.removeHandler('shortcuts:reregister');
    ipcMain.removeHandler('shortcuts:temporarily-disable');
    ipcMain.removeHandler('shortcuts:restore');
    ipcMain.removeHandler('shortcuts:is-registered');
    ipcMain.removeHandler('shortcuts:is-available');
    ipcMain.removeHandler('shortcuts:get-registered');
    ipcMain.removeHandler('shortcuts:check-permissions');
    ipcMain.removeHandler('shortcuts:get-prompt-content');
    
    // 清理 AI 服务管理器的活跃生成请求
    aiServiceManager.stopAllGenerations();
  }
}

// 单例模式
export const ipcHandlers = new IpcHandlers();
