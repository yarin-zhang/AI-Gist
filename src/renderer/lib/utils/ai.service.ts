/**
 * AI 服务工具类
 * 直接使用 Electron API，不再依赖 IPC 工具类
 */

import type { AIConfig, AIGenerationRequest, AIGenerationResult, AIConfigTestResult } from '@shared/types/ai';

/**
 * 检查 Electron API 是否可用
 */
function isElectronAvailable(): boolean {
  return typeof window !== 'undefined' && !!window.electronAPI;
}

/**
 * 测试 AI 配置
 */
export async function testAIConfig(config: AIConfig): Promise<AIConfigTestResult> {
  if (!isElectronAvailable()) {
    throw new Error('Electron API not available');
  }
  
  try {
    return await window.electronAPI.ai.testConfig(config);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * 获取 AI 模型列表
 */
export async function getAIModels(config: AIConfig): Promise<string[]> {
  if (!isElectronAvailable()) {
    throw new Error('Electron API not available');
  }
  
  try {
    return await window.electronAPI.ai.getModels(config);
  } catch (error) {
    return [];
  }
}

/**
 * 生成 AI 内容
 */
export async function generateAIContent(request: AIGenerationRequest, config: AIConfig): Promise<string> {
  if (!isElectronAvailable()) {
    throw new Error('Electron API not available');
  }
  
  try {
    const result = await window.electronAPI.ai.generatePrompt(request, config);
    return result.generatedPrompt || '';
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : String(error));
  }
}

/**
 * 智能测试
 */
export async function intelligentTest(config: AIConfig): Promise<AIConfigTestResult> {
  if (!isElectronAvailable()) {
    throw new Error('Electron API not available');
  }
  
  try {
    return await window.electronAPI.ai.intelligentTest(config);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * 流式生成 AI 内容
 */
export async function generateAIContentStream(
  request: AIGenerationRequest, 
  config: AIConfig,
  onProgress: (charCount: number, partialContent?: string) => boolean
): Promise<AIGenerationResult> {
  if (!isElectronAvailable()) {
    throw new Error('Electron API not available');
  }
  
  try {
    const result = await window.electronAPI.ai.generatePromptStream(request, config, onProgress);
    return result;
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : String(error));
  }
}

/**
 * 停止 AI 生成
 */
export async function stopAIGeneration(): Promise<void> {
  if (!isElectronAvailable()) {
    throw new Error('Electron API not available');
  }
  
  try {
    await window.electronAPI.ai.stopGeneration();
  } catch (error) {
    console.error('停止 AI 生成失败:', error);
  }
}

/**
 * 调试提示词
 */
export async function debugPrompt(prompt: string, config: AIConfig): Promise<AIGenerationResult> {
  if (!isElectronAvailable()) {
    throw new Error('Electron API not available');
  }
  
  try {
    return await window.electronAPI.ai.debugPrompt(prompt, config);
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : String(error));
  }
}
