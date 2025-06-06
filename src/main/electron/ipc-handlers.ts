import { ipcMain } from 'electron';
import { preferencesManager } from './preferences-manager';
import { windowManager } from './window-manager';
import { themeManager } from './theme-manager';
import { aiServiceManager } from './ai-service-manager';
import { UserPreferences, SystemTheme, AIConfig, AIGenerationRequest } from './types';

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
    this.setupAIHandlers();
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
    // 获取所有 AI 配置
    ipcMain.handle('ai:get-configs', () => {
      return aiServiceManager.getAllConfigs();
    });

    // 获取启用的 AI 配置
    ipcMain.handle('ai:get-enabled-configs', () => {
      return aiServiceManager.getEnabledConfigs();
    });

    // 添加 AI 配置
    ipcMain.handle('ai:add-config', (_, config: AIConfig) => {
      aiServiceManager.addConfig(config);
      return config;
    });

    // 更新 AI 配置
    ipcMain.handle('ai:update-config', (_, id: string, config: Partial<AIConfig>) => {
      return aiServiceManager.updateConfig(id, config);
    });

    // 删除 AI 配置
    ipcMain.handle('ai:remove-config', (_, id: string) => {
      return aiServiceManager.removeConfig(id);
    });

    // 测试 AI 配置
    ipcMain.handle('ai:test-config', async (_, config: AIConfig) => {
      return await aiServiceManager.testConfig(config);
    });

    // 获取可用模型列表
    ipcMain.handle('ai:get-models', async (_, config: AIConfig) => {
      return await aiServiceManager.getAvailableModels(config);
    });

    // 生成 Prompt
    ipcMain.handle('ai:generate-prompt', async (_, request: AIGenerationRequest) => {
      return await aiServiceManager.generatePrompt(request);
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
  }
}

// 单例模式
export const ipcHandlers = new IpcHandlers();
