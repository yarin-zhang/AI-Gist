/**
 * 统一提示词模板管理
 * 集中管理所有AI供应商使用的默认提示词模板
 */

/**
 * 提示词模板类型
 */
export interface PromptTemplate {
  /** 模板名称 */
  name: string;
  /** 模板描述 */
  description: string;
  /** 系统提示词 */
  systemPrompt: string;
  /** 用户提示词模板 */
  userPromptTemplate: string;
  /** 是否启用 */
  enabled: boolean;
}

/**
 * 提示词模板管理器
 */
export class PromptTemplateManager {
  private static instance: PromptTemplateManager;
  private templates: Map<string, PromptTemplate> = new Map();

  private constructor() {
    this.initializeDefaultTemplates();
  }

  /**
   * 获取单例实例
   */
  static getInstance(): PromptTemplateManager {
    if (!PromptTemplateManager.instance) {
      PromptTemplateManager.instance = new PromptTemplateManager();
    }
    return PromptTemplateManager.instance;
  }

  /**
   * 初始化默认模板
   */
  private initializeDefaultTemplates(): void {
    // AI提示词工程师模板
    this.addTemplate({
      name: 'ai-prompt-engineer',
      description: '专业的AI提示词工程师，生成高质量、结构化的AI提示词',
      systemPrompt: `你是一个专业的 AI 提示词工程师。请根据用户提供的主题，生成一个高质量、结构化的 AI 提示词。

要求：
1. 提示词应该清晰、具体、可操作
2. 包含必要的上下文和约束条件
3. 使用适当的格式和结构
4. 考虑不同的使用场景
5. 提供具体的输出格式要求

请直接返回优化后的提示词内容，不需要额外的解释。`,
      userPromptTemplate: `请为以下主题生成一个专业的 AI 提示词：

主题：{topic}

请生成一个完整、可直接使用的提示词。`,
      enabled: true
    });

    // 通用AI助手模板
    this.addTemplate({
      name: 'general-ai-assistant',
      description: '通用的AI助手，直接回应用户请求',
      systemPrompt: '你是一个有用的AI助手。请直接回应用户的请求。',
      userPromptTemplate: '{topic}',
      enabled: true
    });

    // 调试模式模板
    this.addTemplate({
      name: 'debug-mode',
      description: '调试模式，直接测试用户提供的提示词',
      systemPrompt: '你是一个有用的AI助手。请直接回应用户的请求。',
      userPromptTemplate: '{customPrompt}',
      enabled: true
    });

    // 简化提示词模板
    this.addTemplate({
      name: 'simple-prompt',
      description: '简化模式，当用户已设置系统提示词时使用',
      systemPrompt: '{systemPrompt}',
      userPromptTemplate: '主题：{topic}',
      enabled: true
    });
  }

  /**
   * 添加模板
   */
  addTemplate(template: PromptTemplate): void {
    this.templates.set(template.name, template);
  }

  /**
   * 获取模板
   */
  getTemplate(name: string): PromptTemplate | undefined {
    return this.templates.get(name);
  }

  /**
   * 获取所有模板
   */
  getAllTemplates(): PromptTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * 获取启用的模板
   */
  getEnabledTemplates(): PromptTemplate[] {
    return this.getAllTemplates().filter(template => template.enabled);
  }

  /**
   * 根据请求类型选择合适的模板
   */
  selectTemplate(request: any, config: any): { systemPrompt: string; userPrompt: string } {
    const isDebugRequest = request.topic.includes('请直接回应') || 
                          request.topic.includes('调试') ||
                          request.customPrompt;
    
    const hasCustomSystemPrompt = config.systemPrompt;
    
    let templateName: string;
    
    if (isDebugRequest) {
      templateName = 'debug-mode';
    } else if (hasCustomSystemPrompt) {
      templateName = 'simple-prompt';
    } else {
      templateName = 'ai-prompt-engineer';
    }
    
    const template = this.getTemplate(templateName);
    if (!template) {
      throw new Error(`未找到模板: ${templateName}`);
    }
    
    return this.renderTemplate(template, request, config);
  }

  /**
   * 渲染模板
   */
  private renderTemplate(template: PromptTemplate, request: any, config: any): { systemPrompt: string; userPrompt: string } {
    let systemPrompt = template.systemPrompt;
    let userPrompt = template.userPromptTemplate;
    
    // 替换系统提示词中的占位符
    if (template.name === 'simple-prompt') {
      systemPrompt = systemPrompt.replace('{systemPrompt}', config.systemPrompt || '');
    }
    
    // 替换用户提示词中的占位符
    userPrompt = userPrompt
      .replace('{topic}', request.topic || '')
      .replace('{customPrompt}', request.customPrompt || request.topic || '');
    
    return { systemPrompt, userPrompt };
  }

  /**
   * 获取默认的AI提示词工程师模板
   */
  getDefaultPromptEngineerTemplate(): PromptTemplate {
    return this.getTemplate('ai-prompt-engineer')!;
  }

  /**
   * 获取默认的通用AI助手模板
   */
  getDefaultAssistantTemplate(): PromptTemplate {
    return this.getTemplate('general-ai-assistant')!;
  }

  /**
   * 获取调试模式模板
   */
  getDebugTemplate(): PromptTemplate {
    return this.getTemplate('debug-mode')!;
  }

  /**
   * 获取简化模式模板
   */
  getSimpleTemplate(): PromptTemplate {
    return this.getTemplate('simple-prompt')!;
  }
}

/**
 * 便捷函数：获取提示词模板管理器实例
 */
export function getPromptTemplateManager(): PromptTemplateManager {
  return PromptTemplateManager.getInstance();
}

/**
 * 便捷函数：构建提示词
 */
export function buildPrompts(request: any, config: any): { systemPrompt: string; userPrompt: string } {
  const manager = getPromptTemplateManager();
  return manager.selectTemplate(request, config);
} 