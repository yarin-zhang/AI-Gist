import type {
  AIConfig,
  AIConfigTestResult,
  AIGenerationRequest,
  AIGenerationResult,
  AIModelListResult
} from '@shared/types/ai';
import { GenerationStoppedError } from '../utils/ai-request';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * 后端没有给出原因时的兜底报错。界面只按 ai-error.ts 的归类显示本地化说明（HTTP 状态码按状态归类），
 * 这里的原文只出现在「技术详情」里，所以写成不带界面语言的技术信息。
 */
const httpError = (status: number) => `HTTP ${status}`;

/**
 * 后端返回的模型列表统一成 AIModelListResult。
 * 没有标明来源的列表一律不当成「从服务获取」，避免把内置默认列表说成刷新成功。
 */
export function normalizeModelListResult(result: Partial<AIModelListResult> | string[] | null | undefined): AIModelListResult {
  const raw = Array.isArray(result) ? { models: result } : (result || {});
  const toList = (value: unknown) => Array.isArray(value)
    ? [...new Set(value.filter((model): model is string => typeof model === 'string' && model.trim().length > 0))]
    : [];
  const models = toList(raw.models);
  const modelSource = raw.modelSource === 'remote' || raw.modelSource === 'default' || raw.modelSource === 'unavailable'
    ? raw.modelSource
    : (models.length ? 'default' : 'unavailable');

  return {
    models: modelSource === 'unavailable' ? [] : models,
    modelSource,
    ...(raw.fallbackModels ? { fallbackModels: toList(raw.fallbackModels) } : {}),
    ...(raw.error ? { error: String(raw.error) } : {})
  };
}

export class WebAIService {
  private static instance: WebAIService;
  private currentAbortController: AbortController | null = null;

  static getInstance(): WebAIService {
    if (!WebAIService.instance) {
      WebAIService.instance = new WebAIService();
    }
    return WebAIService.instance;
  }

  async testConfig(config: AIConfig): Promise<AIConfigTestResult> {
    return this.request<AIConfigTestResult>('/api/ai/test-config', { config });
  }

  /** prompt：按界面语言给的测试提示词；不传时后端用默认 */
  async testModel(config: AIConfig, model: string, prompt?: string): Promise<{
    success: boolean;
    error?: string;
    model?: string;
    response?: string;
  }> {
    return this.request('/api/ai/test-model', { config, model, prompt });
  }

  async getModels(config: AIConfig): Promise<AIModelListResult> {
    const result = await this.request<Partial<AIModelListResult> | string[]>('/api/ai/models', { config });
    return normalizeModelListResult(result);
  }

  async generatePrompt(request: AIGenerationRequest, config: AIConfig): Promise<AIGenerationResult> {
    return this.request<AIGenerationResult>('/api/ai/generate', { request, config });
  }

  async generatePromptStream(
    request: AIGenerationRequest,
    config: AIConfig,
    onProgress: (charCount: number, partialContent?: string) => boolean
  ): Promise<AIGenerationResult> {
    const abortController = new AbortController();
    this.currentAbortController = abortController;

    try {
      const response = await fetch('/api/ai/generate-stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ request, config }),
        signal: abortController.signal
      });

      if (!response.ok) {
        throw new Error(await this.readErrorMessage(response, httpError(response.status)));
      }

      if (!response.body) {
        throw new Error('Empty response stream');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalResult: AIGenerationResult | null = null;

      const handleLine = (line: string) => {
        if (!line.trim()) {
          return;
        }

        const event = JSON.parse(line);
        if (event.type === 'progress') {
          const partialContent = event.partialContent || '';
          const charCount = Number(event.charCount ?? partialContent.length);
          const shouldContinue = onProgress(charCount, partialContent);
          if (shouldContinue === false) {
            abortController.abort();
            throw new GenerationStoppedError();
          }
          return;
        }

        if (event.type === 'done') {
          finalResult = event.result;
          return;
        }

        if (event.type === 'error') {
          throw new Error(event.error || 'Stream generation failed');
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || '';
        lines.forEach(handleLine);
      }

      buffer += decoder.decode();
      handleLine(buffer);

      if (!finalResult) {
        throw new Error('Stream ended without a result');
      }

      return finalResult;
    } catch (error) {
      // 用户停止（或 stopGeneration 中断了这次请求）按「停止」处理，不当成失败
      if ((error as Error).name === 'AbortError') {
        throw new GenerationStoppedError();
      }
      throw error;
    } finally {
      if (this.currentAbortController === abortController) {
        this.currentAbortController = null;
      }
    }
  }

  async intelligentTest(config: AIConfig, prompt?: string): Promise<AIConfigTestResult> {
    return this.request<AIConfigTestResult>('/api/ai/intelligent-test', { config, prompt });
  }

  async stopGeneration(): Promise<{ success: boolean; message: string }> {
    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.currentAbortController = null;
      return { success: true, message: 'stopped' };
    }
    return { success: true, message: 'idle' };
  }

  async debugPrompt(prompt: string, config: AIConfig): Promise<AIGenerationResult> {
    return this.generatePrompt({ configId: config.configId, topic: prompt }, config);
  }

  private async request<T>(path: string, body: any): Promise<T> {
    const response = await fetch(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    let payload: ApiResponse<T> | null = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok || !payload?.success) {
      throw new Error(payload?.error || httpError(response.status));
    }

    return payload.data as T;
  }

  private async readErrorMessage(response: Response, fallback: string): Promise<string> {
    try {
      const payload = await response.json();
      return payload?.error || fallback;
    } catch {
      try {
        const text = await response.text();
        return text || fallback;
      } catch {
        return fallback;
      }
    }
  }
}

export const webAIService = WebAIService.getInstance();
